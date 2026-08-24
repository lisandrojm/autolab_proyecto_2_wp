import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faSpinner, faCheck, faCopy, faCircleCheck, faXmark, faTriangleExclamation, faPlay, faStop, faKeyboard, faArrowUpRightFromSquare } from '@fortawesome/free-solid-svg-icons';
import { ContractOverviewRow } from '../../api/users';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { projectsAPI } from '../../api/projects';
import { formatRnos } from '../../utils/rnos';
import { AfipValues } from './afipCompleteness';

/**
 * Validar obras sociales contra ARCA. UNA pantalla, sirva para 1 o para 20.
 *
 * Antes eran dos experiencias para la misma tarea: un panel masivo que arrancaba con tres bloques de
 * instrucciones —el estado y la acción quedaban enterrados— y, desde una persona, una expansión
 * DENTRO del formulario de Datos ARCA que empujaba Sucursal, Actividad y Convenio hacia abajo y hacía
 * perder de vista lo que se estaba mirando. Es el mismo trámite; ahora es la misma pantalla y lo
 * único que cambia es el número.
 *
 * EL PRINCIPIO: la pantalla muestra ESTADO, no instrucciones. Las instrucciones existen —hacen falta
 * la primera vez— pero van colapsadas, porque se hacen una vez y la sesión de ARCA dura días.
 *
 * ⚠ POR QUÉ EL BOTÓN NO DISPARA LA CORRIDA
 *
 * El script se cuelga por CDP del Chrome de ARCA que está en la máquina del operador. El navegador no
 * arranca procesos locales y el server no ve ese Chrome, así que desde acá NO se puede lanzar. Haría
 * falta un agente chico corriendo en esa máquina (ver `tools/README.md`), que no está construido.
 *
 * Lo que sí se puede, y es lo que hace esta pantalla: MIRAR la corrida. El script pide los pendientes
 * a la API y aplica lo que ARCA contesta por la misma vía, así que basta con volver a preguntar cada
 * pocos segundos para que cada fila se complete sola. El botón copia el comando y deja la pantalla
 * esperando; el disparo es una línea en la terminal, una vez.
 */

/**
 * Login de clave fiscal. Es el ÚNICO punto de entrada que sirve siempre.
 *
 * No se enlaza ninguna URL interna de MiSimplificación: todas redirigen a `FinSession.aspx` si no hay
 * una sesión viva DEL SERVICIO, que es propia y no se hereda de estar logueado en ARCA.
 */
const LOGIN_AFIP_URL = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

const obrasSocialesApi = createSimpleCatalogApi('/obras-sociales');

const sinAcentos = (s: string): string =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const soloDigitos = (v: string): string => String(v || '').replace(/\D/g, '');
const conGuiones = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
const formatCuil = (v: string): string => conGuiones(soloDigitos(v));

/** Una fila del lote: el contrato y los valores ya resueltos por el checklist. */
export type FilaConstatacion = { row: ContractOverviewRow; valores: AfipValues };

type EstadoFila = { guardando?: boolean; error?: string };

/** Cada cuánto se le vuelve a preguntar a la API mientras se mira una corrida. */
const POLEO_MS = 3000;

/**
 * Cuánto se espera sin ver progreso antes de abrir las instrucciones solas.
 *
 * Es el único momento en que sirven: si pasó medio minuto y no llegó ninguna, lo más probable es que
 * falte la sesión de ARCA o que el comando no se haya corrido. Abrirlas antes sería volver a poner
 * las instrucciones delante de la acción, que es lo que esta pantalla vino a corregir.
 */
const ESPERA_SIN_PROGRESO_MS = 30000;

// ─────────────────────────────────────────────────────────────── piezas chicas

/**
 * Un comando con botón de copiar.
 *
 * Nadie transcribe `--empresa 6a5fd1cc44faed2e72669f38` a mano, y si lo tipea mal el error no va a
 * ser obvio: el script simplemente no encuentra pendientes para esa empresa.
 */
const Comando: React.FC<{ texto: string }> = ({ texto }) => {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* El navegador bloqueó el portapapeles: el texto está a la vista igual. */
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-md border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-950/60 px-2.5 py-1.5 my-1.5">
      <code className="flex-1 min-w-0 truncate font-mono text-[11px] text-blue-700 dark:text-blue-300">{texto}</code>
      <button type="button" onClick={copiar} className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
        <FontAwesomeIcon icon={copiado ? faCheck : faCopy} className="h-2.5 w-2.5" />
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
};

/** Cómo se prepara ARCA. Colapsado: se hace una vez y la sesión dura días. */
const Instrucciones: React.FC<{ empleadora?: string; empresaId?: string; abierto: boolean; onToggle: (v: boolean) => void }> = ({ empleadora, empresaId, abierto, onToggle }) => (
  <details open={abierto} onToggle={(e) => onToggle((e.currentTarget as HTMLDetailsElement).open)} className="border-b border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40">
    <summary className="px-4 py-2.5 cursor-pointer select-none text-[12px] text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
      ¿Cómo se prepara ARCA? — se hace una vez, la sesión dura días
    </summary>
    <div className="px-4 pb-4 text-[11.5px] text-gray-600 dark:text-gray-400 space-y-1">
      <p>
        <strong className="text-gray-800 dark:text-gray-200">1.</strong> Levantá el Chrome de ARCA, desde <span className="font-mono text-[10.5px]">frontend/</span>. Es un Chrome aparte, con su propio
        perfil: no cierres el que estás usando.
      </p>
      <Comando texto="npm run chrome-arca" />
      <p>
        <strong className="text-gray-800 dark:text-gray-200">2.</strong> Ahí entrá con clave fiscal → <strong>Simplificación Registral - Empleadores</strong> →{' '}
        <strong>elegí el CUIT de {empleadora || 'la empleadora'}</strong> → Relaciones Laborales → <em>Registrar Nuevas Altas</em>, y dejá esa pantalla abierta.{' '}
        <a href={LOGIN_AFIP_URL} target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          Abrir el login <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2 w-2" />
        </a>
      </p>
      {/* Saltear el paso del CUIT es lo que hace que ARCA conteste "su tiempo de sesión ha finalizado"
          con la sesión intacta. Por eso va marcado y no como un tránsito más. */}
      <p className="text-amber-700 dark:text-amber-400">Elegir el CUIT no es opcional: es lo que inicia la «sesión de trabajo». Sin ese paso ARCA rechaza la pantalla de altas aunque estés logueado.</p>
      <p className="pt-1">
        <strong className="text-gray-800 dark:text-gray-200">3.</strong> En otra terminal, desde <span className="font-mono text-[10.5px]">frontend/</span>, corré el comando. Agregale{' '}
        <span className="font-mono text-[10.5px]">--dry-run</span> para ver qué haría sin escribir nada.
      </p>
      {empresaId && <Comando texto={`npm run validar-obras-sociales -- --empresa ${empresaId}`} />}
      <p className="text-amber-700 dark:text-amber-400 pt-1">
        <strong>No aprietes Aceptar en ARCA.</strong> Esa pantalla se usa solo para leer: el alta sale del TXT.
      </p>
      <p className="text-gray-500 dark:text-gray-500">
        Mientras ese Chrome esté abierto, cualquier programa de tu máquina puede controlarlo. Como usa un perfil aparte solo alcanza a esa ventana, no a tus otras pestañas; igual, cerralo cuando
        termines.{' '}
        <a href="/arca/guia-obras-sociales" target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
          Ver la guía
        </a>
      </p>
    </div>
  </details>
);

const CeldaCuil: React.FC<{ cuil: string }> = ({ cuil }) => {
  const [copiado, setCopiado] = useState(false);
  if (!cuil) return <span className="text-[11px] text-amber-700 dark:text-amber-400">sin CUIL</span>;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(formatCuil(cuil));
          setCopiado(true);
          window.setTimeout(() => setCopiado(false), 1500);
        } catch {
          /* sin portapapeles el número está a la vista igual */
        }
      }}
      title="Copiar"
      className="font-mono text-[11.5px] text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1.5 transition-colors"
    >
      {formatCuil(cuil)}
      <FontAwesomeIcon icon={copiado ? faCheck : faCopy} className={`h-2.5 w-2.5 ${copiado ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} />
    </button>
  );
};

/**
 * Buscador de la fila: elegir ES guardar.
 *
 * No hay paso de confirmación a propósito: acá la fuente ya está fijada —se está mirando la pantalla
 * de altas de ARCA— así que un botón extra solo agregaría un click por persona.
 */
const PickerFila: React.FC<{ catalogo: SimpleCatalogItem[]; disabled?: boolean; onElegir: (os: SimpleCatalogItem) => void }> = ({ catalogo, disabled, onElegir }) => {
  const [q, setQ] = useState('');
  const [foco, setFoco] = useState(false);

  const resultados = useMemo(() => {
    const term = sinAcentos(q.trim());
    const digitos = soloDigitos(q);
    if (!term) return [];
    return catalogo.filter((o) => (digitos && String(o.externalId || '').includes(digitos)) || sinAcentos(o.name).includes(term)).slice(0, 12);
  }, [catalogo, q]);

  return (
    <div className="relative">
      <FontAwesomeIcon icon={faSearch} className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
      <input
        value={q}
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => setFoco(true)}
        // El blur se demora: sin eso, el click en un resultado cierra la lista antes de dispararse.
        onBlur={() => window.setTimeout(() => setFoco(false), 150)}
        placeholder="RNOS o nombre…"
        className="input-field w-full pl-8 py-1.5 text-xs"
      />
      {foco && q.trim() !== '' && (
        <ul className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-900 shadow-lg">
          {resultados.length === 0 ? (
            <li className="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400">Sin resultados para «{q}».</li>
          ) : (
            resultados.map((o) => (
              <li key={o._id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setQ('');
                    setFoco(false);
                    onElegir(o);
                  }}
                  className="w-full text-left px-3 py-1.5 flex items-baseline gap-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                >
                  <span className="font-mono text-[11px] font-bold text-blue-700 dark:text-blue-400 shrink-0" title={`RNOS ${formatRnos(o.externalId)}`}>
                    {soloDigitos(o.externalId)}
                  </span>
                  <span className="text-xs text-gray-800 dark:text-gray-200 min-w-0">{o.name}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────── la pantalla

export const PantallaValidarObrasSociales: React.FC<{
  /** Filas del filtro vigente. Una sola cuando se entra desde una persona. */
  filas: FilaConstatacion[];
  /** Razón social de la empleadora activa, o vacío si están todas. */
  empleadora?: string;
  /** Id de la empleadora activa. Sin ella no se puede aplicar: la validación del RNOS es por CUIT. */
  empresaId?: string;
  /** Vuelve a pedir el listado. Es lo que hace posible mirar la corrida del script. */
  onRefrescar?: () => void | Promise<void>;
  onLoteAplicado?: () => void;
  onGuardado: (row: ContractOverviewRow, patch: Partial<ContractOverviewRow>) => void;
}> = ({ filas, empleadora, empresaId, onRefrescar, onLoteAplicado, onGuardado }) => {
  const [catalogo, setCatalogo] = useState<SimpleCatalogItem[]>([]);
  const [estados, setEstados] = useState<Record<string, EstadoFila>>({});
  const [instruccionesAbiertas, setInstruccionesAbiertas] = useState(false);
  /** El camino manual es la SALIDA DE EMERGENCIA: existe, funciona, y no ocupa media pantalla. */
  const [manual, setManual] = useState(false);
  const [pegado, setPegado] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [resumen, setResumen] = useState<string[] | null>(null);
  const [previsualizacion, setPrevisualizacion] = useState<{ filas: Array<{ cuil: string; rnos: string }>; lineas: string[]; aplicables: number } | null>(null);
  /** Mirando una corrida del script: se repregunta a la API y las filas se completan solas. */
  const [mirando, setMirando] = useState(false);

  useEffect(() => {
    obrasSocialesApi
      .list()
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, []);

  const clave = (r: ContractOverviewRow) => `${r._id}-${r.contractIndex}`;

  /**
   * Las que estaban pendientes al ABRIR, congeladas.
   *
   * Sin esto, cada fila resuelta se sale sola de la lista y las de abajo suben un renglón: se pierde
   * el acuse de recibo de lo que se acaba de hacer. Congelado, la fila se queda en su lugar y pasa a
   * verde — que es además lo que hace legible mirar una corrida.
   */
  const [clavesIniciales] = useState(() => new Set(filas.filter((f) => f.valores.constatacion === 'sin_constatar').map((f) => `${f.row._id}-${f.row.contractIndex}`)));
  const visibles = useMemo(() => filas.filter((f) => clavesIniciales.has(clave(f.row))), [filas, clavesIniciales]);
  const pendientes = useMemo(() => visibles.filter((f) => f.valores.constatacion === 'sin_constatar'), [visibles]);

  const total = clavesIniciales.size;
  const hechas = total - pendientes.length;
  const conAfiliacion = visibles.filter((f) => f.valores.constatacion === 'afiliada').length;
  const sinAfiliacion = visibles.filter((f) => f.valores.constatacion === 'no_figura').length;
  const terminado = total > 0 && pendientes.length === 0;

  /*
    El poleo, que es lo que convierte esta pantalla en un monitor.

    Se apaga solo al terminar: seguir preguntando cuando ya no queda nada pendiente es gasto puro. Y
    si pasa medio minuto sin que llegue ninguna, se abren las instrucciones —es el único momento en
    que sirven, porque lo más probable es que falte la sesión de ARCA o que el comando no se corrió.
  */
  const hechasRef = useRef(hechas);
  useEffect(() => {
    if (!mirando || !onRefrescar) return;
    let ultimoAvance = Date.now();
    hechasRef.current = hechas;
    const id = window.setInterval(async () => {
      await onRefrescar();
      if (hechasRef.current !== hechas) {
        hechasRef.current = hechas;
        ultimoAvance = Date.now();
      } else if (Date.now() - ultimoAvance > ESPERA_SIN_PROGRESO_MS) {
        setInstruccionesAbiertas(true);
      }
    }, POLEO_MS);
    return () => window.clearInterval(id);
  }, [mirando, onRefrescar, hechas]);

  useEffect(() => {
    if (terminado) setMirando(false);
  }, [terminado]);

  /** Guarda UNA fila desde el camino manual. Lo que ARCA contesta queda fijo. */
  const guardar = async (f: FilaConstatacion, accion: { obraSocial: SimpleCatalogItem } | { noFigura: true }) => {
    const k = clave(f.row);
    setEstados((prev) => ({ ...prev, [k]: { guardando: true } }));
    try {
      const ref = f.row.contratoId || f.row.contractIndex;
      const payload = 'noFigura' in accion ? ({ noFigura: true, constatadaEn: 'arca' } as const) : ({ obraSocialId: Number((accion.obraSocial.data as { id?: number } | undefined)?.id), origen: 'constatada', constatadaEn: 'arca' } as const);

      if (!('noFigura' in accion) && !Number.isFinite(payload.obraSocialId as number)) {
        throw new Error('Esa obra social no tiene código interno. Revisala en Configuración → ARCA → Obras Sociales.');
      }

      const res = await projectsAPI.updateObraSocialContrato(f.row.projectId, f.row.userId, ref as never, payload as never);
      onGuardado(f.row, {
        osId: res.obraSocialId ?? null,
        obraSocialOrigen: (res.obraSocialOrigen || '') as ContractOverviewRow['obraSocialOrigen'],
        obraSocialConstatadaEn: (res.obraSocialConstatadaEn || '') as ContractOverviewRow['obraSocialConstatadaEn'],
        obraSocialConstatadaEl: res.obraSocialConstatadaEl || '',
        obraSocialNoFigura: 'noFigura' in accion,
        obraSocialBloqueada: true,
      });
      setEstados((prev) => ({ ...prev, [k]: {} }));
    } catch (e: any) {
      // El error va EN la fila y no en un alert: interrumpir la tanda con un modal por cada obra
      // social que la empleadora no tiene registrada rompe el ritmo de la consulta.
      setEstados((prev) => ({ ...prev, [k]: { error: e?.response?.data?.error || e?.message || 'No se pudo guardar.' } }));
    }
  };

  /** `CUIL,RNOS` por línea, con el RNOS vacío cuando ARCA no devolvió ninguna. */
  const parsearPegado = (texto: string) =>
    texto
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [a, b] = l.split(/[,;\t]/);
        return { cuil: soloDigitos(a), rnos: soloDigitos(b) };
      })
      .filter((f) => f.cuil.length === 11);

  /** Las líneas del resumen. Las mismas para la previsualización y para el resultado. */
  const describir = (r: Awaited<ReturnType<typeof projectsAPI.aplicarObrasSocialesLote>>, futuro: boolean) => {
    const v = (a: string, b: string) => (futuro ? a : b);
    const lineas = [`${r.aplicados} ${v('se van a validar', 'validadas')} (${r.contratosAlcanzados} contratos)${r.noFigura ? ` · ${r.noFigura} sin afiliación en ARCA: queda la del convenio` : ''}.`];
    if (r.sinContrato.length) lineas.push(`${r.sinContrato.length} sin contrato en esta empleadora: ${r.sinContrato.map(conGuiones).join(', ')}`);
    if (r.yaBloqueados.length) lineas.push(`${r.yaBloqueados.length} ya ${v('están', 'estaban')} validadas en ARCA y no se ${v('van a pisar', 'pisaron')}: ${r.yaBloqueados.map(conGuiones).join(', ')}`);
    if (r.rnosDesconocido.length) lineas.push(`${r.rnosDesconocido.length} con un código que no está en el catálogo de Obras Sociales: ${r.rnosDesconocido.map((x) => `${conGuiones(x.cuil)}→${x.rnos}`).join(', ')}`);
    if (r.noRegistrada.length)
      lineas.push(`${r.noRegistrada.length} con una obra social que la empleadora no tiene registrada ante ARCA —el organismo rechazaría el alta—: ${r.noRegistrada.map((x) => `${conGuiones(x.cuil)}→${x.nombre}`).join(', ')}. Registrala en la ficha de la empresa (ARCA → Obras Sociales).`);
    return lineas;
  };

  /** Paso 1: mostrar qué va a pasar, sin escribir. Nada se guarda sin verlo antes. */
  const previsualizar = async () => {
    if (!empresaId) return;
    const parsed = parsearPegado(pegado);
    if (parsed.length === 0) {
      setResumen(['No encontré ninguna línea con un CUIL de 11 dígitos. El formato es CUIL,RNOS por línea.']);
      return;
    }
    setAplicando(true);
    setResumen(null);
    try {
      const r = await projectsAPI.aplicarObrasSocialesLote(empresaId, parsed, true);
      setPrevisualizacion({ filas: parsed, lineas: describir(r, true), aplicables: r.aplicados });
    } catch (e: any) {
      setResumen([e?.response?.data?.error || 'No se pudo revisar el lote.']);
    } finally {
      setAplicando(false);
    }
  };

  /** Paso 2: aplicar lo previsualizado. Cada obra social queda fija. */
  const confirmar = async () => {
    if (!empresaId || !previsualizacion) return;
    setAplicando(true);
    try {
      const r = await projectsAPI.aplicarObrasSocialesLote(empresaId, previsualizacion.filas, false);
      setResumen(describir(r, false));
      setPrevisualizacion(null);
      setPegado('');
      onLoteAplicado?.();
    } catch (e: any) {
      setResumen([e?.response?.data?.error || 'No se pudo aplicar el lote.']);
    } finally {
      setAplicando(false);
    }
  };

  /** Copia el comando y deja la pantalla esperando. Ver el bloque de arriba: el disparo va afuera. */
  const empezarAMirar = async () => {
    if (empresaId) {
      try {
        await navigator.clipboard.writeText(`npm run validar-obras-sociales -- --empresa ${empresaId}`);
      } catch {
        // Sin portapapeles igual se puede mirar: el comando está en las instrucciones, que se abren.
        setInstruccionesAbiertas(true);
      }
    }
    setMirando(true);
  };

  const cabecera = terminado ? `${total} validada${total === 1 ? '' : 's'}` : mirando ? 'Validando en ARCA…' : 'Validar obras sociales';
  const subcabecera = terminado
    ? `${conAfiliacion} con afiliación propia · ${sinAfiliacion} quedan con la del convenio`
    : mirando
      ? `${hechas} de ${total} · no cierres el Chrome de ARCA`
      : `${empleadora ? `${empleadora} · ` : ''}${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'}`;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* ── Cabecera: estado a la izquierda, la acción a la derecha ─────────── */}
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap border-b border-gray-200 dark:border-gray-700">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            {terminado && <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4 text-green-600 dark:text-green-400" />}
            {cabecera}
          </h3>
          <p className="text-[12px] text-gray-500 dark:text-gray-400">{subcabecera}</p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {!terminado && (
            <button type="button" onClick={() => setManual((v) => !v)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              <FontAwesomeIcon icon={faKeyboard} className="h-3 w-3" />
              Cargar a mano
            </button>
          )}
          {!terminado &&
            (mirando ? (
              <button type="button" onClick={() => setMirando(false)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-red-400 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                <FontAwesomeIcon icon={faStop} className="h-3 w-3" />
                Dejar de mirar
              </button>
            ) : (
              <button type="button" onClick={empezarAMirar} disabled={!empresaId || pendientes.length === 0} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <FontAwesomeIcon icon={faPlay} className="h-3 w-3" />
                {/* El botón dice CUÁNTAS. «Validar» a secas no deja saber si son estas 20 o la de al lado. */}
                Validar {pendientes.length === 1 ? '1' : `las ${pendientes.length}`}
              </button>
            ))}
        </div>
      </div>

      <Instrucciones empleadora={empleadora} empresaId={empresaId} abierto={instruccionesAbiertas} onToggle={setInstruccionesAbiertas} />

      {/* Mientras se mira, el comando queda a la vista: es lo que hay que correr para que esto avance. */}
      {mirando && empresaId && (
        <div className="px-4 pt-3 pb-1">
          <p className="text-[11.5px] text-gray-600 dark:text-gray-400">Copiado. Pegalo en una terminal, desde <span className="font-mono text-[10.5px]">frontend/</span>; las filas se van a ir completando solas.</p>
          <Comando texto={`npm run validar-obras-sociales -- --empresa ${empresaId}`} />
        </div>
      )}

      {/* Barra de progreso: solo mientras corre. Sin nada que mirar es decoración. */}
      {mirando && total > 0 && (
        <div className="h-1 bg-gray-200 dark:bg-gray-700">
          <div className="h-full bg-gradient-to-r from-blue-600 to-green-500 transition-[width] duration-500" style={{ width: `${Math.round((hechas / total) * 100)}%` }} />
        </div>
      )}

      {/*
        Sin una sola empleadora no se puede aplicar la tanda, y hay que DECIRLO.

        La validación de "esta obra social está entre las registradas" es por CUIT: mezclar dos
        empleadoras haría que el mismo RNOS sea válido para unas filas e inválido para otras.
      */}
      {!empresaId && (
        <div className="m-4 rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2.5 text-[11.5px] text-gray-700 dark:text-gray-300 flex items-start gap-2">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Los contratos elegidos son de <strong>más de una empleadora</strong>, o todavía no tienen una asignada. La obra social se valida contra el CUIT que la declara, así que la tanda tiene que ser
            de una sola: elegí la empleadora en las pestañas de arriba —o asignásela a estos contratos— y volvé a intentar.
          </span>
        </div>
      )}

      {/* ── El camino manual: existe, funciona, y no compite con el principal ── */}
      {manual && empresaId && (
        <div className="m-4 rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2.5">
          <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-100">Cargar a mano</p>
          <p className="text-[11.5px] text-gray-500 dark:text-gray-400">
            El respaldo para cuando el script no está disponible —otra máquina, otra persona, un navegador que no es Chrome—. Cargá los CUIL en ARCA uno por uno y pegá acá el resultado, una línea por
            persona. También se puede contestar fila por fila en la tabla de abajo.
          </p>
          <textarea
            value={pegado}
            onChange={(e) => {
              setPegado(e.target.value);
              // Cambiar el pegado invalida lo previsualizado: confirmar algo calculado sobre otro
              // texto aplicaría algo distinto de lo que se está mirando.
              setPrevisualizacion(null);
            }}
            placeholder="CUIL,RNOS — una línea por persona. El RNOS vacío significa que ARCA no devolvió ninguna."
            className="input-field w-full text-xs font-mono"
            rows={4}
          />
          {previsualizacion ? (
            <div className="rounded-md border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 p-2.5 space-y-2">
              <ul className="text-[11.5px] text-gray-700 dark:text-gray-300 space-y-1">
                {previsualizacion.lineas.map((l, i) => (
                  <li key={i} className={i === 0 ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-amber-700 dark:text-amber-400'}>
                    {l}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" disabled={aplicando || previsualizacion.aplicables === 0} onClick={confirmar} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                  {aplicando ? <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> : <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
                  Confirmar y aplicar
                </button>
                <button type="button" disabled={aplicando} onClick={() => setPrevisualizacion(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={aplicando || !pegado.trim()} onClick={previsualizar} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
              {aplicando ? <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> : <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
              Revisar lo que devolvió ARCA
            </button>
          )}
          {resumen && (
            <ul className="text-[11.5px] text-gray-700 dark:text-gray-300 space-y-1">
              {resumen.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── La tabla ────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
              <th className="px-4 py-2.5 font-bold">Persona</th>
              <th className="px-3 py-2.5 font-bold">CUIL</th>
              {/* Qué pasa si NO validás. Es la pregunta que se hace quien duda si vale la pena el trámite. */}
              <th className="px-3 py-2.5 font-bold">Qué va a quedar hoy</th>
              <th className="px-3 py-2.5 font-bold">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-[12px] text-gray-500 dark:text-gray-400">
                  No hay obras sociales pendientes de validar en esta selección.
                </td>
              </tr>
            ) : (
              visibles.map((f) => {
                const k = clave(f.row);
                const est = estados[k] || {};
                const sugerido = f.valores.rnosSugerido ? `${f.valores.rnosSugerido}${f.valores.nombreObraSocialSugerida ? ` · ${f.valores.nombreObraSocialSugerida}` : ''}` : '';
                return (
                  <tr key={k} className="border-b border-gray-100 dark:border-gray-700/60 align-middle">
                    <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">{f.row.userName}</td>
                    <td className="px-3 py-2.5">
                      <CeldaCuil cuil={f.row.cuit || ''} />
                    </td>
                    <td className="px-3 py-2.5 text-[11.5px] text-gray-500 dark:text-gray-400 font-mono">{sugerido || <span className="text-amber-700 dark:text-amber-400">sin default · el convenio no tiene obra social</span>}</td>
                    <td className="px-3 py-2.5">
                      {est.error ? (
                        <span className="text-[11.5px] text-red-600 dark:text-red-400 inline-flex items-start gap-1.5">
                          <FontAwesomeIcon icon={faXmark} className="h-3 w-3 mt-0.5 shrink-0" />
                          {est.error}
                        </span>
                      ) : est.guardando ? (
                        <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3 text-blue-500" />
                      ) : f.valores.constatacion === 'afiliada' ? (
                        <span className="text-[11.5px] text-green-700 dark:text-green-400 font-mono inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                          {f.valores.rnos} · afiliación propia
                        </span>
                      ) : f.valores.constatacion === 'no_figura' ? (
                        /*
                          «Sin afiliación» es un ÉXITO y se muestra como tal.

                          Es la respuesta más común de ARCA —la persona no tiene obra social propia, rige
                          la del convenio— y como vacío se leía como si la consulta hubiera fallado.
                        */
                        <span className="text-[11.5px] text-gray-500 dark:text-gray-400 inline-flex items-center gap-1.5">
                          <FontAwesomeIcon icon={faCheck} className="h-3 w-3 text-green-600 dark:text-green-400" />
                          sin afiliación → queda <span className="font-mono">{f.valores.rnosSugerido || '—'}</span>
                        </span>
                      ) : mirando ? (
                        <span className="text-[11px] rounded-full px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900">consultando…</span>
                      ) : manual ? (
                        <div className="flex items-center gap-2 min-w-[220px]">
                          <div className="flex-1">
                            <PickerFila catalogo={catalogo} onElegir={(os) => guardar(f, { obraSocial: os })} />
                          </div>
                          <button type="button" onClick={() => guardar(f, { noFigura: true })} title="ARCA no devolvió ninguna: rige la del convenio" className="shrink-0 text-[11px] px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-500 hover:text-blue-600 transition-colors">
                            No tiene
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] rounded-full px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/70">pendiente</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── El pie: qué cambió, sin tener que contar ─────────────────────────── */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 text-[12px] text-gray-600 dark:text-gray-400">
        {terminado ? (
          <>Los {total} contrato{total === 1 ? '' : 's'} quedaron con su obra social fija y con fecha. La pantalla de ARCA quedó limpia.</>
        ) : mirando ? (
          <>
            {conAfiliacion} con obra social propia · {sinAfiliacion} sin afiliación · {pendientes.length} por consultar
          </>
        ) : (
          <>Se guardan solas al llegar. Nada se pisa sin mostrarte antes qué cambia.</>
        )}
      </div>
    </div>
  );
};

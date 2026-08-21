import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faSearch, faArrowUpRightFromSquare, faSpinner, faCheck, faCopy, faCircleCheck, faCircleQuestion, faXmark, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { ContractOverviewRow } from '../../api/users';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { projectsAPI } from '../../api/projects';
import { formatRnos } from '../../utils/rnos';
import { AfipValues } from './afipCompleteness';

/**
 * Constatar la obra social de MUCHOS contratos de una sentada.
 *
 * Es la pantalla real del trámite. El modal por contrato sirve para el caso suelto —entró uno, se lo
 * constata—, pero el trabajo verdadero llega en tandas: se abre Simplificación Registral una vez, se
 * la deja en otra pestaña y se van pasando los CUIL uno atrás del otro por Registrar Nuevas Altas. Si
 * para cada persona hay que abrir su modal, leerlo entero y cerrarlo, el trámite cuesta diez veces
 * más que la consulta.
 *
 * Por eso acá: el link a ARCA está UNA vez arriba, cada fila trae su CUIL ya formateado y con botón
 * de copiar, y las dos respuestas posibles se contestan sin salir de la fila. Se guarda fila por fila
 * —no hay "guardar todo" al final— así que interrumpir la tanda a la mitad no pierde nada de lo ya
 * consultado.
 *
 * La consulta sigue siendo manual y no se puede automatizar: Simplificación Registral es una app web
 * con clave fiscal, sin webservice, y el único WS conectado (Consulta Padrón A13) no devuelve el RNOS
 * de un trabajador. Lo que sí se puede es no repetirla: lo que ARCA contesta queda fijo.
 */

/**
 * Login de clave fiscal. Es el ÚNICO punto de entrada que sirve siempre.
 *
 * No se enlaza ninguna URL interna de MiSimplificación —ni `login/indexContribuyente.aspx` ni
 * `Contribuyente/DatosBasicos.aspx`—: las dos redirigen a `FinSession.aspx` ("su tiempo de sesión ha
 * finalizado") si no hay una sesión viva DEL SERVICIO, que es propia y no se hereda de estar logueado
 * en ARCA. Como desde acá no hay forma de saber si existe —es otro dominio—, se manda al login, que
 * cuando ya hay sesión pasa de largo al portal.
 *
 * Desde ahí: Simplificación Registral - Empleadores → elegir el CUIT → Relaciones Laborales →
 * Registrar Nuevas Altas.
 */
const LOGIN_AFIP_URL = 'https://auth.afip.gob.ar/contribuyente_/login.xhtml';

const obrasSocialesApi = createSimpleCatalogApi('/obras-sociales');

const sinAcentos = (s: string): string =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

const formatCuil = (v: string): string => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(v || '');
};

const soloDigitos = (v: string): string => String(v || '').replace(/\D/g, '');

/** Una fila del lote: el contrato y los valores ya resueltos por el checklist. */
export type FilaConstatacion = { row: ContractOverviewRow; valores: AfipValues };

type EstadoFila = { guardando?: boolean; error?: string };

/**
 * Buscador de la fila: elegir ES guardar.
 *
 * No hay paso de confirmación a propósito: acá la fuente ya está fijada —se está mirando la pantalla
 * de altas de ARCA— así que un botón extra solo agregaría un click por persona. Lo que se guarda
 * queda fijo, y para eso está el candado de la fila ya resuelta.
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
          /* Si el navegador bloquea el portapapeles, el CUIL igual queda a la vista para copiarlo a mano. */
        }
      }}
      title="Copiar el CUIL para pegarlo en Registrar Nuevas Altas"
      className="group inline-flex items-center gap-2 font-mono text-xs text-gray-800 dark:text-gray-100 hover:text-blue-700 dark:hover:text-blue-400"
    >
      {formatCuil(cuil)}
      <FontAwesomeIcon icon={copiado ? faCheck : faCopy} className={`h-3 w-3 ${copiado ? 'text-green-600' : 'text-gray-400 group-hover:text-blue-600'}`} />
    </button>
  );
};

export const ConstatarObrasSocialesLote: React.FC<{
  /** Filas del filtro vigente (ya acotadas a la empleadora elegida por las pestañas de arriba). */
  filas: FilaConstatacion[];
  /** Razón social de la empleadora activa, o vacío si están todas. */
  empleadora?: string;
  /** Id de la empleadora activa. Sin ella no se puede aplicar un lote: la validación del RNOS es por CUIT. */
  empresaId?: string;
  /** Recargar el listado después de aplicar un lote (toca muchas filas de una). */
  onLoteAplicado?: () => void;
  onGuardado: (row: ContractOverviewRow, patch: Partial<ContractOverviewRow>) => void;
}> = ({ filas, empleadora, empresaId, onLoteAplicado, onGuardado }) => {
  const [catalogo, setCatalogo] = useState<SimpleCatalogItem[]>([]);
  const [estados, setEstados] = useState<Record<string, EstadoFila>>({});
  const [verTodas, setVerTodas] = useState(false);
  /** Panel de ida y vuelta con ARCA: copiar los CUIL y pegar lo que devolvió. */
  const [pegado, setPegado] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [resumen, setResumen] = useState<string[] | null>(null);
  /**
   * Lo que va a pasar si se confirma, calculado por el server con el MISMO código que escribe.
   *
   * El lote toca decenas de contratos de una y deja cada obra social FIJA: sin ver antes qué se
   * constata, qué queda en el convenio y qué la empleadora no tiene registrado, la única forma de
   * revisar el pegado es después de haberlo aplicado — y para entonces ya está sellado.
   */
  const [previsualizacion, setPrevisualizacion] = useState<{ filas: Array<{ cuil: string; rnos: string }>; lineas: string[]; aplicables: number } | null>(null);

  useEffect(() => {
    obrasSocialesApi
      .list()
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, []);

  const clave = (r: ContractOverviewRow) => `${r._id}-${r.contractIndex}`;

  const pendientes = useMemo(() => filas.filter((f) => f.valores.constatacion === 'sin_constatar'), [filas]);

  /**
   * Las que estaban pendientes al ABRIR la pantalla, congeladas.
   *
   * Sin esto, cada fila guardada se sale sola de la lista y las de abajo suben un renglón: se pierde
   * el acuse de recibo de lo que se acaba de hacer y el cursor termina en otra persona. Congelado, la
   * fila se queda en su lugar y pasa a verde, que es lo que uno espera al contestar un formulario.
   */
  const [claveInicial] = useState(() => new Set(filas.filter((f) => f.valores.constatacion === 'sin_constatar').map((f) => `${f.row._id}-${f.row.contractIndex}`)));
  const visibles = verTodas ? filas : filas.filter((f) => claveInicial.has(`${f.row._id}-${f.row.contractIndex}`));

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
        // Lo que devolvió ARCA queda fijo: la fila pasa a lectura con candado.
        obraSocialBloqueada: true,
      });
      setEstados((prev) => ({ ...prev, [k]: {} }));
    } catch (e: any) {
      // El error se muestra EN la fila y no en un alert: interrumpir la tanda con un modal por cada
      // obra social que la empleadora no tiene registrada rompe el ritmo de la consulta.
      setEstados((prev) => ({ ...prev, [k]: { error: e?.response?.data?.error || e?.message || 'No se pudo guardar.' } }));
    }
  };

  // Solo los que tienen empleadora: los otros no se pueden aplicar, y mandarlos a ARCA sería hacer
  // consultar a alguien un dato que después no va a poder guardar.
  const cuilsPendientes = pendientes.filter((f) => !!f.row.empresaContratoId).map((f) => soloDigitos(f.row.cuit || '')).filter((c) => c.length === 11);
  /** Con guiones: es como los pide el formulario de ARCA, así se pegan sin retocarlos. */
  const conGuiones = (c: string) => `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;

  /**
   * Copiar los CUIL y abrir ARCA, en un solo gesto.
   *
   * Eran dos botones separados y siempre se apretaban juntos: copiar sin ir a ARCA no sirve para
   * nada, e ir sin haber copiado obliga a volver. Se abre DESPUÉS de copiar y solo si copió — con la
   * pestaña nueva ya en foco, un fallo del portapapeles pasaría desapercibido.
   */
  const copiarYAbrir = async () => {
    try {
      await navigator.clipboard.writeText(cuilsPendientes.map(conGuiones).join('\n'));
    } catch {
      setResumen(['El navegador bloqueó el portapapeles: copiá los CUIL a mano desde la tabla de abajo.']);
      return;
    }
    setResumen([`${cuilsPendientes.length} CUIL copiados. En ARCA, pegalos de a uno en Registrar Nuevas Altas.`]);
    window.open(LOGIN_AFIP_URL, '_blank', 'noopener,noreferrer');
  };

  /*
    Acá vivía un botón para bajar `cuils.txt`, que era como el portapapeles y el script se encontraban.
    Ya no hace falta: el script pide los pendientes a la API con `--empresa` y aplica el resultado por
    la misma vía. El archivo era un intermediario que existía solo porque las dos puntas no se
    hablaban.
  */

  /**
   * Parsea el pegado. `CUIL,RNOS` por línea, con el RNOS vacío cuando ARCA no devolvió ninguna.
   *
   * Se acepta coma, punto y coma o tab como separador porque el pegado pasa por el portapapeles y
   * según de dónde venga cambia: exigir uno solo convertiría un formato distinto en "no encontré
   * ningún CUIL", que manda a revisar los datos en vez del separador.
   */
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

  /** Arma las líneas del resumen. Las mismas para la previsualización y para el resultado. */
  const describir = (r: Awaited<ReturnType<typeof projectsAPI.aplicarObrasSocialesLote>>, futuro: boolean) => {
    const v = (a: string, b: string) => (futuro ? a : b);
    const lineas = [`${r.aplicados} ${v('se van a constatar', 'constatadas')} (${r.contratosAlcanzados} contratos)${r.noFigura ? ` · ${r.noFigura} sin afiliación en ARCA: queda la del convenio` : ''}.`];
    // Lo que NO entra se enumera con el CUIL: sin eso, "22 de 26" obliga a comparar a mano.
    if (r.sinContrato.length) lineas.push(`${r.sinContrato.length} sin contrato en esta empleadora: ${r.sinContrato.map(conGuiones).join(', ')}`);
    if (r.yaBloqueados.length) lineas.push(`${r.yaBloqueados.length} ya ${v('están', 'estaban')} constatadas en ARCA y no se ${v('van a pisar', 'pisaron')}: ${r.yaBloqueados.map(conGuiones).join(', ')}`);
    if (r.rnosDesconocido.length) lineas.push(`${r.rnosDesconocido.length} con un código que no está en el catálogo de Obras Sociales: ${r.rnosDesconocido.map((x) => `${conGuiones(x.cuil)}→${x.rnos}`).join(', ')}`);
    if (r.noRegistrada.length)
      lineas.push(`${r.noRegistrada.length} con una obra social que la empleadora no tiene registrada ante ARCA —el organismo rechazaría el alta—: ${r.noRegistrada.map((x) => `${conGuiones(x.cuil)}→${x.nombre}`).join(', ')}. Registrala en la ficha de la empresa (ARCA → Obras Sociales).`);
    return lineas;
  };

  /** Paso 1: mostrar qué va a pasar, sin escribir. */
  const previsualizar = async () => {
    if (!empresaId) return;
    const filas = parsearPegado(pegado);
    if (filas.length === 0) {
      setResumen(['No encontré ninguna línea con un CUIL de 11 dígitos. El formato es CUIL,RNOS por línea.']);
      return;
    }
    setAplicando(true);
    setResumen(null);
    try {
      const r = await projectsAPI.aplicarObrasSocialesLote(empresaId, filas, true);
      setPrevisualizacion({ filas, lineas: describir(r, true), aplicables: r.aplicados });
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

  return (
    <div className="space-y-4">
      {/* El link va UNA vez y arriba: se abre en otra pestaña y se queda ahí toda la tanda. */}
      <div className="rounded-lg border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 px-3 py-2.5 flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1 text-[11px] text-gray-700 dark:text-gray-300 space-y-1">
          <p>
            La obra social sale de <strong>Relaciones Laborales → Registrar Nuevas Altas</strong>: se pone el CUIL y ARCA precompleta la que tiene registrada. Con el script se hacen todas de una (panel de abajo); a mano, se van cargando fila por fila en la tabla.
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            Lo que contesta ARCA queda fijo. <strong>Que no devuelva ninguna también es una respuesta</strong>: se registra con fecha, rige la del convenio y esa persona no vuelve a aparecer como pendiente.{' '}
            <strong>No completes el alta en ARCA</strong> — el alta sale del TXT.{' '}
            <a href="/arca/guia-obras-sociales" target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              ¿Cómo funciona esto?
            </a>
          </p>
        </div>
        <button type="button" onClick={copiarYAbrir} disabled={cuilsPendientes.length === 0} className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          <FontAwesomeIcon icon={faCopy} className="h-3 w-3" />
          Copiar {cuilsPendientes.length} CUIL y abrir ARCA
          <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
        </button>
      </div>

      {/*
        * Sin una sola empleadora no se puede aplicar la tanda, y hay que DECIRLO.
        *
        * La validación de "esta obra social está entre las registradas" es por CUIT: mezclar dos
        * empleadoras haría que el mismo RNOS sea válido para unas filas e inválido para otras. Antes
        * el panel simplemente no aparecía y la pantalla se leía como rota.
        */}
      {!empresaId && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/20 px-3 py-2.5 text-[11px] text-gray-700 dark:text-gray-300 flex items-start gap-2">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            Los contratos elegidos son de <strong>más de una empleadora</strong>, o todavía no tienen una asignada. La obra social se valida contra el CUIT que la declara, así que la tanda tiene que ser de una
            sola: elegí la empleadora en las pestañas de arriba —o asignásela a estos contratos— y volvé a intentar.
          </span>
        </div>
      )}

      {/*
        * El camino rápido: dos botones y un login.
        *
        * Se copian los CUIL, el script los recorre en la pestaña de ARCA que el operador ya abrió, y
        * el resultado vuelve pegado acá. La tabla de abajo queda para el caso suelto y para lo que el
        * lote no pudo resolver.
        */}
      {empresaId && cuilsPendientes.length > 0 && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">Traer todas de una, con el script</p>

          {/* Los pasos van acá y no en un manual: se ejecutan en otra ventana y en una terminal, así
              que hay que poder mirarlos mientras se hacen. Ya no hay archivo que bajar ni resultado
              que pegar: el script pide los pendientes y aplica lo que ARCA contesta. */}
          <ol className="text-[11px] text-gray-600 dark:text-gray-400 space-y-1.5 list-decimal pl-4">
            <li>
              Levantá el Chrome de ARCA: <span className="font-mono text-[10.5px]">npm run chrome-arca</span> desde <span className="font-mono text-[10.5px]">frontend/</span>.
              {/* El perfil aparte es lo que evita tener que cerrar el Chrome de todos los días, y lo
                  que limita el puerto abierto a esta única ventana. */}
              <span className="block">Es un Chrome aparte, con su propio perfil: no cierres el que estás usando.</span>
            </li>
            <li>
              En esa ventana entrá a ARCA: clave fiscal → <strong>Simplificación Registral - Empleadores</strong> → <strong>elegí el CUIT de {empleadora || 'la empleadora'}</strong> → Relaciones
              Laborales → <em>Registrar Nuevas Altas</em>, y dejá esa pantalla abierta.
              {/* El paso del CUIT se marca como obligatorio y no como un tránsito más: saltearlo es lo
                  que hace que ARCA conteste "su tiempo de sesión ha finalizado" con la sesión intacta. */}
              <span className="block text-amber-700 dark:text-amber-400">
                Elegir el CUIT no es opcional: es lo que inicia la «sesión de trabajo». Sin ese paso, ARCA rechaza la pantalla de altas aunque estés logueado.
              </span>
              <span className="block">Como el perfil queda guardado, esta sesión dura días: no hay que loguearse en cada corrida.</span>
            </li>
            <li>
              En otra terminal, desde <span className="font-mono text-[10.5px]">frontend/</span>:
              <span className="block font-mono text-[10.5px] text-gray-500 dark:text-gray-400 mt-0.5">npm run validar-obras-sociales -- --empresa {empresaId}</span>
              <span className="block">
                Toma los {cuilsPendientes.length} pendiente(s) de esta empleadora, los consulta en ARCA y los guarda. Agregale{' '}
                <span className="font-mono text-[10.5px]">--dry-run</span> para ver qué haría sin escribir nada.
              </span>
            </li>
          </ol>

          <p className="text-[11px] text-amber-700 dark:text-amber-400">
            <strong>No aprietes Aceptar en ARCA.</strong> Esa pantalla se usa solo para leer: el alta sale del TXT.
          </p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {/* La contrapartida de automatizar con el navegador, dicha donde se toma la decisión. Con
                el perfil dedicado el alcance es mucho menor, pero no es cero. */}
            Mientras ese Chrome esté abierto, cualquier programa de tu máquina puede controlarlo. Como usa un perfil aparte, solo alcanza a esa ventana —no a tus otras pestañas—; igual, cerralo cuando
            termines.{' '}
            <a href="/arca/guia-obras-sociales" target="_blank" rel="noreferrer" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              Ver la guía
            </a>
            .
          </p>

          {/* El pegado manual se conserva: es el camino cuando no se puede correr el script —otra
              máquina, otra persona, un navegador que no es Chrome— y es el que probó todo lo demás. */}
          <p className="text-[11px] text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
            <strong className="text-gray-700 dark:text-gray-300">O a mano:</strong> copiá los CUIL con el botón de arriba, cargalos en ARCA uno por uno y pegá acá el resultado, una línea por persona.
          </p>

          <textarea
            value={pegado}
            onChange={(e) => {
              setPegado(e.target.value);
              // Cambiar el pegado invalida lo previsualizado: confirmar algo calculado sobre otro
              // texto aplicaría algo distinto de lo que se está mirando.
              setPrevisualizacion(null);
            }}
            placeholder="Pegá acá lo que devolvió el script: una línea por persona, CUIL,RNOS — el RNOS vacío significa que ARCA no devolvió ninguna."
            className="input-field w-full text-xs font-mono"
            rows={4}
          />

          {previsualizacion ? (
            <div className="rounded-md border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 p-2.5 space-y-2">
              <ul className="text-[11px] text-gray-700 dark:text-gray-300 space-y-1">
                {previsualizacion.lineas.map((l, i) => (
                  <li key={i} className={i === 0 ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-amber-700 dark:text-amber-400'}>
                    {l}
                  </li>
                ))}
              </ul>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  disabled={aplicando || previsualizacion.aplicables === 0}
                  onClick={confirmar}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {aplicando ? <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> : <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
                  Confirmar y aplicar
                </button>
                <button type="button" disabled={aplicando} onClick={() => setPrevisualizacion(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                  Cancelar
                </button>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">Cada una queda fija, igual que si se cargara de a una.</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" disabled={aplicando || !pegado.trim()} onClick={previsualizar} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {aplicando ? <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> : <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
                Revisar lo que devolvió ARCA
              </button>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Se muestra qué se va a aplicar antes de guardar nada.</span>
            </div>
          )}

          {resumen && (
            <ul className="text-[11px] text-gray-700 dark:text-gray-300 space-y-1 pt-1 border-t border-gray-200 dark:border-gray-700">
              {resumen.map((l, i) => (
                <li key={i} className={i === 0 ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-amber-700 dark:text-amber-400'}>
                  {l}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-600 dark:text-gray-300">
          <strong>{pendientes.length}</strong> sin constatar{empleadora ? <> en {empleadora}</> : ' (todas las empleadoras)'} · {filas.length - pendientes.length} ya resueltas
        </p>
        <label className="inline-flex items-center gap-2 text-[11px] text-gray-600 dark:text-gray-300 cursor-pointer">
          <input type="checkbox" checked={verTodas} onChange={(e) => setVerTodas(e.target.checked)} />
          Mostrar también las ya constatadas
        </label>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-4 py-8 text-center">
          <FontAwesomeIcon icon={faCircleCheck} className="h-5 w-5 text-green-600 dark:text-green-500" />
          <p className="text-sm text-gray-700 dark:text-gray-200 mt-2">No queda ninguna por constatar con estos filtros.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/60">
              <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="text-left px-3 py-2">Persona</th>
                <th className="text-left px-3 py-2">CUIL</th>
                <th className="text-left px-3 py-2">Obra social</th>
                <th className="text-left px-3 py-2 w-[38%]">¿Qué devolvió ARCA?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-900">
              {visibles.map((f) => {
                const k = clave(f.row);
                const est = estados[k] || {};
                const constatada = f.valores.constatacion !== 'sin_constatar';
                return (
                  <tr key={k} className={constatada ? 'bg-green-50/40 dark:bg-green-900/10' : undefined}>
                    <td className="px-3 py-2 align-top">
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-100">{f.row.userName}</p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        {f.row.projectName}
                        {f.row.nombre_contrato ? ` · ${f.row.nombre_contrato}` : ''}
                      </p>
                    </td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">
                      <CeldaCuil cuil={f.row.cuit || ''} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      {f.valores.rnos ? (
                        <p className="flex items-baseline gap-2 min-w-0">
                          <span className="font-mono text-[11px] font-bold text-blue-700 dark:text-blue-400" title={`RNOS ${formatRnos(f.valores.rnos)}`}>
                            {soloDigitos(f.valores.rnos)}
                          </span>
                          <span className="text-xs text-gray-700 dark:text-gray-200 min-w-0">{f.valores.nombreObraSocial || '—'}</span>
                        </p>
                      ) : (
                        /* Sin validar no hay valor. Lo que se muestra es la REFERENCIA de qué va a
                           quedar si ARCA no devuelve ninguna — atenuada, para que no se lea como un
                           dato ya puesto. */
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 min-w-0">
                          sin validar
                          {f.valores.rnosSugerido ? (
                            <span className="block">
                              quedaría <span className="font-mono">{soloDigitos(f.valores.rnosSugerido)}</span> {f.valores.nombreObraSocialSugerida}
                            </span>
                          ) : null}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {est.guardando ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-2 py-1.5">
                          <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" />
                          Guardando…
                        </p>
                      ) : f.valores.constatacion === 'no_figura' ? (
                        <p className="text-[11px] text-green-700 dark:text-green-400 inline-flex items-center gap-1.5 py-1.5">
                          <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
                          <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5 opacity-60" />
                          No devolvió ninguna — rige la del convenio
                        </p>
                      ) : f.valores.constatacion === 'afiliada' ? (
                        <p className="text-[11px] text-green-700 dark:text-green-400 inline-flex items-center gap-1.5 py-1.5">
                          <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
                          {f.row.obraSocialConstatadaEn === 'arca' ? 'La devolvió ARCA' : 'Constatada'}
                          {/* El candado dice por qué no hay nada que tocar en esta fila. Corregir un
                              valor sellado se hace desde el modal del contrato, que exige confirmar. */}
                          {(f.row.obraSocialBloqueada || f.row.obraSocialConstatadaEn === 'arca') && <FontAwesomeIcon icon={faLock} className="h-2.5 w-2.5 opacity-60" />}
                        </p>
                      ) : !f.row.empresaContratoId ? (
                        /* Sin empleadora no hay contra qué CUIT validar: ofrecer el buscador sería
                           ofrecer una acción que el server va a rechazar. */
                        <p className="text-[11px] text-amber-700 dark:text-amber-400 py-1.5">Falta elegir la empleadora de este contrato</p>
                      ) : (
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <PickerFila catalogo={catalogo} onElegir={(os) => guardar(f, { obraSocial: os })} />
                          </div>
                          <button type="button" onClick={() => guardar(f, { noFigura: true })} title="ARCA no devolvió obra social para este CUIL: se registra la consulta y rige la del convenio" className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <FontAwesomeIcon icon={faCircleQuestion} className="h-3 w-3" />
                            No devolvió
                          </button>
                        </div>
                      )}
                      {est.error && (
                        <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5 flex items-start gap-1.5">
                          <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                          <span className="min-w-0">{est.error}</span>
                          <button type="button" onClick={() => setEstados((prev) => ({ ...prev, [k]: {} }))} className="shrink-0 text-gray-400 hover:text-gray-600">
                            <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                          </button>
                        </p>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ConstatarObrasSocialesLote;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faTurnDown, faChevronRight, faChevronDown, faSearch, faArrowUpRightFromSquare, faSpinner, faCheck, faTriangleExclamation, faCopy, faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
import { ContractOverviewRow } from '../../api/users';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { projectsAPI } from '../../api/projects';
import { sweetAlert } from '../../utils/sweetAlert';
import { formatRnos } from '../../utils/rnos';
import { AfipFieldCheck, AfipValues } from './afipCompleteness';
import { InfoCampo } from './DatosArcaDetalle';

/**
 * Constatar y fijar la obra social de UN contrato.
 *
 * Es el único lugar donde el dato se carga. Vive en el contrato porque ARCA declara el RNOS en cada
 * alta (pos. 40-45), no por CUIL: dos contratos de la misma persona en dos empleadoras llevan cada
 * uno el suyo, y el dato caduca solo por desregulación.
 *
 * La fuente es **ARCA**: Simplificación Registral → Relaciones Laborales → Registrar Nuevas Altas.
 * Se pone el CUIL y el organismo precompleta la obra social que tiene registrada para esa persona.
 * Antes se consultaba el Padrón de Beneficiarios de la SSS; se cambió porque obligaba a salir a otro
 * organismo, con otro captcha, para preguntar lo mismo que ARCA ya contesta en la pantalla donde el
 * operador igual tiene que entrar a subir el TXT.
 *
 * Lo que ARCA devuelve **queda fijo**: es el organismo que después valida el alta, así que su
 * respuesta no se corrige a mano (el candado lo hace cumplir el server, no esta pantalla). Si no
 * devuelve nada, la persona no tiene afiliación registrada y queda la obra social del convenio.
 *
 * El contrapunto, para que sea una decisión y no un olvido: lo que ARCA precompleta sale de
 * relaciones laborales anteriores y puede estar atrasado frente a una opción de cambio reciente, que
 * la SSS sí reflejaría. Se acepta ese riesgo a cambio de que el trámite sea uno y no dos.
 *
 * NO se puede automatizar. La única integración con el organismo que existe es WSAA + Consulta Padrón
 * A13 (`server/src/services/afipService.ts`), que devuelve datos del contribuyente y NO el RNOS de un
 * trabajador; Simplificación Registral es una app web con clave fiscal, sin webservice. El paso es
 * manual y la UI acompaña el trámite en vez de fingir que lo resuelve.
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

/** CUIL con guiones, como lo pide el formulario de ARCA: así se pega sin retocarlo. */
const formatCuil = (v: string): string => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : String(v || '');
};

const fechaCorta = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const sinAcentos = (s: string): string =>
  String(s || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/**
 * Buscador sobre las 496 del catálogo, por código o por nombre.
 *
 * Acepta las dos cosas a propósito: ARCA muestra el código y la descripción juntos, y según la
 * pantalla se lee uno u otro primero.
 */
const BuscadorObraSocial: React.FC<{ catalogo: SimpleCatalogItem[]; onElegir: (os: SimpleCatalogItem) => void }> = ({ catalogo, onElegir }) => {
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const resultados = useMemo(() => {
    const term = sinAcentos(q.trim());
    const digitos = q.replace(/\D/g, '');
    if (!term) return catalogo.slice(0, 25);
    return catalogo.filter((o) => (digitos && String(o.externalId || '').includes(digitos)) || sinAcentos(o.name).includes(term)).slice(0, 25);
  }, [catalogo, q]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por RNOS o por nombre…" className="input-field w-full pl-9" />
      </div>
      {resultados.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 px-1 py-2">Sin resultados para «{q}».</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-900">
          {resultados.map((o) => (
            <li key={o._id}>
              <button type="button" onClick={() => onElegir(o)} className="w-full text-left px-3 py-2 flex items-baseline gap-3 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400 shrink-0" title={`RNOS ${formatRnos(o.externalId)}`}>
                  {String(o.externalId || '').replace(/\D/g, '')}
                </span>
                <span className="text-sm text-gray-800 dark:text-gray-200 min-w-0">{o.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const ObraSocialDelContrato: React.FC<{
  row: ContractOverviewRow;
  valores: AfipValues;
  /** De dónde salió la obra social, ya redactado por el checklist ("del convenio 0634/11"). */
  etiquetaOrigen?: string;
  /** Avisos de obra social del checklist. Se muestran acá y no en la lista de abajo: son de este tema. */
  avisos?: AfipFieldCheck[];
  onGuardado: (patch?: Partial<ContractOverviewRow>) => void;
}> = ({ row, valores, etiquetaOrigen, avisos = [], onGuardado }) => {
  const [abierto, setAbierto] = useState(false);
  const [catalogo, setCatalogo] = useState<SimpleCatalogItem[]>([]);
  const [elegida, setElegida] = useState<SimpleCatalogItem | null>(null);
  const [guardando, setGuardando] = useState(false);
  /** Qué contestó el padrón. Arranca sin elegir para que nadie guarde por inercia lo que no miró. */
  const [rama, setRama] = useState<'afiliada' | 'no_figura' | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!abierto || catalogo.length > 0) return;
    obrasSocialesApi
      .list()
      .then(setCatalogo)
      .catch(() => setCatalogo([]));
  }, [abierto, catalogo.length]);

  const copiarCuil = async () => {
    try {
      await navigator.clipboard.writeText(formatCuil(row.cuit || ''));
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      sweetAlert.error('No se pudo copiar', 'El navegador bloqueó el portapapeles. Copiá el CUIL a mano.');
    }
  };

  const fechaConstatada = fechaCorta(valores.constatadaEl || '');
  const fijada = !!row.osId;
  const noFigura = !!row.obraSocialNoFigura;
  // Los tres estados. "No devolvió ninguna" es trabajo HECHO, no pendiente: cuenta como constatada.
  const constatada = row.obraSocialOrigen === 'constatada' || noFigura;
  /**
   * Lo constatado en ARCA está fijo: se muestra sin picker y sin botones.
   *
   * El candado real lo pone el server (devuelve 409); acá se refleja para no ofrecer un formulario
   * que va a ser rechazado. `desbloqueado` es el escape a un dígito mal tipeado, y no persiste: al
   * cerrar el panel vuelve a estar fijo.
   */
  const [desbloqueado, setDesbloqueado] = useState(false);
  /**
   * `obraSocialBloqueada` es el flag PERSISTIDO: el server lo escribe al sellar en ARCA y es el que
   * hace cumplir la inmutabilidad (contesta 409). Acá se respeta ese flag en vez de volver a
   * derivarlo, para que el candado de la UI y el del server no puedan discrepar. El fallback por
   * `constatadaEn === 'arca'` cubre los contratos sellados antes de que el flag existiera.
   */
  const selladaEnArca = row.obraSocialBloqueada === true || (row.obraSocialConstatadaEn === 'arca' && (!!row.osId || !!row.obraSocialNoFigura));
  const bloqueada = selladaEnArca && !desbloqueado;
  /**
   * Resuelta = no hay nada que ir a buscar. Incluye la heredada del convenio SIN constatar: tiene
   * número, el TXT sale, y el pendiente es una verificación — no un dato faltante.
   */
  const resuelta = constatada || (!!valores.rnos && valores.rnosOrigen !== 'ninguno' && valores.constatacion !== 'sin_constatar');

  /**
   * Re-constatar: el ÚNICO camino para cambiar un valor sellado.
   *
   * No es "editar": repite el flujo completo —abrir ARCA con el CUIL y cargar lo que devuelva— porque
   * el valor tiene que seguir siendo el del organismo. No hay edición a mano de un campo bloqueado.
   */
  const reConstatar = async () => {
    const r = await sweetAlert.confirm(
      '¿Volver a constatar en ARCA?',
      'Esta obra social la devolvió ARCA y por eso quedó fija. Volvé a consultar el CUIL en Relaciones Laborales → Registrar Nuevas Altas y cargá lo que devuelva el organismo. No la edites a mano.',
      'Sí, re-constatar',
    );
    if (r.isConfirmed) {
      setDesbloqueado(true);
      setRama(null);
      setElegida(null);
    }
  };

  const guardar = async (origen: 'constatada' | 'manual', constatadaEn?: 'sss' | 'arca') => {
    if (!elegida) return;
    const osId = Number((elegida.data as { id?: number } | undefined)?.id);
    if (!Number.isFinite(osId)) {
      sweetAlert.error('Obra social inválida', 'Esa obra social no tiene código interno. Revisala en Configuración → ARCA → Obras Sociales.');
      return;
    }
    setGuardando(true);
    try {
      // Se direcciona por el `_id` del contrato cuando está: la posición en el array cambia si alguien
      // borra otro contrato mientras esta pantalla está abierta, y el PATCH escribiría en el equivocado.
      const ref = row.contratoId || row.contractIndex;
      const res = await projectsAPI.updateObraSocialContrato(row.projectId, row.userId, ref as never, { obraSocialId: osId, origen, constatadaEn, forzar: desbloqueado || undefined });
      onGuardado({
        osId: res.obraSocialId,
        obraSocialOrigen: (res.obraSocialOrigen || '') as ContractOverviewRow['obraSocialOrigen'],
        obraSocialConstatadaEn: (res.obraSocialConstatadaEn || '') as ContractOverviewRow['obraSocialConstatadaEn'],
        obraSocialConstatadaEl: res.obraSocialConstatadaEl || '',
        obraSocialNoFigura: false,
      });
      setAbierto(false);
      setElegida(null);
      setRama(null);
      setDesbloqueado(false);
    } catch (e: any) {
      // El server valida que esté entre las registradas por la empleadora: ese error trae la empresa
      // y la acción concreta, así que se muestra tal cual en vez de un genérico.
      sweetAlert.error('No se pudo guardar', e?.response?.data?.error || 'No se pudo guardar la obra social del contrato.');
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Registrar que se consultó en ARCA y NO devolvió obra social.
   *
   * Es el resultado que antes no se podía guardar: el operador ponía el CUIL, ARCA no precompletaba
   * nada y no tenía dónde anotarlo, así que la fila quedaba en ámbar para siempre y se volvía a
   * consultar. Se guarda sin obra social —sin afiliación registrada corresponde la del convenio, que
   * es exactamente lo que ya resuelve la cascada— pero sellando la fecha de la consulta.
   */
  const marcarNoFigura = async () => {
    setGuardando(true);
    try {
      const ref = row.contratoId || row.contractIndex;
      const res = await projectsAPI.updateObraSocialContrato(row.projectId, row.userId, ref as never, { noFigura: true, constatadaEn: 'arca', forzar: desbloqueado || undefined });
      onGuardado({
        osId: null,
        obraSocialOrigen: '',
        obraSocialConstatadaEn: (res.obraSocialConstatadaEn || '') as ContractOverviewRow['obraSocialConstatadaEn'],
        obraSocialConstatadaEl: res.obraSocialConstatadaEl || '',
        obraSocialNoFigura: true,
      });
      setAbierto(false);
      setElegida(null);
      setRama(null);
      setDesbloqueado(false);
    } catch (e: any) {
      sweetAlert.error('No se pudo guardar', e?.response?.data?.error || 'No se pudo registrar la consulta.');
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    const r = await sweetAlert.confirm('¿Quitar la obra social del contrato?', 'Vuelve a resolverse por la cascada: la del convenio de su categoría, o la de excluidos de convenio. Se pierde la constatación.', 'Sí, quitar');
    if (!r.isConfirmed) return;
    setGuardando(true);
    try {
      const ref = row.contratoId || row.contractIndex;
      await projectsAPI.updateObraSocialContrato(row.projectId, row.userId, ref as never, { obraSocialId: null, origen: 'manual' });
      onGuardado({ osId: null, obraSocialOrigen: '', obraSocialConstatadaEn: '', obraSocialConstatadaEl: '', obraSocialNoFigura: false });
      setAbierto(false);
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo quitar la obra social.');
    } finally {
      setGuardando(false);
    }
  };

  /*
   * La sección entera vive acá —cabecera incluida— y no en el detalle que la muestra. El panel de
   * constatación es ancho (instrucciones + buscador + tres botones) y si el detalle armaba la fila y
   * este componente solo aportaba el botón, el panel abría dentro de la columna angosta de la derecha.
   */
  return (
    <div className={`rounded-lg border overflow-hidden ${abierto ? 'border-blue-300 dark:border-blue-800' : 'border-gray-200 dark:border-gray-700'}`}>
      {resuelta ? (
        /*
         * Resuelta: UNA línea, como cualquier otro campo del modal.
         *
         * Antes esta tarjeta ocupaba media pantalla con el instructivo completo —CUIL, pasos, radios—
         * incluso cuando no había nada que hacer, y empujaba el checklist fuera de la vista. El
         * instructivo es largo porque el trámite es afuera, así que aparece solo cuando sirve.
         */
        <button type="button" onClick={() => setAbierto((v) => !v)} className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
          <FontAwesomeIcon icon={bloqueada ? faLock : faTurnDown} className="h-3 w-3 shrink-0 text-gray-400" title={bloqueada ? 'La devolvió ARCA: queda fija' : 'Heredada del convenio'} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">Obra social</span>
          <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400 shrink-0" title={`RNOS ${formatRnos(valores.rnos)}`}>
            {String(valores.rnos || '').replace(/\D/g, '')}
          </span>
          <span className="text-xs text-gray-800 dark:text-gray-100 min-w-0 truncate">{valores.nombreObraSocial || '—'}</span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0 ml-auto flex items-center gap-1.5">
            {valores.constatacion === 'afiliada' ? `constatada${fechaConstatada ? ` ${fechaConstatada}` : ''}` : valores.constatacion === 'no_figura' ? `sin registro en ARCA${fechaConstatada ? ` · ${fechaConstatada}` : ''} · rige el convenio` : etiquetaOrigen}
            <FontAwesomeIcon icon={abierto ? faChevronDown : faChevronRight} className="h-2.5 w-2.5" />
          </span>
        </button>
      ) : (
        <div className="px-3 py-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
              Obra social del contrato
              <InfoCampo campo="rnos" />
            </p>
            {valores.rnos ? (
              <p className="text-sm text-gray-800 dark:text-gray-100 mt-0.5 flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400" title={`RNOS ${formatRnos(valores.rnos)}`}>
                  {String(valores.rnos || '').replace(/\D/g, '')}
                </span>
                <span className="min-w-0">{valores.nombreObraSocial || '—'}</span>
              </p>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">Sin resolver — sin ella el contrato no entra en el TXT</p>
            )}
            {etiquetaOrigen && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{etiquetaOrigen}</p>}

            {/* Sin constatar: se dice qué falta y, sobre todo, que NO frena el archivo — el valor del
                convenio ya está y el TXT sale igual. */}
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1 flex items-start gap-1.5">
              <FontAwesomeIcon icon={faCircleQuestion} className="h-3 w-3 mt-px shrink-0" />
              <span>Sin constatar en ARCA — no frena el archivo, pero nadie verificó qué obra social tiene registrada el organismo para esta persona.</span>
            </p>
          </div>
          <button type="button" onClick={() => setAbierto((v) => !v)} className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            {abierto ? 'Cerrar' : 'Constatar en ARCA'}
          </button>
        </div>
      )}

      {/* Los avisos de obra social viven acá y no en la lista de abajo: son de este tema. */}
      {avisos.length > 0 && !abierto && (
        <ul className="px-3 pb-2 space-y-1">
          {avisos
            .filter((a) => a.key !== 'rnosSinConstatar')
            .map((a) => (
              <li key={a.key} className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5 mt-0.5 shrink-0" />
                <span className="min-w-0">{a.detalle || a.label}</span>
              </li>
            ))}
        </ul>
      )}

      {abierto && (
        <div className="border-t border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 p-3 space-y-3">
          {bloqueada ? (
            /* Sellada por ARCA: se muestra el resultado y NO el formulario. Ofrecer un picker que el
               server va a rechazar con 409 sería mentirle a quien lo usa. */
            <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <FontAwesomeIcon icon={faLock} className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                {row.obraSocialNoFigura ? (
                  <span className="text-sm text-gray-800 dark:text-gray-100 min-w-0">ARCA no devolvió obra social para este CUIL</span>
                ) : (
                  <>
                    <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400 shrink-0" title={`RNOS ${formatRnos(valores.rnos)}`}>
                      {String(valores.rnos || '').replace(/\D/g, '')}
                    </span>
                    <span className="text-sm text-gray-800 dark:text-gray-100 min-w-0 truncate">{valores.nombreObraSocial || '—'}</span>
                  </>
                )}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1.5 flex-wrap">
                <span>constatado en ARCA{fechaConstatada ? ` el ${fechaConstatada}` : ''}</span>
                <span aria-hidden>·</span>
                <span>no editable</span>
                <span aria-hidden>·</span>
                <button type="button" onClick={reConstatar} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  Re-constatar
                </button>
              </p>
            </div>
          ) : (
            <>
              {/*
               * CUIL + link en UNA línea, y sin instructivo.
               *
               * El paso a paso vivía acá repetido: ya está en el ⓘ del título, que es el patrón del
               * modal —lo largo va en el info, la pantalla queda operativa—. Con las instrucciones
               * adentro, este panel ocupaba media pantalla y empujaba el resto del checklist fuera
               * de la vista para decir algo que se lee una vez y no se vuelve a mirar.
               */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">CUIL</span>
                <span className="font-mono text-sm font-bold text-gray-800 dark:text-gray-100">{row.cuit ? formatCuil(row.cuit) : '— sin CUIL cargado'}</span>
                {!!row.cuit && (
                  <button
                    type="button"
                    onClick={copiarCuil}
                    title="Copiar para pegarlo en Registrar Nuevas Altas"
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <FontAwesomeIcon icon={copiado ? faCheck : faCopy} className="h-3 w-3" />
                    {copiado ? 'Copiado' : 'Copiar'}
                  </button>
                )}
                <a
                  href={LOGIN_AFIP_URL}
                  target="_blank"
                  rel="noreferrer"
                  title="Clave fiscal → Simplificación Registral - Empleadores → elegí el CUIT → Relaciones Laborales → Registrar Nuevas Altas. No completes el alta ahí: sale del TXT."
                  className="ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:bg-blue-100/60 dark:hover:bg-blue-900/30"
                >
                  Entrar a ARCA
                  <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
                </a>
              </div>

              {/* Las DOS respuestas se registran. Que ARCA no devuelva nada es un resultado tan
                  válido como que devuelva un código, y hasta ahora no había dónde anotarlo: la fila
                  quedaba en ámbar y alguien volvía a consultarla la semana siguiente. Las
                  descripciones largas se fueron al ⓘ del título: acá los rótulos alcanzan. */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-semibold text-gray-800 dark:text-gray-100 shrink-0">¿Qué devolvió?</span>
                  {[
                    { v: 'afiliada' as const, txt: 'Una obra social' },
                    { v: 'no_figura' as const, txt: 'Ninguna' },
                  ].map((op) => (
                    <label
                      key={op.v}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 cursor-pointer text-[11px] font-semibold transition-colors ${
                        rama === op.v
                          ? 'border-blue-400 dark:border-blue-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-white/60 dark:hover:bg-gray-900/40'
                      }`}
                    >
                      <input type="radio" name={`rama-os-${row.contratoId || row.contractIndex}`} checked={rama === op.v} onChange={() => setRama(op.v)} className="h-3 w-3" />
                      {op.txt}
                    </label>
                  ))}
                  {rama === 'no_figura' && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">rige la del convenio{valores.nombreObraSocial ? ` · ${valores.nombreObraSocial}` : ''}</span>
                  )}
                </div>

                {rama === 'afiliada' && (
                  <div className="space-y-2">
                    {elegida ? (
                      <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400" title={`RNOS ${formatRnos(elegida.externalId)}`}>
                          {String(elegida.externalId || '').replace(/\D/g, '')}
                        </span>
                        <span className="text-sm text-gray-800 dark:text-gray-200 min-w-0 flex-1 truncate">{elegida.name}</span>
                        <button type="button" onClick={() => setElegida(null)} className="text-[11px] text-gray-500 hover:underline shrink-0">
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <BuscadorObraSocial catalogo={catalogo} onElegir={setElegida} />
                    )}

                    {elegida && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={guardando}
                          onClick={() => guardar('constatada', 'arca')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {guardando ? <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> : <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
                          Es la que devolvió ARCA
                        </button>
                        {/* "Cargar a mano" sobrevive para el caso en que el dato no salga de la
                            pantalla de altas (un papel de la obra social, un traspaso recién hecho).
                            NO queda fijo ni pinta de verde: se guarda como excepción sin constatar. */}
                        <button
                          type="button"
                          disabled={guardando}
                          onClick={() => guardar('manual')}
                          title="No sale de ARCA: queda como excepción cargada a mano, sin constatar"
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                        >
                          Cargar a mano
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {rama === 'no_figura' && (
                  <button
                    type="button"
                    disabled={guardando}
                    onClick={marcarNoFigura}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {guardando ? <FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> : <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
                    Registrar que no devolvió ninguna
                  </button>
                )}
              </div>
            </>
          )}

          {fijada && !bloqueada && (
            <div className="pt-2 border-t border-blue-200/60 dark:border-blue-800/60 flex items-center gap-2">
              <button type="button" disabled={guardando} onClick={quitar} className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">
                Quitar la obra social de este contrato
              </button>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">— vuelve a resolverse por el convenio</span>
            </div>
          )}

          {!valores.rnos && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5 mt-0.5 shrink-0" />
              Este contrato no tiene ninguna obra social resuelta: sin ella no entra en el TXT.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleXmark, faCircleQuestion, faCircle, faSpinner, faDownload, faMagnifyingGlass, faCircleExclamation, faClock, faFileArrowDown, faFileSignature, faFlask, faRotateRight, faChevronUp, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { Modal } from '../ui/Modal';
import { projectsAPI, CorridaAltasGuardada, EstadoConstanciasAlta, ConstanciaArcaEnPantalla } from '../../api/projects';
import { detalleDeLoPresentado } from './progresoTandas';
import { sweetAlert } from '../../utils/sweetAlert';

/**
 * EL AVISO AL TERMINAR LA DESCARGA DE LAS ALTAS TEMPRANAS: cuántas constancias se bajaron de ARCA, a
 * dónde fueron (Outbox para firmar, o «Alta temprana de Arca / No firmar») y cuántos contratos pasaron
 * a Generar Documentos. El destino viene en el texto de cada persona (ver constanciasAltas.ts).
 */
function avisarCierreDeDescarga(eventos: Array<Record<string, any> & { tipo: string }>) {
  const porCuil = new Map<string, Record<string, any>>();
  for (const e of eventos) if (e.tipo === 'persona') porCuil.set(e.cuil, e);
  const personas = [...porCuil.values()];
  const fallo = eventos.find((e) => e.tipo === 'fallo');
  const listas = personas.filter((p) => p.estado === 'lista');
  const outbox = listas.filter((p) => /outbox/i.test(String(p.detalle || ''))).length;
  const noFirmar = listas.filter((p) => /no firmar/i.test(String(p.detalle || ''))).length;
  const avanzaron = listas.filter((p) => /pasó a/i.test(String(p.detalle || ''))).length;
  const problemas = personas.filter((p) => p.estado !== 'lista' && p.estado !== 'descargando');
  const texto =
    `${listas.length === 1 ? 'Se bajó la constancia' : `Se bajaron ${listas.length} constancias`} de ARCA${listas.length > 0 ? ` (${listas.map((p) => p.nombre).join(', ')})` : ''}.` +
    (outbox > 0 ? ` ${outbox} al Outbox, lista(s) para enviar a firmar.` : '') +
    (noFirmar > 0 ? ` ${noFirmar} archivada(s) en «Alta temprana de Arca / No firmar».` : '') +
    (avanzaron > 0 ? ` ${avanzaron === 1 ? '1 contrato pasó' : `${avanzaron} contratos pasaron`} a Generar Documentos.` : '') +
    (problemas.length > 0 ? `\n\nSin resolver: ${problemas.map((p) => `${p.nombre} (${p.estado}${p.detalle ? `: ${p.detalle}` : ''})`).join('; ')}.` : '') +
    (fallo ? `\n\nLa descarga se cortó: ${fallo.mensaje}` : '');
  if (listas.length > 0 && problemas.length === 0 && !fallo) void sweetAlert.successAlert(listas.length === 1 ? 'Alta temprana descargada' : `${listas.length} altas tempranas descargadas`, texto);
  else if (personas.length > 0 || fallo) void sweetAlert.warningAlert('Descarga terminada con pendientes', texto);
}

/**
 * EL REGISTRO DE LO PRESENTADO EN ARCA POR ALTAS MASIVAS (URGENTE): una fila por persona y corrida.
 *
 * Sale de `arca_altas_logs`, que es donde el servidor deja cada corrida —quién la lanzó, cuándo, en
 * qué tanda fue cada persona y qué contestó ARCA—. El modal de la corrida solo muestra la última y
 * mientras el servidor la recuerda; esto es lo que queda.
 *
 * Desde el 07/11/2026 se lee por TIPO DE RESULTADO: contadores que filtran (descargadas, en firma,
 * firmadas, alta + baja mismo día, revisión, pendientes, no presentadas), un grupo por tipo con su
 * explicación, y lo técnico detrás de «ver detalle». Las pruebas en seco se suman con su propio botón.
 */

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Si viene, se muestran solo las corridas de esa empleadora (la de la pestaña). */
  empresaId?: string;
}

interface Fila {
  clave: string;
  fecha: string;
  empresa: string;
  usuario: string;
  enSeco: boolean;
  tanda?: number;
  nombre: string;
  cuil: string;
  resultado: string;
  motivo?: string;
  cat?: string;
  porConsulta?: boolean;
  registro?: string;
  constancia?: CorridaAltasGuardada['contratos'][number]['constancia'];
  /** El desde/hasta del contrato del alta (distingue dos altas de la misma persona con la misma empleadora). */
  contrato?: { alta: string; baja: string } | null;
  /** La corrida de la que viene la fila, para pedir la pantalla de ARCA de su tanda. */
  logId: string;
  /** Qué devolvió ARCA en la tanda de esta persona (sólo en logs que lo guardan). */
  tandaDetalle?: NonNullable<CorridaAltasGuardada['tandasDetalle']>[number];
  /** El ciclo de su constancia HOY (07/11/2026). */
  ciclo?: ConstanciaArcaEnPantalla | null;
  presentadaDespues?: CorridaAltasGuardada['contratos'][number]['presentadaDespues'];
}

/** Dónde quedó la constancia de alta de una persona: es lo que dice la columna «Constancia». */
const DESTINO: Record<string, { texto: string; clase: string }> = {
  outbox: { texto: 'Outbox · para firmar', clase: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800' },
  no_firmar: { texto: 'Alta temprana de Arca / No firmar', clase: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600' },
  sin_subir: { texto: 'Validada, sin subir a Dropbox', clase: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800' },
};

const VISTA: Record<string, { texto: string; icon: typeof faCircle; clase: string }> = {
  presentada: { texto: 'Registrada', icon: faCircleCheck, clase: 'text-green-600 dark:text-green-400' },
  rechazada: { texto: 'Rechazada', icon: faCircleXmark, clase: 'text-red-600 dark:text-red-400' },
  indeterminado: { texto: 'Incierta', icon: faCircleQuestion, clase: 'text-amber-600 dark:text-amber-400' },
  pendiente: { texto: 'No se presentó', icon: faCircle, clase: 'text-gray-300 dark:text-gray-600' },
  seco: { texto: 'En seco', icon: faCircle, clase: 'text-gray-400' },
};
const vista = (r: string) => VISTA[r] || { texto: r, icon: faCircle, clase: 'text-gray-400' };
const fmtCuit = (c: string) => (c && c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
const fmtFecha = (iso: string) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fechaCortaIso = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || '—');

/** Las corridas, aplanadas a una fila por persona. Puro. */
export function filasDelHistorial(corridas: CorridaAltasGuardada[]): Fila[] {
  return corridas.flatMap((c) =>
    (c.contratos || []).map((p, i) => ({
      clave: `${c._id}:${i}`,
      fecha: c.createdAt,
      empresa: c.empresaRazonSocial || '',
      usuario: c.usuario || '',
      enSeco: !!c.enSeco,
      tanda: p.tanda,
      nombre: p.nombre,
      cuil: p.cuil,
      resultado: p.resultado,
      motivo: p.motivo,
      cat: p.cat,
      porConsulta: p.porConsulta,
      registro: p.registro,
      constancia: p.constancia,
      contrato: p.contrato || null,
      logId: c._id,
      tandaDetalle: p.tanda != null ? (c.tandasDetalle || []).find((t) => t.n === p.tanda) : undefined,
      ciclo: p.ciclo,
      presentadaDespues: p.presentadaDespues,
    })),
  );
}

/**
 * UNA FILA POR PERSONA Y CONTRATO (01/11/2026): la misma persona aparecía una vez por corrida (rechazada,
 * después registrada…) y la tabla no se entendía. Se agrupa por CUIL + empleadora + contrato; la fila
 * muestra el intento que vale —el último registrado, o si ninguno se registró, el último— y los demás
 * se ven al abrirla.
 */
export interface Grupo {
  clave: string;
  principal: Fila;
  /** Todos los intentos, del más nuevo al más viejo. */
  intentos: Fila[];
}

export function agruparPorPersona(filas: Fila[]): Grupo[] {
  const porClave = new Map<string, Fila[]>();
  for (const f of filas) {
    const k = `${f.cuil}|${f.empresa}|${f.contrato?.alta || ''}|${f.contrato?.baja || ''}`;
    const lista = porClave.get(k);
    if (lista) lista.push(f);
    else porClave.set(k, [f]);
  }
  return [...porClave.entries()]
    .map(([clave, fs]) => {
      const intentos = [...fs].sort((a, b) => b.fecha.localeCompare(a.fecha));
      return { clave, principal: intentos.find((f) => f.resultado === 'presentada' && !f.enSeco) || intentos[0], intentos };
    })
    .sort((a, b) => b.intentos[0].fecha.localeCompare(a.intentos[0].fecha));
}

/** Para buscar sin que importen mayúsculas ni acentos («garcia» encuentra a «GARCÍA»). */
const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** «Qué devolvió ARCA» en la tanda de una persona: motivo o error, diálogos, y la pantalla si se guardó. */
const RespuestaDeArca: React.FC<{ f: Fila }> = ({ f }) => {
  const t = f.tandaDetalle;
  const [abriendo, setAbriendo] = useState(false);
  if (!t) return null;
  const abrirHtml = async () => {
    setAbriendo(true);
    try {
      const html = await projectsAPI.htmlTandaAltasArca(f.logId, t.n);
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e: any) {
      sweetAlert.error('No se pudo abrir la pantalla', e?.response?.data?.error || e?.message || '');
    } finally {
      setAbriendo(false);
    }
  };
  const nada = !t.textoArca && !t.error && !(t.dialogos || []).length && !t.textoNuevo && !t.conHtml;
  return (
    <div className="mt-3 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 text-[11px]">
      <p className="font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
        Qué devolvió ARCA · tanda {t.n} · {t.resultado}
        {t.duracionMs ? ` · ${Math.round(t.duracionMs / 1000)} s` : ''}
      </p>
      {nada ? (
        <p className="text-gray-500">ARCA no mostró nada en esta tanda (o la corrida es anterior a que se guardara la evidencia).</p>
      ) : (
        <div className="space-y-1">
          {t.textoArca && <p><span className="text-gray-500">Motivo:</span> <span className="text-red-700 dark:text-red-400">{t.textoArca}</span></p>}
          {t.error && <p><span className="text-gray-500">Error:</span> <span className="text-red-700 dark:text-red-400">{t.error}</span></p>}
          {(t.dialogos || []).length > 0 && <p><span className="text-gray-500">Diálogos:</span> {(t.dialogos || []).join(' · ')}</p>}
          {t.textoNuevo && (
            <details>
              <summary className="cursor-pointer text-gray-500">Lo que apareció en pantalla después del «Aceptar»</summary>
              <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-gray-700 dark:text-gray-300">{t.textoNuevo}</pre>
            </details>
          )}
          {t.conHtml && (
            <button type="button" onClick={() => void abrirHtml()} disabled={abriendo} className="inline-flex items-center gap-1.5 mt-1 px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
              <FontAwesomeIcon icon={abriendo ? faSpinner : faDownload} spin={abriendo} className="h-3 w-3" />
              Ver la pantalla de ARCA
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/*
  EL REGISTRO POR TIPO DE RESULTADO (07/11/2026). Cada persona va en UN grupo, según su constancia HOY
  (`ciclo`, de `constancias_arca`) o, si no se presentó, según qué pasó en ARCA. Cada grupo dice en
  castellano qué significa; lo técnico (intentos, registro campo por campo, pantalla de ARCA) queda
  detrás de «ver detalle». Lo que salió bien nunca va en rojo.
*/
export type GrupoRegistro = 'revision' | 'pendientes' | 'descargadas' | 'en_firma' | 'firmadas' | 'no_presentadas' | 'seco';
export type FiltroRegistro = GrupoRegistro | 'mismo_dia';

const GRUPOS: Record<GrupoRegistro, { titulo: string; explicacion: string; tono: string; icon: typeof faCircle }> = {
  revision: {
    titulo: 'Requiere revisión',
    explicacion: 'No se resolvió sola. Cada persona dice por qué. No se piden solas ni ocupan el cupo diario: «Reintentar» la vuelve a pedir ahora.',
    tono: 'border-red-200 bg-red-50/60 text-red-800 dark:border-red-900 dark:bg-red-900/10 dark:text-red-300',
    icon: faCircleExclamation,
  },
  pendientes: {
    titulo: 'Pendientes',
    explicacion: 'Presentadas en ARCA, esperando que se baje su constancia. En el cupo diario van primero las nuevas; las que fallaron se reintentan a 1 y a 2 días (3 intentos como mucho).',
    tono: 'border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-200',
    icon: faClock,
  },
  descargadas: {
    titulo: 'Descargadas',
    explicacion: 'La constancia ya se bajó de ARCA: está en el Outbox lista para enviar a firmar, o archivada en «Alta temprana de Arca / No firmar».',
    tono: 'border-blue-200 bg-blue-50/60 text-blue-800 dark:border-blue-900 dark:bg-blue-900/10 dark:text-blue-300',
    icon: faFileArrowDown,
  },
  en_firma: {
    titulo: 'En firma',
    explicacion: 'Enviadas a firmar: el PDF está en Pendbox esperando la firma de la persona.',
    tono: 'border-indigo-200 bg-indigo-50/60 text-indigo-800 dark:border-indigo-900 dark:bg-indigo-900/10 dark:text-indigo-300',
    icon: faFileSignature,
  },
  firmadas: {
    titulo: 'Firmadas',
    explicacion: 'Volvieron firmadas (Requested signatures) y quedan archivadas en «Alta temprana de Arca / Firmadas».',
    tono: 'border-green-200 bg-green-50/60 text-green-800 dark:border-green-900 dark:bg-green-900/10 dark:text-green-300',
    icon: faCircleCheck,
  },
  no_presentadas: {
    titulo: 'No presentadas',
    explicacion: 'ARCA rechazó el alta o el resultado quedó incierto, y no se presentó después en otra corrida. El motivo de ARCA está en cada persona.',
    tono: 'border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-900 dark:bg-amber-900/10 dark:text-amber-300',
    icon: faCircleXmark,
  },
  seco: {
    titulo: 'Pruebas en seco',
    explicacion: 'Corridas de prueba: no se presentó nada en ARCA.',
    tono: 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300',
    icon: faFlask,
  },
};
const ORDEN_GRUPOS: GrupoRegistro[] = ['revision', 'pendientes', 'descargadas', 'en_firma', 'firmadas', 'no_presentadas', 'seco'];
/** Los contadores de arriba, en el orden del pedido (07/11/2026). */
const CONTADORES: Array<{ filtro: FiltroRegistro; texto: string }> = [
  { filtro: 'descargadas', texto: 'Descargadas' },
  { filtro: 'en_firma', texto: 'En firma' },
  { filtro: 'firmadas', texto: 'Firmadas' },
  { filtro: 'mismo_dia', texto: 'Alta + baja mismo día' },
  { filtro: 'revision', texto: 'Requiere revisión' },
  { filtro: 'pendientes', texto: 'Pendientes' },
  { filtro: 'no_presentadas', texto: 'No presentadas' },
];

/** El ciclo de la constancia de una persona: el de la fila que vale, o el de cualquiera de sus intentos. */
const cicloDe = (g: Grupo) => g.principal.ciclo || g.intentos.find((i) => i.ciclo)?.ciclo || null;

/** En qué grupo va una persona. Puro. */
export function grupoDe(g: Grupo): GrupoRegistro {
  const f = g.principal;
  const presentada = g.intentos.some((i) => (i.resultado === 'presentada' && !i.enSeco) || !!i.presentadaDespues);
  if (presentada) {
    const ciclo = cicloDe(g);
    if (ciclo) return ciclo.categoria;
    // Servidor anterior al ciclo: sólo se sabe si la constancia se bajó o no.
    return f.constancia ? 'descargadas' : 'pendientes';
  }
  if (g.intentos.every((i) => i.enSeco || i.resultado === 'seco')) return 'seco';
  return 'no_presentadas';
}

/** Alta y baja el mismo día (jornada): lo dice la constancia, o las fechas del contrato. Puro. */
export const esMismoDia = (g: Grupo) => !!cicloDe(g)?.mismoDia || (!!g.principal.contrato?.alta && g.principal.contrato.alta === g.principal.contrato.baja);

/** El link a Documentos, abierto en la carpeta donde está HOY el archivo y filtrado por su código. */
const linkAlDocumento = (doc: NonNullable<ConstanciaArcaEnPantalla['documento']>) =>
  `/documents?carpeta=${encodeURIComponent(doc.path.replace(/\/[^/]+$/, ''))}&buscar=${encodeURIComponent(doc.codigo || doc.nombre)}`;

const fechaCortaDe = (iso: string) => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

/**
 * EL CHIP DE LA CONSTANCIA, en vivo: sale del ciclo (dónde está el documento hoy), no de un texto
 * grabado al bajarla. Si hay documento, el click lo abre en Documentos, en su carpeta de hoy.
 */
export const ChipConstancia: React.FC<{ ciclo: ConstanciaArcaEnPantalla | null | undefined; constanciaVieja?: Fila['constancia'] }> = ({ ciclo, constanciaVieja }) => {
  if (!ciclo) {
    // Servidor anterior al ciclo: lo de antes, sin inventar un estado.
    if (constanciaVieja) return <span className="text-[11px] text-gray-500">{DESTINO[constanciaVieja.destino]?.texto || constanciaVieja.destino}</span>;
    return <span className="text-gray-300 dark:text-gray-600">—</span>;
  }
  const doc = ciclo.documento;
  const v: Record<string, { texto: string; clase: string }> = {
    presentada: { texto: 'Falta bajarla', clase: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600' },
    constancia_pendiente: { texto: `Reintento${ciclo.proximoIntentoEl ? ` el ${fechaCortaDe(ciclo.proximoIntentoEl)}` : ''}`, clase: 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800' },
    constancia_descargada: { texto: 'Bajada · en Outbox', clase: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800' },
    enviada_a_firmar: { texto: 'Enviada a firmar', clase: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800' },
    firmada: { texto: 'Firmada', clase: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800' },
    archivada: doc?.firmada
      ? { texto: 'Firmada · archivada', clase: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800' }
      : { texto: 'Archivada · No firmar', clase: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600' },
    baja_mismo_dia_ok: { texto: 'Archivada · No firmar', clase: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600' },
    requiere_revision: { texto: doc && /no ubicado/i.test(ciclo.motivoRevision || '') ? 'Documento no ubicado' : 'Requiere revisión', clase: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800' },
  };
  const x = v[ciclo.estado] || { texto: ciclo.estado, clase: 'bg-gray-100 text-gray-700 border-gray-300' };
  const chip = <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-semibold whitespace-nowrap ${x.clase}`}>{x.texto}</span>;
  const abrible = !!doc?.path && ciclo.estado !== 'requiere_revision';
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      {abrible ? (
        <a href={linkAlDocumento(doc!)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={`Abrir en Documentos: ${doc!.path}`} className="hover:opacity-80">
          {chip}
        </a>
      ) : (
        chip
      )}
      {doc?.etiquetaCarpeta && abrible && <span className="text-[10px] text-gray-500 dark:text-gray-400">{doc.etiquetaCarpeta}{doc.codigo ? ` · ${doc.codigo}` : ''}</span>}
    </span>
  );
};

const TEXTO_INTENTO: Record<string, string> = { descargada: 'Bajada', rechazada: 'No coincidía con el contrato', sin_constancia: 'ARCA no la entregó', ambigua: 'Relaciones distintas en ARCA', error: 'Falló la descarga' };

/** «ver detalle»: los intentos de bajar la constancia, dónde está el documento, y lo de la presentación. */
const DetalleDeConstancia: React.FC<{ ciclo: ConstanciaArcaEnPantalla }> = ({ ciclo }) => (
  <div className="mb-3 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2 text-[11px] space-y-1">
    <p className="font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Constancia</p>
    {ciclo.documento ? (
      <p>
        <span className="text-gray-500">Documento:</span> <span className="font-mono">{ciclo.documento.nombre || ciclo.documento.codigo}</span>
        {ciclo.documento.path && <span className="block text-gray-500">Último lugar conocido: {ciclo.documento.path}</span>}
      </p>
    ) : (
      <p className="text-gray-500">Todavía no se bajó.</p>
    )}
    {ciclo.tipoConstancia === 'baja' && <p className="text-gray-600 dark:text-gray-300">ARCA la entregó como constancia de baja: la relación ya había terminado{ciclo.mismoDia ? ' (alta y baja el mismo día)' : ''}. Es la constancia válida de esa relación.</p>}
    {ciclo.intentos.length > 0 && (
      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {ciclo.intentos.map((i, n) => (
          <li key={n} className="py-0.5 flex flex-wrap gap-x-2">
            <span className="text-gray-500 whitespace-nowrap">{fmtFecha(i.fecha)}</span>
            <span className={i.resultado === 'descargada' ? 'text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}>{TEXTO_INTENTO[i.resultado] || i.resultado}{i.manual ? ' (a mano)' : ''}</span>
            {i.detalle && <span className="text-gray-500">{i.detalle}</span>}
          </li>
        ))}
      </ul>
    )}
  </div>
);

export const HistorialAltasArca: React.FC<Props> = ({ isOpen, onClose, empresaId }) => {
  const [corridas, setCorridas] = useState<CorridaAltasGuardada[] | null>(null);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  // Los contadores de arriba filtran (uno a la vez); «Pruebas en seco» se suma aparte (07/11/2026: reemplaza al checkbox).
  const [filtro, setFiltro] = useState<FiltroRegistro | null>(null);
  const [verSeco, setVerSeco] = useState(false);
  const [gruposAbiertos, setGruposAbiertos] = useState<Set<GrupoRegistro>>(new Set(['revision']));
  const [abierta, setAbierta] = useState<string | null>(null);

  /*
    DESCARGAR LAS ALTAS TEMPRANAS: baja de ARCA la constancia de cada alta ya presentada de la
    empleadora y la manda a donde va (Outbox si el tipo de contrato la firma; si no, «Alta temprana
    de Arca / No firmar»). Corre en el servidor; acá se mira por polling, como las otras corridas.
  */
  const [constancias, setConstancias] = useState<EstadoConstanciasAlta | null>(null);
  const [errorConstancias, setErrorConstancias] = useState('');
  const [arrancando, setArrancando] = useState(false);
  const reloj = useRef<number | null>(null);
  // La descarga se vio corriendo desde este modal: el aviso de cierre es de ESA descarga, no de una vieja.
  const vistaCorriendo = useRef(false);
  const mirar = useCallback(async () => {
    try {
      const r = await projectsAPI.estadoConstanciasAlta(empresaId);
      setConstancias(r);
      if (r.corriendo) vistaCorriendo.current = true;
      if (!r.corriendo && reloj.current) {
        window.clearInterval(reloj.current);
        reloj.current = null;
      }
      if (!r.corriendo && vistaCorriendo.current) {
        vistaCorriendo.current = false;
        avisarCierreDeDescarga(r.eventos || []);
      }
      return r;
    } catch {
      return null;
    }
  }, [empresaId]);
  const seguir = useCallback(() => {
    if (reloj.current) window.clearInterval(reloj.current);
    reloj.current = window.setInterval(mirar, 2000);
  }, [mirar]);
  useEffect(() => {
    if (!isOpen) return;
    mirar().then((r) => r?.corriendo && seguir());
    return () => {
      if (reloj.current) window.clearInterval(reloj.current);
      reloj.current = null;
    };
  }, [isOpen, mirar, seguir]);
  const descargar = async () => {
    if (!empresaId) return;
    setArrancando(true);
    setErrorConstancias('');
    try {
      await projectsAPI.descargarConstanciasAlta(empresaId);
      vistaCorriendo.current = true; // por si termina antes del primer tick
      await mirar();
      seguir();
    } catch (e: any) {
      setErrorConstancias(e?.response?.data?.error || 'No se pudo arrancar la descarga.');
    } finally {
      setArrancando(false);
    }
  };
  // El último estado de cada persona de la descarga en curso (o de la última).
  const personasConstancia = useMemo(() => {
    const porCuil = new Map<string, Record<string, any>>();
    for (const e of constancias?.eventos || []) if (e.tipo === 'persona') porCuil.set(e.cuil, e);
    return [...porCuil.values()];
  }, [constancias]);
  const falloConstancias = (constancias?.eventos || []).find((e) => e.tipo === 'fallo');

  // Se vuelve a leer cuando termina una descarga: la columna «Constancia» sale del contrato.
  const descargando = !!constancias?.corriendo;
  useEffect(() => {
    if (!isOpen || descargando) return;
    setError('');
    projectsAPI
      .historialAltasArca(empresaId)
      .then(setCorridas)
      // 404 = el servidor que contesta es anterior a este registro (falta actualizarlo y reiniciarlo):
      // un «Not Found» pelado no le dice eso a nadie.
      .catch((e: any) => setError(e?.response?.status === 404 ? 'El servidor todavía no tiene el registro de altas: hay que actualizarlo (git pull) y reiniciarlo. Las corridas ya están guardadas y van a aparecer acá.' : e?.response?.data?.error || 'No se pudo leer el registro de altas.'));
  }, [isOpen, empresaId, descargando]);

  /*
    EL BUSCADOR: por nombre (cada palabra, en cualquier orden y sin acentos: «ramirez lucas»), por CUIL
    (con o sin guiones, también un pedazo), por empleadora o por código de archivo («ID-000663»).
  */
  const todos = useMemo(() => agruparPorPersona(filasDelHistorial(corridas || [])).map((g) => ({ g, grupo: grupoDe(g), mismoDia: esMismoDia(g) })), [corridas]);
  const coincide = useCallback((g: Grupo) => {
    const q = normalizar(buscar.trim());
    if (!q) return true;
    const f = g.principal;
    const palabras = q.split(/\s+/).filter(Boolean);
    const digitos = q.replace(/\D/g, '');
    if (palabras.every((p) => normalizar(f.nombre).includes(p))) return true;
    if (digitos.length >= 3 && digitos.length === q.replace(/[\s-]/g, '').length && f.cuil.includes(digitos)) return true;
    const codigo = cicloDe(g)?.documento?.codigo || '';
    if (codigo && normalizar(codigo).includes(q.replace(/^id-?/, 'id-'))) return true;
    return normalizar(f.empresa).includes(q);
  }, [buscar]);
  const visibles = useMemo(() => todos.filter((x) => coincide(x.g)), [todos, coincide]);
  // Los contadores cuentan lo que coincide con la búsqueda, sin el filtro de grupo (si no, al elegir uno los demás quedarían en cero).
  const cuenta = useMemo(() => {
    const c: Record<string, number> = {};
    for (const x of visibles) {
      c[x.grupo] = (c[x.grupo] || 0) + 1;
      if (x.mismoDia && x.grupo !== 'no_presentadas' && x.grupo !== 'seco') c.mismo_dia = (c.mismo_dia || 0) + 1;
    }
    return c;
  }, [visibles]);
  const filtrados = useMemo(
    () =>
      visibles.filter((x) => {
        if (filtro === 'mismo_dia') return x.mismoDia && x.grupo !== 'no_presentadas' && x.grupo !== 'seco';
        if (filtro) return x.grupo === filtro;
        return x.grupo !== 'seco' || verSeco;
      }),
    [visibles, filtro, verSeco],
  );
  const porGrupo = useMemo(() => {
    const m = new Map<GrupoRegistro, Grupo[]>();
    for (const x of filtrados) m.set(x.grupo, [...(m.get(x.grupo) || []), x.g]);
    return ORDEN_GRUPOS.filter((k) => m.has(k)).map((k) => ({ clave: k, grupos: m.get(k)! }));
  }, [filtrados]);
  // El CSV sigue llevando cada intento, no sólo el que se muestra.
  const filas = useMemo(() => filtrados.flatMap((x) => x.g.intentos), [filtrados]);
  // Qué intento se ve en el detalle de la fila abierta (por defecto, el que muestra la fila).
  const [intentoSel, setIntentoSel] = useState<string | null>(null);
  // Con una búsqueda o un filtro, se abren los grupos que tienen algo: es lo que se vino a ver.
  const abierto = (k: GrupoRegistro) => !!buscar.trim() || !!filtro || gruposAbiertos.has(k);
  const alternarGrupo = (k: GrupoRegistro) =>
    setGruposAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(k)) s.delete(k);
      else s.add(k);
      return s;
    });

  /*
    LA BÚSQUEDA GLOBAL (07/11/2026): además de este registro (las últimas 200 corridas), las constancias
    de todas las empleadoras y los documentos de TODAS las carpetas de Dropbox. Con una pausa, para no
    preguntar con cada tecla.
  */
  const [global, setGlobal] = useState<{ q: string; registros: ConstanciaArcaEnPantalla[]; documentos: Array<{ nombre: string; path: string; carpeta: string }> } | null>(null);
  const [buscandoGlobal, setBuscandoGlobal] = useState(false);
  useEffect(() => {
    const q = buscar.trim();
    if (!isOpen || q.length < 3) {
      setGlobal(null);
      return;
    }
    setBuscandoGlobal(true);
    const t = window.setTimeout(() => {
      projectsAPI
        .buscarConstanciasArca(q)
        .then((r) => setGlobal({ q, ...r }))
        .catch(() => setGlobal({ q, registros: [], documentos: [] }))
        .finally(() => setBuscandoGlobal(false));
    }, 400);
    return () => window.clearTimeout(t);
  }, [buscar, isOpen]);
  // Las constancias que encontró el servidor y que no están en lo que se ve acá (corridas más viejas, otra empleadora).
  const fueraDelRegistro = useMemo(() => {
    if (!global) return [];
    const aca = new Set(todos.map((x) => `${x.g.principal.cuil}|${x.g.principal.contrato?.alta || ''}`));
    return global.registros.filter((k) => !aca.has(`${k.cuil}|${k.fechaAlta}`));
  }, [global, todos]);

  const [reintentando, setReintentando] = useState<string | null>(null);
  const reintentar = async (ciclo: ConstanciaArcaEnPantalla) => {
    setReintentando(ciclo.clave);
    try {
      await projectsAPI.forzarDescargasArca([{ userProjectId: ciclo.userProjectId, contractIndex: ciclo.contractIndex }]);
      sweetAlert.info('Reintentando', `Se está pidiendo de nuevo la constancia de ${ciclo.nombre}. El resultado aparece acá cuando termine.`, 3500);
      await mirar();
      seguir();
    } catch (e: any) {
      sweetAlert.error('No se pudo reintentar', e?.response?.data?.error || e?.message || '');
    } finally {
      setReintentando(null);
    }
  };

  const bajar = () => {
    const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [['Fecha', 'Empleadora', 'Presentó', 'Tanda', 'CUIL', 'Nombre', 'Contrato', 'Resultado', 'Constancia', 'Documento', 'C.A.T.', 'Motivo', 'Registro enviado']].concat(
      filas.map((f) => [fmtFecha(f.fecha), f.empresa, f.usuario, f.tanda ? String(f.tanda) : '', f.cuil, f.nombre, f.contrato ? `${fechaCortaIso(f.contrato.alta)} → ${f.contrato.baja ? fechaCortaIso(f.contrato.baja) : 'indeterminado'}` : '', vista(f.resultado).texto, f.ciclo ? f.ciclo.estado : f.constancia ? DESTINO[f.constancia.destino]?.texto || f.constancia.destino : '', f.ciclo?.documento?.codigo || '', f.constancia?.clave || f.cat || '', f.ciclo?.motivoRevision || f.motivo || '', f.registro || '']),
    );
    // Con BOM: sin él Excel abre los acentos rotos.
    const url = URL.createObjectURL(new Blob(['﻿' + lineas.map((l) => l.map(celda).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `altas-masivas-arca-registro.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /** Una persona: lo que hace falta de un vistazo, y el resto detrás de «ver detalle». */
  const renderPersona = (g: Grupo, grupo: GrupoRegistro) => {
    const f = g.principal;
    const ciclo = cicloDe(g);
    const v = vista(f.resultado);
    const det = g.intentos.find((i) => i.clave === intentoSel) || f;
    const abiertaEsta = abierta === g.clave;
    // El motivo en castellano: el de la revisión, o el de ARCA si no se presentó. Lo demás va en el detalle.
    const motivo = grupo === 'revision' ? ciclo?.motivoRevision : grupo === 'no_presentadas' ? f.motivo : grupo === 'pendientes' && ciclo?.estado === 'constancia_pendiente' ? ciclo.intentos.slice(-1)[0]?.detalle : '';
    return (
      <li key={g.clave} className="py-2">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
          <div className="min-w-[200px] flex-1">
            <p className="font-semibold text-gray-900 dark:text-gray-100">{f.nombre}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              <span className="font-mono">{fmtCuit(f.cuil)}</span> · {f.empresa}
            </p>
          </div>
          <div className="text-[11px] text-gray-600 dark:text-gray-400 whitespace-nowrap">
            {f.contrato ? `${fechaCortaIso(f.contrato.alta)} → ${f.contrato.baja ? fechaCortaIso(f.contrato.baja) : 'indeterminado'}` : '—'}
            {esMismoDia(g) && <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-300 text-[10px] font-semibold">alta + baja mismo día</span>}
          </div>
          <div className="min-w-[150px]">{grupo === 'no_presentadas' || grupo === 'seco' ? <span className={`text-[11px] ${v.clase}`}><FontAwesomeIcon icon={v.icon} className="h-3 w-3 mr-1" />{v.texto}</span> : <ChipConstancia ciclo={ciclo} constanciaVieja={f.constancia} />}</div>
          <div className="flex items-center gap-2 ml-auto">
            {grupo === 'revision' && ciclo && !ciclo.documento && (
              <button type="button" onClick={() => void reintentar(ciclo)} disabled={reintentando === ciclo.clave || !!constancias?.corriendo} className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                <FontAwesomeIcon icon={reintentando === ciclo.clave ? faSpinner : faRotateRight} spin={reintentando === ciclo.clave} className="h-3 w-3" />
                Reintentar
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAbierta(abiertaEsta ? null : g.clave);
                setIntentoSel(null);
              }}
              className="text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400 whitespace-nowrap"
            >
              {abiertaEsta ? 'ocultar detalle' : 'ver detalle'}
            </button>
          </div>
        </div>
        {motivo && <p className="mt-1 text-[11px] text-gray-700 dark:text-gray-300">{motivo}</p>}
        {abiertaEsta && (
          <div className="mt-2 rounded bg-gray-50 dark:bg-gray-900/40 p-2">
            {ciclo && <DetalleDeConstancia ciclo={ciclo} />}
            <p className="font-bold uppercase tracking-wider text-[10px] text-gray-500 dark:text-gray-400 mb-1">Presentación en ARCA · {f.usuario || '—'}{f.tanda ? ` · tanda ${f.tanda}` : ''}{f.cat ? ` · C.A.T. ${f.cat}` : ''}</p>
            {g.intentos.length > 1 && (
              <ul className="mb-2 divide-y divide-gray-100 dark:divide-gray-800 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                {g.intentos.map((i) => {
                  const vi = vista(i.resultado);
                  return (
                    <li key={i.clave}>
                      <button type="button" onClick={() => setIntentoSel(i.clave)} className={`w-full text-left px-2 py-1 flex flex-wrap items-baseline gap-x-2 text-[11px] hover:bg-gray-50 dark:hover:bg-gray-800 ${i.clave === det.clave ? 'bg-blue-50/70 dark:bg-blue-900/20' : ''}`}>
                        <span className="whitespace-nowrap text-gray-600 dark:text-gray-400">{fmtFecha(i.fecha)}</span>
                        <span className="whitespace-nowrap">
                          <FontAwesomeIcon icon={vi.icon} className={`h-3 w-3 mr-1 ${vi.clase}`} />
                          {vi.texto}
                          {i.tanda ? ` · tanda ${i.tanda}` : ''}
                        </span>
                        {i.motivo && <span className="text-gray-600 dark:text-gray-400">{i.motivo}</span>}
                        <span className="ml-auto whitespace-nowrap text-gray-500 dark:text-gray-400">{i.usuario || '—'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {det.registro ? (
              <details>
                <summary className="cursor-pointer text-[11px] text-gray-600 dark:text-gray-400">El registro que se mandó a ARCA, campo por campo</summary>
                <pre className="mt-1 font-mono text-[11px] p-2 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-x-auto whitespace-pre">{det.registro}</pre>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6 text-[11px]">
                  {detalleDeLoPresentado(det.registro).map((c) => (
                    <p key={c.posiciones} className="flex justify-between gap-2 py-0.5 border-b border-gray-100 dark:border-gray-800">
                      <span className="text-gray-600 dark:text-gray-400">{c.nombre}</span>
                      <span className="font-mono text-gray-900 dark:text-gray-100 whitespace-pre">
                        {c.valor}
                        {c.legible ? <span className="font-sans text-gray-500 dark:text-gray-400"> · {c.legible}</span> : null}
                      </span>
                    </p>
                  ))}
                </div>
              </details>
            ) : (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Esta corrida es anterior a que se guardara el registro enviado: queda el resultado, no el detalle.</p>
            )}
            <RespuestaDeArca key={det.clave} f={det} />
          </div>
        )}
      </li>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Registro de Altas Masivas en ARCA" size="95" zIndex={80}>
      <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
        {/* ── Descargar altas tempranas ── */}
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {!empresaId
                ? 'Para bajar las constancias de alta, abrí este registro desde la pestaña de UNA empresa.'
                : constancias?.corriendo
                  ? 'Bajando de ARCA las constancias de alta…'
                  : `${constancias?.pendientes ?? '…'} alta(s) presentada(s) esperan su constancia. Se bajan de ARCA, se validan contra el contrato y van al Outbox (si el tipo de contrato la firma) o a «Alta temprana de Arca / No firmar».`}
            </p>
            <button
              type="button"
              onClick={descargar}
              disabled={!empresaId || arrancando || !!constancias?.corriendo || !constancias?.pendientes}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={arrancando || constancias?.corriendo ? faSpinner : faDownload} spin={arrancando || !!constancias?.corriendo} className="h-3 w-3" />
              Descargar altas tempranas
            </button>
          </div>
          {errorConstancias && <p className="text-xs text-red-700 dark:text-red-400">{errorConstancias}</p>}
          {falloConstancias && <p className="text-xs text-red-700 dark:text-red-400">La descarga se cortó: {falloConstancias.mensaje}</p>}
          {personasConstancia.length > 0 && (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-xs max-h-48 overflow-y-auto">
              {personasConstancia.map((p) => {
                const bien = p.estado === 'lista';
                const enCurso = p.estado === 'descargando';
                // Rojo sólo para un error de verdad; lo que espera su reintento o va a revisión, en ámbar.
                const tono = enCurso ? 'text-blue-500' : bien ? 'text-green-600 dark:text-green-400' : p.estado === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400';
                return (
                  <li key={p.cuil} className="py-1 flex items-start gap-2">
                    <FontAwesomeIcon icon={enCurso ? faSpinner : bien ? faCircleCheck : p.estado === 'error' ? faCircleXmark : faCircleQuestion} spin={enCurso} className={`h-3 w-3 mt-0.5 shrink-0 ${tono}`} />
                    <span className="font-semibold text-gray-900 dark:text-gray-100 shrink-0">{p.nombre}</span>
                    <span className="text-gray-600 dark:text-gray-400">{enCurso ? 'bajando…' : p.detalle}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Los contadores: cada uno es un filtro ── */}
        {corridas && (
          <div className="flex flex-wrap items-center gap-2">
            {CONTADORES.map((c) => {
              const activo = filtro === c.filtro;
              const n = cuenta[c.filtro] || 0;
              return (
                <button
                  key={c.filtro}
                  type="button"
                  onClick={() => setFiltro(activo ? null : c.filtro)}
                  disabled={n === 0 && !activo}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors disabled:opacity-40 ${activo ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                  {c.texto}
                  <span className={`px-1.5 rounded-full text-[11px] ${activo ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700'}`}>{n}</span>
                </button>
              );
            })}
            {filtro && (
              <button type="button" onClick={() => setFiltro(null)} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                Ver todas
              </button>
            )}
            <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />
            <button
              type="button"
              onClick={() => setVerSeco((x) => !x)}
              disabled={!cuenta.seco}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold disabled:opacity-40 ${verSeco ? 'bg-gray-700 border-gray-700 text-white' : 'border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
              title="Las corridas de prueba: no presentaron nada en ARCA"
            >
              <FontAwesomeIcon icon={faFlask} className="h-3 w-3" />
              Pruebas en seco <span className="text-[11px]">{cuenta.seco || 0}</span>
            </button>
          </div>
        )}

        {/* El buscador, pegado a los grupos: es lo que se viene a hacer acá. */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px]">
            <FontAwesomeIcon icon={buscandoGlobal ? faSpinner : faMagnifyingGlass} spin={buscandoGlobal} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por persona, CUIL o código de archivo (ID-000663), en el registro y en todas las carpetas…" className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm" />
          </div>
          <button type="button" onClick={bajar} disabled={filas.length === 0} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40">
            <FontAwesomeIcon icon={faDownload} className="h-3 w-3" />
            Bajar
          </button>
        </div>

        {error && <p className="text-xs text-red-700 dark:text-red-400">{error}</p>}
        {!corridas && !error && (
          <p className="text-xs text-gray-500">
            <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5" />
            Leyendo el registro…
          </p>
        )}
        {corridas && porGrupo.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">No hay altas{buscar ? ' que coincidan con la búsqueda' : filtro ? ' en ese grupo' : ''}.</p>}

        {/* ── Los grupos ── */}
        {porGrupo.map(({ clave, grupos }) => {
          const def = GRUPOS[clave];
          const ab = abierto(clave);
          return (
            <section key={clave} className={`rounded-lg border ${def.tono}`}>
              <button type="button" onClick={() => alternarGrupo(clave)} className="w-full flex items-start gap-3 px-3 py-2 text-left">
                <FontAwesomeIcon icon={def.icon} className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="flex-1">
                  <span className="font-bold">{def.titulo}</span> <span className="font-semibold opacity-80">({grupos.length})</span>
                  <span className="block text-[11px] font-normal opacity-90">{def.explicacion}</span>
                </span>
                <FontAwesomeIcon icon={ab ? faChevronUp : faChevronDown} className="h-3 w-3 mt-1 opacity-70" />
              </button>
              {ab && <ul className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900 rounded-b-lg px-3 text-xs">{grupos.map((g) => renderPersona(g, clave))}</ul>}
            </section>
          );
        })}

        {/* ── La búsqueda global: lo que no está en este registro, y los documentos de todas las carpetas ── */}
        {global && (fueraDelRegistro.length > 0 || global.documentos.length > 0) && (
          <section className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 space-y-2 text-xs">
            {fueraDelRegistro.length > 0 && (
              <div>
                <p className="font-bold text-gray-700 dark:text-gray-200">Otras constancias con «{global.q}» (fuera de las corridas de esta vista)</p>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {fueraDelRegistro.map((k) => (
                    <li key={k.clave} className="py-1 flex flex-wrap items-center gap-x-3">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">{k.nombre}</span>
                      <span className="font-mono text-gray-500">{fmtCuit(k.cuil)}</span>
                      <span className="text-gray-500">{k.empresaRazonSocial} · {fechaCortaIso(k.fechaAlta)}</span>
                      <ChipConstancia ciclo={k} />
                      {k.motivoRevision && <span className="text-gray-600 dark:text-gray-300">{k.motivoRevision}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {global.documentos.length > 0 && (
              <div>
                <p className="font-bold text-gray-700 dark:text-gray-200">Documentos con «{global.q}» en Dropbox ({global.documentos.length})</p>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {global.documentos.map((d) => (
                    <li key={d.path} className="py-1 flex flex-wrap items-center gap-x-3">
                      <a href={`/documents?carpeta=${encodeURIComponent(d.carpeta)}&buscar=${encodeURIComponent(/ID-\d+/.exec(d.nombre)?.[0] || d.nombre)}`} target="_blank" rel="noopener noreferrer" className="font-mono text-blue-600 hover:underline dark:text-blue-400 break-all">
                        {d.nombre}
                      </a>
                      <span className="text-gray-500">{d.carpeta}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
        {global && fueraDelRegistro.length === 0 && global.documentos.length === 0 && visibles.length === 0 && <p className="text-xs text-gray-500">Tampoco hay documentos con «{global.q}» en ninguna carpeta de Dropbox.</p>}

        <p className="text-[11px] text-gray-500 dark:text-gray-400">Últimas 200 corridas, una persona por contrato. El estado de la constancia es el de hoy: sale de dónde está el documento (Outbox, Pendbox, firmados, archivo) y se recalcula en cada escaneo de Dropbox. Click en el estado para abrir el documento.</p>
      </div>
    </Modal>
  );
};

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleXmark, faCircleQuestion, faCircle, faSpinner, faDownload } from '@fortawesome/free-solid-svg-icons';
import { Modal } from '../ui/Modal';
import { projectsAPI, CorridaAltasGuardada, EstadoConstanciasAlta } from '../../api/projects';
import { detalleDeLoPresentado } from './progresoTandas';

/**
 * EL REGISTRO DE LO PRESENTADO EN ARCA POR ALTAS MASIVAS (URGENTE): una fila por persona y corrida.
 *
 * Sale de `arca_altas_logs`, que es donde el servidor deja cada corrida —quién la lanzó, cuándo, en
 * qué tanda fue cada persona y qué contestó ARCA—. El modal de la corrida solo muestra la última y
 * mientras el servidor la recuerda; esto es lo que queda.
 *
 * Por defecto NO muestra las pruebas en seco ni lo que quedó sin presentar: la pregunta que se viene
 * a contestar acá es «qué se subió», y eso es lo registrado, lo rechazado y lo incierto.
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
    })),
  );
}

export const HistorialAltasArca: React.FC<Props> = ({ isOpen, onClose, empresaId }) => {
  const [corridas, setCorridas] = useState<CorridaAltasGuardada[] | null>(null);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [todo, setTodo] = useState(false);
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
  const mirar = useCallback(async () => {
    try {
      const r = await projectsAPI.estadoConstanciasAlta(empresaId);
      setConstancias(r);
      if (!r.corriendo && reloj.current) {
        window.clearInterval(reloj.current);
        reloj.current = null;
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

  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filasDelHistorial(corridas || [])
      .filter((f) => todo || (!f.enSeco && f.resultado !== 'pendiente' && f.resultado !== 'seco'))
      .filter((f) => !q || f.nombre.toLowerCase().includes(q) || f.cuil.includes(q.replace(/\D/g, '') || '§') || f.empresa.toLowerCase().includes(q));
  }, [corridas, buscar, todo]);

  const bajar = () => {
    const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [['Fecha', 'Empleadora', 'Presentó', 'Tanda', 'CUIL', 'Nombre', 'Resultado', 'Constancia', 'C.A.T.', 'Motivo', 'Registro enviado']].concat(
      filas.map((f) => [fmtFecha(f.fecha), f.empresa, f.usuario, f.tanda ? String(f.tanda) : '', f.cuil, f.nombre, vista(f.resultado).texto, f.constancia ? DESTINO[f.constancia.destino]?.texto || f.constancia.destino : '', f.constancia?.clave || f.cat || '', f.motivo || '', f.registro || '']),
    );
    // Con BOM: sin él Excel abre los acentos rotos.
    const url = URL.createObjectURL(new Blob(['﻿' + lineas.map((l) => l.map(celda).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `altas-masivas-arca-registro.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Registro de Altas Masivas en ARCA (URGENTE)" size="xl" zIndex={80}>
      <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
        <div className="flex flex-wrap items-center gap-3">
          <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre, CUIL o empleadora…" className="flex-1 min-w-[220px] px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm" />
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
            <input type="checkbox" checked={todo} onChange={(e) => setTodo(e.target.checked)} />
            Mostrar también pruebas en seco y lo que no se presentó
          </label>
          <button type="button" onClick={bajar} disabled={filas.length === 0} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            <FontAwesomeIcon icon={faDownload} className="h-3 w-3" />
            Bajar
          </button>
        </div>

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
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 text-xs">
              {personasConstancia.map((p) => {
                const bien = p.estado === 'lista';
                const enCurso = p.estado === 'descargando';
                return (
                  <li key={p.cuil} className="py-1 flex items-start gap-2">
                    <FontAwesomeIcon icon={enCurso ? faSpinner : bien ? faCircleCheck : p.estado === 'sin_constancia' ? faCircleQuestion : faCircleXmark} spin={enCurso} className={`h-3 w-3 mt-0.5 shrink-0 ${enCurso ? 'text-blue-500' : bien ? 'text-green-600 dark:text-green-400' : p.estado === 'sin_constancia' ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`} />
                    <span className="font-semibold text-gray-900 dark:text-gray-100 shrink-0">{p.nombre}</span>
                    <span className={bien || enCurso ? 'text-gray-600 dark:text-gray-400' : 'text-red-700 dark:text-red-400'}>{enCurso ? 'bajando…' : p.detalle}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && <p className="text-xs text-red-700 dark:text-red-400">{error}</p>}
        {!corridas && !error && (
          <p className="text-xs text-gray-500">
            <FontAwesomeIcon icon={faSpinner} spin className="mr-1.5" />
            Leyendo el registro…
          </p>
        )}
        {corridas && filas.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-400">No hay altas presentadas{buscar ? ' que coincidan con la búsqueda' : ''}.</p>}

        {filas.length > 0 && (
          <div className="max-h-[60vh] overflow-auto border border-gray-200 dark:border-gray-700 rounded-lg">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-left">Persona</th>
                  <th className="px-3 py-2 text-left">CUIL</th>
                  <th className="px-3 py-2 text-left">Empleadora</th>
                  <th className="px-3 py-2 text-left">Resultado</th>
                  <th className="px-3 py-2 text-left">Constancia</th>
                  <th className="px-3 py-2 text-left">Presentó</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filas.map((f) => {
                  const v = vista(f.resultado);
                  return (
                    <React.Fragment key={f.clave}>
                      <tr onClick={() => setAbierta(abierta === f.clave ? null : f.clave)} title="Ver el registro que se mandó a ARCA" className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60">
                        <td className="px-3 py-1.5 whitespace-nowrap text-gray-600 dark:text-gray-400">{fmtFecha(f.fecha)}</td>
                        <td className="px-3 py-1.5 font-semibold text-gray-900 dark:text-gray-100">{f.nombre}</td>
                        <td className="px-3 py-1.5 font-mono">{fmtCuit(f.cuil)}</td>
                        <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{f.empresa}</td>
                        <td className="px-3 py-1.5">
                          <FontAwesomeIcon icon={v.icon} className={`h-3 w-3 mr-1.5 ${v.clase}`} />
                          {v.texto}
                          {f.enSeco && f.resultado !== 'seco' ? ' (en seco)' : ''}
                          {f.tanda ? ` · tanda ${f.tanda}` : ''}
                          {f.cat ? ` · C.A.T. ${f.cat}` : ''}
                          {f.porConsulta ? ' · por consulta' : ''}
                          {f.motivo && <span className="block text-[11px] text-red-700 dark:text-red-400">{f.motivo}</span>}
                        </td>
                        <td className="px-3 py-1.5">
                          {f.constancia ? (
                            <span title={f.constancia.archivadaEn || 'La constancia quedó cargada en el contrato, pero no se pudo subir a Dropbox.'} className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap ${DESTINO[f.constancia.destino]?.clase || ''}`}>
                              {DESTINO[f.constancia.destino]?.texto || f.constancia.destino}
                            </span>
                          ) : f.resultado === 'presentada' && !f.enSeco ? (
                            <span className="text-[11px] text-amber-700 dark:text-amber-400">Falta bajarla</span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{f.usuario || '—'}</td>
                      </tr>
                      {abierta === f.clave && (
                        <tr>
                          <td colSpan={7} className="px-3 py-2 bg-gray-50 dark:bg-gray-900/40">
                            {f.registro ? (
                              <>
                                <pre className="font-mono text-[11px] p-2 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-x-auto whitespace-pre">{f.registro}</pre>
                                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-x-6">
                                  {detalleDeLoPresentado(f.registro).map((c) => (
                                    <p key={c.posiciones} className="flex justify-between gap-2 py-0.5 border-b border-gray-100 dark:border-gray-800">
                                      <span className="text-gray-600 dark:text-gray-400">{c.nombre}</span>
                                      <span className="font-mono text-gray-900 dark:text-gray-100 whitespace-pre">
                                        {c.valor}
                                        {c.legible ? <span className="font-sans text-gray-500 dark:text-gray-400"> · {c.legible}</span> : null}
                                      </span>
                                    </p>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <p className="text-gray-500 dark:text-gray-400">Esta corrida es anterior a que se guardara el registro enviado: queda el resultado, no el detalle.</p>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Últimas 200 corridas. Click en una fila para ver el registro que se le mandó a ARCA, campo por campo.</p>
      </div>
    </Modal>
  );
};

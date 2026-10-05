import React, { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleCheck, faCircleXmark, faCircleQuestion, faCircle, faSpinner, faDownload } from '@fortawesome/free-solid-svg-icons';
import { Modal } from '../ui/Modal';
import { projectsAPI, CorridaAltasGuardada } from '../../api/projects';
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
}

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
    })),
  );
}

export const HistorialAltasArca: React.FC<Props> = ({ isOpen, onClose, empresaId }) => {
  const [corridas, setCorridas] = useState<CorridaAltasGuardada[] | null>(null);
  const [error, setError] = useState('');
  const [buscar, setBuscar] = useState('');
  const [todo, setTodo] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setCorridas(null);
    setError('');
    projectsAPI
      .historialAltasArca(empresaId)
      .then(setCorridas)
      // 404 = el servidor que contesta es anterior a este registro (falta actualizarlo y reiniciarlo):
      // un «Not Found» pelado no le dice eso a nadie.
      .catch((e: any) => setError(e?.response?.status === 404 ? 'El servidor todavía no tiene el registro de altas: hay que actualizarlo (git pull) y reiniciarlo. Las corridas ya están guardadas y van a aparecer acá.' : e?.response?.data?.error || 'No se pudo leer el registro de altas.'));
  }, [isOpen, empresaId]);

  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filasDelHistorial(corridas || [])
      .filter((f) => todo || (!f.enSeco && f.resultado !== 'pendiente' && f.resultado !== 'seco'))
      .filter((f) => !q || f.nombre.toLowerCase().includes(q) || f.cuil.includes(q.replace(/\D/g, '') || '§') || f.empresa.toLowerCase().includes(q));
  }, [corridas, buscar, todo]);

  const bajar = () => {
    const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lineas = [['Fecha', 'Empleadora', 'Presentó', 'Tanda', 'CUIL', 'Nombre', 'Resultado', 'C.A.T.', 'Motivo', 'Registro enviado']].concat(
      filas.map((f) => [fmtFecha(f.fecha), f.empresa, f.usuario, f.tanda ? String(f.tanda) : '', f.cuil, f.nombre, vista(f.resultado).texto, f.cat || '', f.motivo || '', f.registro || '']),
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
                        <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{f.usuario || '—'}</td>
                      </tr>
                      {abierta === f.clave && (
                        <tr>
                          <td colSpan={6} className="px-3 py-2 bg-gray-50 dark:bg-gray-900/40">
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

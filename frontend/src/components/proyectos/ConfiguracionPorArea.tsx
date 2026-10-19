import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faLayerGroup, faEdit, faTrash, faTable, faLocationDot, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { claveFilaArea, sedeDe } from "@compartido/areaTurno";

/*
  CONFIGURACIÓN POR ÁREA DEL PROYECTO: qué áreas trabajan, en qué turnos y —si hace falta— en qué SEDE
  (pedido del 18/10/2026). Una fila sin sede vale para todas las sedes, que es lo que había siempre.
  Para tener la misma área en dos sedes con un supervisor distinto en cada una, se agrega el área dos
  veces, una por sede:

      Edición · Huidobro   (Mañana, Tarde)
      Edición · Libertador (Mañana)

  No se puede repetir área + sede. Era la misma pantalla copiada en tres lugares (detalle del proyecto,
  Proyectos y Proyectos del cliente); ahora es este componente. Las filas se identifican por posición:
  con el área repetida, el `areaId` ya no alcanza.
*/

export interface FilaArea {
  areaId: string;
  shiftIds: string[];
  /** La sede de la fila (`data.id` del Info «sede»); sin sede = todas las sedes. */
  sedeId?: number | null;
}

interface Props {
  areasConfig: FilaArea[];
  onChange: (next: FilaArea[]) => void;
  areas: Array<{ _id: string; name: string; isSystem?: boolean }>;
  shifts: Array<{ _id: string; name: string; startTime?: string; endTime?: string; days?: number[] }>;
  /** Las sedes del proyecto (las elegidas arriba, en «Sede»). Con una sola no se ofrece elegir. */
  sedes: Array<{ id: number; nombre: string }>;
}

const DIAS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"];

/** Las sedes del proyecto, con su nombre, desde el catálogo de sedes y la `metadata` del formulario. */
export function sedesDelProyectoConNombre(catalogo: Array<{ name?: string; data?: any }>, sedeIds: number[]): Array<{ id: number; nombre: string }> {
  return sedeIds
    .map((id) => {
      const s = catalogo.find((x) => Number(x.data?.id) === Number(id));
      return { id: Number(id), nombre: String(s?.data?.nombre || s?.name || `Sede ${id}`) };
    })
    .filter((s) => s.id > 0);
}

/** El nombre de una sede del catálogo, para mostrar «Edición · Libertador» en las vistas de lectura. Vacío si la fila no tiene sede. */
export const nombreDeSede = (catalogo: Array<{ name?: string; data?: any }>, sedeId: unknown): string => {
  const id = sedeDe(sedeId);
  if (!id) return "";
  const s = catalogo.find((x) => Number(x.data?.id) === id);
  return String(s?.data?.nombre || s?.name || `Sede ${id}`);
};

export const ConfiguracionPorArea: React.FC<Props> = ({ areasConfig, onChange, areas, shifts, sedes }) => {
  const [agregando, setAgregando] = useState(false);
  const [configurando, setConfigurando] = useState<number | null>(null);
  const hayVariasSedes = sedes.length > 1;
  const nombreSede = (id: number | null | undefined) => (id ? sedes.find((s) => s.id === id)?.nombre || `Sede ${id} (fuera del proyecto)` : "Todas las sedes");

  /** Las sedes que una fila puede tomar sin repetir área + sede (null = todas). */
  const sedesLibres = (areaId: string, exceptoIndice: number | null): Array<number | null> => {
    const usadas = new Set(areasConfig.filter((f, i) => f.areaId === areaId && i !== exceptoIndice).map((f) => sedeDe(f.sedeId)));
    return [null, ...sedes.map((s) => s.id)].filter((s) => !usadas.has(s));
  };
  const areasParaAgregar = useMemo(() => areas.filter((a) => sedesLibres(a._id, null).length > 0), [areas, areasConfig, sedes]); // eslint-disable-line react-hooks/exhaustive-deps

  const actualizar = (i: number, cambios: Partial<FilaArea>) => onChange(areasConfig.map((f, j) => (j === i ? { ...f, ...cambios } : f)));

  const agregar = (areaId: string) => {
    const libres = sedesLibres(areaId, null);
    // La primera vez, para todas las sedes (como siempre); si el área ya está, en la primera sede libre.
    const sedeId = libres.includes(null) ? null : libres[0] ?? null;
    onChange([...areasConfig, { areaId, shiftIds: [], sedeId }]);
    setAgregando(false);
    setConfigurando(areasConfig.length);
  };

  const fila = configurando != null ? areasConfig[configurando] : null;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <label className="block text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Configuración por Área</label>
          {hayVariasSedes && <p className="text-[11px] text-gray-500 mt-1">Si un área trabaja en más de una sede con un supervisor distinto en cada una, agregala una vez por sede.</p>}
        </div>
        <button type="button" onClick={() => setAgregando(true)} className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 border border-blue-100 dark:border-blue-800 transition-all shadow-sm">
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
          Agregar Área
        </button>
      </div>

      <div className="space-y-2">
        {areasConfig.length === 0 ? (
          <div className="text-center py-10 bg-gray-50/30 dark:bg-gray-900/10 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl">
            <FontAwesomeIcon icon={faLayerGroup} className="h-8 w-8 text-gray-200 dark:text-gray-700 mb-3" />
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sin Áreas Integradas</p>
          </div>
        ) : (
          areasConfig.map((ac, i) => {
            const area = areas.find((a) => a._id === ac.areaId);
            if (!area) return null;
            const sede = sedeDe(ac.sedeId);
            const sedeFuera = sede != null && !sedes.some((s) => s.id === sede);
            const libres = sedesLibres(ac.areaId, i);
            return (
              <div key={`${claveFilaArea(ac)}-${i}`} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-gray-50/50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-all group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-400 group-hover:text-blue-500 transition-colors shrink-0">
                    <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                      {area.name}
                      {area.isSystem && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/50 uppercase tracking-wider">Sistema</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${ac.shiftIds.length > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"}`}>
                        {ac.shiftIds.length} {ac.shiftIds.length === 1 ? "Turno" : "Turnos"}
                      </span>
                      {/* La sede de la fila: con una sola sede en el proyecto no hay nada que elegir. */}
                      {(hayVariasSedes || sede != null) && (
                        <span className="inline-flex items-center gap-1">
                          <FontAwesomeIcon icon={faLocationDot} className={`h-3 w-3 ${sedeFuera ? "text-red-500" : "text-orange-500"}`} />
                          <select
                            value={sede ?? ""}
                            onChange={(e) => actualizar(i, { sedeId: sedeDe(e.target.value) })}
                            className={`text-[11px] font-semibold rounded-md border px-1.5 py-0.5 bg-white dark:bg-gray-800 ${sedeFuera ? "border-red-400 text-red-600" : "border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200"}`}
                            title="En qué sede trabaja esta área (sin sede = todas)"
                          >
                            {[null, ...sedes.map((s) => s.id)].map((s) => (
                              <option key={s ?? "todas"} value={s ?? ""} disabled={s !== sede && !libres.includes(s)}>
                                {nombreSede(s)}
                              </option>
                            ))}
                            {sedeFuera && <option value={sede!}>{nombreSede(sede)}</option>}
                          </select>
                        </span>
                      )}
                      {sedeFuera && (
                        <span className="text-[10px] text-red-600 inline-flex items-center gap-1">
                          <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" /> La sede ya no es del proyecto
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setConfigurando(i)} className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all" title="Configurar Turnos">
                    <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                  </button>
                  {!area.isSystem && (
                    <button type="button" onClick={() => onChange(areasConfig.filter((_, j) => j !== i))} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all" title="Quitar">
                      <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {agregando && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-6 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">Agregar Nueva Área</h3>
                <p className="text-[10px] text-gray-500 uppercase font-medium">{hayVariasSedes ? "Un área ya agregada se puede sumar otra vez para otra sede" : "Selecciona el área para integrarla"}</p>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Áreas Disponibles</label>
                <select
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all cursor-pointer"
                  value=""
                  autoFocus
                  onChange={(e) => e.target.value && agregar(e.target.value)}
                >
                  <option value="">Seleccionar del sistema...</option>
                  {areasParaAgregar.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
                      {areasConfig.some((f) => f.areaId === a._id) ? " (otra sede)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end pt-2">
                <button type="button" onClick={() => setAgregando(false)} className="px-6 py-2.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors uppercase tracking-widest border border-gray-100 dark:border-gray-800 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {fila && configurando != null && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <FontAwesomeIcon icon={faTable} className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">
                    {areas.find((a) => a._id === fila.areaId)?.name}
                    {(hayVariasSedes || sedeDe(fila.sedeId)) && <span className="ml-2 text-orange-500 normal-case">· {nombreSede(sedeDe(fila.sedeId))}</span>}
                  </h3>
                  <p className="text-[10px] text-gray-500 uppercase font-medium">Habilitar turnos para esta área</p>
                </div>
              </div>
              <button type="button" onClick={() => setConfigurando(null)} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-all flex items-center justify-center">
                <FontAwesomeIcon icon={faPlus} className="h-4 w-4 rotate-45" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3">
              {shifts.map((shift) => {
                const elegido = fila.shiftIds.includes(shift._id);
                return (
                  <div
                    key={shift._id}
                    onClick={() => actualizar(configurando, { shiftIds: elegido ? fila.shiftIds.filter((id) => id !== shift._id) : [...fila.shiftIds, shift._id] })}
                    className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${elegido ? "bg-emerald-50/50 border-emerald-500/30 dark:bg-emerald-900/10" : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600"}`}
                  >
                    <div>
                      <div className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-tight">{shift.name}</div>
                      {(shift.startTime || shift.endTime) && <div className="text-[10px] text-gray-500 font-bold uppercase mt-1 tracking-wider">{shift.startTime} — {shift.endTime} hs</div>}
                      {shift.days && shift.days.length > 0 && (
                        <div className="flex gap-0.5 mt-1.5">
                          {DIAS.map((d, k) => (
                            <span key={k} className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md ${shift.days!.includes(k) ? (elegido ? "bg-emerald-200 text-emerald-800 dark:bg-emerald-800 dark:text-emerald-200" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300") : "bg-gray-100 text-gray-300 dark:bg-gray-800 dark:text-gray-600"}`}>
                              {d}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${elegido ? "bg-emerald-500 border-emerald-500" : "border-gray-200 dark:border-gray-600"}`}>{elegido && <span className="text-white text-xs">✓</span>}</div>
                  </div>
                );
              })}
            </div>
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button type="button" onClick={() => setConfigurando(null)} className="px-6 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-2xl uppercase tracking-widest">
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

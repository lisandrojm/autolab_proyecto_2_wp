import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faLayerGroup, faEdit, faTrash, faTable, faLocationDot, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
import { sedeDe } from "@compartido/areaTurno";

/*
  CONFIGURACIÓN POR ÁREA DEL PROYECTO: qué áreas trabajan, en qué turnos y en qué SEDES (pedido del
  18/10/2026). Cada área es UNA tarjeta con sus sedes como etiquetas:

      Edición   [Huidobro · principal ✕] [La Corte ✕] [+ Sede]

  Cada etiqueta es su propio equipo con su propio supervisor (Supervisores, Jerarquía y la app las
  separan). Por debajo cada etiqueta es una fila de `areasConfig`:

    · La de la sede PRINCIPAL es la fila SIN `sedeId`, la de siempre. Así un proyecto que nunca tocó
      esto no cambia nada, y los supervisores ya cargados (sin sede) siguen en su lugar. Esa fila
      también toma a quien esté en una sede que no tenga etiqueta propia en el área.
    · Cada sede agregada es una fila con su `sedeId`.

  Se puede quitar la principal y dejar sólo otra sede, o tener las dos. No se repite área + sede.
  Los turnos son del área: se eligen una vez y valen para todas sus sedes. Era la misma pantalla
  copiada en tres lugares (detalle del proyecto, Proyectos y Proyectos del cliente); ahora es ésta.
*/

export interface FilaArea {
  areaId: string;
  shiftIds: string[];
  /** La sede de la fila (`data.id` del Info «sede»); sin sede = la principal (y las que no tengan fila propia). */
  sedeId?: number | null;
}

interface Props {
  areasConfig: FilaArea[];
  onChange: (next: FilaArea[]) => void;
  areas: Array<{ _id: string; name: string; isSystem?: boolean }>;
  shifts: Array<{ _id: string; name: string; startTime?: string; endTime?: string; days?: number[] }>;
  /** Las sedes del proyecto (las elegidas arriba, en «Sede»); la primera es la principal. */
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
  /** El área cuyos turnos se están eligiendo (los turnos valen para todas sus sedes). */
  const [configurando, setConfigurando] = useState<string | null>(null);
  const principal = sedes[0] || null;
  const hayVariasSedes = sedes.length > 1;

  /** Las áreas en el orden en que aparecen, cada una con sus filas (una por sede). */
  const tarjetas = useMemo(() => {
    const orden: string[] = [];
    const filas = new Map<string, Array<{ fila: FilaArea; indice: number }>>();
    areasConfig.forEach((fila, indice) => {
      if (!filas.has(fila.areaId)) {
        filas.set(fila.areaId, []);
        orden.push(fila.areaId);
      }
      filas.get(fila.areaId)!.push({ fila, indice });
    });
    return orden.map((areaId) => ({ areaId, filas: filas.get(areaId)! }));
  }, [areasConfig]);

  const etiquetaSede = (sedeId: number | null) => {
    if (sedeId == null) return principal ? `${principal.nombre} · principal` : "Todas las sedes";
    return sedes.find((s) => s.id === sedeId)?.nombre || `Sede ${sedeId}`;
  };

  /**
   * Las sedes que se le pueden sumar a un área: la principal (fila sin sede) si no la tiene, y las
   * demás sedes del proyecto que todavía no tengan etiqueta. La principal no se ofrece con su número:
   * es la fila sin sede, para no tener dos filas que digan lo mismo.
   */
  const sedesParaSumar = (areaId: string): Array<number | null> => {
    const usadas = new Set(areasConfig.filter((f) => f.areaId === areaId).map((f) => sedeDe(f.sedeId)));
    const tienePrincipal = usadas.has(null) || (principal != null && usadas.has(principal.id));
    return [...(tienePrincipal ? [] : [null]), ...sedes.filter((s) => s.id !== principal?.id && !usadas.has(s.id)).map((s) => s.id)];
  };

  const sumarSede = (areaId: string, sedeId: number | null) => {
    // La sede nueva arranca con los turnos que ya tiene el área.
    const turnos = areasConfig.find((f) => f.areaId === areaId)?.shiftIds || [];
    const ultimo = areasConfig.map((f) => f.areaId).lastIndexOf(areaId);
    const next = [...areasConfig];
    next.splice(ultimo + 1, 0, { areaId, shiftIds: [...turnos], ...(sedeId != null ? { sedeId } : { sedeId: null }) });
    onChange(next);
  };

  const quitarFila = (indice: number) => onChange(areasConfig.filter((_, j) => j !== indice));
  const quitarArea = (areaId: string) => onChange(areasConfig.filter((f) => f.areaId !== areaId));

  const agregarArea = (areaId: string) => {
    // Un área nueva va en la sede principal (la fila sin sede, como siempre).
    onChange([...areasConfig, { areaId, shiftIds: [], sedeId: null }]);
    setAgregando(false);
    setConfigurando(areaId);
  };
  const areasParaAgregar = areas.filter((a) => !areasConfig.some((f) => f.areaId === a._id));

  /** Prende o apaga un turno en TODAS las sedes del área. */
  const alternarTurno = (areaId: string, shiftId: string, prender: boolean) =>
    onChange(areasConfig.map((f) => (f.areaId !== areaId ? f : { ...f, shiftIds: prender ? (f.shiftIds.includes(shiftId) ? f.shiftIds : [...f.shiftIds, shiftId]) : f.shiftIds.filter((id) => id !== shiftId) })));

  const filasConfigurando = configurando ? areasConfig.filter((f) => f.areaId === configurando) : [];

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <label className="block text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Configuración por Área</label>
          {hayVariasSedes && <p className="text-[11px] text-gray-500 mt-1">Cada sede de un área es su propio equipo, con su supervisor. Por defecto va la principal; sumá otras sedes con «+ Sede».</p>}
        </div>
        <button type="button" onClick={() => setAgregando(true)} className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 border border-blue-100 dark:border-blue-800 transition-all shadow-sm">
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
          Agregar Área
        </button>
      </div>

      <div className="space-y-2">
        {tarjetas.length === 0 ? (
          <div className="text-center py-10 bg-gray-50/30 dark:bg-gray-900/10 border-2 border-dashed border-gray-100 dark:border-gray-800 rounded-2xl">
            <FontAwesomeIcon icon={faLayerGroup} className="h-8 w-8 text-gray-200 dark:text-gray-700 mb-3" />
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sin Áreas Integradas</p>
          </div>
        ) : (
          tarjetas.map(({ areaId, filas }) => {
            const area = areas.find((a) => a._id === areaId);
            if (!area) return null;
            const turnos = new Set(filas.flatMap(({ fila }) => fila.shiftIds));
            const paraSumar = sedesParaSumar(areaId);
            const conSedes = hayVariasSedes || filas.some(({ fila }) => sedeDe(fila.sedeId) != null);
            return (
              <div key={areaId} className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-gray-50/50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 transition-all group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-400 group-hover:text-blue-500 transition-colors shrink-0">
                    <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                      {area.name}
                      {area.isSystem && <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-orange-500/10 text-orange-500 border border-orange-500/50 uppercase tracking-wider">Sistema</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${turnos.size > 0 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"}`}>
                        {turnos.size} {turnos.size === 1 ? "Turno" : "Turnos"}
                      </span>
                      {/* Las sedes del área: cada una es un equipo con su supervisor. */}
                      {conSedes &&
                        filas.map(({ fila, indice }) => {
                          const sede = sedeDe(fila.sedeId);
                          const fuera = sede != null && !sedes.some((s) => s.id === sede);
                          return (
                            <span
                              key={`${sede ?? "principal"}-${indice}`}
                              className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[10px] font-semibold border ${fuera ? "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300" : "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300"}`}
                              title={sede == null ? "La sede principal. También toma a quien esté en una sede sin etiqueta propia en esta área." : fuera ? "Esta sede ya no es del proyecto" : undefined}
                            >
                              <FontAwesomeIcon icon={fuera ? faTriangleExclamation : faLocationDot} className="h-2.5 w-2.5" />
                              {etiquetaSede(sede)}
                              {/* La última sede no se quita: para sacar el área está el tacho. */}
                              {filas.length > 1 && (
                                <button type="button" onClick={() => quitarFila(indice)} className="ml-0.5 rounded-full p-0.5 hover:bg-orange-200 dark:hover:bg-orange-800/60" title={`Quitar ${etiquetaSede(sede)} de ${area.name}`}>
                                  <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                                </button>
                              )}
                            </span>
                          );
                        })}
                      {conSedes && paraSumar.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value === "") return;
                            sumarSede(areaId, e.target.value === "principal" ? null : sedeDe(e.target.value));
                          }}
                          className="text-[10px] font-semibold rounded-full border border-dashed border-orange-300 dark:border-orange-700 px-2 py-0.5 bg-transparent text-orange-600 dark:text-orange-400 cursor-pointer"
                          title="Sumar otra sede a esta área: tendrá su propio equipo y su supervisor"
                        >
                          <option value="">+ Sede</option>
                          {paraSumar.map((s) => (
                            <option key={s ?? "principal"} value={s ?? "principal"}>
                              {etiquetaSede(s)}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setConfigurando(areaId)} className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all" title="Configurar Turnos">
                    <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                  </button>
                  {!area.isSystem && (
                    <button type="button" onClick={() => quitarArea(areaId)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-xl transition-all" title={filas.length > 1 ? "Quitar el área (en todas sus sedes)" : "Quitar"}>
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
                <p className="text-[10px] text-gray-500 uppercase font-medium">{hayVariasSedes ? "Entra en la sede principal; después le podés sumar otras" : "Selecciona el área para integrarla"}</p>
              </div>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Áreas Disponibles</label>
                <select
                  className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all cursor-pointer"
                  value=""
                  autoFocus
                  onChange={(e) => e.target.value && agregarArea(e.target.value)}
                >
                  <option value="">Seleccionar del sistema...</option>
                  {areasParaAgregar.map((a) => (
                    <option key={a._id} value={a._id}>
                      {a.name}
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

      {configurando && filasConfigurando.length > 0 && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
                  <FontAwesomeIcon icon={faTable} className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-tight">{areas.find((a) => a._id === configurando)?.name}</h3>
                  <p className="text-[10px] text-gray-500 uppercase font-medium">{filasConfigurando.length > 1 ? "Turnos del área, para todas sus sedes" : "Habilitar turnos para esta área"}</p>
                </div>
              </div>
              <button type="button" onClick={() => setConfigurando(null)} className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-all flex items-center justify-center">
                <FontAwesomeIcon icon={faPlus} className="h-4 w-4 rotate-45" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-3">
              {shifts.map((shift) => {
                // Elegido si está en alguna de sus sedes; tocarlo lo deja igual en todas.
                const elegido = filasConfigurando.some((f) => f.shiftIds.includes(shift._id));
                return (
                  <div
                    key={shift._id}
                    onClick={() => alternarTurno(configurando, shift._id, !elegido)}
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

import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash, faArrowUp, faArrowDown, faXmark, faCheck, faSpinner, faLayerGroup, faGripVertical } from "@fortawesome/free-solid-svg-icons";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, sortableKeyboardCoordinates, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { infoAPI, InfoItem } from "../../api/info";
import { EstadoBadge } from "../EstadoSelect";
import { sweetAlert } from "../../utils/sweetAlert";

const UNASSIGNED = "unassigned";

interface Props {
  estados: InfoItem[];
  onCancel: () => void;
  onSaved: () => void;
}

/** Orden estable dentro de un paso / del pool: por orden visual y luego nombre. */
const byOrden = (a: InfoItem, b: InfoItem) => (a.data?.orden ?? 999) - (b.data?.orden ?? 999) || a.name.localeCompare(b.name);

/** Chip arrastrable de un estado. Se arrastra desde cualquier parte del chip. */
const SortableChip: React.FC<{ estado: InfoItem; onRemove?: () => void }> = ({ estado, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: estado._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, touchAction: "none" as const };
  return (
    <span
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-1.5 py-1 shadow-sm cursor-grab active:cursor-grabbing select-none"
    >
      <FontAwesomeIcon icon={faGripVertical} className="h-3 w-3 text-gray-400 shrink-0" />
      <EstadoBadge name={estado.name} />
      {onRemove && (
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={onRemove} title="Sacar del flujo" className="text-gray-400 hover:text-red-500 px-0.5">
          <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
        </button>
      )}
    </span>
  );
};

/** Contenedor droppable (paso o pool): acepta drops aun estando vacío. */
const Droppable: React.FC<{ id: string; className?: string; children: React.ReactNode }> = ({ id, className = "", children }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} ${isOver ? "ring-2 ring-blue-400/60" : ""}`}>
      {children}
    </div>
  );
};

/**
 * Editor del "Orden de Dependencias": agrupa los estados en pasos ordenados. Los estados en el mismo
 * paso son alternativas (uno u otro). Drag para mover estados entre pasos; flechas para reordenar
 * los pasos. Es independiente del orden visual (`data.orden`).
 */
export const DependencyFlowEditor: React.FC<Props> = ({ estados, onCancel, onSaved }) => {
  const estadoById = useMemo(() => new Map(estados.map((e) => [e._id, e])), [estados]);

  const [pasos, setPasos] = useState<string[]>([]); // ids de contenedor de paso, en orden
  const [items, setItems] = useState<Record<string, string[]>>({ [UNASSIGNED]: [] }); // ids de estado por contenedor
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);
  const newPasoId = () => `paso-${seq.current++}`;

  // Construcción inicial: agrupar por ordenDependencia (renumerado contiguo); sin número → pool.
  // Regla: los estados impositivos van SIEMPRE al Paso 1 (grupo 1), aunque su valor guardado sea
  // otro o no tengan — "van por defecto al paso uno; en ese paso no importa el orden (uno u otro)".
  useEffect(() => {
    const groups = new Map<number, InfoItem[]>();
    const unassigned: InfoItem[] = [];
    for (const e of estados) {
      if (e.data?.esImpositivo) {
        if (!groups.has(1)) groups.set(1, []);
        groups.get(1)!.push(e);
        continue;
      }
      const n = e.data?.ordenDependencia;
      if (typeof n === "number") {
        if (!groups.has(n)) groups.set(n, []);
        groups.get(n)!.push(e);
      } else {
        unassigned.push(e);
      }
    }
    const sortedKeys = [...groups.keys()].sort((a, b) => a - b);
    const pasoIds: string[] = [];
    const map: Record<string, string[]> = { [UNASSIGNED]: unassigned.sort(byOrden).map((e) => e._id) };
    seq.current = 0;
    for (const k of sortedKeys) {
      const pid = newPasoId();
      pasoIds.push(pid);
      map[pid] = groups.get(k)!.sort(byOrden).map((e) => e._id);
    }
    setPasos(pasoIds);
    setItems(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estados]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findContainer = (id: string): string | undefined => {
    if (id === UNASSIGNED || pasos.includes(id)) return id;
    return Object.keys(items).find((k) => items[k].includes(id));
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const aId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    const from = findContainer(aId);
    const to = findContainer(overId);
    if (!from || !to || from === to) return;
    setItems((prev) => {
      const fromItems = prev[from] || [];
      const toItems = prev[to] || [];
      const isContainer = overId === UNASSIGNED || pasos.includes(overId);
      const overIndex = isContainer ? toItems.length : toItems.indexOf(overId);
      const insertAt = overIndex >= 0 ? overIndex : toItems.length;
      return {
        ...prev,
        [from]: fromItems.filter((id) => id !== aId),
        [to]: [...toItems.slice(0, insertAt), aId, ...toItems.slice(insertAt)],
      };
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const aId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    setActiveId(null);
    if (!overId) return;
    const from = findContainer(aId);
    const to = findContainer(overId);
    if (!from || !to || from !== to) return;
    const arr = items[from] || [];
    const oldIndex = arr.indexOf(aId);
    const newIndex = arr.indexOf(overId);
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      setItems((prev) => ({ ...prev, [from]: arrayMove(prev[from], oldIndex, newIndex) }));
    }
  };

  const addPaso = () => {
    const pid = newPasoId();
    setPasos((p) => [...p, pid]);
    setItems((prev) => ({ ...prev, [pid]: [] }));
  };

  const removePaso = (pid: string) => {
    setItems((prev) => {
      const moved = prev[pid] || [];
      const rest = { ...prev };
      delete rest[pid];
      rest[UNASSIGNED] = [...(rest[UNASSIGNED] || []), ...moved];
      return rest;
    });
    setPasos((prev) => prev.filter((p) => p !== pid));
  };

  const movePaso = (i: number, dir: -1 | 1) => {
    setPasos((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      return arrayMove(prev, i, j);
    });
  };

  const sacarDelFlujo = (id: string) => {
    setItems((prev) => {
      const from = Object.keys(prev).find((k) => k !== UNASSIGNED && prev[k].includes(id));
      if (!from) return prev;
      return { ...prev, [from]: prev[from].filter((x) => x !== id), [UNASSIGNED]: [...prev[UNASSIGNED], id] };
    });
  };

  const handleSave = async () => {
    const nonEmpty = pasos.filter((p) => (items[p] || []).length > 0);
    const payload: { id: string; ordenDependencia: number | null }[] = [];
    nonEmpty.forEach((pid, idx) => (items[pid] || []).forEach((eid) => payload.push({ id: eid, ordenDependencia: idx + 1 })));
    (items[UNASSIGNED] || []).forEach((eid) => payload.push({ id: eid, ordenDependencia: null }));
    if (payload.length === 0) {
      onCancel();
      return;
    }
    setSaving(true);
    try {
      await infoAPI.reorderEstadosDependencia(payload);
      const descartados = pasos.length - nonEmpty.length;
      sweetAlert.success("Flujo guardado", descartados > 0 ? `El orden de dependencias se guardó. Se descartaron ${descartados} paso(s) vacío(s).` : "El orden de dependencias se guardó.");
      onSaved();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo guardar el flujo.");
    } finally {
      setSaving(false);
    }
  };

  const activeEstado = activeId ? estadoById.get(activeId) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Armá el <strong>flujo de dependencias</strong>: arrastrá los estados a cada paso. Los estados en el <strong>mismo paso son alternativas</strong> (uno u otro). Usá las flechas para reordenar los pasos.
          Es independiente del orden visual.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onCancel} disabled={saving} className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-sm flex items-center gap-2 disabled:opacity-50">
            <FontAwesomeIcon icon={faXmark} />
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-all text-sm flex items-center gap-2 disabled:opacity-50">
            <FontAwesomeIcon icon={saving ? faSpinner : faCheck} spin={saving} />
            Guardar flujo
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        {/* Pool: Sin asignar */}
        <Droppable id={UNASSIGNED} className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 p-3">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">Sin asignar (fuera del flujo)</p>
          <SortableContext items={items[UNASSIGNED] || []} strategy={rectSortingStrategy}>
            <div className="flex flex-wrap gap-2 min-h-[40px]">
              {(items[UNASSIGNED] || []).length === 0 ? (
                <span className="text-[11px] text-gray-400 italic self-center">Todos los estados están en el flujo.</span>
              ) : (
                (items[UNASSIGNED] || []).map((id) => estadoById.get(id) && <SortableChip key={id} estado={estadoById.get(id)!} />)
              )}
            </div>
          </SortableContext>
        </Droppable>

        {/* Pasos del flujo */}
        <div className="mt-4 space-y-3">
          {pasos.map((pid, i) => (
            <Droppable key={pid} id={pid} className="rounded-xl border border-blue-200 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-900/10 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="inline-flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-widest">
                  <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5" />
                  Paso {i + 1}
                  {(items[pid] || []).length > 1 && <span className="normal-case tracking-normal text-[10px] text-gray-500 dark:text-gray-400">({items[pid].length} alternativas)</span>}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => movePaso(i, -1)} disabled={i === 0} title="Subir paso" className="p-1.5 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-30 disabled:cursor-not-allowed">
                    <FontAwesomeIcon icon={faArrowUp} className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => movePaso(i, 1)} disabled={i === pasos.length - 1} title="Bajar paso" className="p-1.5 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-30 disabled:cursor-not-allowed">
                    <FontAwesomeIcon icon={faArrowDown} className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => removePaso(pid)} title="Eliminar paso (sus estados vuelven a Sin asignar)" className="p-1.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">
                    <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <SortableContext items={items[pid] || []} strategy={rectSortingStrategy}>
                <div className="flex flex-wrap gap-2 min-h-[40px]">
                  {(items[pid] || []).length === 0 ? (
                    <span className="text-[11px] text-gray-400 italic self-center">Arrastrá acá los estados de este paso.</span>
                  ) : (
                    (items[pid] || []).map((id) => {
                      const est = estadoById.get(id);
                      if (!est) return null;
                      // Los impositivos van fijos al Paso 1: no se sacan del flujo (sin botón "x").
                      return <SortableChip key={id} estado={est} onRemove={est.data?.esImpositivo ? undefined : () => sacarDelFlujo(id)} />;
                    })
                  )}
                </div>
              </SortableContext>
            </Droppable>
          ))}
        </div>

        <button onClick={addPaso} className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 text-sm font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
          <FontAwesomeIcon icon={faPlus} />
          Agregar paso
        </button>

        <DragOverlay>{activeEstado ? <EstadoBadge name={activeEstado.name} /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
};

export default DependencyFlowEditor;

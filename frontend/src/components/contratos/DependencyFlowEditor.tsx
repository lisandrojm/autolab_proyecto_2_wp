import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faTrash, faArrowUp, faArrowDown, faXmark, faCheck, faSpinner, faLayerGroup, faGripVertical, faFileInvoiceDollar, faBolt, faCircleInfo, faFolder, faFolderOpen, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type CollisionDetection,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, sortableKeyboardCoordinates, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { infoAPI, InfoItem, EstadoPayload } from "../../api/info";
import { dropboxAPI, DropboxEntry } from "../../api/dropbox";
import { EstadoBadge, TramiteImpositivoBadge } from "../EstadoSelect";
import { Modal } from "../ui/Modal";
import { InfoModal } from "../ui/InfoModal";
import { sweetAlert } from "../../utils/sweetAlert";

const UNASSIGNED = "unassigned";

type TransicionAutomatica = InfoItem["data"]["transicionAutomatica"];

/**
 * Detección de colisiones basada en el puntero: detecta el contenedor sobre el que está el cursor
 * aunque esté VACÍO (los pasos recién creados). `closestCorners` fallaba con contenedores vacíos
 * porque no tienen chips que "atraigan" el drop. Fallback a rectIntersection si el puntero no cae
 * dentro de ningún droppable (p. ej. arrastrando fuera).
 */
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
};

interface Props {
  isOpen: boolean;
  estados: InfoItem[];
  onCancel: () => void;
  onSaved: () => void;
}

/** Orden estable dentro de un paso / del pool: por orden visual y luego nombre. */
const byOrden = (a: InfoItem, b: InfoItem) => (a.data?.orden ?? 999) - (b.data?.orden ?? 999) || a.name.localeCompare(b.name);

/** Marca visual de los estados de índole impositiva (mismo estilo que el ABM de Estados). */
const ChipImpositivo: React.FC = () => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-100 dark:border-purple-800 whitespace-nowrap">
    <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" />
    Impositivo
  </span>
);

/** Último tramo de un path de Dropbox, para mostrar solo el nombre de la carpeta (no la ruta completa). */
const nombreCarpeta = (path?: string): string => {
  const partes = (path || "").split("/").filter(Boolean);
  return partes[partes.length - 1] || path || "";
};

/** Descripción corta de una transición automática, para el tooltip del chip (incluye la nota propia si tiene). */
const descripcionTransicion = (t: TransicionAutomatica): string => {
  if (!t) return "";
  const base = `Automático: carpeta de Dropbox (${t.dropboxCarpeta})`;
  return t.detalle ? `${base} — ${t.detalle}` : base;
};

/** Etiqueta corta para mostrar en el chip cuando el rayo está encendido. */
const etiquetaTransicionCorta = (t: TransicionAutomatica): string => (t ? `Dropbox | ${nombreCarpeta(t.dropboxCarpeta)}` : "");

/** Chip arrastrable de un estado. Se arrastra desde cualquier parte del chip. */
const SortableChip: React.FC<{
  estado: InfoItem;
  onRemove?: () => void;
  /** Si viene definido (aunque sea `undefined` dentro), el chip muestra el botón de transición automática. */
  mostrarTransicion?: boolean;
  transicion?: TransicionAutomatica;
  puedeConfigurarTransicion?: boolean;
  onConfigurarTransicion?: () => void;
}> = ({ estado, onRemove, mostrarTransicion, transicion, puedeConfigurarTransicion, onConfigurarTransicion }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: estado._id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, touchAction: "none" as const };
  const esImpositivo = !!estado.data?.esImpositivo;
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
      {esImpositivo && <ChipImpositivo />}
      {esImpositivo && <TramiteImpositivoBadge estado={estado} />}
      {mostrarTransicion && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onConfigurarTransicion}
          disabled={!puedeConfigurarTransicion}
          title={!puedeConfigurarTransicion ? "Guardá el flujo para poder configurar una transición automática" : transicion ? descripcionTransicion(transicion) : "Configurar transición automática"}
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent ${
            transicion
              ? "text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/50"
              : "text-gray-400 dark:text-gray-500 border-transparent hover:text-gray-500 dark:hover:text-gray-400"
          }`}
        >
          <FontAwesomeIcon icon={faBolt} className="h-3 w-3 shrink-0" />
          {transicion && <span className="truncate max-w-[140px]">{etiquetaTransicionCorta(transicion)}</span>}
        </button>
      )}
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
export const DependencyFlowEditor: React.FC<Props> = ({ isOpen, estados, onCancel, onSaved }) => {
  const estadoById = useMemo(() => new Map(estados.map((e) => [e._id, e])), [estados]);

  const [pasos, setPasos] = useState<string[]>([]); // ids de contenedor de paso, en orden
  const [items, setItems] = useState<Record<string, string[]>>({ [UNASSIGNED]: [] }); // ids de estado por contenedor
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const seq = useRef(0);
  const newPasoId = () => `paso-${seq.current++}`;

  // Transición automática por estado: se edita acá (chip a chip), aparte del guardado del flujo de
  // pasos. `null` = se borró en esta sesión; ausente = usar el valor que ya trae `estados`.
  const [eventoOverrides, setEventoOverrides] = useState<Record<string, TransicionAutomatica | null>>({});
  const [configurando, setConfigurando] = useState<InfoItem | null>(null);
  const [showFlowInfo, setShowFlowInfo] = useState(false);
  const [eventoForm, setEventoForm] = useState<{ carpeta: string; detalle: string }>({ carpeta: "", detalle: "" });
  const [savingEvento, setSavingEvento] = useState(false);
  // Selector de carpeta de Dropbox: navega el árbol real en vez de tipear la ruta a ciegas. Navega TODO
  // el Dropbox conectado (no solo el rootPath de Dropbox Sign) porque puede haber carpetas separadas
  // para otros trámites (p. ej. una carpeta "AFIP" aparte de "HelloSign").
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPath, setPickerPath] = useState("");
  const [pickerEntries, setPickerEntries] = useState<DropboxEntry[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const transicionDe = (estado: InfoItem): TransicionAutomatica => (Object.prototype.hasOwnProperty.call(eventoOverrides, estado._id) ? eventoOverrides[estado._id] ?? undefined : estado.data?.transicionAutomatica);

  const abrirConfigurarEvento = (estado: InfoItem) => {
    const actual = transicionDe(estado);
    setEventoForm({ carpeta: actual?.dropboxCarpeta || "", detalle: actual?.detalle || "" });
    setConfigurando(estado);
  };

  const cargarCarpetaPicker = async (path: string) => {
    try {
      setPickerLoading(true);
      const { entries, path: resolved } = await dropboxAPI.list(path, true);
      setPickerEntries(entries.filter((e) => e.tag === "folder"));
      setPickerPath(resolved);
    } catch (e: any) {
      sweetAlert.error("No se pudo abrir Dropbox", e?.response?.data?.error || "Revisá que Dropbox esté conectado.");
      setPickerOpen(false);
    } finally {
      setPickerLoading(false);
    }
  };

  const abrirPicker = () => {
    setPickerOpen(true);
    cargarCarpetaPicker(eventoForm.carpeta.trim() || "");
  };

  const elegirCarpetaActual = () => {
    setEventoForm((p) => ({ ...p, carpeta: pickerPath }));
    setPickerOpen(false);
  };

  const segmentosPicker = pickerPath.split("/").filter(Boolean);

  // Dos estados no pueden vigilar la misma carpeta (si no, sería ambiguo a cuál avanzar). Se excluye
  // al estado que se está editando, para no bloquearlo con su propia configuración actual.
  const carpetasUsadas = new Map<string, string>();
  estados.forEach((e) => {
    if (configurando?._id === e._id) return;
    const t = transicionDe(e);
    if (t?.dropboxCarpeta) carpetasUsadas.set(t.dropboxCarpeta, e.name);
  });

  const guardarEvento = async () => {
    if (!configurando) return;
    const carpeta = eventoForm.carpeta.trim();
    if (carpeta) {
      const dueño = carpetasUsadas.get(carpeta);
      if (dueño) {
        sweetAlert.error("Carpeta repetida", `Esa carpeta ya está asignada a "${dueño}". Elegí otra.`);
        return;
      }
    }
    // Carpeta vacía = sin transición automática (equivale a "quitarla").
    const nuevaTransicion: TransicionAutomatica = carpeta ? { evento: "dropbox_carpeta", dropboxCarpeta: carpeta, detalle: eventoForm.detalle.trim() || undefined } : undefined;
    // Se manda el estado completo (no solo `transicionAutomatica`): el PATCH reconstruye `data` entero
    // a partir del body, así que hay que preservar los demás campos tal cual están.
    const payload: EstadoPayload = {
      name: configurando.name,
      color: configurando.data?.color,
      contratoFrameIds: configurando.data?.contratoFrameIds || [],
      esImpositivo: configurando.data?.esImpositivo,
      etiquetaSecundaria: configurando.data?.etiquetaSecundaria,
      colorEtiquetaSecundaria: configurando.data?.colorEtiquetaSecundaria,
      tipoImpositivo: configurando.data?.tipoImpositivo,
      transicionAutomatica: nuevaTransicion || null,
    };
    const id = configurando._id;
    try {
      setSavingEvento(true);
      await infoAPI.updateEstado(id, payload);
      setEventoOverrides((prev) => ({ ...prev, [id]: nuevaTransicion ?? null }));
      sweetAlert.success("Transición guardada", "Se actualizó la transición automática de este estado.");
      setConfigurando(null);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo guardar la transición automática.");
    } finally {
      setSavingEvento(false);
    }
  };

  // Construcción inicial: agrupar por ordenDependencia (renumerado contiguo); sin número → pool.
  // Regla: los estados impositivos van SIEMPRE al Paso 1 (grupo 1), aunque su valor guardado sea
  // otro o no tengan — "van por defecto al paso uno; en ese paso no importa el orden (uno u otro)".
  useEffect(() => {
    if (!isOpen) return;
    setEventoOverrides({});
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
  }, [estados, isOpen]);

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
    <>
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={
        <span className="inline-flex items-center gap-2">
          Orden de dependencias
          <button type="button" onClick={() => setShowFlowInfo(true)} title="¿Cómo funciona el flujo de dependencias?" aria-label="¿Cómo funciona el flujo de dependencias?" className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
          </button>
        </span>
      }
      subtitle="Los estados en el mismo paso son alternativas (uno u otro). Es independiente del orden visual."
      size="lg"
      zIndex={60}
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <button onClick={onCancel} disabled={saving} className="px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-sm flex items-center gap-2 disabled:opacity-50">
            <FontAwesomeIcon icon={faXmark} />
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} className="px-3 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-all text-sm flex items-center gap-2 disabled:opacity-50">
            <FontAwesomeIcon icon={saving ? faSpinner : faCheck} spin={saving} />
            Guardar flujo
          </button>
        </div>
      }
    >
      <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
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
                      // Los impositivos van fijos al Paso 1: no se sacan del flujo (sin botón "x"), pero
                      // sí pueden tener transición automática (p. ej. detectados por carpeta de Dropbox).
                      return (
                        <SortableChip
                          key={id}
                          estado={est}
                          onRemove={est.data?.esImpositivo ? undefined : () => sacarDelFlujo(id)}
                          mostrarTransicion
                          transicion={transicionDe(est)}
                          puedeConfigurarTransicion={typeof est.data?.ordenDependencia === "number"}
                          onConfigurarTransicion={() => abrirConfigurarEvento(est)}
                        />
                      );
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
    </Modal>

    {configurando && (
      <Modal
        isOpen={!!configurando}
        onClose={() => setConfigurando(null)}
        title="Transición automática"
        subtitle={configurando.name}
        size="sm"
        zIndex={70}
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button onClick={() => setConfigurando(null)} className="btn-secondary" disabled={savingEvento}>
              Cancelar
            </button>
            <button onClick={guardarEvento} className="btn-primary" disabled={savingEvento}>
              {savingEvento ? "Guardando..." : "Guardar"}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Cuando aparezca un archivo en la carpeta de Dropbox que elijas, el contrato pasa solo a este estado (siempre hacia adelante, nunca retrocede).
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 ml-1">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest">Carpeta de Dropbox a vigilar</label>
              {eventoForm.carpeta && (
                <button type="button" onClick={() => setEventoForm({ carpeta: "", detalle: "" })} className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 hover:underline">
                  Quitar transición automática
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={abrirPicker}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-gray-300 dark:border-gray-600 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors"
            >
              <FontAwesomeIcon icon={eventoForm.carpeta ? faFolderOpen : faFolder} className="h-4 w-4 text-amber-500 shrink-0" />
              {eventoForm.carpeta ? (
                <span className="text-xs font-mono text-gray-700 dark:text-gray-200 truncate">{eventoForm.carpeta}</span>
              ) : (
                <span className="text-xs text-gray-400 italic">Elegir carpeta en Dropbox...</span>
              )}
            </button>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Descripción (opcional)</label>
            <textarea
              className="input-field w-full text-xs resize-none"
              rows={3}
              value={eventoForm.detalle}
              onChange={(e) => setEventoForm((p) => ({ ...p, detalle: e.target.value }))}
              placeholder='Ej: cuando se detecte que se subieron archivos y esos archivos fueron importados desde Dropbox Sign, se toman como "Firma Pendiente".'
            />
            <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">Una nota tuya para acordarte (o que otro admin entienda) qué significa esta carpeta en tu flujo. Se muestra al pasar el mouse por el rayo.</p>
          </div>
        </div>
      </Modal>
    )}

    {pickerOpen && (
      <Modal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Elegir carpeta de Dropbox"
        size="sm"
        zIndex={90}
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button onClick={() => setPickerOpen(false)} className="btn-secondary">
              Cancelar
            </button>
            <button onClick={elegirCarpetaActual} className="btn-primary" disabled={pickerLoading || !!carpetasUsadas.get(pickerPath)}>
              Usar esta carpeta
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1 text-xs">
            <button type="button" onClick={() => cargarCarpetaPicker("")} className="text-blue-600 dark:text-blue-400 hover:underline font-semibold">
              Raíz
            </button>
            {segmentosPicker.map((seg, i) => (
              <React.Fragment key={i}>
                <span className="text-gray-400">/</span>
                <button type="button" onClick={() => cargarCarpetaPicker(`/${segmentosPicker.slice(0, i + 1).join("/")}`)} className="text-blue-600 dark:text-blue-400 hover:underline">
                  {seg}
                </button>
              </React.Fragment>
            ))}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Carpeta seleccionada: <span className="font-mono text-gray-700 dark:text-gray-300">{pickerPath}</span>
          </p>
          {carpetasUsadas.get(pickerPath) && (
            <p className="text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
              <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3 mt-0.5 shrink-0" />
              Esta carpeta ya está asignada a "{carpetasUsadas.get(pickerPath)}". Elegí otra.
            </p>
          )}
          {(pickerLoading || pickerEntries.length > 0) && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto">
            {pickerLoading ? (
              <div className="p-4 flex justify-center">
                <FontAwesomeIcon icon={faSpinner} spin className="h-4 w-4 text-gray-400" />
              </div>
            ) : (
              pickerEntries.map((f) => {
                const usadaPor = carpetasUsadas.get(f.path);
                return (
                  <button
                    key={f.path}
                    type="button"
                    onClick={() => !usadaPor && cargarCarpetaPicker(f.path)}
                    disabled={!!usadaPor}
                    title={usadaPor ? `Ya está asignada a "${usadaPor}"` : undefined}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  >
                    <FontAwesomeIcon icon={faFolder} className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    <span className="truncate">{f.name}</span>
                    {usadaPor && <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0 ml-auto">en uso: {usadaPor}</span>}
                  </button>
                );
              })
            )}
          </div>
          )}
        </div>
      </Modal>
    )}

    <InfoModal isOpen={showFlowInfo} onClose={() => setShowFlowInfo(false)} title="¿Cómo funciona el flujo de dependencias?" size="sm" zIndex={80}>
      <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
        <p>
          Armá el <strong>flujo de dependencias</strong>: arrastrá los estados a cada paso. Los estados en el <strong>mismo paso son alternativas</strong> (uno u otro). Usá las flechas para reordenar los pasos.
        </p>
        <p className="flex items-start gap-1.5">
          <FontAwesomeIcon icon={faBolt} className="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5" />
          <span>
            El rayo de cada estado indica si tiene una <strong>transición automática</strong> configurada: un evento que, al ocurrir, avanza el contrato solo a ese estado. Hacé click para configurarla — también funciona para los estados impositivos del Paso 1 (por ejemplo, detectados en una carpeta de Dropbox).
          </span>
        </p>
        <p className="flex items-start gap-1.5 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            <strong>Importante:</strong> para usar esta transición hace falta tener conectada una cuenta de <strong>Dropbox</strong> — es lo que va guardando los documentos en esas carpetas (por ejemplo, sincronizados desde Dropbox Sign, o cualquier otra carpeta que subas vos mismo). Sin esa conexión, la transición no se va a disparar nunca.
          </span>
        </p>
      </div>
    </InfoModal>
    </>
  );
};

export default DependencyFlowEditor;

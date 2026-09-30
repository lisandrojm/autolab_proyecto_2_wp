import React, { useEffect, useState, useMemo } from "react";
import { infoAPI, InfoItem } from "../api/info";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { faBuilding, faTable, faGrip, faPlus, faEdit, faTrash, faGripVertical } from "@fortawesome/free-solid-svg-icons";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Modal } from "../components/ui/Modal";
import { sweetAlert } from "../utils/sweetAlert";

import { getHelp, hasHelp } from "../data/help/helpContent";

interface SedeForm {
  nombre: string;
  externalId: string;
}
const FORM_VACIO: SedeForm = { nombre: "", externalId: "" };

/**
 * Una fila de la tabla de Sedes, arrastrable en modo ordenar. Mismo comportamiento que las filas de
 * Tipos de Pedidos: fuera del modo, clic en el ⋮⋮ lo activa; dentro, se arrastra la fila entera.
 */
const FilaSede: React.FC<{
  sede: InfoItem;
  /** Posición en el orden guardado. */
  posicion: number;
  /** Posición en la lista que se está viendo (en modo ordenar, la que va a quedar). */
  indice: number;
  ordenando: boolean;
  onEmpezarOrden: () => void;
  onEditar: (s: InfoItem) => void;
  onEliminar: (s: InfoItem) => void;
}> = ({ sede, posicion, indice, ordenando, onEmpezarOrden, onEditar, onEliminar }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sede._id, disabled: !ordenando });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <tr ref={setNodeRef} style={style} {...(ordenando ? { ...attributes, ...listeners } : {})} className={`transition-colors ${ordenando ? "bg-blue-50 dark:bg-blue-900/20 cursor-grab active:cursor-grabbing" : "hover:bg-gray-50 dark:hover:bg-gray-700/30"}`}>
      <td
        className={`px-6 py-4 ${!ordenando ? "cursor-pointer" : ""}`}
        onClick={(e) => {
          if (!ordenando) {
            e.preventDefault();
            e.stopPropagation();
            onEmpezarOrden();
          }
        }}
        title={!ordenando ? "Clic para activar modo ordenar" : ""}
      >
        <div className={`flex items-center justify-center ${ordenando ? "text-blue-600 dark:text-blue-400" : "text-gray-400 dark:text-gray-600 hover:text-blue-500"}`}>
          <FontAwesomeIcon icon={faGripVertical} className="h-5 w-5" />
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ordenando ? indice : posicion}</span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={faBuilding} className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{sede.name}</span>
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">{sede.externalId || "—"}</span>
      </td>
      <td className="px-6 py-4">
        <span className="text-sm text-gray-600 dark:text-gray-400">{sede.data?.id ?? "-"}</span>
      </td>
      <td className="px-6 py-4">
        {!ordenando && (
          <div className="flex items-center justify-end gap-1">
            <button onClick={() => onEditar(sede)} title="Editar sede" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
              <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
            </button>
            <button onClick={() => onEliminar(sede)} title="Eliminar sede" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors">
              <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
};

export const SedesPage: React.FC = () => {
  const [sedes, setSedes] = useState<InfoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [openInfo, setOpenInfo] = useState(false);

  // ABM
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<InfoItem | null>(null);
  const [form, setForm] = useState<SedeForm>(FORM_VACIO);
  const [saving, setSaving] = useState(false);

  const HELP_KEY = "sedes";
  const helpEntry = getHelp(HELP_KEY);

  const [viewMode, setViewMode] = useState<"table" | "cards">("cards");
  const [isXXL, setIsXXL] = useState(window.innerWidth >= 1200);

  useEffect(() => {
    const handleResize = () => {
      const isNowXXL = window.innerWidth >= 1200;
      setIsXXL(isNowXXL);
      if (!isNowXXL) setViewMode("cards");
    };

    const saved = localStorage.getItem("sedesViewMode");
    if (saved === "table" || saved === "cards") {
      if (window.innerWidth >= 1200) setViewMode(saved as "table" | "cards");
    }

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (isXXL) {
      localStorage.setItem("sedesViewMode", viewMode);
    }
  }, [viewMode, isXXL]);

  const cargar = async () => {
    try {
      setLoading(true);
      const data = await infoAPI.listSedes();
      setSedes(data);
    } catch (error) {
      console.error("Error fetching sedes:", error);
      sweetAlert.error("Error", "No se pudieron cargar las sedes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const filteredSedes = useMemo(() => {
    if (!searchTerm) return sedes;
    const lowerSearch = searchTerm.toLowerCase();
    return sedes.filter((s) => s.name.toLowerCase().includes(lowerSearch) || (s.externalId || "").toLowerCase().includes(lowerSearch));
  }, [sedes, searchTerm]);

  const abrirCrear = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setShowModal(true);
  };

  const abrirEditar = (sede: InfoItem) => {
    setEditando(sede);
    setForm({ nombre: sede.name || "", externalId: sede.externalId || "" });
    setShowModal(true);
  };

  const guardar = async () => {
    const nombre = form.nombre.trim();
    if (!nombre) {
      sweetAlert.error("Falta el nombre", "La sede necesita un nombre.");
      return;
    }
    const payload = { nombre, externalId: form.externalId.trim() };
    try {
      setSaving(true);
      if (editando) {
        await infoAPI.updateSede(editando._id, payload);
        sweetAlert.success("Sede actualizada", "Los cambios se guardaron con éxito.");
      } else {
        await infoAPI.createSede(payload);
        sweetAlert.success("Sede creada", "La sede fue creada.");
      }
      setShowModal(false);
      await cargar();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo guardar la sede.");
    } finally {
      setSaving(false);
    }
  };

  /*
    EL ORDEN GENERAL DE LAS SEDES, con la misma experiencia que el orden de Pedidos: «Ordenar» (o
    clic en el ⋮⋮ de una fila) activa el modo, se arrastran las filas, y se confirma con «Guardar
    Orden» o se descarta con «Cancelar».

    Es el orden de todos los listados y el de las sedes de un proyecto (la primera es la principal),
    salvo la favorita de la Empresa del Contrato, que va primero.
  */
  const [ordenando, setOrdenando] = useState(false);
  const [sedesTemp, setSedesTemp] = useState<InfoItem[]>([]);
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const empezarOrden = () => {
    // Se ordena la lista ENTERA: con una búsqueda, arrastrar movería una sede respecto de otras que no se ven.
    setSearchTerm("");
    setSedesTemp([...sedes]);
    setOrdenando(true);
  };
  const cancelarOrden = () => {
    setOrdenando(false);
    setSedesTemp([]);
  };
  const guardarOrden = async () => {
    try {
      await infoAPI.reorderSedes(sedesTemp.map((s, i) => ({ id: s._id, orden: i + 1 })));
      sweetAlert.success("Orden guardado", "El orden se actualizó correctamente");
      setOrdenando(false);
      setSedesTemp([]);
      await cargar();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo guardar el orden");
    }
  };
  const alSoltar = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSedesTemp((items) => arrayMove(items, items.findIndex((i) => i._id === active.id), items.findIndex((i) => i._id === over.id)));
  };

  const eliminar = async (sede: InfoItem) => {
    const result = await sweetAlert.confirm("¿Eliminar sede?", `Se va a eliminar "${sede.name}". Si viene de la sincronización de FRAME, puede volver a aparecer en la próxima sync.`);
    if (!result.isConfirmed) return;
    try {
      await infoAPI.deleteSede(sede._id);
      sweetAlert.success("Eliminada", "La sede fue eliminada.");
      await cargar();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo eliminar la sede.");
    }
  };

  return (
    <PageLayout
      title="Sedes"
      subtitle="Listado de todas las sedes del sistema"
      itemCount={filteredSedes.length}
      faIcon={{ icon: faBuilding }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry?.title || "Ayuda",
        size: helpEntry?.size as any,
        content: helpEntry?.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      searchAndFilters={
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
          <div className="flex-1 w-full">
            <SearchAndFilters searchTerm={searchTerm} onSearchChange={setSearchTerm} searchPlaceholder="Buscar por nombre o ID externo..." />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {ordenando ? (
              <>
                <button onClick={cancelarOrden} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
                  <span>Cancelar</span>
                </button>
                <button onClick={guardarOrden} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm">
                  <span>Guardar Orden</span>
                </button>
              </>
            ) : (
              <>
                <button onClick={abrirCrear} title="Nueva sede" aria-label="Nueva sede" className="inline-flex items-center gap-2 px-2 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                  <FontAwesomeIcon icon={faPlus} />
                </button>
                <button onClick={empezarOrden} disabled={sedes.length < 2} className="px-4 py-2 rounded border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                  <FontAwesomeIcon icon={faGripVertical} />
                  <span className="hidden lg:block">Ordenar</span>
                </button>
              </>
            )}
            {isXXL && !ordenando && (
              <>
                <button onClick={() => setViewMode("cards")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas">
                  <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
                </button>
                <button onClick={() => setViewMode("table")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${viewMode === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla">
                  <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      }
    >
      {loading ? (
        <LoadingSpinner message="Cargando sedes..." />
      ) : filteredSedes.length === 0 ? (
        <div className="text-center py-12">
          <FontAwesomeIcon icon={faBuilding} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No se encontraron sedes</h3>
        </div>
      ) : viewMode === "cards" && !ordenando ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {filteredSedes.map((sede) => (
            <div key={sede._id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <FontAwesomeIcon icon={faBuilding} className="h-5 w-5 text-primary-600 dark:text-primary-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{sede.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">ID Externo: {sede.externalId || "—"}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/60">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">ID Interno: {sede.data?.id ?? "N/A"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => abrirEditar(sede)} title="Editar sede" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                    <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                  </button>
                  <button onClick={() => eliminar(sede)} title="Eliminar sede" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                    <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-6">
          {ordenando && (
            <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
              <p className="text-blue-900 dark:text-blue-100 text-sm">
                <FontAwesomeIcon icon={faGripVertical} className="mr-2" />
                <strong>Modo de reordenamiento activo:</strong> Arrastrá las filas para cambiar el orden. Hacé clic en "Guardar Orden" para confirmar los cambios o "Cancelar" para descartarlos.
              </p>
            </div>
          )}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltar}>
        <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">Ordenar</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">Orden</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sede</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID Externo</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ID Interno</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                </tr>
              </thead>
              <SortableContext items={(ordenando ? sedesTemp : filteredSedes).map((x) => x._id)} strategy={verticalListSortingStrategy}>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                  {(ordenando ? sedesTemp : filteredSedes).map((sede) => (
                    <FilaSede key={sede._id} sede={sede} posicion={sedes.findIndex((x) => x._id === sede._id) + 1} indice={(ordenando ? sedesTemp : filteredSedes).indexOf(sede) + 1} ordenando={ordenando} onEmpezarOrden={empezarOrden} onEditar={abrirEditar} onEliminar={eliminar} />
                  ))}
                </tbody>
              </SortableContext>
            </table>
          </div>
        </div>
        </DndContext>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editando ? "Editar Sede" : "Nueva Sede"}
        subtitle={editando ? editando.name : "Cargá una sede manualmente"}
        size="md"
        footer={
          <div className="flex items-center justify-end gap-3 w-full">
            <button onClick={() => setShowModal(false)} className="btn-secondary" disabled={saving}>
              Cancelar
            </button>
            <button onClick={guardar} className="btn-primary" disabled={saving}>
              {saving ? "Guardando..." : editando ? "Actualizar" : "Crear"}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Nombre *</label>
            <input className="input-field w-full" value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} placeholder="Ej: La corte" />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">ID Externo (opcional)</label>
            <input className="input-field w-full" value={form.externalId} onChange={(e) => setForm((p) => ({ ...p, externalId: e.target.value }))} placeholder="Se autogenera si lo dejás en blanco" />
            <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">Las sedes que llegan por la sincronización de FRAME traen su propio ID Externo. Para una sede manual podés dejarlo en blanco.</p>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-3 py-2.5">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Las Sedes son los lugares de trabajo con los que opera el sistema (proyectos, personas, contratos) y <strong>no</strong> tienen relación con las Sucursales de ARCA. El domicilio de desempeño que se declara en el alta es una entidad aparte, con su propio código y actividades, y se carga en <strong>Configuración → ARCA → Sucursales</strong>.
            </p>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
};

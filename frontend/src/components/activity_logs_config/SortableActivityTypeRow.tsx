import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical, faToggleOn, faToggleOff, faPenToSquare, faTrash, faUsers, faGlobe } from "@fortawesome/free-solid-svg-icons";

export interface RequestConfig {
  id: string;
  order: number;
  type: string;
  requiresReplacement: boolean;
  status: "Activa" | "Inactiva";
  visibility: "all" | "specific";
  allowedProjectIds: string[];
}

interface SortableRowProps {
  item: RequestConfig;
  index: number;
  isReorderMode: boolean;
  allProjects: { _id: string; name: string }[];
  onEdit: (item: RequestConfig) => void;
  onDelete: (id: string) => void;
  onToggleActive: (item: RequestConfig) => void;
  onToggleReplacement: (item: RequestConfig) => void;
  onStartReorder: () => void;
}

export const SortableActivityTypeRow: React.FC<SortableRowProps> = ({ item, index, isReorderMode, allProjects, onEdit, onDelete, onToggleActive, onToggleReplacement, onStartReorder }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !isReorderMode,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} {...(isReorderMode ? { ...attributes, ...listeners } : {})} className={`border-b border-gray-100 dark:border-gray-700 ${isReorderMode ? "bg-blue-50 dark:bg-blue-900/20 cursor-grab active:cursor-grabbing" : "hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group"}`}>
      <td className="py-4 px-6 text-center">
        <button
          onClick={(e) => {
            if (!isReorderMode) {
              e.preventDefault();
              onStartReorder();
            }
          }}
          className={`flex items-center justify-center w-full h-full border-none bg-transparent ${isReorderMode ? "text-blue-600 dark:text-blue-400 cursor-grab active:cursor-grabbing" : "text-gray-400 dark:text-gray-600 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"}`}
          title={isReorderMode ? "Arrastrar para ordenar" : "Activar reordenamiento"}
        >
          <FontAwesomeIcon icon={faGripVertical} />
        </button>
      </td>
      <td className="py-4 px-6 text-center font-medium text-gray-900 dark:text-white">{index + 1}</td>
      <td className="py-4 px-6 font-medium text-gray-900 dark:text-gray-100">{item.type}</td>
      <td className="py-4 px-6">
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-2">
            {item.visibility === "all" ? (
              <button onClick={() => !isReorderMode && onEdit(item)} disabled={isReorderMode} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 transition-all ${isReorderMode ? "opacity-50 cursor-not-allowed" : "hover:ring-2 hover:ring-blue-400 cursor-pointer"}`} title="Clic para editar visibilidad">
                <FontAwesomeIcon icon={faGlobe} />
                Global
              </button>
            ) : (
              <button onClick={() => !isReorderMode && onEdit(item)} disabled={isReorderMode} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 transition-all ${isReorderMode ? "opacity-50 cursor-not-allowed" : "hover:ring-2 hover:ring-green-400 cursor-pointer"}`} title={`Disponible en ${item.allowedProjectIds.length} proyectos. Clic para editar`}>
                <FontAwesomeIcon icon={faUsers} />
                Específico
              </button>
            )}
          </div>
          {item.visibility === "specific" && item.allowedProjectIds.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 max-w-[250px]">
              {item.allowedProjectIds.slice(0, 3).map((id) => {
                const project = allProjects.find((p) => p._id === id);
                return project ? (
                  <span key={id} className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    {project.name}
                  </span>
                ) : null;
              })}
              {item.allowedProjectIds.length > 3 && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                  title={item.allowedProjectIds
                    .slice(3)
                    .map((id) => allProjects.find((p) => p._id === id)?.name)
                    .filter(Boolean)
                    .join(", ")}
                >
                  +{item.allowedProjectIds.length - 3}
                </span>
              )}
            </div>
          )}
          {item.visibility === "specific" && item.allowedProjectIds.length === 0 && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 mt-1">Sin proyectos</span>}
        </div>
      </td>
      <td className="py-4 px-6 text-center">
        <button onClick={() => onToggleReplacement(item)} disabled={isReorderMode} className={`mx-auto px-3 py-1 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${item.requiresReplacement ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"} ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`}>
          <FontAwesomeIcon icon={item.requiresReplacement ? faToggleOn : faToggleOff} />
          {item.requiresReplacement ? "Habilitado" : "Deshabilitado"}
        </button>
      </td>
      <td className="py-4 px-6 text-center">
        <button onClick={() => onToggleActive(item)} disabled={isReorderMode} className={`mx-auto px-3 py-1 rounded text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${item.status === "Activa" ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400"} ${isReorderMode ? "opacity-50 cursor-not-allowed" : ""}`}>
          <FontAwesomeIcon icon={item.status === "Activa" ? faToggleOn : faToggleOff} />
          {item.status}
        </button>
      </td>
      <td className="py-4 px-6 text-right">
        <div className={`flex items-center justify-end gap-3 ${isReorderMode ? "opacity-30" : ""}`}>
          <button onClick={() => !isReorderMode && onEdit(item)} disabled={isReorderMode} className={`text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ${isReorderMode ? "cursor-not-allowed" : ""}`} title="Editar">
            <FontAwesomeIcon icon={faPenToSquare} />
          </button>
          <button onClick={() => !isReorderMode && onDelete(item.id)} disabled={isReorderMode} className={`text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ${isReorderMode ? "cursor-not-allowed" : ""}`} title="Eliminar">
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>
      </td>
    </tr>
  );
};

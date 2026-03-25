import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase, faBuilding, faCalendarAlt, faClock, faDollarSign, faIdCard, faCheckCircle, faInfoCircle, faEdit } from "@fortawesome/free-solid-svg-icons";
import { User } from "../../../../api/users";
import { Modal } from "../../../../components/ui/Modal";
import { projectsAPI, Project } from "../../../../api/projects";
import { roleFrameAPI, RoleFrameItem } from "../../../../api/roleFrames";
import { categoriaSatAPI, CategoriaSatItem } from "../../../../api/categoriasSat";

interface UserRegistrationDetailModalProps {
  user: User | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (user: User) => void;
}

export const UserRegistrationDetailModal: React.FC<UserRegistrationDetailModalProps> = ({ user, isOpen, onClose, onEdit }) => {
  const [requestedProjects, setRequestedProjects] = useState<Project[]>([]);
  const [roleFrame, setRoleFrame] = useState<RoleFrameItem | null>(null);
  const [categoriaSat, setCategoriaSat] = useState<CategoriaSatItem | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && user && user.metadata?.isSolicitud) {
      const loadDetails = async () => {
        setLoading(true);
        try {
          const [projs, frames, cats] = await Promise.all([
            projectsAPI.listAll(),
            roleFrameAPI.list(),
            categoriaSatAPI.list()
          ]);
          
          if (user.metadata?.projectIds && user.metadata?.projectIds.length > 0) {
            const found = projs.filter(p => user.metadata?.projectIds?.includes(p._id));
            setRequestedProjects(found);
          } else if ((user.metadata as any)?.projectId) {
            // Backward compatibility
            const found = projs.find(p => p._id === (user.metadata as any).projectId);
            if (found) setRequestedProjects([found]);
          }

          if (user.metadata?.roleFrameId) {
            setRoleFrame(frames.find(f => f._id === user.metadata?.roleFrameId) || null);
          }
          if (user.metadata?.categoriaSatId) {
            setCategoriaSat(cats.find(c => c._id === user.metadata?.categoriaSatId) || null);
          }
        } catch (error) {
          console.error("Error loading registration details:", error);
        } finally {
          setLoading(false);
        }
      };
      loadDetails();
    } else {
      setRequestedProjects([]);
      setRoleFrame(null);
      setCategoriaSat(null);
    }
  }, [isOpen, user]);

  if (!user) return null;

  const isSolicitud = user.metadata?.isSolicitud;
  const displayName = isSolicitud ? user.metadata?.fullName || `${user.firstName} ${user.lastName}` : `${user.firstName} ${user.lastName}`;
  
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric"
      });
    } catch (e) {
      return dateStr;
    }
  };

  const getInitials = (name: string) => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Detalles del Alta"
      size="md"
    >
      <div className="space-y-6 pb-4">
        {/* HEADER / STATUS */}
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Estado de la solicitud</span>
            <div className="mt-1">
              {isSolicitud ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  <FontAwesomeIcon icon={faClock} className="text-[10px]" />
                  PENDIENTE DE APROBACIÓN
                </span>
              ) : user.isActive ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-[10px]" />
                  ACTIVO
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  <FontAwesomeIcon icon={faInfoCircle} className="text-[10px]" />
                  INACTIVO
                </span>
              )}
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-3">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Fecha de Solicitud</span>
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{formatDate(user.createdAt)}</span>
            </div>
            {isSolicitud && onEdit && (
              <button
                onClick={() => user && onEdit(user)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white dark:bg-blue-500 text-[10px] font-bold shadow-md shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-95"
              >
                <FontAwesomeIcon icon={faEdit} className="text-[10px]" />
                EDITAR SOLICITUD
              </button>
            )}
          </div>
        </div>

        {/* PROFILE HEADER */}
        <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
          <div className={`h-16 w-16 rounded-2xl flex items-center justify-center text-xl font-bold ${isSolicitud ? 'bg-blue-600 text-white' : 'bg-primary text-white'}`}>
            {getInitials(displayName)}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 truncate">{displayName}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{isSolicitud ? "Usuario Invitado" : user.email}</p>
          </div>
        </div>

        {/* DETAILS GRID */}
        <div className="grid grid-cols-1 gap-4">
          {/* PROYECTO Y CLIENTE */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
              Proyecto Solicitado
            </label>
            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm min-h-[46px]">
              {loading ? (
                <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 animate-pulse rounded" />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {requestedProjects.length > 0 ? (
                    requestedProjects.map((p) => (
                      <span key={p._id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                        {typeof p.clientId === "object" && p.clientId.name ? `${p.clientId.name} | ${p.name}` : p.name}
                      </span>
                    ))
                  ) : user.projectIds && user.projectIds.length > 0 ? (
                    user.projectIds.map((p: any) => (
                      <span key={p._id || p} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-100 dark:border-slate-700">
                        {p.name || p}
                      </span>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400 italic">No especificado</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* CARGO / ROL */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <FontAwesomeIcon icon={faIdCard} className="text-blue-500 text-[10px]" />
                Rol / Cargo
              </label>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm min-h-[46px] flex items-center">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100 italic">
                  {roleFrame ? roleFrame.name : (typeof user.positionId === "object" ? user.positionId?.name : "Sin cargo")}
                </p>
              </div>
            </div>

            {/* AREA */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <FontAwesomeIcon icon={faBuilding} className="text-blue-500 text-[10px]" />
                Área
              </label>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm min-h-[46px] flex items-center">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {typeof user.areaId === "object" ? user.areaId?.name : "Sin área"}
                </p>
              </div>
            </div>
          </div>

          {/* CATEGORIA SAT */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faIdCard} className="text-blue-500 text-[10px]" />
              Categoría SAT
            </label>
            <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm min-h-[46px] flex items-center">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {categoriaSat ? categoriaSat.name : "No especificada"}
              </p>
            </div>
          </div>

          {/* DATES */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <FontAwesomeIcon icon={faCalendarAlt} className="text-blue-500 text-[10px]" />
                Fecha Inicio
              </label>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {formatDate(user.metadata?.startDate || user.hireDate)}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <FontAwesomeIcon icon={faCalendarAlt} className="text-blue-500 text-[10px]" />
                Fecha Fin
              </label>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {user.metadata?.dueDate ? formatDate(user.metadata.dueDate) : "A definir / Indeterminado"}
                </p>
              </div>
            </div>
          </div>

          {/* SCHEDULE AND RATE */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <FontAwesomeIcon icon={faClock} className="text-blue-500 text-[10px]" />
                Horario
              </label>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {user.metadata?.schedule || "No especificado"}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <FontAwesomeIcon icon={faDollarSign} className="text-blue-500 text-[10px]" />
                Valor Jornada
              </label>
              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {user.metadata?.dailyRate ? `$ ${user.metadata.dailyRate.toLocaleString("es-AR")}` : "No especificado"}
                </p>
              </div>
            </div>
          </div>

          {/* REPLACEMENT INFO */}
          {user.metadata?.isReplacement && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 rounded-xl flex items-center gap-3">
              <FontAwesomeIcon icon={faInfoCircle} className="text-amber-500" />
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Esta solicitud corresponde a un reemplazo.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

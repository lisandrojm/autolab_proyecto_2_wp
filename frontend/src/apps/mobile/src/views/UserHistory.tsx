import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faPlus, faUsers, faUserPlus, faEnvelope, faBriefcase, faBuilding, faCalendarAlt } from "@fortawesome/free-solid-svg-icons";
import { useUserHistory } from "../hooks/useUserHistory";
import { ViewType } from "../types";
import { UserRegistrationModal } from "../components/UserRegistrationModal";

interface UserHistoryProps {
  onNavigate: (view: ViewType) => void;
}

export default function UserHistory({ onNavigate }: UserHistoryProps) {
  const { users, loading, refetch } = useUserHistory();
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);

  // Helper to get initials
  const getInitials = (firstName?: string, lastName?: string) => {
    return `${firstName?.charAt(0) || ""}${lastName?.charAt(0) || ""}`.toUpperCase() || "U";
  };

  return (
    <div className="flex-1 pb-24">
      {/* HEADER */}
      <div className="sticky top-0 border-b border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm px-4 py-4 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate("home")}
            className="flex items-center justify-center w-10 h-10 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
          </button>
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faUsers} className="w-5 h-5 text-slate-900 dark:text-slate-100" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Altas de Usuarios</h1>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        <h3 className="text-lg font-bold mb-4">Historial de Altas</h3>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm border dark:border-slate-800">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 bg-slate-200 dark:bg-slate-700 rounded-full" />
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded-md mb-2" />
                    <div className="h-3 w-48 bg-slate-200 dark:bg-slate-700 rounded-md" />
                  </div>
                </div>
                <div className="h-8 w-full bg-slate-100 dark:bg-slate-800 rounded-md" />
              </div>
            ))}
          </div>
        ) : users.length > 0 ? (
          <div className="space-y-3">
             {users.map((user) => {
               const isSolicitud = user.metadata?.isSolicitud;
               const displayName = isSolicitud ? user.metadata?.fullName || `${user.firstName} ${user.lastName}` : `${user.firstName} ${user.lastName}`;
               const initials = isSolicitud ? (user.metadata?.fullName?.charAt(0) || "S") : getInitials(user.firstName, user.lastName);

               return (
                 <div
                   key={user._id}
                   className="bg-white border dark:border-slate-700 dark:bg-slate-900/70 rounded-xl p-4 shadow-sm"
                 >
                   <div className="flex items-start gap-3 mb-3">
                     <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold text-sm ${isSolicitud ? 'bg-blue-100 text-blue-600' : 'bg-primary/10 text-primary'}`}>
                       {initials}
                     </div>
                     <div className="flex-1 min-w-0">
                       <div className="flex items-center justify-between gap-2">
                           <h4 className="font-bold text-slate-900 dark:text-slate-100 truncate">
                             {displayName}
                           </h4>
                           {isSolicitud ? (
                             <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">Solicitud</span>
                           ) : user.isActive ? (
                             <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Activo</span>
                           ) : (
                             <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">Inactivo</span>
                           )}
                       </div>
                       <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                         <FontAwesomeIcon icon={faEnvelope} className="w-3 h-3 opacity-70" />
                         <span className="truncate">{isSolicitud ? "Pendiente de aprobación" : user.email}</span>
                       </div>
                     </div>
                   </div>

                   <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                     <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                       <FontAwesomeIcon icon={faBriefcase} className="w-3 h-3 opacity-70 text-primary" />
                       <span className="truncate">
                         {isSolicitud ? "Alta Pendiente" : (typeof user.positionId === "object" ? user.positionId?.name : "Sin cargo")}
                       </span>
                     </div>
                     <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                       <FontAwesomeIcon icon={faBuilding} className="w-3 h-3 opacity-70 text-primary" />
                       <span className="truncate">
                         {typeof user.areaId === "object" ? user.areaId?.name : "Sin área"}
                       </span>
                     </div>
                     <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                       <FontAwesomeIcon icon={faCalendarAlt} className="w-3 h-3 opacity-70 text-primary" />
                       <span>{isSolicitud ? 'Solicitado' : 'Alta'}: {new Date(user.createdAt).toLocaleDateString("es-ES")}</span>
                     </div>
                   </div>
                 </div>
               );
             })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-slate-50 p-10 dark:bg-slate-800/50">
            <FontAwesomeIcon icon={faUserPlus} className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No se encontraron usuarios registrados</p>
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-24 z-10 w-full xl:w-1/2 left-1/2 -translate-x-1/2 flex justify-end px-6 pointer-events-none">
        <button
          onClick={() => setShowRegistrationModal(true)}
          className="pointer-events-auto flex items-center justify-center w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl transition-transform hover:scale-105 active:scale-95"
          title="Nuevo Usuario"
        >
          <FontAwesomeIcon icon={faPlus} className="w-6 h-6" />
        </button>
      </div>

      <UserRegistrationModal
        isOpen={showRegistrationModal}
        onClose={() => setShowRegistrationModal(false)}
        onSuccess={() => {
          setShowRegistrationModal(false);
          refetch();
        }}
      />
    </div>
  );
}

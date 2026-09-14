import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHome, faUser, faBell, faBriefcase } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";

interface BottomNavProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
}

export default function BottomNav({ currentView, onNavigate }: BottomNavProps) {
  /*
    Cuatro lugares. «Mis equipos» estuvo acá un tiempo y se sacó: se entra desde su tarjeta del inicio.
    Antes el tercer lugar era Documentos, apagado y sin pantalla detrás; no se repuso, porque un botón
    que no lleva a ningún lado sólo ocupa espacio.
  */
  const navItems = [
    { id: "home" as ViewType, icon: faHome, label: "Inicio", disabled: false },
    // El Calendario salió de la barra (estaba apagado): su lugar lo toma el Perfil.
    { id: "profile" as ViewType, icon: faUser, label: "Perfil", disabled: false },
    // Proyecto, contrato y áreas/turnos: antes era el final del Perfil y lo alargaba de más.
    { id: "asignacion" as ViewType, icon: faBriefcase, label: "Asignación", disabled: false },
    { id: "notifications" as ViewType, icon: faBell, label: "Notificaciones", disabled: true, notifications: true },
  ];

  return (
    <nav>
      <div className="fixed bottom-0 left-0 z-30 w-full flex justify-center">
        <div className="z-10 w-full xl:w-1/2 border-t border-slate-800 py-1 sticky top-0 border-b bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm">
          <div className="mx-auto grid h-16 max-w-md grid-cols-4 px-2">
            {navItems.map(({ id, icon, label, disabled, notifications }) => {
              const isActive = currentView === id;
              const isClickable = !disabled;

              return (
                <button
                  key={id}
                  type="button"
                  onClick={isClickable ? () => onNavigate(id) : undefined}
                  disabled={disabled}
                  aria-disabled={disabled}
                  aria-label={label}
                  className={`group relative inline-flex flex-col items-center justify-center px-5
                    ${disabled ? "text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60" : isActive ? "text-primary" : "text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary"}`}
                >
                  <div className="relative">
                    <FontAwesomeIcon icon={icon} className="w-5 h-5" />

                    {/* 🔥 Puntito rojo de notificaciones */}
                    {notifications && (
                      <span className="absolute right-0 top-0 flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded bg-orange-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded bg-orange-500" />
                      </span>
                    )}
                  </div>
                  {isActive && <span className="text-xs font-bold mt-1 whitespace-nowrap">{label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

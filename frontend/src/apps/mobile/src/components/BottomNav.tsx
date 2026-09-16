import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHome, faUser, faBell, faBriefcase } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";

interface BottomNavProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  /** Cuántos avisos sin leer. En 0 la campanita no muestra nada: avisar de nada es ruido. */
  sinLeer?: number;
}

export default function BottomNav({ currentView, onNavigate, sinLeer = 0 }: BottomNavProps) {
  /*
    Cuatro lugares. «Mis equipos» estuvo acá un tiempo y se sacó: se entra desde su tarjeta del inicio.
    Antes el tercer lugar era Documentos, apagado y sin pantalla detrás; no se repuso, porque un botón
    que no lleva a ningún lado sólo ocupa espacio.
  */
  const navItems = [
    { id: "home" as ViewType, icon: faHome, label: "Inicio", disabled: false },
    // El Calendario salió de la barra (estaba apagado): su lugar lo toma el Perfil.
    { id: "profile" as ViewType, icon: faUser, label: "Perfil", disabled: false },
    // Los proyectos de la persona, cada uno con su contrato y sus áreas/turnos. Antes se llamaba
    // «Asignación» y mostraba uno solo; nació como el final del Perfil, que alargaba de más.
    { id: "proyectos" as ViewType, icon: faBriefcase, label: "Proyectos", disabled: false },
    // La campanita ya lleva a su pantalla. Antes estaba apagada y con un puntito rojo fijo: avisaba
    // siempre, hubiera algo o no, y no se podía entrar a ver qué era.
    { id: "notifications" as ViewType, icon: faBell, label: "Notificaciones", disabled: false, notifications: true },
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

                    {/* El número de avisos sin leer. Hasta 9; más que eso no cambia lo que hay que hacer. */}
                    {notifications && sinLeer > 0 && (
                      <span className="absolute -right-2.5 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-[18px] text-white">{sinLeer > 9 ? "9+" : sinLeer}</span>
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

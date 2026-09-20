import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHome, faUser, faBell, faBriefcase, faSitemap } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";

interface BottomNavProps {
  currentView: ViewType;
  onNavigate: (view: ViewType) => void;
  /** Cuántos avisos sin leer. En 0 la campanita no muestra nada: avisar de nada es ruido. */
  sinLeer?: number;
  /** Tiene el permiso «Mis equipos». Sin él, su lugar en la barra no se dibuja. */
  puedeEquipos?: boolean;
}

export default function BottomNav({ currentView, onNavigate, sinLeer = 0, puedeEquipos = false }: BottomNavProps) {
  /*
    Lo que se usa todo el tiempo va acá abajo, no en una tarjeta del inicio.

    «Mis equipos» vuelve a la barra: es a lo que se entra y se vuelve varias veces por día —ver quién
    está en qué turno— y desde una tarjeta del inicio eso son dos toques cada vez. Con el permiso
    apagado el lugar no se dibuja, y la barra queda en cuatro como antes.

    Antes el tercer lugar era Documentos, apagado y sin pantalla detrás; no se repuso, porque un
    botón que no lleva a ningún lado sólo ocupa espacio.
  */
  const navItems = [
    { id: "home" as ViewType, icon: faHome, label: "Inicio", disabled: false },
    // El Calendario salió de la barra (estaba apagado): su lugar lo toma el Perfil.
    { id: "profile" as ViewType, icon: faUser, label: "Perfil", disabled: false },
    // Las áreas y turnos que tiene a cargo, con su gente.
    ...(puedeEquipos ? [{ id: "my_teams" as ViewType, icon: faSitemap, label: "Equipos", disabled: false }] : []),
    // Los proyectos de la persona, cada uno con su contrato y sus áreas/turnos. Antes se llamaba
    // «Asignación» y mostraba uno solo; nació como el final del Perfil, que alargaba de más.
    { id: "proyectos" as ViewType, icon: faBriefcase, label: "Proyectos", disabled: false },
    /*
      «Avisos» y no «Notificaciones»: con cinco lugares cada uno es un quinto de la pantalla, y la
      palabra larga se salía del botón y se montaba sobre los de al lado. Es la palabra que esta
      misma barra ya usa cuando habla de ellos («cuántos avisos sin leer»), así que no inventa un
      nombre nuevo: lo usa el que ya estaba escrito.

      La campanita ya lleva a su pantalla. Antes estaba apagada y con un puntito rojo fijo: avisaba
      siempre, hubiera algo o no, y no se podía entrar a ver qué era.
    */
    { id: "notifications" as ViewType, icon: faBell, label: "Avisos", disabled: false, notifications: true },
  ];

  return (
    <nav>
      <div className="fixed bottom-0 left-0 z-30 w-full flex justify-center">
        <div className="z-10 w-full xl:w-1/2 border-t border-slate-800 py-1 sticky top-0 border-b bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-sm">
          {/* Las columnas son las que hay: con cinco lugares, cinco. Tailwind necesita la clase escrita. */}
          <div className={`mx-auto grid h-16 max-w-md px-2 ${navItems.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
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
                  className={`group relative inline-flex flex-col items-center justify-center px-2
                    ${disabled ? "text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60" : isActive ? "text-primary" : "text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary"}`}
                >
                  <div className="relative">
                    <FontAwesomeIcon icon={icon} className="w-5 h-5" />

                    {/* El número de avisos sin leer. Hasta 9; más que eso no cambia lo que hay que hacer. */}
                    {notifications && sinLeer > 0 && (
                      // Verde como los contadores de las tarjetas: son lo mismo, cosas nuevas para mirar.
                      // Acá va macizo y no translúcido: se apoya sobre la campanita y dejaría ver el ícono debajo.
                      <span className="absolute -right-2.5 -top-1.5 flex min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold leading-[18px] text-white">{sinLeer > 9 ? "9+" : sinLeer}</span>
                    )}
                  </div>
                  {/*
                    Sin negrita: el lugar donde estás ya se distingue por el color, y el ícono arriba del
                    nombre no necesita que además el texto grite. En negrita, cinco palabras cortas en
                    una barra angosta se leen como cinco títulos.
                  */}
                  {isActive && <span className="mt-1 whitespace-nowrap text-xs font-medium">{label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}

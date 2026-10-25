import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";

/**
 * EL MENÚ DE TARJETAS DE LA APP (25/10/2026): la misma tarjeta de la home, para elegir adónde entrar
 * dentro de una sección. Reemplaza a las barras de pestañas: la app tenía dos lenguajes para lo mismo
 * —elegir adónde ir— y las pestañas además ocupaban un renglón fijo arriba de cada lista.
 *
 * Se usa siempre igual: la pantalla abre con las tarjetas; tocar una ENTRA (las tarjetas desaparecen
 * y el título pasa a ser el de esa parte) y la flecha de atrás vuelve a las tarjetas.
 *
 * Dos columnas, ícono chico a la izquierda, contador verde en la esquina: ver `views/Home.tsx`, que
 * explica cada una de esas decisiones.
 */
export interface OpcionDeMenu<T extends string> {
  id: T;
  label: string;
  icon: IconDefinition;
  /** Cuántas cosas hay para mirar; 0 o sin dato, sin globo. */
  contador?: number;
  disabled?: boolean;
}

export default function MenuDeTarjetas<T extends string>({ opciones, onElegir, className = "" }: { opciones: OpcionDeMenu<T>[]; onElegir: (id: T) => void; className?: string }) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${className}`}>
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          disabled={o.disabled}
          onClick={() => !o.disabled && onElegir(o.id)}
          className={`relative flex min-h-[68px] items-center gap-2.5 rounded-xl border p-4 text-left shadow-sm transition-transform ${o.disabled ? "cursor-not-allowed border-slate-300 bg-slate-200 opacity-40 dark:border-slate-600 dark:bg-slate-800" : "border-slate-200 bg-white hover:scale-[1.02] active:scale-[0.98] dark:border-slate-600 dark:bg-slate-900/70"}`}
        >
          <FontAwesomeIcon icon={o.icon} className={`h-4 w-4 shrink-0 ${o.disabled ? "text-slate-400 dark:text-slate-500" : "text-primary"}`} />
          <h2 className={`min-w-0 break-words text-[15px] font-bold leading-tight text-slate-900 dark:text-slate-100 ${o.contador ? "pr-5" : ""}`}>{o.label}</h2>
          {!!o.contador && (
            <span className="absolute right-2 top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500/20 px-1 text-[10px] font-black leading-none text-emerald-700 dark:bg-emerald-400/20 dark:text-emerald-300">
              {o.contador > 99 ? "99+" : o.contador}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

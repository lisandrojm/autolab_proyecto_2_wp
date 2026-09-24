import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar, faStarHalfStroke } from "@fortawesome/free-solid-svg-icons";
import { faStar as faStarVacia } from "@fortawesome/free-regular-svg-icons";
import { ESTRELLAS_ELEGIBLES } from "../../api/calificaciones";

/*
  LAS ESTRELLAS DE LAS CALIFICACIONES. Las usan el escritorio y el móvil.

  Se eligen 1, 2, 4 o 5. La tercera NO se puede tocar —no se quieren calificaciones del medio—, pero se
  pinta sola al elegir 4 o 5: son cinco estrellas de verdad, sólo que una no es una respuesta posible.
*/

const TEXTO: Record<number, string> = { 1: "Muy mala", 2: "Mala", 4: "Buena", 5: "Muy buena" };

interface InputProps {
  valor: number;
  onChange: (estrellas: number) => void;
  disabled?: boolean;
}

export const EstrellasInput: React.FC<InputProps> = ({ valor, onChange, disabled }) => {
  const [sobre, setSobre] = useState(0);
  const mostrada = sobre || valor;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1" onMouseLeave={() => setSobre(0)}>
        {[1, 2, 3, 4, 5].map((n) => {
          const elegible = ESTRELLAS_ELEGIBLES.includes(n);
          const llena = n <= mostrada;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled || !elegible}
              onClick={() => elegible && onChange(n)}
              onMouseEnter={() => elegible && setSobre(n)}
              title={elegible ? `${n} ${n === 1 ? "estrella" : "estrellas"} · ${TEXTO[n]}` : "El 3 no se puede elegir: la calificación es buena (4, 5) o mala (1, 2)"}
              aria-label={elegible ? `${n} estrellas` : "3 estrellas (no disponible)"}
              className={`p-1 text-3xl leading-none transition-transform ${elegible && !disabled ? "cursor-pointer hover:scale-110 active:scale-95" : "cursor-default"} ${llena ? "text-amber-400" : "text-slate-300 dark:text-slate-600"} ${!elegible && !llena ? "opacity-40" : ""}`}
            >
              <FontAwesomeIcon icon={llena ? faStar : faStarVacia} />
            </button>
          );
        })}
      </div>
      <p className={`h-4 text-xs font-semibold ${mostrada ? "text-amber-600 dark:text-amber-400" : "text-slate-400"}`}>{mostrada ? TEXTO[mostrada] : "Elegí una calificación"}</p>
    </div>
  );
};

interface VistaProps {
  /** 0 a 5. Admite decimales (el promedio): se redondea a media estrella. */
  valor: number;
  className?: string;
}

/** Cinco estrellas de sólo lectura. */
export const EstrellasVista: React.FC<VistaProps> = ({ valor, className = "" }) => {
  const medias = Math.round(valor * 2);
  return (
    <span className={`inline-flex items-center gap-px text-amber-400 ${className}`} aria-label={`${valor} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <FontAwesomeIcon key={n} icon={medias >= n * 2 ? faStar : medias === n * 2 - 1 ? faStarHalfStroke : faStarVacia} className={medias >= n * 2 - 1 ? "" : "text-slate-300 dark:text-slate-600"} />
      ))}
    </span>
  );
};

/** El promedio de una persona con su número y cuántas la forman; «Sin calificar» si no hay ninguna. */
export const CalificacionPromedio: React.FC<{ promedio?: number; cantidad?: number; compacta?: boolean }> = ({ promedio = 0, cantidad = 0, compacta }) => {
  if (!cantidad) return <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">Sin calificar</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={`${promedio.toFixed(1)} de 5 · ${cantidad} ${cantidad === 1 ? "calificación" : "calificaciones"}`}>
      <EstrellasVista valor={promedio} className={compacta ? "text-[10px]" : "text-xs"} />
      <span className={`font-bold text-slate-700 dark:text-slate-200 ${compacta ? "text-[10px]" : "text-xs"}`}>{promedio.toFixed(1)}</span>
      {!compacta && <span className="text-[11px] text-slate-400">({cantidad})</span>}
    </span>
  );
};

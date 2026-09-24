import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { AvisoSuperposicion } from "../../api/users";

/*
  LO QUE LA PERSONA YA TIENE EN ESAS FECHAS U HORARIO. Lo muestran el formulario de solicitud (mientras
  se carga) y el detalle de la solicitud (la foto de cuando se pidió, para quien aprueba).

  Rojo = HORARIO: algún día en común y el mismo horario (o el mismo turno), en cualquier proyecto. La
  persona no puede estar en dos lugares a la vez. Ámbar = FECHAS: los períodos se cruzan en otro
  horario u otros días. Ninguno frena el alta: quien pide y quien aprueba deciden con el dato a la vista.
*/
export const AvisosSuperposicion: React.FC<{ avisos: AvisoSuperposicion[]; titulo?: string }> = ({ avisos, titulo }) => {
  if (!avisos || avisos.length === 0) return null;
  const graves = avisos.filter((a) => a.tipo === "horario").length;
  return (
    <div className={`space-y-2 rounded-xl border p-3 ${graves ? "border-red-300 bg-red-50 dark:border-red-900/70 dark:bg-red-950/30" : "border-amber-300 bg-amber-50 dark:border-amber-800/70 dark:bg-amber-950/20"}`}>
      <p className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wide ${graves ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"}`}>
        <FontAwesomeIcon icon={faTriangleExclamation} />
        {titulo || (graves ? "Se superpone con lo que ya tiene" : "Las fechas se cruzan con lo que ya tiene")}
      </p>
      <ul className="space-y-1.5">
        {avisos.map((a, i) => (
          <li key={i} className={`flex gap-2 text-xs ${a.tipo === "horario" ? "text-red-800 dark:text-red-200" : "text-amber-800 dark:text-amber-200"}`}>
            <FontAwesomeIcon icon={a.tipo === "horario" ? faTriangleExclamation : faCircleInfo} className="mt-0.5 h-3 w-3 shrink-0 opacity-80" />
            <span>{a.mensaje}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

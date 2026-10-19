import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserTie } from "@fortawesome/free-solid-svg-icons";

/*
  EL COORDINADOR DEL PROYECTO (`metadata.responsableId`, resuelto por el server en
  `metadataResolutions.responsable`), como badge en las tarjetas de proyecto: la de Proyectos y la de
  los proyectos de un cliente. Mismo bloque en las dos para que se lean igual.

  Sin resolución pero con id: «ID: n», como la tabla — apunta a alguien que no se encontró, que no es
  lo mismo que no tener coordinador («—»).
*/
export const nombreCoordinador = (project: any): string => {
  const r = project?.metadataResolutions?.responsable;
  const nombre = r ? r.name || `${r.firstName || ""} ${r.lastName || ""}`.trim() : "";
  if (nombre) return nombre;
  return project?.metadata?.responsableId ? `ID: ${project.metadata.responsableId}` : "";
};

export const BadgeCoordinador: React.FC<{ project: any; className?: string }> = ({ project, className = "" }) => {
  const nombre = nombreCoordinador(project);
  return (
    <div className={`flex flex-col ${className}`}>
      <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex gap-1 items-center">
        <FontAwesomeIcon icon={faUserTie} className="h-3 w-3 text-gray-400" />
        Coordinador
      </label>
      {nombre ? (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold uppercase tracking-tight bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 border border-sky-100 dark:border-sky-800/50 w-fit">
          <FontAwesomeIcon icon={faUserTie} className="h-2.5 w-2.5 opacity-70" />
          {nombre}
        </span>
      ) : (
        <span className="text-xs text-gray-400">—</span>
      )}
    </div>
  );
};

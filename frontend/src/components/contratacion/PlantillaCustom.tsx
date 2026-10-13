import React from "react";
import { RichTextViewer } from "../ui/RichTextEditor";

/*
  CONTRATO CUSTOM / RELEASE CUSTOM EN LOS ABM: el badge del listado y, en el formulario, el tilde
  «Plantilla custom» con el cuerpo en solo lectura (el placeholder). El texto real se escribe en Firma
  digital para cada trámite: ver `@compartido/textoCustom`.
*/

/** «CUSTOM», para listados de plantillas y de tipos que tienen una plantilla custom. */
export const BadgeCustom: React.FC<{ className?: string }> = ({ className = "" }) => (
  <span
    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold border bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800 ${className}`}
    title="Plantilla custom: el texto se escribe al generar el documento, en Firma digital"
  >
    Custom
  </span>
);

/** El tilde del formulario de la plantilla. */
export const TildePlantillaCustom: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => (
  <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
    <span>
      <span className="font-medium">Plantilla custom</span> — el texto se escribe al generar el documento
    </span>
  </label>
);

/** El cuerpo de una plantilla custom en el formulario: el placeholder, sin poder editarlo. */
export const CuerpoPlantillaCustom: React.FC<{ placeholder: string }> = ({ placeholder }) => (
  <div>
    <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 px-4 py-3 text-gray-500 dark:text-gray-400">
      <RichTextViewer html={placeholder} />
    </div>
    <p className="text-xs text-gray-500 mt-1">
      El cuerpo no se redacta acá: en <strong>Gestión de Contratos → Firma digital</strong>, al generar el documento de cada trámite, se escribe el texto (con las mismas variables). El membrete y la firma salen de esta plantilla.
    </p>
  </div>
);

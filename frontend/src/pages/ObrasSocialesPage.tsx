import React from "react";
import { faBriefcaseMedical } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const obrasSocialesApi = createSimpleCatalogApi("/obras-sociales");

/** El "ID Externo" de Obras Sociales siempre fue el código RNOS: se muestra con los guiones del
 *  formato oficial (X-XXXX-X), rellenando con ceros a la izquierda hasta 6 dígitos. */
const formatRnos = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.padStart(6, "0").slice(-6);
  return `${padded[0]}-${padded.slice(1, 5)}-${padded[5]}`;
};

const sanitizeRnos = (v: string): string => v.replace(/\D/g, "");

export const ObrasSocialesPage: React.FC = () => (
  <SimpleCatalogManager
    title="Obras Sociales"
    subtitle="Catálogo de obras sociales y prepagas. Cargá registros manualmente o importá un Excel."
    icon={faBriefcaseMedical}
    entityLabel="obra social"
    api={obrasSocialesApi}
    templateBaseName="obras_sociales"
    externalIdLabel="RNOS"
    externalIdPlaceholder="6 dígitos, ej: 400905"
    formatExternalId={formatRnos}
    sanitizeExternalId={sanitizeRnos}
    helpKey="obrasSociales"
    porDefecto={{
      etiqueta: "Por defecto",
      ayuda: "Cuando la persona no tiene obra social asignada, se usa esta para completar el código RNOS de los datos AFIP.",
    }}
  />
);

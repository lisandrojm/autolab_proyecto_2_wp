import React from "react";
import { faBriefcaseMedical, faStar } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { ObraSocialDefaultsTab } from "../components/catalog/ObraSocialDefaultsTab";
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
    // El listado solo señala cuál es la global; se elige en la pestaña "Por defecto".
    porDefecto={{
      etiqueta: "Por defecto (global)",
      ayuda: 'Se usa cuando la persona no tiene obra social asignada. Para definir una distinta por empresa, entrá a la pestaña "Por defecto".',
      esPorDefecto: (item) => !!(item.data as { porDefecto?: boolean } | undefined)?.porDefecto,
    }}
    pestanas={[
      {
        id: "por-defecto",
        label: "Por defecto",
        icon: faStar,
        render: (items, recargar) => <ObraSocialDefaultsTab obrasSociales={items} api={obrasSocialesApi} formatExternalId={formatRnos} onCambio={recargar} />,
      },
    ]}
  />
);

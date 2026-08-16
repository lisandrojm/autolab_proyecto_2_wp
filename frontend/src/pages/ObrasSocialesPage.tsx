import React from "react";
import { faBriefcaseMedical, faStar } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { ObraSocialDefaultsTab } from "../components/catalog/ObraSocialDefaultsTab";
import { createSimpleCatalogApi } from "../api/simpleCatalog";
// El "ID Externo" de Obras Sociales siempre fue el código RNOS. El formato oficial vive en un solo
// lugar porque lo comparten este catálogo, la ficha de la empresa y el ABM de Empresas.
import { formatRnos } from "../utils/rnos";

const obrasSocialesApi = createSimpleCatalogApi("/obras-sociales");

const sanitizeRnos = (v: string): string => v.replace(/\D/g, "");

export const ObrasSocialesPage: React.FC = () => (
  <SimpleCatalogManager
    title="Obras Sociales"
    subtitle="Catálogo de obras sociales de ARCA. Cargá registros manualmente o importá un Excel cuando se actualicen en ARCA."
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

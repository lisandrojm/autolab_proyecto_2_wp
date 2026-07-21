import React from "react";
import { faBriefcaseMedical } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const obrasSocialesApi = createSimpleCatalogApi("/obras-sociales");

export const ObrasSocialesPage: React.FC = () => (
  <SimpleCatalogManager
    title="Obras Sociales"
    subtitle="Catálogo de obras sociales y prepagas. Cargá registros manualmente o importá un Excel."
    icon={faBriefcaseMedical}
    entityLabel="obra social"
    api={obrasSocialesApi}
    templateBaseName="obras_sociales"
    helpKey="obrasSociales"
  />
);

import React from "react";
import { faPiggyBank } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const centrosCostoApi = createSimpleCatalogApi("/centros-costo");

export const CentrosCostoPage: React.FC = () => (
  <SimpleCatalogManager
    title="Centros de Costos"
    subtitle="Catálogo de centros de costos. Cargá registros manualmente o importá un Excel."
    icon={faPiggyBank}
    entityLabel="centro de costo"
    api={centrosCostoApi}
    templateBaseName="centros_costo"
    helpKey="centrosCosto"
  />
);

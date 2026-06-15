import React from "react";
import { faBuildingColumns } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const bancosApi = createSimpleCatalogApi("/bancos");

export const BancosPage: React.FC = () => (
  <SimpleCatalogManager
    title="Bancos"
    subtitle="Catálogo de bancos. Cargá registros manualmente o importá un Excel."
    icon={faBuildingColumns}
    entityLabel="banco"
    api={bancosApi}
    templateBaseName="bancos"
  />
);

import React from "react";
import { faBuildingColumns } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const bancosApi = createSimpleCatalogApi("/bancos");

export const BancosPage: React.FC = () => (
  <SimpleCatalogManager
    title="Entidades Financieras"
    subtitle="Catálogo de entidades financieras. Cargá registros manualmente o importá un Excel."
    icon={faBuildingColumns}
    entityLabel="entidad financiera"
    api={bancosApi}
    templateBaseName="entidades_financieras"
    extraFields={[
      {
        key: "tipoEntidad",
        label: "Tipo de Entidad",
        type: "select",
        required: true,
        showColumn: true,
        columnLabel: "Tipo",
        options: [
          { value: "banco", label: "Banco" },
          { value: "billetera_virtual", label: "Billetera Virtual" },
          { value: "otro", label: "Otro" },
        ],
      },
    ]}
  />
);

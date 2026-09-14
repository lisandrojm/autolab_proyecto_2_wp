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
    helpKey="bancos"
    extraFields={[
      {
        key: "tipoEntidad",
        label: "Tipo de Entidad",
        type: "select",
        required: true,
        showColumn: true,
        columnLabel: "Tipo",
        filtrable: true,
        // Sin tipo cargado se ofrece como banco en el registro y en la ficha: filtrar por «Banco» la trae.
        valorPorDefecto: "banco",
        options: [
          { value: "banco", label: "Banco" },
          { value: "billetera_virtual", label: "Billetera Virtual" },
          { value: "compania_financiera", label: "Compañía Financiera" },
          { value: "caja_credito", label: "Caja de Crédito" },
          { value: "otro", label: "Otro" },
        ],
      },
      {
        /*
          ACTIVA O INACTIVA: si se ofrece en los selectores (registro y datos bancarios del usuario).
          Apagar no borra: quien ya la tiene cargada la conserva, pero nadie nuevo la puede elegir.
        */
        key: "activo",
        label: "Estado",
        type: "estado",
        showColumn: true,
        filtrable: true,
        options: [
          { value: "true", label: "Activa" },
          { value: "false", label: "Inactiva" },
        ],
        ayuda: "Las inactivas no se ofrecen al registrarse ni al cargar datos bancarios. Quien ya la tiene cargada la conserva.",
      },
    ]}
  />
);

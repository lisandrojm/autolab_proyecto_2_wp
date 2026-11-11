import React from "react";
import { faHouseLaptop } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

export const modalidadesApi = createSimpleCatalogApi("/modalidades");

/**
 * Modalidades de trabajo (Presencial, Remoto, Híbrido…): se eligen en cada contrato y salen en las
 * plantillas con {{modalidad}}. Son de la productora; la primera vez se cargan las tres de siempre,
 * con Presencial por defecto. Un contrato sin modalidad se lee como la por defecto
 * (ver `server/src/services/modalidades.ts`).
 */
export const ModalidadesPage: React.FC = () => (
  <SimpleCatalogManager
    title="Modalidades"
    subtitle="Presencial, Remoto, Híbrido… Se elige en cada contrato; la por defecto viene puesta."
    icon={faHouseLaptop}
    entityLabel="modalidad"
    api={modalidadesApi}
    templateBaseName="modalidades"
    showExternalId={false}
    permiteImportExcel={false}
    ordenable={{ campo: "orden", ayuda: "El orden en que se ofrecen al contratar." }}
    extraFields={[
      {
        key: "esDefault",
        label: "Es la modalidad por defecto",
        type: "estado",
        marcaInactivo: false,
        valorInicial: "false",
        options: [
          { value: "true", label: "Por defecto" },
          { value: "false", label: "No" },
        ],
        showColumn: true,
        columnLabel: "Por defecto",
        ayuda: "La que viene elegida al contratar, y la que vale para los contratos que no tienen modalidad. Sólo puede haber una: al marcarla, se apaga la anterior.",
      },
      {
        key: "activo",
        label: "Activa",
        type: "estado",
        options: [
          { value: "true", label: "Activa" },
          { value: "false", label: "Inactiva" },
        ],
        showColumn: true,
        columnLabel: "Estado",
        filtrable: true,
        valorPorDefecto: "true",
        ayuda: "Una modalidad inactiva no se ofrece en contratos nuevos, pero los contratos que ya la tienen la siguen mostrando.",
      },
    ]}
  />
);

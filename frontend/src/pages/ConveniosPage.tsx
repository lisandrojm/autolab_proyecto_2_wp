import React from "react";
import { faFileContract } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const conveniosApi = createSimpleCatalogApi("/convenios");

/**
 * Catálogo de Convenios Colectivos de Trabajo (CCT), con el nomenclador de AFIP/ARCA.
 *
 * El "ID Externo" acá es el código CCT con formato "NNNN/AA" (ej. 0130/75). A diferencia del RNOS de
 * Obras Sociales no es numérico —lleva barra y ceros a la izquierda—, así que se guarda tal cual.
 */
export const ConveniosPage: React.FC = () => (
  <SimpleCatalogManager
    title="Convenios"
    subtitle="Convenios Colectivos de Trabajo (CCT). Cargá registros manualmente o importá el nomenclador de AFIP."
    icon={faFileContract}
    entityLabel="convenio"
    api={conveniosApi}
    templateBaseName="convenios"
    externalIdLabel="Código"
    externalIdPlaceholder="Formato NNNN/AA, ej: 0130/75"
    extraFields={[{ key: "signatario", label: "Signatario", showColumn: true, placeholder: "Ej: FAECYS" }]}
  />
);

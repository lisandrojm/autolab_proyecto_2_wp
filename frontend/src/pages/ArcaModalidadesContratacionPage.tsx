import React from "react";
import { faFileContract } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const api = createSimpleCatalogApi("/arca/modalidades-contratacion");

/** El código de ARCA se guarda con ceros a la izquierda: es lo que espera el TXT de alta (3 díg.). */
const formatCodigo = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.padStart(3, "0").slice(-3) : "";
};

export const ArcaModalidadesContratacionPage: React.FC = () => (
  <SimpleCatalogManager
    title="Modalidades de Contratación"
    subtitle="Tabla oficial de ARCA. Define la modalidad con la que se declara cada Tipo de Contrato en el alta."
    icon={faFileContract}
    entityLabel="modalidad de contratación"
    api={api}
    templateBaseName="arca_modalidades_contratacion"
    externalIdLabel="Código"
    externalIdPlaceholder="Ej: 022"
    formatExternalId={formatCodigo}
    sanitizeExternalId={(v) => v.replace(/\D/g, "")}
    helpKey="arcaModalidadContratacion"
  />
);

import React from "react";
import { faListCheck } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const api = createSimpleCatalogApi("/arca/tipos-servicio");

/** El código de ARCA se guarda con ceros a la izquierda: es lo que espera el TXT de alta (3 díg.). */
const formatCodigo = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.padStart(3, "0").slice(-3) : "";
};

export const ArcaTiposServicioPage: React.FC = () => (
  <SimpleCatalogManager
    title="Tipos de Servicio"
    subtitle="Tabla oficial de ARCA. Clasifica el servicio prestado (comunes continuos, insalubres, etc.)."
    icon={faListCheck}
    entityLabel="tipo de servicio"
    api={api}
    templateBaseName="arca_tipos_servicio"
    externalIdLabel="Código"
    externalIdPlaceholder="Ej: 000"
    formatExternalId={formatCodigo}
    sanitizeExternalId={(v) => v.replace(/\D/g, "")}
    helpKey="arcaTipoServicio"
  />
);

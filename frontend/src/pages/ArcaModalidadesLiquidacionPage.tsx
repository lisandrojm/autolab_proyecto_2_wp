import React from "react";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { DefaultArcaStar } from "../components/arca/DefaultArcaStar";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const api = createSimpleCatalogApi("/arca/modalidades-liquidacion");

/** El código de ARCA se guarda con ceros a la izquierda: es lo que espera el TXT de alta (1 díg.). */
const formatCodigo = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.padStart(1, "0").slice(-1) : "";
};

export const ArcaModalidadesLiquidacionPage: React.FC = () => (
  <SimpleCatalogManager
    columnasCalculadas={[
      {
        label: "Por defecto",
        render: (item) => <DefaultArcaStar campo="modalidadLiquidacion" valor={String(item.externalId || "")} nombre={`${item.externalId} — ${item.name}`} queEs="la modalidad de liquidación" />,
      },
    ]}
    title="Modalidades de Liquidación"
    subtitle="Tabla oficial de ARCA. Define cada cuánto se liquida la retribución (mes, quincena, jornal, etc.)."
    icon={faClock}
    entityLabel="modalidad de liquidación"
    api={api}
    templateBaseName="arca_modalidades_liquidacion"
    externalIdLabel="Código"
    externalIdPlaceholder="Ej: 1"
    formatExternalId={formatCodigo}
    sanitizeExternalId={(v) => v.replace(/\D/g, "")}
    helpKey="arcaModalidadLiquidacion"
  />
);

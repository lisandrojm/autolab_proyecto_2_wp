import React from "react";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import { encabezadoDeAmbito } from "../config/nomencladoresArca";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { DefaultArcaStar, LimpiarDefaultArca } from "../components/arca/DefaultArcaStar";
import { createSimpleCatalogApi } from "../api/simpleCatalog";
import { CAMPOS_RETRIBUCION, TEXTO_SIN_CAMPO } from "@compartido/arca/retribucionPactada";

const api = createSimpleCatalogApi("/arca/modalidades-liquidacion");

/** El código de ARCA se guarda con ceros a la izquierda: es lo que espera el TXT de alta (1 díg.). */
const formatCodigo = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.padStart(1, "0").slice(-1) : "";
};

export const ArcaModalidadesLiquidacionPage: React.FC = () => {
  return (
  <SimpleCatalogManager
    extraFields={[
      {
        // Qué importe del contrato va al TXT de alta como retribución pactada (pos. 58-72) con esta modalidad.
        key: "retribucionPactada",
        label: "Retribución pactada",
        type: "select",
        options: [{ value: "", label: TEXTO_SIN_CAMPO }, ...CAMPOS_RETRIBUCION.map((c) => ({ value: c.value, label: c.label }))],
        showColumn: true,
      },
    ]}
    columnasCalculadas={[
      {
        label: "Por defecto",
        encabezado: (
          <span className="inline-flex items-center gap-2">
            Por defecto
            <LimpiarDefaultArca campo="modalidadLiquidacion" queEs="la modalidad de liquidación" />
          </span>
        ),
        render: (item) => <DefaultArcaStar campo="modalidadLiquidacion" valor={String(item.externalId || "")} nombre={`${item.externalId} — ${item.name}`} queEs="la modalidad de liquidación" />,
      },
    ]}
    title="Modalidades de Liquidación"
    {...encabezadoDeAmbito("modalidades-liquidacion")}
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
};

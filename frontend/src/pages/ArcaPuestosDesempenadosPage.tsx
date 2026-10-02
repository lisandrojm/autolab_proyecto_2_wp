import React from "react";
import { faUserTie } from "@fortawesome/free-solid-svg-icons";
import { encabezadoDeAmbito } from "../config/nomencladoresArca";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { DefaultArcaStar, LimpiarDefaultArca } from "../components/arca/DefaultArcaStar";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const api = createSimpleCatalogApi("/arca/puestos-desempenados");

/** El código de ARCA se guarda con ceros a la izquierda (4 díg.), tal como va en el registro de 85. */
const formatCodigo = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.padStart(4, "0").slice(-4) : "";
};

/**
 * Puestos desempeñados de ARCA. Solo los informa el registro de 85 (Altas Masivas, pos. 29-32).
 *
 * La ★ es el último escalón: el puesto sale de la categoría del contrato, después del default de la
 * empleadora y recién después de éste.
 */
export const ArcaPuestosDesempenadosPage: React.FC = () => (
  <SimpleCatalogManager
    columnasCalculadas={[
      {
        label: "Por defecto",
        encabezado: (
          <span className="inline-flex items-center gap-2">
            Por defecto
            <LimpiarDefaultArca campo="puestoDesempenado" queEs="el puesto desempeñado" />
          </span>
        ),
        render: (item) => <DefaultArcaStar campo="puestoDesempenado" valor={String(item.externalId || "")} nombre={`${item.externalId} — ${item.name}`} queEs="el puesto desempeñado" />,
      },
    ]}
    title="Puestos Desempeñados"
    {...encabezadoDeAmbito("puestos-desempenados")}
    icon={faUserTie}
    entityLabel="puesto desempeñado"
    api={api}
    templateBaseName="arca_puestos_desempenados"
    externalIdLabel="Código"
    externalIdPlaceholder="Ej: 2455"
    formatExternalId={formatCodigo}
    sanitizeExternalId={(v) => v.replace(/\D/g, "")}
  />
);

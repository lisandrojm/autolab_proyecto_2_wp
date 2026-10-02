import React from "react";
import { faIdBadge } from "@fortawesome/free-solid-svg-icons";
import { encabezadoDeAmbito } from "../config/nomencladoresArca";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { DefaultArcaStar, LimpiarDefaultArca } from "../components/arca/DefaultArcaStar";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const api = createSimpleCatalogApi("/arca/situaciones-revista");

/** El código de ARCA se guarda con ceros a la izquierda (2 díg.), tal como va en el registro de 85. */
const formatCodigo = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.padStart(2, "0").slice(-2) : "";
};

/**
 * Situaciones de revista de ARCA. Solo las informa el registro de 85 (Altas Masivas, pos. 84-85).
 *
 * Sin ★ rige «01 — Activo», que es lo que es toda alta nueva: marcar otra cambia todas las altas
 * URGENTE de las empleadoras que no tengan la suya.
 */
export const ArcaSituacionesRevistaPage: React.FC = () => (
  <SimpleCatalogManager
    columnasCalculadas={[
      {
        label: "Por defecto",
        encabezado: (
          <span className="inline-flex items-center gap-2">
            Por defecto
            <LimpiarDefaultArca campo="situacionRevista" queEs="la situación de revista" />
          </span>
        ),
        render: (item) => <DefaultArcaStar campo="situacionRevista" valor={String(item.externalId || "")} nombre={`${item.externalId} — ${item.name}`} queEs="la situación de revista" />,
      },
    ]}
    title="Situaciones de Revista"
    {...encabezadoDeAmbito("situaciones-revista")}
    icon={faIdBadge}
    entityLabel="situación de revista"
    api={api}
    templateBaseName="arca_situaciones_revista"
    externalIdLabel="Código"
    externalIdPlaceholder="Ej: 01"
    formatExternalId={formatCodigo}
    sanitizeExternalId={(v) => v.replace(/\D/g, "")}
  />
);

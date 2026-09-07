import React from "react";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import { encabezadoDeAmbito, nomencladorPorId, rotuloColumnaEmpresas } from "../config/nomencladoresArca";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { DefaultArcaStar, LimpiarDefaultArca } from "../components/arca/DefaultArcaStar";
import { ColumnaEmpresasArca, useVinculoArca } from "../components/arca/EmpresasDelItemArca";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const api = createSimpleCatalogApi("/arca/modalidades-liquidacion");

/** El código de ARCA se guarda con ceros a la izquierda: es lo que espera el TXT de alta (1 díg.). */
const formatCodigo = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.padStart(1, "0").slice(-1) : "";
};

export const ArcaModalidadesLiquidacionPage: React.FC = () => {
  // Las empresas que usan cada código. Ver `useVinculoArca`.
  const { empresas, recargar, asignadasDe } = useVinculoArca('modalidadLiquidacion');

  return (
  <SimpleCatalogManager
    columnasCalculadas={[
      {
        // «Habilitadas para», no «Empresas»: acá la lista NO es un registro ante ARCA sino un
        // recorte nuestro. El rótulo sale de `rotuloColumnaEmpresas` para que las dos clases de
        // columna no puedan volver a llamarse igual por descuido.
        label: rotuloColumnaEmpresas(nomencladorPorId("modalidades-liquidacion")!),
        render: (item) => <ColumnaEmpresasArca tipo="modalidadLiquidacion" itemId={item._id} itemLabel={`${item.externalId || ""} ${item.name}`.trim()} empresas={empresas} asignadas={asignadasDe(item._id)} onGuardado={recargar} />,
      },
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

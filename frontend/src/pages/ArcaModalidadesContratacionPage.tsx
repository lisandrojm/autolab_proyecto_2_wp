import React from "react";
import { faFileContract } from "@fortawesome/free-solid-svg-icons";
import { encabezadoDeAmbito, nomencladorPorId, rotuloColumnaEmpresas } from "../config/nomencladoresArca";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { DefaultArcaStar, LimpiarDefaultArca } from "../components/arca/DefaultArcaStar";
import { ColumnaEmpresasArca, useVinculoArca } from "../components/arca/EmpresasDelItemArca";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const api = createSimpleCatalogApi("/arca/modalidades-contratacion");

/** El código de ARCA se guarda con ceros a la izquierda: es lo que espera el TXT de alta (3 díg.). */
const formatCodigo = (raw: string): string => {
  const digits = raw.replace(/\D/g, "");
  return digits ? digits.padStart(3, "0").slice(-3) : "";
};

export const ArcaModalidadesContratacionPage: React.FC = () => {
  // Las empresas que usan cada código. Ver `useVinculoArca`.
  const { empresas, recargar, asignadasDe } = useVinculoArca('modalidadContratacion');

  return (
  <SimpleCatalogManager
    columnasCalculadas={[
      {
        // «Habilitadas para», no «Empresas»: acá la lista NO es un registro ante ARCA sino un
        // recorte nuestro. El rótulo sale de `rotuloColumnaEmpresas` para que las dos clases de
        // columna no puedan volver a llamarse igual por descuido.
        label: rotuloColumnaEmpresas(nomencladorPorId("modalidades-contratacion")!),
        render: (item) => <ColumnaEmpresasArca tipo="modalidadContratacion" itemId={item._id} itemLabel={`${item.externalId || ""} ${item.name}`.trim()} empresas={empresas} asignadas={asignadasDe(item._id)} onGuardado={recargar} />,
      },
      {
        label: "Por defecto",
        encabezado: (
          <span className="inline-flex items-center gap-2">
            Por defecto
            <LimpiarDefaultArca campo="modalidadContratacion" queEs="la modalidad de contratación" />
          </span>
        ),
        render: (item) => <DefaultArcaStar campo="modalidadContratacion" valor={String(item.externalId || "")} nombre={`${item.externalId} — ${item.name}`} queEs="la modalidad de contrato" />,
      },
    ]}
    title="Modalidades de Contrato"
    {...encabezadoDeAmbito("modalidades-contratacion")}
    icon={faFileContract}
    entityLabel="modalidad de contrato"
    api={api}
    templateBaseName="arca_modalidades_contratacion"
    externalIdLabel="Código"
    externalIdPlaceholder="Ej: 022"
    formatExternalId={formatCodigo}
    sanitizeExternalId={(v) => v.replace(/\D/g, "")}
    helpKey="arcaModalidadContratacion"
  />
  );
};

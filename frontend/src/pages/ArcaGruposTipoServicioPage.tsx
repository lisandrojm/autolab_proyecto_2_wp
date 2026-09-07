import React from "react";
import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { encabezadoDeAmbito, nomencladorPorId, rotuloColumnaEmpresas } from "../config/nomencladoresArca";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { DefaultArcaStar, LimpiarDefaultArca } from "../components/arca/DefaultArcaStar";
import { ColumnaEmpresasArca, useVinculoArca } from "../components/arca/EmpresasDelItemArca";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const api = createSimpleCatalogApi("/arca/grupos-tipo-servicio");

/**
 * Tabla `l_GTS` de ARCA: son dos registros y no viajan en el TXT.
 *
 * Existen para desambiguar el catálogo de Tipos de Servicio, donde 49 nombres aparecen dos veces.
 * Es la misma relación que Convenio → Categoría y Domicilio → Actividad: el grupo se elige primero y
 * recorta la lista de abajo.
 */
export const ArcaGruposTipoServicioPage: React.FC = () => {
  // Las empresas que usan cada código. Ver `useVinculoArca`.
  const { empresas, recargar, asignadasDe } = useVinculoArca('grupoTipoServicio');

  return (
  <SimpleCatalogManager
    columnasCalculadas={[
      {
        // «Habilitadas para», no «Empresas»: acá la lista NO es un registro ante ARCA sino un
        // recorte nuestro. El rótulo sale de `rotuloColumnaEmpresas` para que las dos clases de
        // columna no puedan volver a llamarse igual por descuido.
        label: rotuloColumnaEmpresas(nomencladorPorId("grupos-tipo-servicio")!),
        render: (item) => <ColumnaEmpresasArca tipo="grupoTipoServicio" itemId={item._id} itemLabel={`${item.externalId || ""} ${item.name}`.trim()} empresas={empresas} asignadas={asignadasDe(item._id)} onGuardado={recargar} />,
      },
      {
        label: "Por defecto",
        encabezado: (
          <span className="inline-flex items-center gap-2">
            Por defecto
            <LimpiarDefaultArca campo="grupoTipoServicio" queEs="el grupo de tipo de servicio" />
          </span>
        ),
        render: (item) => <DefaultArcaStar campo="grupoTipoServicio" valor={String(item.externalId || "")} nombre={`${item.externalId} — ${item.name}`} queEs="el grupo de tipo de servicio" />,
      },
    ]}
    title="Grupos de Tipo de Servicio"
    {...encabezadoDeAmbito("grupos-tipo-servicio")}
    icon={faLayerGroup}
    entityLabel="grupo de tipo de servicio"
    api={api}
    templateBaseName="arca_grupos_tipo_servicio"
    externalIdLabel="Código"
    externalIdPlaceholder="Ej: 1"
    sanitizeExternalId={(v) => v.replace(/\D/g, "")}
    helpKey="arcaGrupoTipoServicio"
  />
  );
};

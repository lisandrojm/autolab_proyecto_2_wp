import React from "react";
import { faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const api = createSimpleCatalogApi("/arca/grupos-tipo-servicio");

/**
 * Tabla `l_GTS` de ARCA: son dos registros y no viajan en el TXT.
 *
 * Existen para desambiguar el catálogo de Tipos de Servicio, donde 49 nombres aparecen dos veces.
 * Es la misma relación que Convenio → Categoría y Domicilio → Actividad: el grupo se elige primero y
 * recorta la lista de abajo.
 */
export const ArcaGruposTipoServicioPage: React.FC = () => (
  <SimpleCatalogManager
    title="Grupos de Tipo de Servicio"
    subtitle="Tabla oficial de ARCA. Son dos —continuos y discontinuos— y filtran el selector de Tipo de Servicio."
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

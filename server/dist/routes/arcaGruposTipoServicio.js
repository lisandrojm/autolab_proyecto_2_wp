import { ArcaGrupoTipoServicio } from "../models/ArcaGrupoTipoServicio.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
// Tabla oficial de ARCA (`l_GTS`): son 2 registros y no viajan en el TXT — filtran el combo de Tipo
// de Servicio, que tiene 49 nombres repetidos. Ver `models/ArcaGrupoTipoServicio.ts`.
const router = createSimpleCatalogRouter(ArcaGrupoTipoServicio, {
    entityLabel: "Grupo de tipo de servicio",
    sheetName: "Grupos de Tipo de Servicio",
    templateFilename: "plantilla_arca_grupos_tipo_servicio.xlsx",
    sampleNames: ["CONTINUOS", "DISCONTINUOS"],
    externalIdExcelHeader: "Código",
    externalIdExcelAliases: ["Codigo", "codigo", "código"],
});
export { router as arcaGrupoTipoServicioRoutes };

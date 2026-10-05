import { ArcaTipoServicio } from "../models/ArcaTipoServicio.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
// Tabla oficial de ARCA (Simplificación Registral). El "ID Externo" genérico del catálogo es acá el
// CÓDIGO que va en el TXT de alta, con sus ceros a la izquierda: se conserva tal cual, sin sanitizar.
const router = createSimpleCatalogRouter(ArcaTipoServicio, {
    entityLabel: "Tipo de servicio",
    sheetName: "Tipos de Servicio",
    templateFilename: "plantilla_arca_tipos_servicio.xlsx",
    sampleNames: ["SERVICIOS COMUNES CONTINUOS", "TAREAS INSALUBRES"],
    externalIdExcelHeader: "Código (3 díg.)",
    externalIdExcelAliases: ["Código", "Codigo", "codigo", "código"],
    // El grupo (`l_GTS`) no va al TXT: desambigua los 49 nombres repetidos del catálogo. Se guarda como
    // campo extra para no necesitar un ABM propio ni un endpoint aparte.
    extraStringFields: [{ key: "grupo", excelHeader: "Grupo (1 continuos / 2 discontinuos)", aliases: ["Grupo", "grupo", "GTS"] }],
});
export { router as arcaTipoServicioRoutes };

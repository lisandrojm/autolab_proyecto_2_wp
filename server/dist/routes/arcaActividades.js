import { ArcaActividad } from "../models/ArcaActividad.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
// Diccionario de actividades del nomenclador de ARCA. El "ID Externo" genérico del catálogo es acá el
// CÓDIGO que va en el TXT de alta (pos. 79-84), con sus ceros a la izquierda: se conserva tal cual.
//
// OJO con para qué NO sirve: no es la lista de lo que un contrato puede declarar. Ver `ArcaActividad`.
const router = createSimpleCatalogRouter(ArcaActividad, {
    entityLabel: "Actividad",
    sheetName: "Actividades",
    templateFilename: "plantilla_arca_actividades.xlsx",
    sampleNames: ["SERVICIOS CONEXOS A LA PRODUCCION DE ESPECTACULOS TEATRALES Y MUSICALES", "PRODUCCION DE FILMES Y VIDEOCINTAS"],
    externalIdExcelHeader: "Código (6 díg.)",
    externalIdExcelAliases: ["Código", "Codigo", "codigo", "código"],
});
export { router as arcaActividadRoutes };

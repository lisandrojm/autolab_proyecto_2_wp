import { ArcaSituacionBaja } from "../models/ArcaSituacionBaja.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
// Tabla oficial de ARCA (Simplificación Registral): el MOTIVO de una baja. El "ID Externo" es el CÓDIGO
// que ARCA publica en `window.l_SBV` del formulario de baja, tal cual (sin ceros agregados).
const router = createSimpleCatalogRouter(ArcaSituacionBaja, {
    entityLabel: "Situación de baja",
    sheetName: "Situaciones de Baja",
    templateFilename: "plantilla_arca_situaciones_baja.xlsx",
    sampleNames: ["Renuncia del trabajador / ART.240 - LCT"],
    externalIdExcelHeader: "Código",
    externalIdExcelAliases: ["Código", "Codigo", "codigo", "código"],
});
export { router as arcaSituacionBajaRoutes };

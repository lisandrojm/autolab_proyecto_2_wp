import { ObraSocial } from "../models/ObraSocial.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
const router = createSimpleCatalogRouter(ObraSocial, {
    entityLabel: "Obra Social",
    sheetName: "ObrasSociales",
    templateFilename: "plantilla_obras_sociales.xlsx",
    sampleNames: ["OSDE", "Swiss Medical", "OSPLAD"],
    // Código RNOS (6 díg.) para el TXT de Alta masiva de AFIP.
    extraStringFields: [{ key: "codigoRnos", excelHeader: "Código RNOS", aliases: ["RNOS", "rnos", "codigoRnos"] }],
});
export { router as obraSocialRoutes };

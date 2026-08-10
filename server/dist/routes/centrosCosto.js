import { CentroCosto } from "../models/CentroCosto.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
const router = createSimpleCatalogRouter(CentroCosto, {
    entityLabel: "Centro de Costo",
    sheetName: "CentrosCosto",
    templateFilename: "plantilla_centros_costo.xlsx",
    sampleNames: ["Producción", "Administración", "Comercial"],
});
export { router as centroCostoRoutes };

import { PaisResidencia } from "../models/PaisResidencia.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
// El país del DOMICILIO. Ver `models/PaisResidencia.ts` para por qué es un catálogo aparte del de FRAME.
const router = createSimpleCatalogRouter(PaisResidencia, {
    entityLabel: "País de residencia",
    sheetName: "Países de residencia",
    templateFilename: "plantilla_paises_residencia.xlsx",
    sampleNames: ["Argentina", "Uruguay", "Chile"],
    // Activo = se ofrece en los formularios de domicilio. Se apaga desde el ABM, sin borrar el país.
    extraBooleanFields: [{ key: "activo" }],
});
export { router as paisResidenciaRoutes };

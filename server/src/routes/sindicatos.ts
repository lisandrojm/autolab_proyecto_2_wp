import { Sindicato } from "../models/Sindicato.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";

const router = createSimpleCatalogRouter(Sindicato, {
  entityLabel: "Sindicato",
  sheetName: "Sindicatos",
  templateFilename: "plantilla_sindicatos.xlsx",
  sampleNames: ["Sindicato Argentino de Televisión (SATSAID)", "Unión Obrera de la Construcción (UOCRA)", "Sindicato Único de Trabajadores del Espectáculo Público (SUTEP)"],
  extraStringFields: [{ key: "sigla", excelHeader: "Sigla", aliases: ["sigla", "SIGLA", "Sigla"] }],
});

export { router as sindicatoRoutes };

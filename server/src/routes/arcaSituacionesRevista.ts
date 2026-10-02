import { ArcaSituacionRevista } from "../models/ArcaSituacionRevista.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";

// Tabla oficial de ARCA (Simplificación Registral). El "ID Externo" genérico del catálogo es acá el
// CÓDIGO que va en el TXT de alta, con sus ceros a la izquierda: se conserva tal cual, sin sanitizar.
const router = createSimpleCatalogRouter(ArcaSituacionRevista, {
  entityLabel: "Situación de revista",
  sheetName: "Situaciones de Revista",
  templateFilename: "plantilla_arca_situaciones_revista.xlsx",
  sampleNames: ["Activo"],
  externalIdExcelHeader: "Código (2 díg.)",
  externalIdExcelAliases: ["Código", "Codigo", "codigo", "código"],
});

export { router as arcaSituacionRevistaRoutes };

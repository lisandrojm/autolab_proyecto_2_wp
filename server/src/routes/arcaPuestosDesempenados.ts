import { ArcaPuestoDesempenado } from "../models/ArcaPuestoDesempenado.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";

// Tabla oficial de ARCA (Simplificación Registral). El "ID Externo" genérico del catálogo es acá el
// CÓDIGO que va en el TXT de alta, con sus ceros a la izquierda: se conserva tal cual, sin sanitizar.
const router = createSimpleCatalogRouter(ArcaPuestoDesempenado, {
  entityLabel: "Puesto desempeñado",
  sheetName: "Puestos Desempeñados",
  templateFilename: "plantilla_arca_puestos_desempenados.xlsx",
  sampleNames: ["Actores y directores de cine, radio, teatro, televisión y afines"],
  externalIdExcelHeader: "Código (4 díg.)",
  externalIdExcelAliases: ["Código", "Codigo", "codigo", "código"],
});

export { router as arcaPuestoDesempenadoRoutes };

import { ArcaModalidadLiquidacion } from "../models/ArcaModalidadLiquidacion.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";

// Tabla oficial de ARCA (Simplificación Registral). El "ID Externo" genérico del catálogo es acá el
// CÓDIGO que va en el TXT de alta, con sus ceros a la izquierda: se conserva tal cual, sin sanitizar.
const router = createSimpleCatalogRouter(ArcaModalidadLiquidacion, {
  entityLabel: "Modalidad de liquidación",
  sheetName: "Modalidades de Liquidación",
  templateFilename: "plantilla_arca_modalidades_liquidacion.xlsx",
  sampleNames: ["MES", "QUINCENA", "JORNAL"],
  externalIdExcelHeader: "Código (1 díg.)",
  externalIdExcelAliases: ["Código", "Codigo", "codigo", "código"],
});

export { router as arcaModalidadLiquidacionRoutes };

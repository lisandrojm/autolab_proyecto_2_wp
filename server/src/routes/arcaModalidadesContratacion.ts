import { ArcaModalidadContratacion } from "../models/ArcaModalidadContratacion.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";

// Tabla oficial de ARCA (Simplificación Registral). El "ID Externo" genérico del catálogo es acá el
// CÓDIGO que va en el TXT de alta, con sus ceros a la izquierda: se conserva tal cual, sin sanitizar.
const router = createSimpleCatalogRouter(ArcaModalidadContratacion, {
  entityLabel: "Modalidad de contratación",
  sheetName: "Modalidades de Contratación",
  templateFilename: "plantilla_arca_modalidades_contratacion.xlsx",
  sampleNames: ["A tiempo completo indeterminado/Trabajo permanente", "A tiempo completo determinado (contrato a plazo fijo)"],
  externalIdExcelHeader: "Código (3 díg.)",
  externalIdExcelAliases: ["Código", "Codigo", "codigo", "código"],
});

export { router as arcaModalidadContratacionRoutes };

import { Convenio } from "../models/Convenio.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";

/**
 * Catálogo de Convenios Colectivos de Trabajo (CCT).
 *
 * Los encabezados de la plantilla y del import coinciden con los de la tabla informativa de AFIP
 * (Código / Actividad / Signatario), así que el XLSX que genera
 * `src/scripts/convenios/conveniosToXlsx.ts` se importa sin tocar nada.
 */
const router = createSimpleCatalogRouter(Convenio, {
  entityLabel: "Convenio",
  sheetName: "Convenios",
  templateFilename: "plantilla_convenios.xlsx",
  sampleNames: ["EMPLEADOS DE COMERCIO", "MECÁNICOS Y AFINES DEL TRANSPORTE"],
  externalIdExcelHeader: "Código",
  externalIdExcelAliases: ["Codigo", "CCT", "Código CCT", "codigo"],
  nombreExcelHeader: "Actividad",
  nombreExcelAliases: ["actividad", "Descripción Actividad", "DESCRIPCIÓN ACTIVIDAD"],
  extraStringFields: [{ key: "signatario", excelHeader: "Signatario", aliases: ["signatario", "Descripción Signatario", "DESCRIPCIÓN SIGNATARIO"] }],
  // El código CCT es "NNNN/AA": conserva la barra y los ceros a la izquierda, así que solo se
  // limpian espacios. Sacarle los no-dígitos (como en el RNOS) perdería el año del convenio.
  sanitizeExternalId: (v) => v.trim(),
});

export { router as convenioRoutes };

import { ObraSocial } from "../models/ObraSocial.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";

const router = createSimpleCatalogRouter(ObraSocial, {
  entityLabel: "Obra Social",
  sheetName: "ObrasSociales",
  templateFilename: "plantilla_obras_sociales.xlsx",
  sampleNames: ["OSDE", "Swiss Medical", "OSPLAD"],
  // Para Obras Sociales el "ID Externo" genérico de FRAME siempre fue el código RNOS (6 díg., para
  // el TXT de Alta masiva de AFIP): no hace falta un campo separado, solo tratarlo como tal.
  externalIdExcelHeader: "RNOS",
  externalIdExcelAliases: ["Código RNOS", "codigoRnos", "rnos"],
  sanitizeExternalId: (v) => v.replace(/\D/g, ""),
});

export { router as obraSocialRoutes };

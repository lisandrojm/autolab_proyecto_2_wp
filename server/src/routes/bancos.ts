import { Banco } from "../models/Banco.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";

const router = createSimpleCatalogRouter(Banco, {
  entityLabel: "Entidad financiera",
  sheetName: "Entidades Financieras",
  templateFilename: "plantilla_entidades_financieras.xlsx",
  sampleNames: ["Banco de la Nación Argentina", "Mercado Pago", "Banco Galicia"],
  extraStringFields: [{ key: "tipoEntidad", excelHeader: "Tipo de Entidad", aliases: ["tipoEntidad", "Tipo", "tipo"] }],
});

export { router as bancoRoutes };

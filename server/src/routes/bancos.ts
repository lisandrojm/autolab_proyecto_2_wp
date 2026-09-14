import { Banco } from "../models/Banco.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";

const router = createSimpleCatalogRouter(Banco, {
  entityLabel: "Entidad financiera",
  sheetName: "Entidades Financieras",
  templateFilename: "plantilla_entidades_financieras.xlsx",
  sampleNames: ["Banco de la Nación Argentina", "Mercado Pago", "Banco Galicia"],
  extraStringFields: [{ key: "tipoEntidad", excelHeader: "Tipo de Entidad", aliases: ["tipoEntidad", "Tipo", "tipo"] }],
  // Activa = se ofrece en los selectores. Se apaga desde el ABM, sin borrar la entidad.
  extraBooleanFields: [{ key: "activo" }],
});

export { router as bancoRoutes };

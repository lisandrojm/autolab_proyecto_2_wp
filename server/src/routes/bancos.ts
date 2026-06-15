import { Banco } from "../models/Banco.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";

const router = createSimpleCatalogRouter(Banco, {
  entityLabel: "Banco",
  sheetName: "Bancos",
  templateFilename: "plantilla_bancos.xlsx",
  sampleNames: ["Banco de la Nación Argentina", "Banco Galicia", "Banco Santander"],
});

export { router as bancoRoutes };

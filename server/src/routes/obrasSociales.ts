import { Router } from "express";
import { ObraSocial } from "../models/ObraSocial.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";

const router = Router();

/**
 * Obras Sociales: catálogo y nada más.
 *
 * Tenía un `PATCH /:id/por-defecto` para marcar una obra social GLOBAL, que se aplicaba cuando la
 * cascada no resolvía ninguna. Se eliminó junto con ese nivel: solo se usaba cuando faltaba
 * configurar algo aguas arriba —casi siempre un convenio sin obra social— y lo único que lograba era
 * rellenar el campo con un valor sin fundamento. ARCA lo acepta igual, así que el error recién se
 * descubría con el alta ya presentada. Ahora ese caso se marca como faltante y no se genera el TXT.
 *
 * La obra social se decide en tres lugares, y ninguno es este: la persona (desregulación), el
 * convenio de su categoría (con la excepción por empleadora), y la empleadora solo para los
 * excluidos de convenio (9999/99).
 *
 * `data.porDefecto` queda en los documentos que lo tengan: ya no lo lee nadie y borrarlo pediría una
 * migración para no ganar nada.
 */
router.use(
  createSimpleCatalogRouter(ObraSocial, {
    entityLabel: "Obra Social",
    sheetName: "ObrasSociales",
    templateFilename: "plantilla_obras_sociales.xlsx",
    sampleNames: ["OSDE", "Swiss Medical", "OSPLAD"],
    // Para Obras Sociales el "ID Externo" genérico de FRAME siempre fue el código RNOS (6 díg., para
    // el TXT de Alta masiva de AFIP): no hace falta un campo separado, solo tratarlo como tal.
    externalIdExcelHeader: "RNOS",
    externalIdExcelAliases: ["Código RNOS", "codigoRnos", "rnos"],
    sanitizeExternalId: (v) => v.replace(/\D/g, ""),
  }),
);

export { router as obraSocialRoutes };

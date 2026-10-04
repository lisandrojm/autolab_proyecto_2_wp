import multer from "multer";
import { Response } from "express";
import { ArcaPuestoDesempenado } from "../models/ArcaPuestoDesempenado.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { filasDesdeArchivo, filasDesdeEspejo, importarPuestos, puestoPorDefectoDe, usosDelPuesto } from "../services/arca/puestosDesempenados.js";

/*
  Tabla oficial de ARCA: puesto desempeñado (4 díg.). Solo la usa el registro de 85 (Altas Masivas,
  pos. 29-32). El código se guarda con sus ceros a la izquierda y es único.

  · `activo`: un puesto en uso no se borra (ver `antesDeBorrar`): se desactiva.
  · `origen`: lo cargado o corregido a mano queda `manual`, y la importación de la tabla no lo pisa.
*/
const router = createSimpleCatalogRouter(ArcaPuestoDesempenado, {
  entityLabel: "Puesto desempeñado",
  sheetName: "Puestos Desempeñados",
  templateFilename: "plantilla_arca_puestos_desempenados.xlsx",
  sampleNames: ["Actores y directores de cine, radio, teatro, televisión y afines"],
  externalIdExcelHeader: "Código (4 díg.)",
  externalIdExcelAliases: ["Código", "Codigo", "codigo", "código"],
  sanitizeExternalId: (v) => {
    const d = String(v || "").replace(/\D/g, "");
    return d ? d.slice(-4).padStart(4, "0") : "";
  },
  extraBooleanFields: [{ key: "activo" }],
  alEditarAMano: { origen: "manual" },
  antesDeBorrar: (item: any) => usosDelPuesto(item?.externalId),
});

/**
 * POST /arca/puestos-desempenados/importar-arca — la tabla oficial desde el espejo de ARCA (lo último
 * leído de la pantalla de altas, o la semilla del CSV). Upsert por código; devuelve el resumen.
 */
/**
 * GET /arca/puestos-desempenados/por-defecto?rolFrameId=&categoriaSatId=&empresaId=
 *
 * El puesto que le toca por defecto a un contrato con esos datos (ver `puestoPorDefectoDe`). Lo usa
 * «Configurar Miembro» para mostrar el campo siempre cargado. Sólo lee.
 */
router.get("/por-defecto", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await puestoPorDefectoDe({ rolFrameId: req.query.rolFrameId, categoriaSatId: req.query.categoriaSatId, empresaId: req.query.empresaId }));
  } catch (error) {
    console.error("Puesto por defecto error:", error);
    res.status(500).json({ error: "No se pudo resolver el puesto por defecto." });
  }
});

router.post("/importar-arca", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const filas = await filasDesdeEspejo();
    if (filas.length === 0) return res.status(400).json({ error: "El catálogo de ARCA no tiene la tabla de puestos. Sembralo o leelo de ARCA (Configuración → ARCA → Catálogo de ARCA)." });
    res.json(await importarPuestos(filas));
  } catch (error) {
    console.error("Importar puestos (ARCA) error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

/** POST /arca/puestos-desempenados/importar-archivo — el CSV oficial o una planilla código/descripción. */
router.post("/importar-archivo", authenticateToken, multer({ storage: multer.memoryStorage() }).single("file"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Subí el archivo de la tabla." });
    const filas = filasDesdeArchivo(req.file.buffer, req.file.originalname || "");
    if (filas.length === 0) return res.status(400).json({ error: "El archivo no trae puestos: se espera el CSV oficial (filas PUESTO_DESEMPENADO) o una planilla con columnas Código y Descripción." });
    res.json(await importarPuestos(filas));
  } catch (error) {
    console.error("Importar puestos (archivo) error:", error);
    res.status(500).json({ error: "No se pudo leer el archivo." });
  }
});

export { router as arcaPuestoDesempenadoRoutes };

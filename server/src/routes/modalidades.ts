import { Router, Response, NextFunction } from "express";
import { Modalidad } from "../models/Modalidad.js";
import UserProject from "../models/UserProject.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { asegurarModalidades } from "../services/modalidades.js";

/**
 * ABM de modalidades de trabajo (Presencial, Remoto, Híbrido). Catálogo simple del tenant con las
 * mismas dos reglas propias que Valoraciones: la por defecto es una sola, y lo que está en uso no se
 * borra (se apaga).
 */
const router = Router();
type Req = AuthenticatedRequest & TenantRequest;

/** La primera vez que una productora abre la lista, ya trae Presencial (por defecto), Remoto e Híbrido. */
const sembrar = async (req: Req, _res: Response, next: NextFunction) => {
  try {
    if (req.tenantObjectId) await asegurarModalidades(req.tenantObjectId);
  } catch (e) {
    console.error("No se pudieron sembrar las modalidades:", e);
  }
  next();
};

/** Al marcar una como por defecto se apagan las demás (después de guardar; ver Valoraciones). */
const exclusividadDeDefault = async (req: Req, res: Response, next: NextFunction) => {
  const body = req.body as Record<string, unknown>;
  if (!(body.esDefault === true || body.esDefault === "true")) return next();
  const jsonOriginal = res.json.bind(res);
  let guardadoId: string | undefined = req.params.id;
  res.json = ((cuerpo: unknown) => {
    const id = (cuerpo as { _id?: unknown } | null)?._id;
    if (id) guardadoId = String(id);
    return jsonOriginal(cuerpo);
  }) as Response["json"];
  res.on("finish", () => {
    if (res.statusCode >= 400) return;
    Modalidad.updateMany({ tenantId: req.tenantObjectId, esDefault: true, ...(guardadoId ? { _id: { $ne: guardadoId } } : {}) }, { $set: { esDefault: false } }).catch((e) =>
      console.error("No se pudieron apagar las otras modalidades por defecto:", e),
    );
  });
  return next();
};

/** Ni borrar ni apagar la por defecto: un contrato sin modalidad no tendría a cuál caer. */
const protegerDefault = async (req: Req, res: Response, next: NextFunction) => {
  try {
    const actual: any = await Modalidad.findOne({ _id: req.params.id, tenantId: req.tenantObjectId }).select("name esDefault").lean();
    if (!actual?.esDefault) return next();
    const body = (req.body || {}) as Record<string, unknown>;
    const borra = req.method === "DELETE";
    const apaga = body.activo === false || body.activo === "false";
    const desmarca = body.esDefault === false || body.esDefault === "false";
    if (borra || apaga || desmarca) {
      return res.status(400).json({ error: `«${actual.name}» es la modalidad por defecto. Marcá otra como por defecto antes de ${borra ? "borrarla" : apaga ? "desactivarla" : "sacarle la marca"}.` });
    }
    return next();
  } catch (error) {
    console.error("Proteger modalidad por defecto error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/** Una modalidad que tiene algún contrato no se borra: se apaga (sigue mostrando su nombre). */
const bloquearBorradoEnUso = async (req: Req, res: Response, next: NextFunction) => {
  try {
    const existe: any = await Modalidad.findOne({ _id: req.params.id, tenantId: req.tenantObjectId }).select("name").lean();
    if (!existe) return next();
    const contratos = await UserProject.countDocuments({ "contracts.modalidadId": existe._id });
    if (contratos === 0) return next();
    return res.status(409).json({ error: `«${existe.name}» está en ${contratos} contrato(s). No se puede borrar: desactivala (Estado → Inactiva) y deja de ofrecerse en los contratos nuevos.`, contratos });
  } catch (error) {
    console.error("Verificar uso de modalidad error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

router.post("/import", requireTenant, authenticateToken, (_req, res) => {
  res.status(405).json({ error: "Las modalidades se cargan a mano." });
});
router.post("/bulk", requireTenant, authenticateToken, (_req, res) => {
  res.status(405).json({ error: "Las modalidades se cargan a mano." });
});

router.get("/", requireTenant, authenticateToken, sembrar);
router.post("/", requireTenant, authenticateToken, exclusividadDeDefault);
router.put("/:id", requireTenant, authenticateToken, protegerDefault, exclusividadDeDefault);
router.delete("/:id", requireTenant, authenticateToken, protegerDefault, bloquearBorradoEnUso);

router.use(
  createSimpleCatalogRouter(Modalidad, {
    entityLabel: "Modalidad",
    sheetName: "Modalidades",
    templateFilename: "plantilla_modalidades.xlsx",
    sampleNames: ["Presencial", "Remoto", "Híbrido"],
    tenantScoped: true,
    extraNumberFields: [{ key: "orden" }],
    extraBooleanFields: [{ key: "activo" }, { key: "esDefault" }],
    filtrosPermitidos: ["activo"],
  }),
);

export { router as modalidadRoutes };

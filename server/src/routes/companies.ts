import { Router, Response } from "express";
import { z } from "zod";
import { Company } from "../models/Company.js";
import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { Convenio } from "../models/Convenio.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";

// ABM de Empresas / Productoras (datos para armar contratos).
// Catálogo global (sin tenantId), igual que el resto de config: solo authenticateToken.
const router = Router();

const companySchema = z.object({
  razonSocial: z.string().min(1, "La razón social es obligatoria"),
  cuit: z.string().optional().default(""),
  domicilioCalle: z.string().optional().default(""),
  domicilioNumero: z.string().optional().default(""),
  domicilioPisoDepto: z.string().optional().default(""),
  localidad: z.string().optional().default(""),
  provincia: z.string().optional().default(""),
  codigoPostal: z.string().optional().default(""),
  firmanteNombre: z.string().optional().default(""),
  firmanteDni: z.string().optional().default(""),
  firmanteCargo: z.string().optional().default(""),
  representanteLegalNombre: z.string().optional().default(""),
  representanteLegalEmail: z.string().optional().default(""),
  logoUrl: z.string().optional().default(""),
  signatureUrl: z.string().optional().default(""),
  /** Obra social por defecto de esta empresa. `null` = usar la global del catálogo. */
  obraSocialDefaultId: z.number().nullable().optional(),
  /**
   * Nombre viejo de `obraSocialDefaultId`. Se sigue aceptando para no romper a un cliente sin
   * actualizar; `normalizar()` lo traduce y nunca se guarda con este nombre.
   */
  obraSocialId: z.number().nullable().optional(),
  /** Ids del catálogo de Obras Sociales registradas ante ARCA para este CUIT. Reemplaza la lista. */
  obrasSocialesIds: z.array(z.string()).optional(),
  /** Excepciones por convenio: para ese CCT, esta empleadora usa otra obra social. Reemplaza la lista. */
  convenioObraSocialOverrides: z.array(z.object({ convenioId: z.string(), obraSocialId: z.number() })).optional(),
  /** Ids del catálogo de Convenios. Se manda la lista completa: reemplaza la anterior. */
  convenioIds: z.array(z.string()).optional(),
  /** Ids del catálogo de Sucursales de ARCA. Se manda la lista completa: reemplaza la anterior. */
  sucursalIds: z.array(z.string()).optional(),
  /** Elección habitual de esta empleadora dentro del nomenclador, para no repetirla en cada alta. */
  defaultsArca: z
    .object({
      tipoServicio: z.string().optional().default(""),
      modalidadLiquidacion: z.string().optional().default(""),
    })
    .optional(),
});

/**
 * Traduce el nombre viejo del campo y deja UNA sola forma en la base.
 *
 * Sin esto convivirían `obraSocialId` y `obraSocialDefaultId` en documentos distintos, y resolver el
 * RNOS por defecto dependería de qué cliente escribió último — el tipo de bug que ya costó una
 * migración con las categorías.
 */
const normalizar = (data: Record<string, any>): Record<string, any> => {
  const { obraSocialId, ...resto } = data;
  if (obraSocialId !== undefined && resto.obraSocialDefaultId === undefined) resto.obraSocialDefaultId = obraSocialId;
  return resto;
};

// GET /companies
router.get("/", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const items = await Company.find().sort({ razonSocial: 1 }).lean();
    // Se sirven los dos nombres mientras haya consumidores del viejo. El que manda es el nuevo: si
    // el documento ya migró, `obraSocialId` es un espejo de solo lectura.
    res.json(items.map((c: any) => ({ ...c, obraSocialId: c.obraSocialDefaultId ?? c.obraSocialId ?? null, obraSocialDefaultId: c.obraSocialDefaultId ?? c.obraSocialId ?? null })));
  } catch (error) {
    console.error("List companies error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /companies
router.post("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const created = await Company.create(normalizar(companySchema.parse(req.body)));
    res.status(201).json(created);
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
    }
    console.error("Create company error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /companies/:id
router.put("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = normalizar(companySchema.partial().parse(req.body));
    // `$unset` del nombre viejo en cada guardado: así el documento queda con una sola forma en cuanto
    // se lo toca, sin depender de que la migración haya corrido.
    const updated = await Company.findByIdAndUpdate(req.params.id, { $set: data, $unset: { obraSocialId: "" } }, { new: true });
    if (!updated) return res.status(404).json({ error: "Empresa no encontrada" });
    res.json(updated);
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
    }
    console.error("Update company error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /companies/:id/obras-sociales-en-uso
 *
 * Por cada obra social, a cuántos contratos de ESTA empleadora alcanza. Es lo que hay que saber antes
 * de sacar una de su lista de registradas: quitarla deja esas altas con un RNOS que ARCA va a
 * rechazar, y hoy eso pasaba en silencio.
 *
 * Cuenta las dos formas en que un contrato termina usándola:
 *  - `contratos`: la tiene FIJADA en el contrato (constatada o manual).
 *  - `convenios`: la hereda de un CCT que esta empleadora registró — sea la sindical del convenio o
 *    una excepción que ella misma puso. Acá se devuelven los códigos de esos CCT, porque el número de
 *    contratos afectados depende de qué categoría tenga cada uno y eso se resuelve en el cliente.
 */
router.get("/:id/obras-sociales-en-uso", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const empresa = await Company.findById(req.params.id).select("convenioIds convenioObraSocialOverrides").lean();
    if (!empresa) return res.status(404).json({ error: "Empresa no encontrada" });

    const filas = await UserProject.aggregate([
      { $unwind: "$contracts" },
      { $match: { "contracts.empresaContratoId": new Types.ObjectId(req.params.id), "contracts.obraSocialId": { $ne: null } } },
      { $group: { _id: "$contracts.obraSocialId", total: { $sum: 1 } } },
    ]);

    const contratos: Record<string, number> = {};
    for (const f of filas as any[]) if (f._id != null) contratos[String(f._id)] = f.total;

    // Convenios registrados por la empleadora que apuntan a cada obra social (la sindical o su excepción).
    const convenios = await Convenio.find({ _id: { $in: (empresa as any).convenioIds || [] } })
      .select("externalId obraSocialDefaultId")
      .lean();
    const overrides = new Map(((empresa as any).convenioObraSocialOverrides || []).map((o: any) => [String(o.convenioId), Number(o.obraSocialId)]));

    const porConvenio: Record<string, string[]> = {};
    for (const cv of convenios as any[]) {
      const osId = overrides.has(String(cv._id)) ? overrides.get(String(cv._id)) : cv.obraSocialDefaultId;
      if (osId == null) continue;
      const k = String(osId);
      porConvenio[k] = [...(porConvenio[k] || []), String(cv.externalId || "")];
    }

    res.json({ contratos, convenios: porConvenio });
  } catch (error) {
    console.error("Obras sociales en uso error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /companies/:id
router.delete("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const deleted = await Company.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Empresa no encontrada" });
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete company error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as companyRoutes };

import { Router } from "express";
import { z } from "zod";
import { Company } from "../models/Company.js";
import { authenticateToken } from "../middleware/auth.js";
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
const normalizar = (data) => {
    const { obraSocialId, ...resto } = data;
    if (obraSocialId !== undefined && resto.obraSocialDefaultId === undefined)
        resto.obraSocialDefaultId = obraSocialId;
    return resto;
};
// GET /companies
router.get("/", authenticateToken, async (_req, res) => {
    try {
        const items = await Company.find().sort({ razonSocial: 1 }).lean();
        // Se sirven los dos nombres mientras haya consumidores del viejo. El que manda es el nuevo: si
        // el documento ya migró, `obraSocialId` es un espejo de solo lectura.
        res.json(items.map((c) => ({ ...c, obraSocialId: c.obraSocialDefaultId ?? c.obraSocialId ?? null, obraSocialDefaultId: c.obraSocialDefaultId ?? c.obraSocialId ?? null })));
    }
    catch (error) {
        console.error("List companies error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /companies
router.post("/", authenticateToken, async (req, res) => {
    try {
        const created = await Company.create(normalizar(companySchema.parse(req.body)));
        res.status(201).json(created);
    }
    catch (error) {
        if (error?.name === "ZodError") {
            return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
        }
        console.error("Create company error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PUT /companies/:id
router.put("/:id", authenticateToken, async (req, res) => {
    try {
        const data = normalizar(companySchema.partial().parse(req.body));
        // `$unset` del nombre viejo en cada guardado: así el documento queda con una sola forma en cuanto
        // se lo toca, sin depender de que la migración haya corrido.
        const updated = await Company.findByIdAndUpdate(req.params.id, { $set: data, $unset: { obraSocialId: "" } }, { new: true });
        if (!updated)
            return res.status(404).json({ error: "Empresa no encontrada" });
        res.json(updated);
    }
    catch (error) {
        if (error?.name === "ZodError") {
            return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
        }
        console.error("Update company error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /companies/:id
router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const deleted = await Company.findByIdAndDelete(req.params.id);
        if (!deleted)
            return res.status(404).json({ error: "Empresa no encontrada" });
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Delete company error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as companyRoutes };

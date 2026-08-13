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
    obraSocialId: z.number().nullable().optional(),
});
// GET /companies
router.get("/", authenticateToken, async (_req, res) => {
    try {
        const items = await Company.find().sort({ razonSocial: 1 }).lean();
        res.json(items);
    }
    catch (error) {
        console.error("List companies error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /companies
router.post("/", authenticateToken, async (req, res) => {
    try {
        const data = companySchema.parse(req.body);
        const created = await Company.create(data);
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
        const data = companySchema.partial().parse(req.body);
        const updated = await Company.findByIdAndUpdate(req.params.id, data, { new: true });
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

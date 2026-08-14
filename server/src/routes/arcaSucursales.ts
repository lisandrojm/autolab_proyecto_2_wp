import { Router, Response } from "express";
import { z } from "zod";
import { ArcaSucursal } from "../models/ArcaSucursal.js";
import { Company } from "../models/Company.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";

/**
 * ABM de Sucursales de ARCA (Simplificación Registral). Catálogo global, mismo criterio que el resto
 * de la configuración: sin tenantId, solo `authenticateToken`.
 *
 * Acá se cargan TODOS los datos de la sucursal (código, domicilio, actividades). Las empresas
 * después solo eligen cuáles les corresponden.
 */
const router = Router();

const actividadSchema = z.object({
  codigo: z.string().regex(/^\d{1,6}$/, "El código de actividad son hasta 6 dígitos"),
  descripcion: z.string().optional().default(""),
});

const sucursalSchema = z.object({
  codigo: z.string().regex(/^\d{1,5}$/, "El código de sucursal son hasta 5 dígitos"),
  domicilio: z.string().min(1, "El domicilio es obligatorio"),
  localidad: z.string().optional().default(""),
  codigoPostal: z.string().optional().default(""),
  actividades: z.array(actividadSchema).optional().default([]),
  isActive: z.boolean().optional(),
});

/** Los códigos se guardan con los ceros a la izquierda: es lo que espera el TXT de alta. */
const pad = (valor: string, largo: number): string => valor.replace(/\D/g, "").padStart(largo, "0").slice(-largo);

const normalizar = (data: z.infer<typeof sucursalSchema>) => ({
  ...data,
  codigo: pad(data.codigo, 5),
  actividades: (data.actividades || []).map((a) => ({ codigo: pad(a.codigo, 6), descripcion: a.descripcion || "" })),
});

// GET /arca/sucursales
router.get("/", authenticateToken, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const items = await ArcaSucursal.find().sort({ codigo: 1 }).lean();
    res.json(items);
  } catch (error) {
    console.error("List arca sucursales error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /arca/sucursales
router.post("/", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = normalizar(sucursalSchema.parse(req.body));
    // El código es la identidad de la sucursal dentro del padrón: repetirlo sería declarar dos
    // domicilios distintos con el mismo número y romper el TXT sin que se note.
    if (await ArcaSucursal.findOne({ codigo: data.codigo })) {
      return res.status(400).json({ error: `Ya existe una sucursal con el código ${data.codigo}` });
    }
    const created = await ArcaSucursal.create(data);
    res.status(201).json(created);
  } catch (error: any) {
    if (error?.name === "ZodError") return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
    console.error("Create arca sucursal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /arca/sucursales/:id
router.put("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const parsed = sucursalSchema.partial().parse(req.body);
    const data = normalizar({ ...(parsed as z.infer<typeof sucursalSchema>), codigo: parsed.codigo ?? "0", actividades: parsed.actividades ?? [] });
    const update: Record<string, unknown> = {};
    if (parsed.codigo !== undefined) update.codigo = data.codigo;
    if (parsed.domicilio !== undefined) update.domicilio = parsed.domicilio;
    if (parsed.localidad !== undefined) update.localidad = parsed.localidad;
    if (parsed.codigoPostal !== undefined) update.codigoPostal = parsed.codigoPostal;
    if (parsed.actividades !== undefined) update.actividades = data.actividades;
    if (parsed.isActive !== undefined) update.isActive = parsed.isActive;

    if (update.codigo && (await ArcaSucursal.findOne({ codigo: update.codigo, _id: { $ne: req.params.id } }))) {
      return res.status(400).json({ error: `Ya existe otra sucursal con el código ${update.codigo}` });
    }

    const updated = await ArcaSucursal.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!updated) return res.status(404).json({ error: "Sucursal no encontrada" });
    res.json(updated);
  } catch (error: any) {
    if (error?.name === "ZodError") return res.status(400).json({ error: error.errors?.[0]?.message || "Datos inválidos" });
    console.error("Update arca sucursal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /arca/sucursales/:id
router.delete("/:id", authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Borrarla dejaría a las empresas apuntando a una sucursal inexistente y sus contratos sin poder
    // generar el alta, sin ninguna pista de por qué.
    const enUso = await Company.find({ sucursalIds: req.params.id }).select("razonSocial").lean();
    if (enUso.length > 0) {
      return res.status(400).json({ error: `No se puede eliminar: la usan ${enUso.map((e: any) => e.razonSocial).join(", ")}. Quitala de esas empresas primero.` });
    }
    const deleted = await ArcaSucursal.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Sucursal no encontrada" });
    res.json({ ok: true });
  } catch (error) {
    console.error("Delete arca sucursal error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as arcaSucursalRoutes };

import { Router, Response } from "express";
import { Types } from "mongoose";
import { ReleaseTipo } from "../models/ReleaseTipo.js";
import { Release } from "../models/Release.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

/**
 * Busca el ReleaseTipo por nombre (dentro del tenant) o lo crea, de forma atómica
 * (findOneAndUpdate + upsert): dos requests concurrentes disparando el backfill al mismo tiempo NO
 * deben poder crear dos ReleaseTipo con el mismo nombre. El índice único {tenantId, name} es el
 * respaldo final: si igual llegan a chocar, MongoDB solo deja pasar una y la otra recibe E11000,
 * que se resuelve leyendo la que ganó.
 */
async function buscarOCrearReleaseTipo(tenantId: Types.ObjectId, nombre: string) {
  try {
    return await ReleaseTipo.findOneAndUpdate(
      { tenantId, name: nombre },
      { $setOnInsert: { tenantId, name: nombre, isActive: true, requiereFirma: true } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error: any) {
    if (error?.code === 11000) {
      const existente = await ReleaseTipo.findOne({ tenantId, name: nombre });
      if (existente) return existente;
    }
    throw error;
  }
}

/**
 * Backfill idempotente: antes de esta feature, "Plantillas | Release" (colección `Release`) no
 * tenía ningún concepto de tipo. Para todo Release del tenant que todavía no tenga
 * `releaseTipoId`, se busca o crea un ReleaseTipo con su mismo nombre y se vincula. Se corre solo
 * (no hace falta un script manual): al no haber pendientes, es un no-op rápido.
 */
async function ensureReleaseTiposBackfilled(tenantId: Types.ObjectId): Promise<void> {
  const sinTipo = await Release.find({ tenantId, releaseTipoId: { $exists: false } });
  if (sinTipo.length === 0) return;

  for (const release of sinTipo) {
    const nombre = String(release.name || "").trim();
    if (!nombre) continue;

    const tipo = await buscarOCrearReleaseTipo(tenantId, nombre);
    if (!tipo) continue;

    release.releaseTipoId = tipo._id as any;
    await release.save();
  }
}

// GET / - listar
router.get("/", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res: Response) => {
  try {
    await ensureReleaseTiposBackfilled(req.tenantObjectId!);
    const items = await ReleaseTipo.find({ tenantId: req.tenantObjectId }).sort({ name: 1 }).lean();
    res.json(items);
  } catch (error) {
    console.error("Get release tipos error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST / - crear
router.post("/", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res: Response) => {
  try {
    const { name, isActive, requiereFirma } = req.body;
    const nombre = String(name ?? "").trim();
    if (!nombre) {
      res.status(400).json({ error: "El nombre es obligatorio" });
      return;
    }

    const existente = await ReleaseTipo.findOne({ tenantId: req.tenantObjectId, name: nombre }).lean();
    if (existente) {
      res.status(409).json({ error: "Ya existe un tipo de release con ese nombre" });
      return;
    }

    const created = await ReleaseTipo.create({
      tenantId: req.tenantObjectId,
      name: nombre,
      isActive: isActive === undefined ? true : isActive === "true" || isActive === true,
      requiereFirma: requiereFirma === undefined ? true : requiereFirma === "true" || requiereFirma === true,
    });
    res.status(201).json(created);
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ error: "Ya existe un tipo de release con ese nombre" });
      return;
    }
    console.error("Create release tipo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /:id - actualizar
router.put("/:id", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res: Response) => {
  try {
    const { name, isActive, requiereFirma } = req.body;
    const item = await ReleaseTipo.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!item) {
      res.status(404).json({ error: "Tipo de release no encontrado" });
      return;
    }

    if (name !== undefined) {
      const nombre = String(name).trim();
      if (!nombre) {
        res.status(400).json({ error: "El nombre es obligatorio" });
        return;
      }
      const duplicado = await ReleaseTipo.findOne({ tenantId: req.tenantObjectId, name: nombre, _id: { $ne: item._id } }).lean();
      if (duplicado) {
        res.status(409).json({ error: "Ya existe un tipo de release con ese nombre" });
        return;
      }
      item.name = nombre;
    }
    if (isActive !== undefined) item.isActive = isActive === "true" || isActive === true;
    if (requiereFirma !== undefined) item.requiereFirma = requiereFirma === "true" || requiereFirma === true;

    await item.save();
    res.json(item);
  } catch (error: any) {
    if (error?.code === 11000) {
      res.status(409).json({ error: "Ya existe un tipo de release con ese nombre" });
      return;
    }
    console.error("Update release tipo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /:id - eliminar
router.delete("/:id", authenticateToken, requireTenant, async (req: AuthenticatedRequest & TenantRequest, res: Response) => {
  try {
    const enUso = await Release.countDocuments({ releaseTipoId: req.params.id, tenantId: req.tenantObjectId });
    if (enUso > 0) {
      res.status(409).json({ error: `No se puede eliminar: ${enUso} release${enUso === 1 ? "" : "s"} lo tiene${enUso === 1 ? "" : "n"} asignado. Reasigná o eliminá ese${enUso === 1 ? "" : "s"} release${enUso === 1 ? "" : "s"} primero.` });
      return;
    }

    const item = await ReleaseTipo.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!item) {
      res.status(404).json({ error: "Tipo de release no encontrado" });
      return;
    }
    res.json({ message: "Tipo de release eliminado correctamente" });
  } catch (error) {
    console.error("Delete release tipo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as releaseTipoRoutes, ensureReleaseTiposBackfilled };

import { Router } from "express";
import { RoleFrame } from "../models/RoleFrame.js";
import { CategoriaSat } from "../models/CategoriaSat.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

router.get("/", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const roles = await RoleFrame.find().sort({ name: 1 }).lean();
    res.json(roles);
  } catch (error) {
    console.error("Get role frames error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { name, categoryIds } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "El nombre es obligatorio" });
    }

    // Resolve categories Sat data from MongoDB
    const categories = await CategoriaSat.find({ _id: { $in: categoryIds || [] } }).lean();
    const categoriasSatData = categories.map(cat => ({
      id: cat.data?.id || cat.data?.numeroCategoria,
      numeroCategoria: cat.data?.numeroCategoria,
      sueldoBruto: cat.data?.sueldoBruto,
      sueldoBrutoLetras: cat.data?.sueldoBrutoLetras,
      neto: cat.data?.neto,
      sueldoNetoLetras: cat.data?.sueldoNetoLetras,
      fechaActualizacion: cat.data?.fechaActualizacion,
      codigoAfip: cat.data?.codigoAfip,
      presentismo: cat.data?.presentismo,
      sueldoBasico: cat.data?.sueldoBasico,
      sueldoAdicional: cat.data?.sueldoAdicional,
      nombre: cat.data?.nombre || cat.name
    }));

    const externalId = Date.now().toString();

    const newRole = new RoleFrame({
      name: name.trim(),
      externalId,
      data: {
        rol: {
          id: Date.now(),
          nombre: name.trim()
        },
        categoriasSat: categoriasSatData
      }
    });

    await newRole.save();
    res.status(201).json(newRole);
  } catch (error) {
    console.error("Create role frame error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { id } = req.params;
    const { name, categoryIds } = req.body;

    const role = await RoleFrame.findById(id);
    if (!role) {
      return res.status(404).json({ error: "Función no encontrada" });
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: "El nombre es obligatorio" });
      }
      role.name = name.trim();
      if (!role.data) {
        role.data = { rol: { id: Date.now(), nombre: name.trim() }, categoriasSat: [] };
      } else {
        if (!role.data.rol) {
          role.data.rol = { id: Date.now(), nombre: name.trim() };
        } else {
          role.data.rol.nombre = name.trim();
        }
      }
    }

    if (categoryIds !== undefined) {
      const categories = await CategoriaSat.find({ _id: { $in: categoryIds || [] } }).lean();
      const categoriasSatData = categories.map(cat => ({
        id: cat.data?.id || cat.data?.numeroCategoria,
        numeroCategoria: cat.data?.numeroCategoria,
        sueldoBruto: cat.data?.sueldoBruto,
        sueldoBrutoLetras: cat.data?.sueldoBrutoLetras,
        neto: cat.data?.neto,
        sueldoNetoLetras: cat.data?.sueldoNetoLetras,
        fechaActualizacion: cat.data?.fechaActualizacion,
        codigoAfip: cat.data?.codigoAfip,
        presentismo: cat.data?.presentismo,
        sueldoBasico: cat.data?.sueldoBasico,
        sueldoAdicional: cat.data?.sueldoAdicional,
        nombre: cat.data?.nombre || cat.name
      }));
      
      if (!role.data) {
        role.data = { rol: { id: Date.now(), nombre: role.name }, categoriasSat: categoriasSatData };
      } else {
        role.data.categoriasSat = categoriasSatData;
      }
    }

    await role.save();
    res.json(role);
  } catch (error) {
    console.error("Update role frame error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { id } = req.params;
    const result = await RoleFrame.deleteOne({ _id: id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Función no encontrada" });
    }
    res.json({ message: "Función eliminada correctamente" });
  } catch (error) {
    console.error("Delete role frame error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as roleFrameRoutes };

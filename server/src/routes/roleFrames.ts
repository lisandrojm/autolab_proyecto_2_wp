import { Router } from "express";
import { RoleFrame } from "../models/RoleFrame.js";
import { listarCategoriasCompat, resolverCategoriasCompatPorId } from "../utils/categoriaCompat.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";

const router = Router();

/**
 * Copia denormalizada de la escala salarial que se guarda dentro de la función FRAME.
 *
 * Los ids llegan de `GET /categorias-sat`, que desde la migración devuelve los `_id` de la colección
 * `categorias`. Buscarlos en `CategoriaSat` —como se hacía— no encontraba ninguno y guardaba la
 * función con la lista VACÍA, borrando en silencio las categorías asociadas en cada edición.
 * `resolverCategoriasCompatPorId` mira las dos colecciones, así que sirve tanto para los ids nuevos
 * como para los que hayan quedado guardados de antes.
 */
const armarCategoriasSatData = async (categoryIds: any[]) => {
  const categories = await resolverCategoriasCompatPorId(categoryIds || []);
  return categories.map((cat: any) => ({
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
    nombre: cat.data?.nombre || cat.name,
  }));
};

router.get("/", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const [roles, categorias] = await Promise.all([RoleFrame.find().sort({ name: 1 }).lean(), listarCategoriasCompat()]);

    // La escala salarial guardada dentro de la función es una copia del momento en que se asoció la
    // categoría, y ninguna paritaria la actualiza: en producción había funciones sirviendo sueldos de
    // una escala que ya no existe. Se re-resuelve al leer, contra el catálogo vigente.
    // Se resuelve al leer y no con un script porque un script volvería a quedar viejo en la próxima
    // paritaria; lo guardado queda solo como respaldo para ids que ya no resuelven.
    const porLegacyId = new Map(categorias.filter((c: any) => c.data?.id != null).map((c: any) => [Number(c.data.id), c]));

    const frescos = roles.map((rol: any) => {
      const guardadas = rol.data?.categoriasSat;
      if (!Array.isArray(guardadas) || guardadas.length === 0) return rol;

      return {
        ...rol,
        data: {
          ...rol.data,
          categoriasSat: guardadas.map((guardada: any) => {
            const vigente: any = porLegacyId.get(Number(guardada?.id));
            if (!vigente) return guardada;
            return {
              ...guardada,
              numeroCategoria: vigente.data.numeroCategoria,
              sueldoBasico: vigente.data.sueldoBasico,
              sueldoAdicional: vigente.data.sueldoAdicional,
              presentismo: vigente.data.presentismo,
              sueldoBruto: vigente.data.sueldoBruto,
              sueldoBrutoLetras: vigente.data.sueldoBrutoLetras,
              neto: vigente.data.neto,
              sueldoNetoLetras: vigente.data.sueldoNetoLetras,
              fechaActualizacion: vigente.data.fechaActualizacion,
              codigoAfip: vigente.data.codigoAfip,
              nombre: vigente.data.nombre || vigente.name,
            };
          }),
        },
      };
    });

    res.json(frescos);
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

    const categoriasSatData = await armarCategoriasSatData(categoryIds);

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
      const categoriasSatData = await armarCategoriasSatData(categoryIds);

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

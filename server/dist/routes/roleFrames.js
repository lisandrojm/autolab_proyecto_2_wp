import { Router } from "express";
import { RoleFrame } from "../models/RoleFrame.js";
import { Categoria } from "../models/Categoria.js";
import UserProject from "../models/UserProject.js";
import { auditarFunciones } from "../utils/auditoriaFuncionesFrame.js";
import { listarCategoriasCompat, resolverCategoriasCompatPorId } from "../utils/categoriaCompat.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
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
const armarCategoriasSatData = async (categoryIds) => {
    const categories = await resolverCategoriasCompatPorId(categoryIds || []);
    return categories.map((cat) => ({
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
/**
 * GET /api/v1/role-frames/rotas
 *
 * Funciones FRAME que apuntan a una categoría inexistente, dada de baja, o a ninguna.
 *
 * Es el equivalente, para el PUENTE, del panel rojo de categorías huérfanas de `/arca/categorias`.
 * Sin esto la rotura es invisible: cuando la Fase 2 dio de baja «Actor», cuatro funciones quedaron
 * proponiendo una categoría sin convenio ni código y no había ninguna pantalla donde se viera —
 * «Actor» ya no figuraba entre las huérfanas justamente por estar de baja.
 *
 * La regla la pone `auditarFunciones`, la misma que corre el script de auditoría. Compartirla no es
 * prolijidad: si el panel y el script contaran distinto, uno de los dos estaría mintiendo y no habría
 * forma de saber cuál.
 */
router.get("/rotas", requireTenant, authenticateToken, async (_req, res) => {
    try {
        const [roles, categorias, ups] = await Promise.all([
            RoleFrame.find().lean(),
            Categoria.find().select("legacyId nombre convenio codigoArca isActive").lean(),
            UserProject.find().select("contracts.rol_frame_id").lean(),
        ]);
        // A cuántos contratos alcanza cada función: es lo que dice si urge o si puede esperar.
        const contratosPorRolId = new Map();
        for (const up of ups) {
            for (const c of up.contracts || []) {
                const rol = Number(c?.rol_frame_id);
                if (Number.isFinite(rol))
                    contratosPorRolId.set(rol, (contratosPorRolId.get(rol) || 0) + 1);
            }
        }
        const rotas = auditarFunciones(roles, categorias, contratosPorRolId)
            .filter((f) => f.rota)
            .sort((a, b) => b.contratos - a.contratos);
        res.json(rotas);
    }
    catch (error) {
        console.error("Get funciones FRAME rotas error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get("/", requireTenant, authenticateToken, async (req, res) => {
    try {
        const [roles, categorias] = await Promise.all([RoleFrame.find().sort({ name: 1 }).lean(), listarCategoriasCompat()]);
        // La escala salarial guardada dentro de la función es una copia del momento en que se asoció la
        // categoría, y ninguna paritaria la actualiza: en producción había funciones sirviendo sueldos de
        // una escala que ya no existe. Se re-resuelve al leer, contra el catálogo vigente.
        // Se resuelve al leer y no con un script porque un script volvería a quedar viejo en la próxima
        // paritaria; lo guardado queda solo como respaldo para ids que ya no resuelven.
        const porLegacyId = new Map(categorias.filter((c) => c.data?.id != null).map((c) => [Number(c.data.id), c]));
        const frescos = roles.map((rol) => {
            const guardadas = rol.data?.categoriasSat;
            if (!Array.isArray(guardadas) || guardadas.length === 0)
                return rol;
            return {
                ...rol,
                data: {
                    ...rol.data,
                    categoriasSat: guardadas.map((guardada) => {
                        const vigente = porLegacyId.get(Number(guardada?.id));
                        if (!vigente)
                            return guardada;
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
    }
    catch (error) {
        console.error("Get role frames error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.post("/", requireTenant, authenticateToken, async (req, res) => {
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
    }
    catch (error) {
        console.error("Create role frame error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.put("/:id", requireTenant, authenticateToken, async (req, res) => {
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
            }
            else {
                if (!role.data.rol) {
                    role.data.rol = { id: Date.now(), nombre: name.trim() };
                }
                else {
                    role.data.rol.nombre = name.trim();
                }
            }
        }
        if (categoryIds !== undefined) {
            const categoriasSatData = await armarCategoriasSatData(categoryIds);
            if (!role.data) {
                role.data = { rol: { id: Date.now(), nombre: role.name }, categoriasSat: categoriasSatData };
            }
            else {
                role.data.categoriasSat = categoriasSatData;
            }
        }
        await role.save();
        res.json(role);
    }
    catch (error) {
        console.error("Update role frame error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.delete("/:id", requireTenant, authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await RoleFrame.deleteOne({ _id: id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Función no encontrada" });
        }
        res.json({ message: "Función eliminada correctamente" });
    }
    catch (error) {
        console.error("Delete role frame error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as roleFrameRoutes };

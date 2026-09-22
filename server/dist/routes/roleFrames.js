import { Router } from "express";
import mongoose from "mongoose";
import { RoleFrame } from "../models/RoleFrame.js";
import { Valoracion } from "../models/Valoracion.js";
import { Categoria } from "../models/Categoria.js";
import UserProject from "../models/UserProject.js";
import { auditarFunciones } from "../utils/auditoriaFuncionesFrame.js";
import { listarCategoriasCompat, resolverCategoriasCompatPorId } from "../utils/categoriaCompat.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
const router = Router();
/**
 * Las claves que el alta/edición de una función sabe guardar.
 *
 * Esta ruta NO tenía validación: destructuraba `{ name, categoryIds }` y lo demás se descartaba en
 * silencio con un 200. Al cambiar el payload eso pasó de incómodo a peligroso — un cliente que
 * mande la forma vieja o una clave mal escrita creería que guardó valoraciones que no se guardaron.
 * Mismo criterio que `_simpleCatalogRouter`: si no se puede guardar, no se contesta OK.
 */
const CLAVES_ACEPTADAS = new Set(["name", "categorias", "categoryIds"]);
const clavesDeMas = (body) => (body && typeof body === "object" ? Object.keys(body).filter((k) => !CLAVES_ACEPTADAS.has(k)) : []);
/**
 * Acepta las dos formas: la nueva (`categorias`) y la vieja (`categoryIds`).
 *
 * La compatibilidad no es cortesía con clientes viejos: `GET /role-frames` se consume desde varias
 * pantallas y un `PUT` con el formato anterior —de una pestaña que quedó abierta, de un script—
 * tiene que seguir guardando las categorías en vez de vaciarlas. Sin valoración, eso sí: quien no
 * la manda no la conoce.
 */
const normalizarCategorias = (body) => {
    if (Array.isArray(body?.categorias)) {
        return body.categorias
            .map((c) => (typeof c === "string" ? { categoryId: c } : { categoryId: String(c?.categoryId || ""), valoracionId: c?.valoracionId ?? null }))
            .filter((c) => !!c.categoryId);
    }
    if (Array.isArray(body?.categoryIds))
        return body.categoryIds.filter(Boolean).map((id) => ({ categoryId: String(id) }));
    return undefined;
};
/**
 * RECONSTRUYE `categoriasSat` ENTERO EN CADA GUARDADO, y por eso la valoración tiene que VIAJAR.
 *
 * La escala salarial se copia del catálogo, que es lo correcto —la paritaria manda—, pero la
 * valoración NO está en el catálogo: vive sólo acá. Tal como estaba, armar la lista desde
 * `categoryIds` borraba las valoraciones cargadas en cada edición de la función, en silencio y con
 * un 200 de respuesta: se abría el ABM, se cambiaba el nombre, y Oro y Plata desaparecían sin que
 * nada lo dijera.
 *
 * Ahora entra por `CategoriaAsociada` y sale en el documento. Un id de valoración mal formado se
 * guarda como `null` (sin valorar) en vez de reventar el `save` con un CastError.
 */
const armarCategoriasSatData = async (asociadas) => {
    const valoracionPorCategoria = new Map(asociadas.map((c) => [String(c.categoryId), c.valoracionId]));
    const categories = await resolverCategoriasCompatPorId(asociadas.map((c) => c.categoryId));
    return categories.map((cat) => ({
        valoracionId: (() => {
            const v = valoracionPorCategoria.get(String(cat._id));
            return v && mongoose.Types.ObjectId.isValid(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null;
        })(),
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
/**
 * GET /api/v1/role-frames/cobertura
 *
 * Por función: qué valoraciones cubre y cuáles le faltan.
 *
 * Una función sólo sirve para un proyecto si tiene al menos una categoría de la valoración de ese
 * proyecto. Sin esta vista, el hueco recién aparece al armar el contrato —cuando el selector no
 * ofrece nada— y ahí ya es tarde: hay alguien esperando que lo den de alta. Acá se ve antes, con el
 * nombre de lo que falta.
 *
 * Las valoraciones son del TENANT y las funciones son globales, así que la cobertura se calcula
 * contra las valoraciones ACTIVAS de quien pregunta: la misma función puede estar completa para una
 * productora e incompleta para otra.
 */
router.get("/cobertura", requireTenant, authenticateToken, async (req, res) => {
    try {
        const [roles, valoraciones] = await Promise.all([
            RoleFrame.find().sort({ name: 1 }).lean(),
            Valoracion.find({ tenantId: req.tenantObjectId, activo: { $ne: false } }).sort({ orden: 1 }).select("name orden color").lean(),
        ]);
        const todas = valoraciones.map((v) => ({ _id: String(v._id), name: v.name, orden: v.orden ?? null, color: v.color || "" }));
        res.json(roles.map((rol) => {
            const categorias = Array.isArray(rol.data?.categoriasSat) ? rol.data.categoriasSat : [];
            const cubiertas = new Set(categorias.map((c) => (c?.valoracionId ? String(c.valoracionId) : "")).filter(Boolean));
            return {
                _id: String(rol._id),
                nombre: rol.name,
                categorias: categorias.length,
                /* Cuántas categorías quedaron SIN valorar. Es distinto de «no cubre una valoración»: acá
                   el dato falta, y hasta que se cargue el filtro de contratación no se aplica. */
                sinValorar: categorias.filter((c) => !c?.valoracionId).length,
                cubre: todas.filter((v) => cubiertas.has(v._id)),
                faltan: todas.filter((v) => !cubiertas.has(v._id)),
                totalValoraciones: todas.length,
            };
        }));
    }
    catch (error) {
        console.error("Get cobertura de valoraciones error:", error);
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
                        /*
                          `...guardada` VA PRIMERO y eso no es estético: del catálogo se refresca la escala
                          salarial, pero `valoracionId` sólo existe acá. Invertir el spread lo borraría en cada
                          lectura, sin tocar la base y sin que nada falle: las valoraciones simplemente dejarían
                          de llegar a la pantalla.
                        */
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
        const sobran = clavesDeMas(req.body);
        if (sobran.length > 0)
            return res.status(400).json({ error: `Campos no reconocidos: ${sobran.join(", ")}`, campos: sobran });
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ error: "El nombre es obligatorio" });
        }
        const categoriasSatData = await armarCategoriasSatData(normalizarCategorias(req.body) || []);
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
        const sobran = clavesDeMas(req.body);
        if (sobran.length > 0)
            return res.status(400).json({ error: `Campos no reconocidos: ${sobran.join(", ")}`, campos: sobran });
        const { name } = req.body;
        const categorias = normalizarCategorias(req.body);
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
        if (categorias !== undefined) {
            const categoriasSatData = await armarCategoriasSatData(categorias);
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

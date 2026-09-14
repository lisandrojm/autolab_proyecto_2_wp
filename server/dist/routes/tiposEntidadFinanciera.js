import { Router } from "express";
import { Types } from "mongoose";
import { Info } from "../models/Info.js";
import { Banco } from "../models/Banco.js";
import { User } from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";
import { TIPO_INFO, CLAVE_SIN_BANCO, ROTULOS_CBU, aTipo, claveDesdeNombre, listarTipos } from "../utils/tiposEntidadFinanciera.js";
/*
  ABM de tipos de entidad financiera (Entidades Financieras → Tipos). Ver `utils/tiposEntidadFinanciera.ts`.

  Mismos permisos que el catálogo de entidades (`routes/bancos.ts`): es parte de esa misma pantalla.
*/
const router = Router();
const aBooleano = (v) => (v === true || v === "true" ? true : v === false || v === "false" ? false : undefined);
const esRotulo = (v) => ROTULOS_CBU.includes(v);
// GET /tipos-entidad-financiera - Todos, activos e inactivos.
router.get("/", authenticateToken, async (_req, res) => {
    try {
        res.json({ tipos: await listarTipos() });
    }
    catch (error) {
        console.error("Get tipos entidad financiera error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// POST /tipos-entidad-financiera { nombre, activo, pideTipoCuenta, pideNroCuenta, rotuloCbu }
router.post("/", authenticateToken, async (req, res) => {
    try {
        const nombre = String(req.body?.nombre ?? "").trim();
        if (!nombre) {
            res.status(400).json({ error: "El nombre es obligatorio" });
            return;
        }
        const clave = claveDesdeNombre(nombre);
        if (!clave || clave === CLAVE_SIN_BANCO) {
            res.status(400).json({ error: "Ese nombre no se puede usar para un tipo de entidad." });
            return;
        }
        if (req.body?.rotuloCbu !== undefined && !esRotulo(req.body.rotuloCbu)) {
            res.status(400).json({ error: `El nombre del número tiene que ser ${ROTULOS_CBU.join(", ")}.` });
            return;
        }
        const existentes = await listarTipos();
        if (existentes.some((t) => t.clave === clave || t.nombre.toLowerCase() === nombre.toLowerCase())) {
            res.status(409).json({ error: `Ya existe un tipo «${nombre}».` });
            return;
        }
        const orden = existentes.reduce((m, t) => Math.max(m, t.orden), 0) + 1;
        const ultimo = await Info.findOne({ type: TIPO_INFO }).sort({ "data.id": -1 }).select("data.id").lean();
        const doc = await Info.create({
            type: TIPO_INFO,
            externalId: clave,
            name: nombre,
            data: {
                id: (Number(ultimo?.data?.id) || 0) + 1,
                nombre,
                clave,
                activo: aBooleano(req.body?.activo) ?? true,
                pideTipoCuenta: !!aBooleano(req.body?.pideTipoCuenta),
                pideNroCuenta: !!aBooleano(req.body?.pideNroCuenta),
                rotuloCbu: esRotulo(req.body?.rotuloCbu) ? req.body.rotuloCbu : "CBU/CVU",
                orden,
            },
        });
        res.status(201).json({ tipo: aTipo(doc.toObject()) });
    }
    catch (error) {
        console.error("Create tipo entidad financiera error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /tipos-entidad-financiera/:id - La clave no se cambia: es lo que tienen guardado entidades y personas.
router.patch("/:id", authenticateToken, async (req, res) => {
    try {
        if (!Types.ObjectId.isValid(req.params.id)) {
            res.status(404).json({ error: "Tipo no encontrado" });
            return;
        }
        const set = {};
        if (req.body?.nombre !== undefined) {
            const nombre = String(req.body.nombre).trim();
            if (!nombre) {
                res.status(400).json({ error: "El nombre es obligatorio" });
                return;
            }
            const repetido = (await listarTipos()).some((t) => t._id !== req.params.id && t.nombre.toLowerCase() === nombre.toLowerCase());
            if (repetido) {
                res.status(409).json({ error: `Ya existe un tipo «${nombre}».` });
                return;
            }
            set.name = nombre;
            set["data.nombre"] = nombre;
        }
        for (const campo of ["activo", "pideTipoCuenta", "pideNroCuenta"]) {
            const b = aBooleano(req.body?.[campo]);
            if (b !== undefined)
                set[`data.${campo}`] = b;
        }
        if (req.body?.rotuloCbu !== undefined) {
            if (!esRotulo(req.body.rotuloCbu)) {
                res.status(400).json({ error: `El nombre del número tiene que ser ${ROTULOS_CBU.join(", ")}.` });
                return;
            }
            set["data.rotuloCbu"] = req.body.rotuloCbu;
        }
        if (Object.keys(set).length === 0) {
            res.status(400).json({ error: "No hay nada para actualizar" });
            return;
        }
        const doc = await Info.findOneAndUpdate({ _id: req.params.id, type: TIPO_INFO }, { $set: set }, { new: true, strict: false }).lean();
        if (!doc) {
            res.status(404).json({ error: "Tipo no encontrado" });
            return;
        }
        res.json({ tipo: aTipo(doc) });
    }
    catch (error) {
        console.error("Update tipo entidad financiera error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/*
  DELETE /tipos-entidad-financiera/:id - Sólo si nadie lo usa.

  Borrar uno en uso dejaría entidades y datos bancarios apuntando a una clave que ya no dice qué
  campos pedir ni cómo se llama. Para que deje de ofrecerse está «Inactivo», que no rompe nada.
*/
router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        if (!Types.ObjectId.isValid(req.params.id)) {
            res.status(404).json({ error: "Tipo no encontrado" });
            return;
        }
        const doc = await Info.findOne({ _id: req.params.id, type: TIPO_INFO }).lean();
        if (!doc) {
            res.status(404).json({ error: "Tipo no encontrado" });
            return;
        }
        const tipo = aTipo(doc);
        // Una entidad sin tipo cargado se ofrece como banco en todos lados: cuenta como «banco».
        const filtroBancos = tipo.clave === "banco" ? { $or: [{ tipoEntidad: "banco" }, { tipoEntidad: { $in: [null, ""] } }] } : { tipoEntidad: tipo.clave };
        const [entidades, personas] = await Promise.all([Banco.countDocuments(filtroBancos), User.exists({ "metadata.tipoEntidadFinanciera": tipo.clave })]);
        if (entidades > 0 || personas) {
            const usos = [entidades > 0 ? `${entidades} ${entidades === 1 ? "entidad" : "entidades"}` : "", personas ? "datos bancarios de personas" : ""].filter(Boolean).join(" y ");
            res.status(409).json({ error: `No se puede eliminar «${tipo.nombre}»: lo usan ${usos}. Desactivalo para que deje de ofrecerse.` });
            return;
        }
        await Info.deleteOne({ _id: req.params.id, type: TIPO_INFO });
        res.json({ success: true });
    }
    catch (error) {
        console.error("Delete tipo entidad financiera error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as tiposEntidadFinancieraRoutes };

import { Router } from "express";
import { Types } from "mongoose";
import { TerminosCondiciones } from "../models/TerminosCondiciones.js";
import { User } from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { requireAnyPermission } from "../middleware/permissions.js";
import { htmlHasText } from "../utils/documentPdf.js";
/*
  ABM DE TÉRMINOS Y CONDICIONES del registro (ver `models/TerminosCondiciones.ts`).

  `config_terminos:view` es nuevo y los roles están congelados en la base: hasta que se tilde, entra
  quien ya administra usuarios, que es quien maneja los registros y sus links.
*/
const router = Router();
const permiso = requireAnyPermission("config_terminos:view", "admin_users:view");
router.use(requireTenant, authenticateToken, permiso);
/** Cuántas personas aceptaron cada versión: es lo que dice si borrar o editar tiene consecuencias. */
async function aceptacionesPorTerminos(tenantId, ids) {
    if (ids.length === 0)
        return new Map();
    const filas = await User.aggregate([
        { $match: { tenantId, "metadata.terminosAceptados.terminosId": { $in: ids } } },
        { $group: { _id: "$metadata.terminosAceptados.terminosId", n: { $sum: 1 } } },
    ]);
    return new Map(filas.map((f) => [String(f._id), f.n]));
}
const leerCuerpo = (body) => {
    const titulo = String(body?.titulo ?? "").trim();
    const contenido = String(body?.contenido ?? "");
    if (!titulo)
        return { error: "El título es obligatorio." };
    if (!htmlHasText(contenido))
        return { error: "El texto de los términos no puede quedar vacío." };
    return { titulo, contenido, vigente: body?.vigente === undefined ? undefined : !!body.vigente };
};
/** Deja vigente SOLO a este: hay uno por tenant, que es el que se acepta al registrarse. */
async function dejarUnicoVigente(tenantId, id) {
    await TerminosCondiciones.updateMany({ tenantId, _id: { $ne: id }, vigente: true }, { $set: { vigente: false } });
}
// GET /terminos-condiciones — todos, el vigente primero, con cuántos lo aceptaron.
router.get("/", async (req, res) => {
    try {
        const docs = await TerminosCondiciones.find({ tenantId: req.tenantObjectId }).select("-historial").sort({ vigente: -1, updatedAt: -1 }).lean();
        const aceptaciones = await aceptacionesPorTerminos(req.tenantObjectId, docs.map((d) => d._id));
        res.json(docs.map((d) => ({ ...d, aceptaciones: aceptaciones.get(String(d._id)) || 0 })));
    }
    catch (error) {
        console.error("[TERMINOS] list:", error);
        res.status(500).json({ error: "No se pudieron cargar los términos y condiciones." });
    }
});
// POST /terminos-condiciones — { titulo, contenido, vigente? }
router.post("/", async (req, res) => {
    try {
        const cuerpo = leerCuerpo(req.body);
        if ("error" in cuerpo) {
            res.status(400).json({ error: cuerpo.error });
            return;
        }
        const doc = await TerminosCondiciones.create({ tenantId: req.tenantObjectId, titulo: cuerpo.titulo, contenido: cuerpo.contenido, vigente: !!cuerpo.vigente, createdBy: req.user.userId, updatedBy: req.user.userId });
        if (doc.vigente)
            await dejarUnicoVigente(req.tenantObjectId, doc._id);
        res.status(201).json(doc);
    }
    catch (error) {
        console.error("[TERMINOS] create:", error);
        res.status(500).json({ error: "No se pudieron guardar los términos y condiciones." });
    }
});
/*
  PUT /terminos-condiciones/:id — { titulo, contenido, vigente? }

  Si cambia el texto, la versión anterior va al historial y sube el número: quien ya aceptó queda
  atado a la versión que leyó, no a la corregida.
*/
router.put("/:id", async (req, res) => {
    try {
        const cuerpo = leerCuerpo(req.body);
        if ("error" in cuerpo) {
            res.status(400).json({ error: cuerpo.error });
            return;
        }
        const doc = await TerminosCondiciones.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
        if (!doc) {
            res.status(404).json({ error: "No se encontraron esos términos y condiciones." });
            return;
        }
        const cambioElTexto = doc.titulo !== cuerpo.titulo || doc.contenido !== cuerpo.contenido;
        if (cambioElTexto) {
            doc.historial.push({ version: doc.version, titulo: doc.titulo, contenido: doc.contenido, hasta: new Date() });
            doc.version += 1;
            doc.titulo = cuerpo.titulo;
            doc.contenido = cuerpo.contenido;
        }
        if (cuerpo.vigente !== undefined)
            doc.vigente = cuerpo.vigente;
        doc.updatedBy = new Types.ObjectId(String(req.user.userId));
        await doc.save();
        if (doc.vigente)
            await dejarUnicoVigente(req.tenantObjectId, doc._id);
        res.json(doc);
    }
    catch (error) {
        console.error("[TERMINOS] update:", error);
        res.status(500).json({ error: "No se pudieron guardar los términos y condiciones." });
    }
});
/*
  DELETE /terminos-condiciones/:id

  No se borra lo que alguien ya aceptó: es la constancia de qué firmó. Se puede dejar de usar
  (sacarle «vigente») o reemplazar por otro, pero el texto queda.
*/
router.delete("/:id", async (req, res) => {
    try {
        const doc = await TerminosCondiciones.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
        if (!doc) {
            res.status(404).json({ error: "No se encontraron esos términos y condiciones." });
            return;
        }
        const aceptaron = (await aceptacionesPorTerminos(req.tenantObjectId, [doc._id])).get(String(doc._id)) || 0;
        if (aceptaron > 0) {
            res.status(409).json({ error: `No se puede borrar: ${aceptaron === 1 ? "1 persona los aceptó" : `${aceptaron} personas los aceptaron`} al registrarse y es la constancia de lo que aceptaron. Si ya no se usan, sacales «Vigente».` });
            return;
        }
        await doc.deleteOne();
        res.json({ success: true });
    }
    catch (error) {
        console.error("[TERMINOS] delete:", error);
        res.status(500).json({ error: "No se pudieron borrar los términos y condiciones." });
    }
});
export { router as terminosCondicionesRoutes };

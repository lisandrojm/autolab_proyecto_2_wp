import { Router } from "express";
import multer from "multer";
import xlsx from "xlsx";
import { Categoria } from "../models/Categoria.js";
import { ConvenioGrupo } from "../models/ConvenioGrupo.js";
import { Convenio } from "../models/Convenio.js";
import UserProject from "../models/UserProject.js";
import { authenticateToken } from "../middleware/auth.js";
/**
 * ABM de Categorías profesionales de ARCA, en la forma en la que ARCA las modela:
 *
 *   Convenio (0634/11)
 *     └── Grupo 1..12        ← acá vive la ESCALA salarial
 *           └── Categoría    ← acá solo el código de 6 dígitos y el nombre
 *
 * Es la contracara de `/categorias-sat`, que quedó como una vista PLANA de solo lectura para los
 * consumidores viejos (TXT de ARCA, chequeo de completitud, Funciones FRAME, PDFs). Toda la
 * ESCRITURA pasa por acá, y por eso acá viven las reglas: convenio obligatorio, código de 6 dígitos,
 * y la escala se edita en el grupo — nunca fila por fila.
 *
 * Lo que desapareció respecto del ABM viejo:
 *  - "Actualizar por Categoría" (`PUT /categorias-sat/global/:n`): era el parche para editar de una
 *    vez las N filas que compartían Nº de categoría. Editar el grupo ES eso, sin el parche.
 *  - "Nº Cat." como atributo de la categoría: era el grupo disfrazado.
 */
const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
/** Código canónico de ARCA: 6 dígitos con ceros a la izquierda. */
const aCodigoArca = (v) => String(v ?? "").replace(/\D/g, "").padStart(6, "0");
/** Un código es real si tiene 6 dígitos y no es todo ceros. "0" y "" son la ausencia de código. */
const codigoArcaValido = (v) => /^\d{6}$/.test(v) && v !== "000000";
/** Campos de la escala salarial, que viven en el grupo y en ningún otro lado. */
const escalaDelBody = (body) => {
    const set = {};
    for (const k of ["sueldoBasico", "sueldoAdicional", "presentismo", "sueldoBruto", "neto"]) {
        if (body[k] !== undefined)
            set[k] = Number(body[k] || 0);
    }
    for (const k of ["sueldoBrutoLetras", "sueldoNetoLetras", "nombre"]) {
        if (body[k] !== undefined)
            set[k] = String(body[k] ?? "").trim();
    }
    if (body.fechaActualizacion !== undefined)
        set.fechaActualizacion = body.fechaActualizacion;
    return set;
};
/** Nombre del CCT según el catálogo de Convenios; "" si el código no está cargado ahí. */
const nombresDeConvenio = async () => {
    const convenios = await Convenio.find().lean();
    return new Map(convenios.map((c) => [String(c.externalId || "").trim(), String(c.name || "")]));
};
/**
 * Cuántos contratos usan cada categoría, por su `legacyId` (`contracts.categoria_sat_id`).
 *
 * Se cuenta acá y no en el cliente porque es lo que decide si una categoría rota se puede dar de
 * baja o hay que arreglarla: "Actor" no se borra, la usan 143 contratos.
 */
const contratosPorLegacyId = async () => {
    const filas = await UserProject.aggregate([{ $unwind: "$contracts" }, { $group: { _id: "$contracts.categoria_sat_id", total: { $sum: 1 } } }]);
    const uso = new Map();
    for (const f of filas) {
        const id = Number(f._id);
        if (Number.isFinite(id))
            uso.set(id, f.total);
    }
    return uso;
};
/**
 * GET /api/v1/arca/categorias/convenios
 *
 * Nivel 1: los convenios que tienen categorías cargadas, con lo necesario para elegir uno sin entrar.
 * NO existe la opción "todos": una categoría se lee dentro de su convenio o no se lee.
 */
router.get("/convenios", authenticateToken, async (_req, res) => {
    try {
        const [cats, grupos, nombres] = await Promise.all([Categoria.find().lean(), ConvenioGrupo.find().lean(), nombresDeConvenio()]);
        const acc = new Map();
        const tocar = (cct) => {
            if (!acc.has(cct))
                acc.set(cct, { convenio: cct, nombre: nombres.get(cct) || "", grupos: 0, categorias: 0, ultimaActualizacion: null });
            return acc.get(cct);
        };
        for (const g of grupos) {
            const cct = String(g.convenio || "").trim();
            // Los grupos sin convenio no forman una solapa: sus categorías son huérfanas y se resuelven
            // desde el banner, no eligiéndolas en el selector.
            if (!cct)
                continue;
            const e = tocar(cct);
            e.grupos++;
            if (g.fechaActualizacion && (!e.ultimaActualizacion || new Date(g.fechaActualizacion) > new Date(e.ultimaActualizacion)))
                e.ultimaActualizacion = g.fechaActualizacion;
        }
        for (const c of cats) {
            const cct = String(c.convenio || "").trim();
            if (!cct)
                continue;
            tocar(cct).categorias++;
        }
        res.json([...acc.values()].sort((a, b) => a.convenio.localeCompare(b.convenio)));
    }
    catch (error) {
        console.error("Get convenios con categorías error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * GET /api/v1/arca/categorias/huerfanas
 *
 * Categorías que no se pueden usar: sin convenio, o con un código que no es un código de ARCA.
 * Van en un banner de error arriba de todo, no en un chip con el que se pueda convivir — cualquier
 * contrato que las use no puede generar el TXT.
 */
router.get("/huerfanas", authenticateToken, async (_req, res) => {
    try {
        const [cats, uso] = await Promise.all([Categoria.find().lean(), contratosPorLegacyId()]);
        const huerfanas = cats
            .filter((c) => !String(c.convenio || "").trim() || !codigoArcaValido(String(c.codigoArca || "")))
            .map((c) => ({
            _id: c._id,
            nombre: c.nombre,
            convenio: String(c.convenio || ""),
            codigoArca: String(c.codigoArca || ""),
            grupoId: c.grupoId,
            legacyId: c.legacyId ?? null,
            // Sin convenio Y sin código no hay nada rescatable del dato; con contratos encima, tampoco se
            // puede borrar. El cliente usa esto para decidir qué ofrecer.
            motivo: !String(c.convenio || "").trim() ? (codigoArcaValido(String(c.codigoArca || "")) ? "sin_convenio" : "sin_convenio_ni_codigo") : "codigo_invalido",
            contratos: c.legacyId != null ? uso.get(Number(c.legacyId)) || 0 : 0,
        }))
            .sort((a, b) => b.contratos - a.contratos);
        res.json(huerfanas);
    }
    catch (error) {
        console.error("Get categorías huérfanas error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * GET /api/v1/arca/categorias?convenio=0634/11
 *
 * Niveles 2 y 3 de una sola vez: los grupos del convenio con su escala, y las categorías colgando de
 * cada uno. Van juntos a propósito — la escala se muestra UNA vez, en el encabezado del grupo, y las
 * categorías debajo sin importes. Repetirla fila por fila era el bug de fondo de la pantalla vieja.
 */
router.get("/", authenticateToken, async (req, res) => {
    try {
        const convenio = String(req.query.convenio || "").trim();
        if (!convenio)
            return res.status(400).json({ error: "Falta el convenio: las categorías se leen dentro de un convenio" });
        const [grupos, cats, nombres, uso] = await Promise.all([ConvenioGrupo.find({ convenio }).sort({ numero: 1 }).lean(), Categoria.find({ convenio }).lean(), nombresDeConvenio(), contratosPorLegacyId()]);
        const porGrupo = new Map();
        for (const c of cats) {
            const k = String(c.grupoId);
            if (!porGrupo.has(k))
                porGrupo.set(k, []);
            porGrupo.get(k).push({
                _id: c._id,
                codigoArca: String(c.codigoArca || ""),
                nombre: c.nombre,
                descripcionArca: c.descripcionArca || "",
                isActive: c.isActive !== false,
                legacyId: c.legacyId ?? null,
                contratos: c.legacyId != null ? uso.get(Number(c.legacyId)) || 0 : 0,
            });
        }
        res.json({
            convenio,
            nombre: nombres.get(convenio) || "",
            grupos: grupos.map((g) => ({
                _id: g._id,
                numero: g.numero,
                nombre: g.nombre || "",
                sueldoBasico: g.sueldoBasico ?? 0,
                sueldoAdicional: g.sueldoAdicional ?? 0,
                presentismo: g.presentismo ?? 0,
                sueldoBruto: g.sueldoBruto ?? 0,
                sueldoBrutoLetras: g.sueldoBrutoLetras || "",
                neto: g.neto ?? 0,
                sueldoNetoLetras: g.sueldoNetoLetras || "",
                fechaActualizacion: g.fechaActualizacion ?? null,
                categorias: (porGrupo.get(String(g._id)) || []).sort((a, b) => a.codigoArca.localeCompare(b.codigoArca)),
            })),
        });
    }
    catch (error) {
        console.error("Get categorías por convenio error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * POST /api/v1/arca/categorias/grupos
 * Alta de un grupo salarial. El número es único dentro del convenio.
 */
router.post("/grupos", authenticateToken, async (req, res) => {
    try {
        const convenio = String(req.body.convenio || "").trim();
        const numero = Number(req.body.numero);
        if (!convenio)
            return res.status(400).json({ error: "El convenio es obligatorio" });
        if (!Number.isFinite(numero))
            return res.status(400).json({ error: "El número de grupo es obligatorio" });
        if (await ConvenioGrupo.findOne({ convenio, numero })) {
            return res.status(409).json({ error: `El convenio ${convenio} ya tiene un grupo ${numero}` });
        }
        const grupo = await ConvenioGrupo.create({ convenio, numero, ...escalaDelBody(req.body) });
        res.status(201).json(grupo);
    }
    catch (error) {
        responderError(res, error, "Create grupo salarial error");
    }
});
/**
 * PUT /api/v1/arca/categorias/grupos/:id
 *
 * Aplicar una paritaria: se escribe la escala en el único documento donde vive, y con eso queda
 * aplicada a todas las categorías del grupo. Devuelve a cuántas alcanzó para poder decirlo.
 */
router.put("/grupos/:id", authenticateToken, async (req, res) => {
    try {
        const grupo = await ConvenioGrupo.findById(req.params.id);
        if (!grupo)
            return res.status(404).json({ error: "Grupo salarial no encontrado" });
        const set = escalaDelBody(req.body);
        if (req.body.numero !== undefined) {
            const numero = Number(req.body.numero);
            if (!Number.isFinite(numero))
                return res.status(400).json({ error: "Número de grupo inválido" });
            if (numero !== grupo.numero && (await ConvenioGrupo.findOne({ convenio: grupo.convenio, numero }))) {
                return res.status(409).json({ error: `El convenio ${grupo.convenio} ya tiene un grupo ${numero}` });
            }
            set.numero = numero;
        }
        if (Object.keys(set).length === 0)
            return res.status(400).json({ error: "No se proporcionaron valores para actualizar" });
        await ConvenioGrupo.updateOne({ _id: grupo._id }, { $set: set });
        const categoriasAlcanzadas = await Categoria.countDocuments({ grupoId: grupo._id });
        res.json({ grupo: await ConvenioGrupo.findById(grupo._id).lean(), categoriasAlcanzadas });
    }
    catch (error) {
        responderError(res, error, "Update grupo salarial error");
    }
});
/**
 * DELETE /api/v1/arca/categorias/grupos/:id
 * Solo si quedó vacío: borrar un grupo con categorías las dejaría sin escala y sin dónde colgarlas.
 */
router.delete("/grupos/:id", authenticateToken, async (req, res) => {
    try {
        const cuantas = await Categoria.countDocuments({ grupoId: req.params.id });
        if (cuantas > 0)
            return res.status(409).json({ error: `El grupo tiene ${cuantas} categoría(s): movelas o eliminalas antes.` });
        const result = await ConvenioGrupo.deleteOne({ _id: req.params.id });
        if (result.deletedCount === 0)
            return res.status(404).json({ error: "Grupo salarial no encontrado" });
        res.json({ message: "Grupo salarial eliminado correctamente" });
    }
    catch (error) {
        console.error("Delete grupo salarial error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/**
 * Error de dato del cliente. Existe para poder distinguirlo de una falla real: un `catch` que
 * devolviera 400 ante cualquier `Error` convertiría un problema del servidor en "corregí el
 * formulario", y el operador se quedaría girando sobre un campo que estaba bien.
 */
class DatoInvalido extends Error {
}
/** Traduce el error a la respuesta: dato del cliente → 400; validación de Mongoose → 400; resto → 500. */
const responderError = (res, error, contexto) => {
    if (error instanceof DatoInvalido)
        return res.status(400).json({ error: error.message });
    if (error?.name === "ValidationError") {
        const detalle = Object.values(error.errors || {}).map((e) => e.message);
        return res.status(400).json({ error: detalle.join(" · ") || error.message });
    }
    console.error(`${contexto}:`, error);
    return res.status(500).json({ error: "Error interno del servidor" });
};
/** Resuelve el grupo destino de una categoría: por `grupoId` explícito o por `{convenio, numeroGrupo}`. */
const resolverGrupo = async (convenio, body) => {
    if (body.grupoId) {
        const g = await ConvenioGrupo.findById(body.grupoId);
        if (!g)
            throw new DatoInvalido("El grupo salarial indicado no existe");
        if (String(g.convenio).trim() !== convenio)
            throw new DatoInvalido(`El grupo ${g.numero} es del convenio ${g.convenio}, no de ${convenio}`);
        return g;
    }
    const numero = Number(body.numeroGrupo);
    if (!Number.isFinite(numero))
        throw new DatoInvalido("Falta el grupo salarial al que pertenece la categoría");
    const g = await ConvenioGrupo.findOne({ convenio, numero });
    if (!g)
        throw new DatoInvalido(`El convenio ${convenio} no tiene un grupo ${numero}: creá primero el grupo con su escala`);
    return g;
};
/**
 * POST /api/v1/arca/categorias
 * Alta de una categoría. No lleva importes: los hereda del grupo.
 */
router.post("/", authenticateToken, async (req, res) => {
    try {
        const convenio = String(req.body.convenio || "").trim();
        const nombre = String(req.body.nombre || "").trim();
        const codigoArca = aCodigoArca(req.body.codigoArca);
        if (!convenio)
            return res.status(400).json({ error: "El convenio es obligatorio" });
        if (!nombre)
            return res.status(400).json({ error: "El nombre es obligatorio" });
        if (!codigoArcaValido(codigoArca))
            return res.status(400).json({ error: 'El código de ARCA son 6 dígitos y no puede ser 0 (ej. "035283")' });
        const yaExiste = await Categoria.findOne({ convenio, codigoArca });
        if (yaExiste)
            return res.status(409).json({ error: `El convenio ${convenio} ya tiene la categoría ${codigoArca} ("${yaExiste.nombre}")` });
        const grupo = await resolverGrupo(convenio, req.body);
        const nueva = await Categoria.create({
            convenio,
            grupoId: grupo._id,
            codigoArca,
            nombre,
            descripcionArca: String(req.body.descripcionArca || "").trim(),
            isActive: req.body.isActive !== false,
        });
        res.status(201).json(nueva);
    }
    catch (error) {
        responderError(res, error, "Create categoría error");
    }
});
/**
 * PUT /api/v1/arca/categorias/:id
 * Solo lo identificatorio: convenio, grupo, código, nombre. La escala se edita en el grupo.
 */
router.put("/:id", authenticateToken, async (req, res) => {
    try {
        const item = await Categoria.findById(req.params.id);
        if (!item)
            return res.status(404).json({ error: "Categoría no encontrada" });
        const convenio = req.body.convenio !== undefined ? String(req.body.convenio || "").trim() : String(item.convenio || "").trim();
        if (!convenio)
            return res.status(400).json({ error: "El convenio es obligatorio" });
        if (req.body.codigoArca !== undefined) {
            const codigoArca = aCodigoArca(req.body.codigoArca);
            if (!codigoArcaValido(codigoArca))
                return res.status(400).json({ error: 'El código de ARCA son 6 dígitos y no puede ser 0 (ej. "035283")' });
            const choque = await Categoria.findOne({ convenio, codigoArca, _id: { $ne: item._id } });
            if (choque)
                return res.status(409).json({ error: `El convenio ${convenio} ya tiene la categoría ${codigoArca} ("${choque.nombre}")` });
            item.codigoArca = codigoArca;
        }
        if (req.body.nombre !== undefined)
            item.nombre = String(req.body.nombre || "").trim();
        if (req.body.descripcionArca !== undefined)
            item.descripcionArca = String(req.body.descripcionArca || "").trim();
        if (req.body.isActive !== undefined)
            item.isActive = req.body.isActive !== false;
        // Si cambió el convenio o el grupo, se re-resuelve el destino. Mudar de convenio SIN indicar
        // grupo falla a propósito: el grupo N de un convenio no es el grupo N de otro, y elegirlo solo
        // por el número le pondría a la categoría una escala que no es la suya.
        const cambioConvenio = convenio !== String(item.convenio || "").trim();
        if (cambioConvenio || req.body.grupoId !== undefined || req.body.numeroGrupo !== undefined) {
            const grupo = await resolverGrupo(convenio, req.body);
            item.grupoId = grupo._id;
        }
        item.convenio = convenio;
        await item.save();
        res.json(item);
    }
    catch (error) {
        responderError(res, error, "Update categoría error");
    }
});
/**
 * DELETE /api/v1/arca/categorias/:id
 *
 * Se niega si hay contratos usándola: `categoria_sat_id` es parte de la clave con la que el sync de
 * FRAME reconoce un contrato, así que borrar la categoría deja contratos que no resuelven ni sueldo
 * ni código de ARCA. Para sacarla de circulación sin romper nada está `isActive: false`, que la
 * mantiene resolviendo pero fuera de los selectores.
 */
router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const item = await Categoria.findById(req.params.id).lean();
        if (!item)
            return res.status(404).json({ error: "Categoría no encontrada" });
        if (item.legacyId != null) {
            const uso = (await contratosPorLegacyId()).get(Number(item.legacyId)) || 0;
            if (uso > 0) {
                return res.status(409).json({ error: `No se puede eliminar: ${uso} contrato(s) usan "${item.nombre}". Desactivala en su lugar (deja de ofrecerse en contratos nuevos y los existentes siguen resolviendo).`, contratos: uso });
            }
        }
        await Categoria.deleteOne({ _id: req.params.id });
        // El grupo NO se borra aunque quede sin categorías: la escala es del convenio.
        res.json({ message: "Categoría eliminada correctamente" });
    }
    catch (error) {
        console.error("Delete categoría error:", error);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});
/** Columnas de la plantilla de paritarias. La primera es el convenio: sin él la fila es ambigua. */
const COLUMNAS_PLANTILLA = ["convenio", "grupo", "nombreGrupo", "sueldoBasico", "sueldoAdicional", "presentismo", "sueldoBruto", "sueldoBrutoLetras", "neto", "sueldoNetoLetras"];
/**
 * GET /api/v1/arca/categorias/plantilla?convenio=0634/11
 *
 * La plantilla sale con los grupos REALES del convenio y su escala vigente: se baja, se pisan los
 * importes con los de la paritaria y se sube. Antes traía dos filas de ejemplo y había que adivinar
 * qué números existían.
 */
router.get("/plantilla", authenticateToken, async (req, res) => {
    try {
        const convenio = String(req.query.convenio || "").trim();
        if (!convenio)
            return res.status(400).json({ error: "Falta el convenio: la plantilla es de un convenio" });
        const grupos = await ConvenioGrupo.find({ convenio }).sort({ numero: 1 }).lean();
        const filas = [[...COLUMNAS_PLANTILLA]];
        for (const g of grupos) {
            filas.push([convenio, g.numero, g.nombre || "", g.sueldoBasico ?? 0, g.sueldoAdicional ?? 0, g.presentismo ?? 0, g.sueldoBruto ?? 0, g.sueldoBrutoLetras || "", g.neto ?? 0, g.sueldoNetoLetras || ""]);
        }
        const ws = xlsx.utils.aoa_to_sheet(filas);
        ws["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 45 }, { wch: 16 }, { wch: 45 }];
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, "Escalas");
        const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=escalas_${convenio.replace(/\W/g, "_")}.xlsx`);
        res.send(buffer);
    }
    catch (error) {
        console.error("Download plantilla de escalas error:", error);
        res.status(500).json({ error: "No se pudo generar la plantilla" });
    }
});
/**
 * POST /api/v1/arca/categorias/importar
 *
 * Carga masiva de PARITARIAS: actualiza la escala de los grupos, identificados por
 * `{convenio, grupo}`. La columna de convenio es obligatoria — sin ella, un grupo 7 podía ser el de
 * cualquier CCT y la importación vieja los actualizaba TODOS.
 *
 * No crea ni borra grupos ni categorías: una paritaria cambia importes, no la estructura del CCT.
 */
router.post("/importar", authenticateToken, upload.single("file"), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ error: "Debe subir un archivo de Excel" });
        const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        if (rows.length === 0)
            return res.status(400).json({ error: "El archivo de Excel está vacío" });
        const num = (v) => {
            if (v === undefined || v === null || v === "")
                return 0;
            const n = Number(v);
            return isNaN(n) ? 0 : n;
        };
        const errores = [];
        const items = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const fila = i + 2;
            const convenio = String(row["convenio"] ?? row["Convenio"] ?? row["CCT"] ?? "").trim();
            const grupoRaw = row["grupo"] ?? row["Grupo"] ?? row["numeroCategoria"] ?? row["Nº Grupo"];
            if (!convenio) {
                errores.push(`Fila ${fila}: falta la columna 'convenio'. Sin convenio no se sabe de qué CCT es el grupo.`);
                continue;
            }
            const grupo = Number(grupoRaw);
            if (!Number.isFinite(grupo)) {
                errores.push(`Fila ${fila}: la columna 'grupo' es obligatoria y tiene que ser un número.`);
                continue;
            }
            items.push({
                convenio,
                grupo,
                escala: {
                    sueldoBasico: num(row["sueldoBasico"] ?? row["Sueldo Básico"] ?? row["Sueldo Basico"]),
                    sueldoAdicional: num(row["sueldoAdicional"] ?? row["Sueldo Adicional"]),
                    presentismo: num(row["presentismo"] ?? row["Presentismo"]),
                    sueldoBruto: num(row["sueldoBruto"] ?? row["Sueldo Bruto"]),
                    sueldoBrutoLetras: String(row["sueldoBrutoLetras"] ?? row["Sueldo Bruto Letras"] ?? "").trim(),
                    neto: num(row["neto"] ?? row["Neto"]),
                    sueldoNetoLetras: String(row["sueldoNetoLetras"] ?? row["Sueldo Neto Letras"] ?? "").trim(),
                    ...(row["nombreGrupo"] !== undefined ? { nombre: String(row["nombreGrupo"] ?? "").trim() } : {}),
                },
            });
        }
        if (errores.length > 0)
            return res.status(400).json({ error: "Errores de validación en el archivo Excel", details: errores });
        const fechaActualizacion = new Date().toISOString().split("T")[0];
        let actualizados = 0;
        const noEncontrados = [];
        for (const item of items) {
            const r = await ConvenioGrupo.updateOne({ convenio: item.convenio, numero: item.grupo }, { $set: { ...item.escala, fechaActualizacion } });
            if (r.matchedCount === 0)
                noEncontrados.push(`${item.convenio} grupo ${item.grupo}`);
            else
                actualizados++;
        }
        // Los que no matchean se REPORTAN, no se crean: un grupo que no existe en el CCT es un error de
        // la planilla, y crearlo en silencio inventa estructura del convenio.
        const partes = [`Se actualizó la escala de ${actualizados} grupo(s).`];
        if (noEncontrados.length > 0)
            partes.push(`No existen (no se crearon): ${noEncontrados.join(", ")}.`);
        res.json({ message: partes.join(" "), count: actualizados, noEncontrados });
    }
    catch (error) {
        console.error("Import escalas error:", error);
        res.status(500).json({ error: "Error interno al procesar el archivo Excel" });
    }
});
export { router as arcaCategoriasRoutes };

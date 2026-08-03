import { Router } from "express";
import { Info } from "../models/Info.js";
import { authenticateToken } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
const router = Router();
const ESTADO_TYPE = "estado-empleado";
const normalizarNombre = (s) => (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
/**
 * Semilla de `data.orden` para los Estados que ya existían antes de este campo (portada del mapa
 * `ESTADO_ORDER` que tenía hardcodeado el frontend en `EstadoSelect.tsx`). Un estado no reconocido
 * queda en 999 (al final) hasta que alguien lo reordene a mano desde el ABM.
 */
const ORDEN_SEMILLA = {
    "pedido de afip": 0,
    "falta pedido de afip": 0,
    "pedido servicios": 1,
    "envio de documentacion": 2,
    "firma pendiente": 3,
    disponible: 4,
};
const ORDEN_NO_RECONOCIDO = 999;
/**
 * Backfill idempotente: a todo Estado que todavía no tenga `data.orden` (documentos de antes de
 * este campo) le asigna un valor inicial, para no pisar en silencio el orden que el usuario ya
 * conocía por `ESTADO_ORDER`. Se dispara solo (no hace falta correr un script en el VPS), mismo
 * patrón que `ensureContratosBackfilled()` en `routes/contratos.ts`.
 */
async function ensureEstadosOrdenBackfilled() {
    const sinOrden = await Info.find({ type: ESTADO_TYPE, "data.orden": { $exists: false } });
    if (sinOrden.length === 0)
        return;
    const ops = sinOrden.map((estado) => ({
        updateOne: {
            filter: { _id: estado._id },
            update: { $set: { "data.orden": ORDEN_SEMILLA[normalizarNombre(estado.name)] ?? ORDEN_NO_RECONOCIDO } },
        },
    }));
    await Info.bulkWrite(ops);
}
/**
 * GET /api/v1/info
 * Query: ?type=sede
 */
router.get("/", requireTenant, authenticateToken, async (req, res) => {
    try {
        const { type } = req.query;
        const filter = {};
        if (type) {
            filter.type = type;
        }
        if (type === ESTADO_TYPE) {
            await ensureEstadosOrdenBackfilled();
            const items = await Info.find(filter)
                .sort({ "data.orden": 1, name: 1 })
                .lean();
            res.json(items);
            return;
        }
        const items = await Info.find(filter).sort({ name: 1 }).lean();
        res.json(items);
    }
    catch (error) {
        console.error("Get info error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/* ------------------------------- ABM de Estados -------------------------------
 * Los estados del contrato son `infos` con type "estado-empleado" (los sincroniza FRAME).
 * El ABM de Configuración agrega los campos propios en `data`: color del badge, tipos de
 * contrato en los que se ofrece y el nombre que lleva dentro del contrato.
 * Los contratos guardan `estado_id` (data.id numérico), así que a los estados creados a mano
 * hay que darles un id que no colisione con los de FRAME.
 */
// Los ids de FRAME son bajos; los locales arrancan bien arriba para no pisarlos nunca.
const LOCAL_ESTADO_ID_BASE = 100000;
/** Trámite impositivo que representa un estado impositivo. Excluyentes: siempre uno solo. */
const TIPOS_IMPOSITIVO = ["alta_temprana_afip", "constancia_cuit"];
/** Eventos que pueden disparar una transición automática hacia un estado. */
const EVENTOS_TRANSICION_AUTOMATICA = ["alta_documento_subido", "dropbox_carpeta"];
/**
 * ¿El estado (con el `data` que va a quedar guardado tras este request) tiene `ordenDependencia`?
 * En POST no hay `estadoActual` (todavía no existe); en PATCH hace falta para cubrir el caso en que
 * el request no toca `ordenDependencia` pero el estado ya lo tenía asignado de antes.
 */
function tieneOrdenDependencia(parsedData, estadoActual) {
    const valor = parsedData.ordenDependencia !== undefined ? parsedData.ordenDependencia : estadoActual?.data?.ordenDependencia;
    return typeof valor === "number";
}
function parseEstadoBody(body) {
    const name = String(body?.name ?? "").trim();
    if (!name)
        return { error: "El nombre es obligatorio" };
    const color = String(body?.color ?? "").trim();
    if (color && !/^#[0-9a-f]{6}$/i.test(color))
        return { error: "El color debe ser hexadecimal, por ejemplo #16a34a" };
    const contratoFrameIds = Array.isArray(body?.contratoFrameIds) ? body.contratoFrameIds.map((id) => String(id)).filter(Boolean) : [];
    const esImpositivo = body?.esImpositivo === true || body?.esImpositivo === "true";
    // Un estado impositivo sin tipos aplicaría a TODOS y chocaría con cualquier otro impositivo,
    // así que se le exige elegir a cuáles corresponde.
    if (esImpositivo && contratoFrameIds.length === 0) {
        return { error: "Un estado impositivo tiene que indicar a qué tipos de contrato corresponde" };
    }
    // El badge secundario (texto + color) solo tiene sentido para estados impositivos: si se destilda
    // "Estado impositivo" se descarta, para no dejar un badge secundario huérfano configurado. Si está
    // tildado, el texto es obligatorio: sin él no se puede mostrar el badge en las tarjetas.
    const colorEtiquetaSecundaria = String(body?.colorEtiquetaSecundaria ?? "").trim();
    if (colorEtiquetaSecundaria && !/^#[0-9a-f]{6}$/i.test(colorEtiquetaSecundaria))
        return { error: "El color del badge secundario debe ser hexadecimal, por ejemplo #16a34a" };
    const etiquetaSecundaria = esImpositivo ? String(body?.etiquetaSecundaria ?? "").trim() : "";
    if (esImpositivo && !etiquetaSecundaria) {
        return { error: "Un estado impositivo tiene que tener un texto de badge secundario" };
    }
    // Todo estado impositivo tiene que ser exactamente uno de estos dos trámites (nunca los dos ni
    // ninguno): "Alta temprana de AFIP" o "Constancia de CUIT".
    const tipoImpositivo = esImpositivo ? String(body?.tipoImpositivo ?? "").trim() : "";
    if (esImpositivo && !TIPOS_IMPOSITIVO.includes(tipoImpositivo)) {
        return { error: "Un estado impositivo tiene que ser 'Alta temprana de AFIP' o 'Constancia de CUIT'" };
    }
    // Transición automática: opcional. Si viene, el evento tiene que ser uno de los soportados, y si
    // es "dropbox_carpeta" hace falta indicar qué carpeta vigilar (sin eso el job no sabría dónde mirar).
    const rawTransicion = body?.transicionAutomatica;
    let transicionAutomatica;
    if (rawTransicion && typeof rawTransicion === "object" && rawTransicion.evento) {
        const evento = String(rawTransicion.evento).trim();
        if (!EVENTOS_TRANSICION_AUTOMATICA.includes(evento)) {
            return { error: "El evento de transición automática no es válido" };
        }
        if (evento === "dropbox_carpeta") {
            const dropboxCarpeta = String(rawTransicion.dropboxCarpeta ?? "").trim();
            if (!dropboxCarpeta)
                return { error: "La transición por carpeta de Dropbox necesita indicar la carpeta a vigilar" };
            transicionAutomatica = { evento, dropboxCarpeta };
        }
        else {
            transicionAutomatica = { evento };
        }
    }
    const data = {
        nombre: name,
        color: color || undefined,
        contratoFrameIds,
        esImpositivo,
        etiquetaSecundaria: etiquetaSecundaria || undefined,
        colorEtiquetaSecundaria: esImpositivo ? colorEtiquetaSecundaria || undefined : undefined,
        tipoImpositivo: esImpositivo ? tipoImpositivo : undefined,
        transicionAutomatica,
    };
    // Los estados impositivos van por defecto al Paso 1 del flujo de dependencias. Solo se toca
    // `ordenDependencia` cuando es impositivo; en los no impositivos NO se incluye la clave, para que
    // el update (spread `{ ...estado.data, ...parsed.data }`) preserve el paso que tengan en el flujo.
    if (esImpositivo)
        data.ordenDependencia = 1;
    return { name, data };
}
/**
 * Cada tipo de contrato puede tener un solo estado impositivo: si otro ya lo tomó, no se puede
 * guardar. Devuelve el mensaje de error, o null si no hay conflicto.
 */
async function conflictoImpositivo(data, excluirId) {
    if (!data?.esImpositivo)
        return null;
    const otros = await Info.find({ type: ESTADO_TYPE, "data.esImpositivo": true, ...(excluirId ? { _id: { $ne: excluirId } } : {}) }).lean();
    const tomados = new Map();
    for (const otro of otros) {
        for (const id of otro.data?.contratoFrameIds || [])
            tomados.set(String(id), otro.name);
    }
    const chocan = (data.contratoFrameIds || []).filter((id) => tomados.has(String(id)));
    if (chocan.length === 0)
        return null;
    const porEstado = [...new Set(chocan.map((id) => tomados.get(String(id))))];
    return `Esos tipos de contrato ya tienen un estado impositivo: ${porEstado.join(", ")}`;
}
// POST /info/estados - crear estado
router.post("/estados", requireTenant, authenticateToken, async (req, res) => {
    try {
        const parsed = parseEstadoBody(req.body);
        if (parsed.error) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        if (parsed.data.transicionAutomatica && !tieneOrdenDependencia(parsed.data)) {
            res.status(400).json({ error: "Antes de configurar una transición automática, el estado tiene que estar asignado a un paso del flujo de dependencias" });
            return;
        }
        const existente = await Info.findOne({ type: ESTADO_TYPE, name: parsed.name }).lean();
        if (existente) {
            res.status(409).json({ error: "Ya existe un estado con ese nombre" });
            return;
        }
        const conflicto = await conflictoImpositivo(parsed.data);
        if (conflicto) {
            res.status(409).json({ error: conflicto });
            return;
        }
        const ultimoLocal = await Info.findOne({ type: ESTADO_TYPE, "data.id": { $gte: LOCAL_ESTADO_ID_BASE } })
            .sort({ "data.id": -1 })
            .lean();
        const nuevoId = Math.max(LOCAL_ESTADO_ID_BASE, Number(ultimoLocal?.data?.id ?? 0) + 1);
        // Nuevo estado al final del orden visual actual (arrastrarlo después es lo que lo reubica).
        const ultimoOrden = await Info.findOne({ type: ESTADO_TYPE }).sort({ "data.orden": -1 }).lean();
        const nuevoOrden = Number(ultimoOrden?.data?.orden ?? -1) + 1;
        const creado = await Info.create({
            type: ESTADO_TYPE,
            externalId: `local-${nuevoId}`,
            name: parsed.name,
            data: { ...parsed.data, id: nuevoId, orden: nuevoOrden },
        });
        res.status(201).json(creado.toObject());
    }
    catch (error) {
        console.error("Create estado error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /info/estados/reorder - guardar el orden visual tras arrastrar en el ABM.
// Tiene que registrarse ANTES de "/estados/:id": si no, Express matchea "reorder" como si fuera
// un :id y este endpoint nunca se alcanza (mismo cuidado que ya toma /shifts/reorder).
router.patch("/estados/reorder", requireTenant, authenticateToken, async (req, res) => {
    try {
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (items.length === 0) {
            res.status(400).json({ error: "Se requiere un array de items" });
            return;
        }
        // `Info` es una colección compartida por varios `type`: hay que confirmar que todos los ids
        // sean Estados de verdad antes de aplicar el bulk, para no corromper documentos de otro tipo.
        const ids = items.map((it) => String(it.id));
        const existentes = await Info.find({ _id: { $in: ids }, type: ESTADO_TYPE }).select("_id").lean();
        if (existentes.length !== ids.length) {
            res.status(400).json({ error: "Alguno de los estados no existe" });
            return;
        }
        const ops = items.map((it) => ({
            updateOne: { filter: { _id: it.id, type: ESTADO_TYPE }, update: { $set: { "data.orden": Number(it.orden) } } },
        }));
        await Info.bulkWrite(ops);
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Reorder estados error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /info/estados/reorder-dependencia - guardar el "orden de dependencias" (flujo de pasos).
// Independiente del orden visual: cada estado lleva un número de paso; los que comparten número son
// alternativas del mismo paso. `ordenDependencia: null` saca al estado del flujo (se hace $unset).
// Igual que /estados/reorder, tiene que registrarse ANTES de "/estados/:id".
router.patch("/estados/reorder-dependencia", requireTenant, authenticateToken, async (req, res) => {
    try {
        const items = Array.isArray(req.body?.items) ? req.body.items : [];
        if (items.length === 0) {
            res.status(400).json({ error: "Se requiere un array de items" });
            return;
        }
        // `Info` es compartida por varios `type`: confirmar que todos sean Estados antes del bulk.
        const ids = items.map((it) => String(it.id));
        const existentes = await Info.find({ _id: { $in: ids }, type: ESTADO_TYPE }).select("_id").lean();
        if (existentes.length !== ids.length) {
            res.status(400).json({ error: "Alguno de los estados no existe" });
            return;
        }
        const ops = items.map((it) => {
            const n = it.ordenDependencia;
            const update = n === null || n === undefined
                ? { $unset: { "data.ordenDependencia": "" } } // fuera del flujo → campo ausente (canónico)
                : { $set: { "data.ordenDependencia": Number(n) } };
            return { updateOne: { filter: { _id: it.id, type: ESTADO_TYPE }, update } };
        });
        await Info.bulkWrite(ops);
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Reorder estados dependencia error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /info/estados/:id - editar estado
router.patch("/estados/:id", requireTenant, authenticateToken, async (req, res) => {
    try {
        const parsed = parseEstadoBody(req.body);
        if (parsed.error) {
            res.status(400).json({ error: parsed.error });
            return;
        }
        const estado = await Info.findOne({ _id: req.params.id, type: ESTADO_TYPE });
        if (!estado) {
            res.status(404).json({ error: "Estado no encontrado" });
            return;
        }
        if (parsed.data.transicionAutomatica && !tieneOrdenDependencia(parsed.data, estado)) {
            res.status(400).json({ error: "Antes de configurar una transición automática, el estado tiene que estar asignado a un paso del flujo de dependencias" });
            return;
        }
        const duplicado = await Info.findOne({ type: ESTADO_TYPE, name: parsed.name, _id: { $ne: estado._id } }).lean();
        if (duplicado) {
            res.status(409).json({ error: "Ya existe un estado con ese nombre" });
            return;
        }
        const conflicto = await conflictoImpositivo(parsed.data, String(estado._id));
        if (conflicto) {
            res.status(409).json({ error: conflicto });
            return;
        }
        // Se preserva `data.id`: es lo que referencian los contratos ya guardados (estado_id).
        estado.name = parsed.name;
        estado.data = { ...(estado.data || {}), ...parsed.data, id: estado.data?.id };
        await estado.save();
        res.json(estado.toObject());
    }
    catch (error) {
        console.error("Update estado error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
/* --------- ABM de Sedes (Info type "sede") ---------
 * Las sedes también llegan por la sincronización de FRAME (con su `externalId`/`data.id`), pero se
 * permite crearlas/editarlas/eliminarlas a mano. Las creadas localmente usan un `externalId` "local:N"
 * y un `data.id` incremental para distinguirlas y no chocar con las de FRAME. `data.codigoSucursal`
 * (5 díg.) es el código AFIP para el TXT de Alta masiva. */
const SEDE_TYPE = "sede";
/** Próximo `data.id` disponible para una sede nueva (evita colisión con las de FRAME). */
const nextSedeId = async () => {
    const last = await Info.findOne({ type: SEDE_TYPE }).sort({ "data.id": -1 }).lean();
    return (Number(last?.data?.id) || 0) + 1;
};
// POST /info/sede — crear sede manual
router.post("/sede", requireTenant, authenticateToken, async (req, res) => {
    try {
        const nombre = String(req.body?.nombre ?? "").trim();
        if (!nombre) {
            res.status(400).json({ error: "El nombre es obligatorio" });
            return;
        }
        const codigoSucursal = req.body?.codigoSucursal != null ? String(req.body.codigoSucursal).trim() : "";
        const externalIdIn = req.body?.externalId != null ? String(req.body.externalId).trim() : "";
        const id = await nextSedeId();
        const created = await Info.create({
            type: SEDE_TYPE,
            name: nombre,
            externalId: externalIdIn || `local:${id}`,
            data: { id, nombre, codigoSucursal },
        });
        res.status(201).json(created.toObject());
    }
    catch (error) {
        console.error("Create sede error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// PATCH /info/sede/:id — editar sede (nombre, ID externo, código de sucursal)
router.patch("/sede/:id", requireTenant, authenticateToken, async (req, res) => {
    try {
        const update = {};
        if (req.body?.nombre !== undefined) {
            const nombre = String(req.body.nombre).trim();
            if (!nombre) {
                res.status(400).json({ error: "El nombre es obligatorio" });
                return;
            }
            update.name = nombre;
            update["data.nombre"] = nombre;
        }
        if (req.body?.externalId !== undefined) {
            const ext = String(req.body.externalId).trim();
            if (ext)
                update.externalId = ext;
        }
        if (req.body?.codigoSucursal !== undefined) {
            update["data.codigoSucursal"] = req.body.codigoSucursal == null ? "" : String(req.body.codigoSucursal).trim();
        }
        const sede = await Info.findOneAndUpdate({ _id: req.params.id, type: SEDE_TYPE }, { $set: update }, { new: true }).lean();
        if (!sede) {
            res.status(404).json({ error: "Sede no encontrada" });
            return;
        }
        res.json(sede);
    }
    catch (error) {
        console.error("Update sede error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /info/sede/:id — eliminar sede
router.delete("/sede/:id", requireTenant, authenticateToken, async (req, res) => {
    try {
        const borrado = await Info.findOneAndDelete({ _id: req.params.id, type: SEDE_TYPE }).lean();
        if (!borrado) {
            res.status(404).json({ error: "Sede no encontrada" });
            return;
        }
        res.json({ message: "Sede eliminada correctamente" });
    }
    catch (error) {
        console.error("Delete sede error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// DELETE /info/estados/:id
router.delete("/estados/:id", requireTenant, authenticateToken, async (req, res) => {
    try {
        const borrado = await Info.findOneAndDelete({ _id: req.params.id, type: ESTADO_TYPE }).lean();
        if (!borrado) {
            res.status(404).json({ error: "Estado no encontrado" });
            return;
        }
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Delete estado error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export { router as infoRoutes };

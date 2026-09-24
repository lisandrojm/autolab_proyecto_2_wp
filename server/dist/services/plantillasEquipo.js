import mongoose, { Types } from "mongoose";
import { PlantillaEquipo } from "../models/PlantillaEquipo.js";
import { LoteContratacion } from "../models/LoteContratacion.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Contrato } from "../models/Contrato.js";
import { Convenio } from "../models/Convenio.js";
import { CategoriaSat } from "../models/CategoriaSat.js";
import { RequestConfig } from "../models/RequestConfig.js";
import { importePorJornada } from "../compartido/jornadas.js";
import { armarPayloadDeSolicitud } from "../compartido/solicitudDeContratacion.js";
import { erroresDelLote, MAX_INTEGRANTES_POR_LOTE, planDeLote } from "../utils/planDeLote.js";
import { superposicionesDeAlta, pedidoDesdeSolicitud } from "./superposicion.js";
import { efectosDeSolicitudNueva, prepararSolicitudNueva, rolesPorDefecto } from "./solicitudes.js";
import { createUserSchema, normalizarRolesFrame } from "../validators/usuarioSchemas.js";
/*
  ═══════════════════════════════════════════════════════════════════════
  PLANTILLAS DE EQUIPO: la parte que toca la base
  ═══════════════════════════════════════════════════════════════════════

  El modelo y sus reglas están en `models/PlantillaEquipo.ts`; qué solicitud sale de cada integrante,
  en `utils/planDeLote.ts` (puro, con tests). Acá se lee la base para armar el `Contexto` del plan, se
  guardan las plantillas y se crea el lote.

  CONTRATAR ES TODO O NADA: las N solicitudes y el lote se guardan en UNA transacción. Si no se puede
  abrir (una base sin replica set), se rechaza en vez de crear a medias. Los efectos hacia afuera —avisos
  a quien aprueba, renovaciones— van DESPUÉS del commit, uno por solicitud, iguales al alta individual.
*/
export class ErrorPlantilla extends Error {
    status;
    extra;
    constructor(status, message, extra) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}
const oid = (x) => new Types.ObjectId(String(x));
const idOk = (x) => !!x && Types.ObjectId.isValid(String(x));
const str = (x) => (x == null ? "" : String(x));
const nombreDe = (u) => (u?.metadata?.fullName || `${u?.firstName || ""} ${u?.lastName || ""}`).trim() || u?.email || "Sin nombre";
const esHora = (h) => typeof h === "string" && /^\d{1,2}:\d{2}$/.test(h);
// ── Valores comunes ─────────────────────────────────────────────────────
/** Lo editable de una plantilla (sin integrantes), validado. Lo que no viene no se toca. */
function leerComunes(body) {
    const c = {};
    if (body.nombre !== undefined) {
        const n = String(body.nombre || "").trim();
        if (!n)
            throw new ErrorPlantilla(400, "Poné un nombre a la plantilla.");
        c.nombre = n.slice(0, 120);
    }
    for (const campo of ["empresaContratoId", "convenioId", "contratoId"]) {
        if (body[campo] !== undefined)
            c[campo] = idOk(body[campo]) ? oid(body[campo]) : null;
    }
    if (body.nombreContrato !== undefined)
        c.nombreContrato = str(body.nombreContrato).slice(0, 200);
    if (body.tipoImpositivo !== undefined)
        c.tipoImpositivo = str(body.tipoImpositivo).slice(0, 60);
    if (body.areaShiftAssignments !== undefined) {
        c.areaShiftAssignments = (Array.isArray(body.areaShiftAssignments) ? body.areaShiftAssignments : [])
            .filter((a) => idOk(a?.areaId))
            .map((a) => ({ areaId: oid(a.areaId), shiftIds: (a.shiftIds || []).filter(idOk).map(oid) }));
    }
    for (const campo of ["inTime", "outTime"]) {
        if (body[campo] !== undefined) {
            if (body[campo] && !esHora(body[campo]))
                throw new ErrorPlantilla(400, "El horario tiene que ser HH:MM.");
            c[campo] = str(body[campo]);
        }
    }
    if (body.diasSemana !== undefined)
        c.diasSemana = [...new Set((Array.isArray(body.diasSemana) ? body.diasSemana : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    if (body.diasPorSemana !== undefined)
        c.diasPorSemana = Number(body.diasPorSemana) >= 1 && Number(body.diasPorSemana) <= 7 ? Number(body.diasPorSemana) : null;
    if (body.diasRotativos !== undefined)
        c.diasRotativos = !!body.diasRotativos;
    if (body.comentarios !== undefined)
        c.comentarios = str(body.comentarios).trim().slice(0, 2000);
    return c;
}
async function cargar(tenantId, id) {
    if (!idOk(id))
        throw new ErrorPlantilla(404, "No se encontró la plantilla.");
    const p = await PlantillaEquipo.findOne({ _id: oid(id), tenantId, activo: true });
    if (!p)
        throw new ErrorPlantilla(404, "No se encontró la plantilla.");
    return p;
}
const nombreRepetido = (e) => e?.code === 11000;
// ── Lectura ─────────────────────────────────────────────────────────────
/** Las plantillas de un proyecto, para la lista (con cuántos integrantes y la última contratación). */
export async function listarPlantillas(tenantId, projectId) {
    if (!idOk(projectId))
        return [];
    const lista = await PlantillaEquipo.find({ tenantId, projectId: oid(projectId), activo: true }).sort({ nombre: 1 }).lean();
    return lista.map((p) => ({
        _id: String(p._id),
        nombre: p.nombre,
        projectId: String(p.projectId),
        nombreContrato: p.nombreContrato || "",
        areaShiftAssignments: p.areaShiftAssignments,
        inTime: p.inTime,
        outTime: p.outTime,
        integrantes: (p.integrantes || []).length,
        sinAsignar: (p.integrantes || []).filter((i) => !i.userId).length,
        ultimaContratacionEl: p.ultimaContratacionEl || null,
    }));
}
/** Una plantilla con sus integrantes resueltos a nombre (para el editor). */
export async function obtenerPlantilla(tenantId, id) {
    const p = (await cargar(tenantId, id)).toObject();
    const userIds = [...(p.integrantes || []).map((i) => i.userId), ...(p.integrantes || []).map((i) => i.reemplazadoDePersonaId)].filter(Boolean);
    const personas = userIds.length ? await User.find({ _id: { $in: userIds }, tenantId }).select("firstName lastName email metadata.fullName metadata.activo metadata.isSolicitud").lean() : [];
    const persona = new Map(personas.map((u) => [String(u._id), u]));
    return {
        ...p,
        _id: String(p._id),
        integrantes: [...(p.integrantes || [])]
            .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
            .map((i) => ({
            ...i,
            _id: String(i._id),
            // `null` = puesto sin asignar: se completa en el editor (para siempre) o al contratar (esa vez).
            userId: i.userId ? String(i.userId) : null,
            nombre: !i.userId ? "" : persona.has(String(i.userId)) ? nombreDe(persona.get(String(i.userId))) : "Persona no encontrada",
            activo: !i.userId || (persona.get(String(i.userId))?.metadata?.activo !== false && !!persona.get(String(i.userId))),
            rolesFrame: (i.rolesFrame || []).map(String),
            reemplazadoDeNombre: i.reemplazadoDePersonaId ? nombreDe(persona.get(String(i.reemplazadoDePersonaId))) : "",
        })),
    };
}
// ── Escritura ───────────────────────────────────────────────────────────
export async function crearPlantilla(tenantId, creadorId, body) {
    if (!idOk(body?.projectId) || !(await Project.exists({ _id: oid(body.projectId), tenantId })))
        throw new ErrorPlantilla(400, "Elegí el proyecto de la plantilla.");
    const comunes = leerComunes({ nombre: "", ...body });
    try {
        const p = await PlantillaEquipo.create({ ...comunes, tenantId, projectId: oid(body.projectId), creadoPor: oid(creadorId), integrantes: [] });
        // Puede nacer con integrantes (ej. «Guardar como plantilla» desde el alta individual).
        if (Array.isArray(body.integrantes) && body.integrantes.length)
            await agregarIntegrantes(tenantId, String(p._id), body.integrantes);
        return obtenerPlantilla(tenantId, String(p._id));
    }
    catch (e) {
        if (nombreRepetido(e))
            throw new ErrorPlantilla(409, "Ya hay una plantilla con ese nombre en el proyecto.");
        throw e;
    }
}
export async function actualizarPlantilla(tenantId, id, body) {
    const p = await cargar(tenantId, id);
    const comunes = leerComunes(body);
    // Cambiar la empresa cambia el convenio: las categorías que no sean del nuevo quedan «a completar»
    // (el plan las marca como error hasta que se corrijan; no se borran para no perder qué eran).
    Object.assign(p, comunes);
    try {
        await p.save();
    }
    catch (e) {
        if (nombreRepetido(e))
            throw new ErrorPlantilla(409, "Ya hay una plantilla con ese nombre en el proyecto.");
        throw e;
    }
    return obtenerPlantilla(tenantId, id);
}
/** Borrar = dar de baja: los lotes ya contratados siguen apuntando a ella. */
export async function borrarPlantilla(tenantId, id) {
    const p = await cargar(tenantId, id);
    p.activo = false;
    await p.save();
}
export async function duplicarPlantilla(tenantId, creadorId, id, nombre) {
    const p = (await cargar(tenantId, id)).toObject();
    const base = (nombre || `${p.nombre} (copia)`).trim().slice(0, 120);
    for (let n = 0; n < 20; n++) {
        const candidato = n === 0 ? base : `${base} ${n + 1}`;
        try {
            const copia = await PlantillaEquipo.create({
                ...p,
                _id: undefined,
                nombre: candidato,
                creadoPor: oid(creadorId),
                integrantes: (p.integrantes || []).map((i) => ({ ...i, _id: new Types.ObjectId() })),
                ultimaContratacionEl: null,
                ultimoLoteId: null,
                createdAt: undefined,
                updatedAt: undefined,
            });
            return obtenerPlantilla(tenantId, String(copia._id));
        }
        catch (e) {
            if (!nombreRepetido(e))
                throw e;
        }
    }
    throw new ErrorPlantilla(409, "No se pudo elegir un nombre libre para la copia.");
}
// ── Integrantes ─────────────────────────────────────────────────────────
/** La escala (ya multiplicada) de una categoría con el tipo de contrato de la plantilla. */
async function escalaDe(plantilla, categoriaSatId) {
    if (!idOk(categoriaSatId))
        return null;
    const [cat, contrato] = await Promise.all([CategoriaSat.findById(categoriaSatId).select("data.neto").lean(), plantilla.contratoId ? Contrato.findById(plantilla.contratoId).select("data.multiplicadorDiario").lean() : null]);
    return cat ? importePorJornada(cat.data?.neto, contrato?.data?.multiplicadorDiario) : null;
}
/**
 * Suma puestos y/o personas. Cada entrada es un PUESTO: su rol (obligatorio si no hay persona) y, si ya se
 * sabe, la persona —sin roles, se toman los de su ficha—. `cantidad` repite un puesto sin asignar
 * («2 cámaras»). Nadie dos veces; los puestos sin asignar sí se repiten.
 */
export async function agregarIntegrantes(tenantId, id, nuevos) {
    const p = await cargar(tenantId, id);
    const ya = new Set(p.integrantes.filter((i) => i.userId).map((i) => String(i.userId)));
    const entradas = (Array.isArray(nuevos) ? nuevos : []).flatMap((n) => {
        if (idOk(n?.userId))
            return [n];
        const veces = Math.min(Math.max(1, Math.floor(Number(n?.cantidad) || 1)), MAX_INTEGRANTES_POR_LOTE);
        return Array.from({ length: veces }, () => ({ ...n, userId: null }));
    });
    const conPersona = entradas.filter((n) => n.userId);
    const repetidos = conPersona.filter((n) => ya.has(String(n.userId)));
    if (repetidos.length)
        throw new ErrorPlantilla(409, repetidos.length === 1 ? "Esa persona ya está en la plantilla." : `${repetidos.length} de esas personas ya están en la plantilla.`);
    if (new Set(conPersona.map((n) => String(n.userId))).size !== conPersona.length)
        throw new ErrorPlantilla(400, "Hay una persona repetida en lo que se quiere agregar.");
    if (entradas.some((n) => !n.userId && !(Array.isArray(n.rolesFrame) && n.rolesFrame.some(idOk))))
        throw new ErrorPlantilla(400, "Un puesto sin persona necesita su rol empresa.");
    if (p.integrantes.length + entradas.length > MAX_INTEGRANTES_POR_LOTE)
        throw new ErrorPlantilla(400, `Una plantilla admite hasta ${MAX_INTEGRANTES_POR_LOTE} puestos.`);
    const personas = conPersona.length ? await User.find({ _id: { $in: conPersona.map((n) => oid(n.userId)) }, tenantId }).select("metadata.roles_frame metadata.isSolicitud").lean() : [];
    const persona = new Map(personas.map((u) => [String(u._id), u]));
    let orden = p.integrantes.reduce((m, i) => Math.max(m, i.orden ?? 0), -1);
    for (const n of entradas) {
        const u = n.userId ? persona.get(String(n.userId)) : null;
        if (n.userId && (!u || u.metadata?.isSolicitud))
            throw new ErrorPlantilla(400, "Sólo se pueden agregar personas registradas.");
        const roles = (Array.isArray(n.rolesFrame) && n.rolesFrame.length ? n.rolesFrame : u?.metadata?.roles_frame || []).filter(idOk).map(oid);
        const categoriaSatId = idOk(n.categoriaSatId) ? oid(n.categoriaSatId) : null;
        const dailyRateManual = Number(n.dailyRateManual) > 0 ? Number(n.dailyRateManual) : null;
        p.integrantes.push({
            userId: n.userId ? oid(n.userId) : null,
            rolesFrame: roles,
            orden: ++orden,
            categoriaSatId,
            inTime: esHora(n.inTime) ? n.inTime : null,
            outTime: esHora(n.outTime) ? n.outTime : null,
            dailyRateManual,
            escalaAlFijar: dailyRateManual ? await escalaDe(p, categoriaSatId) : null,
            comentarios: n.comentarios ? str(n.comentarios).slice(0, 1000) : null,
        });
    }
    await p.save();
    return obtenerPlantilla(tenantId, id);
}
/**
 * Cambia lo propio de un integrante. `null` o "" en un campo = volver al valor del equipo. Fijar el importe
 * guarda la escala de ese momento, para avisar si después cambia.
 */
export async function actualizarIntegrante(tenantId, id, integranteId, body) {
    const p = await cargar(tenantId, id);
    const i = p.integrantes.find((x) => String(x._id) === String(integranteId));
    if (!i)
        throw new ErrorPlantilla(404, "Ese integrante ya no está en la plantilla.");
    if (body.rolesFrame !== undefined) {
        const roles = (Array.isArray(body.rolesFrame) ? body.rolesFrame : []).filter(idOk).map(oid);
        if (!roles.length)
            throw new ErrorPlantilla(400, "Cada integrante necesita al menos un rol empresa.");
        i.rolesFrame = roles;
    }
    if (body.categoriaSatId !== undefined)
        i.categoriaSatId = idOk(body.categoriaSatId) ? oid(body.categoriaSatId) : null;
    for (const campo of ["inTime", "outTime"]) {
        if (body[campo] !== undefined) {
            if (body[campo] && !esHora(body[campo]))
                throw new ErrorPlantilla(400, "El horario tiene que ser HH:MM.");
            i[campo] = body[campo] || null;
        }
    }
    if (body.dailyRateManual !== undefined || body.categoriaSatId !== undefined) {
        const monto = body.dailyRateManual !== undefined ? (Number(body.dailyRateManual) > 0 ? Number(body.dailyRateManual) : null) : i.dailyRateManual;
        i.dailyRateManual = monto;
        i.escalaAlFijar = monto ? await escalaDe(p, i.categoriaSatId) : null;
    }
    if (body.comentarios !== undefined)
        i.comentarios = body.comentarios ? str(body.comentarios).trim().slice(0, 1000) : null;
    // Dejar el puesto sin asignar (la persona sale; el puesto, con su rol y lo propio, queda).
    if (body.userId === null) {
        if (!i.rolesFrame?.length)
            throw new ErrorPlantilla(400, "Un puesto sin persona necesita su rol empresa.");
        i.userId = null;
    }
    if (body.orden !== undefined && Number.isFinite(Number(body.orden)))
        i.orden = Number(body.orden);
    p.markModified("integrantes");
    await p.save();
    return obtenerPlantilla(tenantId, id);
}
export async function quitarIntegrante(tenantId, id, integranteId) {
    const p = await cargar(tenantId, id);
    const antes = p.integrantes.length;
    p.integrantes = p.integrantes.filter((x) => String(x._id) !== String(integranteId));
    if (p.integrantes.length === antes)
        throw new ErrorPlantilla(404, "Ese integrante ya no está en la plantilla.");
    await p.save();
    return obtenerPlantilla(tenantId, id);
}
/**
 * REEMPLAZAR A UN INTEGRANTE por otra persona, para siempre (no es el «¿Reemplazo?» de una solicitud).
 * Se conservan rol/es y lo propio (horario, categoría, importe), y queda anotado a quién reemplazó.
 */
export async function reemplazarIntegrante(tenantId, id, integranteId, nuevoUserId) {
    const p = await cargar(tenantId, id);
    const i = p.integrantes.find((x) => String(x._id) === String(integranteId));
    if (!i)
        throw new ErrorPlantilla(404, "Ese integrante ya no está en la plantilla.");
    if (!idOk(nuevoUserId))
        throw new ErrorPlantilla(400, "Elegí a la persona que entra.");
    if (i.userId && String(i.userId) === String(nuevoUserId))
        throw new ErrorPlantilla(400, "Es la misma persona.");
    if (p.integrantes.some((x) => x.userId && String(x.userId) === String(nuevoUserId)))
        throw new ErrorPlantilla(409, "Esa persona ya está en la plantilla.");
    const u = await User.findOne({ _id: oid(nuevoUserId), tenantId }).select("metadata.isSolicitud").lean();
    if (!u || u.metadata?.isSolicitud)
        throw new ErrorPlantilla(400, "Sólo se pueden agregar personas registradas.");
    // Un puesto sin asignar se ASIGNA (no reemplaza a nadie); uno ocupado cambia de persona y queda anotado.
    if (i.userId) {
        i.reemplazadoDePersonaId = i.userId;
        i.reemplazadoEl = new Date();
    }
    i.userId = oid(nuevoUserId);
    p.markModified("integrantes");
    await p.save();
    return obtenerPlantilla(tenantId, id);
}
// ── Plan: preview y contratar ───────────────────────────────────────────
function leerContratacion(body) {
    const fechasIso = (xs) => (Array.isArray(xs) ? xs.map(String).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)) : undefined);
    const fechas = {
        fechas: fechasIso(body?.fechas),
        desde: /^\d{4}-\d{2}-\d{2}$/.test(str(body?.desde)) ? str(body.desde) : undefined,
        hasta: /^\d{4}-\d{2}-\d{2}$/.test(str(body?.hasta)) ? str(body.hasta) : undefined,
        jornadasRotativos: Number(body?.jornadasRotativos) > 0 ? Number(body.jornadasRotativos) : undefined,
    };
    const puntuales = {};
    for (const [k, v] of Object.entries(body?.puntuales || {})) {
        const x = v || {};
        puntuales[k] = {
            excluido: !!x.excluido,
            userId: idOk(x.userId) ? String(x.userId) : undefined,
            categoriaSatId: idOk(x.categoriaSatId) ? String(x.categoriaSatId) : undefined,
            inTime: esHora(x.inTime) ? x.inTime : undefined,
            outTime: esHora(x.outTime) ? x.outTime : undefined,
            dailyRate: Number(x.dailyRate) > 0 ? Number(x.dailyRate) : undefined,
            fechas: fechasIso(x.fechas),
            isReplacement: !!x.isReplacement,
            motivoReemplazoId: x.motivoReemplazoId ? String(x.motivoReemplazoId) : undefined,
            replacedUserId: idOk(x.replacedUserId) ? String(x.replacedUserId) : undefined,
            empleado_id_reemplezado: x.empleado_id_reemplezado || undefined,
        };
    }
    return { fechas, puntuales };
}
function paraPlan(p) {
    const s = (x) => (x ? String(x) : undefined);
    return {
        plantilla: {
            projectId: String(p.projectId),
            empresaContratoId: s(p.empresaContratoId),
            convenioId: s(p.convenioId),
            contratoId: s(p.contratoId),
            nombreContrato: p.nombreContrato || "",
            tipoImpositivo: p.tipoImpositivo || "",
            areaShiftAssignments: (p.areaShiftAssignments || []).map((a) => ({ areaId: String(a.areaId), shiftIds: (a.shiftIds || []).map(String) })),
            inTime: p.inTime || "",
            outTime: p.outTime || "",
            diasSemana: p.diasSemana || [],
            diasPorSemana: p.diasPorSemana ?? null,
            diasRotativos: !!p.diasRotativos,
            comentarios: p.comentarios || "",
        },
        integrantes: [...(p.integrantes || [])]
            .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
            .map((i) => ({
            _id: String(i._id),
            userId: i.userId ? String(i.userId) : "",
            rolesFrame: (i.rolesFrame || []).map(String),
            categoriaSatId: s(i.categoriaSatId) || null,
            inTime: i.inTime || null,
            outTime: i.outTime || null,
            dailyRateManual: i.dailyRateManual ?? null,
            escalaAlFijar: i.escalaAlFijar ?? null,
            comentarios: i.comentarios || null,
            reemplazadoDePersonaId: s(i.reemplazadoDePersonaId) || null,
        })),
    };
}
/** Todo lo que el plan necesita de la base, en paralelo. */
async function contextoDe(tenantId, p, integrantes, puntuales) {
    const categoriaIds = [...integrantes.map((i) => i.categoriaSatId), ...Object.values(puntuales).map((x) => x.categoriaSatId)].filter(idOk).map(oid);
    const [contrato, hayContratos, convenio, hayConvenios, categorias, personas, equipo, motivos] = await Promise.all([
        p.contratoId ? Contrato.findById(p.contratoId).select("name data").lean() : null,
        Contrato.exists({ isActive: { $ne: false } }),
        p.convenioId ? Convenio.findById(p.convenioId).select("externalId").lean() : null,
        Convenio.exists({}),
        categoriaIds.length ? CategoriaSat.find({ _id: { $in: categoriaIds } }).select("name data.neto data.convenio").lean() : [],
        User.find({ _id: { $in: [...integrantes.map((i) => i.userId), ...Object.values(puntuales).map((x) => x.userId)].filter(idOk).map(oid) }, tenantId }).select("firstName lastName email metadata.fullName metadata.activo metadata.isSolicitud").lean(),
        User.find({ tenantId, projectIds: oid(p.projectId) }).select("_id").lean(),
        RequestConfig.find({ tenantId, isActive: true }).select("name").lean(),
    ]);
    return {
        contrato: contrato ? { modoFechas: contrato.data?.modoFechas, esTiempoIndeterminado: !!contrato.data?.esTiempoIndeterminado, multiplicadorDiario: contrato.data?.multiplicadorDiario, horasPorJornada: contrato.data?.horasPorJornada ?? null } : null,
        hayContratos: !!hayContratos,
        convenioCct: String(convenio?.externalId || "").trim(),
        hayConvenios: !!hayConvenios,
        categorias: new Map(categorias.map((c) => [String(c._id), { neto: Number(c.data?.neto) || 0, convenio: String(c.data?.convenio || "").trim(), nombre: c.name || "" }])),
        personas: new Map(personas.map((u) => [String(u._id), { nombre: nombreDe(u), activo: u.metadata?.activo !== false, esSolicitud: !!u.metadata?.isSolicitud }])),
        equipo: new Set(equipo.map((u) => String(u._id))),
        // Mismo filtro que el formulario: activos y sin «horas extra», que no es una ausencia.
        motivos: new Set(motivos.filter((m) => !String(m.name || "").toLowerCase().includes("horas extra")).map((m) => String(m._id))),
        superposiciones: new Map(),
    };
}
/**
 * El plan completo. Dos pasadas: la primera resuelve las fechas de cada persona (una puede tener otros
 * días), con eso se buscan sus superposiciones, y la segunda las suma como advertencias.
 */
export async function planificar(tenantId, p, body) {
    const { plantilla, integrantes } = paraPlan(p);
    const { fechas, puntuales } = leerContratacion(body);
    const ctx = await contextoDe(tenantId, p, integrantes, puntuales);
    const borrador = planDeLote(plantilla, integrantes, fechas, puntuales, ctx);
    await Promise.all(borrador.filas
        .filter((f) => !f.excluido && f.datos && (f.datos.startDate || f.datos.fechasTrabajadas.length))
        .map(async (f) => {
        const metadata = armarPayloadDeSolicitud(f.datos).metadata;
        const avisos = await superposicionesDeAlta(tenantId, f.userId, pedidoDesdeSolicitud(metadata));
        ctx.superposiciones.set(f.userId, avisos.map((a) => ({ tipo: a.tipo, mensaje: a.mensaje })));
    }));
    return planDeLote(plantilla, integrantes, fechas, puntuales, ctx);
}
/** Sin `datos` (el payload), que es interno: al cliente le va lo que se muestra. */
const paraMostrar = (plan) => ({
    filas: plan.filas.map(({ datos, ...f }) => ({ ...f, fechasTrabajadas: datos?.fechasTrabajadas || [], desde: datos?.startDate || "", hasta: datos?.dueDate || "", comentarios: datos?.comentarios || "" })),
    totales: plan.totales,
    errores: erroresDelLote(plan),
});
export async function previewDeContratacion(tenantId, id, body) {
    const p = await cargar(tenantId, id);
    return paraMostrar(await planificar(tenantId, p.toObject(), body));
}
/**
 * CONTRATAR: revalida TODO (no confía en el preview que vio el cliente) y, sin errores, crea las N
 * solicitudes + el lote en una transacción. Con la misma `idempotencyKey` devuelve el lote ya creado.
 */
export async function contratarPlantilla(tenantId, creadorId, id, body) {
    const clave = str(body?.idempotencyKey).trim();
    if (!clave || clave.length > 100)
        throw new ErrorPlantilla(400, "Falta la clave de la contratación (idempotencyKey).");
    const yaHecho = await LoteContratacion.findOne({ tenantId, idempotencyKey: clave }).lean();
    if (yaHecho)
        return { repetido: true, loteId: String(yaHecho._id), solicitudIds: yaHecho.solicitudIds.map(String), totales: yaHecho.totales, nombrePlantilla: yaHecho.nombrePlantilla };
    const p = await cargar(tenantId, id);
    const plantillaObj = p.toObject();
    const plan = await planificar(tenantId, plantillaObj, body);
    const errores = erroresDelLote(plan);
    if (errores.length)
        throw new ErrorPlantilla(422, errores.join(" "), paraMostrar(plan));
    const incluidas = plan.filas.filter((f) => !f.excluido);
    const ahora = Date.now();
    const aleatorio = Math.random().toString(36).slice(2, 7);
    const sesion = await mongoose.startSession().catch(() => null);
    if (!sesion)
        throw new ErrorPlantilla(503, "La base no permite guardar el lote entero de una vez (sin transacciones): no se creó nada.");
    const loteId = new Types.ObjectId();
    const creadas = [];
    try {
        await sesion.withTransaction(async () => {
            creadas.length = 0;
            const roles = await rolesPorDefecto(tenantId, sesion);
            for (let n = 0; n < incluidas.length; n++) {
                const f = incluidas[n];
                // El MISMO camino que `POST /users`: payload compartido, mismo esquema, mismos sellos del server.
                const payload = armarPayloadDeSolicitud(f.datos, { ahora, sufijoEmail: `_${n + 1}_${aleatorio}` });
                const data = createUserSchema.parse(payload);
                normalizarRolesFrame(data.metadata);
                data.metadata.loteId = loteId;
                data.metadata.plantillaEquipoId = p._id;
                // Congelado al contratar: renombrar la plantilla después no cambia cómo se llamó este lote.
                data.metadata.loteNombre = p.nombre;
                const rechazo = await prepararSolicitudNueva(tenantId, creadorId, data.metadata);
                if (rechazo)
                    throw new ErrorPlantilla(422, `${f.nombre}: ${rechazo}`);
                const [u] = await User.create([{ ...data, roles, tenantId }], { session: sesion });
                creadas.push(u);
            }
            await LoteContratacion.create([
                {
                    _id: loteId,
                    tenantId,
                    plantillaEquipoId: p._id,
                    projectId: p.projectId,
                    nombrePlantilla: p.nombre,
                    idempotencyKey: clave,
                    creadoPor: oid(creadorId),
                    solicitudIds: creadas.map((u) => u._id),
                    totales: { personas: plan.totales.personas, jornadas: plan.totales.jornadas, importe: plan.totales.importe },
                },
            ], { session: sesion });
            await PlantillaEquipo.updateOne({ _id: p._id }, { $set: { ultimaContratacionEl: new Date(), ultimoLoteId: loteId } }, { session: sesion });
        });
    }
    catch (e) {
        // Doble toque que llegó a la vez: el otro pedido ya creó el lote con esta clave.
        if (e?.code === 11000 && /idempotencyKey/.test(String(e?.message || JSON.stringify(e?.keyPattern || {})))) {
            const otro = await LoteContratacion.findOne({ tenantId, idempotencyKey: clave }).lean();
            if (otro)
                return { repetido: true, loteId: String(otro._id), solicitudIds: otro.solicitudIds.map(String), totales: otro.totales, nombrePlantilla: otro.nombrePlantilla };
        }
        if (/Transaction numbers are only allowed|replica set/i.test(String(e?.message)))
            throw new ErrorPlantilla(503, "La base no permite guardar el lote entero de una vez (sin transacciones): no se creó nada.");
        throw e;
    }
    finally {
        await sesion.endSession();
    }
    // Después del commit, como en el alta individual: un aviso por solicitud a quien aprueba.
    for (const u of creadas) {
        try {
            await efectosDeSolicitudNueva(tenantId, creadorId, u);
        }
        catch (e) {
            console.error("[PLANTILLA] Aviso de solicitud nueva falló:", e);
        }
    }
    return { repetido: false, loteId: String(loteId), solicitudIds: creadas.map((u) => String(u._id)), totales: plan.totales, nombrePlantilla: p.nombre };
}

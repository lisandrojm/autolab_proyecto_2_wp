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

  El modelo (general → puestos → equipos) está explicado en `models/PlantillaEquipo.ts`; qué solicitud
  sale de cada puesto, en `utils/planDeLote.ts` (puro, con tests). Acá se lee la base para armar el
  `Contexto` del plan, se guardan las plantillas y se crea el lote.

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
const nombreRepetido = (e) => e?.code === 11000;
const filtroDeAlcance = (acc) => (acc.alcance === "general" ? { alcance: "general" } : { creadoPor: oid(acc.userId), alcance: { $ne: "general" } });
async function cargar(acc, id) {
    if (!idOk(id))
        throw new ErrorPlantilla(404, "No se encontró la plantilla.");
    const p = await PlantillaEquipo.findOne({ _id: oid(id), tenantId: acc.tenantId, activo: true, ...filtroDeAlcance(acc) });
    if (!p)
        throw new ErrorPlantilla(404, "No se encontró la plantilla.");
    return p;
}
// ── Lo general ──────────────────────────────────────────────────────────
/** Lo editable de la hoja GENERAL, validado. Lo que no viene no se toca. */
function leerGeneral(body, acc) {
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
    if (body.comentarios !== undefined)
        c.comentarios = str(body.comentarios).trim().slice(0, 2000);
    // Una general no tiene proyecto, y por eso tampoco empresa ni convenio: se eligen en la copia.
    if (acc.alcance === "general")
        Object.assign(c, { empresaContratoId: null, convenioId: null });
    return c;
}
/** Los campos de un PUESTO que vienen en el body, validados. Lo que no viene no se toca. */
function leerPuesto(body, acc) {
    const c = {};
    if (body.rolesFrame !== undefined) {
        const roles = (Array.isArray(body.rolesFrame) ? body.rolesFrame : []).filter(idOk).map(oid);
        if (!roles.length)
            throw new ErrorPlantilla(400, "Cada puesto necesita su rol empresa.");
        c.rolesFrame = roles;
    }
    // Las generales no tienen áreas: son de cualquier proyecto.
    if (acc.alcance === "personal") {
        if (body.areaId !== undefined)
            c.areaId = idOk(body.areaId) ? oid(body.areaId) : null;
        if (body.shiftId !== undefined)
            c.shiftId = idOk(body.shiftId) ? oid(body.shiftId) : null;
    }
    for (const campo of ["inTime", "outTime"]) {
        if (body[campo] !== undefined) {
            if (body[campo] && !esHora(body[campo]))
                throw new ErrorPlantilla(400, "El horario tiene que ser HH:MM.");
            c[campo] = body[campo] || null;
        }
    }
    if (body.diasSemana !== undefined)
        c.diasSemana = [...new Set((Array.isArray(body.diasSemana) ? body.diasSemana : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    if (body.diasPorSemana !== undefined)
        c.diasPorSemana = Number(body.diasPorSemana) >= 1 && Number(body.diasPorSemana) <= 7 ? Number(body.diasPorSemana) : null;
    if (body.diasRotativos !== undefined)
        c.diasRotativos = !!body.diasRotativos;
    if (body.categoriaSatId !== undefined)
        c.categoriaSatId = idOk(body.categoriaSatId) ? oid(body.categoriaSatId) : null;
    if (body.dailyRateManual !== undefined)
        c.dailyRateManual = Number(body.dailyRateManual) > 0 ? Number(body.dailyRateManual) : null;
    if (body.comentarios !== undefined)
        c.comentarios = body.comentarios ? str(body.comentarios).trim().slice(0, 1000) : null;
    return c;
}
/** La escala (ya multiplicada) de una categoría con el tipo de contrato de la plantilla. */
async function escalaDe(plantilla, categoriaSatId) {
    if (!idOk(categoriaSatId))
        return null;
    const [cat, contrato] = await Promise.all([CategoriaSat.findById(categoriaSatId).select("data.neto").lean(), plantilla.contratoId ? Contrato.findById(plantilla.contratoId).select("data.multiplicadorDiario").lean() : null]);
    return cat ? importePorJornada(cat.data?.neto, contrato?.data?.multiplicadorDiario) : null;
}
// ── Lectura ─────────────────────────────────────────────────────────────
/** Las plantillas para la lista: las personales del proyecto; las generales, todas. */
export async function listarPlantillas(acc, projectId) {
    if (acc.alcance === "personal" && !idOk(projectId))
        return [];
    const lista = await PlantillaEquipo.find({ tenantId: acc.tenantId, activo: true, ...filtroDeAlcance(acc), ...(acc.alcance === "personal" ? { projectId: oid(projectId) } : {}) })
        .sort({ nombre: 1 })
        .lean();
    return lista.map((p) => ({
        _id: String(p._id),
        nombre: p.nombre,
        projectId: p.projectId ? String(p.projectId) : null,
        alcance: p.alcance || "personal",
        nombreContrato: p.nombreContrato || "",
        puestos: (p.integrantes || []).length,
        equipos: (p.equipos || []).map((e) => ({ _id: String(e._id), nombre: e.nombre, asignados: (e.asignaciones || []).length, ultimaContratacionEl: e.ultimaContratacionEl || null })),
        ultimaContratacionEl: p.ultimaContratacionEl || null,
    }));
}
/** Una plantilla con sus puestos y sus equipos, las personas resueltas a nombre (para el editor). */
export async function obtenerPlantilla(acc, id) {
    const p = (await cargar(acc, id)).toObject();
    const userIds = (p.equipos || []).flatMap((e) => (e.asignaciones || []).flatMap((a) => [a.userId, a.reemplazadoDePersonaId])).filter(Boolean);
    const personas = userIds.length ? await User.find({ _id: { $in: userIds }, tenantId: acc.tenantId }).select("firstName lastName email metadata.fullName metadata.activo").lean() : [];
    const persona = new Map(personas.map((u) => [String(u._id), u]));
    return {
        ...p,
        _id: String(p._id),
        integrantes: [...(p.integrantes || [])]
            .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
            .map((i) => ({ ...i, _id: String(i._id), rolesFrame: (i.rolesFrame || []).map(String), areaId: i.areaId ? String(i.areaId) : null, shiftId: i.shiftId ? String(i.shiftId) : null, categoriaSatId: i.categoriaSatId ? String(i.categoriaSatId) : null })),
        equipos: (p.equipos || []).map((e) => ({
            _id: String(e._id),
            nombre: e.nombre,
            ultimaContratacionEl: e.ultimaContratacionEl || null,
            asignaciones: (e.asignaciones || []).map((a) => {
                const u = persona.get(String(a.userId));
                return {
                    puestoId: String(a.puestoId),
                    userId: String(a.userId),
                    nombre: u ? nombreDe(u) : "Persona no encontrada",
                    activo: !!u && u.metadata?.activo !== false,
                    reemplazadoDePersonaId: a.reemplazadoDePersonaId ? String(a.reemplazadoDePersonaId) : null,
                    reemplazadoDeNombre: a.reemplazadoDePersonaId ? nombreDe(persona.get(String(a.reemplazadoDePersonaId))) : "",
                    reemplazadoEl: a.reemplazadoEl || null,
                };
            }),
        })),
    };
}
// ── Escritura: la plantilla ─────────────────────────────────────────────
/** Una plantilla nueva. Las personales nacen con un equipo vacío («Equipo 1») para ir asignando gente. */
export async function crearPlantilla(acc, body) {
    const general = acc.alcance === "general";
    if (!general && (!idOk(body?.projectId) || !(await Project.exists({ _id: oid(body.projectId), tenantId: acc.tenantId }))))
        throw new ErrorPlantilla(400, "Elegí el proyecto de la plantilla.");
    const datos = leerGeneral({ nombre: "", ...body }, acc);
    try {
        const p = await PlantillaEquipo.create({ ...datos, tenantId: acc.tenantId, alcance: acc.alcance, projectId: general ? null : oid(body.projectId), creadoPor: oid(acc.userId), integrantes: [], equipos: general ? [] : [{ nombre: "Equipo 1", asignaciones: [] }] });
        // Puede nacer con puestos (ej. «Guardar como plantilla» desde el alta individual).
        if (Array.isArray(body.puestos) && body.puestos.length)
            await agregarPuestos(acc, String(p._id), body.puestos);
        return obtenerPlantilla(acc, String(p._id));
    }
    catch (e) {
        if (nombreRepetido(e))
            throw new ErrorPlantilla(409, general ? "Ya hay una plantilla general con ese nombre." : "Ya tenés una plantilla con ese nombre en el proyecto.");
        throw e;
    }
}
export async function actualizarPlantilla(acc, id, body) {
    const p = await cargar(acc, id);
    // Cambiar la empresa cambia el convenio: las categorías que no sean del nuevo quedan «a completar»
    // (el plan las marca como error hasta que se corrijan; no se borran para no perder qué eran).
    Object.assign(p, leerGeneral(body, acc));
    try {
        await p.save();
    }
    catch (e) {
        if (nombreRepetido(e))
            throw new ErrorPlantilla(409, "Ya hay una plantilla con ese nombre.");
        throw e;
    }
    return obtenerPlantilla(acc, id);
}
/** Borrar = dar de baja: los lotes ya contratados siguen apuntando a ella. */
export async function borrarPlantilla(acc, id) {
    const p = await cargar(acc, id);
    p.activo = false;
    await p.save();
}
/** Copia con otro nombre. Los puestos y los equipos se copian con ids nuevos (y las asignaciones, al día). */
async function copiarComo(acc, origen, destino) {
    const mismoProyecto = !!destino.projectId && String(origen.projectId || "") === String(destino.projectId);
    const mapa = new Map();
    const puestos = (origen.integrantes || []).map((i) => {
        const nuevo = new Types.ObjectId();
        mapa.set(String(i._id), nuevo);
        // Una copia a otro proyecto (o desde una general) no conserva área y turno: son de ese proyecto.
        return { ...i, _id: nuevo, ...(mismoProyecto ? {} : { areaId: null, shiftId: null }) };
    });
    const equipos = destino.conEquipos
        ? (origen.equipos || []).map((e) => ({ nombre: e.nombre, asignaciones: (e.asignaciones || []).filter((a) => mapa.has(String(a.puestoId))).map((a) => ({ ...a, puestoId: mapa.get(String(a.puestoId)) })), ultimaContratacionEl: null }))
        : destino.alcance === "personal"
            ? [{ nombre: "Equipo 1", asignaciones: [] }]
            : [];
    for (let n = 0; n < 20; n++) {
        const candidato = n === 0 ? destino.nombre : `${destino.nombre} ${n + 1}`;
        try {
            const copia = await PlantillaEquipo.create({
                tenantId: acc.tenantId,
                alcance: destino.alcance,
                projectId: destino.projectId,
                nombre: candidato,
                empresaContratoId: mismoProyecto ? origen.empresaContratoId : null,
                convenioId: mismoProyecto ? origen.convenioId : null,
                contratoId: origen.contratoId,
                nombreContrato: origen.nombreContrato,
                tipoImpositivo: origen.tipoImpositivo,
                comentarios: origen.comentarios,
                integrantes: puestos,
                equipos,
                creadoPor: oid(acc.userId),
            });
            return String(copia._id);
        }
        catch (e) {
            if (!nombreRepetido(e))
                throw e;
        }
    }
    throw new ErrorPlantilla(409, "No se pudo elegir un nombre libre para la copia.");
}
export async function duplicarPlantilla(acc, id, nombre) {
    const p = (await cargar(acc, id)).toObject();
    const nuevoId = await copiarComo(acc, p, { alcance: acc.alcance, projectId: p.projectId || null, nombre: (nombre || `${p.nombre} (copia)`).trim().slice(0, 120), conEquipos: true });
    return obtenerPlantilla(acc, nuevoId);
}
/**
 * USAR UNA GENERAL: se copia como plantilla PERSONAL de quien la usa, en su proyecto: los puestos por
 * rol (con su horario y sus días, si los tienen) y un equipo vacío. La empresa, el convenio y el área y
 * turno de cada puesto se completan en la copia. La general no cambia.
 */
export async function usarGeneral(acc, generalId, projectId, nombre) {
    if (!idOk(projectId) || !(await Project.exists({ _id: oid(projectId), tenantId: acc.tenantId })))
        throw new ErrorPlantilla(400, "Elegí el proyecto donde usarla.");
    const g = (await cargar({ ...acc, alcance: "general" }, generalId)).toObject();
    const personal = { ...acc, alcance: "personal" };
    const nuevoId = await copiarComo(personal, g, { alcance: "personal", projectId: oid(projectId), nombre: (nombre || g.nombre).trim().slice(0, 120), conEquipos: false });
    return obtenerPlantilla(personal, nuevoId);
}
// ── Escritura: los puestos ──────────────────────────────────────────────
/**
 * Suma puestos. Cada entrada es un rol con sus datos (área y turno, horario, días…); `cantidad` lo repite
 * («2 cámaras»). Con `userId`, además la persona queda asignada en el equipo (`equipoId`, o el primero).
 */
export async function agregarPuestos(acc, id, nuevos, equipoId) {
    const p = await cargar(acc, id);
    const entradas = (Array.isArray(nuevos) ? nuevos : []).flatMap((n) => {
        const veces = idOk(n?.userId) ? 1 : Math.min(Math.max(1, Math.floor(Number(n?.cantidad) || 1)), MAX_INTEGRANTES_POR_LOTE);
        return Array.from({ length: veces }, () => n);
    });
    if (p.integrantes.length + entradas.length > MAX_INTEGRANTES_POR_LOTE)
        throw new ErrorPlantilla(400, `Una plantilla admite hasta ${MAX_INTEGRANTES_POR_LOTE} puestos.`);
    const equipo = equipoId ? p.equipos.find((e) => String(e._id) === String(equipoId)) : p.equipos[0];
    const conPersona = entradas.filter((n) => idOk(n?.userId));
    if (conPersona.length && acc.alcance === "general")
        throw new ErrorPlantilla(400, "Una plantilla general no lleva personas: sólo puestos por rol.");
    if (conPersona.length && !equipo)
        throw new ErrorPlantilla(400, "Elegí en qué equipo asignar a las personas.");
    const personas = conPersona.length ? await User.find({ _id: { $in: conPersona.map((n) => oid(n.userId)) }, tenantId: acc.tenantId }).select("metadata.roles_frame metadata.isSolicitud").lean() : [];
    const persona = new Map(personas.map((u) => [String(u._id), u]));
    const yaEnEquipo = new Set((equipo?.asignaciones || []).map((a) => String(a.userId)));
    let orden = p.integrantes.reduce((m, i) => Math.max(m, i.orden ?? 0), -1);
    for (const n of entradas) {
        const u = idOk(n?.userId) ? persona.get(String(n.userId)) : null;
        if (idOk(n?.userId) && (!u || u.metadata?.isSolicitud))
            throw new ErrorPlantilla(400, "Sólo se pueden agregar personas registradas.");
        if (u && yaEnEquipo.has(String(n.userId)))
            throw new ErrorPlantilla(409, "Esa persona ya ocupa un puesto en el equipo.");
        const datos = leerPuesto({ ...n, rolesFrame: Array.isArray(n.rolesFrame) && n.rolesFrame.length ? n.rolesFrame : u?.metadata?.roles_frame || [] }, acc);
        if (!datos.rolesFrame?.length)
            throw new ErrorPlantilla(400, "Cada puesto necesita su rol empresa.");
        const puestoId = new Types.ObjectId();
        p.integrantes.push({ _id: puestoId, orden: ++orden, ...datos, escalaAlFijar: datos.dailyRateManual ? await escalaDe(p, datos.categoriaSatId) : null });
        if (u) {
            equipo.asignaciones.push({ puestoId, userId: oid(n.userId) });
            yaEnEquipo.add(String(n.userId));
        }
    }
    p.markModified("equipos");
    await p.save();
    return obtenerPlantilla(acc, id);
}
/**
 * Cambia un puesto. `null` o "" = sin ese dato. Fijar el importe guarda la escala de ese momento, para
 * avisar si después cambia.
 */
export async function actualizarPuesto(acc, id, puestoId, body) {
    const p = await cargar(acc, id);
    const i = p.integrantes.find((x) => String(x._id) === String(puestoId));
    if (!i)
        throw new ErrorPlantilla(404, "Ese puesto ya no está en la plantilla.");
    Object.assign(i, leerPuesto(body, acc));
    if (body.dailyRateManual !== undefined || body.categoriaSatId !== undefined)
        i.escalaAlFijar = i.dailyRateManual ? await escalaDe(p, i.categoriaSatId) : null;
    if (body.orden !== undefined && Number.isFinite(Number(body.orden)))
        i.orden = Number(body.orden);
    p.markModified("integrantes");
    await p.save();
    return obtenerPlantilla(acc, id);
}
/** Saca un puesto (y a quien lo ocupaba en cada equipo). */
export async function quitarPuesto(acc, id, puestoId) {
    const p = await cargar(acc, id);
    const antes = p.integrantes.length;
    p.integrantes = p.integrantes.filter((x) => String(x._id) !== String(puestoId));
    if (p.integrantes.length === antes)
        throw new ErrorPlantilla(404, "Ese puesto ya no está en la plantilla.");
    for (const e of p.equipos)
        e.asignaciones = e.asignaciones.filter((a) => String(a.puestoId) !== String(puestoId));
    p.markModified("equipos");
    await p.save();
    return obtenerPlantilla(acc, id);
}
// ── Escritura: los equipos ──────────────────────────────────────────────
/** Un equipo nuevo, vacío o copiando las asignaciones de otro («Semana B» a partir de «Semana A»). */
export async function crearEquipo(acc, id, nombre, copiarDeId) {
    if (acc.alcance === "general")
        throw new ErrorPlantilla(400, "Una plantilla general no tiene equipos: se arman en la copia de cada supervisor.");
    const p = await cargar(acc, id);
    const n = String(nombre || "").trim().slice(0, 80) || `Equipo ${p.equipos.length + 1}`;
    if (p.equipos.some((e) => e.nombre.toLowerCase() === n.toLowerCase()))
        throw new ErrorPlantilla(409, "Ya hay un equipo con ese nombre en la plantilla.");
    const origen = copiarDeId ? p.equipos.find((e) => String(e._id) === String(copiarDeId)) : null;
    p.equipos.push({ nombre: n, asignaciones: origen ? origen.asignaciones.map((a) => ({ puestoId: a.puestoId, userId: a.userId })) : [] });
    await p.save();
    return obtenerPlantilla(acc, id);
}
export async function renombrarEquipo(acc, id, equipoId, nombre) {
    const p = await cargar(acc, id);
    const e = p.equipos.find((x) => String(x._id) === String(equipoId));
    if (!e)
        throw new ErrorPlantilla(404, "Ese equipo ya no está en la plantilla.");
    const n = String(nombre || "").trim().slice(0, 80);
    if (!n)
        throw new ErrorPlantilla(400, "Poné un nombre al equipo.");
    if (p.equipos.some((x) => x !== e && x.nombre.toLowerCase() === n.toLowerCase()))
        throw new ErrorPlantilla(409, "Ya hay un equipo con ese nombre en la plantilla.");
    e.nombre = n;
    await p.save();
    return obtenerPlantilla(acc, id);
}
export async function borrarEquipo(acc, id, equipoId) {
    const p = await cargar(acc, id);
    const antes = p.equipos.length;
    p.equipos = p.equipos.filter((x) => String(x._id) !== String(equipoId));
    if (p.equipos.length === antes)
        throw new ErrorPlantilla(404, "Ese equipo ya no está en la plantilla.");
    await p.save();
    return obtenerPlantilla(acc, id);
}
/**
 * Quién ocupa un puesto en un equipo. `userId: null` lo deja sin asignar. Si ya había alguien, queda
 * anotado a quién reemplazó (informativo, y para sugerir «¿Cubre a X?» al contratar).
 */
export async function asignarPuesto(acc, id, equipoId, puestoId, userId) {
    const p = await cargar(acc, id);
    const e = p.equipos.find((x) => String(x._id) === String(equipoId));
    if (!e)
        throw new ErrorPlantilla(404, "Ese equipo ya no está en la plantilla.");
    if (!p.integrantes.some((x) => String(x._id) === String(puestoId)))
        throw new ErrorPlantilla(404, "Ese puesto ya no está en la plantilla.");
    const actual = e.asignaciones.find((a) => String(a.puestoId) === String(puestoId));
    if (userId === null || userId === "") {
        e.asignaciones = e.asignaciones.filter((a) => String(a.puestoId) !== String(puestoId));
    }
    else {
        if (!idOk(userId))
            throw new ErrorPlantilla(400, "Elegí a la persona.");
        if (e.asignaciones.some((a) => String(a.userId) === String(userId) && String(a.puestoId) !== String(puestoId)))
            throw new ErrorPlantilla(409, "Esa persona ya ocupa otro puesto en este equipo.");
        const u = await User.findOne({ _id: oid(userId), tenantId: acc.tenantId }).select("metadata.isSolicitud").lean();
        if (!u || u.metadata?.isSolicitud)
            throw new ErrorPlantilla(400, "Sólo se pueden asignar personas registradas.");
        if (actual) {
            if (String(actual.userId) !== String(userId))
                Object.assign(actual, { reemplazadoDePersonaId: actual.userId, reemplazadoEl: new Date(), userId: oid(userId) });
        }
        else
            e.asignaciones.push({ puestoId: oid(puestoId), userId: oid(userId) });
    }
    p.markModified("equipos");
    await p.save();
    return obtenerPlantilla(acc, id);
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
            jornadas: Number(x.jornadas) > 0 ? Number(x.jornadas) : undefined,
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
/** La plantilla y sus puestos en la forma del plan, con la persona del EQUIPO elegido en cada puesto. */
function paraPlan(p, equipoId) {
    const s = (x) => (x ? String(x) : undefined);
    const equipo = (p.equipos || []).find((e) => String(e._id) === String(equipoId));
    const quien = new Map((equipo?.asignaciones || []).map((a) => [String(a.puestoId), String(a.userId)]));
    return {
        plantilla: {
            projectId: String(p.projectId),
            empresaContratoId: s(p.empresaContratoId),
            convenioId: s(p.convenioId),
            contratoId: s(p.contratoId),
            nombreContrato: p.nombreContrato || "",
            tipoImpositivo: p.tipoImpositivo || "",
            comentarios: p.comentarios || "",
        },
        integrantes: [...(p.integrantes || [])]
            .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
            .map((i) => ({
            _id: String(i._id),
            userId: quien.get(String(i._id)) || "",
            rolesFrame: (i.rolesFrame || []).map(String),
            areaId: s(i.areaId) || null,
            shiftId: s(i.shiftId) || null,
            inTime: i.inTime || null,
            outTime: i.outTime || null,
            diasSemana: i.diasSemana || [],
            diasPorSemana: i.diasPorSemana ?? null,
            diasRotativos: !!i.diasRotativos,
            categoriaSatId: s(i.categoriaSatId) || null,
            dailyRateManual: i.dailyRateManual ?? null,
            escalaAlFijar: i.escalaAlFijar ?? null,
            comentarios: i.comentarios || null,
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
    const { plantilla, integrantes } = paraPlan(p, String(body?.equipoId || ""));
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
export async function previewDeContratacion(acc, id, body) {
    const p = await cargar(acc, id);
    return paraMostrar(await planificar(acc.tenantId, p.toObject(), body));
}
/**
 * CONTRATAR: revalida TODO (no confía en el preview que vio el cliente) y, sin errores, crea las N
 * solicitudes + el lote en una transacción. Con la misma `idempotencyKey` devuelve el lote ya creado.
 * Con `guardarEnEquipo`, las personas cambiadas «sólo esta vez» quedan también en el equipo elegido.
 */
export async function contratarPlantilla(acc, id, body) {
    const tenantId = acc.tenantId;
    const creadorId = acc.userId;
    const clave = str(body?.idempotencyKey).trim();
    if (!clave || clave.length > 100)
        throw new ErrorPlantilla(400, "Falta la clave de la contratación (idempotencyKey).");
    const yaHecho = await LoteContratacion.findOne({ tenantId, idempotencyKey: clave }).lean();
    if (yaHecho)
        return { repetido: true, loteId: String(yaHecho._id), solicitudIds: yaHecho.solicitudIds.map(String), totales: yaHecho.totales, nombrePlantilla: yaHecho.nombrePlantilla };
    const p = await cargar(acc, id);
    const plantillaObj = p.toObject();
    const equipoId = String(body?.equipoId || "");
    const equipo = plantillaObj.equipos?.find((e) => String(e._id) === equipoId);
    const plan = await planificar(tenantId, plantillaObj, body);
    const errores = erroresDelLote(plan);
    if (errores.length)
        throw new ErrorPlantilla(422, errores.join(" "), paraMostrar(plan));
    const incluidas = plan.filas.filter((f) => !f.excluido);
    const ahora = Date.now();
    const aleatorio = Math.random().toString(36).slice(2, 7);
    const nombreLote = equipo ? `${p.nombre} · ${equipo.nombre}` : p.nombre;
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
                // Congelado al contratar: renombrar la plantilla o el equipo después no cambia cómo se llamó este lote.
                data.metadata.loteNombre = nombreLote;
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
                    nombrePlantilla: nombreLote,
                    idempotencyKey: clave,
                    creadoPor: oid(creadorId),
                    solicitudIds: creadas.map((u) => u._id),
                    totales: { personas: plan.totales.personas, jornadas: plan.totales.jornadas, importe: plan.totales.importe },
                },
            ], { session: sesion });
            // El equipo: cuándo se contrató y, si se pidió, las personas cambiadas esta vez.
            const set = { ultimaContratacionEl: new Date(), ultimoLoteId: loteId };
            if (equipo) {
                const idx = plantillaObj.equipos.findIndex((e) => String(e._id) === equipoId);
                set[`equipos.${idx}.ultimaContratacionEl`] = new Date();
                if (body?.guardarEnEquipo === true) {
                    const { puntuales } = leerContratacion(body);
                    const asignaciones = [...(equipo.asignaciones || [])];
                    for (const [puestoId, x] of Object.entries(puntuales)) {
                        if (!x.userId)
                            continue;
                        const a = asignaciones.find((y) => String(y.puestoId) === puestoId);
                        if (a && String(a.userId) !== x.userId)
                            Object.assign(a, { reemplazadoDePersonaId: a.userId, reemplazadoEl: new Date(), userId: oid(x.userId) });
                        else if (!a)
                            asignaciones.push({ puestoId: oid(puestoId), userId: oid(x.userId) });
                    }
                    set[`equipos.${idx}.asignaciones`] = asignaciones;
                }
            }
            await PlantillaEquipo.updateOne({ _id: p._id }, { $set: set }, { session: sesion });
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
    return { repetido: false, loteId: String(loteId), solicitudIds: creadas.map((u) => String(u._id)), totales: plan.totales, nombrePlantilla: nombreLote };
}

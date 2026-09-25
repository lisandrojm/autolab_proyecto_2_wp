import mongoose, { Types } from "mongoose";
import { CAMPOS_DE_CONDICIONES, CAMPOS_DE_EQUIPO, PlantillaEquipo } from "../models/PlantillaEquipo.js";
import { LoteContratacion } from "../models/LoteContratacion.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Contrato } from "../models/Contrato.js";
import { Convenio } from "../models/Convenio.js";
// Las categorías viven en `categorias` (con la escala en el grupo); `categorias-sat` es la foto vieja.
// Se resuelven como en el resto del server: `resolverCategoriasCompatPorId` (ver `utils/categoriaCompat.ts`).
import { resolverCategoriasCompatPorId } from "../utils/categoriaCompat.js";
import { RequestConfig } from "../models/RequestConfig.js";
import { importePorJornada } from "../compartido/jornadas.js";
import { armarPayloadDeSolicitud } from "../compartido/solicitudDeContratacion.js";
import { erroresDelLote, MAX_INTEGRANTES_POR_LOTE, planDeLote } from "../utils/planDeLote.js";
import { compromisosDePersona, superposicionesDeAlta, pedidoDesdeSolicitud } from "./superposicion.js";
import { choquesDelEquipo, superposiciones } from "../utils/superposicionContratos.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
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
    // El tipo de contrato es de cada persona contratada: va en el puesto. El trámite lo resuelve la pantalla.
    if (body.contratoId !== undefined)
        c.contratoId = idOk(body.contratoId) ? oid(body.contratoId) : null;
    if (body.nombreContrato !== undefined)
        c.nombreContrato = body.nombreContrato ? str(body.nombreContrato).slice(0, 200) : null;
    if (body.tipoImpositivo !== undefined)
        c.tipoImpositivo = body.tipoImpositivo ? str(body.tipoImpositivo).slice(0, 60) : null;
    return c;
}
/** La escala (ya multiplicada) de una categoría con el tipo de contrato del puesto (o el viejo de la plantilla). */
async function escalaDe(plantilla, puesto) {
    const categoriaSatId = puesto?.categoriaSatId;
    if (!idOk(categoriaSatId))
        return null;
    const contratoId = puesto?.contratoId || plantilla.contratoId;
    const [[cat], contrato] = await Promise.all([resolverCategoriasCompatPorId([oid(categoriaSatId)]), contratoId ? Contrato.findById(contratoId).select("data.multiplicadorDiario").lean() : null]);
    return cat ? importePorJornada(cat.data?.neto, contrato?.data?.multiplicadorDiario) : null;
}
// ── Las condiciones propias de un equipo ────────────────────────────────
/** Un valor comparable: ids y fechas como texto, arrays como lista. Vacío/null/undefined, iguales. */
const comparable = (v) => {
    if (v === undefined || v === null || v === "")
        return "";
    if (Array.isArray(v))
        return JSON.stringify(v.map((x) => String(x)));
    return String(v);
};
/**
 * El puesto tal como lo ocupa ESE equipo. Tres capas, siempre en este orden: lo del PUESTO (rol y
 * categoría por defecto; en las plantillas viejas, también contrato y horario) → las CONDICIONES DEL
 * EQUIPO → la DIFERENCIA de ese puesto en el equipo.
 */
export function puestoEnEquipo(puesto, asignacion, equipo) {
    const efectivo = { ...puesto };
    const deEquipo = equipo?.condiciones || {};
    for (const campo of CAMPOS_DE_EQUIPO)
        if (campo in deEquipo)
            efectivo[campo] = deEquipo[campo];
    const c = asignacion?.condiciones || {};
    for (const campo of [...CAMPOS_DE_CONDICIONES, "escalaAlFijar"])
        if (campo in c)
            efectivo[campo] = c[campo];
    return efectivo;
}
/**
 * El proyecto, la empresa y el convenio de un equipo: los suyos o, en las plantillas viejas (que los
 * tenían en la plantilla), los de la plantilla.
 */
export function datosDelEquipo(p, e) {
    const s = (x) => (x ? String(x) : null);
    return { projectId: s(e?.projectId || p?.projectId), empresaContratoId: s(e?.empresaContratoId || p?.empresaContratoId), convenioId: s(e?.convenioId || p?.convenioId) };
}
/** El reemplazo de una asignación; los «Entró en lugar de» viejos se leen como reemplazo sin motivo, a revisar. */
export function reemplazoDe(a) {
    if (a?.reemplazo?.replacedUserId)
        return { replacedUserId: String(a.reemplazo.replacedUserId), motivoReemplazoId: a.reemplazo.motivoReemplazoId ? String(a.reemplazo.motivoReemplazoId) : null, revisarMotivo: !!a.reemplazo.revisarMotivo };
    if (a?.reemplazadoDePersonaId)
        return { replacedUserId: String(a.reemplazadoDePersonaId), motivoReemplazoId: null, revisarMotivo: true };
    return null;
}
/**
 * De lo que se pidió para el puesto EN ESTE EQUIPO, sólo lo que difiere del puesto: lo igual no se
 * guarda, así si después se cambia el puesto, el cambio llega también a este equipo.
 */
async function condicionesDesde(p, puesto, body, acc, equipo) {
    const pedido = leerPuesto(body, acc);
    delete pedido.rolesFrame;
    // Se compara con lo que el puesto tendría en el equipo SIN diferencia: la del equipo manda.
    const base = puestoEnEquipo(puesto, null, equipo);
    const c = {};
    for (const campo of CAMPOS_DE_CONDICIONES) {
        if (!(campo in pedido))
            continue;
        if (comparable(pedido[campo]) !== comparable(base[campo]))
            c[campo] = pedido[campo];
    }
    // El tipo de contrato viaja con su nombre y su trámite: si cambió uno, van los tres.
    if ("contratoId" in c)
        for (const campo of ["nombreContrato", "tipoImpositivo"])
            if (campo in pedido)
                c[campo] = pedido[campo];
    if (!("contratoId" in c)) {
        delete c.nombreContrato;
        delete c.tipoImpositivo;
    }
    if ("dailyRateManual" in c || "categoriaSatId" in c || "contratoId" in c) {
        const efectivo = { ...base, ...c };
        c.escalaAlFijar = efectivo.dailyRateManual ? await escalaDe(p, efectivo) : null;
    }
    return Object.keys(c).length ? c : null;
}
/** ¿El equipo usa este puesto? (`excluido` = lo sacaron de ese equipo, sigue en la plantilla). */
const usaElPuesto = (equipo, puestoId) => !(equipo?.asignaciones || []).some((a) => String(a.puestoId) === String(puestoId) && a.excluido);
/** Una asignación que ya no dice nada (sin persona, sin condiciones, sin excluir) se saca. */
const vacia = (a) => !a.userId && !a.condiciones && !a.excluido && !reemplazoDe(a);
/** Condiciones para devolver al cliente: ids como texto. */
const condicionesParaMostrar = (c) => (c ? Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v instanceof Types.ObjectId ? String(v) : v])) : null);
/** Los compromisos de todas las personas asignadas en estas plantillas, una búsqueda por persona. */
async function compromisosDeLasPlantillas(tenantId, plantillas) {
    const ids = [...new Set(plantillas.flatMap((p) => (p.equipos || []).flatMap((e) => (e.asignaciones || []).map((a) => (a.userId ? String(a.userId) : "")))).filter(idOk))];
    const listas = await Promise.all(ids.map((id) => compromisosDePersona(tenantId, id).catch(() => [])));
    return new Map(ids.map((id, n) => [id, listas[n]]));
}
/**
 * Los avisos de un equipo guardado, por puesto. GLOBALES: la persona
 *  - ocupa otro puesto del MISMO equipo que se pisa (días de la semana y horario, o mismo turno), o
 *  - ya tiene un contrato o una solicitud pendiente, en CUALQUIER proyecto, de hoy en adelante, que se
 *    pisa en días y horario (o es el mismo turno) con lo que haría en este puesto.
 * Sin fechas (la plantilla no las tiene), se mira desde hoy: al contratar se revisa otra vez con las
 * fechas reales. Son avisos, nunca bloquean.
 */
function avisosDelEquipo(p, equipo, porDiasSueltos, compromisos, hoy) {
    const puestos = [...(p.integrantes || [])]
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        .map((i, n) => ({ i, n }))
        .filter(({ i }) => usaElPuesto(equipo, i._id))
        .map(({ i, n }) => {
        const a = (equipo.asignaciones || []).find((x) => String(x.puestoId) === String(i._id));
        const e = puestoEnEquipo(i, a, equipo);
        const contratoId = String(e.contratoId || p.contratoId || "");
        return { puestoId: String(i._id), etiqueta: `puesto ${n + 1}`, userId: a?.userId ? String(a.userId) : "", dias: e.diasSemana || [], rotativos: !!e.diasRotativos, porDiasSueltos: porDiasSueltos(contratoId), inTime: e.inTime || "", outTime: e.outTime || "", shiftId: e.shiftId ? String(e.shiftId) : null };
    });
    const avisos = choquesDelEquipo(puestos);
    for (const x of puestos) {
        if (!x.userId)
            continue;
        // Lo que haría en este puesto, desde hoy y sin fin: los días por jornada se eligen al contratar (no se saben).
        const pedido = { desde: hoy, hasta: "", dias: x.porDiasSueltos ? [] : x.dias, rotativos: x.porDiasSueltos || x.rotativos, inTime: x.inTime, outTime: x.outTime, shiftIds: x.shiftId ? [x.shiftId] : [] };
        const pisan = superposiciones(pedido, compromisos.get(x.userId) || [], hoy).filter((s) => s.tipo === "horario");
        if (pisan.length)
            avisos.set(x.puestoId, [...(avisos.get(x.puestoId) || []), ...pisan.map((s) => s.mensaje)]);
    }
    return Object.fromEntries(avisos);
}
/** Qué tipos de contrato van por días sueltos, de los que usan estas plantillas. */
async function contratosPorDiasSueltos(plantillas) {
    const ids = new Set();
    for (const p of plantillas) {
        if (p.contratoId)
            ids.add(String(p.contratoId));
        for (const i of p.integrantes || [])
            if (i.contratoId)
                ids.add(String(i.contratoId));
        for (const e of p.equipos || []) {
            if (e.condiciones?.contratoId)
                ids.add(String(e.condiciones.contratoId));
            for (const a of e.asignaciones || [])
                if (a.condiciones?.contratoId)
                    ids.add(String(a.condiciones.contratoId));
        }
    }
    const validos = [...ids].filter(idOk).map(oid);
    const contratos = validos.length ? await Contrato.find({ _id: { $in: validos } }).select("data.modoFechas").lean() : [];
    const dias = new Set(contratos.filter((c) => c.data?.modoFechas === "dias").map((c) => String(c._id)));
    return (id) => dias.has(id);
}
// ── Lectura ─────────────────────────────────────────────────────────────
/** Las plantillas para la lista: las personales del proyecto; las generales, todas. */
export async function listarPlantillas(acc, projectId) {
    // Las plantillas no son de un proyecto: se listan todas las de quien pide (`projectId` ya no filtra).
    void projectId;
    const lista = await PlantillaEquipo.find({ tenantId: acc.tenantId, activo: true, ...filtroDeAlcance(acc) })
        .sort({ nombre: 1 })
        .lean();
    const [porDiasSueltos, compromisos] = await Promise.all([contratosPorDiasSueltos(lista), compromisosDeLasPlantillas(acc.tenantId, lista)]);
    const hoy = hoyArgentina();
    return lista.map((p) => ({
        _id: String(p._id),
        nombre: p.nombre,
        projectId: p.projectId ? String(p.projectId) : null,
        alcance: p.alcance || "personal",
        // Los tipos de contrato de sus puestos («Jornada · Plazo fijo»), o el viejo de la plantilla.
        nombreContrato: [...new Set((p.integrantes || []).map((i) => (i.contratoId ? i.nombreContrato : p.nombreContrato) || "").filter(Boolean))].join(" · "),
        puestos: (p.integrantes || []).length,
        equipos: (p.equipos || []).map((e) => ({
            _id: String(e._id),
            nombre: e.nombre,
            ...datosDelEquipo(p, e),
            asignados: (e.asignaciones || []).filter((a) => a.userId && !a.excluido).length,
            // Los puestos que usa ESTE equipo (los de la plantilla menos los que sacó).
            puestos: (p.integrantes || []).filter((i) => usaElPuesto(e, i._id)).length,
            // Cuántos puestos tienen condiciones propias en este equipo (otro horario, otro turno…).
            propias: (e.asignaciones || []).filter((a) => !a.excluido && a.condiciones && Object.keys(a.condiciones).length).length,
            reemplazos: (e.asignaciones || []).filter((a) => !a.excluido && reemplazoDe(a)).length,
            revisar: (e.asignaciones || []).filter((a) => !a.excluido && reemplazoDe(a)?.revisarMotivo).length,
            // Lo que se muestra en la tarjeta: el turno y el horario del equipo.
            condiciones: condicionesParaMostrar(e.condiciones),
            avisos: Object.keys(avisosDelEquipo(p, e, porDiasSueltos, compromisos, hoy)).length,
            ultimaContratacionEl: e.ultimaContratacionEl || null,
        })),
        ultimaContratacionEl: p.ultimaContratacionEl || null,
    }));
}
/** El tipo de contrato de un puesto; los de las plantillas viejas (que lo tenían general) heredan ése. */
const contratoDelPuesto = (p, i) => i.contratoId ? { contratoId: String(i.contratoId), nombreContrato: i.nombreContrato || "", tipoImpositivo: i.tipoImpositivo || "" } : { contratoId: p.contratoId ? String(p.contratoId) : null, nombreContrato: p.nombreContrato || "", tipoImpositivo: p.tipoImpositivo || "" };
/** Una plantilla con sus puestos y sus equipos, las personas resueltas a nombre (para el editor). */
export async function obtenerPlantilla(acc, id) {
    const p = (await cargar(acc, id)).toObject();
    const userIds = (p.equipos || []).flatMap((e) => (e.asignaciones || []).flatMap((a) => [a.userId, reemplazoDe(a)?.replacedUserId])).filter(idOk);
    const [personas, porDiasSueltos, compromisos] = await Promise.all([
        userIds.length ? User.find({ _id: { $in: userIds }, tenantId: acc.tenantId }).select("firstName lastName email metadata.fullName metadata.activo").lean() : Promise.resolve([]),
        contratosPorDiasSueltos([p]),
        compromisosDeLasPlantillas(acc.tenantId, [p]),
    ]);
    const hoy = hoyArgentina();
    const persona = new Map(personas.map((u) => [String(u._id), u]));
    return {
        ...p,
        _id: String(p._id),
        integrantes: [...(p.integrantes || [])]
            .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
            .map((i) => ({ ...i, _id: String(i._id), rolesFrame: (i.rolesFrame || []).map(String), areaId: i.areaId ? String(i.areaId) : null, shiftId: i.shiftId ? String(i.shiftId) : null, categoriaSatId: i.categoriaSatId ? String(i.categoriaSatId) : null, ...contratoDelPuesto(p, i) })),
        equipos: (p.equipos || []).map((e) => ({
            _id: String(e._id),
            nombre: e.nombre,
            ultimaContratacionEl: e.ultimaContratacionEl || null,
            ...datosDelEquipo(p, e),
            condiciones: condicionesParaMostrar(e.condiciones),
            avisos: avisosDelEquipo(p, e, porDiasSueltos, compromisos, hoy),
            asignaciones: (e.asignaciones || []).map((a) => {
                const u = a.userId ? persona.get(String(a.userId)) : null;
                return {
                    puestoId: String(a.puestoId),
                    userId: a.userId ? String(a.userId) : null,
                    nombre: !a.userId ? "" : u ? nombreDe(u) : "Persona no encontrada",
                    activo: !!u && u.metadata?.activo !== false,
                    condiciones: condicionesParaMostrar(a.condiciones),
                    excluido: !!a.excluido,
                    reemplazo: (() => {
                        const r = reemplazoDe(a);
                        return r ? { ...r, nombre: nombreDe(persona.get(r.replacedUserId)) } : null;
                    })(),
                };
            }),
        })),
    };
}
// ── Escritura: la plantilla ─────────────────────────────────────────────
/** Una plantilla nueva. Las personales nacen con un equipo vacío («Equipo 1») para ir asignando gente. */
export async function crearPlantilla(acc, body) {
    const general = acc.alcance === "general";
    // Sin proyecto: el grupo de puestos sirve en cualquiera (el proyecto es de cada equipo).
    if (!general && idOk(body?.projectId) && !(await Project.exists({ _id: oid(body.projectId), tenantId: acc.tenantId })))
        throw new ErrorPlantilla(400, "Ese proyecto no existe.");
    const datos = leerGeneral({ nombre: "", ...body }, acc);
    try {
        const p = await PlantillaEquipo.create({ ...datos, tenantId: acc.tenantId, alcance: acc.alcance, projectId: general || !idOk(body?.projectId) ? null : oid(body.projectId), creadoPor: oid(acc.userId), integrantes: [], equipos: general || body.sinEquipos === true ? [] : [{ nombre: "Equipo 1", asignaciones: [] }] });
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
    /*
      CAMBIAR DE PROYECTO (sólo las personales): el equipo se va a contratar en otro proyecto. Las áreas y
      turnos son de cada proyecto, así que se vacían en los puestos y en las condiciones de los equipos, y
      la empresa y el convenio también (se eligen de nuevo entre los del proyecto). Las personas se quedan.
    */
    if (acc.alcance === "personal" && body?.projectId !== undefined && String(body.projectId) !== String(p.projectId)) {
        if (!idOk(body.projectId) || !(await Project.exists({ _id: oid(body.projectId), tenantId: acc.tenantId })))
            throw new ErrorPlantilla(400, "Elegí el proyecto de la plantilla.");
        p.projectId = oid(body.projectId);
        for (const i of p.integrantes)
            Object.assign(i, { areaId: null, shiftId: null });
        for (const e of p.equipos) {
            if (e.condiciones)
                e.condiciones = { ...e.condiciones, areaId: null, shiftId: null };
            for (const a of e.asignaciones || []) {
                if (!a.condiciones)
                    continue;
                const { areaId, shiftId, ...resto } = a.condiciones;
                a.condiciones = Object.keys(resto).length ? resto : null;
            }
        }
        p.markModified("integrantes");
        p.markModified("equipos");
        if (body.empresaContratoId === undefined)
            Object.assign(p, { empresaContratoId: null, convenioId: null });
    }
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
        ? (origen.equipos || []).map((e) => ({
            nombre: e.nombre,
            // Cada equipo se lleva su proyecto, su empresa y su convenio (o los de la plantilla vieja).
            ...(() => {
                const d = datosDelEquipo(origen, e);
                return { projectId: d.projectId ? oid(d.projectId) : null, empresaContratoId: d.empresaContratoId ? oid(d.empresaContratoId) : null, convenioId: d.convenioId ? oid(d.convenioId) : null };
            })(),
            condiciones: e.condiciones || null,
            // Los reemplazos son de una contratación: no se copian.
            asignaciones: (e.asignaciones || []).filter((a) => mapa.has(String(a.puestoId))).map((a) => ({ puestoId: mapa.get(String(a.puestoId)), userId: a.userId || null, condiciones: a.condiciones || null, excluido: !!a.excluido })),
            ultimaContratacionEl: null,
        }))
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
    // El proyecto ya no hace falta: la copia es un grupo de puestos para cualquier proyecto.
    if (idOk(projectId) && !(await Project.exists({ _id: oid(projectId), tenantId: acc.tenantId })))
        throw new ErrorPlantilla(400, "Ese proyecto no existe.");
    const g = (await cargar({ ...acc, alcance: "general" }, generalId)).toObject();
    const personal = { ...acc, alcance: "personal" };
    const nuevoId = await copiarComo(personal, g, { alcance: "personal", projectId: idOk(projectId) ? oid(projectId) : null, nombre: (nombre || g.nombre).trim().slice(0, 120), conEquipos: false });
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
    let orden = p.integrantes.reduce((m, i) => Math.max(m, i.orden ?? 0), -1);
    for (const n of entradas) {
        const u = idOk(n?.userId) ? persona.get(String(n.userId)) : null;
        if (idOk(n?.userId) && (!u || u.metadata?.isSolicitud))
            throw new ErrorPlantilla(400, "Sólo se pueden agregar personas registradas.");
        const datos = leerPuesto({ ...n, rolesFrame: Array.isArray(n.rolesFrame) && n.rolesFrame.length ? n.rolesFrame : u?.metadata?.roles_frame || [] }, acc);
        if (!datos.rolesFrame?.length)
            throw new ErrorPlantilla(400, "Cada puesto necesita su rol empresa.");
        const puestoId = new Types.ObjectId();
        p.integrantes.push({ _id: puestoId, orden: ++orden, ...datos, escalaAlFijar: datos.dailyRateManual ? await escalaDe(p, datos) : null });
        if (u) {
            equipo.asignaciones.push({ puestoId, userId: oid(n.userId) });
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
    if (body.dailyRateManual !== undefined || body.categoriaSatId !== undefined || body.contratoId !== undefined)
        i.escalaAlFijar = i.dailyRateManual ? await escalaDe(p, i) : null;
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
/** Un equipo nuevo, vacío o copiando otro —personas y condiciones propias— («Semana B» a partir de «Semana A»). */
export async function crearEquipo(acc, id, nombre, copiarDeId, condiciones, datos = {}) {
    if (acc.alcance === "general")
        throw new ErrorPlantilla(400, "Una plantilla general no tiene equipos: se arman en la copia de cada supervisor.");
    const p = await cargar(acc, id);
    const n = String(nombre || "").trim().slice(0, 80) || `Equipo ${p.equipos.length + 1}`;
    if (p.equipos.some((e) => e.nombre.toLowerCase() === n.toLowerCase()))
        throw new ErrorPlantilla(409, "Ya hay un equipo con ese nombre en la plantilla.");
    const origen = copiarDeId ? p.equipos.find((e) => String(e._id) === String(copiarDeId)) : null;
    // Las condiciones se piden al crearlo (el turno, en el mismo paso que el nombre); si no, las del copiado.
    const propias = condiciones && typeof condiciones === "object" ? leerCondicionesDeEquipo(condiciones, acc) : null;
    const proyecto = await leerProyectoDelEquipo(acc, datos, origen ? datosDelEquipo(p, origen) : datosDelEquipo(p, null));
    p.equipos.push({
        nombre: n,
        ...proyecto,
        condiciones: propias || origen?.condiciones || null,
        // Se copian las personas y lo distinto de cada puesto; los reemplazos no (son de una contratación).
        asignaciones: origen ? origen.asignaciones.map((a) => ({ puestoId: a.puestoId, userId: a.userId || null, condiciones: a.condiciones || null, excluido: !!a.excluido })) : [],
    });
    const nuevo = p.equipos[p.equipos.length - 1];
    aplicarCategorias(p, nuevo, datos?.categorias);
    aplicarCondicionesPorPuesto(p, nuevo, datos?.condicionesPorPuesto, acc);
    p.markModified("equipos");
    await p.save();
    return obtenerPlantilla(acc, id);
}
/** El proyecto, la empresa y el convenio que vienen para un equipo, validados; lo que no viene sale de `base`. */
async function leerProyectoDelEquipo(acc, datos, base) {
    const projectId = datos?.projectId !== undefined ? (idOk(datos.projectId) ? String(datos.projectId) : null) : base.projectId;
    if (projectId && projectId !== base.projectId && !(await Project.exists({ _id: oid(projectId), tenantId: acc.tenantId })))
        throw new ErrorPlantilla(400, "Ese proyecto no existe.");
    const otroProyecto = projectId !== base.projectId;
    const id = (campo) => (datos?.[campo] !== undefined ? (idOk(datos[campo]) ? oid(datos[campo]) : null) : otroProyecto ? null : base[campo] ? oid(base[campo]) : null);
    return { projectId: projectId ? oid(projectId) : null, empresaContratoId: id("empresaContratoId"), convenioId: id("convenioId") };
}
/**
 * La categoría de cada puesto EN ESTE EQUIPO (sale de la valoración de SU proyecto; la calcula la
 * pantalla con la misma regla del alta individual). Se guarda como diferencia sólo si no es la del puesto.
 */
function aplicarCategorias(p, e, categorias) {
    if (!categorias || typeof categorias !== "object")
        return;
    for (const [puestoId, cat] of Object.entries(categorias)) {
        const puesto = (p.integrantes || []).find((i) => String(i._id) === String(puestoId));
        if (!puesto)
            continue;
        let a = (e.asignaciones || []).find((x) => String(x.puestoId) === String(puestoId));
        const valor = idOk(cat) ? oid(cat) : null;
        const igual = String(valor || "") === String(puesto.categoriaSatId || "");
        if (!a) {
            if (igual)
                continue;
            e.asignaciones.push((a = { puestoId: oid(puestoId), userId: null, condiciones: null, excluido: false }));
        }
        const resto = { ...(a.condiciones || {}) };
        if (igual)
            delete resto.categoriaSatId;
        else
            resto.categoriaSatId = valor;
        a.condiciones = Object.keys(resto).length ? resto : null;
    }
    e.asignaciones = e.asignaciones.filter((a) => !vacia(a));
}
/**
 * LO DISTINTO DE CADA PUESTO al crear el equipo (un equipo que cubre varias áreas y turnos: cada puesto
 * va a uno). Se suma a lo que ya tenga (la categoría), y sólo lo que difiere de las del equipo.
 */
function aplicarCondicionesPorPuesto(p, e, porPuesto, acc) {
    if (!porPuesto || typeof porPuesto !== "object")
        return;
    for (const [puestoId, cond] of Object.entries(porPuesto)) {
        const puesto = (p.integrantes || []).find((i) => String(i._id) === String(puestoId));
        if (!puesto)
            continue;
        const pedidas = leerCondicionesDeEquipo(cond, acc);
        const base = puestoEnEquipo(puesto.toObject ? puesto.toObject() : puesto, null, e);
        const distintas = Object.fromEntries(Object.entries(pedidas).filter(([k, v]) => comparable(v) !== comparable(base[k])));
        if (!Object.keys(distintas).length)
            continue;
        let a = (e.asignaciones || []).find((x) => String(x.puestoId) === String(puestoId));
        if (!a)
            e.asignaciones.push((a = { puestoId: oid(puestoId), userId: null, condiciones: null, excluido: false }));
        a.condiciones = { ...(a.condiciones || {}), ...distintas };
    }
}
/**
 * CAMBIAR UN EQUIPO: su nombre y/o su proyecto (con empresa y convenio). Pasarlo a otro proyecto vacía
 * su área y turno (son de cada proyecto) y la de sus puestos; `categorias` trae las del nuevo nivel.
 */
export async function actualizarEquipo(acc, id, equipoId, body) {
    const p = await cargar(acc, id);
    const e = p.equipos.find((x) => String(x._id) === String(equipoId));
    if (!e)
        throw new ErrorPlantilla(404, "Ese equipo ya no está en la plantilla.");
    if (body?.nombre !== undefined) {
        const n = String(body.nombre || "").trim().slice(0, 80);
        if (!n)
            throw new ErrorPlantilla(400, "Poné un nombre al equipo.");
        if (p.equipos.some((x) => x !== e && x.nombre.toLowerCase() === n.toLowerCase()))
            throw new ErrorPlantilla(409, "Ya hay un equipo con ese nombre en la plantilla.");
        e.nombre = n;
    }
    if (body?.projectId !== undefined || body?.empresaContratoId !== undefined || body?.convenioId !== undefined) {
        const antes = datosDelEquipo(p, e);
        const nuevo = await leerProyectoDelEquipo(acc, body, antes);
        if (String(nuevo.projectId || "") !== String(antes.projectId || "")) {
            if (e.condiciones)
                e.condiciones = { ...e.condiciones, areaId: null, shiftId: null };
            for (const a of e.asignaciones || []) {
                if (!a.condiciones)
                    continue;
                const { areaId, shiftId, ...resto } = a.condiciones;
                a.condiciones = Object.keys(resto).length ? resto : null;
            }
        }
        Object.assign(e, nuevo);
    }
    aplicarCategorias(p, e, body?.categorias);
    p.markModified("equipos");
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
 * Quién ocupa un puesto en un equipo. `userId: null` lo deja sin asignar (lo distinto del puesto y el
 * reemplazo, si tiene, se conservan). Cambiar a la persona no crea un reemplazo. La misma persona PUEDE
 * ocupar otro puesto del equipo: si se pisan, el equipo lo avisa (`avisos`), no se bloquea.
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
        if (actual) {
            actual.userId = null;
            if (vacia(actual))
                e.asignaciones = e.asignaciones.filter((a) => a !== actual);
        }
    }
    else {
        if (!idOk(userId))
            throw new ErrorPlantilla(400, "Elegí a la persona.");
        const u = await User.findOne({ _id: oid(userId), tenantId: acc.tenantId }).select("metadata.isSolicitud").lean();
        if (!u || u.metadata?.isSolicitud)
            throw new ErrorPlantilla(400, "Sólo se pueden asignar personas registradas.");
        if (actual) {
            // Cambiar a la persona NUNCA crea un reemplazo: eso se carga aparte, con a quién y por qué.
            actual.userId = oid(userId);
        }
        else
            e.asignaciones.push({ puestoId: oid(puestoId), userId: oid(userId) });
    }
    p.markModified("equipos");
    await p.save();
    return obtenerPlantilla(acc, id);
}
/**
 * Las CONDICIONES PROPIAS de un puesto en un equipo: área y turno, horario, días, tipo de contrato,
 * categoría, importe, comentario. Se manda el puesto como debería quedar en este equipo y se guarda sólo
 * lo que difiere del puesto. `restablecer: true` vuelve a las del puesto.
 */
export async function condicionesEnEquipo(acc, id, equipoId, puestoId, body) {
    const p = await cargar(acc, id);
    const e = p.equipos.find((x) => String(x._id) === String(equipoId));
    if (!e)
        throw new ErrorPlantilla(404, "Ese equipo ya no está en la plantilla.");
    const puesto = p.integrantes.find((x) => String(x._id) === String(puestoId));
    if (!puesto)
        throw new ErrorPlantilla(404, "Ese puesto ya no está en la plantilla.");
    const condiciones = body?.restablecer === true ? null : await condicionesDesde(p, puesto.toObject ? puesto.toObject() : puesto, body || {}, acc, e);
    const actual = e.asignaciones.find((a) => String(a.puestoId) === String(puestoId));
    if (actual) {
        actual.condiciones = condiciones;
        if (vacia(actual))
            e.asignaciones = e.asignaciones.filter((a) => a !== actual);
    }
    else if (condiciones)
        e.asignaciones.push({ puestoId: oid(puestoId), userId: null, condiciones });
    p.markModified("equipos");
    await p.save();
    return obtenerPlantilla(acc, id);
}
/** Las condiciones del equipo que vienen en el body, validadas (sólo `CAMPOS_DE_EQUIPO`). */
function leerCondicionesDeEquipo(body, acc) {
    const leidas = leerPuesto(body || {}, acc);
    const c = {};
    for (const campo of CAMPOS_DE_EQUIPO)
        if (campo in leidas)
            c[campo] = leidas[campo];
    return c;
}
/**
 * LAS CONDICIONES DEL EQUIPO: tipo de contrato, área y turno, horario y días, para TODOS sus puestos de
 * una vez. Lo que viene se pisa; lo que no viene queda. Las diferencias de los puestos que quedaron
 * iguales al equipo se borran: ya no son diferencia.
 */
export async function condicionesDelEquipo(acc, id, equipoId, body) {
    const p = await cargar(acc, id);
    const e = p.equipos.find((x) => String(x._id) === String(equipoId));
    if (!e)
        throw new ErrorPlantilla(404, "Ese equipo ya no está en la plantilla.");
    e.condiciones = { ...(e.condiciones || {}), ...leerCondicionesDeEquipo(body, acc) };
    // Un contrato nuevo sin su nombre o su trámite no deja los del anterior.
    if (body?.contratoId !== undefined)
        for (const campo of ["nombreContrato", "tipoImpositivo"])
            if (body[campo] === undefined)
                e.condiciones[campo] = null;
    for (const a of e.asignaciones) {
        if (!a.condiciones)
            continue;
        const puesto = p.integrantes.find((i) => String(i._id) === String(a.puestoId));
        if (!puesto)
            continue;
        const base = puestoEnEquipo(puesto.toObject ? puesto.toObject() : puesto, null, e);
        const resto = Object.fromEntries(Object.entries(a.condiciones).filter(([k, v]) => !CAMPOS_DE_EQUIPO.includes(k) || comparable(v) !== comparable(base[k])));
        for (const k of ["nombreContrato", "tipoImpositivo"])
            if (!("contratoId" in resto))
                delete resto[k];
        a.condiciones = Object.keys(resto).filter((k) => k !== "escalaAlFijar").length ? resto : null;
    }
    e.asignaciones = e.asignaciones.filter((a) => !vacia(a));
    p.markModified("equipos");
    await p.save();
    return obtenerPlantilla(acc, id);
}
/**
 * EL REEMPLAZO de un puesto en un equipo: a quién reemplaza quien lo ocupa y por qué. Es el ÚNICO
 * lugar donde se crea uno. `{ quitar: true }` lo saca. Al contratar se vuelve el reemplazo de la
 * solicitud (y se borra del equipo).
 */
export async function reemplazoEnEquipo(acc, id, equipoId, puestoId, body) {
    const p = await cargar(acc, id);
    const e = p.equipos.find((x) => String(x._id) === String(equipoId));
    if (!e)
        throw new ErrorPlantilla(404, "Ese equipo ya no está en la plantilla.");
    if (!p.integrantes.some((x) => String(x._id) === String(puestoId)))
        throw new ErrorPlantilla(404, "Ese puesto ya no está en la plantilla.");
    let actual = e.asignaciones.find((a) => String(a.puestoId) === String(puestoId));
    if (body?.quitar === true) {
        if (actual) {
            Object.assign(actual, { reemplazo: null, reemplazadoDePersonaId: null, reemplazadoEl: null });
            if (vacia(actual))
                e.asignaciones = e.asignaciones.filter((a) => a !== actual);
        }
    }
    else {
        if (!idOk(body?.replacedUserId))
            throw new ErrorPlantilla(400, "Elegí a quién reemplaza.");
        if (!(await User.exists({ _id: oid(body.replacedUserId), tenantId: acc.tenantId })))
            throw new ErrorPlantilla(400, "Esa persona no existe.");
        const anterior = reemplazoDe(actual);
        const motivo = body.motivoReemplazoId !== undefined ? (idOk(body.motivoReemplazoId) ? oid(body.motivoReemplazoId) : null) : anterior?.motivoReemplazoId ? oid(anterior.motivoReemplazoId) : null;
        if (!actual)
            e.asignaciones.push((actual = { puestoId: oid(puestoId), userId: null, condiciones: null, excluido: false }));
        Object.assign(actual, { reemplazo: { replacedUserId: oid(body.replacedUserId), motivoReemplazoId: motivo, revisarMotivo: false }, reemplazadoDePersonaId: null, reemplazadoEl: null });
    }
    p.markModified("equipos");
    await p.save();
    return obtenerPlantilla(acc, id);
}
/**
 * SACAR UN PUESTO DE UN EQUIPO (o volver a usarlo). Armado el equipo, los puestos que no usa se sacan
 * de ESE equipo: no se asignan, no se contratan, no cuentan. Siguen en la plantilla de puestos para los
 * demás equipos. Se conserva quién lo ocupaba y sus condiciones, por si se vuelve a usar.
 */
export async function usoDelPuestoEnEquipo(acc, id, equipoId, puestoId, excluido) {
    const p = await cargar(acc, id);
    const e = p.equipos.find((x) => String(x._id) === String(equipoId));
    if (!e)
        throw new ErrorPlantilla(404, "Ese equipo ya no está en la plantilla.");
    if (!p.integrantes.some((x) => String(x._id) === String(puestoId)))
        throw new ErrorPlantilla(404, "Ese puesto ya no está en la plantilla.");
    const actual = e.asignaciones.find((a) => String(a.puestoId) === String(puestoId));
    if (actual) {
        actual.excluido = excluido;
        if (vacia(actual))
            e.asignaciones = e.asignaciones.filter((a) => a !== actual);
    }
    else if (excluido)
        e.asignaciones.push({ puestoId: oid(puestoId), userId: null, condiciones: null, excluido: true });
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
            comentarios: typeof x.comentarios === "string" ? x.comentarios.trim().slice(0, 1000) : undefined,
        };
    }
    return { fechas, puntuales };
}
/** La plantilla y sus puestos en la forma del plan, con la persona del EQUIPO elegido en cada puesto. */
function paraPlan(p, equipoId) {
    const s = (x) => (x ? String(x) : undefined);
    const equipo = (p.equipos || []).find((e) => String(e._id) === String(equipoId));
    const asignacion = new Map((equipo?.asignaciones || []).map((a) => [String(a.puestoId), a]));
    return {
        // El proyecto, la empresa y el convenio son del EQUIPO (o de la plantilla, en las viejas).
        plantilla: {
            projectId: String(datosDelEquipo(p, equipo).projectId || ""),
            empresaContratoId: s(datosDelEquipo(p, equipo).empresaContratoId),
            convenioId: s(datosDelEquipo(p, equipo).convenioId),
            contratoId: s(p.contratoId),
            nombreContrato: p.nombreContrato || "",
            tipoImpositivo: p.tipoImpositivo || "",
            comentarios: p.comentarios || "",
        },
        integrantes: [...(p.integrantes || [])]
            .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
            // Los que el equipo no usa no se contratan.
            .filter((puesto) => !asignacion.get(String(puesto._id))?.excluido)
            // Lo del puesto, pisado por las condiciones propias del equipo elegido.
            .map((puesto) => ({ a: asignacion.get(String(puesto._id)), i: puestoEnEquipo(puesto, asignacion.get(String(puesto._id)), equipo) }))
            .map(({ a, i }) => ({
            _id: String(i._id),
            userId: a?.userId ? String(a.userId) : "",
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
            contratoId: s(i.contratoId) || null,
            nombreContrato: i.nombreContrato || null,
            tipoImpositivo: i.tipoImpositivo || null,
        })),
    };
}
/** Todo lo que el plan necesita de la base, en paralelo. */
async function contextoDe(tenantId, p, integrantes, puntuales) {
    const categoriaIds = [...integrantes.map((i) => i.categoriaSatId), ...Object.values(puntuales).map((x) => x.categoriaSatId)].filter(idOk).map(oid);
    const contratoIds = [...new Set([p.contratoId, ...integrantes.map((i) => i.contratoId)].filter(idOk).map(String))].map(oid);
    const [contratos, hayContratos, convenio, hayConvenios, categorias, personas, equipo, motivos] = await Promise.all([
        contratoIds.length ? Contrato.find({ _id: { $in: contratoIds } }).select("name data").lean() : [],
        Contrato.exists({ isActive: { $ne: false } }),
        p.convenioId ? Convenio.findById(p.convenioId).select("externalId").lean() : null,
        Convenio.exists({}),
        categoriaIds.length ? resolverCategoriasCompatPorId(categoriaIds) : [],
        User.find({ _id: { $in: [...integrantes.map((i) => i.userId), ...Object.values(puntuales).map((x) => x.userId)].filter(idOk).map(oid) }, tenantId }).select("firstName lastName email metadata.fullName metadata.activo metadata.isSolicitud").lean(),
        User.find({ tenantId, projectIds: oid(p.projectId) }).select("_id").lean(),
        RequestConfig.find({ tenantId, isActive: true }).select("name").lean(),
    ]);
    return {
        contratos: new Map(contratos.map((c) => [String(c._id), { modoFechas: c.data?.modoFechas, esTiempoIndeterminado: !!c.data?.esTiempoIndeterminado, multiplicadorDiario: c.data?.multiplicadorDiario, horasPorJornada: c.data?.horasPorJornada ?? null }])),
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
 * Los planes de VARIOS equipos de la plantilla contratados juntos («Contratar todos»), o de uno. Dos
 * pasadas: la primera resuelve las fechas de cada persona, con eso se buscan sus superposiciones —con
 * lo que ya tiene en la base y con sus OTROS puestos de esta misma contratación, de cualquier equipo—,
 * y la segunda las suma como advertencias.
 */
export async function planificarVarios(tenantId, p, bodies) {
    const nombreEquipo = new Map((p.equipos || []).map((e) => [String(e._id), e.nombre]));
    /*
      LOS REEMPLAZOS del equipo van a la solicitud como en el alta individual: isReplacement +
      replacedUserId + motivoReemplazoId, y el legajo del reemplazado (`empleado_id_reemplezado`, su
      `metadata.id`), que el individual toma de la persona elegida.
    */
    const reemplazados = [...new Set((p.equipos || []).flatMap((e) => (e.asignaciones || []).map((a) => reemplazoDe(a)?.replacedUserId)).filter(idOk))];
    const legajos = reemplazados.length ? await User.find({ _id: { $in: reemplazados.map(oid) }, tenantId }).select("metadata.id").lean() : [];
    const legajo = new Map(legajos.map((u) => [String(u._id), u.metadata?.id]));
    const conReemplazos = (body) => {
        const equipo = (p.equipos || []).find((e) => String(e._id) === String(body?.equipoId || ""));
        const puntuales = { ...(body?.puntuales || {}) };
        for (const a of equipo?.asignaciones || []) {
            const r = reemplazoDe(a);
            if (!r || a.excluido)
                continue;
            const k = String(a.puestoId);
            puntuales[k] = { ...(puntuales[k] || {}), isReplacement: true, replacedUserId: r.replacedUserId, motivoReemplazoId: r.motivoReemplazoId || undefined, empleado_id_reemplezado: legajo.get(r.replacedUserId) ?? undefined };
        }
        return { ...body, puntuales };
    };
    bodies = bodies.map(conReemplazos);
    const partes = await Promise.all(bodies.map(async (body, k) => {
        const equipoId = String(body?.equipoId || "");
        const { plantilla, integrantes } = paraPlan(p, equipoId);
        const { fechas, puntuales } = leerContratacion(body);
        // El convenio y el equipo del proyecto (a quién se puede reemplazar) son los del proyecto del EQUIPO.
        const ctx = await contextoDe(tenantId, { ...p, projectId: plantilla.projectId, convenioId: plantilla.convenioId }, integrantes, puntuales);
        const borrador = planDeLote(plantilla, integrantes, fechas, puntuales, ctx);
        const numero = new Map(integrantes.map((i, n) => [i._id, n + 1]));
        const conFechas = borrador.filas
            .filter((f) => !f.excluido && f.datos && (f.datos.startDate || f.datos.fechasTrabajadas.length))
            .map((f) => ({ k, f, pedido: pedidoDesdeSolicitud(armarPayloadDeSolicitud(f.datos).metadata), etiqueta: `puesto ${numero.get(f.integranteId)}`, equipo: nombreEquipo.get(equipoId) || "" }));
        return { plantilla, integrantes, fechas, puntuales, ctx, conFechas };
    }));
    const todas = partes.flatMap((x) => x.conFechas);
    const hoy = hoyArgentina();
    await Promise.all(todas.map(async (x) => {
        const avisos = await superposicionesDeAlta(tenantId, x.f.userId, x.pedido);
        // La misma persona en otro puesto de ESTA contratación (de este equipo o de otro): todavía no existe en la base.
        const otrosPuestos = todas
            .filter((o) => o !== x && o.f.userId === x.f.userId)
            .map((o) => ({ ...o.pedido, origen: "lote", proyectoNombre: o.k === x.k ? o.etiqueta : `«${o.equipo}», ${o.etiqueta}` }));
        const delLote = superposiciones(x.pedido, otrosPuestos, hoy);
        partes[x.k].ctx.superposiciones.set(x.f.integranteId, [...delLote, ...avisos].map((a) => ({ tipo: a.tipo, mensaje: a.mensaje })));
    }));
    return partes.map((x) => planDeLote(x.plantilla, x.integrantes, x.fechas, x.puntuales, x.ctx));
}
/** El plan de un equipo. */
export async function planificar(tenantId, p, body) {
    return (await planificarVarios(tenantId, p, [body]))[0];
}
/** Sin `datos` (el payload), que es interno: al cliente le va lo que se muestra. */
const paraMostrar = (plan) => ({
    filas: plan.filas.map(({ datos, ...f }) => ({ ...f, fechasTrabajadas: datos?.fechasTrabajadas || [], desde: datos?.startDate || "", hasta: datos?.dueDate || "", comentarios: datos?.comentarios || "", nombreContrato: datos?.nombreContrato || "", porDiasSueltos: !!datos?.porDiasSueltos })),
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
 */
export async function contratarPlantilla(acc, id, body) {
    const r = await contratarLotes(acc, id, [body], body?.idempotencyKey);
    const [l] = r.lotes;
    return { repetido: r.repetido, loteId: l.loteId, solicitudIds: l.solicitudIds, totales: l.totales, nombrePlantilla: l.nombrePlantilla };
}
/** «CONTRATAR TODOS»: el preview de varios equipos a la vez (cada uno con sus fechas). */
export async function previewDeVarios(acc, id, body) {
    const pedidos = leerPedidosDeVarios(body);
    const p = await cargar(acc, id);
    const planes = await planificarVarios(acc.tenantId, p.toObject(), pedidos);
    return { equipos: planes.map((plan, k) => ({ equipoId: String(pedidos[k].equipoId || ""), ...paraMostrar(plan) })) };
}
/** «CONTRATAR TODOS»: todos los equipos pedidos, TODO O NADA, un lote por equipo. */
export async function contratarVarios(acc, id, body) {
    return contratarLotes(acc, id, leerPedidosDeVarios(body), body?.idempotencyKey);
}
function leerPedidosDeVarios(body) {
    const pedidos = (Array.isArray(body?.equipos) ? body.equipos : []).filter((x) => idOk(x?.equipoId));
    if (!pedidos.length)
        throw new ErrorPlantilla(400, "Elegí al menos un equipo para contratar.");
    if (new Set(pedidos.map((x) => String(x.equipoId))).size !== pedidos.length)
        throw new ErrorPlantilla(400, "Un equipo vino dos veces.");
    return pedidos;
}
/**
 * EL NÚCLEO DE CONTRATAR: uno o varios equipos. Revalida todo y, si NINGUNO tiene errores, crea en UNA
 * transacción las solicitudes y un lote por equipo (el Historial agrupa por lote: «Plantilla · Equipo»).
 * La clave de idempotencia de cada lote es la del pedido más el equipo; si la del primero ya existe, es
 * un reintento y se devuelve lo ya creado.
 */
async function contratarLotes(acc, id, pedidos, claveBase) {
    const tenantId = acc.tenantId;
    const creadorId = acc.userId;
    const clave = str(claveBase).trim();
    if (!clave || clave.length > 100)
        throw new ErrorPlantilla(400, "Falta la clave de la contratación (idempotencyKey).");
    // Uno solo conserva la clave tal cual (los lotes viejos se buscan así); varios, clave + equipo.
    const claveDe = (k) => (pedidos.length === 1 ? clave : `${clave.slice(0, 70)}:${String(pedidos[k]?.equipoId || k)}`);
    const resumen = (l) => ({ loteId: String(l._id), solicitudIds: l.solicitudIds.map(String), totales: l.totales, nombrePlantilla: l.nombrePlantilla });
    const yaHechos = await LoteContratacion.find({ tenantId, idempotencyKey: { $in: pedidos.map((_, k) => claveDe(k)) } }).lean();
    if (yaHechos.length)
        return { repetido: true, lotes: yaHechos.map(resumen) };
    const p = await cargar(acc, id);
    const plantillaObj = p.toObject();
    const planes = await planificarVarios(tenantId, plantillaObj, pedidos);
    const fallas = planes.map((plan, k) => ({ k, errores: erroresDelLote(plan) })).filter((x) => x.errores.length);
    if (fallas.length) {
        const nombre = (k) => plantillaObj.equipos?.find((e) => String(e._id) === String(pedidos[k]?.equipoId))?.nombre;
        const mensaje = fallas.map((x) => (pedidos.length > 1 ? `«${nombre(x.k) || "Equipo"}»: ${x.errores.join(" ")}` : x.errores.join(" "))).join(" ");
        const extra = pedidos.length === 1 ? paraMostrar(planes[0]) : { equipos: planes.map((plan, k) => ({ equipoId: String(pedidos[k].equipoId || ""), ...paraMostrar(plan) })) };
        throw new ErrorPlantilla(422, mensaje, extra);
    }
    const personas = planes.reduce((s, plan) => s + plan.totales.personas, 0);
    if (personas > MAX_INTEGRANTES_POR_LOTE * 4)
        throw new ErrorPlantilla(400, `Son ${personas} personas: el máximo para contratar de una vez es ${MAX_INTEGRANTES_POR_LOTE * 4}.`);
    const ahora = Date.now();
    const aleatorio = Math.random().toString(36).slice(2, 7);
    const lotes = pedidos.map((body, k) => {
        const equipoId = String(body?.equipoId || "");
        const equipo = plantillaObj.equipos?.find((e) => String(e._id) === equipoId);
        return { body, equipoId, equipo, plan: planes[k], loteId: new Types.ObjectId(), nombre: equipo ? `${p.nombre} · ${equipo.nombre}` : p.nombre, creadas: [] };
    });
    const sesion = await mongoose.startSession().catch(() => null);
    if (!sesion)
        throw new ErrorPlantilla(503, "La base no permite guardar el lote entero de una vez (sin transacciones): no se creó nada.");
    try {
        await sesion.withTransaction(async () => {
            for (const l of lotes)
                l.creadas.length = 0;
            const roles = await rolesPorDefecto(tenantId, sesion);
            let n = 0;
            const set = { ultimaContratacionEl: new Date(), ultimoLoteId: lotes[lotes.length - 1].loteId };
            for (const [k, l] of lotes.entries()) {
                for (const f of l.plan.filas.filter((x) => !x.excluido)) {
                    // El MISMO camino que `POST /users`: payload compartido, mismo esquema, mismos sellos del server.
                    const payload = armarPayloadDeSolicitud(f.datos, { ahora, sufijoEmail: `_${++n}_${aleatorio}` });
                    const data = createUserSchema.parse(payload);
                    normalizarRolesFrame(data.metadata);
                    data.metadata.loteId = l.loteId;
                    data.metadata.plantillaEquipoId = p._id;
                    // Congelado al contratar: renombrar la plantilla o el equipo después no cambia cómo se llamó este lote.
                    data.metadata.loteNombre = l.nombre;
                    const rechazo = await prepararSolicitudNueva(tenantId, creadorId, data.metadata);
                    if (rechazo)
                        throw new ErrorPlantilla(422, `${f.nombre}: ${rechazo}`);
                    const [u] = await User.create([{ ...data, roles, tenantId }], { session: sesion });
                    l.creadas.push(u);
                }
                await LoteContratacion.create([
                    {
                        _id: l.loteId,
                        tenantId,
                        plantillaEquipoId: p._id,
                        projectId: l.plan.filas.find((f) => f.datos)?.datos?.projectIds?.[0] || datosDelEquipo(p, l.equipo).projectId,
                        nombrePlantilla: l.nombre,
                        idempotencyKey: claveDe(k),
                        creadoPor: oid(creadorId),
                        solicitudIds: l.creadas.map((u) => u._id),
                        totales: { personas: l.plan.totales.personas, jornadas: l.plan.totales.jornadas, importe: l.plan.totales.importe },
                    },
                ], { session: sesion });
                // El equipo: cuándo se contrató. Los reemplazos se borran: fueron de esta contratación.
                if (l.equipo) {
                    const idx = plantillaObj.equipos.findIndex((e) => String(e._id) === l.equipoId);
                    set[`equipos.${idx}.ultimaContratacionEl`] = new Date();
                    set[`equipos.${idx}.asignaciones`] = (l.equipo.asignaciones || []).map((a) => ({ ...a, reemplazo: null, reemplazadoDePersonaId: null, reemplazadoEl: null })).filter((a) => !vacia(a));
                }
            }
            await PlantillaEquipo.updateOne({ _id: p._id }, { $set: set }, { session: sesion });
        });
    }
    catch (e) {
        // Doble toque que llegó a la vez: el otro pedido ya creó los lotes con esta clave.
        if (e?.code === 11000 && /idempotencyKey/.test(String(e?.message || JSON.stringify(e?.keyPattern || {})))) {
            const otros = await LoteContratacion.find({ tenantId, idempotencyKey: { $in: pedidos.map((_, k) => claveDe(k)) } }).lean();
            if (otros.length)
                return { repetido: true, lotes: otros.map(resumen) };
        }
        if (/Transaction numbers are only allowed|replica set/i.test(String(e?.message)))
            throw new ErrorPlantilla(503, "La base no permite guardar el lote entero de una vez (sin transacciones): no se creó nada.");
        throw e;
    }
    finally {
        await sesion.endSession();
    }
    // Después del commit, como en el alta individual: un aviso por solicitud a quien aprueba.
    for (const u of lotes.flatMap((l) => l.creadas)) {
        try {
            await efectosDeSolicitudNueva(tenantId, creadorId, u);
        }
        catch (e) {
            console.error("[PLANTILLA] Aviso de solicitud nueva falló:", e);
        }
    }
    return { repetido: false, lotes: lotes.map((l) => ({ loteId: String(l.loteId), solicitudIds: l.creadas.map((u) => String(u._id)), totales: l.plan.totales, nombrePlantilla: l.nombre })) };
}

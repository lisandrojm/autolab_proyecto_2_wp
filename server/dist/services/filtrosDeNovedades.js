import { Request } from "../models/Request.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import UserProject from "../models/UserProject.js";
import { fechaISOExpr } from "../utils/contratosQueRigen.js";
import { claveEstado } from "../utils/estadoClave.js";
import { hoyArgentina } from "../utils/contratoVigencia.js";
const SIN_AREA_NI_TURNO = "__none__";
/** El mismo `normalizeProjectName` de la tabla: sin espacios, guiones ni guiones bajos, en mayúsculas. */
const normalizarProyecto = (nombre) => String(nombre ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]/g, "");
/** Lo mismo, pero adentro de Mongo, para agrupar sin traerse los nombres. */
const normalizarProyectoExpr = {
    $reduce: {
        input: [" ", "-", "_", "\t"],
        initialValue: { $toUpper: { $trim: { input: { $ifNull: ["$nombre_proyecto", "Desconocido"] } } } },
        in: { $replaceAll: { input: "$$value", find: "$$this", replacement: "" } },
    },
};
/**
 * UNA FILA POR PERSONA Y PROYECTO, con el contrato que rige, elegido adentro de Mongo.
 *
 * `soloDelPeriodo` deja afuera los contratos que no pisan el período, que es lo que hace la tabla
 * cuando el interruptor está prendido. Los que están dados de baja o inactivos tampoco cuentan,
 * igual que en `isActiveContract`.
 */
async function filasConSuContrato(desde, hasta, soloDelPeriodo) {
    /*
      El contrato se reduce a sus claves ANTES de agrupar: alta, baja, carga y los cuatro campos que
      los filtros miran. Agrupar contratos enteros sería mover el historial completo adentro de Mongo
      para quedarse con uno por fila.
    */
    const claveDelContrato = {
        alta: fechaISOExpr("$contracts.fecha_alta_contrato"),
        baja: fechaISOExpr("$contracts.fecha_baja_contrato"),
        carga: { $toString: { $ifNull: ["$contracts.fecha_carga", ""] } },
        nombre_contrato: { $ifNull: ["$contracts.nombre_contrato", ""] },
        tipo_contrato_id: "$contracts.tipo_contrato_id",
        nombre_estado_empleado: { $ifNull: ["$contracts.nombre_estado_empleado", ""] },
        reemplazo: "$contracts.reemplazo",
        sueldo_jornada: { $ifNull: [{ $toDouble: { $ifNull: ["$contracts.sueldo_jornada", 0] } }, 0] },
        sueldo_mano: { $ifNull: [{ $toDouble: { $ifNull: ["$contracts.sueldo_mano", 0] } }, 0] },
    };
    const hoy = hoyArgentina();
    const filas = await UserProject.aggregate([
        { $match: { contracts: { $exists: true, $ne: [] } } },
        { $project: { userId: 1, projectId: 1, proyecto: normalizarProyectoExpr, contracts: 1 } },
        { $unwind: "$contracts" },
        { $project: { userId: 1, projectId: 1, proyecto: 1, c: claveDelContrato, estado: { $toLower: { $ifNull: ["$contracts.nombre_estado_empleado", ""] } } } },
        /*
          Un contrato sin fecha de alta no es una fila: es un renglón a medio cargar. Y los que dicen
          «baja» o «inactivo» en el estado quedan afuera aunque las fechas den, que es lo que hace la
          tabla — alguien puede tener fechas que parecen vigentes y estar dado de baja.
        */
        {
            $match: {
                "c.alta": { $ne: "" },
                estado: { $not: { $regex: "baja|inactivo" } },
                ...(soloDelPeriodo
                    ? {
                        // Pisa el período: no terminó antes de que empiece, ni empieza después de que termine.
                        $and: [{ $or: [{ "c.baja": "" }, { "c.baja": { $gte: desde } }] }, { "c.alta": { $lte: hasta } }],
                    }
                    : {}),
            },
        },
        { $group: { _id: { u: "$userId", p: "$proyecto" }, conProyecto: { $max: { $cond: [{ $ifNull: ["$projectId", false] }, 1, 0] } }, claves: { $push: "$c" } } },
        // La tabla descarta el grupo «Desconocido» cuando además no hay proyecto: es basura de carga.
        { $match: { $or: [{ "_id.p": { $ne: "DESCONOCIDO" } }, { conProyecto: 1 }] } },
        /*
          La regla de `getContratoActivo`, en tres pasos: los vigentes hoy; entre ellos, los de tiempo
          indeterminado (sin baja) si hay alguno; y de los que queden, el más reciente por alta y, a
          igualdad, por carga.
        */
        {
            $addFields: {
                vigentes: {
                    $filter: {
                        input: "$claves",
                        as: "k",
                        cond: { $and: [{ $or: [{ $eq: ["$$k.alta", ""] }, { $lte: ["$$k.alta", hoy] }] }, { $or: [{ $eq: ["$$k.baja", ""] }, { $gte: ["$$k.baja", hoy] }] }] },
                    },
                },
            },
        },
        {
            $addFields: {
                candidatos: {
                    $let: {
                        vars: { indeterminados: { $filter: { input: "$vigentes", as: "k", cond: { $eq: ["$$k.baja", ""] } } } },
                        in: { $cond: [{ $gt: [{ $size: "$$indeterminados" }, 0] }, "$$indeterminados", { $cond: [{ $gt: [{ $size: "$vigentes" }, 0] }, "$vigentes", "$claves"] }] },
                    },
                },
            },
        },
        {
            $project: {
                _id: 0,
                userId: "$_id.u",
                proyecto: "$_id.p",
                elegido: {
                    $reduce: {
                        input: "$candidatos",
                        initialValue: null,
                        in: { $cond: [{ $or: [{ $eq: ["$$value", null] }, { $gte: [{ $concat: ["$$this.alta", "|", "$$this.carga"] }, { $concat: ["$$value.alta", "|", "$$value.carga"] }] }] }, "$$this", "$$value"] },
                    },
                },
            },
        },
    ]);
    return filas.map((f) => ({
        clave: `${String(f.userId)}::${f.proyecto}`,
        userId: String(f.userId),
        contrato: f.elegido
            ? {
                alta: f.elegido.alta || "",
                baja: f.elegido.baja || "",
                nombre_contrato: String(f.elegido.nombre_contrato || "").trim(),
                tipo_contrato_id: f.elegido.tipo_contrato_id,
                nombre_estado_empleado: String(f.elegido.nombre_estado_empleado || "").trim(),
                reemplazo: f.elegido.reemplazo,
                sueldo_jornada: Number(f.elegido.sueldo_jornada) || 0,
                sueldo_mano: Number(f.elegido.sueldo_mano) || 0,
            }
            : null,
    }));
}
/** Vigente = ya arrancó y no terminó. Mismo criterio que `esContratoVigente` del front. */
const estaVigente = (c) => {
    if (!c)
        return false;
    const hoy = hoyArgentina();
    if (c.alta && c.alta > hoy)
        return false;
    return !c.baja || c.baja >= hoy;
};
export async function resolverFiltrosDeNovedades(tenantId, filtros) {
    const soloDelPeriodo = filtros.soloContratoActivo !== false;
    /* ── 1. Las filas, con su contrato ── */
    const filas = await filasConSuContrato(filtros.desde, filtros.hasta, soloDelPeriodo);
    if (filas.length === 0)
        return { claves: [], opciones: { roles: [], tipos: [], estados: [], areasTurnos: [] }, total: 0, economia: {} };
    /* ── 2. El área y el turno en que cada persona trabajó esos días, del parte ── */
    const partes = await Request.find({ tenantId, date: { $gte: filtros.desde, $lte: filtros.hasta } })
        .select("areaId shiftId attendance.employeeId attendance.replacementId")
        .lean();
    const areasTurnosPorPersona = new Map();
    const sumar = (userId, clave) => {
        if (!areasTurnosPorPersona.has(userId))
            areasTurnosPorPersona.set(userId, new Set());
        areasTurnosPorPersona.get(userId).add(clave);
    };
    for (const parte of partes) {
        const clave = parte.areaId || parte.shiftId ? `${parte.areaId || ""}::${parte.shiftId || ""}` : SIN_AREA_NI_TURNO;
        for (const r of parte.attendance || []) {
            if (r?.employeeId)
                sumar(String(r.employeeId), clave);
            // El reemplazante también «estuvo» ese día: si se lo dejara afuera no aparecería en el reporte.
            if (r?.replacementId)
                sumar(String(r.replacementId), clave);
        }
    }
    /* ── 3. Estado de usuario y roles de plataforma, de la gente de esas filas ── */
    const ids = [...new Set(filas.map((f) => f.userId))];
    const usuarios = await User.find({ _id: { $in: ids }, tenantId })
        .select("metadata.activo roles")
        .populate({ path: "roles", select: "name", model: Role })
        .lean();
    const porId = new Map(usuarios.map((u) => [String(u._id), u]));
    /* ── 4. Nombres de áreas y turnos, para las etiquetas del desplegable ── */
    const [areas, turnos] = await Promise.all([
        Area.find({ tenantId }).select("name").lean(),
        Shift.find({ tenantId }).select("name").lean(),
    ]);
    const nombreArea = new Map(areas.map((a) => [String(a._id), a.name]));
    const nombreTurno = new Map(turnos.map((t) => [String(t._id), t.name]));
    const etiquetaDeAreaTurno = (clave) => {
        if (clave === SIN_AREA_NI_TURNO)
            return "Sin área/turno";
        const [areaId, shiftId] = clave.split("::");
        return [nombreArea.get(areaId), nombreTurno.get(shiftId)].filter(Boolean).join(" · ") || "Sin área/turno";
    };
    /* ── 5. Las filas que la tabla puede llegar a dibujar ── */
    const delTenant = filas.filter((f) => porId.has(f.userId));
    /*
      ── 6. Las opciones: lo que hay EN LA TABLA ──
  
      Salen de las mismas filas que se van a dibujar y NO de los filtros aplicados: si dependieran de
      ellos, elegir un tipo borraría los demás del desplegable y no habría forma de cambiar de opinión.
    */
    const roles = new Set();
    const tipos = new Set();
    const estados = new Set();
    const areasTurnos = new Map();
    for (const f of delTenant) {
        (porId.get(f.userId)?.roles || []).forEach((r) => r?.name && roles.add(r.name));
        if (f.contrato?.nombre_contrato)
            tipos.add(f.contrato.nombre_contrato);
        if (f.contrato?.nombre_estado_empleado)
            estados.add(f.contrato.nombre_estado_empleado);
        areasTurnosPorPersona.get(f.userId)?.forEach((clave) => areasTurnos.set(clave, etiquetaDeAreaTurno(clave)));
    }
    /* ── 7. Qué filas pasan ── */
    const pasan = delTenant.filter((f) => {
        const u = porId.get(f.userId);
        if (filtros.estadoUsuario === "active" && u.metadata?.activo === false)
            return false;
        if (filtros.estadoUsuario === "inactive" && u.metadata?.activo !== false)
            return false;
        if (filtros.rol && !(u.roles || []).some((r) => r?.name === filtros.rol))
            return false;
        const c = f.contrato;
        if (filtros.vigencia) {
            const vigente = estaVigente(c);
            if (filtros.vigencia === "vigente" ? !vigente : vigente)
                return false;
        }
        if (filtros.tipoContrato && (c?.nombre_contrato ?? "") !== filtros.tipoContrato)
            return false;
        if (filtros.estadoContrato && claveEstado(c?.nombre_estado_empleado ?? "") !== claveEstado(filtros.estadoContrato))
            return false;
        if (filtros.reemplazo) {
            const esReemplazo = !!c?.reemplazo;
            if (filtros.reemplazo === "con" ? !esReemplazo : esReemplazo)
                return false;
        }
        // El área y el turno son de la PERSONA en el período: si no aparece en ningún parte, no pasa.
        if (filtros.areaTurno && !areasTurnosPorPersona.get(f.userId)?.has(filtros.areaTurno))
            return false;
        return true;
    });
    /*
      La plata de TODAS las filas que la tabla puede dibujar, no sólo de las que pasan el filtro: el
      recorte se aplica en el navegador y la fila tiene que saber su sueldo antes de que se decida si
      entra. Son dos números por fila.
    */
    const economia = {};
    for (const f of delTenant) {
        if (!f.contrato)
            continue;
        economia[f.clave] = { sueldoJornada: f.contrato.sueldo_jornada, sueldoMano: f.contrato.sueldo_mano };
    }
    const ordenar = (a, b) => a.localeCompare(b, "es", { sensitivity: "base" });
    return {
        claves: pasan.map((f) => f.clave),
        total: delTenant.length,
        economia,
        opciones: {
            roles: [...roles].sort(ordenar),
            tipos: [...tipos].sort(ordenar),
            estados: [...estados].sort(ordenar),
            areasTurnos: [...areasTurnos.entries()]
                .map(([value, label]) => ({ value, label }))
                .sort((a, b) => ordenar(a.label, b.label)),
        },
    };
}
/** La clave de fila que espera `claves`, para que el front la arme igual. */
export const claveDeFila = (userId, nombreProyecto) => `${userId}::${normalizarProyecto(nombreProyecto)}`;

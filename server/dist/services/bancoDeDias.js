import { Types } from "mongoose";
import { LeaveLedger } from "../models/LeaveLedger.js";
import { LeaveAccount } from "../models/LeaveAccount.js";
import { RequestConfig } from "../models/RequestConfig.js";
import { Holiday } from "../models/Holiday.js";
import { Project } from "../models/Project.js";
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EL MOTOR DE EFECTOS: qué le hace cada novedad al banco de días
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un parte de novedades es un hecho: «el 14 de marzo, Pérez se tomó un compensatorio». Este servicio
 * lo traduce a movimientos de cuenta según cómo esté configurado ese tipo (`RequestConfig.effects`).
 *
 * SE LLAMA EN LOS TRES MOMENTOS DEL PARTE —crear, editar, borrar— y nunca borra un movimiento:
 * para deshacer emite el contrario. Ver `models/LeaveLedger.ts`.
 *
 * ES IDEMPOTENTE. Reprocesar el mismo parte no vuelve a mover nada: los movimientos guardan con qué
 * versión del parte se generaron, y si ya existen los de esta versión, no se hace nada. Importa
 * porque esto se va a llamar desde varios lados —el alta, la edición, algún reproceso a mano— y
 * duplicar días es un error que después nadie encuentra.
 */
/** A qué período imputa una fecha. Hoy sólo calendario; el aniversario llega con el devengamiento. */
export const periodoDe = (fecha, modo = "calendario") => {
    // `aniversario_ingreso` necesita la fecha de ingreso de la persona: lo resuelve quien devenga.
    if (modo === "aniversario_ingreso")
        return `${fecha.getUTCFullYear()}-${fecha.getUTCFullYear() + 1}`;
    return String(fecha.getUTCFullYear());
};
const redondear = (valor, modo) => {
    if (modo === "up")
        return Math.ceil(valor);
    if (modo === "down")
        return Math.floor(valor);
    if (modo === "half")
        return Math.round(valor);
    return valor;
};
/** El día de un parte, como fecha UTC a medianoche: `Request.date` es `"YYYY-MM-DD"`. */
const fechaDelParte = (parte) => {
    const iso = String(parte?.date || "").slice(0, 10);
    const d = new Date(`${iso}T00:00:00.000Z`);
    return isNaN(d.getTime()) ? new Date() : d;
};
/**
 * Qué se sabe del día, para las condiciones de los efectos.
 *
 * Se resuelve UNA VEZ por parte y no por renglón: los quince o veinte renglones de un parte son del
 * mismo día y del mismo proyecto, así que preguntar por cada uno serían veinte consultas iguales.
 */
async function contextoDelDia(tenantId, parte) {
    const fecha = fechaDelParte(parte);
    const desde = new Date(fecha);
    const hasta = new Date(fecha);
    hasta.setUTCHours(23, 59, 59, 999);
    const feriado = await Holiday.findOne({ tenantId, date: { $gte: desde, $lte: hasta } }).select("_id").lean();
    /*
      DÍA NO LABORABLE = el proyecto no trabaja ese día de la semana.
  
      Sale del `workSchedule` del proyecto, que es donde ya está configurado qué días se trabaja. Si el
      proyecto no lo declara, no se asume nada: sin configuración, todos los días son laborables, que
      es como se comporta hoy el resto de la aplicación.
    */
    let esDiaNoLaborable = false;
    if (parte?.projectId) {
        const proyecto = await Project.findById(parte.projectId).select("workSchedule").lean();
        const dias = proyecto?.workSchedule?.days;
        if (Array.isArray(dias) && dias.length > 0)
            esDiaNoLaborable = !dias.includes(fecha.getUTCDay());
    }
    return { esFeriado: !!feriado, esDiaNoLaborable };
}
/** Si el efecto aplica a este día. Sin condiciones, siempre. */
const cumpleCondicion = (efecto, ctx) => {
    const c = efecto.condition;
    if (!c)
        return true;
    if (c.esFeriado !== undefined && c.esFeriado !== ctx.esFeriado)
        return false;
    if (c.esDiaNoLaborable !== undefined && c.esDiaNoLaborable !== ctx.esDiaNoLaborable)
        return false;
    return true;
};
/** Cuánto mueve un efecto para un renglón de asistencia. `0` = no se emite movimiento. */
const cantidadDe = (efecto, renglon) => {
    let base = 0;
    if (efecto.basis === "fijo")
        base = Number(efecto.cantidadFija) || 0;
    else if (efecto.basis === "hora")
        base = (Number(renglon?.overtimeHours) || 0) + (Number(renglon?.replacementOvertimeHours) || 0);
    else
        base = 1; // un día
    const bruto = base * (Number(efecto.factor) || 1);
    const valor = redondear(bruto, efecto.rounding);
    return valor > 0 ? valor : 0;
};
/**
 * Traduce un parte a movimientos del banco de días.
 *
 * @param parte      el documento de `Request` (el parte de novedades)
 * @param accion     qué le pasó al parte
 * @param opciones   quién lo hizo, para dejarlo asentado en los movimientos
 */
export async function applyEffects(parte, accion, opciones = {}) {
    const tenantId = opciones.tenantId || parte?.tenantId;
    const resultado = { movimientosCreados: 0, reversasCreadas: 0, yaEstaba: false };
    if (!tenantId || !parte?._id)
        return resultado;
    const refId = new Types.ObjectId(String(parte._id));
    const versionActual = Number(parte.version) || 1;
    const createdBy = opciones.createdBy ? new Types.ObjectId(String(opciones.createdBy)) : undefined;
    /*
      LO QUE YA ESTÁ REGISTRADO DE ESTE PARTE.
  
      Se mira antes de decidir nada: si los movimientos vivos ya son de esta versión, no hay trabajo
      que hacer y se sale. Eso es lo que hace que llamar dos veces no duplique.
    */
    const existentes = await LeaveLedger.find({ tenantId, "source.kind": "novedad", "source.refId": refId }).lean();
    const revertidos = new Set(existentes.filter((m) => m.reversalOf).map((m) => String(m.reversalOf)));
    const vivos = existentes.filter((m) => !m.reversalOf && !revertidos.has(String(m._id)));
    if (accion === "create" && vivos.length > 0 && vivos.every((m) => Number(m.source?.refVersion) === versionActual)) {
        resultado.yaEstaba = true;
        return resultado;
    }
    // 1. Deshacer lo que esta novedad había hecho antes. Se emite el contrario, no se borra nada.
    if (accion !== "create" && vivos.length > 0) {
        const reversas = vivos.map((m) => ({
            tenantId,
            userId: m.userId,
            accountId: m.accountId,
            date: m.date,
            periodo: m.periodo,
            direction: m.direction === "debit" ? "credit" : "debit",
            amount: m.amount,
            source: { kind: "reversa", refId, refVersion: versionActual },
            reversalOf: m._id,
            rulesSnapshot: m.rulesSnapshot,
            createdBy,
        }));
        if (reversas.length > 0) {
            await LeaveLedger.insertMany(reversas);
            resultado.reversasCreadas = reversas.length;
        }
    }
    if (accion === "delete")
        return resultado;
    // 2. Generar lo que corresponde a la versión de ahora.
    const renglones = Array.isArray(parte.attendance) ? parte.attendance : [];
    const idsTipo = [...new Set(renglones.map((r) => String(r?.typeId || "")).filter((id) => Types.ObjectId.isValid(id)))];
    if (idsTipo.length === 0)
        return resultado;
    const tipos = await RequestConfig.find({ tenantId, _id: { $in: idsTipo } }).lean();
    const tipoPorId = new Map(tipos.map((t) => [String(t._id), t]));
    const idsCuenta = [...new Set(tipos.flatMap((t) => (t.effects || []).map((e) => String(e.accountId))))];
    const cuentas = idsCuenta.length > 0 ? await LeaveAccount.find({ tenantId, _id: { $in: idsCuenta }, isActive: true }).lean() : [];
    const cuentaPorId = new Map(cuentas.map((c) => [String(c._id), c]));
    const ctx = await contextoDelDia(tenantId, parte);
    const fecha = fechaDelParte(parte);
    const nuevos = [];
    for (const renglon of renglones) {
        const tipo = tipoPorId.get(String(renglon?.typeId || ""));
        if (!tipo || !renglon?.employeeId)
            continue;
        for (const efecto of (tipo.effects || [])) {
            const cuenta = cuentaPorId.get(String(efecto.accountId));
            // Una cuenta apagada no se mueve: apagarla es justamente dejar de acumular ahí.
            if (!cuenta)
                continue;
            if (!cumpleCondicion(efecto, ctx))
                continue;
            const amount = cantidadDe(efecto, renglon);
            if (amount <= 0)
                continue;
            nuevos.push({
                tenantId,
                userId: new Types.ObjectId(String(renglon.employeeId?._id || renglon.employeeId)),
                accountId: new Types.ObjectId(String(efecto.accountId)),
                date: fecha,
                periodo: periodoDe(fecha, cuenta.accrual?.periodo),
                direction: efecto.direction,
                amount,
                source: { kind: "novedad", refId, refVersion: versionActual },
                /*
                  La regla EXACTA con la que se calculó, más el día que se evaluó. Dentro de un año, cuando
                  alguien pregunte por qué ese movimiento fue de 2 días, la respuesta está acá y no en la
                  configuración de ese momento, que ya va a ser otra.
                */
                rulesSnapshot: {
                    tipo: { _id: String(tipo._id), name: tipo.name },
                    efecto: { direction: efecto.direction, basis: efecto.basis, factor: efecto.factor, cantidadFija: efecto.cantidadFija, rounding: efecto.rounding, condition: efecto.condition },
                    cuenta: { code: cuenta.code, unit: cuenta.unit },
                    dia: ctx,
                },
                createdBy,
            });
        }
    }
    if (nuevos.length > 0) {
        await LeaveLedger.insertMany(nuevos);
        resultado.movimientosCreados = nuevos.length;
    }
    return resultado;
}
/**
 * EL SALDO DE UNA PERSONA, SUMANDO SUS MOVIMIENTOS.
 *
 * No hay un campo que leer: esto ES el saldo. Una agregación por persona, que con los índices de
 * `LeaveLedger` va por (tenantId, userId, accountId).
 */
export async function saldosDe(tenantId, userIds, periodo) {
    const ids = userIds.map((id) => new Types.ObjectId(String(id)));
    if (ids.length === 0)
        return new Map();
    const match = { tenantId, userId: { $in: ids } };
    if (periodo)
        match.periodo = periodo;
    const filas = await LeaveLedger.aggregate([
        { $match: match },
        {
            $group: {
                _id: { userId: "$userId", accountId: "$accountId" },
                acreditado: { $sum: { $cond: [{ $eq: ["$direction", "credit"] }, "$amount", 0] } },
                consumido: { $sum: { $cond: [{ $eq: ["$direction", "debit"] }, "$amount", 0] } },
            },
        },
    ]);
    const porUsuario = new Map();
    for (const f of filas) {
        const u = String(f._id.userId);
        if (!porUsuario.has(u))
            porUsuario.set(u, new Map());
        porUsuario.get(u).set(String(f._id.accountId), {
            acreditado: f.acreditado,
            consumido: f.consumido,
            saldo: f.acreditado - f.consumido,
        });
    }
    return porUsuario;
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * CAMPAÑA DE GOCE DE VACACIONES (15/11/2026): las reglas, puras
 * ═══════════════════════════════════════════════════════════════════════
 *
 * La empresa invita a cada persona con días disponibles a elegir sus fechas dentro de la ventana de goce,
 * con una fecha límite. Si no elige, la EMPRESA le asigna un tramo único continuo. En los dos casos hay
 * aviso por escrito con anticipación y acuse de recibo. Marco: LCT 20.744, arts. 150–157 (a confirmar con
 * el asesor):
 *   · El empleador fija las fechas; dejar elegir primero es una cortesía interna.
 *   · Aviso por escrito con al menos 30 días antes del INICIO (el CCT puede pedir más).
 *   · Fraccionar (tramos de 7 días o más) sólo por acuerdo: si asigna la empresa, UN TRAMO CONTINUO.
 *     Desde el 23/11/2026, en orden de fecha cada tramo lleva al menos el mínimo o, si quedan menos, todos los que
 *     quedan; con menos del mínimo en total no se fracciona (ver `validarPropuesta`).
 *   · Los días de la semana en que puede EMPEZAR un tramo (23/11/2026, `diasDeInicio`; vacío = cualquier día).
 *   · NUNCA se compensa en dinero con la relación vigente (art. 156): esto no existe acá como opción.
 *
 * Fechas en "YYYY-MM-DD" sin Date de por medio (como `planVacaciones/fechas`). Las comparten el server
 * (validar, sugerir) y el front (la app arma la propuesta y la valida antes de mandarla).
 */
import { diasEntre, diasHasta, esISO, fechaCorta, sePisan, sumarDias } from "../planVacaciones/fechas.js";
import { rangoPermitido, temporadaConVentana, textoDeVentana } from "../ventanaGoce.js";
export const CONFIG_CAMPANIA_POR_DEFECTO = { activa: false, plazoParaDefinirDias: 14, avisoMinimoDias: 30, minDiasPorTramo: 7, tiposContratoInvitar: [], diasDeInicio: [] };
/** Los días de la semana, como los da `getUTCDay` (0 = domingo). */
export const DIAS_DE_LA_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
/**
 * Los días de inicio tal como se guardan: enteros de 0 a 6, sin repetir, en orden de lunes a domingo. Los siete
 * marcados es lo mismo que ninguno (cualquier día) y se guarda vacío.
 */
export function normalizarDiasDeInicio(v) {
    if (!Array.isArray(v))
        return [];
    const dias = [...new Set(v.filter((x) => x !== null && x !== undefined && x !== "").map((x) => Math.round(Number(x))).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))];
    if (dias.length === 7)
        return [];
    return dias.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}
/** «cualquier día», «los lunes», «los lunes o viernes», «los lunes, miércoles o viernes». */
export function textoDiasDeInicio(dias) {
    const d = normalizarDiasDeInicio(dias);
    if (d.length === 0)
        return "cualquier día";
    const plural = (n) => (n === 6 || n === 0 ? `${DIAS_DE_LA_SEMANA[n]}s` : DIAS_DE_LA_SEMANA[n]);
    const nombres = d.map(plural);
    return `los ${nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(", ")} o ${nombres[nombres.length - 1]}`}`;
}
/** ¿Puede empezar ese día? Sin días configurados, siempre. */
export const puedeEmpezar = (desde, dias) => {
    const d = normalizarDiasDeInicio(dias);
    return d.length === 0 || d.includes(new Date(`${desde}T12:00:00Z`).getUTCDay());
};
/**
 * Qué pasa si la persona no elige, y cómo asigna la empresa. Son constantes y no configuración: NO hay
 * otra opción. En particular, no existe «pagar en lugar de gozar» (art. 156: sólo al egreso).
 */
export const ACCION_SI_NO_DEFINE = "empresaAsigna";
export const ASIGNACION_POR_DEFECTO = "tramoUnico";
const entero = (v, base, min, max) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : base;
};
/** Lee la configuración guardada tolerando lo que falte o venga mal: cada dato inválido cae al de por defecto. */
export function normalizarConfigCampania(v) {
    const d = CONFIG_CAMPANIA_POR_DEFECTO;
    return {
        activa: v?.activa === true,
        plazoParaDefinirDias: entero(v?.plazoParaDefinirDias, d.plazoParaDefinirDias, 1, 120),
        avisoMinimoDias: entero(v?.avisoMinimoDias, d.avisoMinimoDias, 0, 180),
        minDiasPorTramo: entero(v?.minDiasPorTramo, d.minDiasPorTramo, 1, 60),
        tiposContratoInvitar: normalizarTiposContrato(v?.tiposContratoInvitar),
        diasDeInicio: normalizarDiasDeInicio(v?.diasDeInicio),
    };
}
/**
 * La lista de tipos tal como se guarda: ids del catálogo (24 hex), sin repetir, ordenados. Lo que no es una lista
 * queda vacío. Un número es la clave vieja (el de FRAME, 23/11/2026): se descarta, no se adivina a qué tipo era.
 */
export function normalizarTiposContrato(v) {
    if (!Array.isArray(v))
        return [];
    const ids = v.filter((x) => typeof x === "string" || (x && typeof x === "object")).map((x) => String(x).trim().toLowerCase()).filter((s) => /^[0-9a-f]{24}$/.test(s));
    return [...new Set(ids)].sort();
}
/** Por qué NO se invita a alguien, o `null` si se la invita. `tipoContratoId` null = sin contrato vigente de cómputo. */
export function motivoDeNoInvitar(o) {
    if (o.tipoContratoId === null)
        return "sin_contrato_vigente";
    if (o.deshabilitados.includes(o.tipoContratoId))
        return "tipo_deshabilitado";
    if (o.seleccion.length === 0)
        return null;
    return o.seleccion.includes(o.tipoContratoId) ? null : "tipo_no_incluido";
}
/** Por qué alguien queda fuera de la campaña, para el historial y la pantalla. */
export const TEXTO_MOTIVO_NO_INVITAR = {
    tipo_deshabilitado: "su tipo de contrato no tiene vacaciones (Visibilidad por tipo de Contrato)",
    tipo_no_incluido: "su tipo de contrato no está entre los que invita la campaña",
    sin_contrato_vigente: "no tiene contrato vigente en WeProdu",
};
/**
 * LA VISTA PREVIA: cuántas personas se invitarían con esa selección, y cuántas quedan afuera por cada
 * motivo. Es `motivoDeNoInvitar` aplicado grupo por grupo, así que coincide con lo que hace el lanzamiento.
 */
export function resumenDeInvitables(p, seleccion, deshabilitados) {
    const r = { invitar: 0, tipoDeshabilitado: 0, tipoNoIncluido: 0, sinContrato: 0 };
    const sumar = (tipoContratoId, personas) => {
        const motivo = motivoDeNoInvitar({ tipoContratoId, seleccion, deshabilitados });
        if (!motivo)
            r.invitar += personas;
        else if (motivo === "tipo_deshabilitado")
            r.tipoDeshabilitado += personas;
        else if (motivo === "tipo_no_incluido")
            r.tipoNoIncluido += personas;
        else
            r.sinContrato += personas;
    };
    for (const t of p.porTipo)
        sumar(t.id, t.personas);
    sumar(null, p.sinContrato);
    return r;
}
const diaDeSemana = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
/**
 * Cuántos días cuenta un tramo: corridos, o de lunes a viernes cuando la configuración no usa días
 * corridos. Es la misma cuenta que `contarDias` del server (sin descontar feriados), para que la suma
 * de la propuesta dé lo mismo que van a descontar las vacaciones que se crean.
 */
export function contarDiasTramo(t, diasCorridos) {
    const total = diasEntre(t.desde, t.hasta);
    if (diasCorridos || total <= 0)
        return total;
    let n = 0;
    for (let i = 0; i < total; i++) {
        const d = diaDeSemana(sumarDias(t.desde, i));
        if (d !== 0 && d !== 6)
            n++;
    }
    return n;
}
/** El último día de un tramo que empieza en `desde` y tiene `dias` días (corridos o hábiles). */
export function hastaParaDias(desde, dias, diasCorridos) {
    if (dias <= 0)
        return desde;
    if (diasCorridos)
        return sumarDias(desde, dias - 1);
    let cuenta = 0;
    let d = desde;
    for (let guarda = 0; guarda < 800; guarda++) {
        const dow = diaDeSemana(d);
        if (dow !== 0 && dow !== 6)
            cuenta++;
        if (cuenta >= dias)
            return d;
        d = sumarDias(d, 1);
    }
    return d;
}
/**
 * LA VENTANA DE LA TEMPORADA, CON AÑO: la que está en curso o, si ya terminó, la próxima. La ventana
 * anual es «MM-DD» sin año (1/11 → 30/4); una campaña lanzada el 15/9/2026 es para la del 1/11/2026 al
 * 30/4/2027, y una lanzada el 15/1/2027, para la que ya empezó (termina el 30/4/2027).
 */
export function ventanaDeLaTemporada(hoy, tramo) {
    const anio = Number(hoy.slice(0, 4));
    for (const a of [anio - 1, anio, anio + 1]) {
        const t = temporadaConVentana(`${a}-01-01`, tramo);
        if (t.hasta >= hoy)
            return t;
    }
    return temporadaConVentana(`${anio + 1}-01-01`, tramo);
}
/** Hasta cuándo puede elegir: `hoy` + el plazo. */
export const fechaLimite = (hoy, plazoDias) => sumarDias(hoy, plazoDias);
/** El primer día en que pueden empezar unas vacaciones avisadas hoy (lo que ASIGNA la empresa). */
export const primerInicioPosible = (hoy, avisoDias) => sumarDias(hoy, avisoDias);
/**
 * EL PRIMER DÍA QUE PUEDE PROPONER LA PERSONA (23/11/2026, regla del usuario): mañana. El aviso de `avisoMinimoDias`
 * no corre para lo que elige ella —«la aprobación no tiene que ser 30 días antes»—: corre sólo cuando vence el plazo
 * y la empresa le asigna las fechas (`validarOtorgamiento` con `porLaEmpresa`).
 */
export const primerInicioPropuesto = (hoy) => sumarDias(hoy, 1);
/**
 * LO QUE CONVIENE SABER ANTES DE LANZAR. La cuenta que importa es la del peor caso: alguien que no elige
 * hasta la fecha límite, la empresa le asigna ese día y recién ahí corre el aviso. Si ese inicio (más los
 * días a otorgar) se pasa del fin de la ventana, la campaña no llega a otorgar en término.
 *
 * `diasMasLargo`: los días del que más tiene para gozar (si se sabe), para medir también el fin del tramo.
 */
export function alertasDeLanzamiento(o) {
    const alertas = [];
    const { hoy, plazoDias, avisoDias, ventana } = o;
    if (!esISO(ventana.desde) || !esISO(ventana.hasta) || ventana.hasta < ventana.desde) {
        return [{ nivel: "error", codigo: "ventana_invalida", mensaje: "La ventana de goce no es válida: revisá Configuración › Vacaciones › Ventana anual." }];
    }
    if (ventana.hasta < hoy) {
        return [{ nivel: "error", codigo: "ventana_terminada", mensaje: `La ventana de goce terminó el ${fechaCorta(ventana.hasta)}.` }];
    }
    const limite = fechaLimite(hoy, plazoDias);
    const dias = Math.max(1, o.diasMasLargo || 1);
    const inicioTardio = primerInicioPosible(limite, avisoDias) > ventana.desde ? primerInicioPosible(limite, avisoDias) : ventana.desde;
    const finTardio = sumarDias(inicioTardio, dias - 1);
    // El último día para lanzar y que el peor caso (asignar al vencer + aviso + los días) termine dentro de la ventana.
    const ultimoLanzamiento = sumarDias(ventana.hasta, -(dias - 1) - avisoDias - plazoDias);
    if (inicioTardio > ventana.hasta || finTardio > ventana.hasta) {
        alertas.push({
            nivel: "error",
            codigo: "no_llega",
            mensaje: `Quien no elija hasta el ${fechaCorta(limite)} recibiría el aviso ese día y no podría empezar antes del ${fechaCorta(inicioTardio)}` +
                (finTardio > ventana.hasta && inicioTardio <= ventana.hasta ? ` (con ${dias} días terminaría el ${fechaCorta(finTardio)})` : "") +
                `: la ventana cierra el ${fechaCorta(ventana.hasta)}. ` +
                (ultimoLanzamiento >= hoy ? `Lanzala a más tardar el ${fechaCorta(ultimoLanzamiento)} o acortá el plazo para elegir.` : "Acortá el plazo para elegir o el aviso no alcanza: ya es tarde para esta ventana."),
        });
    }
    else if (diasHasta(hoy, ultimoLanzamiento) <= 7) {
        alertas.push({ nivel: "aviso", codigo: "justo", mensaje: `Queda poco margen: el último día para lanzarla y otorgar en término es el ${fechaCorta(ultimoLanzamiento)}.` });
    }
    // Lo que elige la persona no espera el aviso (23/11/2026): ya no hay un «primer inicio» recortado para todos.
    return alertas;
}
export function erroresDePropuesta(o) {
    const errores = [];
    const tramos = o.tramos || [];
    if (tramos.length === 0)
        return [{ codigo: "sin_tramos", mensaje: "Elegí al menos un tramo." }];
    const desdeMinimo = primerInicioPropuesto(o.hoy);
    const diasDeInicio = normalizarDiasDeInicio(o.diasDeInicio);
    tramos.forEach((t, i) => {
        const n = tramos.length > 1 ? ` ${i + 1}` : "";
        if (!esISO(t.desde) || !esISO(t.hasta) || t.hasta < t.desde) {
            errores.push({ codigo: "fechas", tramo: i, mensaje: `El tramo${n} no tiene fechas válidas.` });
            return;
        }
        if (t.desde < o.ventana.desde || t.hasta > o.ventana.hasta)
            errores.push({ codigo: "ventana", tramo: i, mensaje: `El tramo${n} se sale de la ventana (${fechaCorta(o.ventana.desde)} al ${fechaCorta(o.ventana.hasta)}).` });
        else if (o.ventanaPersona && !rangoPermitido(t.desde, t.hasta, o.ventanaPersona))
            errores.push({ codigo: "ventana_persona", tramo: i, mensaje: `El tramo${n} se sale de tu ventana de goce (${textoDeVentana(o.ventanaPersona)}).` });
        if (t.desde < desdeMinimo)
            errores.push({ codigo: "ya_empezo", tramo: i, mensaje: `El tramo${n} ya empezó o empieza hoy: puede empezar desde el ${fechaCorta(desdeMinimo)}.` });
        if (!puedeEmpezar(t.desde, diasDeInicio))
            errores.push({ codigo: "dia_inicio", tramo: i, mensaje: `El tramo${n} empieza un ${DIAS_DE_LA_SEMANA[diaDeSemana(t.desde)]}: las vacaciones pueden empezar sólo ${textoDiasDeInicio(diasDeInicio)}.` });
    });
    // Fraccionar: en orden de fecha, cada tramo con el mínimo o, si quedan menos, con todos los que quedan.
    if (tramos.length > 1) {
        if (o.diasDisponibles < o.minPorTramo) {
            errores.push({ codigo: "no_fraccionar", tramos: tramos.map((_, i) => i), mensaje: `Con ${o.diasDisponibles} día(s) no se puede fraccionar: van todos seguidos, en un solo tramo (cada tramo tiene que tener al menos ${o.minPorTramo}).` });
        }
        else {
            const enOrden = tramos.map((t, i) => ({ t, i })).filter(({ t }) => esISO(t.desde) && esISO(t.hasta) && t.hasta >= t.desde).sort((a, b) => a.t.desde.localeCompare(b.t.desde));
            let quedan = o.diasDisponibles;
            for (const { t, i } of enOrden) {
                const dias = contarDiasTramo(t, o.diasCorridos);
                const minimo = Math.min(o.minPorTramo, Math.max(0, quedan));
                if (dias < minimo) {
                    errores.push(minimo === o.minPorTramo
                        ? { codigo: "minimo", tramo: i, mensaje: `El tramo ${i + 1} tiene menos de ${o.minPorTramo} días: al fraccionar, cada parte tiene que tener al menos ${o.minPorTramo} (sólo la última puede ser más corta, si quedan menos).` }
                        : { codigo: "resto_junto", tramo: i, mensaje: `El tramo ${i + 1} tiene ${dias} día(s) y quedan ${quedan}: con menos de ${o.minPorTramo} van todos juntos, en el último tramo.` });
                }
                quedan -= dias;
            }
        }
    }
    for (let i = 0; i < tramos.length; i++)
        for (let j = i + 1; j < tramos.length; j++)
            if (sePisan(tramos[i], tramos[j]))
                errores.push({ codigo: "se_pisan", tramos: [i, j], mensaje: `Los tramos ${i + 1} y ${j + 1} se pisan.` });
    const suma = tramos.reduce((s, t) => s + (esISO(t.desde) && esISO(t.hasta) ? contarDiasTramo(t, o.diasCorridos) : 0), 0);
    if (suma !== o.diasDisponibles)
        errores.push(suma < o.diasDisponibles ? { codigo: "faltan", mensaje: `Te faltan repartir ${o.diasDisponibles - suma} día(s): tenés ${o.diasDisponibles}.` } : { codigo: "sobran", mensaje: `Te pasaste por ${suma - o.diasDisponibles} día(s): tenés ${o.diasDisponibles}.` });
    return errores;
}
/** Los mensajes de `erroresDePropuesta`, en castellano; vacío = está bien. Es lo que valida el server. */
export function validarPropuesta(o) {
    return erroresDePropuesta(o).map((e) => e.mensaje);
}
/** Los errores que apuntan a un tramo: para mostrarlos donde se está eligiendo ese tramo. */
export const erroresDelTramo = (errores, i) => errores.filter((e) => e.tramo === i || !!e.tramos?.includes(i));
/**
 * CUÁNTOS DÍAS TIENE QUE TENER, COMO MÍNIMO, EL TRAMO QUE EMPIEZA EN `desde`, dados los otros tramos ya elegidos
 * (la misma cuenta que `erroresDePropuesta`, para avisarlo en el calendario antes de confirmar): en orden de
 * fecha, el mínimo configurado o, si antes de él ya se repartió casi todo, los que quedan. 0 cuando no hay
 * mínimo que avisar: sin otros tramos (no se fracciona) o sin fecha de inicio.
 */
export function minimoDelTramo(o) {
    const otros = (o.otros || []).filter((t) => esISO(t.desde) && esISO(t.hasta) && t.hasta >= t.desde);
    if (otros.length === 0 || !esISO(o.desde))
        return 0;
    if (o.diasDisponibles < o.minPorTramo)
        return Math.max(0, o.diasDisponibles);
    const antes = otros.filter((t) => t.desde < o.desde).reduce((s, t) => s + contarDiasTramo(t, o.diasCorridos), 0);
    return Math.min(o.minPorTramo, Math.max(0, o.diasDisponibles - antes));
}
/**
 * AL OTORGAR: el goce tiene que estar dentro de la ventana. El aviso de `avisoDias` sólo cuando las fechas las
 * ASIGNA la empresa (`porLaEmpresa`: venció el plazo para elegir): el aviso por escrito sale hoy y tiene que
 * llegar. Lo que propuso la persona se aprueba aunque falten menos días (regla del usuario, 23/11/2026); sólo no
 * puede haber empezado. Devuelve los errores; vacío = se puede otorgar.
 */
export function validarOtorgamiento(o) {
    const errores = [];
    const faltan = diasHasta(o.hoy, o.desde);
    if (!o.porLaEmpresa && !(faltan >= 0))
        errores.push(`Empezaba el ${fechaCorta(o.desde)} y ya pasó: hay que proponer otras fechas.`);
    if (o.porLaEmpresa && !(faltan >= o.avisoDias))
        errores.push(`El aviso no llega: empieza el ${fechaCorta(o.desde)} y hay que avisar con ${o.avisoDias} días (hoy faltan ${Math.max(0, faltan || 0)}). Mové el inicio al ${fechaCorta(primerInicioPosible(o.hoy, o.avisoDias))} o después.`);
    if (o.hasta > o.ventana.hasta)
        errores.push(`Termina el ${fechaCorta(o.hasta)}, después del cierre de la ventana (${fechaCorta(o.ventana.hasta)}).`);
    if (o.desde < o.ventana.desde)
        errores.push(`Empieza el ${fechaCorta(o.desde)}, antes de que abra la ventana (${fechaCorta(o.ventana.desde)}).`);
    return errores;
}
/* ─────────────────────────── Lo que asigna la empresa ─────────────────────────── */
/**
 * EL TRAMO ÚNICO QUE SUGIERE EL SISTEMA para quien no eligió: el primero, desde `desdeMinimo` (hoy +
 * aviso), que entra entero en la ventana (la de la campaña y la de la persona) y no toca ningún día
 * bloqueado (topes de solapamiento del área, otras vacaciones). Continuo siempre: la empresa no
 * fracciona sin acuerdo. `null` si no entra en ningún lado.
 */
export function sugerirTramoUnico(o) {
    if (!(o.dias > 0))
        return null;
    const bloqueadas = new Set(o.bloqueadas || []);
    let desde = o.desdeMinimo > o.ventana.desde ? o.desdeMinimo : o.ventana.desde;
    for (let guarda = 0; guarda < 400 && desde <= o.ventana.hasta; guarda++, desde = sumarDias(desde, 1)) {
        // Con días hábiles, el tramo arranca un día hábil: empezar un sábado «regala» el fin de semana.
        if (!o.diasCorridos && [0, 6].includes(diaDeSemana(desde)))
            continue;
        // Empieza en uno de los días de inicio de la campaña, como lo que elige la persona.
        if (!puedeEmpezar(desde, o.diasDeInicio))
            continue;
        const hasta = hastaParaDias(desde, o.dias, o.diasCorridos);
        if (hasta > o.ventana.hasta)
            return null;
        if (o.ventanaPersona && !rangoPermitido(desde, hasta, o.ventanaPersona))
            continue;
        let libre = true;
        for (let i = 0, total = diasEntre(desde, hasta); i < total; i++) {
            if (bloqueadas.has(sumarDias(desde, i))) {
                libre = false;
                break;
            }
        }
        if (libre)
            return { desde, hasta };
    }
    return null;
}
export const ETIQUETA_ESTADO = {
    pendiente_de_invitar: "Sin invitar",
    invitado: "Invitado",
    acuso_recibo: "Acusó recibo",
    propuso_fechas: "Propuso fechas",
    rechazada: "Propuesta rechazada",
    aprobado_notificado: "Otorgadas y notificadas",
    vencido_sin_definir: "Venció sin elegir",
    asignado_por_empresa_notificado: "Asignadas por la empresa",
    sin_dias_pendientes: "Sin días pendientes",
    retirada: "Fuera de la campaña",
    en_curso: "De vacaciones",
    gozado: "Gozadas",
};
/** Los estados en que la persona todavía puede elegir (y en que la tarjeta de la app está viva). */
export const PUEDE_PROPONER = ["invitado", "acuso_recibo", "rechazada"];
/** Los estados ya otorgados: hubo aviso por escrito. */
export const OTORGADOS = ["aprobado_notificado", "asignado_por_empresa_notificado"];
/** Los que ya no deben nada: otorgados con aviso, o sin días que otorgar. La campaña cierra sólo si todos están acá. */
export const RESUELTOS = [...OTORGADOS, "sin_dias_pendientes", "retirada"];
/** «En curso» o «gozado» según las fechas otorgadas; si no, el estado guardado. */
export function estadoVisible(estado, otorgados, hoy) {
    if (!OTORGADOS.includes(estado) || otorgados.length === 0)
        return estado;
    const inicio = otorgados.reduce((m, t) => (t.desde < m ? t.desde : m), otorgados[0].desde);
    const fin = otorgados.reduce((m, t) => (t.hasta > m ? t.hasta : m), otorgados[0].hasta);
    if (hoy > fin)
        return "gozado";
    if (hoy >= inicio)
        return "en_curso";
    return estado;
}
/**
 * LAS ALERTAS DE SEGUIMIENTO DE UNA PERSONA: no acusó recibo, la fecha límite está por vencer, o lo que
 * propuso empieza pronto y todavía no se aprobó. El aviso de `avisoDias` no se mide acá: lo propuesto por la
 * persona no lo necesita (23/11/2026).
 */
export function alertasDeInvitacion(o) {
    const alertas = [];
    const faltan = diasHasta(o.hoy, o.fechaLimite);
    if (PUEDE_PROPONER.includes(o.estado)) {
        if (!o.acuseInvitacionAt && o.invitadoAt)
            alertas.push({ nivel: "aviso", codigo: "sin_acuse", mensaje: "No acusó recibo de la invitación." });
        if (faltan >= 0 && faltan <= 2)
            alertas.push({ nivel: "aviso", codigo: "limite_por_vencer", mensaje: faltan === 0 ? "La fecha límite vence hoy." : `La fecha límite vence en ${faltan} día(s).` });
    }
    if (o.estado === "propuso_fechas" && o.tramos?.length) {
        const inicio = o.tramos.reduce((m, t) => (t.desde < m ? t.desde : m), o.tramos[0].desde);
        const faltan = diasHasta(o.hoy, inicio);
        if (faltan < 0)
            alertas.push({ nivel: "error", codigo: "empezo_sin_aprobar", mensaje: `Lo propuesto empezaba el ${fechaCorta(inicio)} y no se aprobó: tiene que proponer otras fechas.` });
        else if (faltan <= 7)
            alertas.push({ nivel: "aviso", codigo: "empieza_pronto", mensaje: `Lo propuesto empieza el ${fechaCorta(inicio)} (${faltan === 0 ? "hoy" : `en ${faltan} día(s)`}) y todavía no está aprobado.` });
    }
    return alertas;
}
/** De la más antigua a la más nueva; a igual antigüedad, la de ingreso más viejo y después por nombre. */
export function ordenarPorAntiguedad(miembros) {
    return [...miembros].sort((a, b) => b.antiguedadDias - a.antiguedadDias || String(a.ingreso || "9999").localeCompare(String(b.ingreso || "9999")) || a.nombre.localeCompare(b.nombre, "es"));
}
/** Los turnos de un grupo: uno por persona, en orden de antigüedad. Un grupo de una sola persona no tiene turnos. */
export function armarTurnos(o) {
    const out = new Map();
    if (o.miembros.length < 2)
        return out;
    const orden = ordenarPorAntiguedad(o.miembros);
    const paso = Math.max(1, Math.round(o.diasPorTurno || 1));
    orden.forEach((m, k) => {
        const calculado = sumarDias(o.base, k * paso);
        const recortado = !!o.fechaLimite && calculado > o.fechaLimite;
        out.set(m.invitacionId, {
            grupo: o.grupo,
            reglaId: o.reglaId,
            regla: o.regla,
            orden: k + 1,
            de: orden.length,
            base: o.base,
            diasPorTurno: paso,
            desde: recortado ? o.fechaLimite : calculado,
            delante: orden.slice(0, k).map((x) => x.invitacionId),
            recortado,
        });
    });
    return out;
}
/**
 * ¿Ya puede elegir? Con varios grupos (varias reglas), tiene que estar abierto en todos. `yaEligio`: si la
 * invitación de adelante ya no está esperando para elegir (propuso, se le otorgó, venció…).
 */
export function estadoDelTurno(turnos, hoy, yaEligio) {
    const lista = turnos || [];
    if (lista.length === 0)
        return { abierto: true, desde: null, esperando: 0, orden: null, de: null, regla: null };
    let abierto = true;
    let esperando = 0;
    let peor = lista[0];
    for (const t of lista) {
        const faltan = t.delante.filter((id) => !yaEligio(id)).length;
        const abiertoAca = hoy >= t.desde || faltan === 0;
        if (!abiertoAca)
            abierto = false;
        esperando = Math.max(esperando, abiertoAca ? 0 : faltan);
        if (t.desde > peor.desde)
            peor = t;
    }
    return { abierto, desde: peor.desde, esperando, orden: peor.orden, de: peor.de, regla: peor.regla };
}

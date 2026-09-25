/**
 * ═══════════════════════════════════════════════════════════════════════
 * EL PLAN DE UN LOTE: qué solicitud sale de cada integrante de una plantilla de equipo
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Es el corazón del alta masiva y es PURO: recibe la plantilla, las fechas de esta contratación, lo que
 * se pisó sólo esta vez y todo lo que hace falta saber de la base (el `Contexto`), y devuelve por
 * integrante sus jornadas, sus cuatro importes, sus errores y sus advertencias, más los `DatosSolicitud`
 * con los que se arma el payload. Lo usan igual `preview` (no escribe) y `contratar` (escribe si no hay
 * errores): por eso los dos no pueden diferir.
 *
 * LAS REGLAS SON LAS DEL FORMULARIO INDIVIDUAL (`UserRegistrationModal.handleSubmit`), una por una:
 * persona, roles, categoría (salvo servicios), área y turno, tipo de contrato (por puesto), tope de horas del
 * contrato, importe de servicios, convenio, categoría del convenio, reemplazo con reemplazado y motivo,
 * errores de jornadas. Y el cálculo es el mismo módulo (`compartido/jornadas.ts`). Lo único nuevo:
 *  - la persona tiene que existir y estar activa (en el individual se elige de una lista que ya filtra),
 *  - la persona reemplazada tiene que ser del equipo del proyecto (el individual sólo ofrece esos),
 *  - el aviso de que la escala cambió desde que se fijó a mano el importe de alguien.
 *
 * ERRORES frenan la contratación entera (el lote es todo o nada). ADVERTENCIAS se muestran y no frenan.
 */
import { derivarImportes, erroresDeJornadas, importePorJornada, jornadasCalculadasDelPedido, mesesEquivalentes, periodoDeCalculo } from "../compartido/jornadas.js";
export const MAX_INTEGRANTES_POR_LOTE = 50;
/** "HH:MM" a horas (cruza la medianoche). `null` si no se entiende. Igual que `horasDelHorario` del formulario. */
const horasDelHorario = (entrada, salida) => {
    const a = /^(\d{1,2}):(\d{2})/.exec(entrada || "");
    const b = /^(\d{1,2}):(\d{2})/.exec(salida || "");
    if (!a || !b)
        return null;
    let min = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
    if (min <= 0)
        min += 1440;
    return min / 60;
};
/** 0 = domingo … 6 = sábado, del día "YYYY-MM-DD" (en UTC, sin que la zona horaria corra el día). */
const diaDeSemana = (f) => new Date(`${f}T12:00:00Z`).getUTCDay();
const pesos = (n) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function planDeLote(plantilla, integrantes, contratacion, puntuales, ctx) {
    // La persona de cada puesto: la elegida para esta vez o, si no, la del equipo.
    // Puede ser la misma en dos puestos: no es error. Si se pisan, lo avisa `superposiciones` (origen «lote»).
    const personaDelPuesto = (integ) => puntuales[integ._id]?.userId || integ.userId || "";
    const filas = integrantes.map((original) => {
        const p = puntuales[original._id] || {};
        const integ = { ...original, userId: personaDelPuesto(original) };
        const sinPersona = !integ.userId;
        const persona = sinPersona ? undefined : ctx.personas.get(integ.userId);
        const nombre = sinPersona ? "Puesto sin asignar" : persona?.nombre || "Persona no encontrada";
        const errores = [];
        const advertencias = [];
        // ── El tipo de contrato de este puesto (o el de la plantilla, si es vieja) ──
        const propio = !!integ.contratoId;
        const contratoId = String((propio ? integ.contratoId : plantilla.contratoId) || "");
        const nombreContrato = (propio ? integ.nombreContrato : plantilla.nombreContrato) || "";
        const tipoImpositivo = (propio ? integ.tipoImpositivo : plantilla.tipoImpositivo) || "";
        const contrato = contratoId ? ctx.contratos.get(contratoId) : undefined;
        const porDiasSueltos = contrato?.modoFechas === "dias";
        const indeterminado = !!contrato?.esTiempoIndeterminado;
        const esServicios = tipoImpositivo === "constancia_cuit";
        const multiplicador = Number(contrato?.multiplicadorDiario) > 0 ? Number(contrato.multiplicadorDiario) : 1;
        const limiteHoras = contrato?.horasPorJornada ?? null;
        const inTime = p.inTime || integ.inTime || "";
        const outTime = p.outTime || integ.outTime || "";
        const areaShiftAssignments = integ.areaId && integ.shiftId ? [{ areaId: String(integ.areaId), shiftIds: [String(integ.shiftId)] }] : [];
        const categoriaSatId = esServicios ? "" : p.categoriaSatId || integ.categoriaSatId || "";
        const categoria = categoriaSatId ? ctx.categorias.get(categoriaSatId) : undefined;
        // ── Las fechas de esta persona ──
        const fechasSueltas = porDiasSueltos ? [...new Set((p.fechas?.length ? p.fechas : contratacion.fechas) || [])].sort() : [];
        const desde = porDiasSueltos ? fechasSueltas[0] || "" : contratacion.desde || "";
        const hasta = porDiasSueltos ? fechasSueltas[fechasSueltas.length - 1] || "" : indeterminado ? "" : contratacion.hasta || "";
        const diasSemana = porDiasSueltos ? [...new Set(fechasSueltas.map(diaDeSemana))].sort((a, b) => a - b) : integ.diasSemana || [];
        const diasPorSemana = porDiasSueltos ? diasSemana.length : Number(integ.diasPorSemana) || diasSemana.length;
        const rotativos = porDiasSueltos ? false : !!integ.diasRotativos;
        // Igual que el formulario individual: `periodoDeCalculo` con el `indeterminado` del contrato, y las
        // jornadas con la regla compartida.
        const periodo = periodoDeCalculo(desde, hasta, indeterminado);
        const calculadas = jornadasCalculadasDelPedido({ porDiasSueltos, fechas: fechasSueltas, rotativos, desde: periodo.desde, hasta: periodo.hasta, dias: diasSemana });
        const jornadas = rotativos ? Number(p.jornadas) || Number(contratacion.jornadasRotativos) || 0 : calculadas || 0;
        // ── Lo que se paga por jornada ──
        const escala = categoria ? importePorJornada(categoria.neto, multiplicador) : 0;
        let dailyRate = 0;
        let origenImporte = "escala";
        if (p.dailyRate != null && Number(p.dailyRate) > 0) {
            dailyRate = Number(p.dailyRate);
            origenImporte = "puntual";
        }
        else if (integ.dailyRateManual != null && Number(integ.dailyRateManual) > 0) {
            dailyRate = Number(integ.dailyRateManual);
            origenImporte = "plantilla";
            // La escala cambió desde que alguien fijó este importe a mano: se avisa, no se pisa.
            if (!esServicios && categoria && integ.escalaAlFijar != null && Number(integ.escalaAlFijar) !== escala) {
                advertencias.push(`La escala de su categoría cambió desde que se fijó su importe: antes ${pesos(Number(integ.escalaAlFijar))}, ahora ${pesos(escala)}. Se paga el fijado, ${pesos(dailyRate)}.`);
            }
        }
        else if (esServicios) {
            origenImporte = "servicios";
        }
        else {
            dailyRate = escala;
        }
        const mesesEq = mesesEquivalentes(periodo.desde, periodo.hasta, diasSemana);
        const importes = derivarImportes({ ancla: null, jornada: dailyRate > 0 ? dailyRate : null, mesesEq, jornadas, diasSemana: diasPorSemana });
        // ── Las reglas del formulario individual ──
        if (sinPersona)
            errores.push("Falta la persona del puesto: elegila o excluí el puesto.");
        else if (!persona)
            errores.push("La persona no existe (se borró).");
        else if (persona.esSolicitud)
            errores.push("No es una persona registrada: es una solicitud de alta.");
        else if (!persona.activo)
            errores.push("La persona está inactiva.");
        if (integ.rolesFrame.length === 0)
            errores.push("Falta el rol empresa.");
        if (!esServicios && !categoriaSatId)
            errores.push("Falta la categoría (a completar).");
        if (!areaShiftAssignments.length)
            errores.push("El puesto no tiene área y turno.");
        if (!contratoId && ctx.hayContratos)
            errores.push("El puesto no tiene tipo de contrato.");
        else if (contratoId && !contrato && ctx.hayContratos)
            errores.push("El tipo de contrato del puesto ya no existe.");
        const horas = horasDelHorario(inTime, outTime);
        if (!inTime || !outTime)
            errores.push("El puesto no tiene horario.");
        else if (limiteHoras != null && horas != null && horas > limiteHoras)
            errores.push(`El horario suma ${horas.toLocaleString("es-AR", { maximumFractionDigits: 2 })} h y «${nombreContrato || "el contrato"}» admite hasta ${limiteHoras} h por jornada.`);
        if (esServicios && !(dailyRate > 0))
            errores.push("Es un servicio: hay que cargar el importe por jornada a mano.");
        if (!esServicios && ctx.hayConvenios && !plantilla.convenioId)
            errores.push("La plantilla no tiene convenio.");
        if (!esServicios && categoriaSatId && !categoria)
            errores.push("La categoría ya no existe (a completar).");
        if (!esServicios && categoria && ctx.convenioCct && categoria.convenio && categoria.convenio !== ctx.convenioCct)
            errores.push(`La categoría «${categoria.nombre}» es del convenio ${categoria.convenio} y el alta va por el ${ctx.convenioCct} (a completar).`);
        if (p.isReplacement) {
            if (!p.replacedUserId)
                errores.push("Marcaste que es un reemplazo: falta a quién reemplaza.");
            else if (!ctx.equipo.has(p.replacedUserId))
                errores.push("La persona reemplazada no es del equipo del proyecto.");
            else if (p.replacedUserId === integ.userId)
                errores.push("No puede reemplazarse a sí misma.");
            if (!p.motivoReemplazoId && ctx.motivos.size > 0)
                errores.push("Falta el motivo del reemplazo.");
            else if (p.motivoReemplazoId && ctx.motivos.size > 0 && !ctx.motivos.has(p.motivoReemplazoId))
                errores.push("El motivo del reemplazo no es válido.");
        }
        if (porDiasSueltos) {
            if (fechasSueltas.length === 0)
                errores.push("Elegí al menos un día.");
        }
        else {
            const e = erroresDeJornadas({ desde: periodo.desde, hasta: periodo.hasta, diasPorSemana: String(diasPorSemana || ""), dias: diasSemana, rotativos, jornadas: jornadas ? String(jornadas) : "", calculadas, ajustado: false, motivo: "", nota: "" });
            if (!contratacion.desde)
                errores.push("Falta la fecha de inicio.");
            else if (!indeterminado && !contratacion.hasta)
                errores.push("Falta la fecha de fin.");
            for (const m of Object.values(e))
                if (m)
                    errores.push(m);
        }
        const sup = ctx.superposiciones.get(integ._id) || [];
        for (const s of sup)
            advertencias.push(s.mensaje);
        const datos = persona
            ? {
                fullName: persona.nombre,
                projectIds: [plantilla.projectId],
                solicitudUserId: integ.userId,
                roleFrameIds: integ.rolesFrame,
                esServicios,
                categoriaSatId: categoriaSatId || undefined,
                startDate: desde,
                dueDate: hasta,
                indeterminado,
                porDiasSueltos,
                workdaysCount: jornadas,
                workdaysCalculated: calculadas,
                ajusteJornadas: false,
                diasPorSemana,
                diasSemana,
                diasRotativos: rotativos,
                fechasTrabajadas: fechasSueltas,
                inTime,
                outTime,
                empresaContratoId: plantilla.empresaContratoId,
                convenioId: plantilla.convenioId,
                dailyRate,
                isReplacement: !!p.isReplacement,
                empleado_id_reemplezado: p.empleado_id_reemplezado,
                replacedUserId: p.replacedUserId,
                motivoReemplazoId: p.motivoReemplazoId,
                comentarios: p.comentarios ?? (integ.comentarios || plantilla.comentarios || ""),
                tipoImpositivo,
                contratoId,
                nombreContrato,
                areaShiftAssignments,
            }
            : null;
        return {
            integranteId: integ._id,
            userId: integ.userId,
            nombre,
            excluido: !!p.excluido,
            categoriaSatId,
            categoriaNombre: categoria?.nombre || "",
            inTime,
            outTime,
            jornadas,
            importes,
            origenImporte,
            // Excluido esta vez: no se valida, no sale, no suma.
            errores: p.excluido ? [] : errores,
            advertencias: p.excluido ? [] : advertencias,
            superposicionHorario: !p.excluido && sup.some((s) => s.tipo === "horario"),
            datos,
        };
    });
    const incluidas = filas.filter((f) => !f.excluido);
    const totales = {
        personas: incluidas.length,
        jornadas: incluidas.reduce((s, f) => s + f.jornadas, 0),
        importe: Number(incluidas.reduce((s, f) => s + (f.importes.total ?? 0), 0).toFixed(2)),
        conErrores: incluidas.filter((f) => f.errores.length > 0).length,
        conAdvertencias: incluidas.filter((f) => f.advertencias.length > 0).length,
    };
    return { filas, totales };
}
/** Qué impide contratar el lote entero (además de los errores de cada fila). */
export function erroresDelLote(plan) {
    const e = [];
    if (plan.totales.personas === 0)
        e.push("No hay nadie para contratar: están todos excluidos.");
    if (plan.totales.personas > MAX_INTEGRANTES_POR_LOTE)
        e.push(`Son ${plan.totales.personas} personas y el máximo por contratación es ${MAX_INTEGRANTES_POR_LOTE}.`);
    if (plan.totales.conErrores > 0)
        e.push(`${plan.totales.conErrores} ${plan.totales.conErrores === 1 ? "integrante tiene" : "integrantes tienen"} errores.`);
    return e;
}

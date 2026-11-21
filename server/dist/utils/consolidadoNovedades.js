/**
 * EL CONSOLIDADO DE NOVEDADES (20/11/2026): las cinco hojas que sirven para liquidar, SIN BASE.
 *
 * Reemplaza al «Exportar Detalle Diario» del reporte, que emitía una fila por persona y día del período
 * (5.301 filas para LN+ en noviembre, 3.980 «Sin Registro»). Acá sale sólo lo que tiene algo que decir, y
 * lo que no se sabe se dice que no se sabe. Las reglas las confirmó el usuario el 20/11:
 *
 *  - UN DÍA SIN PARTE no es una sola cosa. Según los días asignados en el contrato que rige ese día:
 *      no le correspondía trabajar → no hay fila;  le correspondía → «Falta parte» (y A revisar);
 *      contrato de días rotativos o sin días cargados → NO se infiere (ni del turno: los turnos tienen
 *      los 7 días y daban 387 «Falta parte» falsos, domingos incluidos): una línea «Días no evaluables».
 *  - UNA PERSONA SIN NINGÚN PARTE EN EL PERÍODO no llena el detalle con 25 «Falta parte»: una sola
 *    alerta («Sin ningún parte en el mes»). El dato es «nadie cargó nada».
 *  - Un parte de alguien SIN CONTRATO que cubra ese día: estado «Sin contrato vigente» (lo que el parte
 *    dijo va en el motivo) y A revisar. Sin parte y sin contrato no se emite nada.
 *  - LAS JORNADAS (contratos con `fechas_trabajadas`) de una misma persona, tipo, empresa, categoría y
 *    valor son UNA fila del resumen (Leonardo Aquino tenía 14 contratos en el mes); las fechas quedan en
 *    el detalle. Los demás tipos: una fila por contrato.
 *  - CONTRATOS DUPLICADOS exactos (misma alta, baja y tipo): se muestra uno y se avisa.
 *  - El COMENTARIO es del parte, no de la persona: va en la hoja Partes, una vez.
 *  - El estado nunca queda vacío; si no aplica ninguna regla, «Sin determinar» con el motivo al lado.
 *
 * LO QUE NO SE HACE ACÁ: el reparto de las extras entre 50% y 100% y los importes. El glosario de rangos
 * vive en el navegador de quien exporta (`overtimeUtils`), así que cada fila del detalle lleva las extras
 * CRUDAS (total, reparto guardado, horas reales, horario del turno) y el navegador reparte con la misma
 * función de siempre. Pendiente anotado: ese cálculo tiene que terminar en el server con el glosario
 * como dato.
 *
 * «Otros Presentes»: 40 registros de noviembre tienen ese motivo con estado Ausente y el tipo ya no
 * existe en el catálogo. Si para liquidación son jornadas trabajadas, lo decide liquidaciones (pendiente
 * al 20/11): mientras tanto cuentan como ausencia en «Otro motivo» y van a A revisar como «Motivo fuera
 * del catálogo», con las fechas, para que lo vean. Cuando lo decidan, la equivalencia va acá con su
 * comentario: es un valor histórico que nadie puede volver a crear.
 */
export const OTRO_MOTIVO = "Otro motivo";
const SIN_FIN = "9999-12-31";
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
export const diaDeSemana = (f) => new Date(`${f}T00:00:00Z`).getUTCDay();
export const diaCorto = (f) => DIAS[diaDeSemana(f)];
const ddmm = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
export const esJornada = (c) => c.fechasTrabajadas.length > 0;
/**
 * Mensualizado = lo que va en la planilla de liquidación por empresa: Tiempo indeterminado y Plazo fijo (5x7, 6x6).
 * Por NOMBRE del tipo y en lista blanca: un «Servicios Adicional» de un día sin fechas cargadas no es jornada
 * para `esJornada`, pero tampoco es un sueldo mensual (con la lista negra aparecían 39 filas de más).
 * Los jornaleros (Servicios, Jornada, Eventual) tienen su propia planilla.
 */
export const esMensualizado = (tipo) => /tiempo indeterminado|plazo fijo/i.test(tipo);
const diaSiguiente = (f) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
/** Horas entre dos «HH:mm»; una salida anterior a la entrada cruza la medianoche. 0 si falta alguna. */
export const horasEntre = (entrada, salida) => {
    if (!/^\d{2}:\d{2}$/.test(entrada) || !/^\d{2}:\d{2}$/.test(salida))
        return 0;
    const [h1, m1] = entrada.split(":").map(Number), [h2, m2] = salida.split(":").map(Number);
    let h = h2 + m2 / 60 - (h1 + m1 / 60);
    if (h <= 0)
        h += 24;
    return Math.round(h * 100) / 100;
};
/** El motivo del catálogo que son vacaciones. Por nombre, porque el catálogo es del tenant («Vacaciones»). */
const esVacaciones = (motivo) => /vacacion/i.test(motivo);
const cubre = (c, d) => c.alta <= d && (c.baja || SIN_FIN) >= d;
const tocaPeriodo = (c, desde, hasta) => c.alta <= hasta && (!c.baja || c.baja >= desde);
const estadoDelParte = (status) => (status === "present" ? "Presente" : status === "late" ? "Tardanza" : "Ausente");
/** Si a la persona le correspondía trabajar ese día según el contrato. No se infiere del turno. */
export function leCorresponde(c, d) {
    if (c.fechasTrabajadas.length)
        return c.fechasTrabajadas.includes(d) ? "si" : "no";
    if (c.rotativo)
        return "rotativo";
    if (c.diasSemana.length)
        return c.diasSemana.includes(diaDeSemana(d)) ? "si" : "no";
    return "sin_dias";
}
/** Cuánto dice un contrato (área, turno, sueldos, días): para elegir entre dos que empatan. */
const datosDe = (x) => [x.area, x.turno, x.sueldoJornada, x.sueldoMano, x.diasSemana.length || x.fechasTrabajadas.length].filter(Boolean).length;
/**
 * Entre los contratos que cubren el día: el abierto manda; si no, el de alta más reciente. A igual alta, el
 * que más dice (Aguinaga: dos indeterminados del 01/06/2023, uno con área, turno y días y otro vacío; si
 * regía el vacío, la fila salía «Sin área»).
 */
export function contratoQueRige(contratos, d) {
    const vivos = contratos.filter((c) => cubre(c, d));
    if (!vivos.length)
        return null;
    const masReciente = (xs) => xs.reduce((m, a) => (a.alta > m.alta || (a.alta === m.alta && datosDe(a) > datosDe(m)) ? a : m));
    const abiertos = vivos.filter((c) => !c.baja);
    return abiertos.length ? masReciente(abiertos) : masReciente(vivos);
}
export function consolidarNovedades(e) {
    const { desde, hasta } = e;
    const persona = new Map(e.personas.map((p) => [p.id, p]));
    const nombreDe = (id) => persona.get(id)?.nombre || `(persona ${id})`;
    const cuilDe = (id) => persona.get(id)?.cuil || "";
    const legajoDe = (id) => persona.get(id)?.legajo || "";
    const feriado = new Map(e.feriados.map((f) => [f.fecha, f.nombre]));
    const revisar = [];
    // Contratos por persona y proyecto, sin duplicados exactos que toquen el período.
    const contratosDe = new Map();
    for (const c of e.contratos) {
        if (!ES_FECHA.test(c.alta))
            continue;
        const k = `${c.personaId}|${c.proyectoId}`;
        const lista = contratosDe.get(k) || contratosDe.set(k, []).get(k);
        // Por NOMBRE de tipo cuando lo hay: el importado de FRAME y el cargado en la app traen ids distintos para el mismo «Tiempo Indeterminado».
        const mismoTipo = (x) => (c.tipo && x.tipo ? x.tipo === c.tipo : x.tipoId === c.tipoId);
        const duplicadoDe = c.alta !== c.baja && tocaPeriodo(c, desde, hasta) ? lista.findIndex((x) => x.alta === c.alta && x.baja === c.baja && mismoTipo(x)) : -1;
        if (duplicadoDe >= 0) {
            revisar.push({ tipo: "Contrato duplicado", colaborador: nombreDe(c.personaId), cuil: cuilDe(c.personaId), fecha: `${ddmm(c.alta)}${c.baja ? ` al ${ddmm(c.baja)}` : " (abierto)"}`, detalle: `Dos contratos ${c.tipo || "del mismo tipo"} idénticos (misma alta, baja y tipo) en ${c.proyecto}: se muestra uno.` });
            // Se queda el que más dice: si el que ya estaba no tiene área, turno o sueldo y éste sí, éste lo reemplaza.
            if (datosDe(c) > datosDe(lista[duplicadoDe]))
                lista[duplicadoDe] = c;
            continue;
        }
        lista.push(c);
    }
    // Registros por persona y día, y qué personas tienen algún parte.
    const registros = new Map();
    const conAlgunParte = new Set();
    for (const p of e.partes)
        for (const r of p.registros) {
            const k = `${r.personaId}|${p.proyectoId}|${p.fecha}`;
            (registros.get(k) || registros.set(k, []).get(k)).push({ parte: p, r });
            conAlgunParte.add(r.personaId);
        }
    // Días del período.
    const dias = [];
    for (let d = new Date(`${desde}T00:00:00Z`); d.toISOString().slice(0, 10) <= hasta; d.setUTCDate(d.getUTCDate() + 1))
        dias.push(d.toISOString().slice(0, 10));
    const resumen = new Map();
    const contratosDeLaFila = new Map();
    const filaResumen = (personaId, proyecto, c) => {
        const clave = c ? (esJornada(c) ? `${personaId}|${proyecto.id}|J|${c.tipoId || c.tipo}|${c.empresaId || c.empresa}|${c.categoriaId || c.categoria}|${c.sueldoJornada ?? ""}` : `${personaId}|${proyecto.id}|${c.key}`) : `${personaId}|${proyecto.id}|sin-contrato`;
        let f = resumen.get(clave);
        if (!f) {
            f = {
                clave,
                legajo: legajoDe(personaId),
                colaborador: nombreDe(personaId),
                cuil: cuilDe(personaId),
                empresa: c?.empresa || "",
                tipo: c ? c.tipo : "Sin contrato vigente",
                categoria: c?.categoria || "",
                centroCosto: proyecto.centroCosto,
                proyecto: proyecto.nombre,
                area: c?.area || "",
                turno: c?.turno || "",
                desde: c?.alta || "",
                hasta: c?.baja || "",
                contratos: c ? 1 : 0,
                jornadasTrabajadas: 0,
                jornadasPrevistas: c ? 0 : null,
                ausencias: 0,
                porMotivo: Object.fromEntries([...e.motivos, OTRO_MOTIVO].map((m) => [m, 0])),
                diasSinParte: 0,
                valorJornada: c?.sueldoJornada ?? null,
                sueldoMano: c && !esJornada(c) ? c.sueldoMano : null,
                valorHoraNoAplica: !!c && esJornada(c),
                extrasCrudas: 0,
                proyectoId: proyecto.id,
                apellido: persona.get(personaId)?.apellido || "",
                nombrePila: persona.get(personaId)?.nombrePila || "",
                grupo: c?.grupo ?? null,
                obraSocialCodigo: c?.obraSocialCodigo || "",
                obraSocialOrigen: c?.obraSocialOrigen || "",
                esJornada: !!c && esJornada(c),
                sinContrato: !c,
                mensualizado: !!c && esMensualizado(c.tipo),
                conAlgunParte: conAlgunParte.has(personaId),
                horasFeriado: 0,
                vacacionesCorridas: 0,
                reemplazos: 0,
            };
            resumen.set(clave, f);
        }
        if (c) {
            // Las jornadas agrupadas: cada contrato se cuenta una vez y el período de la fila los abarca a todos.
            const claves = contratosDeLaFila.get(clave) || contratosDeLaFila.set(clave, new Set()).get(clave);
            if (!claves.has(c.key)) {
                claves.add(c.key);
                f.contratos = claves.size;
                if (c.alta < f.desde)
                    f.desde = c.alta;
                if (!c.baja || !f.hasta)
                    f.hasta = f.hasta && c.baja ? f.hasta : (claves.size === 1 ? c.baja : "");
                else if (c.baja > f.hasta)
                    f.hasta = c.baja;
            }
        }
        return f;
    };
    const motivosFuera = new Map(); // `${personaId}|${motivo}` → fechas
    const noEvaluables = new Map();
    const faltaParte = new Map();
    const detalle = [];
    const personasYProyectos = new Set([...contratosDe.keys(), ...e.partes.flatMap((p) => p.registros.map((r) => `${r.personaId}|${p.proyectoId}`))]);
    const proyectoDe = new Map();
    for (const c of e.contratos)
        proyectoDe.set(c.proyectoId, { id: c.proyectoId, nombre: c.proyecto, centroCosto: c.centroCosto });
    for (const p of e.partes)
        if (!proyectoDe.has(p.proyectoId))
            proyectoDe.set(p.proyectoId, { id: p.proyectoId, nombre: p.proyecto, centroCosto: "" });
    for (const pp of personasYProyectos) {
        const [personaId, proyectoId] = pp.split("|");
        const proyecto = proyectoDe.get(proyectoId);
        const contratos = contratosDe.get(pp) || [];
        for (const d of dias) {
            const c = contratoQueRige(contratos, d);
            const rs = registros.get(`${pp}|${d}`) || [];
            const nombreFeriado = feriado.get(d) || "";
            if (rs.length) {
                for (const { parte, r } of rs) {
                    const f = filaResumen(personaId, proyecto, c);
                    let estado = estadoDelParte(r.status);
                    let motivo = r.motivo || (r.status === "late" ? "Tardanza" : r.status !== "present" && r.status !== "absent" ? r.status : "");
                    if (!c) {
                        revisar.push({ tipo: "Sin contrato vigente", colaborador: f.colaborador, cuil: f.cuil, fecha: ddmm(d), detalle: `Figura en el parte ${parte.numero} como ${estado}${r.motivo ? ` (${r.motivo})` : ""} y ningún contrato de ${proyecto.nombre} cubre ese día.` });
                        motivo = `El parte dice ${estado}${r.motivo ? ` (${r.motivo})` : ""}`;
                        estado = "Sin contrato vigente";
                    }
                    else if (leCorresponde(c, d) === "no" && estado !== "Ausente" && !motivo) {
                        motivo = "Día no asignado en el contrato";
                    }
                    if (estado === "Presente" || estado === "Tardanza")
                        f.jornadasTrabajadas += 1;
                    else if (estado === "Ausente") {
                        f.ausencias += 1;
                        if (r.motivo && e.motivos.includes(r.motivo))
                            f.porMotivo[r.motivo] += 1;
                        else {
                            f.porMotivo[OTRO_MOTIVO] += 1;
                            const k = `${personaId}|${r.motivo || "(sin motivo)"}`;
                            (motivosFuera.get(k) || motivosFuera.set(k, []).get(k)).push(d);
                        }
                    }
                    // Reemplazos: quién lo reemplazó, y a quién reemplaza esta persona en el mismo parte.
                    const partes = [];
                    if (r.reemplazanteId) {
                        partes.push(`Reemplazado por ${nombreDe(r.reemplazanteId)}`);
                        if (!contratoQueRige(contratosDe.get(`${r.reemplazanteId}|${proyectoId}`) || [], d))
                            revisar.push({ tipo: "Reemplazante sin contrato vigente", colaborador: nombreDe(r.reemplazanteId), cuil: cuilDe(r.reemplazanteId), fecha: ddmm(d), detalle: `Reemplaza a ${f.colaborador} en el parte ${parte.numero} y no tiene contrato de ${proyecto.nombre} ese día.` });
                    }
                    const reemplazaA = parte.registros.filter((x) => x.reemplazanteId === personaId).map((x) => nombreDe(x.personaId));
                    if (reemplazaA.length)
                        partes.push(`Reemplaza a ${reemplazaA.join(", ")}`);
                    // Horas: salida antes de la entrada (salvo que el turno cruce medianoche) y extras sin horas.
                    if (r.entradaReal && r.salidaReal && r.salidaReal < r.entradaReal) {
                        const cruza = (r.entradaPrevista && r.salidaPrevista && r.salidaPrevista < r.entradaPrevista) || r.entradaReal >= "18:00";
                        if (!cruza)
                            revisar.push({ tipo: "Salida anterior a la entrada", colaborador: f.colaborador, cuil: f.cuil, fecha: ddmm(d), detalle: `Entrada real ${r.entradaReal}, salida real ${r.salidaReal} (parte ${parte.numero}).` });
                    }
                    if (r.extras > 0 && (!r.entradaReal || !r.salidaReal))
                        revisar.push({ tipo: "Extras sin entrada/salida", colaborador: f.colaborador, cuil: f.cuil, fecha: ddmm(d), detalle: `${r.extras} h extra sin hora real de entrada/salida (parte ${parte.numero}): se reparten contra el horario del turno.` });
                    const area = r.area || c?.area || "";
                    const turno = r.turno || c?.turno || "";
                    if (!area)
                        revisar.push({ tipo: "Sin área", colaborador: f.colaborador, cuil: f.cuil, fecha: ddmm(d), detalle: `Ni el parte ${parte.numero} ni el contrato dicen el área.` });
                    f.extrasCrudas += r.extras;
                    detalle.push({
                        claveResumen: f.clave, fecha: d, dia: diaCorto(d), feriado: nombreFeriado, colaborador: f.colaborador, cuil: f.cuil, proyecto: proyecto.nombre, empresa: f.empresa, area, turno, estado, motivo,
                        entradaPrevista: r.entradaPrevista, salidaPrevista: r.salidaPrevista, entradaReal: r.entradaReal, salidaReal: r.salidaReal,
                        extras: r.extras > 0 ? { total: r.extras, h50: r.h50, h100: r.h100, horarioEntrada: r.entradaPrevista || c?.horaInicio || "", horarioSalida: r.salidaPrevista || c?.horaFin || "", feriado: !!nombreFeriado } : null,
                        reemplazo: partes.join(" · "), parte: parte.numero,
                    });
                }
            }
            else if (c) {
                const esperado = leCorresponde(c, d);
                if (esperado === "si") {
                    const f = filaResumen(personaId, proyecto, c);
                    f.diasSinParte += 1;
                    const k = `${personaId}|${proyectoId}`;
                    const fp = faltaParte.get(k) || faltaParte.set(k, { personaId, proyecto: proyecto.nombre, area: c.area, turno: c.turno, fechas: [] }).get(k);
                    fp.fechas.push(d);
                    if (conAlgunParte.has(personaId))
                        detalle.push({ claveResumen: f.clave, fecha: d, dia: diaCorto(d), feriado: nombreFeriado, colaborador: f.colaborador, cuil: f.cuil, proyecto: proyecto.nombre, empresa: f.empresa, area: c.area, turno: c.turno, estado: "Falta parte", motivo: "Día asignado en el contrato sin parte", entradaPrevista: c.horaInicio, salidaPrevista: c.horaFin, entradaReal: "", salidaReal: "", extras: null, reemplazo: "", parte: "" });
                }
                else if (esperado === "rotativo" || esperado === "sin_dias") {
                    filaResumen(personaId, proyecto, c).jornadasPrevistas = null;
                    const k = `${personaId}|${c.key}`;
                    const n = noEvaluables.get(k) || noEvaluables.set(k, { personaId, c, dias: 0 }).get(k);
                    n.dias += 1;
                }
            }
        }
        // Jornadas previstas: los días asignados dentro del período y de la vigencia de cada contrato.
        for (const c of contratos) {
            if (!tocaPeriodo(c, desde, hasta))
                continue;
            const f = filaResumen(personaId, proyecto, c);
            let previstas = 0, indeterminado = false;
            for (const d of dias) {
                if (!cubre(c, d))
                    continue;
                const x = leCorresponde(c, d);
                if (x === "si")
                    previstas += 1;
                else if (x !== "no")
                    indeterminado = true;
            }
            if (indeterminado || f.jornadasPrevistas === null)
                f.jornadasPrevistas = null;
            else
                f.jornadasPrevistas += previstas;
        }
    }
    // Para la hoja por empresa: horas en feriado, reemplazos y vacaciones corridas, por fila del resumen.
    const trabajo = new Set(detalle.filter((d) => d.estado === "Presente" || d.estado === "Tardanza").map((d) => `${d.claveResumen.split("|")[0]}|${d.fecha}`));
    const vacacionesPorClave = new Map();
    for (const d of detalle) {
        const f = resumen.get(d.claveResumen);
        const trabajado = d.estado === "Presente" || d.estado === "Tardanza";
        if (trabajado && feriado.has(d.fecha))
            f.horasFeriado = Math.round((f.horasFeriado + horasEntre(d.entradaReal || d.entradaPrevista, d.salidaReal || d.salidaPrevista)) * 100) / 100;
        if (trabajado && d.reemplazo.includes("Reemplaza a "))
            f.reemplazos += 1;
        if (d.estado === "Ausente" && esVacaciones(d.motivo))
            (vacacionesPorClave.get(d.claveResumen) || vacacionesPorClave.set(d.claveResumen, []).get(d.claveResumen)).push(d.fecha);
    }
    for (const [clave, fechas] of vacacionesPorClave) {
        const f = resumen.get(clave);
        const personaId = clave.split("|")[0];
        const orden = [...new Set(fechas)].sort();
        let ini = orden[0], fin = orden[0];
        for (const x of orden.slice(1)) {
            // Mismo tramo mientras no haya trabajado ningún día en el medio (los francos del tramo se pagan como vacaciones).
            let trabajoEnElMedio = false;
            for (let d = diaSiguiente(fin); d < x; d = diaSiguiente(d))
                if (trabajo.has(`${personaId}|${d}`)) {
                    trabajoEnElMedio = true;
                    break;
                }
            if (trabajoEnElMedio) {
                f.vacacionesCorridas += diasEntre(ini, fin) + 1;
                ini = x;
            }
            fin = x;
        }
        f.vacacionesCorridas += diasEntre(ini, fin) + 1;
    }
    // Lo que a la hoja por empresa le falta del catálogo: una línea por contrato mensualizado que toca el período.
    for (const lista of contratosDe.values())
        for (const c of lista) {
            if (!esMensualizado(c.tipo) || !tocaPeriodo(c, desde, hasta))
                continue;
            const vigencia = `${ddmm(c.alta)}${c.baja ? ` al ${ddmm(c.baja)}` : " (abierto)"}`;
            if (!c.empresa)
                revisar.push({ tipo: "Contrato sin empresa", colaborador: nombreDe(c.personaId), cuil: cuilDe(c.personaId), fecha: vigencia, detalle: `El contrato ${c.tipo || ""} de ${c.proyecto} no tiene empresa: no entra en ninguna hoja por empresa (va en «SIN EMPRESA»).` });
            if (c.grupo === null)
                revisar.push({ tipo: "Categoría sin grupo", colaborador: nombreDe(c.personaId), cuil: cuilDe(c.personaId), fecha: vigencia, detalle: `La categoría «${c.categoria || "(vacía)"}» del contrato ${c.tipo || ""} no está en el catálogo de categorías: Grupo y Tarea salen incompletos.` });
            if (!c.obraSocialCodigo)
                revisar.push({ tipo: "Obra social sin código", colaborador: nombreDe(c.personaId), cuil: cuilDe(c.personaId), fecha: vigencia, detalle: `Ni el contrato ${c.tipo || ""} tiene obra social, ni su categoría («${c.categoria || "(vacía)"}») lleva a un convenio con obra social: la columna Código queda vacía.` });
            // Los dos valores, sin decidir cuál gana: lo decide laboral. La referencia de liquidaciones la cargó un script desde su planilla.
            const rnos = (s) => s.replace(/\D/g, "").padStart(6, "0");
            if (c.obraSocialCodigo && c.obraSocialSegunLiquidaciones && rnos(c.obraSocialCodigo) !== rnos(c.obraSocialSegunLiquidaciones))
                revisar.push({ tipo: "Obra social discrepa con liquidaciones", colaborador: nombreDe(c.personaId), cuil: cuilDe(c.personaId), fecha: vigencia, detalle: `WeProdu emite ${c.obraSocialCodigo} (${c.obraSocialOrigen === "contrato" ? "fijada en el contrato, constatada o manual" : c.obraSocialOrigen === "convenio" ? "la del convenio de la categoría" : "la de la empleadora"}); liquidaciones usa ${c.obraSocialSegunLiquidaciones}. Lo decide laboral.` });
        }
    const sinFicha = new Set();
    for (const f of resumen.values()) {
        const personaId = f.clave.split("|")[0];
        if (!persona.has(personaId) && !sinFicha.has(personaId)) {
            sinFicha.add(personaId);
            revisar.push({ tipo: "Persona sin ficha", colaborador: f.colaborador, cuil: "", fecha: `${ddmm(desde)} al ${ddmm(hasta)}`, detalle: `Figura en partes o contratos de ${f.proyecto} y no existe como usuario (borrada): sin nombre, CUIL ni legajo.` });
        }
    }
    // Alertas agrupadas: por persona, no por día.
    for (const fp of faltaParte.values()) {
        const sinNinguno = !conAlgunParte.has(fp.personaId);
        revisar.push({
            tipo: sinNinguno ? "Sin ningún parte en el mes" : "Falta parte",
            colaborador: nombreDe(fp.personaId), cuil: cuilDe(fp.personaId),
            fecha: sinNinguno ? `${ddmm(desde)} al ${ddmm(hasta)}` : fp.fechas.map(ddmm).join(", "),
            detalle: sinNinguno ? `${fp.fechas.length} día(s) asignados (${fp.area || "sin área"} / ${fp.turno || "sin turno"}) en ${fp.proyecto} y ningún parte en todo el período.` : `${fp.fechas.length} día(s) asignados sin parte (${fp.area || "sin área"} / ${fp.turno || "sin turno"}).`,
        });
    }
    for (const n of noEvaluables.values())
        revisar.push({ tipo: "Días no evaluables", colaborador: nombreDe(n.personaId), cuil: cuilDe(n.personaId), fecha: `${ddmm(desde)} al ${ddmm(hasta)}`, detalle: `${n.dias} día(s) sin parte que no se pueden evaluar: el contrato ${n.c.tipo} ${ddmm(n.c.alta)}${n.c.baja ? ` al ${ddmm(n.c.baja)}` : " (abierto)"} ${n.c.rotativo ? "es de días rotativos" : "no tiene días asignados (Contratación › Sin días)"}.` });
    for (const [k, fechas] of motivosFuera) {
        const [personaId, motivo] = k.split("|");
        revisar.push({ tipo: "Motivo fuera del catálogo", colaborador: nombreDe(personaId), cuil: cuilDe(personaId), fecha: fechas.map(ddmm).join(", "), detalle: `${fechas.length} día(s) como Ausente con el motivo «${motivo}», que no está en el catálogo: cuenta en «Otro motivo». Si son jornadas trabajadas, lo decide liquidaciones.` });
    }
    for (const f of resumen.values())
        if (f.valorHoraNoAplica && f.extrasCrudas > 0)
            revisar.push({ tipo: "Valor hora no disponible", colaborador: f.colaborador, cuil: f.cuil, fecha: `${ddmm(desde)} al ${ddmm(hasta)}`, detalle: `${f.extrasCrudas} h extra en contratos de ${f.tipo}: el sueldo mano cargado es el valor de la jornada, no un mensual, así que el valor hora y los importes de extras quedan vacíos.` });
    const partes = e.partes
        .map((p) => ({ parte: p.numero, fecha: p.fecha, proyecto: p.proyecto, area: p.area, turno: p.turno, responsable: p.responsable, presentes: p.registros.filter((r) => r.status === "present" || r.status === "late").length, ausentes: p.registros.filter((r) => r.status !== "present" && r.status !== "late").length, comentario: p.comentario.trim() }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.parte.localeCompare(b.parte));
    const porNombre = (a, b) => a.colaborador.localeCompare(b.colaborador, "es", { sensitivity: "base" });
    const ORDEN_TIPOS = ["Persona sin ficha", "Sin contrato vigente", "Reemplazante sin contrato vigente", "Falta parte", "Sin ningún parte en el mes", "Días no evaluables", "Salida anterior a la entrada", "Extras sin entrada/salida", "Sin área", "Contrato duplicado", "Contrato sin empresa", "Categoría sin grupo", "Obra social sin código", "Obra social discrepa con liquidaciones", "Motivo fuera del catálogo", "Valor hora no disponible"];
    return {
        resumen: [...resumen.values()].sort((a, b) => porNombre(a, b) || a.desde.localeCompare(b.desde)),
        detalle: detalle.sort((a, b) => porNombre(a, b) || a.fecha.localeCompare(b.fecha) || a.parte.localeCompare(b.parte)),
        partes,
        revisar: revisar.sort((a, b) => ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo) || porNombre(a, b) || a.fecha.localeCompare(b.fecha)),
    };
}

const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
/**
 * Las horas entre dos "HH:MM".
 *
 * Si la salida es menor o igual que la entrada, el turno CRUZA LA MEDIANOCHE y se le suman 24 h:
 * "18:00 → 00:00" son seis horas, no menos veintidós. Son 1.984 renglones con ese turno.
 */
export function horasEntre(desde, hasta) {
    /*
      SIN LOS DOS HORARIOS, CERO. Y hay que chequearlo ANTES de convertir.
  
      La primera versión partía el string y convertía: "" daba 0 en las dos puntas, el 0 de salida
      quedaba "antes" del 0 de entrada, se le sumaban 24 horas y un renglón sin horario devolvía una
      jornada de 24. Ese número habría entrado derecho en el 0017 del archivo.
    */
    const texto = (t) => String(t || "").trim();
    if (!texto(desde) || !texto(hasta))
        return 0;
    const partes = (t) => t.split(":").map(Number);
    const [hd, md] = partes(texto(desde));
    const [hh, mh] = partes(texto(hasta));
    if (!Number.isFinite(hd) || !Number.isFinite(hh))
        return 0;
    const inicio = hd * 60 + (Number.isFinite(md) ? md : 0);
    let fin = hh * 60 + (Number.isFinite(mh) ? mh : 0);
    // Salida menor o igual que la entrada: el turno cruza la medianoche.
    if (fin <= inicio)
        fin += 24 * 60;
    return Math.round(((fin - inicio) / 60) * 100) / 100;
}
/**
 * Lo que sobra del total una vez descontado lo que sí está discriminado.
 *
 * Se resta en vez de usar el total tal cual porque los tres campos conviven: hay renglones con 6
 * horas al 100% y el mismo 6 en el total. Sumarlos daría el doble.
 */
const sinDiscriminar = (total, h50, h100) => Math.max(0, n(total) - n(h50) - n(h100));
/**
 * Convierte un parte entero en eventos.
 *
 * `datosDe` resuelve legajo, empresa, CC y régimen de una persona en ese proyecto. Devuelve
 * `undefined` cuando esa persona no tiene contrato vigente, y en ese caso el evento SE GENERA IGUAL
 * con los datos en null: lo que no se puede liquidar tiene que verse en el anexo, no desaparecer.
 */
export function normalizarParte(parte, datosDe) {
    const eventos = [];
    const vacio = { apellidoYNombre: "", legajo: null, empresaId: null, ccCodigo: null, regimen: null };
    const comun = {
        activityReportId: String(parte._id),
        fecha: String(parte.date).slice(0, 10),
        proyectoId: parte.projectId ? String(parte.projectId) : null,
        proyecto: parte.proyectoNombre || null,
        areaId: parte.areaId ? String(parte.areaId) : null,
        turnoId: parte.shiftId ? String(parte.shiftId) : null,
    };
    for (const r of parte.attendance || []) {
        const titular = datosDe(String(r.employeeId), comun.proyectoId) || vacio;
        eventos.push({
            ...comun,
            id: `${parte._id}:${r._id}:titular`,
            attendanceItemId: String(r._id),
            aplicaA: "titular",
            userId: String(r.employeeId),
            ...titular,
            estado: r.status,
            motivoId: r.typeId ? String(r.typeId) : null,
            motivoNombre: r.absenceReason || null,
            jornadas: 1,
            he50: n(r.overtimeHours50),
            he100: n(r.overtimeHours100),
            heSinDiscriminar: sinDiscriminar(r.overtimeHours, r.overtimeHours50, r.overtimeHours100),
            horarioDesde: r.scheduleInTime || null,
            horarioHasta: r.scheduleOutTime || null,
            horasDeJornada: horasEntre(r.scheduleInTime, r.scheduleOutTime),
            reemplazaA: null,
            notas: r.notes || null,
        });
        if (!r.replacementId)
            continue;
        const suplente = datosDe(String(r.replacementId), comun.proyectoId) || vacio;
        eventos.push({
            ...comun,
            id: `${parte._id}:${r._id}:reemplazante`,
            attendanceItemId: String(r._id),
            aplicaA: "reemplazante",
            userId: String(r.replacementId),
            ...suplente,
            /*
              El reemplazante ESTUVO, sea cual sea el estado del titular. Copiar el "absent" del titular
              dejaría al que vino a trabajar figurando como ausente en su propia liquidación.
            */
            estado: "present",
            // El motivo se conserva: es POR QUÉ lo cubrió, y de eso depende qué concepto le corresponde.
            motivoId: r.typeId ? String(r.typeId) : null,
            motivoNombre: r.absenceReason || null,
            jornadas: 1,
            he50: n(r.replacementOvertimeHours50),
            he100: n(r.replacementOvertimeHours100),
            heSinDiscriminar: sinDiscriminar(r.replacementOvertimeHours, r.replacementOvertimeHours50, r.replacementOvertimeHours100),
            horarioDesde: r.scheduleInTime || null,
            horarioHasta: r.scheduleOutTime || null,
            horasDeJornada: horasEntre(r.scheduleInTime, r.scheduleOutTime),
            reemplazaA: titular.apellidoYNombre || String(r.employeeId),
            notas: r.notes || null,
        });
    }
    return eventos;
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { erroresDePropuesta } from "./campania.js";
import { cuentaRegresiva, diaDeRegreso, encabezado, erroresDelTramoEnPantalla, fechaSinAnio, motivoDelBoton, parrafoDeInvitacion, pasoDe, primerInicioElegible, progreso, puedeAgregarTramo, quienLaTiene, reglaDelPaso, situacionDe, textoDeFechas, textoDeRegreso, textoDelTramo } from "./pantallaEmpleado.js";
const base = {
    estado: "invitado",
    puedeProponer: true,
    diasDisponibles: 21,
    diasCorridos: true,
    minPorTramo: 7,
    diasDeInicio: [1],
    ventanaDesde: "2026-12-01",
    ventanaHasta: "2027-04-30",
    fechaLimite: "2026-12-18",
    nombreCampania: "Vacaciones 2026/27",
    hayAviso: false,
    asignadaPorEmpresa: false,
    vacaciones: [],
};
const con = (x) => ({ ...base, ...x });
const HOY = "2026-11-27";
const validar = (tramos, dias = 21) => erroresDePropuesta({ tramos, diasDisponibles: dias, ventana: { desde: base.ventanaDesde, hasta: base.ventanaHasta }, hoy: HOY, minPorTramo: 7, diasCorridos: true, diasDeInicio: [1] });
test("transiciones: invitada sin acuse → A; entra a elegir → B; propuso → C", () => {
    assert.equal(pasoDe(con({ estado: "invitado" }), false), "A");
    assert.equal(pasoDe(con({ estado: "invitado" }), true), "B");
    assert.equal(pasoDe(con({ estado: "acuso_recibo" }), true), "B");
    // Al proponer, el server deja de permitir proponer: la pantalla pasa a C aunque «eligiendo» siga en true.
    assert.equal(pasoDe(con({ estado: "propuso_fechas", puedeProponer: false }), true), "C");
    assert.equal(pasoDe(con({ estado: "aprobado_notificado", puedeProponer: false }), false), "C");
    assert.equal(pasoDe(con({ estado: "vencido_sin_definir", puedeProponer: false }), false), "C");
});
test("rechazada en plazo vuelve a A; esperando su turno es A sin poder empezar", () => {
    assert.equal(pasoDe(con({ estado: "rechazada", rechazoMotivo: "Se pisa con tu compañero" }), false), "A");
    const esperando = con({ estado: "invitado", puedeProponer: false, turnoCerradoDesde: "2026-12-03" });
    assert.equal(pasoDe(esperando, false), "A");
    assert.equal(pasoDe(esperando, true), "A", "sin turno abierto no se entra a elegir");
});
test("encabezado y párrafo del paso A", () => {
    assert.equal(encabezado(base), "Vacaciones 2026/27 · 21 días · elegí hasta el 18/12");
    assert.equal(encabezado(con({ estado: "propuso_fechas", estadoVisible: "propuso_fechas", puedeProponer: false })), "Vacaciones 2026/27 · 21 días · Propuso fechas");
    assert.equal(parrafoDeInvitacion(base), "Tenés 21 días corridos para tomar entre el 01/12/2026 y el 30/04/2027. Si no elegís antes del 18/12/2026, la empresa te propone unas fechas.");
    assert.equal(fechaSinAnio("2026-12-18"), "18/12");
});
test("la cuenta regresiva de «Solicitar vacaciones»", () => {
    assert.equal(cuentaRegresiva(21), "Quedan 21 días");
    assert.equal(cuentaRegresiva(1), "Queda 1 día");
    assert.equal(cuentaRegresiva(0), "Hoy es el último día");
    assert.equal(cuentaRegresiva(-1), "Venció el plazo");
});
test("la regla del paso B, en una línea, según el saldo y los días de inicio", () => {
    assert.equal(reglaDelPaso(base), "Tenés que repartir los 21 días. Cada tramo empieza los lunes y dura al menos 7.");
    assert.equal(reglaDelPaso(con({ diasDeInicio: [] })), "Tenés que repartir los 21 días. Cada tramo dura al menos 7.");
    assert.equal(reglaDelPaso(con({ diasDisponibles: 5 })), "Tus 5 días van seguidos, en un solo tramo que empieza los lunes.");
    assert.equal(reglaDelPaso(con({ diasDisponibles: 5, diasDeInicio: [] })), "Tus 5 días van seguidos, en un solo tramo.");
});
test("progreso: cuenta sólo los tramos con fechas", () => {
    const p = progreso([{ desde: "2026-12-07", hasta: "2026-12-13" }, { desde: "2027-01-04", hasta: "" }], 21, true);
    assert.deepEqual(p, { repartidos: 7, total: 21, faltan: 14, texto: "7 de 21 repartidos" });
    assert.equal(progreso([], 21, true).faltan, 21);
});
test("motivo del botón: neutro y en orden (sin fechas → error real → faltan → nada)", () => {
    const vacio = [{ desde: "", hasta: "" }];
    assert.equal(motivoDelBoton({ tramos: vacio, errores: validar([]), indicesCompletos: [], faltan: 21 }), "Elegí tus fechas");
    assert.equal(motivoDelBoton({ tramos: [{ desde: "2026-12-07", hasta: "2026-12-13" }, { desde: "", hasta: "" }], errores: validar([{ desde: "2026-12-07", hasta: "2026-12-13" }]), indicesCompletos: [0], faltan: 14 }), "Elegí las fechas del tramo 2");
    // Un solo tramo de 7 días: «faltan» es avance, no error.
    const uno = [{ desde: "2026-12-07", hasta: "2026-12-13" }];
    assert.equal(motivoDelBoton({ tramos: uno, errores: validar(uno), indicesCompletos: [0], faltan: 14 }), "Faltan 14 días por repartir");
    // Dos tramos que se pisan: error real, apunta al tramo.
    const pisados = [{ desde: "2026-12-07", hasta: "2026-12-20" }, { desde: "2026-12-14", hasta: "2026-12-20" }];
    assert.equal(motivoDelBoton({ tramos: pisados, errores: validar(pisados), indicesCompletos: [0, 1], faltan: 0 }), "Corregí el tramo 1");
    // Todo repartido y en regla: se puede enviar.
    const completo = [{ desde: "2026-12-07", hasta: "2026-12-20" }, { desde: "2027-01-04", hasta: "2027-01-10" }];
    assert.deepEqual(validar(completo), []);
    assert.equal(motivoDelBoton({ tramos: completo, errores: [], indicesCompletos: [0, 1], faltan: 0 }), null);
});
test("errores reales por tramo, con la posición de la pantalla (los incompletos no están en la validación)", () => {
    const tramos = [{ desde: "", hasta: "" }, { desde: "2026-12-08", hasta: "2026-12-14" }];
    const errores = validar([tramos[1]]);
    assert.equal(erroresDelTramoEnPantalla(errores, [1], 0).length, 0);
    const delSegundo = erroresDelTramoEnPantalla(errores, [1], 1);
    assert.equal(delSegundo.length, 1);
    assert.match(delSegundo[0], /empieza un martes/);
    // «faltan» no aparece como error de ningún tramo.
    assert.ok(!delSegundo.some((m) => /faltan repartir/.test(m)));
});
test("agregar tramo: sólo con días por repartir, tramos completos y saldo que admite fraccionar", () => {
    const uno = [{ desde: "2026-12-07", hasta: "2026-12-13" }];
    assert.equal(puedeAgregarTramo({ tramos: uno, faltan: 14, diasDisponibles: 21, minPorTramo: 7 }), true);
    assert.equal(puedeAgregarTramo({ tramos: uno, faltan: 0, diasDisponibles: 7, minPorTramo: 7 }), false);
    assert.equal(puedeAgregarTramo({ tramos: [{ desde: "", hasta: "" }], faltan: 21, diasDisponibles: 21, minPorTramo: 7 }), false);
    assert.equal(puedeAgregarTramo({ tramos: uno, faltan: 2, diasDisponibles: 5, minPorTramo: 7 }), false, "con menos del mínimo no se fracciona");
});
test("textos de tramo y regreso", () => {
    assert.equal(textoDeFechas("2026-12-07", "2026-12-13"), "7 al 13 de dic");
    assert.equal(textoDeFechas("2026-12-28", "2027-01-03"), "28 de dic al 3 de ene");
    assert.equal(textoDelTramo({ desde: "2026-12-07", hasta: "2026-12-13" }, true), "7 al 13 de dic · 7 días");
    assert.equal(textoDelTramo({ desde: "2026-12-07", hasta: "2026-12-13" }, false), "7 al 13 de dic · 5 días");
    assert.equal(diaDeRegreso("2026-12-13"), "2026-12-14", "domingo → lunes");
    assert.equal(diaDeRegreso("2026-12-11"), "2026-12-14", "viernes → lunes");
    assert.equal(textoDeRegreso("2026-12-13"), "volvés el lun 14/12");
});
test("paso C: quién la tiene y qué sigue", () => {
    const v = (status) => ({ status, startDate: "2026-12-07", endDate: "2026-12-13", daysRequested: 7 });
    assert.equal(quienLaTiene([v("pending")]), "La revisa tu supervisor o tu coordinador.");
    assert.equal(quienLaTiene([v("pre_approved"), v("pre_approved")]), "La revisa RR.HH.");
    assert.equal(quienLaTiene([v("pending"), v("pre_approved")]), "Parte la revisa tu supervisor o tu coordinador y parte RR.HH.");
    assert.equal(quienLaTiene([v("approved")]), "Aprobada.");
    const enviada = situacionDe(con({ estado: "propuso_fechas", puedeProponer: false, vacaciones: [v("pending")] }));
    assert.equal(enviada.clave, "enviada");
    assert.equal(enviada.detalle, "La revisa tu supervisor o tu coordinador.");
    const otorgadaSinAcuse = situacionDe(con({ estado: "aprobado_notificado", puedeProponer: false, hayAviso: true, vacaciones: [v("approved")] }));
    assert.equal(otorgadaSinAcuse.clave, "otorgada");
    assert.equal(otorgadaSinAcuse.acusePendiente, true);
    assert.equal(situacionDe(con({ estado: "aprobado_notificado", puedeProponer: false, hayAviso: true, acuseOtorgamientoAt: "2026-12-20T10:00:00Z" })).acusePendiente, false);
    assert.equal(situacionDe(con({ estado: "asignado_por_empresa_notificado", puedeProponer: false, hayAviso: true, asignadaPorEmpresa: true })).titulo, "Vacaciones asignadas por la empresa");
    assert.equal(situacionDe(con({ estado: "vencido_sin_definir", puedeProponer: false })).clave, "vencida");
    // Pasó la fecha límite y el cron todavía no la marcó: se lee igual que vencida.
    assert.equal(situacionDe(con({ estado: "invitado", puedeProponer: false })).clave, "vencida");
    assert.equal(situacionDe(con({ estado: "sin_dias_pendientes", puedeProponer: false })).clave, "sin_dias");
});
test("el calendario abre en el primer día en que se puede empezar, no en el mes actual", () => {
    const permitida = (f) => f >= "2026-12-01" && f <= "2027-04-30";
    assert.equal(primerInicioElegible("2026-11-28", [1], permitida), "2026-12-07");
    assert.equal(primerInicioElegible("2026-11-28", [], permitida), "2026-12-01");
    assert.equal(primerInicioElegible("2026-11-28", [1], () => false, 30), null);
    assert.equal(primerInicioElegible("", [1], permitida), null);
});

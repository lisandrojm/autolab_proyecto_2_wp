import { test } from "node:test";
import assert from "node:assert/strict";
import { armarListaBajas, bajaSinConfirmar, movimientosEntre, sinMovimientos, situacionDeBaja } from "./listaBajasArca.js";
const HOY = "2026-11-22";
const datos = (x = {}) => ({ estado: "abierta", finArca: "", contratos: 1, proyectos: 1, puede: true, bajaContrato: "", baja: null, ...x });
const sit = (x = {}) => situacionDeBaja(datos(x), HOY);
test("1 · terminado en WeProdu: baja pasada y ARCA abierta", () => {
    assert.deepEqual(sit({ bajaContrato: "2026-11-12" }), { situacion: 1, fuera: null });
});
test("2 · termina antes de su fecha: la baja de WeProdu es anterior al fin que tiene ARCA", () => {
    assert.deepEqual(sit({ estado: "fin_futuro", finArca: "2026-12-31", bajaContrato: "2026-11-15" }), { situacion: 2, fuera: null });
    // También si la baja anticipada todavía no llegó.
    assert.equal(sit({ estado: "fin_futuro", finArca: "2026-12-31", bajaContrato: "2026-12-10" }).situacion, 2);
});
test("3 · baja presentada sin confirmar, o con error de navegación", () => {
    assert.equal(sit({ baja: { resultado: "presentando" } }).situacion, 3);
    assert.equal(sit({ baja: { resultado: "indeterminado" } }).situacion, 3);
    assert.equal(sit({ baja: { resultado: "fallida", clase: "navegacion" } }).situacion, 3);
    // Un rechazo de ARCA no es «sin confirmar»: ARCA contestó. La fila sigue en la situación que le toca.
    assert.equal(bajaSinConfirmar({ resultado: "fallida", clase: "regla_arca" }), false);
    assert.equal(sit({ bajaContrato: "2026-11-12", baja: { resultado: "fallida", clase: "regla_arca" } }).situacion, 1);
    // Sin contrato, la marca sale del registro de operaciones.
    assert.equal(sit({ contratos: 0, baja: { resultado: "indeterminado" } }).situacion, 3);
});
test("la 3 gana sobre la 1 y la 2: una baja mandada y sin confirmar no vuelve a decir «Terminado en WeProdu»", () => {
    assert.equal(sit({ bajaContrato: "2026-11-12", baja: { resultado: "indeterminado" } }).situacion, 3);
    assert.equal(sit({ estado: "fin_futuro", finArca: "2026-12-31", bajaContrato: "2026-11-15", baja: { resultado: "presentando" } }).situacion, 3);
});
test("4 · sin contrato en WeProdu, abierta o con fin futuro (Peralta Recio, Viggiano)", () => {
    assert.equal(sit({ contratos: 0 }).situacion, 4);
    assert.equal(sit({ contratos: 0, estado: "fin_futuro", finArca: "2026-12-31" }).situacion, 4);
});
test("5 · indeterminado vigente: abierto de los dos lados; también si WeProdu termina de hoy en adelante", () => {
    assert.equal(sit().situacion, 5);
    assert.equal(sit({ bajaContrato: HOY }).situacion, 5);
    assert.equal(sit({ bajaContrato: "2026-12-15" }).situacion, 5);
});
test("6 · plazo vigente: ARCA lo cierra sola en su fecha, pero es una fila y se puede dar de baja antes", () => {
    // El mismo fin en los dos lados, WeProdu sin baja, o WeProdu más largo.
    assert.deepEqual(sit({ estado: "fin_futuro", finArca: "2026-12-31", bajaContrato: "2026-12-31" }), { situacion: 6, fuera: null });
    assert.equal(sit({ estado: "fin_futuro", finArca: "2026-12-31", bajaContrato: "" }).situacion, 6);
    assert.equal(sit({ estado: "fin_futuro", finArca: "2026-12-31", bajaContrato: "2027-01-31" }).situacion, 6);
    // Termina hoy en ARCA: sigue viva hasta que la sincronización la traiga cerrada.
    assert.equal(sit({ estado: "fin_futuro", finArca: HOY, bajaContrato: HOY }).situacion, 6);
});
test("lo que no tiene situación, con su motivo: una cerrada no es de la lista y el resto son filas bloqueadas", () => {
    assert.deepEqual(sit({ estado: "cerrada_reciente", finArca: "2026-11-10" }), { situacion: null, fuera: "cerrada" });
    assert.deepEqual(sit({ contratos: 2 }), { situacion: null, fuera: "varios_contratos" });
    // Varios contratos gana aunque haya una baja sin confirmar en uno: no se sabe de cuál es la relación.
    assert.equal(sit({ contratos: 3, bajaContrato: "2026-11-12" }).fuera, "varios_contratos");
    // La misma relación en varios proyectos (Quinteiro, Yorio) no es un duplicado: se resuelve a mano, la lista no elige.
    assert.equal(sit({ contratos: 5, proyectos: 5 }).fuera, "varios_proyectos");
    assert.equal(sit({ contratos: 3, proyectos: 2 }).fuera, "varios_proyectos");
    // La regla compartida dice que no (alta sin confirmar, anulada…).
    assert.equal(sit({ puede: false }).fuera, "no_se_opera");
    // La baja ya se presentó y ARCA la tomó: falta que la sincronización la traiga cerrada.
    assert.equal(sit({ bajaContrato: "2026-11-12", baja: { resultado: "presentada" } }).fuera, "baja_presentada");
    // Una baja anulada vuelve a dejar la relación abierta: la fila vuelve.
    assert.equal(sit({ bajaContrato: "2026-11-12", baja: { resultado: "anulada" } }).situacion, 1);
});
const contrato = (x = {}) => ({ userProjectId: "up1", contratoKey: "k1", posicion: 0, proyecto: "LN+", contrato: "Tiempo Indeterminado", alta: "2023-06-01", baja: "", relacionArca: { puede: true, motivo: "", via: "espejo" }, bajaPresentada: null, ...x });
let n = 0;
const rel = (x = {}) => {
    n++;
    const cuil = `2011111111${n % 10}`;
    const contratos = x.contratos ?? [contrato()];
    return {
        clave: `30222222223|${cuil}|${x.inicio || "2023-06-01"}|${n}`,
        empleadoraCuit: "30222222223",
        empleadora: "2030 S.R.L.",
        cuil,
        persona: `Persona ${String(n).padStart(2, "0")}`,
        userId: "u1",
        inicio: "2023-06-01",
        fin: "",
        situacionBaja: "",
        modalidadContrato: "A tiempo completo indeterminado/Trabajo permanente",
        estado: "abierta",
        modo: contratos.length === 1 ? "contrato" : contratos.length ? "elegir" : "sin_contrato",
        puede: true,
        motivo: "",
        diasDesdeFinContrato: null,
        bajaEnRegistro: null,
        ...x,
        contratos,
    };
};
test("la lista: TODAS las relaciones vivas, una situación por fila, ordenada 1 a 6 y por días desde el fin; las bloqueadas al final", () => {
    const lista = armarListaBajas([
        rel({ persona: "Vigente" }),
        rel({ persona: "Terminó hace 3", contratos: [contrato({ baja: "2026-11-19" })] }),
        rel({ persona: "Terminó hace 10", contratos: [contrato({ baja: "2026-11-12" })] }),
        rel({ persona: "Sin ficha", userId: null, contratos: [] }),
        rel({ persona: "Ficha sin contrato", contratos: [], estado: "fin_futuro", fin: "2026-12-31" }),
        rel({ persona: "Antes de su fecha", estado: "fin_futuro", fin: "2026-12-31", contratos: [contrato({ contrato: "Plazo fijo 5x7", baja: "2026-11-30" })] }),
        rel({ persona: "Sin confirmar", contratos: [contrato({ baja: "2026-11-01", bajaPresentada: { resultado: "indeterminado", clase: "", fecha: "2026-11-20T12:00:00.000Z" } })] }),
        rel({ persona: "Duplicado", contratos: [contrato(), contrato({ contratoKey: "k2", posicion: 1 })] }),
        rel({ persona: "En dos proyectos", contratos: [contrato(), contrato({ userProjectId: "up2", contratoKey: "k3", proyecto: "PRODUCTORA" })] }),
        rel({ persona: "Plazo vigente", estado: "fin_futuro", fin: "2026-12-31", modalidadContrato: "A tiempo completo determinado (contrato a plazo fijo)", contratos: [contrato({ contrato: "Jornada", baja: "2026-12-31" })] }),
        rel({ persona: "Director", userId: null, contratos: [], modalidadContrato: "LRT(Direc.SA, Municip.Org.cent.y descent.Emp.Mixta,docent.priv.opúbl.de jurisd.incorp. o no al SIJP" }),
        rel({ persona: "Cerrada", estado: "cerrada_reciente", fin: "2026-11-10" }),
    ], HOY);
    assert.deepEqual(lista.filas.map((f) => `${f.situacion} ${f.persona}`), ["1 Terminó hace 10", "1 Terminó hace 3", "2 Antes de su fecha", "3 Sin confirmar", "4 Director", "4 Ficha sin contrato", "4 Sin ficha", "5 Vigente", "6 Plazo vigente", "null Duplicado", "null En dos proyectos"]);
    // La lista suma TODAS las vivas (la cerrada no es una fila): es lo que la pantalla compara con el espejo.
    assert.deepEqual(lista.conteos, { s1: 2, s2: 1, s3: 1, s4: 3, s5: 1, s6: 1, pendientes: 7, bloqueadas: { varios_contratos: 1, varios_proyectos: 1 }, total: 11 });
    assert.equal(lista.filas.length, 11);
    assert.deepEqual(lista.bloqueadas.map((f) => `${f.persona}: ${f.motivo}`), ["Duplicado: varios_contratos", "En dos proyectos: varios_proyectos"]);
    assert.match(lista.bloqueadas[1].texto, /^Misma relación en varios proyectos: resolver a mano/);
    assert.equal(lista.bloqueadas[0].contratos.length, 2);
    const de = (p) => lista.filas.find((f) => f.persona === p);
    assert.equal(de("Terminó hace 10").diasDesdeFin, 10);
    assert.equal(de("Terminó hace 10").finWeprodu, "2026-11-12");
    assert.deepEqual(de("Terminó hace 10").contrato, { userProjectId: "up1", contratoKey: "k1", posicion: 0 });
    assert.equal(de("Vigente").diasDesdeFin, null);
    // La fila dice claro cuál de las dos «sin contrato» es.
    assert.equal(de("Sin ficha").sinFicha, true);
    assert.equal(de("Sin ficha").detalle, "Persona sin ficha en WeProdu");
    assert.equal(de("Sin ficha").contrato, null);
    assert.equal(de("Ficha sin contrato").sinFicha, false);
    assert.equal(de("Ficha sin contrato").detalle, "Ficha sin contrato con esa alta · en ARCA termina el 31/12/2026");
    assert.equal(de("Antes de su fecha").detalle, "En ARCA termina el 31/12/2026");
    assert.equal(de("Antes de su fecha").tipoContrato, "Plazo fijo 5x7");
    assert.match(de("Sin confirmar").detalle, /^Se mandó el 20\/11\/2026 y no se leyó el resultado/);
    // La 6 dice cuándo la cierra ARCA, y abre el panel con su contrato como cualquier otra.
    assert.equal(de("Plazo vigente").detalle, "ARCA lo cierra solo el 31/12/2026");
    assert.equal(de("Plazo vigente").bloqueo, null);
    assert.deepEqual(de("Plazo vigente").contrato, { userProjectId: "up1", contratoKey: "k1", posicion: 0 });
    // El tipo: con contrato manda WeProdu (la jornada está declarada en ARCA como plazo fijo); sin contrato, la modalidad de ARCA.
    assert.equal(de("Plazo vigente").tipo, "Jornada");
    assert.equal(de("Vigente").tipo, "Indeterminado");
    assert.equal(de("Director").tipo, "Directores (LRT)");
    assert.equal(de("Director").advertencia, "Modalidad de directores (LRT): confirmar antes de dar de baja");
    assert.equal(de("Vigente").advertencia, "");
    assert.deepEqual([de("Vigente").enWeprodu, de("Ficha sin contrato").enWeprodu, de("Sin ficha").enWeprodu], ["con_contrato", "sin_contrato", "sin_ficha"]);
    // Las bloqueadas se ven, sin situación y con el motivo; la de varios proyectos trae todos sus proyectos para el filtro.
    const varios = de("En dos proyectos");
    assert.equal(varios.situacion, null);
    assert.equal(varios.bloqueo?.motivo, "varios_proyectos");
    assert.equal(varios.bloqueo?.etiqueta, "Varios proyectos");
    assert.match(varios.bloqueo?.texto || "", /^Misma relación en varios proyectos: resolver a mano/);
    assert.deepEqual(varios.proyectos, ["LN+", "PRODUCTORA"]);
    assert.equal(varios.tipo, "Indeterminado");
    assert.equal(varios.enWeprodu, "con_contrato");
    assert.equal(de("Duplicado").bloqueo?.motivo, "varios_contratos");
});
test("el motivo de baja de la fila y lo que falta para presentar: sólo se exige en las situaciones 1 y 2", () => {
    const SITUACIONES = new Map([["21", "Renuncia del trabajador"], ["99", "Vencimiento de contrato"]]);
    const lista = armarListaBajas([
        rel({ persona: "Terminó sin motivo", contratos: [contrato({ baja: "2026-11-12" })] }),
        rel({ persona: "Renunció sin telegrama", contratos: [contrato({ baja: "2026-11-12", motivoBaja: "21" })] }),
        rel({ persona: "Renunció completo", contratos: [contrato({ baja: "2026-11-12", motivoBaja: "21", fechaTelegrama: "2026-11-10" })] }),
        rel({ persona: "Venció", contratos: [contrato({ baja: "2026-11-12", motivoBaja: "99" })] }),
        rel({ persona: "Vigente sin motivo" }),
        rel({ persona: "Vigente que renunció", contratos: [contrato({ motivoBaja: "21" })] }),
        rel({ persona: "Sin contrato", contratos: [] }),
    ], HOY, SITUACIONES);
    const de = (p) => lista.filas.find((f) => f.persona === p);
    assert.equal(de("Terminó sin motivo").falta, "motivo");
    assert.equal(de("Terminó sin motivo").motivoBaja, null);
    assert.equal(de("Renunció sin telegrama").falta, "telegrama");
    assert.equal(de("Renunció completo").falta, "");
    assert.deepEqual(de("Renunció completo").motivoBaja, { codigo: "21", descripcion: "Renuncia del trabajador", fechaTelegrama: "2026-11-10" });
    assert.equal(de("Venció").falta, "");
    assert.equal(de("Venció").motivoBaja?.descripcion, "Vencimiento de contrato");
    // Lo que no hay que presentar no «falta»: un vigente sin motivo está bien como está.
    assert.equal(de("Vigente sin motivo").falta, "");
    // Pero una renuncia ya cargada sin telegrama se marca en cualquier situación.
    assert.equal(de("Vigente que renunció").falta, "telegrama");
    // Sin contrato no hay dónde guardar el motivo: se elige en el panel.
    assert.equal(de("Sin contrato").falta, "");
    assert.equal(de("Sin contrato").motivoBaja, null);
});
test("sin contrato, la baja sin confirmar sale del registro de operaciones", () => {
    const lista = armarListaBajas([rel({ contratos: [], bajaEnRegistro: { resultado: "presentando", fecha: "2026-11-21T10:00:00.000Z" } })], HOY);
    assert.equal(lista.filas[0].situacion, 3);
    assert.equal(lista.filas[0].contrato, null);
});
test("movimientos entre dos corridas: quién entró, quién salió (y a dónde) y quién cambió de situación", () => {
    const f = (clave, situacion) => ({ clave, persona: clave.toUpperCase(), situacion });
    const antes = [f("a", 5), f("b", 4), f("c", 1), f("d", 5)];
    const ahora = [f("a", 1), f("d", 5), f("e", 4)];
    const m = movimientosEntre(antes, ahora, [{ clave: "c", motivo: "baja_presentada" }]);
    assert.deepEqual(m.entraron, [f("e", 4)]);
    assert.deepEqual(m.salieron, [
        { ...f("b", 4), ahora: "se cerró en ARCA" },
        { ...f("c", 1), ahora: "se presentó la baja y ARCA la tomó" },
    ]);
    assert.deepEqual(m.cambiaron, [{ clave: "a", persona: "A", de: 5, a: 1 }]);
    assert.equal(sinMovimientos(m), false);
    assert.equal(sinMovimientos(movimientosEntre(antes, antes)), true);
    // Una fila que pasa a bloqueada «salió» de su situación, y se dice a dónde fue.
    assert.equal(movimientosEntre([f("q", 5)], [], [{ clave: "q", motivo: "varios_proyectos" }]).salieron[0].ahora, "ahora está en varios proyectos (botón deshabilitado; Auditoría ARCA)");
    // Un plazo que vence antes de su fecha cambia de la 6 a la 2.
    assert.deepEqual(movimientosEntre([f("p", 6)], [f("p", 2)]).cambiaron, [{ clave: "p", persona: "P", de: 6, a: 2 }]);
});

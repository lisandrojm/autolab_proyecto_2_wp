import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirCandidatas, lecturaDelResultado, modoDe, motivoParaNoElegir, pedidoDeBaja, superaElTope, TOPE_POR_CORRIDA, type Requisitos } from "./presentacionBajasAutomatica.js";
import type { FilaBajaArca } from "./listaBajasArca.js";

const LRT = "LRT(Direc.SA, Municip.Org.cent.y descent.Emp.Mixta,docent.priv.opúbl.de jurisd.incorp. o no al SIJP";
let n = 0;
const fila = (x: Partial<FilaBajaArca> = {}): FilaBajaArca => {
  n++;
  return {
    clave: `30222222223|2011111111${n % 10}|2023-06-01|${n}`,
    empleadoraCuit: "30222222223",
    empleadora: "2030 S.R.L.",
    cuil: `2011111111${n % 10}`,
    persona: `Persona ${n}`,
    userId: "u1",
    sinFicha: false,
    enWeprodu: "con_contrato",
    inicio: "2023-06-01",
    finArca: "",
    modalidadArca: "A tiempo completo indeterminado/Trabajo permanente",
    tipo: "Indeterminado",
    tipoContrato: "Tiempo Indeterminado",
    proyecto: "LN+",
    proyectos: ["LN+"],
    finWeprodu: "2026-11-12",
    diasDesdeFin: 10,
    situacion: 1,
    bloqueo: null,
    detalle: "",
    advertencia: "",
    motivoBaja: { codigo: "26", descripcion: "Despido", fechaTelegrama: "" },
    falta: "",
    contrato: { userProjectId: "up1", contratoKey: "k1", posicion: 0 },
    ...x,
  };
};

test("candidatas: sólo las situaciones 1 y 2; la 3, la 4, la 5, la 6 y las bloqueadas ni se miran", () => {
  const r = elegirCandidatas([
    fila({ persona: "Uno", situacion: 1 }),
    fila({ persona: "Dos", situacion: 2, finArca: "2026-12-31" }),
    fila({ persona: "Tres", situacion: 3 }),
    fila({ persona: "Cuatro", situacion: 4, contrato: null, motivoBaja: null }),
    fila({ persona: "Cinco", situacion: 5, finWeprodu: "" }),
    fila({ persona: "Seis", situacion: 6, finArca: "2026-12-31" }),
    fila({ persona: "Bloqueada", situacion: null, bloqueo: { motivo: "varios_proyectos", etiqueta: "Varios proyectos", texto: "" }, contrato: null }),
  ]);
  assert.deepEqual(r.candidatas.map((f) => f.persona), ["Uno", "Dos"]);
  assert.deepEqual(r.paraPlan.map((f) => f.persona), ["Uno", "Dos"]);
  assert.deepEqual(r.salteadas, []);
});

test("lo que nunca se presenta sola: LRT, sin motivo, renuncia sin telegrama y empleadora con la lectura fallida", () => {
  const r = elegirCandidatas(
    [
      fila({ persona: "Director", modalidadArca: LRT }),
      fila({ persona: "Sin motivo", motivoBaja: null, falta: "motivo" }),
      fila({ persona: "Sin telegrama", motivoBaja: { codigo: "21", descripcion: "Renuncia", fechaTelegrama: "" }, falta: "telegrama" }),
      fila({ persona: "Espejo viejo", empleadoraCuit: "30999999995" }),
      fila({ persona: "Lista" }),
    ],
    ["30-99999999-5"],
  );
  assert.equal(r.candidatas.length, 5);
  assert.deepEqual(r.paraPlan.map((f) => f.persona), ["Lista"]);
  assert.deepEqual(r.salteadas.map((s) => `${s.persona}: ${s.razon}`), ["Director: lrt", "Sin motivo: falta_motivo", "Sin telegrama: falta_telegrama", "Espejo viejo: empleadora_con_error"]);
  assert.match(r.salteadas[1].texto, /^Falta el motivo/);
  assert.match(r.salteadas[2].texto, /^Falta la fecha de telegrama/);
  // LRT gana aunque tenga todo cargado: la confirma una persona.
  assert.equal(elegirCandidatas([fila({ modalidadArca: LRT })]).paraPlan.length, 0);
});

test("lo que se le pide al panel sale entero del contrato: nunca un motivo por defecto", () => {
  assert.deepEqual(pedidoDeBaja(fila({ motivoBaja: { codigo: "21", descripcion: "Renuncia", fechaTelegrama: "2026-11-10" } })), {
    ref: { userProjectId: "up1", contratoKey: "k1", contractIndex: 0 },
    datos: { fechaFin: "2026-11-12", situacionBaja: "21", fechaTelegrama: "2026-11-10" },
  });
  // Sin telegrama no se manda la clave (el plan del panel distingue «no vino» de «vino vacía»).
  assert.deepEqual(pedidoDeBaja(fila()).datos, { fechaFin: "2026-11-12", situacionBaja: "26" });
  // Sin motivo el pedido lleva el motivo vacío, y el plan del panel lo rechaza («Elegí el motivo de la baja»).
  assert.equal(pedidoDeBaja(fila({ motivoBaja: null })).datos.situacionBaja, "");
});

test("el tope: con más que el tope no se presenta ninguna", () => {
  assert.equal(TOPE_POR_CORRIDA, 5);
  assert.equal(superaElTope(5), false);
  assert.equal(superaElTope(6), true);
  assert.equal(superaElTope(0), false);
});

test("sin confirmar, rechazada o fallida cortan la corrida; presentada y en seco siguen", () => {
  assert.deepEqual(lecturaDelResultado({ resultado: "seco" }), { resultado: "simulada", corta: false, detalle: "Prueba en seco: se completó y se canceló sin confirmar." });
  assert.deepEqual(lecturaDelResultado({ resultado: "presentada", acuse: { cbt: "123" } }), { resultado: "presentada", corta: false, detalle: "C.B.T. 123" });
  assert.equal(lecturaDelResultado({ resultado: "ya_hecha" }).corta, false);
  assert.deepEqual(lecturaDelResultado({ resultado: "indeterminado" }).resultado, "sin_confirmar");
  assert.equal(lecturaDelResultado({ resultado: "indeterminado" }).corta, true);
  assert.deepEqual(lecturaDelResultado({ resultado: "rechazada", clase: "regla_arca", motivo: "ARCA dice que no" }), { resultado: "rechazada", corta: true, detalle: "ARCA dice que no" });
  assert.equal(lecturaDelResultado({ resultado: "fallida", clase: "navegacion" }).corta, true);
  assert.equal(lecturaDelResultado(undefined).corta, true);
});

test("los dos escalones: una prueba en seco a mano habilita simular; una baja real confirmada habilita presentar", () => {
  const req = (seco: boolean, confirmada: boolean, pendientes = 0): Requisitos => ({ secoManual: { cumplido: seco, el: null }, bajaConfirmada: { cumplido: confirmada, el: null, pendientesDeSincronizar: pendientes } });
  // Apagar se puede siempre.
  assert.equal(motivoParaNoElegir("apagada", req(false, false)), "");
  // Sin la prueba en seco a mano no se puede ni simular ni presentar.
  assert.match(motivoParaNoElegir("simular", req(false, false)), /prueba en seco/);
  assert.match(motivoParaNoElegir("presentar", req(false, true)), /prueba en seco/);
  // Con la prueba en seco: simular sí, presentar todavía no.
  assert.equal(motivoParaNoElegir("simular", req(true, false)), "");
  assert.match(motivoParaNoElegir("presentar", req(true, false)), /nunca se confirmó una baja real/);
  // Mandada a mano pero sin que la sincronización la traiga cerrada: todavía no.
  assert.match(motivoParaNoElegir("presentar", req(true, false, 1)), /todavía no la trajo cerrada/);
  assert.equal(motivoParaNoElegir("presentar", req(true, true)), "");
});

test("un modo desconocido o ausente es «apagada»", () => {
  assert.equal(modoDe(undefined), "apagada");
  assert.equal(modoDe("cualquiera"), "apagada");
  assert.equal(modoDe("simular"), "simular");
  assert.equal(modoDe("presentar"), "presentar");
});

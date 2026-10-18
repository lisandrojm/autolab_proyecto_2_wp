/**
 *   npx tsx --test src/compartido/planVacaciones/planVacaciones.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { diasDelMes, diasEntre, mesesDeVentana, rangoDelMesEnVentana, sePisan, sumarDias } from "./fechas.js";
import { repartirMes } from "./repartirMes.js";
import { validarPlan, hayErrores, type ContextoDeValidacion, type PlanParaValidar } from "./validarPlan.js";
import { coberturaDelMes } from "./cobertura.js";
import { estadoDerivado } from "./estado.js";

const V = { ventanaDesde: "2026-12-01", ventanaHasta: "2027-03-31" };

describe("fechas del plan", () => {
  it("cuenta días corridos con los dos extremos y suma días sin zona horaria", () => {
    assert.equal(diasEntre("2026-12-01", "2026-12-15"), 15);
    assert.equal(diasEntre("2026-12-15", "2026-12-01"), 0);
    assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
    assert.equal(diasDelMes("2027-02"), 28);
    assert.equal(diasDelMes("2028-02"), 29);
  });
  it("los meses de la ventana, incluidos los de los dos extremos", () => {
    assert.deepEqual(mesesDeVentana(V.ventanaDesde, V.ventanaHasta), ["2026-12", "2027-01", "2027-02", "2027-03"]);
    assert.deepEqual(mesesDeVentana("2027-03-31", "2026-12-01"), []);
  });
  it("el mes recortado a la ventana", () => {
    assert.deepEqual(rangoDelMesEnVentana("2026-12", "2026-12-15", "2027-03-31"), { desde: "2026-12-15", hasta: "2026-12-31", dias: 17 });
    assert.equal(rangoDelMesEnVentana("2026-11", V.ventanaDesde, V.ventanaHasta), null);
  });
  it("se pisan si comparten un día", () => {
    assert.equal(sePisan({ desde: "2026-12-01", hasta: "2026-12-15" }, { desde: "2026-12-15", hasta: "2026-12-20" }), true);
    assert.equal(sePisan({ desde: "2026-12-01", hasta: "2026-12-15" }, { desde: "2026-12-16", hasta: "2026-12-20" }), false);
  });
});

describe("repartir un mes entre las personas de un rol", () => {
  const dos = [
    { userId: "a", disponibles: 21 },
    { userId: "b", disponibles: 28 },
  ];
  it("dos editores en diciembre: 1–15 y 16–30, el 31 libre por el tope de 15", () => {
    const b = repartirMes(dos, "2026-12", { tope: 15, ...V });
    assert.deepEqual(
      b.map((x) => [x.userId, x.desde, x.hasta, x.dias, x.recortadoPor]),
      [
        ["a", "2026-12-01", "2026-12-15", 15, "ninguno"],
        ["b", "2026-12-16", "2026-12-30", 15, "tope"],
      ],
    );
    assert.equal(b[1].segmentoHasta, "2026-12-31");
  });
  it("en un mes de 30 los dos tramos son parejos y nadie queda recortado", () => {
    const b = repartirMes(dos, "2027-04", { tope: 15, ventanaDesde: "2026-12-01", ventanaHasta: "2027-04-30" });
    assert.deepEqual(b.map((x) => [x.desde, x.hasta, x.recortadoPor]), [
      ["2027-04-01", "2027-04-15", "ninguno"],
      ["2027-04-16", "2027-04-30", "ninguno"],
    ]);
  });
  it("tres personas en un mes de 31: 10, 10 y 11 días", () => {
    const b = repartirMes([...dos, { userId: "c", disponibles: 14 }], "2027-01", { tope: 15, ...V });
    assert.deepEqual(b.map((x) => [x.desde, x.hasta, x.dias]), [
      ["2027-01-01", "2027-01-10", 10],
      ["2027-01-11", "2027-01-20", 10],
      ["2027-01-21", "2027-01-31", 11],
    ]);
  });
  it("a quien le corresponden menos días, el bloque se le acorta por saldo y queda hueco", () => {
    const b = repartirMes([{ userId: "a", disponibles: 7 }, { userId: "b", disponibles: 14 }], "2026-12", { tope: 15, ...V });
    assert.deepEqual(b.map((x) => [x.desde, x.hasta, x.dias, x.recortadoPor]), [
      ["2026-12-01", "2026-12-07", 7, "saldo"],
      ["2026-12-16", "2026-12-29", 14, "saldo"],
    ]);
  });
  it("el tope del plan manda aunque sobre saldo", () => {
    const b = repartirMes([{ userId: "a", disponibles: 28 }], "2027-02", { tope: 10, ...V });
    assert.deepEqual(b.map((x) => [x.desde, x.hasta, x.dias, x.recortadoPor]), [["2027-02-01", "2027-02-10", 10, "tope"]]);
  });
  it("una ventana que empieza el 15 reparte el mes desde el 15", () => {
    const b = repartirMes(dos, "2026-12", { tope: 15, ventanaDesde: "2026-12-15", ventanaHasta: "2027-03-31" });
    assert.deepEqual(b.map((x) => [x.desde, x.hasta, x.dias, x.recortadoPor]), [
      ["2026-12-15", "2026-12-22", 8, "ventana"],
      ["2026-12-23", "2026-12-31", 9, "ventana"],
    ]);
  });
  it("sin días disponibles el bloque queda en cero, a la vista", () => {
    const [b] = repartirMes([{ userId: "a", disponibles: 0 }], "2026-12", { tope: 15, ...V });
    assert.equal(b.dias, 0);
    assert.equal(b.recortadoPor, "saldo");
  });
  it("sin personas o con un mes fuera de la ventana no reparte nada", () => {
    assert.deepEqual(repartirMes([], "2026-12", { tope: 15, ...V }), []);
    assert.deepEqual(repartirMes(dos, "2026-10", { tope: 15, ...V }), []);
  });
});

describe("validar el plan", () => {
  const plan = (items: PlanParaValidar["items"]): PlanParaValidar => ({ ...V, topeDiasPorPersona: 15, items });
  const item = (o: Partial<PlanParaValidar["items"][number]> = {}) => ({ id: "i1", userId: "a", desde: "2026-12-01", hasta: "2026-12-15", dias: 15, estado: "propuesto", ...o });
  const ctx = (o: Partial<ContextoDeValidacion> = {}): ContextoDeValidacion => ({ disponiblesDe: { a: 21, b: 14 }, nombreDe: { a: "Ana", b: "Bruno" }, ...o });
  const codigos = (avisos: ReturnType<typeof validarPlan>) => avisos.map((a) => a.codigo).sort();

  it("un plan sano no tiene avisos", () => {
    assert.deepEqual(validarPlan(plan([item()]), ctx()), []);
  });
  it("fuera de la ventana y por encima del tope son errores", () => {
    const avisos = validarPlan(plan([item({ desde: "2026-11-20", hasta: "2026-12-10", dias: 21 })]), ctx());
    assert.deepEqual(codigos(avisos), ["fuera_de_ventana", "supera_tope"]);
    assert.equal(hayErrores(avisos), true);
  });
  it("la suma de los bloques de una persona no puede superar su saldo", () => {
    const avisos = validarPlan(plan([item(), item({ id: "i2", desde: "2027-01-01", hasta: "2027-01-10", dias: 10 })]), ctx({ disponiblesDe: { a: 21 } }));
    assert.deepEqual(codigos(avisos), ["supera_saldo"]);
    assert.match(avisos[0].mensaje, /Ana: los bloques suman 25 días y tiene 21/);
  });
  it("dos bloques de la misma persona que se pisan", () => {
    const avisos = validarPlan(plan([item({ dias: 5, hasta: "2026-12-05" }), item({ id: "i2", desde: "2026-12-05", hasta: "2026-12-09", dias: 5 })]), ctx());
    assert.deepEqual(codigos(avisos), ["se_pisa_consigo"]);
  });
  it("lo rechazado y lo cancelado no cuentan", () => {
    const avisos = validarPlan(plan([item({ estado: "rechazado", dias: 40 }), item({ id: "i2", estado: "cancelado", dias: 40 })]), ctx());
    assert.deepEqual(avisos, []);
  });
  it("vacación ya pedida por la app y bloque en otro plan son avisos, no errores", () => {
    const avisos = validarPlan(
      plan([item()]),
      ctx({ vacacionesExistentes: { a: [{ desde: "2026-12-10", hasta: "2026-12-12", estado: "pending" }] }, itemsDeOtrosPlanes: { a: [{ desde: "2026-12-14", hasta: "2026-12-20", plan: "Otro" }] } }),
    );
    assert.deepEqual(codigos(avisos), ["en_otro_plan", "vacacion_existente"]);
    assert.equal(hayErrores(avisos), false);
  });
  it("fraccionamiento: mínimo por fracción y «no se permite fraccionar» avisan", () => {
    assert.deepEqual(codigos(validarPlan(plan([item({ hasta: "2026-12-05", dias: 5 })]), ctx({ config: { permiteFraccionadas: true, minDiasFraccion: 7 } }))), ["fraccion_minima"]);
    assert.deepEqual(codigos(validarPlan(plan([item()]), ctx({ config: { permiteFraccionadas: false, minDiasFraccion: 7 } }))), ["fraccionamiento_no_permitido"]);
  });
  it("contrato que vence antes del bloque, persona fuera del equipo y regla de solapamiento", () => {
    const avisos = validarPlan(plan([item()]), ctx({ contratoVenceEl: { a: "2026-12-10" }, personasDelEquipo: ["b"], solapamientos: { i1: "Hay 1 persona del mismo rol de vacaciones." } }));
    assert.deepEqual(codigos(avisos), ["contrato_vence_antes", "persona_fuera_del_equipo", "solapamiento_regla"]);
    assert.equal(avisos.filter((a) => a.nivel === "error").length, 2);
  });
});

describe("cobertura del rol en el mes", () => {
  it("cuenta los días con alguien afuera y los días sin nadie", () => {
    const c = coberturaDelMes(
      [
        { userId: "a", desde: "2026-12-01", hasta: "2026-12-15", estado: "propuesto" },
        { userId: "b", desde: "2026-12-16", hasta: "2026-12-30", estado: "propuesto" },
      ],
      ["a", "b"],
      "2026-12",
      V.ventanaDesde,
      V.ventanaHasta,
    );
    assert.equal(c.dias, 31);
    assert.equal(c.diasConAlguienAfuera, 30);
    assert.equal(c.diasSinNadie, 0);
    assert.deepEqual(c.porDia[0], { dia: "2026-12-01", ausentes: ["a"], presentes: 1 });
    assert.deepEqual(c.porDia[30], { dia: "2026-12-31", ausentes: [], presentes: 2 });
  });
  it("los dos a la vez dejan el rol sin nadie; los cancelados no cuentan", () => {
    const c = coberturaDelMes(
      [
        { userId: "a", desde: "2026-12-01", hasta: "2026-12-05", estado: "aprobado" },
        { userId: "b", desde: "2026-12-03", hasta: "2026-12-05", estado: "enviado" },
        { userId: "b", desde: "2026-12-20", hasta: "2026-12-25", estado: "cancelado" },
      ],
      ["a", "b"],
      "2026-12",
      V.ventanaDesde,
      V.ventanaHasta,
    );
    assert.equal(c.diasSinNadie, 3);
    assert.equal(c.diasConAlguienAfuera, 5);
  });
});

describe("estado del plan según sus bloques", () => {
  const e = (...estados: string[]) => estadoDerivado(estados.map((estado) => ({ estado })));
  it("sin bloques o todos propuestos: borrador", () => {
    assert.equal(e(), "borrador");
    assert.equal(e("propuesto", "propuesto"), "borrador");
  });
  it("alguno enviado y ninguno aprobado: enviado", () => {
    assert.equal(e("propuesto", "enviado"), "enviado");
  });
  it("aprobados y otros todavía pendientes: parcial; todos aprobados: cerrado", () => {
    assert.equal(e("aprobado", "enviado"), "parcial");
    assert.equal(e("aprobado", "rechazado"), "parcial");
    assert.equal(e("aprobado", "aprobado", "cancelado"), "cerrado");
  });
  it("sólo rechazados vuelve a borrador (hay que re-armar)", () => {
    assert.equal(e("rechazado", "propuesto"), "borrador");
  });
});

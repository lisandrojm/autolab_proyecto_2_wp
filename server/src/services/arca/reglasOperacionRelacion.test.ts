/**
 * Las reglas de baja, modificación y anulación en ARCA, sin base ni navegador.
 *   npx tsx --test src/services/arca/reglasOperacionRelacion.test.ts
 * Personas y claves inventadas.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { claseDeFallo, planDeAnulacion, planDeBaja, planDeModificacion, planDeOperacion, type ContratoParaOperar, type RelacionEspejo } from "./reglasOperacionRelacion.js";

const HOY = "2026-11-20";
const CATALOGO = new Map([["21", "Renuncia del trabajador"], ["26", "Despido / ART. 245 - LCT"], ["99", "Vencimiento de contrato a plazo fijo"]]);
const contrato = (x: Partial<ContratoParaOperar> = {}): ContratoParaOperar => ({ cuil: "20111111112", empresaCuit: "30222222223", alta: "2026-11-01", baja: "2026-11-30", altaArcaPresentada: { resultado: "presentada", cat: "1".repeat(20) }, ...x });
const espejo = (x: Partial<RelacionEspejo> = {}): RelacionEspejo => ({ inicio: "2026-11-01", fin: "", situacionBaja: "", modalidad: "022", retribucion: 1000, sincronizadoEl: "2026-11-20T09:00:00.000Z", ...x });

describe("prerrequisitos comunes", () => {
  it("sin CUIL, sin CUIT de la empleadora o sin alta válida no se opera", () => {
    assert.match(planDeBaja(contrato({ cuil: "123" }), null, { situacionBaja: "99" }, HOY).motivo, /CUIL/);
    assert.match(planDeBaja(contrato({ empresaCuit: "" }), null, { situacionBaja: "99" }, HOY).motivo, /CUIT/);
    assert.match(planDeBaja(contrato({ alta: "01/11/2026" }), null, { situacionBaja: "99" }, HOY).motivo, /fecha de alta/);
  });
  it("sin alta presentada ni relación en el espejo no hay sobre qué operar; con el espejo alcanza", () => {
    assert.match(planDeBaja(contrato({ altaArcaPresentada: null }), null, { situacionBaja: "99" }, HOY).motivo, /no tiene el alta presentada/);
    assert.equal(planDeBaja(contrato({ altaArcaPresentada: null }), espejo(), { situacionBaja: "99" }, HOY).puede, true);
    assert.match(planDeBaja(contrato({ altaArcaPresentada: null }), espejo({ inicio: "2026-10-01" }), { situacionBaja: "99" }, HOY).motivo, /no tiene el alta/, "otra fecha de inicio no es esta relación");
  });
  it("un alta sin confirmar o anulada corta antes de cualquier operación", () => {
    assert.match(planDeBaja(contrato({ altaArcaPresentada: { resultado: "indeterminado" } }), null, { situacionBaja: "99" }, HOY).motivo, /sin confirmar/);
    assert.match(planDeModificacion(contrato({ altaArcaPresentada: { resultado: "anulada" } }), null, { cambios: { fechaFin: "2026-12-01" } }, HOY).motivo, /anulada/);
  });
});

describe("baja", () => {
  it("con fecha y motivo válidos se puede, y el payload es exactamente lo que va a ARCA", () => {
    const p = planDeBaja(contrato(), espejo(), { situacionBaja: "99" }, HOY, CATALOGO);
    assert.equal(p.puede, true);
    assert.deepEqual(p.payload, { fechaFin: "2026-11-30", situacionBaja: "99" });
    assert.ok(p.avisos.some((a) => /futura/.test(a)), "una baja a futuro se avisa");
  });
  it("la fecha de fin por defecto es la baja del contrato; sin ninguna, no se puede", () => {
    assert.match(planDeBaja(contrato({ baja: "" }), espejo(), { situacionBaja: "99" }, HOY).motivo, /Falta la fecha de fin/);
    assert.equal(planDeBaja(contrato({ baja: "" }), espejo(), { fechaFin: "2026-11-15", situacionBaja: "99" }, HOY).payload.fechaFin, "2026-11-15");
  });
  it("fin anterior al alta, motivo vacío o fuera de la tabla, telegrama mal escrito: no", () => {
    assert.match(planDeBaja(contrato(), espejo(), { fechaFin: "2026-10-01", situacionBaja: "99" }, HOY).motivo, /anterior al alta/);
    assert.match(planDeBaja(contrato(), espejo(), { situacionBaja: "" }, HOY).motivo, /Elegí el motivo/);
    assert.match(planDeBaja(contrato(), espejo(), { situacionBaja: "77" }, HOY, CATALOGO).motivo, /no está en la tabla/);
    assert.match(planDeBaja(contrato(), espejo(), { situacionBaja: "21", fechaTelegrama: "15/11/2026" }, HOY).motivo, /telegrama/);
  });
  it("idempotente: una baja presentada, presentando o indeterminada traba; una fallida no", () => {
    assert.match(planDeBaja(contrato({ bajaArcaPresentada: { resultado: "presentada", fecha: "2026-11-19", acuse: { cbt: "9".repeat(20) } } }), espejo(), { situacionBaja: "99" }, HOY).motivo, /ya se mandó.*C\.B\.T\./);
    assert.match(planDeBaja(contrato({ bajaArcaPresentada: { resultado: "presentando" } }), espejo(), { situacionBaja: "99" }, HOY).motivo, /se cortó sin resultado/);
    assert.match(planDeBaja(contrato({ bajaArcaPresentada: { resultado: "indeterminado" } }), espejo(), { situacionBaja: "99" }, HOY).motivo, /no se pudo leer/);
    assert.equal(planDeBaja(contrato({ bajaArcaPresentada: { resultado: "fallida", clase: "navegacion" } as any }), espejo(), { situacionBaja: "99" }, HOY).puede, true);
  });
  it("si el espejo ya tiene la baja con esa fecha no se manda; con otra fecha, es una modificación", () => {
    assert.match(planDeBaja(contrato(), espejo({ fin: "2026-11-30", situacionBaja: "Vencimiento" }), { situacionBaja: "99" }, HOY).motivo, /ya tiene la baja al 30\/11\/2026/);
    assert.match(planDeBaja(contrato(), espejo({ fin: "2026-11-25" }), { situacionBaja: "99" }, HOY).motivo, /MODIFICACIÓN/);
  });
  it("avisa el plazo de 5 días, la diferencia con la baja del contrato y el telegrama de la renuncia", () => {
    const tarde = planDeBaja(contrato({ baja: "2026-11-10" }), espejo(), { situacionBaja: "26" }, HOY);
    assert.ok(tarde.avisos.some((a) => /10 días después del fin.*5 días/.test(a)));
    const distinta = planDeBaja(contrato(), espejo(), { fechaFin: "2026-11-28", situacionBaja: "99" }, HOY);
    assert.ok(distinta.avisos.some((a) => /no es la fecha de baja del contrato \(30\/11\/2026\)/.test(a)));
    assert.ok(planDeBaja(contrato(), espejo(), { situacionBaja: "21" }, HOY).avisos.some((a) => /telegrama/.test(a)));
    assert.ok(!planDeBaja(contrato(), espejo(), { situacionBaja: "21", fechaTelegrama: "2026-11-15" }, HOY).avisos.some((a) => /telegrama/.test(a)));
    assert.ok(planDeBaja(contrato({ baja: "" }), espejo(), { fechaFin: "2026-11-20", situacionBaja: "26" }, HOY).avisos.some((a) => /no tiene fecha de baja en WeProdu/.test(a)));
  });
});

describe("modificación", () => {
  it("sólo los campos conocidos, y al menos uno", () => {
    assert.match(planDeModificacion(contrato(), espejo(), { cambios: {} }, HOY).motivo, /ningún cambio/);
    assert.match(planDeModificacion(contrato(), espejo(), { cambios: { sueldo: 1 } as any }, HOY).motivo, /No se puede modificar: sueldo/);
    const p = planDeModificacion(contrato(), espejo(), { cambios: { fechaFin: "2026-12-15", retribucion: 1500 } }, HOY);
    assert.equal(p.puede, true);
    assert.deepEqual(p.payload, { fechaFin: "2026-12-15", retribucion: "1500" });
  });
  it("valida fechas, importes y el RNOS", () => {
    assert.match(planDeModificacion(contrato(), espejo(), { cambios: { fechaFin: "15/12/2026" } }, HOY).motivo, /aaaa-mm-dd/);
    assert.match(planDeModificacion(contrato(), espejo(), { cambios: { fechaFin: "2026-10-01" } }, HOY).motivo, /anterior al alta/);
    assert.match(planDeModificacion(contrato(), espejo(), { cambios: { fechaInicio: "2026-12-01", fechaFin: "2026-11-30" } }, HOY).motivo, /anterior a la de inicio/);
    assert.match(planDeModificacion(contrato(), espejo(), { cambios: { retribucion: "cero" } }, HOY).motivo, /mayor que cero/);
    assert.match(planDeModificacion(contrato(), espejo(), { cambios: { obraSocial: "1209" } }, HOY).motivo, /6 dígitos/);
  });
  it("idempotente: una modificación sin resultado traba; la misma modificación ya presentada no se repite; otra distinta sí", () => {
    assert.match(planDeModificacion(contrato({ modificacionArcaPresentada: { resultado: "presentando" } }), espejo(), { cambios: { fechaFin: "2026-12-15" } }, HOY).motivo, /se cortó sin resultado/);
    const hecha = { resultado: "presentada", fecha: "2026-11-19", payload: { fechaFin: "2026-12-15" } };
    assert.match(planDeModificacion(contrato({ modificacionArcaPresentada: hecha }), espejo(), { cambios: { fechaFin: "2026-12-15" } }, HOY).motivo, /ya se mandó/);
    assert.equal(planDeModificacion(contrato({ modificacionArcaPresentada: hecha }), espejo(), { cambios: { fechaFin: "2026-12-20" } }, HOY).puede, true);
  });
  it("lo que el espejo ya tiene igual no se manda", () => {
    assert.match(planDeModificacion(contrato(), espejo({ fin: "2026-12-15", retribucion: 1500 }), { cambios: { fechaFin: "2026-12-15", retribucion: "1500.00" } }, HOY).motivo, /ya tiene esos valores/);
    assert.match(planDeModificacion(contrato(), espejo({ modalidad: "022" }), { cambios: { modalidadContrato: "22" } }, HOY).motivo, /ya tiene esos valores/, "los códigos se comparan con sus ceros");
    const parcial = planDeModificacion(contrato(), espejo({ fin: "2026-12-15" }), { cambios: { fechaFin: "2026-12-15", puesto: "4132" } }, HOY);
    assert.equal(parcial.puede, true, "el puesto no está en el espejo: se manda igual");
    assert.ok(parcial.avisos.some((a) => /Fecha de fin: el espejo de ARCA ya tiene/.test(a)));
  });
  it("avisa que el contrato de WeProdu no cambia y lo que implica mover la fecha de inicio", () => {
    const p = planDeModificacion(contrato(), espejo(), { cambios: { fechaInicio: "2026-11-02" } }, HOY);
    assert.ok(p.avisos.some((a) => /El contrato en WeProdu no se cambia/.test(a)));
    assert.ok(p.avisos.some((a) => /identidad de la relación/.test(a)));
  });
});

describe("anulación", () => {
  it("hay que decir qué se anula", () => {
    assert.match(planDeAnulacion(contrato(), espejo(), { que: "todo" } as any, HOY).motivo, /qué se anula/);
  });
  it("del alta: se puede si no hay baja; avisa si la relación ya empezó", () => {
    const p = planDeAnulacion(contrato({ alta: "2026-11-25" }), espejo({ inicio: "2026-11-25" }), { que: "alta" }, HOY);
    assert.equal(p.puede, true);
    assert.ok(!p.avisos.some((a) => /ya empezó/.test(a)));
    assert.ok(p.avisos.some((a) => /no anula el contrato en WeProdu/.test(a)));
    assert.ok(planDeAnulacion(contrato(), espejo(), { que: "alta" }, HOY).avisos.some((a) => /ya empezó/.test(a)));
    assert.match(planDeAnulacion(contrato(), espejo({ fin: "2026-11-30" }), { que: "alta" }, HOY).motivo, /anular es la baja, no el alta/);
    assert.match(planDeAnulacion(contrato({ bajaArcaPresentada: { resultado: "presentada" } }), espejo(), { que: "alta" }, HOY).motivo, /ya tiene la baja/);
  });
  it("de la baja: hace falta una baja registrada (mandada desde acá o en el espejo), y confirmada", () => {
    assert.match(planDeAnulacion(contrato(), espejo(), { que: "baja" }, HOY).motivo, /no hay baja que anular/);
    assert.equal(planDeAnulacion(contrato(), espejo({ fin: "2026-11-30" }), { que: "baja" }, HOY).puede, true);
    assert.equal(planDeAnulacion(contrato({ bajaArcaPresentada: { resultado: "presentada" } }), espejo(), { que: "baja" }, HOY).puede, true);
    assert.match(planDeAnulacion(contrato({ bajaArcaPresentada: { resultado: "indeterminado" } }), espejo({ fin: "2026-11-30" }), { que: "baja" }, HOY).motivo, /sin confirmar/);
  });
  it("idempotente: una anulación sin resultado traba; la misma ya hecha no se repite", () => {
    assert.match(planDeAnulacion(contrato({ anulacionArcaPresentada: { resultado: "indeterminado" } }), espejo(), { que: "alta" }, HOY).motivo, /no se pudo leer/);
    assert.match(planDeAnulacion(contrato({ anulacionArcaPresentada: { resultado: "presentada", que: "alta", fecha: "2026-11-19" } }), espejo(), { que: "alta" }, HOY).motivo, /ya se anuló/);
  });
});

describe("planDeOperacion y la clase del fallo", () => {
  it("despacha por operación y rechaza una desconocida", () => {
    assert.equal(planDeOperacion("baja", contrato(), espejo(), { situacionBaja: "99" }, HOY).op, "baja");
    assert.equal(planDeOperacion("x" as any, contrato(), espejo(), {} as any, HOY).puede, false);
  });
  it("un error marcado por el motor como regla de ARCA es regla_arca; el resto, navegación", () => {
    assert.equal(claseDeFallo(Object.assign(new Error("deshabilitado"), { reglaArca: true })), "regla_arca");
    assert.equal(claseDeFallo(new Error("Timeout")), "navegacion");
    assert.equal(claseDeFallo({ clase: "regla_arca" }), "regla_arca");
  });
});

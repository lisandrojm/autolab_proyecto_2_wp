/**
 * Tests de las dos funciones que deciden en qué hoja del archivo cae cada persona.
 *
 *   npm run test:liquidacion
 *
 * LOS CASOS SON LOS NOMBRES REALES, medidos contra producción el 2026-09-20. No hay fixtures
 * inventados: cada uno de estos strings existe hoy en los contratos vigentes de agosto, con la
 * cantidad de contratos que dice el comentario. Un test con datos de fantasía habría pasado igual
 * y no habría encontrado el caso del "+ Release JSA FZERO", que es el que importa.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { empresaDelContrato, regimenDelContrato, contratoVigenteEn, limitesDelPeriodo, normalizarRazonSocial, resolvio } from "./contratos.js";

/** Las tres empleadoras reales, con sus ids de producción acortados por legibilidad. */
const EMPRESAS = [
  { id: "emp2030", razonSocial: "2030 S.R.L." },
  { id: "empFzero", razonSocial: "FZERO S.R.L" },
  { id: "empGrini", razonSocial: "GRINI S.R.L." },
];

describe("liquidación · de qué empresa es el contrato", () => {
  it("cuando el campo está cargado, manda el campo", () => {
    const r = empresaDelContrato({ empresaContratoId: "empFzero", nombre_contrato: "Jornada 2030 SRL" }, EMPRESAS);

    assert.ok(resolvio(r));
    assert.equal(r.valor, "empFzero", "el dato explícito le gana al texto, siempre");
    assert.equal(r.origen, "campo");
  });

  it("sin campo, la saca del nombre del contrato", () => {
    // 334 contratos vigentes en agosto se llaman así: es el caso más común de todos.
    const r = empresaDelContrato({ nombre_contrato: "Jornada 2030 SRL" }, EMPRESAS);

    assert.ok(resolvio(r));
    assert.equal(r.valor, "emp2030");
    assert.equal(r.origen, "nombre_contrato");
  });

  it("le da igual cómo esté escrita la razón social", () => {
    // El contrato dice "FZERO SRL"; la empresa está dada de alta como "FZERO S.R.L". Son la misma.
    const r = empresaDelContrato({ nombre_contrato: "Servicios - FZERO SRL" }, EMPRESAS);

    assert.ok(resolvio(r));
    assert.equal(r.valor, "empFzero");
  });

  it("si el nombre menciona DOS empresas, no elige ninguna", () => {
    // 57 contratos vigentes. Cuál emplea y cuál recibe el release lo dice RRHH, no un string.
    const r = empresaDelContrato({ nombre_contrato: "Plazo fijo 5x10 2030 SRL + Release JSA FZERO " }, EMPRESAS);

    assert.ok(!resolvio(r));
    assert.equal(r.motivo, "empresa_ambigua");
    assert.match(r.detalle, /2030/);
    assert.match(r.detalle, /FZERO/);
  });

  it("si el nombre no menciona ninguna, lo dice en vez de inventar", () => {
    // 10 contratos vigentes se llaman así, sin empresa por ningún lado.
    const r = empresaDelContrato({ nombre_contrato: "Tiempo Indeterminado" }, EMPRESAS);

    assert.ok(!resolvio(r));
    assert.equal(r.motivo, "empresa_sin_dato");
  });

  it("FZERO CORP no se confunde con FZERO S.R.L", () => {
    /*
      Son dos entidades distintas: la SRL argentina y la corporación de Estados Unidos. La CORP
      tiene centros de costo en Tango pero NO es empleadora, así que no está en la lista, y un
      contrato que la nombre tiene que quedar sin resolver en lugar de caer en la SRL.
    */
    const r = empresaDelContrato({ nombre_contrato: "Eventual Crew FZERO CORP" }, EMPRESAS);

    assert.ok(!resolvio(r));
  });

  it("normalizar pega la sigla pero no borra la forma jurídica", () => {
    assert.equal(normalizarRazonSocial("2030 S.R.L."), "2030 SRL", "la sigla se pega: es como la escriben en los contratos");
    assert.notEqual(normalizarRazonSocial("FZERO S.R.L"), normalizarRazonSocial("FZERO CORP"));
  });
});

describe("liquidación · bajo qué régimen se liquida", () => {
  it("el tipo Jornada es jornalero", () => {
    const r = regimenDelContrato({ tipo_contrato_id: 3, cantidad_jornadas_laborales: 1 });

    assert.ok(resolvio(r));
    assert.equal(r.valor, "jornalero");
  });

  it("tiempo indeterminado con 30 jornadas es mensual", () => {
    const r = regimenDelContrato({ tipo_contrato_id: 4, cantidad_jornadas_laborales: 30 });

    assert.ok(resolvio(r));
    assert.equal(r.valor, "mensual");
  });

  it("si el tipo no existe en el catálogo, lo resuelven las jornadas", () => {
    // El id 16 aparece en 57 contratos vigentes y no está entre los 8 del catálogo FRAME.
    const r = regimenDelContrato({ tipo_contrato_id: 16, cantidad_jornadas_laborales: 30 });

    assert.ok(resolvio(r));
    assert.equal(r.valor, "mensual");
    assert.equal(r.origen, "jornadas", "hay que poder ver que salió del lado débil");
  });

  it("si el tipo y las jornadas se contradicen, no desempata", () => {
    const r = regimenDelContrato({ tipo_contrato_id: 4, cantidad_jornadas_laborales: 1 });

    assert.ok(!resolvio(r));
    assert.equal(r.motivo, "regimen_contradictorio", "un indeterminado de una sola jornada está mal cargado");
  });

  it("con 7 jornadas no se arriesga", () => {
    // Existen contratos de 2, 4, 7, 13, 18, 20 y 21 jornadas. Qué son se decide con RRHH.
    const r = regimenDelContrato({ tipo_contrato_id: 11, cantidad_jornadas_laborales: 7 });

    assert.ok(!resolvio(r));
    assert.equal(r.motivo, "regimen_sin_dato");
  });

  it("los contratos de Servicios quedan afuera, no adentro", () => {
    // Se facturan, no se liquidan por recibo. Meterlos en una hoja sería un error silencioso.
    const r = regimenDelContrato({ tipo_contrato_id: 6, cantidad_jornadas_laborales: 22 });

    assert.ok(!resolvio(r));
  });
});

describe("liquidación · vigencia en el período", () => {
  const { desde, hasta } = limitesDelPeriodo("2026-08");

  it("agosto de 2026 va del 1 al 31", () => {
    assert.equal(desde, "2026-08-01");
    assert.equal(hasta, "2026-08-31");
  });

  it("febrero no inventa días", () => {
    assert.equal(limitesDelPeriodo("2026-02").hasta, "2026-02-28");
  });

  it("sin fecha de baja sigue vigente", () => {
    // Es el caso de todos los de planta permanente: tratarlos como terminados los dejaría sin sueldo.
    assert.equal(contratoVigenteEn({ fecha_alta_contrato: "2023-06-01T00:00:00.000Z", fecha_baja_contrato: null }, desde, hasta), true);
  });

  it("el que se fue antes del período no entra", () => {
    assert.equal(contratoVigenteEn({ fecha_alta_contrato: "2023-06-01", fecha_baja_contrato: "2026-07-31" }, desde, hasta), false);
  });

  it("el que se fue durante el período sí entra", () => {
    // Trabajó parte del mes: hay que liquidarle esos días.
    assert.equal(contratoVigenteEn({ fecha_alta_contrato: "2023-06-01", fecha_baja_contrato: "2026-08-15" }, desde, hasta), true);
  });

  it("el que entra después del período no entra todavía", () => {
    assert.equal(contratoVigenteEn({ fecha_alta_contrato: "2026-09-01", fecha_baja_contrato: null }, desde, hasta), false);
  });

  it("sin fecha de alta no se lo puede ubicar en el tiempo", () => {
    assert.equal(contratoVigenteEn({ fecha_alta_contrato: null }, desde, hasta), false);
  });
});

/**
 * La corrida de baja / modificación / anulación contra un ARCA simulado: qué se escribe, cuándo y con qué clase.
 *   npx tsx --test src/services/arca/corridaOperacionRelacion.test.ts
 * Personas y claves inventadas.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ejecutarOperacion, resultadoParaMarca, type GuardadoOperacion, type MotorOperaciones, type ResultadoOperacion } from "./corridaOperacionRelacion.js";

const ARGS = { empresaCuit: "30222222223", cuil: "20111111112", fechaInicio: "2026-11-01", fechaFin: "2026-11-30", datos: { fechaFin: "2026-11-30", situacionBaja: "99" } };

/** Un guardado que anota qué se escribió y en qué orden. */
const guardado = () => {
  const escrito: Array<{ que: string; v: any }> = [];
  const g: GuardadoOperacion = {
    presentando: async (payload) => void escrito.push({ que: "presentando", v: payload }),
    resultado: async (r) => void escrito.push({ que: "resultado", v: r }),
  };
  return { g, escrito };
};

/** Un motor que hace lo que diga `plan` para cada operación. */
const motor = (plan: (o: any) => Promise<ResultadoOperacion>): MotorOperaciones => ({ registrarBaja: plan, modificarRelacion: plan, anularRelacion: plan });

describe("ejecutarOperacion", () => {
  it("en seco: el motor recibe enSeco, no se deja rastro y no se guarda ningún resultado", async () => {
    const { g, escrito } = guardado();
    const vistos: any[] = [];
    const r = await ejecutarOperacion({ op: "baja", args: ARGS, enSeco: true, motor: motor(async (o) => (vistos.push(o), { resultado: "seco", payload: { fechaFin: "30/11/2026", situacionBaja: "99" } })), guardar: g });
    assert.equal(r.resultado, "seco");
    assert.equal(vistos[0].enSeco, true);
    assert.deepEqual(vistos[0].situacionBaja, "99");
    assert.deepEqual(escrito, []);
  });

  it("presentada: el rastro se escribe ANTES de confirmar y el resultado después, con el acuse", async () => {
    const { g, escrito } = guardado();
    const eventos: any[] = [];
    const r = await ejecutarOperacion({
      op: "baja",
      args: ARGS,
      enSeco: false,
      motor: motor(async (o) => {
        await o.antesDeConfirmar({ fechaFin: "30/11/2026", situacionBaja: "99" });
        o.onProgreso({ tipo: "irreversible", que: "confirmar_baja" });
        return { resultado: "presentada", acuse: { cbt: "9".repeat(20) }, payload: { fechaFin: "30/11/2026", situacionBaja: "99" }, leidoDe: "listado" };
      }),
      guardar: g,
      emitir: (e) => eventos.push(e),
    });
    assert.equal(r.resultado, "presentada");
    assert.deepEqual(escrito.map((e) => e.que), ["presentando", "resultado"]);
    assert.deepEqual(escrito[0].v, { fechaFin: "30/11/2026", situacionBaja: "99" });
    assert.equal(escrito[1].v.acuse.cbt, "9".repeat(20));
    assert.equal(eventos.at(-1).tipo, "fin");
    assert.equal(eventos.at(-1).resultado, "presentada");
  });

  it("rechazada por ARCA: queda guardada como fallida con clase regla_arca y el motivo literal", async () => {
    const { g, escrito } = guardado();
    const r = await ejecutarOperacion({ op: "baja", args: ARGS, enSeco: false, motor: motor(async (o) => (await o.antesDeConfirmar({}), { resultado: "rechazada", clase: "regla_arca", motivo: "La fecha de fin no puede ser anterior a la de inicio" })), guardar: g });
    assert.equal(r.resultado, "rechazada");
    assert.equal(escrito[1].que, "resultado");
    assert.deepEqual(resultadoParaMarca(escrito[1].v), { marca: "fallida", log: "rechazada", clase: "regla_arca", porConsulta: false });
  });

  it("el ícono deshabilitado o la relación que no está es regla de ARCA; no deja rastro", async () => {
    const { g, escrito } = guardado();
    const r = await ejecutarOperacion({ op: "modificacion", args: { ...ARGS, datos: { cambios: { fechaFin: "2026-12-01" } } }, enSeco: false, motor: motor(async () => ({ resultado: "fallida", clase: "regla_arca", motivo: "ARCA tiene deshabilitado «Modificar Registro» para esta relación." })), guardar: g });
    assert.equal(r.clase, "regla_arca");
    assert.deepEqual(escrito.map((e) => e.que), ["resultado"]);
    assert.equal(resultadoParaMarca(escrito[0].v).clase, "regla_arca");
  });

  it("el motor tira ANTES del rastro: fallida de navegación, se puede reintentar, y queda el evento de fallo", async () => {
    const { g, escrito } = guardado();
    const eventos: any[] = [];
    const r = await ejecutarOperacion({ op: "baja", args: ARGS, enSeco: false, motor: motor(async () => { throw Object.assign(new Error("ARCA no abrió el formulario de baja (estoy en otra)."), { html: "<html/>" }); }), guardar: g, emitir: (e) => eventos.push(e) });
    assert.deepEqual([r.resultado, r.clase], ["fallida", "navegacion"]);
    assert.equal(r.html, "<html/>");
    assert.deepEqual(escrito.map((e) => e.que), ["resultado"]);
    assert.ok(eventos.some((e) => e.tipo === "fallo" && e.clase === "navegacion"));
  });

  it("el motor tira marcado como regla de ARCA (código fuera del catálogo): regla_arca", async () => {
    const { g } = guardado();
    const r = await ejecutarOperacion({ op: "baja", args: ARGS, enSeco: false, motor: motor(async () => { throw Object.assign(new Error("El código «77» no está en el catálogo l_SBV"), { reglaArca: true }); }), guardar: g });
    assert.deepEqual([r.resultado, r.clase], ["fallida", "regla_arca"]);
  });

  it("el motor tira DESPUÉS del rastro: indeterminado, nunca se reintenta", async () => {
    const { g, escrito } = guardado();
    const r = await ejecutarOperacion({ op: "anulacion", args: { ...ARGS, datos: { que: "alta" } }, enSeco: false, motor: motor(async (o) => { await o.antesDeConfirmar({ que: "alta" }); throw new Error("Page crashed"); }), guardar: g });
    assert.equal(r.resultado, "indeterminado");
    assert.match(r.motivo || "", /NO la vuelvas a mandar/);
    assert.deepEqual(escrito.map((e) => e.que), ["presentando", "resultado"]);
    assert.equal(resultadoParaMarca(escrito[1].v).marca, "indeterminado");
  });

  it("si no se puede dejar el rastro, el motor recibe el error y no confirma", async () => {
    const g: GuardadoOperacion = { presentando: async () => { throw new Error("Mongo caído"); }, resultado: async () => {} };
    let confirmo = false;
    const r = await ejecutarOperacion({
      op: "baja",
      args: ARGS,
      enSeco: false,
      motor: motor(async (o) => {
        await o.antesDeConfirmar({});
        confirmo = true;
        return { resultado: "presentada" };
      }),
      guardar: g,
    });
    assert.equal(confirmo, false);
    assert.deepEqual([r.resultado, r.clase], ["fallida", "navegacion"]);
  });

  it("ya hecha en ARCA: queda como presentada por consulta, sin rastro previo", async () => {
    const { g, escrito } = guardado();
    const r = await ejecutarOperacion({ op: "baja", args: ARGS, enSeco: false, motor: motor(async () => ({ resultado: "ya_hecha", acuse: { cbt: "1".repeat(20) }, motivo: "ARCA ya tiene la baja" })), guardar: g });
    assert.equal(r.resultado, "ya_hecha");
    assert.deepEqual(escrito.map((e) => e.que), ["resultado"]);
    assert.deepEqual(resultadoParaMarca(escrito[0].v), { marca: "presentada", log: "ya_hecha", clase: "", porConsulta: true });
  });

  it("cada operación llama a su función del motor con sus datos", async () => {
    const llamadas: string[] = [];
    const m: MotorOperaciones = {
      registrarBaja: async (o) => (llamadas.push(`baja:${o.situacionBaja}:${o.fechaTelegrama}`), { resultado: "seco" }),
      modificarRelacion: async (o) => (llamadas.push(`mod:${JSON.stringify(o.cambios)}`), { resultado: "seco" }),
      anularRelacion: async (o) => (llamadas.push(`anul:${o.que}`), { resultado: "seco" }),
    };
    const { g } = guardado();
    await ejecutarOperacion({ op: "baja", args: { ...ARGS, datos: { situacionBaja: "21", fechaTelegrama: "2026-11-15" } }, enSeco: true, motor: m, guardar: g });
    await ejecutarOperacion({ op: "modificacion", args: { ...ARGS, datos: { cambios: { retribucion: "1500" }, obraSocialTexto: "" } }, enSeco: true, motor: m, guardar: g });
    await ejecutarOperacion({ op: "anulacion", args: { ...ARGS, datos: { que: "baja" } }, enSeco: true, motor: m, guardar: g });
    assert.deepEqual(llamadas, ["baja:21:2026-11-15", 'mod:{"retribucion":"1500"}', "anul:baja"]);
  });
});

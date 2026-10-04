import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { partirEnTandas } from "../../compartido/layoutAltaArca.js";
import { GuardadoTandas, ItemTanda, MotorTandas, ResultadoItem, correrTandas, fechaInicioDeRegistro85 } from "./tandasAltas.js";

/**
 * UN ARCA SIMULADO: recuerda qué altas registró, y se le puede pedir que rechace una fila, que
 * bloquee una tanda, que se caiga después del «Aceptar» o que cambie el tope del pegado. Lo que se
 * prueba es que, pase lo que pase, NINGUNA alta se registra dos veces.
 */
function arcaSimulado(opts: { tope?: number | null; rechaza?: string[]; bloquea?: string[]; seCaeEnTanda?: number; sinResultadoEnTanda?: number; consultaNoVe?: string[]; seco?: boolean } = {}) {
  const registradas: string[] = [];
  const consultados: string[] = [];
  const tandasPegadas: string[][] = [];
  let tanda = 0;
  const motor: MotorTandas = {
    leerTope: async () => (opts.tope === undefined ? 9 : opts.tope),
    presentar: async ({ cuils, tope, antesDeAceptar }) => {
      tanda++;
      tandasPegadas.push(cuils);
      if (cuils.length > tope) throw new Error("la tanda supera el tope");
      if (opts.seco) return { resultado: "seco" };
      const rechazadas = cuils.filter((c) => opts.rechaza?.includes(c));
      const aGrilla = cuils.filter((c) => !rechazadas.includes(c));
      const porPersona = rechazadas.map((cuil) => ({ cuil, estado: "rechazada", motivo: `Error: el CUIL ${cuil} no es válido` }));
      if (aGrilla.length === 0) return { resultado: "rechazada", porPersona };
      await antesDeAceptar(aGrilla);
      // Una fila que bloquea: ARCA no registra NINGUNA de la tanda.
      const bloqueo = aGrilla.find((c) => opts.bloquea?.includes(c));
      if (bloqueo) {
        opts.bloquea = opts.bloquea!.filter((c) => c !== bloqueo);
        return { resultado: "aceptada", porPersona: [...porPersona, ...aGrilla.map((cuil) => (cuil === bloqueo ? { cuil, estado: "rechazada", motivo: `Error en ${cuil}: fecha inválida` } : { cuil, estado: "devuelta" }))] };
      }
      // El «Aceptar» se apretó: ARCA las registra, se pueda leer el resultado o no.
      for (const c of aGrilla) {
        assert.ok(!registradas.includes(c), `ALTA DUPLICADA de ${c}`);
        registradas.push(c);
      }
      if (opts.seCaeEnTanda === tanda) throw new Error("Se cayó la sesión de ARCA");
      if (opts.sinResultadoEnTanda === tanda) return { resultado: "indeterminado", porPersona: [...porPersona, ...aGrilla.map((cuil) => ({ cuil, estado: "indeterminado" }))] };
      return { resultado: "aceptada", porPersona: [...porPersona, ...aGrilla.map((cuil) => ({ cuil, estado: "alta" }))] };
    },
    consultar: async ({ cuil }) => {
      consultados.push(cuil);
      return { encontrada: registradas.includes(cuil) && !opts.consultaNoVe?.includes(cuil) ? true : null };
    },
  };
  return { motor, registradas, consultados, tandasPegadas };
}

/** La base simulada: lo que queda escrito en cada contrato, en el orden en que se escribió. */
function baseSimulada() {
  const contratos = new Map<string, string>();
  const escrituras: string[] = [];
  const guardar: GuardadoTandas = {
    presentando: async (items, tanda) => {
      for (const i of items) {
        contratos.set(i.cuil, "presentando");
        escrituras.push(`presentando:${i.cuil}:t${tanda}`);
      }
    },
    resultado: async (r: ResultadoItem) => {
      if (r.estado === "pendiente") contratos.delete(r.item.cuil);
      else contratos.set(r.item.cuil, r.estado);
      escrituras.push(`${r.estado}:${r.item.cuil}`);
    },
    tanda: async (t) => {
      escrituras.push(`tanda:${t.n}`);
    },
  };
  return { guardar, contratos, escrituras };
}

const item = (n: number): ItemTanda => {
  const cuil = `20${String(n).padStart(8, "0")}1`;
  // Registro de 85 con la fecha de inicio 05102026 en 48–55.
  const registro = (cuil + "0".repeat(36)).padEnd(47, "0") + "05102026" + " ".repeat(30);
  return { userProjectId: `up${n}`, contractIndex: 0, cuil, nombre: `Persona ${n}`, registro };
};
const items = (cuantos: number) => Array.from({ length: cuantos }, (_, i) => item(i + 1));
const estados = (r: { resultados: ResultadoItem[] }) => r.resultados.map((x) => x.estado);

describe("partirEnTandas", () => {
  it("parte en tandas de a lo sumo el tope, sin perder ni repetir a nadie", () => {
    const t = partirEnTandas(items(20), 9);
    assert.deepEqual(t.map((x) => x.length), [9, 9, 2]);
    assert.deepEqual(t.flat().map((x) => x.cuil), items(20).map((x) => x.cuil));
    assert.deepEqual(partirEnTandas(items(9), 9).map((x) => x.length), [9]);
    assert.deepEqual(partirEnTandas([], 9), []);
  });
  it("un tope que no sirve no parte nada: tira", () => {
    assert.throws(() => partirEnTandas(items(3), 0));
    assert.throws(() => partirEnTandas(items(3), Number.NaN));
  });
});

describe("correrTandas contra un ARCA simulado", () => {
  it("presenta 20 contratos en tres tandas, una después de la otra, y guarda cada alta antes de la tanda siguiente", async () => {
    const arca = arcaSimulado();
    const base = baseSimulada();
    const r = await correrTandas({ items: items(20), enSeco: false, motor: arca.motor, guardar: base.guardar });
    assert.deepEqual(arca.tandasPegadas.map((t) => t.length), [9, 9, 2]);
    assert.equal(arca.registradas.length, 20);
    assert.ok(estados(r).every((e) => e === "registrada"));
    assert.equal(r.corte, undefined);
    // El orden: «presentando» de la tanda 1 → sus resultados → cierre de la tanda 1 → recién la tanda 2.
    const iCierre1 = base.escrituras.indexOf("tanda:1");
    const iPrimeraDeLa2 = base.escrituras.findIndex((e) => e.endsWith(":t2"));
    assert.ok(iCierre1 > 0 && iCierre1 < iPrimeraDeLa2);
    assert.equal(base.escrituras.slice(0, iCierre1).filter((e) => e.startsWith("registrada:")).length, 9);
    assert.ok(base.escrituras.indexOf(`presentando:${item(1).cuil}:t1`) < base.escrituras.indexOf(`registrada:${item(1).cuil}`));
  });

  it("usa el menor entre el tope de la pantalla y la constante", async () => {
    const chico = arcaSimulado({ tope: 5 });
    const r1 = await correrTandas({ items: items(12), enSeco: false, motor: chico.motor, guardar: baseSimulada().guardar });
    assert.deepEqual(chico.tandasPegadas.map((t) => t.length), [5, 5, 2]);
    assert.equal(r1.tope, 5);
    // Si ARCA dijera 20, no se estira: manda la constante.
    const grande = arcaSimulado({ tope: 20 });
    const r2 = await correrTandas({ items: items(12), enSeco: false, motor: grande.motor, guardar: baseSimulada().guardar });
    assert.deepEqual(grande.tandasPegadas.map((t) => t.length), [9, 3]);
    assert.deepEqual([r2.tope, r2.topeEnPantalla], [9, 20]);
  });

  it("si la pantalla no dice el tope, no presenta nada", async () => {
    const arca = arcaSimulado({ tope: null });
    await assert.rejects(correrTandas({ items: items(3), enSeco: false, motor: arca.motor, guardar: baseSimulada().guardar }), /no dice cuántos registros/);
    assert.equal(arca.tandasPegadas.length, 0);
  });

  it("una fila rechazada queda con el motivo textual y el resto sigue", async () => {
    const arca = arcaSimulado({ rechaza: [item(2).cuil] });
    const base = baseSimulada();
    const r = await correrTandas({ items: items(11), enSeco: false, motor: arca.motor, guardar: base.guardar });
    const rechazada = r.resultados.find((x) => x.item.cuil === item(2).cuil)!;
    assert.equal(rechazada.estado, "rechazada");
    assert.match(rechazada.motivo || "", /no es válido/);
    assert.equal(arca.registradas.length, 10);
    assert.ok(!arca.registradas.includes(item(2).cuil));
    assert.equal(r.corte, undefined);
  });

  it("una fila que bloquea la tanda: se la saca y el resto se presenta en otra tanda, sin duplicar", async () => {
    const arca = arcaSimulado({ bloquea: [item(3).cuil] });
    const base = baseSimulada();
    const r = await correrTandas({ items: items(5), enSeco: false, motor: arca.motor, guardar: base.guardar });
    assert.equal(r.resultados.find((x) => x.item.cuil === item(3).cuil)!.estado, "rechazada");
    assert.deepEqual(arca.registradas.sort(), [1, 2, 4, 5].map((n) => item(n).cuil).sort());
    // Segunda tanda: las cuatro devueltas, sin la rechazada.
    assert.deepEqual(arca.tandasPegadas.map((t) => t.length), [5, 4]);
    assert.equal(base.contratos.get(item(1).cuil), "registrada");
  });

  it("corte a mitad (se cae después del Aceptar): consulta por CUIL, no reintenta, y al retomar no duplica", async () => {
    const arca = arcaSimulado({ seCaeEnTanda: 2 });
    const base = baseSimulada();
    const todos = items(20);
    const r = await correrTandas({ items: todos, enSeco: false, motor: arca.motor, guardar: base.guardar });
    assert.equal(r.corte?.motivo, "error_despues_de_presentar");
    assert.equal(arca.tandasPegadas.length, 2, "la tercera tanda no se presentó");
    // La tanda 2 se resolvió LEYENDO: las 9 figuran en la consulta y quedan registradas.
    assert.equal(arca.consultados.length, 9);
    assert.equal(r.resultados.filter((x) => x.estado === "registrada").length, 18);
    assert.equal(r.resultados.filter((x) => x.estado === "registrada" && x.porConsulta).length, 9);
    assert.equal(r.resultados.filter((x) => x.estado === "pendiente").length, 2);

    // RETOMAR: la corrida nueva lleva solo lo que no tiene resultado (lo que hace `validarLoteAltas`).
    const pendientes = todos.filter((i) => !base.contratos.has(i.cuil));
    assert.equal(pendientes.length, 2);
    const otra = arcaSimulado(); // ARCA volvió: sin caída, y la consulta sigue viendo lo de antes
    const r2 = await correrTandas({ items: pendientes, enSeco: false, motor: { ...otra.motor, consultar: arca.motor.consultar }, guardar: base.guardar });
    assert.ok(estados(r2).every((e) => e === "registrada"));
    const total = [...arca.registradas, ...otra.registradas];
    assert.equal(total.length, 20);
    assert.equal(new Set(total).size, 20, "ningún CUIL se registró dos veces");
  });

  it("tanda incierta que la consulta no confirma: queda incierta, NO se vuelve a presentar y la corrida sigue", async () => {
    const noVe = [item(10).cuil];
    const arca = arcaSimulado({ sinResultadoEnTanda: 2, consultaNoVe: noVe });
    const base = baseSimulada();
    const r = await correrTandas({ items: items(20), enSeco: false, motor: arca.motor, guardar: base.guardar });
    assert.equal(r.corte, undefined);
    assert.equal(arca.tandasPegadas.length, 3, "siguió con la tercera tanda");
    assert.equal(r.resultados.find((x) => x.item.cuil === item(10).cuil)!.estado, "incierta");
    assert.equal(base.contratos.get(item(10).cuil), "incierta");
    assert.equal(r.resultados.filter((x) => x.estado === "registrada").length, 19);
    assert.equal(arca.tandasPegadas.flat().filter((c) => c === item(10).cuil).length, 1, "la incierta se pegó una sola vez");
  });

  it("lo que una corrida anterior dejó sin resultado se consulta al empezar y nunca se presenta", async () => {
    const arca = arcaSimulado();
    arca.registradas.push(item(50).cuil); // ARCA sí la había tomado
    const base = baseSimulada();
    const r = await correrTandas({ items: items(2), inciertas: [item(50), item(51)], enSeco: false, motor: arca.motor, guardar: base.guardar });
    assert.deepEqual(arca.consultados, [item(50).cuil, item(51).cuil]);
    assert.equal(base.contratos.get(item(50).cuil), "registrada");
    assert.equal(base.contratos.get(item(51).cuil), "incierta");
    assert.ok(!arca.tandasPegadas.flat().includes(item(50).cuil) && !arca.tandasPegadas.flat().includes(item(51).cuil));
    assert.equal(r.resultados.filter((x) => x.estado === "registrada").length, 3);
  });

  it("«Detener» corta al terminar la tanda en curso: lo presentado queda guardado y el resto pendiente", async () => {
    const arca = arcaSimulado();
    const base = baseSimulada();
    let pedido = false;
    const r = await correrTandas({
      items: items(20),
      enSeco: false,
      motor: arca.motor,
      guardar: { ...base.guardar, presentando: async (i, t) => ((pedido = true), base.guardar.presentando(i, t)) }, // se aprieta «Detener» en plena tanda 1
      cortePedido: () => (pedido ? { motivo: "detenida", mensaje: "Detenida a pedido." } : null),
    });
    assert.equal(r.corte?.motivo, "detenida");
    assert.equal(arca.tandasPegadas.length, 1, "la tanda en curso terminó; la siguiente no arrancó");
    assert.equal(r.resultados.filter((x) => x.estado === "registrada").length, 9);
    assert.equal(r.resultados.filter((x) => x.estado === "pendiente").length, 11);
  });

  it("más de N rechazos seguidos corta sola", async () => {
    const todos = items(20);
    const arca = arcaSimulado({ rechaza: todos.slice(0, 9).map((i) => i.cuil) });
    const r = await correrTandas({ items: todos, enSeco: false, motor: arca.motor, guardar: baseSimulada().guardar, maxRechazos: 3 });
    assert.equal(r.corte?.motivo, "rechazos_seguidos");
    assert.equal(arca.tandasPegadas.length, 1);
    assert.equal(arca.registradas.length, 0);
  });

  it("un error antes del Aceptar corta sin dejar marcas: no se presentó nada", async () => {
    const arca = arcaSimulado();
    const base = baseSimulada();
    arca.motor.presentar = async () => {
      throw new Error("No llegué a Registrar Nuevas Altas (estoy en sin_sesion).");
    };
    const r = await correrTandas({ items: items(4), enSeco: false, motor: arca.motor, guardar: base.guardar });
    assert.equal(r.corte?.motivo, "error");
    assert.ok(estados(r).every((e) => e === "pendiente"));
    assert.equal(base.contratos.size, 0);
    assert.equal(arca.consultados.length, 0);
  });

  it("en seco recorre TODAS las tandas y no escribe nada en ningún contrato", async () => {
    const arca = arcaSimulado({ seco: true });
    const base = baseSimulada();
    const r = await correrTandas({ items: items(20), inciertas: [item(50)], enSeco: true, motor: arca.motor, guardar: base.guardar });
    assert.deepEqual(arca.tandasPegadas.map((t) => t.length), [9, 9, 2]);
    assert.ok(estados(r).every((e) => e === "seco"));
    assert.equal(base.escrituras.length, 0);
    assert.equal(arca.consultados.length, 0);
  });

  it("la fecha de inicio sale del registro de 85 (posiciones 48–55)", () => {
    assert.equal(fechaInicioDeRegistro85(item(1).registro), "05102026");
  });
});

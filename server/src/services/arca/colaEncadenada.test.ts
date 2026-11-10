/**
 * La descarga de constancias encadenada a la presentación (11/11/2026). Todo en memoria: ARCA, el
 * candado y el reloj son de mentira.
 *
 * Run with:
 *   npx tsx --test src/services/arca/colaEncadenada.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { conPresentacionesEnFila, crearColaEncadenada, hayPresentacionesEnFila, presentadasDeLaCorrida, type ResultadoEncadenada, type TandaPresentada } from "./colaEncadenada.js";
import { ESPERA_TRAS_ENCADENADA_MS, elegirEncadenadas, elegirParaCorrida, trasUnFallo, type EstadoConstancia, type Intento } from "./cicloConstancia.js";

class Ocupado extends Error {}

/**
 * ARCA de mentira: un candado (`tomadoPor`), una descarga que dura `duraMs`, y un reloj que avanza sólo
 * cuando la cola espera. `enEl(t, hacer)` agenda algo para ese momento (soltar el candado, por ejemplo).
 */
function mundo(o: { activa?: boolean; duraMs?: number; alArrancar?: (t: TandaPresentada) => void } = {}) {
  let reloj = 0;
  const agenda: Array<{ t: number; hacer: () => void }> = [];
  const m = {
    tomadoPor: null as string | null,
    presentando: false,
    arranques: [] as Array<{ t: number; tanda: TandaPresentada }>,
    /** Veces que una descarga arrancó con ARCA tomada por otro: tiene que ser siempre 0. */
    pisadas: 0,
    resultados: [] as Array<{ empresa: string; r: ResultadoEncadenada }>,
    vaciadas: 0,
    enEl: (t: number, hacer: () => void) => agenda.push({ t, hacer }),
    reloj: () => reloj,
  };
  const cola = crearColaEncadenada({
    activa: async () => o.activa !== false,
    libre: () => !m.tomadoPor && !m.presentando,
    arrancar: async (tanda) => {
      if (m.tomadoPor) {
        if (m.tomadoPor !== "otra") m.pisadas++;
        throw new Ocupado();
      }
      o.alArrancar?.(tanda);
      m.tomadoPor = "constancias";
      m.arranques.push({ t: reloj, tanda });
      m.enEl(reloj + (o.duraMs ?? 20_000), () => (m.tomadoPor = null));
      return { total: tanda.items.length };
    },
    esOcupado: (e) => e instanceof Ocupado,
    corriendo: () => m.tomadoPor === "constancias",
    esperar: async (ms) => {
      reloj += ms;
      for (const a of agenda.splice(0).sort((x, y) => x.t - y.t)) {
        if (a.t <= reloj) a.hacer();
        else agenda.push(a);
      }
    },
    alVaciarse: async () => void m.vaciadas++,
    alTerminar: (t, r) => void m.resultados.push({ empresa: t.empresaRazonSocial, r }),
    ahora: () => reloj,
    pasoMs: 5000,
    plazoLibreMs: 30 * 60_000,
    plazoFinMs: 60 * 60_000,
  });
  const vaciar = async () => {
    for (let i = 0; i < 100_000 && !cola.vacia("t1"); i++) await new Promise((r) => setImmediate(r));
    assert.equal(cola.vacia("t1"), true, "la fila tiene que terminar");
  };
  return { m, cola, vaciar };
}

const item = (n: number) => ({ userProjectId: `up${n}`, contractIndex: 0 });
const tanda = (empresa: string, items: Array<{ userProjectId: string; contractIndex: number }>, extra: Partial<TandaPresentada> = {}): TandaPresentada => ({
  tenantId: "t1",
  tenantObjectId: "t1",
  empresaId: empresa,
  empresaRazonSocial: empresa,
  items,
  terminadaEl: new Date("2026-11-11T03:07:00Z"),
  automatica: true,
  ...extra,
});

describe("tanda presentada → descarga encadenada", () => {
  it("de la corrida sólo se bajan las altas que ARCA aceptó", () => {
    const resultados = [
      { item: item(1), estado: "registrada" },
      { item: item(2), estado: "rechazada" },
      { item: item(3), estado: "incierta" },
      { item: item(4), estado: "registrada" },
      { item: item(5), estado: "pendiente" },
      { item: item(6), estado: "seco" },
    ];
    assert.deepEqual(presentadasDeLaCorrida(resultados), [item(1), item(4)]);
  });

  it("se pide exactamente esa tanda, de esa empleadora, apenas ARCA queda libre", async () => {
    const { m, cola, vaciar } = mundo();
    assert.equal(await cola.encolar(tanda("2030 S.R.L.", [item(1), item(4)])), "encolada");
    await vaciar();
    assert.equal(m.arranques.length, 1);
    assert.equal(m.arranques[0].t, 0, "sin esperar: no es la descarga de las 15:00");
    assert.equal(m.arranques[0].tanda.empresaId, "2030 S.R.L.");
    assert.deepEqual(m.arranques[0].tanda.items, [item(1), item(4)]);
    assert.deepEqual(m.resultados, [{ empresa: "2030 S.R.L.", r: { resultado: "bajada", pedidas: 2 } }]);
    assert.equal(m.vaciadas, 1, "al terminar se ubican los documentos");
  });

  it("una corrida en seco o toda rechazada no encola nada", async () => {
    const { m, cola } = mundo();
    assert.equal(await cola.encolar(tanda("2030 S.R.L.", presentadasDeLaCorrida([{ item: item(1), estado: "seco" }, { item: item(2), estado: "rechazada" }]))), "vacia");
    assert.equal(m.arranques.length, 0);
  });

  it("dos empleadoras: una descarga por vez, en el orden en que se presentaron", async () => {
    const { m, cola, vaciar } = mundo({ duraMs: 20_000 });
    await cola.encolar(tanda("2030 S.R.L.", [item(1)]));
    await cola.encolar(tanda("FZERO S.R.L", [item(2)]));
    assert.equal(cola.enFila("t1").length, 2);
    await vaciar();
    assert.deepEqual(m.arranques.map((a) => a.tanda.empresaId), ["2030 S.R.L.", "FZERO S.R.L"]);
    assert.ok(m.arranques[1].t >= 20_000, "la segunda arranca cuando terminó la primera");
    assert.equal(m.pisadas, 0);
  });
});

describe("candado de ARCA respetado", () => {
  it("con otra corrida en curso, la encadenada espera y arranca cuando se libera", async () => {
    const { m, cola, vaciar } = mundo();
    m.tomadoPor = "otra";
    m.enEl(60_000, () => (m.tomadoPor = null));
    await cola.encolar(tanda("2030 S.R.L.", [item(1)]));
    assert.equal(cola.enFila("t1")[0].estado, "en_fila");
    await vaciar();
    assert.equal(m.arranques.length, 1);
    assert.ok(m.arranques[0].t >= 60_000, "no arranca antes de que se libere");
    assert.equal(m.pisadas, 0);
  });

  it("si otra corrida le gana el candado justo al arrancar, vuelve a esperar (no la pisa)", async () => {
    let primera = true;
    const { m, cola, vaciar } = mundo({
      alArrancar: () => {
        if (!primera) return;
        primera = false;
        // Alguien tomó ARCA entre que se miró y se arrancó.
        m.tomadoPor = "otra";
        m.enEl(m.reloj() + 30_000, () => (m.tomadoPor = null));
        throw new Ocupado();
      },
    });
    await cola.encolar(tanda("2030 S.R.L.", [item(1)]));
    await vaciar();
    assert.equal(m.arranques.length, 1);
    assert.ok(m.arranques[0].t >= 30_000);
    assert.deepEqual(m.resultados[0].r, { resultado: "bajada", pedidas: 1 });
  });

  it("si ARCA no se libera a tiempo no se baja nada: quedan para el barrido", async () => {
    const { m, cola, vaciar } = mundo();
    m.tomadoPor = "otra";
    await cola.encolar(tanda("2030 S.R.L.", [item(1)]));
    await vaciar();
    assert.equal(m.arranques.length, 0);
    assert.equal(m.resultados[0].r.resultado, "sin_turno");
  });

  it("las presentaciones van primero: mientras hay una fila de presentaciones, la descarga espera", async () => {
    const { m, cola, vaciar } = mundo();
    m.presentando = true;
    m.enEl(120_000, () => (m.presentando = false));
    await cola.encolar(tanda("2030 S.R.L.", [item(1)]));
    await vaciar();
    assert.ok(m.arranques[0].t >= 120_000);
  });

  it("la fila de presentaciones se anida (la corrida del día envuelve a las del día y a las atrasadas)", async () => {
    assert.equal(hayPresentacionesEnFila("t9"), false);
    await conPresentacionesEnFila("t9", async () => {
      await conPresentacionesEnFila("t9", async () => assert.equal(hayPresentacionesEnFila("t9"), true));
      assert.equal(hayPresentacionesEnFila("t9"), true, "terminó una de adentro, la de afuera sigue");
    });
    assert.equal(hayPresentacionesEnFila("t9"), false);
    await assert.rejects(conPresentacionesEnFila("t9", async () => Promise.reject(new Error("falló"))));
    assert.equal(hayPresentacionesEnFila("t9"), false, "una presentación que falla no deja la fila trabada");
  });
});

describe("interruptor «Bajar constancias al presentar»", () => {
  it("apagado, no se encola nada: vuelve a bajarlas sólo la corrida diaria", async () => {
    const { m, cola } = mundo({ activa: false });
    assert.equal(await cola.encolar(tanda("2030 S.R.L.", [item(1), item(2)])), "apagada");
    assert.equal(cola.enFila("t1").length, 0);
    assert.equal(m.arranques.length, 0);
  });
});

describe("nada se baja dos veces", () => {
  it("lo que ya está en la fila no se vuelve a encolar", async () => {
    const { m, cola, vaciar } = mundo();
    m.tomadoPor = "otra";
    m.enEl(10_000, () => (m.tomadoPor = null));
    assert.equal(await cola.encolar(tanda("2030 S.R.L.", [item(1), item(2)])), "encolada");
    assert.equal(await cola.encolar(tanda("2030 S.R.L.", [item(1), item(2)])), "vacia");
    assert.equal(await cola.encolar(tanda("2030 S.R.L.", [item(2), item(3), item(3)])), "encolada");
    await vaciar();
    assert.deepEqual(m.arranques.map((a) => a.tanda.items), [[item(1), item(2)], [item(3)]]);
  });

  it("si al arrancar ya tenían su constancia, no se pide nada y la fila sigue", async () => {
    const { m, cola, vaciar } = mundo({
      alArrancar: (t) => {
        if (t.empresaId === "2030 S.R.L.") throw new Error("Las altas recién presentadas ya tienen su constancia o esperan su reintento.");
      },
    });
    await cola.encolar(tanda("2030 S.R.L.", [item(1)]));
    await cola.encolar(tanda("FZERO S.R.L", [item(2)]));
    await vaciar();
    assert.deepEqual(m.resultados.map((x) => x.r.resultado), ["nada", "bajada"]);
    assert.equal(m.arranques.length, 1);
  });

  const fila = (n: number, estado: EstadoConstancia, extra: Record<string, unknown> = {}) => ({ userProjectId: `up${n}`, contractIndex: 0, clave: `c${n}`, estado, fechaAlta: "2026-11-11", ...extra });
  const AHORA = new Date("2026-11-11T03:10:00Z");

  it("la encadenada elige sólo las recién presentadas que todavía no tienen constancia", () => {
    const filas = [
      fila(1, "presentada"),
      fila(2, "constancia_descargada"),
      fila(3, "baja_mismo_dia_ok"),
      fila(4, "requiere_revision"),
      fila(5, "constancia_pendiente", { proximoIntentoEl: new Date("2026-11-12T03:00:00Z") }),
      // Presentada antes, de otra tanda: no es de ésta.
      fila(6, "presentada"),
    ];
    assert.deepEqual(elegirEncadenadas(filas, [item(1), item(2), item(3), item(4), item(5)], AHORA).map((f) => f.clave), ["c1"]);
  });

  it("el barrido no vuelve a bajar lo que la encadenada ya bajó, y sí lo que le quedó", () => {
    const filas = [fila(1, "constancia_descargada"), fila(2, "baja_mismo_dia_ok"), fila(3, "presentada"), fila(4, "archivada")];
    const { elegidas } = elegirParaCorrida(filas, { ahora: new Date("2026-11-11T18:00:00Z"), tope: 40 });
    assert.deepEqual(elegidas.map((f) => f.clave), ["c3"]);
  });
});

describe("fallo en la encadenada → reintento en el barrido, una sola vez", () => {
  const AHORA = new Date("2026-11-11T03:10:00Z"); // 00:10 argentinas
  const BARRIDO = new Date("2026-11-11T18:00:00Z"); // 15:00 argentinas del mismo día

  it("queda pendiente (no en revisión) y cuenta como un intento automático", () => {
    const r = trasUnFallo([], { resultado: "sin_constancia", detalle: "ARCA no mostró la constancia." }, AHORA, { origen: "encadenada" });
    assert.equal(r.estado, "constancia_pendiente");
    assert.equal(r.proximoIntentoEl?.getTime(), AHORA.getTime() + ESPERA_TRAS_ENCADENADA_MS);
  });

  it("espera horas y no un día: entra en el barrido de ese mismo día", () => {
    const encadenada = trasUnFallo([], { resultado: "sin_constancia" }, AHORA, { origen: "encadenada" });
    const deSiempre = trasUnFallo([], { resultado: "sin_constancia" }, AHORA);
    const filaDe = (proximoIntentoEl: Date | null) => [{ clave: "c1", estado: "constancia_pendiente" as const, fechaAlta: "2026-11-11", proximoIntentoEl }];
    assert.equal(elegirParaCorrida(filaDe(encadenada.proximoIntentoEl), { ahora: BARRIDO, tope: 40 }).elegidas.length, 1);
    assert.equal(elegirParaCorrida(filaDe(deSiempre.proximoIntentoEl), { ahora: BARRIDO, tope: 40 }).elegidas.length, 0, "con la espera de un día habría quedado para pasado mañana");
  });

  it("el barrido la pide una vez; si vuelve a fallar sigue el ciclo de siempre y al tercero va a revisión", () => {
    const intentos: Intento[] = [{ fecha: AHORA, resultado: "sin_constancia", origen: "encadenada" }];
    const segundo = trasUnFallo(intentos, { resultado: "sin_constancia" }, BARRIDO, { origen: "barrido" });
    assert.equal(segundo.estado, "constancia_pendiente");
    assert.equal(segundo.proximoIntentoEl?.getTime(), BARRIDO.getTime() + 2 * 86_400_000);
    const tercero = trasUnFallo([...intentos, { fecha: BARRIDO, resultado: "sin_constancia", origen: "barrido" }], { resultado: "sin_constancia" }, new Date("2026-11-13T18:00:00Z"), { origen: "barrido" });
    assert.equal(tercero.estado, "requiere_revision");
  });

  it("mientras espera su reintento, otra presentación no la vuelve a pedir", () => {
    const esperando = [{ userProjectId: "up1", contractIndex: 0, clave: "c1", estado: "constancia_pendiente" as const, fechaAlta: "2026-11-11", proximoIntentoEl: new Date(AHORA.getTime() + ESPERA_TRAS_ENCADENADA_MS) }];
    assert.equal(elegirEncadenadas(esperando, [item(1)], AHORA).length, 0);
  });
});

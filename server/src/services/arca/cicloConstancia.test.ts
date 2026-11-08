import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_INTENTOS,
  carpetaMasAvanzada,
  categoriaDe,
  claveConstancia,
  elegirParaCorrida,
  estadoPorCarpeta,
  sePuedePedir,
  siguienteEstado,
  puedeVolverABajarse,
  trasUnFallo,
  yaTieneConstancia,
  type EstadoConstancia,
  type Intento,
} from "./cicloConstancia.js";

const AHORA = new Date("2026-11-07T18:00:00.000Z");
const dias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000);
const item = (estado: EstadoConstancia, fechaAlta: string, proximoIntentoEl: Date | null = null) => ({ estado, fechaAlta, proximoIntentoEl, id: `${estado}:${fechaAlta}` });
const fallo = (n: number, manual = false): Intento[] => Array.from({ length: n }, (_, i) => ({ fecha: dias(-n + i), resultado: "sin_constancia", manual }));

describe("idempotencia", () => {
  it("la clave es la misma venga como venga el dato (CUIL con guiones, fecha ISO completa)", () => {
    assert.equal(claveConstancia({ cuil: "20-32724399-4", empresaCuit: "30-71706837-4", fechaAlta: "2026-10-24T00:00:00.000Z" }), claveConstancia({ cuil: "20327243994", empresaCuit: "30717068374", fechaAlta: "2026-10-24" }));
  });
  it("una constancia ya descargada NUNCA se vuelve a pedir, en ningún estado del circuito", () => {
    for (const e of ["constancia_descargada", "enviada_a_firmar", "firmada", "archivada", "baja_mismo_dia_ok"] as EstadoConstancia[]) {
      assert.equal(yaTieneConstancia(e), true, e);
      assert.equal(sePuedePedir({ estado: e }, AHORA), false, e);
      const { elegidas } = elegirParaCorrida([item(e, "2026-10-01")], { ahora: AHORA, tope: 40 });
      assert.equal(elegidas.length, 0, `${e} no entra en la corrida`);
    }
  });
});

describe("el cupo diario", () => {
  it("primero las nuevas (de la más vieja a la más nueva), después los reintentos vencidos", () => {
    const items = [item("constancia_pendiente", "2026-10-01", dias(-1)), item("presentada", "2026-11-05"), item("presentada", "2026-11-01"), item("constancia_pendiente", "2026-10-02", dias(-3))];
    const { elegidas } = elegirParaCorrida(items, { ahora: AHORA, tope: 40 });
    assert.deepEqual(elegidas.map((i) => i.id), ["presentada:2026-11-01", "presentada:2026-11-05", "constancia_pendiente:2026-10-02", "constancia_pendiente:2026-10-01"]);
  });
  it("con el tope lleno de nuevas, los reintentos esperan: el panel dice cuántas quedaron afuera y por qué", () => {
    const nuevas = Array.from({ length: 45 }, (_, i) => item("presentada", `2026-11-${String((i % 28) + 1).padStart(2, "0")}`));
    const viejas = Array.from({ length: 26 }, () => item("constancia_pendiente", "2026-10-10", dias(-1)));
    const esperando = [item("constancia_pendiente", "2026-10-11", dias(1))];
    const revision = [item("requiere_revision", "2026-10-12")];
    const { elegidas, fuera } = elegirParaCorrida([...viejas, ...esperando, ...revision, ...nuevas], { ahora: AHORA, tope: 40 });
    assert.equal(elegidas.length, 40);
    assert.ok(elegidas.every((i) => i.estado === "presentada"), "el cupo se llena primero con nuevas");
    assert.deepEqual(fuera, { nuevasPorTope: 5, reintentosPorTope: 26, esperandoReintento: 1, enRevision: 1 });
  });
  it("(regresión) lo que está en revisión no consume cupo, aunque sobre lugar", () => {
    const { elegidas, fuera } = elegirParaCorrida([item("requiere_revision", "2026-10-01"), item("presentada", "2026-11-01")], { ahora: AHORA, tope: 1 });
    assert.deepEqual(elegidas.map((i) => i.estado), ["presentada"]);
    assert.equal(fuera.enRevision, 1);
    assert.equal(fuera.nuevasPorTope, 0);
  });
  it("un reintento que todavía espera su fecha no entra", () => {
    assert.equal(sePuedePedir(item("constancia_pendiente", "2026-10-01", dias(0.5)), AHORA), false);
    assert.equal(sePuedePedir(item("constancia_pendiente", "2026-10-01", dias(-0.01)), AHORA), true);
  });
});

describe("reintentos con espera y agotamiento", () => {
  it("1.º fallo → espera 1 día; 2.º → 2 días; 3.º → revisión con el motivo en castellano", () => {
    const f = { resultado: "sin_constancia" as const, detalle: "ARCA no entregó el PDF en 3 pedidos seguidos." };
    const r1 = trasUnFallo([], f, AHORA);
    assert.deepEqual(r1, { estado: "constancia_pendiente", proximoIntentoEl: dias(1) });
    const r2 = trasUnFallo(fallo(1), f, AHORA);
    assert.deepEqual(r2, { estado: "constancia_pendiente", proximoIntentoEl: dias(2) });
    const r3 = trasUnFallo(fallo(2), f, AHORA);
    assert.equal(r3.estado, "requiere_revision");
    assert.equal(r3.proximoIntentoEl, null);
    assert.match(r3.motivoRevision!, /^No se pudo bajar en 3 intentos\. El último: ARCA no mostró la constancia de esa relación \(ARCA no entregó el PDF/);
  });
  it("ningún ítem supera MAX_INTENTOS automáticos: después del 3.º ya no se puede pedir solo", () => {
    // Treinta corridas diarias sobre una constancia que ARCA nunca entrega bien.
    let c = { estado: "presentada" as EstadoConstancia, proximoIntentoEl: null as Date | null, intentos: [] as Intento[] };
    const diasPedidos: number[] = [];
    for (let dia = 0; dia < 30; dia++) {
      const t = dias(dia);
      if (elegirParaCorrida([{ ...c, fechaAlta: "2026-10-24" }], { ahora: t, tope: 40 }).elegidas.length === 0) continue;
      diasPedidos.push(dia);
      const r = trasUnFallo(c.intentos, { resultado: "rechazada" }, t);
      c = { estado: r.estado, proximoIntentoEl: r.proximoIntentoEl, intentos: [...c.intentos, { fecha: t, resultado: "rechazada" }] };
    }
    assert.deepEqual(diasPedidos, [0, 1, 3], "intentos el día 0, a 1 día y a 2 días más; nunca un 4.º");
    assert.equal(diasPedidos.length, MAX_INTENTOS);
    assert.equal(c.estado, "requiere_revision");
  });
  it("el «Reintentar» a mano: si falla vuelve a revisión sin gastar intentos automáticos", () => {
    const r = trasUnFallo(fallo(3), { resultado: "error", detalle: "x" }, AHORA, { manual: true });
    assert.equal(r.estado, "requiere_revision");
    assert.match(r.motivoRevision!, /reintento a mano/);
    // Los manuales no cuentan: con 2 manuales fallidos, el 1.º automático sigue siendo el 1.º.
    assert.equal(trasUnFallo(fallo(2, true), { resultado: "error" }, AHORA).estado, "constancia_pendiente");
  });
  it("duplicados DISTINTOS van directo a revisión: reintentar no los arregla", () => {
    const r = trasUnFallo([], { resultado: "ambigua", sinArreglo: true, detalle: "ARCA muestra 2 relaciones que empiezan el 01/10/2026 y no son iguales: (1) …" }, AHORA);
    assert.equal(r.estado, "requiere_revision");
    assert.match(r.motivoRevision!, /no son iguales/);
  });
});

describe("el documento: dónde está y qué estado es", () => {
  it("la carpeta más avanzada manda (el firmado vuelve como archivo nuevo con el mismo código)", () => {
    assert.equal(carpetaMasAvanzada(["outbox", "firmados", "pendbox"]), "firmados");
    assert.equal(carpetaMasAvanzada(["firmados", "alta_firmadas"]), "alta_firmadas");
    assert.equal(carpetaMasAvanzada([]), null);
  });
  it("bajada → en Outbox → enviada a firmar → firmada → archivada", () => {
    assert.equal(estadoPorCarpeta("outbox"), "constancia_descargada");
    assert.equal(estadoPorCarpeta("pendbox"), "enviada_a_firmar");
    assert.equal(estadoPorCarpeta("firmados"), "firmada");
    assert.equal(estadoPorCarpeta("alta_firmadas"), "archivada");
    assert.equal(estadoPorCarpeta("no_firmar"), "archivada");
    assert.equal(estadoPorCarpeta("no_firmar", { esDeBaja: true }), "baja_mismo_dia_ok");
  });
  it("nunca para atrás; de revisión se sale cuando el documento aparece; lo archivado no vuelve a revisión", () => {
    assert.equal(siguienteEstado("firmada", "enviada_a_firmar"), "firmada");
    assert.equal(siguienteEstado("constancia_descargada", "enviada_a_firmar"), "enviada_a_firmar");
    assert.equal(siguienteEstado("requiere_revision", "constancia_descargada"), "constancia_descargada");
    assert.equal(siguienteEstado("enviada_a_firmar", "requiere_revision"), "requiere_revision");
    assert.equal(siguienteEstado("archivada", "requiere_revision"), "archivada");
  });
  it("los grupos del Registro: cada estado en uno solo", () => {
    assert.equal(categoriaDe("presentada"), "pendientes");
    assert.equal(categoriaDe("constancia_pendiente"), "pendientes");
    assert.equal(categoriaDe("constancia_descargada"), "descargadas");
    assert.equal(categoriaDe("baja_mismo_dia_ok"), "descargadas");
    assert.equal(categoriaDe("enviada_a_firmar"), "en_firma");
    assert.equal(categoriaDe("firmada"), "firmadas");
    assert.equal(categoriaDe("archivada", { firmada: true }), "firmadas");
    assert.equal(categoriaDe("archivada"), "descargadas");
    assert.equal(categoriaDe("requiere_revision"), "revision");
  });
});

describe("«Volver a bajar» (documento no ubicado)", () => {
  it("una re-descarga arranca con sus 3 intentos: los fallos de antes no cuentan", () => {
    const f = { resultado: "sin_constancia" as const };
    const previos: Intento[] = [...fallo(2), { fecha: dias(0), resultado: "redescarga", manual: true }];
    assert.deepEqual(trasUnFallo(previos, f, AHORA), { estado: "constancia_pendiente", proximoIntentoEl: dias(1) });
    assert.equal(trasUnFallo([...previos, ...fallo(2)], f, AHORA).estado, "requiere_revision");
  });
  it("sólo se pide para lo que está en revisión por documento no ubicado, y una sola vez", () => {
    assert.deepEqual(puedeVolverABajarse({ estado: "requiere_revision", documento: { noUbicadoDesde: AHORA } }), { ok: true });
    assert.equal(puedeVolverABajarse({ estado: "presentada", documento: null, redescarga: { enCurso: true } }).ok, false);
    assert.equal(puedeVolverABajarse({ estado: "constancia_pendiente", documento: null, redescarga: { enCurso: true } }).ok, false);
    // En revisión por intentos fallidos (sin documento): eso es «Reintentar», no esto.
    assert.match((puedeVolverABajarse({ estado: "requiere_revision", documento: null }) as any).motivo, /Reintentar/);
    // El documento reapareció: ya salió de revisión.
    assert.match((puedeVolverABajarse({ estado: "enviada_a_firmar", documento: { noUbicadoDesde: null } }) as any).motivo, /ubicado/);
  });
});

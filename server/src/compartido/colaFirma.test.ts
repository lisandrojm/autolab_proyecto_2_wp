import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agruparTrabados, categoriaDeTrabado, cupoVentana24h, estadoDelPanel, ordenPorRecientes, type EntradaPanel } from "./colaFirma.js";
import { cupoDelDia, CONFIG_POR_DEFECTO } from "../services/dropboxSignBot/planificador.js";

/** La cola de envío explicada (25/10/2026). Motivos tal como los escribe hoy el bot. */
describe("categoría de un trabado, con su salida", () => {
  const casos: Array<[string, string]> = [
    ["Tipo de documento sin regla de colocación de la firma: el nombre no matchea ningún patrón conocido (AltaAFIP, Contrato_Jornada).", "sin_regla"],
    ["Ancla «Firma:» no encontrada en la última página; se descartó: …", "ancla"],
    ["La plantilla «Jornada» pone la firma en la página 2 de 3: el bot sólo sabe colocar en la primera o la última página.", "pagina_intermedia"],
    ["El ancla está en la página 2, una del medio: el motor sólo navega a la primera o a la última. No se envía.", "pagina_intermedia"],
    ["El usuario no tiene nombre o email cargados.", "sin_firmante"],
    ["No hay usuario para el código ID-000123 ni para el email del nombre de archivo.", "sin_firmante"],
    ["El archivo ya no está en Outbox (¿se movió a Pendbox o se borró?): salió de la cola.", "fuera_outbox"],
    ["El PDF del Outbox no es el que se generó con la plantilla (cambió después): la posición declarada no vale y se ubica por regla. Ancla «Firma:» no encontrada", "pdf_cambiado"],
    ["El nombre no trae el código del documento (ID-NNNNNN): no se puede garantizar que no se envíe dos veces.", "sin_codigo"],
    ["algo raro", "otro"],
  ];
  for (const [motivo, tipo] of casos) it(`${tipo}: ${motivo.slice(0, 50)}…`, () => assert.equal(categoriaDeTrabado(motivo).tipo, tipo));
  it("agrupa por motivo, de más a menos, con la acción de cada uno", () => {
    const g = agruparTrabados([{ detalle: casos[0][0] }, { detalle: casos[0][0] }, { detalle: casos[4][0] }]);
    assert.deepEqual(g.map((x) => [x.tipo, x.cantidad]), [["sin_regla", 2], ["sin_firmante", 1]]);
    assert.equal(g[0].accion.texto, "Definir regla");
  });
});

describe("cupo en la ventana MÓVIL de 24 h (no por día calendario)", () => {
  const ahora = new Date("2026-10-25T12:00:00Z");
  const hace = (h: number) => new Date(ahora.getTime() - h * 3600_000);
  it("cuenta sólo lo de las últimas 24 h", () => {
    const r = cupoVentana24h(60, [hace(1), hace(5), hace(23.9), hace(25), hace(48)], ahora);
    assert.equal(r.usados, 3);
    assert.equal(r.cupo, 57);
    assert.equal(r.liberaAt, null);
  });
  it("sin cupo, dice cuándo se libera el próximo lugar: cuando el más viejo de la ventana cumple 24 h", () => {
    const enviados = Array.from({ length: 60 }, (_, i) => hace(20 - i * 0.1));
    const r = cupoVentana24h(60, enviados, ahora);
    assert.equal(r.cupo, 0);
    assert.equal(r.liberaAt?.toISOString(), new Date(hace(20).getTime() + 24 * 3600_000).toISOString());
  });
  it("el planificador usa la ventana cuando la tiene", () => {
    const config = { ...CONFIG_POR_DEFECTO, topeDiario: 60 };
    assert.equal(cupoDelDia(config, { contadorDia: { fecha: "2026-10-25", enviados: 0 }, enfriadoHasta: null, ultimaCorridaAt: null, enviados24h: 12 }, ahora), 48);
    assert.equal(cupoDelDia(config, { contadorDia: { fecha: "2026-10-25", enviados: 5 }, enfriadoHasta: null, ultimaCorridaAt: null }, ahora), 55, "sin ventana, el día calendario de antes");
  });
});

describe("estado del panel, en castellano y con qué va a pasar", () => {
  const ahora = new Date("2026-10-25T15:00:00Z"); // 12:00 en Argentina
  const base: EntradaPanel = { corriendo: false, tieneSesion: true, conexionCaida: false, enfriadoHasta: null, cupo: 60, liberaAt: null, enCola: 174, trabados: 6, envioAutomatico: true, horaDesde: 0, horaHasta: 24, horaActual: 12, proximaTandaAt: new Date("2026-10-25T16:56:00Z") };
  it("lista: cuántos entran y la próxima tanda", () => assert.match(estadoDelPanel(base, ahora).texto, /60 entran en las próximas 24 h · próxima tanda 13:56/));
  it("enviando: el progreso y el documento", () => assert.equal(estadoDelPanel({ ...base, corriendo: true, progreso: { hechos: 6, total: 10, actual: "ID-000452.pdf" } }, ahora).texto, "Enviando 7 de 10 — ID-000452.pdf"));
  it("freno de Dropbox Sign: pausado hasta cuándo", () => assert.match(estadoDelPanel({ ...base, enfriadoHasta: new Date("2026-10-25T18:40:00Z") }, ahora).texto, /frenó los envíos.*15:40/));
  it("tope de 24 h: cuándo se libera", () => assert.match(estadoDelPanel({ ...base, cupo: 0, liberaAt: new Date("2026-10-26T04:12:00Z") }, ahora).texto, /tope estimado.*01:12/));
  it("sin sesión: conectarse", () => assert.equal(estadoDelPanel({ ...base, tieneSesion: false }, ahora).tipo, "sin_sesion"));
  it("nada para enviar: lleva a los trabados", () => assert.match(estadoDelPanel({ ...base, enCola: 0 }, ahora).texto, /6 trabado\(s\) → Revisar/));
  it("fuera de horario", () => assert.equal(estadoDelPanel({ ...base, horaDesde: 8, horaHasta: 22, horaActual: 23 }, ahora).tipo, "fuera_de_horario"));
  it("con el automático apagado: salen con «Enviar ahora»", () => assert.equal(estadoDelPanel({ ...base, envioAutomatico: false }, ahora).tipo, "manual"));
});

describe("ordenPorRecientes: la cola de más reciente a menos reciente", () => {
  const it_ = (archivo: string, codigo: string, encoladoAt?: string) => ({ archivo, codigo, encoladoAt });
  const fechas = new Map<string, string>([
    ["viejo.pdf", "2026-10-12T10:00:00Z"],
    ["nuevo.pdf", "2026-10-20T10:00:00Z"],
    ["medio.pdf", "2026-10-17T10:00:00Z"],
    ["gemelo-a.pdf", "2026-10-17T10:00:00Z"],
  ]);
  it("por fecha del archivo, la más nueva primero", () => {
    const r = ordenPorRecientes([it_("viejo.pdf", "ID-000001"), it_("nuevo.pdf", "ID-000002"), it_("medio.pdf", "ID-000003")], fechas);
    assert.deepEqual(r.map((x) => x.archivo), ["nuevo.pdf", "medio.pdf", "viejo.pdf"]);
  });
  it("a igual fecha, el código más alto primero", () => {
    const r = ordenPorRecientes([it_("medio.pdf", "ID-000003"), it_("gemelo-a.pdf", "ID-000009")], fechas);
    assert.deepEqual(r.map((x) => x.codigo), ["ID-000009", "ID-000003"]);
  });
  it("lo que no está en el Outbox va al final, por encolado más nuevo", () => {
    const r = ordenPorRecientes([it_("fuera1.pdf", "ID-000050", "2026-10-01T00:00:00Z"), it_("viejo.pdf", "ID-000001"), it_("fuera2.pdf", "ID-000040", "2026-10-05T00:00:00Z")], fechas);
    assert.deepEqual(r.map((x) => x.archivo), ["viejo.pdf", "fuera2.pdf", "fuera1.pdf"]);
  });
  it("no toca la lista original", () => {
    const orig = [it_("viejo.pdf", "ID-000001"), it_("nuevo.pdf", "ID-000002")];
    ordenPorRecientes(orig, fechas);
    assert.equal(orig[0].archivo, "viejo.pdf");
  });
});

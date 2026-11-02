import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verificarLote, type ItemVerificacion, type ConsultaConPantalla } from "./verificacionAltas.js";
import type { DecisionVerificacion } from "./decisionVerificacionAlta.js";

/** Los cinco casos trabados del 02/11/2026, con ARCA simulado. */
const item = (cuil: string, alta: string, extra: Partial<ItemVerificacion> = {}): ItemVerificacion => ({ userProjectId: `up-${cuil}-${alta}`, contractIndex: 0, cuil, nombre: cuil, empresaId: "e1", empresaRazonSocial: "2030 S.R.L.", alta, baja: alta, otroContratoMismoDia: false, ...extra });

/** Un ARCA de mentira: por CUIL, las relaciones que muestra la consulta (o un error). */
function arcaSimulado(datos: Record<string, Array<{ inicio: string; fin: string }> | Error>) {
  const consultas: string[] = [];
  const consultar = async (i: ItemVerificacion): Promise<ConsultaConPantalla> => {
    consultas.push(i.cuil);
    const d = datos[i.cuil];
    if (d instanceof Error) throw d;
    return { ok: true, relaciones: d || [], encontrada: (d || []).some((r) => r.inicio === i.alta) ? true : null, html: "<html/>" };
  };
  return { consultar, consultas };
}

/** Una base de mentira con la condición del `updateOne` real: sólo se marca lo que sigue sin presentar. */
function baseSimulada() {
  const presentadas = new Set<string>();
  const marcas: string[] = [];
  const aplicar = async (i: ItemVerificacion, d: DecisionVerificacion): Promise<string> => {
    const k = `${i.userProjectId}:${i.contractIndex}`;
    if (presentadas.has(k)) return "ya_resuelta";
    if (d.accion === "presentada") {
      presentadas.add(k);
      marcas.push(k);
      return "marcada_presentada";
    }
    return "revision_manual";
  };
  return { aplicar, presentadas, marcas };
}

describe("verificarLote", () => {
  it("decide cada alta con lo que muestra ARCA; un error de consulta no corta a las demás", async () => {
    const arca = arcaSimulado({
      "20381538487": [{ inicio: "2026-10-09", fin: "2026-10-09" }, { inicio: "2026-10-30", fin: "" }],
      "20381514294": new Error("La sesión de ARCA se cayó"),
      "27255114099": [],
    });
    const base = baseSimulada();
    const r = await verificarLote({ items: [item("20381538487", "2026-10-09"), item("20381514294", "2026-10-10"), item("27255114099", "2026-10-17"), item("20381538487", "2026-10-30")], consultar: arca.consultar, aplicar: base.aplicar });
    assert.deepEqual(
      r.map((x) => [x.item.alta, x.decision.accion, x.accion]),
      [
        ["2026-10-09", "presentada", "marcada_presentada"],
        ["2026-10-10", "revision_manual", "revision_manual"], // error de consulta
        ["2026-10-17", "revision_manual", "revision_manual"], // no existe
        ["2026-10-30", "revision_manual", "revision_manual"], // existe sin baja
      ],
    );
    assert.match(r[1].decision.motivo, /se cayó/);
    // La pantalla no viaja en el resultado (va a la auditoría).
    assert.equal((r[0].consulta as any).html, undefined);
  });

  it("idempotente: verificar dos veces no marca dos veces", async () => {
    const arca = arcaSimulado({ "20475604254": [{ inicio: "2026-10-24", fin: "2026-10-24" }] });
    const base = baseSimulada();
    const items = [item("20475604254", "2026-10-24")];
    const a = await verificarLote({ items, consultar: arca.consultar, aplicar: base.aplicar });
    const b = await verificarLote({ items, consultar: arca.consultar, aplicar: base.aplicar });
    assert.equal(a[0].accion, "marcada_presentada");
    assert.equal(b[0].accion, "ya_resuelta");
    assert.equal(base.marcas.length, 1);
  });

  it("un duplicado de WeProdu no consulta ARCA", async () => {
    const arca = arcaSimulado({});
    const base = baseSimulada();
    const r = await verificarLote({ items: [item("20381538487", "2026-10-09", { otroContratoMismoDia: true })], consultar: arca.consultar, aplicar: base.aplicar });
    assert.equal(arca.consultas.length, 0);
    assert.equal(r[0].decision.accion, "revision_manual");
  });

  it("pausa entre consultas a ARCA, no antes de la primera", async () => {
    const arca = arcaSimulado({ a: [], b: [], c: [] });
    let pausas = 0;
    await verificarLote({ items: [item("a", "2026-10-01"), item("b", "2026-10-01"), item("c", "2026-10-01")], consultar: arca.consultar, aplicar: baseSimulada().aplicar, pausa: async () => void pausas++ });
    assert.equal(pausas, 2);
  });
});

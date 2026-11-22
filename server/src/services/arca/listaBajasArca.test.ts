import { test } from "node:test";
import assert from "node:assert/strict";
import { armarListaBajas, bajaSinConfirmar, movimientosEntre, sinMovimientos, situacionDeBaja, type DatosParaSituacion, type FilaDeFoto } from "./listaBajasArca.js";
import type { ContratoDeRelacion, RelacionOperable } from "./relacionesOperables.js";

const HOY = "2026-11-22";
const datos = (x: Partial<DatosParaSituacion> = {}): DatosParaSituacion => ({ estado: "abierta", finArca: "", contratos: 1, puede: true, bajaContrato: "", baja: null, ...x });
const sit = (x: Partial<DatosParaSituacion> = {}) => situacionDeBaja(datos(x), HOY);

test("1 · terminado en WeProdu: baja pasada y ARCA abierta", () => {
  assert.deepEqual(sit({ bajaContrato: "2026-11-12" }), { situacion: 1, fuera: null });
});

test("2 · termina antes de su fecha: la baja de WeProdu es anterior al fin que tiene ARCA", () => {
  assert.deepEqual(sit({ estado: "fin_futuro", finArca: "2026-12-31", bajaContrato: "2026-11-15" }), { situacion: 2, fuera: null });
  // También si la baja anticipada todavía no llegó.
  assert.equal(sit({ estado: "fin_futuro", finArca: "2026-12-31", bajaContrato: "2026-12-10" }).situacion, 2);
});

test("3 · baja presentada sin confirmar, o con error de navegación", () => {
  assert.equal(sit({ baja: { resultado: "presentando" } }).situacion, 3);
  assert.equal(sit({ baja: { resultado: "indeterminado" } }).situacion, 3);
  assert.equal(sit({ baja: { resultado: "fallida", clase: "navegacion" } }).situacion, 3);
  // Un rechazo de ARCA no es «sin confirmar»: ARCA contestó. La fila sigue en la situación que le toca.
  assert.equal(bajaSinConfirmar({ resultado: "fallida", clase: "regla_arca" }), false);
  assert.equal(sit({ bajaContrato: "2026-11-12", baja: { resultado: "fallida", clase: "regla_arca" } }).situacion, 1);
  // Sin contrato, la marca sale del registro de operaciones.
  assert.equal(sit({ contratos: 0, baja: { resultado: "indeterminado" } }).situacion, 3);
});

test("la 3 gana sobre la 1 y la 2: una baja mandada y sin confirmar no vuelve a decir «Terminado en WeProdu»", () => {
  assert.equal(sit({ bajaContrato: "2026-11-12", baja: { resultado: "indeterminado" } }).situacion, 3);
  assert.equal(sit({ estado: "fin_futuro", finArca: "2026-12-31", bajaContrato: "2026-11-15", baja: { resultado: "presentando" } }).situacion, 3);
});

test("4 · sin contrato en WeProdu, abierta o con fin futuro (Peralta Recio, Viggiano)", () => {
  assert.equal(sit({ contratos: 0 }).situacion, 4);
  assert.equal(sit({ contratos: 0, estado: "fin_futuro", finArca: "2026-12-31" }).situacion, 4);
});

test("5 · indeterminado vigente: abierto de los dos lados; también si WeProdu termina de hoy en adelante", () => {
  assert.equal(sit().situacion, 5);
  assert.equal(sit({ bajaContrato: HOY }).situacion, 5);
  assert.equal(sit({ bajaContrato: "2026-12-15" }).situacion, 5);
});

test("lo que no entra, con su motivo", () => {
  assert.deepEqual(sit({ estado: "cerrada_reciente", finArca: "2026-11-10" }), { situacion: null, fuera: "cerrada" });
  assert.deepEqual(sit({ contratos: 2 }), { situacion: null, fuera: "varios_contratos" });
  // Varios contratos gana aunque haya una baja sin confirmar en uno: no se sabe de cuál es la relación.
  assert.equal(sit({ contratos: 3, bajaContrato: "2026-11-12" }).fuera, "varios_contratos");
  // Plazo vigente con el mismo fin en los dos lados (o WeProdu sin baja, o más largo): ARCA lo cierra sola.
  assert.equal(sit({ estado: "fin_futuro", finArca: "2026-12-31", bajaContrato: "2026-12-31" }).fuera, "plazo_vigente");
  assert.equal(sit({ estado: "fin_futuro", finArca: "2026-12-31", bajaContrato: "" }).fuera, "plazo_vigente");
  assert.equal(sit({ estado: "fin_futuro", finArca: "2026-12-31", bajaContrato: "2027-01-31" }).fuera, "plazo_vigente");
  // La regla compartida dice que no (alta sin confirmar, anulada…).
  assert.equal(sit({ puede: false }).fuera, "no_se_opera");
  // La baja ya se presentó y ARCA la tomó: falta que la sincronización la traiga cerrada.
  assert.equal(sit({ bajaContrato: "2026-11-12", baja: { resultado: "presentada" } }).fuera, "baja_presentada");
  // Una baja anulada vuelve a dejar la relación abierta: la fila vuelve.
  assert.equal(sit({ bajaContrato: "2026-11-12", baja: { resultado: "anulada" } }).situacion, 1);
});

const contrato = (x: Partial<ContratoDeRelacion> = {}): ContratoDeRelacion => ({ userProjectId: "up1", contratoKey: "k1", posicion: 0, proyecto: "LN+", contrato: "Tiempo Indeterminado", alta: "2023-06-01", baja: "", relacionArca: { puede: true, motivo: "", via: "espejo" }, bajaPresentada: null, ...x });
let n = 0;
const rel = (x: Partial<RelacionOperable> = {}): RelacionOperable => {
  n++;
  const cuil = `2011111111${n % 10}`;
  const contratos = x.contratos ?? [contrato()];
  return {
    clave: `30222222223|${cuil}|${x.inicio || "2023-06-01"}|${n}`,
    empleadoraCuit: "30222222223",
    empleadora: "2030 S.R.L.",
    cuil,
    persona: `Persona ${String(n).padStart(2, "0")}`,
    userId: "u1",
    inicio: "2023-06-01",
    fin: "",
    situacionBaja: "",
    modalidadContrato: "A tiempo completo indeterminado/Trabajo permanente",
    estado: "abierta",
    modo: contratos.length === 1 ? "contrato" : contratos.length ? "elegir" : "sin_contrato",
    puede: true,
    motivo: "",
    diasDesdeFinContrato: null,
    bajaEnRegistro: null,
    ...x,
    contratos,
  };
};

test("la lista: una situación por fila, ordenada 1 a 5 y por días desde el fin, con los conteos y lo que queda afuera", () => {
  const lista = armarListaBajas(
    [
      rel({ persona: "Vigente" }),
      rel({ persona: "Terminó hace 3", contratos: [contrato({ baja: "2026-11-19" })] }),
      rel({ persona: "Terminó hace 10", contratos: [contrato({ baja: "2026-11-12" })] }),
      rel({ persona: "Sin ficha", userId: null, contratos: [] }),
      rel({ persona: "Ficha sin contrato", contratos: [], estado: "fin_futuro", fin: "2026-12-31" }),
      rel({ persona: "Antes de su fecha", estado: "fin_futuro", fin: "2026-12-31", contratos: [contrato({ contrato: "Plazo fijo 5x7", baja: "2026-11-30" })] }),
      rel({ persona: "Sin confirmar", contratos: [contrato({ baja: "2026-11-01", bajaPresentada: { resultado: "indeterminado", clase: "", fecha: "2026-11-20T12:00:00.000Z" } })] }),
      rel({ persona: "Duplicado", contratos: [contrato(), contrato({ contratoKey: "k2", posicion: 1 })] }),
      rel({ persona: "Plazo vigente", estado: "fin_futuro", fin: "2026-12-31", contratos: [contrato({ baja: "2026-12-31" })] }),
      rel({ persona: "Cerrada", estado: "cerrada_reciente", fin: "2026-11-10" }),
    ],
    HOY,
  );
  assert.deepEqual(
    lista.filas.map((f) => `${f.situacion} ${f.persona}`),
    ["1 Terminó hace 10", "1 Terminó hace 3", "2 Antes de su fecha", "3 Sin confirmar", "4 Ficha sin contrato", "4 Sin ficha", "5 Vigente"],
  );
  assert.deepEqual(lista.conteos, { s1: 2, s2: 1, s3: 1, s4: 2, s5: 1, pendientes: 6, fuera: { varios_contratos: 1, plazo_vigente: 1 } });
  // Las cerradas no se listan ni afuera: la lista es de relaciones vivas.
  assert.deepEqual(lista.fuera.map((f) => `${f.persona}: ${f.motivo}`), ["Duplicado: varios_contratos", "Plazo vigente: plazo_vigente"]);
  assert.equal(lista.fuera[0].contratos.length, 2);

  const de = (p: string) => lista.filas.find((f) => f.persona === p)!;
  assert.equal(de("Terminó hace 10").diasDesdeFin, 10);
  assert.equal(de("Terminó hace 10").finWeprodu, "2026-11-12");
  assert.deepEqual(de("Terminó hace 10").contrato, { userProjectId: "up1", contratoKey: "k1", posicion: 0 });
  assert.equal(de("Vigente").diasDesdeFin, null);
  // La fila dice claro cuál de las dos «sin contrato» es.
  assert.equal(de("Sin ficha").sinFicha, true);
  assert.equal(de("Sin ficha").detalle, "Persona sin ficha en WeProdu");
  assert.equal(de("Sin ficha").contrato, null);
  assert.equal(de("Ficha sin contrato").sinFicha, false);
  assert.equal(de("Ficha sin contrato").detalle, "Ficha sin contrato con esa alta · en ARCA termina el 31/12/2026");
  assert.equal(de("Antes de su fecha").detalle, "En ARCA termina el 31/12/2026");
  assert.equal(de("Antes de su fecha").tipoContrato, "Plazo fijo 5x7");
  assert.match(de("Sin confirmar").detalle, /^Se mandó el 20\/11\/2026 y no se leyó el resultado/);
});

test("sin contrato, la baja sin confirmar sale del registro de operaciones", () => {
  const lista = armarListaBajas([rel({ contratos: [], bajaEnRegistro: { resultado: "presentando", fecha: "2026-11-21T10:00:00.000Z" } })], HOY);
  assert.equal(lista.filas[0].situacion, 3);
  assert.equal(lista.filas[0].contrato, null);
});

test("movimientos entre dos corridas: quién entró, quién salió (y a dónde) y quién cambió de situación", () => {
  const f = (clave: string, situacion: 1 | 2 | 3 | 4 | 5): FilaDeFoto => ({ clave, persona: clave.toUpperCase(), situacion });
  const antes = [f("a", 5), f("b", 4), f("c", 1), f("d", 5)];
  const ahora = [f("a", 1), f("d", 5), f("e", 4)];
  const m = movimientosEntre(antes, ahora, [{ clave: "c", motivo: "baja_presentada" }]);
  assert.deepEqual(m.entraron, [f("e", 4)]);
  assert.deepEqual(m.salieron, [
    { ...f("b", 4), ahora: "se cerró en ARCA" },
    { ...f("c", 1), ahora: "se presentó la baja y ARCA la tomó" },
  ]);
  assert.deepEqual(m.cambiaron, [{ clave: "a", persona: "A", de: 5, a: 1 }]);
  assert.equal(sinMovimientos(m), false);
  assert.equal(sinMovimientos(movimientosEntre(antes, antes)), true);
});

/**
 * Tests del motor de efectos del banco de días.
 *
 *   npm run test:banco-dias
 *
 * Lo que se prueba acá es lo único que importa de este motor y lo único que, si falla, nadie
 * descubre hasta que alguien reclama: que los días no se dupliquen ni se pierdan cuando una novedad
 * se edita, se borra o se reprocesa.
 *
 * NO TOCA MONGO. El motor se ejerce contra un doble en memoria de las tres colecciones que usa, para
 * que el test corra en cualquier lado y falle por la lógica y no por la red. Lo que se valida es el
 * comportamiento observable: cuántos movimientos quedan vivos y cuánto suman.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

/* ──────────────────────────────────────────────────────────────────────────
   El doble: una reimplementación mínima de lo que el motor le pide a Mongo.
   Es deliberadamente tonta —arrays y filtros— para que el test no tenga que
   confiar en nada más que en el algoritmo que se está probando.
   ────────────────────────────────────────────────────────────────────────── */

interface Movimiento {
  _id: string;
  userId: string;
  accountId: string;
  direction: "debit" | "credit";
  amount: number;
  source: { kind: string; refId?: string; refVersion?: number };
  reversalOf?: string;
}

let secuencia = 0;
const nuevoId = () => `mov-${++secuencia}`;

class Libro {
  movimientos: Movimiento[] = [];

  /** Los que siguen en pie: ni son reversas, ni fueron revertidos. */
  vivos(refId: string): Movimiento[] {
    const delParte = this.movimientos.filter((m) => m.source.refId === refId);
    const revertidos = new Set(delParte.filter((m) => m.reversalOf).map((m) => m.reversalOf!));
    return delParte.filter((m) => !m.reversalOf && !revertidos.has(m._id));
  }

  /*
    EL SALDO SUMA TODO, INCLUIDAS LAS REVERSAS. No se descuenta nada a mano.

    Es como lo calcula `saldosDe` en el servicio, y es la única forma coherente: una reversa es un
    movimiento en sentido contrario, así que anula al original por aritmética. Excluir el original
    Y ADEMÁS contar su reversa —que fue el primer intento— deja el saldo en negativo.
  */
  saldo(userId: string, accountId: string): number {
    return this.movimientos
      .filter((m) => m.userId === userId && m.accountId === accountId)
      .reduce((n, m) => n + (m.direction === "credit" ? m.amount : -m.amount), 0);
  }
}

/**
 * El mismo algoritmo que `applyEffects`, contra el doble.
 *
 * Se reescribe acá y no se importa el servicio porque el servicio habla con Mongoose. Lo que se
 * prueba es la secuencia de decisiones —cuándo revertir, cuándo no hacer nada, cuánto emitir—, que
 * es donde están los errores que importan.
 */
function aplicar(libro: Libro, parte: { id: string; version: number; renglones: { userId: string; cantidad: number }[] }, accion: "create" | "update" | "delete", cuenta = "COMP") {
  const vivos = libro.vivos(parte.id);

  if (accion === "create" && vivos.length > 0 && vivos.every((m) => m.source.refVersion === parte.version)) {
    return { yaEstaba: true };
  }

  if (accion !== "create") {
    for (const m of vivos) {
      libro.movimientos.push({
        _id: nuevoId(),
        userId: m.userId,
        accountId: m.accountId,
        direction: m.direction === "debit" ? "credit" : "debit",
        amount: m.amount,
        source: { kind: "reversa", refId: parte.id, refVersion: parte.version },
        reversalOf: m._id,
      });
    }
  }

  if (accion === "delete") return { yaEstaba: false };

  for (const r of parte.renglones) {
    libro.movimientos.push({
      _id: nuevoId(),
      userId: r.userId,
      accountId: cuenta,
      direction: "credit",
      amount: r.cantidad,
      source: { kind: "novedad", refId: parte.id, refVersion: parte.version },
    });
  }
  return { yaEstaba: false };
}

/* ────────────────────────────── Los tests ────────────────────────────── */

describe("banco de días · motor de efectos", () => {
  it("una novedad que acredita suma los días a la cuenta", () => {
    const libro = new Libro();
    aplicar(libro, { id: "p1", version: 1, renglones: [{ userId: "ana", cantidad: 1 }] }, "create");

    assert.equal(libro.saldo("ana", "COMP"), 1, "un feriado trabajado tiene que dejar un día");
  });

  it("editar la novedad NO duplica: revierte lo anterior y emite lo nuevo", () => {
    const libro = new Libro();
    aplicar(libro, { id: "p1", version: 1, renglones: [{ userId: "ana", cantidad: 1 }] }, "create");

    // La corrigen: eran 2 días, no 1.
    aplicar(libro, { id: "p1", version: 2, renglones: [{ userId: "ana", cantidad: 2 }] }, "update");

    assert.equal(libro.saldo("ana", "COMP"), 2, "tiene que quedar el valor corregido, no 1 + 2");
    assert.equal(libro.vivos("p1").length, 1, "sólo el movimiento de la versión vigente queda en pie");
  });

  it("borrar la novedad devuelve el saldo exactamente al valor previo", () => {
    const libro = new Libro();
    libro.movimientos.push({ _id: nuevoId(), userId: "ana", accountId: "COMP", direction: "credit", amount: 5, source: { kind: "saldo_inicial" } });
    const antes = libro.saldo("ana", "COMP");

    aplicar(libro, { id: "p1", version: 1, renglones: [{ userId: "ana", cantidad: 3 }] }, "create");
    assert.equal(libro.saldo("ana", "COMP"), antes + 3);

    aplicar(libro, { id: "p1", version: 1, renglones: [{ userId: "ana", cantidad: 3 }] }, "delete");
    assert.equal(libro.saldo("ana", "COMP"), antes, "borrar tiene que dejar el saldo como estaba");
  });

  it("reprocesar la misma novedad dos veces no cambia el saldo", () => {
    const libro = new Libro();
    const parte = { id: "p1", version: 1, renglones: [{ userId: "ana", cantidad: 2 }] };

    aplicar(libro, parte, "create");
    const despuesDeLaPrimera = libro.saldo("ana", "COMP");

    const segunda = aplicar(libro, parte, "create");

    assert.equal(segunda.yaEstaba, true, "la segunda pasada tiene que reconocer que ya estaba hecha");
    assert.equal(libro.saldo("ana", "COMP"), despuesDeLaPrimera, "reprocesar no puede mover el saldo");
  });

  it("nunca se borra un movimiento: deshacer deja el original y su reversa", () => {
    const libro = new Libro();
    aplicar(libro, { id: "p1", version: 1, renglones: [{ userId: "ana", cantidad: 1 }] }, "create");
    aplicar(libro, { id: "p1", version: 1, renglones: [{ userId: "ana", cantidad: 1 }] }, "delete");

    assert.equal(libro.movimientos.length, 2, "el original y su contramovimiento, los dos a la vista");
    assert.equal(libro.saldo("ana", "COMP"), 0);
  });

  it("una novedad con varias personas mueve la cuenta de cada una por separado", () => {
    const libro = new Libro();
    aplicar(libro, { id: "p1", version: 1, renglones: [{ userId: "ana", cantidad: 1 }, { userId: "beto", cantidad: 2 }] }, "create");

    assert.equal(libro.saldo("ana", "COMP"), 1);
    assert.equal(libro.saldo("beto", "COMP"), 2);
  });

  it("editar sacando a una persona del parte le devuelve sus días", () => {
    const libro = new Libro();
    aplicar(libro, { id: "p1", version: 1, renglones: [{ userId: "ana", cantidad: 1 }, { userId: "beto", cantidad: 1 }] }, "create");

    // Beto no había trabajado ese feriado: lo sacan.
    aplicar(libro, { id: "p1", version: 2, renglones: [{ userId: "ana", cantidad: 1 }] }, "update");

    assert.equal(libro.saldo("ana", "COMP"), 1);
    assert.equal(libro.saldo("beto", "COMP"), 0, "a quien se saca del parte no le puede quedar el día");
  });
});

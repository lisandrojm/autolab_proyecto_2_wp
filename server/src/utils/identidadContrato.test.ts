/**
 * Etapa 2: la identidad de los contratos (`contratoKey`). Sin base: el modelo valida en memoria.
 *
 *   npm run test:identidad-contrato
 *
 * Dos capas:
 *  1. Cada PATRÓN con el que el código crea o reemplaza un contrato, ejercitado sobre el modelo real
 *     (`UserProject.hydrate` + `validate`, que es donde corre el hook).
 *  2. Cada SITIO del código que reemplaza un contrato entero, uno por uno: que use un patrón cubierto.
 *     Un sitio nuevo que no encaje hace fallar esta prueba: así un contrato no vuelve a quedar anónimo
 *     sin que nadie se entere.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { clavesAPoner, conClaveNueva, resolverIndiceContrato } from "./identidadContrato.js";
import { quitarContrato } from "../services/contratoDeSolicitud.js";

const K = () => new Types.ObjectId();
const clave = (c: any) => (c?.contratoKey ? String(c.contratoKey) : null);
/** Un vínculo como viene de la base: dos contratos con clave y uno viejo sin clave. */
const desdeLaBase = (k1 = K(), k2 = K()) =>
  UserProject.hydrate({
    _id: K(),
    projectId: K(),
    userId: K(),
    contracts: [
      { fecha_alta_contrato: "2023-06-01", fecha_carga: "2024-10-04", nombre_contrato: "Tiempo Indeterminado", contratoKey: k1 },
      { fecha_alta_contrato: "2026-01-07", fecha_carga: "2026-10-29", nombre_contrato: "Tiempo Indeterminado", contratoKey: k2 },
      { fecha_alta_contrato: "2025-07-29", fecha_carga: "2025-07-30", nombre_contrato: "Jornada" },
    ],
  }) as any;

describe("clavesAPoner (pura)", () => {
  const seq = () => { let n = 0; return () => `nueva${++n}`; };
  it("los contratos sin tocar conservan su clave; el viejo sin clave queda para el backfill", () => {
    assert.deepEqual(clavesAPoner(["a", "b", null], [{ clave: "a", nuevo: false }, { clave: "b", nuevo: false }, { clave: null, nuevo: false }], seq()), [null, null, null]);
  });
  it("un reemplazo sin clave hereda la de su posición", () => {
    assert.deepEqual(clavesAPoner(["a", "b"], [{ clave: "a", nuevo: false }, { clave: null, nuevo: true }], seq()), [null, { tipo: "heredada", clave: "b" }]);
  });
  it("con el array más corto (se borró uno) no se hereda: un reemplazo recibe una nueva", () => {
    assert.deepEqual(clavesAPoner(["a", "b", "c"], [{ clave: "a", nuevo: false }, { clave: null, nuevo: true }], seq()), [null, { tipo: "nueva", clave: "nueva1" }]);
  });
  it("una copia que repite la clave de otro contrato recibe una nueva (no la de la posición: es otro contrato), aunque esté antes en el array", () => {
    assert.deepEqual(clavesAPoner(["a", "b"], [{ clave: "b", nuevo: true }, { clave: "b", nuevo: false }], seq()), [{ tipo: "nueva", clave: "nueva1" }, null]);
    assert.deepEqual(clavesAPoner(["a"], [{ clave: "a", nuevo: false }, { clave: "a", nuevo: true }], seq()), [null, { tipo: "nueva", clave: "nueva1" }]);
  });
  it("documento nuevo (sin claves al cargar): cada contrato recibe la suya", () => {
    assert.deepEqual(clavesAPoner(undefined, [{ clave: null, nuevo: true }, { clave: null, nuevo: true }], seq()), [{ tipo: "nueva", clave: "nueva1" }, { tipo: "nueva", clave: "nueva2" }]);
  });
});

describe("patrones de escritura, sobre el modelo", () => {
  it("P1 · reemplazo con `{ ...contrato.toObject(), cambio }` (23 sitios): conserva la clave", async () => {
    const k2 = K();
    const up = desdeLaBase(K(), k2);
    up.contracts[1] = { ...up.contracts[1].toObject(), nombre_estado_empleado: "AFIP" };
    await up.validate();
    assert.equal(clave(up.contracts[1]), String(k2));
  });

  it("P2 · assign-member al editar: el contrato se arma desde el body con `contratoKey: undefined` y hereda la del que reemplaza", async () => {
    const k2 = K();
    const up = desdeLaBase(K(), k2);
    const delBody = { fecha_alta_contrato: "2026-01-07", nombre_contrato: "Tiempo Indeterminado", contratoKey: String(K()) };
    up.contracts[1] = { ...delBody, contratoKey: undefined };
    await up.validate();
    assert.equal(clave(up.contracts[1]), String(k2), "editar no lo vuelve anónimo, y el body no puede imponer una clave");
  });

  it("P2b · assign-member con `isUpdate` sin índice: reemplaza el último y también hereda", async () => {
    const up = desdeLaBase();
    up.contracts[up.contracts.length - 1] = { fecha_alta_contrato: "2025-07-29", contratoKey: undefined };
    await up.validate();
    // El último era viejo y sin clave: no hay nada que heredar, recibe una nueva (y desde ahí es estable).
    assert.ok(clave(up.contracts[2]));
  });

  it("P3 · push de un contrato nuevo (assign-member, aprobar solicitud): clave nueva, distinta de las demás", async () => {
    const up = desdeLaBase();
    up.contracts.push({ fecha_alta_contrato: "2026-11-20", contratoKey: undefined });
    await up.validate();
    const claves = up.contracts.map(clave).filter(Boolean);
    assert.equal(new Set(claves).size, claves.length);
    assert.ok(clave(up.contracts[3]));
  });

  it("P4 · alta de un vínculo con sus contratos (`UserProject.create`, FRAME y assign-member): cada uno con clave", async () => {
    const up: any = new UserProject({ projectId: K(), userId: K(), contracts: [{ fecha_alta_contrato: "2026-11-20" }, { fecha_alta_contrato: "2026-11-21" }] });
    await up.validate();
    assert.ok(clave(up.contracts[0]) && clave(up.contracts[1]) && clave(up.contracts[0]) !== clave(up.contracts[1]));
  });

  it("P5 · quitar un contrato (splice): los que quedan conservan SU clave aunque cambien de posición", async () => {
    const k1 = K(), k2 = K();
    const up = desdeLaBase(k1, k2);
    up.save = async () => up; // sin base: sólo interesa qué queda en memoria
    await quitarContrato(up, 0);
    await up.validate();
    assert.equal(clave(up.contracts[0]), String(k2), "el que se corrió a la posición 0 sigue siendo el mismo contrato");
  });

  it("P6 · `$push` por `updateOne` (import de FRAME, no pasa por los hooks): `conClaveNueva`", () => {
    const [a, b] = conClaveNueva([{ fecha_alta_contrato: "2026-01-01" }, { fecha_alta_contrato: "2026-02-01" }]);
    assert.ok(a.contratoKey instanceof Types.ObjectId && b.contratoKey instanceof Types.ObjectId);
    assert.notEqual(String(a.contratoKey), String(b.contratoKey));
  });

  it("P7 · copiar un contrato del mismo vínculo con su clave: la copia recibe otra", async () => {
    const k1 = K();
    const up = desdeLaBase(k1);
    up.contracts.push({ ...up.contracts[0].toObject() });
    await up.validate();
    assert.equal(clave(up.contracts[0]), String(k1));
    assert.notEqual(clave(up.contracts[3]), String(k1));
  });

  it("un contrato viejo sin clave que nadie toca sigue sin clave: eso lo hace el backfill, con huella", async () => {
    const up = desdeLaBase();
    up.contracts[0].nombre_estado_empleado = "Disponible";
    await up.validate();
    assert.equal(clave(up.contracts[2]), null);
  });
});

describe("resolverIndiceContrato", () => {
  const k = K();
  const up = { contracts: [{ contratoKey: K() }, { contratoKey: k }, {}] };
  it("por clave, por posición, y -1 si no está", () => {
    assert.equal(resolverIndiceContrato(up, String(k)), 1);
    assert.equal(resolverIndiceContrato(up, "2"), 2);
    assert.equal(resolverIndiceContrato(up, "3"), -1);
    assert.equal(resolverIndiceContrato(up, String(K())), -1);
  });
});

describe("cada sitio que reemplaza un contrato entero usa un patrón cubierto", () => {
  const raiz = new URL("..", import.meta.url).pathname; // server/src
  const archivos: string[] = [];
  const recorrer = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (n !== "scripts" && n !== "node_modules") recorrer(p); }
      else if (/\.ts$/.test(n) && !/\.test\.ts$|\.d\.ts$/.test(n)) archivos.push(p);
    }
  };
  recorrer(raiz);
  const sitios: { donde: string; texto: string; antes: string; archivo: string }[] = [];
  for (const f of archivos) {
    const archivo = readFileSync(f, "utf8");
    const lineas = archivo.split("\n");
    lineas.forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
      if (/\bcontracts\[[^\]]+\]\s*=(?!=)/.test(l)) sitios.push({ donde: `${relative(raiz, f)}:${i + 1}`, texto: lineas.slice(i, i + 3).join("\n"), antes: lineas.slice(Math.max(0, i - 60), i).join("\n"), archivo });
    });
  }

  it("hay sitios para revisar (si esto da 0, la búsqueda se rompió)", () => assert.ok(sitios.length >= 20, `encontré ${sitios.length}`));

  for (const s of sitios) {
    it(s.donde, () => {
      // P1: copia del MISMO contrato, directa (`...x.toObject()`) o por una variable que salió de `.toObject()`.
      if (/\.\.\.\(?[\w.[\]\s]*(as any\))?\.toObject\(\)/.test(s.texto)) return;
      const variable = /=\s*\{\s*\.\.\.(\w+)/.exec(s.texto)?.[1] || /=\s*(\w+)(\s+as\s+any)?\s*;/.exec(s.texto)?.[1];
      if (variable && new RegExp(`(const|let)\\s+${variable}\\b[^=]*=\\s*\\{?\\s*(\\.\\.\\.)?\\(?[^;]*\\.toObject\\(\\)`).test(s.antes)) return;
      // P8: la lápida de un contrato anulado lleva explícitamente la clave del contrato (etapa 2b).
      if (/=\s*lapidaDe\([^,]+,\s*contratoKey\b/.test(s.texto)) return;
      // P2: assign-member, armado desde el body: tiene que anular la clave del body y dejar que el modelo la herede.
      if (variable === "enrichedContract" && /const enrichedContract = \{\s*\.\.\.contract,[\s\S]{0,600}?contratoKey: undefined,/.test(s.archivo)) return;
      assert.fail(`Patrón no cubierto. Si este reemplazo no copia el MISMO contrato con .toObject(), revisá que no le borre ni le invente la clave (ver utils/identidadContrato.ts) y agregá su patrón a esta prueba:\n${s.texto}`);
    });
  }

  it("todo `$push` de contratos por update usa `conClaveNueva`", () => {
    for (const f of archivos) {
      const t = readFileSync(f, "utf8");
      if (/\$push[^;]{0,80}contracts/.test(t)) assert.match(t, /conClaveNueva\(/, `${relative(raiz, f)} hace $push de contratos sin conClaveNueva`);
    }
  });
});

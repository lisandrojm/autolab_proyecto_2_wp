/**
 * Etapa 2b: anular un contrato en vez de borrarlo. Sin base: los modelos se reemplazan por dobles.
 *
 *   npm run test:anulacion-contrato
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Types } from "mongoose";
import UserProject from "../models/UserProject.js";
import { ContratoAnulado } from "../models/ContratoAnulado.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import { anularContrato as anularReal, AnulacionInvalida } from "./anulacionContrato.js";
// Sin base: por defecto no hay referencias; un test las pone.
let refsDePrueba = { totalBloqueantes: 0, textoBloqueantes: "" };
const anularContrato = (o: any) => anularReal(o, { referencias: async () => refsDePrueba });
import { esLapida, lapidaDe, quedanContratosSiSeAnula, ultimoNoAnulado } from "../utils/anulacionContrato.js";
import { buildContractKey, findNewContracts } from "../utils/additiveSync.js";
import { resolverIndiceContrato } from "../utils/identidadContrato.js";
import { elegirContratoDeSolicitud } from "./contratoDeSolicitud.js";

const K = () => new Types.ObjectId();
const frame = (alta: string) => ({ proyecto_id: 705, empleado_id: 199, fecha_alta_contrato: alta, tipo_contrato_id: 3, categoria_sat_id: 9, nombre_contrato: "Jornada" });

// Dobles de la base: lo que se archiva, lo que se borra y si se guardó.
let archivados: any[] = [];
let borradosDelArchivo: any[] = [];
let pulls: string[] = [];
beforeEach(() => {
  refsDePrueba = { totalBloqueantes: 0, textoBloqueantes: "" };
  archivados = [];
  borradosDelArchivo = [];
  pulls = [];
  (ContratoAnulado as any).create = async (d: any) => { const doc = { ...d, _id: K() }; archivados.push(doc); return doc; };
  (ContratoAnulado as any).deleteOne = async (f: any) => { borradosDelArchivo.push(f); return { deletedCount: 1 }; };
  (Project as any).findByIdAndUpdate = async () => { pulls.push("project"); return null; };
  (User as any).findByIdAndUpdate = async () => { pulls.push("user"); return null; };
  (User as any).findById = () => ({ select: () => ({ lean: () => ({ catch: () => Promise.resolve({ metadata: { fullName: "ADMIN PRUEBA" } }) }) }) });
});

/** Un vínculo como viene de la base, con `save` y `deleteOne` de mentira. */
const vinculo = (contratos: any[], o: { saveFalla?: boolean } = {}) => {
  const up: any = UserProject.hydrate({ _id: K(), projectId: K(), userId: K(), contracts: contratos });
  up.guardado = false;
  up.borrado = false;
  up.save = async () => { if (o.saveFalla) throw new Error("se cayó la base"); await up.validate(); up.guardado = true; return up; };
  up.deleteOne = async () => { up.borrado = true; };
  return up;
};

describe("piezas puras", () => {
  it("la lápida tiene sólo la clave, la marca y la anulación (con la clave de FRAME del contrato)", () => {
    const k = K();
    const l: any = lapidaDe(frame("2025-07-29"), k, { el: new Date(), por: null, porNombre: "x", motivo: "duplicado" });
    assert.deepEqual(Object.keys(l).sort(), ["anulacion", "contratoKey", "estadoContrato"]);
    assert.equal(l.anulacion.claveFrame, buildContractKey(frame("2025-07-29")));
    assert.ok(esLapida(l));
  });
  it("quedan contratos / último no anulado", () => {
    const l = { estadoContrato: "ANULADO" };
    assert.equal(quedanContratosSiSeAnula([{}, l], 0), false);
    assert.equal(quedanContratosSiSeAnula([{}, {}], 0), true);
    assert.equal(ultimoNoAnulado([{}, {}, l]), 1);
    assert.equal(ultimoNoAnulado([l]), -1);
  });
  it("el resolver no devuelve una lápida, ni por posición ni por clave: no se puede editar", () => {
    const k = K();
    const up = { contracts: [{}, { contratoKey: k, estadoContrato: "ANULADO" }] };
    assert.equal(resolverIndiceContrato(up, "1"), -1);
    assert.equal(resolverIndiceContrato(up, String(k)), -1);
    assert.equal(resolverIndiceContrato(up, "0"), 0);
  });
  it("FRAME no vuelve a agregar un contrato anulado (reconoce la lápida por su clave)", () => {
    const anulado: any = lapidaDe(frame("2025-07-29"), K(), { el: new Date(), por: null, porNombre: "", motivo: "x" });
    const { newContracts } = findNewContracts([frame("2025-07-29"), frame("2025-08-16")], [anulado]);
    assert.deepEqual(newContracts.map((c) => c.fecha_alta_contrato), ["2025-08-16"]);
  });
  it("buscar el contrato de una solicitud saltea las lápidas", () => {
    const sid = String(K());
    const todos = [{ c: { estadoContrato: "ANULADO" } }, { c: { solicitudId: sid, fecha_alta_contrato: "2026-10-17" } }];
    assert.equal(elegirContratoDeSolicitud(todos.filter((x) => !esLapida(x.c)), { solicitudId: sid }), todos[1]);
  });
});

describe("anularContrato", () => {
  it("archiva el contrato entero y deja la lápida en SU posición: los demás no se corren y conservan su clave", async () => {
    const k0 = K(), k1 = K(), k2 = K();
    const up = vinculo([{ ...frame("2023-06-01"), contratoKey: k0 }, { ...frame("2025-07-29"), contratoKey: k1 }, { ...frame("2025-08-16"), contratoKey: k2 }]);
    const r = await anularContrato({ up, idx: 1, por: K(), motivo: "Duplicado", origen: "panel" });
    assert.equal(r.vinculoEliminado, false);
    assert.equal(up.contracts.length, 3);
    assert.ok(esLapida(up.contracts[1]));
    assert.equal(String(up.contracts[1].contratoKey), String(k1), "la lápida conserva la clave del contrato");
    assert.equal(String(up.contracts[2].contratoKey), String(k2));
    assert.equal(up.contracts[2].fecha_alta_contrato, "2025-08-16", "el de después sigue en su lugar");
    assert.equal(archivados.length, 1);
    assert.equal(archivados[0].contrato.fecha_alta_contrato, "2025-07-29");
    assert.equal(archivados[0].anuladoPorNombre, "ADMIN PRUEBA");
    assert.equal(archivados[0].posicion, 1);
    assert.ok(up.guardado);
  });

  it("un contrato todavía sin clave (antes del backfill) recibe una, la misma en la lápida y en el archivo", async () => {
    const up = vinculo([frame("2023-06-01"), frame("2025-07-29")]);
    const r = await anularContrato({ up, idx: 0, motivo: "x", origen: "panel" });
    assert.equal(String(up.contracts[0].contratoKey), r.contratoKey);
    assert.equal(String(archivados[0].contratoKey), r.contratoKey);
  });

  it("si era el último contrato de verdad, se va el vínculo (como el borrado de antes) y el contrato queda archivado", async () => {
    const up = vinculo([{ estadoContrato: "ANULADO", contratoKey: K() }, frame("2025-07-29")]);
    const r = await anularContrato({ up, idx: 1, motivo: "x", origen: "borrar_solicitud" });
    assert.equal(r.vinculoEliminado, true);
    assert.ok(up.borrado);
    assert.deepEqual(pulls.sort(), ["project", "user"]);
    assert.equal(archivados[0].vinculoEliminado, true);
  });

  it("si la lápida no se puede guardar, se borra el archivo: no queda un «anulado» que sigue vivo", async () => {
    const up = vinculo([frame("2023-06-01"), frame("2025-07-29")], { saveFalla: true });
    await assert.rejects(anularContrato({ up, idx: 0, motivo: "x", origen: "panel" }), /se cayó la base/);
    assert.equal(borradosDelArchivo.length, 1);
  });

  it("no anula dos veces, ni sin motivo, ni una posición que no existe", async () => {
    const up = vinculo([{ estadoContrato: "ANULADO", contratoKey: K() }, frame("2025-07-29")]);
    await assert.rejects(anularContrato({ up, idx: 0, motivo: "x", origen: "panel" }), AnulacionInvalida);
    await assert.rejects(anularContrato({ up, idx: 1, motivo: "  ", origen: "panel" }), /motivo/);
    await assert.rejects(anularContrato({ up, idx: 5, motivo: "x", origen: "panel" }), AnulacionInvalida);
    assert.equal(archivados.length, 0);
  });
});

describe("una lápida no se vuelve a escribir", () => {
  it("con los defaults de Mongoose valida; con datos de contrato encima, el modelo se niega (no se resucita a medias)", async () => {
    const up: any = new UserProject({ projectId: K(), userId: K(), contracts: [frame("2023-06-01"), lapidaDe(frame("2025-07-29"), K(), { el: new Date(), por: null, porNombre: "", motivo: "x" })] });
    await up.validate();
    // Como lo haría un endpoint por índice: `{ ...contrato.toObject(), campo }` sobre la posición de la lápida.
    up.contracts[1] = { ...up.contracts[1].toObject(), firmaContratoUrl: "https://x/contrato.pdf", estado_id: 5 };
    await assert.rejects(up.validate(), /está anulado: no se puede escribir \(.*firmaContratoUrl/);
  });
});

describe("vigencia del server con lápidas", () => {
  it("una lápida no es vigente ni indeterminada, y getContratoActivo no la elige (devuelve el mismo objeto)", async () => {
    const { esContratoVigente, esTiempoIndeterminado, getContratoActivo } = await import("../utils/contratoVigencia.js");
    const lapida: any = { contratoKey: K(), estadoContrato: "ANULADO" };
    const jornada: any = { estadoContrato: "FINALIZADO", fecha_alta_contrato: "2025-07-29", fecha_baja_contrato: "2025-07-29" };
    assert.equal(esContratoVigente(lapida, "2026-11-18"), false);
    assert.equal(esTiempoIndeterminado(lapida), false);
    const lista = [jornada, lapida];
    assert.equal(lista.indexOf(getContratoActivo(lista, "2026-11-18")!), 0);
    assert.equal(getContratoActivo([lapida], "2026-11-18"), null);
  });
});

describe("referencias bloqueantes", () => {
  it("con recibos de sueldo colgando, no anula ni archiva: primero hay que moverlos", async () => {
    refsDePrueba = { totalBloqueantes: 2, textoBloqueantes: "2 recibos de sueldo (2026-09 firmado, 2026-10 enviado)" };
    const up = vinculo([frame("2023-06-01"), frame("2025-07-29")]);
    await assert.rejects(anularContrato({ up, idx: 0, motivo: "duplicado", origen: "panel" }), /mover o resolver .*2 recibos de sueldo/);
    assert.equal(archivados.length, 0);
    assert.ok(!esLapida(up.contracts[0]));
  });
});

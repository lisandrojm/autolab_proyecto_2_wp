import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contenidoDeSolicitud, nombreArchivoSolicitud } from "./espejoDropboxSolicitudes.js";

describe("el registro de una solicitud en Dropbox", () => {
  it("el nombre lleva fecha, persona sin tildes e id", () => {
    assert.equal(nombreArchivoSolicitud({ creadaEl: "2026-11-05T12:00:00Z", nombre: "José Ñandú  Pérez", id: "abc" }), "2026-11-05_Jose-Nandu-Perez_abc.json");
    assert.equal(nombreArchivoSolicitud({ creadaEl: "2026-11-05T12:00:00Z", nombre: "", id: "abc" }), "2026-11-05_sin-nombre_abc.json");
  });
  it("no guarda credenciales: sólo lo pedido", () => {
    const c = contenidoDeSolicitud({ _id: "1", password: "secreto", email: "x@y", metadata: { fullName: "Ana", startDate: "2026-11-10", projectIds: ["p"], password: "secreto" } });
    assert.equal(JSON.stringify(c).includes("secreto"), false);
    assert.equal(c.desde, "2026-11-10");
  });
  it("lleva el importe y cuándo se modificó: se reescribe al editar", () => {
    const c = contenidoDeSolicitud({ _id: "1", updatedAt: "2026-11-06T12:00:00Z", metadata: { fullName: "Ana", dailyRate: 0, workdaysCount: 1 } });
    assert.equal(c.importePorJornada, 0);
    assert.equal(c.jornadas, 1);
    assert.equal(c.modificadaEl, "2026-11-06T12:00:00Z");
  });
});

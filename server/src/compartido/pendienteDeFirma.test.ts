/**
 * La regla de Generar Documentos (ver `pendienteDeFirma.ts`): la misma que usan la pantalla y la
 * generación automática (27/11/2026).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pendienteDeFirma, releasesDelTipo, releaseRequiereFirma, plantillaTieneContenido } from "./pendienteDeFirma.js";

const tipoJornada = { _id: "tJornada", data: { requiereFirma: true, requiereFirmaRelease: true, requiereFirmaAlta: true } };
const plantillaJornada = { _id: "pfJornada", name: "Jornada", data: { id: 7, nombre: "Jornada" }, content: "<p>Contrato de jornada {{nombre}}</p>", contratoId: tipoJornada };
const plantillaVacia = { _id: "pfVacia", name: "Vacía", data: { nombre: "Vacía" }, content: "<p></p>", contratoId: tipoJornada };
const plantillaCustom = { _id: "pfCustom", name: "Contrato custom", data: { nombre: "Contrato custom" }, content: "<p>{{firma}}</p>", esCustom: true, contratoId: { _id: "tCustom", data: {} } };
const plantillaSinFirma = { _id: "pfSinFirma", name: "Sin firma", data: { nombre: "Sin firma" }, content: "<p>x</p>", contratoId: { _id: "tSinFirma", data: { requiereFirma: false, requiereFirmaRelease: false, requiereFirmaAlta: false } } };
const releaseGeneral = { _id: "r1", contratoIds: [], releaseTipoId: { requiereFirma: true } };
const releaseDeJornada = { _id: "r2", contratoIds: ["tJornada"], releaseTipoId: { requiereFirma: true } };
const releaseCustom = { _id: "rc", contratoIds: [], esCustom: true, releaseTipoId: { requiereFirma: true } };
const releaseSinFirma = { _id: "r3", contratoIds: [], releaseTipoId: { requiereFirma: false } };
const plantillas = [plantillaJornada, plantillaVacia, plantillaCustom, plantillaSinFirma];
const unaEmpresa = [{ id: "e1" }];
const dosEmpresas = [{ id: "e1" }, { id: "e2" }];

test("fila nueva: falta el contrato y el release general; con una sola empresa se genera sin preguntar", () => {
  const p = pendienteDeFirma({ nombre_contrato: "Jornada", contratoEmpresas: unaEmpresa, releaseEmpresas: unaEmpresa }, plantillas, [releaseGeneral], "constancia_cuit", [releaseGeneral]);
  assert.equal(p.template, plantillaJornada);
  assert.equal(p.algoAplica, true);
  assert.equal(p.faltaContrato, true);
  assert.equal(p.faltaRelease, true);
  assert.deepEqual(p.releasesAplicables.map((r) => r._id), ["r1"]);
  assert.equal(p.empresaContrato, "e1");
  assert.equal(p.empresaRelease, "e1");
  assert.equal(p.motivo, "");
  assert.equal(p.enviable, false);
});

test("varias empresas sin elegir: no se genera solo; con la guardada, sí", () => {
  const sin = pendienteDeFirma({ nombre_contrato: "Jornada", contratoEmpresas: dosEmpresas, releaseEmpresas: dosEmpresas }, plantillas, [releaseGeneral], null, [releaseGeneral]);
  assert.equal(sin.motivoContrato, "Falta elegir la empresa del contrato");
  assert.equal(sin.motivoRelease, "Falta elegir la empresa del release");
  assert.equal(sin.motivo, "Falta elegir la empresa del contrato · Falta elegir la empresa del release");
  const con = pendienteDeFirma({ nombre_contrato: "Jornada", empresaContratoId: "e2", empresaReleaseId: { _id: "e1" }, contratoEmpresas: dosEmpresas, releaseEmpresas: dosEmpresas }, plantillas, [releaseGeneral], null, [releaseGeneral]);
  assert.equal(con.motivo, "");
  assert.equal(con.empresaContrato, "e2");
  assert.equal(con.empresaRelease, "e1");
});

test("plantilla vacía y contrato custom sin texto: quedan para una persona", () => {
  assert.equal(pendienteDeFirma({ nombre_contrato: "Vacía" }, plantillas, [], null).motivoContrato, "La plantilla del contrato no tiene contenido");
  assert.equal(pendienteDeFirma({ nombre_contrato: "Contrato custom" }, plantillas, [], null).motivoContrato, "Contrato custom sin texto escrito");
  assert.equal(pendienteDeFirma({ nombre_contrato: "Contrato custom", contenidoCustomContrato: "<p>Las partes acuerdan…</p>" }, plantillas, [], null).motivoContrato, "");
  assert.equal(pendienteDeFirma({ nombre_contrato: "No existe" }, plantillas, [], null).motivoContrato, "No tiene plantilla de contrato");
});

test("todo generado y sin enviar: enviable; ya enviado: no", () => {
  const generado = { nombre_contrato: "Jornada", firmaGeneradoAt: new Date(), firmaReleasesGeneradoAt: new Date(), firmaReleases: [{ releaseId: "r1" }], contratoEmpresas: unaEmpresa };
  const p = pendienteDeFirma(generado, plantillas, [releaseGeneral], "alta_temprana_afip", [releaseGeneral]);
  assert.equal(p.faltaContrato, false);
  assert.equal(p.faltaRelease, false);
  assert.equal(p.enviable, true);
  assert.deepEqual(p.envio, { incluirContrato: true, incluirReleases: true, incluirAlta: false });
  assert.equal(pendienteDeFirma({ ...generado, firmaEnviadaAt: new Date() }, plantillas, [releaseGeneral], null, [releaseGeneral]).enviable, false);
});

test("el alta de ARCA cargada va a firma sólo con alta temprana y si el tipo lo pide", () => {
  const conAlta = { nombre_contrato: "Jornada", firmaGeneradoAt: new Date(), altaDocumentoUrl: "/storage/x.pdf" };
  assert.equal(pendienteDeFirma(conAlta, plantillas, [], "alta_temprana_afip").envio.incluirAlta, true);
  assert.equal(pendienteDeFirma(conAlta, plantillas, [], "constancia_cuit").envio.incluirAlta, false);
  // Un tipo que no firma nada: nada aplica, nunca es enviable, y no se genera nada.
  const nada = pendienteDeFirma({ nombre_contrato: "Sin firma", altaDocumentoUrl: "/storage/x.pdf" }, plantillas, [releaseGeneral], "alta_temprana_afip", [releaseGeneral]);
  assert.equal(nada.algoAplica, false);
  assert.equal(nada.faltaContrato, false);
  assert.equal(nada.enviable, false);
});

test("releases: los asignados al tipo le ganan a los generales; el custom entra sólo con texto; el que no firma queda afuera", () => {
  const queFirman = [releaseGeneral, releaseDeJornada, releaseCustom].filter(releaseRequiereFirma);
  const todos = [releaseGeneral, releaseDeJornada, releaseCustom, releaseSinFirma];
  assert.equal(releaseRequiereFirma(releaseSinFirma), false);
  // Con `tipoContratoId` de Jornada: sólo el asignado.
  const jornada = pendienteDeFirma({ nombre_contrato: "Jornada", tipoContratoId: "tJornada" }, plantillas, queFirman, null, todos);
  assert.deepEqual(jornada.releasesAplicables.map((r) => r._id), ["r2"]);
  // Un tipo sin asignados lleva los generales, y el custom sólo si el trámite tiene su texto.
  const custom = pendienteDeFirma({ nombre_contrato: "Contrato custom", contenidoCustomContrato: "<p>Texto</p>", contenidoCustomReleases: [{ releaseId: "rc", content: "<p>Release escrito</p>" }] }, plantillas, queFirman, null, todos);
  assert.deepEqual(custom.releasesAplicables.map((r) => r._id).sort(), ["r1", "rc"]);
  const sinTexto = pendienteDeFirma({ nombre_contrato: "Contrato custom", contenidoCustomContrato: "<p>Texto</p>" }, plantillas, queFirman, null, todos);
  assert.deepEqual(sinTexto.releasesAplicables.map((r) => r._id), ["r1"]);
  // Un grupo generado antes de escribir el custom ya no sirve: hay que regenerarlo.
  const viejo = pendienteDeFirma({ ...custom, nombre_contrato: "Contrato custom", contenidoCustomContrato: "<p>Texto</p>", contenidoCustomReleases: [{ releaseId: "rc", content: "<p>Release escrito</p>" }], firmaGeneradoAt: new Date(), firmaReleasesGeneradoAt: new Date(), firmaReleases: [{ releaseId: "r1" }] } as any, plantillas, queFirman, null, todos);
  assert.equal(viejo.faltaRelease, true);
});

test("releasesDelTipo con ids de la base (ObjectId-like) y plantillaTieneContenido", () => {
  const r = { _id: { toString: () => "r9" }, contratoIds: [{ toString: () => "tJornada" }] } as any;
  assert.deepEqual(releasesDelTipo([r, releaseGeneral], { _id: { toString: () => "tJornada" } }, [r, releaseGeneral]).map((x) => String(x._id)), ["r9"]);
  assert.equal(plantillaTieneContenido({ _id: "a", content: "<p>&nbsp;</p>" }), false);
  assert.equal(plantillaTieneContenido({ _id: "a", content: "<p>Hola</p>" }), true);
});

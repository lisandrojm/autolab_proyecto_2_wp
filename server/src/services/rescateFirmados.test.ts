/**
 * El rescate de firmados desde el email (doble validación Requested signatures / correo).
 *
 *   npm run test:rescate-firmados
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { adjuntosPdf, esConflictoDeNombre, extraerArchivoFirmado, extraerAvisoFirmado, nombreDestino, rescatarFirmados, validarAdjunto, yaEstaEnFirmados, type AvisoFirmado, type DepsRescate } from "./rescateFirmados.js";
import { extraerArchivoDeAsunto } from "./dropboxSignMailService.js";

// Asuntos reales de la casilla (anonimizados).
const FIRMADO_ES = "ALAN AQUINO firmó 426_LN+_AQUINO_Release_Jornada_D-20261012_H-20261012_20463515892_aquinoalan754-ARROBA-gmail.com_Empresa-30710295839_ID-000137.pdf";
const ARCHIVO = "426_LN+_AQUINO_Release_Jornada_D-20261012_H-20261012_20463515892_aquinoalan754-ARROBA-gmail.com_Empresa-30710295839_ID-000137.pdf";
const ENVIO = "Se inició el proceso de firma de 426_LN+_AQUINO_AltaAFIP_Plazo-fijo-6x6_D-20261001_H-20261031_20442166987_enzogabrielaquino01-ARROBA-gmail.com_Empresa-30717068374-Frame Firma Digital";

describe("1. el asunto de «documento firmado»", () => {
  it("reconoce el formato real en español y devuelve el nombre exacto del PDF (con el código) y quién firmó", () => {
    assert.equal(extraerArchivoFirmado(FIRMADO_ES), ARCHIVO);
    assert.equal(extraerArchivoFirmado(`Fwd: ${FIRMADO_ES}`), ARCHIVO);
    assert.deepEqual(extraerAvisoFirmado(FIRMADO_ES), { archivo: ARCHIVO, quien: "ALAN AQUINO" });
    assert.equal(extraerAvisoFirmado(ENVIO), null);
  });
  it("y las variantes en inglés y multi-firmante", () => {
    assert.equal(extraerArchivoFirmado(`ALAN AQUINO signed ${ARCHIVO}`), ARCHIVO);
    assert.equal(extraerArchivoFirmado(`ALAN AQUINO has signed ${ARCHIVO}`), ARCHIVO);
    assert.equal(extraerArchivoFirmado(`Todos firmaron ${ARCHIVO}`), ARCHIVO);
    assert.equal(extraerArchivoFirmado(`Everyone has signed ${ARCHIVO}`), ARCHIVO);
    assert.equal(extraerArchivoFirmado(`Juan Pérez ha firmado ${ARCHIVO}`), ARCHIVO);
  });
  it("un aviso de ENVÍO jamás es un firmado, y un firmado jamás es un envío", () => {
    assert.equal(extraerArchivoFirmado(ENVIO), "");
    assert.equal(extraerArchivoDeAsunto(FIRMADO_ES), "");
    assert.equal(extraerArchivoFirmado("Recordatorio: firmá el documento X.pdf"), "");
    assert.equal(extraerArchivoFirmado("Resumen semanal de Dropbox Sign"), "");
    assert.equal(extraerArchivoFirmado("ALAN AQUINO firmó el documento"), "", "sin .pdf no hay nombre de archivo");
  });
});

describe("2. ¿ya está en la carpeta de firmados?", () => {
  const f = (name: string) => ({ tag: "file", name, path: `/Requested signatures/${name}` });
  it("por código, aunque el nombre del archivo traiga la cola de Dropbox Sign", () => {
    const carpeta = [f("426_LN+_AQUINO_Release_Jornada_D-20261012_H-20261012_20463515892_aquinoalan754-ARROBA-gmail.com_Empresa-30710295839_ID-000137 - Firma solicitada por Frame Zero.pdf"), f("otro_ID-000999.pdf")];
    assert.ok(yaEstaEnFirmados(carpeta, ARCHIVO));
    assert.equal(yaEstaEnFirmados([f("otro_ID-000999.pdf")], ARCHIVO), null);
  });
  it("sin código, por nombre: el archivo cuyo nombre es el comienzo del título", () => {
    const titulo = "426_LN+_AQUINO_Release_Jornada_D-20261012_H-20261012_20463515892_aquinoalan754-ARROBA-gmail.com_Empresa-30710295839.pdf";
    assert.ok(yaEstaEnFirmados([f("426_LN+_AQUINO_Release_Jornada_D-20261012_H-20261012_20463515892_aquinoalan754-ARROBA-gmail.com_Empresa-30710295839.pdf")], titulo));
    assert.equal(yaEstaEnFirmados([f("426_LN+_AQUINO_Contrato_Jornada_D-20261012_H-20261012_20463515892_aquinoalan754-ARROBA-gmail.com_Empresa-30710295839.pdf")], titulo), null);
  });
});

describe("3. el adjunto", () => {
  const pdf = (kb: number) => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(kb * 1024, 1)]);
  it("valida magic bytes y tamaño", () => {
    assert.deepEqual(validarAdjunto(pdf(200)), { ok: true });
    assert.match((validarAdjunto(Buffer.from("<html>hola</html>" + "x".repeat(60000))) as any).motivo, /no es un PDF/);
    assert.match((validarAdjunto(pdf(10)) as any).motivo, /demasiado chico/);
    assert.match((validarAdjunto(pdf(16 * 1024)) as any).motivo, /demasiado grande/);
    assert.match((validarAdjunto(Buffer.alloc(0)) as any).motivo, /vacío/);
  });
  it("encuentra el PDF adjunto en la estructura del mensaje (multipart anidado)", () => {
    const estructura = {
      type: "multipart/mixed",
      childNodes: [
        { part: "1", type: "multipart/alternative", childNodes: [{ part: "1.1", type: "text/plain" }, { part: "1.2", type: "text/html" }] },
        { part: "2", type: "application/pdf", disposition: "attachment", dispositionParameters: { filename: ARCHIVO }, size: 180000 },
        { part: "3", type: "image/png", disposition: "inline", dispositionParameters: { filename: "logo.png" } },
      ],
    };
    assert.deepEqual(adjuntosPdf(estructura), [{ part: "2", nombre: ARCHIVO, bytes: 180000, tipo: "application/pdf" }]);
    assert.deepEqual(adjuntosPdf({ type: "text/html" }), []);
    assert.deepEqual(adjuntosPdf({ type: "application/octet-stream", dispositionParameters: { filename: "doc.pdf" } }), [{ part: "1", nombre: "doc.pdf", bytes: null, tipo: "application/octet-stream" }]);
  });
  it("el nombre de destino es el título saneado, con el código y .pdf", () => {
    assert.equal(nombreDestino(ARCHIVO), ARCHIVO);
    assert.equal(nombreDestino("../x/Contrato sin codigo.pdf", "ID-000137"), "..-x-Contrato sin codigo_ID-000137.pdf".replace(/^\.+/, ""));
    assert.equal(nombreDestino("Contrato sin codigo", "ID-000137"), "Contrato sin codigo_ID-000137.pdf");
  });
  it("reconoce el conflicto de nombre de Dropbox", () => {
    assert.ok(esConflictoDeNombre({ response: { data: { error_summary: "path/conflict/file/.." } } }));
    assert.ok(!esConflictoDeNombre(new Error("ECONNRESET")));
  });
});

describe("4. la pasada de rescate (idempotente)", () => {
  const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(120 * 1024, 7)]);
  const aviso = (uid: number, titulo = ARCHIVO, adjuntos = [{ part: "2", nombre: titulo, bytes: 170000, tipo: "application/pdf" }]): AvisoFirmado => ({ uid, asunto: `ALAN AQUINO firmó ${titulo}`, titulo, quien: "ALAN AQUINO", adjuntos });
  const deps = (extra: Partial<DepsRescate> = {}, subidas: string[] = []): DepsRescate => ({
    carpetaFirmados: "/Requested signatures",
    enFirmados: [],
    soloPrueba: false,
    existeDocumento: async () => true,
    descargar: async () => PDF,
    subir: async (path) => {
      subidas.push(path);
    },
    verificados: new Set(),
    ...extra,
  });

  it("si la integración ya lo depositó (por código o por nombre), no se sube nada", async () => {
    const subidas: string[] = [];
    const r = await rescatarFirmados([aviso(1)], deps({ enFirmados: [{ name: `${ARCHIVO.replace(/\.pdf$/, "")} - Firma solicitada.pdf`, path: "/x" }] }, subidas));
    assert.equal(r.yaEstaban, 1);
    assert.equal(r.rescatados, 0);
    assert.deepEqual(subidas, []);
    assert.equal(r.logs[0].resultado, "firmado-ya-estaba");
  });
  it("si falta, baja el adjunto, lo valida y lo sube con el nombre exacto; un segundo aviso del mismo código ya no sube", async () => {
    const subidas: string[] = [];
    const d = deps({}, subidas);
    const r = await rescatarFirmados([aviso(1), aviso(2)], d);
    assert.equal(r.rescatados, 1);
    assert.equal(r.yaEstaban, 1);
    assert.deepEqual(subidas, [`/Requested signatures/${ARCHIVO}`]);
    assert.equal(r.logs[0].resultado, "firmado-rescatado");
    // Lo que va al registro permanente.
    assert.deepEqual(r.logs[0].rescate, { uid: 1, codigo: "ID-000137", titulo: ARCHIVO, quien: "ALAN AQUINO", path: `/Requested signatures/${ARCHIVO}`, carpeta: "/Requested signatures", bytes: PDF.length });
    assert.ok(d.enFirmados.some((e) => e.name === ARCHIVO), "el listado en memoria se actualiza");
    assert.ok(d.verificados.has(1));
  });
  it("adjunto inválido, sin código o sin documento registrado: error y nada subido", async () => {
    const subidas: string[] = [];
    const noPdf = await rescatarFirmados([aviso(1)], deps({ descargar: async () => Buffer.alloc(80 * 1024, 65) }, subidas));
    assert.equal(noPdf.logs[0].resultado, "error");
    assert.match(noPdf.logs[0].detalle, /no es un PDF/);
    const sinCodigo = await rescatarFirmados([aviso(2, "Contrato sin codigo.pdf", [{ part: "2", nombre: "Contrato sin codigo.pdf", bytes: 1000, tipo: "application/pdf" }])], deps({}, subidas));
    assert.match(sinCodigo.logs[0].detalle, /código ID-NNNNNN/);
    const sinDoc = await rescatarFirmados([aviso(3)], deps({ existeDocumento: async () => false }, subidas));
    assert.match(sinDoc.logs[0].detalle, /no tiene un documento registrado/);
    assert.deepEqual(subidas, []);
    assert.equal(sinDoc.errores.length, 1);
  });
  it("sin adjunto: error blando, y el UID no se vuelve a intentar", async () => {
    const d = deps();
    const r = await rescatarFirmados([aviso(1, ARCHIVO, [])], d);
    assert.equal(r.sinAdjunto, 1);
    assert.equal(r.logs[0].resultado, "firmado-sin-adjunto");
    assert.match(r.logs[0].detalle, /adjuntar el documento firmado/);
    assert.ok(d.verificados.has(1));
    const otraVez = await rescatarFirmados([aviso(1, ARCHIVO, [])], d);
    assert.equal(otraVez.sinAdjunto, 0);
  });
  it("carrera: la subida choca porque la integración lo depositó mientras tanto → se trata como ya estaba", async () => {
    const r = await rescatarFirmados([aviso(1)], deps({ subir: async () => Promise.reject({ response: { data: { error_summary: "path/conflict/file/..." } } }) }));
    assert.equal(r.rescatados, 0);
    assert.equal(r.yaEstaban, 1);
    assert.equal(r.errores.length, 0);
    assert.match(r.logs[0].detalle, /integración de Dropbox/);
  });
  it("en modo prueba cuenta los que faltan sin bajar ni subir nada", async () => {
    let bajadas = 0;
    const r = await rescatarFirmados([aviso(1), aviso(2, ARCHIVO.replace("000137", "000138"))], deps({ soloPrueba: true, descargar: async () => (bajadas++, PDF), enFirmados: [{ name: ARCHIVO, path: "/x" }] }));
    assert.equal(r.yaEstaban, 1);
    assert.equal(r.faltan, 1);
    assert.equal(bajadas, 0);
  });
});

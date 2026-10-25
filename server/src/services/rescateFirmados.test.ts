/**
 * El rescate de firmados desde el email (doble validación Requested signatures / correo).
 *
 *   npm run test:rescate-firmados
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { adjuntosPdf, esConflictoDeNombre, extraerArchivoFirmado, extraerAvisoFirmado, nombreComoIntegracion, nombreDestino, rescatarFirmados, selloIntegracion, TERMINOS_BUSQUEDA_FIRMADO, validarAdjunto, yaEstaEnFirmados, type AvisoFirmado, type DepsRescate } from "./rescateFirmados.js";
import { leerAnclas } from "../utils/anclasNombre.js";
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
  it("con la cola «: Firma solicitada por …» después del .pdf (9 mails reales del 25/10/2026): el archivo es lo de antes de la cola", () => {
    const conCola = "LEONEL LOIZZO firmó 426_LN+_LOIZZO_Release_Plazo-fijo-6x6_D-20261001_H-20261031_20463515892_loizzo-ARROBA-gmail.com_Empresa-30710295839_ID-000004.pdf: Firma solicitada por Frame Zero";
    assert.deepEqual(extraerAvisoFirmado(conCola), { archivo: "426_LN+_LOIZZO_Release_Plazo-fijo-6x6_D-20261001_H-20261031_20463515892_loizzo-ARROBA-gmail.com_Empresa-30710295839_ID-000004.pdf", quien: "LEONEL LOIZZO" });
  });
  it("los términos del SEARCH son palabras enteras tal como aparecen en el asunto: Gmail no busca subcadenas («firm» daba 0 con 204 mails de «firmó»)", () => {
    for (const t of TERMINOS_BUSQUEDA_FIRMADO) assert.notEqual(t, "firm");
    assert.ok(TERMINOS_BUSQUEDA_FIRMADO.includes("firmó"), "la palabra real del asunto en español, con acento");
    assert.ok(TERMINOS_BUSQUEDA_FIRMADO.every((t) => extraerArchivoFirmado(`Juan Pérez ${t} ${ARCHIVO}`) === ARCHIVO || extraerArchivoFirmado(`Todos ${t} ${ARCHIVO}`) === ARCHIVO || extraerArchivoFirmado(`Juan Pérez ha ${t} ${ARCHIVO}`) === ARCHIVO), "cada término corresponde a alguna forma que el parser reconoce");
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

describe("5. el aviso de completado, con las formas reales de la casilla (diagnóstico del 25/10/2026)", () => {
  // `npm run dropbox-sign:asuntos`: 177 «<quien> firmó <archivo>.pdf» + 9 con la cola «: Firma solicitada por Frame Zero», todos con el PDF adjunto.
  const REC = "426_LN+_REC_SUELDO_2026_PERIODO_09_BLANCO_NICOLAS_fulano-ARROBA-hotmail.com_20000000000_ID-000529.pdf";
  it("reconoce «<quien> firmó <archivo>.pdf» (recibo de sueldo) y «…pdf: Firma solicitada por Frame Zero»", () => {
    assert.deepEqual(extraerAvisoFirmado(`NICOLAS BLANCO firmó ${REC}`), { archivo: REC, quien: "NICOLAS BLANCO" });
    assert.deepEqual(extraerAvisoFirmado(`MAXIMILIANO GUIGGI firmó ${REC}: Firma solicitada por Frame Zero`), { archivo: REC, quien: "MAXIMILIANO GUIGGI" });
  });
  it("no confunde con firmados los otros mails de Dropbox Sign que también traen el PDF o hablan de firma", () => {
    for (const a of [
      `Te agregaron al documento ${REC} - Firma solicitada por Frame Zero`,
      `Se inició el proceso de firma de ${REC}`,
      "Resumen diario: Se enviaron 40 documentos para firmar",
      "No pudimos informar a fulano@mail.com",
      "Confirma la sincronización de la carpeta de Dropbox",
      // Contratos viejos, sin .pdf ni código: no se pueden atribuir a un documento de la plataforma.
      "SUAREZ MARCELO firmó 426_LN_Contrato_2026_SEPTIEMBRE_2009_Suarez_Marcelo",
    ]) assert.equal(extraerAvisoFirmado(a), null, a);
  });
});

describe("6. el nombre como lo deja la integración", () => {
  const T = "426_LN+_MARTINEZ_Contrato_Plazo-fijo-6x6_D-20261001_H-20261031_20365478792_alvaromartinezjaluf-ARROBA-gmail.com_Empresa-30717068374_ID-000003.pdf";
  const FIRMADO_EL = new Date("2026-10-07T19:07:43Z");
  it("sello en UTC con día y mes en inglés", () => {
    assert.equal(selloIntegracion(FIRMADO_EL), "Wed, 07 Oct 2026 19h07m43s");
    assert.equal(selloIntegracion(new Date("2026-01-04T03:05:09Z")), "Sun, 04 Jan 2026 03h05m09s");
  });
  it("reproduce el nombre real de la carpeta: «<título>.pdf_ Firma solicitada por <sello>.pdf»", () => {
    assert.equal(nombreComoIntegracion(T, "ID-000003", FIRMADO_EL), `${T}_ Firma solicitada por Wed, 07 Oct 2026 19h07m43s.pdf`);
  });
  it("lo lee de vuelta todo lo que la plataforma lee del nombre: el código, el CUIL, el ya-está y la Fecha Firma", () => {
    const n = nombreComoIntegracion(T, "ID-000003", FIRMADO_EL);
    assert.equal(leerAnclas(n).codigo, "ID-000003");
    assert.equal(leerAnclas(n).cuit, "20365478792");
    assert.ok(yaEstaEnFirmados([{ name: n, path: `/x/${n}` }], T));
  });
  it("agrega el código si el título no lo traía", () => {
    assert.ok(nombreComoIntegracion("426_LN+_X_Contrato.pdf", "ID-000777", FIRMADO_EL).startsWith("426_LN+_X_Contrato_ID-000777.pdf_ Firma solicitada por "));
  });
  it("tope de 255 bytes: primero se acorta «Firma solicitada por» y después los campos descriptivos, NUNCA el código ni el CUIL ni las fechas", () => {
    const largo = `426_LN+_${"APELLIDOLARGUISIMO".repeat(4)}_Contrato_Plazo-fijo-6x6_D-20261001_H-20261031_20365478792_${"x".repeat(40)}-ARROBA-gmail.com_Empresa-30717068374_ID-000123.pdf`;
    const n = nombreComoIntegracion(largo, "ID-000123", FIRMADO_EL);
    assert.ok(Buffer.byteLength(n, "utf8") <= 255, `${Buffer.byteLength(n, "utf8")} bytes`);
    assert.ok(n.endsWith(" Wed, 07 Oct 2026 19h07m43s.pdf"), "el sello queda entero");
    const a = leerAnclas(n);
    assert.equal(a.codigo, "ID-000123");
    assert.equal(a.cuit, "20365478792");
    assert.ok(n.includes("D-20261001") && n.includes("H-20261031"));
    assert.ok(n.startsWith("426_LN+_"), "el principio no se corta");
  });
  it("si sólo sobra un poco, se recorta el texto y no el título", () => {
    const base = T.replace(/\.pdf$/, "");
    // -1: el «_» que separa el relleno del código.
    const relleno = "Z".repeat(255 - Buffer.byteLength(`${base}.pdf_ Firma solicit Wed, 07 Oct 2026 19h07m43s.pdf`, "utf8") - 1);
    const titulo = base.replace("_ID-000003", `_${relleno}_ID-000003`) + ".pdf";
    const n = nombreComoIntegracion(titulo, "ID-000003", FIRMADO_EL);
    assert.equal(n, `${titulo}_ Firma solicit Wed, 07 Oct 2026 19h07m43s.pdf`);
  });
});

describe("7. la prueba detallada y el tope (backfill)", () => {
  const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(120 * 1024, 7)]);
  const titulo = (n: number) => ARCHIVO.replace("000137", String(n).padStart(6, "0"));
  const aviso = (uid: number, t = titulo(uid)): AvisoFirmado => ({ uid, asunto: `ALAN AQUINO firmó ${t}`, titulo: t, quien: "ALAN AQUINO", adjuntos: [{ part: "2", nombre: t, bytes: 170000, tipo: "application/pdf" }], fecha: new Date("2026-10-20T12:00:00Z") });
  const deps = (extra: Partial<DepsRescate> = {}, subidas: string[] = []): DepsRescate => ({
    carpetaFirmados: "/Requested signatures",
    enFirmados: [],
    soloPrueba: false,
    existeDocumento: async () => true,
    descargar: async () => PDF,
    subir: async (p) => void subidas.push(p),
    verificados: new Set(),
    ...extra,
  });
  it("en seco y detallada no baja ni sube, y dice con qué nombre subiría (con el sello de la fecha del aviso)", async () => {
    let bajadas = 0;
    const subidas: string[] = [];
    const r = await rescatarFirmados([aviso(1), aviso(2)], deps({ soloPrueba: true, detallarPrueba: true, descargar: async () => (bajadas++, PDF) }, subidas));
    assert.equal(bajadas, 0);
    assert.deepEqual(subidas, []);
    assert.equal(r.faltan, 2);
    assert.equal(r.logs[0].resultado, "firmado-faltante");
    assert.equal(r.logs[0].uid, 1);
    assert.equal(r.logs[0].archivo, `${titulo(1)}_ Firma solicitada por Tue, 20 Oct 2026 12h00m00s.pdf`);
  });
  it("en seco también detecta lo que la corrida real rechazaría (sin documento registrado)", async () => {
    const r = await rescatarFirmados([aviso(1)], deps({ soloPrueba: true, detallarPrueba: true, existeDocumento: async () => false }));
    assert.equal(r.logs[0].resultado, "error");
  });
  it("--limit: sube N y corta; lo que ya estaba no cuenta para el tope", async () => {
    const subidas: string[] = [];
    const yaEsta = titulo(1);
    const r = await rescatarFirmados([aviso(1), aviso(2), aviso(3), aviso(4)], deps({ limite: 2, enFirmados: [{ name: yaEsta, path: "/x" }] }, subidas));
    assert.equal(r.yaEstaban, 1);
    assert.equal(r.rescatados, 2);
    assert.equal(subidas.length, 2);
    assert.equal(r.cortadoPorLimite, true);
  });
  it("una segunda corrida con la carpeta actualizada no vuelve a subir nada (idempotente)", async () => {
    const subidas: string[] = [];
    const d = deps({}, subidas);
    await rescatarFirmados([aviso(1), aviso(2)], d);
    const otra: string[] = [];
    const r = await rescatarFirmados([aviso(1), aviso(2)], deps({ enFirmados: d.enFirmados }, otra));
    assert.equal(subidas.length, 2);
    assert.deepEqual(otra, []);
    assert.equal(r.yaEstaban, 2);
  });
});

describe("8. código cortado en el asunto («…_ID-0.pdf», 2 casos reales del 25/10/2026)", () => {
  const PDF = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(120 * 1024, 7)]);
  const COMPLETO = "426_LN+_REC_SUELDO_2026_PERIODO_09_BLANCO_NICOLAS_fulano-ARROBA-hotmail.com_20350716719_ID-000570.pdf";
  const CORTADO = "426_LN+_REC_SUELDO_2026_PERIODO_09_BLANCO_NICOLAS_fulano-ARROBA-hotmail.com_20350716719_ID-0.pdf";
  const aviso: AvisoFirmado = { uid: 9, asunto: `NICOLAS BLANCO firmó ${CORTADO}`, titulo: CORTADO, quien: "NICOLAS BLANCO", adjuntos: [{ part: "2", nombre: "x.pdf", bytes: 170000, tipo: "application/pdf" }], fecha: new Date("2026-10-25T08:02:44Z") };
  const base = (extra: Partial<DepsRescate>, subidas: string[]): DepsRescate => ({ carpetaFirmados: "/F", enFirmados: [], soloPrueba: false, existeDocumento: async () => true, descargar: async () => PDF, subir: async (p) => void subidas.push(p), verificados: new Set(), ...extra });
  it("con un único documento que empieza así, toma su código y sube con el nombre completo", async () => {
    const subidas: string[] = [];
    const r = await rescatarFirmados([aviso], base({ documentoPorPrefijo: async (p) => (COMPLETO.startsWith(p) ? { codigo: "ID-000570", archivo: COMPLETO } : null) }, subidas));
    assert.equal(r.rescatados, 1);
    assert.deepEqual(subidas, [`/F/${COMPLETO}_ Firma solicitada por Sun, 25 Oct 2026 08h02m44s.pdf`]);
  });
  it("si ya está en la carpeta con ese código, no sube", async () => {
    const subidas: string[] = [];
    const r = await rescatarFirmados([aviso], base({ enFirmados: [{ name: `${COMPLETO}_ Firma solicitada por X.pdf`, path: "/F/x" }], documentoPorPrefijo: async () => ({ codigo: "ID-000570", archivo: COMPLETO }) }, subidas));
    assert.equal(r.yaEstaban, 1);
    assert.deepEqual(subidas, []);
  });
  it("sin coincidencia única no se adivina: error, como antes", async () => {
    const subidas: string[] = [];
    const r = await rescatarFirmados([aviso], base({ documentoPorPrefijo: async () => null }, subidas));
    assert.equal(r.logs[0].resultado, "error");
    assert.deepEqual(subidas, []);
  });
});

describe("9. firmado sin código en el título, al que la limpieza ya le insertó el código", () => {
  it("«<título>_ID-000010.pdf_ Firma…» es el firmado de «<título>.pdf»; otro título no", () => {
    const t = "426_LN+_CASTRO_AltaAFIP_Plazo-fijo-6x6_D-20261001_H-20261031_20412923767_fulano-ARROBA-gmail.com_Empresa-30717068374.pdf";
    const enCarpeta = [{ name: t.replace(/\.pdf$/, "_ID-000010.pdf_ Firma solicitada po Thu, 08 Oct 2026 14h55m56s.pdf"), path: "/x" }];
    assert.ok(yaEstaEnFirmados(enCarpeta, t));
    assert.equal(yaEstaEnFirmados(enCarpeta, t.replace("AltaAFIP", "Contrato")), null);
  });
});

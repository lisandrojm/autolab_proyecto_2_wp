/**
 * EL CIRCUITO ENTERO DEL AVISO DE FIRMA: del patrón de nomenclatura al archivo que se mueve.
 *
 *   npx tsx --test src/services/circuitoAvisoFirma.test.ts
 *
 * Cada nombre se arma como lo arma la plataforma —el patrón de fábrica de su tipo, `renderNomenclatura`
 * y el recorte a 255 bytes—; el asunto, como lo manda Dropbox Sign; y la búsqueda corre contra un Outbox
 * con los documentos que más se le parecen: el contrato, el release y el alta de la MISMA persona y
 * período, y los de otra persona. Tiene que salir uno solo, y el correcto.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PATRON_POR_DEFECTO, TIPOS_NOMENCLATURA, renderNomenclatura, recortarNombre } from "../utils/nomenclatura.js";
import { emailNomenclatura, buildIdentidadTag } from "../utils/employeeDocData.js";
import { extraerArchivoDeAsunto, extraerIdentidadDeArchivo, documentosDelAvisoEnOutbox, yaEstaEnPendbox } from "./dropboxSignMailService.js";
let siguiente = 400;
/** Un documento como lo nombra la plataforma: patrón de fábrica + recorte + extensión. */
function generar(tipo, persona, extra = {}) {
    const datos = {
        centroDeCosto: "426",
        proyecto: "LN+",
        apellido: persona.apellido,
        tipo,
        contrato: "Plazo-fijo-6x6",
        fechaAlta: "20261001",
        fechaBaja: "20261031",
        cuit: buildIdentidadTag({ metadata: { cuit: persona.cuit || "", documento: persona.documento || "", tipoDocumentoId: 1 } }),
        email: emailNomenclatura(persona.email),
        empresaCuit: "30717068374",
        numero: "1042",
        fecha: "20261006",
        anio: "2026",
        codigo: `ID-${String(siguiente++).padStart(6, "0")}`,
        ...extra,
    };
    return `${recortarNombre(renderNomenclatura(PATRON_POR_DEFECTO[tipo], datos))}.pdf`;
}
const AQUINO = { apellido: "AQUINO", cuit: "20442166987", email: "enzogabrielaquino01@gmail.com" };
const CASTRO = { apellido: "CASTRO", cuit: "20412923767", email: "brianchicago.22@gmail.com" };
const SIN_CUIL = { apellido: "PEREIRA", documento: "AB123456", email: "pereira@hotmail.com" };
const archivo = (name) => ({ tag: "file", name, path: `/HelloSign/Outbox/${name}` });
const sinExt = (n) => n.replace(/\.pdf$/i, "");
/** Las formas en que puede llegar el asunto de «se inició el proceso de firma». */
const ASUNTOS = [
    ["tal cual", (t) => `Se inició el proceso de firma de ${t}`],
    ["con sufijo agregado al título", (t) => `Se inició el proceso de firma de ${t}-Frame Firma Digital`],
    ["con la extensión", (t) => `Se inició el proceso de firma de ${t}.pdf`],
    ["reenviado", (t) => `Fwd: Se inició el proceso de firma de ${t}`],
    ["respondido", (t) => `RE: Se inició el proceso de firma de ${t}`],
    ["sin tilde (cliente de correo que la pierde)", (t) => `Se inicio el proceso de firma de ${t}`],
    ["en inglés", (t) => `You have been added to a signature request: ${t}`],
];
describe("cada tipo de documento, en cada forma de asunto, mueve SOLO su archivo", () => {
    for (const tipo of TIPOS_NOMENCLATURA) {
        // El Outbox real de un envío: los documentos hermanos de la misma persona y período, y otra persona.
        const propio = generar(tipo, AQUINO);
        const outbox = [
            archivo(propio),
            ...TIPOS_NOMENCLATURA.filter((t) => t !== tipo).map((t) => archivo(generar(t, AQUINO))),
            archivo(generar(tipo, CASTRO)),
        ];
        for (const [forma, armar] of ASUNTOS) {
            it(`${tipo} · ${forma}`, () => {
                const asunto = armar(sinExt(propio));
                const delAsunto = extraerArchivoDeAsunto(asunto);
                assert.ok(delAsunto, `no se reconoció el asunto: ${asunto}`);
                const ident = extraerIdentidadDeArchivo(delAsunto);
                assert.match(ident.codigo, /^ID-\d{6}$/, "el código tiene que leerse del asunto");
                assert.deepEqual(documentosDelAvisoEnOutbox(outbox, delAsunto, ident).map((d) => d.name), [propio]);
            });
        }
    }
});
describe("los datos de la persona se leen del asunto", () => {
    it("CUIL, email, período y código", () => {
        const nombre = sinExt(generar("AltaAFIP", AQUINO));
        const ident = extraerIdentidadDeArchivo(extraerArchivoDeAsunto(`Se inició el proceso de firma de ${nombre}-Frame Firma Digital`));
        assert.equal(ident.cuit, "20442166987", "el CUIL de la persona, no el CUIT de la empresa");
        assert.equal(ident.email, "enzogabrielaquino01@gmail.com");
        assert.deepEqual(ident.fechas, ["20261001", "20261031"]);
        assert.match(ident.codigo, /^ID-\d{6}$/);
    });
    it("una persona sin CUIL igual se encuentra (por el código)", () => {
        const propio = generar("Contrato", SIN_CUIL);
        const outbox = [archivo(propio), archivo(generar("Release", SIN_CUIL))];
        const delAsunto = extraerArchivoDeAsunto(`Se inició el proceso de firma de ${sinExt(propio)}`);
        assert.deepEqual(documentosDelAvisoEnOutbox(outbox, delAsunto).map((d) => d.name), [propio]);
    });
});
describe("casos que NO tienen que mover nada", () => {
    const propio = generar("Contrato", AQUINO);
    const outbox = [archivo(propio)];
    it("otros mails de Dropbox Sign que también traen «firma» en el asunto", () => {
        for (const a of ["Resumen diario: Se enviaron 40 documentos para firmar", "Malena Roldan firmó 703_JSA_Contrato", "Te agregaron a una solicitud de firma"]) {
            assert.equal(extraerArchivoDeAsunto(a), "", a);
        }
    });
    it("un código que no está en Outbox", () => {
        const otro = sinExt(propio).replace(/ID-\d{6}$/, "ID-999999");
        assert.deepEqual(documentosDelAvisoEnOutbox(outbox, extraerArchivoDeAsunto(`Se inició el proceso de firma de ${otro}`)), []);
    });
    it("el aviso repetido de un documento ya movido se reconoce como duplicado", () => {
        const delAsunto = extraerArchivoDeAsunto(`Se inició el proceso de firma de ${sinExt(propio)}`);
        assert.equal(yaEstaEnPendbox([archivo(propio)], delAsunto), true);
    });
});
describe("nombres largos: el recorte a 255 no rompe el reconocimiento", () => {
    it("un contrato de nombre larguísimo, recortado, se sigue encontrando por su código", () => {
        const propio = generar("Contrato", { ...AQUINO, apellido: "GONZALEZ-ROTSTEIN-DE-LA-SANTISIMA-TRINIDAD" }, { contrato: "Contrato-de-locacion-de-servicios-artisticos-temporada-completa-2026", proyecto: "426_LA_NACION_PRODUCCION_INTEGRAL_DE_CONTENIDOS" });
        assert.ok(Buffer.byteLength(propio) <= 255, "el nombre entra en 255 bytes");
        const delAsunto = extraerArchivoDeAsunto(`Se inició el proceso de firma de ${sinExt(propio)}-Frame Firma Digital`);
        assert.deepEqual(documentosDelAvisoEnOutbox([archivo(propio), archivo(generar("Release", AQUINO))], delAsunto).map((d) => d.name), [propio]);
    });
});

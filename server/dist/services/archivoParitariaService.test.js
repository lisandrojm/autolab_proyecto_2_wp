/**
 * El nombre del archivo viene de la URL de un tercero, y ya se rompió una vez de una forma que no se
 * veía leyendo el código: la clase de caracteres que lo saneaba terminó guardada con un byte NUL
 * literal adentro, así que en vez de espacios saneaba caracteres de control y `grep` daba el archivo
 * por binario.
 *
 * Estos tests existen para que la próxima vez que eso pase, se note.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nombreDesdeUrl } from "./archivoParitariaService.js";
const BARRA_INVERTIDA = String.fromCharCode(92);
const NUL = String.fromCharCode(0);
describe("nombreDesdeUrl: se conserva lo legible", () => {
    it("deja el nombre tal cual cuando ya es limpio", () => {
        assert.equal(nombreDesdeUrl("https://satsaid.com.ar/wp/ACUERDO-SALARIAL-2026.pdf"), "ACUERDO-SALARIAL-2026.pdf");
    });
    it("le agrega la extensión si no la trae", () => {
        assert.equal(nombreDesdeUrl("https://x.org/acuerdo"), "acuerdo.pdf");
    });
    it("no le agrega una segunda extensión si ya la tiene en mayúsculas", () => {
        assert.equal(nombreDesdeUrl("https://x.org/ACUERDO.PDF"), "ACUERDO.PDF");
    });
    it("una URL ilegible no rompe nada: devuelve un nombre por defecto", () => {
        assert.equal(nombreDesdeUrl("no-es-una-url"), "documento.pdf");
        assert.equal(nombreDesdeUrl(""), "documento.pdf");
    });
});
describe("nombreDesdeUrl: se sanea lo que viene de afuera", () => {
    it("los espacios se reemplazan", () => {
        // El bug que el byte NUL escondía: la clase saneaba controles y NO espacios.
        assert.equal(nombreDesdeUrl("https://x.org/ACUERDO SALARIAL 2026.pdf"), "ACUERDO_SALARIAL_2026.pdf");
    });
    it("los caracteres de control también", () => {
        assert.equal(nombreDesdeUrl(`https://x.org/${encodeURIComponent(`a${NUL}b`)}.pdf`), "a_b.pdf");
    });
    it("las barras percent-encodeadas no sobreviven", () => {
        // `..%2f..%2fetc` es el intento clásico. El archivo en disco se llama por su hash, así que esto
        // nunca escribió nada afuera — pero el nombre viaja en un encabezado y termina en el disco de
        // quien descarga, así que igual se sanea.
        // Los puntos del principio se sacan y la barra se reemplaza: queda un nombre inofensivo.
        assert.equal(nombreDesdeUrl("https://x.org/%2e%2e%2fetc%2fshadow.pdf"), "_etc_shadow.pdf");
    });
    it("ningún nombre empieza con puntos", () => {
        assert.match(nombreDesdeUrl("https://x.org/%2e%2e%2f%2e%2e%2fpasswd"), /^[^.]/);
    });
    it("la barra invertida se reemplaza", () => {
        assert.equal(nombreDesdeUrl(`https://x.org/${encodeURIComponent(`a${BARRA_INVERTIDA}b`)}.pdf`), "a_b.pdf");
    });
    it("un nombre larguísimo se corta", () => {
        // El tope cuenta la extensión: cortar a 120 y agregar «.pdf» después devolvía 124.
        assert.ok(nombreDesdeUrl(`https://x.org/${"a".repeat(400)}.pdf`).length <= 120);
    });
    it("un nombre que queda vacío después de sanear no devuelve solo «.pdf»", () => {
        // Sin el fallback, un nombre hecho solo de puntos produciría un archivo llamado «.pdf», que en
        // varios sistemas es un archivo oculto sin nombre.
        assert.equal(nombreDesdeUrl("https://x.org/%2e%2e%2e"), "documento.pdf");
    });
});
describe("el archivo fuente no tiene caracteres invisibles", () => {
    it("ningún byte de control fuera de los saltos de línea", async () => {
        // El control que faltó la primera vez. Un rango escrito con caracteres invisibles no se puede
        // revisar leyéndolo, así que se revisa acá.
        const fs = await import("node:fs/promises");
        const url = new URL("./archivoParitariaService.ts", import.meta.url);
        const texto = await fs.readFile(url, "utf8");
        const sospechosos = [...texto].filter((ch) => {
            const c = ch.codePointAt(0) ?? 0;
            return c < 32 && ch !== "\n" && ch !== "\r" && ch !== "\t";
        });
        assert.equal(sospechosos.length, 0, `hay ${sospechosos.length} carácter(es) de control en el fuente`);
    });
});

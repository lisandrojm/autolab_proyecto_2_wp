import { test } from "node:test";
import assert from "node:assert/strict";
import { argHeader } from "./dropboxService.js";
/*
  El header `Dropbox-API-Arg` tiene que ser ASCII PURO.

  Este test existe porque el defecto ya ocurrió dos veces: la función estaba escrita, documentada, y
  las dos llamadas de contenido serializaban con `JSON.stringify` pelado. El resultado fueron 33
  archivos subidos con U+FFFD donde iba la «ó» y el «·», y —antes de eso— descargas de Documentos que
  contestaban 409 `path/not_found` para cualquier persona con acento en el apellido.

  Si alguien vuelve a serializar a mano, falla acá y no en Dropbox seis meses después.
*/
const soloAscii = (s) => [...s].every((c) => c.codePointAt(0) < 128);
test("el header sale ASCII puro con acentos, ñ, · y espacios", () => {
    // El caso real que rompió: nombre de carpeta y de archivo del espejo de paritarias.
    const path = "/WEPRODU/Paritarias/Asociación Argentina de Actores/2026/2026-08-30 · SATSAID · JULIO.pdf";
    const h = argHeader({ path, mode: "add" });
    assert.ok(soloAscii(h), `el header lleva bytes no-ASCII: ${h}`);
    // Y sigue siendo el MISMO dato: escapar no puede cambiar lo que se pide.
    assert.equal(JSON.parse(h).path, path);
});
test("escapa cada carácter que rompe la cabecera, no solo los acentos", () => {
    for (const ch of ["ó", "í", "ñ", "Ñ", "·", "á", "ü", "€", "—"]) {
        const h = argHeader({ path: `/x/${ch}.pdf` });
        assert.ok(soloAscii(h), `${ch} quedó crudo en el header`);
        assert.equal(JSON.parse(h).path, `/x/${ch}.pdf`, `${ch} no sobrevive el round-trip`);
    }
});
test("lo ASCII no se toca: el header sigue siendo legible", () => {
    assert.equal(argHeader({ path: "/WEPRODU/Paritarias/SATSAID/2026/a.pdf" }), '{"path":"/WEPRODU/Paritarias/SATSAID/2026/a.pdf"}');
});
test("el espacio NO se escapa: es ASCII y JSON lo transporta", () => {
    // Escaparlo de más sería otro bug: el nombre legible del espejo está lleno de espacios.
    assert.ok(argHeader({ path: "/a b/c d.pdf" }).includes("/a b/c d.pdf"));
});

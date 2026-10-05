import { test } from "node:test";
import assert from "node:assert/strict";
import { analizarPlantilla, plantillaSana } from "./variablesPlantilla.js";
test("una variable bien formada se reconoce y no da problema", () => {
    const r = analizarPlantilla("Hola {{nombre}}, tu alta es {{fechaAltaContrato}}.");
    assert.deepEqual(r.variables, ["nombre", "fechaAltaContrato"]);
    assert.equal(r.problemas.length, 0);
});
test("ATRAPA `{x}}`, que es lo que se escapó del chequeo anterior", () => {
    /*
      El chequeo que falló contaba `{{nombre}}` por un lado y `{nombre}` por el otro, y `{nombre}}` no
      es ninguno de los dos: pasó por el agujero entre los dos patrones y devolvió «todas válidas».
    */
    const r = analizarPlantilla("DATE: {</td><td>{fechaAltaContrato}}");
    assert.equal(r.variables.length, 0, "no hay ninguna variable válida acá");
    /*
      DOS problemas, no uno, y decir dos es lo correcto: el corte dejó una llave de apertura huérfana
      en la primera celda Y un par desbalanceado en la segunda. Reportar uno solo escondería la mitad
      del destrozo, que es la misma clase de error que dejó pasar el chequeo original.
    */
    assert.equal(r.problemas.length, 2);
    assert.match(r.problemas[0].motivo, /sin cierre/);
    assert.match(r.problemas[1].motivo, /desbalanceadas/);
    // Y el fragmento tiene que dejar ver DÓNDE, para poder repararlo sin adivinar.
    assert.ok(r.problemas[1].fragmento.includes("fechaAltaContrato"));
});
test("atrapa también la mitad simétrica: `{{x}`", () => {
    const r = analizarPlantilla("Hola {{nombre}");
    assert.equal(r.problemas.length, 1);
    assert.match(r.problemas[0].motivo, /desbalanceadas/);
});
test("la llave simple sigue siendo un problema", () => {
    const r = analizarPlantilla("Hola {nombre}");
    assert.equal(r.problemas.length, 1);
    assert.match(r.problemas[0].motivo, /llave simple/);
});
test("una variable partida por un borde de celda se reporta como tal", () => {
    // Es el corte que produjo el error: el nombre queda con marcado adentro.
    const r = analizarPlantilla("{{fecha</td><td>AltaContrato}}");
    assert.equal(r.problemas.length, 1);
    assert.match(r.problemas[0].motivo, /partida por marcado/);
});
test("llaves huérfanas, de los dos lados", () => {
    assert.match(analizarPlantilla("cierre suelto }} acá").problemas[0].motivo, /sin apertura/);
    assert.match(analizarPlantilla("apertura suelta {{ acá").problemas[0].motivo, /sin cierre/);
});
test("plantillaSana resume el análisis", () => {
    assert.equal(plantillaSana("Todo {{bien}} acá"), true);
    assert.equal(plantillaSana("Roto {aca}}"), false);
});

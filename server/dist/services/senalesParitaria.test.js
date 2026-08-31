import { test } from "node:test";
import assert from "node:assert/strict";
import { conveniosMencionados, normalizarConvenio, periodoMencionado, periodosMencionados, expediente, unidadSospechosa, cotejarConvenios, coincidePeriodo } from "./senalesParitaria.js";
/*
  Los textos de estos casos son recortes REALES de los 33 PDF guardados, no ejemplos inventados. Es
  la diferencia entre probar que el regex hace lo que dice y probar que sirve para estos documentos.
*/
test("el número de convenio se normaliza a cuatro dígitos, como el catálogo", () => {
    assert.equal(normalizarConvenio("131/75"), "0131/75");
    assert.equal(normalizarConvenio("634/11"), "0634/11");
    assert.equal(normalizarConvenio("0102/90"), "0102/90");
});
test("levanta los convenios citados, sin repetir y con su fragmento", () => {
    const texto = "Que ambas partes han arribado el presente acuerdo salarial del CCT 131/75 y CCT 634/11, correspondiente a la paritaria 2022/2023";
    const r = conveniosMencionados(texto);
    assert.deepEqual(r.map((x) => x.valor), ["0131/75", "0634/11"]);
    assert.ok(r[0].fragmento.includes("CCT 131/75"), "el fragmento tiene que probar de dónde salió");
});
test("acepta las formas en que los acuerdos escriben el CCT", () => {
    for (const forma of ["CCT 131/75", "CCT: 634/11", "CCT N° 634/11", "CCT. 131/75", "Convenio Colectivo de Trabajo N° 131/75", "C.C.T. 223/75"]) {
        assert.equal(conveniosMencionados(`texto ${forma} más texto`).length, 1, forma);
    }
});
test("una fecha NO es un convenio", () => {
    // Sin el ancla «CCT», `\d{3}/\d{2}` levanta las fechas de las que estos acuerdos están llenos.
    assert.deepEqual(conveniosMencionados("de fecha 25 de Octubre de 2022, art. 145/75 del texto, vencimiento 131/75"), []);
    assert.deepEqual(conveniosMencionados("suscripto el 03/05/2024 y ratificado el 12/06/2024"), []);
});
test("el período sale con la forma del SATSAID y con la de los tarifarios", () => {
    assert.equal(periodoMencionado("ACUERDO SALARIAL PERIODO JULIO - AGOSTO 2025 entre las partes")?.valor, "JULIO - AGOSTO 2025");
    assert.equal(periodoMencionado("CONTRATOS MÍNIMOS VALOR JULIO/2026 MÍNIMO MENSUAL")?.valor, "JULIO/2026");
    assert.equal(periodoMencionado("un texto sin período alguno"), null);
});
test("el expediente se reconoce completo y en su forma corta", () => {
    assert.equal(expediente("RE-2023-89006355-APN-DTD#JGM Página 1 de 17")?.valor, "RE-2023-89006355-APN-DTD#JGM");
    assert.equal(expediente("de fecha 25 de Octubre de 2022 y EX-2022-114248312- -APN-DGD#MT y")?.valor, "EX-2022-114248312--APN-DGD#MT");
    assert.equal(expediente("sin expediente"), null);
});
test("«Valores por jornada» dispara la señal de unidad", () => {
    // El caso real: el tarifario de publicidad de la AAA. Cargar esos números como sueldo mensual
    // declararía mal la remuneración de todos los actores de publicidad ante ARCA.
    const s = unidadSospechosa("CALLBACK $ 89.110 $ 92.707\n• Valores por jornada");
    assert.ok(s);
    assert.ok(s.fragmento.includes("Valores por jornada"));
});
test("«Jornada Diaria» NO dispara: es la duración del día, no la unidad del importe", () => {
    // Medido sobre los 33 PDF: «diaria/diario» aparece en 14 y siempre en este sentido. Si disparara,
    // el aviso se encendería en el 42% de los documentos y dejaría de mirarse.
    assert.equal(unidadSospechosa("Labor x 9Hs Diarias de Lunes a Viernes"), null);
    assert.equal(unidadSospechosa("Adicional por cada Jornada Diaria trabajada"), null);
    assert.equal(unidadSospechosa("Diaria Adicional de 9Hs"), null);
    // Pero pegado a una palabra de valor, sí.
    assert.ok(unidadSospechosa("los valores diarios que se detallan"));
});
test("cotejar convenios distingue «ajeno» de «sin mención»", () => {
    const fuente = ["0131/75", "0634/11"];
    assert.equal(cotejarConvenios(["0131/75", "0634/11"], fuente), "coinciden");
    // El caso del SATSAID: su página cuelga acuerdos de 0223/75, que es de otro gremio.
    assert.equal(cotejarConvenios(["0223/75"], fuente), "ajeno");
    // Los tarifarios de actores son tablas de escala que no citan ningún CCT, y son nuestros.
    assert.equal(cotejarConvenios([], fuente), "sin_mencion");
});
test("cotejar convenios normaliza los dos lados", () => {
    // El PDF escribe «131/75» y el catálogo «0131/75». Sin normalizar, todo daría «ajeno».
    assert.equal(cotejarConvenios(["131/75"], ["0131/75"]), "coinciden");
});
test("el período del PDF se compara contra el del enlace", () => {
    assert.equal(coincidePeriodo("JULIO - AGOSTO 2025", "ACUERDO SALARIAL 2025-2026 - PERIODO JULIO - AGOSTO 2025"), true);
    // El caso feo: el gremio colgó bajo este enlace el acuerdo de otro mes.
    assert.equal(coincidePeriodo("ABRIL 2026", "ACUERDO SALARIAL - PERIODO JULIO - AGOSTO 2025"), false);
    // Sin con qué comparar no se afirma nada: `null` no es `false`.
    assert.equal(coincidePeriodo(null, "PERIODO JULIO 2025"), null);
    assert.equal(coincidePeriodo("JULIO 2025", "Acuerdo salarial"), null);
});
test("un tramo del PDF cuenta como coincidencia con el rango del enlace", () => {
    /*
      El caso real que rompía la señal: el enlace anuncia el período completo y cada sección del PDF
      encabeza un tramo. Con igualdad de meses, 7 de las 31 publicaciones del SATSAID —todas
      correctas— quedaban marcadas como sospechosas.
    */
    assert.equal(coincidePeriodo(["ABRIL 2025"], "ACUERDO SALARIAL 2024-2025 -PERIODO ENERO A ABRIL 2025"), true);
    assert.equal(coincidePeriodo(["OCTUBRE 2022"], "ACUERDO SALARIAL 2022-2023 (PRIMER TRAMO: OCTUBRE-NOVIEMBRE-DICIEMBRE 2022)"), true);
    // Y lo que tiene que seguir saltando: ningún período del PDF cae dentro del que anuncia el enlace.
    assert.equal(coincidePeriodo(["OCTUBRE 2025"], "ACUERDO SALARIAL 2025-2026 (PERIODO FEBRERO A JUNIO 2026)"), false);
});
test("se levantan todos los períodos del documento, no solo el primero", () => {
    const texto = "PERIODO OCTUBRE 2025 ... escala ... PERIODO FEBRERO 2026 ... PERIODO OCTUBRE 2025";
    assert.deepEqual(periodosMencionados(texto).map((x) => x.valor), ["OCTUBRE 2025", "FEBRERO 2026"]);
    assert.equal(periodoMencionado(texto)?.valor, "OCTUBRE 2025");
});

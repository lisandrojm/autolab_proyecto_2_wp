import { test } from "node:test";
import assert from "node:assert/strict";
import { mismoNombre } from "./nombreArca.js";
/*
  Esta comparación es la que decide si se consulta al padrón o no.

  Si diera distinto de más, cada corrida de veinte personas dispararía veinte consultas SOAP al
  organismo para confirmar lo que la pantalla ya había mostrado — que es exactamente el «doble
  trabajo» que este diseño evita. Si diera igual de más, un nombre mal cargado no se corregiría nunca.
*/
test("el orden apellido/nombre no es una diferencia", () => {
    // Cómo lo muestra ARCA en la pantalla de altas ↔ cómo lo guarda WeProdu (firstName + lastName).
    assert.ok(mismoNombre("STOLTZING MICAELA SOL", "Micaela Sol Stoltzing"));
    assert.ok(mismoNombre("SORIA MARIA DEL CORAZON DE JESUS", "MAgdalena Maria del corazon de Jesús Soria") === false);
});
test("mayúsculas y acentos tampoco", () => {
    assert.ok(mismoNombre("MARTINEZ LISANDRO JAVIER", "Lisandro Javier Martínez"));
    assert.ok(mismoNombre("PEREZ JOSE MARIA", "josé maría pérez"));
});
test("una palabra de más o de menos SÍ es una diferencia", () => {
    assert.ok(!mismoNombre("CORDOBA ALEJANDRO HUGO DAVID", "Alejandro Hugo Cordoba"));
    assert.ok(!mismoNombre("VELIZ ANGELES SELENA", "Angeles Selena Veliz Borca"));
});
test("un nombre distinto es distinto", () => {
    assert.ok(!mismoNombre("GARCIA JORGE", "Jorge Gomez"));
});
// Sin nombre no hay nada que comparar, y «vacío contra vacío» NO puede dar «coincide»: eso pondría
// un tilde verde afirmando que ARCA confirmó algo que nunca se leyó.
test("vacío nunca coincide", () => {
    assert.ok(!mismoNombre("", ""));
    assert.ok(!mismoNombre("", "Jorge Garcia"));
    assert.ok(!mismoNombre("GARCIA JORGE", ""));
});
test("los guiones y puntos no cuentan", () => {
    assert.ok(mismoNombre("O'CONNOR ANA", "Ana O Connor"));
    assert.ok(mismoNombre("DE LA TORRE  JUAN", "Juan de la Torre"));
});

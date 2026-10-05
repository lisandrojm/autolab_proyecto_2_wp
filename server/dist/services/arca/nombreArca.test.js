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
/*
  PARTIR EL NOMBRE QUE ARCA MUESTRA EN UN SOLO CAMPO.

  La pantalla de altas muestra «CASTRO BRIAN EMANUEL» y no dice dónde termina el apellido. Adivinarlo
  escribe el nombre de una persona al revés, así que antes el caso se descartaba: se detectaba que el
  nombre no era el de ARCA y se dejaba el que va a hacer que rechacen el alta.

  El ancla es el apellido que la ficha YA tiene decidido. Buscarlo adentro del string no es adivinar
  el corte: es leer el corte que ya estaba tomado.
*/
import { partirConAncla } from "./nombreArca.js";
test("el caso real: ARCA trae un nombre de pila mas que la ficha", () => {
    // Lo que muestra la pantalla para el CUIL 20-41292376-7, con «castro» guardado como apellido.
    assert.deepEqual(partirConAncla("CASTRO BRIAN EMANUEL", "castro"), { apellido: "CASTRO", nombre: "BRIAN EMANUEL" });
});
test("el apellido compuesto, que era el caso dado por imposible", () => {
    // «DE LA TORRE JUAN» no se puede partir a ciegas. Con el ancla de tres palabras, sí.
    assert.deepEqual(partirConAncla("DE LA TORRE JUAN", "De La Torre"), { apellido: "DE LA TORRE", nombre: "JUAN" });
});
test("tambien cuando ARCA lo manda al reves", () => {
    assert.deepEqual(partirConAncla("MICAELA SOL STOLTZING", "Stoltzing"), { apellido: "STOLTZING", nombre: "MICAELA SOL" });
});
test("el ancla ignora acentos y mayusculas, y devuelve la grafia de ARCA", () => {
    assert.deepEqual(partirConAncla("MARTINEZ LISANDRO JAVIER", "Martínez"), { apellido: "MARTINEZ", nombre: "LISANDRO JAVIER" });
});
test("sin ancla no se escribe nada: ese apellido es OTRO y lo mira una persona", () => {
    // Un casamiento, dos personas mezcladas en una ficha, o un CUIL mal cargado. Ninguna se arregla
    // escribiendo por encima.
    assert.equal(partirConAncla("GOMEZ ANA", "Perez"), null);
});
test("no deja a la persona sin nombre de pila", () => {
    // El apellido solo, sin nada que sobre, no alcanza para partir: quedaria firstName vacio.
    assert.equal(partirConAncla("CASTRO", "castro"), null);
    assert.equal(partirConAncla("", "castro"), null);
    assert.equal(partirConAncla("CASTRO BRIAN", ""), null);
});

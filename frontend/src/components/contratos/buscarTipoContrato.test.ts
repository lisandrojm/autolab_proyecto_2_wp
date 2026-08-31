import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarTipoContrato } from "./afipCompleteness";

/*
  Los nombres son REALES, sacados de los 6.780 contratos de producción. La comparación exacta que
  había acertaba en 100 de 6.780: por eso los tres códigos de ARCA salían «Falta» aunque el tipo los
  tuviera cargados.
*/
const tipos = [
  { name: "Jornada" },
  { name: "Plazo fijo 6x6" },
  { name: "Plazo fijo 5x7" },
  { name: "Plazo fijo 5x7 part-time" },
  { name: "Servicios" },
  { name: "Tiempo Indeterminado" },
  { name: "Practica Profesional Supervisada" },
  { name: "Eventual Talento My secret - Reelshort" },
  { name: "Eventual Talento Surrender  - Reelshort" },
  { name: "Eventual Crew My secret" },
];

test("el sufijo de la empleadora no impide encontrar el tipo", () => {
  // 3.310 contratos dicen esto y no había ningún tipo llamado así.
  assert.equal(buscarTipoContrato(tipos, "Jornada 2030 SRL")?.name, "Jornada");
  assert.equal(buscarTipoContrato(tipos, "Plazo fijo 6x6 2030 SRL")?.name, "Plazo fijo 6x6");
  assert.equal(buscarTipoContrato(tipos, "Servicios - 2030 SRL")?.name, "Servicios");
  assert.equal(buscarTipoContrato(tipos, "Tiempo Indeterminado - FZERO SRL")?.name, "Tiempo Indeterminado");
  assert.equal(buscarTipoContrato(tipos, "Plazo fijo 5x7 part-time 2030 SRL")?.name, "Plazo fijo 5x7 part-time");
});

test("el match exacto gana y no se le toca el sufijo", () => {
  // «Plazo fijo 5x7 part-time» no puede caer en «Plazo fijo 5x7» por sacarle de más.
  assert.equal(buscarTipoContrato(tipos, "Plazo fijo 5x7 part-time")?.name, "Plazo fijo 5x7 part-time");
  assert.equal(buscarTipoContrato(tipos, "Plazo fijo 5x7")?.name, "Plazo fijo 5x7");
});

test("tolera espacios de más y diferencias de mayúsculas", () => {
  // Nombres reales: uno con espacio al final, otro con «talento» en minúscula.
  assert.equal(buscarTipoContrato(tipos, "Practica Profesional Supervisada ")?.name, "Practica Profesional Supervisada");
  assert.equal(buscarTipoContrato(tipos, "Eventual Talento Surrender  - Reelshort")?.name, "Eventual Talento Surrender  - Reelshort");
});

test("NO adivina por parecido: un nombre ambiguo queda sin tipo", () => {
  /*
    «Eventual Talento» a secas existe en 63 contratos y hay cuatro tipos que empiezan así. Elegir uno
    escribiría en el TXT la modalidad de un contrato que nadie eligió — peor que decir que falta.
  */
  assert.equal(buscarTipoContrato(tipos, "Eventual Talento"), undefined);
  assert.equal(buscarTipoContrato(tipos, "Eventual Reelshort"), undefined);
  // Un tipo que directamente no existe en el catálogo tampoco se fuerza.
  assert.equal(buscarTipoContrato(tipos, "Plazo fijo 5x10 2030 SRL + Release JSA FZERO"), undefined);
});

test("sin nombre no hay tipo", () => {
  assert.equal(buscarTipoContrato(tipos, ""), undefined);
  assert.equal(buscarTipoContrato(tipos, null), undefined);
});

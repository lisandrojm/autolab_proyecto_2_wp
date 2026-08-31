import { test } from "node:test";
import assert from "node:assert/strict";
import { nombreLegible, rutaEspejo, anioDe, BASE_POR_DEFECTO } from "./espejoDropboxParitaria.js";

test("el nombre legible dice de qué acuerdo se trata", () => {
  const n = nombreLegible({
    detectadaEl: new Date("2026-04-28T12:00:00Z"),
    entidad: "SATSAID",
    conveniosMencionados: ["0131/75", "0634/11"],
    expediente: "RE-2026-43103223-APN-DTD#JGM",
  });
  // La barra del convenio pasa a guión: en un nombre de archivo crearía una carpeta.
  assert.ok(!n.includes("0131/75"));
  assert.ok(n.includes("0131-75 + 0634-11"), n);
  assert.ok(n.startsWith("2026-04-28 · SATSAID · "), n);
  assert.ok(n.endsWith(".pdf"));
});

test("los espacios se conservan: el nombre existe para leerlo", () => {
  // En el nombre sugerido de una descarga los espacios molestan; acá son el punto.
  const n = nombreLegible({ detectadaEl: new Date("2026-04-28T12:00:00Z"), entidad: "Asociación Argentina de Actores", periodo: "JULIO 2026" });
  assert.ok(n.includes("Asociación Argentina de Actores"), n);
});

test("sin expediente cae al período, y sin período al texto del enlace", () => {
  const base = { detectadaEl: new Date("2026-04-28T12:00:00Z"), entidad: "SATSAID" };
  assert.ok(nombreLegible({ ...base, periodo: "ABRIL 2026" }).includes("ABRIL 2026"));
  assert.ok(nombreLegible({ ...base, textoEnlace: "ACUERDO SALARIAL 2025-2026" }).includes("ACUERDO SALARIAL 2025-2026"));
});

test("el nombre no puede salirse de su carpeta ni pasarse del tope", () => {
  const n = nombreLegible({ detectadaEl: new Date("2026-04-28T12:00:00Z"), entidad: "../../etc", textoEnlace: "x".repeat(400) });
  assert.ok(!n.includes("/"), n);
  assert.ok(n.length <= 120, `${n.length}`);
});

test("el año sale del acuerdo, y solo si no está, de la detección", () => {
  assert.equal(anioDe("ABRIL 2026", new Date("2020-01-01")), "2026");
  assert.equal(anioDe(null, new Date("2020-06-01T12:00:00Z")), "2020");
});

test("la ruta es <base>/<entidad>/<año>/<nombre>", () => {
  // Por entidad y no por convenio: un acuerdo del SATSAID cubre DOS convenios a la vez, así que la
  // carpeta por convenio obligaría a duplicar el archivo o a elegir uno arbitrariamente.
  const r = rutaEspejo("SATSAID", "2026", "archivo.pdf");
  assert.equal(r, `${BASE_POR_DEFECTO}/SATSAID/2026/archivo.pdf`);
  // Y queda fuera de ARCA/, donde viven las constancias de CUIT.
  assert.ok(!r.includes("/ARCA/"));
});

test("la base sale de configuración: cambiarla mueve todo", () => {
  assert.equal(rutaEspejo("SATSAID", "2026", "a.pdf", "/Otro/Lugar"), "/Otro/Lugar/SATSAID/2026/a.pdf");
});

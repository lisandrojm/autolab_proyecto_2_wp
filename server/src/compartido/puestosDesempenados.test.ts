/**
 *   npx tsx --test src/compartido/puestosDesempenados.test.ts   (o `npm run test:puestos`)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { codigoPuesto, planDeImportacionPuestos, resolverPuesto } from "./puestosDesempenados.js";

describe("resolverPuesto: Rol Empresa → Categoría → empresa → instalación", () => {
  it("el rol gana sobre todo", () => assert.deepEqual(resolverPuesto({ rol: "2455", categoria: "5142", empresa: "1111", global: "2222" }), { codigo: "2455", origen: "funcion" }));
  it("sin rol, la categoría", () => assert.deepEqual(resolverPuesto({ rol: "", categoria: "5142", empresa: "1111" }), { codigo: "5142", origen: "categoria" }));
  it("sin rol ni categoría, la empresa", () => assert.deepEqual(resolverPuesto({ empresa: "1111", global: "2222" }), { codigo: "1111", origen: "empresa" }));
  it("y al final la instalación", () => assert.deepEqual(resolverPuesto({ global: "2222" }), { codigo: "2222", origen: "global" }));
  it("sin nada, ninguno", () => assert.deepEqual(resolverPuesto({ rol: null, categoria: undefined, empresa: "", global: "  " }), { codigo: "", origen: "ninguno" }));
  it("normaliza a 4 dígitos con ceros", () => {
    assert.equal(codigoPuesto("911"), "0911");
    assert.equal(resolverPuesto({ rol: 911 }).codigo, "0911");
  });
});

describe("planDeImportacionPuestos: upsert por código", () => {
  const existentes = [
    { codigo: "2455", descripcion: "Actores", origen: "arca" as const },
    { codigo: "5142", descripcion: "Peluqueros", origen: "arca" as const },
    { codigo: "9001", descripcion: "Puesto propio", origen: "manual" as const },
    { codigo: "0911", descripcion: "Viejo", origen: "arca" as const },
  ];
  const filas = [
    { codigo: "2455", descripcion: "Actores" },
    { codigo: "5142", descripcion: "Peluqueros y especialistas en tratamientos de belleza" },
    { codigo: "9001", descripcion: "Otro texto de ARCA" },
    { codigo: "2421", descripcion: "Abogados" },
    { codigo: "2421", descripcion: "Abogados (repetido)" },
    { codigo: "", descripcion: "sin código" },
  ];
  const p = planDeImportacionPuestos(existentes, filas);

  it("nuevos, actualizados, sin cambios y manuales respetados", () => {
    assert.deepEqual(p.nuevos, [{ codigo: "2421", descripcion: "Abogados" }]);
    assert.deepEqual(p.actualizados.map((x) => x.codigo), ["5142"]);
    assert.deepEqual(p.sinCambios, ["2455"]);
    assert.deepEqual(p.manualesRespetados.map((x) => x.codigo), ["9001"]);
    assert.equal(p.descartadas, 2);
  });
  it("lo que la tabla no trae no se toca", () => {
    const tocados = [...p.nuevos, ...p.actualizados, ...p.manualesRespetados].map((x) => x.codigo).concat(p.sinCambios);
    assert.ok(!tocados.includes("0911"));
  });
  it("reimportar dos veces no cambia nada", () => {
    const despues = [...existentes.map((e) => ({ ...e, descripcion: p.actualizados.find((a) => a.codigo === e.codigo)?.descripcion ?? e.descripcion })), ...p.nuevos.map((n) => ({ ...n, origen: "arca" as const }))];
    const otra = planDeImportacionPuestos(despues, filas);
    assert.equal(otra.nuevos.length + otra.actualizados.length, 0);
  });
  it("conserva los ceros a la izquierda", () => {
    assert.deepEqual(planDeImportacionPuestos([], [{ codigo: "911", descripcion: "X" }]).nuevos, [{ codigo: "0911", descripcion: "X" }]);
  });
});

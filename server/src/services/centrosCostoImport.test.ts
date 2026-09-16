/*
  Casos de la validación del import y del remapeo de proyectos.

  No hay runner de tests en el repo, así que el archivo se corre a mano y se planta con código != 0 si
  algo falla, que es lo que hace falta para poder meterlo en CI el día que haya uno:

      cd server && ./node_modules/.bin/tsx src/services/centrosCostoImport.test.ts

  Se prueban las tres cosas que, si fallan, dejan la plataforma sin centros de costo o con 44
  proyectos apuntando al lugar equivocado: la validación del archivo, el reemplazo y la IDEMPOTENCIA
  del remapeo.
*/
import { construirRemapeo, decidirRemapeo, validarPayload, type ItemCentroCosto } from "./centrosCostoImport.js";

let fallos = 0;
const ok = (condicion: boolean, titulo: string, detalle?: unknown) => {
  if (condicion) {
    console.log(`ok   ${titulo}`);
  } else {
    fallos++;
    console.log(`MAL  ${titulo}`, detalle === undefined ? "" : detalle);
  }
};

const item = (idAuxiliar: number, codAuxiliar: string, habilitado: "S" | "N" = "S"): ItemCentroCosto => ({ idAuxiliar, codAuxiliar, descAuxiliar: `${codAuxiliar}-DESC`, habilitado });

/* ---------------------------------- validarPayload ---------------------------------- */

{
  const r = validarPayload({ modo: "reemplazar", total: 2, items: [item(1, "99"), item(863, "682")] });
  ok(r.ok && r.items.length === 2 && r.modo === "reemplazar", "archivo válido: pasa y devuelve los ítems", r.errores);
}
{
  const r = validarPayload({ items: [item(1, "99")] });
  ok(r.ok && r.modo === "reemplazar", "sin modo: el default es reemplazar", r.errores);
}
{
  const r = validarPayload({ modo: "actualizar", items: [item(1, "99")] });
  ok(r.ok && r.modo === "actualizar", "modo actualizar", r.errores);
}
{
  const r = validarPayload({ modo: "borrar todo", items: [item(1, "99")] });
  ok(!r.ok && r.errores.some((e) => e.startsWith("modo:")), "modo inválido: falla", r.errores);
}
{
  const r = validarPayload({ items: "no es una lista" as any });
  ok(!r.ok && r.errores.some((e) => e.startsWith("items:")), "items que no es lista: falla", r.errores);
}
{
  const r = validarPayload({ items: [] });
  ok(!r.ok, "archivo sin ítems: falla", r.errores);
}
{
  const r = validarPayload({ items: [{ idAuxiliar: 0, codAuxiliar: "99", descAuxiliar: "x", habilitado: "S" }] });
  ok(!r.ok && r.errores[0].includes("idAuxiliar"), "idAuxiliar 0: falla", r.errores);
}
{
  const r = validarPayload({ items: [{ idAuxiliar: 1.5, codAuxiliar: "99", descAuxiliar: "x", habilitado: "S" }] });
  ok(!r.ok && r.errores[0].includes("idAuxiliar"), "idAuxiliar decimal: falla", r.errores);
}
{
  const r = validarPayload({ items: [{ idAuxiliar: "1" as any, codAuxiliar: "99", descAuxiliar: "x", habilitado: "S" }] });
  ok(!r.ok && r.errores[0].includes("idAuxiliar"), "idAuxiliar como texto: falla", r.errores);
}
{
  const r = validarPayload({ items: [{ idAuxiliar: 1, codAuxiliar: "  ", descAuxiliar: "x", habilitado: "S" }] });
  ok(!r.ok && r.errores[0].includes("codAuxiliar"), "codAuxiliar vacío: falla", r.errores);
}
{
  const r = validarPayload({ items: [{ idAuxiliar: 1, codAuxiliar: "99", descAuxiliar: "", habilitado: "S" }] });
  ok(!r.ok && r.errores[0].includes("descAuxiliar"), "descAuxiliar vacío: falla", r.errores);
}
{
  const r = validarPayload({ items: [{ idAuxiliar: 1, codAuxiliar: "99", descAuxiliar: "x", habilitado: "SI" as any }] });
  ok(!r.ok && r.errores[0].includes("habilitado"), "habilitado que no es S ni N: falla", r.errores);
}
{
  const r = validarPayload({ items: [{ idAuxiliar: 1, codAuxiliar: "99", descAuxiliar: "x", habilitado: "n" as any }] });
  ok(r.ok && r.items[0].habilitado === "N", "habilitado en minúscula: se normaliza a N", r.errores);
}
{
  const r = validarPayload({ items: [item(1, "99"), item(1, "100")] });
  ok(!r.ok && r.errores[0].includes("idAuxiliar 1 repetido") && r.errores[0].includes("items[0]"), "idAuxiliar duplicado: falla nombrando al otro índice", r.errores);
}
{
  const r = validarPayload({ items: [item(1, "99"), item(2, "99")] });
  ok(!r.ok && r.errores[0].includes('codAuxiliar "99" repetido'), "codAuxiliar duplicado: falla", r.errores);
}
{
  const r = validarPayload({ total: 5, items: [item(1, "99")] });
  ok(!r.ok && r.errores[0].startsWith("total:"), "total que no coincide: falla (llegó cortado)", r.errores);
}
{
  const r = validarPayload({ items: [item(1, "99"), { idAuxiliar: 2, codAuxiliar: "", descAuxiliar: "", habilitado: "X" as any }, item(3, "9")] });
  ok(!r.ok && r.errores.length === 3 && r.errores.every((e) => e.includes("items[1]")), "junta TODOS los errores del ítem, no corta en el primero", r.errores);
}
{
  const r = validarPayload({ items: [{ idAuxiliar: 7, codAuxiliar: "  682  ", descAuxiliar: "  682_X  ", habilitado: "S" }] });
  ok(r.ok && r.items[0].codAuxiliar === "682" && r.items[0].descAuxiliar === "682_X", "recorta los espacios", r.errores);
}

/* --------------------------------- construirRemapeo --------------------------------- */

// El catálogo de Tango de verdad, reducido a lo que importa para estos casos.
const tango = [item(1, "99"), item(863, "682"), item(864, "673"), item(22, "100"), item(2, "SinAsignar")];

{
  const r = construirRemapeo([{ idViejo: 1, codigo: "682" }, { idViejo: 2, codigo: "673" }], tango);
  ok(r[0].idAuxiliarNuevo === 863 && r[1].idAuxiliarNuevo === 864, "cruza por código: el viejo 1 («682») va al 863", r);
}
{
  const r = construirRemapeo([{ idViejo: 22, codigo: "2030" }], tango);
  ok(r[0].idAuxiliarNuevo === null, "código que no está en Tango: queda en null", r);
}
{
  const r = construirRemapeo([{ idViejo: 5, codigo: " sinasignar " }], tango);
  ok(r[0].idAuxiliarNuevo === 2, "compara sin mayúsculas ni espacios", r);
}
{
  const r = construirRemapeo([{ idViejo: 0, codigo: "99" }, { idViejo: -1, codigo: "99" }], tango);
  ok(r.length === 0, "descarta los ids viejos 0 y negativos", r);
}

/* ---------------------------------- decidirRemapeo ---------------------------------- */

const remapeo = construirRemapeo([
  { idViejo: 1, codigo: "682" },
  { idViejo: 2, codigo: "673" },
  { idViejo: 22, codigo: "2030" },
  { idViejo: 46, codigo: "720" },
], tango);

{
  const d = decidirRemapeo([{ _id: "p1", nombre: "Proyecto A", centroCostoId: 1 }], remapeo);
  ok(d.cambios.length === 1 && d.cambios[0].antes === 1 && d.cambios[0].despues === 863 && d.cambios[0].codigo === "682", "el proyecto con el viejo 1 pasa a 863 y conserva el código 682", d);
}
{
  const d = decidirRemapeo([{ _id: "p1", centroCostoId: 0 }, { _id: "p2", centroCostoId: null }, { _id: "p3" }], remapeo);
  ok(d.cambios.length === 0 && d.omitidos.length === 0, "sin centro de costo: no se toca ni se informa", d);
}
{
  const d = decidirRemapeo([{ _id: "p1", centroCostoId: 22 }, { _id: "p2", centroCostoId: 46 }], remapeo);
  ok(d.cambios.length === 0 && d.omitidos.length === 2 && d.omitidos.every((o) => o.motivo.includes("no existe en Tango")), "sin equivalente en Tango: se omite con el motivo", d);
}
{
  // LA IDEMPOTENCIA: el 863 ya migrado NO se vuelve a remapear, aunque 863 fuera un id viejo válido.
  const d = decidirRemapeo([{ _id: "p1", centroCostoId: 863, centroCostoOrigen: "tango" }], remapeo);
  ok(d.cambios.length === 0 && d.omitidos[0].motivo.includes("ya migrado"), "correrlo dos veces no remapea de nuevo (marca centroCostoOrigen)", d);
}
{
  // El caso peligroso sin la marca: un proyecto ya migrado al 22 («100») volvería a moverse.
  const conMarca = decidirRemapeo([{ _id: "p1", centroCostoId: 22, centroCostoOrigen: "tango" }], remapeo);
  const sinMarca = decidirRemapeo([{ _id: "p1", centroCostoId: 22 }], remapeo);
  ok(conMarca.cambios.length === 0 && sinMarca.cambios.length === 0 && sinMarca.omitidos.length === 1, "un id que existe en las dos numeraciones: la marca es lo que lo protege", { conMarca, sinMarca });
}
{
  const d = decidirRemapeo([{ _id: "p1", centroCostoId: 999 }], remapeo);
  ok(d.cambios.length === 0 && d.omitidos[0].motivo.includes("no está en el catálogo anterior"), "centro que no estaba en el catálogo viejo: se informa", d);
}
{
  // Aplicar los cambios y volver a decidir: la segunda pasada no propone nada (con la marca puesta).
  const proyectos = [{ _id: "p1", nombre: "A", centroCostoId: 1 }, { _id: "p2", nombre: "B", centroCostoId: 2 }];
  const primera = decidirRemapeo(proyectos, remapeo);
  const despues = primera.cambios.map((c) => ({ _id: c.projectId, nombre: c.nombre, centroCostoId: c.despues, centroCostoOrigen: "tango" }));
  const segunda = decidirRemapeo(despues, remapeo);
  ok(primera.cambios.length === 2 && segunda.cambios.length === 0, "dos pasadas seguidas: la segunda no cambia nada", { primera, segunda });
}

console.log(fallos === 0 ? `\nTODO OK` : `\n${fallos} CASOS FALLAN`);
process.exit(fallos === 0 ? 0 : 1);

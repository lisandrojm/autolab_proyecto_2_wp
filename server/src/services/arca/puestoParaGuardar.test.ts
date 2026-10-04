import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { puestoParaGuardar } from "./puestosDesempenados.js";

const AQUI = dirname(fileURLToPath(import.meta.url));
/** Catálogo de mentira: sólo existen y están activos estos dos. */
const existe = async (codigo: string) => ["2455", "4132"].includes(codigo);

describe("puestoParaGuardar: el default de puesto que llega del ABM", () => {
  it("si no vino, no se toca", async () => assert.deepEqual(await puestoParaGuardar(undefined, existe), {}));

  it("vacío o sin dígitos lo quita", async () => {
    assert.deepEqual(await puestoParaGuardar("", existe), { valor: "" });
    assert.deepEqual(await puestoParaGuardar(null, existe), { valor: "" });
    assert.deepEqual(await puestoParaGuardar("sin puesto", existe), { valor: "" });
  });

  it("un código del catálogo se guarda normalizado a 4 dígitos", async () => {
    assert.deepEqual(await puestoParaGuardar("4132", existe), { valor: "4132" });
    assert.deepEqual(await puestoParaGuardar(2455, existe), { valor: "2455" });
    assert.deepEqual(await puestoParaGuardar(" 4132 ", existe), { valor: "4132" });
  });

  it("un código que no está (o está desactivado) se rechaza con la instrucción, y no se guarda", async () => {
    const r = await puestoParaGuardar("9999", existe);
    assert.equal(r.valor, undefined);
    assert.match(String(r.error), /9999 no existe o está desactivado/);
    assert.match(String(r.error), /Puestos Desempeñados/);
  });
});

describe("Convenios guarda el puesto por defecto con esa validación, y fuera del import", () => {
  const ruta = readFileSync(resolve(AQUI, "../../routes/convenios.ts"), "utf8");
  const router = readFileSync(resolve(AQUI, "../../routes/_simpleCatalogRouter.ts"), "utf8");

  it("el campo va por `extraValidatedFields` con `puestoParaGuardar`", () => {
    assert.match(ruta, /extraValidatedFields: \[\{ key: 'puestoDesempenadoDefault', resolver: \(bruto\) => puestoParaGuardar\(bruto\) \}\]/);
  });

  it("no está entre los campos de texto que entran en el import de Excel", () => {
    const strings = ruta.slice(ruta.indexOf("extraStringFields"), ruta.indexOf("]", ruta.indexOf("extraStringFields")));
    assert.ok(!strings.includes("puestoDesempenadoDefault"));
  });

  it("el router lo acepta en el body y lo aplica en el alta y en la edición, cortando con 400 si no valida", () => {
    assert.match(router, /\.\.\.\(config\.extraValidatedFields \|\| \[\]\)\.map\(\(f\) => f\.key\),/);
    assert.equal(router.split("for (const f of config.extraValidatedFields || [])").length - 1, 2, "alta y edición");
    assert.match(router, /if \(r\.valor !== undefined\) newItem\[f\.key\] = r\.valor;/);
    assert.match(router, /if \(r\.valor !== undefined\) item\[f\.key\] = r\.valor;/);
  });
});

describe("el puesto desempeñado del contrato: rutas", () => {
  const rutas = readFileSync(resolve(AQUI, "../../routes/projects.ts"), "utf8");
  const overview = readFileSync(resolve(AQUI, "../../routes/users.ts"), "utf8");
  const servicio = readFileSync(resolve(AQUI, "puestosDesempenados.ts"), "utf8");
  const catalogo = readFileSync(resolve(AQUI, "../../routes/arcaPuestosDesempenados.ts"), "utf8");

  it("hay una ruta para elegirlo en un contrato, que valida contra el catálogo y acepta vacío para volver al default", () => {
    const desde = rutas.indexOf('router.patch("/projects/:projectId/members/:userId/contracts/:index/puesto-desempenado"');
    assert.ok(desde > 0);
    const cuerpo = rutas.slice(desde, desde + 1800);
    assert.match(cuerpo, /puestoParaGuardar\(req\.body\?\.puestoDesempenado \?\? ""\)/);
    assert.match(cuerpo, /puestoDesempenado: puesto\.valor \|\| ""/);
    assert.match(cuerpo, /tenantId: req\.tenantObjectId/);
  });

  it("assign-member valida el que viene del formulario antes de guardar el contrato", () => {
    assert.match(rutas, /if \(contract\.puestoDesempenado !== undefined\) \{\s+const puesto = await puestoParaGuardar\(contract\.puestoDesempenado\);/);
  });

  it("la grilla de Contratos recibe el puesto del contrato", () => {
    assert.match(overview, /"sinCuitValidacion", "puestoDesempenado",/);
    assert.match(overview, /puestoDesempenado: c\.puestoDesempenado \|\| "",/);
  });

  it("el default que muestra Configurar Miembro sale de resolverPuesto, sin el escalón del contrato", () => {
    const fn = servicio.slice(servicio.indexOf("export async function puestoPorDefectoDe"));
    const llamada = fn.slice(fn.indexOf("resolverPuesto({"), fn.indexOf("});", fn.indexOf("resolverPuesto({")));
    for (const clave of ["rol:", "categoria:", "convenio:", "empresa:", "global:"]) assert.ok(llamada.includes(clave), clave);
    assert.ok(!llamada.includes("contrato:"));
    assert.match(catalogo, /router\.get\("\/por-defecto", authenticateToken/);
  });

  it("elegir la actividad se valida contra las de ESA EMPRESA en la sucursal, no contra el catálogo", () => {
    const desde = rutas.indexOf('contracts/:index/actividad-arca", requireTenant');
    const cuerpo = rutas.slice(desde, desde + 4500);
    assert.match(cuerpo, /actividadesDeSucursalParaEmpresa\(asociaciones, sucursalId\)/);
    assert.ok(!/\(sucursal as any\)\.actividades \|\| \[\]\)\.some/.test(cuerpo));
  });
});

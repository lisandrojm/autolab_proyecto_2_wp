/**
 *   npx tsx --test src/compartido/puestosDesempenados.test.ts   (o `npm run test:puestos`)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { codigoPuesto, planDeImportacionPuestos, resolverPuesto } from "./puestosDesempenados.js";
const AQUI = dirname(fileURLToPath(import.meta.url));
describe("resolverPuesto: Rol Empresa → Categoría → convenio → empresa → instalación", () => {
    it("el rol gana sobre todo", () => assert.deepEqual(resolverPuesto({ rol: "2455", categoria: "5142", convenio: "4132", empresa: "1111", global: "2222" }), { codigo: "2455", origen: "funcion" }));
    it("sin rol, la categoría", () => assert.deepEqual(resolverPuesto({ rol: "", categoria: "5142", convenio: "4132", empresa: "1111" }), { codigo: "5142", origen: "categoria" }));
    it("sin rol ni categoría, el CONVENIO, antes que la empleadora", () => assert.deepEqual(resolverPuesto({ convenio: "4132", empresa: "1111", global: "2222" }), { codigo: "4132", origen: "convenio" }));
    it("un convenio sin default (9999/99) deja pasar a la empleadora", () => assert.deepEqual(resolverPuesto({ convenio: "", empresa: "1111", global: "2222" }), { codigo: "1111", origen: "empresa" }));
    /*
      CADA COMBINACIÓN de vacío/cargado de los cinco escalones (2^5 = 32): gana siempre el primero
      cargado, en el orden de la cascada. Cada escalón tiene su código para que se vea CUÁL ganó.
    */
    it("las 32 combinaciones de vacío/cargado: gana el primer escalón cargado", () => {
        const escalones = [
            { clave: "rol", codigo: "1001", origen: "funcion" },
            { clave: "categoria", codigo: "1002", origen: "categoria" },
            { clave: "convenio", codigo: "1003", origen: "convenio" },
            { clave: "empresa", codigo: "1004", origen: "empresa" },
            { clave: "global", codigo: "1005", origen: "global" },
        ];
        let probadas = 0;
        for (let mascara = 0; mascara < 32; mascara++) {
            const entrada = {};
            escalones.forEach((e, i) => (entrada[e.clave] = mascara & (1 << i) ? e.codigo : ""));
            const primero = escalones.find((_, i) => mascara & (1 << i));
            assert.deepEqual(resolverPuesto(entrada), primero ? { codigo: primero.codigo, origen: primero.origen } : { codigo: "", origen: "ninguno" }, `combinación ${mascara.toString(2).padStart(5, "0")}`);
            probadas++;
        }
        assert.equal(probadas, 32);
    });
    it("el convenio NO cambia lo que ya resolvían rol y categoría: con o sin convenio da lo mismo", () => {
        for (const base of [{ rol: "2455" }, { categoria: "5142" }, { rol: "2455", categoria: "5142" }, { rol: "2455", empresa: "1111" }, { categoria: "5142", global: "2222" }]) {
            assert.deepEqual(resolverPuesto({ ...base, convenio: "4132" }), resolverPuesto(base));
        }
    });
    it("sin convenio en la llamada, la cascada es la de antes", () => {
        assert.deepEqual(resolverPuesto({ empresa: "1111", global: "2222" }), { codigo: "1111", origen: "empresa" });
        assert.deepEqual(resolverPuesto({ global: "2222" }), { codigo: "2222", origen: "global" });
    });
    it("los dos consumidores —generador del registro y cotejo del lote— pasan los CINCO escalones a la misma función", () => {
        const front = readFileSync(resolve(AQUI, "../../../frontend/src/components/contratos/afipCompleteness.ts"), "utf8");
        const server = readFileSync(resolve(AQUI, "../services/arca/validarLoteAltas.ts"), "utf8");
        for (const [quien, fuente] of [["afipCompleteness", front], ["validarLoteAltas", server]]) {
            const llamada = fuente.slice(fuente.indexOf("resolverPuesto({"));
            const args = llamada.slice(0, llamada.indexOf("})"));
            for (const clave of ["rol:", "categoria:", "convenio:", "empresa:", "global:"])
                assert.ok(args.includes(clave), `${quien} no pasa «${clave}» a resolverPuesto`);
            assert.ok(args.indexOf("categoria:") < args.indexOf("convenio:") && args.indexOf("convenio:") < args.indexOf("empresa:"), `${quien}: orden de los argumentos`);
        }
        // Y ninguno arma su propia cascada: el import es el de `compartido`.
        assert.match(front, /import \{ resolverPuesto \} from "@compartido\/puestosDesempenados"/);
        assert.match(server, /import \{ resolverPuesto \} from "\.\.\/\.\.\/compartido\/puestosDesempenados\.js"/);
    });
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
        { codigo: "2455", descripcion: "Actores", origen: "arca" },
        { codigo: "5142", descripcion: "Peluqueros", origen: "arca" },
        { codigo: "9001", descripcion: "Puesto propio", origen: "manual" },
        { codigo: "0911", descripcion: "Viejo", origen: "arca" },
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
        const despues = [...existentes.map((e) => ({ ...e, descripcion: p.actualizados.find((a) => a.codigo === e.codigo)?.descripcion ?? e.descripcion })), ...p.nuevos.map((n) => ({ ...n, origen: "arca" }))];
        const otra = planDeImportacionPuestos(despues, filas);
        assert.equal(otra.nuevos.length + otra.actualizados.length, 0);
    });
    it("conserva los ceros a la izquierda", () => {
        assert.deepEqual(planDeImportacionPuestos([], [{ codigo: "911", descripcion: "X" }]).nuevos, [{ codigo: "0911", descripcion: "X" }]);
    });
});

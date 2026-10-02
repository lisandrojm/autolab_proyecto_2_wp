/**
 * El catálogo de ARCA y las categorías: normalización, emparejamiento, estado, diff y la semilla.
 *
 *   npx tsx --test src/compartido/catalogoArca.test.ts   (o `npm run test:catalogo-arca`)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { calcularDiff, emparejarCategorias, estadoCategoria, estadoPermiteAlta, exportarCsvArca, filasCsvArca, grupoDeDescripcion, hashTabla, normalizarNombre, partirDescripcion, } from "./catalogoArca.js";
import { ESPERADO_0634_11 } from "./correccion063411.js";
const AQUI = dirname(fileURLToPath(import.meta.url));
const CSV = readFileSync(resolve(AQUI, "../../../documentation/arca_tablas_simplificacion_registral.csv"), "utf8");
const FILAS = filasCsvArca(CSV);
const CATEGORIAS_CSV = FILAS.filter((f) => f.tabla === "CATEGORIA_CCT");
/** El cruce tal como estaba en la base el 2/10/2026 (nombre, código y grupo; sin datos personales). */
const CRUZADAS = JSON.parse(readFileSync(resolve(AQUI, "fixtures/categorias-0634-11-cruzadas.json"), "utf8")).map((c) => ({ ...c, contratos: 0 }));
describe("normalización y descripción de ARCA", () => {
    it("compara por significado", () => {
        assert.equal(normalizarNombre("Asistente de cámara especializado / Grip"), normalizarNombre("ASISTENTE DE CAMARA ESPECIALIZADO / GRIP - GRUPO 7"));
        assert.equal(normalizarNombre("Téc. de Mant. afectado a Planta Trasmisora"), normalizarNombre("TEC. DE MANT. AFECTADO A PLANTA TRASMISORA - GRUPO 2"));
        assert.equal(normalizarNombre("Secretaria Bilingüe"), "SECRETARIA BILINGUE");
    });
    it("saca el grupo de las dos formas", () => {
        assert.equal(grupoDeDescripcion("PEINADOR - GRUPO 7"), 7);
        assert.deepEqual(partirDescripcion("1ª CATEGORIA - ASISTENTE DE DIRECCION"), { nombre: "ASISTENTE DE DIRECCION", grupo: 1, nombreGrupo: "1ª CATEGORIA" });
        assert.equal(grupoDeDescripcion("TIRA"), null);
    });
});
describe("la semilla (CSV del repo) cumple las reglas", () => {
    it("códigos de 6 dígitos y un solo significado por convenio", () => {
        const vistos = new Map();
        const repetidas = [];
        for (const f of CATEGORIAS_CSV) {
            assert.match(f.codigoPadded, /^\d{6}$/, `${f.filtroPadre} ${f.codigoPadded}`);
            const k = `${f.filtroPadre}|${f.codigoPadded}`;
            if (vistos.has(k)) {
                // Mismo código con OTRA descripción: dos significados para un código. Eso no puede pasar.
                assert.equal(vistos.get(k), f.descripcion, `el código ${k} tiene dos descripciones`);
                repetidas.push(k);
            }
            vistos.set(k, f.descripcion);
        }
        // La única línea repetida idéntica del CSV (por eso 0131/75 tiene 219 filas y 218 categorías).
        // La semilla la deduplica. Si aparece otra, se revisa antes de aceptarla.
        assert.deepEqual(repetidas, ["0131/75|000401"]);
    });
    it("0634/11: 106 categorías, 035283–035388, todas con su GRUPO N", () => {
        const tv = CATEGORIAS_CSV.filter((f) => f.filtroPadre === "0634/11");
        assert.equal(tv.length, 106);
        assert.equal(tv.map((f) => f.codigoPadded).sort()[0], "035283");
        assert.equal(tv.map((f) => f.codigoPadded).sort().at(-1), "035388");
        for (const f of tv)
            assert.ok(grupoDeDescripcion(f.descripcion) != null, f.descripcion);
    });
    it("todo convenio de las categorías está en CONVENIO_CCT", () => {
        const convenios = new Set(FILAS.filter((f) => f.tabla === "CONVENIO_CCT").map((f) => f.codigo));
        for (const f of CATEGORIAS_CSV)
            assert.ok(convenios.has(f.filtroPadre), f.filtroPadre);
    });
});
describe("emparejar el cruce actual del 0634/11", () => {
    const oficiales = CATEGORIAS_CSV.filter((f) => f.filtroPadre === "0634/11").map((f) => ({ codigo: f.codigoPadded, descripcion: f.descripcion }));
    const r = emparejarCategorias(CRUZADAS, oficiales);
    it("da exactamente la tabla verificada contra ARCA", () => {
        const obtenido = r.cambios.map((c) => [c.grupo, c.nombre, c.de, c.a]).sort((a, b) => String(a[2]).localeCompare(String(b[2])));
        const esperado = [...ESPERADO_0634_11].sort((a, b) => a[2].localeCompare(b[2]));
        assert.deepEqual(obtenido, esperado);
    });
    it("no deja nada sin emparejar, ambiguo, de otro grupo ni en colisión", () => {
        assert.deepEqual(r.sinMatch.map((c) => c.nombre), []);
        assert.deepEqual(r.ambiguas, []);
        assert.deepEqual(r.grupoDistinto, []);
        assert.deepEqual(r.colisiones, []);
        assert.equal(r.cambios.length + r.correctas.length, 106);
    });
    it("después: 106 códigos distintos del 035283 al 035388", () => {
        const finales = CRUZADAS.map((c) => r.cambios.find((x) => x.id === c.id)?.a ?? c.codigoArca);
        assert.equal(new Set(finales).size, 106);
        assert.equal([...finales].sort()[0], "035283");
        assert.equal([...finales].sort().at(-1), "035388");
    });
    it("un nombre sin pareja se detiene, no se adivina", () => {
        const rr = emparejarCategorias([{ id: "x", nombre: "Peinadora", convenio: "0634/11", codigoArca: "035350", grupoNumero: 7, contratos: 0 }], oficiales);
        assert.equal(rr.sinMatch.length, 1);
        assert.equal(rr.cambios.length, 0);
    });
    it("mismo nombre en varias categorías de ARCA: el código actual decide si es consistente", () => {
        const of = [
            { codigo: "000212", descripcion: "1ª CATEGORIA - UTILERO" },
            { codigo: "000437", descripcion: "2ª CATEGORIA - UTILERO" },
        ];
        const ok = emparejarCategorias([{ id: "x", nombre: "UTILERO", convenio: "0131/75", codigoArca: "000437", grupoNumero: null, contratos: 0 }], of);
        assert.equal(ok.correctas.length, 1);
        const amb = emparejarCategorias([{ id: "x", nombre: "UTILERO", convenio: "0131/75", codigoArca: "000999", grupoNumero: null, contratos: 0 }], of);
        assert.equal(amb.ambiguas.length, 1);
        assert.equal(amb.cambios.length, 0);
    });
    it("si el grupo de ARCA no coincide, no se cambia", () => {
        const rr = emparejarCategorias([{ id: "x", nombre: "Peinador", convenio: "0634/11", codigoArca: "035352", grupoNumero: 6, contratos: 0 }], oficiales);
        assert.equal(rr.grupoDistinto.length, 1);
        assert.equal(rr.cambios.length, 0);
    });
});
describe("estadoCategoria", () => {
    const fila = { codigo: "035350", descripcion: "PEINADOR - GRUPO 7", vigente: true };
    it("ok / nombre distinto / grupo distinto / no existe / no vigente", () => {
        assert.equal(estadoCategoria({ nombre: "Peinador", grupoNumero: 7, fila }).estado, "ok");
        assert.equal(estadoCategoria({ nombre: "Reflectorista", grupoNumero: 7, fila }).estado, "nombre_distinto");
        assert.equal(estadoCategoria({ nombre: "Peinador", grupoNumero: 6, fila }).estado, "grupo_distinto");
        assert.equal(estadoCategoria({ nombre: "Peinador", grupoNumero: 7, fila: null }).estado, "no_existe_en_arca");
        assert.equal(estadoCategoria({ nombre: "Peinador", grupoNumero: 7, fila: { ...fila, vigente: false } }).estado, "no_vigente");
    });
    it("la confirmación vale solo para la descripción que se confirmó", () => {
        const e = estadoCategoria({ nombre: "Peinadora de época", grupoNumero: 7, fila, confirmacion: { descripcionArca: "PEINADOR - GRUPO 7" } });
        assert.equal(e.estado, "nombre_distinto");
        assert.ok(e.confirmada && estadoPermiteAlta(e));
        const cambio = estadoCategoria({ nombre: "Peinadora de época", grupoNumero: 7, fila: { ...fila, descripcion: "PEINADOR/A - GRUPO 7" }, confirmacion: { descripcionArca: "PEINADOR - GRUPO 7" } });
        assert.ok(!cambio.confirmada && !estadoPermiteAlta(cambio));
    });
});
describe("calcularDiff", () => {
    const f = (codigo, descripcion, filtroPadre = "0634/11") => ({ tabla: "categoria", filtroPadre, codigo, descripcion });
    it("nuevos, dejaron de publicarse y descripción cambiada", () => {
        const d = calcularDiff([f("1", "A"), f("2", "B"), f("3", "C")], [f("1", "A"), f("2", "B  bis"), f("4", "D")], ["categoria"]);
        assert.deepEqual(d.nuevos.map((x) => x.codigo), ["4"]);
        assert.deepEqual(d.dejaronDePublicarse.map((x) => x.codigo), ["3"]);
        assert.deepEqual(d.descripcionCambiada.map((x) => x.codigo), ["2"]);
    });
    it("el espaciado no es un cambio", () => {
        assert.equal(calcularDiff([f("1", "A  B")], [f("1", " A B ")], ["categoria"]).descripcionCambiada.length, 0);
    });
    it("una tabla no leída, o un convenio que la empleadora no ve, no se da de baja", () => {
        assert.equal(calcularDiff([f("1", "A")], [], []).dejaronDePublicarse.length, 0);
        assert.equal(calcularDiff([f("1", "A", "0131/75")], [f("2", "B")], ["categoria"], { categoria: ["0634/11"] }).dejaronDePublicarse.length, 0);
    });
    it("el hash no depende del orden ni del espaciado", () => {
        assert.equal(hashTabla([f("1", "A B"), f("2", "C")]), hashTabla([f("2", "C"), f("1", "A  B")]));
        assert.notEqual(hashTabla([f("1", "A")]), hashTabla([f("1", "B")]));
    });
});
describe("export del CSV", () => {
    it("semilla → export reproduce el CSV del repo byte a byte (sin la línea duplicada)", () => {
        const vistas = new Set();
        const unicas = FILAS.filter((f) => {
            const k = `${f.tabla}|${f.filtroPadre}|${f.codigo}`;
            if (vistas.has(k))
                return false;
            vistas.add(k);
            return true;
        });
        const lineas = CSV.split("\r\n");
        // La línea repetida del 0131/75 (000401) se saca una vez: el espejo no puede tener dos filas iguales.
        const i = lineas.lastIndexOf(lineas.find((l) => l.includes('"000401"') && l.includes("0131/75")));
        const sinDuplicada = [...lineas.slice(0, i), ...lineas.slice(i + 1)].join("\r\n");
        assert.equal(exportarCsvArca(unicas), sinDuplicada);
    });
});

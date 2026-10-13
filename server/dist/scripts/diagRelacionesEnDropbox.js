import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { getTenantDropboxConfig, listFolder, downloadFileContent } from "../services/dropboxService.js";
/**
 * SÓLO LECTURA. Muestra qué TXT de la consulta de relaciones laborales de ARCA hay en Dropbox
 * (/WEPRODU/ARCA/Contratos/<Empresa>/<cuit>_inicio_YYYY-MM.txt) y cómo están armados: la fila de
 * encabezado, dónde empieza cada columna, cuántas filas alinean con el encabezado, cuántas tienen
 * FECHA DE FIN vacía y si hay dos filas con la misma terna (CUIL, empleadora, fecha de inicio).
 * Es lo que se usó para escribir y verificar el parser `compartido/arca/relacionesLaboralesTxt.ts`
 * contra datos reales.
 *
 * Uso (desde server/):
 *   TENANT_SLUG=demo-tenant dotenv -e .env.production -- tsx src/scripts/diagRelacionesEnDropbox.ts
 *   ARCHIVO=30710295839_inicio_2021-03.txt ...  → analiza ese archivo (por nombre) y muestra filas
 *   TODOS=1 ...                                   → recorre todos los archivos (sin mostrar filas)
 *   BUSCAR=27204809696 ...                        → además imprime las filas crudas con ese texto
 */
const RAIZ = process.env.CARPETA || "/WEPRODU/ARCA/Contratos";
const BUSCAR = (process.env.BUSCAR || "").trim();
const ARCHIVO = (process.env.ARCHIVO || "").trim();
const TODOS = process.env.TODOS === "1";
/*
  CÓMO VIENEN LOS BYTES. El archivo es UTF-8, pero con secuencias rotas: «TELEVISIÓN» llega como
  C3 1D (la Ó perdió su segundo byte) y «3ª» como EF BF BD (ya era U+FFFD cuando ARCA lo escribió).
  El ancho fijo está en CARACTERES del texto original: si se decodifica como latin-1 cada acento
  corre las columnas un lugar, y un decodificador UTF-8 estándar emite dos caracteres por la Ó rota.
  Este decodificador consume los bytes que el byte inicial anuncia aunque la continuación sea
  inválida, y emite un solo U+FFFD: así cada carácter original sigue ocupando un lugar.
*/
function decodificarUtf8Tolerante(buf) {
    let out = "";
    for (let i = 0; i < buf.length;) {
        const b = buf[i];
        const largo = b < 0x80 ? 1 : b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
        if (largo === 1) {
            out += b < 0x80 ? String.fromCharCode(b) : "\uFFFD";
            i += 1;
            continue;
        }
        const trozo = buf.subarray(i, i + largo);
        let valido = trozo.length === largo;
        for (let k = 1; valido && k < largo; k++)
            if ((trozo[k] & 0xc0) !== 0x80)
                valido = false;
        out += valido ? trozo.toString("utf8") : "\uFFFD";
        i += largo;
    }
    return out;
}
const ROTULOS = ["CUIL", "APELLIDO Y NOMBRE", "OBRA SOCIAL", "MODAL. CONTRATO", "ACTIVIDAD LABORAL", "PUESTO DESEMP.", "RETRIB. PACTADA", "MOD. LIQ.", "TRAB. AGROP.", "FECHA INICIO", "FECHA DE FIN", "SITUACION De BAJA", "CONVENIO COLECTIVO", "CATEGORIA", "TIPO SERVICIO"];
function analizar(nombre, buf, mostrar) {
    const texto = decodificarUtf8Tolerante(buf);
    const lineas = texto.split(/\r?\n/);
    const header = lineas.find((l) => l.startsWith("CUIL")) || "";
    const columnas = ROTULOS.map((r) => ({ rotulo: r, desde: header.indexOf(r) }));
    const inicio = columnas.find((c) => c.rotulo === "FECHA INICIO").desde;
    const fin = columnas.find((c) => c.rotulo === "FECHA DE FIN").desde;
    const filas = lineas.filter((l) => l.trim() && !l.startsWith("CUIL"));
    // Desalineada = la fecha de inicio no está donde dice el encabezado. El largo no importa: la última
    // fila de cada página viene sin el relleno final (977 caracteres en vez de 1020).
    const desalineadas = filas.filter((l) => !/^\d{2}\/\d{2}\/\d{4}$/.test(l.slice(inicio, inicio + 10)));
    const finVacia = filas.filter((l) => !l.slice(fin, fin + 12).trim());
    const sinRelleno = filas.filter((l) => l.length !== header.length).length;
    const ternas = new Map();
    for (const l of filas) {
        const k = `${l.slice(0, 11)}|${l.slice(inicio, inicio + 10)}`;
        if (!ternas.has(k))
            ternas.set(k, new Set());
        ternas.get(k).add(l); // la línea entera: dos iguales son la misma página repetida, no dos relaciones
    }
    const ternasRepetidas = [...ternas.entries()].filter(([, set]) => set.size > 1).map(([k]) => k);
    // Clave extendida (terna + modalidad + puesto): ¿cuántas colisiones quedan y en qué difieren?
    const col = (l, r) => { const c = columnas.find((x) => x.rotulo === r); const sig = columnas[columnas.indexOf(c) + 1]; return l.slice(c.desde, sig ? sig.desde : undefined).trim(); };
    const clavesExt = new Map();
    for (const l of filas) {
        const k = `${l.slice(0, 11)}|${l.slice(inicio, inicio + 10)}|${col(l, "MODAL. CONTRATO")}|${col(l, "PUESTO DESEMP.")}`;
        if (!clavesExt.has(k))
            clavesExt.set(k, new Set());
        clavesExt.get(k).add(`fin=${col(l, "FECHA DE FIN")} retrib=${col(l, "RETRIB. PACTADA")} baja=${col(l, "SITUACION De BAJA").slice(0, 30)}`);
    }
    const clavesExtRepetidas = [...clavesExt.entries()].filter(([, set]) => set.size > 1).map(([k, set]) => `${k.split("|").slice(0, 2).join("|")} → ${[...set].join(" // ")}`);
    const r = { archivo: nombre, bytes: buf.length, lineas: lineas.length, encabezados: lineas.filter((l) => l.startsWith("CUIL")).length, filas: filas.length, desalineadas: desalineadas.length, finVacia: finVacia.length, sinRelleno, ternasRepetidas, clavesExtRepetidas };
    if (mostrar) {
        console.log(`\nMuestra: ${nombre} · ${buf.length} bytes · ${lineas.length} líneas · CRLF=${texto.includes("\r\n")} · encabezados=${r.encabezados} · filas=${r.filas} · desalineadas=${r.desalineadas} · fin vacía=${r.finVacia}`);
        console.log(`Encabezado: ${header.length} chars. Columnas: ${columnas.map((c) => `${c.rotulo}@${c.desde}`).join(" | ")}`);
        const largos = new Map();
        for (const l of filas)
            largos.set(l.length, (largos.get(l.length) || 0) + 1);
        console.log("Largos de fila (largo×cantidad):", [...largos.entries()].sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l}×${n}`).join(", "));
        console.log("\nPrimeras 2 filas:");
        for (const l of filas.slice(0, 2))
            console.log(JSON.stringify(l));
        if (desalineadas[0])
            console.log(`\nDesalineada:\n${JSON.stringify(desalineadas[0])}`);
        if (finVacia[0])
            console.log(`\nCon FECHA DE FIN vacía:\n${JSON.stringify(finVacia[0])}`);
        if (ternasRepetidas.length) {
            console.log(`\nTernas repetidas con contenido distinto (${ternasRepetidas.length}):`);
            for (const k of ternasRepetidas.slice(0, 3))
                for (const l of ternas.get(k))
                    console.log(JSON.stringify(l));
        }
        if (BUSCAR) {
            console.log(`\nFilas con «${BUSCAR}»:`);
            for (const l of filas)
                if (l.includes(BUSCAR))
                    console.log(JSON.stringify(l));
        }
    }
    return r;
}
async function main() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    const slug = process.env.TENANT_SLUG?.trim();
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    if (!slug)
        throw new Error("Falta TENANT_SLUG=<slug>.");
    await mongoose.connect(uri, { dbName });
    const tenant = await Tenant.findOne({ slug }).lean();
    if (!tenant)
        throw new Error(`No existe el tenant ${slug}.`);
    const cfg = getTenantDropboxConfig(tenant);
    if (!cfg)
        throw new Error("El tenant no tiene Dropbox conectado.");
    const tid = String(tenant._id);
    const { entries: carpetas } = await listFolder(tid, cfg, RAIZ, true);
    console.log(`${RAIZ}: ${carpetas.length} entradas`);
    const archivos = [];
    for (const c of carpetas) {
        if (c.tag !== "folder") {
            console.log(`  [archivo suelto] ${c.name}`);
            continue;
        }
        const { entries } = await listFolder(tid, cfg, c.path, true);
        const txt = entries.filter((e) => e.tag === "file" && /\.txt$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name));
        const sub = entries.filter((e) => e.tag === "folder").map((e) => e.name);
        console.log(`  ${c.name}/ → ${txt.length} txt${sub.length ? ` · subcarpetas (se ignoran): ${sub.join(", ")}` : ""}`);
        for (const t of txt)
            archivos.push({ carpeta: c.name, name: t.name, path: t.path, size: t.size });
    }
    if (!archivos.length) {
        console.log("No hay TXT para mirar.");
        return;
    }
    if (TODOS) {
        const resumenes = [];
        const cuilsPorEmpresa = new Map();
        for (const a of archivos) {
            const buf = await downloadFileContent(tid, cfg, a.path);
            const r = analizar(`${a.carpeta}/${a.name}`, buf, false);
            resumenes.push(r);
            const cuit = a.name.split("_")[0];
            if (!cuilsPorEmpresa.has(cuit))
                cuilsPorEmpresa.set(cuit, new Set());
            for (const l of decodificarUtf8Tolerante(buf).split(/\r?\n/))
                if (/^\d{11} /.test(l))
                    cuilsPorEmpresa.get(cuit).add(l.slice(0, 11));
        }
        const tot = (f) => resumenes.reduce((s, r) => s + f(r), 0);
        console.log(`\n${resumenes.length} archivos · ${tot((r) => r.filas)} filas · ${tot((r) => r.encabezados)} encabezados · ${tot((r) => r.desalineadas)} desalineadas · ${tot((r) => r.sinRelleno)} sin relleno final · ${tot((r) => r.finVacia)} con fin vacía · ${tot((r) => r.ternasRepetidas.length)} ternas repetidas con contenido distinto · ${tot((r) => r.clavesExtRepetidas.length)} repetidas aun con modalidad+puesto`);
        for (const r of resumenes)
            for (const k of r.clavesExtRepetidas)
                console.log(`  [clave ext] ${r.archivo.split("/")[1]}: ${k}`);
        for (const [cuit, s] of cuilsPorEmpresa)
            console.log(`  ${cuit}: ${s.size} CUIL distintos`);
        for (const r of resumenes.filter((r) => r.desalineadas || r.ternasRepetidas.length || r.encabezados > 1))
            console.log(`  ${r.archivo}: filas=${r.filas} encabezados=${r.encabezados} desalineadas=${r.desalineadas} fin vacía=${r.finVacia} ternas repetidas=${r.ternasRepetidas.join(" ")}`);
        return;
    }
    const elegido = ARCHIVO ? archivos.find((a) => a.name.toLowerCase() === ARCHIVO.toLowerCase()) : archivos[0];
    if (!elegido)
        throw new Error(`No encontré ${ARCHIVO}.`);
    analizar(elegido.name, await downloadFileContent(tid, cfg, elegido.path), true);
}
main()
    .then(() => mongoose.disconnect())
    .catch(async (e) => {
    console.error(e?.message || e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});

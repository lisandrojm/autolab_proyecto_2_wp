import fs from "fs";
import mongoose from "mongoose";
/**
 * Mueve el código de sucursal de ARCA desde el catálogo global de Sedes hacia la registración por
 * empresa (`companies.sedes[]`).
 *
 * Por qué: la Sede es un lugar físico y la comparten proyectos, personas y contratos. El código de
 * sucursal, en cambio, sale del padrón de CADA CUIT — el mismo domicilio declarado por dos
 * empleadoras tiene códigos distintos. Mientras vivió en `infos.data.codigoSucursal` no había forma
 * de tener más de una empleadora sin que los códigos colisionaran.
 *
 * Qué hace: por cada Info de type "sede" con `data.codigoSucursal` cargado, crea (o actualiza) la
 * entrada correspondiente en `companies.sedes[]` de la empresa destino.
 *
 * Si además se le pasa CSV=..., toma de ahí las actividades declaradas para cada sucursal (filas
 * ACTIVIDAD_DOMICILIO, donde `filtro_padre` es el código de sucursal) y las carga. Ojo: ese CSV es
 * POR EMPRESA — los códigos de sucursal y actividad salen del padrón de cada CUIT, así que hay que
 * volver a extraerlo logueado como cada empleadora. Sin CSV las actividades quedan vacías y se
 * cargan a mano desde el ABM de Empresas.
 *
 * NO borra `data.codigoSucursal` de las sedes. El campo queda como respaldo por si hay que revisar
 * la migración; la app deja de leerlo. Para limpiarlo después, correr con LIMPIAR_SEDES=true.
 *
 * Uso (desde server/):
 *   DRY_RUN=true EMPRESA_CUIT=30710295839 \
 *     CSV=../documentation/arca_tablas_simplificacion_registral.csv \
 *     CREAR_SEDES="00001:Zapiola,00004:Valdenegro" \
 *     MAPEO="00002:4,00003:3" \
 *     ./node_modules/.bin/dotenv -e .env.production -- \
 *     ./node_modules/.bin/tsx src/scripts/migrarSucursalesAEmpresa.ts
 *
 *   (sin DRY_RUN=true escribe de verdad; EMPRESA_RAZON_SOCIAL sirve como alternativa al CUIT)
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const LIMPIAR_SEDES = process.env.LIMPIAR_SEDES === "true";
const EMPRESA_CUIT = (process.env.EMPRESA_CUIT || "").replace(/\D/g, "");
const EMPRESA_RAZON_SOCIAL = process.env.EMPRESA_RAZON_SOCIAL || "";
const CSV_PATH = process.env.CSV || "";
/**
 * Mapeo explícito `codigoSucursal:sedeId` separado por comas, ej. MAPEO="00002:4,00003:3".
 *
 * Hace falta porque el catálogo de Sedes y el padrón de ARCA no comparten ninguna clave: las sedes
 * tienen nombres de uso interno ("Tronador", "La corte") y el padrón tiene domicilios ("TRONADOR 671
 * Cod. Postal 1427"). Adivinar el match por nombre sería exactamente el tipo de error silencioso que
 * este cambio vino a eliminar, así que la correspondencia la decide una persona.
 */
const MAPEO = process.env.MAPEO || "";
/**
 * Sucursales del padrón que TODAVÍA no existen como Sede: `codigoSucursal:Nombre`, separadas por
 * comas, ej. CREAR_SEDES="00001:Zapiola,00004:Valdenegro".
 *
 * Crea la sede en el catálogo global y la registra en la empresa de una, para que sede y sucursal
 * queden siendo la misma cosa desde el principio. El nombre lo elige quien corre el script: el
 * padrón trae el domicilio completo ("ZAPIOLA 392 Cod. Postal 1426, ...") y las sedes del sistema
 * usan nombres cortos ("Tronador", "Huidobro").
 */
const CREAR_SEDES = process.env.CREAR_SEDES || "";
/** Parsea CREAR_SEDES="00001:Zapiola,00004:Valdenegro" → Map(codigoSucursal → nombre). */
function leerSedesACrear(raw) {
    const out = new Map();
    for (const par of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
        const i = par.indexOf(":");
        if (i <= 0)
            throw new Error(`CREAR_SEDES mal formado en "${par}". Se espera codigoSucursal:Nombre, ej. 00001:Zapiola`);
        const codigo = par.slice(0, i).trim();
        const nombre = par.slice(i + 1).trim();
        if (!codigo || !nombre)
            throw new Error(`CREAR_SEDES mal formado en "${par}". Se espera codigoSucursal:Nombre, ej. 00001:Zapiola`);
        out.set(codigo, nombre);
    }
    return out;
}
/** Parsea MAPEO="00002:4,00003:3" → Map(codigoSucursal → sedeId). */
function leerMapeo(raw) {
    const out = new Map();
    for (const par of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
        const [codigo, sedeId] = par.split(":").map((s) => s.trim());
        if (!codigo || !sedeId)
            throw new Error(`MAPEO mal formado en "${par}". Se espera codigoSucursal:sedeId, ej. 00002:4`);
        const id = Number(sedeId);
        if (!Number.isFinite(id))
            throw new Error(`MAPEO: "${sedeId}" no es un data.id de sede válido`);
        out.set(codigo, id);
    }
    return out;
}
/** Igual que en seedTablasArca.ts: las descripciones traen comas y comillas dobladas. */
function parseCsv(texto) {
    const filas = [];
    let campo = "";
    let fila = [];
    let enComillas = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (enComillas) {
            if (c === '"') {
                if (texto[i + 1] === '"') {
                    campo += '"';
                    i++;
                }
                else
                    enComillas = false;
            }
            else
                campo += c;
            continue;
        }
        if (c === '"')
            enComillas = true;
        else if (c === ",") {
            fila.push(campo);
            campo = "";
        }
        else if (c === "\n") {
            fila.push(campo);
            filas.push(fila);
            fila = [];
            campo = "";
        }
        else if (c !== "\r")
            campo += c;
    }
    if (campo !== "" || fila.length > 0) {
        fila.push(campo);
        filas.push(fila);
    }
    return filas;
}
/** Lee del CSV las actividades declaradas por sucursal: código de sucursal → [{codigo, descripcion}]. */
function leerActividades(ruta) {
    const filas = parseCsv(fs.readFileSync(ruta, "utf-8").replace(/^﻿/, ""));
    const enc = filas.shift();
    if (!enc)
        throw new Error("El CSV está vacío");
    const idx = (n) => {
        const i = enc.indexOf(n);
        if (i < 0)
            throw new Error(`Al CSV le falta la columna "${n}"`);
        return i;
    };
    const iTabla = idx("tabla");
    const iPadded = idx("codigo_padded");
    const iDesc = idx("descripcion");
    const iPadre = idx("filtro_padre");
    const out = new Map();
    for (const f of filas) {
        if (f[iTabla] !== "ACTIVIDAD_DOMICILIO")
            continue;
        const sucursal = String(f[iPadre] || "").trim();
        const codigo = String(f[iPadded] || "").trim();
        if (!sucursal || !codigo)
            continue;
        const lista = out.get(sucursal) || [];
        // Una misma sucursal puede tener varias actividades (es el caso que motivó todo esto).
        if (!lista.some((a) => a.codigo === codigo))
            lista.push({ codigo, descripcion: String(f[iDesc] || "").trim() });
        out.set(sucursal, lista);
    }
    return out;
}
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    if (!EMPRESA_CUIT && !EMPRESA_RAZON_SOCIAL) {
        throw new Error("Falta indicar la empresa destino: EMPRESA_CUIT=... o EMPRESA_RAZON_SOCIAL=...");
    }
    if (CSV_PATH && !fs.existsSync(CSV_PATH))
        throw new Error(`No existe el CSV: ${CSV_PATH}`);
    const actividadesPorSucursal = CSV_PATH ? leerActividades(CSV_PATH) : new Map();
    await mongoose.connect(uri, { dbName });
    const db = mongoose.connection.db;
    if (!db)
        throw new Error("No se pudo establecer la conexión");
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);
    // La empresa se busca por CUIT normalizado (en la base puede estar con o sin guiones).
    const empresas = await db.collection("companies").find({}).toArray();
    const empresa = EMPRESA_CUIT ? empresas.find((e) => String(e.cuit || "").replace(/\D/g, "") === EMPRESA_CUIT) : empresas.find((e) => String(e.razonSocial || "").trim().toLowerCase() === EMPRESA_RAZON_SOCIAL.trim().toLowerCase());
    if (!empresa) {
        throw new Error(`No se encontró la empresa destino (${EMPRESA_CUIT || EMPRESA_RAZON_SOCIAL}). Empresas disponibles: ${empresas.map((e) => `${e.razonSocial} [${e.cuit || "sin CUIT"}]`).join(", ") || "ninguna"}`);
    }
    console.log(`Empresa destino: ${empresa.razonSocial} [${empresa.cuit || "sin CUIT"}]\n`);
    const sedes = (await db.collection("infos").find({ type: "sede" }).toArray());
    const porSedeIdCatalogo = new Map(sedes.map((s) => [Number(s.data?.id), s]));
    // Tres orígenes posibles para el par (sede, código de sucursal):
    //   1) el legado: sedes que ya tenían `data.codigoSucursal` cargado;
    //   2) MAPEO: la correspondencia con una sede existente, indicada por una persona;
    //   3) CREAR_SEDES: la sucursal todavía no existe como sede, así que se crea acá mismo.
    // Lo explícito gana sobre el legado, porque es lo que alguien revisó.
    const mapeo = leerMapeo(MAPEO);
    const aCrear = leerSedesACrear(CREAR_SEDES);
    const pares = [];
    for (const sede of sedes) {
        const codigo = String(sede.data?.codigoSucursal || "").trim();
        const sedeId = Number(sede.data?.id);
        if (!codigo || !Number.isFinite(sedeId))
            continue;
        pares.push({ sedeId, codigo, origen: "legado" });
    }
    for (const [codigo, sedeId] of mapeo) {
        if (!porSedeIdCatalogo.has(sedeId)) {
            throw new Error(`MAPEO: no existe ninguna sede con data.id=${sedeId}. Sedes disponibles: ${sedes.map((s) => `${s.data?.id}=${s.name}`).join(", ")}`);
        }
        const i = pares.findIndex((p) => p.sedeId === sedeId);
        if (i >= 0)
            pares[i] = { sedeId, codigo, origen: "mapeo" };
        else
            pares.push({ sedeId, codigo, origen: "mapeo" });
    }
    // Sedes nuevas. Mismo criterio que el ABM (`POST /info/sede`): `data.id` incremental y externalId
    // "local:N", para no chocar con los que trae la sincronización de FRAME.
    if (aCrear.size > 0) {
        let proximoId = sedes.reduce((max, s) => Math.max(max, Number(s.data?.id) || 0), 0);
        for (const [codigo, nombre] of aCrear) {
            const yaExiste = sedes.find((s) => String(s.name || "").trim().toLowerCase() === nombre.toLowerCase());
            if (yaExiste) {
                // Si ya la creaste a mano (o el script se corre dos veces), se usa esa en vez de duplicarla.
                const sedeId = Number(yaExiste.data?.id);
                console.log(`- Sede "${nombre}": ya existía (id ${sedeId}), se reutiliza para la sucursal ${codigo}.`);
                const i = pares.findIndex((p) => p.sedeId === sedeId);
                if (i >= 0)
                    pares[i] = { sedeId, codigo, origen: "mapeo" };
                else
                    pares.push({ sedeId, codigo, origen: "mapeo" });
                continue;
            }
            proximoId += 1;
            const sedeId = proximoId;
            const doc = { type: "sede", name: nombre, externalId: `local:${sedeId}`, data: { id: sedeId, nombre } };
            console.log(`- Sede "${nombre}": se crea con id ${sedeId} para la sucursal ${codigo}.`);
            if (!DRY_RUN)
                await db.collection("infos").insertOne({ ...doc, createdAt: new Date(), updatedAt: new Date() });
            porSedeIdCatalogo.set(sedeId, doc);
            sedes.push(doc);
            pares.push({ sedeId, codigo, origen: "creada" });
        }
    }
    if (pares.length === 0) {
        console.log("No hay nada para migrar: ninguna sede tiene codigoSucursal cargado y no se pasó MAPEO.");
        console.log("\nSedes del catálogo (data.id = nombre):");
        for (const s of sedes)
            console.log(`  ${s.data?.id} = ${s.name}`);
        if (actividadesPorSucursal.size > 0) {
            console.log("\nSucursales del padrón que trae el CSV:");
            for (const [codigo, acts] of actividadesPorSucursal)
                console.log(`  ${codigo} → ${acts.map((a) => a.codigo).join(", ")}`);
        }
        console.log('\nPasá la correspondencia con MAPEO="codigoSucursal:sedeId,...", ej. MAPEO="00002:4,00003:3".');
        console.log('Para las sucursales que todavía no existen como sede: CREAR_SEDES="codigoSucursal:Nombre,...", ej. CREAR_SEDES="00001:Zapiola".\n');
        await mongoose.disconnect();
        return;
    }
    // Se preservan las registraciones que ya existan (por si el script se corre dos veces): solo se
    // completa el código de sucursal y nunca se pisan las actividades ya cargadas a mano.
    const actuales = Array.isArray(empresa.sedes) ? empresa.sedes : [];
    const porSedeId = new Map(actuales.map((s) => [Number(s.sedeId), s]));
    let nuevas = 0;
    let actualizadas = 0;
    let sinCambios = 0;
    for (const { sedeId, codigo, origen } of pares) {
        const sede = porSedeIdCatalogo.get(sedeId);
        const existente = porSedeId.get(sedeId);
        const etiqueta = `${sede?.name || sede?.data?.nombre || `sede ${sedeId}`} (id ${sedeId}, ${origen})`;
        // Las actividades del CSV solo se aplican si la registración todavía no tiene ninguna: lo
        // cargado a mano desde el ABM manda, para que volver a correr el script no lo pise.
        const delCsv = actividadesPorSucursal.get(codigo) || [];
        if (!existente) {
            porSedeId.set(sedeId, { sedeId, codigoSucursal: codigo, actividades: delCsv });
            nuevas++;
            console.log(`- ${etiqueta}: nueva registración con código ${codigo}${delCsv.length ? ` y ${delCsv.length} actividad(es): ${delCsv.map((a) => a.codigo).join(", ")}` : " (sin actividades)"}.`);
        }
        else if (existente.codigoSucursal !== codigo || (existente.actividades.length === 0 && delCsv.length > 0)) {
            if (existente.codigoSucursal !== codigo)
                console.log(`- ${etiqueta}: ya registrada con ${existente.codigoSucursal || "(vacío)"} → se actualiza a ${codigo}.`);
            if (existente.actividades.length === 0 && delCsv.length > 0)
                console.log(`- ${etiqueta}: se cargan ${delCsv.length} actividad(es) del CSV: ${delCsv.map((a) => a.codigo).join(", ")}.`);
            existente.codigoSucursal = codigo;
            if (existente.actividades.length === 0)
                existente.actividades = delCsv;
            actualizadas++;
        }
        else {
            sinCambios++;
            console.log(`- ${etiqueta}: ya estaba con el código ${codigo} y ${existente.actividades.length} actividad(es), sin cambios.`);
        }
    }
    if (CSV_PATH) {
        // Sucursales del padrón que no matchearon con ninguna sede: o falta crear la sede, o su código
        // todavía no está cargado. Sin avisar, sus actividades se perderían en silencio.
        const usadas = new Set(Array.from(porSedeId.values()).map((s) => s.codigoSucursal));
        const huerfanas = Array.from(actividadesPorSucursal.keys()).filter((c) => !usadas.has(c));
        if (huerfanas.length > 0) {
            console.log(`\n⚠ El CSV trae actividades para ${huerfanas.length} sucursal(es) sin sede asociada: ${huerfanas.join(", ")}. Creá esas sedes (o cargales el código) y volvé a correr.`);
        }
    }
    const resultado = Array.from(porSedeId.values()).sort((a, b) => a.codigoSucursal.localeCompare(b.codigoSucursal));
    console.log(`\nResumen: ${nuevas} nueva(s), ${actualizadas} actualizada(s), ${sinCambios} sin cambios. Total en la empresa: ${resultado.length}.`);
    if (DRY_RUN) {
        console.log("\nDRY RUN: no se escribió nada. Quedaría así:");
        console.log(JSON.stringify(resultado, null, 2));
        await mongoose.disconnect();
        return;
    }
    await db.collection("companies").updateOne({ _id: empresa._id }, { $set: { sedes: resultado } });
    console.log("\nRegistraciones guardadas en la empresa.");
    if (LIMPIAR_SEDES) {
        const res = await db.collection("infos").updateMany({ type: "sede", "data.codigoSucursal": { $exists: true } }, { $unset: { "data.codigoSucursal": "" } });
        console.log(`Limpieza: se quitó data.codigoSucursal de ${res.modifiedCount} sede(s).`);
    }
    else {
        console.log("El campo data.codigoSucursal de las sedes se dejó como está (correr con LIMPIAR_SEDES=true para borrarlo).");
    }
    await mongoose.disconnect();
    console.log("\nListo.\n");
}
run().catch(async (err) => {
    console.error("Error:", err);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});

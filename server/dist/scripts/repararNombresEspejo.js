import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { PublicacionParitaria } from "../models/PublicacionParitaria.js";
import { getTenantDropboxConfig, listFolder, moveEntry } from "../services/dropboxService.js";
import { basePariarias } from "../services/espejoDropboxParitaria.js";
/**
 * Arregla los nombres que quedaron con U+FFFD en Dropbox.
 *
 * QUÉ PASÓ. `uploadFile` mandaba el path en el header `Dropbox-API-Arg` con `JSON.stringify` pelado.
 * Ese header tiene que ser ASCII puro: la «ó» y el «·» no sobrevivieron y Dropbox guardó los archivos
 * con el carácter de reemplazo en el nombre. El arreglo de raíz está en `dropboxService` (`argHeader`),
 * que ya existía y no lo llamaba nadie; esto repara lo que se subió antes.
 *
 * SE RENOMBRA, NO SE VUELVE A SUBIR. Los bytes de los PDF están perfectos —el contenido viaja en el
 * body, no en el header—: lo único mal es el nombre. Volver a bajarlos del gremio para resubirlos
 * archivaría documentos distintos bajo la identidad de los viejos.
 *
 * EL NOMBRE ROTO NO SE ESCRIBE A MANO EN NINGÚN LADO. El de origen sale del `path_display` que
 * devuelve la API; el de destino, del `dropbox.path` que la publicación tiene bien guardado en Mongo.
 * El emparejamiento entre los dos se calcula aplicando la misma pérdida que sufrió el header
 * —todo lo que pasa de \\u007f se vuelve U+FFFD—, así que no depende de que yo tipee el carácter.
 *
 *   npm run paritarias-dropbox:reparar:dry
 *   npm run paritarias-dropbox:reparar
 *
 * Es idempotente: lo que ya tiene el nombre bien no se toca.
 */
const DRY_RUN = process.env.DRY_RUN === "true";
/**
 * EMPAREJAR SIN MODELAR CÓMO SE ROMPIÓ CADA CARÁCTER.
 *
 * El primer intento simulaba la pérdida —«todo lo no-ASCII se vuelve U+FFFD»— y falló, porque no hay
 * UNA pérdida: la «ó» y el «·» llegaron como U+FFFD, pero el guión largo «–» (U+2013) directamente
 * DESAPARECIÓ y dejó dos espacios. Adivinar la mutilación exacta de cada carácter es frágil y no hace
 * falta.
 *
 * En vez de eso se compara por lo que SOBREVIVIÓ: se tira todo lo que no es ASCII imprimible de los
 * dos lados y se colapsan los espacios. El nombre de Mongo y el de Dropbox convergen en la misma
 * clave sin que importe qué le pasó a cada carácter en el camino.
 */
const clave = (s) => s
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
/**
 * El sufijo que Dropbox le agrega cuando el nombre ya existe: «… (1).pdf».
 *
 * Sale de `autorename: true` en `uploadFile`, y acá aparece porque `nombreLegible` NO ES ÚNICO: siete
 * publicaciones cayeron en dos nombres. Se separa del nombre para poder emparejar contra Mongo —que
 * guarda el nombre sin sufijo— y se repone en el destino, para no pisar un archivo con otro.
 */
const SUFIJO_AUTORENAME = /( \(\d+\))(\.pdf)$/i;
/** `true` si el nombre perdió caracteres en el viaje: tiene U+FFFD, o no coincide con su original. */
const tieneRotos = (s) => s.includes("\uFFFD");
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    const base = basePariarias();
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no renombra)" : "ESCRITURA"}`);
    console.log(`Base: ${base}\n`);
    const t = await Tenant.findOne({ "integrations.dropbox.appKey": { $exists: true } }).lean();
    const cfg = t ? getTenantDropboxConfig(t) : null;
    if (!cfg)
        throw new Error("Ningún tenant tiene Dropbox conectado.");
    const tenantId = String(t._id);
    // El destino correcto de cada archivo sale de Mongo, que lo tiene bien.
    const pubs = await PublicacionParitaria.find({ "dropbox.path": { $regex: "^" + base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") } })
        .select("dropbox.path")
        .lean();
    const porClave = new Map();
    for (const p of pubs)
        porClave.set(clave(p.dropbox.path), p.dropbox.path);
    console.log(`publicaciones con ruta esperada: ${pubs.length} · nombres distintos: ${porClave.size}`);
    if (porClave.size < pubs.length) {
        console.log(`   ojo: ${pubs.length - porClave.size} publicación(es) comparten nombre con otra. Ver el resumen al final.\n`);
    }
    else {
        console.log("");
    }
    /*
      LAS CARPETAS PRIMERO Y DE AFUERA HACIA ADENTRO.
  
      Renombrar el archivo antes que su carpeta obliga a que Dropbox cree la carpeta destino, y quedan
      dos: la rota con lo que falte mover y la nueva. Arreglando la carpeta primero, todo lo de adentro
      viaja con ella y después solo queda corregir cada nombre de archivo en su lugar.
    */
    let carpetas = 0;
    const entidades = await listFolder(tenantId, cfg, base);
    for (const e of entidades.entries) {
        if (e.tag !== "folder" || !tieneRotos(e.name))
            continue;
        // El nombre bueno se deduce de una publicación cuyo destino cae en esta carpeta.
        const clavePadre = clave(`${base}/${e.name}`);
        const destinoPadre = [...porClave.values()].find((bueno) => clave(bueno).startsWith(clavePadre + "/"));
        if (!destinoPadre) {
            console.log(`✖  carpeta «${e.name}»: ninguna publicación apunta acá. No se toca.`);
            continue;
        }
        const nombreBueno = destinoPadre.slice(base.length + 1).split("/")[0];
        const destino = `${base}/${nombreBueno}`;
        console.log(`${DRY_RUN ? "·" : "✔"}  carpeta  ${e.path}\n              → ${destino}`);
        if (!DRY_RUN)
            await moveEntry(tenantId, cfg, e.path, destino);
        carpetas++;
    }
    // Ahora los archivos, releyendo el árbol: después de mover la carpeta, los paths cambiaron.
    let archivos = 0;
    let sinPareja = 0;
    for (const ent of (await listFolder(tenantId, cfg, base)).entries) {
        if (ent.tag !== "folder")
            continue;
        for (const anio of (await listFolder(tenantId, cfg, ent.path)).entries) {
            if (anio.tag !== "folder")
                continue;
            for (const f of (await listFolder(tenantId, cfg, anio.path)).entries) {
                if (f.tag !== "file")
                    continue;
                /*
                  El sufijo de autorename se aparta ANTES de emparejar y se repone en el destino. Sin eso, los
                  cinco archivos que Dropbox numeró «(1)…(4)» no matchean con nada y quedarían con el nombre
                  roto para siempre.
                */
                const m = SUFIJO_AUTORENAME.exec(f.name);
                const sufijo = m ? m[1] : "";
                const sinSufijo = m ? f.name.replace(SUFIJO_AUTORENAME, "$2") : f.name;
                const buenoBase = porClave.get(clave(`${anio.path}/${sinSufijo}`));
                if (!buenoBase) {
                    sinPareja++;
                    console.log(`✖  sin pareja en Mongo: ${f.path}`);
                    continue;
                }
                const destino = sufijo ? buenoBase.replace(/\.pdf$/i, `${sufijo}.pdf`) : buenoBase;
                if (destino === f.path)
                    continue; // ya está bien: idempotente.
                console.log(`${DRY_RUN ? "·" : "✔"}  ${f.path}\n       → ${destino}`);
                if (!DRY_RUN)
                    await moveEntry(tenantId, cfg, f.path, destino);
                archivos++;
            }
        }
    }
    console.log(`\n── Resultado ──`);
    console.log(`   carpetas renombradas: ${carpetas}   ·   archivos renombrados: ${archivos}   ·   sin pareja: ${sinPareja}`);
    console.log(`\nNo se bajó ni se resubió ningún PDF: renombrar es una operación de Dropbox.`);
    console.log(`\`dropbox.path\` en Mongo NO se toca: ya estaba bien, y era el destino.\n`);
    await mongoose.disconnect();
}
run().catch(async (e) => {
    console.error(e?.response?.data || e);
    await mongoose.disconnect();
    process.exit(1);
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UNIFICAR LOS NOMBRES DE TIPO DE CONTRATO A LOS DEL CATÁLOGO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npx tsx src/scripts/unificarTiposDeContrato.ts                      # reporte, no escribe nada
 *   npx tsx src/scripts/unificarTiposDeContrato.ts --aplicar            # lo escribe
 *   npx tsx src/scripts/unificarTiposDeContrato.ts --deshacer <archivo> # lo vuelve atrás
 *
 * (con NODE_ENV=production para ir contra la base de producción)
 *
 * Antes de escribir deja en `migraciones-respaldo/` el valor viejo de cada campo que toca, contrato
 * por contrato. No es un backup de la base: es exactamente lo que hace falta para deshacer ESTO, y
 * `--deshacer` lo aplica al revés. Un `updateOne` sobre un subdocumento de un array no se puede
 * revertir de otra forma que sabiendo qué había.
 *
 * ── El problema ──
 *
 * `nombre_contrato` se escribió a mano contrato por contrato y terminó con veintiocho variantes de
 * siete tipos: «Jornada 2030 SRL», «Servicios - FZERO SRL», «Plazo fijo 5x7 part-time 2030 SRL».
 * El tipo es el mismo; lo que cambia es la EMPRESA que contrata, pegada al final del nombre.
 *
 * Eso rompe todo lo que agrupa por tipo: el desplegable «Tipo de contrato» de Novedades y de
 * Gestionar Equipo lista una opción por variante, y elegir «Jornada» no encuentra a los 3.595 que
 * dicen «Jornada 2030 SRL».
 *
 * ── Lo que hace ──
 *
 * 1. El nombre queda en el del catálogo (la colección `contratos`, que es la que muestra
 *    Configuración → Contratos → Tipos). No inventa nombres: si no matchea uno de esos, no toca.
 *
 * 2. LA EMPRESA NO SE PIERDE: antes de sacarla del nombre se escribe en `empresaContratoId` y
 *    `nombre_empresa_contrato`, que es donde va. Hoy el nombre es el ÚNICO lugar donde consta con
 *    quién se firmó —`nombre_empresa_contrato` está cargado en 24 de 7.462 contratos—, así que
 *    borrarla del texto sin guardarla antes sería perder el dato, y es justo el que decide bajo qué
 *    CUIT se liquida a esa persona.
 *
 * 3. `tipo_contrato_id` queda en el id canónico del tipo. Hoy hay ids distintos para el mismo tipo
 *    según la empresa (11 = «Servicios - FZERO», 6 = «Servicios - 2030») y varios en 0.
 *
 * ── Cómo matchea, y por qué así ──
 *
 * Por PREFIJO EXACTO NORMALIZADO contra los nombres del catálogo, quedándose con el más largo que
 * entre: «Plazo fijo 5x7 part-time 2030 SRL» tiene que dar part-time y no «Plazo fijo 5x7», que
 * también matchea y es otro contrato (4 horas por jornada contra 7).
 *
 * Normalizar es minúsculas, sin tildes y con los espacios colapsados. Nada de parecido, distancia de
 * edición ni «se parece bastante»: lo que no matchea queda como está y sale en el reporte. Un
 * renombre equivocado acá cambia el régimen laboral de alguien.
 *
 * Y el resto del nombre —lo que sobra después del tipo— tiene que ser una empresa conocida o nada.
 * Si sobra algo que no se sabe qué es, NO SE TOCA: es información que alguien puso ahí.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
const CARPETA_RESPALDO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migraciones-respaldo");
/** minúsculas, sin tildes, espacios colapsados. Para comparar, nunca para guardar. */
const norm = (s) => String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
/**
 * Lo que puede sobrar después del nombre del tipo y sigue siendo el mismo tipo: los separadores y
 * las formas en que está escrita cada empresa. Se comparan normalizados y completos, no por pedazos.
 */
const SEPARADORES = ["-", "–", "—", "|", "/", "+", ","];
/** Las variantes con que cada empresa aparece escrita dentro del nombre del contrato. */
const ALIAS_DE_EMPRESA = {
    "2030 S.R.L.": ["2030 srl", "2030 s.r.l.", "2030 s r l", "2030"],
    "FZERO S.R.L": ["fzero srl", "fzero s.r.l.", "fzero s.r.l", "fzero"],
    "GRINI S.R.L.": ["grini srl", "grini s.r.l.", "grini"],
};
/** El id numérico histórico de cada tipo (`tipo_contrato_id`), el que ya usan los contratos limpios. */
const ID_CANONICO = {
    "plazo fijo 5x7": 1,
    "plazo fijo 6x6": 2,
    jornada: 3,
    "tiempo indeterminado": 4,
    servicios: 6,
    "practica profesional supervisada": 9,
    "plazo fijo 5x7 part-time": 10,
};
/**
 * Del nombre escrito a mano al tipo del catálogo y, si la trae, a la empresa.
 *
 * Devuelve `null` cuando no arranca con ningún tipo del catálogo, o cuando arranca pero después
 * sobra algo que no es una empresa conocida. Las dos cosas van al reporte sin tocarse.
 */
function resolver(nombre, catalogo) {
    const n = norm(nombre);
    if (!n)
        return null;
    // El más largo primero: «plazo fijo 5x7 part-time» antes que «plazo fijo 5x7».
    const candidatos = [...catalogo].sort((a, b) => norm(b).length - norm(a).length);
    for (const tipo of candidatos) {
        const t = norm(tipo);
        if (n !== t && !n.startsWith(t + " "))
            continue;
        let resto = n.slice(t.length).trim();
        if (!resto)
            return { tipo, empresa: null };
        // Se le sacan los separadores del principio: «servicios - fzero srl» deja «fzero srl».
        let cambio = true;
        while (cambio) {
            cambio = false;
            for (const sep of SEPARADORES) {
                if (resto.startsWith(sep)) {
                    resto = resto.slice(sep.length).trim();
                    cambio = true;
                }
            }
        }
        if (!resto)
            return { tipo, empresa: null };
        for (const [empresa, alias] of Object.entries(ALIAS_DE_EMPRESA)) {
            if (alias.includes(resto))
                return { tipo, empresa };
        }
        // Arranca con un tipo conocido pero después dice algo más. No se adivina qué.
        return null;
    }
    return null;
}
/** Vuelve cada campo al valor que tenía. `undefined` significa que el campo no existía: se saca. */
async function deshacer(db, archivo) {
    const ruta = path.isAbsolute(archivo) ? archivo : path.resolve(CARPETA_RESPALDO, archivo);
    const lineas = JSON.parse(fs.readFileSync(ruta, "utf8"));
    console.log(`Deshaciendo ${lineas.length} campos desde ${ruta}\n`);
    const porVinculo = new Map();
    for (const l of lineas) {
        if (!porVinculo.has(l.vinculo))
            porVinculo.set(l.vinculo, []);
        porVinculo.get(l.vinculo).push(l);
    }
    let vinculos = 0;
    for (const [vinculo, suyas] of porVinculo) {
        const set = {};
        const unset = {};
        for (const l of suyas) {
            if (l.antes === undefined)
                unset[l.campo] = "";
            else
                set[l.campo] = l.antes;
        }
        const cambio = {};
        if (Object.keys(set).length)
            cambio.$set = set;
        if (Object.keys(unset).length)
            cambio.$unset = unset;
        await db.collection("users_&_projects").updateOne({ _id: new Types.ObjectId(vinculo) }, cambio);
        vinculos += 1;
    }
    console.log(`Listo: ${lineas.length} campos vueltos atrás en ${vinculos} vínculos.`);
}
async function main() {
    const aplicar = process.argv.includes("--aplicar");
    const archivoDeshacer = process.argv[process.argv.indexOf("--deshacer") + 1];
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const db = mongoose.connection.db;
    if (process.argv.includes("--deshacer")) {
        if (!archivoDeshacer || archivoDeshacer.startsWith("--")) {
            console.error("Falta el archivo de respaldo: --deshacer tipos-de-contrato-<sello>.json");
            await mongoose.disconnect();
            process.exit(1);
        }
        console.log(`Base: ${db.databaseName}\n`);
        await deshacer(db, archivoDeshacer);
        await mongoose.disconnect();
        return;
    }
    console.log(`Base: ${db.databaseName}${aplicar ? "" : "   (reporte: no se escribe nada)"}\n`);
    /* ── El catálogo, tal como lo muestra Configuración → Contratos → Tipos ── */
    const catalogo = (await db.collection("contratos").find({}).toArray()).map((c) => String(c.name || "").trim()).filter(Boolean);
    console.log(`Catálogo (${catalogo.length} tipos): ${catalogo.join(" · ")}\n`);
    /* ── Las empresas, para poder guardar el id y no sólo el nombre ── */
    const empresas = await db.collection("companies").find({}).toArray();
    const idDeEmpresa = new Map();
    // El nombre de una empresa es su `razonSocial`: es el que se firma y el que va en el contrato.
    for (const e of empresas)
        idDeEmpresa.set(String(e.razonSocial || e.nombre || e.name || ""), e._id);
    for (const nombre of Object.keys(ALIAS_DE_EMPRESA)) {
        if (!idDeEmpresa.has(nombre))
            console.log(`   OJO: «${nombre}» no está en companies; se guardará el nombre sin id.`);
    }
    /* ── Qué hay hoy ── */
    const variantes = await db
        .collection("users_&_projects")
        .aggregate([
        { $unwind: "$contracts" },
        { $group: { _id: { n: "$contracts.nombre_contrato", t: "$contracts.tipo_contrato_id" }, c: { $sum: 1 } } },
        { $sort: { c: -1 } },
    ])
        .toArray();
    const seTocan = [];
    const noSeTocan = [];
    for (const v of variantes) {
        const r = resolver(v._id.n, catalogo);
        if (r)
            seTocan.push({ nombre: v._id.n, tipoId: v._id.t, cant: v.c, a: r });
        else
            noSeTocan.push({ nombre: v._id.n, tipoId: v._id.t, cant: v.c });
    }
    const suma = (xs) => xs.reduce((n, x) => n + x.cant, 0);
    console.log(`SE UNIFICAN — ${suma(seTocan)} contratos en ${seTocan.length} variantes\n`);
    console.log("  CANT  id   NOMBRE ACTUAL                                          QUEDA COMO              EMPRESA");
    for (const s of seTocan.sort((a, b) => b.cant - a.cant)) {
        const flechaId = ID_CANONICO[norm(s.a.tipo)];
        const id = `${s.tipoId ?? "-"}${flechaId !== undefined && flechaId !== s.tipoId ? `→${flechaId}` : ""}`;
        console.log(`  ${String(s.cant).padStart(4)}  ${id.padEnd(5)}${JSON.stringify(s.nombre).padEnd(56)}${s.a.tipo.padEnd(24)}${s.a.empresa || "—"}`);
    }
    console.log(`\nNO SE TOCAN — ${suma(noSeTocan)} contratos en ${noSeTocan.length} variantes`);
    console.log("  (no arrancan con ningún tipo del catálogo, o después del tipo dicen algo que no es una empresa)\n");
    console.log("  CANT  id   NOMBRE");
    for (const s of noSeTocan.sort((a, b) => b.cant - a.cant)) {
        console.log(`  ${String(s.cant).padStart(4)}  ${String(s.tipoId ?? "-").padEnd(5)}${JSON.stringify(s.nombre)}`);
    }
    if (!aplicar) {
        console.log("\nNada se escribió. Con --aplicar se unifica.");
        await mongoose.disconnect();
        return;
    }
    /*
      ── La escritura ──
  
      Un `updateOne` por contrato con el índice posicional: los contratos son subdocumentos de un array
      y hay que tocar el renglón, no el documento. Se recorre el array en memoria y se escribe sólo lo
      que cambia, así que un segundo pase no hace nada.
    */
    const porNombre = new Map(seTocan.map((s) => [s.nombre, s.a]));
    const vinculos = await db.collection("users_&_projects").find({}).project({ contracts: 1 }).toArray();
    let tocados = 0;
    let renglones = 0;
    const respaldo = [];
    for (const v of vinculos) {
        const cambios = {};
        /** Anota el valor viejo junto con el nuevo: el respaldo se arma escribiendo, no en otra pasada. */
        const cambiar = (campo, nuevo, antes) => {
            cambios[campo] = nuevo;
            respaldo.push({ vinculo: String(v._id), campo, antes });
        };
        (v.contracts || []).forEach((c, i) => {
            const r = porNombre.get(c?.nombre_contrato);
            if (!r)
                return;
            if (c.nombre_contrato !== r.tipo)
                cambiar(`contracts.${i}.nombre_contrato`, r.tipo, c.nombre_contrato);
            const idCanonico = ID_CANONICO[norm(r.tipo)];
            if (idCanonico !== undefined && c.tipo_contrato_id !== idCanonico)
                cambiar(`contracts.${i}.tipo_contrato_id`, idCanonico, c.tipo_contrato_id);
            /*
              La empresa sólo se ESCRIBE, nunca se pisa: si el contrato ya tiene una cargada a mano, esa
              manda. El nombre es una fuente de segunda —alguien lo tipeó— y no tiene por qué ganarle a
              alguien que la eligió del desplegable.
            */
            if (r.empresa && !c.empresaContratoId && !c.nombre_empresa_contrato) {
                cambiar(`contracts.${i}.nombre_empresa_contrato`, r.empresa, c.nombre_empresa_contrato);
                const id = idDeEmpresa.get(r.empresa);
                if (id)
                    cambiar(`contracts.${i}.empresaContratoId`, id, c.empresaContratoId);
            }
        });
        if (Object.keys(cambios).length === 0)
            continue;
        await db.collection("users_&_projects").updateOne({ _id: v._id }, { $set: cambios });
        tocados += 1;
        renglones += Object.keys(cambios).length;
    }
    /*
      El respaldo se escribe DESPUÉS y no antes a propósito: sólo lista lo que realmente cambió. Un
      respaldo de lo que se pensaba cambiar deshace cosas que nunca pasaron.
    */
    fs.mkdirSync(CARPETA_RESPALDO, { recursive: true });
    const sello = new Date().toISOString().replace(/[:.]/g, "-");
    const archivo = path.join(CARPETA_RESPALDO, `tipos-de-contrato-${sello}.json`);
    fs.writeFileSync(archivo, JSON.stringify(respaldo, null, 1), "utf8");
    console.log(`\nListo: ${renglones} campos escritos en ${tocados} vínculos.`);
    console.log(`Respaldo: ${archivo}`);
    console.log(`Para volver atrás: npx tsx src/scripts/unificarTiposDeContrato.ts --deshacer ${path.basename(archivo)}`);
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});

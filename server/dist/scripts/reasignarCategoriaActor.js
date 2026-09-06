import mongoose from "mongoose";
import { writeFileSync } from "node:fs";
import { Categoria } from "../models/Categoria.js";
import UserProject from "../models/UserProject.js";
/**
 * Reasigna los contratos de la categoría «Actor» a categorías reales de ARCA.
 *
 * POR QUÉ
 * ───────
 * «Actor» no existe en el nomenclador: no tiene convenio ni código de ARCA. Los contratos que la usan
 * generan un TXT sin categoría profesional (pos. 101-106) y el organismo lo rechaza. No es un dato
 * feo: es un alta que no se puede presentar.
 *
 * LA CATEGORÍA NO SE INFIERE
 * ──────────────────────────
 * TIRA y UNITARIO no son intercambiables, y la diferencia entre PROTAGONISTA A y PERSONAJE SECUNDARIO
 * cambia la tarifa. Es una decisión de producción. Este script no adivina: exige que cada combinación
 * de proyecto y rol tenga su categoría escrita a mano en `DECISIONES`, y se niega a correr si falta
 * alguna. Un default «razonable» acá sería declarar ante el organismo una categoría que nadie eligió.
 *
 *     npm run actores:reasignar:dry     (no escribe; imprime el plan y las validaciones)
 *     npm run actores:reasignar         (escribe, y deja el log reversible)
 *
 * El log queda en `logs/reasignacion-actor-<timestamp>.json` con el valor anterior de cada contrato:
 * es lo que hace falta para revertir, y sin él la migración es de ida.
 */
const DRY_RUN = process.env.DRY_RUN === "true";
/** El `categoria_sat_id` que hoy tienen los contratos rotos. Es el id heredado, no el `_id` de Mongo. */
const CATEGORIA_ACTOR_LEGACY_ID = 46;
/**
 * Una categoría por combinación de proyecto y rol. COMPLETAR ANTES DE CORRER.
 *
 * `n` es la cantidad esperada de contratos: si el conteo real no coincide, el dry-run lo canta. Está
 * para detectar que el nombre del proyecto cambió o que aparecieron contratos nuevos desde el
 * relevamiento, no para que el script "confíe" en el número.
 */
const DECISIONES = [
    // Los tres REELSHORT → TIRA: son microdramas seriados, capítulos encadenados de una misma historia.
    { proyecto: "700_REEL_SHORT_CDDUJDF", rol: "Actor", n: 63, convenio: "0322/75", codigoArca: "032564" },
    { proyecto: "719H1_REELSHORT_SURRENDER", rol: "Actor", n: 42, convenio: "0322/75", codigoArca: "032564" },
    { proyecto: "719H2_REELSHORT_MYSECRETLOVER", rol: "Actor", n: 37, convenio: "0322/75", codigoArca: "032564" },
    /*
      Animación y TELECOM → UNITARIO: obras cerradas, no seriadas. Las siete altas de animación son del
      mismo día, y el proyecto de TELECOM tiene un apuntador, que indica una grabación puntual.
  
      SON LAS DOS MENOS FIRMES de las seis: se decidieron por la naturaleza de la obra, sin el detalle
      de producción a la vista. Por eso el log reversible de este script no es un extra — cambiar de
      criterio después tiene que costar una corrida, no una reconstrucción.
    */
    { proyecto: "6880002_GM_LLQL_ANIMACION", rol: "Actor", n: 7, convenio: "0322/75", codigoArca: "032879" },
    { proyecto: "703_TELECOM_JSA_PROD_POST", rol: "Actor", n: 2, convenio: "0322/75", codigoArca: "032879" },
    // APUNTADOR solo existe en 0322/75: si este proyecto se resolviera por 0102/90, ahí no hay ninguna
    // categoría de apuntador y habría que frenar en vez de forzar una que no le corresponde.
    { proyecto: "703_TELECOM_JSA_PROD_POST", rol: "Apuntador", n: 1, convenio: "0322/75", codigoArca: "002344" },
];
/**
 * Todas las decisiones son de este convenio, y se verifica.
 *
 * No es redundante con «que el (convenio, código) exista»: los códigos de actores son parecidos entre
 * los dos CCT y un dedazo puede dar una categoría que EXISTE pero es del otro convenio. Ahí el script
 * escribiría un encuadre válido para ARCA y equivocado para este trabajo, sin que nada chille.
 */
const CONVENIO_ESPERADO = "0322/75";
const TOTAL_ESPERADO = 152;
const clave = (proyecto, rol) => `${proyecto}||${rol}`;
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);
    const problemas = [];
    // ── 1. Las categorías destino, resueltas por (convenio, código). El id que se escribe sale de acá,
    //       nunca hardcodeado: es el mismo tipo de id que los contratos ya tienen guardado.
    const destinos = new Map();
    for (const d of DECISIONES) {
        if (!d.convenio || !d.codigoArca) {
            problemas.push(`SIN DECIDIR: ${d.proyecto} · ${d.rol} (${d.n} contratos) — falta convenio y/o código.`);
            continue;
        }
        if (d.convenio !== CONVENIO_ESPERADO) {
            problemas.push(`CONVENIO INESPERADO: ${d.proyecto} · ${d.rol} apunta a ${d.convenio}, y todas las decisiones son de ${CONVENIO_ESPERADO}. ¿Dedazo?`);
            continue;
        }
        const k = `${d.convenio}|${d.codigoArca}`;
        if (destinos.has(k))
            continue;
        const cat = await Categoria.findOne({ convenio: d.convenio, codigoArca: d.codigoArca }).lean();
        if (!cat) {
            problemas.push(`NO EXISTE: ${d.convenio} · ${d.codigoArca} no está en la base.`);
            continue;
        }
        if (cat.legacyId == null) {
            problemas.push(`SIN legacyId: ${d.convenio} · ${d.codigoArca} («${cat.nombre}») no tiene id numérico y el contrato guarda la categoría por número. Corré primero: npm run categorias:legacy-id`);
            continue;
        }
        destinos.set(k, cat);
    }
    console.log("── Categorías destino ──");
    for (const [k, c] of destinos)
        console.log(`  ${k.padEnd(20)} data.id=${String(c.legacyId).padStart(4)}  ${c.nombre}`);
    if (destinos.size === 0)
        console.log("  (ninguna: faltan decisiones)");
    // ── 2. Los contratos que hoy apuntan a «Actor».
    const ups = await UserProject.find({ "contracts.categoria_sat_id": CATEGORIA_ACTOR_LEGACY_ID }).select("nombre_proyecto userId projectId contracts").lean();
    const porClave = new Map();
    const fueraDelMapeo = [];
    let total = 0;
    for (const up of ups) {
        for (let i = 0; i < (up.contracts || []).length; i++) {
            const c = up.contracts[i];
            if (Number(c?.categoria_sat_id) !== CATEGORIA_ACTOR_LEGACY_ID)
                continue;
            total++;
            const k = clave(String(up.nombre_proyecto || ""), String(c.nombre_rol_frame || ""));
            if (!DECISIONES.some((d) => clave(d.proyecto, d.rol) === k)) {
                fueraDelMapeo.push(`${up.nombre_proyecto} · ${c.nombre_rol_frame || "(sin rol)"}`);
                continue;
            }
            if (!porClave.has(k))
                porClave.set(k, []);
            porClave.get(k).push({ up, idx: i, c });
        }
    }
    console.log("\n── Contratos por decisión ──");
    for (const d of DECISIONES) {
        const encontrados = (porClave.get(clave(d.proyecto, d.rol)) || []).length;
        const marca = encontrados === d.n ? " " : "!";
        console.log(`${marca} ${String(encontrados).padStart(3)} (esperados ${String(d.n).padStart(3)})  ${d.proyecto} · ${d.rol}`);
        if (encontrados === 0)
            problemas.push(`SIN MATCH: la fila «${d.proyecto} · ${d.rol}» no encontró ningún contrato — ¿está bien escrito el proyecto?`);
        else if (encontrados !== d.n)
            console.log(`      ojo: el conteo cambió desde el relevamiento (${d.n} → ${encontrados}).`);
    }
    console.log(`\nTotal con categoría ${CATEGORIA_ACTOR_LEGACY_ID}: ${total} (esperados ${TOTAL_ESPERADO})`);
    if (total !== TOTAL_ESPERADO)
        problemas.push(`TOTAL DISTINTO: hay ${total} contratos con la categoría «Actor», no ${TOTAL_ESPERADO}.`);
    if (fueraDelMapeo.length > 0) {
        const unicos = [...new Set(fueraDelMapeo)];
        problemas.push(`FUERA DEL MAPEO: ${fueraDelMapeo.length} contrato(s) con «Actor» no caen en ninguna fila de DECISIONES.`);
        console.log("\n── Fuera del mapeo (hay que decidirlos también) ──");
        for (const u of unicos)
            console.log(`  ${u}  ×${fueraDelMapeo.filter((x) => x === u).length}`);
    }
    // ── 3. La obra social no debería moverse: los dos convenios de actores no tienen una por defecto.
    //       Se verifica igual, porque «no debería» y «no» son cosas distintas.
    const conObraSocialPropia = [...porClave.values()].flat().filter(({ c }) => String(c?.obraSocialRnos || "").replace(/\D/g, "").length > 0);
    if (conObraSocialPropia.length > 0) {
        console.log(`\nAviso: ${conObraSocialPropia.length} de estos contratos tienen obra social ya constatada. NO se toca: el cambio de categoría no la altera.`);
    }
    if (problemas.length > 0) {
        console.log("\n✖ NO SE PUEDE APLICAR:\n");
        for (const p of problemas)
            console.log(`   · ${p}`);
        console.log("\nCompletá el bloque DECISIONES en este archivo y volvé a correr el dry-run.\n");
        await mongoose.disconnect();
        process.exit(1);
    }
    if (DRY_RUN) {
        console.log(`\nDRY RUN terminado: ${total} contrato(s) se reasignarían. No se escribió nada.\n`);
        await mongoose.disconnect();
        return;
    }
    // ── 4. Aplicar, agrupando por documento: varios contratos pueden vivir en el mismo `UserProject` y
    //       guardarlos de a uno se pisa a sí mismo.
    const log = [];
    const porDoc = new Map();
    for (const d of DECISIONES) {
        const destino = destinos.get(`${d.convenio}|${d.codigoArca}`);
        for (const { up, idx, c } of porClave.get(clave(d.proyecto, d.rol)) || []) {
            const k = String(up._id);
            if (!porDoc.has(k))
                porDoc.set(k, { up, cambios: [] });
            porDoc.get(k).cambios.push({ idx, antes: Number(c.categoria_sat_id), ahora: Number(destino.legacyId) });
            log.push({
                userProjectId: String(up._id),
                projectId: String(up.projectId),
                userId: String(up.userId),
                proyecto: up.nombre_proyecto,
                contractIndex: idx,
                contractId: String(c._id || ""),
                rol: c.nombre_rol_frame,
                antes: { categoria_sat_id: Number(c.categoria_sat_id), nombre_categoria_sat: c.nombre_categoria_sat || "" },
                ahora: { categoria_sat_id: Number(destino.legacyId), nombre_categoria_sat: destino.nombre, convenio: d.convenio, codigoArca: d.codigoArca },
            });
        }
    }
    let escritos = 0;
    for (const { up, cambios } of porDoc.values()) {
        const doc = await UserProject.findById(up._id);
        if (!doc)
            continue;
        for (const { idx, ahora } of cambios) {
            const destino = [...destinos.values()].find((d) => Number(d.legacyId) === ahora);
            doc.contracts[idx] = { ...doc.contracts[idx].toObject(), categoria_sat_id: ahora, nombre_categoria_sat: destino.nombre };
            escritos++;
        }
        doc.markModified("contracts");
        await doc.save();
    }
    const archivo = `logs/reasignacion-actor-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(archivo, JSON.stringify(log, null, 2));
    console.log(`\n${escritos} contrato(s) reasignado(s).`);
    console.log(`Log reversible: ${archivo}\n`);
    console.log("Ahora sí: si `GET /arca/categorias/huerfanas` devuelve contratos: 0 para «Actor», se pueden dar de baja «Actor» y «Musico».\n");
    await mongoose.disconnect();
}
run().catch(async (e) => {
    console.error("\n✖", e.message);
    await mongoose.disconnect().catch(() => undefined);
    process.exit(1);
});

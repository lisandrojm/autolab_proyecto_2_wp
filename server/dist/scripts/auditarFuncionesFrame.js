import mongoose from "mongoose";
import { auditarFunciones, COLECCION_CONTRATOS } from "../utils/auditoriaFuncionesFrame.js";
/**
 * Auditoría de SOLO LECTURA del puente Función FRAME → Categoría.
 *
 * Una función FRAME es el ROL con el que se arma un contrato («Actor», «Director de Programas»), y
 * cada una guarda —denormalizada, en `data.categoriasSat[]`— la lista de categorías que le
 * corresponden. Esa lista es lo que la interfaz le propone a quien arma el contrato.
 *
 * EL AGUJERO QUE ESTE SCRIPT EXISTE PARA VER
 *
 * La lista se guarda por `id` (el `data.id` de `categorias`) y NADIE la revalida. Cuando la Fase 2
 * dio de baja «Actor» y «Musico», las funciones que las referenciaban quedaron apuntando a categorías
 * inactivas —sin convenio y sin código de ARCA— y el sistema siguió proponiéndolas. Los contratos
 * viejos estaban bien; lo que se rompió fue el PRÓXIMO, y en silencio: «Actor» ya no figuraba entre
 * las huérfanas del panel rojo porque ya no era una categoría activa.
 *
 * Los cuatro estados posibles de una referencia, y por qué se cuentan aparte:
 *
 *   fantasma   el `id` no existe en `categorias`. El contrato nuevo no resuelve ni sueldo ni código.
 *   de-baja    existe pero `isActive: false`. Igual de inservible, y más difícil de ver.
 *   sin-nada   la función no tiene ninguna categoría. Arma contratos sin nada que proponer.
 *   mezcla     apunta a categorías de convenios distintos. No es un error por sí solo —una función
 *              puede existir en dos convenios— pero es de donde salen los contratos cuya categoría
 *              pertenece a un convenio que su función no contempla.
 *
 * Uso (desde server/):
 *   npm run funciones-frame:auditar
 */
// ─────────────────────────────────────────────────────────────────── el script
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    const db = mongoose.connection.db;
    if (!db)
        throw new Error("No se pudo establecer la conexión");
    console.log(`\nDB: ${dbName}   |   SOLO LECTURA\n`);
    const roles = (await db.collection("roles_frame").find({}).toArray());
    /*
      Las dos colecciones, con el modelo NUEVO primero.
  
      El orden no es estético: `armarIndice` deja ganar al primero que aparece, igual que
      `resolverCategoriasCompatPorId` —la vieja solo rellena lo que la nueva no tiene—. Al revés,
      una fila sobreviviente de `categorias-sat` sin `isActive` tapaba a su equivalente dada de baja
      en `categorias` y la referencia se leía como sana: así fue como «Actor» y «Musico», que son EL
      caso que motivó todo esto, no aparecían entre las rotas.
    */
    const categorias = [...(await db.collection("categorias").find({}).toArray()), ...(await db.collection("categorias-sat").find({}).toArray())];
    /*
      A cuántos contratos alcanza cada función.
  
      El rol vive en el contrato dentro de `userprojects.contracts[]`, así que se cuenta por agregación
      y no trayendo los documentos: son miles y solo hace falta el número.
    */
    const conteo = await db
        .collection(COLECCION_CONTRATOS)
        .aggregate([{ $unwind: "$contracts" }, { $group: { _id: "$contracts.rol_frame_id", n: { $sum: 1 } } }])
        .toArray();
    const contratosPorRolId = new Map(conteo.filter((c) => c._id != null).map((c) => [Number(c._id), Number(c.n)]));
    const auditadas = auditarFunciones(roles, categorias, contratosPorRolId);
    const rotas = auditadas.filter((f) => f.rota).sort((a, b) => b.contratos - a.contratos);
    const mezclan = auditadas.filter((f) => !f.rota && f.conveniosVigentes.length > 1).sort((a, b) => b.contratos - a.contratos);
    console.log(`${auditadas.length} función(es) FRAME · ${rotas.length} rota(s) · ${mezclan.length} que mezclan convenios\n`);
    if (rotas.length === 0) {
        console.log("   ✓ Ninguna función apunta a una categoría inexistente ni dada de baja.\n");
    }
    else {
        console.log("FUNCIONES ROTAS — ordenadas por contratos afectados:\n");
        for (const f of rotas) {
            console.log(`   ✗ ${f.nombre}  ·  ${f.contratos} contrato(s)${f.rolId != null ? `  ·  rol id ${f.rolId}` : ""}`);
            for (const m of f.motivos)
                console.log(`       ${m}`);
            const ok = f.referencias.filter((r) => r.estado === "ok");
            if (ok.length)
                console.log(`       le quedan válidas: ${ok.map((r) => `${r.convenio || "sin convenio"} ${r.codigoArca || "sin código"} «${r.nombreVigente || r.nombreGuardado}»`).join(", ")}`);
            console.log("");
        }
    }
    if (mezclan.length > 0) {
        console.log("MEZCLAN CONVENIOS — no es un error por sí solo, pero es de acá que salen los contratos descolgados:\n");
        for (const f of mezclan)
            console.log(`   · ${f.nombre}  ·  ${f.contratos} contrato(s)  ·  ${f.conveniosVigentes.join(" + ")}`);
        console.log("");
    }
    /*
      EL TERMÓMETRO: contratos cuya categoría pertenece a un convenio que su función NO contempla.
  
      Es la consecuencia medible del desfase, y por eso sirve para saber si un remapeo quedó bien. Los
      contratos ya armados no se rompen —su categoría sigue existiendo— pero el número dice cuántos
      quedaron fuera de lo que su propio rol propone hoy.
    */
    const contratos = await db
        .collection(COLECCION_CONTRATOS)
        .aggregate([{ $unwind: "$contracts" }, { $match: { "contracts.rol_frame_id": { $ne: null }, "contracts.categoria_sat_id": { $ne: null } } }, { $project: { rol: "$contracts.rol_frame_id", cat: "$contracts.categoria_sat_id" } }])
        .toArray();
    const conveniosPorRolId = new Map();
    for (const f of auditadas) {
        if (f.rolId != null)
            conveniosPorRolId.set(Number(f.rolId), new Set(f.conveniosVigentes));
    }
    // Mismo criterio de id que el índice de arriba: `legacyId` primero. Acá seguía leyendo `data.id`
    // y el mapa quedaba vacío, así que TODO contrato se salteaba y el termómetro marcaba 0 siempre.
    const convenioPorCatId = new Map();
    for (const c of categorias) {
        const id = c.legacyId ?? c.data?.id;
        if (id != null && c.convenio && !convenioPorCatId.has(Number(id)))
            convenioPorCatId.set(Number(id), c.convenio);
    }
    let descolgados = 0;
    /**
     * Contratos cuya categoría NO tiene convenio resoluble.
     *
     * Se cuentan aparte y no se suman a los descolgados: «pertenece a otro convenio» y «no pertenece
     * a ninguno» son problemas distintos y se arreglan distinto. Meterlos en la misma bolsa haría que
     * el termómetro bajara arreglando cualquiera de los dos, que es lo contrario de lo que sirve.
     */
    let sinConvenio = 0;
    const porFuncion = new Map();
    const nombrePorRolId = new Map(auditadas.filter((f) => f.rolId != null).map((f) => [Number(f.rolId), f.nombre]));
    for (const c of contratos) {
        const convenioCat = convenioPorCatId.get(Number(c.cat));
        const delRol = conveniosPorRolId.get(Number(c.rol));
        if (!delRol)
            continue;
        if (!convenioCat) {
            sinConvenio++;
            continue;
        }
        if (!delRol.has(convenioCat)) {
            descolgados++;
            const n = nombrePorRolId.get(Number(c.rol)) || `rol ${c.rol}`;
            porFuncion.set(n, (porFuncion.get(n) || 0) + 1);
        }
    }
    console.log("TERMÓMETRO — contratos cuya categoría es de un convenio que su función no contempla:\n");
    console.log(`   ${descolgados} contrato(s)`);
    if (sinConvenio > 0)
        console.log(`   ${sinConvenio} contrato(s) más con una categoría SIN convenio resoluble (otro problema, se arregla en el catálogo)`);
    for (const [n, cant] of [...porFuncion.entries()].sort((a, b) => b[1] - a[1]))
        console.log(`      ${cant.toString().padStart(4)}  ${n}`);
    console.log("");
    await mongoose.disconnect();
    // Sale con 1 si hay algo roto: así sirve de chequeo en CI o en un cron, no solo de lectura humana.
    process.exit(rotas.length > 0 ? 1 : 0);
}
// Solo corre cuando se lo invoca directo: importarlo desde el endpoint o un test no puede abrir una
// conexión a producción.
if (process.argv[1] && process.argv[1].includes("auditarFuncionesFrame")) {
    run().catch((e) => {
        console.error("\nError:", e?.message || e, "\n");
        process.exit(1);
    });
}

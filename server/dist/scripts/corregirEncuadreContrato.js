import mongoose from "mongoose";
import { writeFileSync } from "node:fs";
import UserProject from "../models/UserProject.js";
import { Categoria } from "../models/Categoria.js";
import { buscarCategoriaCompatPorLegacyId } from "../utils/categoriaCompat.js";
/**
 * Corrige el encuadre de contratos PUNTUALES, señalados a mano.
 *
 * POR QUÉ EXISTE APARTE DE `reasignarCategoriaActor`
 * ──────────────────────────────────────────────────
 * Aquella migración corrige una clase entera —todos los contratos con la categoría rota «Actor»— y se
 * dirige por (proyecto, rol). Esto es lo contrario: una lista cerrada de contratos identificados uno
 * por uno, que no comparten ninguna condición consultable. Encajarlos en el otro script habría
 * obligado a inventarle un modo "por si acaso también arreglá estos dos", que es como se arruina un
 * script de migración.
 *
 * DE DÓNDE SALEN LOS CASOS
 * ────────────────────────
 * De `npm run encuadre:auditar`, que busca contratos cuya categoría es de un convenio que la función
 * FRAME del contrato no contempla. Un «Asistente de Cámara» —técnico, SATSAID— encuadrado en un
 * convenio de actores es un dato que ARCA aceptaría sin chistar: la categoría existe y el código es
 * válido. El organismo no valida que la función se corresponda con el convenio; nadie lo hace salvo
 * esta comparación.
 *
 *     npm run encuadre:corregir:dry     (no escribe; imprime el plan y las validaciones)
 *     npm run encuadre:corregir         (escribe, y deja el log reversible)
 *
 * El log sale con el MISMO formato que el de la migración de actores, así que se revierte con el
 * script que ya existe:
 *
 *     npm run actores:revertir -- logs/correccion-encuadre-....json
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const CORRECCIONES = [
    {
        aplicar: true,
        quien: "ALEJANDRO HUGO DAVID CORDOBA · CUIT 20-36397260-9 · 426_LN+ · alta 04/07/2026",
        motivo: "Rol FRAME «Asistente de Cámara»: es técnico y va por SATSAID (0634/11). Estaba en APUNTADOR, " +
            "una categoría del convenio de actores. De las dos categorías que su función FRAME contempla, " +
            "«Asistente de cámara especializado / Grip» es la que corresponde por nombre.",
        userProjectId: "696423835dd723128ad69ec0",
        contractIndex: 39,
        catActual: 409, // 0322/75 002344 APUNTADOR
        destinoConvenio: "0634/11",
        destinoCodigo: "035358", // Asistente de cámara especializado / Grip
    },
    {
        /*
          EN FALSO A PROPÓSITO. Sale de la misma auditoría y tiene toda la pinta del mismo accidente —es
          la SEGUNDA fila de la grilla, mismo proyecto, mismo rol, y es el único contrato de todo el
          sistema que usa 0102/90—, pero corregirlo no estaba pedido y la instrucción fue explícita:
          reportar, no tocar. Poner `aplicar: true` es todo lo que hace falta si se decide corregirlo.
        */
        aplicar: false,
        quien: "ANGELES SELENA VELIZ · CUIL 27-44042783-4 · 426_LN+ · alta 31/07/2026",
        motivo: "Mismo rol «Asistente de Cámara» y mismo proyecto que el anterior, encuadrado en PERSONAJE " +
            "SECUNDARIO (0102/90 — actores). Es el único contrato del sistema en ese convenio.",
        userProjectId: "6a46995b7edc747f9d9df029",
        contractIndex: 14,
        catActual: 415, // 0102/90 026507 PERSONAJE SECUNDARIO
        destinoConvenio: "0634/11",
        destinoCodigo: "035358",
    },
];
async function run() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);
    const problemas = [];
    const plan = [];
    for (const c of CORRECCIONES) {
        const marca = c.aplicar ? "→" : "·";
        console.log(`${marca} ${c.quien}`);
        if (!c.aplicar) {
            console.log(`    NO SE TOCA (aplicar: false). ${c.motivo}\n`);
            continue;
        }
        const destino = await Categoria.findOne({ convenio: c.destinoConvenio, codigoArca: c.destinoCodigo }).lean();
        if (!destino) {
            problemas.push(`NO EXISTE: ${c.destinoConvenio} · ${c.destinoCodigo}`);
            continue;
        }
        if (destino.legacyId == null) {
            problemas.push(`SIN legacyId: ${c.destinoConvenio} · ${c.destinoCodigo} («${destino.nombre}») — el contrato guarda la categoría por número. Corré antes: npm run categorias:legacy-id`);
            continue;
        }
        if (destino.isActive === false) {
            problemas.push(`DE BAJA: ${c.destinoConvenio} · ${c.destinoCodigo} («${destino.nombre}») está desactivada y no se puede elegir.`);
            continue;
        }
        const up = await UserProject.findById(c.userProjectId).lean();
        if (!up) {
            problemas.push(`NO EXISTE el UserProject ${c.userProjectId}`);
            continue;
        }
        const contrato = up.contracts?.[c.contractIndex];
        if (!contrato) {
            problemas.push(`NO EXISTE el contrato ${c.userProjectId}[${c.contractIndex}]`);
            continue;
        }
        if (Number(contrato.categoria_sat_id) !== c.catActual) {
            problemas.push(`YA CAMBIÓ: ${c.userProjectId}[${c.contractIndex}] tiene la categoría ${contrato.categoria_sat_id} («${contrato.nombre_categoria_sat}»), no la ${c.catActual} que esperaba este script. Alguien lo tocó: revisá antes de forzar.`);
            continue;
        }
        /*
          Los sueldos se recalculan con la MISMA regla que la ruta `PATCH .../categoria-sat`.
    
          Dejarlos como están no era una opción: la migración de actores no los tocó porque las categorías
          de actores no tienen escala cargada y todo quedaba en cero de todos modos. Acá el destino es de
          0634/11, que SÍ tiene escala, así que un contrato con la categoría nueva y los importes viejos
          mostraría un sueldo que no es el de su encuadre.
        */
        const compat = await buscarCategoriaCompatPorLegacyId(Number(destino.legacyId));
        if (!compat) {
            problemas.push(`El catálogo no resuelve la categoría ${destino.legacyId} («${destino.nombre}»).`);
            continue;
        }
        const jornada = Number(contrato.sueldo_jornada || 0);
        const sueldo_neto = Number(Number(compat.data?.neto ?? 0).toFixed(2));
        const sueldo_bruto = Number(Number(compat.data?.sueldoBruto ?? 0).toFixed(2));
        const sueldo_diario_neto = Number((sueldo_neto / 30).toFixed(2));
        const diferencia_diaria_neto = Number((jornada - sueldo_diario_neto).toFixed(2));
        console.log(`    ${c.motivo}`);
        console.log(`    ${contrato.categoria_sat_id} «${contrato.nombre_categoria_sat}»  →  ${destino.legacyId} «${destino.nombre}» (${c.destinoConvenio} ${c.destinoCodigo})`);
        console.log(`    sueldos: bruto ${contrato.sueldo_bruto ?? 0} → ${sueldo_bruto} · neto ${contrato.sueldo_neto ?? 0} → ${sueldo_neto} · diario ${contrato.sueldo_diario_neto ?? 0} → ${sueldo_diario_neto}`);
        if (sueldo_bruto === 0)
            console.log(`    ojo: la categoría destino no tiene escala cargada, los importes quedan en cero.`);
        console.log("");
        plan.push({
            userProjectId: String(up._id),
            projectId: String(up.projectId),
            userId: String(up.userId),
            proyecto: up.nombre_proyecto,
            contractIndex: c.contractIndex,
            contractId: String(contrato._id || ""),
            rol: contrato.nombre_rol_frame,
            quien: c.quien,
            motivo: c.motivo,
            antes: {
                categoria_sat_id: Number(contrato.categoria_sat_id),
                nombre_categoria_sat: contrato.nombre_categoria_sat || "",
                sueldo_neto: contrato.sueldo_neto ?? 0,
                sueldo_bruto: contrato.sueldo_bruto ?? 0,
                sueldo_diario_neto: contrato.sueldo_diario_neto ?? 0,
                diferencia_diaria_neto: contrato.diferencia_diaria_neto ?? 0,
            },
            ahora: {
                categoria_sat_id: Number(destino.legacyId),
                nombre_categoria_sat: destino.nombre,
                convenio: c.destinoConvenio,
                codigoArca: c.destinoCodigo,
                sueldo_neto,
                sueldo_bruto,
                sueldo_diario_neto,
                diferencia_diaria_neto,
            },
        });
    }
    if (problemas.length > 0) {
        console.log("✖ NO SE PUEDE APLICAR:\n");
        for (const p of problemas)
            console.log(`   · ${p}`);
        console.log("");
        await mongoose.disconnect();
        process.exit(1);
    }
    if (plan.length === 0) {
        console.log("No hay nada marcado con `aplicar: true`.\n");
        await mongoose.disconnect();
        return;
    }
    if (DRY_RUN) {
        console.log(`DRY RUN terminado: ${plan.length} contrato(s) se corregirían. No se escribió nada.\n`);
        await mongoose.disconnect();
        return;
    }
    // Agrupado por documento, igual que la migración: dos contratos del mismo `UserProject` guardados
    // de a uno se pisan entre sí.
    const porDoc = new Map();
    for (const e of plan) {
        if (!porDoc.has(e.userProjectId))
            porDoc.set(e.userProjectId, []);
        porDoc.get(e.userProjectId).push(e);
    }
    let escritos = 0;
    for (const [id, entradas] of porDoc) {
        const doc = await UserProject.findById(id);
        if (!doc)
            continue;
        for (const e of entradas) {
            doc.contracts[e.contractIndex] = {
                ...doc.contracts[e.contractIndex].toObject(),
                categoria_sat_id: e.ahora.categoria_sat_id,
                nombre_categoria_sat: e.ahora.nombre_categoria_sat,
                sueldo_neto: e.ahora.sueldo_neto,
                sueldo_bruto: e.ahora.sueldo_bruto,
                sueldo_diario_neto: e.ahora.sueldo_diario_neto,
                diferencia_diaria_neto: e.ahora.diferencia_diaria_neto,
            };
            escritos++;
        }
        doc.markModified("contracts");
        await doc.save();
    }
    const archivo = `logs/correccion-encuadre-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(archivo, JSON.stringify(plan, null, 2));
    console.log(`${escritos} contrato(s) corregido(s).`);
    console.log(`Log reversible: ${archivo}`);
    console.log(`Para deshacer:  npm run actores:revertir -- ${archivo}\n`);
    await mongoose.disconnect();
}
run().catch(async (e) => {
    console.error(e);
    await mongoose.disconnect();
    process.exit(1);
});

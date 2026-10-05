import mongoose from "mongoose";
import { AcuerdoParitario } from "../models/AcuerdoParitario.js";
import { porcentajeAcumulado } from "../utils/aplicarParitaria.js";
import { CONVENIOS, EXPEDIENTE, MARCA_ACUERDO, PERIODO_PARITARIO, TRAMOS } from "./datos/acta634_2026.js";
/**
 * SEED 1 · El acta: partes, expediente, tramos y régimen alternativo.
 *
 * Va primero porque los otros seeds cuelgan de él: cada período de escala y cada importe de adicional guarda
 * `acuerdoId`, y eso es lo que después permite responder "¿de dónde salió este número?" con el expediente en
 * la mano en lugar de "alguien lo cargó".
 *
 * Es idempotente por expediente: correrlo dos veces actualiza el mismo acuerdo, no crea un segundo.
 *
 * NO carga el PDF. El acta no está en el sistema (revisadas las 37 publicaciones de paritaria: ninguna menciona
 * 634/11 ni este expediente), así que se adjunta desde la pantalla cuando esté el archivo.
 *
 * Uso (desde server/):
 *   npm run 634-acuerdo:dry
 *   npm run 634-acuerdo
 *   npm run 634-acuerdo:revertir
 */
const DRY_RUN = process.env.DRY_RUN === "true";
const REVERTIR = process.argv[2] === "revertir";
const aFecha = (iso) => new Date(`${iso}T00:00:00.000Z`);
async function conectar() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME (usar dotenv -e .env.production)");
    await mongoose.connect(uri, { dbName });
    return dbName;
}
async function run() {
    const dbName = await conectar();
    console.log(`\nDB: ${dbName}   |   modo: ${DRY_RUN ? "DRY RUN (no escribe)" : "ESCRITURA"}\n`);
    const acumulado = porcentajeAcumulado(TRAMOS.filter((t) => t.regimen === "general").map((t) => t.porcentaje));
    const datos = {
        convenios: CONVENIOS,
        partes: ["ATA", "CAPIT", "SATTSAID"],
        titulo: "Paritaria 2025-2026 · 2.º tramo (febrero–junio 2026)",
        periodoParitario: { desde: aFecha(PERIODO_PARITARIO.desde), hasta: aFecha(PERIODO_PARITARIO.hasta) },
        expediente: EXPEDIENTE,
        firmadoEl: aFecha("2026-04-28"),
        // El acta no dice nada de la homologación, así que queda en "a confirmar" y no en "sin homologar":
        // afirmar que no está homologada sería un dato que nadie verificó.
        homologacion: { estado: "a_confirmar", resolucion: "", fecha: null },
        tramos: TRAMOS.map((t) => ({ ...t, desde: aFecha(t.desde), baseDesde: t.baseDesde ? aFecha(t.baseDesde) : null })),
        clausulaAbsorcion: { texto: "Art. 4 del acuerdo. Texto a transcribir del acta.", aplica: true },
        regimenAlternativo: { descripcion: "Art. 3.2: pequeñas productoras que así lo convengan y canales del interior.", empresaIds: [] },
        isActive: true,
        migracion: MARCA_ACUERDO,
    };
    console.log(`── ${datos.titulo}`);
    console.log(`   expediente ${EXPEDIENTE} · firmado ${"2026-04-28"} · convenios ${CONVENIOS.join(", ")}`);
    console.log(`   tramos: ${TRAMOS.map((t) => `${t.codigo} ${t.porcentaje}% (${t.regimen})`).join(" · ")}`);
    console.log(`   acumulado del régimen general: ${acumulado} % (el acta lo resume como 14,76 %)`);
    console.log(`   homologación: a confirmar · cláusula de absorción: el texto hay que transcribirlo del acta`);
    const existente = await AcuerdoParitario.findOne({ expediente: EXPEDIENTE });
    if (DRY_RUN) {
        console.log(`\n${existente ? "Se actualizaría el acuerdo existente" : "Se crearía el acuerdo"}. Nada escrito.\n`);
        await mongoose.disconnect();
        return;
    }
    if (existente) {
        await AcuerdoParitario.updateOne({ _id: existente._id }, { $set: datos });
        console.log(`\nAcuerdo actualizado: ${existente._id}\n`);
    }
    else {
        const creado = await AcuerdoParitario.create(datos);
        console.log(`\nAcuerdo creado: ${creado._id}\n`);
    }
    console.log("Falta adjuntarle el PDF del acta desde la pantalla.\n");
    await mongoose.disconnect();
}
/**
 * Revertir borra el acuerdo y deja los importes en su lugar, sin vínculo.
 *
 * Borrar los períodos también sería destruir datos que este script no creó: cada seed revierte lo suyo.
 */
async function revertir() {
    const dbName = await conectar();
    const r = await AcuerdoParitario.deleteOne({ expediente: EXPEDIENTE, migracion: MARCA_ACUERDO });
    console.log(`\nDB: ${dbName}   |   acuerdos borrados: ${r.deletedCount || 0}`);
    console.log("Los períodos y los importes de adicionales quedaron cargados, sin el vínculo al acta.\n");
    await mongoose.disconnect();
}
(REVERTIR ? revertir() : run()).catch((e) => {
    console.error("\n❌", e?.message || e, "\n");
    process.exit(1);
});

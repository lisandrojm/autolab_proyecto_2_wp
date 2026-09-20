/**
 * ═══════════════════════════════════════════════════════════════════════
 * PUESTA EN MARCHA DEL BANCO DE DÍAS — fase 1. Para correr a mano.
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   npx tsx src/scripts/bancoDeDiasFase1.ts <tenantId>           # dice qué haría, NO escribe
 *   npx tsx src/scripts/bancoDeDiasFase1.ts <tenantId> --aplicar # lo hace
 *
 * Hace dos cosas, las dos idempotentes (correrlo de nuevo no duplica nada):
 *
 *   1. Crea la cuenta COMPENSATORIO. Es la única de la fase 1: hoy no existe como saldo en ningún
 *      lado, así que si algo sale mal no hay nada previo que romper. VACACIONES se crea en la fase 3.
 *
 *   2. Completa `attendance.typeId` en los partes ya cargados, buscando el tipo por su NOMBRE.
 *      Hasta ahora el tipo viajaba sólo como texto en `absenceReason`; el motor de efectos necesita
 *      el id. Se hace ahora y no más adelante porque el mapeo por nombre sólo funciona mientras los
 *      nombres sigan coincidiendo: en cuanto alguien renombre un tipo en el ABM, esos partes quedan
 *      sin forma de identificar de qué eran.
 *
 * NO CONECTA NINGÚN TIPO CON LA CUENTA. Qué novedad acredita y cuál consume se decide con RRHH y se
 * configura desde la pantalla (fase 2). Cablearlo acá sería adivinar.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { LeaveAccount } from "../models/LeaveAccount.js";
import { RequestConfig } from "../models/RequestConfig.js";
import { Request } from "../models/Request.js";
async function main() {
    const tenantIdArg = process.argv[2];
    const aplicar = process.argv.includes("--aplicar");
    if (!tenantIdArg || !Types.ObjectId.isValid(tenantIdArg)) {
        console.error("Falta el tenantId. Uso: npx tsx src/scripts/bancoDeDiasFase1.ts <tenantId> [--aplicar]");
        process.exit(1);
    }
    const tenantId = new Types.ObjectId(tenantIdArg);
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    console.log(`Base: ${env.MONGO_DB_NAME}${aplicar ? "" : "   (simulación: no se escribe nada)"}\n`);
    /* ── 1. La cuenta COMPENSATORIO ── */
    const yaEsta = await LeaveAccount.findOne({ tenantId, code: "COMPENSATORIO" }).lean();
    if (yaEsta) {
        console.log("=  La cuenta COMPENSATORIO ya existe. No se toca.");
    }
    else if (!aplicar) {
        console.log("+  Se crearía la cuenta COMPENSATORIO (por_evento, días, arrastre apagado).");
    }
    else {
        await LeaveAccount.create({
            tenantId,
            code: "COMPENSATORIO",
            name: "Compensatorios",
            description: "Días que se ganan por trabajar en día no laborable o feriado, y se consumen al tomarlos.",
            order: 10,
            isActive: true,
            unit: "dias",
            // `por_evento`: no se acredita sola cada período; la acredita la novedad que la genera.
            accrual: { mode: "por_evento", periodo: "calendario" },
            carryover: { permite: false },
            // Se deja ir a negativo y se avisa: bloquear en silencio esconde el problema en vez de mostrarlo.
            allowNegative: true,
        });
        console.log("+  Cuenta COMPENSATORIO creada.");
    }
    /* ── 2. El tipo por id en los renglones ya cargados ── */
    const tipos = await RequestConfig.find({ tenantId }).select("_id name").lean();
    const normalizar = (x) => String(x).trim().toLowerCase();
    const idPorNombre = new Map(tipos.map((t) => [normalizar(t.name), t._id]));
    /*
      NOMBRES QUE QUEDARON ESCRITOS DISTINTO PERO SON EL MISMO TIPO.
  
      La app mobile, cuando suma a alguien que no es del proyecto y no eligió un tipo, escribe el
      motivo como "Presente (Adicional)"; el tipo del ABM —y lo que muestra la web— se llama
      "Otros Presentes". Son lo mismo, confirmado con el usuario. Sin esta equivalencia esos
      renglones quedarían sin tipo y el banco de días no los vería nunca.
  
      Sólo traduce para poder encontrar el tipo: no renombra nada. El texto de absenceReason se
      deja tal cual quedó cargado ese día.
    */
    const EQUIVALENCIAS = {
        "presente (adicional)": "otros presentes",
        "presente adicional": "otros presentes",
        adicional: "otros presentes",
    };
    const buscarTipo = (motivo) => {
        const clave = normalizar(motivo);
        return idPorNombre.get(clave) || idPorNombre.get(EQUIVALENCIAS[clave] || "");
    };
    console.log(`\nTipos en el ABM: ${tipos.length}`);
    const partes = await Request.find({ tenantId, "attendance.0": { $exists: true } }).select("attendance").lean();
    let renglones = 0;
    let conTipo = 0;
    let mapeados = 0;
    const sinMapear = new Map();
    const cambios = [];
    for (const parte of partes) {
        let tocado = false;
        const nuevos = (parte.attendance || []).map((r) => {
            renglones++;
            if (r.typeId) {
                conTipo++;
                return r;
            }
            const motivo = String(r.absenceReason || "").trim();
            /*
              Sin motivo son los PRESENTES y las horas extra: no son una novedad de un tipo, así que no hay
              nada que mapear. Las horas extra quedan sin tipo a propósito —nunca lo guardaron— y de acá en
              más lo van a traer desde la app.
            */
            if (!motivo)
                return r;
            const id = buscarTipo(motivo);
            if (!id) {
                sinMapear.set(motivo, (sinMapear.get(motivo) || 0) + 1);
                return r;
            }
            mapeados++;
            tocado = true;
            return { ...r, typeId: id };
        });
        if (tocado)
            cambios.push({ _id: parte._id, attendance: nuevos });
    }
    console.log(`Partes con asistencia: ${partes.length}`);
    console.log(`  renglones:            ${renglones}`);
    console.log(`  ya tenían typeId:     ${conTipo}`);
    console.log(`  se mapean por nombre: ${mapeados}  (en ${cambios.length} partes)`);
    if (sinMapear.size > 0) {
        console.log(`  SIN MAPEAR — el motivo no coincide con ningún tipo del ABM:`);
        [...sinMapear.entries()].sort((a, b) => b[1] - a[1]).forEach(([motivo, n]) => console.log(`      "${motivo}" → ${n} renglones`));
    }
    if (!aplicar) {
        console.log("\nNada se escribió. Con --aplicar se guarda.");
        await mongoose.disconnect();
        return;
    }
    // De a 200 para no mandar 720 operaciones en un solo comando.
    for (let i = 0; i < cambios.length; i += 200) {
        const lote = cambios.slice(i, i + 200);
        await Request.bulkWrite(lote.map((c) => ({ updateOne: { filter: { _id: c._id }, update: { $set: { attendance: c.attendance } } } })));
    }
    console.log(`\nListo: ${cambios.length} partes actualizados.`);
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});

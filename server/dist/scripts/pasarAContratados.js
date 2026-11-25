import mongoose from "mongoose";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Contrato } from "../models/Contrato.js";
import { Info } from "../models/Info.js";
import { quedaContratadoAlCrearse, tipoEnviaAFirmar } from "../compartido/estadosFirma.js";
import { estadoContratado, copiarConstanciaAContratados } from "../services/contratadoDirecto.js";
/**
 * LOS CONTRATOS QUE YA EXISTÍAN DE TIPOS SIN FIRMA NI ALTA, A «CONTRATADOS».
 *
 * Desde el 28/10/2026 un contrato nuevo de un tipo que no manda nada a firmar y no genera alta de
 * ARCA se guarda directo en el estado final (`services/contratadoDirecto.ts`). Los cargados antes
 * quedaron en los pasos 1 o 2 de Gestión de Contratos. Este script los lista y, con APLICAR=1, los
 * mueve. Sólo contratos de WeProdu (solicitud o «Agregar miembro») y sólo hacia adelante en el flujo.
 *
 * MISMA REGLA QUE AL CREAR (`quedaContratadoAlCrearse`): los de Servicios (constancia de CUIT) se quedan
 * en el Paso 2 hasta validar el CUIT (14/11/2026), salvo que el tipo tenga apagado «Valida el CUIT en
 * ARCA antes de Contratos» (25/11/2026). Los que se quedan por eso se listan aparte, por tipo, para que
 * se vea qué destrabaría apagar el check en ese tipo.
 *
 *   npm run contratos:pasar-a-contratados            (solo lectura: lista lo que movería)
 *   APLICAR=1 npm run contratos:pasar-a-contratados  (escribe)
 */
const APLICAR = process.env.APLICAR === "1";
async function main() {
    const uri = process.env.MONGO_URI;
    const dbName = process.env.MONGO_DB_NAME;
    if (!uri || !dbName)
        throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
    await mongoose.connect(uri, { dbName });
    console.log(`Base ${dbName} · ${APLICAR ? "APLICANDO" : "solo lectura"}\n`);
    const destino = await estadoContratado();
    if (!destino?.data?.id)
        throw new Error("No hay un estado con la carpeta de firmados (propósito «firmados»): no se sabe cuál es «Contratados».");
    const ordenDestino = Number(destino.data.ordenDependencia) || 0;
    console.log(`Estado «Contratados»: ${destino.name} (id ${destino.data.id}, paso ${ordenDestino})`);
    const tipos = await Contrato.find().select("name data.requiereFirma data.requiereFirmaRelease data.requiereFirmaAlta data.validaCuit").lean();
    const sinFirma = tipos.filter((t) => !tipoEnviaAFirmar({ ...(t.data || {}), generaAlta: false }));
    console.log(`Tipos que no mandan nada a firmar: ${sinFirma.map((t) => t.name).join(", ") || "ninguno"}\n`);
    if (!sinFirma.length)
        return;
    const estados = await Info.find({ type: "estado-empleado" }).select("name data.id data.tipoImpositivo data.ordenDependencia").lean();
    const estadoPorId = new Map(estados.map((e) => [Number(e.data?.id), e]));
    const tipoIds = sinFirma.map((t) => t._id);
    const tipoPorId = new Map(sinFirma.map((t) => [String(t._id), t]));
    /** Por tipo: cuántos se quedan en Constancia de CUIT porque el tipo valida el CUIT. */
    const seQuedan = new Map();
    const ups = await UserProject.find({ contracts: { $elemMatch: { contrato_id: { $in: tipoIds } } } });
    const nombres = new Map((await User.find({ _id: { $in: ups.map((u) => u.userId) } }).select("firstName lastName").lean()).map((u) => [String(u._id), `${u.lastName || ""}, ${u.firstName || ""}`]));
    let total = 0;
    for (const up of ups) {
        let cambio = false;
        const aCopiar = [];
        up.contracts.forEach((c, i) => {
            if (!tipoIds.some((id) => String(id) === String(c.contrato_id)))
                return;
            if (!(c.solicitudId || c.origen === "agregar_miembro"))
                return;
            if (Number(c.estado_id) === Number(destino.data.id))
                return;
            const actual = estadoPorId.get(Number(c.estado_id));
            if ((Number(actual?.data?.ordenDependencia) || 0) >= ordenDestino)
                return; // sólo hacia adelante
            const tipo = tipoPorId.get(String(c.contrato_id));
            if (!quedaContratadoAlCrearse(tipo?.data || {}, actual?.data?.tipoImpositivo)) {
                // Sigue el circuito: genera alta, o es de Servicios y su tipo valida el CUIT.
                if (actual?.data?.tipoImpositivo === "constancia_cuit") {
                    const k = tipo?.name || String(c.contrato_id);
                    seQuedan.set(k, (seQuedan.get(k) || 0) + 1);
                }
                return;
            }
            total += 1;
            console.log(`  ${nombres.get(String(up.userId)) || up.userId} · ${up.nombre_proyecto || up.projectId} · contrato ${i} · ${c.nombre_contrato || ""} · ${c.nombre_estado_empleado || "sin estado"} → ${destino.name}`);
            if (APLICAR) {
                up.contracts[i] = { ...c.toObject(), estado_id: destino.data.id, nombre_estado_empleado: destino.name };
                cambio = true;
                aCopiar.push(c);
            }
        });
        if (cambio) {
            up.markModified("contracts");
            await up.save();
            // La constancia, también a «Contratados sin firma» (como al pasar en el momento).
            for (const c of aCopiar) {
                const r = await copiarConstanciaAContratados(up.projectId, c);
                console.log(`    constancia: ${r.path ? `copiada a ${r.path}` : `no se copió (${r.motivo})`}`);
            }
        }
    }
    if (seQuedan.size > 0) {
        console.log("\nSe quedan en Constancia de CUIT porque su tipo valida el CUIT (apagar «Valida el CUIT en ARCA antes de Contratos» en el tipo los destraba):");
        for (const [nombre, n] of seQuedan)
            console.log(`  ${nombre}: ${n} contrato(s)`);
    }
    console.log(`\n${total} contrato(s) ${APLICAR ? "movidos" : "se moverían"} a ${destino.name}.`);
}
main()
    .then(() => mongoose.disconnect())
    .catch(async (e) => {
    console.error(e?.message || e);
    await mongoose.disconnect().catch(() => { });
    process.exit(1);
});

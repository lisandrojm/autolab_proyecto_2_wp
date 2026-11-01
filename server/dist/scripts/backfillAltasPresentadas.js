/**
 * BACKFILL: LAS ALTAS YA PRESENTADAS EN ARCA PASAN A GENERAR DOCUMENTOS (01/11/2026).
 *
 * Desde hoy, apenas ARCA confirma el alta el contrato avanza solo (`avanzarPresentada` en
 * `services/arca/corridaAltas.ts`). Los contratos presentados ANTES de ese cambio siguen en el trámite
 * impositivo («Pedido de AFIP») esperando la constancia: este script los avanza igual, con la misma
 * regla (`aplicarTransicion`: sólo hacia adelante, y los tipos que no se firman van a Contratados).
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/backfillAltasPresentadas.ts            # muestra qué haría
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/backfillAltasPresentadas.ts --aplicar  # lo hace
 *
 * Al 01/11/2026 eran 34 contratos, todos en «Pedido de AFIP».
 */
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Info } from "../models/Info.js";
import UserProject from "../models/UserProject.js";
import { aplicarTransicion, estadoDestinoPorProposito } from "../services/estadoTransicionAutomaticaService.js";
async function main() {
    const aplicar = process.argv.includes("--aplicar");
    await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
    const destino = await estadoDestinoPorProposito("alta_temprana");
    if (!destino)
        throw new Error("No hay un estado con la carpeta de propósito «alta_temprana»: no sé a dónde avanzar.");
    const ordenDestino = Number(destino.data?.ordenDependencia);
    const estados = await Info.find({ type: "estado-empleado" }).select("name data.id data.ordenDependencia").lean();
    const ordenDe = new Map(estados.map((e) => [Number(e.data?.id), Number(e.data?.ordenDependencia ?? -1)]));
    console.log(`Destino: «${destino.name}» (id ${destino.data?.id}).`);
    const ups = await UserProject.find({ "contracts.altaArcaPresentada.resultado": "presentada" });
    let candidatos = 0;
    let movidos = 0;
    for (const up of ups) {
        for (let i = 0; i < up.contracts.length; i++) {
            const c = up.contracts[i];
            if (c?.altaArcaPresentada?.resultado !== "presentada")
                continue;
            if ((ordenDe.get(Number(c.estado_id)) ?? -1) >= ordenDestino)
                continue;
            candidatos++;
            const linea = `${up.userId} #${i} · alta ${String(c.fecha_alta_contrato).slice(0, 10)} · «${c.nombre_estado_empleado}»`;
            if (!aplicar) {
                console.log(`  avanzaría  ${linea}`);
                continue;
            }
            const r = await aplicarTransicion(up, i, destino);
            if (r.aplicada)
                movidos++;
            console.log(`  ${r.aplicada ? `→ «${r.estadoNuevo?.nombre}»` : `sin cambio (${r.motivo})`}  ${linea}`);
        }
    }
    console.log(aplicar ? `\n${movidos} de ${candidatos} contratos avanzaron.` : `\n${candidatos} contratos avanzarían. Nada se escribió: con --aplicar se hace.`);
    await mongoose.disconnect();
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});

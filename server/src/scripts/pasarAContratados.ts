import mongoose from "mongoose";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Contrato } from "../models/Contrato.js";
import { Info } from "../models/Info.js";
import { tipoEnviaAFirmar } from "../compartido/estadosFirma.js";
import { estadoContratado } from "../services/contratadoDirecto.js";

/**
 * LOS CONTRATOS QUE YA EXISTÍAN DE TIPOS SIN FIRMA NI ALTA, A «CONTRATADOS».
 *
 * Desde el 28/10/2026 un contrato nuevo de un tipo que no manda nada a firmar y no genera alta de
 * ARCA se guarda directo en el estado final (`services/contratadoDirecto.ts`). Los cargados antes
 * quedaron en los pasos 1 o 2 de Gestión de Contratos. Este script los lista y, con APLICAR=1, los
 * mueve. Sólo contratos de WeProdu (solicitud o «Agregar miembro») y sólo hacia adelante en el flujo.
 *
 *   npm run contratos:pasar-a-contratados            (solo lectura: lista lo que movería)
 *   APLICAR=1 npm run contratos:pasar-a-contratados  (escribe)
 */
const APLICAR = process.env.APLICAR === "1";

async function main() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME;
  if (!uri || !dbName) throw new Error("Faltan MONGO_URI / MONGO_DB_NAME");
  await mongoose.connect(uri, { dbName });
  console.log(`Base ${dbName} · ${APLICAR ? "APLICANDO" : "solo lectura"}\n`);

  const destino: any = await estadoContratado();
  if (!destino?.data?.id) throw new Error("No hay un estado con la carpeta de firmados (propósito «firmados»): no se sabe cuál es «Contratados».");
  const ordenDestino = Number(destino.data.ordenDependencia) || 0;
  console.log(`Estado «Contratados»: ${destino.name} (id ${destino.data.id}, paso ${ordenDestino})`);

  const tipos: any[] = await Contrato.find().select("name data.requiereFirma data.requiereFirmaRelease data.requiereFirmaAlta").lean();
  const sinFirma = tipos.filter((t) => !tipoEnviaAFirmar({ ...(t.data || {}), generaAlta: false }));
  console.log(`Tipos que no mandan nada a firmar: ${sinFirma.map((t) => t.name).join(", ") || "ninguno"}\n`);
  if (!sinFirma.length) return;

  const estados: any[] = await Info.find({ type: "estado-empleado" }).select("name data.id data.tipoImpositivo data.ordenDependencia").lean();
  const estadoPorId = new Map(estados.map((e) => [Number(e.data?.id), e]));
  const tipoIds = sinFirma.map((t) => t._id);

  const ups: any[] = await UserProject.find({ contracts: { $elemMatch: { contrato_id: { $in: tipoIds } } } });
  const nombres = new Map((await User.find({ _id: { $in: ups.map((u) => u.userId) } }).select("firstName lastName").lean()).map((u: any) => [String(u._id), `${u.lastName || ""}, ${u.firstName || ""}`]));
  let total = 0;
  for (const up of ups) {
    let cambio = false;
    up.contracts.forEach((c: any, i: number) => {
      if (!tipoIds.some((id) => String(id) === String(c.contrato_id))) return;
      if (!(c.solicitudId || c.origen === "agregar_miembro")) return;
      if (Number(c.estado_id) === Number(destino.data.id)) return;
      const actual = estadoPorId.get(Number(c.estado_id));
      if (actual?.data?.tipoImpositivo === "alta_temprana_afip") return; // genera alta: sigue el circuito
      if ((Number(actual?.data?.ordenDependencia) || 0) >= ordenDestino) return; // sólo hacia adelante
      total += 1;
      console.log(`  ${nombres.get(String(up.userId)) || up.userId} · ${up.nombre_proyecto || up.projectId} · contrato ${i} · ${c.nombre_contrato || ""} · ${c.nombre_estado_empleado || "sin estado"} → ${destino.name}`);
      if (APLICAR) {
        up.contracts[i] = { ...c.toObject(), estado_id: destino.data.id, nombre_estado_empleado: destino.name };
        cambio = true;
      }
    });
    if (cambio) {
      up.markModified("contracts");
      await up.save();
    }
  }
  console.log(`\n${total} contrato(s) ${APLICAR ? "movidos" : "se moverían"} a ${destino.name}.`);
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (e) => {
    console.error(e?.message || e);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });

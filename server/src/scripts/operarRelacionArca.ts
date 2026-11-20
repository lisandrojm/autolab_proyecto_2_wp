/**
 * BAJA, MODIFICACIÓN O ANULACIÓN DE UNA RELACIÓN LABORAL EN ARCA, desde la línea de comandos (20/11/2026).
 *
 * EN SECO POR DEFECTO, en dos niveles:
 *   · sin `--arca`: arma el PLAN con la base y el espejo de Relaciones Laborales y lo imprime. No abre ARCA.
 *   · con `--arca`: además entra a ARCA, lee la relación en vivo, completa el formulario, muestra exactamente lo
 *     que mandaría y lo CANCELA. Nada queda en ARCA.
 *   · con `--arca --enviar`: confirma. Es el único camino que escribe en el organismo (y `ARCA_ALTAS_EN_SECO=true`
 *     lo vuelve a dejar en seco aunque se pida).
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/operarRelacionArca.ts \
 *       --tenant <slug|id> --op baja --up <userProjectId> (--key <contratoKey> | --idx <posición>) \
 *       --situacion 99 [--fecha-fin 2026-11-30] [--telegrama 2026-11-15] [--arca] [--enviar]
 *
 *   --op modificacion --cambio fechaFin=2026-12-15 --cambio retribucion=1500000 [--cambio obraSocial=120900 --os-texto "O.S. …"]
 *   --op anulacion --que alta|baja
 *
 * El resultado queda como siempre: marca en el contrato (auditada), registro en arca_altas_logs, y acá en consola.
 */
import mongoose from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { contextoDeScript } from "../utils/contextoAuditoria.js";
import { arrancarOperacionRelacion, corridaOperacionDe } from "../services/arca/corridaOperacionRelacion.js";
import { OperacionInvalida, planOperacion } from "../services/arca/operacionRelacion.js";
import { type TipoOperacion } from "../services/arca/reglasOperacionRelacion.js";

const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const args = (n: string) => process.argv.map((a, i) => (a === n ? process.argv[i + 1] : null)).filter((v): v is string => !!v);
const flag = (n: string) => process.argv.includes(n);
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const op = String(arg("--op") || "") as TipoOperacion;
  if (!["baja", "modificacion", "anulacion"].includes(op)) throw new Error("Falta --op baja|modificacion|anulacion.");
  const tenantRef = arg("--tenant") || "";
  const userProjectId = arg("--up") || "";
  const contratoKey = arg("--key") || null;
  const idx = arg("--idx");
  if (!tenantRef || !userProjectId || (!contratoKey && idx === undefined)) throw new Error("Faltan --tenant, --up y (--key o --idx).");
  const datos: any =
    op === "baja"
      ? { fechaFin: arg("--fecha-fin"), situacionBaja: arg("--situacion") || "", fechaTelegrama: arg("--telegrama") }
      : op === "modificacion"
        ? { cambios: Object.fromEntries(args("--cambio").map((c) => c.split("=").map((s) => s.trim())).filter((p) => p.length === 2 && p[0])), obraSocialTexto: arg("--os-texto") }
        : { que: arg("--que") };
  const aArca = flag("--arca");
  const enviar = flag("--enviar");

  await mongoose.connect(process.env.MONGO_URI!, { dbName: process.env.MONGO_DB_NAME });
  const tenant: any = mongoose.isValidObjectId(tenantRef) ? await Tenant.findById(tenantRef).lean() : await Tenant.findOne({ slug: tenantRef }).lean();
  if (!tenant) throw new Error(`No encontré el tenant ${tenantRef}`);
  contextoDeScript("operarRelacionArca", { motivo: `${op} en ARCA desde la línea de comandos${enviar ? " (--enviar)" : " (en seco)"}` });

  const ref = { userProjectId, contratoKey, contractIndex: idx !== undefined ? Number(idx) : null };
  const { plan, contexto, hoy } = await planOperacion(tenant._id, { op, ref, datos });
  console.log(`\n${aArca ? (enviar ? "MODO ENVÍO" : "EN SECO CONTRA ARCA") : "SÓLO PLAN (sin abrir ARCA)"} · hoy ${hoy}`);
  console.log(`persona: ${contexto.persona.nombre} · CUIL …${contexto.persona.cuil.slice(-4)} · empleadora ${contexto.empresa.razonSocial} (${contexto.empresa.cuit})`);
  console.log(`contrato: ${contexto.contrato.nombre_contrato} ${contexto.contrato.alta} → ${contexto.contrato.baja || "sin baja"} · clave ${contexto.contrato.contratoKey || `posición ${contexto.contrato.posicion}`} · estado ${contexto.contrato.estadoContrato || "-"}`);
  console.log(`espejo ARCA: ${contexto.espejo ? `inicio ${contexto.espejo.inicio} → ${contexto.espejo.fin || "abierta"}${contexto.espejo.situacionBaja ? ` (${contexto.espejo.situacionBaja})` : ""} · sincronizado ${contexto.espejo.sincronizadoEl || "?"}` : "sin relación con ese inicio"}`);
  console.log(`marcas: alta ${contexto.contrato.marcas.alta?.resultado || "-"} · baja ${contexto.contrato.marcas.baja?.resultado || "-"} · modificación ${contexto.contrato.marcas.modificacion?.resultado || "-"} · anulación ${contexto.contrato.marcas.anulacion?.resultado || "-"}`);
  console.log(`\nPLAN (${op}): ${plan.puede ? "SE PUEDE MANDAR" : `NO: ${plan.motivo}`}`);
  console.log(`  payload: ${JSON.stringify(plan.payload)}${contexto.situacionTexto ? ` · motivo «${contexto.situacionTexto}»` : ""}`);
  for (const a of plan.avisos) console.log(`  aviso: ${a}`);
  if (!plan.puede || !aArca) {
    if (plan.puede) console.log("\nCon --arca entra a ARCA en seco (completa y cancela); con --arca --enviar confirma.");
    return;
  }

  const r = await arrancarOperacionRelacion({ tenantId: String(tenant._id), tenantObjectId: tenant._id, op, ref, datos, confirmar: enviar });
  console.log(`\nCorrida arrancada ${r.enSeco ? "EN SECO" : "DE VERDAD"}.`);
  let vistos = 0;
  for (;;) {
    const c = corridaOperacionDe(String(tenant._id));
    if (!c) break;
    for (const e of c.eventos.slice(vistos)) console.log(`  · ${JSON.stringify(e).slice(0, 400)}`);
    vistos = c.eventos.length;
    if (c.terminada) {
      const x = c.resultado;
      console.log(`\nRESULTADO: ${x?.resultado || "?"}${x?.clase ? ` (${x.clase})` : ""}${x?.motivo ? ` · ${x.motivo}` : ""}`);
      if (x?.acuse && Object.keys(x.acuse).length) console.log(`acuse: ${JSON.stringify(x.acuse)}`);
      if (x?.payload) console.log(`enviado: ${JSON.stringify(x.payload)}`);
      if (c.logId) console.log(`registro: arca_altas_logs ${c.logId}`);
      break;
    }
    await esperar(1500);
  }
}

main()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch(async (e) => {
    if (e instanceof OperacionInvalida) console.error(`NO SE PUEDE: ${e.message}`);
    else console.error(e?.message || e);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });

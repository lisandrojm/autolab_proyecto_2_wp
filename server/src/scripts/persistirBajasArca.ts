/**
 * MIGRACIÓN: LLEVAR A LOS CONTRATOS LAS BAJAS QUE ARCA YA TIENE (etapa 3, paso 2, 19/11/2026).
 *
 *   TENANT_SLUG=<slug> ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/persistirBajasArca.ts [--commit] [--detalle]
 *   En el VPS: NODE_ENV=production node dist/scripts/persistirBajasArca.js [--commit] [--detalle]
 *   (sin TENANT_SLUG, todos los tenants; con CLAVES=<contratoKey,…> el --commit escribe sólo esos)
 *
 * Es lo mismo que el botón «Sincronizar bajas» de la pestaña Antigüedad ARCA, para todos de una vez:
 * `services/arca/bajasArcaContratos.ts`. Sólo con evidencia fuerte (misma persona, empleadora y fecha de
 * alta exacta); lo demás no se toca. Dry-run por defecto. Auditado (cada contrato deja su evento, con este
 * script como autor). Se deshace contrato por contrato con la auditoría: `bajaArca.bajaAnterior` guarda
 * la baja que tenía.
 *
 * Al terminar recalcula la sección D (`bajasSoloEnMemoria`): lo que la validación aplica en memoria y
 * el contrato no tiene escrito. También en dry-run.
 *
 * También lista lo que NO se escribe y alguien tiene que mirar: ARCA terminó después que el contrato, y
 * contratos terminados que en ARCA siguen abiertos (falta presentar la baja en ARCA).
 */
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { Tenant } from "../models/Tenant.js";
import { aplicarBajasArca, planDeBajasArca, type ItemBajaArca } from "../services/arca/bajasArcaContratos.js";
import { bajasSoloEnMemoria, imprimirSeccionD } from "../services/arca/bajasSoloEnMemoria.js";
import { UMBRAL_GRANULARIDAD_DIAS } from "../utils/bajasArcaContrato.js";
import { contextoDeScript } from "../utils/contextoAuditoria.js";

const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const fila = (x: ItemBajaArca) => `${x.diasAntesDelFin !== undefined ? `[${x.diasAntesDelFin} d antes] ` : ""}${x.persona} (${x.cuil}) · ${x.proyecto} · #${x.posicion} ${x.contrato} · ${x.empleadora} · alta ${x.alta} · baja WeProdu ${x.bajaContrato || "—"} · ARCA ${x.finArca || "abierta"}${x.situacionBaja ? ` (${x.situacionBaja})` : ""}`;

async function main() {
  const commit = process.argv.includes("--commit");
  const detalle = process.argv.includes("--detalle");
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  contextoDeScript("persistirBajasArca", { motivo: "Migración etapa 3 paso 2: bajas de ARCA con evidencia fuerte" });
  console.log(commit ? "MODO COMMIT: escribe.\n" : "DRY-RUN: no escribe nada (con --commit escribe).\n");
  const slug = process.env.TENANT_SLUG;
  const tenants: any[] = await Tenant.find(slug ? { slug } : {}).select("slug name").lean();
  for (const t of tenants) {
    const plan = await planDeBajasArca(t._id);
    if (!plan.items.length) continue;
    console.log(`== ${t.name || t.slug} · espejo de ARCA al ${plan.espejoAl ? new Date(plan.espejoAl).toLocaleString("es-AR") : "¿nunca?"} · hoy ${plan.hoy}`);
    console.log(`   se escriben: ${plan.resumen.baja_nueva} sin baja que ARCA cerró · ${plan.resumen.baja_por_tramos} sin baja, ARCA en tramos contiguos cerrados · ${plan.resumen.baja_anterior} con baja posterior a la de ARCA (por un hecho)`);
    console.log(`   no se escriben: ${plan.resumen.arca_granularidad} ARCA declara por jornadas dentro del contrato · ${plan.resumen.revision_manual} para revisar a mano · ${plan.resumen.arca_abierta} terminados que en ARCA siguen abiertos · ${plan.resumen.arca_posterior} ARCA terminó después (${plan.items.filter((x) => x.tipo === "arca_posterior" && dias(x.bajaContrato, x.finArca) <= 3).length} por 1 a 3 días, lo habitual en jornadas)`);
    const grupo = (titulo: string, l: ItemBajaArca[]) => {
      if (!l.length) return;
      console.log(`\n   ${titulo} (${l.length}):`);
      for (const x of detalle ? l : l.slice(0, 40)) {
        console.log(`     - ${fila(x)}`);
        if (x.tramos && (detalle || x.tipo !== "arca_granularidad")) for (const tr of x.tramos) console.log(`         tramo ARCA ${tr.inicio} → ${tr.fin || "abierta"}${tr.situacionBaja ? ` (${tr.situacionBaja})` : ""}`);
      }
      if (!detalle && l.length > 40) console.log(`     … y ${l.length - 40} más (--detalle)`);
    };
    grupo("SE ESCRIBE: sin baja y ARCA la cerró", plan.items.filter((x) => x.tipo === "baja_nueva"));
    grupo("SE ESCRIBE: sin baja, ARCA en tramos contiguos con el último cerrado (fin del último tramo)", plan.items.filter((x) => x.tipo === "baja_por_tramos"));
    grupo("SE ESCRIBE: ARCA terminó antes que la baja del contrato, por un hecho", plan.items.filter((x) => x.tipo === "baja_anterior"));
    grupo("NO, REVISIÓN MANUAL: tramos fuera del período del contrato o un hecho entre tramos", plan.items.filter((x) => x.tipo === "revision_manual"));
    grupo("NO: ARCA declara por jornadas («vencimiento») dentro del contrato; manda el plazo del contrato", plan.items.filter((x) => x.tipo === "arca_granularidad" && (x.diasAntesDelFin ?? 0) <= UMBRAL_GRANULARIDAD_DIAS));
    grupo(`MIRAR: granularidad, pero el último tramo de ARCA termina más de ${UMBRAL_GRANULARIDAD_DIAS} días antes que el contrato (¿dejó antes?)`, plan.items.filter((x) => x.tipo === "arca_granularidad" && (x.diasAntesDelFin ?? 0) > UMBRAL_GRANULARIDAD_DIAS));
    grupo("NO: ARCA terminó más de 3 días después que el contrato", plan.items.filter((x) => x.tipo === "arca_posterior" && dias(x.bajaContrato, x.finArca) > 3));
    grupo("NO: el contrato terminó y en ARCA sigue abierta (falta la baja en ARCA)", plan.items.filter((x) => x.tipo === "arca_abierta"));
    if (commit) {
      // CLAVES=<contratoKey,…>: escribe sólo esos (para aplicar de a uno lo decidido).
      const claves = process.env.CLAVES ? process.env.CLAVES.split(",").map((x) => x.trim()).filter(Boolean) : undefined;
      const r = await aplicarBajasArca(t._id, { claves });
      console.log(`\n   ✔ escritas ${r.escritos.length}${r.cambiaron.length ? ` · ${r.cambiaron.length} cambiaron entre la lectura y la escritura (no se tocaron)` : ""}`);
    }
    console.log("");
  }
  // Siempre, también en dry-run: el hueco entre lo que la validación aplica en memoria y lo que se
  // escribió se vuelve a abrir con cada novedad de ARCA (pedido del usuario, 19/11).
  imprimirSeccionD(await bajasSoloEnMemoria(), detalle);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

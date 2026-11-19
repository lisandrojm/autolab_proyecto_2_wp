/**
 * MIGRACIÓN: LLEVAR A LOS CONTRATOS LAS BAJAS QUE ARCA YA TIENE (etapa 3, paso 2, 19/11/2026).
 *
 *   TENANT_SLUG=<slug> ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/persistirBajasArca.ts [--commit] [--detalle]
 *   En el VPS: NODE_ENV=production node dist/scripts/persistirBajasArca.js [--commit] [--detalle]
 *   (sin TENANT_SLUG, todos los tenants)
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
import { contextoDeScript } from "../utils/contextoAuditoria.js";

const dias = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const fila = (x: ItemBajaArca) => `${x.persona} (${x.cuil}) · ${x.proyecto} · #${x.posicion} ${x.contrato} · ${x.empleadora} · alta ${x.alta} · baja WeProdu ${x.bajaContrato || "—"} · ARCA ${x.finArca || "abierta"}${x.situacionBaja ? ` (${x.situacionBaja})` : ""}`;

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
    console.log(`   se escriben: ${plan.resumen.baja_nueva} sin baja que ARCA cerró · ${plan.resumen.baja_anterior} con baja posterior a la de ARCA`);
    console.log(`   no se escriben: ${plan.resumen.arca_por_tramos} ARCA por tramos · ${plan.resumen.arca_plazo_mas_corto} ARCA con un plazo más corto · ${plan.resumen.arca_abierta} terminados que en ARCA siguen abiertos · ${plan.resumen.arca_posterior} ARCA terminó después (${plan.items.filter((x) => x.tipo === "arca_posterior" && dias(x.bajaContrato, x.finArca) <= 3).length} por 1 a 3 días, lo habitual en jornadas)`);
    const grupo = (titulo: string, l: ItemBajaArca[]) => {
      if (!l.length) return;
      console.log(`\n   ${titulo} (${l.length}):`);
      for (const x of detalle ? l : l.slice(0, 40)) console.log(`     - ${fila(x)}`);
      if (!detalle && l.length > 40) console.log(`     … y ${l.length - 40} más (--detalle)`);
    };
    grupo("SE ESCRIBE: sin baja y ARCA la cerró", plan.items.filter((x) => x.tipo === "baja_nueva"));
    grupo("SE ESCRIBE: ARCA terminó antes que la baja del contrato", plan.items.filter((x) => x.tipo === "baja_anterior"));
    grupo("NO: ARCA lo declaró por tramos (otras relaciones dentro del contrato)", plan.items.filter((x) => x.tipo === "arca_por_tramos"));
    grupo("NO: ARCA venció el plazo antes que el contrato (revisar la declaración)", plan.items.filter((x) => x.tipo === "arca_plazo_mas_corto"));
    grupo("NO: ARCA terminó más de 3 días después que el contrato", plan.items.filter((x) => x.tipo === "arca_posterior" && dias(x.bajaContrato, x.finArca) > 3));
    grupo("NO: el contrato terminó y en ARCA sigue abierta (falta la baja en ARCA)", plan.items.filter((x) => x.tipo === "arca_abierta"));
    if (commit) {
      const r = await aplicarBajasArca(t._id);
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

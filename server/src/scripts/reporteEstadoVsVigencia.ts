/**
 * REPORTE, SÓLO LECTURA: `estadoContrato` contra la vigencia de hoy (etapa 3, 19/11/2026).
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- ./node_modules/.bin/tsx src/scripts/reporteEstadoVsVigencia.ts [--detalle]
 *   En el VPS: NODE_ENV=production node dist/scripts/reporteEstadoVsVigencia.js [--detalle]
 *
 * Se corre DESPUÉS de `migrarEstadoContrato` y ANTES de que los helpers de vigencia pasen a mirar el
 * estado (decisión del usuario): si todo coincide, el cambio es seguro; cada diferencia es una pregunta
 * que se contesta antes, no un alta que alguien no puede dar en producción.
 *
 * Compara, para cada contrato no anulado:
 *  A. ¿rige hoy? con la lógica vieja (`esContratoVigente`: fechas, «sin baja» = abierto) y con la nueva
 *     (`rigeHoySegunEstado`: estado VIGENTE + fechas);
 *  B. el estado guardado contra el que darían hoy sus datos (un VIGENTE cuya baja ya pasó, uno sin
 *     estado porque se creó o se reemplazó después de la migración);
 * y para cada vínculo:
 *  C. el contrato que RIGE (`getContratoActivo`) con la vieja y con la nueva: es lo que usan el equipo,
 *     las altas y la superposición.
 *  D. LAS BAJAS DE ARCA QUE SÓLO EXISTEN EN MEMORIA: contratos a los que la validación de altas les aplica
 *     una baja de ARCA (`bajaDeArcaQueAplica`) que el contrato no tiene escrita. Mientras haya alguno,
 *     el paso 2 no está completo y los helpers NO pueden pasar a mirar sólo el estado: esas personas
 *     volverían a bloquear (decisión del usuario, 19/11).
 * Y lista todos los SIN_DETERMINAR.
 *
 * `--simular`: antes de migrar, completa EN MEMORIA el estado de los contratos que no lo tienen (con la
 * misma regla que la migración) y compara. No escribe nada.
 */
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { esContratoVigente, fechaISO, getContratoActivo, hoyArgentina } from "../utils/contratoVigencia.js";
import { estadoSegunDatosLocales, rigeHoySegunEstado, tipoEsIndeterminado } from "../utils/estadoDeContrato.js";
import { bajaDeArcaQueAplica } from "../services/arca/altasVigentes.js";
import { cambioDeBajaSegunArca } from "../utils/bajasArcaContrato.js";

const db = () => mongoose.connection.db!;
const anulado = (c: any) => c?.estadoContrato === "ANULADO";

/** `getContratoActivo` con la vigencia nueva: misma prioridad, otro «vigente». */
function activoNuevo(contratos: any[], hoy: string): any | null {
  const vivos = contratos.filter((c) => !anulado(c));
  if (!vivos.length) return null;
  const clave = (c: any) => `${fechaISO(c.fecha_alta_contrato)}|${String(c.fecha_carga || "")}`;
  const masReciente = (l: any[]) => l.reduce((m, a) => (clave(a) >= clave(m) ? a : m));
  const vigentes = vivos.filter((c) => rigeHoySegunEstado(c, hoy));
  if (vigentes.length) {
    const abiertos = vigentes.filter((c) => !fechaISO(c.fecha_baja_contrato));
    return masReciente(abiertos.length ? abiertos : vigentes);
  }
  return masReciente(vivos);
}

async function main() {
  const detalle = process.argv.includes("--detalle");
  const simular = process.argv.includes("--simular");
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  const hoy = hoyArgentina();
  const tipos = await db().collection("contratos").find({}).project({ name: 1, "data.esTiempoIndeterminado": 1 }).toArray();
  const porId = new Map(tipos.map((t: any) => [String(t._id), !!t.data?.esTiempoIndeterminado]));
  const porNombre = new Map(tipos.map((t: any) => [String(t.name || "").trim().toLowerCase(), !!t.data?.esTiempoIndeterminado]));
  const ups = await db()
    .collection("users_&_projects")
    .find({})
    .project({ userId: 1, nombre_proyecto: 1, ...Object.fromEntries(["contratoKey", "estadoContrato", "estadoContratoMotivo", "fecha_alta_contrato", "fecha_baja_contrato", "fecha_carga", "contrato_id", "nombre_contrato", "empresaContratoId"].map((c) => [`contracts.${c}`, 1])) })
    .toArray();
  // Para D: CUIL de cada persona, CUIT de cada empresa y el espejo de ARCA.
  const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
  const cuilDe = new Map((await db().collection("users").find({ "metadata.cuit": { $exists: true } }).project({ "metadata.cuit": 1 }).toArray()).map((u: any) => [String(u._id), dig(u.metadata?.cuit)]));
  const cuitDe = new Map((await db().collection("companies").find({}).project({ cuit: 1 }).toArray()).map((e: any) => [String(e._id), dig(e.cuit)]));
  const isoD = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  const relsPorCuil = new Map<string, any[]>();
  for (const r of await db().collection("relaciones_laborales_arca").find({}).project({ cuil: 1, empleadoraCuit: 1, fechaInicio: 1, fechaFin: 1, situacionBaja: 1 }).toArray()) {
    const x = { cuil: r.cuil, empleadoraCuit: r.empleadoraCuit, inicio: isoD(r.fechaInicio), fin: isoD(r.fechaFin), situacionBaja: r.situacionBaja || "" };
    (relsPorCuil.get(x.cuil) || relsPorCuil.set(x.cuil, []).get(x.cuil)!).push(x);
  }
  const soloEnMemoria = new Map<string, string[]>();
  const nombres = new Map<string, string>();
  const nombreDe = async (id: any) => {
    const k = String(id);
    if (!nombres.has(k)) {
      const u: any = await db().collection("users").findOne({ _id: id }, { projection: { firstName: 1, lastName: 1 } });
      nombres.set(k, `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || k);
    }
    return nombres.get(k)!;
  };

  let total = 0;
  const porEstado = new Map<string, number>();
  const difVigencia: string[] = [];
  const difEstado: string[] = [];
  const difRige: string[] = [];
  const sinDeterminar: string[] = [];
  for (const up of ups) {
    const cs: any[] = up.contracts || [];
    if (simular) for (const c of cs) if (!c.estadoContrato) { const r = estadoSegunDatosLocales(c, tipoEsIndeterminado(c, porId, porNombre), hoy); c.estadoContrato = r.estado; if (r.motivo) c.estadoContratoMotivo = r.motivo; }
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (anulado(c)) continue;
      total++;
      const guardado = c.estadoContrato || "(sin estado)";
      porEstado.set(guardado, (porEstado.get(guardado) || 0) + 1);
      const quien = async () => `${await nombreDe(up.userId)} · ${up.nombre_proyecto || ""} · #${i} ${c.nombre_contrato || ""} · alta ${fechaISO(c.fecha_alta_contrato) || "—"} · baja ${fechaISO(c.fecha_baja_contrato) || "—"} · clave ${c.contratoKey}`;
      const viejo = esContratoVigente(c, hoy);
      const nuevo = rigeHoySegunEstado(c, hoy);
      if (viejo !== nuevo) difVigencia.push(`${await quien()} · vieja: ${viejo ? "rige" : "no rige"} · nueva: ${nuevo ? "rige" : "no rige"} · estado ${guardado}`);
      const hoyDaria = estadoSegunDatosLocales(c, tipoEsIndeterminado(c, porId, porNombre), hoy);
      if (c.estadoContrato !== hoyDaria.estado) difEstado.push(`${await quien()} · guardado ${guardado} · sus datos hoy dan ${hoyDaria.estado}${hoyDaria.motivo ? ` (${hoyDaria.motivo})` : ""}`);
      if (c.estadoContrato === "SIN_DETERMINAR") sinDeterminar.push(`${await quien()} · ${c.estadoContratoMotivo || "sin motivo"}`);
      // D. ¿La validación le aplica una baja de ARCA que el contrato no tiene escrita?
      const cuil = cuilDe.get(String(up.userId)) || "";
      const cuit = c.empresaContratoId ? cuitDe.get(String(c.empresaContratoId)) || "" : "";
      const rels = relsPorCuil.get(cuil) || [];
      const altaD = fechaISO(c.fecha_alta_contrato instanceof Date ? c.fecha_alta_contrato.toISOString() : c.fecha_alta_contrato);
      const bajaD = fechaISO(c.fecha_baja_contrato instanceof Date ? c.fecha_baja_contrato.toISOString() : c.fecha_baja_contrato);
      const enMemoria = bajaDeArcaQueAplica({ cuil, cuit, alta: altaD, baja: bajaD }, rels as any);
      if (enMemoria) {
        const porque = cambioDeBajaSegunArca(c, cuil, cuit, rels, hoy);
        const k = porque ? (porque.aplicar ? "falta escribirla (Sincronizar bajas la escribe)" : `no se escribe: ${porque.tipo}`) : "no se escribe: sin clasificar";
        (soloEnMemoria.get(k) || soloEnMemoria.set(k, []).get(k)!).push(`${await quien()} · la validación usa la baja ${enMemoria.fin}`);
      }
    }
    const v = getContratoActivo(cs as any[], hoy) as any;
    const n = activoNuevo(cs, hoy);
    if (String(v?.contratoKey ?? "") !== String(n?.contratoKey ?? "")) {
      const desc = (c: any) => (c ? `#${cs.indexOf(c)} ${c.nombre_contrato || ""} ${fechaISO(c.fecha_alta_contrato)}→${fechaISO(c.fecha_baja_contrato) || "abierto"} [${c.estadoContrato || "sin estado"}]` : "ninguno");
      difRige.push(`${await nombreDe(up.userId)} · ${up.nombre_proyecto || ""} · rige hoy con la vieja: ${desc(v)} · con la nueva: ${desc(n)}`);
    }
  }

  const listar = (titulo: string, l: string[]) => {
    console.log(`\n${titulo}: ${l.length}`);
    for (const x of detalle ? l : l.slice(0, 50)) console.log(`  - ${x}`);
    if (!detalle && l.length > 50) console.log(`  … y ${l.length - 50} más (--detalle)`);
  };
  if (simular) console.log("SIMULACIÓN: los estados que faltan se completaron en memoria con la regla de la migración. No se escribió nada.\n");
  console.log(`Hoy ${hoy} · contratos no anulados: ${total} · vínculos: ${ups.length}`);
  for (const [e, n] of [...porEstado].sort()) console.log(`  ${String(n).padStart(6)}  ${e}`);
  listar("A. Contratos donde «rige hoy» cambia de la lógica vieja a la nueva", difVigencia);
  listar("B. Contratos cuyo estado guardado no es el que dan hoy sus datos", difEstado);
  listar("C. Vínculos donde cambia el contrato que rige", difRige);
  const totalD = [...soloEnMemoria.values()].reduce((n, l) => n + l.length, 0);
  console.log(`\nD. Bajas de ARCA que la validación aplica en memoria y el contrato no tiene escritas: ${totalD}`);
  for (const [k, l] of soloEnMemoria) listar(`   ${k}`, l);
  listar("SIN_DETERMINAR (los resuelve una persona)", sinDeterminar);
  const ok = !difVigencia.length && !difRige.length;
  console.log(`\n${ok ? "✔ La vigencia nueva coincide con la vieja en todos los contratos y vínculos." : "✖ Hay diferencias: cada una se contesta antes de cambiar los helpers."}`);
  console.log(totalD ? `✖ Paso 2 incompleto: ${totalD} baja(s) de ARCA existen sólo en memoria. Los helpers no se tocan hasta resolverlas.` : "✔ Paso 2 completo: ninguna baja de ARCA existe sólo en memoria.");
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

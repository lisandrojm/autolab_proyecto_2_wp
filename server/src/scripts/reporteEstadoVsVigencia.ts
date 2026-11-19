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
import { bajasSoloEnMemoria, imprimirSeccionD } from "../services/arca/bajasSoloEnMemoria.js";

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
    .project({ userId: 1, nombre_proyecto: 1, ...Object.fromEntries(["contratoKey", "estadoContrato", "estadoContratoMotivo", "fecha_alta_contrato", "fecha_baja_contrato", "fecha_carga", "contrato_id", "nombre_contrato"].map((c) => [`contracts.${c}`, 1])) })
    .toArray();
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
  listar("SIN_DETERMINAR (los resuelve una persona)", sinDeterminar);
  const ok = !difVigencia.length && !difRige.length;
  console.log(`\n${ok ? "✔ La vigencia nueva coincide con la vieja en todos los contratos y vínculos." : "✖ Hay diferencias: cada una se contesta antes de cambiar los helpers."}`);
  imprimirSeccionD(await bajasSoloEnMemoria(hoy), detalle);

  // E. EL DETECTOR DE CAMINOS SIN ESTADO: lo que completó la barrida (la red) y la escritura anterior de
  // cada contrato, que es la que lo dejó sin estado. Si sube, apareció un camino nuevo (pedido del usuario).
  const aud = db().collection("auditoria_contratos");
  const completados = await aud.find({ detalle: "tarea initTransicionEstadoScheduler", motivo: /^Contrato sin estado/ }).project({ contratoKey: 1, el: 1 }).sort({ el: 1 }).toArray();
  const porDia = new Map<string, number>();
  const porCamino = new Map<string, number>();
  for (const e of completados) {
    const d = new Date(e.el).toISOString().slice(0, 10);
    porDia.set(d, (porDia.get(d) || 0) + 1);
    const previo: any = await aud.find({ contratoKey: e.contratoKey, el: { $lt: e.el }, detalle: { $ne: "tarea initTransicionEstadoScheduler" } }).sort({ el: -1 }).limit(1).next();
    const camino = previo ? `${previo.detalle || previo.origen} (${previo.operacion || "?"}, ${new Date(previo.el).toISOString().slice(0, 16)})` : "sin evento anterior";
    porCamino.set(camino, (porCamino.get(camino) || 0) + 1);
  }
  console.log(`\nE. Contratos que estuvieron sin estado y completó la barrida: ${completados.length}`);
  for (const [d, n] of porDia) console.log(`   ${d}: ${n}`);
  console.log("   qué escritura los dejó sin estado (el evento anterior de cada uno):");
  for (const [c, n] of [...porCamino].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(4)}  ${c}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());

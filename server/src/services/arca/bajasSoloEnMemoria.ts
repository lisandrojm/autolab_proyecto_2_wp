/**
 * SECCIÓN D: LAS BAJAS DE ARCA QUE SÓLO EXISTEN EN MEMORIA (etapa 3, 19/11/2026).
 *
 * Contratos a los que la validación de altas les aplica una baja de ARCA (`bajaDeArcaQueAplica`) que el
 * contrato no tiene escrita. Es el detector del hueco entre lo que el matcher resuelve en memoria y lo que
 * el persistidor (`bajasArcaContratos.ts`) escribe: se vuelve a abrir cada vez que ARCA trae algo que uno
 * resuelve de una forma y el otro de otra. Por eso lo corren el reporte (`reporteEstadoVsVigencia`) y
 * `persistirBajasArca` al terminar, siempre. Mientras D no esté en 0 (o decidida caso por caso), los
 * helpers de vigencia no se cambian (decisión del usuario).
 *
 * Sólo lee. Recorre todos los contratos de todos los tenants.
 */
import mongoose from "mongoose";
import { fechaISO, hoyArgentina } from "../../utils/contratoVigencia.js";
import { bajaDeArcaQueAplica } from "./altasVigentes.js";
import { cambioDeBajaSegunArca } from "../../utils/bajasArcaContrato.js";

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const isoD = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const fecha = (v: unknown) => fechaISO(v instanceof Date ? v.toISOString() : (v as any));

export interface BajaSoloEnMemoria {
  /** «falta escribirla (…)» o «no se escribe: <tipo>». */
  categoria: string;
  descripcion: string;
  contratoKey: string;
}

export async function bajasSoloEnMemoria(hoy = hoyArgentina()): Promise<BajaSoloEnMemoria[]> {
  const db = mongoose.connection.db!;
  const [ups, usuarios, empresas, relaciones] = await Promise.all([
    db.collection("users_&_projects").find({}).project({ userId: 1, nombre_proyecto: 1, ...Object.fromEntries(["contratoKey", "estadoContrato", "fecha_alta_contrato", "fecha_baja_contrato", "nombre_contrato", "empresaContratoId"].map((c) => [`contracts.${c}`, 1])) }).toArray(),
    db.collection("users").find({ "metadata.cuit": { $exists: true } }).project({ firstName: 1, lastName: 1, "metadata.cuit": 1 }).toArray(),
    db.collection("companies").find({}).project({ cuit: 1 }).toArray(),
    db.collection("relaciones_laborales_arca").find({}).project({ cuil: 1, empleadoraCuit: 1, fechaInicio: 1, fechaFin: 1, situacionBaja: 1 }).toArray(),
  ]);
  const persona = new Map(usuarios.map((u: any) => [String(u._id), { cuil: dig(u.metadata?.cuit), nombre: `${u.firstName || ""} ${u.lastName || ""}`.trim() }]));
  const cuitDe = new Map(empresas.map((e: any) => [String(e._id), dig(e.cuit)]));
  const relsPorCuil = new Map<string, any[]>();
  for (const r of relaciones) {
    const x = { cuil: r.cuil, empleadoraCuit: r.empleadoraCuit, inicio: isoD(r.fechaInicio), fin: isoD(r.fechaFin), situacionBaja: r.situacionBaja || "" };
    (relsPorCuil.get(x.cuil) || relsPorCuil.set(x.cuil, []).get(x.cuil)!).push(x);
  }
  const altasPorPersonaYEmpresa = new Map<string, string[]>();
  for (const up of ups) for (const c of up.contracts || []) {
    if (!c?.empresaContratoId || c.estadoContrato === "ANULADO") continue;
    const k = `${up.userId}|${c.empresaContratoId}`;
    (altasPorPersonaYEmpresa.get(k) || altasPorPersonaYEmpresa.set(k, []).get(k)!).push(fecha(c.fecha_alta_contrato));
  }
  const salida: BajaSoloEnMemoria[] = [];
  for (const up of ups) {
    const p = persona.get(String(up.userId));
    if (!p?.cuil) continue;
    const rels = relsPorCuil.get(p.cuil) || [];
    if (!rels.length) continue;
    (up.contracts || []).forEach((c: any, i: number) => {
      if (!c || c.estadoContrato === "ANULADO") return;
      const cuit = c.empresaContratoId ? cuitDe.get(String(c.empresaContratoId)) || "" : "";
      const alta = fecha(c.fecha_alta_contrato);
      const baja = fecha(c.fecha_baja_contrato);
      const todas = altasPorPersonaYEmpresa.get(`${up.userId}|${c.empresaContratoId}`) || [];
      const otrasAltas = todas.filter((_, n) => n !== todas.indexOf(alta));
      const enMemoria = bajaDeArcaQueAplica({ cuil: p.cuil, cuit, alta, baja }, rels as any, { otrasAltas, hoy });
      if (!enMemoria) return;
      const porque = cambioDeBajaSegunArca(c, p.cuil, cuit, rels, hoy, otrasAltas);
      salida.push({
        categoria: porque ? (porque.aplicar ? "falta escribirla (Sincronizar bajas la escribe)" : `no se escribe: ${porque.tipo}`) : "no se escribe: sin clasificar",
        descripcion: `${p.nombre || up.userId} · ${up.nombre_proyecto || ""} · #${i} ${c.nombre_contrato || ""} · alta ${alta || "—"} · baja ${baja || "—"} · clave ${c.contratoKey} · la validación usa la baja ${enMemoria.fin}`,
        contratoKey: String(c.contratoKey || ""),
      });
    });
  }
  return salida;
}

/** Desde que la validación usa la misma regla que la escritura (19/11), acá sólo puede quedar lo que falta
 *  escribir; las categorías «no se escribe» serían un desfase entre las dos y cuentan como pendientes. */
const DECIDIDAS = new Set<string>([]);

/** Imprime la sección D agrupada y devuelve cuántas quedan SIN decidir. */
export function imprimirSeccionD(lista: BajaSoloEnMemoria[], detalle = false): number {
  console.log(`\nD. Bajas de ARCA que la validación aplica en memoria y el contrato no tiene escritas: ${lista.length}`);
  const grupos = new Map<string, string[]>();
  for (const x of lista) (grupos.get(x.categoria) || grupos.set(x.categoria, []).get(x.categoria)!).push(x.descripcion);
  for (const [k, l] of grupos) {
    console.log(`\n   ${k}: ${l.length}`);
    for (const d of detalle ? l : l.slice(0, 50)) console.log(`  - ${d}`);
    if (!detalle && l.length > 50) console.log(`  … y ${l.length - 50} más (--detalle)`);
  }
  const pendientes = lista.filter((x) => !DECIDIDAS.has(x.categoria));
  if (lista.length > pendientes.length) console.log(`\n   (${lista.length - pendientes.length} decidida(s) por regla: no se escriben a propósito)`);
  console.log(pendientes.length ? `✖ Paso 2 incompleto: ${pendientes.length} baja(s) de ARCA existen sólo en memoria sin decidir. Los helpers no se tocan hasta resolverlas.` : "✔ Paso 2 completo: ninguna baja de ARCA en memoria queda sin escribir ni decidir.");
  return pendientes.length;
}

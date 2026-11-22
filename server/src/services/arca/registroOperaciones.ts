/**
 * LAS MARCAS DE UNA RELACIÓN EN EL REGISTRO DE OPERACIONES (22/11/2026).
 *
 * Una operación de Modificaciones y Bajas deja su marca en el CONTRATO (`bajaArcaPresentada`…): es lo que impide
 * mandar dos veces lo mismo. Una relación de ARCA sin contrato en WeProdu —las altas viejas hechas a mano— no
 * tiene dónde guardarla, y sin marca sería la única puerta por la que una baja se puede mandar dos veces. Por
 * eso cada operación queda además en `arca_altas_logs` con la CLAVE de la relación (empleadora + CUIL + fecha de
 * inicio), y de ahí se reconstruyen las marcas: el panel traba contra eso igual que contra las del contrato.
 *
 * Cómo se lee un log (sólo los que NO fueron en seco):
 *   · `presentada` / `ya_hecha`                      → presentada
 *   · `indeterminado`                                → indeterminado (mirar ARCA, no reenviar)
 *   · quedó `en_curso` o `fallo` con `irreversible`  → presentando / indeterminado: se llegó al click que no se
 *                                                      deshace y no hay resultado (el servidor se cayó ahí)
 *   · lo demás (rechazada, fallida, cortada antes)   → fallida: no traba
 * Vale la más nueva de cada operación. Una anulación de la baja posterior deja la baja como `anulada`; una
 * anulación del alta deja el alta `anulada` (ya no hay relación sobre la cual operar).
 */
import { Types } from "mongoose";
import { ArcaAltasLog } from "../../models/ArcaAltasLog.js";
import type { MarcaOperacion, TipoOperacion } from "./reglasOperacionRelacion.js";

export const claveDeRelacion = (empleadoraCuit: string, cuil: string, inicio: string) => `${empleadoraCuit}|${cuil}|${inicio}`;

export interface MarcasDeRegistro {
  baja: MarcaOperacion | null;
  modificacion: MarcaOperacion | null;
  anulacion: MarcaOperacion | null;
  /** Se anuló el alta desde WeProdu: ya no hay relación. */
  altaAnulada: boolean;
}

export const SIN_MARCAS: MarcasDeRegistro = { baja: null, modificacion: null, anulacion: null, altaAnulada: false };

export interface LogDeOperacion {
  tipo: string;
  createdAt?: Date | string;
  resultado?: string;
  irreversible?: boolean;
  error?: string;
  textoArca?: string;
  operacion?: { que?: string; payload?: any; acuse?: any; claveRelacion?: string };
}

/** La marca que deja UN log. Pura. */
export function marcaDeLog(l: LogDeOperacion): MarcaOperacion {
  const r = String(l.resultado || "");
  const resultado = r === "presentada" || r === "ya_hecha" ? "presentada" : r === "indeterminado" ? "indeterminado" : l.irreversible && r === "en_curso" ? "presentando" : l.irreversible && r === "fallo" ? "indeterminado" : "fallida";
  return { resultado, fecha: l.createdAt ? new Date(l.createdAt).toISOString() : undefined, que: l.operacion?.que, motivo: l.textoArca || l.error || undefined, acuse: l.operacion?.acuse || undefined, payload: l.operacion?.payload || undefined };
}

/** Las marcas de una relación a partir de sus logs (en cualquier orden). Pura. */
export function marcasDeLogs(logs: LogDeOperacion[]): MarcasDeRegistro {
  const m: MarcasDeRegistro = { baja: null, modificacion: null, anulacion: null, altaAnulada: false };
  const enOrden = [...logs].sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  for (const l of enOrden) {
    const tipo = l.tipo as TipoOperacion;
    if (tipo !== "baja" && tipo !== "modificacion" && tipo !== "anulacion") continue;
    const marca = marcaDeLog(l);
    // Un intento que no llegó a nada no tapa una marca anterior que sí traba.
    if (marca.resultado === "fallida" && m[tipo] && m[tipo]!.resultado !== "fallida") continue;
    m[tipo] = marca;
    if (tipo === "anulacion" && marca.resultado === "presentada") {
      if (marca.que === "alta") m.altaAnulada = true;
      if (marca.que === "baja" && m.baja?.resultado === "presentada") m.baja = { ...m.baja, resultado: "anulada" };
    }
    // Una baja nueva después de anular la anterior vuelve a contar.
    if (tipo === "baja" && marca.resultado !== "fallida" && m.anulacion?.que === "baja" && m.anulacion.resultado === "presentada") m.anulacion = { ...m.anulacion, resultado: "anulada" };
  }
  return m;
}

/** Las marcas de varias relaciones, por su clave. Una sola consulta. */
export async function marcasDeRegistro(tenantId: Types.ObjectId | string, claves: string[]): Promise<Map<string, MarcasDeRegistro>> {
  const out = new Map<string, MarcasDeRegistro>();
  const unicas = [...new Set(claves.filter(Boolean))];
  if (!unicas.length) return out;
  const logs: any[] = await ArcaAltasLog.find({ tenantId: new Types.ObjectId(String(tenantId)), tipo: { $in: ["baja", "modificacion", "anulacion"] }, enSeco: { $ne: true }, "operacion.claveRelacion": { $in: unicas } })
    .select("tipo createdAt resultado irreversible error textoArca operacion.que operacion.payload operacion.acuse operacion.claveRelacion")
    .lean();
  const porClave = new Map<string, LogDeOperacion[]>();
  for (const l of logs) {
    const k = String(l.operacion?.claveRelacion || "");
    (porClave.get(k) || porClave.set(k, []).get(k)!).push(l);
  }
  for (const [k, ls] of porClave) out.set(k, marcasDeLogs(ls));
  return out;
}

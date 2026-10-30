import { Types } from "mongoose";
import { HistorialEquipo } from "../models/HistorialEquipo.js";
import { User } from "../models/User.js";
import { firmaDeAreas } from "../compartido/configDelEquipo.js";
import { nombreDePersona } from "./novedadesNotificaciones.js";

/*
  EL RASTRO DE LOS CAMBIOS DEL EQUIPO (ver `models/HistorialEquipo.ts`). Nunca hace fallar el guardado:
  si no se puede escribir, se avisa en el log y sigue.
*/

export interface CambioDelEquipo {
  userId: any;
  campo: "areas" | "rol";
  antes: any;
  despues: any;
}

/** Las filas de `teamConfig` que cambiaron de área/turno entre `antes` y `despues` (por miembro). */
export function cambiosDeAreas(antes: any[] | null | undefined, despues: any[] | null | undefined): CambioDelEquipo[] {
  const previo = new Map((antes || []).map((c: any) => [String(c.userId), c]));
  const cambios: CambioDelEquipo[] = [];
  const vistos = new Set<string>();
  for (const c of despues || []) {
    const id = String(c.userId);
    vistos.add(id);
    const a = previo.get(id)?.areaShiftAssignments || [];
    const d = c.areaShiftAssignments || [];
    if (firmaDeAreas(a) !== firmaDeAreas(d)) cambios.push({ userId: c.userId, campo: "areas", antes: JSON.parse(firmaDeAreas(a)), despues: JSON.parse(firmaDeAreas(d)) });
  }
  for (const [id, c] of previo) if (!vistos.has(id) && (c.areaShiftAssignments || []).length) cambios.push({ userId: c.userId, campo: "areas", antes: JSON.parse(firmaDeAreas(c.areaShiftAssignments)), despues: [] });
  return cambios;
}

/** Copia simple de `teamConfig` para comparar después de modificarlo en el lugar. */
export const fotoDeAreas = (config: any[] | null | undefined) => (config || []).map((c: any) => ({ userId: String(c.userId), areaShiftAssignments: JSON.parse(firmaDeAreas(c.areaShiftAssignments)) }));

export async function registrarCambiosDelEquipo(p: { tenantId?: any; projectId: any; porUserId?: string; origen: string; payload?: any; cambios: CambioDelEquipo[] }): Promise<void> {
  if (!p.cambios.length) return;
  try {
    const quien: any = p.porUserId ? await User.findById(p.porUserId).select("firstName lastName metadata.fullName").lean() : null;
    const el = new Date();
    await HistorialEquipo.insertMany(
      p.cambios.map((c) => ({
        tenantId: p.tenantId ? new Types.ObjectId(String(p.tenantId)) : undefined,
        projectId: new Types.ObjectId(String(p.projectId)),
        userId: new Types.ObjectId(String(c.userId)),
        campo: c.campo,
        antes: c.antes,
        despues: c.despues,
        origen: p.origen,
        payload: p.payload,
        por: p.porUserId && Types.ObjectId.isValid(p.porUserId) ? new Types.ObjectId(p.porUserId) : undefined,
        porNombre: quien ? nombreDePersona(quien) : "",
        el,
      })),
    );
  } catch (e: any) {
    console.warn("[HISTORIAL-EQUIPO] No se pudo registrar el cambio:", e?.message || e);
  }
}

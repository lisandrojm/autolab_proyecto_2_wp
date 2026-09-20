import { Types } from "mongoose";
import { RequestConfig } from "../../models/RequestConfig.js";
import { claveExactaDeMotivo } from "./nombresDeMotivo.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUE NO ENTRE UN RENGLÓN MÁS SIN `typeId`
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `attendance.typeId` guarda de qué TIPO es cada renglón, por id. Antes el tipo viajaba sólo como
 * texto en `absenceReason`, y por eso hoy hay 7.938 renglones sin id: cuando alguien renombra un
 * tipo en el ABM, todos los partes viejos quedan hablando de algo que ya no se llama así.
 *
 * Backfillear los viejos no alcanza. Si el alta sigue guardando sólo el texto, en tres semanas hay
 * otros ocho mil. Por eso esto corre EN CADA ESCRITURA, antes de guardar:
 *
 *   · Si el renglón ya trae `typeId`, se valida que sea un tipo real del tenant.
 *   · Si no lo trae pero trae `absenceReason`, se resuelve por coincidencia EXACTA del nombre.
 *   · Si no se puede resolver, se RECHAZA el guardado con el motivo. No se guarda a medias.
 *
 * Los renglones sin motivo —los presentes— no necesitan tipo y pasan sin más.
 *
 * SE RESUELVE EN EL SERVER Y NO SE EXIGE AL CLIENTE porque la app mobile manda hoy sólo el texto, y
 * exigirle el id obligaría a esperar una versión nueva en los teléfonos para poder cargar un parte.
 */

export interface ResultadoDeResolucion {
  /** Los renglones con `typeId` puesto donde hacía falta. */
  attendance: any[];
  /** Los motivos que no se pudieron resolver, con cuántos renglones cada uno. */
  sinResolver: { motivo: string; renglones: number }[];
}

export async function resolverTiposDeNovedad(tenantId: Types.ObjectId, attendance: any[]): Promise<ResultadoDeResolucion> {
  const renglones = Array.isArray(attendance) ? attendance : [];
  if (renglones.length === 0) return { attendance: renglones, sinResolver: [] };

  const tipos: any[] = await RequestConfig.find({ tenantId }).select("_id name").lean();
  const porNombre = new Map<string, any>(tipos.map((t: any) => [claveExactaDeMotivo(t.name), t._id]));
  const idsValidos = new Set(tipos.map((t: any) => String(t._id)));

  const faltantes = new Map<string, number>();

  const resueltos = renglones.map((r: any) => {
    /*
      UN `typeId` QUE NO EXISTE ES PEOR QUE NO TENERLO: apunta a un tipo borrado y nadie lo nota.
      Si llegó uno así se descarta y se intenta resolver por nombre, como si no hubiera venido.
    */
    if (r?.typeId && idsValidos.has(String(r.typeId))) return r;

    const motivo = String(r?.absenceReason || "").trim();
    // Sin motivo es un presente: no es una novedad de ningún tipo.
    if (!motivo) return { ...r, typeId: undefined };

    const id = porNombre.get(claveExactaDeMotivo(motivo));
    if (!id) {
      faltantes.set(motivo, (faltantes.get(motivo) || 0) + 1);
      return r;
    }

    return { ...r, typeId: id };
  });

  return {
    attendance: resueltos,
    sinResolver: [...faltantes.entries()].map(([motivo, n]) => ({ motivo, renglones: n })),
  };
}

import { Types } from "mongoose";
import UserProject from "../../models/UserProject.js";
import { fechaISO } from "../../utils/contratoVigencia.js";

/**
 * UNA PERSONA NO TIENE DOS ALTAS A LA VEZ CON LA MISMA EMPLEADORA.
 *
 * Pedido del 10/10/2026: una vez presentada el alta de un contrato, no se presenta otra de la misma
 * persona hasta que termine la vigente. ARCA la aceptaría como una segunda relación laboral
 * superpuesta, y deshacerla es un trámite aparte.
 *
 * Es POR EMPLEADORA a propósito: alguien puede trabajar a la vez para dos CUIT distintos, y eso son
 * dos relaciones legítimas. «Termina» = su fecha de baja; sin baja, la relación sigue abierta.
 *
 * Cuenta como presentada lo que tiene marca y no falló: `presentada`, y también `indeterminado` y
 * `presentando`, que pueden haber entrado en ARCA (ver `altaArcaPresentada` en UserProject).
 */

export interface AltaPresentada {
  userId: string;
  userProjectId: string;
  contractIndex: number;
  empresaId: string;
  alta: string;
  baja: string;
}

const ABIERTA = "9999-12-31";

/** Las altas ya presentadas de estas personas, en los proyectos del tenant. */
export async function altasPresentadasDe(proyectosDelTenant: Array<string | Types.ObjectId>, userIds: string[]): Promise<AltaPresentada[]> {
  const ids = [...new Set(userIds)].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
  if (ids.length === 0 || proyectosDelTenant.length === 0) return [];
  const filas: any[] = await UserProject.aggregate([
    { $match: { userId: { $in: ids }, projectId: { $in: proyectosDelTenant.map((p) => new Types.ObjectId(String(p))) }, "contracts.altaArcaPresentada.resultado": { $in: ["presentada", "indeterminado", "presentando"] } } },
    {
      $project: {
        userId: 1,
        c: {
          $map: {
            input: { $range: [0, { $size: { $ifNull: ["$contracts", []] } }] },
            as: "i",
            in: {
              i: "$$i",
              r: { $arrayElemAt: ["$contracts.altaArcaPresentada.resultado", "$$i"] },
              e: { $arrayElemAt: ["$contracts.empresaContratoId", "$$i"] },
              a: { $arrayElemAt: ["$contracts.fecha_alta_contrato", "$$i"] },
              b: { $arrayElemAt: ["$contracts.fecha_baja_contrato", "$$i"] },
            },
          },
        },
      },
    },
  ]);
  const out: AltaPresentada[] = [];
  for (const f of filas) {
    for (const c of f.c || []) {
      if (!["presentada", "indeterminado", "presentando"].includes(String(c.r || ""))) continue;
      out.push({ userId: String(f.userId), userProjectId: String(f._id), contractIndex: Number(c.i), empresaId: String(c.e || ""), alta: fechaISO(c.a), baja: fechaISO(c.b) });
    }
  }
  return out;
}

/**
 * El alta ya presentada que se superpone con este contrato, si hay. Dos períodos se pisan si cada uno
 * empieza antes de que termine el otro. El mismo contrato no cuenta (es el que se está presentando).
 */
export function altaQueSePisa(
  contrato: { userId: string; userProjectId: string; contractIndex: number; empresaId: string; alta: string; baja: string },
  presentadas: AltaPresentada[],
): AltaPresentada | null {
  const alta = fechaISO(contrato.alta);
  if (!alta || !contrato.empresaId) return null;
  const baja = fechaISO(contrato.baja) || ABIERTA;
  for (const p of presentadas) {
    if (p.userId !== contrato.userId || p.empresaId !== contrato.empresaId) continue;
    if (p.userProjectId === contrato.userProjectId && p.contractIndex === contrato.contractIndex) continue;
    if (!p.alta) continue;
    const pBaja = p.baja || ABIERTA;
    if (p.alta <= baja && alta <= pBaja) return p;
  }
  return null;
}

/** «12/10/2026» para los mensajes. */
export const fechaCorta = (iso: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—");

export const textoAltaQueSePisa = (p: AltaPresentada): string =>
  `ya tiene un alta presentada con esta empleadora del ${fechaCorta(p.alta)} ${p.baja ? `al ${fechaCorta(p.baja)}` : "sin fecha de baja"}: no se da otra hasta que termine la vigente`;

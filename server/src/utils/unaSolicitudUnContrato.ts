import { esLapida } from "./anulacionContrato.js";

/**
 * UNA SOLICITUD, UN CONTRATO (19/11/2026). Si guardar sobre `destino` (-1 = agregar uno nuevo) dejaría
 * dos contratos del vínculo con la misma solicitud, devuelve la posición del que ya la tiene; si no, -1.
 * Las lápidas no cuentan: el contrato anulado ya no es el de la solicitud. Ver `assign-member`.
 */
export function contratoQueYaTieneLaSolicitud(contracts: any[], solicitudId: string, destino: number): number {
  if (!solicitudId) return -1;
  const yaTiene = (contracts || []).findIndex((c: any) => !esLapida(c) && c?.solicitudId && String(c.solicitudId) === String(solicitudId));
  return yaTiene >= 0 && yaTiene !== destino ? yaTiene : -1;
}

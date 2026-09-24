import { Types } from "mongoose";
import { Tenant } from "../models/Tenant.js";

/*
  QUIÉN CUENTA COMO USUARIO DEL TENANT (`Tenant.userIds` y `usage.users.current`).

  Una SOLICITUD de contratación es un documento `User` de paso (`metadata.isSolicitud`), pero no es una
  persona: nace inactiva y fuera de este conteo. Entra recién cuando la aprobación la convierte en la
  persona (solicitud de alguien que todavía no existía). Si la solicitud apuntaba a una persona que ya
  existía, el contrato va a esa persona —que ya cuenta— y el documento de la solicitud nunca entra.

  Antes cada solicitud sumaba al crearse y quedaba sumada para siempre, se aprobara, rechazara o
  cancelara: un lote de 20 altas movía 20 el uso del plan.

  Las dos funciones son CONDICIONALES a estar (o no) en `userIds`: sumar dos veces o restar a quien nunca
  sumó no desacomoda el número. Por eso los borrados usan `quitarDelConteo` y no un `$inc: -1` suelto.
*/

export async function sumarAlConteo(tenantId: Types.ObjectId | string, userId: Types.ObjectId | string): Promise<void> {
  const id = new Types.ObjectId(String(userId));
  await Tenant.updateOne({ _id: tenantId, userIds: { $ne: id } }, { $addToSet: { userIds: id }, $inc: { "usage.users.current": 1 } });
}

export async function quitarDelConteo(tenantId: Types.ObjectId | string, userId: Types.ObjectId | string): Promise<void> {
  const id = new Types.ObjectId(String(userId));
  await Tenant.updateOne({ _id: tenantId, userIds: id }, { $pull: { userIds: id }, $inc: { "usage.users.current": -1 } });
}

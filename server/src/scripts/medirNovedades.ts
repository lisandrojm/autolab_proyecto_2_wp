/**
 * Qué cuesta el listado de NOVEDADES (`GET /activity-reports`). SÓLO LECTURA.
 *
 *   npx tsx src/scripts/medirNovedades.ts <tenantId>
 *
 * La pantalla dibuja una fila por parte con cinco números (registros, ausentes, reemplazos, otros
 * presentes, horas extra). Acá se mide lo que hoy viaja para calcularlos y lo que costaría si esos
 * números los contara Mongo.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Request } from "../models/Request.js";
import "../models/User.js";
import "../models/Project.js";
import "../models/Area.js";
import "../models/Shift.js";
import "../models/Client.js";

const kb = (x: any) => Buffer.byteLength(JSON.stringify(x ?? null)) / 1024;

async function main() {
  const tenantId = process.argv[2];
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  await Request.findOne({}).select("_id").lean();

  const filter: any = { tenantId: new Types.ObjectId(tenantId) };
  const total = await Request.countDocuments(filter);
  console.log(`Partes de novedades en el tenant: ${total}\n`);

  let t = Date.now();
  const comoEsta: any[] = await Request.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .populate("userId", "firstName lastName")
    .populate({ path: "projectId", select: "name clientId", populate: { path: "clientId", select: "name" } })
    .populate("areaId", "name")
    .populate("shiftId", "name")
    .populate("attendance.employeeId", "firstName lastName")
    .populate("attendance.replacementId", "firstName lastName");
  const msAhora = Date.now() - t;
  const filas = comoEsta.reduce((n, r: any) => n + (r.attendance?.length || 0), 0);
  console.log(`COMO ESTÁ HOY (todo, sin lean)      ${String(msAhora).padStart(6)} ms  ${kb(comoEsta).toFixed(1).padStart(9)} KB   ${comoEsta.length} partes, ${filas} renglones de asistencia`);

  const unParte = comoEsta[0];
  if (unParte) {
    const o = unParte.toObject ? unParte.toObject() : unParte;
    const campos = Object.entries(o)
      .map(([k, v]) => [k, kb(v)] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, v]) => `${k} ${v.toFixed(1)}KB`)
      .join(", ");
    console.log(`   un parte pesa ${kb(o).toFixed(1)} KB  → ${campos}`);
  }

  // Lo mismo, sin el detalle de asistencia: sólo lo que la tabla dibuja.
  t = Date.now();
  const sinDetalle = await Request.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .select("-attendance")
    .populate("userId", "firstName lastName")
    .populate({ path: "projectId", select: "name clientId", populate: { path: "clientId", select: "name" } })
    .populate("areaId", "name")
    .populate("shiftId", "name")
    .lean();
  console.log(`SIN el detalle de asistencia        ${String(Date.now() - t).padStart(6)} ms  ${kb(sinDetalle).toFixed(1).padStart(9)} KB`);

  // Y con los cinco números ya contados por Mongo.
  t = Date.now();
  const conNumeros = await Request.aggregate([
    { $match: filter },
    { $sort: { date: -1, createdAt: -1 } },
    {
      $addFields: {
        registros: { $size: { $ifNull: ["$attendance", []] } },
        ausentes: { $size: { $filter: { input: { $ifNull: ["$attendance", []] }, as: "a", cond: { $ne: ["$$a.status", "present"] } } } },
        reemplazos: { $size: { $filter: { input: { $ifNull: ["$attendance", []] }, as: "a", cond: { $ne: [{ $ifNull: ["$$a.replacementId", null] }, null] } } } },
        horasExtra: { $sum: { $map: { input: { $ifNull: ["$attendance", []] }, as: "a", in: { $add: [{ $ifNull: ["$$a.overtimeHours", 0] }, { $ifNull: ["$$a.replacementOvertimeHours", 0] }] } } } },
      },
    },
    { $project: { attendance: 0 } },
  ]);
  console.log(`CON los números contados en Mongo   ${String(Date.now() - t).padStart(6)} ms  ${kb(conNumeros).toFixed(1).padStart(9)} KB`);

  // Una página de 25.
  t = Date.now();
  const pagina = await Request.find(filter).sort({ date: -1, createdAt: -1 }).limit(25).select("-attendance").lean();
  console.log(`  (una página de 25, sin detalle)   ${String(Date.now() - t).padStart(6)} ms  ${kb(pagina).toFixed(1).padStart(9)} KB`);

  // La variante que conserva lo que el cliente necesita para los contadores y para el Área|Turno.
  t = Date.now();
  const flaca = await Request.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .select("reportNumber date projectId areaId shiftId userId comments createdAt updatedAt submittedAt attendance.employeeId attendance.status attendance.replacementId attendance.overtimeHours attendance.replacementOvertimeHours")
    .populate("userId", "firstName lastName")
    .populate({ path: "projectId", select: "name clientId", populate: { path: "clientId", select: "name" } })
    .populate("areaId", "name")
    .populate("shiftId", "name")
    .lean();
  console.log(`ASISTENCIA RECORTADA (5 campos)      ${String(Date.now() - t).padStart(6)} ms  ${kb(flaca).toFixed(1).padStart(9)} KB`);

  /*
    LA PROPUESTA: los cinco números contados en Mongo + los ids de los empleados del parte.

    Los números son lo que muestran las columnas. Los ids son lo único que el cliente usa del
    `attendance` para armar la columna Área | Turno (busca a cada uno en el directorio y mira su área
    y turno en ese proyecto), así que mandarlos deja esa lógica intacta sin mover el detalle entero.
  */
  t = Date.now();
  const propuesta = await Request.aggregate([
    { $match: filter },
    { $sort: { date: -1, createdAt: -1 } },
    {
      $addFields: {
        registros: { $size: { $ifNull: ["$attendance", []] } },
        ausentes: { $size: { $filter: { input: { $ifNull: ["$attendance", []] }, as: "a", cond: { $not: [{ $in: ["$a.status", ["present", "late"]] }] } } } },
        reemplazos: { $size: { $filter: { input: { $ifNull: ["$attendance", []] }, as: "a", cond: { $ne: [{ $ifNull: ["$a.replacementId", null] }, null] } } } },
        horasExtra: { $sum: { $map: { input: { $ifNull: ["$attendance", []] }, as: "a", in: { $add: [{ $ifNull: ["$a.overtimeHours", 0] }, { $ifNull: ["$a.replacementOvertimeHours", 0] }] } } } },
        empleados: { $setUnion: [{ $map: { input: { $ifNull: ["$attendance", []] }, as: "a", in: "$a.employeeId" } }, []] },
      },
    },
    { $project: { attendance: 0 } },
  ]);
  console.log(`PROPUESTA (números + ids)           ${String(Date.now() - t).padStart(6)} ms  ${kb(propuesta).toFixed(1).padStart(9)} KB`);
  console.log(`  y una página de 25 así:           ${"".padStart(6)}     ${(kb(propuesta) / 720 * 25).toFixed(1).padStart(9)} KB`);

  await mongoose.disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });

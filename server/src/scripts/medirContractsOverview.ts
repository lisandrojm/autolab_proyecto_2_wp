/**
 * MEDICIÓN, SÓLO LECTURA: dónde se va el tiempo de `GET /users/contracts-overview` para la pantalla de
 * Contratos (bandejas impositivas, `limit 5000`). Mide la FASE 1 como está hoy (barre todos los
 * vínculos del tenant) contra una FASE 1 que filtra en Mongo por los estados pedidos, y la FASE 2 con el
 * contrato entero contra una proyección de los campos que la fila usa.
 *
 *   ./node_modules/.bin/dotenv -e .env.production -- npx tsx src/scripts/medirContractsOverview.ts <tenantId> "Pedido de AFIP,Pedido de Servicios,Envio de documentacion"
 *
 * No escribe nada.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { Project } from "../models/Project.js";
import UserProject from "../models/UserProject.js";
import { claveEstado } from "../utils/estadoClave.js";

const [tenantId, estadosArg] = process.argv.slice(2);
if (!tenantId || !Types.ObjectId.isValid(tenantId) || !estadosArg) {
  console.error("Uso: <tenantId> \"Estado A,Estado B\"");
  process.exit(1);
}
const estadosFiltro = estadosArg.split(",").map((e) => claveEstado(e.trim())).filter(Boolean);
const kb = (o: unknown) => `${(Buffer.byteLength(JSON.stringify(o)) / 1024).toFixed(0)} KB`;

async function main() {
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });
  const projectIds = (await Project.find({ tenantId: new Types.ObjectId(tenantId) }).select("_id").lean()).map((p: any) => p._id);
  console.log(`proyectos: ${projectIds.length} · estados pedidos (clave): ${estadosFiltro.join(" | ")}`);

  const camposContrato: any = { a: "$$x.fecha_alta_contrato", b: "$$x.fecha_baja_contrato", g: "$$x.fecha_carga", e: "$$x.nombre_estado_empleado" };
  const proyeccion = { $project: { p: "$projectId", u: "$userId", r: "$nombre_rol_frame", c: { $map: { input: { $ifNull: ["$contracts", []] }, as: "x", in: camposContrato } } } };

  // FASE 1 como hoy: todos los vínculos.
  let t = Date.now();
  const todo: any[] = await UserProject.aggregate([{ $match: { projectId: { $in: projectIds } } }, proyeccion]);
  console.log(`FASE 1 hoy: ${todo.length} vínculos · ${todo.reduce((n, d) => n + d.c.length, 0)} contratos · ${kb(todo)} · ${Date.now() - t} ms`);

  // FASE 1 filtrada: primero los nombres crudos que caen en los estados pedidos (distinct es chico), después sólo esos vínculos.
  t = Date.now();
  const nombres: string[] = await UserProject.distinct("contracts.nombre_estado_empleado", { projectId: { $in: projectIds } });
  const crudosQueAplican = nombres.filter((n) => estadosFiltro.includes(claveEstado(String(n || ""))));
  const tDistinct = Date.now() - t;
  t = Date.now();
  const filtrado: any[] = await UserProject.aggregate([{ $match: { projectId: { $in: projectIds }, "contracts.nombre_estado_empleado": { $in: crudosQueAplican } } }, proyeccion]);
  console.log(`FASE 1 filtrada: distinct ${nombres.length} nombres (${tDistinct} ms) → crudos que aplican: ${JSON.stringify(crudosQueAplican)} · ${filtrado.length} vínculos · ${filtrado.reduce((n, d) => n + d.c.length, 0)} contratos · ${kb(filtrado)} · ${Date.now() - t} ms`);

  // FASE 2: el contrato entero de cada fila vs. sólo los campos que la fila usa. Se toma el primer contrato en estado pedido de cada vínculo filtrado.
  const filas = filtrado.map((d) => ({ id: d._id, idx: d.c.findIndex((c: any) => estadosFiltro.includes(claveEstado(String(c.e || "")))) })).filter((f) => f.idx >= 0);
  const ids = filas.map((f) => f.id);
  const porIdx = new Map<number, Types.ObjectId[]>();
  for (const f of filas) if (f.idx > 0) porIdx.set(f.idx, [...(porIdx.get(f.idx) || []), f.id]);
  const ramas = [...porIdx.entries()].map(([idx, lista]) => ({ case: { $in: ["$_id", lista] }, then: idx }));
  const indice: any = ramas.length ? { $switch: { branches: ramas, default: 0 } } : 0;
  t = Date.now();
  const enteros: any[] = await UserProject.aggregate([{ $match: { _id: { $in: ids } } }, { $project: { c: { $arrayElemAt: [{ $ifNull: ["$contracts", []] }, indice] } } }]);
  console.log(`FASE 2 contrato entero: ${enteros.length} filas · ${kb(enteros)} · ${Date.now() - t} ms`);

  const CAMPOS = ["_id", "nombre_contrato", "nombre_estado_empleado", "nombre_sede", "areaShiftAssignments", "reemplazo", "empleado_id_reemplezado", "fecha_alta_contrato", "fecha_baja_contrato", "fecha_carga", "sueldo_mano", "cantidad_jornadas_laborales", "hora_inicio", "hora_fin", "altaDocumentoUrl", "altaDocumentoNombre", "altaArcaPresentada", "constanciaVigenciaDesde", "constanciaVigenciaHasta", "constanciaVerificador", "constanciaAfipEstado", "constanciaAfipConsultadaAt", "constanciaAfipDropboxSubidaAt", "firmaContratoUrl", "firmaContratoNombre", "firmaReleases", "firmaGeneradoAt", "firmaReleasesGeneradoAt", "firmaEnviadaAt", "empresaContratoId", "empresaReleaseId", "nombre_empresa_contrato", "nombre_empresa_release", "categoria_sat_id", "rol_frame_id", "sede_id", "tipo_contrato_id", "sucursalArcaId", "actividadArca", "obraSocialId", "obraSocialOrigen", "obraSocialConstatadaEn", "obraSocialConstatadaEl", "obraSocialNoFigura", "obraSocialBloqueada", "sinCuitValidacion"];
  t = Date.now();
  const proyectados: any[] = await UserProject.aggregate([
    { $match: { _id: { $in: ids } } },
    { $project: { c: { $arrayElemAt: [{ $ifNull: ["$contracts", []] }, indice] } } },
    { $project: Object.fromEntries(CAMPOS.map((k) => [`c.${k}`, 1])) },
  ]);
  console.log(`FASE 2 proyectada (${CAMPOS.length} campos): ${proyectados.length} filas · ${kb(proyectados)} · ${Date.now() - t} ms`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

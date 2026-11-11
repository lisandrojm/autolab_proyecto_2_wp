import { Types } from "mongoose";
import { PlanVacaciones, type IPlanVacaciones } from "../../models/PlanVacaciones.js";
import { Project } from "../../models/Project.js";
import { VacationConfig } from "../../models/VacationConfig.js";
import { hoyArgentina } from "../../utils/contratoVigencia.js";
import { normalizarVentana, temporadaConVentana, ventanaDeEntidad, ventanaDeTemporada, type TramoDeVentana, type VentanaGoce } from "../../compartido/ventanaGoce.js";

/*
  LA VENTANA ANUAL DEL PROYECTO Y SUS PLANES DE VACACIONES, ATADOS (pedido del 11/11/2026).

  Eran dos datos sueltos: la ventana («MM-DD», en Vacaciones → Ventana Anual, global o por proyecto) y
  la temporada de cada plan (fechas con año). El plan sólo avisaba si se salía de la ventana. Ahora:

  · Cambiar la temporada de un plan (al crearlo o editarlo) cambia la ventana de su proyecto. Si el
    proyecto usaba la global y la temporada es otra, pasa a tener configuración propia: como «Usar
    Global» es el mismo interruptor del fraccionamiento y los días corridos, esos se copian de la global
    para que no cambien. Si la ventana estaba apagada, sigue apagada: se cambian las fechas, no se
    empieza a frenar pedidos.
  · Cambiar la ventana (del proyecto o la global, para los proyectos que la usan) mueve la temporada de
    sus planes EN BORRADOR que todavía no terminaron, en el mismo año. Los enviados no se tocan: ya los
    está mirando el coordinador. Los bloques que queden afuera no se borran: el plan los marca.
*/

const ventanaGlobal = async (tenantId: Types.ObjectId): Promise<{ ventana: VentanaGoce; config: any }> => {
  const config: any = await VacationConfig.findOne({ tenantId }).select("ventanaGoce permiteFraccionadas minDiasFraccion diasCorridos").lean();
  return { ventana: normalizarVentana(config?.ventanaGoce), config };
};

const mismoTramo = (a: TramoDeVentana, b: TramoDeVentana) => a.inicio === b.inicio && a.fin === b.fin;

/** La ventana de un proyecto, ya resuelta contra la global. */
export async function ventanaDelProyecto(tenantId: Types.ObjectId, vacationConfig: any): Promise<VentanaGoce> {
  return ventanaDeEntidad(vacationConfig, (await ventanaGlobal(tenantId)).ventana);
}

/** Mueve la temporada de los planes en borrador del proyecto a la ventana. Devuelve cuántos cambiaron. */
export async function llevarVentanaALosPlanes(tenantId: Types.ObjectId, projectId: Types.ObjectId | string, tramo: TramoDeVentana, exceptoPlanId?: string): Promise<number> {
  const planes: any[] = await PlanVacaciones.find({ tenantId, projectId, estado: "borrador", ventanaHasta: { $gte: hoyArgentina() } }).select("ventanaDesde ventanaHasta").lean();
  let cambiados = 0;
  for (const p of planes) {
    if (exceptoPlanId && String(p._id) === exceptoPlanId) continue;
    const t = temporadaConVentana(p.ventanaDesde, tramo);
    if (t.desde === p.ventanaDesde && t.hasta === p.ventanaHasta) continue;
    await PlanVacaciones.updateOne({ _id: p._id, estado: "borrador" }, { $set: { ventanaDesde: t.desde, ventanaHasta: t.hasta } });
    cambiados++;
  }
  return cambiados;
}

/** La temporada de un plan pasa a ser la ventana de su proyecto (y de sus otros planes en borrador). */
export async function llevarTemporadaAlProyecto(tenantId: Types.ObjectId, plan: IPlanVacaciones): Promise<void> {
  const project: any = await Project.findOne({ _id: plan.projectId, tenantId }).select("vacationConfig").lean();
  if (!project) return;
  const { ventana: global, config } = await ventanaGlobal(tenantId);
  const actual = ventanaDeEntidad(project.vacationConfig, global);
  const tramo = ventanaDeTemporada(plan.ventanaDesde, plan.ventanaHasta);
  if (!mismoTramo(actual, tramo)) {
    const vc = project.vacationConfig || {};
    const propia = vc.useGlobalConfig === false;
    const base = propia ? vc : { permiteFraccionadas: config?.permiteFraccionadas ?? true, minDiasFraccion: config?.minDiasFraccion, diasCorridos: config?.diasCorridos };
    await Project.updateOne(
      { _id: project._id, tenantId },
      { $set: { vacationConfig: { ...base, useGlobalConfig: false, ventanaGoceEnabled: actual.enabled, ventanaGoceInicio: tramo.inicio, ventanaGoceFin: tramo.fin } } },
    );
  }
  await llevarVentanaALosPlanes(tenantId, project._id, tramo, String(plan._id));
}

/** Cambió la ventana global: se mueven los planes de los proyectos que la usan. */
export async function llevarVentanaGlobalALosPlanes(tenantId: Types.ObjectId, tramo: TramoDeVentana): Promise<void> {
  const conPlanes: any[] = await PlanVacaciones.distinct("projectId", { tenantId, estado: "borrador", ventanaHasta: { $gte: hoyArgentina() } });
  if (conPlanes.length === 0) return;
  const proyectos: any[] = await Project.find({ _id: { $in: conPlanes }, tenantId, "vacationConfig.useGlobalConfig": { $ne: false } }).select("_id").lean();
  for (const p of proyectos) await llevarVentanaALosPlanes(tenantId, p._id, tramo);
}

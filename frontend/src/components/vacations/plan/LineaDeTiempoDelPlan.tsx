import React, { useEffect, useRef } from "react";
import { Timeline } from "vis-timeline/standalone";
import { DataSet } from "vis-data";
import "vis-timeline/styles/vis-timeline-graph2d.min.css";
import "../../../styles/vacationsCalendar.css";
import "../../../styles/planVacaciones.css";
import type { PlanVacaciones } from "../../../api/planVacaciones";
import { TEXTO_ESTADO_ITEM } from "@compartido/planVacaciones/estado";
import { sumarDias, fechaCorta } from "@compartido/planVacaciones/fechas";

/**
 * EL PLAN EN UNA LÍNEA DE TIEMPO (vis-timeline, la misma librería del calendario de Vacaciones), con un
 * renglón por grupo (área › turno › rol): se ve de un vistazo quién falta cuándo y si dos del mismo rol
 * se superponen. Los reemplazos mensuales van en el mismo renglón, en violeta.
 */
export const LineaDeTiempoDelPlan: React.FC<{ plan: PlanVacaciones }> = ({ plan }) => {
  const ref = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<Timeline | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const nombreDe = new Map(plan.equipo.map((m) => [m.userId, m.nombre]));
    const claveDe = (g: { areaId: string; shiftId: string; rolFrameId: string | null; nombreRol: string }) => `${g.areaId}::${g.shiftId}::${g.rolFrameId ? g.rolFrameId : `nombre:${g.nombreRol || ""}`}`;
    const grupos = new DataSet(plan.grupos.map((g, i) => ({ id: g.clave, content: `<div class="plan-grupo"><b>${g.areaNombre}</b> › ${g.shiftNombre}<br/><span>${g.nombreRol} (${g.userIds.length})</span></div>`, order: i })));
    const items = new DataSet([
      ...plan.items
        .filter((i) => i.estado !== "cancelado")
        .map((i) => ({
          id: i._id,
          group: claveDe(i),
          content: `${nombreDe.get(i.userId) || "Persona"} · ${i.dias}d`,
          start: `${i.desde}T00:00:00`,
          end: `${sumarDias(i.hasta, 1)}T00:00:00`,
          className: `plan-item plan-${i.estado}`,
          title: `${nombreDe.get(i.userId) || "Persona"}\n${fechaCorta(i.desde)} – ${fechaCorta(i.hasta)} · ${i.dias} días\n${TEXTO_ESTADO_ITEM[i.estado]}${i.motivoRechazo ? `\n${i.motivoRechazo}` : ""}`,
        })),
      ...plan.reemplazos
        .filter((r) => r.estado !== "cancelado")
        .map((r) => ({
          id: `r-${r._id}`,
          group: claveDe(r),
          content: `Reemplazo: ${nombreDe.get(r.userId) || "persona"}`,
          start: `${r.desde}T00:00:00`,
          end: `${sumarDias(r.hasta, 1)}T00:00:00`,
          className: "plan-item plan-reemplazo",
          title: `Reemplazo mensual · ${r.nombreContrato}\n${fechaCorta(r.desde)} – ${fechaCorta(r.hasta)}`,
        })),
    ]);
    const options = {
      width: "100%",
      stack: true,
      orientation: "top" as const,
      locale: "es",
      start: `${plan.ventanaDesde}T00:00:00`,
      end: `${sumarDias(plan.ventanaHasta, 1)}T00:00:00`,
      min: `${sumarDias(plan.ventanaDesde, -7)}T00:00:00`,
      max: `${sumarDias(plan.ventanaHasta, 8)}T00:00:00`,
      zoomMin: 1000 * 60 * 60 * 24 * 14,
      margin: { item: { horizontal: 4, vertical: 4 } },
      groupOrder: "order",
      tooltip: { followMouse: true, overflowMethod: "cap" as const },
      selectable: false,
    };
    timelineRef.current?.destroy();
    const t = new Timeline(ref.current, items, grupos, options as any);
    timelineRef.current = t;
    return () => {
      t.destroy();
      timelineRef.current = null;
    };
  }, [plan]);

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2">
      <div className="flex flex-wrap gap-3 px-2 py-1 text-[11px] text-gray-600 dark:text-gray-300">
        {(["propuesto", "enviado", "aprobado", "rechazado"] as const).map((e) => (
          <span key={e} className="inline-flex items-center gap-1">
            <span className={`inline-block w-3 h-3 rounded-sm plan-leyenda plan-${e}`} />
            {TEXTO_ESTADO_ITEM[e]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm plan-leyenda plan-reemplazo" />
          Reemplazo mensual
        </span>
      </div>
      <div ref={ref} className="vacation-timeline plan-timeline" />
    </div>
  );
};

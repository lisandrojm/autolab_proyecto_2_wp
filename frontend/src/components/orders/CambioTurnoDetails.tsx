import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faCircleCheck, faClock, faTriangleExclamation, faRotateLeft } from "@fortawesome/free-solid-svg-icons";

/**
 * EL DETALLE DE UN PEDIDO DE CAMBIO DE TURNO, igual en el panel y en el móvil (26/11/2026).
 *
 * Los nombres (proyecto, área, sede, turnos) vienen en `metadata.cambioTurno`, que el server guarda al
 * pedir; las fechas y el motivo en `dynamicValue`. Abajo, qué pasó con el cambio: se aplica cuando llega la
 * fecha (o al confirmar la firma), así que un pedido aprobado puede estar «pendiente de aplicar».
 */
interface CambioTurnoDetailsProps {
  order: any;
}

/** "YYYY-MM-DD" → "D/M/YYYY", sin pasar por `Date` para no correr el día por la zona horaria. */
const fecha = (iso?: string | null): string => {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${Number(d)}/${Number(m)}/${y}` : "—";
};

export const CambioTurnoDetails: React.FC<CambioTurnoDetailsProps> = ({ order }) => {
  const pedido = order?.dynamicValue && typeof order.dynamicValue === "object" ? order.dynamicValue : {};
  const foto = order?.metadata?.cambioTurno || {};
  const firma = !!(order?.categoryId && typeof order.categoryId === "object" && order.categoryId.requiresSignature);
  const esperaFirma = firma && order?.signatureStatus !== "signed";

  const estado = (() => {
    if (foto.revertido) return { icon: faRotateLeft, clase: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-300", texto: `Cambio aplicado el ${fecha(foto.aplicado?.el)} y terminado el ${fecha(foto.revertido.el)}: volvió a ${foto.turnoActualNombre || "su turno"}.` };
    if (foto.aplicado) return { icon: faCircleCheck, clase: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/20 dark:text-emerald-300", texto: `Cambio aplicado el ${fecha(foto.aplicado.el)}${pedido.fechaHasta ? `. Vuelve a ${foto.turnoActualNombre || "su turno"} después del ${fecha(pedido.fechaHasta)}.` : "."}` };
    if (foto.fallo) return { icon: faTriangleExclamation, clase: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-300", texto: `No se pudo aplicar el ${fecha(foto.fallo.el)}: ${(foto.fallo.errores || []).map((e: any) => e.mensaje).join(" ")}` };
    if (order?.status === "approved") return { icon: faClock, clase: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-700/60 dark:bg-blue-900/20 dark:text-blue-300", texto: esperaFirma ? "Se aplica cuando se confirme la firma (y llegue la fecha desde)." : `Se aplica el ${fecha(pedido.fechaDesde)}.` };
    return null;
  })();

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Cambio de turno</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Proyecto</p>
          <p className="font-medium text-slate-800 dark:text-slate-100">{foto.proyectoNombre || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Área</p>
          <p className="font-medium text-slate-800 dark:text-slate-100">
            {foto.areaNombre || "—"}
            {foto.sedeNombre ? <span className="text-slate-500 dark:text-slate-400"> · {foto.sedeNombre}</span> : null}
          </p>
        </div>
        <div className="sm:col-span-2">
          <p className="text-xs text-slate-500 dark:text-slate-400">Turno</p>
          <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800 dark:text-slate-100">
            <span className="rounded bg-slate-100 px-2 py-0.5 dark:bg-slate-700">{foto.turnoActualNombre || "—"}</span>
            <FontAwesomeIcon icon={faArrowRight} className="h-3 w-3 text-slate-400" />
            <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">{foto.turnoSolicitadoNombre || "—"}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Desde</p>
          <p className="font-medium text-slate-800 dark:text-slate-100">{fecha(pedido.fechaDesde)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Hasta</p>
          <p className="font-medium text-slate-800 dark:text-slate-100">{pedido.fechaHasta ? fecha(pedido.fechaHasta) : <span className="italic text-slate-500 dark:text-slate-400">Permanente</span>}</p>
        </div>
        {pedido.motivo && (
          <div className="sm:col-span-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">Motivo</p>
            <p className="whitespace-pre-wrap text-slate-800 dark:text-slate-100">{pedido.motivo}</p>
          </div>
        )}
      </div>
      {estado && (
        <p className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${estado.clase}`}>
          <FontAwesomeIcon icon={estado.icon} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{estado.texto}</span>
        </p>
      )}
    </div>
  );
};

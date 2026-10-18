import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faSpinner, faPaperPlane, faCheckDouble, faRotate, faPen, faBan, faTableCells, faTimeline, faTriangleExclamation, faCircleInfo, faChevronDown, faChevronUp, faTrash } from "@fortawesome/free-solid-svg-icons";
import { planVacacionesAPI, errorDe, type PlanVacaciones, type ItemDelPlan, type ClaveDeGrupo } from "../../../api/planVacaciones";
import { sweetAlert } from "../../../utils/sweetAlert";
import { LoadingSpinner } from "../../ui/LoadingSpinner";
import { TEXTO_ESTADO_PLAN } from "@compartido/planVacaciones/estado";
import { fechaCorta } from "@compartido/planVacaciones/fechas";
import { GrillaDelPlan, type AccionesGrilla } from "./GrillaDelPlan";
import { LineaDeTiempoDelPlan } from "./LineaDeTiempoDelPlan";
import { ModalNuevoPlan } from "./ModalNuevoPlan";
import { CLASE_ESTADO_PLAN, mesCorto } from "./estilos";

interface Props {
  planId: string;
  onVolver?: () => void;
  /** Avisar a la lista de planes que algo cambió (estado, borrado). */
  onCambio?: () => void;
}

/**
 * LA PANTALLA DE UN PLAN. El mismo componente sirve al planificador (arma, ajusta, envía) y al
 * coordinador del proyecto (aprueba o rechaza): `plan.permisos` dice qué botones mostrar. Cada acción
 * reemplaza el plan con lo que devuelve el server (grupos, avisos y cobertura ya recalculados).
 */
export const PlanVacacionesProyecto: React.FC<Props> = ({ planId, onVolver, onCambio }) => {
  const [plan, setPlan] = useState<PlanVacaciones | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [vista, setVista] = useState<"grilla" | "linea">("grilla");
  const [verAvisos, setVerAvisos] = useState(false);
  const [editando, setEditando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setPlan(await planVacacionesAPI.obtener(planId));
    } catch (err: any) {
      sweetAlert.error("No se pudo abrir el plan", errorDe(err));
      onVolver?.();
    } finally {
      setCargando(false);
    }
  }, [planId, onVolver]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Corre una acción, reemplaza el plan con la respuesta y muestra el error si lo hay. */
  const accion = useCallback(
    async (fn: () => Promise<PlanVacaciones>, titulo = "No se pudo") => {
      setOcupado(true);
      try {
        const r = await fn();
        setPlan(r);
        onCambio?.();
        return r;
      } catch (err: any) {
        sweetAlert.error(titulo, errorDe(err));
        return null;
      } finally {
        setOcupado(false);
      }
    },
    [onCambio],
  );

  const acciones: AccionesGrilla = useMemo(
    () => ({
      asignarMes: async (grupo: ClaveDeGrupo, mes: string) => {
        const r = await accion(() => planVacacionesAPI.asignarMes(planId, { areaId: grupo.areaId, shiftId: grupo.shiftId, rolFrameId: grupo.rolFrameId, nombreRol: grupo.nombreRol, mes }), "No se pudo repartir el mes");
        if (r?.reparto && r.reparto.salteados.length > 0) sweetAlert.info("Algunas personas no entraron", r.reparto.salteados.map((s) => `${s.nombre}: ${s.motivo}`).join(" · "), 4000);
      },
      quitarAsignacion: async (grupo, mes) => {
        await accion(() => planVacacionesAPI.quitarAsignacion(planId, { areaId: grupo.areaId, shiftId: grupo.shiftId, rolFrameId: grupo.rolFrameId, nombreRol: grupo.nombreRol, mes }));
      },
      crearItem: async (grupo, userId, desde, hasta) => {
        await accion(() => planVacacionesAPI.crearItem(planId, { areaId: grupo.areaId, shiftId: grupo.shiftId, rolFrameId: grupo.rolFrameId, nombreRol: grupo.nombreRol, userId, desde, hasta }), "No se pudo armar el bloque");
      },
      actualizarItem: async (itemId, desde, hasta) => {
        await accion(() => planVacacionesAPI.actualizarItem(planId, itemId, { desde, hasta }), "No se pudieron cambiar las fechas");
      },
      eliminarItem: async (itemId) => {
        await accion(() => planVacacionesAPI.eliminarItem(planId, itemId));
      },
      aprobar: async (itemId) => {
        await accion(() => planVacacionesAPI.aprobarItem(planId, itemId), "No se pudo aprobar");
      },
      rechazar: async (itemId) => {
        const r = await sweetAlert.prompt("Rechazar el bloque", { text: "Decí por qué: el planificador lo necesita para re-armarlo.", placeholder: "Motivo", confirmText: "Rechazar", multilinea: true, mensajeVacio: "Escribí el motivo." });
        if (!r.isConfirmed) return;
        await accion(() => planVacacionesAPI.rechazarItem(planId, itemId, String(r.value || "")), "No se pudo rechazar");
      },
      cancelar: async (item: ItemDelPlan) => {
        const esAprobado = item.estado === "aprobado";
        const r = await sweetAlert.confirm(esAprobado ? "Cancelar el bloque y su solicitud" : "Retirar el bloque", esAprobado ? "La solicitud de vacaciones ya creada queda cancelada (si todavía no está firmada ni entregada) y los días vuelven al saldo." : "El bloque vuelve a «propuesto» y deja de esperar al coordinador.", esAprobado ? "Sí, cancelar" : "Sí, retirar");
        if (!r.isConfirmed) return;
        await accion(() => planVacacionesAPI.cancelarItem(planId, item._id, { reabrir: !esAprobado }), "No se pudo cancelar");
      },
    }),
    [accion, planId],
  );

  if (cargando || !plan) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner message="Abriendo el plan…" />
      </div>
    );
  }

  const n = (e: string) => plan.items.filter((i) => i.estado === e).length;
  const propuestos = plan.items.filter((i) => (i.estado === "propuesto" || i.estado === "rechazado") && i.dias > 0).length;
  const enviados = n("enviado");
  const errores = plan.avisos.filter((a) => a.nivel === "error");
  const soloAvisos = plan.avisos.filter((a) => a.nivel === "aviso");
  const puedeEditar = plan.permisos.puedeEditar && plan.estado !== "cancelado";

  const enviar = async () => {
    const r = await sweetAlert.confirm("Enviar al coordinador", `${propuestos} bloque(s) pasan a esperar la aprobación del coordinador del proyecto. Hasta que responda no se pueden mover.`, "Sí, enviar");
    if (!r.isConfirmed) return;
    await accion(() => planVacacionesAPI.enviar(planId), "No se pudo enviar");
  };
  const aprobarTodo = async () => {
    const r = await sweetAlert.confirm("Aprobar todos los bloques enviados", `Se crean ${enviados} solicitud(es) de vacaciones pre-aprobadas, una por bloque. Cada una sigue el circuito de siempre (aprobar, firma, entregar).`, "Sí, aprobar todo");
    if (!r.isConfirmed) return;
    const res = await accion(() => planVacacionesAPI.aprobarTodo(planId), "No se pudo aprobar");
    if (res?.resultado) {
      const { aprobados, fallidos } = res.resultado;
      if (fallidos.length === 0) sweetAlert.success("Listo", `${aprobados} bloque(s) aprobados.`);
      else sweetAlert.warning(`${aprobados} aprobados, ${fallidos.length} no`, fallidos.map((f) => `${f.nombre}: ${f.motivo}`).join(" · "));
    }
  };
  const refrescar = async () => {
    await accion(() => planVacacionesAPI.refrescarEquipo(planId), "No se pudo refrescar el equipo");
  };
  const cancelarPlan = async () => {
    const r = await sweetAlert.confirm("Cancelar el plan", "El plan queda cancelado y no se puede seguir armando. Los bloques aprobados (si los hay) hay que cancelarlos uno por uno antes.", "Sí, cancelar el plan");
    if (!r.isConfirmed) return;
    await accion(() => planVacacionesAPI.cancelar(planId), "No se pudo cancelar");
  };
  const borrarPlan = async () => {
    const r = await sweetAlert.confirm("Borrar el plan", "Se borra el plan con sus bloques propuestos. No se puede deshacer.", "Sí, borrar");
    if (!r.isConfirmed) return;
    try {
      await planVacacionesAPI.eliminar(planId);
      onCambio?.();
      onVolver?.();
    } catch (err: any) {
      sweetAlert.error("No se pudo borrar", errorDe(err));
    }
  };

  const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
  const chip = "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold";

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {onVolver && (
                <button type="button" onClick={onVolver} className="text-gray-400 hover:text-blue-600" title="Volver a la lista">
                  <FontAwesomeIcon icon={faArrowLeft} />
                </button>
              )}
              <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{plan.nombre}</h2>
              <span className={`${chip} ${CLASE_ESTADO_PLAN[plan.estado]}`}>{TEXTO_ESTADO_PLAN[plan.estado]}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
              {plan.proyecto.name} · {fechaCorta(plan.ventanaDesde)} → {fechaCorta(plan.ventanaHasta)} ({plan.meses.map(mesCorto).join(", ")}) · saldo {plan.anioDeSaldo} · tope {plan.topeDiasPorPersona} días
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {plan.equipo.length} personas en {plan.grupos.length} grupos · {n("propuesto")} propuestos · {enviados} esperando al coordinador · {n("aprobado")} aprobados{n("rechazado") > 0 && ` · ${n("rechazado")} rechazados`}
              {" · "}equipo al {new Date(plan.equipoActualizadoAt).toLocaleDateString("es-AR")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
              <button type="button" onClick={() => setVista("grilla")} className={`px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 ${vista === "grilla" ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                <FontAwesomeIcon icon={faTableCells} /> Grilla
              </button>
              <button type="button" onClick={() => setVista("linea")} className={`px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1.5 ${vista === "linea" ? "bg-blue-600 text-white" : "text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                <FontAwesomeIcon icon={faTimeline} /> Línea de tiempo
              </button>
            </div>
            {puedeEditar && (
              <button type="button" onClick={enviar} disabled={ocupado || propuestos === 0 || errores.length > 0} className={`${btn} bg-amber-600 text-white hover:bg-amber-700`} title={errores.length > 0 ? "Resolvé los errores antes de enviar" : propuestos === 0 ? "No hay bloques propuestos" : "Mandar los bloques propuestos al coordinador"}>
                <FontAwesomeIcon icon={faPaperPlane} /> Enviar al coordinador {propuestos > 0 && `(${propuestos})`}
              </button>
            )}
            {plan.permisos.puedeAprobar && enviados > 0 && (
              <button type="button" onClick={aprobarTodo} disabled={ocupado} className={`${btn} bg-green-600 text-white hover:bg-green-700`}>
                <FontAwesomeIcon icon={faCheckDouble} /> Aprobar todo ({enviados})
              </button>
            )}
            {puedeEditar && (
              <>
                <button type="button" onClick={refrescar} disabled={ocupado} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`} title="Volver a leer el equipo del proyecto y los saldos">
                  <FontAwesomeIcon icon={faRotate} spin={ocupado} /> Refrescar equipo
                </button>
                {plan.estado === "borrador" && (
                  <button type="button" onClick={() => setEditando(true)} disabled={ocupado} className={`${btn} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`}>
                    <FontAwesomeIcon icon={faPen} /> Editar
                  </button>
                )}
                {plan.estado === "borrador" && n("aprobado") === 0 && (
                  <button type="button" onClick={borrarPlan} disabled={ocupado} className={`${btn} text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}>
                    <FontAwesomeIcon icon={faTrash} /> Borrar
                  </button>
                )}
                {plan.estado !== "borrador" && plan.estado !== "cancelado" && plan.estado !== "cerrado" && (
                  <button type="button" onClick={cancelarPlan} disabled={ocupado} className={`${btn} text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20`}>
                    <FontAwesomeIcon icon={faBan} /> Cancelar plan
                  </button>
                )}
              </>
            )}
            {ocupado && <FontAwesomeIcon icon={faSpinner} spin className="text-blue-600" />}
          </div>
        </div>

        {/* Avisos */}
        {plan.avisos.length > 0 && (
          <div className={`rounded-lg border px-3 py-2 text-xs ${errores.length > 0 ? "border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800" : "border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800"}`}>
            <button type="button" onClick={() => setVerAvisos((v) => !v)} className="w-full flex items-center justify-between gap-2 font-semibold text-left">
              <span className={`inline-flex items-center gap-2 ${errores.length > 0 ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}`}>
                <FontAwesomeIcon icon={errores.length > 0 ? faTriangleExclamation : faCircleInfo} />
                {errores.length > 0 && `${errores.length} error(es) que frenan el envío`}
                {errores.length > 0 && soloAvisos.length > 0 && " · "}
                {soloAvisos.length > 0 && `${soloAvisos.length} aviso(s)`}
              </span>
              <FontAwesomeIcon icon={verAvisos ? faChevronUp : faChevronDown} />
            </button>
            {verAvisos && (
              <ul className="mt-2 space-y-0.5 list-disc ml-5 text-gray-700 dark:text-gray-200">
                {[...errores, ...soloAvisos].map((a, i) => (
                  <li key={i} className={a.nivel === "error" ? "text-red-700 dark:text-red-300" : ""}>
                    {a.mensaje}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {plan.permisos.puedeAprobar && !plan.permisos.puedeEditar && <p className="text-xs text-gray-500">Sos el coordinador del proyecto: aprobá o rechazá cada bloque, o todos juntos.</p>}
        {!plan.permisos.puedeAprobar && enviados > 0 && <p className="text-xs text-amber-700 dark:text-amber-300">Hay {enviados} bloque(s) esperando al coordinador del proyecto. Cuando responda, los aprobados aparecen en Solicitudes como pre-aprobadas.</p>}
      </div>

      {vista === "grilla" ? <GrillaDelPlan plan={plan} acciones={acciones} ocupado={ocupado} /> : <LineaDeTiempoDelPlan plan={plan} />}

      <ModalNuevoPlan isOpen={editando} onClose={() => setEditando(false)} plan={plan} onListo={(p) => setPlan(p)} />
    </div>
  );
};

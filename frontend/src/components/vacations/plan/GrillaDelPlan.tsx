import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGripVertical, faTrash, faCheck, faXmark, faBan, faPen, faTriangleExclamation, faCircleInfo, faEraser, faSpinner, faFileLines } from "@fortawesome/free-solid-svg-icons";
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent, DragOverlay } from "@dnd-kit/core";
import { Link } from "react-router-dom";
import type { PlanVacaciones, GrupoDelPlan, ItemDelPlan, MiembroDelPlan, ClaveDeGrupo, Aviso } from "../../../api/planVacaciones";
import { TEXTO_ESTADO_ITEM, esEditable } from "@compartido/planVacaciones/estado";
import { fechaCorta, diasEntre } from "@compartido/planVacaciones/fechas";
import { repartirMes } from "@compartido/planVacaciones/repartirMes";
import { CLASE_ESTADO_ITEM, mesCorto } from "./estilos";
import { claveAreaTurno, claveFilaArea } from "@compartido/areaTurno";

/**
 * LA GRILLA DEL PLAN: filas = grupos (área › turno › rol), columnas = los meses de la ventana.
 *  · Arrastrar el asa de una fila a un mes reparte ese mes entre las personas del rol (1–15 / 16–30…).
 *  · Arrastrar una persona suelta a un mes le arma un bloque sola (desde el 1, hasta su saldo o el tope).
 *  · Cada bloque se edita en el lugar (fechas), se borra, se envía; el coordinador lo aprueba o rechaza.
 *  · Debajo de los bloques, la cobertura del mes: cuántos del rol faltan cada día (lo que justifica el
 *    reemplazo mensual).
 */

export interface AccionesGrilla {
  asignarMes: (grupo: ClaveDeGrupo, mes: string) => Promise<void>;
  quitarAsignacion: (grupo: ClaveDeGrupo, mes: string) => Promise<void>;
  crearItem: (grupo: ClaveDeGrupo, userId: string, desde: string, hasta: string) => Promise<void>;
  actualizarItem: (itemId: string, desde: string, hasta: string) => Promise<void>;
  eliminarItem: (itemId: string) => Promise<void>;
  aprobar: (itemId: string) => Promise<void>;
  rechazar: (itemId: string) => Promise<void>;
  cancelar: (item: ItemDelPlan) => Promise<void>;
  reemplazo?: (grupo: GrupoDelPlan, mes: string) => void;
  cancelarReemplazo?: (reemplazoId: string) => Promise<void>;
}

interface Props {
  plan: PlanVacaciones;
  acciones: AccionesGrilla;
  ocupado: boolean;
}

// La misma clave que `claveDeGrupo` del server: área × turno (× sede) × rol.
const claveDe = (g: ClaveDeGrupo) => `${claveAreaTurno(g)}::${g.rolFrameId ? g.rolFrameId : `nombre:${g.nombreRol || ""}`}`;
const grupoDeItem = (i: ItemDelPlan): ClaveDeGrupo => ({ areaId: i.areaId, shiftId: i.shiftId, sedeId: i.sedeId, rolFrameId: i.rolFrameId, nombreRol: i.nombreRol });

export const GrillaDelPlan: React.FC<Props> = ({ plan, acciones, ocupado }) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [arrastrando, setArrastrando] = useState<string | null>(null);
  const puedeEditar = plan.permisos.puedeEditar && plan.estado !== "cancelado";
  const miembroDe = useMemo(() => new Map(plan.equipo.map((m) => [m.userId, m])), [plan.equipo]);
  const itemsPorCelda = useMemo(() => {
    const m = new Map<string, ItemDelPlan[]>();
    for (const i of plan.items) {
      const k = `${claveDe(grupoDeItem(i))}|${i.mes}`;
      m.set(k, [...(m.get(k) || []), i]);
    }
    for (const lista of m.values()) lista.sort((a, b) => a.desde.localeCompare(b.desde));
    return m;
  }, [plan.items]);
  /** Dónde está planificada cada persona (bloques vivos), para atenuarla en las demás filas. */
  const mesDePersona = useMemo(() => {
    const m = new Map<string, ItemDelPlan>();
    for (const i of plan.items) if (i.estado !== "cancelado" && i.estado !== "rechazado") m.set(i.userId, i);
    return m;
  }, [plan.items]);
  const avisosPorItem = useMemo(() => {
    const m = new Map<string, Aviso[]>();
    for (const a of plan.avisos) if (a.itemId) m.set(a.itemId, [...(m.get(a.itemId) || []), a]);
    return m;
  }, [plan.avisos]);
  const avisosPorPersona = useMemo(() => {
    const m = new Map<string, Aviso[]>();
    for (const a of plan.avisos) if (!a.itemId && a.userId) m.set(a.userId, [...(m.get(a.userId) || []), a]);
    return m;
  }, [plan.avisos]);

  const onDragEnd = async (e: DragEndEvent) => {
    setArrastrando(null);
    const over = String(e.over?.id || "");
    const active = String(e.active.id);
    if (!over.startsWith("c|")) return;
    const [, claveCelda, mes] = over.split("|");
    const grupo = plan.grupos.find((g) => g.clave === claveCelda);
    if (!grupo) return;
    if (active.startsWith("g|")) {
      if (active.slice(2) !== claveCelda) return; // una fila sólo se suelta en sus propios meses
      await acciones.asignarMes(grupo, mes);
    } else if (active.startsWith("p|")) {
      const [, claveFila, userId] = active.split("|");
      if (claveFila !== claveCelda) return;
      const m = miembroDe.get(userId);
      if (!m) return;
      const [b] = repartirMes([{ userId, disponibles: m.diasDisponibles }], mes, { tope: plan.topeDiasPorPersona, ventanaDesde: plan.ventanaDesde, ventanaHasta: plan.ventanaHasta });
      if (!b || b.dias <= 0) return;
      await acciones.crearItem(grupo, userId, b.desde, b.hasta);
    }
  };

  const th = "px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700";

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setArrastrando(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setArrastrando(null)}>
      {/*
        LA TABLA SCROLLEA ADENTRO DE SU CAJA, con el encabezado (Área › Turno › Rol y los meses) pegado arriba.
        Mismo patrón que Gestión por Usuario: la caja mide lo que queda debajo de la parte fija de la pantalla
        (`--wp-sticky-top`, que publica PageLayout) y el `<thead>` es sticky dentro de ella; un sticky contra la
        página no serviría porque el `overflow-x` del scroll horizontal lo anula.
      */}
      <div className="overflow-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 max-h-[calc(100svh-var(--wp-sticky-top,220px)-1.5rem)]">
        <table className="min-w-full border-separate border-spacing-0">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className={`${th} sticky left-0 z-30 min-w-[280px] max-w-[320px]`}>Área › Turno › Rol</th>
              {plan.meses.map((mes) => (
                <th key={mes} className={`${th} min-w-[240px]`}>
                  {mesCorto(mes)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {plan.grupos.length === 0 && (
              <tr>
                <td colSpan={plan.meses.length + 1} className="px-6 py-10 text-center text-sm text-gray-500">
                  El equipo del proyecto no tiene personas con contrato vigente y área/turno asignado. Asignalas desde Equipo › Jerarquía y después «Refrescar equipo».
                </td>
              </tr>
            )}
            {plan.grupos.map((g, idx) => {
              const anterior = plan.grupos[idx - 1];
              // Un área en dos sedes son dos bloques («Edición · Huidobro», «Edición · Libertador»).
              const nuevaArea = !anterior || claveFilaArea(anterior) !== claveFilaArea(g);
              const nuevoTurno = nuevaArea || anterior.shiftId !== g.shiftId;
              return (
                <tr key={g.clave} className={nuevaArea ? "border-t-4" : ""}>
                  <td className={`sticky left-0 z-10 bg-white dark:bg-gray-800 align-top px-3 py-2 border-b border-gray-100 dark:border-gray-700 ${nuevaArea ? "border-t-2 border-t-gray-300 dark:border-t-gray-600" : ""}`}>
                    <FilaGrupo grupo={g} miembroDe={miembroDe} mesDePersona={mesDePersona} avisosPorPersona={avisosPorPersona} puedeEditar={puedeEditar} mostrarArea={nuevaArea} mostrarTurno={nuevoTurno} />
                  </td>
                  {plan.meses.map((mes) => (
                    <CeldaMes
                      key={mes}
                      plan={plan}
                      grupo={g}
                      mes={mes}
                      items={itemsPorCelda.get(`${g.clave}|${mes}`) || []}
                      miembroDe={miembroDe}
                      avisosPorItem={avisosPorItem}
                      acciones={acciones}
                      puedeEditar={puedeEditar}
                      ocupado={ocupado}
                      arrastrandoDeEstaFila={!!arrastrando && arrastrando.split("|")[1] === g.clave}
                      claseTop={nuevaArea ? "border-t-2 border-t-gray-300 dark:border-t-gray-600" : ""}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <DragOverlay dropAnimation={null}>
        {arrastrando ? (
          <div className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold shadow-lg">
            {arrastrando.startsWith("g|") ? "Soltá en un mes para repartirlo entre el rol" : `${miembroDe.get(arrastrando.split("|")[2])?.nombre || "Persona"} → soltá en un mes`}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};

// ───────────────────────────── la fila: el grupo y sus personas ─────────────────────────────

const FilaGrupo: React.FC<{
  grupo: GrupoDelPlan;
  miembroDe: Map<string, MiembroDelPlan>;
  mesDePersona: Map<string, ItemDelPlan>;
  avisosPorPersona: Map<string, Aviso[]>;
  puedeEditar: boolean;
  mostrarArea: boolean;
  mostrarTurno: boolean;
}> = ({ grupo, miembroDe, mesDePersona, avisosPorPersona, puedeEditar, mostrarArea, mostrarTurno }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `g|${grupo.clave}`, disabled: !puedeEditar });
  const sinAsignar = grupo.userIds.filter((u) => !mesDePersona.has(u));
  return (
    <div className="space-y-1.5">
      {mostrarArea && (
        <p className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
          {grupo.areaNombre}
          {grupo.sedeNombre && <span className="normal-case tracking-normal"> · {grupo.sedeNombre}</span>}
        </p>
      )}
      {/* El turno en naranja (pedido del 18/10/2026): con el área en azul y el rol en negro, la jerarquía se lee de un vistazo. */}
      {mostrarTurno && <p className="text-xs font-bold uppercase tracking-wide text-orange-600 dark:text-orange-400 pl-2">{grupo.shiftNombre}</p>}
      <div className="flex items-start gap-2 pl-4">
        <button
          ref={setNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          disabled={!puedeEditar || sinAsignar.length === 0}
          title={puedeEditar ? (sinAsignar.length === 0 ? "Todo el rol ya está planificado" : "Arrastrá este rol a un mes para repartirlo") : ""}
          className={`mt-0.5 text-gray-400 hover:text-blue-600 disabled:opacity-30 cursor-grab active:cursor-grabbing ${isDragging ? "opacity-40" : ""}`}
        >
          <FontAwesomeIcon icon={faGripVertical} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
            {grupo.nombreRol} <span className="text-xs font-normal text-gray-500">({grupo.userIds.length})</span>
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {grupo.userIds.map((u) => (
              <ChipPersona key={u} grupo={grupo} miembro={miembroDe.get(u)} planificadaEn={mesDePersona.get(u)} avisos={avisosPorPersona.get(u) || []} puedeEditar={puedeEditar} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ChipPersona: React.FC<{ grupo: GrupoDelPlan; miembro?: MiembroDelPlan; planificadaEn?: ItemDelPlan; avisos: Aviso[]; puedeEditar: boolean }> = ({ grupo, miembro, planificadaEn, avisos, puedeEditar }) => {
  const userId = miembro?.userId || "";
  const arrastrable = puedeEditar && !planificadaEn && !!miembro && miembro.diasDisponibles > 0;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `p|${grupo.clave}|${userId}`, disabled: !arrastrable });
  if (!miembro) return null;
  const enOtraFila = planificadaEn && claveDe(grupoDeItem(planificadaEn)) !== grupo.clave;
  const titulo = planificadaEn ? `Planificada en ${mesCorto(planificadaEn.mes)} (${fechaCorta(planificadaEn.desde)}–${fechaCorta(planificadaEn.hasta)})${enOtraFila ? `, en ${planificadaEn.nombreRol}` : ""}` : miembro.diasDisponibles <= 0 ? "Sin días disponibles en el año de saldo" : `${miembro.diasDisponibles} de ${miembro.diasTotales} días disponibles · arrastrá a un mes`;
  return (
    <span
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      title={titulo}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] whitespace-nowrap ${
        planificadaEn ? "border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900" : "border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/20"
      } ${arrastrable ? "cursor-grab active:cursor-grabbing" : ""} ${isDragging ? "opacity-40" : ""}`}
    >
      {miembro.nombre}
      <span className={`font-mono ${miembro.diasDisponibles <= 0 ? "text-red-500" : ""}`}>{miembro.diasDisponibles}d</span>
      {avisos.length > 0 && <FontAwesomeIcon icon={faTriangleExclamation} className="text-red-500 h-2.5 w-2.5" title={avisos.map((a) => a.mensaje).join("\n")} />}
    </span>
  );
};

// ───────────────────────────── la celda: un grupo en un mes ─────────────────────────────

const CeldaMes: React.FC<{
  plan: PlanVacaciones;
  grupo: GrupoDelPlan;
  mes: string;
  items: ItemDelPlan[];
  miembroDe: Map<string, MiembroDelPlan>;
  avisosPorItem: Map<string, Aviso[]>;
  acciones: AccionesGrilla;
  puedeEditar: boolean;
  ocupado: boolean;
  arrastrandoDeEstaFila: boolean;
  claseTop: string;
}> = ({ plan, grupo, mes, items, miembroDe, avisosPorItem, acciones, puedeEditar, ocupado, arrastrandoDeEstaFila, claseTop }) => {
  const { setNodeRef, isOver } = useDroppable({ id: `c|${grupo.clave}|${mes}`, disabled: !puedeEditar });
  const cob = plan.cobertura[grupo.clave]?.[mes];
  const editables = items.filter((i) => esEditable(i.estado));
  const reemplazo = plan.reemplazos.find((r) => r.estado !== "cancelado" && r.mes === mes && claveDe(r) === grupo.clave);
  return (
    <td ref={setNodeRef} className={`align-top px-2 py-2 border-b border-l border-gray-100 dark:border-gray-700 ${claseTop} transition-colors ${isOver ? "bg-blue-50 dark:bg-blue-900/30 ring-2 ring-inset ring-blue-400" : arrastrandoDeEstaFila ? "bg-blue-50/40 dark:bg-blue-900/10" : ""}`}>
      <div className="space-y-1.5 min-h-[56px]">
        {items.map((i) => (
          <Bloque key={i._id} item={i} miembro={miembroDe.get(i.userId)} avisos={avisosPorItem.get(i._id) || []} plan={plan} acciones={acciones} puedeEditar={puedeEditar} ocupado={ocupado} />
        ))}
        {items.length === 0 && puedeEditar && <p className="text-[11px] text-gray-300 dark:text-gray-600 italic">Soltá acá el rol o una persona</p>}
        {cob && cob.diasConAlguienAfuera > 0 && (
          <div className="pt-1">
            <div className="flex gap-px" title={`${cob.diasConAlguienAfuera} de ${cob.dias} días con alguien del rol afuera${cob.diasSinNadie > 0 ? ` · ${cob.diasSinNadie} sin nadie` : ""}`}>
              {cob.ausentesPorDia.map((n, k) => (
                <span key={k} className={`h-1.5 flex-1 rounded-sm ${n === 0 ? "bg-green-300 dark:bg-green-800" : n >= grupo.userIds.length ? "bg-red-500" : "bg-amber-400"}`} />
              ))}
            </div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] text-gray-500">
                {cob.diasConAlguienAfuera} de {cob.dias} días con alguien afuera{cob.diasSinNadie > 0 && <span className="text-red-600 font-semibold"> · {cob.diasSinNadie} sin nadie</span>}
              </p>
              <div className="flex items-center gap-2">
                {reemplazo ? (
                  <span className="text-[10px] font-semibold text-violet-700 dark:text-violet-300 inline-flex items-center gap-1" title={`Reemplazo mensual: ${reemplazo.nombreContrato} · ${fechaCorta(reemplazo.desde)}–${fechaCorta(reemplazo.hasta)}`}>
                    <FontAwesomeIcon icon={faFileLines} className="h-2.5 w-2.5" />
                    {reemplazo.solicitudId ? (
                      <Link to={`/projects/${plan.projectId}/team?tab=solicitudes`} className="hover:underline">
                        Reemplazo pedido
                      </Link>
                    ) : (
                      "Reemplazo propuesto"
                    )}
                    {puedeEditar && acciones.cancelarReemplazo && (
                      <button type="button" disabled={ocupado} onClick={() => void acciones.cancelarReemplazo!(reemplazo._id)} title="Cancelar el reemplazo (y su solicitud si sigue pendiente)" className="text-gray-400 hover:text-red-600 disabled:opacity-40">
                        <FontAwesomeIcon icon={faBan} className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </span>
                ) : (
                  puedeEditar &&
                  acciones.reemplazo && (
                    <button type="button" onClick={() => acciones.reemplazo!(grupo, mes)} className="text-[10px] font-semibold text-violet-700 dark:text-violet-300 hover:underline">
                      Reemplazo mensual
                    </button>
                  )
                )}
                {puedeEditar && editables.length > 0 && (
                  <button type="button" disabled={ocupado} onClick={() => void acciones.quitarAsignacion(grupo, mes)} title="Quitar los bloques propuestos de este mes" className="text-gray-400 hover:text-red-600 disabled:opacity-40">
                    <FontAwesomeIcon icon={faEraser} className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </td>
  );
};

// ───────────────────────────── el bloque de una persona ─────────────────────────────

const Bloque: React.FC<{ item: ItemDelPlan; miembro?: MiembroDelPlan; avisos: Aviso[]; plan: PlanVacaciones; acciones: AccionesGrilla; puedeEditar: boolean; ocupado: boolean }> = ({ item, miembro, avisos, plan, acciones, puedeEditar, ocupado }) => {
  const [editando, setEditando] = useState(false);
  const [desde, setDesde] = useState(item.desde);
  const [hasta, setHasta] = useState(item.hasta);
  const [guardando, setGuardando] = useState(false);
  const editable = puedeEditar && esEditable(item.estado);
  const errores = avisos.filter((a) => a.nivel === "error");
  const guardar = async () => {
    if (desde === item.desde && hasta === item.hasta) return setEditando(false);
    setGuardando(true);
    try {
      await acciones.actualizarItem(item._id, desde, hasta);
      setEditando(false);
    } finally {
      setGuardando(false);
    }
  };
  const btn = "p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-40";
  return (
    <div className={`rounded-md border px-2 py-1 text-xs ${CLASE_ESTADO_ITEM[item.estado]} ${errores.length > 0 ? "ring-1 ring-red-400" : ""}`}>
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0">
          <p className="font-semibold truncate" title={miembro?.nombre}>
            {miembro?.nombre || "Persona"}
          </p>
          {editando ? (
            <div className="flex items-center gap-1 mt-1">
              <input type="date" className="input-field !py-0.5 !px-1 !text-[11px] w-[118px]" value={desde} min={plan.ventanaDesde} max={plan.ventanaHasta} onChange={(e) => setDesde(e.target.value)} />
              <span>–</span>
              <input type="date" className="input-field !py-0.5 !px-1 !text-[11px] w-[118px]" value={hasta} min={desde} max={plan.ventanaHasta} onChange={(e) => setHasta(e.target.value)} />
              <span className="font-mono">{diasEntre(desde, hasta)}d</span>
            </div>
          ) : (
            <p className="font-mono text-[11px]">
              {fechaCorta(item.desde)} – {fechaCorta(item.hasta)} · {item.dias}d
              <span className="opacity-60"> / {item.diasDisponiblesAlPlanificar}</span>
            </p>
          )}
          <p className="text-[10px] opacity-75 inline-flex items-center gap-1">
            {TEXTO_ESTADO_ITEM[item.estado]}
            {item.ajustadoAMano && item.estado === "propuesto" && <span title="Fechas ajustadas a mano">· a mano</span>}
            {item.estado === "rechazado" && item.motivoRechazo && <span title={item.motivoRechazo}>· «{item.motivoRechazo.length > 40 ? `${item.motivoRechazo.slice(0, 40)}…` : item.motivoRechazo}»</span>}
            {item.vacationId && (
              <Link to={`/vacations?id=${item.vacationId}`} className="underline" title="Ver la solicitud de vacaciones">
                · solicitud
              </Link>
            )}
            {avisos.length > 0 && <FontAwesomeIcon icon={errores.length > 0 ? faTriangleExclamation : faCircleInfo} className={`h-2.5 w-2.5 ${errores.length > 0 ? "text-red-600" : "text-amber-600"}`} title={avisos.map((a) => a.mensaje).join("\n")} />}
          </p>
        </div>
        <div className="flex items-center shrink-0 -mr-1">
          {editando ? (
            <>
              <button type="button" className={btn} disabled={guardando} onClick={() => void guardar()} title="Guardar fechas">
                <FontAwesomeIcon icon={guardando ? faSpinner : faCheck} spin={guardando} className="h-3 w-3" />
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => {
                  setEditando(false);
                  setDesde(item.desde);
                  setHasta(item.hasta);
                }}
                title="Dejar como estaba"
              >
                <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
              </button>
            </>
          ) : (
            <>
              {editable && (
                <button type="button" className={btn} disabled={ocupado} onClick={() => setEditando(true)} title="Cambiar las fechas">
                  <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                </button>
              )}
              {editable && (
                <button type="button" className={btn} disabled={ocupado} onClick={() => void acciones.eliminarItem(item._id)} title="Quitar el bloque">
                  <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                </button>
              )}
              {item.estado === "enviado" && plan.permisos.puedeAprobar && (
                <>
                  <button type="button" className={`${btn} text-green-700`} disabled={ocupado} onClick={() => void acciones.aprobar(item._id)} title="Aprobar: se crea la solicitud de vacaciones pre-aprobada">
                    <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                  </button>
                  <button type="button" className={`${btn} text-red-700`} disabled={ocupado} onClick={() => void acciones.rechazar(item._id)} title="Rechazar con un motivo">
                    <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                  </button>
                </>
              )}
              {puedeEditar && (item.estado === "enviado" || item.estado === "aprobado") && (
                <button type="button" className={btn} disabled={ocupado} onClick={() => void acciones.cancelar(item)} title={item.estado === "aprobado" ? "Cancelar el bloque y su solicitud de vacaciones" : "Retirar el bloque enviado"}>
                  <FontAwesomeIcon icon={faBan} className="h-3 w-3" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

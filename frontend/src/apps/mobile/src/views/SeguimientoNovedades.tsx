import { useEffect, useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, getDay } from "date-fns";
import { es } from "date-fns/locale";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faCalendarCheck, faChevronLeft, faChevronRight, faBell, faSpinner, faChevronDown, faChevronUp, faCircleCheck, faXmark, faUser, faUsers, faMagnifyingGlass, faCheck } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import { complianceAPI, ComplianceResponse, CoordinatorCompliance } from "../../../../api/compliance";
import { sweetAlert } from "../../../../utils/sweetAlert";

interface SeguimientoNovedadesProps {
  onNavigate: (view: ViewType) => void;
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * NOVEDADES DEL SUPERVISOR: EL CUMPLIMIENTO DE SUS COORDINADORES
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Es el modal «Cumplimiento de coordinadores» del panel web, con los mismos datos y el mismo criterio
 * de colores, rearmado para el teléfono. En la web van calendario y lista lado a lado; acá no entran,
 * así que se apila en el orden en que se lee:
 *
 *   1. Resumen del mes (cumplido, vencidas, a tiempo): la respuesta a «¿cómo vienen?».
 *   2. A quién se mira: todos o un coordinador, en chips que se deslizan.
 *   3. El calendario, compacto: un día es un cuadrado de color; tocarlo abre su detalle debajo.
 *   4. La lista de coordinadores (o, con uno elegido, lo que le falta), con «Recordar».
 *
 * El server acota los datos a los proyectos que la persona supervisa: acá no se filtra nada por
 * seguridad, sólo por lo que se quiere ver. El Excel del panel web no está: en el teléfono no se usa.
 */

type Estado = "complete" | "partial" | "pending" | "missing" | "none";

const ESTILO_DIA: Record<Estado, string> = {
  complete: "border-green-500/60 bg-green-500/20 text-green-800 dark:text-green-300",
  partial: "border-amber-500/60 bg-amber-500/20 text-amber-800 dark:text-amber-300",
  pending: "border-blue-500/60 bg-blue-500/20 text-blue-800 dark:text-blue-300",
  missing: "border-red-500/60 bg-red-500/20 text-red-800 dark:text-red-300",
  none: "border-slate-200 text-slate-400 dark:border-slate-800 dark:text-slate-500",
};

const LEYENDA: [string, string][] = [
  ["bg-green-500", "Enviada"],
  ["bg-red-500", "Vencida"],
  ["bg-blue-500", "A tiempo"],
  ["bg-amber-500", "Parcial"],
];

const INICIALES_DIA = ["D", "L", "M", "M", "J", "V", "S"];
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** Día de la semana de un "YYYY-MM-DD" sin correrse por la zona horaria. */
const diaDeSemana = (d: string) => {
  const [y, m, dia] = d.split("-").map(Number);
  return new Date(y, m - 1, dia).getDay();
};
const fechaCorta = (d: string) => {
  const [, m, dia] = d.split("-");
  return `${dia}/${m}`;
};

/** Vencidas y a tiempo de un coordinador, con el mismo respaldo que la web para un backend viejo. */
const conteos = (c: CoordinatorCompliance) => {
  const aTiempo = c.pendingCount ?? 0;
  return { aTiempo, vencidas: c.expiredCount ?? Math.max(0, c.missingCount - aTiempo) };
};

export default function SeguimientoNovedades({ onNavigate }: SeguimientoNovedadesProps) {
  const [mes, setMes] = useState(() => startOfMonth(new Date()));
  const [proyectoId, setProyectoId] = useState("");
  const [data, setData] = useState<ComplianceResponse | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [coordinadorId, setCoordinadorId] = useState<string | null>(null);
  const [diaElegido, setDiaElegido] = useState<string | null>(null);
  const [verFaltantes, setVerFaltantes] = useState(false);
  const [recordando, setRecordando] = useState<Set<string>>(new Set());
  // A quién se revisa se elige en un menú que sube desde abajo, no en un carrusel: con muchos
  // coordinadores había que deslizar a ciegas buscando un nombre cortado.
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  // Los proyectos que aparecieron alguna vez sin filtro: con el filtro puesto la respuesta sólo trae
  // uno, y el selector se quedaría sin opciones para volver.
  const [proyectos, setProyectos] = useState<Map<string, string>>(new Map());

  const hoy = format(new Date(), "yyyy-MM-dd");
  const desde = format(mes, "yyyy-MM-dd");
  const finDeMes = format(endOfMonth(mes), "yyyy-MM-dd");
  const hasta = finDeMes < hoy ? finDeMes : hoy;
  const mesFuturo = desde > hoy;

  useEffect(() => {
    setDiaElegido(null);
    if (mesFuturo) {
      setData(null);
      return;
    }
    let cancelado = false;
    setCargando(true);
    setError("");
    complianceAPI
      .get({ from: desde, to: hasta, projectId: proyectoId || undefined })
      .then((res) => {
        if (cancelado) return;
        setData(res);
        if (!proyectoId) {
          setProyectos((prev) => {
            const next = new Map(prev);
            res.coordinators.forEach((c) => c.projects.forEach((p) => next.set(p.projectId, p.projectName)));
            return next;
          });
        }
      })
      .catch((err) => {
        if (cancelado) return;
        setData(null);
        setError(err?.response?.data?.error || "No se pudo cargar el cumplimiento. Probá de nuevo en un momento.");
      })
      .finally(() => !cancelado && setCargando(false));
    return () => {
      cancelado = true;
    };
  }, [desde, hasta, proyectoId, mesFuturo]);

  // Los más atrasados primero: es a quien hay que mirar.
  const coordinadores = useMemo(
    () =>
      [...(data?.coordinators || [])].sort((a, b) => {
        const ca = conteos(a);
        const cb = conteos(b);
        return cb.vencidas - ca.vencidas || b.missingCount - a.missingCount || a.name.localeCompare(b.name);
      }),
    [data],
  );

  const elegido = useMemo(() => (coordinadorId ? coordinadores.find((c) => c.userId === coordinadorId) || null : null), [coordinadores, coordinadorId]);

  // Mismo cálculo que la web: el estado del día es el de todos, o sólo el del coordinador elegido.
  const estadoPorDia = useMemo(() => {
    const mapa: Record<string, Estado> = {};
    if (!elegido) {
      (data?.calendar || []).forEach((d) => (mapa[d.date] = d.status));
      return mapa;
    }
    const agg: Record<string, { esp: number; env: number; pend: number }> = {};
    const tocar = (d: string) => (agg[d] = agg[d] || { esp: 0, env: 0, pend: 0 });
    elegido.projects.forEach((p) => {
      p.expectedDates.forEach((d) => tocar(d).esp++);
      p.submittedDates.forEach((d) => tocar(d).env++);
      (p.pendingDates || []).forEach((d) => tocar(d).pend++);
    });
    Object.entries(agg).forEach(([d, v]) => {
      const faltan = v.esp - v.env;
      if (v.esp === 0) mapa[d] = "none";
      else if (faltan <= 0) mapa[d] = "complete";
      else if (v.env === 0 && v.pend >= faltan) mapa[d] = "pending";
      else if (v.env === 0) mapa[d] = "missing";
      else mapa[d] = "partial";
    });
    return mapa;
  }, [data, elegido]);

  const resumen = useMemo(() => {
    const lista = elegido ? [elegido] : coordinadores;
    const esperadas = lista.reduce((a, c) => a + c.expectedCount, 0);
    const enviadas = lista.reduce((a, c) => a + c.submittedCount, 0);
    return {
      esperadas,
      enviadas,
      pct: esperadas ? Math.round((enviadas / esperadas) * 100) : 100,
      vencidas: lista.reduce((a, c) => a + conteos(c).vencidas, 0),
      aTiempo: lista.reduce((a, c) => a + conteos(c).aTiempo, 0),
    };
  }, [coordinadores, elegido]);

  const dias = useMemo(() => eachDayOfInterval({ start: mes, end: endOfMonth(mes) }), [mes]);
  const huecos = getDay(mes); // la grilla arranca en domingo

  const detalleDelDia = useMemo(() => {
    if (!diaElegido) return null;
    const dia = data?.calendar.find((c) => c.date === diaElegido);
    const faltantes = (dia?.missingCells || []).filter((m) => !elegido || m.userId === elegido.userId);
    const enviadas = elegido ? elegido.projects.map((p) => p.reportsByDate?.[diaElegido]).filter(Boolean) : [];
    return { faltantes, enviadas: enviadas as string[] };
  }, [diaElegido, data, elegido]);

  const recordar = async (ids?: string[]) => {
    try {
      const res = await complianceAPI.remind({ from: desde, to: hasta, projectId: proyectoId || undefined, coordinatorIds: ids });
      await sweetAlert.success(res.count > 0 ? "Recordatorio enviado" : "Sin envíos", res.count > 0 ? `Se notificó a ${res.count} coordinador(es).` : "No había a quién recordarle, o ya recibió un recordatorio hoy.");
    } catch (err: any) {
      sweetAlert.error("No se pudo enviar", err?.response?.data?.error || "Probá de nuevo en un momento.");
    }
  };

  const recordarA = async (userId: string) => {
    setRecordando((s) => new Set(s).add(userId));
    await recordar([userId]);
    setRecordando((s) => {
      const n = new Set(s);
      n.delete(userId);
      return n;
    });
  };

  const recordarATodos = async () => {
    const atrasados = coordinadores.filter((c) => c.missingCount > 0);
    if (atrasados.length === 0) return;
    const r = await sweetAlert.confirm("¿Recordar a los que les falta?", `Se va a notificar a ${atrasados.length} coordinador(es) con novedades pendientes.`, "Sí, recordar");
    if (!r.isConfirmed) return;
    setRecordando((s) => new Set(s).add("__todos__"));
    await recordar();
    setRecordando((s) => {
      const n = new Set(s);
      n.delete("__todos__");
      return n;
    });
  };

  const elegirCoordinador = (id: string | null) => {
    setCoordinadorId(id);
    setDiaElegido(null);
    setVerFaltantes(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const botonRecordar = (userId: string) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        recordarA(userId);
      }}
      disabled={recordando.has(userId)}
      className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-700 disabled:opacity-50 dark:border-amber-700 dark:text-amber-400"
    >
      <FontAwesomeIcon icon={recordando.has(userId) ? faSpinner : faBell} className={recordando.has(userId) ? "animate-spin" : ""} /> Recordar
    </button>
  );

  return (
    <div className="flex-1 pb-24">
      {/* HEADER */}
      <div className="sticky top-0 z-30 border-b border-slate-800 bg-slate-50/90 px-4 py-4 backdrop-blur-sm dark:bg-slate-900/90">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate("home")} className="flex h-10 w-10 items-center justify-center rounded transition-colors hover:bg-slate-200 dark:hover:bg-slate-800">
            <FontAwesomeIcon icon={faArrowLeft} className="h-5 w-5 text-slate-900 dark:text-slate-100" />
          </button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-slate-100">
              <FontAwesomeIcon icon={faCalendarCheck} className="h-5 w-5" />
              Cumplimiento
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Cumplimiento de tus coordinadores</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        {/* PROYECTO: sólo si supervisa más de uno */}
        {proyectos.size > 1 && (
          <select value={proyectoId} onChange={(e) => setProyectoId(e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white">
            <option value="">Todos mis proyectos</option>
            {[...proyectos].map(([id, nombre]) => (
              <option key={id} value={id}>
                {nombre}
              </option>
            ))}
          </select>
        )}

        {/* MES */}
        <div className="flex items-center justify-between">
          <button onClick={() => setMes((m) => subMonths(m, 1))} className="flex h-9 w-9 items-center justify-center rounded border border-slate-200 dark:border-slate-700" aria-label="Mes anterior">
            <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
          </button>
          <p className="text-base font-bold capitalize text-slate-900 dark:text-slate-100">{format(mes, "MMMM yyyy", { locale: es })}</p>
          <button onClick={() => setMes((m) => addMonths(m, 1))} className="flex h-9 w-9 items-center justify-center rounded border border-slate-200 dark:border-slate-700" aria-label="Mes siguiente">
            <FontAwesomeIcon icon={faChevronRight} className="h-3.5 w-3.5" />
          </button>
        </div>

        {error && <p className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>}
        {mesFuturo && <p className="rounded-xl border border-slate-300 p-3 text-sm text-slate-500 dark:border-slate-700">Mes futuro: todavía no hay novedades esperadas.</p>}

        {!mesFuturo && !error && (
          <>
            {/* 1. RESUMEN */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-slate-200 px-2 py-2 text-center dark:border-slate-700">
                <p className="text-lg font-black leading-tight text-slate-900 dark:text-slate-100">{data ? `${resumen.pct}%` : "—"}</p>
                <p className="text-[10px] font-semibold uppercase text-slate-500">Cumplido</p>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 px-2 py-2 text-center dark:border-red-900/70 dark:bg-red-950/20">
                <p className="text-lg font-black leading-tight text-red-700 dark:text-red-300">{data ? resumen.vencidas : "—"}</p>
                <p className="text-[10px] font-semibold uppercase text-red-600 dark:text-red-400">Vencidas</p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-2 py-2 text-center dark:border-blue-900/70 dark:bg-blue-950/20">
                <p className="text-lg font-black leading-tight text-blue-700 dark:text-blue-300">{data ? resumen.aTiempo : "—"}</p>
                <p className="text-[10px] font-semibold uppercase text-blue-600 dark:text-blue-400">A tiempo</p>
              </div>
            </div>
            {data && (
              <p className="-mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
                {resumen.enviadas} de {resumen.esperadas} novedades enviadas{elegido ? ` por ${elegido.name}` : ""}
              </p>
            )}

            {/* 2. A QUIÉN SE REVISA: un botón que dice quién es, y abre el menú para cambiarlo */}
            {coordinadores.length > 0 && (
              <button
                onClick={() => {
                  setBusqueda("");
                  setSelectorAbierto(true);
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2.5 text-left dark:border-blue-800 dark:bg-blue-950/30"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                  <FontAwesomeIcon icon={elegido ? faUser : faUsers} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Revisando</span>
                  <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">{elegido ? elegido.name : `Todos los coordinadores (${coordinadores.length})`}</span>
                </span>
                {elegido && conteos(elegido).vencidas > 0 && <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">{conteos(elegido).vencidas} vencidas</span>}
                <span className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400">
                  Cambiar <FontAwesomeIcon icon={faChevronDown} className="ml-0.5 h-3 w-3" />
                </span>
              </button>
            )}

            {/* 3. CALENDARIO */}
            <div className="relative rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              {cargando && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 dark:bg-slate-900/60">
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl text-blue-500" />
                </div>
              )}
              <div className="mb-1 grid grid-cols-7 gap-1">
                {INICIALES_DIA.map((d, i) => (
                  <p key={i} className="text-center text-[10px] font-bold text-slate-400">
                    {d}
                  </p>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: huecos }).map((_, i) => (
                  <div key={`hueco-${i}`} />
                ))}
                {dias.map((d) => {
                  const clave = format(d, "yyyy-MM-dd");
                  const estado = estadoPorDia[clave] || "none";
                  const esHoy = clave === hoy;
                  const esElegido = clave === diaElegido;
                  return (
                    <button
                      key={clave}
                      onClick={() => setDiaElegido(esElegido ? null : clave)}
                      disabled={clave > hoy}
                      className={`aspect-square rounded-lg border text-sm font-bold transition ${ESTILO_DIA[estado]} ${esElegido ? "ring-2 ring-slate-900 dark:ring-white" : esHoy ? "ring-1 ring-blue-400" : ""} disabled:opacity-40`}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1">
                {LEYENDA.map(([color, texto]) => (
                  <span key={texto} className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
                    <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
                    {texto}
                  </span>
                ))}
              </div>
            </div>

            {/* DETALLE DEL DÍA: debajo del calendario, no en un modal que tape lo que se estaba mirando */}
            {diaElegido && detalleDelDia && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {DIAS[diaDeSemana(diaElegido)]} {fechaCorta(diaElegido)}
                  </p>
                  <button onClick={() => setDiaElegido(null)} aria-label="Cerrar detalle del día" className="text-slate-400">
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
                {detalleDelDia.enviadas.map((n) => (
                  <p key={n} className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                    <FontAwesomeIcon icon={faCircleCheck} /> Novedad enviada · <strong>{n}</strong>
                  </p>
                ))}
                {detalleDelDia.faltantes.length > 0
                  ? detalleDelDia.faltantes.map((m, i) => (
                      <div key={i} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/70 dark:bg-red-950/20">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{m.name}</p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {m.projectName} · {m.label}
                        </p>
                      </div>
                    ))
                  : detalleDelDia.enviadas.length === 0 && <p className="text-xs text-slate-500">Sin faltantes ese día.</p>}
              </div>
            )}

            {/* 4. COORDINADOR ELEGIDO: lo que le falta */}
            {elegido && (
              <div className="space-y-2 rounded-xl border border-blue-300 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/20">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 dark:text-slate-100">{elegido.name}</p>
                    {elegido.projects.map((p) => (
                      <p key={p.projectId} className="text-[11px] text-slate-500 dark:text-slate-400">
                        {p.projectName} · {p.areas.join(", ")}
                      </p>
                    ))}
                  </div>
                  {elegido.missingCount > 0 && botonRecordar(elegido.userId)}
                </div>
                {elegido.missingCount === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                    <FontAwesomeIcon icon={faCircleCheck} /> Está al día este mes.
                  </p>
                ) : (
                  <>
                    <button onClick={() => setVerFaltantes((v) => !v)} className="flex w-full items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 dark:border-red-900/70 dark:bg-red-950/20 dark:text-red-300">
                      Le faltan {elegido.missingCount} novedades
                      <FontAwesomeIcon icon={verFaltantes ? faChevronUp : faChevronDown} />
                    </button>
                    {verFaltantes && (
                      <div className="space-y-1.5">
                        {elegido.projects.flatMap((p) =>
                          p.missingDates.map((d) => {
                            const aTiempo = (p.pendingDates || []).includes(d);
                            return (
                              <div key={`${p.projectId}-${d}`} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${aTiempo ? "border-blue-200 dark:border-blue-900/70" : "border-red-200 dark:border-red-900/70"}`}>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {DIAS[diaDeSemana(d)]} {fechaCorta(d)}
                                  </p>
                                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{p.projectName}</p>
                                </div>
                                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${aTiempo ? "bg-blue-500/15 text-blue-600 dark:text-blue-400" : "bg-red-500/15 text-red-600 dark:text-red-400"}`}>{aTiempo ? "A tiempo" : "Vencida"}</span>
                              </div>
                            );
                          }),
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 4. SIN COORDINADOR ELEGIDO: la lista, con los atrasados arriba */}
            {!elegido && data && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Coordinadores</h2>
                  {coordinadores.some((c) => c.missingCount > 0) && (
                    <button onClick={recordarATodos} disabled={recordando.has("__todos__")} className="inline-flex items-center gap-1.5 rounded bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                      <FontAwesomeIcon icon={recordando.has("__todos__") ? faSpinner : faBell} className={recordando.has("__todos__") ? "animate-spin" : ""} /> Recordar a todos
                    </button>
                  )}
                </div>
                {coordinadores.length === 0 && <p className="rounded-xl border p-6 text-center text-sm text-slate-500 dark:border-slate-700">No hay coordinadores con áreas y turnos asignados en tus proyectos.</p>}
                {coordinadores.map((c) => {
                  const { vencidas, aTiempo } = conteos(c);
                  return (
                    <div
                      key={c.userId}
                      onClick={() => elegirCoordinador(c.userId)}
                      className={`cursor-pointer rounded-xl border p-3 ${vencidas > 0 ? "border-red-200 bg-red-50/40 dark:border-red-900/70 dark:bg-red-950/10" : "border-slate-200 dark:border-slate-700"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{c.name}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                            {c.submittedCount}/{c.expectedCount} enviadas
                            {vencidas > 0 && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">{vencidas} vencidas</span>}
                            {aTiempo > 0 && <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">{aTiempo} a tiempo</span>}
                          </p>
                        </div>
                        {c.missingCount > 0 && botonRecordar(c.userId)}
                      </div>
                      {c.projects.map((p) => (
                        <p key={p.projectId} className="mt-1.5 truncate border-t border-slate-100 pt-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">{p.projectName}</span> · {p.areas.join(", ")}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/*
        MENÚ PARA ELEGIR A QUIÉN REVISAR: sube desde abajo, al alcance del pulgar. Cada fila dice cómo
        viene esa persona (enviadas, vencidas, a tiempo), así se elige sabiendo a quién conviene mirar;
        los más atrasados van primero. Con muchos coordinadores, el buscador evita recorrer la lista.
      */}
      {selectorAbierto && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50" onClick={() => setSelectorAbierto(false)}>
          <div className="flex max-h-[80vh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 xl:w-1/2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">¿A quién querés revisar?</p>
              <button onClick={() => setSelectorAbierto(false)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded text-slate-500">
                <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
              </button>
            </div>

            {coordinadores.length > 6 && (
              <div className="border-b border-slate-200 px-4 py-2 dark:border-slate-700">
                <div className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 dark:border-slate-600">
                  <FontAwesomeIcon icon={faMagnifyingGlass} className="h-3.5 w-3.5 text-slate-400" />
                  <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar coordinador…" className="w-full bg-transparent text-sm text-slate-900 outline-none dark:text-slate-100" />
                </div>
              </div>
            )}

            <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
              {!busqueda && (
                <button
                  onClick={() => {
                    elegirCoordinador(null);
                    setSelectorAbierto(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${!elegido ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-slate-200 dark:border-slate-700"}`}
                >
                  <FontAwesomeIcon icon={faUsers} className="h-4 w-4 text-blue-500" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">Todos los coordinadores</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">El calendario combinado de los {coordinadores.length}</span>
                  </span>
                  {!elegido && <FontAwesomeIcon icon={faCheck} className="text-blue-600" />}
                </button>
              )}

              {coordinadores
                .filter((c) => c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(busqueda.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()))
                .map((c) => {
                  const { vencidas, aTiempo } = conteos(c);
                  const activo = elegido?.userId === c.userId;
                  return (
                    <button
                      key={c.userId}
                      onClick={() => {
                        elegirCoordinador(c.userId);
                        setSelectorAbierto(false);
                      }}
                      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left ${activo ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : vencidas > 0 ? "border-red-200 dark:border-red-900/70" : "border-slate-200 dark:border-slate-700"}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">{c.name}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                          {c.submittedCount}/{c.expectedCount} enviadas
                          {vencidas > 0 && <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">{vencidas} vencidas</span>}
                          {aTiempo > 0 && <span className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">{aTiempo} a tiempo</span>}
                          {c.missingCount === 0 && <span className="rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-bold text-green-600 dark:text-green-400">Al día</span>}
                        </span>
                      </span>
                      {activo && <FontAwesomeIcon icon={faCheck} className="text-blue-600" />}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

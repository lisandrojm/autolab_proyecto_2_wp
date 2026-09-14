import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSitemap, faLayerGroup, faChevronDown, faChevronRight, faUserTie, faUserShield, faSearch, faXmark } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import SectionHeader from "../components/SectionHeader";
import { useAuthStore } from "../../../../stores/authStore";
import { useProfile } from "../hooks/useProfile";
import { projectsAPI, Project, AreaShiftMember } from "../../../../api/projects";
import { areasAPI, Area } from "../../../../api/areas";
import { shiftsAPI, Shift } from "../../../../api/shifts";
import { etiquetaDeTurno, textoDeDias } from "../../../../utils/jerarquiaTurnos";

interface MyTeamsProps {
  onNavigate: (view: ViewType) => void;
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MIS EQUIPOS: LA JERARQUÍA DEL PROYECTO, VISTA DESDE EL QUE MANDA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Es la pestaña Jerarquía de Gestionar Equipo (panel web) en el celular, y de sólo lectura: mismo
 * orden, mismos nombres y mismos números, para que un supervisor vea en la app exactamente lo que
 * después ve en el escritorio.
 *
 *   · Supervisor  — es el responsable del proyecto (`metadata.responsableId` = su id de FRAME), así que
 *                   ve todas las áreas y turnos, y además quiénes del equipo no tienen área.
 *   · Coordinador — ve las combinaciones área/turno que tiene asignadas (`coordinatorAssignments`).
 *
 * TODO ARRANCA COLAPSADO, igual que en el panel: un proyecto grande son decenas de turnos y en un
 * celular se abre sólo lo que se quiere ver. Cerrada, cada área igual dice cuántos suman en cada turno
 * («Mañana · 3/7»): alcanza para saber qué está supervisando sin abrir nada. Se recuerda por proyecto.
 *
 * Quién suma y quién no sale del mismo endpoint que la Jerarquía (`area-shift-members?todos=true`):
 * activo y con contrato vigente, el criterio del número de «Área/Turno Coordinada». Es una llamada por
 * proyecto, y el server ya elige el contrato que rige de cada uno sin mandar el historial.
 */

const idDe = (x: any): string => (x && typeof x === "object" ? String(x._id || x.id || "") : String(x || ""));

/** Fecha de contrato ("YYYY-MM-DD...") a d/m/yyyy, sin pasar por `Date` para no correrla de día por la zona horaria. */
const fechaContrato = (d?: string): string => {
  const [y, m, dia] = String(d || "")
    .substring(0, 10)
    .split("-");
  return y && m && dia ? `${Number(dia)}/${Number(m)}/${y}` : "—";
};

const chip = (ok: boolean) => `rounded px-1 py-0.5 text-[9px] font-bold uppercase ${ok ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`;

/** Para buscar sin que importen tildes ni mayúsculas: «agustin» encuentra a «Agustín». */
const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface TurnoACargo {
  clave: string;
  shiftId: string;
  /** «Mañana», «Tarde»: sin el rango ni los días que suele traer el nombre guardado. */
  nombre: string;
  horario: string;
  dias: string;
  orden: string;
  coordinadorId: string;
  coordinadorNombre: string;
}

interface AreaACargo {
  areaId: string;
  nombre: string;
  /** Vacío cuando los turnos del área no trabajan los mismos días: ahí cada uno los dice por su cuenta. */
  diasComunes: string;
  turnos: TurnoACargo[];
}

/** Lo abierto se recuerda por proyecto en este navegador. Sin storage, arranca cerrado y listo. */
const claveAbiertos = (proyectoId: string) => `mis-equipos-abiertos:${proyectoId}`;
const leerAbiertos = (proyectoId: string): Set<string> => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(claveAbiertos(proyectoId)) || "[]"));
  } catch {
    return new Set<string>();
  }
};

export default function MyTeams({ onNavigate }: MyTeamsProps) {
  const { user } = useAuthStore();
  const { profile } = useProfile();

  const [proyectos, setProyectos] = useState<Project[] | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [turnos, setTurnos] = useState<Shift[]>([]);
  const [error, setError] = useState("");
  const [proyectoId, setProyectoId] = useState("");
  const [personas, setPersonas] = useState<AreaShiftMember[] | null>(null);
  const [abiertos, setAbiertosEstado] = useState<Set<string>>(new Set());
  const [buscaSinArea, setBuscaSinArea] = useState("");

  useEffect(() => {
    let cancelado = false;
    Promise.all([projectsAPI.listAll(), areasAPI.listAll(), shiftsAPI.getAll()])
      .then(([ps, as, ss]) => {
        if (cancelado) return;
        setProyectos(ps);
        setAreas(as);
        setTurnos(ss);
      })
      .catch(() => !cancelado && setError("No se pudieron cargar tus proyectos. Probá de nuevo en un momento."));
    return () => {
      cancelado = true;
    };
  }, []);

  /*
    Quién soy, para reconocer mis asignaciones. Mismos datos que usa Novedades (`isMyAssignment`): los
    ids del usuario y del perfil y, de respaldo, el email. El id de FRAME (`metadata.id`) es el que
    guarda `responsableId`: con el `_id` no matchearía nunca.
  */
  const misIds = useMemo(() => new Set([(user as any)?.id, (user as any)?._id, profile?.userId, profile?._id].filter(Boolean).map(String)), [user, profile]);
  const miEmail = String(user?.email || profile?.email || "").toLowerCase();
  const miIdFrame = (profile as any)?.metadata?.id ?? (user as any)?.metadata?.id;

  /** Los proyectos donde tengo algo a cargo, con qué: todas sus áreas si lo superviso, o lo que coordino. */
  const equipos = useMemo(() => {
    if (!proyectos) return null;
    const nombreArea = new Map(areas.map((a) => [String(a._id), a.name]));
    const turnoPorId = new Map(turnos.map((s) => [String(s._id), s]));

    const esMia = (asm: any) => misIds.has(idDe(asm.userId)) || (!!miEmail && String(asm.userId?.email || "").toLowerCase() === miEmail);

    return proyectos
      .map((p) => {
        const supervisa = miIdFrame != null && p.metadata?.responsableId != null && String(p.metadata.responsableId) === String(miIdFrame);
        const coordinaciones = (p.coordinatorAssignments || []).filter(esMia);

        // Las combinaciones que me tocan: todas las del proyecto si lo superviso.
        const combos: { areaId: string; shiftId: string }[] = supervisa
          ? (p.areasConfig || []).flatMap((ac: any) => (ac.shiftIds || []).map((s: any) => ({ areaId: idDe(ac.areaId), shiftId: idDe(s) })))
          : coordinaciones.map((a: any) => ({ areaId: idDe(a.areaId), shiftId: idDe(a.shiftId) }));

        const porArea = new Map<string, AreaACargo>();
        for (const c of combos) {
          if (!c.areaId || !c.shiftId) continue;
          const area =
            porArea.get(c.areaId) ||
            ({
              areaId: c.areaId,
              nombre: nombreArea.get(c.areaId) || (p.areasConfig || []).map((ac: any) => ac.areaId).find((a: any) => idDe(a) === c.areaId)?.name || "Área",
              diasComunes: "",
              turnos: [],
            } as AreaACargo);
          if (area.turnos.some((t) => t.shiftId === c.shiftId)) continue;
          const turno = turnoPorId.get(c.shiftId);
          const coord: any = (p.coordinatorAssignments || []).find((a: any) => idDe(a.areaId) === c.areaId && idDe(a.shiftId) === c.shiftId)?.userId;
          area.turnos.push({
            clave: `${c.areaId}::${c.shiftId}`,
            shiftId: c.shiftId,
            nombre: etiquetaDeTurno(turno?.name || "Turno"),
            horario: turno?.startTime && turno?.endTime ? `${turno.startTime} a ${turno.endTime}` : "",
            dias: textoDeDias(turno?.days),
            // Mañana, tarde, noche: el orden en que transcurre el día. Sin horario, al final.
            orden: turno?.startTime || "99:99",
            coordinadorId: idDe(coord),
            coordinadorNombre: coord && typeof coord === "object" ? `${coord.firstName || ""} ${coord.lastName || ""}`.trim() : "",
          });
          porArea.set(c.areaId, area);
        }

        const areasACargo = [...porArea.values()]
          .map((a) => {
            const ordenados = a.turnos.sort((x, y) => x.orden.localeCompare(y.orden));
            // Los días suben al encabezado del área sólo si TODOS sus turnos coinciden. Si no, mentiría.
            const distintos = new Set(ordenados.map((t) => t.dias));
            return { ...a, turnos: ordenados, diasComunes: distintos.size === 1 ? ordenados[0].dias : "" };
          })
          .sort((a, b) => a.nombre.localeCompare(b.nombre));

        // El supervisor ya viene resuelto en el listado de proyectos: no hace falta otra consulta.
        const resp: any = p.metadataResolutions?.responsable;
        const supervisorNombre = resp ? resp.name || `${resp.firstName || ""} ${resp.lastName || ""}`.trim() : supervisa ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim() : "";
        return { proyecto: p, supervisa, supervisorId: idDe(resp), supervisorNombre, areas: areasACargo };
      })
      .filter((e) => e.areas.length > 0)
      .sort((a, b) => a.proyecto.name.localeCompare(b.proyecto.name));
  }, [proyectos, areas, turnos, misIds, miEmail, miIdFrame, user]);

  // Con un solo proyecto no hay nada que elegir: queda seleccionado.
  useEffect(() => {
    if (equipos && equipos.length > 0 && !equipos.some((e) => e.proyecto._id === proyectoId)) setProyectoId(equipos[0].proyecto._id);
  }, [equipos, proyectoId]);

  useEffect(() => {
    if (!proyectoId) return;
    setAbiertosEstado(leerAbiertos(proyectoId));
    setBuscaSinArea("");
    let cancelado = false;
    setPersonas(null);
    projectsAPI
      .getProjectMembersStatus(proyectoId)
      .then((ms) => !cancelado && setPersonas(ms))
      .catch(() => !cancelado && setPersonas([]));
    return () => {
      cancelado = true;
    };
  }, [proyectoId]);

  /*
    Lo abierto se GUARDA AL TOCAR, no desde un efecto. Con un efecto, al cambiar de proyecto se escribía
    lo abierto del proyecto anterior bajo la clave del nuevo, antes de que se leyera lo suyo.
  */
  const setAbiertos = (next: Set<string>) => {
    setAbiertosEstado(next);
    try {
      localStorage.setItem(claveAbiertos(proyectoId), JSON.stringify([...next]));
    } catch {
      /* sin storage: no se recuerda, nada más */
    }
  };

  const alternar = (clave: string) => {
    const next = new Set(abiertos);
    if (next.has(clave)) next.delete(clave);
    else next.add(clave);
    setAbiertos(next);
  };

  const equipo = equipos?.find((e) => e.proyecto._id === proyectoId) || null;

  const porTurno = useMemo(() => {
    const m = new Map<string, AreaShiftMember[]>();
    for (const persona of personas || []) {
      for (const clave of persona.claves || []) {
        const lista = m.get(clave) || [];
        lista.push(persona);
        m.set(clave, lista);
      }
    }
    return m;
  }, [personas]);

  /**
   * Los del equipo que no están en ningún turno. Sólo para el supervisor: es quien tiene que
   * acomodarlos, y un coordinador ve sus turnos, no el proyecto entero.
   *
   * Mismo criterio que los números de cada turno (`claves`), así que nadie figura a la vez en un turno
   * y acá. Quedan afuera los coordinadores —están a cargo de un turno aunque no trabajen en él— y el
   * propio supervisor.
   */
  const sinAsignar = useMemo(() => {
    if (!equipo?.supervisa || !personas) return null;
    const coordinadores = new Set((equipo.proyecto.coordinatorAssignments || []).map((a: any) => idDe(a.userId)));
    return personas.filter((m) => {
      const id = String(m._id);
      return (m.claves || []).length === 0 && !coordinadores.has(id) && id !== equipo.supervisorId && !misIds.has(id);
    });
  }, [equipo, personas, misIds]);

  /**
   * El buscador de «Sin área asignada»: con más de cien personas la lista no se puede recorrer a ojo.
   * Por nombre o email, sin importar tildes ni mayúsculas, y tiene que aparecer CADA palabra: «agus
   * dell» encuentra a Agustín Dell'Orto aunque no se escriba el nombre completo.
   */
  const sinAsignarFiltrados = useMemo(() => {
    if (!sinAsignar) return [];
    const palabras = normalizar(buscaSinArea).split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return sinAsignar;
    return sinAsignar.filter((m) => {
      const texto = normalizar(`${m.firstName || ""} ${m.lastName || ""} ${m.email || ""}`);
      return palabras.every((palabra) => texto.includes(palabra));
    });
  }, [sinAsignar, buscaSinArea]);

  const nombreDe = (m: AreaShiftMember) => `${m.firstName || ""} ${m.lastName || ""}`.trim() || m.email;

  const tarjeta = (m: AreaShiftMember, esCoordinador: boolean) => (
    <div
      key={m._id}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${m.cuenta ? "border-green-300 bg-green-50 dark:border-green-800/70 dark:bg-green-950/20" : "border-red-300 bg-red-50 dark:border-red-900/70 dark:bg-red-950/20"}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{nombreDe(m)}</p>
          {esCoordinador && <span className="shrink-0 rounded border border-amber-300 bg-amber-100 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Coordinador</span>}
        </div>
        <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
          Alta: {fechaContrato(m.fechaAlta)} · Baja: {m.fechaBaja ? fechaContrato(m.fechaBaja) : "—"}
          {m.estadoContrato ? ` · ${m.estadoContrato}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={chip(m.activo)}>{m.activo ? "Activo" : "Inactivo"}</span>
        <span className={chip(m.vigente)}>{m.vigente ? "Vigente" : "No vigente"}</span>
      </div>
    </div>
  );

  return (
    <div className="flex-1 pb-24">
      {/* HEADER */}
      <SectionHeader
        icon={faSitemap}
        titulo="Mis equipos"
        onBack={() => onNavigate("home")}
        info={
          "Las áreas y turnos que tenés a cargo, con la gente de cada uno: lo mismo que la Jerarquía del proyecto en el escritorio.\n\nArranca todo cerrado. Cada área muestra sus turnos con cuántas personas suman sobre el total asignado (suman las activas con contrato vigente). Tocá un área para ver sus turnos, y un turno para ver quiénes lo integran.\n\nSi estás en más de un proyecto, elegí cuál ver."
        }
      />

      <div className="space-y-4 px-4 pt-4">
        {error ? (
          <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>
        ) : !equipos ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900/70" />
            ))}
          </div>
        ) : equipos.length === 0 ? (
          <div className="rounded-xl border bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/50">
            <FontAwesomeIcon icon={faSitemap} className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no tenés áreas ni turnos a cargo en ningún proyecto.</p>
          </div>
        ) : (
          <>
            {/* PROYECTO: se elige sólo si hay más de uno */}
            {equipos.length > 1 ? (
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500 dark:text-slate-400">Proyecto</label>
                <select value={proyectoId} onChange={(e) => setProyectoId(e.target.value)} className="w-full rounded border border-slate-300 px-4 py-2 dark:border-slate-600 dark:bg-slate-700 dark:text-white">
                  {equipos.map((e) => (
                    <option key={e.proyecto._id} value={e.proyecto._id}>
                      {typeof e.proyecto.clientId === "object" && e.proyecto.clientId?.name ? `${e.proyecto.clientId.name} | ` : ""}
                      {e.proyecto.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {typeof equipo?.proyecto.clientId === "object" && equipo?.proyecto.clientId?.name ? `${equipo.proyecto.clientId.name} | ` : ""}
                {equipo?.proyecto.name}
              </p>
            )}

            {equipo && (
              <>
                {/* El supervisor, arriba de todo: es de quien cuelga el resto. */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/20">
                  <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                    <FontAwesomeIcon icon={faUserShield} />
                    Supervisor del proyecto
                  </p>
                  <p className="mt-1 text-sm font-bold text-emerald-900 dark:text-emerald-200">
                    {equipo.supervisorNombre || <span className="font-normal italic text-emerald-700/70 dark:text-emerald-400/70">Sin responsable asignado</span>}
                    {equipo.supervisa && <span className="ml-1.5 text-xs font-semibold text-emerald-700/80 dark:text-emerald-400/80">(vos)</span>}
                  </p>
                  {!equipo.supervisa && <p className="mt-1 text-[11px] text-emerald-800/80 dark:text-emerald-300/70">Abajo están las áreas y turnos que coordinás.</p>}
                </div>

                {/* Abrir o cerrar todo de una vez. */}
                <div className="flex items-center justify-end gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setAbiertos(new Set([...equipo.areas.map((a) => "area::" + a.areaId), ...equipo.areas.flatMap((a) => a.turnos.map((t) => t.clave)), ...(sinAsignar ? ["sin-asignar"] : [])]))}
                    className="text-blue-600 dark:text-blue-400"
                  >
                    Expandir todo
                  </button>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button type="button" onClick={() => setAbiertos(new Set())} className="text-blue-600 dark:text-blue-400">
                    Colapsar todo
                  </button>
                </div>

                {/* Un bloque por área. Dentro, sus turnos en orden de horario. */}
                {equipo.areas.map((a) => {
                  const areaAbierta = abiertos.has("area::" + a.areaId);
                  return (
                    <section key={a.areaId} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/60">
                      <button
                        type="button"
                        onClick={() => alternar("area::" + a.areaId)}
                        aria-expanded={areaAbierta}
                        className={`flex w-full flex-wrap items-center gap-2 text-left ${areaAbierta ? "mb-3 border-b border-slate-200 pb-2 dark:border-slate-700" : ""}`}
                      >
                        <FontAwesomeIcon icon={areaAbierta ? faChevronDown : faChevronRight} className="h-3 w-3 text-slate-400" />
                        <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5 text-blue-500" />
                        <span className="text-sm font-black uppercase tracking-wide text-slate-900 dark:text-slate-100">{a.nombre}</span>
                        {a.diasComunes && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{a.diasComunes}</span>}
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                          {a.turnos.length} {a.turnos.length === 1 ? "turno" : "turnos"}
                        </span>
                        {/* Cerrada, el área igual dice cuántos suman en cada turno. En el celular van en su propio renglón. */}
                        {!areaAbierta && (
                          <span className="flex w-full flex-wrap gap-1.5 pl-5">
                            {a.turnos.map((t) => {
                              const lista = porTurno.get(t.clave) || [];
                              const cuentan = lista.filter((m) => m.cuenta).length;
                              return (
                                <span key={t.clave} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                  {t.nombre}
                                  {personas !== null && (
                                    <>
                                      {" · "}
                                      <span className="text-green-600 dark:text-green-400">{cuentan}</span>
                                      {lista.length !== cuentan && <span className="text-slate-400">/{lista.length}</span>}
                                    </>
                                  )}
                                </span>
                              );
                            })}
                          </span>
                        )}
                      </button>

                      {areaAbierta && (
                        <div className="space-y-2">
                          {a.turnos.map((t) => {
                            const lista = porTurno.get(t.clave) || [];
                            const suman = lista.filter((m) => m.cuenta).sort((x, y) => nombreDe(x).localeCompare(nombreDe(y)));
                            const noSuman = lista.filter((m) => !m.cuenta).sort((x, y) => nombreDe(x).localeCompare(nombreDe(y)));
                            const abierto = abiertos.has(t.clave);
                            return (
                              <div key={t.clave} className="rounded-lg border border-slate-200 dark:border-slate-700">
                                <button type="button" onClick={() => alternar(t.clave)} aria-expanded={abierto} className="flex w-full items-start gap-2 px-3 py-2 text-left">
                                  <FontAwesomeIcon icon={abierto ? faChevronDown : faChevronRight} className="mt-1 h-3 w-3 shrink-0 text-slate-400" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-baseline gap-x-2">
                                      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{t.nombre}</span>
                                      {/* Los días sólo acá cuando los turnos del área no coinciden: si no, ya están arriba. */}
                                      {!a.diasComunes && t.dias && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{t.dias}</span>}
                                    </div>
                                    {t.horario && <p className="text-[11px] text-slate-500 dark:text-slate-400">{t.horario}</p>}
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold">
                                      <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                                        <FontAwesomeIcon icon={faUserTie} className="h-2.5 w-2.5" />
                                        {t.coordinadorNombre || "Sin coordinador"}
                                      </span>
                                      {personas === null ? (
                                        <span className="text-slate-400">Cargando…</span>
                                      ) : (
                                        <>
                                          <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">{suman.length} suman</span>
                                          {noSuman.length > 0 && <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-red-700 dark:border-red-900/70 dark:bg-red-950/20 dark:text-red-300">{noSuman.length} no suman</span>}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </button>

                                {abierto && personas !== null && (
                                  <div className="space-y-1.5 border-t border-slate-200 p-3 dark:border-slate-700">
                                    {lista.length === 0 ? (
                                      <p className="text-center text-xs italic text-slate-400">No hay personas asignadas a este turno.</p>
                                    ) : (
                                      <>
                                        <p className="rounded-lg border border-green-200 bg-green-50 px-2 py-1.5 text-[11px] text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                                          <strong>{suman.length}</strong> {suman.length === 1 ? "persona activa" : "personas activas"} con contrato vigente
                                          {noSuman.length > 0 && (
                                            <>
                                              {" "}
                                              · <strong>{lista.length}</strong> {lista.length === 1 ? "asignada" : "asignadas"} en total
                                            </>
                                          )}
                                        </p>
                                        {suman.map((m) => tarjeta(m, m._id === t.coordinadorId))}
                                        {noSuman.length > 0 && (
                                          <>
                                            <p className="pt-2 text-[10px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">No suman al total ({noSuman.length})</p>
                                            {noSuman.map((m) => tarjeta(m, m._id === t.coordinadorId))}
                                          </>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}

                {/* Los que no están en ningún turno: sólo el supervisor los ve, es quien los acomoda. */}
                {sinAsignar && (
                  <div className="rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-600">
                    <button type="button" onClick={() => alternar("sin-asignar")} aria-expanded={abiertos.has("sin-asignar")} className="flex w-full items-center gap-2 text-left">
                      <FontAwesomeIcon icon={abiertos.has("sin-asignar") ? faChevronDown : faChevronRight} className="h-3 w-3 text-slate-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Sin área asignada ({sinAsignar.length})</span>
                    </button>
                    {abiertos.has("sin-asignar") &&
                      (sinAsignar.length === 0 ? (
                        <p className="mt-2 text-xs italic text-slate-400">Todo el equipo está ubicado.</p>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {/* Texto y no `search`: algunos navegadores le agregan su propia cruz y quedaban dos. */}
                          <div className="relative">
                            <FontAwesomeIcon icon={faSearch} className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              enterKeyHint="search"
                              autoComplete="off"
                              value={buscaSinArea}
                              onChange={(e) => setBuscaSinArea(e.target.value)}
                              placeholder="Buscar por nombre o email"
                              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                            />
                            {buscaSinArea && (
                              <button type="button" onClick={() => setBuscaSinArea("")} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          {buscaSinArea.trim() && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {sinAsignarFiltrados.length} de {sinAsignar.length}
                            </p>
                          )}
                          {sinAsignarFiltrados.length === 0 ? (
                            <p className="py-3 text-center text-xs italic text-slate-400">Nadie coincide con «{buscaSinArea.trim()}».</p>
                          ) : (
                            <div className="space-y-1.5">{sinAsignarFiltrados.map((m) => tarjeta(m, false))}</div>
                          )}
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

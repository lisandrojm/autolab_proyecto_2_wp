import { useEffect, useMemo, useRef, useState } from "react";
import { LoadingSpinner } from "../../../../components/ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSitemap, faLayerGroup, faChevronDown, faChevronRight, faUserTie, faUserShield, faSearch, faXmark, faFileContract, faCircleInfo, faLocationDot, faClock, faArrowRightArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import SectionHeader from "../components/SectionHeader";
import MenuDeTarjetas, { type OpcionDeMenu } from "../components/MenuDeTarjetas";
import ContratoMiembroModal from "../components/ContratoMiembroModal";
import CambiarTurnoModal from "../components/CambiarTurnoModal";
import { sweetAlert } from "../utils/sweetAlert";
import ProyectoInfoModal from "../components/ProyectoInfoModal";
import { BadgeCentroCosto, SelectorDeProyecto, etiquetaDeProyecto } from "../components/SelectorDeProyecto";
import { useAuthStore } from "../../../../stores/authStore";
import { useProfile } from "../hooks/useProfile";
import { projectsAPI, Project, AreaShiftMember } from "../../../../api/projects";
import { areasAPI, Area } from "../../../../api/areas";
import { shiftsAPI, Shift } from "../../../../api/shifts";
import { claveOrdenTurno, etiquetaDeTurno, textoDeDias } from "../../../../utils/jerarquiaTurnos";
import { infoAPI } from "../../../../api/info";
import { claveAreaTurno, claveFilaArea, partirClaveFilaArea, sedeDe, sedePrincipalDe } from "@compartido/areaTurno";

interface MyTeamsProps {
  onNavigate: (view: ViewType) => void;
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MIS EQUIPOS: LA JERARQUÍA DEL PROYECTO, VISTA DESDE EL QUE MANDA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Es la pestaña Jerarquía de Gestionar Equipo (panel web) en el celular: mismo orden, mismos nombres y
 * mismos números, para que un supervisor vea en la app exactamente lo que después ve en el escritorio.
 * Lo único que se toca desde acá es el TURNO de una persona (26/11/2026, ver `cambiarTurno`): sólo el
 * coordinador del proyecto, dentro de la misma área, y con eso la persona pasa a otro supervisor.
 *
 *   · Supervisor  — es el responsable del proyecto (`metadata.responsableId` = su id de FRAME), así que
 *                   ve todas las áreas y turnos, y además quiénes del equipo no tienen área.
 *   · Coordinador — ve las combinaciones área/turno que tiene asignadas (`coordinatorAssignments`).
 *
 * DOS TARJETAS PARA QUIEN COORDINA EL PROYECTO (26/11/2026): «Equipos que superviso», los que supervisa
 * directamente (sus filas de `coordinatorAssignments`), y «Supervisores a mi cargo»: el resto de las áreas
 * y turnos del proyecto, con quién supervisa cada turno. Antes veía el proyecto entero en una sola lista y
 * sus propios turnos quedaban mezclados con los de los demás.
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

export interface TurnoACargo {
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

export interface AreaACargo {
  areaId: string;
  /** La fila de «Configuración por Área» (área + sede): la misma área puede estar una vez por sede. */
  filaKey: string;
  /** La sede de la fila, para el badge naranja debajo del área: «Libertador», o «La corte · principal» para la fila sin sede. */
  sedeEtiqueta: string;
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
  /** La persona cuyo contrato se está viendo (sólo el coordinador del proyecto; ver `tarjeta`). */
  const [contratoDe, setContratoDe] = useState<{ userId: string; nombre: string } | null>(null);
  /** La persona a la que se le está cambiando el turno, con dónde está hoy (sólo el coordinador del proyecto). */
  const [cambioDe, setCambioDe] = useState<{ persona: AreaShiftMember; area: AreaACargo; turno: TurnoACargo } | null>(null);
  /** Sube para volver a pedir la lista de personas sin cambiar de proyecto (después de un cambio de turno). */
  const [recarga, setRecarga] = useState(0);
  /** La ficha del proyecto (cliente, sede, centro de costo, empresas): la misma que el escritorio. */
  const [verInfoProyecto, setVerInfoProyecto] = useState(false);
  const [sedesCatalogo, setSedesCatalogo] = useState<Array<{ name?: string; data?: any }>>([]);
  useEffect(() => {
    infoAPI
      .listByType("sede")
      .then((l) => setSedesCatalogo(l as any[]))
      .catch(() => {
        /* sin catálogo: la fila dice «Sede N» */
      });
  }, []);

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

        /*
          DOS LISTAS (26/11/2026). Lo que superviso directamente —mis filas de `coordinatorAssignments`— y, si
          coordino el proyecto, lo que llevan los demás supervisores: todas las combinaciones del proyecto menos
          las mías. Antes el coordinador veía el proyecto entero en una sola lista, con sus propios turnos
          mezclados con los de los otros supervisores.
          Cada combinación con la sede de su fila (área × turno × sede): sin sedes por área, null como siempre.
        */
        type Combo = { areaId: string; shiftId: string; sedeId: number | null };
        const delProyecto: Combo[] = (p.areasConfig || []).flatMap((ac: any) => (ac.shiftIds || []).map((s: any) => ({ areaId: idDe(ac.areaId), shiftId: idDe(s), sedeId: sedeDe(ac.sedeId) })));
        const areasConfiguradas = new Set(delProyecto.map((c) => c.areaId));
        const filasConfiguradas = new Set(delProyecto.map((c) => claveFilaArea(c)));
        // Una asignación a una sede que el área ya no tiene (de antes de las sedes) no es un equipo: se omite.
        const mias: Combo[] = coordinaciones
          .map((a: any) => ({ areaId: idDe(a.areaId), shiftId: idDe(a.shiftId), sedeId: sedeDe(a.sedeId) }))
          .filter((c) => !areasConfiguradas.has(c.areaId) || filasConfiguradas.has(claveFilaArea(c)));
        const clavesMias = new Set(mias.map((c) => claveAreaTurno(c)));
        const deOtros: Combo[] = supervisa ? delProyecto.filter((c) => !clavesMias.has(claveAreaTurno(c))) : [];
        const nombreSede = (id: number | null) => {
          if (!id) return "";
          const sd = sedesCatalogo.find((x) => Number(x.data?.id) === id);
          return String(sd?.data?.nombre || sd?.name || `Sede ${id}`);
        };


        const agrupar = (combos: Combo[]): AreaACargo[] => {
          const porArea = new Map<string, AreaACargo>();
          for (const c of combos) {
            if (!c.areaId || !c.shiftId) continue;
            const filaKey = claveFilaArea(c);
            const nombreBase = nombreArea.get(c.areaId) || (p.areasConfig || []).map((ac: any) => ac.areaId).find((a: any) => idDe(a) === c.areaId)?.name || "Área";
            const area =
              porArea.get(filaKey) ||
              ({
                areaId: c.areaId,
                filaKey,
                nombre: nombreBase,
                // La sede va aparte, como badge: la fila sin sede es la de la sede principal del proyecto.
                sedeEtiqueta: c.sedeId ? nombreSede(c.sedeId) : sedePrincipalDe(p.metadata) ? `${nombreSede(sedePrincipalDe(p.metadata))} · principal` : "",
                diasComunes: "",
                turnos: [],
              } as AreaACargo);
            if (area.turnos.some((t) => t.shiftId === c.shiftId)) continue;
            const turno = turnoPorId.get(c.shiftId);
            const clave = claveAreaTurno(c);
            const coord: any = (p.coordinatorAssignments || []).find((a: any) => claveAreaTurno(a) === clave)?.userId;
            area.turnos.push({
              // La misma clave que manda el server en `claves` (con la sede si la fila la tiene).
              clave,
              shiftId: c.shiftId,
              nombre: etiquetaDeTurno(turno?.name || "Turno"),
              horario: turno?.startTime && turno?.endTime ? `${turno.startTime} a ${turno.endTime}` : "",
              dias: textoDeDias(turno?.days),
              // El orden que se fijó en el admin (Turnos → Ordenar); a igual orden, por horario.
              orden: claveOrdenTurno(turno),
              coordinadorId: idDe(coord),
              coordinadorNombre: coord && typeof coord === "object" ? `${coord.firstName || ""} ${coord.lastName || ""}`.trim() : "",
            });
            porArea.set(filaKey, area);
          }

          return [...porArea.values()]
            .map((a) => {
              const ordenados = a.turnos.sort((x, y) => x.orden.localeCompare(y.orden));
              // Los días suben al encabezado del área sólo si TODOS sus turnos coinciden. Si no, mentiría.
              const distintos = new Set(ordenados.map((t) => t.dias));
              return { ...a, turnos: ordenados, diasComunes: distintos.size === 1 ? ordenados[0].dias : "" };
            })
            .sort((a, b) => a.nombre.localeCompare(b.nombre) || a.sedeEtiqueta.localeCompare(b.sedeEtiqueta));
        };

        // El supervisor ya viene resuelto en el listado de proyectos: no hace falta otra consulta.
        const resp: any = p.metadataResolutions?.responsable;
        const supervisorNombre = resp ? resp.name || `${resp.firstName || ""} ${resp.lastName || ""}`.trim() : supervisa ? `${user?.firstName || ""} ${user?.lastName || ""}`.trim() : "";
        return { proyecto: p, supervisa, supervisorId: idDe(resp), supervisorNombre, areas: agrupar(mias), areasDeSupervisores: agrupar(deOtros) };
      })
      .filter((e) => e.areas.length > 0 || e.areasDeSupervisores.length > 0)
      .sort((a, b) => a.proyecto.name.localeCompare(b.proyecto.name));
  }, [proyectos, areas, turnos, misIds, miEmail, miIdFrame, user, sedesCatalogo]);

  /*
    Con un solo proyecto no hay nada que elegir: queda seleccionado. Con varios no se elige ninguno por
    defecto (pedido del 19/10/2026): hay que elegirlo en la ventana. Si el elegido deja de estar, se
    vuelve a pedir.
  */
  useEffect(() => {
    if (!equipos) return;
    if (equipos.length === 1 && proyectoId !== equipos[0].proyecto._id) setProyectoId(equipos[0].proyecto._id);
    else if (proyectoId && !equipos.some((e) => e.proyecto._id === proyectoId)) setProyectoId("");
  }, [equipos, proyectoId]);

  useEffect(() => {
    if (!proyectoId) return;
    setAbiertosEstado(leerAbiertos(proyectoId));
    setBuscaSinArea("");
  }, [proyectoId]);

  /*
    La gente del proyecto. Al cambiar de proyecto la lista se vacía mientras llega la nueva; en una RECARGA
    (después de cambiar a alguien de turno) se deja la vieja a la vista hasta que llega la nueva: si no, lo
    abierto se cerraría y la pantalla saltaría para volver a lo mismo con una persona de lugar.
  */
  const proyectoCargado = useRef("");
  useEffect(() => {
    if (!proyectoId) return;
    let cancelado = false;
    if (proyectoCargado.current !== proyectoId) {
      proyectoCargado.current = proyectoId;
      setPersonas(null);
    }
    projectsAPI
      .getProjectMembersStatus(proyectoId)
      .then((ms) => !cancelado && setPersonas(ms))
      .catch(() => !cancelado && setPersonas([]));
    return () => {
      cancelado = true;
    };
  }, [proyectoId, recarga]);

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

  /** Para la ficha: TODAS las áreas del proyecto con sus turnos, no sólo las que uno tiene a cargo. */
  const areasDelProyecto = useMemo(() => {
    if (!equipo) return [];
    const nombreArea = new Map(areas.map((a) => [String(a._id), a.name]));
    const turnoPorId = new Map(turnos.map((s) => [String(s._id), s]));
    return (equipo.proyecto.areasConfig || [])
      .map((ac: any) => ({
        nombre: (typeof ac.areaId === "object" && ac.areaId?.name) || nombreArea.get(idDe(ac.areaId)) || "Área",
        turnos: (ac.shiftIds || []).map((s: any) => etiquetaDeTurno((typeof s === "object" && s?.name) || turnoPorId.get(idDe(s))?.name || "Turno")),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [equipo, areas, turnos]);

  /** El «i» al lado del nombre del proyecto: abre su ficha. */
  const botonInfoProyecto = (
    <button
      type="button"
      onClick={() => setVerInfoProyecto(true)}
      aria-label="Ver los datos del proyecto"
      title="Ver los datos del proyecto"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors active:bg-slate-100 dark:active:bg-slate-800"
    >
      <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
    </button>
  );

  const porTurno = useMemo(() => {
    const m = new Map<string, AreaShiftMember[]>();
    for (const persona of personas || []) {
      for (const clave of persona.claves || []) {
        const lista = m.get(clave) || [];
        // Quien tiene dos contratos vigentes en turnos distintos: en cada turno, el contrato que lo pone ahí (14/11/2026).
        const delTurno = persona.porContrato?.find((c) => c.claves.includes(clave));
        lista.push(delTurno ? { ...persona, nombreContrato: delTurno.nombreContrato, estadoContrato: delTurno.estadoContrato, fechaAlta: delTurno.fechaAlta, fechaBaja: delTurno.fechaBaja, horaInicio: delTurno.horaInicio, horaFin: delTurno.horaFin, diasSemana: delTurno.diasSemana } : persona);
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

  /** Cuántos suman y cuántos hay en un turno: para las opciones de «Cambiar de turno». */
  const cuentaDe = (clave: string) => {
    const lista = porTurno.get(clave) || [];
    return { suman: lista.filter((x) => x.cuenta).length, total: lista.length };
  };

  /*
    CAMBIAR DE TURNO (26/11/2026). Sólo el coordinador del proyecto, y el server lo vuelve a controlar. Se
    mueve dentro de la misma área (misma fila): el server escribe el equipo, el historial y el contrato que
    rige, igual que la Jerarquía del panel. Con eso la persona pasa sola al supervisor del turno nuevo.
    Después se vuelve a pedir la lista y se abre el turno de destino, para verla ahí.
    Un 409 es «ya no está en ese turno» (otro la movió, cambió el contrato que rige): se recarga y listo.
  */
  const cambiarTurno = async (destino: TurnoACargo) => {
    if (!cambioDe || !equipo) return;
    const { persona, area, turno } = cambioDe;
    try {
      await projectsAPI.cambiarTurnoDeMiembro(equipo.proyecto._id, persona._id, { areaId: area.areaId, sedeId: partirClaveFilaArea(area.filaKey).sedeId, deShiftId: turno.shiftId, aShiftId: destino.shiftId });
      setCambioDe(null);
      setAbiertos(new Set([...abiertos, destino.clave]));
      setRecarga((n) => n + 1);
      sweetAlert.success(`${nombreDe(persona)} pasó a ${destino.nombre}`, destino.coordinadorNombre ? `Ahora está a cargo de ${destino.coordinadorNombre}.` : "Ese turno todavía no tiene supervisor.");
    } catch (e: any) {
      sweetAlert.error("No se pudo cambiar el turno", e?.response?.data?.error || "Probá de nuevo en un momento.");
      if (e?.response?.status === 409) {
        setCambioDe(null);
        setRecarga((n) => n + 1);
      }
    }
  };

  /** `lugar`: el área y turno en que se muestra la tarjeta. Sin él (Sin área asignada) no hay de dónde cambiarla de turno. */
  const tarjeta = (m: AreaShiftMember, esCoordinador: boolean, lugar?: { area: AreaACargo; turno: TurnoACargo }) => (
    <div
      key={m._id}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${m.cuenta ? "border-green-300 bg-green-50 dark:border-green-800/70 dark:bg-green-950/20" : "border-red-300 bg-red-50 dark:border-red-900/70 dark:bg-red-950/20"}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{nombreDe(m)}</p>
          {esCoordinador && <span className="shrink-0 rounded border border-amber-300 bg-amber-100 px-1 py-0.5 text-[9px] font-bold uppercase text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Supervisor</span>}
        </div>
        {/* El tipo de contrato en su propia línea: con las fechas y el estado en la misma se truncaba. */}
        {m.nombreContrato && <p className="truncate text-[10px] font-bold uppercase tracking-wider text-gray-500">{m.nombreContrato}</p>}
        {/* El horario de SU contrato (puede no coincidir con el del turno). */}
        <p className="flex min-w-0 items-center gap-1 truncate text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          <FontAwesomeIcon icon={faClock} className="h-2.5 w-2.5 shrink-0 text-primary opacity-70" />
          <span className="truncate">
            {m.horaInicio || m.horaFin ? `Entrada ${m.horaInicio || "—"} · Salida ${m.horaFin || "—"}` : "Sin horario en el contrato"}
            {m.diasSemana && m.diasSemana.length > 0 ? ` · ${textoDeDias(m.diasSemana)}` : ""}
          </span>
        </p>
        <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
          Alta: {fechaContrato(m.fechaAlta)} · Baja: {m.fechaBaja ? fechaContrato(m.fechaBaja) : "—"}
          {m.estadoContrato ? ` · ${m.estadoContrato}` : ""}
        </p>
      </div>
      {/*
        EL CONTRATO, en sólo lectura. Sólo para el coordinador del proyecto (el responsable): trae sueldos,
        y quien supervisa áreas y turnos no lo ve. El server lo vuelve a controlar.
      */}
      {/*
        CAMBIAR DE TURNO: sólo el coordinador del proyecto (el server lo vuelve a controlar), y no sobre el
        supervisor del turno: a ése lo mueve la Jerarquía, que además lo saca de supervisar. Con un solo
        turno en el área no hay a dónde ir, y se dice.
      */}
      {equipo?.supervisa && lugar && !esCoordinador && (
        <button
          type="button"
          onClick={() => setCambioDe({ persona: m, area: lugar.area, turno: lugar.turno })}
          disabled={lugar.area.turnos.length < 2}
          title={lugar.area.turnos.length < 2 ? "El área tiene un solo turno" : "Cambiar de turno"}
          aria-label={`Cambiar de turno a ${nombreDe(m)}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-white text-blue-600 active:bg-blue-50 disabled:opacity-40 dark:border-blue-900 dark:bg-slate-900 dark:text-blue-400 dark:active:bg-slate-800"
        >
          <FontAwesomeIcon icon={faArrowRightArrowLeft} className="h-4 w-4" />
        </button>
      )}
      {equipo?.supervisa && (
        <button
          type="button"
          onClick={() => setContratoDe({ userId: m._id, nombre: nombreDe(m) })}
          title="Ver contrato"
          aria-label={`Ver el contrato de ${nombreDe(m)}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:active:bg-slate-800"
        >
          <FontAwesomeIcon icon={faFileContract} className="h-4 w-4" />
        </button>
      )}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={chip(m.activo)}>{m.activo ? "Activo" : "Inactivo"}</span>
        <span className={chip(m.vigente)}>{m.vigente ? "Vigente" : "No vigente"}</span>
      </div>
    </div>
  );

  /*
    LAS DOS TARJETAS (26/11/2026). Lo que superviso directamente y, para quien coordina el proyecto, lo que
    llevan sus supervisores. Un supervisor que no coordina el proyecto ve sólo la primera, sin menú: nada cambia.
  */
  const secciones = equipo
    ? equipo.supervisa
      ? [
          { clave: "propias" as const, titulo: "Equipos que superviso", icono: faLayerGroup, vacio: "Sin turnos a cargo directo en este proyecto: los equipos están en «Supervisores a mi cargo».", areas: equipo.areas, conSupervisor: false },
          { clave: "supervisores" as const, titulo: "Supervisores a mi cargo", icono: faUserTie, vacio: "Todos los turnos del proyecto están a cargo directo: no hay otros supervisores.", areas: equipo.areasDeSupervisores, conSupervisor: true },
        ]
      : [{ clave: "propias" as const, titulo: "", icono: faLayerGroup, vacio: "", areas: equipo.areas, conSupervisor: false }]
    : [];
  /*
    UN MENÚ DE TARJETAS, COMO NOVEDADES (pedido del 26/11/2026: botones, no pestañas). Para quien coordina
    el proyecto la pantalla abre con las dos tarjetas; tocar una ENTRA (el título pasa a ser el de esa parte)
    y la flecha de atrás vuelve a las tarjetas. Cambiar de proyecto también vuelve al menú. Una tarjeta sin
    equipos queda deshabilitada, con el contador en cero a la vista.
  */
  type Seccion = "propias" | "supervisores";
  const conMenu = !!equipo?.supervisa;
  const [elegida, setElegida] = useState<Seccion | "menu">("menu");
  useEffect(() => {
    setElegida("menu");
  }, [proyectoId]);
  const enMenu = conMenu && elegida === "menu";
  const opciones: OpcionDeMenu<Seccion>[] = secciones.map((sec) => ({ id: sec.clave, label: sec.titulo, icon: sec.icono, contador: sec.areas.length, disabled: sec.areas.length === 0 }));
  const opcionActiva = opciones.find((o) => o.id === elegida);
  const seccionesVisibles = conMenu ? secciones.filter((sec) => sec.clave === elegida) : secciones;
  /** La misma fila puede estar en las dos secciones (mis turnos y los de los demás): lo abierto se recuerda por sección. */
  const claveDeArea = (seccion: string, a: AreaACargo) => `area::${seccion}::${a.filaKey}`;

  return (
    <div className="flex-1 pb-24">
      {/* HEADER */}
      <SectionHeader
        icon={enMenu || !opcionActiva ? faSitemap : opcionActiva.icon}
        titulo={enMenu || !opcionActiva ? "Equipos" : opcionActiva.label}
        onBack={() => (enMenu || !conMenu ? onNavigate("home") : setElegida("menu"))}
        info={
          "Las áreas y turnos que tenés a cargo, con la gente de cada uno: lo mismo que la Jerarquía del proyecto en el escritorio.\n\nSi coordinás el proyecto hay dos botones: los equipos que supervisás directamente y los de tus supervisores, cada área con sus turnos y quién supervisa cada uno.\n\nArranca todo cerrado. Cada área muestra sus turnos con cuántas personas suman sobre el total asignado (suman las activas con contrato vigente). Tocá un área para ver sus turnos, y un turno para ver quiénes lo integran.\n\nSi coordinás el proyecto, con las flechas de cada persona la cambiás de turno dentro de su área: pasa a estar a cargo del supervisor del turno nuevo.\n\nSi estás en más de un proyecto, elegí cuál ver."
        }
      />

      <div className="space-y-4 px-4 pt-4">
        {error ? (
          <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>
        ) : !equipos ? (
          <LoadingSpinner message="Cargando datos..." />
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
                {/* La misma elección que en la Solicitud de Contratación: ventana, centro de costo y valoración. */}
                <SelectorDeProyecto proyectos={equipos.map((e) => e.proyecto)} valor={proyectoId} onElegir={setProyectoId} extra={equipo ? botonInfoProyecto : null} />
                {!equipo && <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">Elegí un proyecto para ver sus equipos.</p>}
              </div>
            ) : (
              <p className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                {equipo && <BadgeCentroCosto proyecto={equipo.proyecto} />}
                <span className="min-w-0 truncate">{equipo ? etiquetaDeProyecto(equipo.proyecto) : ""}</span>
                {botonInfoProyecto}
              </p>
            )}

            {equipo && (
              <>
                {/* El supervisor, arriba de todo: es de quien cuelga el resto. */}
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-900/20">
                  <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                    <FontAwesomeIcon icon={faUserShield} />
                    Coordinador del proyecto
                  </p>
                  <p className="mt-1 text-sm font-bold text-emerald-900 dark:text-emerald-200">
                    {equipo.supervisorNombre || <span className="font-normal italic text-emerald-700/70 dark:text-emerald-400/70">Sin responsable asignado</span>}
                    {equipo.supervisa && <span className="ml-1.5 text-xs font-semibold text-emerald-700/80 dark:text-emerald-400/80">(vos)</span>}
                  </p>
                  {!equipo.supervisa && <p className="mt-1 text-[11px] text-emerald-800/80 dark:text-emerald-300/70">Abajo están las áreas y turnos que supervisás.</p>}
                </div>

                {/* Las dos tarjetas, como el menú de Novedades: tocar una entra; la flecha de atrás vuelve acá. */}
                {enMenu && <MenuDeTarjetas opciones={opciones} onElegir={setElegida} />}

                {!enMenu && (
                  <>
                  {/* Abrir o cerrar todo de una vez. */}
                  <div className="flex items-center justify-end gap-2 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setAbiertos(new Set([...seccionesVisibles.flatMap((sec) => sec.areas.map((a) => claveDeArea(sec.clave, a))), ...seccionesVisibles.flatMap((sec) => sec.areas.flatMap((a) => a.turnos.map((t) => t.clave))), ...(sinAsignar ? ["sin-asignar"] : [])]))}
                      className="text-blue-600 dark:text-blue-400"
                    >
                      Expandir todo
                    </button>
                    <span className="text-slate-300 dark:text-slate-600">|</span>
                    <button type="button" onClick={() => setAbiertos(new Set())} className="text-blue-600 dark:text-blue-400">
                      Colapsar todo
                    </button>
                  </div>

                  {/* La parte elegida (ver `secciones`): dentro, un bloque por área con sus turnos en orden de horario. */}
                  {seccionesVisibles.map((sec) => (
                    <div key={sec.clave} className="space-y-4">
                      {sec.titulo && sec.areas.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-3 text-xs italic text-slate-500 dark:border-slate-600 dark:text-slate-400">{sec.vacio}</p>}
                      {sec.areas.map((a) => {
                        const areaAbierta = abiertos.has(claveDeArea(sec.clave, a));
                        return (
                          <section key={a.filaKey} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/60">
                            <button
                              type="button"
                              onClick={() => alternar(claveDeArea(sec.clave, a))}
                              aria-expanded={areaAbierta}
                              className={`flex w-full flex-wrap items-center gap-2 text-left ${areaAbierta ? "mb-3 border-b border-slate-200 pb-2 dark:border-slate-700" : ""}`}
                            >
                              <FontAwesomeIcon icon={areaAbierta ? faChevronDown : faChevronRight} className="h-3 w-3 text-slate-400" />
                              <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5 text-blue-500" />
                              <span className="flex flex-col items-start">
                                <span className="text-sm font-black uppercase tracking-wide text-slate-900 dark:text-slate-100">{a.nombre}</span>
                                {/* La sede, siempre (también la principal sola): cada sede de un área es su propio equipo. */}
                                {a.sedeEtiqueta && (
                                  <span className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:border-orange-800 dark:bg-orange-900/20 dark:text-orange-300">
                                    <FontAwesomeIcon icon={faLocationDot} className="h-2.5 w-2.5" />
                                    {a.sedeEtiqueta}
                                  </span>
                                )}
                              </span>
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
                                        {/* En «Supervisores a tu cargo», quién lleva cada turno, a la vista sin abrir nada. */}
                                        {sec.conSupervisor && <span className="text-amber-700 dark:text-amber-300"> · {t.coordinadorNombre || "Sin supervisor"}</span>}
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
                                              {t.coordinadorNombre || "Sin supervisor"}
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
                                              {suman.map((m) => tarjeta(m, m._id === t.coordinadorId, { area: a, turno: t }))}
                                              {noSuman.length > 0 && (
                                                <>
                                                  <p className="pt-2 text-[10px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">No suman al total ({noSuman.length})</p>
                                                  {noSuman.map((m) => tarjeta(m, m._id === t.coordinadorId, { area: a, turno: t }))}
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
                    </div>
                  ))}

                  {/* Los que no están en ningún turno: sólo el supervisor los ve, es quien los acomoda. */}
                  {sinAsignar && elegida === "supervisores" && (
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
          </>
        )}
      </div>

      <ContratoMiembroModal isOpen={!!contratoDe && !!equipo} onClose={() => setContratoDe(null)} projectId={equipo?.proyecto._id || ""} userId={contratoDe?.userId || ""} nombre={contratoDe?.nombre || ""} />

      {/* `key`: cada apertura arranca sin turno elegido. */}
      {cambioDe && equipo && (
        <CambiarTurnoModal key={`${cambioDe.persona._id}::${cambioDe.turno.clave}`} isOpen onClose={() => setCambioDe(null)} persona={nombreDe(cambioDe.persona)} area={cambioDe.area} turnoActual={cambioDe.turno} cuentaDe={cuentaDe} onConfirmar={cambiarTurno} />
      )}

      <ProyectoInfoModal isOpen={verInfoProyecto && !!equipo} onClose={() => setVerInfoProyecto(false)} proyecto={equipo?.proyecto || null} supervisorNombre={equipo?.supervisorNombre || ""} areas={areasDelProyecto} />
    </div>
  );
}

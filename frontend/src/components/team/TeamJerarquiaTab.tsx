import React, { useEffect, useMemo, useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserShield, faUserTie, faUsers, faLayerGroup, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { AreaShiftMember, Project, projectsAPI } from "../../api/projects";
import { EstadoBadge } from "../EstadoSelect";
import { User } from "../../api/users";
import { Area } from "../../api/areas";
import { Shift } from "../../api/shifts";
import { sweetAlert } from "../../utils/sweetAlert";
import { coordinaAreas } from "../../utils/permisosMobile";
import { DIAS_SEMANA } from "../contratos/DiasDeTrabajo";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * LA JERARQUÍA DEL PROYECTO, ARMABLE ARRASTRANDO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Quién depende de quién estaba repartido en tres lugares: el responsable en la ficha del proyecto,
 * los coordinadores en su propia pestaña con selects, y el área de cada persona adentro del wizard de
 * cada miembro. Entender cómo estaba armado un equipo exigía abrir las tres y reconstruirlo de cabeza.
 *
 *   Supervisor   — responsable del proyecto. Aprueba y controla lo que cargan los coordinadores.
 *   Coordinador  — tiene un área y un turno a cargo.
 *   Colaborador  — trabaja en un área.
 *
 * Se lee de lo que ya existe: `project.metadata.responsableId`, `project.coordinatorAssignments` y
 * `project.teamConfig[].areaShiftAssignments`. No hay un modelo nuevo de jerarquía: la jerarquía ES
 * eso, sólo que hasta ahora no se veía junta.
 *
 * ARRASTRAR ESCRIBE DE VERDAD, pero sólo sobre el equipo del proyecto: nunca sobre contratos. El
 * wizard lee el área de `teamConfig` primero y del contrato sólo como respaldo, así que soltar a
 * alguien donde no va no altera un alta de ARCA ni un sueldo — se arrastra de vuelta y listo.
 */

interface Props {
  project: Project;
  /** El equipo ya cargado por la página: esta pantalla no vuelve a pedirlo. */
  teamMembers: User[];
  allAreas: Area[];
  allShifts: Shift[];
  /** Para releer el proyecto después de escribir. */
  onRefresh: () => void;
}

/** Una columna: un turno de un área. Es la unidad que coordina una persona. */
interface Columna {
  clave: string;
  areaId: string;
  shiftId: string;
  turnoNombre: string;
  horario: string;
  /** Los días del turno, ya en texto. Se muestran en el área cuando todos sus turnos coinciden. */
  dias: string;
  orden: string;
  coordinador: User | null;
  colaboradores: User[];
}

/** Un área con sus turnos: así se agrupa la pantalla. */
interface Bloque {
  areaId: string;
  areaNombre: string;
  /** Vacío cuando los turnos del área no trabajan los mismos días: ahí cada uno los dice por su cuenta. */
  diasComunes: string;
  turnos: Columna[];
}

/**
 * Los días de un turno, en texto corto: "Lun a Dom", "Lu a Vi", "Lu, Mi, Vi".
 *
 * El nombre del turno ya suele traerlos ("Tarde 12 a 18 - Lun a Dom"), pero repetirlos en cada
 * columna era justamente el ruido: se dicen una vez por área y se recortan del nombre.
 */
const textoDeDias = (dias: number[] | undefined): string => {
  const d = [...new Set(dias || [])].sort((a, b) => a - b);
  if (d.length === 0) return "";
  if (d.length === 7) return "Lun a Dom";
  const corto = (i: number) => DIAS_SEMANA.find((x) => x.indice === i)?.corto || "";
  // Los índices de JS arrancan el domingo, así que una semana laboral corrida (1..6) se detecta
  // sobre los días sin domingo; con domingo en el medio ya no es un rango y se enumera.
  const sinDomingo = d.filter((x) => x !== 0);
  const esRango = !d.includes(0) && sinDomingo.length > 1 && sinDomingo[sinDomingo.length - 1] - sinDomingo[0] === sinDomingo.length - 1;
  if (esRango) return corto(sinDomingo[0]) + " a " + corto(sinDomingo[sinDomingo.length - 1]);
  return d.map(corto).join(", ");
};

/**
 * La etiqueta de un turno: "Mañana", "Tarde", "Noche".
 *
 * El nombre guardado es "Mañana 6 a 12 - Lun a Dom": trae los días y el rango horario pegados. Los
 * días se dicen una vez por área, y el horario va debajo en su formato real ("06:00 a 12:00"), así
 * que dejarlo también en el título lo decía dos veces con distinta forma.
 *
 * El rango se saca sólo si de verdad lo parece —dos números con "a" o un guion en el medio— y nunca
 * si al recortarlo no queda nada: un turno llamado "6 a 12" a secas se sigue llamando así.
 */
const etiquetaDeTurno = (nombre: string): string => {
  const sinDias = nombre.split(" - ")[0].trim() || nombre;
  const sinRango = sinDias.replace(/\s+\d{1,2}([:.]\d{2})?\s*(a|-|–)\s*\d{1,2}([:.]\d{2})?\s*(hs?)?\.?$/i, "").trim();
  return sinRango || sinDias;
};

const idDe = (x: any): string => (x && typeof x === "object" ? String(x._id || x.id || "") : String(x || ""));
const nombreDe = (u: User | null): string => (u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email : "");

/** Las iniciales, para el avatar. Con una sola palabra alcanza con su primera letra. */
const iniciales = (u: User): string => `${(u.firstName || "").charAt(0)}${(u.lastName || "").charAt(0)}`.toUpperCase() || (u.email || "?").charAt(0).toUpperCase();

/** Fecha de contrato ("YYYY-MM-DD...") a d/m/yyyy, sin pasar por `Date` para no correrla de día por la zona horaria. */
const fechaContrato = (d?: string): string => {
  const [y, m, dia] = String(d || "")
    .substring(0, 10)
    .split("-");
  return y && m && dia ? `${Number(dia)}/${Number(m)}/${y}` : "—";
};

const chip = (ok: boolean) =>
  `inline-flex items-center rounded px-1 py-0.5 text-[9px] font-bold uppercase ${ok ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`;

/**
 * `estado` es la fila de esa persona en `area-shift-members`: el mismo criterio que el número de la
 * columna Área/Turno Coordinada. Sin él (todavía cargando) la tarjeta se muestra sin detalle.
 */
const TarjetaPersona: React.FC<{
  user: User;
  arrastrable: boolean;
  tono?: "coordinador" | "colaborador";
  estado?: AreaShiftMember;
}> = ({ user, arrastrable, tono = "colaborador", estado }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: user._id,
    disabled: !arrastrable,
    data: { user },
  });

  const colores =
    tono === "coordinador"
      ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
      : "border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${colores} ${estado && !estado.cuenta ? "opacity-75" : ""} ${arrastrable ? "cursor-grab active:cursor-grabbing" : ""} ${isDragging ? "opacity-30" : ""}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-[10px] font-bold text-white">{iniciales(user)}</span>
      <div className="min-w-0 flex-1">
        <span className="block truncate font-medium">{nombreDe(user)}</span>
        {estado && (
          <span className="block truncate text-[10px] text-gray-500 dark:text-gray-400">
            Alta: {fechaContrato(estado.fechaAlta)} · Baja: {estado.fechaBaja ? fechaContrato(estado.fechaBaja) : "—"}
          </span>
        )}
      </div>
      {estado && (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <span className={chip(estado.activo)}>{estado.activo ? "Activo" : "Inactivo"}</span>
            <span className={chip(estado.vigente)}>{estado.vigente ? "Vigente" : "No vigente"}</span>
          </div>
          {estado.estadoContrato ? <EstadoBadge name={estado.estadoContrato} className="whitespace-nowrap text-[9px]" /> : <span className="text-[9px] text-gray-400">Sin contrato</span>}
        </div>
      )}
    </div>
  );
};

/** Una zona donde se puede soltar. `aceptaCoordinador` distingue el lugar del jefe del de la gente. */
const ZonaSoltar: React.FC<{
  id: string;
  children: React.ReactNode;
  className?: string;
  activa: boolean;
}> = ({ id, children, className = "", activa }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`${className} rounded-lg transition-colors ${isOver && activa ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900" : ""} ${!activa ? "opacity-50" : ""}`}
    >
      {children}
    </div>
  );
};

export const TeamJerarquiaTab: React.FC<Props> = ({ project, teamMembers, allAreas, allShifts, onRefresh }) => {
  const [arrastrando, setArrastrando] = useState<User | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Un umbral de movimiento para que un click siga siendo un click y no empiece a arrastrar.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const porId = useMemo(() => new Map(teamMembers.map((u) => [String(u._id), u])), [teamMembers]);

  /**
   * El supervisor del proyecto.
   *
   * `metadata.responsableId` NO es un ObjectId: es el id numérico que viene de FRAME, y se corresponde
   * con `User.metadata.id`. Es el mismo vínculo que resuelve `alcanceDeResponsable` en el server; un
   * match contra `_id` no encontraría nunca nada.
   */
  const supervisor = useMemo(() => {
    const idFrame = (project.metadata as any)?.responsableId;
    if (idFrame == null) return null;
    return teamMembers.find((u) => String((u.metadata as any)?.id ?? "") === String(idFrame)) || null;
  }, [project.metadata, teamMembers]);

  /**
   * La pantalla, agrupada por área.
   *
   * Antes era una grilla plana de combinaciones área+turno, y cada tarjeta repetía el nombre del área
   * y los días: "TÉCNICA · Tarde 12 a 18 - Lun a Dom", tres veces seguidas para la misma área. Lo que
   * cambia entre una columna y la otra es SOLO el turno, así que es lo único que conviene repetir.
   *
   * Los turnos van en orden de horario —mañana, tarde, noche— y no en el que estén cargados en el
   * proyecto: es el orden en que transcurre el día, el único con el que se lee un área de un vistazo.
   */
  const bloques: Bloque[] = useMemo(() => {
    const nombreArea = new Map(allAreas.map((a) => [String(a._id), a.name]));
    const turnoPorId = new Map(allShifts.map((s) => [String(s._id), s]));

    const asignacionesDe = (userId: string) => (project.teamConfig || []).find((c: any) => idDe(c.userId) === userId)?.areaShiftAssignments || [];

    const res: Bloque[] = [];
    for (const ac of project.areasConfig || []) {
      const areaId = idDe(ac.areaId);
      const turnos: Columna[] = [];

      for (const s of ac.shiftIds || []) {
        const shiftId = idDe(s);
        const turno = turnoPorId.get(shiftId);
        const nombreCrudo = turno?.name || (typeof s === "object" ? (s as any)?.name : "") || "Turno";
        const coordAsig = (project.coordinatorAssignments || []).find((a: any) => idDe(a.areaId) === areaId && idDe(a.shiftId) === shiftId);

        turnos.push({
          clave: areaId + "::" + shiftId,
          areaId,
          shiftId,
          turnoNombre: etiquetaDeTurno(nombreCrudo),
          horario: turno?.startTime && turno?.endTime ? turno.startTime + " a " + turno.endTime : "",
          dias: textoDeDias(turno?.days),
          // Un turno sin horario cargado se va al final en vez de colarse primero como "".
          orden: turno?.startTime || "99:99",
          coordinador: coordAsig ? porId.get(idDe(coordAsig.userId)) || null : null,
          colaboradores: teamMembers.filter((u) => {
            if (coordAsig && idDe(coordAsig.userId) === String(u._id)) return false;
            return (asignacionesDe(String(u._id)) as any[]).some((a) => idDe(a.areaId) === areaId && (a.shiftIds || []).some((x: any) => idDe(x) === shiftId));
          }),
        });
      }

      if (turnos.length === 0) continue;
      turnos.sort((a, b) => a.orden.localeCompare(b.orden));

      // Los días suben al encabezado del área sólo si TODOS sus turnos coinciden. Si no, mentiría:
      // ahí cada turno los dice por su cuenta.
      const distintos = new Set(turnos.map((t) => t.dias));
      res.push({
        areaId,
        areaNombre: nombreArea.get(areaId) || (typeof ac.areaId === "object" ? (ac.areaId as any)?.name : "") || "Área",
        diasComunes: distintos.size === 1 ? turnos[0].dias : "",
        turnos,
      });
    }

    return res.sort((a, b) => a.areaNombre.localeCompare(b.areaNombre));
  }, [project, allAreas, allShifts, teamMembers, porId]);

  /**
   * Quién suma y quién no en cada turno, por área.
   *
   * Lo decide el server con el mismo criterio que el número de la columna Área/Turno Coordinada:
   * activo y con contrato vigente. Se pide el área completa —una llamada por área, no por turno— y
   * cada persona trae los turnos que tiene ahí. Se vuelve a pedir después de cada movimiento.
   */
  const [detallePorArea, setDetallePorArea] = useState<Map<string, AreaShiftMember[]>>(new Map());
  useEffect(() => {
    const areaIds = [...new Set((project.areasConfig || []).map((ac: any) => idDe(ac.areaId)).filter(Boolean))];
    let cancelado = false;
    Promise.all(
      areaIds.map((areaId) =>
        projectsAPI
          .getAreaShiftMembers(project._id, areaId)
          .then((r) => [areaId, r.members] as const)
          .catch(() => [areaId, null] as const),
      ),
    ).then((res) => {
      if (cancelado) return;
      const m = new Map<string, AreaShiftMember[]>();
      for (const [areaId, members] of res) if (members) m.set(areaId, members);
      setDetallePorArea(m);
    });
    return () => {
      cancelado = true;
    };
  }, [project._id, project.areasConfig, project.teamConfig, project.coordinatorAssignments]);

  /** El detalle de un turno, o null mientras no llegó: ahí las tarjetas se muestran sin estado. */
  const detalleDeTurno = (c: Columna) => {
    const delArea = detallePorArea.get(c.areaId);
    if (!delArea) return null;
    const enTurno = delArea.filter((m) => (m.shiftIds || []).some((s) => String(s) === c.shiftId));
    return {
      estadoDe: new Map(enTurno.map((m) => [String(m._id), m])),
      cuentan: enTurno.filter((m) => m.cuenta).length,
      total: enTurno.length,
    };
  };

  /** Todas las combinaciones, planas: lo que necesitan «sin asignar» y el guardado. */
  const columnas: Columna[] = useMemo(() => bloques.flatMap((b) => b.turnos), [bloques]);

  /**
   * Los que no están en ninguna columna.
   *
   * Es la razón principal de esta pantalla: hoy no se ven en ningún lado —el wizard sólo los muestra
   * de a uno— y son justamente los que hay que acomodar.
   */
  const sinAsignar = useMemo(() => {
    const ubicados = new Set<string>();
    for (const c of columnas) {
      if (c.coordinador) ubicados.add(String(c.coordinador._id));
      for (const u of c.colaboradores) ubicados.add(String(u._id));
    }
    if (supervisor) ubicados.add(String(supervisor._id));
    return teamMembers.filter((u) => !ubicados.has(String(u._id)));
  }, [columnas, teamMembers, supervisor]);

  /** Una zona sólo acepta lo que corresponde: soltar donde no va se marca antes, no se revierte después. */
  const zonaAcepta = (zonaId: string): boolean => {
    if (!arrastrando) return true;
    if (zonaId.startsWith("coord::")) return coordinaAreas(arrastrando.roles);
    return true;
  };

  const alSoltar = async (e: DragEndEvent) => {
    const persona = arrastrando;
    setArrastrando(null);
    if (!e.over || !persona) return;

    const zona = String(e.over.id);
    if (!zonaAcepta(zona)) return;

    /*
      SACAR A ALGUIEN DE COORDINAR ES UNA DECISIÓN, NO UN EFECTO COLATERAL.

      Arrastrar a un coordinador a una lista de colaboradores —o a «Sin asignar»— sólo cambiaría su
      área si no tocáramos `coordinatorAssignments`: seguiría figurando a cargo, y la pantalla lo
      mostraría arriba de la columna de la que se lo acaba de sacar. Un movimiento que no se ve es
      peor que uno que no se puede hacer.

      Suelta las áreas que tenía a cargo, entonces, pero preguntando: es lo único de esta pantalla
      que le quita algo a alguien en vez de moverlo.
    */
    const areasQueCoordina = (project.coordinatorAssignments || []).filter((a: any) => idDe(a.userId) === String(persona._id));
    if (!zona.startsWith("coord::") && areasQueCoordina.length > 0) {
      const r = await sweetAlert.confirm(
        `${nombreDe(persona)} coordina ${areasQueCoordina.length === 1 ? "un área" : `${areasQueCoordina.length} áreas`}`,
        "Al moverlo deja de tenerlas a cargo. Se puede volver a asignar arrastrándolo al lugar del coordinador.",
        "Sí, moverlo",
      );
      if (!r.isConfirmed) return;
    }

    try {
      setGuardando(true);

      if (!zona.startsWith("coord::") && areasQueCoordina.length > 0) {
        await projectsAPI.updateProject(project._id, {
          coordinatorAssignments: (project.coordinatorAssignments || [])
            .filter((a: any) => idDe(a.userId) !== String(persona._id))
            .map((a: any) => ({
              areaId: idDe(a.areaId),
              shiftId: idDe(a.shiftId),
              userId: idDe(a.userId),
            })),
        });
      }

      if (zona.startsWith("coord::")) {
        // A cargo de un área: se reemplaza al coordinador de esa combinación área+turno.
        const [, areaId, shiftId] = zona.split("::");
        const otras = (project.coordinatorAssignments || []).filter((a: any) => !(idDe(a.areaId) === areaId && idDe(a.shiftId) === shiftId));
        await projectsAPI.updateProject(project._id, {
          coordinatorAssignments: [
            ...otras.map((a: any) => ({
              areaId: idDe(a.areaId),
              shiftId: idDe(a.shiftId),
              userId: idDe(a.userId),
            })),
            { areaId, shiftId, userId: String(persona._id) },
          ],
        });
      } else if (zona === "sin-asignar") {
        await projectsAPI.asignarAreasDeMiembro(project._id, String(persona._id), []);
      } else {
        const [areaId, shiftId] = zona.split("::");
        await projectsAPI.asignarAreasDeMiembro(project._id, String(persona._id), [{ areaId, shiftIds: [shiftId] }]);
      }

      onRefresh();
    } catch (error: any) {
      sweetAlert.error("No se pudo mover", error?.response?.data?.error || "Probá de nuevo en un momento.");
    } finally {
      setGuardando(false);
    }
  };

  if (columnas.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
        <p className="flex items-center gap-2 font-bold">
          <FontAwesomeIcon icon={faCircleInfo} />
          Este proyecto todavía no tiene áreas y turnos configurados
        </p>
        <p className="mt-1 text-xs">La jerarquía se arma sobre ellos: sin áreas no hay dónde ubicar a nadie. Se configuran en la ficha del proyecto.</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setArrastrando((e.active.data.current as any)?.user || null)} onDragEnd={alSoltar} onDragCancel={() => setArrastrando(null)}>
      <div className={`space-y-4 ${guardando ? "pointer-events-none opacity-60" : ""}`}>
        {/* El supervisor, arriba de todo: es de quien cuelga el resto. */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            <FontAwesomeIcon icon={faUserShield} />
            Supervisor · responsable del proyecto
          </p>
          <p className="mt-1 text-sm font-bold text-emerald-900 dark:text-emerald-200">
            {supervisor ? nombreDe(supervisor) : <span className="font-normal italic text-emerald-700/70 dark:text-emerald-400/70">Sin responsable asignado. Se elige en la ficha del proyecto.</span>}
          </p>
        </div>

        {/* Un bloque por área. Dentro, sus turnos en orden de horario. */}
        {bloques.map((b) => (
          <div key={b.areaId} className="rounded-xl border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-900/30">
            <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-2 dark:border-gray-700">
              <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-sm font-bold uppercase tracking-wide text-gray-800 dark:text-gray-100">{b.areaNombre}</span>
              {b.diasComunes && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">{b.diasComunes}</span>}
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                {b.turnos.length} {b.turnos.length === 1 ? "turno" : "turnos"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {b.turnos.map((c) => {
                const detalle = detalleDeTurno(c);
                // Quien no figura en el detalle (todavía cargando) queda arriba, sin estado: no se lo
                // manda a «no suman» sin saberlo.
                const suman = c.colaboradores.filter((u) => detalle?.estadoDe.get(String(u._id))?.cuenta !== false);
                const noSuman = c.colaboradores.filter((u) => detalle?.estadoDe.get(String(u._id))?.cuenta === false);
                return (
                  <div key={c.clave} className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/40">
                    <div>
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{c.turnoNombre}</span>
                        {/* Los días sólo acá cuando los turnos del área no coinciden: si no, ya están arriba. */}
                        {!b.diasComunes && c.dias && <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{c.dias}</span>}
                      </div>
                      {c.horario && <p className="text-[11px] text-gray-500 dark:text-gray-400">{c.horario}</p>}
                    </div>

                    {/* El lugar del coordinador. Sólo acepta a quien puede tener un área a cargo. */}
                    <ZonaSoltar id={`coord::${c.areaId}::${c.shiftId}`} activa={zonaAcepta(`coord::${c.areaId}::${c.shiftId}`)}>
                      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                        <FontAwesomeIcon icon={faUserTie} />
                        Coordinador
                      </p>
                      {c.coordinador ? (
                        <TarjetaPersona user={c.coordinador} arrastrable tono="coordinador" estado={detalle?.estadoDe.get(String(c.coordinador._id))} />
                      ) : (
                        <p className="rounded-lg border border-dashed border-amber-300 px-2.5 py-2 text-xs italic text-amber-600 dark:border-amber-800 dark:text-amber-500">
                          Arrastrá acá a alguien con el rol Coordinador
                        </p>
                      )}
                    </ZonaSoltar>

                    {/* Y su gente. */}
                    <ZonaSoltar id={c.clave} activa className="flex-1">
                      <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                        <FontAwesomeIcon icon={faUsers} />
                        Colaboradores ({c.colaboradores.length})
                      </p>
                      {detalle && detalle.total > 0 && (
                        <p
                          className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                          title="El número de la columna Área/Turno Coordinada es el primero."
                        >
                          <strong>{detalle.cuentan}</strong> persona
                          {detalle.cuentan === 1 ? "" : "s"} activa
                          {detalle.cuentan === 1 ? "" : "s"} con contrato vigente
                          {detalle.total !== detalle.cuentan && (
                            <>
                              {" "}
                              · <strong>{detalle.total}</strong> asignada
                              {detalle.total === 1 ? "" : "s"} en total
                            </>
                          )}
                        </p>
                      )}
                      <div className="min-h-[3rem] space-y-1.5">
                        {suman.map((u) => (
                          <TarjetaPersona key={u._id} user={u} arrastrable estado={detalle?.estadoDe.get(String(u._id))} />
                        ))}
                        {noSuman.length > 0 && (
                          <>
                            <p className="pt-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">No suman al total ({noSuman.length})</p>
                            {noSuman.map((u) => (
                              <TarjetaPersona key={u._id} user={u} arrastrable estado={detalle?.estadoDe.get(String(u._id))} />
                            ))}
                          </>
                        )}
                      </div>
                    </ZonaSoltar>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <ZonaSoltar id="sin-asignar" activa>
          <div className="rounded-xl border border-dashed border-gray-300 p-3 dark:border-gray-600">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">Sin área asignada ({sinAsignar.length})</p>
            {sinAsignar.length === 0 ? (
              <p className="text-xs italic text-gray-400">Todo el equipo está ubicado.</p>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
                {sinAsignar.map((u) => (
                  <TarjetaPersona key={u._id} user={u} arrastrable />
                ))}
              </div>
            )}
          </div>
        </ZonaSoltar>
      </div>

      {/* Lo que se ve mientras se arrastra: sin esto, la tarjeta parece quedarse quieta. */}
      <DragOverlay>{arrastrando ? <TarjetaPersona user={arrastrando} arrastrable={false} /> : null}</DragOverlay>
    </DndContext>
  );
};

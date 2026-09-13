import React, { useMemo, useState } from "react";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserShield, faUserTie, faUsers, faLayerGroup, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { Project, projectsAPI } from "../../api/projects";
import { User } from "../../api/users";
import { Area } from "../../api/areas";
import { Shift } from "../../api/shifts";
import { sweetAlert } from "../../utils/sweetAlert";
import { coordinaAreas } from "../../utils/permisosMobile";

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

/** Una columna: un área con su turno. Es la unidad que coordina una persona. */
interface Columna {
  clave: string;
  areaId: string;
  shiftId: string;
  areaNombre: string;
  turnoNombre: string;
  coordinador: User | null;
  colaboradores: User[];
}

const idDe = (x: any): string => (x && typeof x === "object" ? String(x._id || x.id || "") : String(x || ""));
const nombreDe = (u: User | null): string => (u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email : "");

/** Las iniciales, para el avatar. Con una sola palabra alcanza con su primera letra. */
const iniciales = (u: User): string =>
  `${(u.firstName || "").charAt(0)}${(u.lastName || "").charAt(0)}`.toUpperCase() || (u.email || "?").charAt(0).toUpperCase();

const TarjetaPersona: React.FC<{ user: User; arrastrable: boolean; tono?: "coordinador" | "colaborador" }> = ({ user, arrastrable, tono = "colaborador" }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: user._id, disabled: !arrastrable, data: { user } });

  const colores =
    tono === "coordinador"
      ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
      : "border-gray-200 bg-white text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200";

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${colores} ${arrastrable ? "cursor-grab active:cursor-grabbing" : ""} ${isDragging ? "opacity-30" : ""}`}
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-[10px] font-bold text-white">{iniciales(user)}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{nombreDe(user)}</span>
    </div>
  );
};

/** Una zona donde se puede soltar. `aceptaCoordinador` distingue el lugar del jefe del de la gente. */
const ZonaSoltar: React.FC<{ id: string; children: React.ReactNode; className?: string; activa: boolean }> = ({ id, children, className = "", activa }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`${className} rounded-lg transition-colors ${isOver && activa ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-900" : ""} ${!activa ? "opacity-50" : ""}`}>
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

  const columnas: Columna[] = useMemo(() => {
    const nombreArea = new Map(allAreas.map((a) => [String(a._id), a.name]));
    const nombreTurno = new Map(allShifts.map((s) => [String(s._id), s.name]));

    const asignacionesDe = (userId: string) => (project.teamConfig || []).find((c: any) => idDe(c.userId) === userId)?.areaShiftAssignments || [];

    const cols: Columna[] = [];
    for (const ac of project.areasConfig || []) {
      const areaId = idDe(ac.areaId);
      for (const s of ac.shiftIds || []) {
        const shiftId = idDe(s);
        const coordAsig = (project.coordinatorAssignments || []).find((a: any) => idDe(a.areaId) === areaId && idDe(a.shiftId) === shiftId);

        cols.push({
          clave: `${areaId}::${shiftId}`,
          areaId,
          shiftId,
          areaNombre: nombreArea.get(areaId) || (typeof ac.areaId === "object" ? (ac.areaId as any)?.name : "") || "Área",
          turnoNombre: nombreTurno.get(shiftId) || (typeof s === "object" ? (s as any)?.name : "") || "Turno",
          coordinador: coordAsig ? porId.get(idDe(coordAsig.userId)) || null : null,
          colaboradores: teamMembers.filter((u) => {
            if (coordAsig && idDe(coordAsig.userId) === String(u._id)) return false;
            return (asignacionesDe(String(u._id)) as any[]).some((a) => idDe(a.areaId) === areaId && (a.shiftIds || []).some((x: any) => idDe(x) === shiftId));
          }),
        });
      }
    }
    return cols;
  }, [project, allAreas, allShifts, teamMembers, porId]);

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
            .map((a: any) => ({ areaId: idDe(a.areaId), shiftId: idDe(a.shiftId), userId: idDe(a.userId) })),
        });
      }

      if (zona.startsWith("coord::")) {
        // A cargo de un área: se reemplaza al coordinador de esa combinación área+turno.
        const [, areaId, shiftId] = zona.split("::");
        const otras = (project.coordinatorAssignments || []).filter((a: any) => !(idDe(a.areaId) === areaId && idDe(a.shiftId) === shiftId));
        await projectsAPI.updateProject(project._id, {
          coordinatorAssignments: [...otras.map((a: any) => ({ areaId: idDe(a.areaId), shiftId: idDe(a.shiftId), userId: idDe(a.userId) })), { areaId, shiftId, userId: String(persona._id) }],
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {columnas.map((c) => (
            <div key={c.clave} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-900/30">
              <div className="flex items-center gap-2">
                <FontAwesomeIcon icon={faLayerGroup} className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-sm font-bold uppercase tracking-wide text-gray-800 dark:text-gray-100">{c.areaNombre}</span>
                <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{c.turnoNombre}</span>
              </div>

              {/* El lugar del coordinador. Sólo acepta a quien puede tener un área a cargo. */}
              <ZonaSoltar id={`coord::${c.areaId}::${c.shiftId}`} activa={zonaAcepta(`coord::${c.areaId}::${c.shiftId}`)}>
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                  <FontAwesomeIcon icon={faUserTie} />
                  Coordinador
                </p>
                {c.coordinador ? (
                  <TarjetaPersona user={c.coordinador} arrastrable tono="coordinador" />
                ) : (
                  <p className="rounded-lg border border-dashed border-amber-300 px-2.5 py-2 text-xs italic text-amber-600 dark:border-amber-800 dark:text-amber-500">Arrastrá acá a alguien con el rol Coordinador</p>
                )}
              </ZonaSoltar>

              {/* Y su gente. */}
              <ZonaSoltar id={c.clave} activa className="flex-1">
                <p className="mb-1 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">
                  <FontAwesomeIcon icon={faUsers} />
                  Colaboradores ({c.colaboradores.length})
                </p>
                <div className="min-h-[3rem] space-y-1.5">
                  {c.colaboradores.map((u) => (
                    <TarjetaPersona key={u._id} user={u} arrastrable />
                  ))}
                </div>
              </ZonaSoltar>
            </div>
          ))}
        </div>

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

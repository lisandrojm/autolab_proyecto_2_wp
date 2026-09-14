import { useState, useEffect, useMemo, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBriefcase, faBuilding, faIdCard, faClock, faLayerGroup, faChevronDown, faChevronRight, faUserShield, faUserTie, faUsers } from '@fortawesome/free-solid-svg-icons';
import { useAuthStore } from '../../../../stores/authStore';
import { useProfile } from '../hooks/useProfile';
import { format } from 'date-fns';
import { projectsAPI, Project } from '../../../../api/projects';
import { areasAPI, Area } from '../../../../api/areas';
import { shiftsAPI, Shift } from '../../../../api/shifts';
import SectionHeader from '../components/SectionHeader';

/** Id de algo que puede venir poblado (objeto) o pelado (string). */
const idDe = (x: any): string => (x && typeof x === 'object' ? String(x._id || x.id || '') : x ? String(x) : '');

/** Un proyecto de la lista. `resumen` es el UserProject (su contrato) si lo tiene; si no, está por supervisarlo o coordinarlo. */
interface Entrada {
  clave: string;
  pid: string;
  resumen: any | null;
}

/**
 * PROYECTOS: DÓNDE TRABAJA LA PERSONA, TODOS A LA VISTA.
 *
 * Antes se llamaba «Asignación» y mostraba UN proyecto, con un desplegable para cambiar de uno a otro:
 * quien estaba en varios no veía de un vistazo en cuáles. Ahora es la lista entera, una tarjeta por
 * proyecto, y cada una se abre para ver sede, contrato, vigencia, horario y áreas y turnos.
 *
 * Entran dos clases de proyecto:
 *  - Los que tiene con CONTRATO vigente (`metadata.projects`, que el server ya filtra por contrato activo).
 *  - Los que SUPERVISA o COORDINA sin tener contrato ahí. Mismo criterio que «Mis equipos»: el
 *    responsable se compara con el id de FRAME (`metadata.id`), y la coordinación, con sus ids o su email.
 */
export default function Proyectos() {
  const { profile, loading } = useProfile();
  const { user } = useAuthStore();
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  /** Proyecto completo (con `teamConfig`) de cada tarjeta abierta. `null` = se pidió y falló. */
  const [completos, setCompletos] = useState<Record<string, Project | null>>({});
  /** Tarjetas abiertas. `null` = nadie tocó nada todavía: ahí manda el default (ver `abiertos`). */
  const [abiertosTocados, setAbiertosTocados] = useState<Set<string> | null>(null);
  const pedidos = useRef(new Set<string>());
  // El perfil y el usuario de sesión traen más de lo que declaran sus tipos (`_id`, `metadata.id`, `nombre`).
  const yo: any = user;
  const perfil: any = profile;

  const getProjectDetails = (proj: any) => {
    if (!proj) return null;

    // Quien entra sólo por la app NO tiene permiso para /areas ni /shifts (403),
    // así que allAreas/allShifts suelen venir vacíos. Como fallback resolvemos nombres
    // desde la data que el server SÍ pobla en el proyecto (areasConfig, coordinatorAssignments,
    // y teamConfig si vinieran poblados).
    const areaMap = new Map<string, any>();
    const shiftMap = new Map<string, any>();
    const idOf = (x: any) => (x && typeof x === 'object' ? String(x._id || x.id) : String(x));
    const remember = (obj: any, map: Map<string, any>) => {
      if (obj && typeof obj === 'object' && (obj._id || obj.id)) map.set(idOf(obj), obj);
    };
    (proj.areasConfig || []).forEach((ac: any) => {
      remember(ac.areaId, areaMap);
      (ac.shiftIds || []).forEach((s: any) => remember(s, shiftMap));
    });
    (proj.coordinatorAssignments || []).forEach((ca: any) => {
      remember(ca.areaId, areaMap);
      remember(ca.shiftId, shiftMap);
    });
    (proj.teamConfig || []).forEach((tc: any) => {
      remember(tc.areaId, areaMap);
      remember(tc.shiftId, shiftMap);
      (tc.areaShiftAssignments || []).forEach((asa: any) => {
        remember(asa.areaId, areaMap);
        (asa.shiftIds || []).forEach((s: any) => remember(s, shiftMap));
      });
    });

    const findArea = (id: string) => allAreas.find((a) => String(a._id) === String(id)) || areaMap.get(String(id));
    const findShift = (id: string) => allShifts.find((s) => String(s._id) === String(id)) || shiftMap.get(String(id));

    // Filter contracts to only those that match this project's ID or name
    const matchedContracts =
      proj.contracts?.filter((c: any) => {
        if (!c) return false;

        // Cross-reference project external/metadata ID if available
        const extProjId = proj.externalProjectId || proj.metadata?.id;
        if (extProjId && c.proyecto_id && Number(c.proyecto_id) !== Number(extProjId)) {
          return false;
        }

        // Cross-reference project name
        const projName = proj.nombre_proyecto || proj.name;
        if (projName && c.nombre_proyecto && String(c.nombre_proyecto).toLowerCase() !== String(projName).toLowerCase()) {
          return false;
        }

        return true;
      }) || [];

    // Find active contract or just the first one from the matched contracts
    const activeContract =
      matchedContracts.find((c: any) => {
        const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
        if (endDate) endDate.setHours(23, 59, 59, 999);
        return !endDate || endDate.getTime() >= new Date().getTime();
      }) || matchedContracts[0];

    const isResponsable = Number(proj.metadata?.responsableId) === Number(perfil?.metadata?.id);

    const shiftNames: string[] = [];
    const detailedShifts: any[] = [];

    // Find ALL team configuration entries for this user with robust matching
    const myTeamConfigs =
      proj.teamConfig?.filter((c: any) => {
        const uid = typeof c.userId === 'object' ? c.userId?._id || c.userId?.id || c.userId?.userId || c.userId?.metadata?.id : c.userId;
        const myIdsMatch = [profile?.userId, profile?._id, yo?._id, perfil?.metadata?.id].filter(Boolean).map((id) => String(id));

        let isMatch = uid && myIdsMatch.includes(String(uid));

        // Fallback to Email match
        if (!isMatch) {
          const uEmail = typeof c.userId === 'object' ? c.userId?.email || c.userId?.correo : null;
          const myEmail = yo?.email || profile?.email;
          if (uEmail && myEmail && String(uEmail).toLowerCase() === String(myEmail).toLowerCase()) isMatch = true;
        }

        // Fallback to Name match
        if (!isMatch) {
          const uName = typeof c.userId === 'object' ? (c.userId?.firstName && c.userId?.lastName ? `${c.userId.firstName} ${c.userId.lastName}` : c.userId?.name || c.userId?.nombre) : null;
          const myName = yo?.name || yo?.nombre || `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim();
          if (uName && myName && uName.toLowerCase().includes(myName.toLowerCase())) isMatch = true;
        }

        return isMatch;
      }) || [];

    const coordinatedShiftsGrouped: any[] = [];
    const coordinatedKeys = new Set<string>();

    if (proj.coordinatorAssignments && Array.isArray(proj.coordinatorAssignments)) {
      const grouped = new Map<string, { areaName: string; shifts: { name: string; time: string; order: number }[] }>();

      proj.coordinatorAssignments.forEach((asm: any) => {
        const uid = typeof asm.userId === 'object' ? asm.userId?._id || asm.userId?.id || asm.userId?.userId || asm.userId?.metadata?.id : asm.userId;
        const myIdsMatch = [profile?.userId, profile?._id, yo?._id, perfil?.metadata?.id].filter(Boolean).map((id) => String(id));

        let isMatch = uid && myIdsMatch.includes(String(uid));
        if (!isMatch) {
          const asmEmail = typeof asm.userId === 'object' ? asm.userId?.email || asm.userId?.correo : null;
          const myEmail = yo?.email || profile?.email;
          if (asmEmail && myEmail && String(asmEmail).toLowerCase() === String(myEmail).toLowerCase()) isMatch = true;
        }
        if (!isMatch) {
          const asmName = typeof asm.userId === 'object' ? (asm.userId?.firstName && asm.userId?.lastName ? `${asm.userId.firstName} ${asm.userId.lastName}` : asm.userId?.name || asm.userId?.nombre) : null;
          const myName = yo?.name || yo?.nombre || `${profile?.firstName || ''} ${profile?.lastName || ''}`.trim();
          if (asmName && myName && asmName.toLowerCase().includes(myName.toLowerCase())) isMatch = true;
        }

        if (isMatch) {
          const areaId = typeof asm.areaId === 'object' ? asm.areaId?._id || asm.areaId?.id : asm.areaId;
          const shiftId = typeof asm.shiftId === 'object' ? asm.shiftId?._id || asm.shiftId?.id : asm.shiftId;

          if (areaId && shiftId) {
            coordinatedKeys.add(`${areaId}-${shiftId}`);
          }

          const areaObj = findArea(areaId) || (asm.areaId && typeof asm.areaId === 'object' && (asm.areaId.name || asm.areaId.nombre) ? asm.areaId : null);
          const shiftObj = findShift(shiftId) || (asm.shiftId && typeof asm.shiftId === 'object' && (asm.shiftId.name || asm.shiftId.nombre) ? asm.shiftId : null);

          const aIdStr = String(areaId);
          const areaName = areaObj?.name || areaObj?.nombre || 'Área';
          const shiftName = shiftObj?.name || shiftObj?.nombre || 'Turno';

          if (!grouped.has(aIdStr)) {
            grouped.set(aIdStr, { areaName, shifts: [] });
          }

          const shifts = grouped.get(aIdStr)!.shifts;
          if (!shifts.some((s) => s.name === shiftName)) {
            shifts.push({
              name: shiftName,
              time: shiftObj?.startTime && shiftObj?.endTime ? `${shiftObj.startTime} - ${shiftObj.endTime}` : shiftObj?.hora_inicio && shiftObj?.hora_fin ? `${shiftObj.hora_inicio} - ${shiftObj.hora_fin}` : 'Sin horario',
              order: Number(shiftObj?.order) || 0,
            });
          }
        }
      });

      Array.from(grouped.entries()).forEach(([aId, data]) => {
        data.shifts.sort((a, b) => a.order - b.order);
        coordinatedShiftsGrouped.push({ areaId: aId, ...data });
      });
    }

    // Collect all assignments from all matching team configs AND the active contract
    let allStandardAssignments: any[] = [];
    myTeamConfigs.forEach((tc: any) => {
      if (tc.areaShiftAssignments && Array.isArray(tc.areaShiftAssignments)) {
        allStandardAssignments = [...allStandardAssignments, ...tc.areaShiftAssignments];
      }
    });
    if (activeContract?.areaShiftAssignments && Array.isArray(activeContract.areaShiftAssignments)) {
      allStandardAssignments = [...allStandardAssignments, ...activeContract.areaShiftAssignments];
    }

    // Process and deduplicate standard assignments, excluding coordinated ones
    if (allStandardAssignments.length > 0) {
      const seenAssignments = new Set<string>();

      allStandardAssignments.forEach((asa: any) => {
        const aId = typeof asa.areaId === 'object' ? asa.areaId?._id || asa.areaId?.id : asa.areaId;
        const areaObj = findArea(aId);
        const areaName = areaObj?.name || areaObj?.nombre || asa.nombre_area || asa.areaName || 'Área';

        const processShift = (s: any) => {
          const shiftId = typeof s === 'object' ? s._id || s.id : s;
          const fullShift = findShift(shiftId);
          const name = fullShift?.name || fullShift?.nombre || s.name || s.nombre || (typeof s === 'string' ? s : 'Turno');

          const uniqueKey = `${areaName}-${name}`.toLowerCase();

          if (seenAssignments.has(uniqueKey)) return;

          seenAssignments.add(uniqueKey);

          detailedShifts.push({
            name,
            time: fullShift?.startTime && fullShift?.endTime ? `${fullShift.startTime} - ${fullShift.endTime}` : fullShift?.hora_inicio && fullShift?.hora_fin ? `${fullShift.hora_inicio} - ${fullShift.hora_fin}` : s.hora_inicio && s.hora_fin ? `${s.hora_inicio} - ${s.hora_fin}` : s.startTime && s.endTime ? `${s.startTime} - ${s.endTime}` : 'Sin horario',
            area: areaName,
            order: Number(fullShift?.order || s.order || 0),
          });
          shiftNames.push(name);
        };

        if (asa.shiftIds && Array.isArray(asa.shiftIds)) {
          asa.shiftIds.forEach(processShift);
        } else if (asa.shiftId) {
          processShift(asa.shiftId);
        } else if (asa.shifts && Array.isArray(asa.shifts)) {
          asa.shifts.forEach(processShift);
        }
      });
    }

    // Sort standard detailedShifts list by order
    detailedShifts.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Fallback: if no standard shifts found but coordinator assignments exist,
    // use coordinator assignments as the standard area/turno display
    if (detailedShifts.length === 0 && coordinatedShiftsGrouped.length > 0) {
      coordinatedShiftsGrouped.forEach((group: any) => {
        group.shifts.forEach((s: any) => {
          detailedShifts.push({
            name: s.name,
            time: s.time,
            area: group.areaName,
            order: s.order || 0,
          });
          shiftNames.push(s.name);
        });
      });
    }

    const uniqueShiftNames = Array.from(new Set(shiftNames)).join(', ');

    return {
      name: proj.nombre_proyecto || proj.name || 'Sin nombre',
      // Un proyecto que sólo supervisa no tiene UserProject: el cliente sale del proyecto mismo.
      client: proj.nombre_cliente || proj.clientId?.name || 'Sin cliente',
      sede: activeContract?.nombre_sede || 'Sin sede',
      roleFrame: proj.nombre_rol_frame && proj.nombre_rol_frame !== 'Sin rol frame' ? proj.nombre_rol_frame : activeContract?.nombre_rol_frame && activeContract.nombre_rol_frame !== 'Sin rol frame' ? activeContract.nombre_rol_frame : 'Sin rol frame',
      area: activeContract?.nombre_area || proj.nombre_area || 'Sin área',
      schedule: activeContract?.hora_inicio && activeContract?.hora_fin ? `${activeContract.hora_inicio} - ${activeContract.hora_fin}` : 'Sin horario',
      isResponsable,
      contractType: activeContract?.nombre_contrato || 'Sin contrato',
      dates: activeContract?.fecha_alta_contrato ? `${format(new Date(activeContract.fecha_alta_contrato), 'dd/MM/yy')} - ${activeContract.fecha_baja_contrato ? format(new Date(activeContract.fecha_baja_contrato), 'dd/MM/yy') : 'Actualidad'}` : 'Sin fechas',
      shiftsText: uniqueShiftNames || activeContract?.nombre_turno || 'Sin turno',
      detailedShifts,
      coordinatedShifts: coordinatedShiftsGrouped,
    };
  };

  useEffect(() => {
    let cancelado = false;
    // Cada pedido con su catch: quien entra sólo por la app recibe 403 en /areas y /shifts, y con un
    // `Promise.all` pelado ese 403 se llevaba puesta también la lista de proyectos.
    Promise.all([projectsAPI.listAll().catch(() => [] as Project[]), areasAPI.listAll().catch(() => [] as Area[]), shiftsAPI.getAll().catch(() => [] as Shift[])])
      .then(([projects, areas, shifts]) => {
        if (cancelado) return;
        setAllProjects(projects);
        setAllAreas(areas);
        setAllShifts(shifts);
      })
      .finally(() => {
        if (!cancelado) setIsLoadingProjects(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  /** Los proyectos de la persona: con contrato, más los que supervisa o coordina sin tenerlo. */
  const entradas = useMemo<Entrada[]>(() => {
    const lista: Entrada[] = [];
    const conContrato = new Set<string>();
    for (const up of profile?.metadata?.projects || []) {
      // OJO: metadata.projects[] son docs UserProject → el id del proyecto está en `projectId`, no en `_id`.
      const pid = idDe(up?.projectId) || idDe(up?._id);
      if (!pid) continue;
      lista.push({ clave: idDe(up?._id) || pid, pid, resumen: up });
      conContrato.add(pid);
    }

    const misIds = new Set([yo?._id, yo?.id, profile?.userId, profile?._id].filter(Boolean).map(String));
    const miEmail = String(yo?.email || profile?.email || '').toLowerCase();
    const miIdFrame = perfil?.metadata?.id ?? yo?.metadata?.id;
    for (const p of allProjects) {
      const pid = String(p._id);
      if (conContrato.has(pid)) continue;
      const supervisa = miIdFrame != null && p.metadata?.responsableId != null && String(p.metadata.responsableId) === String(miIdFrame);
      const coordina = (p.coordinatorAssignments || []).some((a: any) => misIds.has(idDe(a.userId)) || (!!miEmail && String(a.userId?.email || '').toLowerCase() === miEmail));
      if (supervisa || coordina) lista.push({ clave: pid, pid, resumen: null });
    }
    return lista;
  }, [profile, user, allProjects]);

  const proyectoPorId = useMemo(() => new Map(allProjects.map((p) => [String(p._id), p])), [allProjects]);

  const tarjetas = useMemo(
    () =>
      entradas
        .map((e) => {
          const base: any = completos[e.pid] || proyectoPorId.get(e.pid) || {};
          const resumen = e.resumen || {};
          const info = getProjectDetails({
            ...base,
            ...resumen,
            teamConfig: base.teamConfig || resumen.teamConfig,
            coordinatorAssignments: base.coordinatorAssignments || resumen.coordinatorAssignments,
          })!;
          return { ...e, info };
        })
        .sort((a, b) => a.info.name.localeCompare(b.info.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entradas, completos, proyectoPorId, profile, allAreas, allShifts],
  );

  // Con un solo proyecto no hay nada que elegir: arranca abierto. Con varios, cerrados, para verlos todos.
  const abiertos: Set<string> = abiertosTocados ?? new Set(tarjetas.length === 1 ? [tarjetas[0].clave] : []);
  const alternar = (clave: string) => {
    const next = new Set(abiertos);
    if (next.has(clave)) next.delete(clave);
    else next.add(clave);
    setAbiertosTocados(next);
  };

  /*
    El proyecto COMPLETO se pide recién al abrir su tarjeta, y una sola vez. El listado no trae
    `teamConfig` —de ahí salen las áreas y turnos del equipo—, y pedir el de cada proyecto al entrar
    serían N consultas para tarjetas que quizás nadie abre.
  */
  const clavesAbiertas = [...abiertos].sort().join('|');
  useEffect(() => {
    for (const t of tarjetas) {
      if (!abiertos.has(t.clave) || pedidos.current.has(t.pid)) continue;
      pedidos.current.add(t.pid);
      // `team: "ids"`: acá sólo se usan teamConfig y coordinatorAssignments; el equipo poblado con
      // sus contratos pesaba MB y cortaba por timeout en proyectos grandes (ver ActivityLogs).
      projectsAPI
        .getProject(t.pid, { team: 'ids' })
        .then((p) => setCompletos((prev) => ({ ...prev, [t.pid]: p })))
        .catch((err) => {
          console.error('Error fetching full project details:', err);
          setCompletos((prev) => ({ ...prev, [t.pid]: null }));
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clavesAbiertas, tarjetas]);

  const encabezado = (
    <SectionHeader
      icon={faBriefcase}
      titulo="Proyectos"
      info={"Los proyectos en los que estás: los que tenés con contrato y los que supervisás o coordinás.\n\nTocá uno para ver sede, contrato, vigencia, horario y las áreas y turnos que tenés asignados o coordinás."}
    />
  );

  if (loading || isLoadingProjects)
    return (
      <div className="flex-1 pb-24">
        {encabezado}
        <div className="px-4 pt-4 space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900/70" />
          ))}
        </div>
      </div>
    );

  return (
    <div className="flex-1 pb-24">
      {encabezado}
      <div className="px-4 pt-4 space-y-3">
        {tarjetas.length === 0 ? (
          <div className="bg-white dark:bg-slate-900/70 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 py-10 text-center space-y-3">
            <FontAwesomeIcon icon={faBriefcase} className="text-slate-200 dark:text-slate-800 text-2xl" />
            <p className="text-[10px] text-slate-400 italic font-medium">Sin proyectos asignados</p>
          </div>
        ) : (
          tarjetas.map((t) => {
            const { info } = t;
            const abierto = abiertos.has(t.clave);
            const tieneContrato = !!t.resumen;
            const coordina = info.coordinatedShifts.length > 0;
            const cargandoTurnos = abierto && !(t.pid in completos) && info.detailedShifts.length === 0;

            return (
              <div key={t.clave} className="bg-white dark:bg-slate-900/70 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
                <button type="button" onClick={() => alternar(t.clave)} aria-expanded={abierto} className="w-full text-left p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-black text-primary uppercase tracking-widest truncate">{info.client}</p>
                    <p className="text-base font-black text-slate-900 dark:text-slate-100 leading-tight mt-0.5">{info.name}</p>
                    {/*
                      Qué es la persona EN ESTE proyecto. Los roles generales de la cuenta («Supervisor»,
                      «Coordinador») se mostraban acá cuando había un solo proyecto a la vista; en una lista
                      se repetirían en todas las tarjetas, también donde no aplican.
                    */}
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {info.isResponsable && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500 text-white text-[8px] font-black uppercase tracking-wider shadow-sm">
                          <FontAwesomeIcon icon={faUserShield} size="xs" />
                          Supervisor del proyecto
                        </span>
                      )}
                      {coordina && !info.isResponsable && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20 text-[8px] font-black uppercase tracking-wider">
                          <FontAwesomeIcon icon={faUserTie} size="xs" />
                          Coordinador
                        </span>
                      )}
                      {tieneContrato && !info.isResponsable && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[8px] font-black uppercase tracking-wider">
                          <FontAwesomeIcon icon={faUsers} size="xs" />
                          Equipo de proyecto
                        </span>
                      )}
                    </div>
                    {!abierto && tieneContrato && (
                      <p className="mt-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                        {info.contractType} · {info.dates}
                      </p>
                    )}
                  </div>
                  <FontAwesomeIcon icon={abierto ? faChevronDown : faChevronRight} className="mt-1 text-xs text-slate-400" />
                </button>

                {abierto && (
                  <div className="px-4 pb-4 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {tieneContrato ? (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-50/50 dark:bg-slate-800/30 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                            <p className="text-[8px] font-black text-slate-400 uppercase flex items-center gap-1.5 tracking-widest mb-1">
                              <FontAwesomeIcon icon={faBuilding} className="text-slate-300" /> Sede
                            </p>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{info.sede}</p>
                          </div>
                          <div className="bg-slate-50/50 dark:bg-slate-800/30 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                            <p className="text-[8px] font-black text-slate-400 uppercase flex items-center gap-1.5 tracking-widest mb-1">
                              <FontAwesomeIcon icon={faIdCard} className="text-slate-300" /> Rol Frame
                            </p>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{info.roleFrame}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Contrato</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 text-right">{info.contractType}</p>
                          </div>
                          <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Vigencia</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 text-right">{info.dates}</p>
                          </div>
                          <div className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Horario</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 text-right">{info.schedule}</p>
                          </div>
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">No tenés contrato en este proyecto: aparece porque lo {info.isResponsable ? 'supervisás' : 'coordinás'}.</p>
                    )}

                    {/* Área / turno propios. Sin contrato y sin turnos no hay nada que decir: se omite. */}
                    {(tieneContrato || info.detailedShifts.length > 0) && (
                      <div className="space-y-2">
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest text-center">Area / Turno</p>
                        {info.detailedShifts.length > 0 ? (
                          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                            <div className="space-y-3">
                              {(() => {
                                const grouped = new Map<string, { areaName: string; shifts: any[] }>();
                                info.detailedShifts.forEach((s: any) => {
                                  if (!grouped.has(s.area)) grouped.set(s.area, { areaName: s.area, shifts: [] });
                                  grouped.get(s.area)!.shifts.push(s);
                                });
                                return Array.from(grouped.values()).map((group, gidx) => (
                                  <div key={gidx} className="space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-[9px] bg-blue-500/15 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 flex items-center gap-1 font-black uppercase tracking-widest">
                                        <FontAwesomeIcon icon={faLayerGroup} className="text-[8px]" />
                                        {group.areaName}
                                      </span>
                                      {group.shifts.map((s, sidx) => (
                                        <span key={sidx} className="text-[9px] bg-blue-500/10 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-500/15 flex items-center gap-1 font-bold uppercase">
                                          <FontAwesomeIcon icon={faClock} className="text-[8px] opacity-70" />
                                          {s.name}
                                          {s.time && s.time !== 'Sin horario' ? ` (${s.time})` : ''}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>
                        ) : (
                          <div className="p-3 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 text-center">
                            <p className="text-[10px] text-slate-400 italic font-medium">{cargandoTurnos ? 'Cargando áreas y turnos…' : 'Sin turnos asignados'}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {coordina && (
                      <div className="space-y-2">
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest text-center">Area / Turno Coordinada</p>
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
                          <div className="space-y-3">
                            {info.coordinatedShifts.map((group: any, gidx: number) => (
                              <div key={gidx} className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[9px] bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-500/20 flex items-center gap-1 font-black uppercase tracking-widest">
                                    <FontAwesomeIcon icon={faLayerGroup} className="text-[8px]" />
                                    {group.areaName}
                                  </span>
                                  {group.shifts.map((s: any, sidx: number) => (
                                    <span key={sidx} className="text-[9px] bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-500/15 flex items-center gap-1 font-bold uppercase">
                                      <FontAwesomeIcon icon={faClock} className="text-[8px] opacity-70" />
                                      {s.name}
                                      {s.time && s.time !== 'Sin horario' ? ` (${s.time})` : ''}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

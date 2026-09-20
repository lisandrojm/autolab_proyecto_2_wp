import { useState, useEffect, useMemo, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBriefcase, faBuilding, faIdCard, faClock, faLayerGroup, faChevronRight, faSearch, faUserShield, faUserTie, faUsers } from '@fortawesome/free-solid-svg-icons';
import { useAuthStore } from '../../../../stores/authStore';
import { useProfile } from '../hooks/useProfile';
import { format } from 'date-fns';
import { projectsAPI, Project } from '../../../../api/projects';
import { areasAPI, Area } from '../../../../api/areas';
import { shiftsAPI, Shift } from '../../../../api/shifts';
import SectionHeader from '../components/SectionHeader';
import { ViewType } from '../types';
import ProyectoInfoModal from '../components/ProyectoInfoModal';
import { etiquetaDeTurno } from '../../../../utils/jerarquiaTurnos';

/** Id de algo que puede venir poblado (objeto) o pelado (string). */
const idDe = (x: any): string => (x && typeof x === 'object' ? String(x._id || x.id || '') : x ? String(x) : '');

/** Un proyecto de la lista. `resumen` es el UserProject (su contrato) si lo tiene; si no, está por supervisarlo o coordinarlo. */
interface Entrada {
  clave: string;
  pid: string;
  resumen: any | null;
}

/**
 * PROYECTOS: TODOS LOS QUE LA PERSONA PUEDE VER, Y LA FICHA DE CADA UNO.
 *
 * Empezó siendo «Asignación», que mostraba UN proyecto con un desplegable para cambiar de uno a otro;
 * después fue la lista de los propios, cada tarjeta desplegable con lo que la persona tenía ahí. Hoy
 * es la lista COMPLETA —los que el server deja ver, ver `entradas`— y cada una abre la ficha entera
 * del proyecto: cliente, coordinador, sede, centro de costo, empresas y todas sus áreas y turnos.
 *
 * La ficha es la misma que abre «Mis equipos» (`ProyectoInfoModal`), con un bloque más adelante: lo
 * que la persona tiene EN ESE proyecto, que es lo que antes se desplegaba en la tarjeta.
 */
/**
 * `onNavigate` es para el VOLVER del encabezado.
 *
 * Esta vista se abre desde la barra de abajo, así que técnicamente no se «entra» desde ningún lado.
 * Pero el resto de las secciones tienen su flecha arriba a la izquierda, y no tenerla acá hace que
 * la pantalla parezca a medio hacer: se vuelve al inicio, que es lo que se espera.
 */
export default function Proyectos({ onNavigate }: { onNavigate?: (view: ViewType) => void }) {
  const { profile, loading } = useProfile();
  const { user } = useAuthStore();
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [allAreas, setAllAreas] = useState<Area[]>([]);
  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  /** Proyecto completo (con `teamConfig` y `areasConfig`) de cada ficha abierta. `null` = se pidió y falló. */
  const [completos, setCompletos] = useState<Record<string, Project | null>>({});
  /** De qué proyecto está abierta la ficha. */
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
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

  /**
   * TODOS LOS PROYECTOS, no sólo los de la persona.
   *
   * Antes la lista se armaba al revés: se partía de los contratos del perfil y se le sumaban los
   * proyectos que supervisa o coordina. Quien quería mirar la ficha de cualquier otro —de qué cliente
   * es, qué centro de costo tiene, en qué sede— no tenía dónde.
   *
   * QUÉ ES «TODOS»: los que el server devuelve en `GET /projects`, que ya aplica la visibilidad de la
   * plataforma —un admin ve todos; el resto, los que tiene asignados más los que tiene a cargo como
   * responsable (ver `alcanceDeResponsable` en el server)—. La app no agrega ni saca nada: mostrar
   * más que eso no depende de esta pantalla, y filtrar de nuevo acá era esconder lo que ya llegó.
   *
   * El contrato propio (`resumen`) se pega al proyecto que le corresponde. Una tarjeta por PROYECTO:
   * antes era una por contrato, y quien tenía dos en el mismo proyecto lo veía repetido.
   */
  const entradas = useMemo<Entrada[]>(() => {
    const porProyecto = new Map<string, Entrada>();
    for (const p of allProjects) {
      const pid = String(p._id);
      porProyecto.set(pid, { clave: pid, pid, resumen: null });
    }
    for (const up of profile?.metadata?.projects || []) {
      // OJO: metadata.projects[] son docs UserProject → el id del proyecto está en `projectId`, no en `_id`.
      const pid = idDe(up?.projectId) || idDe(up?._id);
      if (!pid) continue;
      const entrada = porProyecto.get(pid);
      // Un contrato en un proyecto que el listado no trajo igual se muestra: es trabajo de la persona.
      if (entrada) entrada.resumen = entrada.resumen || up;
      else porProyecto.set(pid, { clave: pid, pid, resumen: up });
    }
    return [...porProyecto.values()];
  }, [profile, allProjects]);

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

  /*
    EL BUSCADOR: aparece cuando la lista deja de entrar en la cabeza.

    Con los proyectos propios eran dos o tres y se elegía mirando; con todos los del tenant pueden ser
    cien, y scrollear cien tarjetas en un teléfono para llegar a una no es elegir, es buscar a mano.
  */
  const [busqueda, setBusqueda] = useState('');
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return tarjetas;
    return tarjetas.filter((t) => `${t.info.name} ${t.info.client}`.toLowerCase().includes(q));
  }, [tarjetas, busqueda]);

  /*
    La ficha COMPLETA se pide al abrir el proyecto, y una sola vez por proyecto.

    El listado no trae `teamConfig` —de ahí salen el área y el turno propios— y pedir el de cada
    proyecto al entrar serían tantas consultas como proyectos, para fichas que quizás nadie abre.
    `team: "ids"`: el equipo poblado con sus contratos pesa MB y corta por timeout en proyectos
    grandes (ver ActivityLogs).
  */
  useEffect(() => {
    if (!seleccionado || pedidos.current.has(seleccionado)) return;
    pedidos.current.add(seleccionado);
    projectsAPI
      .getProject(seleccionado, { team: 'ids' })
      .then((p) => setCompletos((prev) => ({ ...prev, [seleccionado]: p })))
      .catch((err) => {
        console.error('Error fetching full project details:', err);
        setCompletos((prev) => ({ ...prev, [seleccionado]: null }));
      });
  }, [seleccionado]);

  const tarjetaAbierta = visibles.find((t) => t.pid === seleccionado) || tarjetas.find((t) => t.pid === seleccionado) || null;
  const proyectoAbierto: any = seleccionado ? completos[seleccionado] || proyectoPorId.get(seleccionado) || null : null;

  /** El coordinador del proyecto, ya resuelto por el listado: no hace falta otra consulta. */
  const responsableAbierto = useMemo(() => {
    const resp: any = proyectoAbierto?.metadataResolutions?.responsable;
    return resp ? resp.name || `${resp.firstName || ''} ${resp.lastName || ''}`.trim() : '';
  }, [proyectoAbierto]);

  /** Para la ficha: TODAS las áreas del proyecto con sus turnos, no sólo las de la persona. */
  const areasDelAbierto = useMemo(() => {
    if (!proyectoAbierto) return [] as { nombre: string; turnos: string[] }[];
    const nombreArea = new Map(allAreas.map((a) => [String(a._id), a.name]));
    const turnoPorId = new Map(allShifts.map((s) => [String(s._id), s]));
    return ((proyectoAbierto.areasConfig || []) as any[])
      .map((ac: any) => ({
        nombre: (typeof ac.areaId === 'object' && ac.areaId?.name) || nombreArea.get(idDe(ac.areaId)) || 'Área',
        turnos: (ac.shiftIds || []).map((s: any) => etiquetaDeTurno((typeof s === 'object' && s?.name) || turnoPorId.get(idDe(s))?.name || 'Turno')),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [proyectoAbierto, allAreas, allShifts]);

  /** Área y turno, en chips, como se veían en la tarjeta abierta. */
  const chipsDeAreas = (grupos: { areaName: string; shifts: any[] }[], color: 'blue' | 'amber') => (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/30 border border-slate-100 dark:border-slate-800">
      <div className="space-y-3">
        {grupos.map((group, gidx) => (
          <div key={gidx} className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[9px] px-2 py-0.5 rounded border flex items-center gap-1 font-black uppercase tracking-widest ${color === 'blue' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20' : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20'}`}>
              <FontAwesomeIcon icon={faLayerGroup} className="text-[8px]" />
              {group.areaName}
            </span>
            {group.shifts.map((s: any, sidx: number) => (
              <span key={sidx} className={`text-[9px] px-2 py-0.5 rounded border flex items-center gap-1 font-bold uppercase ${color === 'blue' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/15' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/15'}`}>
                <FontAwesomeIcon icon={faClock} className="text-[8px] opacity-70" />
                {s.name}
                {s.time && s.time !== 'Sin horario' ? ` (${s.time})` : ''}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  /**
   * LO QUE LA PERSONA TIENE EN ESE PROYECTO, arriba de la ficha.
   *
   * Es lo que antes mostraba la tarjeta al desplegarse. En un proyecto donde no tiene nada —ahora la
   * lista los trae todos— no se dibuja: una ficha con «Sin turnos asignados» repetido no dice nada.
   */
  const bloqueAsignacion = () => {
    const t = tarjetaAbierta;
    if (!t) return undefined;
    const info = t.info;
    const tieneContrato = !!t.resumen;
    const propios = new Map<string, { areaName: string; shifts: any[] }>();
    info.detailedShifts.forEach((s: any) => {
      if (!propios.has(s.area)) propios.set(s.area, { areaName: s.area, shifts: [] });
      propios.get(s.area)!.shifts.push(s);
    });
    const coordina = info.coordinatedShifts.length > 0;
    if (!tieneContrato && !coordina && propios.size === 0) return undefined;

    return (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/40">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tu asignación</p>

        {tieneContrato ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-slate-100 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-900/40">
                <p className="mb-1 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-slate-400">
                  <FontAwesomeIcon icon={faBuilding} className="text-slate-300" /> Sede
                </p>
                <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">{info.sede}</p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-900/40">
                <p className="mb-1 flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-slate-400">
                  <FontAwesomeIcon icon={faIdCard} className="text-slate-300" /> Rol Frame
                </p>
                <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">{info.roleFrame}</p>
              </div>
            </div>

            <div className="space-y-2">
              {[
                { label: 'Contrato', valor: info.contractType },
                { label: 'Vigencia', valor: info.dates },
                { label: 'Horario', valor: info.schedule },
              ].map((f) => (
                <div key={f.label} className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
                  <p className="text-[9px] font-black uppercase tracking-tighter text-slate-400">{f.label}</p>
                  <p className="text-right text-xs font-bold text-slate-700 dark:text-slate-300">{f.valor}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] italic text-slate-500 dark:text-slate-400">No tenés contrato en este proyecto: aparece acá porque lo {info.isResponsable ? 'coordinás' : 'supervisás'}.</p>
        )}

        {propios.size > 0 && (
          <div className="space-y-2">
            <p className="text-center text-[9px] font-black uppercase tracking-widest text-slate-300">Área / Turno</p>
            {chipsDeAreas([...propios.values()], 'blue')}
          </div>
        )}

        {coordina && (
          <div className="space-y-2">
            <p className="text-center text-[9px] font-black uppercase tracking-widest text-slate-300">Área / Turno supervisada</p>
            {chipsDeAreas(info.coordinatedShifts, 'amber')}
          </div>
        )}
      </div>
    );
  };

  const encabezado = (
    <SectionHeader
      icon={faBriefcase}
      titulo="Proyectos"
      onBack={onNavigate ? () => onNavigate("home") : undefined}
      info={'Todos los proyectos a los que tenés acceso, no sólo en los que trabajás.\n\nTocá uno para ver su ficha completa: cliente, coordinador, sede, centro de costo, fecha de alta, empresas del contrato y del release, y todas sus áreas con sus turnos.\n\nEn los que tenés contrato o supervisás, la ficha arranca con lo tuyo: contrato, vigencia, horario y tu área y turno.'}
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
        {tarjetas.length > 6 && (
          <div className="relative">
            <FontAwesomeIcon icon={faSearch} className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por proyecto o cliente…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
        )}

        {visibles.length === 0 ? (
          <div className="bg-white dark:bg-slate-900/70 rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 py-10 text-center space-y-3">
            <FontAwesomeIcon icon={faBriefcase} className="text-slate-200 dark:text-slate-800 text-2xl" />
            <p className="text-[10px] text-slate-400 italic font-medium">{busqueda.trim() ? 'Ningún proyecto coincide con la búsqueda' : 'Sin proyectos para mostrar'}</p>
          </div>
        ) : (
          visibles.map((t) => {
            const { info } = t;
            const tieneContrato = !!t.resumen;
            const coordina = info.coordinatedShifts.length > 0;

            return (
              <button
                key={t.clave}
                type="button"
                onClick={() => setSeleccionado(t.pid)}
                className="flex w-full items-start gap-3 rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm transition-colors active:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70 dark:active:bg-slate-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[8px] font-black uppercase tracking-widest text-primary">{info.client}</p>
                  <p className="mt-0.5 text-base font-black leading-tight text-slate-900 dark:text-slate-100">{info.name}</p>
                  {/*
                    Qué es la persona EN ESTE proyecto. Los roles generales de la cuenta («Supervisor»,
                    «Coordinador») se mostraban acá cuando había un solo proyecto a la vista; en una lista
                    se repetirían en todas las tarjetas, también donde no aplican.
                  */}
                  {(info.isResponsable || coordina || tieneContrato) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {info.isResponsable && (
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-white shadow-sm">
                          <FontAwesomeIcon icon={faUserShield} size="xs" />
                          Coordinador del proyecto
                        </span>
                      )}
                      {coordina && !info.isResponsable && (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-300">
                          <FontAwesomeIcon icon={faUserTie} size="xs" />
                          Supervisor
                        </span>
                      )}
                      {tieneContrato && !info.isResponsable && (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                          <FontAwesomeIcon icon={faUsers} size="xs" />
                          Equipo de proyecto
                        </span>
                      )}
                    </div>
                  )}
                  {tieneContrato && (
                    <p className="mt-2 truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      {info.contractType} · {info.dates}
                    </p>
                  )}
                </div>
                <FontAwesomeIcon icon={faChevronRight} className="mt-1 text-xs text-slate-400" />
              </button>
            );
          })
        )}
      </div>

      {/* La ficha entera del proyecto, la misma que abre «Mis equipos». */}
      <ProyectoInfoModal isOpen={!!seleccionado} onClose={() => setSeleccionado(null)} proyecto={proyectoAbierto} supervisorNombre={responsableAbierto} areas={areasDelAbierto} asignacion={bloqueAsignacion()} />
    </div>
  );
}

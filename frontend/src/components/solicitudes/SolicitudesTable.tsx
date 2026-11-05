import React, { useEffect, useMemo, useState } from "react";
import { TablaConEncabezadoFijo } from "../ui/TablaConEncabezadoFijo";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faClock, faRotateLeft, faTrash, faCommentDots, faEdit, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { roleFrameAPI, RoleFrameItem } from "../../api/roleFrames";
import { categoriaSatAPI, CategoriaSatItem } from "../../api/categoriasSat";
import { infoAPI, InfoItem } from "../../api/info";
import { contratosAPI, ContratoItem } from "../../api/contratos";
import type { ObraSocialDeSolicitud, ResultadoEliminarSolicitud } from "../../api/users";
import { EstadoBadge } from "../EstadoSelect";
import { estadoImpositivoPorTipo, esTipoImpositivo } from "../../utils/tramiteImpositivo";
import { NombreArca, estadoNombreArca } from "../arca/NombreArca";
import { FechaHoraCelda } from "../ui/FechaHoraCelda";
import { isContractVigente, formatDate } from "../team/ContractCard";

/*
 * LA TABLA DE SOLICITUDES, UNA SOLA, PARA LOS DOS LUGARES DONDE SE MIRAN.
 *
 * La pestaña Solicitudes de un proyecto y la pantalla global de Solicitudes muestran lo mismo: qué
 * se pidió, para cuándo y en qué estado quedó. Lo único que cambia es de dónde salen las filas (las
 * de un proyecto contra todas) y si hacen falta las columnas Cliente y Proyecto.
 *
 * Vive acá porque la parte difícil no es la tabla, es resolver los datos: el rol frame viene en tres
 * formas distintas según quién creó la solicitud, el trámite impositivo se resuelve contra
 * catálogos que hay que cargar, y los estados tienen su propio ciclo. Duplicar eso es
 * garantizar que las dos pantallas se contesten distinto.
 */

export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada" | "cancelada";

/** Cómo se muestra cada estado de una solicitud. Una rechazada NO desaparece: queda listada así. */
export const ESTADO_SOLICITUD: Record<EstadoSolicitud, { texto: string; clase: string; icono: typeof faClock }> = {
  pendiente: { texto: "PENDIENTE", clase: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icono: faClock },
  aprobada: { texto: "APROBADA", clase: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icono: faCheck },
  rechazada: { texto: "RECHAZADA", clase: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icono: faTimes },
  cancelada: { texto: "CANCELADA", clase: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300", icono: faTimes },
};

export const ESTADOS_SOLICITUD: EstadoSolicitud[] = ["pendiente", "aprobada", "rechazada", "cancelada"];

/** Proyecto para el que se pidió el alta, con su cliente ya resuelto. */
export interface ProyectoDeSolicitud {
  _id: string;
  name: string;
  clienteNombre?: string;
  /** El centro de costo del proyecto, ya como etiqueta (código de Tango). */
  centroCosto?: string;
}

/**
 * La forma normalizada de una solicitud para esta tabla.
 *
 * Las dos pantallas traen los datos por caminos distintos —la del proyecto pide `User`s completos y
 * la global pide `solicitudes-overview`—, así que cada una adapta lo suyo a esto y la tabla no se
 * entera de la diferencia.
 */
export interface SolicitudVista {
  /** Quién la cargó, con sus roles (sólo los de coordinación o supervisión se muestran). */
  solicitante?: { nombre: string; roles: string[] } | null;
  _id: string;
  nombre: string;
  email?: string;
  estado: EstadoSolicitud;
  creadaEl?: string;
  proyectos?: ProyectoDeSolicitud[];
  /** Las tres formas en que puede venir el rol frame; `resolverRolFrame` se encarga. */
  roleFrameId?: any;
  rolesFrameIds?: any[] | null;
  roles_frame?: any[] | null;
  /** Usuario real al que corresponde, si la solicitud es para alguien que ya existe. */
  solicitudUserId?: string | null;
  categoriaSatId?: string | null;
  tipoImpositivo?: string | null;
  /** El tipo de contrato pedido (`Contrato._id`) y el nombre que tenía al pedirlo, por si ya no existe. */
  contratoId?: string | null;
  nombreContrato?: string | null;
  startDate?: string | null;
  dueDate?: string | null;
  schedule?: string | null;
  dailyRate?: number | null;
  comentarios?: string | null;
  /** Renueva un contrato por vencer: etiqueta «Renovación». */
  esRenovacion?: boolean;
  /** Por qué se rechazó. Se muestra en la fila: es lo que hay que corregir para volver a pedirla. */
  motivoRechazo?: string | null;
  /**
   * SE RECHAZÓ, SE CORRIGIÓ Y VOLVIÓ. Cuántas veces y qué se había objetado la última.
   *
   * Esta solicitud no es nueva: vuelve a la bandeja porque alguien arregló lo que se le marcó. Sin
   * decirlo se lee igual que cualquier otra pendiente, y quien la había rechazado no tiene cómo
   * saber que es la suya ni si lo que objetó está corregido.
   */
  reenviada?: { veces?: number; el?: string; motivoAnterior?: string } | null;
  /** Para «Validar en ARCA»: el nombre se valida por CUIT; la obra social, contra la empleadora. */
  personaId?: string;
  cuit?: string | null;
  sinCuit?: boolean;
  nombreValidadoArcaAt?: string | null;
  empresaContratoId?: string | null;
  obraSocial?: ObraSocialDeSolicitud | null;
  /** El último contrato de la persona, en cualquier proyecto. null = no tiene (alguien nuevo). */
  ultimoContrato?: { alta: string; baja: string | null; nombre: string; proyecto: string } | null;
  /** Con qué se superpone lo pedido (contratos en cualquier proyecto u otras solicitudes), la foto del server. */
  superposiciones?: Array<{ tipo: "horario" | "fechas"; mensaje: string }>;
}

/** Roles del solicitante que se muestran como badge en la columna «Solicitó». */
export const ROL_QUE_SOLICITA = /coordinador|supervisor/i;

/** Adapta un `User` con `metadata.isSolicitud` a la forma de la tabla. */
export const solicitudDesdeUser = (u: any): SolicitudVista => {
  const m = u?.metadata || {};
  return {
    _id: String(u._id),
    solicitante: u.solicitante ?? null,
    nombre: m.fullName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email,
    email: u.email,
    estado: (m.solicitudStatus || "pendiente") as EstadoSolicitud,
    creadaEl: u.createdAt,
    roleFrameId: m.roleFrameId,
    rolesFrameIds: m.rolesFrameIds,
    roles_frame: m.roles_frame,
    categoriaSatId: m.categoriaSatId ?? null,
    tipoImpositivo: m.tipoImpositivo ?? null,
    contratoId: m.contratoId ? String(m.contratoId) : null,
    nombreContrato: m.nombre_contrato ?? null,
    startDate: m.startDate ?? null,
    dueDate: m.dueDate ?? null,
    schedule: m.schedule ?? null,
    dailyRate: m.dailyRate ?? null,
    comentarios: m.comentarios ?? null,
    solicitudUserId: m.solicitudUserId ? String(m.solicitudUserId) : null,
    motivoRechazo: m.solicitudMotivoRechazo ?? null,
    reenviada: m.solicitudReenviada?.el ? m.solicitudReenviada : null,
    esRenovacion: !!m.esRenovacion,
    superposiciones: Array.isArray(m.avisosSuperposicion) ? m.avisosSuperposicion.map((a: any) => ({ tipo: a?.tipo === "horario" ? "horario" : "fechas", mensaje: String(a?.mensaje || "") })) : [],
  };
};

/**
 * Los catálogos con los que se resuelven las columnas, cargados una vez por pantalla.
 *
 * Se resuelve contra el ABM en vez de guardar los nombres en la solicitud: así las columnas siguen
 * el nombre y el color que tenga el catálogo HOY, y no el que tenía el día que se pidió el alta.
 */
export const useCatalogosDeSolicitudes = () => {
  const [roleFrames, setRoleFrames] = useState<RoleFrameItem[]>([]);
  const [categoriasSat, setCategoriasSat] = useState<CategoriaSatItem[]>([]);
  const [estados, setEstados] = useState<InfoItem[]>([]);
  const [tiposContrato, setTiposContrato] = useState<ContratoItem[]>([]);

  useEffect(() => {
    let vivo = true;
    // Cada catálogo por su cuenta: si uno falla (un permiso que la app no tiene), los otros igual
    // resuelven sus columnas. Con `Promise.all` un solo 403 dejaba las tres listas vacías.
    const o = <T,>(p: Promise<T>, vacio: T, que: string) =>
      p.catch((e) => {
        console.error(`Error cargando ${que} para solicitudes:`, e);
        return vacio;
      });
    Promise.all([o(roleFrameAPI.list(), [] as RoleFrameItem[], "roles frame"), o(categoriaSatAPI.list(), [] as CategoriaSatItem[], "categorías"), o(infoAPI.listByType("estado-empleado"), [] as InfoItem[], "estados")]).then(([frames, cats, infos]) => {
      if (!vivo) return;
      setRoleFrames(frames);
      setCategoriasSat(cats);
      setEstados(infos);
    });
    o(contratosAPI.list(), [] as ContratoItem[], "tipos de contrato").then((l) => vivo && setTiposContrato(l));
    return () => {
      vivo = false;
    };
  }, []);

  return useMemo(() => {
    /**
     * El rol frame de una solicitud puede venir en 3 formas según quién la creó:
     * `roleFrameId` (singular), `rolesFrameIds[]` o `roles_frame[]` (el que usa el alta de mobile).
     */
    const resolverRolFrame = (s: SolicitudVista): string => {
      const raw = s.roleFrameId || s.rolesFrameIds?.[0] || s.roles_frame?.[0];
      if (!raw) return "Sin rol";
      // Puede venir como id (string) o ya populado ({_id, name}).
      if (typeof raw === "object") return raw.name || roleFrames.find((rf) => rf._id === String(raw._id))?.name || "Sin rol";
      return roleFrames.find((rf) => rf._id === String(raw))?.name || "Sin rol";
    };

    /** El estado impositivo declarado. `null` si la solicitud no declaró ninguno. */
    const resolverTramite = (tipo?: string | null): InfoItem | null => (esTipoImpositivo(tipo) ? estadoImpositivoPorTipo(estados, tipo as any) : null);

    /** El tipo de contrato pedido, con el nombre que tiene HOY en el ABM; si ya no está, el que tenía al pedirlo. */
    const resolverTipoContrato = (s: SolicitudVista): string => (s.contratoId ? tiposContrato.find((t) => t._id === s.contratoId)?.name : "") || s.nombreContrato || "";

    // El estado del Paso 1: el tag de una solicitud sin decidir ES este estado, con su nombre y su color del ABM.
    const estadoPendiente = estados.find((e) => e.data?.esSolicitud)?.name || "Solicitud pendiente";
    return { roleFrames, categoriasSat, estados, estadoPendiente, resolverRolFrame, resolverTramite, resolverTipoContrato };
  }, [roleFrames, categoriasSat, estados, tiposContrato]);
};

/** Lo que dice la confirmación de «Eliminar»: en una aprobada se va también el contrato que creó. */
export const textoEliminarSolicitud = (s: SolicitudVista) =>
  s.estado === "aprobada"
    ? `Se eliminará la solicitud de ${s.nombre} y también el contrato que se creó al aprobarla. Los demás contratos de la persona no se tocan. Esta acción no se puede deshacer.`
    : `Se eliminará definitivamente la solicitud de ${s.nombre}. Esta acción no se puede deshacer.`;

/**
 * Lo que se dice DESPUÉS de eliminar. En una aprobada se nombra el contrato que se fue con ella, y si
 * no se encontró se avisa: la solicitud ya no está, así que es la única pista para buscarlo a mano.
 */
export const resultadoEliminarSolicitud = (r: ResultadoEliminarSolicitud): { encontrado: boolean; texto: string } => {
  const c = r.contrato;
  if (!c) return { encontrado: true, texto: "La solicitud fue eliminada." };
  if (c.borrado) {
    const periodo = c.desde ? ` (${formatDiaSolicitud(c.desde)}${c.hasta ? ` → ${formatDiaSolicitud(c.hasta)}` : ", indeterminado"})` : "";
    return { encontrado: true, texto: `Se eliminaron la solicitud y su contrato${c.proyecto ? ` en ${c.proyecto}` : ""}${periodo}.` };
  }
  return { encontrado: false, texto: "Se eliminó la solicitud, pero no se encontró el contrato que generó: puede que al aprobarla se hayan cambiado las fechas. Si la persona sigue en el equipo del proyecto, eliminá el contrato desde ahí." };
};

/**
 * CUÁNDO SE HIZO LA SOLICITUD, en HORARIO ARGENTINO y con día de la semana: en una tanda de altas
 * del mismo día la fecha sola no distingue nada, y la hora es lo que ordena «cuál se pidió primero».
 * Se fija la zona horaria y no se confía en la del navegador: la hora de la base es UTC y quien
 * mira desde otra zona (o con la PC mal configurada) vería otra hora que la de la oficina.
 */
const ZONA_AR = "America/Argentina/Buenos_Aires";
export const fechaHoraSolicitud = (dateStr?: string | null): { diaSemana: string; fecha: string; hora: string } | null => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const diaSemana = d.toLocaleDateString("es-AR", { weekday: "long", timeZone: ZONA_AR });
  return {
    diaSemana: diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1),
    fecha: d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", timeZone: ZONA_AR }),
    hora: d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA_AR }),
  };
};
export const formatFechaHoraSolicitud = (dateStr?: string | null) => {
  const f = fechaHoraSolicitud(dateStr);
  return f ? `${f.diaSemana} ${f.fecha}, ${f.hora}` : dateStr ? String(dateStr) : "";
};

export const formatFechaSolicitud = (dateStr?: string | null) => {
  if (!dateStr) return "N/A";
  try {
    return new Date(dateStr).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
};

/*
  LAS FECHAS DEL CONTRATO SON DÍAS DE CALENDARIO, no instantes.

  `startDate`/`dueDate` llegan como "2026-09-19" o "2026-09-19T00:00:00.000Z": las dos son medianoche
  UTC, y pasadas por `new Date` en Argentina (UTC-3) caen el día anterior a las 21 h. La tabla decía
  «18 sept» para un contrato que arranca el 19, mientras el detalle —que corta los diez primeros
  caracteres— decía 19/09. Se arma la fecha con el día escrito, sin zona horaria de por medio.
*/
export const formatDiaSolicitud = (dateStr?: string | null) => {
  const [y, m, d] = String(dateStr || "").slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return formatFechaSolicitud(dateStr);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
};

/** ¿El período pedido [inicio, fin] se pisa con el contrato [alta, baja]? Sin fin o sin baja = abierto. Fechas AAAA-MM-DD. */
export const seSuperpone = (inicio?: string | null, fin?: string | null, alta?: string | null, baja?: string | null): boolean => {
  const d = (x?: string | null) => (/^\d{4}-\d{2}-\d{2}/.test(String(x || "")) ? String(x).slice(0, 10) : "");
  const [i, f, a, b] = [d(inicio), d(fin), d(alta), d(baja)];
  if (!i || !a) return false;
  return i <= (b || "9999-12-31") && a <= (f || "9999-12-31");
};

interface SolicitudesTableProps {
  solicitudes: SolicitudVista[];
  catalogos: ReturnType<typeof useCatalogosDeSolicitudes>;
  /** Columnas Cliente y Proyecto: sobran adentro de un proyecto, hacen falta en la vista global. */
  mostrarProyectos?: boolean;
  /** Si falta, la fila pendiente no ofrece aprobar (la aprobación necesita el wizard del proyecto). */
  onAprobar?: (s: SolicitudVista) => void;
  onRechazar: (s: SolicitudVista) => void;
  onReabrir: (s: SolicitudVista) => void;
  onEliminar: (s: SolicitudVista) => void;
  /** Corrige el contrato que creó una solicitud APROBADA. Sin esto, la fila aprobada sólo dice «Ya aprobada». */
  onEditarAprobada?: (s: SolicitudVista) => void;
  /** Abre el detalle completo de la solicitud. Sin esto la fila no es clickeable. */
  onVerDetalle?: (s: SolicitudVista) => void;
  /** SELECCIÓN para acciones masivas (eliminar): con esto aparece la columna de casillas. */
  seleccionadas?: Set<string>;
  onCambiarSeleccion?: (ids: Set<string>) => void;
  /** Columna «Obra social» (validar contra ARCA): sólo la vista global, que trae el contrato de cada aprobada. */
  renderObraSocial?: (s: SolicitudVista) => React.ReactNode;
  /**
   * LA CASILLA DEL ENCABEZADO MARCA TODO EL LISTADO, no sólo la página (pedido del 16/10/2026): con
   * esto, tildarla llama a `onSeleccionarTodas` (que trae las de todas las páginas) y queda tildada
   * cuando la selección llega a `totalSeleccionable`. Sin esto, marca las de la página como siempre.
   */
  onSeleccionarTodas?: () => void;
  totalSeleccionable?: number;
  /**
   * Las recién aprobadas que se están yendo (01/11/2026): se deslizan hacia la izquierda y se apagan,
   * para que se entienda que pasaron a Contratos. La pantalla las saca de la lista al terminar.
   */
  saliendo?: Set<string>;
}

/** Lo que dura la salida de una fila aprobada (la pantalla espera esto antes de sacarla). */
export const MS_SALIDA_FILA = 700;

export const SolicitudesTable: React.FC<SolicitudesTableProps> = ({ solicitudes, catalogos, mostrarProyectos = false, onAprobar, onRechazar, onReabrir, onEliminar, onEditarAprobada, onVerDetalle, seleccionadas, onCambiarSeleccion, renderObraSocial, onSeleccionarTodas, totalSeleccionable, saliendo }) => {
  const { estadoPendiente, resolverRolFrame, resolverTramite, resolverTipoContrato } = catalogos;
  const conSeleccion = !!seleccionadas && !!onCambiarSeleccion;
  // La casilla del encabezado marca o desmarca las de ESTA página (la selección de otras páginas se conserva).
  const enPagina = solicitudes.filter((s) => seleccionadas?.has(s._id)).length;
  const todasEnPagina = solicitudes.length > 0 && enPagina === solicitudes.length;
  // Con `onSeleccionarTodas`, la casilla habla del listado entero (ver la prop).
  const porListado = !!onSeleccionarTodas && Number(totalSeleccionable) > 0;
  const marcadas = seleccionadas?.size ?? 0;
  const todoMarcado = porListado ? marcadas >= Number(totalSeleccionable) : todasEnPagina;
  const algoMarcado = porListado ? marcadas > 0 : enPagina > 0;
  const alternarEncabezado = () => {
    if (!porListado) return alternarPagina();
    if (todoMarcado) onCambiarSeleccion?.(new Set());
    else onSeleccionarTodas!();
  };
  const alternarPagina = () => {
    const nuevas = new Set(seleccionadas);
    for (const s of solicitudes) (todasEnPagina ? nuevas.delete(s._id) : nuevas.add(s._id));
    onCambiarSeleccion?.(nuevas);
  };
  const alternar = (id: string) => {
    const nuevas = new Set(seleccionadas);
    if (nuevas.has(id)) nuevas.delete(id);
    else nuevas.add(id);
    onCambiarSeleccion?.(nuevas);
  };


  /* Los encabezados quedan fijos con el scroll de la página: ver `TablaConEncabezadoFijo`. */
  const filaDeEncabezados = (
    <tr className="bg-gray-50 dark:bg-[#18202f] border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
      {/*
        LA CASILLA Y EL NOMBRE QUEDAN FIJOS al correr la tabla de costado (pedido del 20/10/2026):
        con muchas columnas, al llegar a Estado o Acciones ya no se veía de quién era la fila.
        Fondos opacos: por una celda fija translúcida se ve pasar lo que scrollea (`#18202f` es el
        gris del encabezado ya mezclado, como en Gestionar Equipo).
      */}
      {conSeleccion && (
        <th className="sticky left-0 z-[6] w-10 min-w-[2.5rem] pl-4 py-3 bg-gray-50 dark:bg-[#18202f]">
          <input
            type="checkbox"
            checked={todoMarcado}
            ref={(el) => {
              if (el) el.indeterminate = algoMarcado && !todoMarcado;
            }}
            onChange={alternarEncabezado}
            aria-label={porListado ? (todoMarcado ? "Desmarcar todas" : `Marcar las ${totalSeleccionable} del listado`) : todasEnPagina ? "Desmarcar las de esta página" : "Marcar todas las de esta página"}
            title={porListado ? (todoMarcado ? "Desmarcar todas" : `Marcar las ${totalSeleccionable} del listado (todas las páginas)`) : undefined}
            className="h-4 w-4 rounded cursor-pointer"
          />
        </th>
      )}
      <th className={`sticky ${conSeleccion ? "left-10" : "left-0"} z-[6] px-4 py-3 font-semibold bg-gray-50 dark:bg-[#18202f] shadow-[inset_-1px_0_0_#e5e7eb,4px_0_6px_-4px_rgba(0,0,0,0.25)] dark:shadow-[inset_-1px_0_0_#4b5563,4px_0_6px_-4px_rgba(0,0,0,0.4)]`}>Colaborador</th>
      {/* El orden de las columnas lo fijó el usuario el 01/11/2026: Último contrato, Solicitud, Tipo de contrato (con el tipo de
          alta arriba), Horario, Solicitó, Roles, Cliente, Proyecto (con el centro de costo en un badge al lado), Fecha de
          creación. El estado va en el tag de «Fechas Solicitud» (no hay columna «Estado»). «Obra social» salió de Solicitudes el mismo día (sigue como opción del componente). */}
      <th className="px-4 py-3 font-semibold" title="El último contrato de la persona ANTERIOR a lo pedido (alta antes del inicio de la solicitud), en cualquier proyecto. Avisa si se superpone con las fechas pedidas.">Último<br />contrato</th>
      <th className="px-4 py-3 font-semibold" title="El período que se pidió en la solicitud">Solicitud</th>
      <th className="px-4 py-3 font-semibold whitespace-nowrap">Contrato</th>
      <th className="px-4 py-3 font-semibold">Horario</th>
      <th className="px-4 py-3 font-semibold">Solicitó</th>
      <th className="px-4 py-3 font-semibold">Rol/es Empresa</th>
      {renderObraSocial && <th className="px-4 py-3 font-semibold">Obra social</th>}
      {mostrarProyectos && (
        <>
          <th className="px-4 py-3 font-semibold">Cliente</th>
          <th className="px-4 py-3 font-semibold">Proyecto</th>
        </>
      )}
      <th className="px-4 py-3 font-semibold whitespace-nowrap" title="Día y hora en que se hizo la solicitud (horario argentino)">Fecha Solicitud</th>
      {/* Las acciones quedan FIJAS a la derecha (27/10/2026): con la tabla ancha, «Editar para Aprobar» y «Rechazar» quedaban fuera de la vista. */}
      <th className="col-acciones px-4 py-3 font-semibold text-left bg-gray-50 dark:bg-[#18202f]">Acciones</th>
    </tr>
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-clip">
      {/*
        El borde de las columnas fijas (Nombre y Acciones) es una sombra inset: con border-collapse el
        border-l/r es de la tabla, no de la celda, y se iba con el scroll lateral.
      */}
      <TablaConEncabezadoFijo tabla="w-full text-left border-collapse">
        <thead>{filaDeEncabezados}</thead>
        <tbody>
          {solicitudes.map((s) => {
            const tramite = resolverTramite(s.tipoImpositivo);
            // Las que ya no están en juego se atenúan, para que la fila no se lea igual que una pendiente.
            const filaApagada = s.estado === "rechazada" || s.estado === "cancelada";
            // El fondo OPACO de las celdas fijas, con el mismo estado que la fila (elegida, hover).
            const fondoFijo = seleccionadas?.has(s._id) ? "bg-[#f7faff] dark:bg-[#1f2b3f]" : "bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-[#1c2634]";

            return (
              /*
                LA FILA ENTERA ABRE EL DETALLE.

                En las columnas entran unos pocos datos y la solicitud tiene treinta: quien aprueba
                necesita leerlos antes de decidir, no después. Los botones de la última columna
                siguen funcionando como atajo, cortando la propagación del click.
              */
              <tr
                key={s._id}
                onClick={onVerDetalle && !saliendo?.has(s._id) ? () => onVerDetalle(s) : undefined}
                style={saliendo?.has(s._id) ? { transform: "translateX(-110%)", opacity: 0, transition: `transform ${MS_SALIDA_FILA}ms ease-in, opacity ${MS_SALIDA_FILA}ms ease-in`, pointerEvents: "none" } : undefined}
                className={`group border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${onVerDetalle ? "cursor-pointer" : ""} ${filaApagada ? "opacity-60 bg-gray-50/60 dark:bg-gray-900/30" : ""} ${seleccionadas?.has(s._id) ? "bg-blue-50/70 dark:bg-blue-900/20" : ""} ${saliendo?.has(s._id) ? "bg-green-50 dark:bg-green-900/20" : ""}`}
              >
                {conSeleccion && (
                  <td className={`sticky left-0 z-[5] w-10 min-w-[2.5rem] pl-4 py-3 ${fondoFijo}`} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={!!seleccionadas?.has(s._id)} onChange={() => alternar(s._id)} aria-label={`Seleccionar a ${s.nombre}`} className="h-4 w-4 rounded cursor-pointer" />
                  </td>
                )}
                <td className={`sticky ${conSeleccion ? "left-10" : "left-0"} z-[5] px-4 py-3 min-w-[14rem] max-w-[20rem] shadow-[inset_-1px_0_0_#e5e7eb,4px_0_6px_-4px_rgba(0,0,0,0.25)] dark:shadow-[inset_-1px_0_0_#4b5563,4px_0_6px_-4px_rgba(0,0,0,0.4)] ${fondoFijo}`}>
                  <div className="min-w-0">
                    {/*
                      LOS BADGES VAN ARRIBA DEL NOMBRE, NO A SU DERECHA (01/11/2026): la columna es fija y
                      un badge al lado del nombre la ensanchaba, comiéndose el lugar del resto de la tabla.
                    */}
                    {(s.esRenovacion || s.reenviada) && (
                      <div className="mb-1 flex flex-wrap items-center gap-1">
                        {/* Extiende un contrato que estaba por vencer: no es un ingreso nuevo. */}
                        {s.esRenovacion && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Renovación</span>}
                        {/*
                          Se rechazó y volvió corregida: no es una solicitud nueva. El detalle dice qué
                          se había objetado, que es la pregunta de quien la vuelve a mirar.
                        */}
                        {s.reenviada && (
                          <span
                            title={s.reenviada.motivoAnterior ? `Se había rechazado por: ${s.reenviada.motivoAnterior}` : "Se corrigió después de un rechazo"}
                            className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                          >
                            Corregida{(s.reenviada.veces || 1) > 1 ? ` ×${s.reenviada.veces}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                    {/*
                      El mismo indicador que Usuarios y Contratos —si el nombre ya se confirmó contra el padrón—,
                      SÓLO EL ÍCONO a la derecha del nombre y el rótulo («Validado en ARCA») en el hover
                      (01/11/2026): como renglón aparte ocupaba mucho alto en cada fila.
                    */}
                    <p className="flex items-center gap-1.5 font-medium text-gray-900 dark:text-white text-sm min-w-0">
                      <span className="truncate">{s.nombre}</span>
                      <NombreArca estado={estadoNombreArca({ cuit: s.cuit || undefined, sinCuit: s.sinCuit, validadoAt: s.nombreValidadoArcaAt })} fecha={s.nombreValidadoArcaAt} rotuloEnTooltip />
                      {/*
                        EL COMENTARIO DE QUIEN PIDIÓ EL ALTA, SÓLO EL ÍCONO (01/11/2026): debajo del nombre, entero,
                        ocupaba varias líneas por fila. El hover lo muestra y el click abre el detalle, que lo trae
                        completo.
                      */}
                      {s.comentarios && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onVerDetalle?.(s);
                          }}
                          title={s.comentarios}
                          aria-label="Ver el comentario"
                          className="shrink-0 text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
                        >
                          <FontAwesomeIcon icon={faCommentDots} className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </p>
                    {/*
                      Y LA RESPUESTA: POR QUÉ SE RECHAZÓ.

                      Va acá, debajo del comentario de quien pidió el alta, porque las dos cosas se
                      leen juntas: una pide y la otra contesta. En la columna Estado entraba apretado
                      al lado del badge y se cortaba, que en el único dato que se busca al mirar una
                      rechazada —qué hay que corregir para volver a mandarla— es no mostrarlo.
                    */}
                    {s.motivoRechazo && (
                      <p className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5">
                        <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 mt-0.5 shrink-0" />
                        <span className="whitespace-pre-wrap break-words">
                          <span className="font-semibold">Rechazo: </span>
                          {s.motivoRechazo}
                        </span>
                      </p>
                    )}
                  </div>
                </td>

                {/* El último contrato de la PERSONA anterior a lo pedido (en cualquier proyecto); si se pisa con lo pedido, lo avisa «Fechas Solicitud». */}
                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap" title={s.ultimoContrato ? [s.ultimoContrato.nombre, s.ultimoContrato.proyecto].filter(Boolean).join(" · ") : "Sin contratos anteriores a lo pedido"}>
                  {s.ultimoContrato ? (
                    (() => {
                      const vigente = isContractVigente(s.ultimoContrato.alta, s.ultimoContrato.baja || undefined);
                      return (
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit ${vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{vigente ? "VIGENTE" : "NO VIGENTE"}</span>
                          <div className="flex flex-col gap-0.5 text-xs">
                            <span><span className="text-gray-400">Alta:</span> {formatDate(s.ultimoContrato.alta)}</span>
                            <span><span className="text-gray-400">Baja:</span> {s.ultimoContrato.baja ? formatDate(s.ultimoContrato.baja) : "—"}</span>
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <span className="text-gray-300 dark:text-gray-600">—</span>
                  )}
                </td>
                {/* EL PERÍODO PEDIDO, con el mismo formato que «Último contrato» (Alta / Baja, DD/MM/AAAA) para
                    compararlos de un vistazo y ocupar menos ancho (01/11/2026). Sin fin: «Indef.». ARRIBA, un tag del
                    mismo tamaño que VIGENTE / NO VIGENTE de la columna de al lado, así las fechas quedan a la misma
                    altura. EL TAG DICE EL ESTADO (01/11/2026, sin columna «Estado»). PENDIENTE ES EL ESTADO DEL PASO 1
                    (05/11/2026): sale del ABM, con su nombre y su color. «SOLICITUD APROBADA» y las demás son el
                    desenlace de la solicitud, no un estado del circuito (ESTADO_SOLICITUD). Si se pisa con el último
                    contrato de la persona, debajo de las fechas un «SUPERPONE» en naranja, que no se confunde con el
                    amarillo de pendiente. */}
                <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                  <div className="flex flex-col gap-1">
                    {s.estado === "pendiente" ? (
                      <EstadoBadge name={estadoPendiente} className="w-fit" />
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit ${ESTADO_SOLICITUD[s.estado].clase}`}>
                        <FontAwesomeIcon icon={ESTADO_SOLICITUD[s.estado].icono} className="text-[8px]" />
                        Solicitud {ESTADO_SOLICITUD[s.estado].texto}
                      </span>
                    )}
                    <div className="flex flex-col gap-0.5 text-xs">
                      <span><span className="text-gray-400">Alta:</span> {formatDate(s.startDate || undefined) || "—"}</span>
                      <span><span className="text-gray-400">Baja:</span> {s.dueDate ? formatDate(s.dueDate) : "Indef."}</span>
                    </div>
                    {(() => {
                      /* SUPERPONE (02/11/2026): con el último contrato (fechas a la vista en la columna de al lado) O
                         con cualquier otro que ya tenga —el aviso «Se superpone con contrato que ya tiene» del detalle—.
                         Rojo si se pisa el horario; naranja si sólo se cruzan las fechas. */
                      const avisos = s.superposiciones || [];
                      const conUltimo = !!s.ultimoContrato && seSuperpone(s.startDate, s.dueDate, s.ultimoContrato.alta, s.ultimoContrato.baja);
                      if (!conUltimo && avisos.length === 0) return null;
                      const horario = avisos.some((a) => a.tipo === "horario");
                      const motivos = [...(conUltimo ? ["Las fechas pedidas se superponen con el último contrato de la persona."] : []), ...avisos.map((a) => a.mensaje)];
                      return (
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit ${horario ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"}`} title={motivos.join("\n")}>
                          <FontAwesomeIcon icon={faTriangleExclamation} /> Superpone
                        </span>
                      );
                    })()}
                  </div>
                </td>
                {/*
                  TIPO DE CONTRATO, Y ARRIBA EL TIPO DE ALTA (01/11/2026: sin columna propia, están íntimamente
                  relacionados). El tipo de alta es por qué vía se pidió contratar: alta temprana ante ARCA o
                  servicios, con el mismo badge que se ve en Contratos, para que quien aprueba lo reconozca como
                  lo mismo que después va a ver en el contrato.

                  «Sin definir» es literal y no un valor por defecto: las solicitudes cargadas antes de que este
                  campo existiera no lo declararon, y suponerles un trámite sería inventar el dato del que
                  depende el TXT de ARCA.
                */}
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  <div className="flex flex-col items-start gap-1">
                    {tramite ? <EstadoBadge name={tramite.name} /> : <span className="text-xs text-gray-400 italic">Alta sin definir</span>}
                    <span>{resolverTipoContrato(s) || <span className="text-gray-400">-</span>}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{s.schedule || "-"}</td>

                {/*
                  QUIÉN LA PIDIÓ, con sus roles de coordinación o supervisión arriba: es lo que dice
                  con qué autoridad se pidió el alta. Los demás roles (administrativos, etc.) no
                  suman a esa lectura y se omiten. Las solicitudes viejas sin autor muestran un guión.
                */}
                <td className="px-4 py-3">
                  <div className="min-w-0">
                    {/* Los roles ARRIBA del nombre (01/11/2026), como «Renovación» arriba del colaborador. */}
                    {s.solicitante?.nombre && s.solicitante.roles.some((r) => ROL_QUE_SOLICITA.test(r)) && (
                      <div className="mb-1 flex flex-wrap gap-1">
                        {s.solicitante.roles.filter((r) => ROL_QUE_SOLICITA.test(r)).map((r) => (
                          <span key={r} className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                            {r}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.solicitante?.nombre ? <p className="text-sm text-gray-900 dark:text-white truncate">{s.solicitante.nombre}</p> : <span className="text-sm text-gray-400">—</span>}
                  </div>
                </td>

                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{resolverRolFrame(s)}</td>
                {renderObraSocial && (
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    {renderObraSocial(s)}
                  </td>
                )}
                {/*
                  CLIENTE Y PROYECTO SON DOS COLUMNAS, NO UN TEXTO CON UN PUNTO EN EL MEDIO.

                  Las dos listas se recorren igual y con la misma tipografía, así el proyecto de
                  cada línea queda enfrentado a su cliente cuando la solicitud tiene más de uno.
                  Por eso el cliente vacío muestra un guión en vez de no ocupar la línea: sin él,
                  las filas se corren y el proyecto queda leído bajo el cliente de otro.
                */}
                {mostrarProyectos && (
                  <>
                    <td className="px-4 py-3">
                      {s.proyectos && s.proyectos.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {s.proyectos.map((p) => (
                            <span key={p._id} className="text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                              {p.clienteNombre || <span className="text-gray-400">-</span>}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.proyectos && s.proyectos.length > 0 ? (
                        <div className="flex flex-col gap-1">
                          {s.proyectos.map((p) => (
                            <span key={p._id} className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                              {/* El centro de costo del proyecto, ADELANTE del nombre, con el badge violeta de su ficha (01/11/2026). */}
                              {p.centroCosto && <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 border border-purple-100 dark:border-purple-800/50">{p.centroCosto}</span>}
                              {p.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Sin proyecto</span>
                      )}
                    </td>
                  </>
                )}


                {/*
                  CUÁNDO SE HIZO LA SOLICITUD, en una columna propia (la última, 01/11/2026): día de la
                  semana, fecha y hora en horario argentino. No va debajo del nombre de la persona
                  porque ahí se leía como una fecha del contrato (al lado del período «24 oct → 24 oct»
                  no se distinguía), y en una tanda del mismo día sólo la hora dice cuál se pidió primero.
                */}
                <td className="px-4 py-3 whitespace-nowrap" title="Día y hora en que se hizo la solicitud (horario argentino)">
                  <FechaHoraCelda valor={s.creadaEl} />
                </td>
                <td className={`px-4 py-3 text-right ${fondoFijo}`} onClick={(e) => e.stopPropagation()}>
                  {/* Una solicitud rechazada o cancelada no se aprueba de una: primero se reabre,
                      así queda explícito que se está deshaciendo la decisión.
                      APROBAR ENCIMA DE RECHAZAR (con aire entre los dos) y el tacho al lado, centrado en alto; todo centrado en el ancho, así editar + tacho (sin Aprobar/Rechazar) no quedan tirados a la derecha (01/11/2026): la columna fija ocupa
                      menos ancho y deja ver más de la tabla. */}
                  <div className="flex items-center justify-center gap-2">
                    {s.estado === "pendiente" ? (
                      <div className="flex flex-col items-stretch gap-2">
                        {/*
                          «APROBAR» (verde como el tag SOLICITUD APROBADA, tilde) Y «RECHAZAR» (rojo, cruz), SÓLO ÍCONOS (01/11/2026, pedido del
                          usuario: toda la columna en iconografía, para ganar ancho). El color y el hover («Editar y
                          aprobar», «Rechazar») dicen qué hace cada uno; el aria-label lo dice para lectores de pantalla.

                          Aprobar no se resuelve con este click: abre el alta con lo que pidió la solicitud
                          para completar contrato, área y turno, y recién al guardar ahí queda aprobada. Por
                          eso el hover dice «Editar y aprobar».
                        */}
                        {onAprobar && (
                          <button onClick={() => onAprobar(s)} className="h-8 w-8 rounded transition-colors flex items-center justify-center bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50" title="Editar y aprobar" aria-label="Editar y aprobar">
                            <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => onRechazar(s)} className="h-8 w-8 rounded transition-colors flex items-center justify-center bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50" title="Rechazar" aria-label="Rechazar">
                          <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : s.estado === "aprobada" ? (
                      /*
                        EDITAR UNA APROBADA ES CORREGIR SU CONTRATO, no el pedido: la solicitud ya
                        cumplió su función y cambiarla no movería nada. Abre el contrato que creó en
                        el mismo formulario con que se aprobó.
                      */
                      onEditarAprobada ? (
                        <button onClick={() => onEditarAprobada(s)} className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors" title="Editar el contrato que se creó al aprobarla">
                          <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Ya aprobada</span>
                      )
                    ) : (
                      // Sólo el ícono, como aprobar y rechazar: con el texto, la columna fija de acciones se ensanchaba para todas las filas.
                      <button onClick={() => onReabrir(s)} className="h-8 w-8 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded transition-colors flex items-center justify-center" title="Volver a pendiente" aria-label="Volver a pendiente">
                        <FontAwesomeIcon icon={faRotateLeft} className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/*
                      BORRAR, EN CUALQUIER ESTADO.

                      Rechazar y borrar contestan cosas distintas: rechazar es una decisión sobre un pedido
                      real y queda en el historial con su motivo; borrar es para lo que no aporta historial
                      —una prueba, una cargada dos veces—. Ofrecerlo recién después de rechazar obligaba a
                      inventar un motivo de rechazo para poder sacar de la lista algo que nunca fue un pedido.

                      Esta tabla es del panel, así que también se ofrece sobre una APROBADA (en la app no:
                      el server se la niega a quien no administra). Ahí deshace la contratación: se va
                      también el contrato que creó al aprobarse (ver `DELETE /users/:id/solicitud`).
                    */}
                    <button onClick={() => onEliminar(s)} className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors" title="Eliminar" aria-label="Eliminar">
                      <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TablaConEncabezadoFijo>
    </div>
  );
};

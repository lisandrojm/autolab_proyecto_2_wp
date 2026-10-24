import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faClock, faRotateLeft, faTrash, faCommentDots, faEdit, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { roleFrameAPI, RoleFrameItem } from "../../api/roleFrames";
import { categoriaSatAPI, CategoriaSatItem } from "../../api/categoriasSat";
import { infoAPI, InfoItem } from "../../api/info";
import type { ObraSocialDeSolicitud, ResultadoEliminarSolicitud } from "../../api/users";
import { EstadoBadge } from "../EstadoSelect";
import { estadoImpositivoPorTipo, esTipoImpositivo } from "../../utils/tramiteImpositivo";
import { NombreArca, estadoNombreArca } from "../arca/NombreArca";

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
}

/** Roles del solicitante que se muestran como badge en la columna «Solicitó». */
const ROL_QUE_SOLICITA = /coordinador|supervisor/i;

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
    startDate: m.startDate ?? null,
    dueDate: m.dueDate ?? null,
    schedule: m.schedule ?? null,
    dailyRate: m.dailyRate ?? null,
    comentarios: m.comentarios ?? null,
    solicitudUserId: m.solicitudUserId ? String(m.solicitudUserId) : null,
    motivoRechazo: m.solicitudMotivoRechazo ?? null,
    reenviada: m.solicitudReenviada?.el ? m.solicitudReenviada : null,
    esRenovacion: !!m.esRenovacion,
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

    return { roleFrames, categoriasSat, estados, resolverRolFrame, resolverTramite };
  }, [roleFrames, categoriasSat, estados]);
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
    fecha: d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric", timeZone: ZONA_AR }).replace(/\./g, ""),
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
  /** Texto del botón de aprobar; en la vista global dice a qué proyecto lleva. */
  tituloAprobar?: (s: SolicitudVista) => string;
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
}

export const SolicitudesTable: React.FC<SolicitudesTableProps> = ({ solicitudes, catalogos, mostrarProyectos = false, onAprobar, onRechazar, onReabrir, onEliminar, onEditarAprobada, tituloAprobar, onVerDetalle, seleccionadas, onCambiarSeleccion, renderObraSocial, onSeleccionarTodas, totalSeleccionable }) => {
  const { resolverRolFrame, resolverTramite } = catalogos;
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
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
              <th className={`sticky ${conSeleccion ? "left-10" : "left-0"} z-[6] px-4 py-3 font-semibold bg-gray-50 dark:bg-[#18202f] border-r border-gray-200 dark:border-gray-700 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)]`}>Nombre</th>
              <th className="px-4 py-3 font-semibold whitespace-nowrap" title="Día y hora en que se hizo la solicitud (horario argentino)">F. Solicitud</th>
              <th className="px-4 py-3 font-semibold">Solicitó</th>
              {mostrarProyectos && (
                <>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Proyecto</th>
                </>
              )}
              <th className="px-4 py-3 font-semibold">Rol/es Empresa</th>
              <th className="px-4 py-3 font-semibold">Tipo de alta</th>
              <th className="px-4 py-3 font-semibold">Fechas</th>
              <th className="px-4 py-3 font-semibold">Horario</th>
              <th className="px-4 py-3 font-semibold text-center">Estado</th>
              {renderObraSocial && <th className="px-4 py-3 font-semibold">Obra social</th>}
              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
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
                <tr key={s._id} onClick={onVerDetalle ? () => onVerDetalle(s) : undefined} className={`group border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${onVerDetalle ? "cursor-pointer" : ""} ${filaApagada ? "opacity-60 bg-gray-50/60 dark:bg-gray-900/30" : ""} ${seleccionadas?.has(s._id) ? "bg-blue-50/70 dark:bg-blue-900/20" : ""}`}>
                  {conSeleccion && (
                    <td className={`sticky left-0 z-[5] w-10 min-w-[2.5rem] pl-4 py-3 ${fondoFijo}`} onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={!!seleccionadas?.has(s._id)} onChange={() => alternar(s._id)} aria-label={`Seleccionar a ${s.nombre}`} className="h-4 w-4 rounded cursor-pointer" />
                    </td>
                  )}
                  <td className={`sticky ${conSeleccion ? "left-10" : "left-0"} z-[5] px-4 py-3 min-w-[14rem] max-w-[20rem] border-r border-gray-200 dark:border-gray-700 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)] ${fondoFijo}`}>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                        {s.nombre}
                        {/* Extiende un contrato que estaba por vencer: no es un ingreso nuevo. */}
                        {s.esRenovacion && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold align-middle bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Renovación</span>}
                        {/*
                          Se rechazó y volvió corregida: no es una solicitud nueva. El detalle dice qué
                          se había objetado, que es la pregunta de quien la vuelve a mirar.
                        */}
                        {s.reenviada && (
                          <span
                            title={s.reenviada.motivoAnterior ? `Se había rechazado por: ${s.reenviada.motivoAnterior}` : "Se corrigió después de un rechazo"}
                            className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold align-middle bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                          >
                            Corregida{(s.reenviada.veces || 1) > 1 ? ` ×${s.reenviada.veces}` : ""}
                          </span>
                        )}
                      </p>
                      <p className="flex items-center gap-2 text-xs text-gray-500 truncate">
                        {/* El mismo indicador que Usuarios y Contratos: si el nombre ya se confirmó contra el padrón. */}
                        <NombreArca estado={estadoNombreArca({ cuit: s.cuit || undefined, sinCuit: s.sinCuit, validadoAt: s.nombreValidadoArcaAt })} fecha={s.nombreValidadoArcaAt} conTexto />
                      </p>
                      {/*
                        EL COMENTARIO DE QUIEN PIDIÓ EL ALTA.

                        Va acá y no en una columna propia: es texto libre de largo impredecible y
                        una columna lo cortaría en dos palabras, que es no mostrarlo. Debajo del
                        nombre entra completo y solo aparece cuando hay algo escrito.
                      */}
                      {s.comentarios && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                          <FontAwesomeIcon icon={faCommentDots} className="h-3 w-3 mt-0.5 shrink-0" />
                          <span className="whitespace-pre-wrap break-words">{s.comentarios}</span>
                        </p>
                      )}
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

                  {/*
                    CUÁNDO SE HIZO LA SOLICITUD, en una columna propia después del nombre: día de la
                    semana, fecha y hora en horario argentino. No va debajo del nombre de la persona
                    porque ahí se leía como una fecha del contrato (al lado del período «24 oct → 24 oct»
                    no se distinguía), y en una tanda del mismo día sólo la hora dice cuál se pidió primero.
                  */}
                  <td className="px-4 py-3 whitespace-nowrap" title="Día y hora en que se hizo la solicitud (horario argentino)">
                    {(() => {
                      const f = fechaHoraSolicitud(s.creadaEl);
                      return f ? (
                        <div className="text-xs leading-tight">
                          <p className="text-gray-500 dark:text-gray-400">{f.diaSemana}</p>
                          <p className="text-gray-900 dark:text-white">
                            {f.fecha} <span className="text-gray-500 dark:text-gray-400">· {f.hora} h</span>
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">N/A</span>
                      );
                    })()}
                  </td>

                  {/*
                    QUIÉN LA PIDIÓ, con sus roles de coordinación o supervisión debajo: es lo que dice
                    con qué autoridad se pidió el alta. Los demás roles (administrativos, etc.) no
                    suman a esa lectura y se omiten. Las solicitudes viejas sin autor muestran un guión.
                  */}
                  <td className="px-4 py-3">
                    <div className="min-w-0">
                      {s.solicitante?.nombre ? <p className="text-sm text-gray-900 dark:text-white truncate">{s.solicitante.nombre}</p> : <span className="text-sm text-gray-400">—</span>}
                      {s.solicitante?.nombre && s.solicitante.roles.some((r) => ROL_QUE_SOLICITA.test(r)) && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {s.solicitante.roles.filter((r) => ROL_QUE_SOLICITA.test(r)).map((r) => (
                              <span key={r} className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                    </div>
                  </td>

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
                              <span key={p._id} className="text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
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

                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{resolverRolFrame(s)}</td>
                  {/*
                    POR QUÉ VÍA SE PIDIÓ CONTRATAR: alta temprana ante ARCA o servicios. Con el mismo
                    badge que se ve en Contratos, para que quien aprueba lo reconozca como lo mismo
                    que después va a ver en el contrato.

                    «Sin definir» es literal y no un valor por defecto: las solicitudes cargadas antes
                    de que este campo existiera no lo declararon, y suponerles un trámite sería
                    inventar el dato del que depende el TXT de ARCA.
                  */}
                  <td className="px-4 py-3">{tramite ? <EstadoBadge name={tramite.name} /> : <span className="text-xs text-gray-400 italic">Sin definir</span>}</td>
                  <td className="px-4 py-3">
                    <div className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      <span>{formatDiaSolicitud(s.startDate)}</span>
                      <span className="mx-1 text-gray-300">→</span>
                      <span>{s.dueDate ? formatDiaSolicitud(s.dueDate) : "Indef."}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{s.schedule || "-"}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${ESTADO_SOLICITUD[s.estado].clase}`}>
                      <FontAwesomeIcon icon={ESTADO_SOLICITUD[s.estado].icono} className="text-[8px]" />
                      {ESTADO_SOLICITUD[s.estado].texto}
                    </span>
                  </td>
                  {renderObraSocial && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {renderObraSocial(s)}
                    </td>
                  )}
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    {/* Una solicitud rechazada o cancelada no se aprueba de una: primero se reabre,
                        así queda explícito que se está deshaciendo la decisión. */}
                    <div className="flex items-center justify-end gap-1.5">
                      {s.estado === "pendiente" ? (
                        <>
                          {/*
                            DICE «EDITAR PARA APROBAR», Y LLEVA EL LÁPIZ, PORQUE ESO ES LO QUE HACE.

                            Aprobar no se resuelve con este click: abre el alta con lo que pidió la solicitud
                            para completar contrato, área y turno, y recién al guardar ahí queda aprobada. Con
                            el tilde y la palabra «Aprobar» sola parecía la decisión final —y quien lo tocaba
                            creía haber aprobado algo que seguía pendiente si cerraba el formulario—.
                          */}
                          {onAprobar && (
                            <button onClick={() => onAprobar(s)} className="px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap" title={tituloAprobar ? tituloAprobar(s) : "Aprobar y agregar al equipo"}>
                              <FontAwesomeIcon icon={faEdit} className="text-[10px]" />
                              Editar para Aprobar
                            </button>
                          )}
                          <button onClick={() => onRechazar(s)} className="px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap" title="Rechazar solicitud">
                            <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                            Rechazar
                          </button>
                        </>
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
                        <button onClick={() => onReabrir(s)} className="px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded transition-colors flex items-center gap-1.5 whitespace-nowrap" title="Volver a dejarla pendiente">
                          <FontAwesomeIcon icon={faRotateLeft} className="text-[10px]" />
                          Volver a pendiente
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
                      <button onClick={() => onEliminar(s)} className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors" title={s.estado === "aprobada" ? "Eliminar la solicitud y su contrato" : "Eliminar definitivamente"}>
                        <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

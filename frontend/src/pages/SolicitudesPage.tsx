import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserPlus, faChevronLeft, faChevronRight, faTrash, faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { usersAPI, SolicitudOverviewRow, ObraSocialDeSolicitud } from "../api/users";
import { clientsAPI } from "../api/clients";
import { projectsAPI } from "../api/projects";
import { cachedFetch } from "../utils/refCache";
import { infoAPI } from "../api/info";
import { categoriaSatAPI } from "../api/categoriasSat";
import { roleFrameAPI } from "../api/roleFrames";
import { contratoFrameAPI } from "../api/contratosFrame";
import { contratosAPI } from "../api/contratos";
import { CatalogosAprobacion, contratoDesdeSolicitud } from "../utils/aprobacionMasiva";
import { afipAPI } from "../api/afip";
import { Modal } from "../components/ui/Modal";
import { CeldaObraSocial, EstadoObraSocial, VistaObraSocial } from "../components/contratos/CeldaObraSocial";
import { FilaConstatacion, PantallaValidarObrasSociales } from "../components/contratos/PantallaValidarObrasSociales";
import { cuitEsValido } from "../utils/cuit";
import { sweetAlert } from "../utils/sweetAlert";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { ESTADOS_SOLICITUD, ESTADO_SOLICITUD, SolicitudVista, SolicitudesTable, resultadoEliminarSolicitud, textoEliminarSolicitud, useCatalogosDeSolicitudes } from "../components/solicitudes/SolicitudesTable";
import { SolicitudDetalleModal } from "../components/solicitudes/SolicitudDetalleModal";
import { CalificacionesModal } from "../components/calificaciones/CalificacionesModal";
import { calificacionesAPI } from "../api/calificaciones";
// La pantalla del equipo, montada en modo «sólo aprobación»: de ahí sale el wizard de contratación.
import { ProjectTeamPage } from "./ProjectTeamPage";

/**
 * SOLICITUDES, TODAS, EN UN SOLO LUGAR.
 *
 * El equivalente de la pantalla de Contratos para el otro extremo del ciclo: lo que se pidió y
 * todavía no es un contrato. Hasta acá las solicitudes solo se veían adentro de un proyecto
 * (Gestionar Equipo → Solicitudes), lo que obliga a saber de antemano en qué proyecto mirar —y a
 * entrar proyecto por proyecto para responder "qué altas hay pendientes".
 *
 * Los filtros son los de visualización de Contratos que tienen sentido acá: búsqueda, cliente,
 * proyecto y estado. Los de Contratos que no se trasladan son los que hablan de un contrato que
 * todavía no existe (vigencia, tipo de contrato, estado de contrato, reemplazo): una solicitud no
 * tiene nada de eso hasta que se aprueba.
 *
 * Todo se resuelve en el SERVER (ver `GET /users/solicitudes-overview`), no sobre la página ya
 * cargada: la lista está paginada y filtrar acá mostraría resultados salteados y páginas vacías.
 */

const PAGE_SIZE = 25;

const CLAVE_AYUDA = "solicitudes" as const;

const digitosDe = (v?: string | null) => String(v || "").replace(/\D/g, "");

/**
 * LA VISTA DE LA CELDA, desde lo que el server resolvió para la solicitud. Es el gemelo del adaptador
 * de Contratos (`ObraSocialCell` en ContractBulkTabs): mismas reglas, otra fuente. Sin contrato
 * (pendiente, rechazada), `null`: todavía no hay dónde guardarla.
 */
const vistaObraSocialDe = (nombre: string, os: ObraSocialDeSolicitud | null | undefined): VistaObraSocial | null => {
  if (!os) return null;
  const sugerido = digitosDe(os.rnosSugerido);
  const propio = digitosDe(os.rnos);
  const base: EstadoObraSocial = os.estado === "no_figura" ? "validada_default" : os.estado === "afiliada" ? "validada_arca" : "sin_validar";
  // El error va primero, como en Contratos: una obra social que la empleadora no registró hace que ARCA rechace el alta.
  const estado: EstadoObraSocial = base !== "sin_validar" && os.registrada === false ? "no_registrada" : base;
  const codigo = base === "validada_arca" ? propio : base === "validada_default" ? sugerido : "";
  const cuil = digitosDe(os.cuil);
  return {
    estado,
    codigo,
    nombre: os.nombre || os.nombreSugerida || "",
    fecha: os.constatadaEl ? new Date(os.constatadaEl).toLocaleDateString("es-AR") : "",
    delConvenio: os.convenioCct ? `convenio ${os.convenioCct}` : "convenio",
    rnosSugerido: sugerido,
    nombreSugerida: os.nombreSugerida || "",
    distintaDelConvenio: base === "validada_arca" && propio !== sugerido,
    puedeValidar: !!os.empresaContratoId && os.tieneCategoria && cuil.length === 11,
    motivoNoPuede: !os.empresaContratoId ? "Todavía no se puede validar: el contrato no tiene Empresa Contrato. Asignala en Contratos." : !os.tieneCategoria ? "Todavía no se puede validar: el contrato no tiene categoría (de ella sale el convenio y su obra social). Elegila en Contratos." : "Todavía no se puede validar: la persona no tiene un CUIL válido.",
    nombrePersona: nombre,
    quitar: { projectId: os.projectId, userId: os.userId, ref: os.contratoId },
  };
};

/** Un grupo de la cola de validación: una empleadora y sus filas, en la forma que pide la pantalla de Contratos. */
type GrupoOS = { empresaId: string; empleadora: string; empleadoraCuit: string; filas: FilaConstatacion[] };

const gruposDeValidacion = (items: { nombre: string; os: ObraSocialDeSolicitud }[]): GrupoOS[] => {
  const grupos = new Map<string, GrupoOS>();
  for (const { nombre, os } of items) {
    const empresaId = String(os.empresaContratoId || "");
    if (!empresaId) continue;
    const g = grupos.get(empresaId) || { empresaId, empleadora: os.empresaNombre, empleadoraCuit: os.empresaCuit || "", filas: [] };
    // La clave de la pantalla es `_id-contractIndex`: con el contrato en el `_id` queda única por fila.
    g.filas.push({ row: { _id: `${os.userId}:${os.contratoId}`, contractIndex: 0, userName: nombre, cuit: os.cuil, empresaContratoId: os.empresaContratoId || undefined }, valores: { rnosSugerido: os.rnosSugerido || "", nombreObraSocialSugerida: os.nombreSugerida || "", constatacion: os.estado, rnos: os.rnos || "" } });
    grupos.set(empresaId, g);
  }
  return [...grupos.values()];
};

export const SolicitudesPage: React.FC = () => {
  const catalogos = useCatalogosDeSolicitudes();
  /** Qué solicitud se está aprobando: abre el wizard del proyecto encima de esta pantalla. */
  const [aprobando, setAprobando] = useState<{ projectId: string; solicitudId: string; editarContrato?: { userId: string; contractIndex: number } } | null>(null);
  /** La solicitud que se está revisando: el detalle completo, antes de decidir. */
  const [revisando, setRevisando] = useState<SolicitudVista | null>(null);
  /** La persona de una renovación que se está calificando (desde el detalle). */
  const [calificando, setCalificando] = useState<{ solicitudId: string; userId: string; nombre: string } | null>(null);
  const ayuda = getHelp(CLAVE_AYUDA);

  const [rows, setRows] = useState<SolicitudOverviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [cargando, setCargando] = useState(true);
  /*
    SELECCIÓN PARA ELIMINAR DE A MUCHAS. Se guarda por id con su nombre y estado (para el aviso de las
    aprobadas, que se llevan su contrato) y sobrevive al cambio de página; cambiar un filtro la limpia.
  */
  /** Lo que hace falta de cada seleccionada para las acciones masivas, sin volver a pedirla. */
  type Elegida = { nombre: string; estado: string; cuit?: string | null; sinCuit?: boolean; empresaContratoId?: string | null; solicitudUserId?: string | null; personaId?: string; obraSocial?: ObraSocialDeSolicitud | null };
  const [seleccion, setSeleccion] = useState<Map<string, Elegida>>(new Map());
  const elegidaDe = (r: Elegida): Elegida => ({ nombre: r.nombre, estado: r.estado, cuit: r.cuit, sinCuit: r.sinCuit, empresaContratoId: r.empresaContratoId, solicitudUserId: r.solicitudUserId, personaId: r.personaId, obraSocial: r.obraSocial });
  /** Validar obras sociales: la lista de la corrida abierta (null = modal cerrado). */
  /*
    LA VALIDACIÓN DE OBRAS SOCIALES ES LA DE CONTRATOS: la misma pantalla, por el Asistente WeProdu.
    Solicitudes tenía la suya —la corrida en el servidor, con su Chromium— que quedaba «Abriendo ARCA
    en el servidor…» minutos y terminaba fallando. Es el mismo trámite sobre el mismo contrato; la
    pantalla que funciona es una sola.

    La pantalla es por EMPLEADORA (la validación del RNOS es por CUIT), así que una selección de varias
    se atiende de a una: una cola de grupos, y al cerrar el modal sigue el próximo.
  */
  const [colaOS, setColaOS] = useState<GrupoOS[]>([]);
  const [validandoNombres, setValidandoNombres] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  /** Avance de «Aprobar N» / «Rechazar N»: van de a una y la tanda puede tardar. */
  const [procesando, setProcesando] = useState<{ accion: "aprobar" | "rechazar"; hechas: number; total: number } | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [ayudaAbierta, setAyudaAbierta] = useState(false);

  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroProyecto, setFiltroProyecto] = useState("");

  const [clientes, setClientes] = useState<{ _id: string; name: string }[]>([]);
  const [proyectos, setProyectos] = useState<{ _id: string; name: string; clientId: any }[]>([]);

  // Catálogos de los selectores. Se piden una vez: no dependen de los filtros.
  useEffect(() => {
    clientsAPI
      .listAll()
      .then((cs) => setClientes(cs.map((c: any) => ({ _id: c._id, name: c.name }))))
      .catch((e) => console.error("Error cargando clientes:", e));
    projectsAPI
      .listAll({ limit: 500 })
      .then((ps) => setProyectos(ps.map((p: any) => ({ _id: p._id, name: p.name, clientId: p.clientId }))))
      .catch((e) => console.error("Error cargando proyectos:", e));
  }, []);

  /** Elegido un cliente, el selector de proyecto solo ofrece los suyos: si no, se puede armar una
   *  combinación cliente + proyecto que no existe y la lista vuelve vacía sin explicar por qué. */
  const proyectosDelFiltro = useMemo(() => {
    if (!filtroCliente) return proyectos;
    return proyectos.filter((p) => String(typeof p.clientId === "object" ? p.clientId?._id : p.clientId) === filtroCliente);
  }, [proyectos, filtroCliente]);

  const cargar = useCallback(
    async (pagina: number) => {
      try {
        setRefrescando(true);
        const resp = await usersAPI.listSolicitudesOverview({
          search: busqueda || undefined,
          estado: filtroEstado || undefined,
          clientId: filtroCliente || undefined,
          projectId: filtroProyecto || undefined,
          page: pagina,
          limit: PAGE_SIZE,
        });
        setRows(resp.rows);
        setTotal(resp.total);
        setTotalPages(resp.totalPages);
        setPage(resp.page);
      } catch (e) {
        console.error("Error cargando solicitudes:", e);
        sweetAlert.error("Error", "No se pudieron cargar las solicitudes.");
      } finally {
        setCargando(false);
        setRefrescando(false);
      }
    },
    [busqueda, filtroEstado, filtroCliente, filtroProyecto],
  );

  // La búsqueda va con debounce; el resto de los filtros, al toque. Cualquier cambio vuelve a la
  // página 1: quedarse en la 4 de un listado que ahora tiene 2 muestra una página vacía.
  useEffect(() => {
    const h = setTimeout(() => cargar(1), busqueda ? 350 : 0);
    return () => clearTimeout(h);
  }, [cargar, busqueda]);

  /** Cambiar de estado no necesita el wizard: es un cambio de status y se resuelve acá mismo. */
  const cambiarEstado = async (s: SolicitudVista, status: "rechazada" | "pendiente", motivo?: string) => {
    try {
      await usersAPI.setSolicitudStatus(s._id, status, motivo);
      setRevisando(null);
      sweetAlert.success(status === "rechazada" ? "Solicitud rechazada" : "Solicitud reabierta", status === "rechazada" ? "La solicitud quedó marcada como rechazada." : "Volvió a quedar pendiente de aprobación.");
      cargar(page);
    } catch (error: any) {
      sweetAlert.error("Error", error.response?.data?.error || "No se pudo cambiar el estado de la solicitud.");
    }
  };

  /*
    RECHAZAR PIDE EL MOTIVO, y es obligatorio.

    Una solicitud rechazada vuelve a quien la cargó, que tiene que saber qué corregir: sin el motivo,
    la pregunta se termina haciendo por teléfono y la solicitud se vuelve a mandar igual. Queda
    guardado en la solicitud y se ve en la tabla y en el detalle.
  */
  const pedirMotivoYRechazar = async (s: SolicitudVista) => {
    const r = await sweetAlert.prompt("¿Rechazar solicitud?", {
      text: `Contale a quien pidió el alta de ${s.nombre} por qué no se aprueba.`,
      placeholder: "Ej.: falta el CUIT, o la categoría no corresponde al rol",
      multilinea: true,
      confirmText: "Rechazar",
      mensajeVacio: "Escribí el motivo del rechazo.",
    });
    if (!r.isConfirmed) return;
    await cambiarEstado(s, "rechazada", String(r.value || "").trim());
  };

  const eliminar = async (s: SolicitudVista) => {
    const r = await sweetAlert.confirm("¿Eliminar solicitud?", textoEliminarSolicitud(s), "Sí, eliminar");
    if (!r.isConfirmed) return;
    try {
      const resultado = resultadoEliminarSolicitud(await usersAPI.eliminarSolicitud(s._id));
      if (resultado.encontrado) sweetAlert.success("Solicitud eliminada", resultado.texto);
      else sweetAlert.warning("Solicitud eliminada", resultado.texto);
      cargar(page);
    } catch (error: any) {
      sweetAlert.error("Error", error.response?.data?.error || "No se pudo eliminar la solicitud.");
    }
  };

  /**
   * EDITAR UNA APROBADA ES CORREGIR EL CONTRATO QUE CREÓ, en el mismo modal con que se aprobó.
   *
   * El server dice dónde está (proyecto, persona, posición); si no lo encuentra —p. ej. porque al
   * aprobarla se cambiaron las fechas— contesta con el motivo y se muestra tal cual.
   */
  const editarAprobada = async (s: SolicitudVista) => {
    try {
      const ubicacion = await usersAPI.contratoDeSolicitud(s._id);
      setRevisando(null);
      setAprobando({ projectId: ubicacion.projectId, solicitudId: s._id, editarContrato: { userId: ubicacion.userId, contractIndex: ubicacion.contractIndex } });
    } catch (e: any) {
      sweetAlert.error("No se pudo abrir el contrato", e?.response?.data?.error || "Probá de nuevo en un momento.");
    }
  };

  /**
   * APROBAR SE HACE ACÁ, en el wizard del proyecto abierto arriba de esta pantalla.
   *
   * Antes esto navegaba a Gestionar Equipo → pestaña Solicitudes, y ahí había que encontrar la
   * solicitud y tocar «Editar para Aprobar» de nuevo: el botón no aprobaba, mudaba de pantalla. El
   * wizard es el mismo —vive en `ProjectTeamPage`, que se monta en modo «sólo aprobación» (ver
   * `AprobacionEnModal`)—, así que lo que se completa y lo que se guarda no cambian en nada.
   *
   * Con varios proyectos pedidos se aprueba para el primero; los demás quedan a la vista en las
   * columnas Cliente y Proyecto.
   */
  const irAAprobar = (s: SolicitudVista) => {
    const destino = s.proyectos?.[0];
    if (!destino) {
      sweetAlert.error("Sin proyecto", "La solicitud no tiene un proyecto asignado, así que no hay equipo al que agregarla.");
      return;
    }
    setRevisando(null);
    setAprobando({ projectId: destino._id, solicitudId: s._id });
  };

  /** Las filas del server ya vienen con la forma que espera la tabla. */
  const solicitudes: SolicitudVista[] = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        proyectos: r.proyectos?.map((p) => ({ _id: p._id, name: p.name, clienteNombre: p.clienteNombre })),
      })),
    [rows],
  );

  const hayFiltros = !!(busqueda || filtroEstado || filtroCliente || filtroProyecto);

  useEffect(() => {
    setSeleccion(new Map());
  }, [busqueda, filtroEstado, filtroCliente, filtroProyecto]);

  const cambiarSeleccion = (ids: Set<string>) =>
    setSeleccion((antes) => {
      const nueva = new Map<string, Elegida>();
      for (const id of ids) {
        const s = solicitudes.find((x) => x._id === id);
        nueva.set(id, s ? elegidaDe(s) : antes.get(id)!);
      }
      return nueva;
    });

  /** Todas las que coinciden con los filtros, de todas las páginas. */
  const seleccionarTodas = async () => {
    try {
      const nueva = new Map(seleccion);
      for (let pagina = 1, paginas = 1; pagina <= paginas; pagina++) {
        const resp = await usersAPI.listSolicitudesOverview({ search: busqueda || undefined, estado: filtroEstado || undefined, clientId: filtroCliente || undefined, projectId: filtroProyecto || undefined, page: pagina, limit: 100 });
        paginas = resp.totalPages;
        for (const r of resp.rows) nueva.set(r._id, elegidaDe(r));
      }
      setSeleccion(nueva);
    } catch {
      sweetAlert.error("Error", "No se pudieron seleccionar todas.");
    }
  };

  /** Las pendientes de la selección: son las únicas que se aprueban o rechazan. */
  const pendientesSeleccionadas = [...seleccion.entries()].filter(([, x]) => x.estado === "pendiente");

  /*
    RECHAZAR VARIAS: un motivo para todas. Es el mismo rechazo de a una (`setSolicitudStatus`), así que
    cada solicitud vuelve a quien la pidió con ese motivo, igual que desde el botón de su fila.
  */
  const rechazarSeleccionadas = async () => {
    const lista = pendientesSeleccionadas;
    if (!lista.length) return;
    const r = await sweetAlert.prompt(`¿Rechazar ${lista.length} ${lista.length === 1 ? "solicitud" : "solicitudes"}?`, {
      text: "Contale a quien las pidió por qué no se aprueban. El mismo motivo va a cada una.",
      placeholder: "Ej.: el equipo se contrata la semana que viene",
      multilinea: true,
      confirmText: `Rechazar ${lista.length}`,
      mensajeVacio: "Escribí el motivo del rechazo.",
    });
    if (!r.isConfirmed) return;
    const motivo = String(r.value || "").trim();
    const fallidas: string[] = [];
    setProcesando({ accion: "rechazar", hechas: 0, total: lista.length });
    for (const [i, [id, x]] of lista.entries()) {
      try {
        await usersAPI.setSolicitudStatus(id, "rechazada", motivo);
      } catch (e: any) {
        fallidas.push(`${x.nombre}: ${e?.response?.data?.error || "no se pudo rechazar"}`);
      }
      setProcesando({ accion: "rechazar", hechas: i + 1, total: lista.length });
    }
    setProcesando(null);
    setSeleccion(new Map());
    const hechas = lista.length - fallidas.length;
    if (fallidas.length) sweetAlert.warningAlert(`Se rechazaron ${hechas} de ${lista.length}`, fallidas.join("\n"));
    else sweetAlert.success("Solicitudes rechazadas", `Se rechazaron ${hechas}.`);
    cargar(page);
  };

  /*
    APROBAR VARIAS, SIN ABRIR EL FORMULARIO: tal cual se pidieron.

    El contrato lo arma `contratoDesdeSolicitud`, que repite lo que hace el formulario de Agregar
    Miembro al aprobar, y se guarda por el mismo `assign-member` —con sus validaciones del server—.
    Lo que el formulario resolvería preguntando (una categoría que falta, el motivo de una categoría de
    otra valoración) no se inventa: esa solicitud queda pendiente y se dice por qué, para aprobarla a
    mano con «Editar para Aprobar». De a una: si una falla, las demás siguen.
  */
  const aprobarSeleccionadas = async () => {
    const lista = pendientesSeleccionadas;
    if (!lista.length) return;
    const r = await sweetAlert.confirm(
      `¿Aprobar ${lista.length} ${lista.length === 1 ? "solicitud" : "solicitudes"}?`,
      "Se aprueban tal cual se pidieron: cada una crea su contrato en el equipo del proyecto, igual que «Editar para Aprobar» sin cambiar nada. Las que tengan datos incompletos quedan pendientes y te digo por qué.",
      `Aprobar ${lista.length}`,
    );
    if (!r.isConfirmed) return;

    setProcesando({ accion: "aprobar", hechas: 0, total: lista.length });
    let cat: CatalogosAprobacion;
    try {
      // Las mismas listas y las mismas claves de caché que el formulario (`ProjectTeamPage`).
      const [sedes, categoriasSat, estados, roleFrames, contratoFrames, contratos] = await Promise.all([
        cachedFetch("info:sede", () => infoAPI.listByType("sede")),
        cachedFetch("categoriaSat:all", () => categoriaSatAPI.list()),
        cachedFetch("info:estado-empleado", () => infoAPI.listByType("estado-empleado")),
        cachedFetch("roleFrames:all", () => roleFrameAPI.list()),
        cachedFetch("contratoFrames:all", () => contratoFrameAPI.list()),
        cachedFetch("contratos:all", () => contratosAPI.list()),
      ]);
      cat = { sedes, categoriasSat, estados, roleFrames, contratoFrames, contratos };
    } catch {
      setProcesando(null);
      sweetAlert.error("No se pudo aprobar", "No se pudieron cargar los catálogos. Probá de nuevo.");
      return;
    }

    const proyectos = new Map<string, Awaited<ReturnType<typeof projectsAPI.getProject>>>();
    const pendientes: string[] = [];
    for (const [i, [id, x]] of lista.entries()) {
      try {
        const solicitud = await usersAPI.get(id);
        const projectId = String((solicitud.metadata as any)?.projectIds?.[0] || "");
        if (!projectId) throw new Error("no tiene proyecto");
        const idReal = String((solicitud.metadata as any)?.solicitudUserId || "");
        const persona = idReal && idReal !== id ? await usersAPI.get(idReal) : solicitud;
        if (!proyectos.has(projectId)) proyectos.set(projectId, await projectsAPI.getProject(projectId, { team: "ids" }));
        const proyecto: any = proyectos.get(projectId)!;
        const armado = contratoDesdeSolicitud({ solicitud, persona, proyecto, cat });
        if (!armado.ok) throw new Error(`falta ${armado.faltan.join(", ")}`);
        await projectsAPI.assignMember(projectId, { userId: persona._id, isUpdate: false, approveSolicitud: id, contract: armado.armado.contract });
        if (armado.armado.rolParaLaFicha) {
          // Como el formulario: el rol pedido se suma a la ficha. El contrato ya quedó; esto no lo frena.
          await usersAPI.agregarRolesFrame(persona._id, [armado.armado.rolParaLaFicha._id]).catch(() => {});
        }
      } catch (e: any) {
        pendientes.push(`${x.nombre}: ${e?.response?.data?.error || e?.message || "no se pudo aprobar"}`);
      }
      setProcesando({ accion: "aprobar", hechas: i + 1, total: lista.length });
    }
    setProcesando(null);
    setSeleccion(new Map(lista.filter(([, x]) => pendientes.some((p) => p.startsWith(`${x.nombre}:`)))));
    const aprobadas = lista.length - pendientes.length;
    if (pendientes.length) {
      sweetAlert.warningAlert(
        `Se aprobaron ${aprobadas} de ${lista.length}`,
        `Quedaron pendientes (y seleccionadas); aprobalas con «Editar para Aprobar»:\n\n${pendientes.join("\n")}`,
      );
    } else sweetAlert.success("Solicitudes aprobadas", `Se aprobaron ${aprobadas}: cada una ya tiene su contrato.`);
    cargar(page);
  };

  /*
    VALIDAR NOMBRES EN ARCA: el mismo `validarNombres` de Usuarios, sobre la selección.

    Se valida la PERSONA (`personaId`, que resuelve el server): la del contrato si ya está aprobada,
    la que apunta la solicitud si es de la app, o la solicitud misma si no apunta a nadie. El CUIT que
    se mira es el de ella. Quien ya tiene el sello no se vuelve a consultar.
  */
  const conCuit = [...seleccion.entries()].filter(([, x]) => !x.sinCuit && cuitEsValido(String(x.cuit || "")));
  const validarNombresSeleccion = async () => {
    if (!conCuit.length) return;
    const ids = [...new Set(conCuit.map(([id, x]) => x.personaId || id))];
    const ok = await sweetAlert.confirm(
      `¿Validar ${conCuit.length} ${conCuit.length === 1 ? "nombre" : "nombres"} con ARCA?`,
      "Se consulta el Padrón por cada CUIT y, si ARCA tiene otro nombre, se reemplaza por el del organismo. Es lo mismo que «Validar nombres en ARCA» de Usuarios.",
      "Sí, validar",
    );
    if (!ok.isConfirmed) return;
    setValidandoNombres(true);
    try {
      const r = await afipAPI.validarNombres({ userIds: ids, limite: 300 });
      if (r.motivoSinConsultar) {
        sweetAlert.warningAlert("No se pudo consultar", r.motivoSinConsultar);
        return;
      }
      const lineas = [
        r.consultados > 0 ? `${r.consultados} consultado(s) en ARCA.` : "No hizo falta consultar a nadie: ya estaban validados.",
        r.renombrados.length > 0 ? `${r.renombrados.length} nombre(s) corregido(s): ${r.renombrados.map((x) => `${x.antes} → ${x.ahora}`).join(" · ")}.` : r.consultados > 0 ? "Todos los nombres ya coincidían." : "",
        r.noEncontrados.length > 0 ? `ARCA no reconoció ${r.noEncontrados.length}: ${r.noEncontrados.map((x) => `${x.cuit} (${x.motivo})`).join(" · ")}.` : "",
        r.inactivos.length > 0 ? `${r.inactivos.length} CUIT existen pero están INACTIVOS: el nombre no se pudo confirmar.` : "",
        r.cuitInvalido > 0 ? `${r.cuitInvalido} con CUIT inválido: revisá el dato.` : "",
      ].filter(Boolean);
      if (r.noEncontrados.length || r.inactivos.length || r.cuitInvalido) sweetAlert.warningAlert("Validación de nombres", lineas.join("\n"));
      else sweetAlert.success("Nombres validados", lineas.join(" "));
      cargar(page);
    } catch (e: any) {
      sweetAlert.error("No se pudo validar", e?.response?.data?.error || "Probá de nuevo en un momento.");
    } finally {
      setValidandoNombres(false);
    }
  };

  /*
    VALIDAR OBRAS SOCIALES: sólo las APROBADAS que todavía no la tienen validada, que son las que ya
    tienen contrato donde guardarla. La empleadora y el CUIL salen del CONTRATO (`obraSocial`), no de
    lo que pidió la solicitud: al aprobar se pudo cambiar la empleadora, y el contrato puede ser de otra
    persona que la solicitud de paso. Las demás de la selección se dicen y se saltean.
  */
  const filaParaValidar = (x: Elegida): { nombre: string; os: ObraSocialDeSolicitud } | null => {
    const os = x.obraSocial;
    // Mismo requisito que la grilla de Contratos: empleadora Y categoría (de ella sale el convenio, y de él la obra social por defecto).
    if (x.estado !== "aprobada" || !os || os.estado !== "sin_constatar" || !os.empresaContratoId || !os.tieneCategoria || !cuitEsValido(os.cuil)) return null;
    return { nombre: x.nombre, os };
  };
  const aValidarOS = [...seleccion.values()].map(filaParaValidar).filter((f): f is { nombre: string; os: ObraSocialDeSolicitud } => !!f);
  const validarObrasSocialesSeleccion = async () => {
    const salteadas = seleccion.size - aValidarOS.length;
    if (salteadas > 0) {
      const r = await sweetAlert.confirm(
        `¿Validar ${aValidarOS.length} ${aValidarOS.length === 1 ? "obra social" : "obras sociales"}?`,
        `${salteadas === 1 ? "1 seleccionada se saltea" : `${salteadas} seleccionadas se saltean`}: la obra social se guarda en el contrato, así que sólo se validan las APROBADAS que tienen empleadora y CUIL y todavía no la tienen validada. Las pendientes, aprobalas primero.`,
        "Validar",
      );
      if (!r.isConfirmed) return;
    }
    setColaOS(gruposDeValidacion(aValidarOS));
  };

  const eliminarSeleccionadas = async () => {
    const lista = [...seleccion.entries()];
    const aprobadas = lista.filter(([, x]) => x.estado === "aprobada").length;
    const r = await sweetAlert.confirm(
      `¿Eliminar ${lista.length} ${lista.length === 1 ? "solicitud" : "solicitudes"}?`,
      `${aprobadas ? `${aprobadas} ${aprobadas === 1 ? "está aprobada: se elimina también el contrato que creó" : "están aprobadas: se elimina también el contrato que creó cada una"}. ` : ""}Esta acción no se puede deshacer.`,
      `Sí, eliminar ${lista.length}`,
    );
    if (!r.isConfirmed) return;
    setEliminando(true);
    // De a una, con el mismo endpoint que el botón de cada fila: cada una borra lo suyo (y su contrato, si estaba aprobada).
    const fallidas: string[] = [];
    for (const [id, x] of lista) {
      try {
        await usersAPI.eliminarSolicitud(id);
      } catch {
        fallidas.push(x.nombre);
      }
    }
    setEliminando(false);
    setSeleccion(new Map(lista.filter(([, x]) => fallidas.includes(x.nombre))));
    const hechas = lista.length - fallidas.length;
    if (fallidas.length) sweetAlert.error(`Se eliminaron ${hechas} de ${lista.length}`, `No se pudieron eliminar: ${fallidas.join(", ")}. Quedaron seleccionadas.`);
    else sweetAlert.success("Solicitudes eliminadas", `Se eliminaron ${hechas} ${hechas === 1 ? "solicitud" : "solicitudes"}.`);
    cargar(page);
  };

  return (
    <PageLayout
      title="Solicitudes"
      subtitle="Todas las solicitudes de alta, de todos los clientes y proyectos."
      faIcon={{ icon: faUserPlus }}
      itemCount={total}
      infoModal={{
        isOpen: ayudaAbierta,
        onOpen: () => setAyudaAbierta(true),
        onClose: () => setAyudaAbierta(false),
        title: ayuda?.title || "Ayuda",
        size: ayuda?.size as any,
        content: ayuda?.content,
      }}
      shouldShowInfo={hasHelp(CLAVE_AYUDA)}
      /*
        Los filtros van detrás del botón de embudo, en el modal "Filtros Avanzados", igual que en
        Contratos: `SearchAndFilters` ya trae la búsqueda, el botón, el modal, los chips de lo que
        está aplicado y el "Limpiar Todo". Sueltos arriba de la tabla ocupaban tres renglones para
        algo que casi siempre queda en "todos".
      */
      searchAndFilters={
        <SearchAndFilters
          searchTerm={busqueda}
          onSearchChange={setBusqueda}
          searchPlaceholder="Buscar por nombre o email..."
          selectFilters={[
            {
              label: "Cliente",
              value: filtroCliente,
              // El proyecto elegido puede no ser de este cliente: se limpia para no dejar una
              // combinación que no existe y devuelve vacío sin explicar por qué.
              onChange: (v) => {
                setFiltroCliente(v);
                setFiltroProyecto("");
              },
              placeholder: "Todos los clientes",
              options: clientes.map((c) => ({ value: c._id, label: c.name })),
            },
            {
              label: "Proyecto",
              value: filtroProyecto,
              onChange: setFiltroProyecto,
              placeholder: "Todos los proyectos",
              options: proyectosDelFiltro.map((p) => ({ value: p._id, label: p.name })),
            },
            {
              label: "Estado",
              value: filtroEstado,
              onChange: setFiltroEstado,
              placeholder: "Todos los estados",
              options: ESTADOS_SOLICITUD.map((e) => ({ value: e, label: ESTADO_SOLICITUD[e].texto })),
            },
          ]}
        />
      }
    >
      {cargando ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner message="Cargando solicitudes..." />
        </div>
      ) : solicitudes.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center h-48 text-gray-500">
          <FontAwesomeIcon icon={faUserPlus} className="h-10 w-10 mb-3 opacity-10" />
          <p className="text-sm font-medium">{hayFiltros ? "Ninguna solicitud coincide con los filtros" : "Todavía no hay solicitudes de alta"}</p>
          <p className="text-xs mt-1 text-gray-400">Las solicitudes de alta desde mobile aparecen acá.</p>
        </div>
      ) : (
        <div className={`space-y-3 transition-opacity ${refrescando ? "opacity-60" : ""}`}>
          {seleccion.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm dark:border-blue-900 dark:bg-blue-950/40">
              <span className="font-semibold text-blue-900 dark:text-blue-100">
                {seleccion.size} {seleccion.size === 1 ? "seleccionada" : "seleccionadas"}
              </span>
              {seleccion.size < total && (
                <button type="button" onClick={() => void seleccionarTodas()} className="font-semibold text-blue-700 hover:underline dark:text-blue-300">
                  Seleccionar las {total}
                </button>
              )}
              <button type="button" onClick={() => setSeleccion(new Map())} className="font-semibold text-gray-600 hover:underline dark:text-gray-300">
                Quitar selección
              </button>
              {/* Aprobar y rechazar valen para las PENDIENTES de la selección; las demás se ignoran. */}
              {pendientesSeleccionadas.length > 0 && (
                <>
                  <button type="button" onClick={() => void aprobarSeleccionadas()} disabled={!!procesando || eliminando} className="ml-auto inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                    <FontAwesomeIcon icon={faCheck} />
                    {procesando?.accion === "aprobar" ? `Aprobando ${procesando.hechas} de ${procesando.total}…` : `Aprobar ${pendientesSeleccionadas.length}`}
                  </button>
                  <button type="button" onClick={() => void rechazarSeleccionadas()} disabled={!!procesando || eliminando} className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1.5 font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30">
                    <FontAwesomeIcon icon={faXmark} />
                    {procesando?.accion === "rechazar" ? `Rechazando ${procesando.hechas} de ${procesando.total}…` : `Rechazar ${pendientesSeleccionadas.length}`}
                  </button>
                </>
              )}
              {/* Validar en ARCA: el nombre (cualquiera con CUIT) y la obra social (sólo aprobadas). */}
              {conCuit.length > 0 && (
                <button type="button" onClick={() => void validarNombresSeleccion()} disabled={validandoNombres || !!procesando} className={`${pendientesSeleccionadas.length > 0 ? "" : "ml-auto "}inline-flex items-center gap-2 rounded-lg border border-blue-300 px-3 py-1.5 font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40`}>
                  {validandoNombres ? "Validando…" : `Validar ${conCuit.length === 1 ? "nombre" : "nombres"} en ARCA`}
                </button>
              )}
              {aValidarOS.length > 0 && (
                <button type="button" onClick={() => void validarObrasSocialesSeleccion()} disabled={colaOS.length > 0 || !!procesando} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 px-3 py-1.5 font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40">
                  Validar obra social ({aValidarOS.length})
                </button>
              )}
              <button type="button" onClick={() => void eliminarSeleccionadas()} disabled={eliminando || !!procesando} className={`${pendientesSeleccionadas.length > 0 || conCuit.length > 0 || aValidarOS.length > 0 ? "" : "ml-auto "}inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white hover:bg-red-700 disabled:opacity-50`}>
                <FontAwesomeIcon icon={faTrash} />
                {eliminando ? "Eliminando…" : `Eliminar ${seleccion.size}`}
              </button>
            </div>
          )}
          {colaOS[0] && (
            <Modal
              isOpen
              onClose={() => setColaOS((c) => c.slice(1))}
              title={colaOS[0].filas.length === 1 ? `Validar obra social — ${colaOS[0].filas[0].row.userName}` : `Validar obras sociales (${colaOS[0].filas.length})`}
              subtitle={`${colaOS[0].empleadora}${colaOS.length > 1 ? ` · al cerrar siguen ${colaOS.length - 1} empleadora${colaOS.length - 1 === 1 ? "" : "s"} más` : ""}`}
              size="95"
              zIndex={70}
            >
              <PantallaValidarObrasSociales filas={colaOS[0].filas} empleadora={colaOS[0].empleadora} empleadoraCuit={colaOS[0].empleadoraCuit} empresaId={colaOS[0].empresaId} onRefrescar={() => cargar(page)} onLoteAplicado={() => cargar(page)} />
            </Modal>
          )}
          <SolicitudesTable
            seleccionadas={new Set(seleccion.keys())}
            onCambiarSeleccion={cambiarSeleccion}
            solicitudes={solicitudes}
            catalogos={catalogos}
            mostrarProyectos
            onVerDetalle={setRevisando}
            onAprobar={irAAprobar}
            tituloAprobar={(s) => (s.proyectos?.[0] ? `Aprobar en ${s.proyectos[0].name}` : "Sin proyecto asignado")}
            onRechazar={pedirMotivoYRechazar}
            onReabrir={(s) => cambiarEstado(s, "pendiente")}
            onEliminar={eliminar}
            onEditarAprobada={editarAprobada}
            renderObraSocial={(s) => {
              const vista = vistaObraSocialDe(s.nombre, s.obraSocial);
              return vista ? <CeldaObraSocial vista={vista} onValidar={() => s.obraSocial && setColaOS(gruposDeValidacion([{ nombre: s.nombre, os: s.obraSocial }]))} onQuitado={() => cargar(page)} /> : <span className="text-xs text-gray-400">—</span>;
            }}
          />

          {/* Revisar acá; aprobar sigue llevando al equipo del proyecto, que es donde se carga el contrato. */}
          <SolicitudDetalleModal
            isOpen={!!revisando}
            onClose={() => setRevisando(null)}
            solicitud={revisando}
            catalogos={catalogos}
            proyectos={revisando?.proyectos}
            onAprobar={irAAprobar}
            onRechazar={pedirMotivoYRechazar}
            onCalificar={(s, userId) => setCalificando({ solicitudId: s._id, userId, nombre: s.nombre })}
          />

          {/* Calificar a la persona de una renovación, con su historial a la vista: ayuda a decidir. */}
          <CalificacionesModal
            isOpen={!!calificando}
            onClose={() => setCalificando(null)}
            nombre={calificando?.nombre || ""}
            ayuda="Cómo fue su actuación en el contrato que se renueva."
            empezarCalificando
            cargar={() => calificacionesAPI.historial(calificando!.userId)}
            calificar={(c) => calificacionesAPI.calificar(calificando!.userId, c, "solicitud_renovacion", calificando!.solicitudId)}
          />

          {/*
            EL WIZARD DE CONTRATACIÓN, ARRIBA DE ESTA PANTALLA.

            Se monta `ProjectTeamPage` en modo «sólo aprobación»: dibuja sus modales y nada más. Es
            la misma pantalla que se abría antes con un `navigate`, con la diferencia de que no se
            pierde el listado ni los filtros que se estaban mirando.
          */}
          {aprobando && (
            <ProjectTeamPage
              soloAprobacion={{
                ...aprobando,
                onCerrar: () => setAprobando(null),
                onAprobada: () => {
                  setAprobando(null);
                  cargar(page);
                },
              }}
            />
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-gray-500">
                Página {page} de {totalPages} · {total} solicitud{total === 1 ? "" : "es"}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" disabled={page <= 1} onClick={() => cargar(page - 1)} className="p-2 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800">
                  <FontAwesomeIcon icon={faChevronLeft} className="h-3 w-3" />
                </button>
                <button type="button" disabled={page >= totalPages} onClick={() => cargar(page + 1)} className="p-2 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800">
                  <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {/*
        La ventana va FUERA del listado: la carga masiva es lo primero que se usa en una cuenta que
        todavía no tiene ninguna solicitud, y ahí lo que se dibuja es el estado vacío.
      */}
    </PageLayout>
  );
};

export default SolicitudesPage;

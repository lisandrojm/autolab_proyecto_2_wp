import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUserPlus, faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { usersAPI, SolicitudOverviewRow } from "../api/users";
import { clientsAPI } from "../api/clients";
import { projectsAPI } from "../api/projects";
import { sweetAlert } from "../utils/sweetAlert";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { ESTADOS_SOLICITUD, ESTADO_SOLICITUD, SolicitudVista, SolicitudesTable, useCatalogosDeSolicitudes } from "../components/solicitudes/SolicitudesTable";
import { SolicitudDetalleModal } from "../components/solicitudes/SolicitudDetalleModal";

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

export const SolicitudesPage: React.FC = () => {
  const navigate = useNavigate();
  const catalogos = useCatalogosDeSolicitudes();
  /** La solicitud que se está revisando: el detalle completo, antes de decidir. */
  const [revisando, setRevisando] = useState<SolicitudVista | null>(null);
  const ayuda = getHelp(CLAVE_AYUDA);

  const [rows, setRows] = useState<SolicitudOverviewRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [cargando, setCargando] = useState(true);
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
    const r = await sweetAlert.confirm("¿Eliminar solicitud?", `Se eliminará definitivamente la solicitud de ${s.nombre}. Esta acción no se puede deshacer.`, "Sí, eliminar");
    if (!r.isConfirmed) return;
    try {
      await usersAPI.rejectSolicitud(s._id);
      sweetAlert.success("Solicitud eliminada", "La solicitud fue eliminada.");
      cargar(page);
    } catch (error: any) {
      sweetAlert.error("Error", error.response?.data?.error || "No se pudo eliminar la solicitud.");
    }
  };

  /**
   * Aprobar NO se hace acá: necesita el wizard de Configurar Miembro del proyecto, que es donde se
   * completan el contrato, el área y el turno. Así que esto lleva a la pestaña Solicitudes de ese
   * proyecto, con la solicitud ya en pantalla. Con varios proyectos pedidos se va al primero; los
   * demás quedan a la vista en la columna Cliente / Proyecto.
   */
  const irAAprobar = (s: SolicitudVista) => {
    const destino = s.proyectos?.[0];
    if (!destino) {
      sweetAlert.error("Sin proyecto", "La solicitud no tiene un proyecto asignado, así que no hay equipo al que agregarla.");
      return;
    }
    navigate(`/projects/${destino._id}/team?tab=solicitudes`);
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
          <SolicitudesTable
            solicitudes={solicitudes}
            catalogos={catalogos}
            mostrarProyectos
            onVerDetalle={setRevisando}
            onAprobar={irAAprobar}
            tituloAprobar={(s) => (s.proyectos?.[0] ? `Aprobar en ${s.proyectos[0].name}` : "Sin proyecto asignado")}
            onRechazar={pedirMotivoYRechazar}
            onReabrir={(s) => cambiarEstado(s, "pendiente")}
            onEliminar={eliminar}
          />

          {/* Revisar acá; aprobar sigue llevando al equipo del proyecto, que es donde se carga el contrato. */}
          <SolicitudDetalleModal isOpen={!!revisando} onClose={() => setRevisando(null)} solicitud={revisando} catalogos={catalogos} proyectos={revisando?.proyectos} onAprobar={irAAprobar} onRechazar={pedirMotivoYRechazar} />

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
    </PageLayout>
  );
};

export default SolicitudesPage;

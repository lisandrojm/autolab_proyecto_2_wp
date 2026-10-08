import React, { useEffect, useState } from "react";
import { faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { usersAPI, ContractOverviewRow } from "../api/users";
import { contratoFrameAPI, ContratoFrameItem, plantillaActivaParaFiltrar } from "../api/contratosFrame";
import { infoAPI, InfoItem } from "../api/info";
import { EstadoImpositivoCell, Paginador } from "../components/contratos/ContractBulkTabs";
import { ProjectTeamPage } from "./ProjectTeamPage";
import { ContractActionsButtons, ContractActionsHeader } from "../components/contratos/ContractRowDocs";
import { EstadoBadge } from "../components/EstadoSelect";
import { formatDate } from "../components/team/ContractCard";
import { cuitDisplay } from "../components/contratos/ConstanciaBulk";
import { clientsAPI } from "../api/clients";
import { projectsAPI } from "../api/projects";
import { cachedFetch } from "../utils/refCache";
import { BotonOrden, useOrden } from "../components/ui/OrdenTabla";

/*
  RENOVACIONES: el acceso simple para renovar contratos vencidos.

  Es la misma lista que Contratos —una fila por persona y proyecto, con el contrato que rige—, pero
  solo las que NO tienen ningún contrato vigente en ese proyecto (`vigencia=novigente`): son las que
  hay que renovar o dejar ir. Ordenadas por la fecha de alta, la más reciente primero.

  «Renovar» es el MISMO botón de Contratos (`BotonRenovar`): abre el modal del equipo con el contrato
  vencido precargado y las fechas vacías, y guarda un contrato nuevo. Ese contrato nace en el estado
  impositivo de su tipo, así que cae solo en Trámite impositivo (Alta temprana de ARCA o Constancia de
  CUIT): no hay nada que mover a mano. Editar y eliminar son las acciones de siempre de la fila.
*/

/** Cuántas filas por página se pueden elegir. */
const TAMANIOS_PAGINA = [25, 50, 100];

/*
  LAS CUATRO COLUMNAS FIJAS: Fecha de creación, Renovar, Último contrato y Usuario. `sticky` pide un
  `left` exacto, así que cada una tiene ancho cerrado y la siguiente arranca donde termina la anterior:

    Fecha 0 → 8rem · Renovar 8 → 15rem · Último contrato 15 → 25rem · Usuario desde 25rem
*/
const FIJA_FECHA = "w-32 min-w-[8rem] max-w-[8rem]";
const IZQ_RENOVAR = "left-[8rem]";
const FIJA_RENOVAR = "w-28 min-w-[7rem] max-w-[7rem]";
const IZQ_ULTIMO = "left-[15rem]";
const FIJA_ULTIMO = "w-40 min-w-[10rem] max-w-[10rem]";
const IZQ_USUARIO = "left-[25rem]";
/** La última fija lleva el borde y la sombra que marcan dónde empieza lo que se desplaza. */
const FIN_FIJAS = "border-r-2 border-gray-300 dark:border-gray-600 shadow-[4px_0_6px_-4px_rgba(0,0,0,0.25)]";
/** Fondo opaco: por una celda fija transparente se verían pasar las de atrás. */
const celdaFija = "px-4 py-3 z-[5] bg-white dark:bg-gray-800 group-hover:bg-gray-50 dark:group-hover:bg-[#1c2634]";

/** `fecha_carga` viene ISO (alta desde el proyecto) o «AAAA-MM-DD» (desde el usuario). La ISO va a hora local. */
const fechaDeCreacion = (s?: string): string => {
  if (!s) return "";
  if (s.includes("T")) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }
  return formatDate(s);
};

export const RenovacionesPage: React.FC = () => {
  const [filas, setFilas] = useState<ContractOverviewRow[] | null>(null);
  /** Pidiendo una página: la tabla anterior queda a la vista, con un indicador, en vez de desaparecer. */
  const [cargando, setCargando] = useState(false);
  const [porPagina, setPorPagina] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [pagina, setPagina] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const [contratoFrames, setContratoFrames] = useState<ContratoFrameItem[]>([]);
  const [allEstados, setAllEstados] = useState<InfoItem[]>([]);
  const [ayuda, setAyuda] = useState(false);
  const [recarga, setRecarga] = useState(0);
  /*
    ORDEN COMO UN DATATABLE: click asc → desc → sin orden. Lo hace el SERVER (la lista está paginada).
    Sin orden elegido, el de siempre: fecha de alta del último contrato, la más reciente primero.
  */
  const { orden, alternar } = useOrden();
  /*
    EL MODAL DE RENOVAR, EN ESTA PANTALLA. Se monta `ProjectTeamPage` en modo modal (como Solicitudes):
    el mismo «Renovar contrato» de Gestionar Equipo, sin perder la lista ni los filtros. Al guardar se
    recarga: la persona ya tiene un contrato vigente y sale de acá.
  */
  const [renovando, setRenovando] = useState<{ projectId: string; userId: string; contractIndex: number } | null>(null);
  const ordenProps = { orden, onAlternar: alternar };
  /*
    LOS FILTROS DE CONTRATOS, hasta Proyecto, más el tipo de contrato. Sin «Contratos» (vigentes / no
    vigentes): acá todos son no vigentes. Sin «Novedades»: no tiene que ver con renovar.
  */
  const [filterUserStatus, setFilterUserStatus] = useState("");
  const [filterClientId, setFilterClientId] = useState("");
  const [filterProjectId, setFilterProjectId] = useState("");
  /*
    TIPOS DE CONTRATO: VARIOS A LA VEZ, dentro de Filtros Avanzados (`multiSelectFilters`): un campo como
    select que abre un modal de casillas, y lo elegido como badges. Acá lo normal es mirar, por ejemplo,
    todos los «Eventual…» juntos.
  */
  const [tiposElegidos, setTiposElegidos] = useState<string[]>([]);

  const [clientOptions, setClientOptions] = useState<{ id: string; name: string }[]>([]);
  const [projectOptions, setProjectOptions] = useState<{ id: string; name: string; clientId: string }[]>([]);

  useEffect(() => {
    // Los mismos catálogos (y la misma caché) que Contratos.
    void Promise.all([cachedFetch("clients:all", () => clientsAPI.listAll({ limit: 500 })), cachedFetch("projects:all", () => projectsAPI.listAll({ limit: 500 }))])
      .then(([clients, projects]) => {
        setClientOptions((clients as any[]).map((c) => ({ id: String(c._id), name: String(c.name || "") })).sort((a, b) => a.name.localeCompare(b.name)));
        setProjectOptions((projects as any[]).map((p) => ({ id: String(p._id), name: String(p.name || ""), clientId: String(p.clientId?._id || p.clientId || "") })).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {});
  }, []);
  // Con un cliente elegido, el proyecto se elige entre los suyos; si el elegido no es de ese cliente, se suelta.
  const proyectosOfrecidos = filterClientId ? projectOptions.filter((p) => p.clientId === filterClientId) : projectOptions;
  useEffect(() => {
    if (filterProjectId && filterClientId && !projectOptions.some((p) => p.id === filterProjectId && p.clientId === filterClientId)) setFilterProjectId("");
  }, [filterClientId, filterProjectId, projectOptions]);

  // Lo que necesita la columna «Estado impositivo» (la misma celda de Contratos).
  useEffect(() => {
    contratoFrameAPI.list().then(setContratoFrames).catch(() => setContratoFrames([]));
    infoAPI.listByType("estado-empleado").then(setAllEstados).catch(() => setAllEstados([]));
  }, []);

  // El buscador vuelve a la primera página; se espera un momento para no pedir una vez por tecla.
  useEffect(() => {
    setPagina(1);
  }, [busqueda, filterUserStatus, filterClientId, filterProjectId, tiposElegidos, orden, porPagina]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    const t = setTimeout(() => {
      usersAPI
        .listContractsOverview({
          page: pagina,
          limit: porPagina,
          search: busqueda.trim() || undefined,
          vigencia: "novigente",
          metadataActivo: filterUserStatus ? String(filterUserStatus === "active") : undefined,
          clientId: filterClientId || undefined,
          projectId: filterProjectId || undefined,
          tiposContrato: tiposElegidos.length > 0 ? tiposElegidos : undefined,
          sort: orden ? orden.columna : "altaBaja",
          dir: orden ? orden.direccion : "desc",
        })
        .then((r) => {
          if (cancelado) return;
          setFilas(r.rows);
          setTotal(r.total);
          setTotalPaginas(r.totalPages);
        })
        .catch(() => !cancelado && setFilas([]))
        .finally(() => !cancelado && setCargando(false));
    }, 250);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [pagina, porPagina, busqueda, recarga, filterUserStatus, filterClientId, filterProjectId, tiposElegidos, orden]);

  const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900";

  return (
    <PageLayout
      title="Renovaciones"
      subtitle="Contratos vencidos, sin otro vigente en el proyecto: renovarlos desde acá."
      faIcon={{ icon: faRotateRight }}
      itemCount={total}
      infoModal={{
        isOpen: ayuda,
        onOpen: () => setAyuda(true),
        onClose: () => setAyuda(false),
        title: "Renovaciones",
        content: (
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <p>Están las personas que no tienen ningún contrato vigente en el proyecto, con su último contrato. Arriba, las más recientes.</p>
            <p>
              <strong>Renovar</strong> abre el mismo formulario que en Contratos: el contrato vencido precargado y las fechas vacías. Al guardar se crea un contrato nuevo y el vencido queda en el
              historial.
            </p>
            <p>El contrato nuevo arranca en el estado impositivo de su tipo, así que pasa solo a Trámite impositivo (Alta temprana de ARCA o Constancia de CUIT).</p>
          </div>
        ),
      }}
      shouldShowInfo
      searchAndFilters={
        <SearchAndFilters
          searchTerm={busqueda}
          onSearchChange={setBusqueda}
          searchPlaceholder="Buscar por usuario, proyecto o contrato..."
          radioFilters={[
            {
              label: "Estado de usuarios",
              value: filterUserStatus,
              onChange: setFilterUserStatus,
              options: [
                { label: "Usuarios Activos", value: "active" },
                { label: "Usuarios Inactivos", value: "inactive" },
                { label: "Todos los usuarios", value: "" },
              ],
            },
          ]}
          selectFilters={[
            { label: "Cliente", value: filterClientId, onChange: setFilterClientId, placeholder: "Todos los clientes", options: clientOptions.map((c) => ({ value: c.id, label: c.name })) },
            { label: "Proyecto", value: filterProjectId, onChange: setFilterProjectId, placeholder: "Todos los proyectos", options: proyectosOfrecidos.map((p) => ({ value: p.id, label: p.name })) },
          ]}
          multiSelectFilters={[
            {
              label: "Tipo de contrato",
              values: tiposElegidos,
              onChange: setTiposElegidos,
              placeholder: "Todos los tipos",
              options: [...new Set(contratoFrames.filter(plantillaActivaParaFiltrar).map((cf) => cf.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" })).map((n) => ({ value: n, label: n })),
            },
          ]}
        />
      }
    >
      {filas === null ? (
        <LoadingSpinner />
      ) : filas.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-800">
          <FontAwesomeIcon icon={faRotateRight} className="mb-3 h-10 w-10 opacity-10" />
          <p className="text-sm font-medium">{busqueda ? "Nada coincide con la búsqueda" : "No hay contratos para renovar"}</p>
        </div>
      ) : (
        <>
          {/* La paginación también ARRIBA: con filas altas, el paginador del pie quedaba muy abajo. */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {(pagina - 1) * porPagina + 1}–{(pagina - 1) * porPagina + filas.length} de {total}
              {cargando && <span className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500 align-[-2px]" aria-label="Cargando" />}
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                Por página
                <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="rounded border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {TAMANIOS_PAGINA.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <Paginador pagina={pagina} totalPaginas={totalPaginas} total={total} desde={(pagina - 1) * porPagina} mostrados={filas.length} onPagina={setPagina} />
            </div>
          </div>
          <div className={`overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-800/50 transition-opacity ${cargando ? "opacity-60" : ""}`}>
            <table className="w-full text-left min-w-[1400px]">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className={`${th} sticky left-0 z-[15] ${FIJA_FECHA}`}>
                    <BotonOrden columna="fechaCarga" {...ordenProps}>
                      Fecha de creación
                    </BotonOrden>
                  </th>
                  <th className={`${th} sticky ${IZQ_RENOVAR} z-[15] ${FIJA_RENOVAR}`}>Renovar</th>
                  <th className={`${th} sticky ${IZQ_ULTIMO} z-[15] ${FIJA_ULTIMO}`}>
                    <BotonOrden columna="altaBaja" {...ordenProps} title="Ordenar por la fecha de alta del último contrato">
                      Último contrato
                    </BotonOrden>
                  </th>
                  <th className={`${th} sticky ${IZQ_USUARIO} z-[15] ${FIN_FIJAS}`}>
                    <BotonOrden columna="usuario" {...ordenProps}>
                      Usuario
                    </BotonOrden>
                  </th>
                  <th className={th}>
                    <BotonOrden columna="cuit" {...ordenProps}>
                      CUIT
                    </BotonOrden>
                  </th>
                  <th className={th}>
                    <BotonOrden columna="cliente" {...ordenProps}>
                      Cliente
                    </BotonOrden>
                  </th>
                  <th className={th}>
                    <BotonOrden columna="proyecto" {...ordenProps}>
                      Proyecto
                    </BotonOrden>
                  </th>
                  <th className={th}>
                    <BotonOrden columna="contrato" {...ordenProps}>
                      Tipo de contrato
                    </BotonOrden>
                  </th>
                  <th className={th}>
                    <BotonOrden columna="estadoContrato" {...ordenProps}>
                      Estado
                    </BotonOrden>
                  </th>
                  <th className={th}>Estado impositivo</th>
                  <ContractActionsHeader />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filas.map((r) => (
                  <tr key={`${r._id}:${r.contractIndex}`} className="group hover:bg-gray-50 dark:hover:bg-gray-900/20">
                    <td className={`${celdaFija} sticky left-0 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap ${FIJA_FECHA}`}>
                      {fechaDeCreacion(r.fecha_carga) || <span className="text-gray-300 dark:text-gray-600" title="Contrato importado sin fecha de carga">—</span>}
                    </td>
                    <td className={`${celdaFija} sticky ${IZQ_RENOVAR} ${FIJA_RENOVAR}`}>
                      <button
                        type="button"
                        onClick={() => setRenovando({ projectId: r.projectId, userId: r.userId, contractIndex: r.contractIndex })}
                        title="Crear un contrato nuevo con los mismos datos de éste, para cargarle las fechas"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded font-bold text-xs bg-green-600 text-white hover:bg-green-700 transition-colors whitespace-nowrap"
                      >
                        <FontAwesomeIcon icon={faRotateRight} className="h-3 w-3" />
                        Renovar
                      </button>
                    </td>
                    <td className={`${celdaFija} sticky ${IZQ_ULTIMO} text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap ${FIJA_ULTIMO}`}>
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">No vigente</span>
                        <span>
                          <span className="text-gray-400">Alta:</span> {formatDate(r.fecha_alta_contrato)}
                        </span>
                        <span>
                          <span className="text-gray-400">Baja:</span> {r.fecha_baja_contrato ? formatDate(r.fecha_baja_contrato) : "—"}
                        </span>
                      </div>
                    </td>
                    <td className={`${celdaFija} sticky ${IZQ_USUARIO} ${FIN_FIJAS}`}>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white whitespace-nowrap">{r.userName}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{r.userEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap font-mono">{cuitDisplay(r.cuit, r.sinCuit)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.clientName || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.projectName || "—"}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.nombre_contrato || "—"}</td>
                    <td className="px-4 py-3">
                      <EstadoBadge name={r.nombre_estado_empleado || ""} />
                    </td>
                    <td className="px-4 py-3">
                      <EstadoImpositivoCell record={r} contratoFrames={contratoFrames} allEstados={allEstados} />
                    </td>
                    {/* Renovar, al lado de editar y eliminar: es la acción principal de esta pantalla. */}
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <ContractActionsButtons record={r} onDeleted={() => setRecarga((x) => x + 1)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Paginador pagina={pagina} totalPaginas={totalPaginas} total={total} desde={(pagina - 1) * porPagina} mostrados={filas.length} onPagina={setPagina} />
        </>
      )}
      {renovando && (
        <ProjectTeamPage
          soloAprobacion={{
            projectId: renovando.projectId,
            solicitudId: "",
            renovarContrato: { userId: renovando.userId, contractIndex: renovando.contractIndex },
            onCerrar: () => setRenovando(null),
            onAprobada: () => {
              setRenovando(null);
              setRecarga((x) => x + 1);
            },
          }}
        />
      )}
    </PageLayout>
  );
};

export default RenovacionesPage;

// ... imports
import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileText, faUser, faCalendar, faTrash, faUserSlash, faGrip, faTable, faBriefcase, faChartSimple, faClock, faChevronDown, faChevronUp, faFileLines, faLayerGroup, faPen, faCalendarCheck, faEye, faChevronLeft, faChevronRight, faFileExcel } from "@fortawesome/free-solid-svg-icons";
import { NewsReportsModal } from "../components/orders/news/NewsReportsModal";
import { ComplianceView } from "../components/activity_logs/ComplianceView";
import { PageLayout } from "../components/ui/PageLayout";
import { LiquidacionModal } from "../components/activity_logs/LiquidacionModal";
import { CardItemGeneric } from "../components/ui/CardItemGeneric";
import { Modal } from "../components/ui/Modal";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { ActivityReport as BaseActivityReport, AttendanceRecord, AttendanceStatus } from "../types/activityTypes";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { activityReportsAPI } from "../api/request";
import { activityLogTypesAPI, RequestConfig } from "../api/requestConfig";
import { usersAPI, User } from "../api/users";
import { projectsAPI } from "../api/projects";
import { areasAPI } from "../api/areas";
import { shiftsAPI } from "../api/shifts";
import { sweetAlert } from "../utils/sweetAlert";

interface ActivityReport extends Omit<BaseActivityReport, "id"> {
  id: string; // Ensure id compatibility if needed
  reportNumber?: string; // Added field
  projectIdRaw?: string; // Add this field
  /* El área y el turno DEL PARTE, cuando se cargó apuntando a uno. La lista ya los leía; nunca
     estuvieron declarados, así que el tipo decía que no existían. */
  areaName?: string;
  shiftId?: string;
  shiftName?: string;
  /*
    LOS NÚMEROS DE LA FILA, CONTADOS POR EL SERVER.

    La lista ya no recibe el detalle de asistencia —quince o veinte renglones por parte, cada uno
    con su gente poblada: 4,5 MB y 27 segundos para 720 partes— sino estos números, que es lo único
    que la tabla dibuja. El detalle se pide al abrir un parte.

    `empleados` son los ids, sin repetir, de quienes figuran en el parte: con eso se arma la columna
    «Área | Turno», que busca a cada uno en el directorio (ver `getAreaTurnoDeReporte`).
  */
  registros?: number;
  ausentes?: number;
  reemplazos?: number;
  otrosPresentes?: number;
  compensatorios?: number;
  conHorasExtra?: number;
  sumaHorasExtra?: number;
  empleados?: string[];
  // .. other fields are inherited
}

// ... reusing MOCK_AREAS and MOCK_REPORTS ...

// Los mismos criterios que usan los tabs del detalle, para que la columna de la lista y el número
// del tab no puedan decir cosas distintas de la misma novedad. Antes divergían: la columna "Ausentes"
// contaba `status !== "present"` (o sea que sumaba a los que llegaron tarde) y el tab los excluía.
export const esAusente = (r: AttendanceRecord) => r.status !== "present" && r.status !== "late";
export const esOtroPresente = (r: AttendanceRecord) => !!r.absenceReason?.toLowerCase().includes("adicional");
export const tieneHorasExtras = (r: AttendanceRecord) => (r.overtimeHours || 0) > 0;

/**
 * Si la ausencia la cubrió alguien.
 *
 * OJO CON LOS HORARIOS: `entryTime`/`exitTime` NO son del reemplazante — salen de `scheduleInTime`/
 * `scheduleOutTime`, que es el horario que le tocaba al AUSENTE. Mostrarlos bajo el encabezado
 * "Información del Reemplazo" cuando no hay nadie hacía leer "lo cubrieron de 12 a 18" en una
 * ausencia que quedó descubierta. Por eso la fila sin reemplazo ya no dibuja esas celdas.
 */
export const tieneReemplazo = (r: AttendanceRecord) => !!(r.replacementName || "").trim();

const AttendanceTable: React.FC<{ attendance: AttendanceRecord[] }> = ({ attendance }) => {
  return (
    <div className="overflow-auto max-h-[calc(100vh-320px)] rounded border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm text-left">
        <thead className="sticky top-0 z-10 shadow-sm bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold outline outline-1 outline-gray-200 dark:outline-gray-700">
          <tr>
            <th className="py-3 px-4">Colaborador</th>
            <th className="py-3 px-4 text-center">Presente</th>
            <th className="py-3 px-4">Motivo</th>
            <th className="py-3 px-4">Area</th>
            <th className="py-3 px-4 text-center">Entrada</th>
            <th className="py-3 px-4 text-center">Salida</th>
            <th className="py-3 px-4 text-center">Hs. Exts.</th>
            <th className="py-3 px-4 text-center">Entrada Exts.</th>
            <th className="py-3 px-4 text-center">Salida Exts.</th>
            <th className="py-3 px-4 text-center">Reemplazo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
          {attendance.map((record) => {
            const isAbsent = record.status !== "present" && record.status !== "late";
            // Check if status implies absence but maybe check absenceReason too?
            // "late" is usually present but late. "present" is present.
            // All others (sick, vacation, etc) are absent.

            return (
              <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className={`py-3 px-4 font-medium ${isAbsent ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
                  <div className="flex items-center gap-2">
                    <span>{record.employeeName}</span>
                    {record.absenceReason?.toLowerCase().includes("adicional") && <span className="bg-amber-100 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 uppercase tracking-wider">Otros Presentes</span>}
                  </div>
                </td>
                <td className="py-3 px-4 text-center">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${!isAbsent ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{!isAbsent ? "Sí" : "No"}</span>
                </td>
                <td className="py-3 px-4 text-gray-600 dark:text-gray-400 capitalize">{isAbsent ? record.absenceReason || "Ausente" : record.absenceReason?.toLowerCase().includes("adicional") ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800 uppercase tracking-wide">Otros Presentes</span> : "-"}</td>
                <td className="py-3 px-4 text-gray-600 dark:text-gray-400">{record.areaName || "-"}</td>
                <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-400">{record.entryTime || "-"}</td>
                <td className="py-3 px-4 text-center text-gray-600 dark:text-gray-400">{record.exitTime || "-"}</td>
                <td className="py-3 px-4 text-center">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${record.overtimeHours > 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400"}`}>{record.overtimeHours}</span>
                </td>
                <td className="py-3 px-4 text-center text-xs font-medium">{record.overtimeEntryTime ? <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded">{record.overtimeEntryTime}</span> : <span className="text-gray-400 dark:text-gray-600">-</span>}</td>
                <td className="py-3 px-4 text-center text-xs font-medium">{record.overtimeExitTime ? <span className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded">{record.overtimeExitTime}</span> : <span className="text-gray-400 dark:text-gray-600">-</span>}</td>
                <td className="py-3 px-4 text-center text-xs font-medium">
                  {/* Un "-" no distinguía "no necesita reemplazo" (está presente) de "faltó y nadie lo cubrió". */}
                  {record.replacementName ? (
                    // Mismo ámbar que el badge "No" de dos filas más abajo: toda la columna habla de
                    // reemplazo, así que el color dice "esto es un reemplazante" y no se confunde con
                    // el nombre del colaborador de la primera columna.
                    <span className="text-amber-700 dark:text-amber-400 font-medium">{record.replacementName}</span>
                  ) : isAbsent ? (
                    <span className="inline-block px-2 py-1 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800">No</span>
                  ) : (
                    <span className="text-gray-400 dark:text-gray-600">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Un motivo de ausencia (Franco, Enfermedad, …) con sus dos mitades separadas.
 *
 * POR QUÉ SEPARADAS. Antes era una sola tabla y TODA fila —hubiera reemplazante o no— caía bajo el
 * encabezado "Información del Reemplazo / Jornalero", con sus seis columnas. En una ausencia que
 * nadie cubrió eso anuncia datos que no existen, y encima las columnas Entrada/Salida se llenaban
 * con el horario programado del ausente, que se leía como si alguien lo hubiera cubierto.
 *
 * Ahora el encabezado de reemplazo aparece solamente si hay a quién ponerle abajo, y los descubiertos
 * van en su propia lista, sin columnas que no les corresponden.
 */
const AbsenceBlock: React.FC<{ title: string; records: AttendanceRecord[] }> = ({ title, records }) => {
  const relevantRecords = records;
  const conReemplazo = relevantRecords.filter(tieneReemplazo);
  const sinReemplazo = relevantRecords.filter((r) => !tieneReemplazo(r));

  const count = relevantRecords.length;
  // Default open if there are records
  const [isOpen, setIsOpen] = useState(count > 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button onClick={() => setIsOpen(!isOpen)} className="px-5 py-4 flex justify-between items-center w-full text-left focus:outline-none hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {title} <span className={count > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-gray-500 font-normal"}>({count})</span>
        </h3>
        <FontAwesomeIcon icon={isOpen ? faChevronUp : faChevronDown} className="text-gray-400 text-xs" />
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 dark:border-gray-700 animate-fade-in">
          {count === 0 && <div className="py-4 text-center text-sm text-gray-500 italic bg-gray-50/30 dark:bg-gray-900/10">No hay registro de Ausentes por {title}</div>}

          {/* Los que sí cubrió alguien: acá el encabezado de reemplazo tiene sentido porque hay datos debajo. */}
          {conReemplazo.length > 0 && (
            <div className="overflow-auto max-h-[calc(100vh-320px)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 shadow-sm text-[9px] uppercase text-gray-500 font-medium outline outline-1 outline-gray-100 dark:outline-gray-700 bg-white dark:bg-gray-800">
                  <tr className="border-b border-gray-100 dark:border-gray-700">
                    <th rowSpan={2} className="py-2 px-4 text-left font-black text-gray-400 border-r border-gray-100 dark:border-gray-700 align-middle w-[180px]">
                      Colaborador Ausente
                    </th>
                    <th colSpan={6} className="py-1 px-4 text-center font-black bg-blue-50/50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 border-b border-blue-100 dark:border-blue-900/30">
                      Información del Reemplazo / Jornalero
                    </th>
                  </tr>
                  <tr>
                    <th className="py-1.5 px-4 text-left font-semibold text-blue-500/80">Nombre / Detalle</th>
                    <th className="py-1.5 px-2 text-center font-medium">Entrada</th>
                    <th className="py-1.5 px-2 text-center font-medium">Salida</th>
                    <th className="py-1.5 px-2 text-center font-medium">Hs. Exts.</th>
                    <th className="py-1.5 px-2 text-center font-medium text-[8px]">Entr. Exts.</th>
                    <th className="py-1.5 px-2 text-center font-medium text-[8px]">Sal. Exts.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {conReemplazo.map((rec) => (
                    <tr key={rec.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                      <td className="py-2 px-4 font-bold text-red-600 dark:text-red-400 whitespace-nowrap border-r border-gray-50 dark:border-gray-700/50">{rec.employeeName}</td>
                      <td className="py-2 px-4 text-blue-600 dark:text-blue-400 font-medium whitespace-nowrap bg-blue-50/20 dark:bg-blue-900/5">{rec.replacementName}</td>
                      <td className="py-2 px-2 text-center text-[11px] text-gray-500 dark:text-gray-400 bg-blue-50/20 dark:bg-blue-900/5">{rec.entryTime || "-"}</td>
                      <td className="py-2 px-2 text-center text-[11px] text-gray-500 dark:text-gray-400 bg-blue-50/20 dark:bg-blue-900/5">{rec.exitTime || "-"}</td>
                      <td className="py-2 px-2 text-center bg-blue-50/20 dark:bg-blue-900/5">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black ${rec.overtimeHours > 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500"}`}>{rec.overtimeHours}</span>
                      </td>
                      <td className="py-2 px-2 text-center text-[10px] text-gray-500 dark:text-gray-400 bg-blue-50/20 dark:bg-blue-900/5">{rec.overtimeEntryTime || "-"}</td>
                      <td className="py-2 px-2 text-center text-[10px] text-gray-500 dark:text-gray-400 bg-blue-50/20 dark:bg-blue-900/5">{rec.overtimeExitTime || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Los descubiertos: sin columnas de reemplazo, porque no hay nada que poner en ellas. */}
          {sinReemplazo.length > 0 && (
            <div className={conReemplazo.length > 0 ? "border-t border-gray-100 dark:border-gray-700" : ""}>
              <div className="px-4 py-2 flex items-center gap-2 bg-amber-50/60 dark:bg-amber-900/10 border-b border-amber-100 dark:border-amber-900/30">
                <FontAwesomeIcon icon={faUserSlash} className="h-3 w-3 text-amber-600 dark:text-amber-400 opacity-80" />
                <span className="text-[9px] uppercase font-black tracking-wide text-amber-700 dark:text-amber-400">Sin reemplazo ({sinReemplazo.length})</span>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {sinReemplazo.map((rec) => (
                  <li key={rec.id} className="py-2 px-4 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
                    {rec.employeeName}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import { useSearchParams } from "react-router-dom";
import { useEffect } from "react";

export const RequestsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<"list" | "detail">("list");
  const [listLayout, setListLayout] = useState<"table" | "cards">("table");
  /*
    Cumplimiento de coordinadores es un MODAL, no una vista que reemplaza la lista.

    Antes `showCompliance` cambiaba el contenido de la página: abrirlo hacía desaparecer la tabla de
    novedades, y para cotejar un DEM-REG del calendario contra la lista había que cerrarlo y volver a
    abrirlo. Ahora la tabla queda siempre atrás y el calendario se superpone.

    Tampoco se persiste ya en localStorage: recordar "estaba abierto" tenía sentido cuando era una
    vista —volvías del detalle y seguías donde estabas—, pero un modal que se reabre solo en cada
    recarga es una molestia. La lista, que es lo que hay que no perder, ahora nunca se va.
  */
  const [showCompliance, setShowCompliance] = useState(false);

  // Force cards view on screen resize < 1200px
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1200) {
        setListLayout("cards");
      }
    };

    // Check initially
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const [selectedReport, setSelectedReport] = useState<ActivityReport | null>(null);
  /*
    EL DETALLE VIAJA APARTE, así que hay un rato en que el parte está abierto y sus renglones no
    llegaron. Sin distinguirlo, «todavía no llegó» se leía igual que «este parte no tiene renglones»
    y se disparaba el camino de abajo, que arma una lista figurada con todo el personal del proyecto
    y los da por presentes. Un error de red terminaba mostrando 256 personas presentes que nadie
    cargó.
  */
  const [detalleCargando, setDetalleCargando] = useState(false);
  const [detalleFallo, setDetalleFallo] = useState(false);
  const [openInfo, setOpenInfo] = useState(false);
  const [showDetailStatsModal, setShowDetailStatsModal] = useState(false);
  const [detailTab, setDetailTab] = useState<"attendance" | "absences" | "comments" | "overtime" | "additional">("attendance");
  const [reports, setReports] = useState<ActivityReport[]>([]);
  const [logTypes, setLogTypes] = useState<RequestConfig[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allProjects, setAllProjects] = useState<{ id: string; name: string; areasConfig?: any[] }[]>([]);
  const [allAreas, setAllAreas] = useState<{ id: string; name: string }[]>([]);
  const [allShifts, setAllShifts] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [areaFilter, setAreaFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [showLiquidacion, setShowLiquidacion] = useState(false);
  const [reportsInitialProject, setReportsInitialProject] = useState("");

  /*
    FILTRAR Y PAGINAR LOS HACE EL SERVER.

    Acá se filtraba la lista entera en memoria y se le cortaban 25 filas: para eso había que bajar
    los 720 partes con su detalle de asistencia, 4,5 MB y 27 segundos, aunque se vieran 25.

    `reports` ES la página: ya viene filtrada y recortada (ver `fetchReports`). Se conservan los dos
    nombres —`filteredReports` y `pagedReports`— porque los usa media pantalla y renombrarlos no
    cambiaría nada de lo que se ve.
  */
  const REQUESTS_PAGE_SIZE = 25;
  const [reqPage, setReqPage] = useState(1);
  const [reqTotalPages, setReqTotalPages] = useState(1);
  /** Los de la cabecera, sobre TODO lo filtrado: si contaran la página, cambiarían al pasar de página. */
  const [totales, setTotales] = useState({ partes: 0, ausentes: 0, horasExtra: 0 });
  const filteredReports = reports;
  const pagedReports = reports;

  // Check for URL params to auto-open report detail
  useEffect(() => {
    const reportId = searchParams.get("report");
    const reportsProject = searchParams.get("reportsProject");
    if (reportId) {
      /*
        Se pide por su id y no se busca en `reports`: ahora `reports` es UNA página, y el parte que
        manda el link casi nunca está entre esas 25 filas.
      */
      void activityReportsAPI
        .getById(reportId)
        .then((completo) => {
          setSelectedReport(mapearParte(completo));
          setViewMode("detail");
          setDetailTab("attendance");
        })
        .catch(() => sweetAlert.error("Novedad no encontrada", "No se pudo abrir esa novedad. Puede haber sido eliminada."));
      // Clean up URL after handling
      setSearchParams({}, { replace: true });
    } else if (reportsProject) {
      // Shortcut desde Proyectos: abrir el modal de Reportes de Novedades con el proyecto filtrado
      setReportsInitialProject(reportsProject);
      setShowReportsModal(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    fetchLogTypes();
    fetchUsers();
    fetchProjects();
    fetchAreas();
    fetchShifts();
  }, []);

  /*
    CADA PÁGINA ES UNA CONSULTA, y cambiar un filtro vuelve a la primera.

    Los 300 ms de espera son por la búsqueda: sin ellos, escribir «Martínez» son ocho consultas y
    las siete primeras se tiran. Los filtros no los necesitan —se elige uno y listo— pero comparten
    el efecto y esperar un instante de más no se nota.
  */
  useEffect(() => {
    const t = setTimeout(() => void fetchReports(reqPage), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqPage, searchTerm, projectFilter, areaFilter, shiftFilter]);

  // Cambiar un filtro con la página 5 abierta dejaría pidiendo una página que quizá ya no existe.
  useEffect(() => {
    setReqPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, projectFilter, areaFilter, shiftFilter]);

  useEffect(() => {
    if (reqPage > reqTotalPages) setReqPage(reqTotalPages);
  }, [reqPage, reqTotalPages]);

  const fetchProjects = async () => {
    try {
      const data = await projectsAPI.listAll();
      setAllProjects(data.map((p: any) => ({ id: p._id, name: p.name, areasConfig: p.areasConfig })));
    } catch (e) {
      console.error("Error loading projects", e);
    }
  };

  const fetchAreas = async () => {
    try {
      const data = await areasAPI.listAll();
      setAllAreas(data.map((a: any) => ({ id: a._id, name: a.name })));
    } catch (e) {
      console.error("Error loading areas", e);
    }
  };

  const fetchShifts = async () => {
    try {
      const data = await shiftsAPI.getAll();
      setAllShifts(data.map((s: any) => ({ id: s._id, name: s.name, startTime: s.startTime, endTime: s.endTime })));
    } catch (e) {
      console.error("Error loading shifts", e);
    }
  };

  const fetchUsers = async () => {
    try {
      const users = await usersAPI.getDirectory();
      setAllUsers(users);
    } catch (e) {
      console.error("Error loading users", e);
    }
  };

  const fetchLogTypes = async () => {
    try {
      const types = await activityLogTypesAPI.getAll();
      setLogTypes(types);
    } catch (e) {
      console.error("Error loading log types", e);
    }
  };

  /*
    DE LO QUE MANDA EL API A LO QUE DIBUJA LA PANTALLA.

    Se usa en los dos lados: el LISTADO, donde `attendance` viene vacío y los números llegan
    contados, y el DETALLE de un parte, que sí trae sus renglones. Una sola función para no tener
    dos formas del mismo objeto según de dónde salga.
  */
  const mapearParte = (r: any): ActivityReport => ({
        id: r._id,
        reportNumber: r.reportNumber, // Use real backend number
        date: r.date,
        formName: r.areaId?.name || "General", // Area or generic
        projectIdRaw: r.projectId?._id || (typeof r.projectId === "string" ? r.projectId : ""),
        projectName: r.projectId?.name || "Sin Proyecto",
        areaId: r.areaId?._id || "",
        areaName: r.areaId?.name || "",
        shiftId: r.shiftId?._id || "",
        shiftName: r.shiftId?.name || "",
        status: "sent" as "sent", // Default status for now
        submittedBy: `${r.userId?.firstName || ""} ${r.userId?.lastName || ""}`.trim(),
        submittedAt: r.createdAt || r.submittedAt,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        comments: r.comments,
        attendance: r.attendance
          ? r.attendance.map((att: any, idx: number) => ({
              id: att._id || idx.toString(),
              employeeId: att.employeeId?._id || att.employeeId,
              employeeName: att.employeeId ? `${att.employeeId.firstName} ${att.employeeId.lastName}` : "Desconocido",
              areaId: "", // Not in attendance record usually
              areaName: "",
              hasOvertime: (att.overtimeHours || 0) > 0,
              overtimeHours: att.overtimeHours || 0,
              overtimeHours50: att.overtimeHours50 || 0,
              overtimeHours100: att.overtimeHours100 || 0,
              replacementOvertimeHours50: att.replacementOvertimeHours50 || 0,
              replacementOvertimeHours100: att.replacementOvertimeHours100 || 0,
              status: att.status || "present",
              absenceReason: att.absenceReason,
              notes: att.notes,
              // Map Schedule to Standard Entry/Exit Columns
              entryTime: att.scheduleInTime || undefined,
              exitTime: att.scheduleOutTime || undefined,
              // Map Actual to Overtime Entry/Exit Columns (as requested)
              overtimeEntryTime: att.inTime || undefined,
              overtimeExitTime: att.outTime || undefined,
              replacementName: att.replacementId ? `${att.replacementId.firstName} ${att.replacementId.lastName}` : undefined,
            }))
          : [],
    // Los números de la fila: el listado los trae contados; el detalle de un parte, no (los tiene él).
    registros: r.registros,
    ausentes: r.ausentes,
    reemplazos: r.reemplazos,
    otrosPresentes: r.otrosPresentes,
    compensatorios: r.compensatorios,
    conHorasExtra: r.conHorasExtra,
    sumaHorasExtra: r.sumaHorasExtra,
    empleados: (r.empleados || []).map((id: any) => String(id?._id || id)),
  });

  /*
    UNA PÁGINA, con los filtros y la búsqueda puestos.

    `all` es el valor que usan los selectores para «sin filtrar»; el API espera que ese parámetro
    directamente no vaya.
  */
  const fetchReports = async (pagina = 1) => {
    try {
      setLoading(true);
      const resp = await activityReportsAPI.list({
        page: pagina,
        limit: REQUESTS_PAGE_SIZE,
        search: searchTerm.trim() || undefined,
        projectId: projectFilter !== "all" ? projectFilter : undefined,
        areaId: areaFilter !== "all" ? areaFilter : undefined,
        shiftId: shiftFilter !== "all" ? shiftFilter : undefined,
      });
      setReports(resp.rows.map(mapearParte));
      setReqTotalPages(resp.pagination.totalPages);
      setTotales(resp.totales);
    } catch (error) {
      console.error("Error fetching reports", error);
    } finally {
      setLoading(false);
    }
  };

  /*
    EL DETALLE SE PIDE AL ABRIRLO.

    El listado ya no lo trae (ver `mapearParte`), así que abrir un parte es una consulta por ese
    parte. Se muestra enseguida con lo que ya se tiene —encabezado y números— y los renglones
    aparecen cuando llegan: esperar a la respuesta para abrir haría que el click no hiciera nada
    durante medio segundo.
  */
  const abrirDetalle = async (report: ActivityReport) => {
    setSelectedReport(report);
    setViewMode("detail");
    setDetailTab("attendance");
    setDetalleCargando(true);
    setDetalleFallo(false);
    try {
      const completo = await activityReportsAPI.getById(report.id);
      // Si mientras tanto se cerró o se abrió otro, no se pisa lo que el usuario está mirando.
      setSelectedReport((actual) => (actual && actual.id === report.id ? mapearParte(completo) : actual));
    } catch (error) {
      console.error("Error fetching report detail", error);
      setDetalleFallo(true);
    } finally {
      setDetalleCargando(false);
    }
  };

  // Los tres números de la cabecera: los cuenta el server sobre todo lo filtrado (ver `fetchReports`).
  const stats = { totalReports: totales.partes, totalAbsences: totales.ausentes, totalOvertimeHours: totales.horasExtra };

  // Compute merged attendance for selected report
  const mergedAttendance = useMemo(() => {
    if (!selectedReport) return [];

    // If the report has attendance records, those ARE the complete set for the report's scope
    // (area/shift filtered). No need to pad with virtual "present" records from all project users.
    if (selectedReport.attendance.length > 0) {
      // Enrich with area names from user directory if available
      return selectedReport.attendance
        .map((record) => {
          const empId = typeof record.employeeId === "object" && record.employeeId ? (record.employeeId as any)._id : record.employeeId;
          const user = allUsers.find((u) => String(u._id) === String(empId));
          if (user) {
            // Find project-specific area
            const userProj = (user as any).metadata?.projects?.find((p: any) => String(p.projectId?._id || p.projectId || "") === String(selectedReport.projectIdRaw));
            let areaId = userProj?.areaId || user.areaId;
            if (!areaId && userProj?.contracts && Array.isArray(userProj.contracts)) {
              const activeContract = userProj.contracts.find((c: any) => c.areaId);
              if (activeContract) {
                areaId = activeContract.areaId;
              }
            }
            const area = allAreas.find((a) => String(a.id) === String(areaId));
            const aName = area?.name || (!user.areaId ? "-" : typeof user.areaId === "string" ? "Area " + user.areaId.slice(-4) : user.areaId.name);
            return { ...record, areaName: aName };
          }
          return record;
        })
        .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
    }

    /*
      Mientras el detalle viaja —o si no llegó— NO se arma nada: una lista inventada de presentes es
      peor que una tabla vacía, porque parece un parte cargado que nadie cargó.
    */
    if (detalleCargando || detalleFallo) return [];

    // Legacy fallback: If report has NO attendance records, build virtual list from all project users
    const targetProjId = selectedReport.projectIdRaw;
    const projectUsers = allUsers.filter((u) => u.projectIds?.some((p) => p._id === targetProjId));

    const fullAttendance = projectUsers.map((user) => {
      const getAreaName = (u: User) => {
        if (!u.areaId) return "-";
        return typeof u.areaId === "string" ? "Area " + u.areaId.slice(-4) : u.areaId.name;
      };

      return {
        id: `virtual-${user._id}`,
        employeeId: user._id,
        employeeName: `${user.firstName} ${user.lastName}`,
        areaName: getAreaName(user),
        status: "present" as AttendanceStatus,
        overtimeHours: 0,
        hasOvertime: false,
      } as AttendanceRecord;
    });

    return fullAttendance.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [selectedReport, allUsers, detalleCargando, detalleFallo]);

  // Help integration
  const HELP_KEY = "activityLogs";
  const helpEntry = getHelp(HELP_KEY);

  const handleViewDetail = (report: ActivityReport) => {
    void abrirDetalle(report);
  };

  const handleBackToList = () => {
    setSelectedReport(null);
    setViewMode("list");
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleDeleteReport = async (id: string) => {
    const confirm = await sweetAlert.confirm("¿Eliminar reporte?", "Esta acción no se puede deshacer.", "Sí, eliminar", "Cancelar");
    if (confirm) {
      try {
        await activityReportsAPI.delete(id);
        await sweetAlert.success("Eliminado", "El reporte ha sido eliminado.");
        void fetchReports(reqPage);
      } catch (error) {
        console.error("Error deleting report", error);
        await sweetAlert.error("Error", "No se pudo eliminar el reporte.");
      }
    }
  };

  const renderAreaShiftBadges = (report: ActivityReport, isCard = false) => {
    const textClass = isCard ? "text-xs gap-1.5" : "text-[11px] gap-1";
    const iconClass = isCard ? "text-[10px]" : "text-[9px]";

    // Dynamic distinct collection
    const distinctAreas = new Set<string>();
    const distinctShifts = new Map<string, { name: string; startTime?: string; endTime?: string }>();

    if (report.areaName) distinctAreas.add(report.areaName);
    if (report.shiftName) {
      const shift = allShifts.find((s) => String(s.id) === String(report.shiftId) || s.name === report.shiftName);
      distinctShifts.set(report.shiftName, {
        name: report.shiftName,
        startTime: shift?.startTime,
        endTime: shift?.endTime,
      });
    }

    // If area is specified, but no specific shift is selected, pull all shifts configured for this area inside the project
    if (report.areaName && !report.shiftName) {
      const project = allProjects.find((p) => String(p.id) === String(report.projectIdRaw));
      if (project && project.areasConfig) {
        const targetArea = allAreas.find((a) => a.name === report.areaName || String(a.id) === String(report.areaId));
        if (targetArea) {
          const areaCfg = project.areasConfig.find((ac: any) => {
            const acAreaId = typeof ac.areaId === "object" ? ac.areaId?._id : ac.areaId;
            return String(acAreaId) === String(targetArea.id);
          });
          if (areaCfg && Array.isArray(areaCfg.shiftIds)) {
            areaCfg.shiftIds.forEach((sid: any) => {
              const idToCheck = typeof sid === "object" ? sid?._id : sid;
              const shift = allShifts.find((s) => String(s.id) === String(idToCheck));
              if (shift) {
                distinctShifts.set(shift.name, {
                  name: shift.name,
                  startTime: shift.startTime,
                  endTime: shift.endTime,
                });
              }
            });
          }
        }
      }
    }

    /*
      De `empleados` —los ids que manda el listado— y no del detalle de asistencia, que la lista ya
      no recibe. Es la misma gente: son los ids, sin repetir, de quienes figuran en el parte.
    */
    (report.empleados || []).forEach((empId: string) => {
      const user = allUsers.find((u) => String(u._id) === String(empId));
      if (user) {
        const userProj = (user as any).metadata?.projects?.find((p: any) => String(p.projectId?._id || p.projectId || "") === String(report.projectIdRaw));
        let areaId = userProj?.areaId || user.areaId;
        let shiftId = userProj?.shiftId || (user as any).shiftId;

        // Fallback to contracts if not present at top level of UserProject
        if (!areaId && userProj?.contracts && Array.isArray(userProj.contracts)) {
          const activeContract = userProj.contracts.find((c: any) => c.areaId);
          if (activeContract) {
            areaId = activeContract.areaId;
          }
        }

        if (!shiftId && userProj?.contracts && Array.isArray(userProj.contracts)) {
          const activeContract = userProj.contracts.find((c: any) => c.shiftId);
          if (activeContract) {
            shiftId = activeContract.shiftId;
          }
        }

        if (areaId) {
          const area = allAreas.find((a) => String(a.id) === String(areaId));
          if (area) distinctAreas.add(area.name);
        }
        if (shiftId) {
          const shift = allShifts.find((s) => String(s.id) === String(shiftId));
          if (shift) {
            distinctShifts.set(shift.name, {
              name: shift.name,
              startTime: shift.startTime,
              endTime: shift.endTime,
            });
          }
        }
      }
    });

    if (distinctAreas.size === 0 && distinctShifts.size === 0) {
      return !isCard ? <span className={`inline-flex items-center px-2 py-0.5 rounded font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 ${textClass} w-fit whitespace-nowrap`}>Todas las Áreas | Turnos</span> : null;
    }

    return (
      /*
        LOS BADGES NO SE PARTEN, y por eso la columna no se encoge.

        El nombre de un turno es una unidad —«Mañana 6 a 12 - Lun a Dom (06:00 - 12:00)»— y al
        envolverse quedaba en cuatro renglones dentro del recuadro: la fila crecía hasta cinco veces
        su alto y la tabla dejaba de poder recorrerse. El `w-fit` de cada badge, contra un texto ya
        partido, además los dejaba de anchos distintos.

        `whitespace-nowrap` en el badge y `w-max` en el contenedor: el ancho lo pide el contenido y la
        columna se estira. La tabla ya scrollea en horizontal, que es la dirección donde sobra lugar;
        hacia abajo no.
      */
      <div className="flex flex-col gap-1 w-max">
        {Array.from(distinctAreas).map((areaName) => (
          <span key={areaName} className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800 ${textClass} w-fit`}>
            <FontAwesomeIcon icon={faLayerGroup} className={`${iconClass}`} />
            {areaName}
          </span>
        ))}
        {Array.from(distinctShifts.values()).map((shift) => {
          const scheduleText = shift.startTime && shift.endTime ? ` (${shift.startTime} - ${shift.endTime})` : "";
          return (
            <span key={shift.name} className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800 ${textClass} w-fit`}>
              <FontAwesomeIcon icon={faClock} className={`${iconClass}`} />
              {shift.name}
              {scheduleText}
            </span>
          );
        })}
      </div>
    );
  };

  const renderAreaShiftBadgesDetail = (report: any) => {
    // Dynamic distinct collection
    const distinctAreas = new Set<string>();
    const distinctShifts = new Map<string, { name: string; startTime?: string; endTime?: string }>();

    if (report.areaName) distinctAreas.add(report.areaName);
    if (report.shiftName) {
      const shift = allShifts.find((s) => String(s.id) === String(report.shiftId) || s.name === report.shiftName);
      distinctShifts.set(report.shiftName, {
        name: report.shiftName,
        startTime: shift?.startTime,
        endTime: shift?.endTime,
      });
    }

    if (report.areaName && !report.shiftName) {
      const project = allProjects.find((p) => String(p.id) === String(report.projectIdRaw));
      if (project && project.areasConfig) {
        const targetArea = allAreas.find((a) => a.name === report.areaName || String(a.id) === String(report.areaId));
        if (targetArea) {
          const areaCfg = project.areasConfig.find((ac: any) => {
            const acAreaId = typeof ac.areaId === "object" ? ac.areaId?._id : ac.areaId;
            return String(acAreaId) === String(targetArea.id);
          });
          if (areaCfg && Array.isArray(areaCfg.shiftIds)) {
            areaCfg.shiftIds.forEach((sid: any) => {
              const idToCheck = typeof sid === "object" ? sid?._id : sid;
              const shift = allShifts.find((s) => String(s.id) === String(idToCheck));
              if (shift) {
                distinctShifts.set(shift.name, {
                  name: shift.name,
                  startTime: shift.startTime,
                  endTime: shift.endTime,
                });
              }
            });
          }
        }
      }
    }

    /*
      De `empleados` —los ids que manda el listado— y no del detalle de asistencia, que la lista ya
      no recibe. Es la misma gente: son los ids, sin repetir, de quienes figuran en el parte.
    */
    (report.empleados || []).forEach((empId: string) => {
      const user = allUsers.find((u) => String(u._id) === String(empId));
      if (user) {
        const userProj = (user as any).metadata?.projects?.find((p: any) => String(p.projectId?._id || p.projectId || "") === String(report.projectIdRaw));
        let areaId = userProj?.areaId || user.areaId;
        let shiftId = userProj?.shiftId || (user as any).shiftId;

        if (!areaId && userProj?.contracts && Array.isArray(userProj.contracts)) {
          const activeContract = userProj.contracts.find((c: any) => c.areaId);
          if (activeContract) {
            areaId = activeContract.areaId;
          }
        }

        if (!shiftId && userProj?.contracts && Array.isArray(userProj.contracts)) {
          const activeContract = userProj.contracts.find((c: any) => c.shiftId);
          if (activeContract) {
            shiftId = activeContract.shiftId;
          }
        }

        if (areaId) {
          const area = allAreas.find((a) => String(a.id) === String(areaId));
          if (area) distinctAreas.add(area.name);
        }
        if (shiftId) {
          const shift = allShifts.find((s) => String(s.id) === String(shiftId));
          if (shift) {
            distinctShifts.set(shift.name, {
              name: shift.name,
              startTime: shift.startTime,
              endTime: shift.endTime,
            });
          }
        }
      }
    });

    if (distinctAreas.size === 0 && distinctShifts.size === 0) {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 whitespace-nowrap">
          Todas las Áreas | Turnos
        </span>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        {Array.from(distinctAreas).map((areaName) => (
          <span key={areaName} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">
            <FontAwesomeIcon icon={faLayerGroup} className="text-indigo-400 mr-1.5 text-xs" />
            {areaName}
          </span>
        ))}
        {Array.from(distinctShifts.values()).map((shift) => {
          const scheduleText = shift.startTime && shift.endTime ? ` (${shift.startTime} - ${shift.endTime})` : "";
          return (
            <span key={shift.name} className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800">
              <FontAwesomeIcon icon={faClock} className="text-purple-400 mr-1.5 text-xs" />
              {shift.name}
              {scheduleText}
            </span>
          );
        })}
      </div>
    );
  };

  // --- RENDER CARDS VIEW ---
  const renderCardsView = () => {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pagedReports.map((report) => {
          const isEdited = report.createdAt && report.updatedAt && (new Date(report.updatedAt).getTime() - new Date(report.createdAt).getTime() > 1000);
          const badgesTop = [
            <span key="id" className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-gray-50 text-gray-600 dark:bg-gray-600/20 dark:text-gray-400">
              {report.reportNumber || "Pendiente"}
            </span>,
          ];

          if (isEdited) {
            badgesTop.push(
              <span key="edited" className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-sm whitespace-nowrap">
                <FontAwesomeIcon icon={faPen} className="text-[8px]" />
                EDITADO ({(() => {
                  try {
                    const d = new Date(report.updatedAt!);
                    const day = String(d.getDate()).padStart(2, "0");
                    const month = String(d.getMonth() + 1).padStart(2, "0");
                    const year = d.getFullYear();
                    return `${day}/${month}/${year}`;
                  } catch {
                    return "";
                  }
                })()})
              </span>
            );
          }

          return (
            <CardItemGeneric
              key={report.id}
              title={report.submittedBy}
              subtitle={report.formName}
              avatarFallback={getInitials(report.submittedBy)}
              badgesTop={badgesTop}
              footerLeft={
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <FontAwesomeIcon icon={faCalendar} className="h-3 w-3" />
                  <span>
                    {(() => {
                      try {
                        return report.date ? format(new Date(report.date + "T00:00:00"), "dd MMM yyyy", { locale: es }) : "-";
                      } catch (e) {
                        return "-";
                      }
                    })()}
                  </span>
                </div>
              }
              footerActions={[
                {
                  icon: faTrash,
                  onClick: (e) => {
                    e?.stopPropagation();
                    handleDeleteReport(report.id);
                  },
                  title: "Eliminar",
                  variant: "default",
                },
              ]}
              onClick={() => handleViewDetail(report)}
            >
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-100 dark:border-blue-800">
                  <FontAwesomeIcon icon={faBriefcase} className="text-blue-400 text-[10px]" />
                  {report.projectName}
                </span>
                {renderAreaShiftBadges(report, true)}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">{report.registros ?? report.attendance.length}</span> registros de asistencia
              </div>
            </CardItemGeneric>
          );
        })}
        {!loading && filteredReports.length === 0 && <div className="col-span-full py-12 text-center text-gray-500">No se encontraron reportes.</div>}
      </div>
    );
  };

  /**
   * El detalle de una novedad, para mostrarlo en un modal sobre la lista.
   *
   * Antes era un `return` temprano que reemplazaba la pantalla entera por otro PageLayout: abrir
   * una novedad hacía desaparecer la tabla, y al volver la lista se remontaba perdiendo el scroll
   * y la página en la que estabas.
   */
  const renderDetalleNovedad = () => {
    if (!selectedReport) return null;
    return (
        <div className="space-y-6 animate-fade-in">
          {/* Header Info Card Removed as per request to save space */}

          {/* ... Tabs ... */}

          {/* Detail Stats Modal */}
          <Modal
            isOpen={showDetailStatsModal}
            onClose={() => setShowDetailStatsModal(false)}
            zIndex={60}
            title={
              <div className="flex items-center gap-3">
                <span>Estadísticas: {selectedReport.projectName}</span>
                <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 text-xs px-2.5 py-0.5 rounded font-medium border border-blue-200 dark:border-blue-800">
                  {(() => {
                    try {
                      return selectedReport.date ? format(new Date(selectedReport.date + "T00:00:00"), "dd MMM yyyy", { locale: es }) : "-";
                    } catch (e) {
                      return "-";
                    }
                  })()}
                </span>
              </div>
            }
            size="md"
          >
            <div className="flex flex-wrap gap-4 justify-center">
              <div className="rounded-xl shadow-sm p-4 py-2 flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                <FontAwesomeIcon icon={faUser} className="lg:h-5 w-5 opacity-80" />
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-medium opacity-80">Total Personal</span>
                  <span className="lg:text-lg font-bold">{mergedAttendance.length}</span>
                </div>
              </div>

              <div className="rounded-xl shadow-sm p-4 py-2 flex items-center gap-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                <FontAwesomeIcon icon={faUserSlash} className="lg:h-5 w-5 opacity-80" />
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-medium opacity-80">Ausentes</span>
                  <span className="lg:text-lg font-bold">{selectedReport.attendance.filter(esAusente).length}</span>
                </div>
              </div>

              <div className="rounded-xl shadow-sm p-4 py-2 flex items-center gap-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
                <FontAwesomeIcon icon={faClock} className="lg:h-5 w-5 opacity-80" />
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-medium opacity-80">Hs. Extras</span>
                  <span className="lg:text-lg font-bold">{selectedReport.attendance.reduce((acc, curr) => acc + (curr.overtimeHours || 0), 0)}</span>
                </div>
              </div>
            </div>
          </Modal>

          {(() => {
            const isReportEdited = selectedReport.createdAt && selectedReport.updatedAt && (new Date(selectedReport.updatedAt).getTime() - new Date(selectedReport.createdAt).getTime() > 1000);
            if (!isReportEdited) return null;
            return (
              <div className="mb-4 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-100 dark:border-amber-900/50 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5 shadow-sm">
                <FontAwesomeIcon icon={faPen} className="mt-0.5 text-amber-500 flex-shrink-0" />
                <div>
                  <span className="font-bold block mb-0.5">Novedad Editada</span>
                  <span>Última edición: {new Date(selectedReport.updatedAt!).toLocaleString()}</span>
                </div>
              </div>
            );
          })()}

          {/* Area/Turno Badges above Tabs */}
          <div className="mb-4 bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-gray-700/50">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h4 className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Área / Turno Informado</h4>
              <button onClick={() => setShowDetailStatsModal(true)} className="shrink-0 p-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm" aria-label="Ver estadísticas del reporte" title="Ver estadísticas del reporte">
                <FontAwesomeIcon icon={faChartSimple} className="h-4 w-4" />
              </button>
            </div>
            {renderAreaShiftBadgesDetail(selectedReport)}
          </div>

          {/* Tabs Navigation */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 bg-white dark:bg-gray-800 rounded-t-lg px-2 pt-2 overflow-x-auto">
            <button onClick={() => setDetailTab("attendance")} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${detailTab === "attendance" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
              Asistencia del Personal ({selectedReport.registros ?? mergedAttendance.length})
            </button>
            <button onClick={() => setDetailTab("additional")} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${detailTab === "additional" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
              Otros Presentes ({selectedReport.otrosPresentes ?? mergedAttendance.filter(esOtroPresente).length})
            </button>
            <button onClick={() => setDetailTab("absences")} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${detailTab === "absences" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
              Ausentes | Reemplazos ({selectedReport.ausentes ?? selectedReport.attendance.filter(esAusente).length})
            </button>
            <button onClick={() => setDetailTab("overtime")} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${detailTab === "overtime" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
              Horas Extras ({selectedReport.conHorasExtra ?? selectedReport.attendance.filter(tieneHorasExtras).length})
            </button>
            <button onClick={() => setDetailTab("comments")} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${detailTab === "comments" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}>
              Comentarios ({selectedReport.comments ? 1 : 0})
            </button>
          </div>

          <div className="space-y-6">
            {/*
              QUÉ PASA MIENTRAS EL DETALLE VIAJA.

              Los renglones se piden aparte al abrir el parte. Sin decirlo, el rato de espera se ve
              igual que un parte vacío —y si la consulta falla, se queda así para siempre—.
            */}
            {detalleCargando && (
              <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">Cargando el detalle de la novedad…</div>
            )}
            {!detalleCargando && detalleFallo && (
              <div className="p-8 text-center text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 rounded border border-red-200 dark:border-red-900">
                No se pudo cargar el detalle de esta novedad. Cerrá y volvé a abrirla.
              </div>
            )}

            {!detalleCargando && !detalleFallo && detailTab === "attendance" &&
              (mergedAttendance.length > 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-0 overflow-hidden animate-fade-in">
                  <div className="p-4">
                    <AttendanceTable attendance={mergedAttendance} />
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">No hay registro de Asistencia del Personal</div>
              ))}

            {!detalleCargando && !detalleFallo && detailTab === "additional" &&
              (() => {
                const additionalRecords = mergedAttendance.filter(esOtroPresente);
                return additionalRecords.length > 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-0 overflow-hidden animate-fade-in">
                    <div className="p-4">
                      <AttendanceTable attendance={additionalRecords} />
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">No hay registros de Personal Adicional</div>
                );
              })()}

            {!detalleCargando && !detalleFallo && detailTab === "absences" &&
              (() => {
                const absentRecords = selectedReport.attendance.filter(esAusente);

                // Group by available log types
                const dynamicBlocks = logTypes
                  .map((type) => {
                    const typeRecords = absentRecords.filter((r) => r.absenceReason === type.name);
                    if (typeRecords.length === 0) return null;
                    return <AbsenceBlock key={type._id} title={type.name} records={typeRecords} />;
                  })
                  .filter(Boolean);

                const knownNames = logTypes.map((t) => t.name);
                const otherRecords = absentRecords.filter((r) => !r.absenceReason || !knownNames.includes(r.absenceReason));
                if (otherRecords.length > 0) {
                  dynamicBlocks.push(<AbsenceBlock key="others" title="Otros / Sin Clasificar" records={otherRecords} />);
                }

                return dynamicBlocks.length > 0 ? <div className="space-y-4 animate-fade-in">{dynamicBlocks}</div> : <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">No hay registro de Ausentes</div>;
              })()}

            {!detalleCargando && !detalleFallo && detailTab === "overtime" &&
              (() => {
                const overtimeRecords = selectedReport.attendance.filter(tieneHorasExtras);

                return overtimeRecords.length > 0 ? (
                  <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-0 overflow-hidden animate-fade-in">
                    <div className="p-4">
                      <AttendanceTable attendance={overtimeRecords} />
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">No hay registros de Horas Extras</div>
                );
              })()}

            {!detalleCargando && !detalleFallo && detailTab === "comments" &&
              (selectedReport.comments ? (
                <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-5 animate-fade-in">
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded border border-yellow-100 dark:border-yellow-900/30 text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-line">{selectedReport.comments}</div>
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">No hay comentarios</div>
              ))}
          </div>
        </div>
    );
  };

  // --- RENDER LIST VIEW ---
  return (
    <PageLayout
      title="Novedades"
      itemCount={filteredReports.length}
      subtitle="Historial de reportes diarios de asistencia y novedades"
      faIcon={{ icon: faFileText }}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      /*
        En tarjetas los filtros suben al bloque sticky del título: no hay encabezado de tabla que
        haga de ancla, así que al scrollear se perdía de vista con qué proyecto/área/turno estabas
        filtrando. En tabla no hace falta —el `thead` ya queda fijo— y sumar los filtros ahí arriba
        se comería una franja de alto que le sirve más a las filas.
      */
      stickySearchAndFilters={listLayout === "cards"}
      headerActions={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowStatsModal(true)} className="p-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm" aria-label="Ver resumen" title="Resumen de Novedades">
            <FontAwesomeIcon icon={faChartSimple} className="h-4 w-4" />
          </button>
          <button onClick={() => setShowCompliance((v) => !v)} className={`p-2 rounded transition-colors flex items-center gap-2 text-sm ${showCompliance ? "bg-blue-700 text-white ring-2 ring-blue-300 dark:ring-blue-500" : "bg-blue-600 text-white hover:bg-blue-700"}`} aria-label="Cumplimiento de supervisores" title="Cumplimiento de supervisores">
            <FontAwesomeIcon icon={faCalendarCheck} className="h-4 w-4" />
          </button>
          {/*
            REPORTES LLEVA TEXTO; los otros dos, solo ícono.

            Es la acción más usada de la pantalla y con tres botones azules idénticos había que
            acertarle por el dibujo. El rótulo lo saca de la fila de íconos anónimos sin necesidad de
            otro color: la jerarquía la da el ancho, no un segundo tono de azul que competiría con los
            botones que ya son primarios.
          */}
          <button onClick={() => setShowReportsModal(true)} className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-semibold" aria-label="Reportes" title="Reportes de novedades">
            <FontAwesomeIcon icon={faFileLines} className="h-4 w-4" />
            <span className="hidden sm:block">Reportes</span>
          </button>

          {/*
            De acá salen los dos archivos del mes: el de novedades y el import de Memosoft.
            Va en Novedades y no en una pantalla aparte porque es de donde salen los datos.
          */}
          <button onClick={() => setShowLiquidacion(true)} className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-semibold" aria-label="Liquidación" title="Sacar los archivos del período">
            <FontAwesomeIcon icon={faFileExcel} className="h-4 w-4" />
            <span className="hidden sm:block">Liquidación</span>
          </button>
        </div>
      }
      searchAndFilters={
        <SearchAndFilters
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder="Buscar por proyecto, supervisor o número..."
          /*
            Los tres filtros son EN CASCADA: el proyecto define qué áreas existen, y el área define
            qué turnos. Por eso cada `onChange` limpia los de abajo — si no, quedaba un turno elegido
            que no pertenece al área nueva y la lista salía vacía sin motivo visible.

            `SearchAndFilters` usa "" para "sin filtrar" y esta pantalla usa "all". La traducción se
            hace acá, en el borde, para no tener que tocar el filtrado ni lo que recibe ComplianceView.
          */
          selectFilters={[
            {
              label: "Proyecto",
              value: projectFilter === "all" ? "" : projectFilter,
              onChange: (v) => {
                setProjectFilter(v || "all");
                setAreaFilter("all");
                setShiftFilter("all");
              },
              placeholder: "Todos los proyectos",
              options: allProjects.map((p) => ({ value: p.id, label: p.name })),
            },
            {
              label: "Área",
              value: areaFilter === "all" ? "" : areaFilter,
              onChange: (v) => {
                setAreaFilter(v || "all");
                setShiftFilter("all");
              },
              placeholder: "Todas las áreas",
              options: (() => {
                if (projectFilter === "all") return allAreas.map((a) => ({ value: a.id, label: a.name }));
                const proj = allProjects.find((p) => p.id === projectFilter);
                if (!proj?.areasConfig) return [];
                return proj.areasConfig.map((ac: any) => {
                  const areaId = typeof ac.areaId === "object" ? ac.areaId?._id : ac.areaId;
                  const area = allAreas.find((a) => a.id === areaId);
                  return { value: areaId, label: area?.name || "Área " + String(areaId).slice(-4) };
                });
              })(),
            },
            {
              label: "Turno",
              value: shiftFilter === "all" ? "" : shiftFilter,
              onChange: (v) => setShiftFilter(v || "all"),
              placeholder: "Todos los turnos",
              options: (() => {
                if (projectFilter === "all" || areaFilter === "all") return allShifts.map((s) => ({ value: s.id, label: s.name }));
                const proj = allProjects.find((p) => p.id === projectFilter);
                const areaCfg = proj?.areasConfig?.find((ac: any) => (typeof ac.areaId === "object" ? ac.areaId?._id : ac.areaId) === areaFilter);
                if (!areaCfg?.shiftIds) return [];
                return areaCfg.shiftIds.map((sId: any) => {
                  const shiftId = typeof sId === "object" ? sId?._id : sId;
                  const shift = allShifts.find((s) => s.id === shiftId);
                  return { value: shiftId, label: shift?.name || "Turno " + String(shiftId).slice(-4) };
                });
              })(),
            },
          ]}
          extraActions={
            <div className="hidden min-[1200px]:flex items-center gap-2 shrink-0">
              <button onClick={() => setListLayout("cards")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${listLayout === "cards" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tarjetas" aria-label="Vista de tarjetas">
                <FontAwesomeIcon icon={faGrip} className="h-4 w-4" />
              </button>
              <button onClick={() => setListLayout("table")} className={`px-4 py-2 rounded-md transition-all border dark:border-gray-700 ${listLayout === "table" ? "bg-blue-500 text-white shadow-sm border-blue-500" : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`} title="Vista de tabla" aria-label="Vista de tabla">
                <FontAwesomeIcon icon={faTable} className="h-4 w-4" />
              </button>
            </div>
          }
        />
      }
    >
      <div className="space-y-6">
        {/* List Content */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <LoadingSpinner message="Cargando novedades..." />
          </div>
        ) : listLayout === "cards" ? (
          renderCardsView()
        ) : (
          /*
            El alto acotado es lo que hace posible el encabezado fijo.

            `overflow-x-auto` ya convertía a este div en contenedor de scroll (con un eje en `auto`,
            el otro deja de ser `visible`), así que un `sticky` contra el scroll de la página nunca
            iba a funcionar acá: se pega al contenedor, y un contenedor sin alto no scrollea. Con un
            alto máximo, el que scrollea es el div y el `thead sticky top-0` queda donde tiene que
            quedar — justo debajo del bloque "Novedades", que es sticky a `top-16` en PageLayout.

            Es el mismo patrón que ya usan AttendanceTable y AbsenceBlock más arriba en este archivo.
            Los 260px son el título + los filtros + la paginación de abajo.
          */
          <div className="overflow-auto max-h-[calc(100vh-260px)] rounded border dark:border-slate-800">
            <table className="w-full dark:bg-slate-800/80 table-auto">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-left text-nowrap py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">No Registro</th>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-nowrap text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">F. Carga</th>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-nowrap text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">F. Novedad</th>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-nowrap text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Proyecto</th>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-nowrap text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Área | Turno</th>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-nowrap text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300" title="Total Registros de Asistencia">
                    Registros
                  </th>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-nowrap text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Ausentes</th>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-nowrap text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300" title="Ausencias que cubrió un reemplazante">
                    Reemplazos
                  </th>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-nowrap text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Otros Presentes</th>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-nowrap text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300" title="Personas que se tomaron un compensatorio. Van también en «Ausentes»: un compensatorio es una ausencia.">
                    Compensatorios
                  </th>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-nowrap text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300" title="Personas con horas extras">
                    Horas Extras
                  </th>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-nowrap text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300" title="Comentarios del supervisor">
                    Comentarios
                  </th>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-nowrap text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">Enviado Por</th>
                  <th className="bg-gray-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_rgb(229_231_235)] dark:shadow-[inset_0_-1px_0_0_rgb(51_65_85)] text-nowrap text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300"></th>
                </tr>
              </thead>
              <tbody>
                {pagedReports.map((report) => (
                  <tr key={report.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer" onClick={() => handleViewDetail(report)}>
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className="bg-gray-50 dark:bg-gray-600/20 text-xs text-nowrap text-gray-600 dark:text-gray-400 px-2 rounded">{report.reportNumber || "Pendiente"}</span>
                        {(() => {
                          const isEdited = report.createdAt && report.updatedAt && (new Date(report.updatedAt).getTime() - new Date(report.createdAt).getTime() > 1000);
                          if (!isEdited) return null;
                          return (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded shadow-sm whitespace-nowrap">
                              <FontAwesomeIcon icon={faPen} className="text-[8px]" />
                              EDITADO ({(() => {
                                try {
                                  const d = new Date(report.updatedAt!);
                                  const day = String(d.getDate()).padStart(2, "0");
                                  const month = String(d.getMonth() + 1).padStart(2, "0");
                                  const year = d.getFullYear();
                                  return `${day}/${month}/${year}`;
                                } catch {
                                  return "";
                                }
                              })()})
                            </span>
                          );
                        })()}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400">
                      {(() => {
                        try {
                          return report.submittedAt ? format(new Date(report.submittedAt), "dd MMM yyyy", { locale: es }) : "-";
                        } catch {
                          return "-";
                        }
                      })()}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 dark:text-gray-400 font-medium">
                      {(() => {
                        try {
                          return report.date ? format(new Date(report.date + "T00:00:00"), "dd MMM yyyy", { locale: es }) : "-";
                        } catch {
                          return "-";
                        }
                      })()}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800 w-fit">
                        <FontAwesomeIcon icon={faBriefcase} className="text-blue-400 text-[10px]" />
                        {report.projectName}
                      </span>
                    </td>
                    {/* `whitespace-nowrap` en la celda: sin esto la columna se sigue encogiendo hasta
                        el ancho del texto más corto y los badges, que ya no se parten, se desbordan. */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex flex-wrap gap-1">{renderAreaShiftBadges(report, false)}</div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 font-medium">{report.registros ?? report.attendance.length}</td>
                    {(() => {
                      // Dos columnas, dos números: cuántos faltaron y a cuántos los cubrió alguien.
                      // La resta —los que quedaron descubiertos— se lee sola, y en el detalle cada
                      // fila dice cuál es cuál.
                      // Los cuenta el server (`ausentes`, `reemplazos`); el `??` cubre un parte ya abierto,
                      // que sí trae su detalle, y cualquier respuesta vieja que todavía no los traiga.
                      const ausentes = report.ausentes ?? report.attendance.filter(esAusente).length;
                      const reemplazos = report.reemplazos ?? report.attendance.filter(esAusente).filter(tieneReemplazo).length;
                      return (
                        <>
                          <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                            {ausentes > 0 ? <span className="text-red-600 dark:text-red-400 font-medium">{ausentes}</span> : "0"}
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                            {reemplazos > 0 ? <span className="text-blue-600 dark:text-blue-400 font-medium">{reemplazos}</span> : "0"}
                          </td>
                        </>
                      );
                    })()}
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {(() => {
                        const otrosPresentes = report.otrosPresentes ?? report.attendance.filter(esOtroPresente).length;
                        return otrosPresentes > 0 ? <span className="text-amber-600 dark:text-amber-400 font-medium">{otrosPresentes}</span> : "0";
                      })()}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {(() => {
                        // Los cuenta el server; el `??` cubre un parte ya abierto, que sí trae su detalle.
                        const compensatorios = report.compensatorios ?? report.attendance.filter((r) => r.status === "compensatory").length;
                        return compensatorios > 0 ? <span className="text-violet-600 dark:text-violet-400 font-medium">{compensatorios}</span> : "0";
                      })()}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {(() => {
                        const overtimeCount = report.conHorasExtra ?? report.attendance.filter(tieneHorasExtras).length;
                        return overtimeCount > 0 ? <span className="text-green-600 dark:text-green-400 font-medium">{overtimeCount}</span> : "0";
                      })()}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {(() => {
                        // `comments` es un único texto libre por novedad, no una lista: el contador da 0 o 1,
                        // igual que el tab "Comentarios (n)" del detalle. Si alguna vez pasa a ser varios,
                        // los dos lugares tienen que cambiar juntos.
                        const tieneComentario = (report.comments || "").trim().length > 0;
                        return tieneComentario ? <span className="text-yellow-600 dark:text-yellow-400 font-medium">1</span> : "0";
                      })()}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{report.submittedBy}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* El click en toda la fila sigue abriendo el detalle: esto es el gesto explícito
                            para quien lo busca como botón, no un reemplazo. */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetail(report);
                          }}
                          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors px-2 py-1 rounded"
                          title="Ver detalle"
                          aria-label="Ver detalle"
                        >
                          <FontAwesomeIcon icon={faEye} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteReport(report.id);
                          }}
                          className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors px-2 py-1 rounded"
                          title="Eliminar"
                          aria-label="Eliminar"
                        >
                          <FontAwesomeIcon icon={faTrash} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredReports.length === 0 && (
          <div className="text-center py-12">
            <FontAwesomeIcon icon={faFileText} className="h-16 w-16 text-gray-400 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">No hay novedades registradas</p>
          </div>
        )}

        {/* Paginación (misma UX que Contratos) */}
        {reqTotalPages > 1 && (
          <div className="mt-8 flex items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-semibold text-gray-900 dark:text-gray-100">{pagedReports.length}</span> de <span className="font-semibold text-gray-900 dark:text-gray-100">{filteredReports.length}</span> novedades · pág. {reqPage}/{reqTotalPages}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setReqPage((p) => Math.max(1, p - 1))} disabled={reqPage === 1} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <FontAwesomeIcon icon={faChevronLeft} />
              </button>
              <div className="flex items-center px-4 text-sm font-medium dark:text-gray-100">
                Página {reqPage} de {reqTotalPages}
              </div>
              <button onClick={() => setReqPage((p) => Math.min(reqTotalPages, p + 1))} disabled={reqPage === reqTotalPages} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                <FontAwesomeIcon icon={faChevronRight} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* El detalle de la novedad: modal sobre la lista, que queda intacta detrás. */}
      <Modal
        isOpen={viewMode === "detail" && !!selectedReport}
        onClose={handleBackToList}
        title={selectedReport?.projectName || ""}
        subtitle={`${selectedReport?.reportNumber || "Pendiente"} | ${(() => {
          try {
            return selectedReport?.date ? format(new Date(selectedReport.date + "T00:00:00"), "EEEE d 'de' MMMM, yyyy", { locale: es }).replace(/^\w/, (c) => c.toUpperCase()) : "-";
          } catch {
            return "-";
          }
        })()}`}
        /*
          `full` da alto FIJO (`h-[96svh]`), no un máximo.

          Con `fullscreen` el alto lo definía el contenido, así que el modal cambiaba de tamaño al
          pasar de un tab a otro —Asistencia con 16 filas contra Comentarios vacío— y saltaba en
          pantalla. Con alto fijo el marco no se mueve nunca y lo que scrollea es el cuerpo.
        */
        size="full"
      >
        <div className="p-4 sm:p-6">{renderDetalleNovedad()}</div>
      </Modal>

      {/* `full` = alto fijo (`h-[96svh]`), igual que el detalle: con `fullscreen` el alto lo definía el
          contenido y el modal cambiaba de tamaño al elegir un coordinador o cambiar de mes. El padding
          va acá porque los tamaños fullscreen/full no aplican el del modal, y los chips y los botones
          quedaban pegados a los bordes. */}
      <Modal isOpen={showCompliance} onClose={() => setShowCompliance(false)} title="Cumplimiento de supervisores" subtitle="Qué novedades se esperaban de cada supervisor y cuáles faltan." size="full">
        <div className="p-4 sm:p-6">
        <ComplianceView
          projectFilter={projectFilter}
          areaFilter={areaFilter}
          shiftFilter={shiftFilter}
          onOpenReport={(reportNumber) => {
            /*
              Se busca por su número contra el server: `reports` es la página que se está viendo, y el
              parte que se toca en el calendario de cumplimiento puede ser de cualquier fecha.
            */
            void activityReportsAPI
              .list({ page: 1, limit: 1, search: reportNumber })
              .then(({ rows }) => {
                const rep = rows[0];
                if (!rep) {
                  void sweetAlert.error("Novedad no encontrada", `No se pudo abrir ${reportNumber}. Puede haber sido eliminada.`);
                  return;
                }
                // Abrir el detalle reemplaza la pantalla entera, así que el modal se cierra primero: si
                // no, al volver de la novedad el calendario seguiría tapando la lista.
                setShowCompliance(false);
                handleViewDetail(mapearParte(rep));
              })
              .catch(() => sweetAlert.error("Novedad no encontrada", `No se pudo abrir ${reportNumber}.`));
          }}
        />
        </div>
      </Modal>

      <Modal isOpen={showStatsModal} onClose={() => setShowStatsModal(false)} title="Resumen de Novedades" size="md">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 justify-center">
            {[
              { label: "Reportes", value: stats.totalReports, icon: faFileText, color: "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400" },
              { label: "Ausentes", value: stats.totalAbsences, icon: faUserSlash, color: "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400" },
              { label: "Hs. Extras", value: stats.totalOvertimeHours, icon: faClock, color: "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" },
            ].map((stat, index) => (
              <div key={index} className={`rounded-xl shadow-sm p-4 py-2 flex items-center gap-3 ${stat.color}`}>
                <FontAwesomeIcon icon={stat.icon} className="lg:h-5 w-5 opacity-80" />
                <div className="flex gap-2 items-center">
                  <span className="text-sm font-medium opacity-80">{stat.label}</span>
                  <span className="lg:text-lg font-bold">{stat.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <NewsReportsModal isOpen={showReportsModal} onClose={() => { setShowReportsModal(false); setReportsInitialProject(""); }} reports={reports as any} allUsers={allUsers} allProjects={allProjects} initialProjectFilter={reportsInitialProject} />
      <LiquidacionModal isOpen={showLiquidacion} onClose={() => setShowLiquidacion(false)} />
    </PageLayout>
  );
};

import React, { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO, eachDayOfInterval } from "date-fns";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileExport, faCalendar, faBriefcase, faUser, faClock, faUserSlash, faMoneyBillWave, faSearch, faFileContract, faTimes, faIdBadge, faCalendarDays, faHourglassHalf, faDollarSign, faClipboardList, faLocationDot, faStar, faFileExcel, faCircleInfo, faChartSimple, faFileLines, faChevronLeft, faChevronRight, faFilter, faSpinner, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../../ui/Modal";
import { SelectorBadges } from "../../ui/SelectorBadges";
import { User, UserProjectMetadata } from "../../../api/users";
import { infoAPI, InfoItem } from "../../../api/info";
import { categoriaSatAPI } from "../../../api/categoriasSat";
import { roleFrameAPI } from "../../../api/roleFrames";
import { areasAPI } from "../../../api/areas";
import { shiftsAPI } from "../../../api/shifts";
import { activityReportsAPI, FiltrosDePersonas, ParteConAsistencia } from "../../../api/request";
import { isContractVigente } from "../../team/ContractCard";
import { getContratoActivo } from "../../../utils/contratoVigencia";
import { overtimeUtils, OvertimeSettings, splitOvertime } from "../../../utils/overtimeUtils";
import * as XLSX from "xlsx";


interface NewsReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  allUsers: User[];
  allProjects: { id: string; name: string }[];
  /** Si se provee, al abrir el modal se preselecciona este proyecto (por _id) en el filtro de Proyecto. */
  initialProjectFilter?: string;
  /**
   * La pantalla TODAVÍA está trayendo las novedades.
   *
   * Hace falta acá porque sin esto una tabla vacía se lee igual esté cargando o no, y el modal
   * decía "No se encontraron registros para el mes y filtros seleccionados" mientras los datos
   * venían en camino: el mensaje afirma que no hay nada, que es distinto de todavía no sé.
   */
  cargando?: boolean;
}

interface EmployeeStats {
  employeeId: string;
  employeeName: string;
  absences: number;
  absenceDetails: Record<string, number>; // reason -> count
  overtimeHours: number;
  overtime50: number;
  overtime100: number;
  daysPresent: number;
  lateDays: number;
  totalRecords: number;
  sueldoJornada: number;
  sueldoMano: number;
  projectNames: string[];
  userProjectsData: UserProjectMetadata[];
  schedules: string[];
  overtimeEntries: { date: string; schedule: string; pct: number; hours: number; h50?: number; h100?: number }[];
  contractHoursPerDay: number;
  cantidadJornadasLaborales: number;
  activeContractsCount: number;
  hasContractSchedules: boolean;
  rowProjectId?: string;
  rowProjectName?: string;
  rowKey: string; // Unique identifier for the UI row
  contractType?: string;
  contractAlta?: string;
  contractBaja?: string;
  /**
   * LAS ÁREAS Y LOS TURNOS EN QUE ESTA FILA TRABAJÓ EL PERÍODO.
   *
   * Son varios a propósito: la fila es una persona en un proyecto durante un mes, y en ese mes pudo
   * haber estado en Técnica de mañana y de noche. Guardar uno solo obligaba a elegir cuál mostrar
   * —el primero, el último— y cualquiera de los dos miente la mitad de las veces.
   *
   * Salen del PARTE de cada día, no del vínculo ni del contrato: es el mismo dato que mira el filtro
   * «Área / Turno», así que filtrar por «Noche» y ver la columna tienen que dar lo mismo.
   */
  areas: string[];
  turnos: string[];
  dailyAttendance: Record<
    string,
    {
      status: string;
      reason?: string;
      overtimeHours?: number;
      h50?: number;
      h100?: number;
      pct?: number;
      entryTime?: string;
      exitTime?: string;
      /**
       * El área y el turno de ESE día. Acá sí es uno solo y no una lista como en la fila, porque el
       * día es la unidad en la que el dato existe: el parte de ese día tiene un área y un turno.
       *
       * Salvo que la persona figure en DOS partes del mismo día —de mañana y de noche—, y entonces
       * se acumulan los dos separados por coma en vez de que el segundo pise al primero.
       */
      area?: string;
      turno?: string;
      /**
       * Los dos textos libres del día, separados porque son de distinto autor y alcance:
       * `nota` es la observación sobre ESTA persona, `comentarioParte` el del supervisor sobre la
       * novedad entera —y ese se repite en todas las filas de ese parte, que es lo correcto: el
       * comentario aplica al día, no a cada uno—.
       */
      nota?: string;
      comentarioParte?: string;
    }
  >;
}

const getDailyHoursFromContract = (horaInicio?: string, horaFin?: string): number => {
  if (!horaInicio || !horaFin) return 8; // Default 8 hours
  const parseTime = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + (m || 0);
  };

  const startMinutes = parseTime(horaInicio);
  let endMinutes = parseTime(horaFin);

  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60; // Next day
  }

  return (endMinutes - startMinutes) / 60;
};

// Contract Detail Sub-Modal
// Improved isActiveContract to check for status and period overlap
const isActiveContract = (contract: any, periodStart?: Date, periodEnd?: Date) => {
  if (!contract.fecha_alta_contrato) return false;

  const getLocalMidnight = (dateString: string) => {
    if (!dateString) return null;
    const isoDate = dateString.substring(0, 10);
    const parts = isoDate.split("-");
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
    }
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Status check - many employees might have active-looking dates but are marked as BAJA
  const status = (contract.nombre_estado_empleado || "").toLowerCase();
  if (status.includes("baja") || status.includes("inactivo")) return false;

  const altaDate = getLocalMidnight(contract.fecha_alta_contrato);
  if (!altaDate) return false;

  const bajaDate = contract.fecha_baja_contrato ? getLocalMidnight(contract.fecha_baja_contrato) : null;

  // Use current date for "is it active now" or overlap with period
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // If period is provided, check for overlap
  if (periodStart && periodEnd) {
    if (bajaDate && bajaDate < periodStart) return false;
    if (altaDate > periodEnd) return false;
    return true;
  }

  // Fallback to "active now"
  if (bajaDate) {
    return today >= altaDate && today <= bajaDate;
  }
  return today >= altaDate;
};

const getActiveContractForDate = (contracts: any[], dateStr: string) => {
  if (!contracts || contracts.length === 0) return null;
  const getLocalMidnight = (dateString: string) => {
    if (!dateString) return null;
    const isoDate = dateString.substring(0, 10);
    const parts = isoDate.split("-");
    if (parts.length === 3) {
      return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
    }
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const targetDate = getLocalMidnight(dateStr);
  if (!targetDate) return null;

  return contracts.find((c) => {
    const status = (c.nombre_estado_empleado || "").toLowerCase();
    if (status.includes("baja") || status.includes("inactivo")) return false;

    const altaDate = getLocalMidnight(c.fecha_alta_contrato);
    if (!altaDate) return false;

    const bajaDate = c.fecha_baja_contrato ? getLocalMidnight(c.fecha_baja_contrato) : null;

    if (bajaDate && bajaDate < targetDate) return false;
    if (altaDate > targetDate) return false;
    return true;
  });
};


const ContractDetailModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  employeeName: string;
  userProjectsData: UserProjectMetadata[];
  filterProjectId?: string;
  zIndex?: number;
  periodStart?: Date;
  periodEnd?: Date;
  /**
   * Diccionarios id → nombre para los campos que el contrato guarda SOLO como id.
   *
   * Los contratos que vienen del importador traen `categoria_sat_id`, `rol_frame_id`, `sede_id` y
   * `tipo_contrato_id`, pero los `nombre_*` correspondientes vacíos. Este detalle los leía directo,
   * así que mostraba «-» en media ficha mientras el wizard de Gestionar Equipo —que resuelve por id
   * contra los catálogos— mostraba los valores completos del MISMO contrato.
   */
  nombresPorId?: { categoria: Map<string, string>; rol: Map<string, string>; sede: Map<string, string>; tipo: Map<string, string> };
}> = ({ isOpen, onClose, employeeName, userProjectsData, filterProjectId, zIndex, periodStart, periodEnd, nombresPorId }) => {
  if (!isOpen) return null;

  // If a project filter is active, try to find the matching UserProject
  const relevantProjects = filterProjectId
    ? userProjectsData.filter((up) => {
        const upProjId = typeof up.projectId === "object" ? up.projectId?._id : up.projectId;
        return upProjId === filterProjectId;
      })
    : userProjectsData;

  // If filter produced no results, show all
  const sinAgrupar = relevantProjects.length > 0 ? relevantProjects : userProjectsData;

  /*
    UN BLOQUE POR PROYECTO, JUNTANDO LOS CONTRATOS DE TODOS SUS `UserProject`.

    Una misma persona puede tener VARIOS `UserProject` para el mismo proyecto, y cada uno con parte de
    sus contratos: el viejo del 31/05 en uno y el vigente del 01/06 en otro. Iterando de a uno, cada
    bloque elegía «su» último y el modal terminaba mostrando un contrato que la fila de la tabla ya
    había descartado — la fila agrupa por proyecto (ver `statsByEmployee`) y el detalle no lo hacía.

    Agrupados, las dos vistas eligen sobre el MISMO conjunto y no pueden discrepar. El nombre del rol
    se toma del primero que lo tenga: es el mismo proyecto, así que no compiten.
  */
  const projectsToShow = (() => {
    const porProyecto = new Map<string, UserProjectMetadata>();
    for (const up of sinAgrupar) {
      const clave = (up.nombre_proyecto || "").trim().toUpperCase().replace(/[\s\-_]/g, "") || String(typeof up.projectId === "object" ? up.projectId?._id : up.projectId || "");
      const previo = porProyecto.get(clave);
      if (!previo) {
        porProyecto.set(clave, { ...up, contracts: [...(up.contracts || [])] });
        continue;
      }
      previo.contracts = [...(previo.contracts || []), ...(up.contracts || [])];
      if (!previo.nombre_rol_frame && up.nombre_rol_frame) previo.nombre_rol_frame = up.nombre_rol_frame;
    }
    return Array.from(porProyecto.values());
  })();

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 animate-fade-in" style={{ zIndex: zIndex || 60 }} onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-800">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <FontAwesomeIcon icon={faFileContract} className="text-blue-600 dark:text-blue-400" />
              Detalle de Contrato
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{employeeName}</p>
          </div>
          <div className="flex items-center gap-6">
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
              <FontAwesomeIcon icon={faTimes} className="text-lg" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(80vh-70px)] p-6 space-y-6">
          {projectsToShow.length === 0 ? (
            <div className="text-center py-8 text-gray-500 italic">No se encontraron datos de contrato.</div>
          ) : (
            projectsToShow.map((up, upIdx) => (
              <div key={upIdx} className="space-y-4">
                {/* Project Header */}
                <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                  <FontAwesomeIcon icon={faBriefcase} className="text-blue-500" />
                  <span className="font-semibold text-gray-900 dark:text-white">{up.nombre_proyecto}</span>
                  {up.nombre_rol_frame && <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/30">{up.nombre_rol_frame}</span>}
                </div>

                {/* Contracts within the project */}
                {up.contracts && up.contracts.length > 0 ? (
                  (() => {
                    /*
                      SIEMPRE EL ÚLTIMO CONTRATO, sin opción de ver los otros.

                      Listaba los tres o cuatro del proyecto, uno debajo del otro y con los mismos
                      campos vacíos repetidos. Es el mismo dato que resume la columna —de ahí salen su
                      badge y sus fechas—, así que encontrar acá una lista distinta obligaba a adivinar
                      cuál de todos era el que la fila estaba mostrando.

                      Se toma el último de los activos del período, igual que hace `statsByEmployee`:
                      las dos vistas resuelven «el contrato» de la misma forma y no pueden discrepar.
                    */
                    const activos = up.contracts.filter((c) => isActiveContract(c, periodStart, periodEnd) || isActiveContract(c));

                    if (activos.length === 0) {
                      return <div className="text-sm text-gray-400 italic py-2">Sin contratos activos para este proyecto.</div>;
                    }

                    /*
                      CUÁL ES «EL ÚLTIMO» LO DECIDE `getContratoActivo`, NO EL ORDEN DEL ARRAY.

                      Tomaba el último elemento de la lista, que es el último CARGADO y no el que rige:
                      con dos contratos cargados el mismo día —uno del 31/05 y el vigente del 01/06—
                      mostraba el equivocado, y con él sus campos vacíos, mientras la ficha del miembro
                      mostraba el bueno con todos los sueldos.

                      Esa función es la que ya usa la ficha: entre los vigentes prioriza el TIEMPO
                      INDETERMINADO —un contrato sin fecha de fin sigue abierto aunque después figuren
                      cargados otros a plazo— y recién después el más reciente por fecha de alta.
                    */
                    const queRige = getContratoActivo(activos as any[]) as (typeof activos)[number] | null;
                    const filteredContracts = queRige ? [queRige] : activos.slice(-1);

                    return filteredContracts.map((contract, cIdx) => (
                      <div key={cIdx} className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-4 border border-gray-100 dark:border-gray-700 space-y-3">
                        {/* Contract title */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {/* Sin numerar: es el único que se muestra, y un «Contrato #1» haría
                                buscar el #2. */}
                            Último contrato
                            {(() => {
                              const tipo = contract.nombre_contrato || nombresPorId?.tipo.get(String(contract.tipo_contrato_id ?? "")) || "";
                              return tipo ? ` — ${tipo}` : "";
                            })()}
                          </span>
                          {contract.nombre_estado_empleado && <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${contract.nombre_estado_empleado?.toLowerCase().includes("activ") ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300"}`}>{contract.nombre_estado_empleado}</span>}
                        </div>

                        {/* Contract details grid */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                          <ContractField icon={faCalendarDays} label="Alta" value={formatContractDate(contract.fecha_alta_contrato)} highlight={isActiveContract(contract)} />
                          <ContractField icon={faCalendarDays} label="Baja" value={formatContractDate(contract.fecha_baja_contrato)} highlight={isActiveContract(contract)} />
                          <ContractField icon={faDollarSign} label="Sueldo Jornada" value={contract.sueldo_jornada != null ? `$${Number(contract.sueldo_jornada).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"} highlight />
                          <ContractField icon={faDollarSign} label="Sueldo Mano" value={contract.sueldo_mano != null ? `$${Number(contract.sueldo_mano).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"} highlight />
                          <ContractField icon={faHourglassHalf} label="Jornadas Lab." value={contract.cantidad_jornadas_laborales?.toString() || "-"} />
                          {/* El nombre guardado manda; si vino vacío, se resuelve por id. El rol tiene
                              además el del proyecto (`up.nombre_rol_frame`), que sí suele estar. */}
                          <ContractField icon={faLocationDot} label="Sede" value={contract.nombre_sede || nombresPorId?.sede.get(String(contract.sede_id ?? "")) || "-"} />
                          <ContractField icon={faIdBadge} label="Rol" value={contract.nombre_rol_frame || nombresPorId?.rol.get(String(contract.rol_frame_id ?? "")) || up.nombre_rol_frame || "-"} />
                          <ContractField icon={faStar} label="Categoría" value={contract.nombre_categoria_sat || nombresPorId?.categoria.get(String(contract.categoria_sat_id ?? "")) || "-"} />
                          <ContractField icon={faClock} label="Hora Inicio" value={contract.hora_inicio || "-"} />
                          <ContractField icon={faClock} label="Hora Fin" value={contract.hora_fin || "-"} />
                        </div>

                        {/* Observations */}
                        {contract.observaciones && (
                          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                            <div className="flex items-start gap-2">
                              <FontAwesomeIcon icon={faClipboardList} className="text-gray-400 mt-0.5 text-xs" />
                              <div>
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Observaciones</span>
                                <p className="text-sm text-gray-700 dark:text-gray-300 mt-0.5">{contract.observaciones}</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ));
                  })()
                ) : (
                  <div className="text-sm text-gray-400 italic py-2">Sin contratos registrados para este proyecto.</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// Helper to format contract dates
function formatContractDate(dateStr?: string): string {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
}

// Helper component for contract field rows
const ContractField: React.FC<{ icon: any; label: string; value: string; highlight?: boolean }> = ({ icon, label, value, highlight }) => (
  <div className="flex items-center gap-2">
    <FontAwesomeIcon icon={icon} className="text-gray-400 text-xs w-3" />
    <span className="text-gray-500 dark:text-gray-400 text-xs">{label}:</span>
    <span className={`font-medium text-xs ${highlight ? "text-green-600 dark:text-green-400" : "text-gray-800 dark:text-gray-200"}`}>{value}</span>
  </div>
);

// Row Total Detail Sub-Modal
const TotalDetailModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  stats: EmployeeStats | null;
  glossary: OvertimeSettings;
  zIndex?: number;
}> = ({ isOpen, onClose, stats, glossary, zIndex }) => {
  if (!isOpen || !stats) return null;

  const salaryDivisor = glossary.salaryDivisorPercentage || 150;
  const baseHourCost = stats.sueldoMano / salaryDivisor;
  const cost50 = stats.overtime50 * baseHourCost * (1 + glossary.pct50 / 100);
  const cost100 = stats.overtime100 * baseHourCost * (1 + glossary.pct100 / 100);
  const liquidDays = stats.cantidadJornadasLaborales - stats.absences;
  const baseSalaryMonto = stats.sueldoJornada * liquidDays;
  const total = baseSalaryMonto + cost50 + cost100;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 animate-fade-in" style={{ zIndex: zIndex || 100 }} onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full overflow-hidden border border-gray-200 dark:border-gray-700" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FontAwesomeIcon icon={faMoneyBillWave} className="text-green-600" />
            Cálculo de Monto Total
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="pb-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-sm font-bold text-gray-900 dark:text-white uppercase">{stats.employeeName}</p>
            <p className="text-[10px] text-gray-500 uppercase truncate">{stats.rowProjectName}</p>
          </div>

          <div className="space-y-2.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Jornadas en período:</span>
              <span className="font-medium text-gray-900 dark:text-white text-right">{stats.cantidadJornadasLaborales}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Ausencias:</span>
              <span className="font-medium text-red-600 text-right">-{stats.absences}</span>
            </div>
            <div className="flex justify-between text-xs font-bold border-t border-dashed border-gray-200 dark:border-gray-700 pt-2">
              <span>Días a liquidar:</span>
              <span className="text-right">{liquidDays}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Sueldo por jornada:</span>
              <span className="font-medium text-right">${stats.sueldoJornada.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-xs bg-green-50 dark:bg-green-900/10 p-2 rounded">
              <span className="font-semibold text-green-700 dark:text-green-400">Total Sueldo Base:</span>
              <span className="font-bold text-green-700 dark:text-green-400 text-right">${baseSalaryMonto.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>

            <div className="mt-4 pt-2 border-t border-gray-100 dark:border-gray-700">
              <p className="text-[9px] font-bold text-gray-400 uppercase mb-1.5">Monto por Horas Extras</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">
                    {stats.overtime50}hs extra al {glossary.pct50}%:
                  </span>
                  <span className="text-right">${cost50.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-gray-500">
                    {stats.overtime100}hs extra al {glossary.pct100}%:
                  </span>
                  <span className="text-right">${cost100.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t-2 border-green-500 flex justify-between items-center text-base font-black text-green-600 dark:text-green-400">
              <span>MONTO TOTAL:</span>
              <span className="text-right">${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-700/30 px-6 py-3 text-[9px] text-gray-400 dark:text-gray-500 italic text-center">* El monto base se calcula sobre los días de contrato en el período menos las ausencias registradas.</div>
      </div>
    </div>
  );
};

// --- DAILY DETALLE MODAL ---
interface DailyDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: EmployeeStats | null;
  dateFrom: string;
  dateTo: string;
  zIndex?: number;
}

const DailyDetailModal: React.FC<DailyDetailModalProps> = ({ isOpen, onClose, stats, dateFrom, dateTo, zIndex }) => {
  if (!isOpen || !stats) return null;

  const dates = eachDayOfInterval({ start: parseISO(dateFrom), end: parseISO(dateTo) });
  const daysMap: Record<string, string> = { Monday: "Lun", Tuesday: "Mar", Wednesday: "Mie", Thursday: "Jue", Friday: "Vie", Saturday: "Sab", Sunday: "Dom" };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 animate-fade-in" style={{ zIndex: zIndex || 100 }} onClick={onClose}>
      <div className="bg-[#121826] text-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden border border-gray-800 flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800/50 flex items-center justify-between bg-gray-900/50">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-500/70 mb-1">Detalle Diario de Asistencia</h3>
            <p className="text-xl font-bold text-white">{stats.employeeName}</p>
            <p className="text-xs text-gray-500 font-medium">{stats.rowProjectName || "Sin Proyecto"}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-2 bg-white/5 rounded-full">
            <FontAwesomeIcon icon={faTimes} className="text-xl" />
          </button>
        </div>

        {/* Filters/Stats Bar */}
        <div className="px-6 py-3 bg-[#1a2234] border-b border-gray-800/50 flex flex-wrap gap-4 items-center">
          <div className="flex gap-4">
            <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-700/30">
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Pres:</span>
              <span className="text-sm font-bold text-green-500">{stats.daysPresent}</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-700/30">
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Aus:</span>
              <span className="text-sm font-bold text-red-500">{stats.absences}</span>
            </div>
            <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-700/30">
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Extra:</span>
              <span className="text-sm font-bold text-amber-500">{stats.overtimeHours}h</span>
            </div>
          </div>
          <div className="h-4 w-[1px] bg-gray-700 mx-2 hidden sm:block"></div>
          <div className="text-[10px] text-gray-400 font-medium">
            Período: <span className="text-blue-400 font-bold">{dateFrom.split("-").reverse().join("/")}</span> al <span className="text-blue-400 font-bold">{dateTo.split("-").reverse().join("/")}</span>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto bg-[#121826]">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#121826] shadow-md z-10">
              <tr className="bg-gray-800/50 text-[10px] uppercase tracking-wider text-gray-400 font-bold border-b border-gray-700">
                <th className="py-3 px-6">Fecha / Día</th>
                <th className="py-3 px-6 text-center">Estado de Asistencia</th>
                <th className="py-3 px-6">Motivo / Detalle de Novedad</th>
                <th className="py-3 px-6 text-right">Información de Hs. Extras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {dates.map((date) => {
                const dateKey = format(date, "yyyy-MM-dd");
                const attendance = stats.dailyAttendance[dateKey];
                const dayName = format(date, "EEEE");
                const shortDay = daysMap[dayName] || format(date, "eee");

                return (
                  <tr key={dateKey} className={`hover:bg-white/[0.02] transition-colors ${attendance?.status === "absent" ? "bg-red-500/[0.02]" : ""}`}>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-200">{format(date, "dd/MM")}</span>
                        <span className="text-[10px] font-medium text-gray-500 uppercase py-0.5 px-2 bg-gray-800 rounded">{shortDay}</span>
                      </div>
                    </td>
                    <td className="py-3 px-6 text-center">{attendance ? <span className={`text-[9px] font-black px-2.5 py-1 rounded-md uppercase tracking-widest border ${attendance.status === "present" ? "bg-green-500/10 text-green-500 border-green-500/20" : attendance.status === "absent" ? "bg-red-500/10 text-red-500 border-red-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"}`}>{attendance.status === "present" ? "Presente" : attendance.status === "absent" ? "Ausente" : "Tardanza"}</span> : <span className="text-[9px] font-bold text-gray-700 uppercase italic opacity-20">Sin Registro</span>}</td>
                    <td className="py-3 px-6">
                      <span className="text-[11px] text-gray-400 italic">{attendance?.reason ? <span className={`${attendance.status === "absent" ? "text-red-400 font-medium" : ""}`}>{attendance.reason}</span> : "-"}</span>
                    </td>
                    <td className="py-3 px-6 text-right">
                      {attendance?.overtimeHours ? (
                        <div className="flex flex-col items-end">
                          <span className="text-sm font-bold text-blue-400">+{attendance.overtimeHours} h</span>
                          <span className="text-[9px] font-medium text-gray-500 uppercase tracking-tighter">
                            {attendance.entryTime} - {attendance.exitTime}
                          </span>
                          <div className="flex flex-col gap-0.5 text-[10px] font-bold text-right mt-1">
                            {(attendance.h50 || 0) > 0 && (
                              <span className="text-amber-500/95">+{attendance.h50}h al 50%</span>
                            )}
                            {(attendance.h100 || 0) > 0 && (
                              <span className="text-red-400/90">+{attendance.h100}h al 100%</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-700 text-sm">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#1a2234] border-t border-gray-800/50 flex justify-end">
          <button onClick={onClose} className="px-5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-black uppercase tracking-widest transition-all">
            Cerrar Detalle
          </button>
        </div>
      </div>
    </div>
  );
};

export const NewsReportsModal: React.FC<NewsReportsModalProps> = ({ isOpen, onClose, allUsers, allProjects, initialProjectFilter, cargando = false }) => {
  const navigate = useNavigate();
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [projectFilter, setProjectFilter] = useState("all");

  // Preselecciona el proyecto en el filtro cuando el modal se abre con un proyecto indicado (shortcut desde Proyectos).
  useEffect(() => {
    if (isOpen && initialProjectFilter && initialProjectFilter.trim()) {
      setProjectFilter(initialProjectFilter);
    }
  }, [isOpen, initialProjectFilter]);
  const [searchTerm, setSearchTerm] = useState("");
  const [contractModal, setContractModal] = useState<{ open: boolean; employeeName: string; data: UserProjectMetadata[] }>({ open: false, employeeName: "", data: [] });
  const [totalDetail, setTotalDetail] = useState<{ open: boolean; stats: EmployeeStats | null }>({ open: false, stats: null });
  const [dailyDetailModal, setDailyDetailModal] = useState<{ open: boolean; stats: EmployeeStats | null }>({ open: false, stats: null });
  const [showGlossary, setShowGlossary] = useState(false);
  const [showCalcInfo, setShowCalcInfo] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showActiveTableOnly, setShowActiveTableOnly] = useState(true);
  /**
   * TIPO DE CONTRATO: VARIOS A LA VEZ.
   *
   * Vacío = todos. Era uno solo, y con doce tipos en la lista la pregunta habitual —«los tres
   * plazo fijo», «todos los Eventual»— no se podía hacer: había que mirar el reporte tres veces y
   * sumar a mano.
   *
   * Una fila entra si ALGUNO de sus contratos es de alguno de los tipos tildados.
   */
  const [tiposSeleccionados, setTiposSeleccionados] = useState<string[]>([]);
  const alternarTipo = (tipo: string) => setTiposSeleccionados((previos) => (previos.includes(tipo) ? previos.filter((t) => t !== tipo) : [...previos, tipo]));

  /*
    LOS FILTROS QUE RESUELVE EL SERVER — los mismos que Gestionar Equipo.

    Vigencia, estado impositivo y reemplazo dependen del contrato que RIGE, y elegir ese contrato es
    una regla con desempates (ver `getContratoActivo`). Calcularlo acá obligaba a bajarse los
    contratos de las 1.577 personas del tenant: 2,7 MB y 22 segundos. El server contesta quiénes
    pasan y qué va en cada desplegable en 3 KB.

    Y sobre todo: el criterio es el MISMO que el de Gestionar Equipo porque es el mismo código. Dos
    implementaciones de "cuál es el contrato vigente" divergen el día que alguien toca una sola.
  */
  const [filtroEstadoUsuario, setFiltroEstadoUsuario] = useState("");
  const [filtroVigencia, setFiltroVigencia] = useState("");
  const [filtroEstadoContrato, setFiltroEstadoContrato] = useState("");
  /**
   * ÁREA Y TURNO: DOS FILTROS, Y CADA UNO DE A VARIOS.
   *
   * Era UNO solo y de a uno, con opciones combinadas («Técnica · Mañana»). Dos problemas: no se
   * podía preguntar «toda Técnica» sin correr el reporte una vez por turno, ni «todos los de la
   * noche» sin correrlo una vez por área; y como el combo salía del área/turno del PARTE —que casi
   * siempre viene NULL—, ofrecía unas pocas combinaciones que no eran las que muestra la columna.
   *
   * Ahora son dos listas independientes, de la misma fuente que la columna (el contrato), y se
   * cruzan: elegir Técnica y Noche deja las filas que tienen Técnica Y tienen Noche.
   */
  const [areasSeleccionadas, setAreasSeleccionadas] = useState<string[]>([]);
  const [turnosSeleccionados, setTurnosSeleccionados] = useState<string[]>([]);
  const alternarArea = (a: string) => setAreasSeleccionadas((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));
  const alternarTurno = (t: string) => setTurnosSeleccionados((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const [filtroReemplazo, setFiltroReemplazo] = useState("");
  const [filtroRol, setFiltroRol] = useState("");

  const [opcionesServidor, setOpcionesServidor] = useState<FiltrosDePersonas["opciones"]>({ roles: [], tipos: [], estados: [], areasTurnos: [] });
  /**
   * Las FILAS que pasan, como `userId::PROYECTONORMALIZADO`. `null` = no hay ninguno de estos
   * filtros puesto, así que no se recorta nada.
   *
   * Son filas y no personas porque el contrato que decide la vigencia, el tipo y el estado es el de
   * ESA fila —esa persona en ESE proyecto—. Recortando por persona, alguien con un contrato vigente
   * en otro proyecto pasaba entero y su fila NO VIGENTE quedaba en la tabla con «Vigentes» puesto.
   *
   * Es `null` y no un conjunto vacío a propósito: vacío significa "ninguna pasa", que es un
   * resultado legítimo, y confundirlo con "todavía no sé" vaciaría la tabla mientras carga.
   */
  const [clavesPermitidas, setClavesPermitidas] = useState<Set<string> | null>(null);

  /**
   * LA PLATA DE CADA FILA, del server.
   *
   * De acá salen S. Jornada, S. Mano, P. Hora, P. Hora Extra y el monto. El padrón no manda los
   * sueldos —serían dos números por cada uno de los 7.462 contratos del tenant, sobre un endpoint
   * que ya cuesta 27 s—, así que las seis columnas mostraban "-" y los totales del pie daban $0.
   *
   * Vienen del MISMO contrato que elige la fila, así que no pueden discrepar de lo que ella muestra.
   */
  const [economiaPorFila, setEconomiaPorFila] = useState<FiltrosDePersonas["economia"]>({});

  /**
   * LOS PARTES DEL PERÍODO, CON SU ASISTENCIA.
   *
   * No se usa el prop `reports`: ese es LA PÁGINA del listado —25 partes— y encima viene sin
   * `attendance`, porque el listado lo saca a propósito (eran 4,5 MB para dibujar cinco números por
   * fila). Contando sobre eso, TODAS las columnas de asistencia daban 0: Ángel Eduardo Bustos
   * figuraba con 0 asistencias en septiembre teniendo el parte del 18 cargado y presente.
   */
  const [partesDelPeriodo, setPartesDelPeriodo] = useState<ParteConAsistencia[]>([]);
  const [cargandoAsistencias, setCargandoAsistencias] = useState(false);
  /**
   * EL REPORTE NO PUEDE DECIR CERO CUANDO LO QUE PASA ES QUE NO SABE.
   *
   * Si la asistencia no llega, todas las columnas dan 0 y la tabla se lee como "no hubo novedades",
   * que es una afirmación sobre el mes. Pasó de verdad: el reporte mostró 0 presentes y 0 ausentes
   * durante horas con los partes cargados, y nada en la pantalla lo desmentía.
   */
  const [falloAsistencias, setFalloAsistencias] = useState(false);
  const [falloFiltros, setFalloFiltros] = useState(false);

  /** La misma clave que arma el server (ver `claveDeFila`). */
  const claveDeFila = (userId: string, proyectoNormalizado: string) => `${userId}::${proyectoNormalizado}`;
  const [filtrandoEnServidor, setFiltrandoEnServidor] = useState(false);
  /*
    FILTROS AVANZADOS, EN UNA VENTANA APARTE.

    La barra tenía cinco controles en dos filas y seguía sin alcanzar: no se podía aislar a quien
    tuvo ausencias, ni a quien hizo horas extra, que son las dos preguntas con las que se abre este
    reporte. Sumarlos a la barra la hubiera vuelto ilegible.

    Arriba quedan los tres que se tocan siempre —el período y el nombre—; el resto vive en el modal y
    la cantidad aplicada se ve en el badge del botón, así que nunca hay un filtro activo escondido.
  */
  const [filtrosOpen, setFiltrosOpen] = useState(false);
  /*
    EL CATÁLOGO DE TIPOS DE CONTRATO, PARA CUANDO EL CONTRATO NO TRAE EL NOMBRE.

    La columna «Tipo» sale de `nombre_contrato`, un texto copiado dentro de cada contrato. En los
    contratos que vienen del importador ese campo llega vacío —lo que sí llega es `tipo_contrato_id`—
    así que la columna mostraba «-» aunque el tipo estuviera cargado.

    Con el catálogo a mano se resuelve por id. El nombre propio sigue teniendo prioridad: si alguien
    lo escribió distinto en el contrato, eso es lo que se firmó.
  */
  const [tiposContratoCatalogo, setTiposContratoCatalogo] = useState<InfoItem[]>([]);
  const [sedesCatalogo, setSedesCatalogo] = useState<InfoItem[]>([]);
  const [categoriasCatalogo, setCategoriasCatalogo] = useState<{ _id: string; name: string; data?: { id?: number } }[]>([]);
  const [rolesCatalogo, setRolesCatalogo] = useState<{ _id: string; name: string; data?: { id?: number } }[]>([]);
  /**
   * Áreas y turnos, para la columna «Área | Turno».
   *
   * Van aparte de los otros cuatro porque no salen de `Info`: tienen ABM propio (`/areas`,
   * `/shifts`). Del turno hace falta además el horario, que es parte de cómo se lo nombra en toda la
   * app: «Noche (18:00 - 00:00)».
   */
  const [areasCatalogo, setAreasCatalogo] = useState<{ _id: string; name: string }[]>([]);
  const [turnosCatalogo, setTurnosCatalogo] = useState<{ _id: string; name: string; startTime?: string; endTime?: string }[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    /*
      Los cuatro catálogos que hacen falta para leer un contrato completo, cada uno con su catch: si
      alguno falla se pierde ESE nombre y no la pantalla. Se piden al abrir y no al montar, porque
      este modal vive dentro de Novedades y la mayoría de las veces no se abre.
    */
    void infoAPI.listByType("contrato").then(setTiposContratoCatalogo).catch(() => setTiposContratoCatalogo([]));
    void infoAPI.listByType("sede").then(setSedesCatalogo).catch(() => setSedesCatalogo([]));
    void categoriaSatAPI.list().then((c: any) => setCategoriasCatalogo(c)).catch(() => setCategoriasCatalogo([]));
    void roleFrameAPI.list().then((r: any) => setRolesCatalogo(r)).catch(() => setRolesCatalogo([]));
    void areasAPI.listAll().then((a: any) => setAreasCatalogo(a)).catch(() => setAreasCatalogo([]));
    void shiftsAPI.getAll().then((s: any) => setTurnosCatalogo(s)).catch(() => setTurnosCatalogo([]));
  }, [isOpen]);

  /** id → nombre, para los campos que el contrato guarda solo como id. */
  const porId = (items: { name: string; data?: { id?: number } }[]) => {
    const m = new Map<string, string>();
    for (const i of items) if (i.data?.id != null) m.set(String(i.data.id), i.name);
    return m;
  };
  const nombreTipoPorId = useMemo(() => porId(tiposContratoCatalogo), [tiposContratoCatalogo]);
  const nombresPorId = useMemo(
    () => ({ categoria: porId(categoriasCatalogo), rol: porId(rolesCatalogo), sede: porId(sedesCatalogo), tipo: nombreTipoPorId }),
    [categoriasCatalogo, rolesCatalogo, sedesCatalogo, nombreTipoPorId],
  );

  /**
   * EL ÁREA Y EL TURNO DE UNA FILA, desde sus contratos.
   *
   * No salen del parte. El `areaId`/`shiftId` del parte casi siempre viene NULL —un coordinador
   * carga UNA novedad por proyecto y día aunque coordine tres turnos, y el detalle por persona va
   * en `attendance[]`—, así que la columna quedaba en «-» para todo el mundo. Donde el dato existe
   * de verdad es en el contrato: `areaShiftAssignments`, un área con sus turnos.
   *
   * Es la misma fuente que dibuja los badges del listado de Novedades, que resuelve por persona
   * contra el padrón. Acá sale más directo porque la fila YA es una persona en un proyecto.
   *
   * Los ids pueden venir poblados (`{_id, name}`) o crudos, según el endpoint: se contemplan los
   * dos, como en el resto de la app.
   */
  const areaTurnoDeContratos = useMemo(() => {
    const nombreArea = new Map(areasCatalogo.map((a) => [String(a._id), a.name]));
    const turnoPorId = new Map(turnosCatalogo.map((t) => [String(t._id), t]));
    const idDe = (v: any) => String((typeof v === "object" && v ? v._id : v) || "");

    return (contratos: any[]) => {
      const areas: string[] = [];
      const turnos: string[] = [];

      const sumarArea = (v: any) => {
        const nombre = (typeof v === "object" && v?.name) || nombreArea.get(idDe(v));
        if (nombre && !areas.includes(nombre)) areas.push(nombre);
      };
      const sumarTurno = (v: any) => {
        const poblado = typeof v === "object" && v ? v : undefined;
        const t: any = poblado?.name ? poblado : turnoPorId.get(idDe(v));
        if (!t?.name) return;
        const etiqueta = `${t.name}${t.startTime && t.endTime ? ` (${t.startTime} - ${t.endTime})` : ""}`;
        if (!turnos.includes(etiqueta)) turnos.push(etiqueta);
      };

      for (const c of contratos || []) {
        for (const asignacion of c?.areaShiftAssignments || []) {
          sumarArea(asignacion.areaId);
          (asignacion.shiftIds || []).forEach(sumarTurno);
        }
        /* Los sueltos del contrato. El padrón los manda aparte de `areaShiftAssignments` —los
           importados traen uno u otro, no siempre los dos—, así que dejarlos afuera vaciaba la
           columna justo para los contratos que vienen de FRAME. */
        sumarArea(c?.areaId);
        sumarTurno(c?.shiftId);
      }
      return { areas, turnos };
    };
  }, [areasCatalogo, turnosCatalogo]);
  /**
   * ROL/ES EMPRESA: VARIOS A LA VEZ.
   *
   * Vacío = todos. Es `nombre_rol_frame`, el rol que la persona tiene asignado EN EL PROYECTO —lo
   * que en la ficha de usuario se llama «Rol/es Empresa»—, y no el rol de plataforma: ese es el
   * filtro «Rol/es» de más abajo, que lo resuelve el server contra la colección `Role`.
   *
   * Era de a uno y por la misma razón que los tipos de contrato no alcanzaba: las preguntas reales
   * son de a varios («los tres de maquillaje», «todas las coordinaciones») y de a uno obligaban a
   * correr el reporte una vez por rol y sumar a mano.
   *
   * Una fila entra si ALGUNO de sus proyectos tiene alguno de los roles elegidos.
   */
  const [rolesEmpresaSeleccionados, setRolesEmpresaSeleccionados] = useState<string[]>([]);
  const alternarRolEmpresa = (rol: string) => setRolesEmpresaSeleccionados((previos) => (previos.includes(rol) ? previos.filter((r) => r !== rol) : [...previos, rol]));
  /** «Solo los que tienen»: cada uno recorta a las filas con al menos un caso. */
  const [soloConAusencias, setSoloConAusencias] = useState(false);
  const [soloConExtras, setSoloConExtras] = useState(false);
  const [soloConTarde, setSoloConTarde] = useState(false);

  // Paginación client-side de la tabla de empleados (alivia el render de tablas grandes).
  const REPORT_PAGE_SIZE = 25;
  const [reportPage, setReportPage] = useState(1);
  const [glossary, setGlossary] = useState<OvertimeSettings>(overtimeUtils.getGlossary());

  useEffect(() => {
    if (isOpen) {
      setGlossary(overtimeUtils.getGlossary());
      setShowActiveTableOnly(true);
      setTiposSeleccionados([]);
      setShowStats(false);
    }
  }, [isOpen]);


  // Helper to check if a time is within a range (format "HH:mm")
  const isTimeInRange = (time: string, start: string, end: string) => {
    const t = time.replace(":", "");
    const s = start.replace(":", "");
    const e = end.replace(":", "");
    if (s <= e) {
      return t >= s && t <= e;
    } else {
      // Over midnight case (not used in current logic but good practice)
      return t >= s || t <= e;
    }
  };




  // Build a map of userId -> User for quick lookup
  const usersMap = useMemo(() => {
    const map = new Map<string, User>();
    allUsers.forEach((u) => {
      if (u._id) map.set(u._id.toString(), u);
    });
    return map;
  }, [allUsers]);

  const statsByEmployee = useMemo(() => {
    const employeeMap = new Map<string, EmployeeStats>();
    const start = parseISO(dateFrom + "T00:00:00");
    const end = parseISO(dateTo + "T23:59:59");

    // Helper to normalize project names for consistent keys
    const normalizeProjectName = (name: string) =>
      (name || "")
        .trim()
        .toUpperCase()
        .replace(/[\s\-_]/g, "");

    const getLocalMidnight = (dateString: string) => {
      if (!dateString) return null;
      const isoDate = dateString.substring(0, 10);
      const parts = isoDate.split("-");
      if (parts.length === 3) {
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0, 0);
      }
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const countContractOverlaps = (contracts: any[]) => {
      const coveredDates = new Set<string>();
      const startMs = start.getTime();
      const endMs = end.getTime();

      contracts.forEach((c) => {
        const cA = getLocalMidnight(c.fecha_alta_contrato);
        if (!cA) return;
        const cB = c.fecha_baja_contrato ? getLocalMidnight(c.fecha_baja_contrato) : null;

        let curr = new Date(cA);
        // Avoid infinite loop if no baja and we keep adding days
        const safetyEnd = cB ? cB.getTime() : endMs;

        while (curr.getTime() <= safetyEnd) {
          const t = curr.getTime();
          if (t >= startMs && t <= endMs) {
            coveredDates.add(curr.toISOString().substring(0, 10));
          }
          if (t >= endMs) break;
          curr.setDate(curr.getDate() + 1);
        }
      });
      return coveredDates.size;
    };

    /*
      ═══════════════════════════════════════════════════════════════════════════════════════════
      DE (PERSONA, PROYECTO) A LA FILA, POR ID DE PROYECTO Y NO POR NOMBRE.
      ═══════════════════════════════════════════════════════════════════════════════════════════

      Las filas del padrón se agrupan por el nombre que guarda el VÍNCULO (`nombre_proyecto`), y la
      asistencia llega con el nombre que tiene el PROYECTO. No son el mismo texto: 369 de los 867
      vínculos guardan el prefijo numérico —«426_LN+» contra «LN+», y LN+ solo son 256—.

      Buscando por nombre normalizado, «426LN+» no encontraba nunca a «LN+»: la asistencia no hallaba
      su fila, caía al camino de respaldo, ahí tampoco encontraba contratos (los busca por el mismo
      nombre) y se descartaba. Presentes, ausentes y horas extra quedaban en cero para casi todos.

      El id de proyecto lo tienen los dos lados y es exacto. El nombre queda de respaldo para los
      vínculos viejos que no tienen id.
    */
    const filaPorProyectoId = new Map<string, { mapKey: string; normName: string }>();

    // 1. Initialize from User Roster (Full Metadata Check)
    allUsers.forEach((user) => {
      if (!user._id) return;
      const userIdStr = user._id.toString();
      const userProjects = user.metadata?.projects || [];

      // Group metadata by normalized project name to merge contracts/IDs
      const groupedProjects = new Map<
        string,
        {
          originalName: string;
          projectId: string | undefined;
          allContracts: any[];
        }
      >();

      userProjects.forEach((up) => {
        const rawName = up.nombre_proyecto || "Desconocido";
        const normName = normalizeProjectName(rawName);
        if (normName === "DESCONOCIDO" && !up.projectId) return;

        if (!groupedProjects.has(normName)) {
          groupedProjects.set(normName, {
            originalName: rawName.trim(),
            projectId: typeof up.projectId === "object" ? up.projectId?._id : up.projectId,
            allContracts: [],
          });
        }
        const group = groupedProjects.get(normName)!;
        if (up.contracts) group.allContracts.push(...up.contracts);

        // Por dónde va a entrar la asistencia. Se anota acá, mientras se tiene el vínculo con su id.
        const idProyecto = String((typeof up.projectId === "object" ? up.projectId?._id : up.projectId) || "");
        if (idProyecto) filaPorProyectoId.set(`${userIdStr}::${idProyecto}`, { mapKey: `${userIdStr}-${normName}`, normName });
      });

      // Process each unique project for this user
      groupedProjects.forEach((group, normName) => {
        const { originalName, projectId, allContracts } = group;

        /*
          EL RECORTE DE LOS FILTROS DEL SERVER, por FILA.

          Va acá y no arriba con la persona porque vigencia, tipo, estado y reemplazo salen del
          contrato de ESTE proyecto: la misma persona puede estar vigente en uno y no en el otro.
        */
        if (clavesPermitidas && !clavesPermitidas.has(claveDeFila(userIdStr, normName))) return;

        // Project Filter check
        if (projectFilter !== "all") {
          const filterProj = allProjects.find((p) => p.id === projectFilter);
          const filterNorm = normalizeProjectName(filterProj?.name || "");
          if (projectId !== projectFilter && normName !== filterNorm) return;
        }

        // Active Contract filter
        const activeContracts = allContracts.filter((c) => isActiveContract(c, start, end));
        const activeCount = activeContracts.length;

        // STRICT: If switch is on, skip this project row if no active contracts overlap the period
        if (showActiveTableOnly && activeCount === 0) return;

        // Contract Type Filter check
        if (tiposSeleccionados.length > 0) {
          const targetsForFilter = showActiveTableOnly ? activeContracts : allContracts;
          // Mismo fallback que la columna: comparar solo contra `nombre_contrato` no encontraba nada en
          // los contratos importados, que traen el tipo en `tipo_contrato_id` y el nombre vacío.
          const hasType = targetsForFilter.some((c) => tiposSeleccionados.includes(c.nombre_contrato || nombreTipoPorId.get(String(c.tipo_contrato_id ?? "")) || ""));
          if (!hasType) return;
        }

        const mapKey = `${userIdStr}-${normName}`;

        // Pick best info from available contracts
        const targetList = showActiveTableOnly ? activeContracts : allContracts;
        let sueldoJornada = 0;
        let sueldoMano = 0;
        let contractHoursPerDay = 8;
        let cantidadJornadasLaborales = 0;
        let contractSchedules: string[] = [];

        targetList.forEach((contract) => {
          if (contract.hora_inicio && contract.hora_fin) {
            const hours = getDailyHoursFromContract(contract.hora_inicio, contract.hora_fin);
            const sched = `${contract.hora_inicio}-${contract.hora_fin} | ${hours}hs`;
            if (!contractSchedules.includes(sched)) contractSchedules.push(sched);
          }
        });

        let contractType = "";
        let contractAlta = "";
        let contractBaja = "";

        if (targetList.length > 0) {
          // El que RIGE, no el último cargado: entre los vigentes gana el tiempo indeterminado, y
          // recién después el más reciente. La columna y el detalle tienen que resolverlo igual, o la
          // fila resume un contrato y el modal muestra otro.
          const last = (getContratoActivo(targetList as any[]) as any) || targetList[targetList.length - 1];
          /*
            Los sueldos del server (ver `economiaPorFila`). El contrato del padrón no los trae; si
            algún día los trajera, el `||` deja que ganen los de acá, que son del mismo contrato.
          */
          const plata = economiaPorFila[claveDeFila(userIdStr, normName)];
          sueldoJornada = plata?.sueldoJornada || last.sueldo_jornada || 0;
          sueldoMano = plata?.sueldoMano || last.sueldo_mano || 0;
          if (last.hora_inicio && last.hora_fin) {
            contractHoursPerDay = getDailyHoursFromContract(last.hora_inicio, last.hora_fin);
          }
          // El nombre propio manda; si no vino, se resuelve por `tipo_contrato_id`.
          contractType = last.nombre_contrato || nombreTipoPorId.get(String(last.tipo_contrato_id ?? "")) || "";
          contractAlta = last.fecha_alta_contrato || "";
          contractBaja = last.fecha_baja_contrato || "";

          // REVISED: Calculate overlap days instead of taking static value
          cantidadJornadasLaborales = countContractOverlaps(targetList);
        }

        employeeMap.set(mapKey, {
          employeeId: userIdStr,
          employeeName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Sin Nombre",
          absences: 0,
          absenceDetails: {},
          overtimeHours: 0,
          daysPresent: 0,
          lateDays: 0,
          totalRecords: 0,
          sueldoJornada,
          sueldoMano,
          projectNames: user.projectIds?.map((p) => p.name) || [],
          userProjectsData: userProjects,
          overtime50: 0,
          overtime100: 0,
          schedules: [...contractSchedules],
          overtimeEntries: [],
          contractHoursPerDay,
          cantidadJornadasLaborales,
          activeContractsCount: activeCount,
          hasContractSchedules: contractSchedules.length > 0,
          rowProjectId: projectId,
          rowProjectName: originalName,
          rowKey: mapKey,
          contractType,
          contractAlta,
          contractBaja,
          /* De los MISMOS contratos que el resto de la fila (ver `areaTurnoDeContratos`), igual que
             la columna Horario Base: son varios cuando la persona trabaja en dos áreas o turnos. */
          ...areaTurnoDeContratos(targetList),
          dailyAttendance: {},
        });
      });
    });

    /*
      2. La asistencia, de TODOS los partes del período.

      De `partesDelPeriodo` y no del prop `reports`: ese es la página del listado —25 partes— y sin
      `attendance`, así que este bucle no iteraba nada y todas las columnas daban 0.
    */
    partesDelPeriodo.forEach((report) => {
      try {
        const reportDate = parseISO(report.date + "T00:00:00");
        if (!isWithinInterval(reportDate, { start, end })) return;
      } catch {
        return;
      }

      if (projectFilter !== "all" && report.projectIdRaw !== projectFilter) return;

      report.attendance.forEach((record) => {
        const empIdStr = String(record.employeeId || "");
        if (!empIdStr) return;

        const reportProjName = report.projectName || allProjects.find((p) => p.id === (report.projectIdRaw || ""))?.name || "Sin Proyecto";

        /*
          POR ID PRIMERO. El nombre del parte y el del vínculo no son el mismo texto («LN+» contra
          «426_LN+»), así que buscar por nombre dejaba la asistencia sin fila. Si la persona tiene un
          vínculo con ESTE proyecto, esa es su fila, se llame como se llame.
        */
        const delPadron = filaPorProyectoId.get(`${empIdStr}::${report.projectIdRaw || ""}`);
        const normReportProjName = delPadron?.normName || normalizeProjectName(reportProjName);
        const mapKey = delPadron?.mapKey || `${empIdStr}-${normReportProjName}`;

        // Fallback Initialization (if not in roster or skipped previously)
        if (!employeeMap.has(mapKey)) {
          // El mismo recorte que arriba: esta rama también crea filas, así que también tiene que filtrar.
          if (clavesPermitidas && !clavesPermitidas.has(claveDeFila(empIdStr, normReportProjName))) return;
          const user = usersMap.get(empIdStr);
          const userProjects = user?.metadata?.projects || [];

          let sueldoJornada = 0;
          let sueldoMano = 0;
          let contractHoursPerDay = 8;
          let cantidadJornadasLaborales = 0;
          let activeCount = 0;
          let contractSchedules: string[] = [];

          /*
            Los contratos de esa persona en ese proyecto: por id, y por nombre sólo si el vínculo no
            tiene id. Buscarlos sólo por nombre era la segunda mitad del mismo problema — no los
            encontraba, la fila quedaba con cero contratos activos y se descartaba entera.
          */
          const matchContracts: any[] = [];
          userProjects.forEach((up) => {
            const idDelVinculo = String((typeof up.projectId === "object" ? (up.projectId as any)?._id : up.projectId) || "");
            const coincide = idDelVinculo ? idDelVinculo === String(report.projectIdRaw || "") : normalizeProjectName(up.nombre_proyecto || "") === normReportProjName;
            if (coincide && up.contracts) matchContracts.push(...up.contracts);
          });

          const activeContracts = matchContracts.filter((c) => isActiveContract(c, start, end));
          activeCount = activeContracts.length;

          // STRICT: Skip addition if filter is on and no active contract
          if (showActiveTableOnly && activeCount === 0) return;

          // Contract Type Filter check
          if (tiposSeleccionados.length > 0) {
            const targetsForFilter = showActiveTableOnly ? activeContracts : matchContracts;
            // Mismo fallback que la columna: comparar solo contra `nombre_contrato` no encontraba nada en
            // los contratos importados, que traen el tipo en `tipo_contrato_id` y el nombre vacío.
            const hasType = targetsForFilter.some((c) => tiposSeleccionados.includes(c.nombre_contrato || nombreTipoPorId.get(String(c.tipo_contrato_id ?? "")) || ""));
            if (!hasType) return;
          }

          const targets = showActiveTableOnly ? activeContracts : matchContracts;
          targets.forEach((c) => {
            if (c.hora_inicio && c.hora_fin) {
              const h = getDailyHoursFromContract(c.hora_inicio, c.hora_fin);
              const s = `${c.hora_inicio}-${c.hora_fin} | ${h}hs`;
              if (!contractSchedules.includes(s)) contractSchedules.push(s);
            }
          });

          let contractType = "";
          let contractAlta = "";
          let contractBaja = "";

          if (targets.length > 0) {
            // Ídem: el que rige, no el último del array (ver arriba).
            const last = (getContratoActivo(targets as any[]) as any) || targets[targets.length - 1];
            // Ídem arriba: los sueldos vienen del server.
            const plata = economiaPorFila[claveDeFila(empIdStr, normReportProjName)];
            sueldoJornada = plata?.sueldoJornada || last.sueldo_jornada || 0;
            sueldoMano = plata?.sueldoMano || last.sueldo_mano || 0;
            contractHoursPerDay = getDailyHoursFromContract(last.hora_inicio, last.hora_fin);
            // El nombre propio manda; si no vino, se resuelve por `tipo_contrato_id`.
          contractType = last.nombre_contrato || nombreTipoPorId.get(String(last.tipo_contrato_id ?? "")) || "";
            contractAlta = last.fecha_alta_contrato || "";
            contractBaja = last.fecha_baja_contrato || "";

            // REVISED: Calculate overlap days
            cantidadJornadasLaborales = countContractOverlaps(targets);
          }

          employeeMap.set(mapKey, {
            employeeId: empIdStr,
            // El nombre sale del padrón: el parte manda ids, no nombres (repetirlos era mandar los mismos cincuenta 1.500 veces).
            employeeName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Sin Nombre" : "Desconocido",
            absences: 0,
            absenceDetails: {},
            overtimeHours: 0,
            daysPresent: 0,
            lateDays: 0,
            totalRecords: 0,
            sueldoJornada,
            sueldoMano,
            projectNames: user?.projectIds?.map((p) => p.name) || [],
            userProjectsData: userProjects,
            overtime50: 0,
            overtime100: 0,
            schedules: [...contractSchedules],
            overtimeEntries: [],
            contractHoursPerDay,
            cantidadJornadasLaborales,
            activeContractsCount: activeCount,
            hasContractSchedules: contractSchedules.length > 0,
            rowProjectId: report.projectIdRaw,
            rowProjectName: reportProjName,
            rowKey: mapKey,
            contractType,
            contractAlta,
            contractBaja,
            // Ídem arriba: esta rama también crea filas, así que también tiene que traerlos.
            ...areaTurnoDeContratos(targets),
            dailyAttendance: {},
          });
        }

        const stats = employeeMap.get(mapKey);
        if (!stats) return;

        stats.totalRecords += 1;

        /*
          El área y el turno de ESTE parte, sin repetir.

          Se acumula acá y no al crear la fila porque es lo único que sabe en qué área y turno
          trabajó la persona ese día: el vínculo y el contrato guardan la asignación, que es otra
          cosa —y suele estar vacía en los importados—.
        */
        const areaDelParte = report.areaName || "";
        const turnoDelParte = report.shiftName
          ? `${report.shiftName}${report.shiftStartTime && report.shiftEndTime ? ` (${report.shiftStartTime} - ${report.shiftEndTime})` : ""}`
          : "";
        if (areaDelParte && !stats.areas.includes(areaDelParte)) stats.areas.push(areaDelParte);
        if (turnoDelParte && !stats.turnos.includes(turnoDelParte)) stats.turnos.push(turnoDelParte);

        if (record.status === "present" || record.status === "late") {
          stats.daysPresent += 1;
          if (record.status === "late") stats.lateDays += 1;
        } else {
          stats.absences += 1;
          const reason = record.absenceReason || "Sin motivo";
          stats.absenceDetails[reason] = (stats.absenceDetails[reason] || 0) + 1;
        }

        // Track daily attendance with normalized key
        const dateKey = report.date.substring(0, 10);
        const ot = record.overtimeHours || 0;

        let h50 = record.overtimeHours50 || 0;
        let h100 = record.overtimeHours100 || 0;
        let pct = h100 > h50 ? glossary.pct100 : glossary.pct50;

        if (ot > 0 && h50 === 0 && h100 === 0) {
          // Retrieve active contract's schedule on report date to perform schedule-aware split
          // (mismo criterio que arriba: por id de proyecto, y por nombre sólo si el vínculo no tiene id)
          const userProjects = stats.userProjectsData || [];
          const matchContracts: any[] = [];
          userProjects.forEach((up) => {
            const idDelVinculo = String((typeof up.projectId === "object" ? (up.projectId as any)?._id : up.projectId) || "");
            const coincide = idDelVinculo ? idDelVinculo === String(report.projectIdRaw || "") : normalizeProjectName(up.nombre_proyecto || "") === normReportProjName;
            if (coincide && up.contracts) matchContracts.push(...up.contracts);
          });
          const activeContract = getActiveContractForDate(matchContracts, report.date);

          const res = splitOvertime(
            report.date,
            record.overtimeEntryTime || "",
            record.overtimeExitTime || "",
            ot,
            glossary,
            activeContract?.hora_inicio || undefined,
            activeContract?.hora_fin || undefined
          );
          h50 = res.h50;
          h100 = res.h100;
          pct = res.pct;
        }


        /* Dos partes el mismo día (mañana y noche) son dos áreas/turnos para esa fecha: se suman en
           vez de pisarse, que es lo que haría asignar de una. */
        const sumarAlDia = (previo: string | undefined, nuevo: string) => {
          if (!nuevo) return previo || "";
          const ya = (previo || "").split(", ").filter(Boolean);
          return ya.includes(nuevo) ? ya.join(", ") : [...ya, nuevo].join(", ");
        };

        stats.dailyAttendance[dateKey] = {
          area: sumarAlDia(stats.dailyAttendance[dateKey]?.area, areaDelParte),
          turno: sumarAlDia(stats.dailyAttendance[dateKey]?.turno, turnoDelParte),
          /* Mismo criterio que el área: dos partes el mismo día suman sus textos en vez de que el
             segundo borre al primero. */
          nota: sumarAlDia(stats.dailyAttendance[dateKey]?.nota, (record.notes || "").trim()),
          comentarioParte: sumarAlDia(stats.dailyAttendance[dateKey]?.comentarioParte, (report.comments || "").trim()),
          status: record.status,
          reason: record.absenceReason || (record.status === "late" ? "Tardanza" : undefined),
          overtimeHours: ot,
          h50,
          h100,
          pct: pct || (h100 > 0 ? glossary.pct100 : glossary.pct50),
          entryTime: record.overtimeEntryTime,
          exitTime: record.overtimeExitTime,
        };

        stats.overtimeHours += ot;
        stats.overtime50 += h50;
        stats.overtime100 += h100;

        if (ot > 0) {
          const oTSched = record.overtimeEntryTime && record.overtimeExitTime ? `${record.overtimeEntryTime}-${record.overtimeExitTime}` : "Hs. Seteadas";
          const dFmt = format(parseISO(report.date + "T00:00:00"), "dd/MM");
          stats.overtimeEntries.push({
            date: dFmt,
            schedule: oTSched,
            pct: pct || (h100 > 0 ? glossary.pct100 : glossary.pct50),
            hours: ot,
            h50,
            h100
          });
        }
      });
    });

    // 3. Final Pass: Recalculate totals from dailyAttendance to ensure absolute consistency
    employeeMap.forEach((stats) => {
      const attendance = Object.values(stats.dailyAttendance);
      stats.daysPresent = attendance.filter((a) => a.status === "present" || a.status === "late").length;
      stats.lateDays = attendance.filter((a) => a.status === "late").length;
      stats.absences = attendance.filter((a) => a.status === "absent").length;
    });

    // 4. Final Filtering & Sorting
    let results = Array.from(employeeMap.values());

    // STRICT RE-CHECK: Guarantee no 0-contract rows exist if filter is on
    if (showActiveTableOnly) {
      results = results.filter((emp) => emp.activeContractsCount > 0);
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      results = results.filter((s) => s.employeeName.toLowerCase().includes(lowerSearch));
    }

    /*
      Los filtros del modal, todos sobre el resultado ya armado.

      Van acá y no adentro del armado porque son recortes sobre lo calculado —«quién tuvo ausencias»
      solo se sabe después de contarlas—, y porque así el pie de la tabla sigue sumando exactamente
      lo que se ve.
    */
    /* Se cruzan, no se suman: Técnica + Noche son las filas que tienen Técnica Y tienen Noche. Dentro
       de cada lista, en cambio, alcanza con cualquiera. */
    if (areasSeleccionadas.length > 0) {
      results = results.filter((s) => s.areas.some((a) => areasSeleccionadas.includes(a)));
    }
    if (turnosSeleccionados.length > 0) {
      results = results.filter((s) => s.turnos.some((t) => turnosSeleccionados.includes(t)));
    }
    if (rolesEmpresaSeleccionados.length > 0) {
      results = results.filter((s) => (s.userProjectsData || []).some((up) => !!up.nombre_rol_frame && rolesEmpresaSeleccionados.includes(up.nombre_rol_frame)));
    }
    if (soloConAusencias) results = results.filter((s) => s.absences > 0);
    if (soloConExtras) results = results.filter((s) => s.overtimeHours > 0);
    if (soloConTarde) results = results.filter((s) => s.lateDays > 0);

    return results.sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [partesDelPeriodo, dateFrom, dateTo, projectFilter, searchTerm, usersMap, glossary, showActiveTableOnly, allUsers, allProjects, tiposSeleccionados, rolesEmpresaSeleccionados, soloConAusencias, soloConExtras, soloConTarde, clavesPermitidas, economiaPorFila, areaTurnoDeContratos, areasSeleccionadas, turnosSeleccionados]);

  /**
   * LAS OPCIONES SALEN DEL PERÍODO, no del sistema entero.
   *
   * Antes los tres selectores se armaban con TODO lo cargado: proyectos que no tuvieron una sola
   * novedad en el mes, roles que no aparecen, tipos de contrato de gente que no figura. Elegir
   * cualquiera de esos dejaba la tabla vacía sin explicar por qué, y con 133 empleados la lista de
   * opciones era más larga que el resultado.
   *
   * Se recorren las novedades del rango, se junta a quiénes aparecen y de ahí salen los tres
   * conjuntos. NO depende de los filtros aplicados —solo del período— porque si dependiera, elegir un
   * proyecto borraría del selector a los demás y no habría forma de cambiar de opinión.
   */
  /*
    LE PREGUNTA AL SERVER QUIÉNES PASAN, cada vez que cambian el período o alguno de estos filtros.

    Se pide SIEMPRE —aunque no haya filtro puesto— porque la respuesta también trae las opciones de
    cada desplegable, y esas tienen que existir antes de que alguien pueda elegir una. Sin filtros
    el recorte queda en `null` y no se descarta ninguna fila.

    `vigente` corta las respuestas viejas: con el período abierto se tipea rápido y una respuesta
    lenta de un filtro anterior pisaba a la de uno nuevo.
  */
  /*
    La asistencia del período, cada vez que cambia el período. `vivo` descarta las respuestas viejas:
    se tipea rápido sobre las fechas y una respuesta lenta de un rango anterior pisaba a la nueva.
  */
  useEffect(() => {
    if (!isOpen || !dateFrom || !dateTo) return;
    let vivo = true;
    setCargandoAsistencias(true);
    activityReportsAPI
      .asistenciasDelPeriodo(dateFrom, dateTo)
      .then((p) => {
        if (!vivo) return;
        setPartesDelPeriodo(p);
        setFalloAsistencias(false);
      })
      .catch((e) => {
        if (!vivo) return;
        console.error("No se pudo traer la asistencia del período", e);
        setPartesDelPeriodo([]);
        setFalloAsistencias(true);
      })
      .finally(() => vivo && setCargandoAsistencias(false));
    return () => {
      vivo = false;
    };
  }, [isOpen, dateFrom, dateTo]);

  useEffect(() => {
    if (!isOpen || !dateFrom || !dateTo) return;
    let vigente = true;

    const hayFiltro = !!(filtroEstadoUsuario || filtroVigencia || filtroEstadoContrato || filtroReemplazo || filtroRol);
    setFiltrandoEnServidor(true);

    activityReportsAPI
      .filtrosDePersonas(dateFrom, dateTo, {
        estadoUsuario: filtroEstadoUsuario,
        vigencia: filtroVigencia,
        estadoContrato: filtroEstadoContrato,
        // Área y turno ya no viajan: se resuelven acá, contra el contrato (ver `areasSeleccionadas`).
        reemplazo: filtroReemplazo,
        rol: filtroRol,
        /*
          El interruptor «solo con contrato activo» decide si la fila mira los contratos del período
          o todos, y con eso CAMBIA CUÁL RIGE. Si no viajara, el server elegiría un contrato y la
          tabla mostraría otro, que es exactamente el bug que tenía esto.
        */
        soloContratoActivo: showActiveTableOnly ? "1" : "0",
      })
      .then((r) => {
        if (!vigente) return;
        setOpcionesServidor(r.opciones);
        setClavesPermitidas(hayFiltro ? new Set(r.claves) : null);
        setEconomiaPorFila(r.economia || {});
        setFalloFiltros(false);
      })
      .catch((e) => {
        if (!vigente) return;
        console.error("No se pudieron resolver los filtros", e);
        // Ante un error NO se recorta, PERO SE AVISA: sin el cartel, la tabla se ve igual que si
        // el filtro hubiera andado y devuelto todo, y eso es una respuesta equivocada sin señal.
        setClavesPermitidas(null);
        setFalloFiltros(true);
      })
      .finally(() => vigente && setFiltrandoEnServidor(false));

    return () => {
      vigente = false;
    };
  }, [isOpen, dateFrom, dateTo, filtroEstadoUsuario, filtroVigencia, filtroEstadoContrato, filtroReemplazo, filtroRol, showActiveTableOnly]);

  const universoDelPeriodo = useMemo(() => {
    const proyectos = new Map<string, string>();
    const roles = new Set<string>();
    const tipos = new Set<string>();
    const areas = new Set<string>();
    const turnos = new Set<string>();
    const empleados = new Set<string>();

    let start: Date;
    let end: Date;
    try {
      start = parseISO(dateFrom + "T00:00:00");
      end = parseISO(dateTo + "T23:59:59");
    } catch {
      return { proyectos: [], roles: [], tipos: [], areas: [], turnos: [] };
    }

    // Del período entero, no de la página del listado: si no, el selector de Proyecto listaba los
    // proyectos de 25 partes y faltaban los demás.
    for (const report of partesDelPeriodo) {
      try {
        if (!isWithinInterval(parseISO(report.date + "T00:00:00"), { start, end })) continue;
      } catch {
        continue;
      }
      if (report.projectIdRaw) proyectos.set(report.projectIdRaw, report.projectName);
      for (const rec of report.attendance || []) {
        if (rec.employeeId) empleados.add(String(rec.employeeId));
      }
    }

    // Roles y tipos de contrato salen de la gente que aparece en esas novedades.
    for (const u of allUsers || []) {
      if (!empleados.has(String(u._id))) continue;
      for (const up of ((u.metadata?.projects || []) as UserProjectMetadata[])) {
        if (up.nombre_rol_frame) roles.add(up.nombre_rol_frame);
        /* Las opciones de Área y Turno salen de la MISMA fuente que la columna «Área | Turno»
           (`areaTurnoDeContratos`). Antes las mandaba el server leyendo el área/turno del parte, que
           casi siempre viene NULL: el desplegable ofrecía unas pocas combinaciones que no eran las
           que la tabla mostraba, así que filtrar por una y leer la columna no coincidían. */
        const delVinculo = areaTurnoDeContratos(up.contracts || []);
        delVinculo.areas.forEach((a) => areas.add(a));
        delVinculo.turnos.forEach((t) => turnos.add(t));
        for (const c of up.contracts || []) {
          // El mismo fallback que la columna «Tipo»: el nombre propio, y si no vino, el catálogo.
          const nombre = c.nombre_contrato || nombreTipoPorId.get(String(c.tipo_contrato_id ?? "")) || "";
          if (nombre.trim()) tipos.add(nombre.trim());
        }
      }
    }

    const ordenar = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });
    return {
      proyectos: Array.from(proyectos, ([id, name]) => ({ id, name })).sort((a, b) => ordenar(a.name, b.name)),
      roles: Array.from(roles).sort(ordenar),
      tipos: Array.from(tipos).sort(ordenar),
      areas: Array.from(areas).sort(ordenar),
      turnos: Array.from(turnos).sort(ordenar),
    };
  }, [partesDelPeriodo, dateFrom, dateTo, allUsers, nombreTipoPorId, areaTurnoDeContratos]);

  const rolesEmpresaDisponibles = universoDelPeriodo.roles;

  /** Cuántos filtros del modal están puestos. Es lo que se muestra en el badge del botón. */
  const filtrosActivos = useMemo(
    () =>
      [
        projectFilter !== "all",
        tiposSeleccionados.length > 0,
        rolesEmpresaSeleccionados.length > 0,
        !showActiveTableOnly,
        soloConAusencias,
        soloConExtras,
        soloConTarde,
        !!filtroEstadoUsuario,
        !!filtroVigencia,
        !!filtroEstadoContrato,
        areasSeleccionadas.length > 0,
        turnosSeleccionados.length > 0,
        !!filtroReemplazo,
        !!filtroRol,
      ].filter(Boolean).length,
    [projectFilter, tiposSeleccionados, rolesEmpresaSeleccionados, showActiveTableOnly, soloConAusencias, soloConExtras, soloConTarde, filtroEstadoUsuario, filtroVigencia, filtroEstadoContrato, areasSeleccionadas, turnosSeleccionados, filtroReemplazo, filtroRol],
  );

  /**
   * LOS FILTROS PUESTOS, UNO POR CHIP.
   *
   * El badge del botón dice CUÁNTOS hay; esto dice CUÁLES. Con solo el número hay que abrir la
   * ventana para saber por qué el reporte muestra cuatro filas y no ciento treinta y tres — y esa es
   * exactamente la duda que aparece al mirar un total que no cierra.
   *
   * Cada chip trae su propia forma de sacarlo: quitar un filtro no debería obligar a abrir el modal.
   */
  const chipsDeFiltros = useMemo(() => {
    const chips: { key: string; label: string; valor: string; quitar: () => void }[] = [];
    if (projectFilter !== "all") chips.push({ key: "proyecto", label: "Proyecto", valor: allProjects.find((p) => p.id === projectFilter)?.name || projectFilter, quitar: () => setProjectFilter("all") });
    // Un chip por tipo tildado: con varios puestos, uno solo que dijera «3 tipos» obliga a abrir el modal para saber cuáles.
    for (const t of tiposSeleccionados) chips.push({ key: `tipo:${t}`, label: "Tipo", valor: t, quitar: () => alternarTipo(t) });
    /* Los del server, cada uno con su forma de sacarlo sin abrir el modal. */
    if (filtroEstadoUsuario) chips.push({ key: "estadoUsuario", label: "Usuarios", valor: filtroEstadoUsuario === "active" ? "Activos" : "Inactivos", quitar: () => setFiltroEstadoUsuario("") });
    if (filtroVigencia) chips.push({ key: "vigencia", label: "Contratos", valor: filtroVigencia === "vigente" ? "Vigentes" : "No vigentes", quitar: () => setFiltroVigencia("") });
    if (filtroRol) chips.push({ key: "rol", label: "Rol", valor: filtroRol, quitar: () => setFiltroRol("") });
    for (const a of areasSeleccionadas) chips.push({ key: `area:${a}`, label: "Área", valor: a, quitar: () => alternarArea(a) });
    for (const t of turnosSeleccionados) chips.push({ key: `turno:${t}`, label: "Turno", valor: t, quitar: () => alternarTurno(t) });
    if (filtroEstadoContrato) chips.push({ key: "estadoContrato", label: "Estado", valor: filtroEstadoContrato, quitar: () => setFiltroEstadoContrato("") });
    if (filtroReemplazo) chips.push({ key: "reemplazo", label: "Reemplazo", valor: filtroReemplazo === "con" ? "Con reemplazo" : "Sin reemplazo", quitar: () => setFiltroReemplazo("") });
    /* Un chip por rol elegido, igual que los tipos. La `key` lleva prefijo propio: «Rol/es» de
       plataforma ya usa "rol", y con los dos puestos React veía dos chips con la misma key. */
    for (const r of rolesEmpresaSeleccionados) chips.push({ key: `rolEmpresa:${r}`, label: "Rol Empresa", valor: r, quitar: () => alternarRolEmpresa(r) });
    if (soloConAusencias) chips.push({ key: "ausencias", label: "Solo", valor: "Con ausencias", quitar: () => setSoloConAusencias(false) });
    if (soloConExtras) chips.push({ key: "extras", label: "Solo", valor: "Con horas extra", quitar: () => setSoloConExtras(false) });
    if (soloConTarde) chips.push({ key: "tarde", label: "Solo", valor: "Con llegadas tarde", quitar: () => setSoloConTarde(false) });
    // Este entra al revés que el resto: lo que se anota es haberlo APAGADO, porque el default es ON.
    if (!showActiveTableOnly) chips.push({ key: "activos", label: "Incluye", valor: "Contratos no vigentes", quitar: () => setShowActiveTableOnly(true) });
    return chips;
  }, [projectFilter, tiposSeleccionados, rolesEmpresaSeleccionados, soloConAusencias, soloConExtras, soloConTarde, showActiveTableOnly, allProjects, filtroEstadoUsuario, filtroVigencia, filtroEstadoContrato, areasSeleccionadas, turnosSeleccionados, filtroReemplazo, filtroRol, opcionesServidor]);

  const limpiarFiltros = () => {
    setProjectFilter("all");
    setTiposSeleccionados([]);
    setRolesEmpresaSeleccionados([]);
    // «Contratos activos» vuelve a ON: es el default y lo que evita filas de gente sin contrato.
    setShowActiveTableOnly(true);
    setSoloConAusencias(false);
    setSoloConExtras(false);
    setSoloConTarde(false);
    setFiltroEstadoUsuario("");
    setFiltroVigencia("");
    setFiltroEstadoContrato("");
    setAreasSeleccionadas([]);
    setTurnosSeleccionados([]);
    setFiltroReemplazo("");
    setFiltroRol("");
  };

  // Paginación de la tabla (los totales del pie siguen calculándose sobre TODO statsByEmployee).
  const reportTotalPages = Math.max(1, Math.ceil(statsByEmployee.length / REPORT_PAGE_SIZE));
  const pagedStats = useMemo(
    () => statsByEmployee.slice((reportPage - 1) * REPORT_PAGE_SIZE, reportPage * REPORT_PAGE_SIZE),
    [statsByEmployee, reportPage],
  );

  // Volver a la página 1 cuando cambian filtros/apertura, y no quedar fuera de rango.
  useEffect(() => {
    setReportPage(1);
  }, [dateFrom, dateTo, projectFilter, searchTerm, showActiveTableOnly, tiposSeleccionados, isOpen]);
  useEffect(() => {
    if (reportPage > reportTotalPages) setReportPage(reportTotalPages);
  }, [reportPage, reportTotalPages]);

  const formattedMonthLabel = useMemo(() => {
    try {
      const dFrom = parseISO(dateFrom + "T00:00:00");
      const dTo = parseISO(dateTo + "T00:00:00");
      return `${format(dFrom, "dd/MM/yyyy")} - ${format(dTo, "dd/MM/yyyy")}`;
    } catch {
      return `${dateFrom} - ${dateTo}`;
    }
  }, [dateFrom, dateTo]);

  const activeProjectName = useMemo(() => {
    if (projectFilter === "all") return "Todos los Proyectos";
    return allProjects.find((p) => p.id === projectFilter)?.name || "Filtro activo";
  }, [projectFilter, allProjects]);

  const totalAbsences = statsByEmployee.reduce((acc, curr) => acc + curr.absences, 0);
  const totalOvertime50 = statsByEmployee.reduce((acc, curr) => acc + curr.overtime50, 0);
  const totalOvertime100 = statsByEmployee.reduce((acc, curr) => acc + curr.overtime100, 0);
  const totalCost = statsByEmployee.reduce((acc, curr) => {
    const salaryDivisor = glossary.salaryDivisorPercentage || 150;
    const baseHour = curr.sueldoMano / salaryDivisor;
    const cost50 = curr.overtime50 * baseHour * (1 + glossary.pct50 / 100);
    const cost100 = curr.overtime100 * baseHour * (1 + glossary.pct100 / 100);
    return acc + cost50 + cost100;
  }, 0);
  const totalSalaries = statsByEmployee.reduce((acc, curr) => acc + curr.sueldoJornada * (curr.cantidadJornadasLaborales - curr.absences), 0);
  const grandTotal = totalSalaries + totalCost;
  const totalEmployees = statsByEmployee.length;

  /**
   * LOS COMENTARIOS DE TODO EL PERÍODO, para las exportaciones de una fila por persona.
   *
   * El detalle diario tiene una fila por día y ahí cada comentario va en su renglón. El consolidado
   * tiene UNA fila por persona, así que los del mes entero se juntan en una celda, cada uno con su
   * fecha adelante: sin la fecha son un párrafo sin anclaje, y con ella se puede cruzar contra el
   * día de la novedad.
   *
   * Se repiten a propósito. El comentario del parte es uno por novedad, o sea que aparece igual en
   * todas las personas de ese día; se deja así porque es lo que explica qué pasó ese día, y buscarlo
   * en otra exportación para entender una fila es peor que leerlo dos veces.
   */
  const comentariosDelPeriodo = (s: EmployeeStats, campo: "nota" | "comentarioParte") =>
    Object.entries(s.dailyAttendance)
      .filter(([, d]) => (d[campo] || "").trim().length > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, d]) => `${format(parseISO(fecha + "T00:00:00"), "dd/MM")}: ${d[campo]}`)
      .join(" | ");

  const handleExport = () => {
    const headers = ["Empleado", "Tipo de Contrato", "Sueldo Jornada", "Sueldo Mano", "Precio Hora", "Hora Base Ex.", "Hora 50% Ex.", "Hora 100% Ex.", "Jornadas", "Proyectos", "Áreas", "Turnos", "Días Presente", "Ausencias", "Detalle Ausencias", "Hs. 50%", "Hs. 100%", "Detalle Hs. Extras", "Monto Extras", "Monto Total", "Observaciones", "Comentarios del parte"];
    const rows = statsByEmployee.map((s) => {
      const salaryDivisor = glossary.salaryDivisorPercentage || 150;
      const baseHour = s.sueldoMano / salaryDivisor;
      const vExtra50 = baseHour * (1 + glossary.pct50 / 100);
      const vExtra100 = baseHour * (1 + glossary.pct100 / 100);
      const m50 = s.overtime50 * vExtra50;
      const normalHora = s.sueldoJornada / s.contractHoursPerDay;
      const m100 = s.overtime100 * vExtra100;
      const otDetail = s.overtimeEntries
        .map((e) => {
          if ((e.h50 || 0) > 0 || (e.h100 || 0) > 0) {
            const parts: string[] = [];
            if ((e.h100 || 0) > 0) parts.push(`+${e.h100}h (100%)`);
            if ((e.h50 || 0) > 0) parts.push(`+${e.h50}h (50%)`);
            return `${e.date}: ${e.schedule} [${parts.join(" / ")}]`;
          }
          return `${e.date} (${e.pct}%): ${e.schedule}`;
        })
        .join("; ");
      const salaryMonto = s.sueldoJornada * (s.cantidadJornadasLaborales - s.absences);
      return [
        `"${s.employeeName}"`,
        // Va segundo, pegado al nombre: contesta "¿y este cómo cobra?" antes de mirar la plata.
        `"${s.contractType || ""}"`,
        s.sueldoJornada,
        s.sueldoMano,
        normalHora.toFixed(2),
        baseHour.toFixed(2),
        vExtra50.toFixed(2),
        vExtra100.toFixed(2),
        s.cantidadJornadasLaborales,
        `"${s.rowProjectName}"`,
        /* En dos columnas y no en una como la pantalla: en una planilla cada una se filtra y se
           ordena sola, y «Técnica | Noche (18:00 - 00:00)» en una sola celda no deja hacer ninguna
           de las dos. */
        `"${s.areas.join(", ")}"`,
        `"${s.turnos.join(", ")}"`,
        s.daysPresent,
        s.absences,
        `"${Object.entries(s.absenceDetails)
          .map(([r, c]) => `${r}: ${c}`)
          .join("; ")}"`,
        s.overtime50,
        s.overtime100,
        `"${otDetail}"`,
        (m50 + m100).toFixed(2),
        (salaryMonto + m50 + m100).toFixed(2),
        /* Al final y no al lado del nombre: son texto largo y en el medio empujan fuera de la
           pantalla las columnas que se leen de un vistazo. */
        `"${comentariosDelPeriodo(s, "nota").replace(/"/g, '""')}"`,
        `"${comentariosDelPeriodo(s, "comentarioParte").replace(/"/g, '""')}"`,
      ];
    });

    const csvIntro = [
      `"Fecha Desde","${dateFrom}"`,
      `"Fecha Hasta","${dateTo}"`,
      "", // Empty line
    ];
    const csvContent = "\uFEFF" + [...csvIntro, headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    // ... rest same
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `reporte_novedades_${dateFrom}_a_${dateTo}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportXLS = () => {
    const headers = ["Empleado", "Tipo de Contrato", "Sueldo Jornada", "Sueldo Mano", "Precio Hora", "Hora Base Ex.", "Hora 50% Ex.", "Hora 100% Ex.", "Jornadas", "Proyectos", "Áreas", "Turnos", "Días Presente", "Ausencias", "Detalle Ausencias", "Hs. 50%", "Hs. 100%", "Detalle Hs. Extras", "Monto Extras", "Monto Total", "Observaciones", "Comentarios del parte"];

    const rows = statsByEmployee.map((s) => {
      const salaryDivisor = glossary.salaryDivisorPercentage || 150;
      const baseHour = s.sueldoMano / salaryDivisor;
      const vExtra50 = baseHour * (1 + glossary.pct50 / 100);
      const vExtra100 = baseHour * (1 + glossary.pct100 / 100);
      const m50 = s.overtime50 * vExtra50;
      const normalHora = s.sueldoJornada / s.contractHoursPerDay;
      const m100 = s.overtime100 * vExtra100;
      const otDetail = s.overtimeEntries
        .map((e) => {
          if ((e.h50 || 0) > 0 || (e.h100 || 0) > 0) {
            const parts: string[] = [];
            if ((e.h100 || 0) > 0) parts.push(`+${e.h100}h (100%)`);
            if ((e.h50 || 0) > 0) parts.push(`+${e.h50}h (50%)`);
            return `${e.date}: ${e.schedule} [${parts.join(" / ")}]`;
          }
          return `${e.date} (${e.pct}%): ${e.schedule}`;
        })
        .join("; ");
      const salaryMonto = s.sueldoJornada * (s.cantidadJornadasLaborales - s.absences);
      return [
        s.employeeName,
        // Va segundo, pegado al nombre: contesta "¿y este cómo cobra?" antes de mirar la plata.
        s.contractType || "",
        s.sueldoJornada,
        s.sueldoMano,
        Number(normalHora.toFixed(2)),
        Number(baseHour.toFixed(2)),
        Number(vExtra50.toFixed(2)),
        Number(vExtra100.toFixed(2)),
        s.cantidadJornadasLaborales,
        s.rowProjectName,
        // Ídem el CSV: área y turno en columnas separadas, para que la planilla pueda filtrarlas.
        s.areas.join(", "),
        s.turnos.join(", "),
        s.daysPresent,
        s.absences,
        Object.entries(s.absenceDetails)
          .map(([r, c]) => `${r}: ${c}`)
          .join("; "),
        s.overtime50,
        s.overtime100,
        otDetail,
        Number((m50 + m100).toFixed(2)),
        Number((salaryMonto + m50 + m100).toFixed(2)),
        // Ídem el CSV: al final, que es donde el texto largo no estorba.
        comentariosDelPeriodo(s, "nota"),
        comentariosDelPeriodo(s, "comentarioParte"),
      ];
    });

    /*
      LA FILA DE TOTALES, UNA CELDA POR COLUMNA.

      Estaba armada contando cuántos `""` poner y le faltaban dos: los totales caían corridos y
      «Días Presente» quedaba bajo «Jornadas», «Ausencias» bajo «Proyectos» y la plata dos columnas
      antes de la suya. Se leía como si fueran los totales de otra cosa.

      Ahora se arma desde los mismos `headers`: cada total dice A QUÉ COLUMNA pertenece, así que
      agregar una columna no vuelve a desalinear nada.
    */
    const totalMontoSueldos = statsByEmployee.reduce((a, c) => a + c.sueldoJornada * (c.cantidadJornadasLaborales - c.absences), 0);
    const totalesPorColumna: Record<string, string | number> = {
      Empleado: `TOTALES (${totalEmployees} empleados)`,
      "Días Presente": statsByEmployee.reduce((a, c) => a + c.daysPresent, 0),
      Ausencias: totalAbsences,
      "Hs. 50%": totalOvertime50,
      "Hs. 100%": totalOvertime100,
      "Monto Extras": Number(totalCost.toFixed(2)),
      "Monto Total": Number((totalMontoSueldos + totalCost).toFixed(2)),
    };
    rows.push(headers.map((h) => totalesPorColumna[h] ?? "") as any);

    const introRows = [
      ["Fecha Desde", dateFrom],
      ["Fecha Hasta", dateTo],
      [], // Empty row
    ];
    const wsData = [...introRows, headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Auto-fit column widths
    const colWidths = headers.map((h, i) => {
      let maxLen = h.length;
      rows.forEach((row) => {
        const cellVal = String(row[i] ?? "");
        if (cellVal.length > maxLen) maxLen = cellVal.length;
      });
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Novedades");
    XLSX.writeFile(wb, `reporte_novedades_${dateFrom}_a_${dateTo}.xlsx`);
  };

  const handleDailyExportXLS = () => {
    if (statsByEmployee.length === 0) return;

    const dates = eachDayOfInterval({ start: parseISO(dateFrom), end: parseISO(dateTo) });
    const daysMap: Record<string, string> = { Monday: "Lun", Tuesday: "Mar", Wednesday: "Mie", Thursday: "Jue", Friday: "Vie", Saturday: "Sab", Sunday: "Dom" };

    /*
      Área y Turno van pegados al Proyecto, como en la tabla. Acá son los de ESE día, no los del período.

      Los dos comentarios van al final y en columnas separadas porque son cosas distintas:
      «Observación» es sobre esa persona ese día, «Comentario del parte» es el del supervisor sobre
      la novedad entera —y por eso se repite en todas las filas de ese día, que es lo que significa—.
      Últimos y no al lado del nombre: son texto largo y libre, y en el medio empujan las columnas
      que se leen de un vistazo fuera de la pantalla.
    */
    const headers = ["Empleado", "Proyecto", "Área", "Turno", "Fecha", "Día", "Estado", "Motivo", "Hs Extras", "H. Entrada OT", "H. Salida OT", "% HS", "Observación", "Comentario del parte"];
    const rows: any[] = [];

    statsByEmployee.forEach((s) => {
      dates.forEach((date) => {
        const dateKey = format(date, "yyyy-MM-dd");
        const attendance = s.dailyAttendance[dateKey];
        const shortDay = daysMap[format(date, "EEEE")] || format(date, "eee");

        rows.push([s.employeeName, s.rowProjectName || "S/P", attendance?.area || "-", attendance?.turno || "-", format(date, "dd/MM/yyyy"), shortDay, attendance ? (attendance.status === "present" ? "Presente" : attendance.status === "absent" ? "Ausente" : "Tardanza") : "Sin Registro", attendance?.reason || "-", attendance?.overtimeHours || 0, attendance?.entryTime || "-", attendance?.exitTime || "-", attendance?.pct ? `${attendance.pct}%` : "-", attendance?.nota || "-", attendance?.comentarioParte || "-"]);
      });
      // Add divider row between employees
      rows.push(Array(headers.length).fill(""));
    });

    const introRows = [["REPORTE CONSOLIDADO DIARIO", ""], ["Periodo:", `${dateFrom} al ${dateTo}`], ["Exportado el:", format(new Date(), "dd/MM/yyyy HH:mm")], []];

    const wsData = [...introRows, headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Styling
    // Los dos de texto libre, anchos: si no, Excel los muestra cortados y hay que abrir cada celda.
    const colWidths = [25, 20, 18, 26, 12, 8, 12, 25, 10, 12, 12, 8, 40, 40];
    ws["!cols"] = colWidths.map((w) => ({ wch: w }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Detalle Diario");
    XLSX.writeFile(wb, `detalle_diario_consolidado_${dateFrom}_a_${dateTo}.xlsx`);
  };

  const handleOpenContract = (s: EmployeeStats) => {
    setContractModal({
      open: true,
      employeeName: s.employeeName,
      data: s.userProjectsData,
    });
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={
          <div className="flex items-center gap-2">
            <span>Reportes de Novedades</span>
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">({statsByEmployee.length})</span>
            {/*
              GLOSARIO Y ESTADÍSTICAS, como iconos al lado del título.

              Eran dos links de texto perdidos entre los filtros, así que se leían como parte de lo
              que recorta el reporte —que es lo único que hay en esa barra— cuando en realidad no
              filtran nada: uno explica cómo se calculan las horas extra y el otro abre un resumen.
              Arriba, y con la misma forma que el resto de las pantallas, se leen como lo que son.
            */}
            <button type="button" onClick={() => setShowGlossary(true)} title="Ver el glosario de horas extras" aria-label="Ver el glosario de horas extras" className="text-gray-400 hover:text-blue-500 transition-colors">
              <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setShowStats(true)} title="Ver el resumen estadístico del período" aria-label="Ver el resumen estadístico del período" className="text-gray-400 hover:text-blue-500 transition-colors">
              <FontAwesomeIcon icon={faChartSimple} className="h-4 w-4" />
            </button>
          </div>
        }
        size="full"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <button onClick={handleExport} disabled={statsByEmployee.length === 0} className="px-5 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              <FontAwesomeIcon icon={faFileExport} />
              Exportar CSV
            </button>
            <button onClick={handleExportXLS} disabled={statsByEmployee.length === 0} className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              <FontAwesomeIcon icon={faFileExcel} />
              Exportar Consolidado Mes
            </button>
            <button onClick={handleDailyExportXLS} disabled={statsByEmployee.length === 0} className="px-5 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              <FontAwesomeIcon icon={faClipboardList} />
              Exportar Detalle Diario
            </button>
          </div>
        }
      >
        <div className="flex flex-col h-full space-y-5 p-6">
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700">
            {/*
              TODO EL RECORTE EN UN SOLO RENGLÓN: las dos fechas, el buscador y el botón de filtros.

              Estaban en dos filas —el período arriba, el buscador abajo— y entre las dos se comían
              un renglón entero de una tabla que ya scrollea. Un campo de fecha muestra diez
              caracteres y el buscador es un nombre, no una frase: los cuatro entran holgados a lo
              ancho y lo que se gana va a las filas, que es lo que se vino a mirar.

              El período y los chips quedan pegados a la derecha con `ml-auto`, y en pantalla
              angosta bajan solos (`flex-wrap`) sin romper nada.
            */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1 w-[150px]">
                <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha Desde</label>
                <div className="relative">
                  <FontAwesomeIcon icon={faCalendar} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs" />
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
                </div>
              </div>

              <div className="space-y-1 w-[150px]">
                <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha Hasta</label>
                <div className="relative">
                  <FontAwesomeIcon icon={faCalendar} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs" />
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
                </div>
              </div>

              <div className="space-y-1 w-full sm:w-auto">
                <label className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Buscar Empleado</label>
                <div className="flex items-center gap-2">
                  <div className="relative w-full sm:w-64">
                    <FontAwesomeIcon icon={faSearch} className="absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs" />
                    <input type="text" placeholder="Nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiltrosOpen(true)}
                    title="Filtros avanzados"
                    className={`relative shrink-0 px-3 py-1.5 rounded border text-sm font-semibold flex items-center gap-2 transition-colors ${
                      filtrosActivos > 0
                        ? "border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                        : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    <FontAwesomeIcon icon={faFilter} />
                    {/* Con rótulo: un embudo solo obliga a adivinar, y este botón esconde siete filtros. */}
                    <span>Filtros</span>
                    {filtrosActivos > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">{filtrosActivos}</span>}
                  </button>
                </div>
              </div>

              {/* `ml-auto` lo empuja a la derecha del renglón; sin lugar, baja solo a la línea de abajo. */}
              <div className="flex items-center gap-2 flex-wrap sm:ml-auto">
                <div className="flex items-center gap-2 bg-white dark:bg-gray-800/50 px-2.5 py-1 rounded border border-gray-200 dark:border-gray-700 shadow-sm">
                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Período</span>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{formattedMonthLabel}</span>
                </div>
                {/*
                  LOS FILTROS PUESTOS, AL LADO DEL PERÍODO Y CON LA MISMA FORMA.

                  El chip de «Proyecto» ya existía y era de solo lectura; ahora es uno más de la lista
                  y se puede sacar desde acá. Van en azul, distintos del gris del período: el período
                  siempre está —no es un recorte— y estos aparecen solo cuando alguien filtró.

                  Es la contracara del badge con el número: aquel dice cuántos hay, éstos dicen cuáles,
                  que es lo que hace falta cuando el total no cierra y hay que entender por qué.
                */}
                {chipsDeFiltros.map((c) => (
                  <div key={c.key} className="flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/25 px-2.5 py-1 rounded border border-blue-200 dark:border-blue-800 shadow-sm">
                    <span className="text-[9px] font-black text-blue-400 dark:text-blue-500 uppercase tracking-widest">{c.label}</span>
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300 max-w-[180px] truncate" title={c.valor}>
                      {c.valor}
                    </span>
                    <button type="button" onClick={c.quitar} title={`Quitar el filtro de ${c.label.toLowerCase()}`} className="text-blue-400 hover:text-red-500 transition-colors">
                      <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                {chipsDeFiltros.length > 1 && (
                  <button type="button" onClick={limpiarFiltros} className="text-[10px] font-semibold text-gray-400 hover:text-red-500 transition-colors underline underline-offset-2">
                    Limpiar todo
                  </button>
                )}
                {totalOvertime50 + totalOvertime100 > 0 && (
                  <div className="text-[10px] font-medium text-gray-500 italic ml-2">
                    Total hs: <span className="font-bold text-amber-600">{(totalOvertime50 + totalOvertime100).toFixed(1)}h</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Read-Only Glossary Modal */}
          {/*
            FILTROS AVANZADOS. Mismo patrón que el resto de la app: los que se tocan siempre quedan a
            la vista y el resto entra acá, con el conteo en el badge del botón que lo abre.
          */}
          <Modal
            isOpen={filtrosOpen}
            onClose={() => setFiltrosOpen(false)}
            title="Filtros avanzados"
            subtitle="Recortá el reporte sin perder de vista cuántos filtros hay puestos"
            size="md"
            zIndex={100}
            footer={
              <div className="flex items-center justify-end gap-3 w-full">
                <button type="button" onClick={limpiarFiltros} className="btn-secondary" disabled={filtrosActivos === 0}>
                  Limpiar todo
                </button>
                <button type="button" onClick={() => setFiltrosOpen(false)} className="btn-primary">
                  Cerrar
                </button>
              </div>
            }
          >
            <div className="space-y-5">
              {/*
                MISMA ESTRUCTURA QUE GESTIONAR EQUIPO: dos grupos de opciones excluyentes arriba y
                los desplegables de categoría abajo.

                Es la misma gente y las mismas preguntas desde dos pantallas distintas; que el filtro
                esté en otro lugar y con otro nombre obliga a reaprenderlo cada vez.
              */}
              {[
                {
                  titulo: "Estado de usuarios",
                  valor: filtroEstadoUsuario,
                  set: setFiltroEstadoUsuario,
                  opciones: [
                    { label: "Usuarios Activos", value: "active" },
                    { label: "Usuarios Inactivos", value: "inactive" },
                    { label: "Todos los usuarios", value: "" },
                  ],
                },
                {
                  titulo: "Contratos",
                  valor: filtroVigencia,
                  set: setFiltroVigencia,
                  opciones: [
                    { label: "Vigentes", value: "vigente" },
                    { label: "No Vigentes", value: "novigente" },
                    { label: "Todos los contratos", value: "" },
                  ],
                },
              ].map((grupo) => (
                <div key={grupo.titulo} className="space-y-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">{grupo.titulo}</p>
                  {grupo.opciones.map((o) => (
                    <label key={o.label} className="flex items-center justify-between gap-3 cursor-pointer select-none rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                      <span className="text-sm text-gray-700 dark:text-gray-200">{o.label}</span>
                      <input type="radio" checked={grupo.valor === o.value} onChange={() => grupo.set(o.value)} className="h-4 w-4 accent-blue-600" />
                    </label>
                  ))}
                </div>
              ))}

              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1 pt-2 border-t border-gray-200 dark:border-gray-700">Filtros por Categoría</p>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Proyecto</label>
                <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="input-field w-full">
                  <option value="all">Todos los proyectos</option>
                  {universoDelPeriodo.proyectos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 ml-1">Solo los que tuvieron novedades en el período.</p>
              </div>

              {/*
                TIPO DE CONTRATO: VARIOS A LA VEZ, EN SU PROPIA VENTANA.

                Son doce tipos y las preguntas reales son de a varios: «los tres plazo fijo», «todos
                los Eventual». Con un desplegable de a uno había que correr el reporte tres veces y
                sumar a mano. Nada elegido = todos, que es como se abre.

                Es el mismo gesto de «Rol/es Empresa» en la ficha de usuario —`SelectorBadges`—:
                acá la lista de tildes se llevaba 200px de este modal, que ya scrollea, para mostrar
                cinco de doce filas y sin buscador. Afuera la ventana usa la pantalla entera para
                buscar, y en el filtro queda solo lo elegido, que es lo único que importa después.
              */}
              <SelectorBadges
                etiqueta="Tipo de contrato"
                tituloModal="Tipo de Contrato"
                descripcion="qué tipos de contrato entran en el reporte"
                placeholder="Buscar tipo de contrato…"
                permitirTodos
                /* El modal de filtros está en 100: esta ventana va arriba. */
                zIndex={110}
                /* Del server: son los tipos del contrato que RIGE de cada uno, no los de todo su historial. */
                items={opcionesServidor.tipos.map((t) => ({ id: t, nombre: t }))}
                value={tiposSeleccionados}
                onChange={setTiposSeleccionados}
                textoVacio={opcionesServidor.tipos.length === 0 ? "No hay tipos de contrato en el período." : "Elegir tipos de contrato…"}
                ayuda={
                  opcionesServidor.tipos.length === 0 && !filtrandoEnServidor
                    ? <span className="text-amber-600 dark:text-amber-400">Ningún contrato del período tiene tipo cargado.</span>
                    : tiposSeleccionados.length === 0
                      ? "Sin elegir ninguno entran todos."
                      : undefined
                }
              />

              {/*
                ROL/ES EMPRESA: MISMA VENTANA QUE TIPO DE CONTRATO.

                Se llamaba «Rol Frame», que es el nombre del campo en la base y no el que usa nadie:
                en la ficha de usuario este mismo dato es «Rol/es Empresa». Dos nombres para una cosa
                obligan a adivinar si son la misma, sobre todo con un «Rol/es» acá al lado.
              */}
              <SelectorBadges
                etiqueta="Rol/es Empresa"
                tituloModal="Rol/es Empresa"
                descripcion="qué roles de empresa entran en el reporte"
                placeholder="Buscar rol de empresa…"
                permitirTodos
                zIndex={110}
                /* Del período: los roles de la gente que tuvo novedades, no los del sistema entero. */
                items={rolesEmpresaDisponibles.map((r) => ({ id: r, nombre: r }))}
                value={rolesEmpresaSeleccionados}
                onChange={setRolesEmpresaSeleccionados}
                textoVacio={rolesEmpresaDisponibles.length === 0 ? "No hay roles de empresa en el período." : "Elegir roles de empresa…"}
                ayuda={rolesEmpresaSeleccionados.length === 0 ? "Sin elegir ninguno entran todos." : undefined}
              />

              <div className="space-y-1.5">
                {/* El OTRO rol: el de plataforma (`user.roles`), que resuelve el server. Nada que ver
                    con el de arriba, que es el del proyecto. */}
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Rol/es de plataforma</label>
                <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)} className="input-field w-full">
                  <option value="">Todos los roles</option>
                  {opcionesServidor.roles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {/*
                ÁREA Y TURNO, SEPARADOS. Ver `areasSeleccionadas` para por qué dejaron de ser un
                único desplegable de combinaciones.
              */}
              <SelectorBadges
                etiqueta="Área/s"
                tituloModal="Áreas"
                descripcion="qué áreas entran en el reporte"
                placeholder="Buscar área…"
                permitirTodos
                zIndex={110}
                items={universoDelPeriodo.areas.map((a) => ({ id: a, nombre: a }))}
                value={areasSeleccionadas}
                onChange={setAreasSeleccionadas}
                textoVacio={universoDelPeriodo.areas.length === 0 ? "No hay áreas en el período." : "Elegir áreas…"}
                ayuda={areasSeleccionadas.length === 0 ? "Sin elegir ninguna entran todas." : undefined}
              />

              <SelectorBadges
                etiqueta="Turno/s"
                tituloModal="Turnos"
                descripcion="qué turnos entran en el reporte"
                placeholder="Buscar turno…"
                permitirTodos
                zIndex={110}
                items={universoDelPeriodo.turnos.map((t) => ({ id: t, nombre: t }))}
                value={turnosSeleccionados}
                onChange={setTurnosSeleccionados}
                textoVacio={universoDelPeriodo.turnos.length === 0 ? "No hay turnos en el período." : "Elegir turnos…"}
                ayuda={
                  turnosSeleccionados.length === 0
                    ? "Sin elegir ninguno entran todos. Con área y turno puestos, entran las filas que tienen las dos cosas."
                    : undefined
                }
              />

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Estado de contrato</label>
                <select value={filtroEstadoContrato} onChange={(e) => setFiltroEstadoContrato(e.target.value)} className="input-field w-full">
                  <option value="">Todos los estados</option>
                  {opcionesServidor.estados.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Reemplazo</label>
                <select value={filtroReemplazo} onChange={(e) => setFiltroReemplazo(e.target.value)} className="input-field w-full">
                  <option value="">Con y sin reemplazo</option>
                  <option value="con">Con reemplazo</option>
                  <option value="sin">Sin reemplazo</option>
                </select>
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest ml-1">Mostrar solo</p>
                {/*
                  Los tres recortes que contestan las preguntas con las que se abre el reporte: quién
                  faltó, quién hizo horas extra y quién llegó tarde. Se combinan entre sí —«faltó Y
                  además hizo extras» es una pregunta legítima— así que son switches y no opciones
                  excluyentes.
                */}
                {[
                  { on: soloConAusencias, set: setSoloConAusencias, label: "Con ausencias", hint: "Solo quienes tuvieron al menos una falta en el período." },
                  { on: soloConExtras, set: setSoloConExtras, label: "Con horas extra", hint: "Solo quienes registraron horas extra." },
                  { on: soloConTarde, set: setSoloConTarde, label: "Con llegadas tarde", hint: "Solo quienes llegaron tarde al menos una vez." },
                ].map((f) => (
                  <label key={f.label} className="flex items-center justify-between gap-3 cursor-pointer select-none rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-sm text-gray-700 dark:text-gray-300">{f.label}</span>
                      <span className="block text-[11px] text-gray-500 dark:text-gray-400">{f.hint}</span>
                    </span>
                    <span className={`w-10 h-6 flex items-center rounded-full p-1 shrink-0 duration-300 ease-in-out ${f.on ? "bg-blue-500 dark:bg-blue-600" : "bg-gray-300 dark:bg-gray-700"}`}>
                      <span className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${f.on ? "translate-x-4" : ""}`} />
                    </span>
                    <input type="checkbox" className="hidden" checked={f.on} onChange={(e) => f.set(e.target.checked)} />
                  </label>
                ))}
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <label className="flex items-center justify-between gap-3 cursor-pointer select-none rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-700 dark:text-gray-300">Solo contratos activos</span>
                    {/* Apagarlo trae filas de gente sin contrato vigente, que es lo que se quiere al
                        auditar un período cerrado y lo que estorba el resto del tiempo. Por eso el
                        default es encendido y cuenta como filtro cuando se apaga. */}
                    <span className="block text-[11px] text-gray-500 dark:text-gray-400">Apagalo para ver también a quienes no tienen contrato vigente en el período.</span>
                  </span>
                  <span className={`w-10 h-6 flex items-center rounded-full p-1 shrink-0 duration-300 ease-in-out ${showActiveTableOnly ? "bg-blue-500 dark:bg-blue-600" : "bg-gray-300 dark:bg-gray-700"}`}>
                    <span className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${showActiveTableOnly ? "translate-x-4" : ""}`} />
                  </span>
                  <input type="checkbox" className="hidden" checked={showActiveTableOnly} onChange={(e) => setShowActiveTableOnly(e.target.checked)} />
                </label>
              </div>
            </div>
          </Modal>

          <Modal isOpen={showGlossary} onClose={() => setShowGlossary(false)} title="Glosario de Horas Extras" size="md" zIndex={100}>
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                <div className="flex gap-3">
                  <FontAwesomeIcon icon={faCircleInfo} className="text-blue-500 mt-1" />
                  <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed">Este glosario define cómo se calculan automáticamente las horas extras en este reporte.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase mb-3 tracking-widest leading-none">Lunes a Viernes</h4>
                  <div className="text-sm font-bold text-gray-700 dark:text-gray-200">
                    {glossary.weekdayDayStart}hs — {glossary.weekdayDayEnd}hs
                  </div>
                  <div className="text-xs text-blue-600 font-medium mt-1">Recargo: {glossary.pct50}% (Diurno)</div>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase mb-3 tracking-widest leading-none">Sábados</h4>
                  <div className="text-sm font-bold text-gray-700 dark:text-gray-200">
                    {glossary.satDayStart}hs — {glossary.satDayEnd}hs
                  </div>
                  <div className="text-xs text-blue-600 font-medium mt-1">Recargo: {glossary.pct50}% (Diurno)</div>
                </div>
              </div>

              <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/30">
                <h4 className="text-[10px] font-black text-amber-700 dark:text-amber-500 uppercase mb-2 tracking-widest">Base de Cálculo</h4>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Divisor de Sueldo:</span>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">{glossary.salaryDivisorPercentage}</span>
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-amber-100 dark:border-amber-900/30">
                  <span className="text-sm text-gray-700 dark:text-gray-300">Recargo Base 100%:</span>
                  <span className="text-sm font-bold text-red-600">{glossary.pct100}%</span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => {
                    setShowGlossary(false);
                    onClose(); // Close the reports modal
                    navigate("/requests/config", { state: { activeTab: "glossary" } });
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-all shadow-md hover:shadow-lg"
                >
                  Ir a Configuración
                </button>
              </div>
            </div>
          </Modal>

          {/* Calculation Info Modal */}
          <Modal isOpen={showCalcInfo} onClose={() => setShowCalcInfo(false)} title="Componentes del Precio Hora Extra" size="md" zIndex={100}>
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed font-medium">
                  El cálculo se basa en el <span className="text-blue-600 dark:text-blue-400 font-bold">Sueldo Mano</span> del empleado y el divisor mensual configurado.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase mb-3 tracking-widest leading-none">1. Precio Hora Base</h4>
                  <div className="text-sm font-bold text-gray-700 dark:text-gray-200">Sueldo Mano / {glossary.salaryDivisorPercentage} (Divisor)</div>
                  <p className="text-[10px] text-gray-500 mt-2 font-medium">Este es el valor unitario de la hora sobre el cual se aplican los recargos.</p>
                </div>

                <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/30">
                  <h4 className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase mb-3 tracking-widest leading-none">2. Precio Hora 50%</h4>
                  <div className="text-sm font-bold text-gray-700 dark:text-gray-200">Hora Base × {1 + glossary.pct50 / 100}</div>
                </div>

                <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30">
                  <h4 className="text-[10px] font-black text-red-600 dark:text-red-500 uppercase mb-3 tracking-widest leading-none">3. Precio Hora 100%</h4>
                  <div className="text-sm font-bold text-gray-700 dark:text-gray-200">Hora Base × {1 + glossary.pct100 / 100}</div>
                </div>
              </div>

              <div className="text-[10px] text-gray-400 dark:text-gray-500 italic p-2 leading-tight">* Todos los porcentajes y el divisor se pueden modificar desde el Glosario de Extras en la configuración.</div>
            </div>
          </Modal>

          {/* Statistics Modal */}
          <Modal isOpen={showStats} onClose={() => setShowStats(false)} title="Estadísticas de Novedades" size="md" zIndex={100}>
            <div className="space-y-6">
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                <div className="flex gap-3">
                  <FontAwesomeIcon icon={faChartSimple} className="text-blue-500 mt-1" />
                  <p className="text-sm text-blue-800 dark:text-blue-300 leading-relaxed font-medium">Resumen consolidado para el período y filtros seleccionados.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Empleados y Ausencias */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                      <FontAwesomeIcon icon={faUser} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider leading-none mb-1">Total Empleados</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">{totalEmployees}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-50 dark:border-gray-700/50">
                    <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                      <FontAwesomeIcon icon={faUserSlash} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider leading-none mb-1">Total Ausencias</p>
                      <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">{totalAbsences}</p>
                    </div>
                  </div>
                </div>

                {/* Costos */}
                <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                      <FontAwesomeIcon icon={faClock} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider leading-none mb-1">Costo Hs. Extras</p>
                      <p className="text-xl font-bold text-amber-600 leading-none">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-2 border-t border-gray-50 dark:border-gray-700/50">
                    <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                      <FontAwesomeIcon icon={faMoneyBillWave} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider leading-none mb-1">Total Final</p>
                      <p className="text-xl font-bold text-green-600 leading-none">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 0 })}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-medium italic">Período seleccionado:</span>
                  <span className="text-gray-900 dark:text-white font-bold">{formattedMonthLabel}</span>
                </div>
                <div className="flex justify-between items-center text-xs mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 font-medium italic">Proyecto filtros:</span>
                  <span className="text-gray-900 dark:text-white font-bold truncate max-w-[200px]">{activeProjectName}</span>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button onClick={() => setShowStats(false)} className="px-6 py-2 bg-gray-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-all shadow-md hover:shadow-lg">
                  Entendido
                </button>
              </div>
            </div>
          </Modal>

          {/*
            CUANDO EL SERVER NO CONTESTA, SE DICE.

            Sin esto la pantalla miente sin darse cuenta: los números de asistencia quedan en 0 y los
            filtros no recortan, y las dos cosas se ven exactamente igual que "este mes no pasó nada"
            y "el filtro anduvo y no sacó a nadie". Es lo que hizo perder más tiempo de todo esto.
          */}
          {(falloAsistencias || falloFiltros) && (
            <div className="mb-3 rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-800 dark:text-red-300">
              <div className="font-bold">Este reporte está incompleto.</div>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">
                {falloAsistencias && <li>No se pudo traer la asistencia del período: las columnas de presentes, ausentes y horas extra están en cero porque no se sabe, no porque no haya.</li>}
                {falloFiltros && <li>No se pudieron resolver los filtros de contrato: la tabla se muestra SIN recortar, así que puede haber filas que el filtro debería haber sacado.</li>}
              </ul>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto rounded border border-gray-200 dark:border-gray-700 min-h-0">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold shadow-sm">
                <tr>
                  <th className="py-2.5 px-3 text-center w-8"></th>
                  <th className="py-2.5 px-3 text-left">Empleado</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">S. Jornada</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">S. Mano</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">P. Hora</th>
                  <th className="py-2.5 px-3 text-right text-[10px] leading-tight whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="flex flex-col items-end">
                        <span>P. Hora Extra</span>
                        <span className="text-[8px] opacity-60">Base | 50% | 100%</span>
                      </div>
                      <button onClick={() => setShowCalcInfo(true)} className="text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors p-1" title="Ver detalle del cálculo">
                        <FontAwesomeIcon icon={faSearch} />
                      </button>
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Jornadas</th>
                  <th className="py-2.5 px-3 text-left">Proyectos</th>
                  {/* Pegada a Proyectos y con los mismos badges que el listado de Novedades: es el
                      mismo dato leído desde otra pantalla. */}
                  <th className="py-2.5 px-3 text-left whitespace-nowrap">Área | Turno</th>
                  <th className="py-2.5 px-2 text-center text-[10px] leading-tight">
                    Horario
                    <br />
                    Base
                  </th>
                  <th className="py-2.5 px-3 text-left whitespace-nowrap">Contrato</th>
                  <th className="py-2.5 px-3 text-left whitespace-nowrap">Tipo de Contrato</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap">Asistencias: Pres | Aus</th>
                  {/* «Detalle» porque la columna no trae un total —eso está en Hs. 50% y Hs. 100%—
                      sino día por día: la fecha, el tramo horario y el recargo de cada uno. */}
                  <th className="py-2.5 px-2 text-left text-[10px] leading-tight text-nowrap">Horario Extra detalle</th>
                  <th className="py-2.5 px-2 text-right text-[10px] leading-tight text-nowrap">Hs. 50%</th>
                  <th className="py-2.5 px-2 text-right text-[10px] leading-tight text-nowrap">Hs. 100%</th>
                  <th className="py-2.5 px-2 text-right text-[10px] leading-tight whitespace-nowrap">Extras Total</th>
                  <th className="py-2.5 px-3 text-right whitespace-nowrap">Monto Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {pagedStats.map((s) => {
                  return (
                    <React.Fragment key={s.rowKey}>
                      <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                        {/* Modal Trigger */}
                        <td className="py-2.5 px-3 text-center">
                          <button onClick={() => setDailyDetailModal({ open: true, stats: s })} className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors" title="Ver detalle diario en modal">
                            <FontAwesomeIcon icon={faClipboardList} className="text-xs" />
                          </button>
                        </td>
                        {/* Empleado */}
                        <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white">
                          <span className="truncate max-w-[140px]">{s.employeeName}</span>
                        </td>
                        {/* Sueldo Jornada */}
                        <td className="py-2.5 px-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">{s.sueldoJornada > 0 ? `$${s.sueldoJornada.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
                        {/* Sueldo Mano */}
                        <td className="py-2.5 px-3 text-right text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">{s.sueldoMano > 0 ? `$${s.sueldoMano.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
                        {/* Precio Hora */}
                        <td className="py-2.5 px-3 text-right text-xs font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                          {(() => {
                            const normalHora = s.sueldoJornada / s.contractHoursPerDay;
                            return normalHora > 0 ? `$${normalHora.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : <span className="text-gray-300 dark:text-gray-600">-</span>;
                          })()}
                        </td>
                        {/* Precio Hora Extra 50/100 */}
                        <td className="py-2.5 px-3 text-right text-[9px] font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap leading-tight">
                          {(() => {
                            const salaryDivisor = glossary.salaryDivisorPercentage || 150;
                            const baseHour = s.sueldoMano / salaryDivisor;
                            const v50 = baseHour * (1 + glossary.pct50 / 100);
                            const v100 = baseHour * (1 + glossary.pct100 / 100);
                            if (baseHour <= 0) return <span className="text-gray-300 dark:text-gray-600">-</span>;
                            return (
                              <div className="flex flex-col items-end gap-0.5">
                                <span className="text-gray-500 dark:text-gray-500 font-normal">Base: ${baseHour.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                                <span>50%: ${v50.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                                <span>100%: ${v100.toLocaleString(undefined, { minimumFractionDigits: 0 })}</span>
                              </div>
                            );
                          })()}
                        </td>
                        {/* Jornadas */}
                        <td className="py-2.5 px-3 text-center text-xs font-medium text-gray-600 dark:text-gray-400">{s.cantidadJornadasLaborales || <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
                        {/* Proyectos */}
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1 max-w-[160px]">
                            {s.rowProjectName ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 truncate max-w-[120px]" title={s.rowProjectName}>
                                {s.rowProjectName}
                              </span>
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600 text-xs">-</span>
                            )}
                          </div>
                        </td>
                        {/*
                          ÁREA | TURNO: lo que dicen los PARTES del período, no la ficha.

                          Pueden ser varios —la misma persona en Técnica de mañana y de noche el
                          mismo mes—, así que van uno debajo del otro. `whitespace-nowrap` en cada
                          badge y `w-max` en el contenedor por lo mismo que en el listado: un nombre
                          de turno partido en cuatro renglones estira la fila y la tabla deja de
                          poder recorrerse. Hacia el costado sobra lugar, que ya scrollea.
                        */}
                        <td className="py-2.5 px-3">
                          {s.areas.length === 0 && s.turnos.length === 0 ? (
                            <span className="text-gray-300 dark:text-gray-600 text-xs">-</span>
                          ) : (
                            <div className="flex flex-col gap-1 w-max">
                              {s.areas.map((a) => (
                                <span key={a} className="inline-flex items-center whitespace-nowrap w-fit text-[10px] px-1.5 py-0.5 rounded font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800">
                                  <FontAwesomeIcon icon={faLayerGroup} className="mr-1 h-2.5 w-2.5" />
                                  {a}
                                </span>
                              ))}
                              {s.turnos.map((t) => (
                                <span key={t} className="inline-flex items-center whitespace-nowrap w-fit text-[10px] px-1.5 py-0.5 rounded font-medium bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-800">
                                  <FontAwesomeIcon icon={faClock} className="mr-1 h-2.5 w-2.5" />
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        {/* Horario Base */}
                        <td className="py-2.5 px-2 text-center whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            {s.schedules.length > 0 ? (
                              s.schedules.map((sc, scIdx) => (
                                <span key={scIdx} className="text-[9px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded px-1 lowercase whitespace-nowrap">
                                  {sc}
                                </span>
                              ))
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600">-</span>
                            )}
                          </div>
                        </td>
                        {/*
                          EL ÚLTIMO CONTRATO Y SI ESTÁ VIGENTE — igual que en Contratos.

                          Mostraba «3 | A: 01/06/2023 B: - | Tipo»: la cantidad de contratos del
                          período, en un badge verde o rojo según si había alguno activo. Ese verde no
                          significaba «vigente» sino «tiene al menos uno», y las fechas de al lado eran
                          las del último — o sea, tres datos de tres cosas distintas leyéndose como uno.
                          Con dos contratos y el último vencido, decía «2» en verde.

                          Ahora dice lo mismo que la tabla de Contratos: el estado del ÚLTIMO contrato,
                          con sus fechas debajo. Un dato, calculado igual que allá (`isContractVigente`,
                          no un conteo), así que las dos pantallas no pueden discrepar.

                          El ícono de detalle se queda: ahí siguen estando todos los contratos, que es
                          donde corresponde ver los anteriores.
                        */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {s.userProjectsData.length > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="flex flex-col gap-0.5">
                                {(() => {
                                  const vigente = isContractVigente(s.contractAlta, s.contractBaja);
                                  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] uppercase font-bold w-fit ${vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>{vigente ? "VIGENTE" : "NO VIGENTE"}</span>;
                                })()}
                                <span className="text-[10px] leading-tight text-gray-500 dark:text-gray-400">
                                  <span className="text-gray-400 dark:text-gray-500">Alta:</span> {s.contractAlta ? s.contractAlta.substring(0, 10).split("-").reverse().join("/") : "—"}
                                </span>
                                <span className="text-[10px] leading-tight text-gray-500 dark:text-gray-400">
                                  <span className="text-gray-400 dark:text-gray-500">Baja:</span> {s.contractBaja ? s.contractBaja.substring(0, 10).split("-").reverse().join("/") : "—"}
                                </span>
                              </div>
                              <button onClick={() => handleOpenContract(s)} className="text-gray-400 hover:text-blue-500 transition-colors p-1 shrink-0" title={`Ver los ${s.userProjectsData.length} contrato(s) de esta persona`}>
                                <FontAwesomeIcon icon={faFileContract} className="text-xs" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600 text-xs">-</span>
                          )}
                        </td>
                        {/*
                          EL TIPO DE CONTRATO, EN SU PROPIA COLUMNA.

                          Estaba metido adentro de la celda «Contrato», truncado a 120 píxeles y
                          debajo de tres datos más: con nombres como "Plazo fijo 5x10 2030 SRL +
                          Release JSA FZERO" no se leía ninguno. Y hasta que `nombre_contrato` volvió
                          a viajar en `/users/directory` estaba siempre vacío, así que en los hechos
                          la columna no existía.

                          Es el tipo del ÚLTIMO contrato, el mismo que muestra el estado de al lado y
                          el mismo con el que filtra «Tipo de contrato»: los tres leen `contractType`.
                        */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {s.contractType ? (
                            <span className="text-[11px] text-gray-700 dark:text-gray-200 max-w-[220px] block truncate" title={s.contractType}>
                              {s.contractType}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600 text-xs">-</span>
                          )}
                        </td>
                        {/* Asistencias (Presente | Ausencias | Calendario) */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-green-600 dark:text-green-400 font-bold" title="Días Presente">
                              {s.daysPresent}
                            </span>
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <span className={`font-bold ${s.absences > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400 dark:text-gray-600"}`} title="Días Ausente">
                              {s.absences}
                            </span>
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <button onClick={() => setDailyDetailModal({ open: true, stats: s })} className="text-gray-400 hover:text-blue-500 transition-colors p-1" title="Ver detalle diario">
                              <FontAwesomeIcon icon={faCalendarDays} className="text-xs" />
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-left">
                          <div className="flex flex-col gap-0.5 max-w-[120px]">
                            {s.overtimeEntries.length > 0 ? (
                              s.overtimeEntries.map((entry, eIdx) => (
                                <div key={eIdx} className="flex items-center gap-1 justify-start border-b border-gray-100/5 dark:border-gray-800/30 pb-0.5 last:border-0 last:pb-0">
                                  <span className="text-[8px] font-bold text-gray-400 dark:text-gray-500">{entry.date}</span>
                                  {((entry.h50 || 0) > 0 || (entry.h100 || 0) > 0) ? (
                                    <div className="flex flex-col items-start">
                                      <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap bg-gray-100/70 dark:bg-gray-800/80 px-1 py-0.5 rounded leading-none">
                                        {entry.schedule}
                                      </span>
                                      <div className="flex gap-0.5 mt-0.5 text-[7px] font-black uppercase tracking-tight">
                                        {(entry.h100 || 0) > 0 && (
                                          <span className="px-0.5 py-px rounded bg-red-500/10 text-red-500 border border-red-500/10 dark:bg-red-500/5 dark:text-red-400 whitespace-nowrap">
                                            +{entry.h100}h 100%
                                          </span>
                                        )}
                                        {(entry.h50 || 0) > 0 && (
                                          <span className="px-0.5 py-px rounded bg-amber-500/10 text-amber-600 border border-amber-500/10 dark:bg-amber-500/5 dark:text-amber-400 whitespace-nowrap">
                                            +{entry.h50}h 50%
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ) : (
                                    <span className={`text-[9px] font-medium rounded px-1 lowercase whitespace-nowrap ${entry.pct === glossary.pct100 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-gray-100 text-gray-500 dark:bg-gray-800"}`}>
                                      {entry.schedule} <span className="text-[8px] opacity-70">({entry.pct}%)</span>
                                    </span>
                                  )}
                                </div>
                              ))
                            ) : (
                              <span className="text-gray-300 dark:text-gray-600">-</span>
                            )}
                          </div>
                        </td>
                        {/* Hs 50% */}
                        <td className="py-2.5 px-2 text-right font-medium text-gray-600 dark:text-gray-400">{s.overtime50 > 0 ? `${s.overtime50}h` : <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
                        {/* Hs 100% */}
                        <td className="py-2.5 px-2 text-right font-medium text-gray-600 dark:text-gray-400">{s.overtime100 > 0 ? `${s.overtime100}h` : <span className="text-gray-300 dark:text-gray-600">-</span>}</td>
                        {/* $ Extras */}
                        <td className="py-2.5 px-2 text-right font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
                          {(() => {
                            const salaryDivisor = glossary.salaryDivisorPercentage || 150;
                            const baseHour = s.sueldoMano / salaryDivisor;
                            const cost50 = s.overtime50 * baseHour * (1 + glossary.pct50 / 100);
                            const cost100 = s.overtime100 * baseHour * (1 + glossary.pct100 / 100);
                            return cost50 + cost100 > 0 ? `$${(cost50 + cost100).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-";
                          })()}
                        </td>
                        {/* Monto Total */}
                        <td className="py-2.5 px-3 text-right font-bold text-green-600 dark:text-green-400 whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <span>
                              {(() => {
                                const salaryDivisor = glossary.salaryDivisorPercentage || 150;
                                const baseHour = s.sueldoMano / salaryDivisor;
                                const cost50 = s.overtime50 * baseHour * (1 + glossary.pct50 / 100);
                                const cost100 = s.overtime100 * baseHour * (1 + glossary.pct100 / 100);
                                const salaryMonto = s.sueldoJornada * (s.cantidadJornadasLaborales - s.absences);
                                return `$${(salaryMonto + cost50 + cost100).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}`;
                              })()}
                            </span>
                            <span className="text-gray-300 dark:text-gray-600">|</span>
                            <button onClick={() => setTotalDetail({ open: true, stats: s })} className="text-gray-400 hover:text-blue-500 transition-colors p-1" title="Ver detalle del cálculo">
                              <FontAwesomeIcon icon={faFileLines} className="text-xs" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      {/* Sub-fila expansion eliminada a favor de Modal */}
                    </React.Fragment>
                  );
                })}
                {statsByEmployee.length === 0 && (
                  <tr>
                    {/* 18 = las columnas que dibuja el thead, contando la del chevron. */}
                    <td colSpan={18} className="py-12 text-center text-gray-500 dark:text-gray-400 italic">
                      {cargando || cargandoAsistencias ? (
                        <span className="inline-flex items-center gap-2 not-italic">
                          <FontAwesomeIcon icon={faSpinner} spin />
                          Cargando novedades…
                        </span>
                      ) : (
                        "No se encontraron registros para el mes y filtros seleccionados."
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
              {statsByEmployee.length > 0 && (
                <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold text-gray-700 dark:text-gray-300 border-t-2 border-gray-200 dark:border-gray-600">
                  <tr>
                    <td className="py-2.5 px-3">Totales ({totalEmployees})</td>
                    <td className="py-2.5 px-3"></td> {/* S. Jornada */}
                    <td className="py-2.5 px-3"></td> {/* S. Mano */}
                    <td className="py-2.5 px-3"></td> {/* P. Hora */}
                    <td className="py-2.5 px-3"></td> {/* P. Hora Extra */}
                    <td className="py-2.5 px-3"></td> {/* Jornadas */}
                    <td className="py-2.5 px-3"></td> {/* Proyectos */}
                    <td className="py-2.5 px-3"></td> {/* Área | Turno */}
                    <td className="py-2.5 px-3"></td> {/* Horario Base */}
                    <td className="py-2.5 px-3"></td> {/* Contrato */}
                    <td className="py-2.5 px-3"></td> {/* Tipo de Contrato */}
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2 font-bold">
                        <span className="text-green-600 dark:text-green-400" title="Total Presentes">
                          {statsByEmployee.reduce((a, c) => a + c.daysPresent, 0)}
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">|</span>
                        <span className="text-red-600 dark:text-red-400" title="Total Ausencias">
                          {totalAbsences}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center"></td> {/* Horario Extra */}
                    <td className="py-2.5 px-2 text-right text-xs font-bold">{totalOvertime50}h</td>
                    <td className="py-2.5 px-2 text-right text-xs font-bold">{totalOvertime100}h</td>
                    <td className="py-2.5 px-2 text-right text-xs font-bold text-amber-600 dark:text-amber-400 border-x border-gray-100 dark:border-gray-700">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-2.5 px-3 text-right font-black text-green-600 dark:text-green-400">${grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td></td> {/* Expand */}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Paginación client-side de la tabla de empleados */}
          {reportTotalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 dark:border-gray-700 pt-3 mt-1 gap-3 shrink-0">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Mostrando <span className="font-semibold text-primary-600">{pagedStats.length}</span> de <span className="font-semibold text-primary-600">{statsByEmployee.length}</span> empleados
              </p>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button onClick={() => setReportPage((p) => Math.max(p - 1, 1))} disabled={reportPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
                </button>
                {Array.from({ length: reportTotalPages }).map((_, i) => {
                  const p = i + 1;
                  if (p === 1 || p === reportTotalPages || (p >= reportPage - 2 && p <= reportPage + 2)) {
                    return (
                      <button key={p} onClick={() => setReportPage(p)} className={`relative inline-flex items-center px-3.5 py-2 border text-sm font-medium ${reportPage === p ? "bg-primary-600 border-primary-600 text-white z-10" : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                        {p}
                      </button>
                    );
                  }
                  if ((p === 2 && reportPage > 4) || (p === reportTotalPages - 1 && reportPage < reportTotalPages - 3)) {
                    return <span key={`dots-${p}`} className="relative inline-flex items-center px-3.5 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-sm">...</span>;
                  }
                  return null;
                })}
                <button onClick={() => setReportPage((p) => Math.min(p + 1, reportTotalPages))} disabled={reportPage === reportTotalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
                  <FontAwesomeIcon icon={faChevronRight} className="h-3.5 w-3.5" />
                </button>
              </nav>
            </div>
          )}
        </div>
      </Modal>

      {/* Contract Detail Sub-Modal */}
      <ContractDetailModal isOpen={contractModal.open} onClose={() => setContractModal({ ...contractModal, open: false })} employeeName={contractModal.employeeName} userProjectsData={contractModal.data} filterProjectId={projectFilter !== "all" ? projectFilter : undefined} zIndex={100} periodStart={parseISO(dateFrom + "T00:00:00")} periodEnd={parseISO(dateTo + "T23:59:59")} nombresPorId={nombresPorId} />
      <TotalDetailModal isOpen={totalDetail.open} onClose={() => setTotalDetail({ open: false, stats: null })} stats={totalDetail.stats} glossary={glossary} zIndex={110} />
      <DailyDetailModal isOpen={dailyDetailModal.open} onClose={() => setDailyDetailModal({ open: false, stats: null })} stats={dailyDetailModal.stats} dateFrom={dateFrom} dateTo={dateTo} zIndex={120} />
    </>
  );
};

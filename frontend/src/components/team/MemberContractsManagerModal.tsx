import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBan, faFileContract, faFileLines } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { usersAPI, ManagedContract } from "../../api/users";
import { projectsAPI } from "../../api/projects";
import { companiesAPI } from "../../api/companies";
import { contratoFrameAPI, ContratoFrameItem } from "../../api/contratosFrame";
import { releasesAPI, Release } from "../../api/release";
import { sweetAlert } from "../../utils/sweetAlert";
import { ContractCard, EmpresaOption, findTemplate, templateHasContent } from "./ContractCard";
import { ContractFiltersBar, ContractFilterState, emptyContractFilters, matchesContractFilters } from "./ContractFilters";
import { getContratoActivo } from "../../utils/contratoVigencia";

import { anularContratoConRevision, etiquetaContrato } from "../../utils/anularContrato";
import { HistorialContrato } from "../contratos/HistorialContrato";
interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
  userName?: string;
  contratoFrames: ContratoFrameItem[];
  releases: Release[];
  /** Abrir ya filtrado por un proyecto (desde el equipo de ese proyecto). */
  proyectoInicial?: string;
  /** Por encima de otro modal (el del equipo). */
  zIndex?: number;
}

/**
 * Gestión de TODOS los contratos de una persona (cross-proyecto/cliente): lista con formato de tarjetas,
 * filtros (cliente, proyecto, tipo, vigencia, rango de fechas) y descarga de contrato/release por tarjeta.
 */
/*
  UN CONTRATO ANULADO EN LA LISTA (18/11/2026): en su lugar, con lo que era, quién lo anuló, cuándo y por
  qué, y sin ninguna acción (no se edita, no se descarga, no se vuelve a anular). Una anulación que no se
  ve desde la aplicación se ve igual que el borrado que reemplazó.
*/
const TarjetaAnulado: React.FC<{ r: ManagedContract; userId: string }> = ({ r, userId }) => {
  const a = r.anulado!;
  return (
    <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900">
          <FontAwesomeIcon icon={faBan} className="h-3 w-3" />
          ANULADO
        </span>
        {r.clientName && <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{r.clientName}</span>}
        {r.projectName && <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{r.projectName}</span>}
        {!a.vinculoEliminado && <span className="text-xs text-gray-500">posición #{r.contractIndex}</span>}
      </div>
      <p className="mt-2 text-gray-500 dark:text-gray-400 line-through decoration-gray-400">{etiquetaContrato({ ...a.contrato, nombre_contrato: a.contrato.nombre_contrato || "", nombre_empresa_contrato: a.contrato.nombre_empresa_contrato || "", fecha_alta_contrato: a.contrato.fecha_alta_contrato || "", fecha_baja_contrato: a.contrato.fecha_baja_contrato || "" } as any)}</p>
      <p className="mt-2 text-gray-800 dark:text-gray-100">
        <span className="font-semibold">Motivo:</span> {a.motivo || "—"}
      </p>
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
        Anulado {a.el ? `el ${new Date(a.el).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}` : ""} por {a.porNombre || "—"}
        {a.vinculoEliminado ? " · era su último contrato en el proyecto: salió del equipo" : ""}
      </p>
      <HistorialContrato userId={userId} contratoKey={(r.contract as any)?.contratoKey ? String((r.contract as any).contratoKey) : null} />
    </div>
  );
};

export const MemberContractsManagerModal: React.FC<Props> = ({ isOpen, onClose, userId, userName, contratoFrames, releases, proyectoInicial, zIndex = 60 }) => {
  // Los contratos y, en su lugar, los ANULADOS (etapa 2b; vienen en la misma lista con `anulado`).
  const [rows, setRows] = useState<ManagedContract[]>([]);
  const [loading, setLoading] = useState(false);
  // Empresas del ABM: fallback para los proyectos que no tienen ninguna configurada (mismo criterio que
  // el modal de contratos del proyecto). Se resuelve acá y no solo en el backend para no depender de él.
  const [allEmpresas, setAllEmpresas] = useState<EmpresaOption[]>([]);

  const [filters, setFilters] = useState<ContractFilterState>(emptyContractFilters);
  const navigate = useNavigate();
  const activeReleases = useMemo(() => releases.filter((r) => r.isActive), [releases]);

  const load = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    usersAPI
      .getAllContracts(userId)
      .then(setRows)
      .catch(() => sweetAlert.error("Error", "No se pudieron cargar los contratos de la persona."))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!isOpen || !userId) return;
    setFilters(proyectoInicial ? { ...emptyContractFilters, proyecto: proyectoInicial } : emptyContractFilters);
    load();
  }, [isOpen, userId, load, proyectoInicial]);

  useEffect(() => {
    if (!isOpen || allEmpresas.length > 0) return;
    companiesAPI
      .list()
      .then((cs) => setAllEmpresas(cs.map((c) => ({ id: c._id, label: c.razonSocial })).filter((e) => e.label)))
      .catch(() => setAllEmpresas([])); // sin permisos → se muestran solo las del proyecto
  }, [isOpen, allEmpresas.length]);

  // Editar: ir al equipo del proyecto y abrir el editor del miembro precargado con ese contrato.
  const handleEdit = (r: ManagedContract) => {
    if (!userId) return;
    onClose();
    navigate(`/projects/${r.projectId}/team`, { state: { openWizardFor: { userId, contractIndex: r.contractIndex } } });
  };

  // Anular SOLO ese contrato (cualquiera, no sólo el último): revisa, ofrece mover recibos, pide motivo.
  const handleDelete = async (r: ManagedContract) => {
    if (!userId) return;
    if (await anularContratoConRevision({ projectId: r.projectId, userId, contractIndex: r.contractIndex, contexto: `Proyecto «${r.projectName}».` })) load();
  };

  // Opciones de filtro derivadas de los contratos
  const clientes = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => r.clientId && m.set(r.clientId, r.clientName || r.clientId));
    return [...m].map(([id, name]) => ({ id, name }));
  }, [rows]);

  const proyectos = useMemo(() => {
    const m = new Map<string, string>();
    rows.filter((r) => filters.cliente === "all" || r.clientId === filters.cliente).forEach((r) => r.projectId && m.set(r.projectId, r.projectName || r.projectId));
    return [...m].map(([id, name]) => ({ id, name }));
  }, [rows, filters.cliente]);

  const tipos = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => {
      const n = r.anulado ? r.anulado.contrato.nombre_contrato : r.contract?.nombre_contrato;
      if (n) s.add(n);
    });
    return [...s];
  }, [rows]);

  // El contrato resaltado de cada proyecto es el que RIGE hoy (el vigente más reciente, que puede
  // ser un tiempo indeterminado con contratos vencidos cargados después), igual que la fila de la
  // tabla del equipo y que el modal de Gestionar equipo.
  const indiceQueRigePorProyecto = useMemo(() => {
    const porProyecto = new Map<string, ManagedContract[]>();
    rows.filter((r) => !r.anulado).forEach((r) => {
      if (!porProyecto.has(r.projectId)) porProyecto.set(r.projectId, []);
      porProyecto.get(r.projectId)!.push(r);
    });

    const m = new Map<string, number>();
    porProyecto.forEach((filas, projectId) => {
      const ordenadas = [...filas].sort((a, b) => a.contractIndex - b.contractIndex);
      const queRige = getContratoActivo(ordenadas.map((f) => f.contract) as any[]);
      const fila = ordenadas.find((f) => f.contract === queRige);
      if (fila) m.set(projectId, fila.contractIndex);
    });
    return m;
  }, [rows]);

  const isLatest = (r: ManagedContract) => !r.anulado && indiceQueRigePorProyecto.get(r.projectId) === r.contractIndex;

  const filtered = useMemo(
    () =>
      rows.filter((r) =>
        matchesContractFilters(filters, { contract: (r.anulado ? r.anulado.contrato : r.contract) as any, clientId: r.clientId, projectId: r.projectId, isLatest: isLatest(r), anulado: !!r.anulado }),
      ),
    [rows, filters, indiceQueRigePorProyecto],
  );
  const totalContratos = rows.filter((r) => !r.anulado).length;
  const totalAnulados = rows.length - totalContratos;
  const filtradosContratos = filtered.filter((r) => !r.anulado).length;

  const handleDownloadContract = async (r: ManagedContract, empresaId?: string) => {
    const template = findTemplate(r.contract, contratoFrames);
    if (!templateHasContent(template)) {
      sweetAlert.error("Sin contenido", "La plantilla de este tipo de contrato todavía no tiene contenido redactado.");
      return;
    }
    if (!userId) return;
    try {
      await contratoFrameAPI.downloadFilled(template as ContratoFrameItem, { userId, projectId: r.projectId, contractIndex: r.contractIndex, empresaId });
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo descargar el contrato.");
    }
  };

  const handleDownloadRelease = async (r: ManagedContract, release: Release, empresaId?: string) => {
    if (!userId) return;
    try {
      await releasesAPI.downloadFilled(release, { userId, projectId: r.projectId, contractIndex: r.contractIndex, empresaId });
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo descargar el release.");
    }
  };

  const handleUploadAltaDocumento = async (r: ManagedContract, file: File) => {
    if (!userId) return;
    try {
      await projectsAPI.uploadAltaDocumento(r.projectId, userId, r.contractIndex, file);
      load();
    } catch {
      sweetAlert.error("Error", "No se pudo subir el documento.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={userName || "Empleado"} subtitle="Gestión de contratos (todos los proyectos)" size="lg" zIndex={zIndex}>
      <div className="space-y-4">
        <ContractFiltersBar value={filters} onChange={setFilters} clientes={clientes} proyectos={proyectos} tipos={tipos} />

        {/* Pestaña Contratos (mismo header que el modal de contratos del proyecto) */}
        <div className="flex items-end justify-between border-b border-gray-200 dark:border-gray-700">
          <span className="inline-flex items-center gap-2 px-1 pb-2 text-sm font-semibold text-blue-600 dark:text-blue-400 border-b-2 border-blue-500">
            <FontAwesomeIcon icon={faFileContract} className="h-4 w-4" />
            Contratos
          </span>
          <span className="pb-2 text-xs text-gray-500">
            {filtradosContratos} de {totalContratos}
            {totalAnulados > 0 ? ` · ${filtered.length - filtradosContratos} de ${totalAnulados} ${totalAnulados === 1 ? "anulado" : "anulados"}` : ""}
          </span>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-gray-500">Cargando contratos…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-3 py-10">
            <FontAwesomeIcon icon={faFileLines} className="h-10 w-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500">{rows.length === 0 ? "Esta persona no tiene contratos." : "Ningún contrato coincide con los filtros."}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r, idx) =>
              r.anulado ? (
                <TarjetaAnulado key={`anulado-${r.projectId}-${r.contractIndex}-${idx}`} r={r} userId={userId!} />
              ) : (
              <div key={`${r.projectId}-${r.contractIndex}-${idx}`}>
              <ContractCard
                contract={r.contract}
                contratoFrames={contratoFrames}
                activeReleases={activeReleases}
                contratoEmpresas={r.contratoEmpresas.length > 0 ? r.contratoEmpresas : allEmpresas}
                releaseEmpresas={r.releaseEmpresas.length > 0 ? r.releaseEmpresas : allEmpresas}
                isLatest={isLatest(r)}
                extraBadges={
                  <>
                    {r.clientName && <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{r.clientName}</span>}
                    {r.projectName && <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">{r.projectName}</span>}
                  </>
                }
                onEdit={() => handleEdit(r)}
                onDelete={() => handleDelete(r)}
                editTitle="Editar contrato (ir al equipo del proyecto)"
                deleteTitle="Anular este contrato"
                onDownloadContract={(empresaId) => handleDownloadContract(r, empresaId)}
                onDownloadRelease={(release, empresaId) => handleDownloadRelease(r, release, empresaId)}
                onUploadAltaDocumento={(file) => handleUploadAltaDocumento(r, file)}
              />
              <div className="flex flex-wrap items-center gap-4">
                <HistorialContrato userId={userId!} contratoKey={(r.contract as any)?.contratoKey ? String((r.contract as any).contratoKey) : null} />
                {/* «Relación en ARCA» (Modificaciones y Bajas) se mudó al ícono de Acciones de la bandeja Contratos (22/11/2026). */}
              </div>
              </div>
              ),
            )}
          </div>
        )}

      </div>
    </Modal>
  );
};

export default MemberContractsManagerModal;

import React, { useState, useEffect, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faUserPlus, faClock, faSearch, faDollarSign, faExchangeAlt, faIdCard, faEnvelope, faLock, faEye, faEyeSlash, faBuilding } from "@fortawesome/free-solid-svg-icons";
import { usersAPI, User } from "../../api/users";
import { roleFrameAPI, RoleFrameItem } from "../../api/roleFrames";
import { categoriaSatAPI, CategoriaSatItem } from "../../api/categoriasSat";
import { Project } from "../../api/projects";
import { Modal } from "../../components/ui/Modal";
import { sweetAlert } from "../../utils/sweetAlert";

interface TeamSolicitudesTabProps {
  projectId: string;
  project: Project;
  onApproved: () => void;
}

export const TeamSolicitudesTab: React.FC<TeamSolicitudesTabProps> = ({ projectId, onApproved }) => {
  const [solicitudes, setSolicitudes] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFrames, setRoleFrames] = useState<RoleFrameItem[]>([]);
  const [categoriasSat, setCategoriasSat] = useState<CategoriaSatItem[]>([]);

  // Approval modal
  const [approvalModal, setApprovalModal] = useState<{ open: boolean; user: User | null }>({ open: false, user: null });
  const [approvalForm, setApprovalForm] = useState({
    email: "",
    password: "",
    sueldo_jornada: "",
    sueldo_mano: "",
    nombre_contrato: "Tiempo Indeterminado",
    nombre_sede: "",
    observaciones: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchSolicitudes = async () => {
    try {
      setLoading(true);
      const [allSolicitudes, frames, cats] = await Promise.all([usersAPI.listSolicitudes(), roleFrameAPI.list(), categoriaSatAPI.list()]);
      setRoleFrames(frames);
      setCategoriasSat(cats);
      setSolicitudes(allSolicitudes);
    } catch (error) {
      console.error("Error fetching solicitudes:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSolicitudes();
  }, [projectId]);

  // Filter solicitudes for this project
  const filteredSolicitudes = useMemo(() => {
    return solicitudes.filter((u) => {
      // Must have this project in metadata.projectIds
      const hasProject = u.metadata?.projectIds?.includes(projectId);
      if (!hasProject) return false;

      // Search filter
      if (searchTerm) {
        const name = (u.metadata?.fullName || `${u.firstName} ${u.lastName}`).toLowerCase();
        if (!name.includes(searchTerm.toLowerCase())) return false;
      }

      return true;
    });
  }, [solicitudes, projectId, searchTerm]);

  const getRolFrameName = (id?: string) => {
    if (!id) return "Sin rol";
    return roleFrames.find((rf) => rf._id === id)?.name || "Sin rol";
  };

  const getCategoriaName = (id?: string) => {
    if (!id) return "Sin categoría";
    return categoriasSat.find((c) => c._id === id)?.name || "Sin categoría";
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "N/A";
    try {
      return new Date(dateStr).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const handleOpenApproval = (user: User) => {
    setApprovalForm({
      email: "",
      password: "",
      sueldo_jornada: user.metadata?.dailyRate?.toString() || "",
      sueldo_mano: "",
      nombre_contrato: "Tiempo Indeterminado",
      nombre_sede: "",
      observaciones: "",
    });
    setApprovalModal({ open: true, user });
  };

  const handleApprove = async () => {
    if (!approvalModal.user) return;
    if (!approvalForm.email) {
      sweetAlert.warning("Campo requerido", "El email es obligatorio.");
      return;
    }
    if (!approvalForm.password || approvalForm.password.length < 6) {
      sweetAlert.warning("Campo requerido", "La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setSubmitting(true);
    try {
      await usersAPI.approveSolicitud(approvalModal.user._id, {
        email: approvalForm.email,
        password: approvalForm.password,
        sueldo_jornada: Number(approvalForm.sueldo_jornada) || 0,
        sueldo_mano: Number(approvalForm.sueldo_mano) || 0,
        nombre_contrato: approvalForm.nombre_contrato,
        nombre_sede: approvalForm.nombre_sede,
        observaciones: approvalForm.observaciones,
      });
      sweetAlert.success("Solicitud Aprobada", `${approvalModal.user.metadata?.fullName || "El usuario"} ha sido dado de alta exitosamente.`);
      setApprovalModal({ open: false, user: null });
      fetchSolicitudes();
      onApproved();
    } catch (error: any) {
      const msg = error.response?.data?.error || "Error al aprobar la solicitud";
      sweetAlert.error("Error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = async (user: User) => {
    const result = await sweetAlert.confirm("¿Rechazar solicitud?", `Se eliminará la solicitud de ${user.metadata?.fullName || "este usuario"}. Esta acción no se puede deshacer.`, "Sí, rechazar");
    if (!result.isConfirmed) return;

    try {
      await usersAPI.rejectSolicitud(user._id);
      sweetAlert.success("Solicitud Rechazada", "La solicitud ha sido eliminada.");
      fetchSolicitudes();
    } catch (error: any) {
      sweetAlert.error("Error", error.response?.data?.error || "Error al rechazar la solicitud");
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-gray-200 dark:bg-gray-700 rounded-full" />
              <div className="flex-1">
                <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
                <div className="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
          <FontAwesomeIcon icon={faSearch} />
        </span>
        <input type="text" className="input-field pl-10 h-10 w-full" placeholder="Buscar solicitudes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      {/* List */}
      {filteredSolicitudes.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center h-48 text-gray-500">
          <FontAwesomeIcon icon={faUserPlus} className="h-10 w-10 mb-3 opacity-10" />
          <p className="text-sm font-medium">No hay solicitudes pendientes para este proyecto</p>
          <p className="text-xs mt-1 text-gray-400">Las solicitudes de alta desde mobile aparecerán aquí.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold">Nombre</th>
                  <th className="px-4 py-3 font-semibold">Rol/es Frame</th>
                  <th className="px-4 py-3 font-semibold">Categoría SAT</th>
                  <th className="px-4 py-3 font-semibold">Fechas</th>
                  <th className="px-4 py-3 font-semibold">Horario</th>
                  <th className="px-4 py-3 font-semibold">Valor Jornada</th>
                  <th className="px-4 py-3 font-semibold text-center">Estado</th>
                  <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSolicitudes.map((user) => {
                  const meta = user.metadata;
                  const displayName = meta?.fullName || `${user.firstName} ${user.lastName}`;

                  return (
                    <tr key={user._id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold text-xs shrink-0">{displayName.charAt(0).toUpperCase()}</div>
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{displayName}</p>
                            <p className="text-xs text-gray-500 truncate">{formatDate(user.createdAt)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{getRolFrameName(meta?.roleFrameId)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{getCategoriaName(meta?.categoriaSatId)}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          <span>{formatDate(meta?.startDate)}</span>
                          <span className="mx-1 text-gray-300">→</span>
                          <span>{meta?.dueDate ? formatDate(meta.dueDate) : "Indef."}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{meta?.schedule || "-"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">{meta?.dailyRate ? `$${meta.dailyRate.toLocaleString("es-AR")}` : "-"}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <FontAwesomeIcon icon={faClock} className="text-[8px]" />
                          PENDIENTE
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => handleOpenApproval(user)} className="px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors flex items-center gap-1.5 shadow-sm" title="Aprobar solicitud">
                            <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
                            Aprobar
                          </button>
                          <button onClick={() => handleReject(user)} className="px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-800 rounded transition-colors flex items-center gap-1.5" title="Rechazar solicitud">
                            <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                            Rechazar
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
      )}

      {/* Approval Modal */}
      <Modal isOpen={approvalModal.open} onClose={() => setApprovalModal({ open: false, user: null })} title="Aprobar Solicitud de Alta" subtitle={approvalModal.user?.metadata?.fullName || ""} size="lg">
        {approvalModal.user && (
          <div className="space-y-6">
            {/* Current solicitud info summary */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800 space-y-3">
              <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider">Datos de la Solicitud</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-[10px] text-blue-500 dark:text-blue-400 uppercase font-semibold">Nombre</span>
                  <p className="font-medium text-gray-900 dark:text-white">{approvalModal.user.metadata?.fullName}</p>
                </div>
                <div>
                  <span className="text-[10px] text-blue-500 dark:text-blue-400 uppercase font-semibold">Rol/es Frame</span>
                  <p className="font-medium text-gray-900 dark:text-white">{getRolFrameName(approvalModal.user.metadata?.roleFrameId)}</p>
                </div>
                <div>
                  <span className="text-[10px] text-blue-500 dark:text-blue-400 uppercase font-semibold">Categoría SAT</span>
                  <p className="font-medium text-gray-900 dark:text-white">{getCategoriaName(approvalModal.user.metadata?.categoriaSatId)}</p>
                </div>
                <div>
                  <span className="text-[10px] text-blue-500 dark:text-blue-400 uppercase font-semibold">Fechas</span>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {formatDate(approvalModal.user.metadata?.startDate)} → {approvalModal.user.metadata?.dueDate ? formatDate(approvalModal.user.metadata.dueDate) : "Indef."}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] text-blue-500 dark:text-blue-400 uppercase font-semibold">Horario</span>
                  <p className="font-medium text-gray-900 dark:text-white">{approvalModal.user.metadata?.schedule || "-"}</p>
                </div>
                <div>
                  <span className="text-[10px] text-blue-500 dark:text-blue-400 uppercase font-semibold">Jornadas</span>
                  <p className="font-medium text-gray-900 dark:text-white">{approvalModal.user.metadata?.workdaysCount || "-"}</p>
                </div>
                {approvalModal.user.metadata?.isReplacement && (
                  <div className="col-span-full">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold">
                      <FontAwesomeIcon icon={faExchangeAlt} className="text-[10px]" />
                      REEMPLAZO
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Approval form */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <FontAwesomeIcon icon={faCheck} className="text-green-500 text-[10px]" />
                Completar para dar de alta
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Email */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faEnvelope} className="text-blue-500 text-[10px]" />
                    Email *
                  </label>
                  <input type="email" value={approvalForm.email} onChange={(e) => setApprovalForm((p) => ({ ...p, email: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="usuario@email.com" />
                </div>

                {/* Password */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faLock} className="text-blue-500 text-[10px]" />
                    Contraseña *
                  </label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={approvalForm.password} onChange={(e) => setApprovalForm((p) => ({ ...p, password: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm pr-10 focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Mín. 6 caracteres" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1">
                      <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="text-xs" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Sueldo Jornada */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faDollarSign} className="text-blue-500 text-[10px]" />
                    Sueldo Jornada
                  </label>
                  <input type="number" value={approvalForm.sueldo_jornada} onChange={(e) => setApprovalForm((p) => ({ ...p, sueldo_jornada: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                </div>

                {/* Sueldo Mano */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faDollarSign} className="text-blue-500 text-[10px]" />
                    Sueldo Mano
                  </label>
                  <input type="number" value={approvalForm.sueldo_mano} onChange={(e) => setApprovalForm((p) => ({ ...p, sueldo_mano: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Tipo de Contrato */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faIdCard} className="text-blue-500 text-[10px]" />
                    Tipo de Contrato
                  </label>
                  <select value={approvalForm.nombre_contrato} onChange={(e) => setApprovalForm((p) => ({ ...p, nombre_contrato: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                    <option value="Tiempo Indeterminado">Tiempo Indeterminado</option>
                    <option value="Jornada">Jornada</option>
                    <option value="Temporal">Temporal</option>
                    <option value="Freelance">Freelance</option>
                    <option value="Pasantía">Pasantía</option>
                  </select>
                </div>

                {/* Sede */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faBuilding} className="text-blue-500 text-[10px]" />
                    Sede
                  </label>
                  <input type="text" value={approvalForm.nombre_sede} onChange={(e) => setApprovalForm((p) => ({ ...p, nombre_sede: e.target.value }))} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Sede del proyecto" />
                </div>
              </div>

              {/* Observaciones */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Observaciones</label>
                <textarea value={approvalForm.observaciones} onChange={(e) => setApprovalForm((p) => ({ ...p, observaciones: e.target.value }))} rows={2} className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="Opcional..." />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <button onClick={() => setApprovalModal({ open: false, user: null })} className="flex-1 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm">
                Cancelar
              </button>
              <button onClick={handleApprove} disabled={submitting} className="flex-1 py-2.5 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 shadow-lg shadow-green-500/20 transition-all active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                {submitting ? "Procesando..." : "Confirmar Alta"}
                <FontAwesomeIcon icon={faCheck} />
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

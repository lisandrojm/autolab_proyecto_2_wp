import React, { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faBriefcase, faClock, faMoneyBillWave, faExchangeAlt, faArrowRight, faSearch, faFilter } from "@fortawesome/free-solid-svg-icons";
import { usersAPI } from "../../../../api/users";
import { DiasDeTrabajo } from "../../../../components/contratos/DiasDeTrabajo";
import { roleFrameAPI, RoleFrameItem } from "../../../../api/roleFrames";
import { categoriaSatAPI, CategoriaSatItem } from "../../../../api/categoriasSat";
import { sweetAlert } from "../utils/sweetAlert";
import { CustomDatePicker } from "./CustomDatePicker";
import { projectsAPI, Project } from "../../../../api/projects";
import { useProfile } from "../hooks/useProfile";
import { LoadingSpinner } from "../../../../components/ui/LoadingSpinner";

interface UserRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingUser?: any | null;
}

export const UserRegistrationModal: React.FC<UserRegistrationModalProps> = ({ isOpen, onClose, onSuccess, editingUser }) => {
  const { profile } = useProfile();
  const [submitting, setSubmitting] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [roleFrames, setRoleFrames] = useState<RoleFrameItem[]>([]);
  const [categoriasSat, setCategoriasSat] = useState<CategoriaSatItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [platformUsers, setPlatformUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  /** Roles frame de la persona elegida (vacío si el nombre se escribió a mano). Ver el select de Rol/es Frame. */
  const rolesDelUsuario: string[] = selectedUser?.metadata?.roleFrameIds || [];
  const [showUserResults, setShowUserResults] = useState(false);
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [selectedRoleFilters, setSelectedRoleFilters] = useState<string[]>([]);
  const [showRoleFilterMenu, setShowRoleFilterMenu] = useState(false);

  const [formData, setFormData] = useState({
    fullName: "",
    projectIds: [] as string[],
    roleFrameId: "",
    categoriaSatId: "",
    startDate: "",
    dueDate: "",
    workdaysCount: "",
    diasPorSemana: "",
    diasSemana: [] as number[],
    diasRotativos: false,
    inTime: "",
    outTime: "",
    dailyRate: "",
    isReplacement: false,
  });

  const TIME_OPTIONS = (() => {
    const options = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 15) {
        const hh = h.toString().padStart(2, "0");
        const mm = m.toString().padStart(2, "0");
        const val = `${hh}:${mm}`;
        const ampm = h >= 12 ? "PM" : "AM";
        const h12 = h % 12 || 12;
        options.push({ value: val, label: `${h12}:${mm} ${ampm}` });
      }
    }
    return options;
  })();

  useEffect(() => {
    if (isOpen) {
      const loadData = async () => {
        setLoadingData(true);
        try {
          const [frames, cats, projs, usersRes] = await Promise.all([roleFrameAPI.list(), categoriaSatAPI.list(), projectsAPI.listAll(), usersAPI.list({ limit: 1000, metadataActivo: "true" })]);
          setRoleFrames(frames);
          setCategoriasSat(cats);
          setPlatformUsers(usersRes.users || []);

          // Filter projects by profile.projectIds (coordinator projects)
          let activeProjects = projs.filter((p) => p.status === "active");
          if (profile?.projectIds && profile.projectIds.length > 0) {
            activeProjects = activeProjects.filter((p) => profile.projectIds?.includes(p._id));
          }

          setProjects(activeProjects);
        } catch (error) {
          console.error("Error loading form data:", error);
        } finally {
          setLoadingData(false);
        }
      };
      loadData();
    }
  }, [isOpen, profile]);

  useEffect(() => {
    if (isOpen && editingUser) {
      const meta = editingUser.metadata || {};
      const [inTime, outTime] = (meta.schedule || " - ").split(" - ");
      setFormData({
        fullName: meta.fullName || `${editingUser.firstName} ${editingUser.lastName}`,
        projectIds: meta.projectIds || [],
        roleFrameId: meta.rolesFrameIds?.[0] || meta.roleFrameId || "",
        categoriaSatId: meta.categoriaSatId || "",
        startDate: meta.startDate || editingUser.hireDate?.split("T")[0] || "",
        dueDate: meta.dueDate || "",
        workdaysCount: meta.workdaysCount?.toString() || "",
        // Las solicitudes anteriores a este campo no traen días: se abren vacías y hay que
        // elegirlos, en vez de inventar una semana que nadie declaró.
        diasPorSemana: (meta as any).diasPorSemana?.toString() || "",
        diasSemana: Array.isArray((meta as any).diasSemana) ? ((meta as any).diasSemana as number[]) : [],
        diasRotativos: !!(meta as any).diasRotativos,
        inTime: inTime || "",
        outTime: outTime || "",
        dailyRate: meta.dailyRate?.toString() || "",
        isReplacement: meta.isReplacement || false,
      });
    } else if (isOpen && !editingUser) {
      setFormData({
        fullName: "",
        projectIds: [],
        roleFrameId: "",
        categoriaSatId: "",
        startDate: "",
        dueDate: "",
        workdaysCount: "",
        diasPorSemana: "",
        diasSemana: [],
        diasRotativos: false,
        inTime: "",
        outTime: "",
        dailyRate: "",
        isReplacement: false,
      });
      setUserSearchTerm("");
      setSelectedUser(null);
    }
  }, [isOpen, editingUser]);

  // Auto-select project if only one exists or when projects list changes
  useEffect(() => {
    if (projects.length > 0 && formData.projectIds.length === 0) {
      setFormData((prev) => ({ ...prev, projectIds: [projects[0]._id] }));
    }
  }, [projects, formData.projectIds.length]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: val }));
  };

  const handleSubmit = async () => {
    if (!formData.fullName || !formData.projectIds.length || !formData.roleFrameId || !formData.categoriaSatId) {
      sweetAlert.warning("Campos incompletos", "Por favor completa los campos obligatorios.");
      return;
    }

    setSubmitting(true);
    try {
      const timestamp = Date.now();
      const placeholderEmail = `solicitud_${timestamp}@pending.com`;
      const placeholderPassword = `pass_${timestamp}`;

      const submitData = {
        email: placeholderEmail,
        password: placeholderPassword,
        firstName: formData.fullName.split(" ")[0] || "Pendiente",
        lastName: formData.fullName.split(" ").slice(1).join(" ") || "Pendiente",
        isActive: false,
        hireDate: formData.startDate || new Date().toISOString(),
        metadata: {
          fullName: formData.fullName,
          projectIds: formData.projectIds,
          // Si el alta se pidió para alguien que YA es usuario, se guarda el vínculo: así la
          // solicitud se muestra dentro de su ficha en vez de crear una tarjeta duplicada. Si el
          // nombre se escribió a mano (persona que todavía no existe), queda vacío.
          solicitudUserId: selectedUser?._id || undefined,
          roles_frame: [formData.roleFrameId],
          categoriaSatId: formData.categoriaSatId,
          startDate: formData.startDate,
          dueDate: formData.dueDate,
          workdaysCount: Number(formData.workdaysCount),
          diasPorSemana: Number(formData.diasPorSemana) || undefined,
          diasSemana: formData.diasSemana,
          diasRotativos: formData.diasRotativos,
          schedule: `${formData.inTime} - ${formData.outTime}`,
          dailyRate: Number(formData.dailyRate),
          isReplacement: formData.isReplacement,
          isSolicitud: true,
        },
      };

      if (editingUser) {
        await usersAPI.update(editingUser._id, submitData as any);
        sweetAlert.success("Solicitud actualizada", "La solicitud de alta ha sido actualizada correctamente.");
      } else {
        await usersAPI.create(submitData as any);
        sweetAlert.success("Solicitud enviada", "La solicitud de alta ha sido enviada correctamente.");
      }
      onSuccess();
      onClose();
      setFormData({
        fullName: "",
        projectIds: [],
        roleFrameId: "",
        categoriaSatId: "",
        startDate: "",
        dueDate: "",
        workdaysCount: "",
        diasPorSemana: "",
        diasSemana: [],
        diasRotativos: false,
        inTime: "",
        outTime: "",
        dailyRate: "",
        isReplacement: false,
      });
    } catch (error: any) {
      const msg = error.response?.data?.error || "Error al enviar la solicitud";
      sweetAlert.error("Error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Solicitud de Alta de Usuario"
      size="lg"
      customHeader={
        <div className="flex flex-col flex-shrink-0 sticky top-0 z-50 shadow-sm border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="p-4 flex justify-between items-center ">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">{editingUser ? "Editar Solicitud" : "Solicitud de Alta"}</h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
            </button>
          </div>
        </div>
      }
      footer={
        <div className="flex w-full gap-3 p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0 sticky bottom-0 z-50">
          <button onClick={onClose} className="flex-1 rounded h-12 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={submitting} className="flex-1 rounded h-12 bg-blue-500 text-white font-medium shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? "Cargando..." : editingUser ? "Actualizar Solicitud" : "Enviar Solicitud"}
            <FontAwesomeIcon icon={faCheck} />
          </button>
        </div>
      }
    >
      <div className="p-4 space-y-6 overflow-y-auto max-h-[70vh]">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
            Clientes | Proyectos* (Selecciona uno o más)
          </label>
          <div className="grid grid-cols-1 gap-2 border dark:border-slate-800 rounded-xl p-3 max-h-48 overflow-y-auto bg-white/50 dark:bg-slate-900/50 min-h-[100px]">
            {loadingData ? (
              <div className="flex items-center justify-center h-full py-4">
                <LoadingSpinner message="Cargando datos..." />
              </div>
            ) : projects.length === 0 ? (
              <div className="flex items-center justify-center h-full py-4 text-slate-500 italic text-sm">No hay proyectos disponibles</div>
            ) : (
              projects.map((p) => {
                const isSelected = formData.projectIds.includes(p._id);
                return (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => {
                      if (isSelected) {
                        setFormData((prev) => ({ ...prev, projectIds: prev.projectIds.filter((id) => id !== p._id) }));
                      } else {
                        setFormData((prev) => ({ ...prev, projectIds: [...prev.projectIds, p._id] }));
                      }
                    }}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${isSelected ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400" : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 opacity-60"}`}
                  >
                    <div className={`w-5 h-5 rounded flex items-center justify-center border ${isSelected ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 dark:border-slate-600"}`}>{isSelected && <FontAwesomeIcon icon={faCheck} className="text-[10px]" />}</div>
                    <span className="text-sm font-medium">{typeof p.clientId === "object" && p.clientId.name ? `${p.clientId.name} | ${p.name}` : p.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-1 relative">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faSearch} className="text-blue-500 text-[10px]" />
            Buscar por Nombre o apellidos
          </label>
          <div className="flex gap-2 relative">
            <div className="relative flex-1 group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
                <FontAwesomeIcon icon={faSearch} className="text-sm" />
              </div>
              <input
                type="text"
                name="fullName"
                value={userSearchTerm}
                onChange={(e) => {
                  const val = e.target.value;
                  setUserSearchTerm(val);
                  setFormData((prev) => ({ ...prev, fullName: val }));
                  setShowUserResults(val.length > 0);
                  setSelectedUser(null);
                }}
                onFocus={() => {
                  if (userSearchTerm.length > 0) setShowUserResults(true);
                }}
                autoComplete="off"
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-11 pr-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white"
                placeholder="Nombre o apellidos"
              />
            </div>
            <button type="button" onClick={() => setShowRoleFilterMenu(true)} className={`px-4 py-3 rounded-xl border flex items-center gap-2 transition-all font-bold text-sm ${selectedRoleFilters.length > 0 ? "bg-blue-500 border-blue-500 text-white" : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"}`}>
              <FontAwesomeIcon icon={faFilter} className="text-xs" />
              Rol {selectedRoleFilters.length > 0 && `(${selectedRoleFilters.length})`}
            </button>

            {/* Role Filter Modal */}
            <Modal
              isOpen={showRoleFilterMenu}
              onClose={() => setShowRoleFilterMenu(false)}
              title="Filtrar por Rol"
              size="md"
              footer={
                <div className="flex w-full justify-between items-center p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-b-xl">
                  <button
                    onClick={() => {
                      setSelectedRoleFilters([]);
                      // No cerramos el modal al limpiar, para que el usuario pueda elegir otros si quiere
                    }}
                    className="text-red-500 hover:text-red-600 font-bold text-sm py-2 px-4 transition-colors"
                  >
                    Limpiar Filtros
                  </button>
                  <button onClick={() => setShowRoleFilterMenu(false)} className="bg-blue-500 text-white px-8 py-2.5 rounded-lg font-bold text-sm shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all">
                    Listo
                  </button>
                </div>
              }
            >
              <div className="p-6 space-y-6">
                <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">Selecciona uno o más roles para filtrar la lista de colaboradores.</p>
                <div className="space-y-1 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                  {roleFrames.map((rf) => {
                    const isSelected = selectedRoleFilters.includes(rf.name);
                    return (
                      <div key={rf._id} className="flex items-center justify-between py-4 border-b border-slate-100 dark:border-slate-800/50 last:border-0 group">
                        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200 group-hover:text-blue-500 transition-colors">{rf.name}</span>
                        <button
                          onClick={() => {
                            if (isSelected) setSelectedRoleFilters((prev) => prev.filter((r) => r !== rf.name));
                            else setSelectedRoleFilters((prev) => [...prev, rf.name]);
                          }}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all duration-300 focus:outline-none ${isSelected ? "bg-blue-500 shadow-inner" : "bg-slate-200 dark:bg-slate-700"}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-300 ${isSelected ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Modal>
          </div>

          <div className="relative">
            {showUserResults && (
              <div className="absolute z-[100] left-0 right-0 top-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto overflow-x-hidden divide-y divide-slate-100 dark:divide-slate-700">
                {(() => {
                  const filtered = platformUsers.filter((u) => {
                    const full = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
                    const search = userSearchTerm.toLowerCase();

                    // Name/email match
                    const matchesSearch = full.includes(search) || (u.email || "").toLowerCase().includes(search);

                    // Role filter match
                    const matchesRole = selectedRoleFilters.length === 0 || (u.externalInfo?.rolFrames || []).some((rf: string) => selectedRoleFilters.includes(rf)) || (u.metadata?.projects || []).some((p: any) => selectedRoleFilters.includes(p.nombre_rol_frame));

                    return matchesSearch && matchesRole;
                  });

                  if (filtered.length === 0) {
                    return <div className="px-4 py-3 text-xs text-slate-400 italic">Sin coincidencias (escribe para crear uno nuevo)</div>;
                  }

                  return filtered.slice(0, 10).map((user) => {
                    const userFullName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
                    return (
                      <button
                        key={user._id}
                        type="button"
                        onClick={() => {
                          const meta = user.metadata || {};
                          const projects = Array.isArray(meta.projects) ? meta.projects : [];

                          const externalRolFrames = user.externalInfo?.rolFrames || [];

                          // Collect all assigned role frame IDs and category IDs from project history
                          // Los roles frame de una persona pueden estar guardados con tres nombres
                          // distintos según cómo se creó el usuario. Si no se leen los tres, la
                          // solicitud arranca sin rol aunque la persona lo tenga cargado
                          // (`roles_frame` es el campo real del modelo, y era el que faltaba).
                          const assignedRoleFrameIds = new Set<string>();
                          [...(meta.roles_frame || []), ...(meta.rolesFrameIds || []), ...(meta.roleFrameId ? [meta.roleFrameId] : [])].forEach((rf: any) => {
                            const rfId = typeof rf === "string" ? rf : rf?._id;
                            if (rfId) assignedRoleFrameIds.add(String(rfId));
                          });

                          const assignedCategoriaSatIds = new Set<string>();
                          if (meta.categoriaSatId) assignedCategoriaSatIds.add(meta.categoriaSatId);

                          // Try to match external roles by name
                          externalRolFrames.forEach((rfName: string) => {
                            const match = roleFrames.find((rf) => rf.name === rfName);
                            if (match) assignedRoleFrameIds.add(match._id);
                          });

                          projects.forEach((proj: any) => {
                            const rfMatch = roleFrames.find((rf) => rf._id === proj.roleFrameId || rf.externalId === String(proj.rol_frame_id) || rf.name === proj.nombre_rol_frame);
                            if (rfMatch) assignedRoleFrameIds.add(rfMatch._id);

                            const catMatch = categoriasSat.find((cat) => cat._id === proj.categoriaSatId || cat.externalId === String(proj.categoria_sat_id) || cat.name === proj.nombre_categoria_sat);
                            if (catMatch) assignedCategoriaSatIds.add(catMatch._id);
                          });

                          // Convert sets to arrays for the selectedUser state
                          const roleFrameIds = Array.from(assignedRoleFrameIds);
                          const categoriaSatIds = Array.from(assignedCategoriaSatIds);

                          setFormData((prev) => ({
                            ...prev,
                            fullName: userFullName,
                            // Pre-select the first one if available
                            roleFrameId: roleFrameIds[0] || prev.roleFrameId,
                            categoriaSatId: categoriaSatIds[0] || prev.categoriaSatId,
                          }));
                          setUserSearchTerm(userFullName);
                          setSelectedUser({
                            ...user,
                            metadata: {
                              ...meta,
                              roleFrameIds,
                              categoriaSatIds,
                            },
                          });
                          setShowUserResults(false);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex flex-col"
                      >
                        <span className="font-bold text-sm text-slate-900 dark:text-white">{userFullName}</span>
                        <span className="text-xs text-slate-500">{user.email}</span>
                      </button>
                    );
                  });
                })()}
              </div>
            )}
          </div>
          {showUserResults && <div className="fixed inset-0 z-[90]" onClick={() => setShowUserResults(false)} />}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
              Rol/es Frame*
            </label>
            {/* El rol sale del que ya tiene la persona: si tiene uno solo se completa y se bloquea
                (no hay nada que elegir), y solo se habilita cuando tiene dos o más. Si el nombre se
                escribió a mano —persona que todavía no es usuario— se ofrecen todos. */}
            <select
              name="roleFrameId"
              value={formData.roleFrameId}
              onChange={handleChange}
              disabled={rolesDelUsuario.length === 1}
              title={rolesDelUsuario.length === 1 ? "La persona tiene un solo rol frame asignado" : undefined}
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <option value="">Selecciona rol</option>
              {roleFrames
                .filter((rf) => rolesDelUsuario.length === 0 || rolesDelUsuario.includes(rf._id))
                .map((rf) => (
                  <option key={rf._id} value={rf._id}>
                    {rf.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
              Categoría*
            </label>
            <select name="categoriaSatId" value={formData.categoriaSatId} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white">
              <option value="">Selecciona categoría</option>
              {(() => {
                const selectedRF = roleFrames.find((rf) => rf._id === formData.roleFrameId);
                const allowedExternalIds = (selectedRF?.data?.categoriasSat || []).map((c: any) => String(c.id || c));

                return categoriasSat
                  .filter((cat) => {
                    // 1. Must be allowed by the selected Role Frame (if one is selected)
                    const isAllowedByRole = !formData.roleFrameId || allowedExternalIds.includes(cat.externalId) || allowedExternalIds.includes(String(cat.data?.id));

                    // 2. Must be assigned to the user (if a platform user is selected)
                    const isAssignedToUser = !selectedUser?.metadata?.categoriaSatIds?.length || selectedUser.metadata.categoriaSatIds.includes(cat._id);

                    return isAllowedByRole && isAssignedToUser;
                  })
                  .map((cat) => (
                    <option key={cat._id} value={cat._id}>
                      {cat.data?.numeroCategoria ? `(${cat.data.numeroCategoria}) ` : ""}
                      {cat.name}
                    </option>
                  ));
              })()}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <CustomDatePicker label="Start Date" value={formData.startDate} onChange={(date) => setFormData((p) => ({ ...p, startDate: date }))} />
          </div>
          <div className="space-y-1">
            <CustomDatePicker label="Due Date" value={formData.dueDate} onChange={(date) => setFormData((p) => ({ ...p, dueDate: date }))} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Las jornadas TOTALES del contrato (22, 30…). Es lo que multiplica al sueldo por jornada,
              y NO es lo mismo que los días de la semana: son dos números distintos. */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cantidad de Jornadas</label>
            <input type="number" name="workdaysCount" value={formData.workdaysCount} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="Ej: 22" />
          </div>

          {/* Y los días de la SEMANA, con el mismo componente que el escritorio. */}
          <div className="md:col-span-3">
            <DiasDeTrabajo
              variante="mobile"
              jornadas={Number(formData.diasPorSemana) || 0}
              onJornadas={(n) => setFormData((p) => ({ ...p, diasPorSemana: n ? String(n) : "" }))}
              rotativos={formData.diasRotativos}
              onRotativos={(v) => setFormData((p) => ({ ...p, diasRotativos: v }))}
              dias={formData.diasSemana}
              onDias={(d) => setFormData((p) => ({ ...p, diasSemana: d }))}
              desde={formData.startDate}
              hasta={formData.dueDate}
              jornadasTotales={Number(formData.workdaysCount) || 0}
              onJornadasTotales={(n) => setFormData((p) => ({ ...p, workdaysCount: String(n) }))}
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faClock} className="text-blue-500 text-[10px]" />
              Horario (Entrada - Salida)*
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <select name="inTime" value={formData.inTime} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white appearance-none">
                  <option value="">Entrada</option>
                  {TIME_OPTIONS.map((opt) => (
                    <option key={`in-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <FontAwesomeIcon icon={faArrowRight} className="text-slate-400 text-xs" />
              <div className="relative flex-1">
                <select name="outTime" value={formData.outTime} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white appearance-none">
                  <option value="">Salida</option>
                  {TIME_OPTIONS.map((opt) => (
                    <option key={`out-${opt.value}`} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Importe por Jornada</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <FontAwesomeIcon icon={faMoneyBillWave} />
              </span>
              <input type="number" name="dailyRate" value={formData.dailyRate} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="0" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
              <FontAwesomeIcon icon={faExchangeAlt} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">Reemplazo?</p>
              <p className="text-xs text-slate-500">¿Esta persona reemplaza a alguien?</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" name="isReplacement" checked={formData.isReplacement} onChange={handleChange} className="sr-only peer" />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none dark:bg-slate-700 rounded-full transition-colors duration-200 ease-in-out peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
            <span className="ml-3 text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{formData.isReplacement ? "SÍ" : "NO"}</span>
          </label>
        </div>
      </div>
    </Modal>
  );
};

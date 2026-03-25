import React, { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faBriefcase, faClock, faMoneyBillWave, faExchangeAlt, faArrowRight } from "@fortawesome/free-solid-svg-icons";
import { usersAPI } from "../../../../api/users";
import { roleFrameAPI, RoleFrameItem } from "../../../../api/roleFrames";
import { categoriaSatAPI, CategoriaSatItem } from "../../../../api/categoriasSat";
import { sweetAlert } from "../utils/sweetAlert";
import { CustomDatePicker } from "./CustomDatePicker";
import { projectsAPI, Project } from "../../../../api/projects";
import { useProfile } from "../hooks/useProfile";

interface UserRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingUser?: any | null;
}

export const UserRegistrationModal: React.FC<UserRegistrationModalProps> = ({ isOpen, onClose, onSuccess, editingUser }) => {
  const { profile } = useProfile();
  const [submitting, setSubmitting] = useState(false);
  const [roleFrames, setRoleFrames] = useState<RoleFrameItem[]>([]);
  const [categoriasSat, setCategoriasSat] = useState<CategoriaSatItem[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [formData, setFormData] = useState({
    fullName: "",
    projectIds: [] as string[],
    roleFrameId: "",
    categoriaSatId: "",
    startDate: "",
    dueDate: "",
    workdaysCount: "",
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
        try {
          const [frames, cats, projs] = await Promise.all([
            roleFrameAPI.list(),
            categoriaSatAPI.list(),
            projectsAPI.listAll()
          ]);
          setRoleFrames(frames);
          setCategoriasSat(cats);
          
          // Filter projects by profile.projectIds (coordinator projects)
          let activeProjects = projs.filter(p => p.status === 'active');
          if (profile?.projectIds && profile.projectIds.length > 0) {
            activeProjects = activeProjects.filter(p => profile.projectIds?.includes(p._id));
          }
          
          setProjects(activeProjects);
        } catch (error) {
          console.error("Error loading form data:", error);
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
        roleFrameId: meta.roleFrameId || "",
        categoriaSatId: meta.categoriaSatId || "",
        startDate: meta.startDate || editingUser.hireDate?.split("T")[0] || "",
        dueDate: meta.dueDate || "",
        workdaysCount: meta.workdaysCount?.toString() || "",
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
        inTime: "",
        outTime: "",
        dailyRate: "",
        isReplacement: false,
      });
    }
  }, [isOpen, editingUser]);

  // Auto-select project if only one exists or when projects list changes
  useEffect(() => {
    if (projects.length > 0 && formData.projectIds.length === 0) {
      setFormData(prev => ({ ...prev, projectIds: [projects[0]._id] }));
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
          roleFrameId: formData.roleFrameId,
          categoriaSatId: formData.categoriaSatId,
          startDate: formData.startDate,
          dueDate: formData.dueDate,
          workdaysCount: Number(formData.workdaysCount),
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
            <h3 className="font-bold text-lg text-slate-900 dark:text-white">
              {editingUser ? "Editar Solicitud" : "Solicitud de Alta"}
            </h3>
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
          <div className="grid grid-cols-1 gap-2 border dark:border-slate-800 rounded-xl p-3 max-h-48 overflow-y-auto bg-white/50 dark:bg-slate-900/50">
            {projects.map((p) => {
              const isSelected = formData.projectIds.includes(p._id);
              return (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      setFormData(prev => ({ ...prev, projectIds: prev.projectIds.filter(id => id !== p._id) }));
                    } else {
                      setFormData(prev => ({ ...prev, projectIds: [...prev.projectIds, p._id] }));
                    }
                  }}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    isSelected 
                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-400" 
                      : "bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 opacity-60"
                  }`}
                >
                  <div className={`w-5 h-5 rounded flex items-center justify-center border ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                    {isSelected && <FontAwesomeIcon icon={faCheck} className="text-[10px]" />}
                  </div>
                  <span className="text-sm font-medium">
                    {typeof p.clientId === "object" && p.clientId.name ? `${p.clientId.name} | ${p.name}` : p.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <FontAwesomeIcon icon={faCheck} className="text-blue-500 text-[10px]" />
            Nombre Completo*
          </label>
          <input 
            name="fullName" 
            value={formData.fullName} 
            onChange={handleChange} 
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white" 
            placeholder="Ej: Juan Pérez" 
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
              Rol Frame*
            </label>
            <select 
              name="roleFrameId" 
              value={formData.roleFrameId} 
              onChange={handleChange} 
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white"
            >
              <option value="">Selecciona rol</option>
              {roleFrames.map((rf) => (
                <option key={rf._id} value={rf._id}>{rf.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
              Categoría SAT*
            </label>
            <select 
              name="categoriaSatId" 
              value={formData.categoriaSatId} 
              onChange={handleChange} 
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white"
            >
              <option value="">Selecciona categoría</option>
              {categoriasSat.map((cat) => (
                <option key={cat._id} value={cat._id}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <CustomDatePicker 
              label="Start Date" 
              value={formData.startDate} 
              onChange={(date) => setFormData((p) => ({ ...p, startDate: date }))} 
            />
          </div>
          <div className="space-y-1">
            <CustomDatePicker 
              label="Due Date" 
              value={formData.dueDate} 
              onChange={(date) => setFormData((p) => ({ ...p, dueDate: date }))} 
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Cantidad de Jornadas
            </label>
            <input 
              type="number"
              name="workdaysCount" 
              value={formData.workdaysCount} 
              onChange={handleChange} 
              className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" 
              placeholder="Ej: 5" 
            />
          </div>
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <FontAwesomeIcon icon={faClock} className="text-blue-500 text-[10px]" />
              Horario (Entrada - Salida)*
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <select
                  name="inTime"
                  value={formData.inTime}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white appearance-none"
                >
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
                <select
                  name="outTime"
                  value={formData.outTime}
                  onChange={handleChange}
                  className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white appearance-none"
                >
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
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Importe por Jornada
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                <FontAwesomeIcon icon={faMoneyBillWave} />
              </span>
              <input 
                type="number"
                name="dailyRate" 
                value={formData.dailyRate} 
                onChange={handleChange} 
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" 
                placeholder="0" 
              />
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
            <input 
              type="checkbox" 
              name="isReplacement"
              checked={formData.isReplacement} 
              onChange={handleChange}
              className="sr-only peer" 
            />
            <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none dark:bg-slate-700 rounded-full transition-colors duration-200 ease-in-out peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
            <span className="ml-3 text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              {formData.isReplacement ? "SÍ" : "NO"}
            </span>
          </label>
        </div>
      </div>
    </Modal>
  );
};

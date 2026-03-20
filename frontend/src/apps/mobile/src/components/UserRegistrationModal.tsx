import React, { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faUser, faHome, faCreditCard, faCheck, faTimes } from "@fortawesome/free-solid-svg-icons";
import { usersAPI } from "../../../../api/users";
import { roleFrameAPI, RoleFrameItem } from "../../../../api/roleFrames";
import { sweetAlert } from "../utils/sweetAlert";
import { CustomDatePicker } from "./CustomDatePicker";

interface UserRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const UserRegistrationModal: React.FC<UserRegistrationModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [roleFrames, setRoleFrames] = useState<RoleFrameItem[]>([]);

  const [formData, setFormData] = useState({
    // General
    firstName: "",
    lastName: "",
    email: "",
    cuil: "",
    password: "",
    confirmPassword: "",
    documentType: "DNI",
    documentNumber: "",
    birthDate: "",
    gender: "MASCULINO",
    educationLevel: "",
    nationality: "ARGENTINA",
    healthInsurance: "",
    roleFrameId: "",

    // Domicilio
    country: "ARGENTINA",
    locality: "",
    street: "",
    streetNumber: "",
    floorDepto: "",
    zipCode: "",
    phone: "",
    emergencyPhone: "",
    visa: false,

    // Datos Bancarios
    bank: "",
    accountType: "CAJA DE AHORRO",
    cbu: "",
    alias: "",
    accountNumber: "",
  });

  useEffect(() => {
    if (isOpen) {
      const loadData = async () => {
        try {
          const frames = await roleFrameAPI.list();
          setRoleFrames(frames);
        } catch (error) {
          console.error("Error loading role frames:", error);
        }
      };
      loadData();
    }
  }, [isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const val = type === "checkbox" ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev) => ({ ...prev, [name]: val }));
  };

  const steps = [
    { title: "General", icon: faUser },
    { title: "Domicilio", icon: faHome },
    { title: "Datos bancarios", icon: faCreditCard },
  ];

  const handleNext = () => {
    if (currentStep === 0) {
      // Validate step 1
      if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
        sweetAlert.warning("Campos incompletos", "Por favor completa los campos obligatorios.");
        return;
      }
      if (formData.password !== formData.confirmPassword) {
        sweetAlert.warning("Contraseñas", "Las contraseñas no coinciden.");
        return;
      }
    }
    setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const submitData = {
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
        isActive: true,
        hireDate: new Date().toISOString(), // Default to now as it's required
        metadata: {
          nombre: formData.firstName,
          apellido: formData.lastName,
          generoId: formData.gender === "MASCULINO" ? 1 : 2, // Map to IDs if known, or just string if backend allows
          documento: formData.documentNumber,
          cuit: formData.cuil,
          calle: formData.street,
          altura: formData.streetNumber,
          pisoDepto: formData.floorDepto,
          codigoPostal: formData.zipCode,
          localidad: formData.locality,
          telefono: formData.phone,
          telefono2: formData.emergencyPhone,
          visa: formData.visa,
          bancoId: 0, // Placeholder
          bancoReceptor: formData.bank,
          cbu: formData.cbu,
          tipoDeCuentaBancaria: formData.accountType,
          nroDeCuentaBancaria: formData.accountNumber,
          aliasBancario: formData.alias,
          fechaNac: formData.birthDate,
          // Extra metadata
          rol_frame_id: formData.roleFrameId,
        },
      };

      await usersAPI.create(submitData as any);
      sweetAlert.success("Usuario creado", "El usuario ha sido registrado correctamente.");
      onSuccess();
      onClose();
    } catch (error: any) {
      const msg = error.response?.data?.error || "Error al crear el usuario";
      sweetAlert.error("Error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-6">
            <h4 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Datos Generales</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Nombre*</label>
                <input name="firstName" value={formData.firstName} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="Nombre como figura en el DNI" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Apellido*</label>
                <input name="lastName" value={formData.lastName} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="Apellido como figura en el DNI" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Email*</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="Email" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Cuil*</label>
                <input name="cuil" value={formData.cuil} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="Cuil" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Contraseña*</label>
                <input type="password" name="password" value={formData.password} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="Mínimo 6 caracteres" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Repetir contraseña*</label>
                <input type="password" name="confirmPassword" value={formData.confirmPassword} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="Confirmar contraseña" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Tipo documento</label>
                <select name="documentType" value={formData.documentType} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium">
                  <option value="DNI">DNI</option>
                  <option value="PASAPORTE">PASAPORTE</option>
                  <option value="CUIL">CUIL</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Documento*</label>
                <input name="documentNumber" value={formData.documentNumber} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="Documento" />
              </div>
              <div className="space-y-1">
                <CustomDatePicker label="Fecha nacimiento*" value={formData.birthDate} onChange={(date) => setFormData((p) => ({ ...p, birthDate: date }))} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Genero</label>
                <select name="gender" value={formData.gender} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium">
                  <option value="MASCULINO">MASCULINO</option>
                  <option value="FEMENINO">FEMENINO</option>
                  <option value="OTRO">OTRO</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Nivel de estudio</label>
                <select name="educationLevel" value={formData.educationLevel} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium">
                  <option value="">Selecciona nivel</option>
                  <option value="SECUNDARIO">SECUNDARIO</option>
                  <option value="TERCIARIO">TERCIARIO</option>
                  <option value="UNIVERSITARIO">UNIVERSITARIO</option>
                  <option value="POSGRADO">POSGRADO</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Nacionalidad</label>
                <input name="nationality" value={formData.nationality} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="Nacionalidad" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Obra social</label>
                <input name="healthInsurance" value={formData.healthInsurance} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="Obra social" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Rol frame</label>
                <select name="roleFrameId" value={formData.roleFrameId} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium">
                  <option value="">Selecciona rol frame</option>
                  {roleFrames.map((rf) => (
                    <option key={rf._id} value={rf._id}>
                      {rf.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-6">
            <h4 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Domicilio</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Pais*</label>
                <input name="country" value={formData.country} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Localidad*</label>
                <input name="locality" value={formData.locality} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Calle*</label>
                <input name="street" value={formData.street} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Altura*</label>
                <input name="streetNumber" value={formData.streetNumber} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Piso / Depto</label>
                <input name="floorDepto" value={formData.floorDepto} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Codigo postal</label>
                <input name="zipCode" value={formData.zipCode} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Telefono*</label>
                <input name="phone" value={formData.phone} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Telefono de emergencia</label>
                <input name="emergencyPhone" value={formData.emergencyPhone} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" />
              </div>
              <div className="col-span-1 md:col-span-2 flex items-center gap-2 pt-2">
                <input type="checkbox" name="visa" checked={formData.visa} onChange={handleChange} className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary" />
                <label className="text-sm font-medium">Visa</label>
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-6">
            <h4 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Datos Bancarios</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Banco*</label>
                <input name="bank" value={formData.bank} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Tipo de cuenta*</label>
                <select name="accountType" value={formData.accountType} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium">
                  <option value="CAJA DE AHORRO">CAJA DE AHORRO</option>
                  <option value="CUENTA CORRIENTE">CUENTA CORRIENTE</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">CBU*</label>
                <input name="cbu" value={formData.cbu} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase">Alias*</label>
                <input name="alias" value={formData.alias} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="Alias" />
              </div>
              <div className="space-y-1 col-span-1 md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Nro. de cuenta*</label>
                <input name="accountNumber" value={formData.accountNumber} onChange={handleChange} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium" placeholder="Número de cuenta" />
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Alta de Usuarios"
      size="lg"
      customHeader={
        <div className="flex flex-col flex-shrink-0 sticky top-0 z-50 shadow-sm">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
            <h3 className="font-bold text-lg text-slate-900 dark:text-white transition-all duration-300">
              Alta de Usuarios <span className="text-blue-500 ml-1">{currentStep + 1}/3</span>
            </h3>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <FontAwesomeIcon icon={faTimes} className="text-slate-500 dark:text-slate-400" />
            </button>
          </div>
        </div>
      }
      footer={
        <div className="flex w-full gap-3 p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-shrink-0 sticky bottom-0 z-50">
          <button onClick={onClose} className="flex-1 rounded h-10 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
            Cancelar
          </button>
          {currentStep > 0 && (
            <button onClick={handleBack} className="flex-1 rounded h-10 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">
              Anterior
            </button>
          )}
          {currentStep < steps.length - 1 ? (
            <button onClick={handleNext} className="flex-1 rounded h-10 bg-blue-500 text-white font-medium shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              Siguiente
              <FontAwesomeIcon icon={faChevronRight} />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting} className="flex-1 rounded h-10 bg-blue-500 text-white font-medium shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {submitting ? "Registrando..." : "Registrar"}
              <FontAwesomeIcon icon={faCheck} />
            </button>
          )}
        </div>
      }
    >
      <div className="py-2">{renderStepContent()}</div>
    </Modal>
  );
};

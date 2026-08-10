import React, { useEffect, useRef, useState } from "react";
import { usersAPI, User } from "../../api/users";
import { rolesAPI, Role } from "../../api/roles";
import { roleFrameAPI, RoleFrameItem } from "../../api/roleFrames";
import { infoAPI, InfoItem } from "../../api/info";
import { InfoModal } from "../ui/InfoModal";
import { sweetAlert } from "../../utils/sweetAlert";
import { fuzzyMatch } from "../../utils/searchHelpers";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faUserShield, faEye, faEyeSlash, faToggleOn, faToggleOff, faMapMarkerAlt, faUniversity, faSearch, faTimes, faMobileAlt, faKey, faCheck, faXmark } from "@fortawesome/free-solid-svg-icons";

type ModalTab = "general" | "domicilio" | "bancarios";

interface UserFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  roles: string[];
  hireDate: string;
  extraVacationDays: number;
  clientIds: string[];
  isSolicitud?: boolean;
  // Metadata fields
  generoId?: number;
  tipoDocumentoId?: number;
  documento?: string;
  cuit?: string;
  estadoCivil?: string;
  calle?: string;
  altura?: string;
  pisoDepto?: string;
  codigoPostal?: string;
  localidad?: string;
  paisId?: number;
  nacionalidadId?: number;
  nivelEstudioId?: number;
  osId?: number;
  osPrepaga?: boolean;
  fechaNac?: string;
  telefono?: string;
  telefono2?: string;
  visa?: boolean;
  bancoId?: number;
  cbu?: string;
  tipoDeCuentaBancaria?: string;
  nroDeCuentaBancaria?: string;
  aliasBancario?: string;
  numeroLegajoTango?: string;
  afiliadoAlSindicato?: boolean;
  inHouse?: boolean;
  rolesFrameIds?: string[];
}

/** Largo mínimo de contraseña (el mismo que exigía el `minLength` del input). */
const PASSWORD_MIN = 6;

const emptyForm = (): UserFormData => ({
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  isActive: true,
  roles: [],
  hireDate: new Date().toISOString().split("T")[0],
  extraVacationDays: 0,
  clientIds: [],
  osPrepaga: false,
  visa: false,
  afiliadoAlSindicato: false,
  inHouse: false,
  rolesFrameIds: [],
});

export interface UserFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Usuario a editar / cambiar contraseña; null para alta */
  user: User | null;
  /** "edit" cubre alta y edición (distinguidas por `user`); "password" para cambio de contraseña */
  mode?: "edit" | "password";
  /** Se llama tras guardar con éxito (refrescar lista, cerrar, etc.) */
  onSaved?: () => void;
  /** z-index opcional para superponer sobre el navbar (host global) */
  zIndex?: number;
}

export const UserFormModal: React.FC<UserFormModalProps> = ({ isOpen, onClose, user, mode = "edit", onSaved, zIndex }) => {
  // Catálogos propios del modal
  const [roles, setRoles] = useState<Role[]>([]);
  const [allRoleFrames, setAllRoleFrames] = useState<RoleFrameItem[]>([]);
  const [genders, setGenders] = useState<InfoItem[]>([]);
  const [documentTypes, setDocumentTypes] = useState<InfoItem[]>([]);
  const [countries, setCountries] = useState<InfoItem[]>([]);
  const [nationalities, setNationalities] = useState<InfoItem[]>([]);
  const [educationLevels, setEducationLevels] = useState<InfoItem[]>([]);
  const [banks, setBanks] = useState<InfoItem[]>([]);
  const [insuranceCompanies, setInsuranceCompanies] = useState<InfoItem[]>([]);
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);

  // Estado del formulario
  const [formData, setFormData] = useState<UserFormData>(emptyForm());
  const [modalActiveTab, setModalActiveTab] = useState<ModalTab>("general");
  const [showPassword, setShowPassword] = useState(false);

  // Password mode
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [repetirPassword, setRepetirPassword] = useState("");
  // Validación en vivo: el botón Actualizar queda deshabilitado hasta que las dos condiciones se
  // cumplan, así el error se ve mientras se escribe y no después de mandar.
  const largoOk = newPassword.length >= PASSWORD_MIN;
  const passwordsCoinciden = !!newPassword && newPassword === repetirPassword;
  const passwordValida = largoOk && passwordsCoinciden;

  // Rol/es Frame search
  const [roleFrameSearch, setRoleFrameSearch] = useState("");

  // Para inicializar el form una sola vez por apertura
  const initializedRef = useRef(false);

  // ─────────── Carga lazy de catálogos (una vez, al abrir) ───────────
  useEffect(() => {
    if (!isOpen || catalogsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const [rolesRes, rf, g, dt, c, n, el, b, ic] = await Promise.all([
          rolesAPI.list({ limit: 100 }),
          roleFrameAPI.list(),
          infoAPI.listByType("genero"),
          infoAPI.listByType("tipo-documento"),
          infoAPI.listByType("pais"),
          infoAPI.listByType("nacionalidad"),
          infoAPI.listByType("nivel-estudio"),
          infoAPI.listByType("banco"),
          infoAPI.listByType("obra-social"),
        ]);
        if (cancelled) return;
        setRoles(rolesRes.roles);
        const rfArray = Array.isArray(rf) ? rf : (rf && Array.isArray((rf as any).data) ? (rf as any).data : []);
        setAllRoleFrames(rfArray);
        setGenders(g);
        setDocumentTypes(dt);
        setCountries(c);
        setNationalities(n);
        setEducationLevels(el);
        setBanks(b);
        setInsuranceCompanies(ic);
        setCatalogsLoaded(true);
      } catch (error) {
        console.error("Error cargando catálogos del formulario de usuario:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, catalogsLoaded]);

  // ─────────── Inicialización del formulario al abrir ───────────
  useEffect(() => {
    if (!isOpen) {
      initializedRef.current = false;
      setRoleFrameSearch("");
      return;
    }
    if (initializedRef.current) return;

    if (mode === "password") {
      initializedRef.current = true;
      setNewPassword("");
      setRepetirPassword("");
      setShowNewPassword(false);
      return;
    }

    // edit/create necesitan los catálogos (allRoleFrames para resolver rolesFrameIds, roles para defaults)
    if (!catalogsLoaded) return;
    initializedRef.current = true;
    setModalActiveTab("general");
    setShowPassword(false);

    if (user) {
      // ── Edición ──
      const isSolicitud = user.metadata?.isSolicitud;
      let hireDate = user.hireDate ? new Date(user.hireDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

      if (isSolicitud && user.metadata?.fullName && user.metadata.startDate) {
        hireDate = user.metadata.startDate;
      }

      setFormData({
        email: user.email.startsWith("solicitud_") ? "" : user.email,
        password: "",
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        isActive: user.metadata?.activo ?? true,
        roles: user.roles.map((r) => r._id),
        hireDate,
        extraVacationDays: user.extraVacationDays || 0,
        clientIds: user.clientIds ? user.clientIds.map((c) => c._id) : [],
        isSolicitud,
        generoId: user.metadata?.generoId,
        tipoDocumentoId: user.metadata?.tipoDocumentoId,
        documento: user.metadata?.documento,
        cuit: user.metadata?.cuit,
        estadoCivil: user.metadata?.estadoCivil || "",
        calle: user.metadata?.calle,
        altura: user.metadata?.altura,
        pisoDepto: user.metadata?.pisoDepto || "",
        codigoPostal: user.metadata?.codigoPostal || "",
        localidad: user.metadata?.localidad || "",
        paisId: user.metadata?.paisId,
        nacionalidadId: user.metadata?.nacionalidadId || user.metadata?.paisId,
        nivelEstudioId: user.metadata?.nivelEstudioId,
        osId: user.metadata?.osId,
        osPrepaga: user.metadata?.osPrepaga || false,
        fechaNac: user.metadata?.fechaNac ? new Date(user.metadata.fechaNac).toISOString().split("T")[0] : "",
        telefono: user.metadata?.telefono,
        telefono2: user.metadata?.telefono2 || "",
        visa: user.metadata?.visa || false,
        bancoId: user.metadata?.bancoId,
        cbu: user.metadata?.cbu || "",
        tipoDeCuentaBancaria: user.metadata?.tipoDeCuentaBancaria || "",
        nroDeCuentaBancaria: user.metadata?.nroDeCuentaBancaria || "",
        aliasBancario: user.metadata?.aliasBancario || "",
        numeroLegajoTango: user.metadata?.numeroLegajoTango || "",
        afiliadoAlSindicato: user.metadata?.afiliadoAlSindicato || false,
        inHouse: user.metadata?.inHouse || false,
        rolesFrameIds: (() => {
          const rawRf = user.metadata?.rolesFrameIds || (user.metadata as any)?.roles_frame || [];
          const rfArray = Array.isArray(rawRf) ? rawRf : [rawRf];

          const resolvedIds = new Set<string>();
          rfArray.forEach((rf: any) => {
            if (!rf) return;
            const id = typeof rf === "string" ? rf : rf._id;
            const name = typeof rf === "object" ? rf.name : null;

            let match = allRoleFrames.find((item) => item._id === id);
            if (!match && id) {
              match = allRoleFrames.find((item) => item.externalId === String(id) || String(item.data?.rol?.id) === String(id));
            }
            if (!match && name) {
              match = allRoleFrames.find((item) => item.name === name);
            }
            if (match) {
              resolvedIds.add(match._id);
            } else if (typeof id === "string" && id.length === 24) {
              resolvedIds.add(id);
            }
          });
          return Array.from(resolvedIds);
        })(),
      });
    } else {
      // ── Alta ──
      const defaultRole = roles.find((role) => role.isDefault);
      const mobileCollabRole = roles.find((role) => role.name.toLowerCase() === "mobile-colaborador");
      const defaultRolesSet = new Set<string>();
      if (defaultRole) defaultRolesSet.add(defaultRole._id);
      if (mobileCollabRole) defaultRolesSet.add(mobileCollabRole._id);

      setFormData({
        ...emptyForm(),
        roles: Array.from(defaultRolesSet),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user, mode, catalogsLoaded]);

  // ─────────── Submit ───────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const submitData: any = {
        email: formData.email,
        firstName: formData.firstName,
        lastName: formData.lastName,
        roles: formData.roles,
        hireDate: formData.hireDate,
        extraVacationDays: formData.extraVacationDays,
        clientIds: formData.clientIds,
        metadata: {
          ...(user?.metadata || {}),
          activo: formData.isActive,
          generoId: formData.generoId,
          tipoDocumentoId: formData.tipoDocumentoId,
          documento: formData.documento,
          cuit: formData.cuit,
          estadoCivil: formData.estadoCivil,
          calle: formData.calle,
          altura: formData.altura,
          pisoDepto: formData.pisoDepto,
          codigoPostal: formData.codigoPostal,
          localidad: formData.localidad,
          paisId: formData.paisId,
          nacionalidadId: formData.nacionalidadId,
          nivelEstudioId: formData.nivelEstudioId,
          osId: formData.osId,
          osPrepaga: formData.osPrepaga,
          fechaNac: formData.fechaNac,
          telefono: formData.telefono,
          telefono2: formData.telefono2,
          visa: formData.visa,
          bancoId: formData.bancoId,
          cbu: formData.cbu,
          tipoDeCuentaBancaria: formData.tipoDeCuentaBancaria,
          nroDeCuentaBancaria: formData.nroDeCuentaBancaria,
          aliasBancario: formData.aliasBancario,
          numeroLegajoTango: formData.numeroLegajoTango,
          afiliadoAlSindicato: formData.afiliadoAlSindicato,
          inHouse: formData.inHouse,
          roles_frame: formData.rolesFrameIds,
          rolesFrameIds: formData.rolesFrameIds,
        },
      };

      if (!user || formData.isSolicitud) {
        submitData.password = formData.password;
      }

      if (formData.isSolicitud) {
        submitData.metadata.isSolicitud = false;
        submitData.metadata.activo = formData.isActive;
      }

      if (user) {
        delete submitData.password;
        await usersAPI.update(user._id, submitData);
        sweetAlert.success(formData.isSolicitud ? "Solicitud Aprobada" : "Usuario actualizado", formData.isSolicitud ? "El usuario ha sido dado de alta correctamente" : "Los cambios se han guardado correctamente");
      } else {
        await usersAPI.create(submitData);
        sweetAlert.success("Usuario creado", "El usuario se ha creado correctamente");
      }
      onSaved?.();
      onClose();
    } catch (error: any) {
      const message = error.response?.data?.error || "Error al guardar el usuario";
      sweetAlert.error("Error", message);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    // Doble chequeo: el botón ya está deshabilitado, pero el form también se puede mandar con Enter.
    if (!passwordValida) {
      sweetAlert.error("Revisá la contraseña", `Tiene que tener al menos ${PASSWORD_MIN} caracteres y coincidir en los dos campos.`);
      return;
    }
    try {
      await usersAPI.updatePassword(user._id, newPassword);
      sweetAlert.success("Contraseña actualizada", "La contraseña se ha actualizado correctamente");
      onSaved?.();
      onClose();
    } catch (error: any) {
      const message = error.response?.data?.error || "Error al actualizar la contraseña";
      sweetAlert.error("Error", message);
    }
  };

  const title =
    mode === "password" ? (
      <span className="flex items-center gap-2">
        <FontAwesomeIcon icon={faKey} className="h-4 w-4 text-blue-500" />
        Cambiar contraseña
      </span>
    ) : formData.isSolicitud
        ? "Aprobar Solicitud de Alta"
        : user
          ? `Editar Usuario: ${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email
          : "Nuevo Usuario";

  // En "Cambiar contraseña" el subtítulo dice de QUIÉN es: el modal se abre desde la tarjeta de una
  // persona y antes no había forma de confirmar que era la correcta.
  const subtitle =
    mode === "password"
      ? user
        ? `${`${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email}${user.firstName || user.lastName ? ` · ${user.email}` : ""}`
        : undefined
      : formData.isSolicitud
        ? "Completa los datos para dar de alta al usuario"
        : "Define datos básicos y roles";

  const actions =
    mode === "password"
      ? [
          { label: "Actualizar", onClick: () => document.querySelector<HTMLFormElement>("#password-form")?.requestSubmit(), variant: "primary" as const, disabled: !passwordValida },
          { label: "Cancelar", onClick: onClose, variant: "ghost" as const },
        ]
      : [
          { label: formData.isSolicitud ? "Aprobar y Crear" : user ? "Actualizar" : "Crear", onClick: () => document.querySelector<HTMLFormElement>("#user-form")?.requestSubmit(), variant: "primary" as const },
          { label: "Cancelar", onClick: onClose, variant: "ghost" as const },
        ];

  return (
    <InfoModal isOpen={isOpen} onClose={onClose} title={title} subtitle={subtitle} size={mode === "password" ? "sm" : "lg"} actions={actions} zIndex={zIndex}>
      {mode === "password" ? (
        <form id="password-form" onSubmit={handlePasswordSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nueva contraseña <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="••••••••"
                  minLength={PASSWORD_MIN}
                  autoComplete="new-password"
                  autoFocus
                />
                <button type="button" onClick={() => setShowNewPassword((v) => !v)} title={showNewPassword ? "Ocultar" : "Mostrar"} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <FontAwesomeIcon icon={showNewPassword ? faEyeSlash : faEye} className="h-4 w-4 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Repetirla evita el error más caro de esta pantalla: dejar a alguien afuera por un
                typo, porque no hay forma de verificar la contraseña anterior. */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Repetir contraseña <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  required
                  value={repetirPassword}
                  onChange={(e) => setRepetirPassword(e.target.value)}
                  className={`input-field pr-10 ${repetirPassword && !passwordsCoinciden ? "border-red-400 dark:border-red-600" : ""}`}
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <ul className="space-y-1 text-xs">
              <li className={`flex items-center gap-1.5 ${largoOk ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"}`}>
                <FontAwesomeIcon icon={largoOk ? faCheck : faXmark} className="h-3 w-3" />
                Al menos {PASSWORD_MIN} caracteres
              </li>
              <li className={`flex items-center gap-1.5 ${repetirPassword ? (passwordsCoinciden ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400") : "text-gray-500 dark:text-gray-400"}`}>
                <FontAwesomeIcon icon={repetirPassword && passwordsCoinciden ? faCheck : faXmark} className="h-3 w-3" />
                Las dos contraseñas coinciden
              </li>
            </ul>

            <p className="text-[11px] text-gray-500 dark:text-gray-400">La persona va a poder entrar con esta contraseña de inmediato. No se le avisa por mail desde acá.</p>
          </div>
        </form>
      ) : (
        <form id="user-form" onSubmit={handleSubmit} className="flex flex-col h-[550px] -mx-6 -mb-6">
          {/* Tabs Header Sticky Container */}
          <div className="z-20 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm shrink-0">
            <div className="flex">
              <button type="button" onClick={() => setModalActiveTab("general")} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${modalActiveTab === "general" ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                <FontAwesomeIcon icon={faUser} className="text-xs" />
                General
              </button>
              <button type="button" onClick={() => setModalActiveTab("domicilio")} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${modalActiveTab === "domicilio" ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                <FontAwesomeIcon icon={faMapMarkerAlt} className="text-xs" />
                Domicilio
              </button>
              <button type="button" onClick={() => setModalActiveTab("bancarios")} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${modalActiveTab === "bancarios" ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                <FontAwesomeIcon icon={faUniversity} className="text-xs" />
                Datos Bancarios
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Tab Content */}
            {modalActiveTab === "general" && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre *</label>
                    <input type="text" required value={formData.firstName} onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))} className="input-field" placeholder="Ej: Juan" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Apellido *</label>
                    <input type="text" required value={formData.lastName} onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))} className="input-field" placeholder="Ej: Pérez" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Email *</label>
                    <input type="email" required value={formData.email} onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))} className="input-field" placeholder="usuario@ejemplo.com" />
                  </div>
                  {(!user || formData.isSolicitud) && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{formData.isSolicitud ? "Asignar Contraseña *" : "Contraseña *"}</label>
                      <div className="relative">
                        <input type={showPassword ? "text" : "password"} required value={formData.password} onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))} className="input-field pr-10" placeholder="••••••••" minLength={6} />
                        <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                          <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-4 w-4 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tipo de Documento</label>
                    <select value={formData.tipoDocumentoId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, tipoDocumentoId: parseInt(e.target.value) || undefined }))} className="input-field">
                      <option value="">Seleccionar...</option>
                      {documentTypes.map((it) => (
                        <option key={it._id} value={it.data.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Documento *</label>
                    <input type="text" required value={formData.documento || ""} onChange={(e) => setFormData((prev) => ({ ...prev, documento: e.target.value }))} className="input-field" placeholder="DNI / Pasaporte" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Fecha de Nacimiento</label>
                    <input type="date" value={formData.fechaNac || ""} onChange={(e) => setFormData((prev) => ({ ...prev, fechaNac: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nivel de Estudio</label>
                    <select value={formData.nivelEstudioId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, nivelEstudioId: parseInt(e.target.value) || undefined }))} className="input-field">
                      <option value="">Seleccionar...</option>
                      {educationLevels.map((it) => (
                        <option key={it._id} value={it.data.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">CUIT / CUIL</label>
                    <input type="text" value={formData.cuit || ""} onChange={(e) => setFormData((prev) => ({ ...prev, cuit: e.target.value }))} className="input-field" placeholder="20-XXXXXXXX-X" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nacionalidad</label>
                    <select value={formData.nacionalidadId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, nacionalidadId: parseInt(e.target.value) || undefined }))} className="input-field">
                      <option value="">Seleccionar...</option>
                      {(nationalities.length > 0 ? nationalities : countries).map((it) => (
                        <option key={it._id} value={it.data.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Género</label>
                    <select value={formData.generoId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, generoId: parseInt(e.target.value) || undefined }))} className="input-field">
                      <option value="">Seleccionar...</option>
                      {genders.map((it) => (
                        <option key={it._id} value={it.data.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Estado Civil</label>
                    <select value={formData.estadoCivil || ""} onChange={(e) => setFormData((prev) => ({ ...prev, estadoCivil: e.target.value }))} className="input-field">
                      <option value="">Seleccionar...</option>
                      <option value="Soltero">Soltero/a</option>
                      <option value="Casado">Casado/a</option>
                      <option value="Divorciado">Divorciado/a</option>
                      <option value="Viudo">Viudo/a</option>
                      <option value="Concuvino">Concubino/a</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-6 h-full pt-4">
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <div className={`w-10 h-6 flex items-center bg-gray-300 dark:bg-gray-700 rounded-full p-1 duration-300 ease-in-out ${formData.osPrepaga ? "bg-blue-500 dark:bg-blue-600" : ""}`}>
                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${formData.osPrepaga ? "translate-x-4" : ""}`}></div>
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">OS Prepaga</span>
                      <input type="checkbox" className="hidden" checked={formData.osPrepaga} onChange={(e) => setFormData((prev) => ({ ...prev, osPrepaga: e.target.checked }))} />
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <div className={`w-10 h-6 flex items-center bg-gray-300 dark:bg-gray-700 rounded-full p-1 duration-300 ease-in-out ${formData.inHouse ? "bg-blue-500 dark:bg-blue-600" : ""}`}>
                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${formData.inHouse ? "translate-x-4" : ""}`}></div>
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">In House</span>
                      <input type="checkbox" className="hidden" checked={formData.inHouse} onChange={(e) => setFormData((prev) => ({ ...prev, inHouse: e.target.checked }))} />
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Obra Social</label>
                    <select value={formData.osId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, osId: parseInt(e.target.value) || undefined }))} className="input-field">
                      <option value="">Seleccionar...</option>
                      {insuranceCompanies.map((it) => (
                        <option key={it._id} value={it.data.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Fecha de Ingreso *</label>
                    <input type="date" required value={formData.hireDate} onChange={(e) => setFormData((prev) => ({ ...prev, hireDate: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Vacaciones (Días Extra)</label>
                    <input type="number" min="0" value={formData.extraVacationDays} onChange={(e) => setFormData((prev) => ({ ...prev, extraVacationDays: parseInt(e.target.value) || 0 }))} className="input-field" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-4 mb-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">Rol/es Frame</label>
                    <div className="relative w-48 md:w-64">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <FontAwesomeIcon icon={faSearch} className="h-3 w-3 text-gray-400" />
                      </div>
                      <input type="text" value={roleFrameSearch} onChange={(e) => setRoleFrameSearch(e.target.value)} placeholder="Buscar especialidad..." className="w-full pl-9 pr-8 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none" />
                      {roleFrameSearch && (
                        <button type="button" onClick={() => setRoleFrameSearch("")} className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-900/30">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                      {allRoleFrames
                        .filter((rf) => fuzzyMatch(rf.name, roleFrameSearch))
                        .map((rf) => (
                          <label key={rf._id} className={`flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer ${formData.rolesFrameIds?.includes(rf._id) ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 ring-2 ring-blue-500/20" : "bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300"}`}>
                            <input
                              type="checkbox"
                              checked={formData.rolesFrameIds?.includes(rf._id)}
                              onChange={(e) => {
                                const newRF = e.target.checked ? [...(formData.rolesFrameIds || []), rf._id] : (formData.rolesFrameIds || []).filter((id) => id !== rf._id);
                                setFormData((prev) => ({ ...prev, rolesFrameIds: newRF }));
                              }}
                              className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4"
                            />
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{rf.name}</span>
                          </label>
                        ))}
                      {allRoleFrames.filter((rf) => fuzzyMatch(rf.name, roleFrameSearch)).length === 0 && <div className="col-span-full py-8 text-center text-xs text-gray-500 italic">No se encontraron especialidades que coincidan con "{roleFrameSearch}"</div>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Legajo Tango</label>
                    <input type="text" value={formData.numeroLegajoTango || ""} onChange={(e) => setFormData((prev) => ({ ...prev, numeroLegajoTango: e.target.value }))} className="input-field" placeholder="Ej: 01505" />
                  </div>
                  <div className="flex items-center pt-4">
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <div className={`w-10 h-6 flex items-center bg-gray-300 dark:bg-gray-700 rounded-full p-1 duration-300 ease-in-out ${formData.afiliadoAlSindicato ? "bg-blue-500 dark:bg-blue-600" : ""}`}>
                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${formData.afiliadoAlSindicato ? "translate-x-4" : ""}`}></div>
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Afiliado al Sindicato</span>
                      <input type="checkbox" className="hidden" checked={formData.afiliadoAlSindicato} onChange={(e) => setFormData((prev) => ({ ...prev, afiliadoAlSindicato: e.target.checked }))} />
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Roles de Sistema</label>
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50/50 dark:bg-gray-900/30 max-h-64 overflow-y-auto space-y-4">
                    <div>
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <FontAwesomeIcon icon={faUserShield} className="text-gray-300" />
                        Sistema
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {roles
                          .filter((r) => r.name.toLowerCase() !== "superadmin" && !r.name.toLowerCase().includes("mobile"))
                          .map((r) => (
                            <label key={r._id} className={`flex items-start space-x-3 p-3 rounded-lg border transition-all cursor-pointer ${formData.roles.includes(r._id) ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 ring-2 ring-blue-500/20" : "bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-200"}`}>
                              <input
                                type="checkbox"
                                checked={formData.roles.includes(r._id)}
                                onChange={(e) => {
                                  let newRoles = e.target.checked ? [...formData.roles, r._id] : formData.roles.filter((id) => id !== r._id);
                                  const name = r.name.toLowerCase();
                                  if (e.target.checked) {
                                    if (name === "admin") newRoles = newRoles.filter((id) => roles.find((ro) => ro._id === id)?.name.toLowerCase() !== "user");
                                    else if (name === "user") newRoles = newRoles.filter((id) => roles.find((ro) => ro._id === id)?.name.toLowerCase() !== "admin");
                                  }
                                  setFormData((prev) => ({ ...prev, roles: newRoles }));
                                }}
                                className="mt-0.5 rounded text-blue-500 focus:ring-blue-500"
                              />
                              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{r.name}</span>
                            </label>
                          ))}
                      </div>
                    </div>
                    {roles.some((r) => r.name.toLowerCase().includes("mobile")) && (
                      <div>
                        <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
                          <FontAwesomeIcon icon={faMobileAlt} className="text-indigo-300" />
                          Mobile (App)
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {roles
                            .filter((r) => r.name.toLowerCase().includes("mobile"))
                            .map((r) => (
                              <label key={r._id} className={`flex items-start space-x-3 p-3 rounded-lg border transition-all cursor-pointer ${formData.roles.includes(r._id) ? "bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800 ring-2 ring-indigo-500/20" : "bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-200"}`}>
                                <input
                                  type="checkbox"
                                  checked={formData.roles.includes(r._id)}
                                  onChange={(e) => {
                                    let newRoles = e.target.checked ? [...formData.roles, r._id] : formData.roles.filter((id) => id !== r._id);
                                    const name = r.name.toLowerCase();
                                    if (e.target.checked) {
                                      if (name.includes("coordinador"))
                                        newRoles = newRoles.filter((id) => !roles.find((ro) => ro._id === id)?.name.toLowerCase().includes("colaborador"));
                                      else if (name.includes("colaborador"))
                                        newRoles = newRoles.filter((id) => !roles.find((ro) => ro._id === id)?.name.toLowerCase().includes("coordinador"));
                                    } else {
                                      if (!newRoles.some((id) => roles.find((ro) => ro._id === id)?.name.toLowerCase().includes("mobile"))) {
                                        sweetAlert.warningAlert("Atención", "Debe tener al menos un rol Mobile.");
                                        return;
                                      }
                                    }
                                    setFormData((prev) => ({ ...prev, roles: newRoles }));
                                  }}
                                  className="mt-0.5 rounded text-indigo-500 focus:ring-indigo-500"
                                />
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{r.name}</span>
                              </label>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-gray-100 dark:border-gray-800">
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Estado de la cuenta</span>
                  <button type="button" onClick={() => setFormData((prev) => ({ ...prev, isActive: !prev.isActive }))} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${formData.isActive ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-gray-400 text-white shadow-lg shadow-gray-400/20"}`}>
                    <FontAwesomeIcon icon={formData.isActive ? faToggleOn : faToggleOff} className="text-base" />
                    {formData.isActive ? "Activo" : "Inactivo"}
                  </button>
                </div>
              </div>
            )}

            {modalActiveTab === "domicilio" && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">País</label>
                    <select value={formData.paisId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, paisId: parseInt(e.target.value) || undefined }))} className="input-field">
                      <option value="">Seleccionar...</option>
                      {countries.map((it) => (
                        <option key={it._id} value={it.data.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Localidad</label>
                    <input type="text" value={formData.localidad || ""} onChange={(e) => setFormData((prev) => ({ ...prev, localidad: e.target.value }))} className="input-field" placeholder="Ej: CABA" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Calle</label>
                    <input type="text" value={formData.calle || ""} onChange={(e) => setFormData((prev) => ({ ...prev, calle: e.target.value }))} className="input-field" placeholder="Ej: Av. Libertador" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Altura</label>
                      <input type="text" value={formData.altura || ""} onChange={(e) => setFormData((prev) => ({ ...prev, altura: e.target.value }))} className="input-field" placeholder="Ej: 1234" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Piso/Depto</label>
                      <input type="text" value={formData.pisoDepto || ""} onChange={(e) => setFormData((prev) => ({ ...prev, pisoDepto: e.target.value }))} className="input-field" placeholder="Ej: 4B" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Código Postal</label>
                    <input type="text" value={formData.codigoPostal || ""} onChange={(e) => setFormData((prev) => ({ ...prev, codigoPostal: e.target.value }))} className="input-field" placeholder="Ej: 1425" />
                  </div>
                  <div className="flex items-center pt-4">
                    <label className="flex items-center space-x-3 cursor-pointer group">
                      <div className={`w-10 h-6 flex items-center bg-gray-300 dark:bg-gray-700 rounded-full p-1 duration-300 ease-in-out ${formData.visa ? "bg-blue-500 dark:bg-blue-600" : ""}`}>
                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${formData.visa ? "translate-x-4" : ""}`}></div>
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Visa / Permiso de Trabajo</span>
                      <input type="checkbox" className="hidden" checked={formData.visa} onChange={(e) => setFormData((prev) => ({ ...prev, visa: e.target.checked }))} />
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Teléfono</label>
                    <input type="text" value={formData.telefono || ""} onChange={(e) => setFormData((prev) => ({ ...prev, telefono: e.target.value }))} className="input-field" placeholder="Ej: 11 1234-5678" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Teléfono de Emergencia</label>
                    <input type="text" value={formData.telefono2 || ""} onChange={(e) => setFormData((prev) => ({ ...prev, telefono2: e.target.value }))} className="input-field" placeholder="Ej: 11 8765-4321" />
                  </div>
                </div>
              </div>
            )}

            {modalActiveTab === "bancarios" && (
              <div className="space-y-6 animate-fadeIn">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Banco</label>
                    <select value={formData.bancoId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, bancoId: parseInt(e.target.value) || undefined }))} className="input-field">
                      <option value="">Seleccionar...</option>
                      {banks.map((it) => (
                        <option key={it._id} value={it.data.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">CBU / CVU</label>
                    <input type="text" value={formData.cbu || ""} onChange={(e) => setFormData((prev) => ({ ...prev, cbu: e.target.value }))} className="input-field" placeholder="22 dígitos" minLength={22} maxLength={22} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tipo de Cuenta</label>
                    <select value={formData.tipoDeCuentaBancaria || ""} onChange={(e) => setFormData((prev) => ({ ...prev, tipoDeCuentaBancaria: e.target.value }))} className="input-field">
                      <option value="">Seleccionar...</option>
                      <option value="Caja de ahorro $">Caja de ahorro $</option>
                      <option value="Cuenta Corriente $">Cuenta Corriente $</option>
                      <option value="Caja de ahorro u$s">Caja de ahorro u$s</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Número de Cuenta</label>
                    <input type="text" value={formData.nroDeCuentaBancaria || ""} onChange={(e) => setFormData((prev) => ({ ...prev, nroDeCuentaBancaria: e.target.value }))} className="input-field" placeholder="Ej: 347-333020/7" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Alias Bancario</label>
                  <input type="text" value={formData.aliasBancario || ""} onChange={(e) => setFormData((prev) => ({ ...prev, aliasBancario: e.target.value }))} className="input-field" placeholder="Ej: LUNES.MALETA.CUNA" />
                </div>
              </div>
            )}
          </div>
        </form>
      )}
    </InfoModal>
  );
};

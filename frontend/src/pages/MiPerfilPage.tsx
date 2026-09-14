import React, { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { usersAPI, User } from "../api/users";
import { roleFrameAPI, RoleFrameItem } from "../api/roleFrames";
import { infoAPI, InfoItem } from "../api/info";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../api/simpleCatalog";
import { PageLayout } from "../components/ui/PageLayout";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { sweetAlert } from "../utils/sweetAlert";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faIdCard, faUser, faMapMarkerAlt, faUniversity, faCheck, faXmark, faUserShield } from "@fortawesome/free-solid-svg-icons";

type ProfileTab = "general" | "domicilio" | "bancarios" | "sistema";

/** Campo de solo lectura: etiqueta arriba, texto plano debajo (sin recuadro de input). */
const Field: React.FC<{ label: string; value?: React.ReactNode; full?: boolean }> = ({ label, value, full }) => (
  <div className={`py-2 border-b border-gray-100 dark:border-gray-700/50 ${full ? "md:col-span-2" : ""}`}>
    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">{label}</label>
    <div className="text-sm text-gray-800 dark:text-gray-100 select-text">{value !== undefined && value !== null && value !== "" ? value : <span className="text-gray-400 italic">—</span>}</div>
  </div>
);

/** Indicador booleano de solo lectura (Sí / No). */
const BoolPill: React.FC<{ label: string; value?: boolean }> = ({ label, value }) => (
  <div>
    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{label}</label>
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider ${value ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"}`}>
      <FontAwesomeIcon icon={value ? faCheck : faXmark} />
      {value ? "Sí" : "No"}
    </div>
  </div>
);

const formatDate = (value?: string) => {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

export const MiPerfilPage: React.FC = () => {
  const authUser = useAuthStore((s) => s.user);

  const HELP_KEY = "miPerfil" as const;
  const helpEntry = getHelp(HELP_KEY);
  const [showInfo, setShowInfo] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>("general");

  // Catálogos para resolver IDs → nombres
  const [allRoleFrames, setAllRoleFrames] = useState<RoleFrameItem[]>([]);
  const [genders, setGenders] = useState<InfoItem[]>([]);
  const [documentTypes, setDocumentTypes] = useState<InfoItem[]>([]);
  const [countries, setCountries] = useState<InfoItem[]>([]);
  // País del DOMICILIO: ABM de Países de residencia (nacimiento y nacionalidad siguen con los de FRAME).
  const [paisesResidencia, setPaisesResidencia] = useState<SimpleCatalogItem[]>([]);
  const [nationalities, setNationalities] = useState<InfoItem[]>([]);
  const [educationLevels, setEducationLevels] = useState<InfoItem[]>([]);
  const [banks, setBanks] = useState<InfoItem[]>([]);

  useEffect(() => {
    if (!authUser?.id) {
      sweetAlert.error("Error", "No se pudo identificar al usuario actual.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [u, rf, g, dt, c, n, el, b] = await Promise.all([
          usersAPI.get(authUser.id),
          roleFrameAPI.list(),
          infoAPI.listByType("genero"),
          infoAPI.listByType("tipo-documento"),
          infoAPI.listByType("pais"),
          infoAPI.listByType("nacionalidad"),
          infoAPI.listByType("nivel-estudio"),
          infoAPI.listByType("banco"),
        ]);
        if (cancelled) return;
        setUser(u);
        const rfArray = Array.isArray(rf) ? rf : rf && Array.isArray((rf as any).data) ? (rf as any).data : [];
        setAllRoleFrames(rfArray);
        setGenders(g);
        setDocumentTypes(dt);
        setCountries(c);
        setNationalities(n);
        setEducationLevels(el);
        setBanks(b);
        // Aparte y con su catch: es nuevo, y si no responde el país se resuelve con los de FRAME (mismos ids).
        void createSimpleCatalogApi("/paises-residencia")
          .list()
          .then((pr) => !cancelled && setPaisesResidencia(Array.isArray(pr) ? pr : []))
          .catch(() => undefined);
      } catch (error: any) {
        if (!cancelled) {
          const message = error.response?.data?.error || "No se pudo cargar tu perfil.";
          sweetAlert.error("Error", message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);

  // Helper: resolver un id numérico contra un catálogo InfoItem (data.id)
  const nameFromInfo = (list: InfoItem[], id?: number) => {
    if (id === undefined || id === null) return "";
    return list.find((it) => it.data?.id === id)?.name || "";
  };


  const md = user?.metadata;

  const roleNames = useMemo(() => (user?.roles || []).map((r) => r.name).filter(Boolean), [user?.roles]);

  const roleFrameNames = useMemo(() => {
    const raw = (md?.rolesFrameIds as any) || (md as any)?.roles_frame || [];
    const arr = Array.isArray(raw) ? raw : [raw];
    const names: string[] = [];
    arr.forEach((rf: any) => {
      if (!rf) return;
      if (typeof rf === "object" && rf.name) {
        names.push(rf.name);
        return;
      }
      const id = typeof rf === "string" ? rf : rf?._id;
      const match = allRoleFrames.find((item) => item._id === id || item.externalId === String(id) || String(item.data?.rol?.id) === String(id));
      if (match) names.push(match.name);
    });
    return [...new Set(names)];
  }, [md, allRoleFrames]);

  if (loading) {
    return (
      <div className="lg:pl-sidebar min-h-screen flex items-center justify-center">
        <LoadingSpinner message="Cargando tu perfil..." />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="lg:pl-sidebar min-h-screen flex items-center justify-center">
        <p className="text-gray-500">No se pudo cargar tu perfil.</p>
      </div>
    );
  }

  const displayName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;

  const tabs: { key: ProfileTab; label: string; icon: any }[] = [
    { key: "general", label: "Personales", icon: faUser },
    { key: "domicilio", label: "Domicilio", icon: faMapMarkerAlt },
    { key: "bancarios", label: "Bancarios", icon: faUniversity },
    { key: "sistema", label: "Sistema", icon: faUserShield },
  ];

  return (
    <PageLayout title="Mi Perfil" subtitle="Visualización de tus datos personales (solo lectura)" faIcon={{ icon: faIdCard }} shouldShowInfo={hasHelp(HELP_KEY)} infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: helpEntry.title, size: helpEntry.size, content: helpEntry.content }}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Encabezado con nombre y roles */}
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
          <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">{displayName}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">{user.email}</p>
          {roleNames.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {roleNames.map((rn) => (
                <span key={rn} className="inline-flex items-center px-3 py-1 rounded text-xs font-semibold bg-primary-100 text-primary-800 dark:bg-blue-900/30 dark:text-primary-300 capitalize">
                  {rn}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex">
            {tabs.map((t) => (
              <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === t.key ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                <FontAwesomeIcon icon={t.icon} className="text-xs" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/*
          POR QUÉ ESTA PANTALLA NO SE EDITA.

          Los datos personales se cambian por el circuito de PEDIDOS —categoría «datos personales»,
          que al aprobarse aplica el cambio sobre el usuario (`utils/personalDataFields.ts`)—, y ese
          formulario hoy vive solo en la app. Agregar edición directa acá dejaría sin efecto ese
          circuito, incluida la confirmación de cambio de cuenta bancaria que el modelo ya contempla
          (`solicitaCambioCuenta` / `cambioCuentaConfirmada`): sin ella, cualquiera podría redirigir
          su cobro sin que nadie lo apruebe.

          Se dice acá en vez de dejar la pantalla muda: sin este aviso, «no puedo editar mis datos»
          se lee como que falta una función, no como una decisión.
        */}
        <div className="px-6 pt-4">
          <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4">
            <p className="text-sm text-blue-900 dark:text-blue-200">
              <strong>Estos datos se ven desde acá, pero se cambian desde la app.</strong> Entrá a <strong>Pedidos → Datos personales</strong> en WeProdu Mobile y pedí la
              modificación: queda registrada y la aprueba quien administra.
            </p>
            <p className="text-xs text-blue-800 dark:text-blue-300 mt-2">
              Nombre, apellido, tipo y número de documento y CUIT/CUIL no se modifican por ningún camino: salen del padrón de ARCA y se
              confirman contra él.
            </p>
          </div>
        </div>

        {/* Contenido */}
        <div className="p-6">
          {activeTab === "general" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Nombre" value={user.firstName} />
                <Field label="Apellido" value={user.lastName} />
                <Field label="Email" value={user.email} />
                <Field label="Tipo de Documento" value={nameFromInfo(documentTypes, md?.tipoDocumentoId)} />
                <Field label="Documento" value={md?.documento} />
                <Field label="Fecha de Nacimiento" value={formatDate(md?.fechaNac)} />
                <Field label="Nivel de Estudio" value={nameFromInfo(educationLevels, md?.nivelEstudioId)} />
                <Field label="CUIT / CUIL" value={md?.cuit} />
                <Field label="Nacionalidad" value={nameFromInfo(nationalities.length > 0 ? nationalities : countries, md?.nacionalidadId)} />
                <Field label="Género" value={nameFromInfo(genders, md?.generoId)} />
                <Field label="Estado Civil" value={md?.estadoCivil} />
                {/* La obra social ya no es un dato de la persona: se declara en cada contrato y se
                    constata contra el padrón de la SSS. Mostrarla acá volvería a sugerir que hay una
                    sola y que este es su lugar. */}
              </div>

              {/* «OS Prepaga» ya no se muestra: quedó deprecado junto con el resto de la obra social
                  como dato de la persona —se declara por contrato y se constata contra el padrón de
                  la SSS—. Ver el comentario de más arriba. */}

            </div>
          )}

          {activeTab === "domicilio" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
              <Field label="País" value={paisesResidencia.find((p) => p.data?.id === md?.paisId)?.name || nameFromInfo(countries, md?.paisId)} />
              <Field label="Localidad" value={md?.localidad} />
              <Field label="Calle" value={md?.calle} />
              <Field label="Altura" value={md?.altura} />
              <Field label="Piso/Depto" value={md?.pisoDepto} />
              <Field label="Código Postal" value={md?.codigoPostal} />
              <Field label="Teléfono" value={md?.telefono} />
            </div>
          )}

          {activeTab === "bancarios" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
              <Field label="Banco" value={nameFromInfo(banks, md?.bancoId)} />
              <Field label="CBU / CVU" value={md?.cbu} />
              <Field label="Tipo de Cuenta" value={md?.tipoDeCuentaBancaria} />
              <Field label="Número de Cuenta" value={md?.nroDeCuentaBancaria} />
              <Field label="Alias Bancario" value={md?.aliasBancario} full />
            </div>
          )}

          {/* Las mismas secciones que la pestaña Sistema del formulario y del detalle de usuario:
              lo del VÍNCULO con la empresa, separado de quién es la persona. */}
          {activeTab === "sistema" && (
            <div className="space-y-6 animate-fadeIn">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Fecha de Ingreso" value={formatDate(user.hireDate)} />
                <Field label="Vacaciones (Días Extra)" value={user.extraVacationDays ?? 0} />
                <Field label="Legajo Tango" value={(md as any)?.numeroLegajoTango} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <BoolPill label="In House" value={(md as any)?.inHouse} />
                <BoolPill label="Afiliado al Sindicato" value={(md as any)?.afiliadoAlSindicato} />
                <BoolPill label="Cuenta Activa" value={md?.activo ?? true} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Rol/es Frame</label>
                {roleFrameNames.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {roleFrameNames.map((n) => (
                      <span key={n} className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800">
                        {n}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400 italic text-sm">Sin roles Frame asignados</span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Roles de Sistema</label>
                {roleNames.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {roleNames.map((n) => (
                      <span key={n} className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 capitalize">
                        {n}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400 italic text-sm">Sin roles de sistema</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
};

import React, { useEffect, useRef, useState } from "react";
import { usersAPI, User } from "../../api/users";
import { rolesAPI, Role } from "../../api/roles";
import { roleFrameAPI, RoleFrameItem } from "../../api/roleFrames";
import { infoAPI, InfoItem } from "../../api/info";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../../api/simpleCatalog";
import { InfoModal } from "../ui/InfoModal";
import { CuitInput, isValidCuit } from "../ui/CuitInput";
import { Modal } from "../ui/Modal";
import { BloqueEstado } from "../ui/BloqueEstado";
import { sweetAlert } from "../../utils/sweetAlert";
import { afipAPI } from "../../api/afip";
import { cuitEsValido } from "../../utils/cuit";
import { generarPassword } from "../../utils/password";
import { mensajeErrorArca } from "../../utils/errorArca";
import { fuzzyMatch } from "../../utils/searchHelpers";
import { esNacionalidadArgentina, tiposDocumentoParaNacionalidad, tipoDocumentoSigueValido, opcionArgentina, esCuilObligatorio, opcionesDeNacionalidad, valorDeNacionalidad, leerNacionalidadElegida } from "../../utils/nacionalidadDocumento";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faUserShield, faEye, faEyeSlash, faMapMarkerAlt, faUniversity, faSearch, faTimes, faMobileAlt, faKey, faCheck, faXmark, faCircleInfo, faSpinner, faLandmark, faCircleCheck, faWandMagicSparkles, faPlus } from "@fortawesome/free-solid-svg-icons";

type ModalTab = "general" | "domicilio" | "bancarios" | "sistema";

/**
 * El orden de las pestañas, en un solo lugar.
 *
 * Lo usa el «Siguiente» del alta para saber a cuál ir. Antes era un ternario encadenado
 * (`general ? domicilio : bancarios`), que con una pestaña más habría que anidar otra vez y ya no
 * diría cuál es el orden de un vistazo.
 */
const ORDEN_TABS: ModalTab[] = ["general", "domicilio", "bancarios", "sistema"];

const sindicatosApi = createSimpleCatalogApi("/sindicatos");

/**
 * El [+] que abre el selector de un campo de elección múltiple.
 *
 * Mismo estilo que el «nuevo» del encabezado de Usuarios —azul, cuadrado, solo el ícono— para que
 * «agregar» se vea igual en toda la pantalla. Vive en la CABECERA del bloque y no entre los badges:
 * ahí no se mueve de lugar a medida que se eligen cosas, así que se puede volver a apretar sin
 * buscarlo.
 */
const BotonAgregar: React.FC<{ onClick: () => void; title: string }> = ({ onClick, title }) => (
  <button
    type="button"
    onClick={onClick}
    /*
      SIN `title`, a propósito: el tooltip nativo se dibuja arriba y a la izquierda del cursor, y acá
      eso cae justo sobre el nombre del campo y su ⓘ, tapándolos. No hay forma de reposicionarlo.
      El `aria-label` queda para los lectores de pantalla, que es lo que el `title` aportaba de más:
      un [+] pegado al nombre del bloque ya dice qué agrega.
    */
    aria-label={title}
    className="inline-flex items-center justify-center px-1.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors normal-case tracking-normal font-normal"
  >
    <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
  </button>
);

/**
 * Cómo se muestra un sindicato en la lista: "SIGLA — Nombre".
 *
 * La sigla adelante porque es como se los nombra en la práctica (nadie dice "Sindicato Argentino de
 * Televisión"), pero sin tapar el nombre: dos gremios distintos pueden tener siglas parecidas y la
 * sigla sola no alcanza para elegir bien. Si el registro no tiene sigla, queda solo el nombre.
 */
const nombreSindicato = (s: SimpleCatalogItem): string => {
  const sigla = typeof s.sigla === "string" ? s.sigla.trim() : "";
  return sigla ? `${sigla} — ${s.name}` : s.name;
};

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
  /** Argentino/a por naturalización: ver `esCuilObligatorio`. Solo aplica si nacionalidadId es Argentina. */
  nacionalizado?: boolean;
  /** Solo si `nacionalizado`: un nativo nació acá, no hace falta preguntarlo. */
  paisNacimientoId?: number;
  nivelEstudioId?: number;
  fechaNac?: string;
  telefono?: string;
  bancoId?: number;
  cbu?: string;
  tipoDeCuentaBancaria?: string;
  nroDeCuentaBancaria?: string;
  aliasBancario?: string;
  numeroLegajoTango?: string;
  afiliadoAlSindicato?: boolean;
  /** A qué sindicato/s. Solo con `afiliadoAlSindicato`; se vacía al apagarlo. */
  sindicatoIds?: string[];
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
  nacionalizado: false,
  afiliadoAlSindicato: false,
  sindicatoIds: [],
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

/**
 * Proyectos donde esta persona figura como coordinadora de algún área/turno.
 *
 * La asignación vive en `Project.coordinatorAssignments`, que llega poblado dentro de
 * `metadata.projects[].projectId`. Es la fuente real: el rol Mobile-Coordinador es el permiso para
 * usar la app como coordinador, pero lo que lo hace obligatorio es tener turnos a cargo.
 */
const proyectosQueCoordina = (u: User | null): string[] => {
  const nombres = new Set<string>();
  for (const up of ((u as any)?.metadata?.projects || []) as any[]) {
    const proj = typeof up?.projectId === "object" ? up.projectId : null;
    if (!proj?.coordinatorAssignments) continue;
    const suyo = proj.coordinatorAssignments.some((asm: any) => String(typeof asm.userId === "object" ? asm.userId?._id : asm.userId) === String(u?._id));
    if (suyo) nombres.add(proj.name || up.nombre_proyecto || "Proyecto sin nombre");
  }
  return [...nombres];
};

export const UserFormModal: React.FC<UserFormModalProps> = ({ isOpen, onClose, user, mode = "edit", onSaved, zIndex }) => {
  /*
    Si coordina turnos, el rol Mobile-Coordinador queda fijo.

    Sacárselo lo dejaría con áreas y turnos a cargo pero sin poder entrar a la app como coordinador:
    esas novedades no las carga nadie y aparecen como vencidas en Cumplimiento, sin ninguna señal de
    por qué. Para cambiarle el rol hay que liberarlo antes desde el equipo del proyecto.
  */
  /*
    Traer de ARCA nombre, apellido y DNI a partir del CUIT.

    Escribir a mano el nombre de alguien que después hay que confirmar contra el organismo es hacer
    dos veces el mismo trabajo, y el 90% de los renombres masivos son tipeos de esta pantalla. El DNI
    ni siquiera se consulta: en una persona física el CUIT ES el DNI con prefijo y verificador.
  */
  const [consultandoPadron, setConsultandoPadron] = useState(false);
  const [validadoEnArca, setValidadoEnArca] = useState(false);
  /**
   * Se consulto el padron y contesto que el CUIT esta INACTIVO.
   *
   * Es distinto de validado —no hay sello, ARCA no devolvio ningun dato— y distinto de no haber
   * consultado: se consulto, contesto, y lo que contesto no frena el alta. Sin este tercer estado,
   * el unico camino era bloquear para siempre o dar por validado algo que nadie confirmo.
   */
  const [inactivoEnArca, setInactivoEnArca] = useState(false);

  const traerDeArca = async () => {
    const cuit = String(formData.cuit || "").replace(/\D/g, "");
    if (!cuitEsValido(cuit)) {
      sweetAlert.error("CUIT inválido", "Revisá los dígitos: con un CUIT que no pasa el verificador, ARCA solo devuelve error.");
      return;
    }
    setConsultandoPadron(true);
    try {
      const r = await afipAPI.consultarPadron(cuit);
      /*
        Si ese CUIT ya tiene ficha, no se sigue.

        Se corta acá y no al guardar: para cuando el servidor rechaza el alta por duplicado, quien la
        estaba cargando ya completó tres pestañas. Y el mensaje dice a nombre de quién está, que es lo
        que hace falta para ir a buscarlo en vez de insistir.
      */
      if (r.yaExiste && !user) {
        sweetAlert.error("CUIT ya registrado", `Ese CUIT ya figura a nombre de ${r.yaExiste.nombre}${r.yaExiste.email ? ` (${r.yaExiste.email})` : ""}.\n\nBuscá esa ficha en el listado, o revisá el número si esperabas otra persona.`);
        return;
      }
      const tipoDni = tiposDocumentoDisponibles.find((it: any) => /dni/i.test(it.name));
      /*
        CUIT INACTIVO: se avisa y se sigue. No es un CUIT equivocado.

        ARCA contesta el inactivo con un fault que NO trae nombre, apellido ni documento, así que no
        hay nada que traer y el alta no queda sellada. Lo que no corresponde es frenarla: la persona
        existe y puede tener que firmar igual; que su CUIT esté dado de baja es un trámite suyo ante
        el organismo, no algo que se arregle en esta pantalla.

        Se completa SOLO el documento, y no porque lo haya dicho ARCA: son los ocho dígitos del medio
        del propio CUIT. El nombre y el apellido los carga quien está dando el alta.
      */
      if (r.estado === "inactivo") {
        setInactivoEnArca(true);
        setFormData((prev) => ({
          ...prev,
          documento: r.documento || prev.documento,
          tipoDocumentoId: tipoDni ? tipoDni.data.id : prev.tipoDocumentoId,
        }));
        sweetAlert.warningAlert("El CUIT existe, pero figura INACTIVO en ARCA", "El número está bien: lo que pasa es que ese CUIT está dado de baja en el organismo, y el Padrón —que es lo que consulta este botón— no devuelve el nombre de un CUIT inactivo.\n\nEl alta se puede hacer igual: cargá nombre y apellido a mano por ahora. La ficha queda SIN el sello de validada, y el nombre se corrige solo la primera vez que esta persona pase por «Validar obras sociales»: esa pantalla de ARCA sí lo muestra, aunque el CUIT esté de baja.");
        return;
      }
      if (!r.nombre || !r.apellido) {
        sweetAlert.warningAlert("Es una persona jurídica", `ARCA devolvió «${r.denominacion}». Este formulario es para personas: no hay nombre y apellido para separar.`);
        return;
      }
      setFormData((prev) => ({
        ...prev,
        firstName: r.nombre,
        lastName: r.apellido,
        documento: r.documento || prev.documento,
        tipoDocumentoId: tipoDni ? tipoDni.data.id : prev.tipoDocumentoId,
      }));
      setValidadoEnArca(true);
      sweetAlert.success("Datos traídos de ARCA", `${r.nombre} ${r.apellido}${r.documento ? ` · DNI ${r.documento}` : ""}`);
    } catch (e: any) {
      const m = mensajeErrorArca(e?.response?.status, e?.response?.data);
      sweetAlert.error(m.titulo, m.detalle);
    } finally {
      setConsultandoPadron(false);
    }
  };

  const coordinaEn = proyectosQueCoordina(user);
  const coordinacionBloqueada = coordinaEn.length > 0;

  // Catálogos propios del modal
  const [roles, setRoles] = useState<Role[]>([]);
  const [allRoleFrames, setAllRoleFrames] = useState<RoleFrameItem[]>([]);
  const [genders, setGenders] = useState<InfoItem[]>([]);
  const [documentTypes, setDocumentTypes] = useState<InfoItem[]>([]);
  const [countries, setCountries] = useState<InfoItem[]>([]);
  const [nationalities, setNationalities] = useState<InfoItem[]>([]);
  const [educationLevels, setEducationLevels] = useState<InfoItem[]>([]);
  const [banks, setBanks] = useState<InfoItem[]>([]);
  const [sindicatos, setSindicatos] = useState<SimpleCatalogItem[]>([]);
  // El catálogo de obras sociales ya no se carga acá: el campo se mudó al contrato.
  const [catalogsLoaded, setCatalogsLoaded] = useState(false);

  // Estado del formulario
  const [formData, setFormData] = useState<UserFormData>(emptyForm());
  /** Un CBU argentino tiene exactamente 22 dígitos. */
  const CBU_DIGITOS = 22;
  /** Se queda con los dígitos: el CBU no lleva puntos, guiones ni espacios. */
  const soloDigitos = (v: string) => String(v || "").replace(/[^0-9]/g, "");

  const [modalActiveTab, setModalActiveTab] = useState<ModalTab>("general");
  /** Solo para extranjeros: si declaró tener CUIL. Los argentinos siempre lo llevan. */
  const [tieneCuil, setTieneCuil] = useState(true);
  /** Explicación del circuito "Sin CUIT" de Contratos (modal del ⓘ al lado del CUIT/CUIL). */
  const [sinCuitInfoOpen, setSinCuitInfoOpen] = useState(false);
  const [vacacionesInfoOpen, setVacacionesInfoOpen] = useState(false);
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

  // Rol/es Empresa search
  const [roleFrameSearch, setRoleFrameSearch] = useState("");
  const [rolesEmpresaInfoOpen, setRolesEmpresaInfoOpen] = useState(false);
  const [rolesEmpresaOpen, setRolesEmpresaOpen] = useState(false);
  const [sindicatoOpen, setSindicatoOpen] = useState(false);
  const [sindicatoSearch, setSindicatoSearch] = useState("");

  // Para inicializar el form una sola vez por apertura
  const initializedRef = useRef(false);

  // ─────────── Carga lazy de catálogos (una vez, al abrir) ───────────
  useEffect(() => {
    if (!isOpen || catalogsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        /*
          Sindicatos va con su propio catch y no seco como los demás: `Promise.all` es todo o nada, y
          este catálogo es el único que puede no existir del otro lado —es nuevo, y el VPS corre el
          dist commiteado—. Sin el catch, un 404 suyo dejaría el formulario entero sin nacionalidades,
          sin bancos y sin tipos de documento. Que falte la lista de gremios vacía un solo select.
        */
        const [rolesRes, rf, g, dt, c, n, el, b, sind] = await Promise.all([rolesAPI.list({ limit: 100 }), roleFrameAPI.list(), infoAPI.listByType("genero"), infoAPI.listByType("tipo-documento"), infoAPI.listByType("pais"), infoAPI.listByType("nacionalidad"), infoAPI.listByType("nivel-estudio"), infoAPI.listByType("banco"), sindicatosApi.list().catch(() => [] as SimpleCatalogItem[])]);
        if (cancelled) return;
        setRoles(rolesRes.roles);
        const rfArray = Array.isArray(rf) ? rf : rf && Array.isArray((rf as any).data) ? (rf as any).data : [];
        setAllRoleFrames(rfArray);
        setGenders(g);
        setDocumentTypes(dt);
        setCountries(c);
        setNationalities(n);
        setEducationLevels(el);
        setSindicatos(Array.isArray(sind) ? sind : []);
        setBanks(b);
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
      /*
        El sello de ARCA también se limpia al cerrar.

        El componente no se desmonta entre aperturas: `formData` se re-inicializa acá, pero
        `validadoEnArca` es estado aparte y sobrevivía. Al reabrir en blanco quedaba el cartel verde
        "los datos son los de ARCA" sobre campos vacíos, y peor: seguían bloqueados, así que no se
        podía cargar a nadie hasta recargar la página.
      */
      setValidadoEnArca(false);
      setInactivoEnArca(false);
      setConsultandoPadron(false);
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
    // El sello ya existente manda: si la ficha dice validado, el formulario abre en ese estado, con los
    // campos de ARCA bloqueados igual que en el alta. Sin esto, editar a alguien confirmado permitía
    // pisarle el nombre a mano y dejar el sello mintiendo.
    setValidadoEnArca(!!user?.metadata?.nombreValidadoArcaAt);

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
        nacionalizado: user.metadata?.nacionalizado || false,
        paisNacimientoId: user.metadata?.paisNacimientoId,
        nivelEstudioId: user.metadata?.nivelEstudioId,
        fechaNac: user.metadata?.fechaNac ? new Date(user.metadata.fechaNac).toISOString().split("T")[0] : "",
        telefono: user.metadata?.telefono,
        bancoId: user.metadata?.bancoId,
        cbu: user.metadata?.cbu || "",
        tipoDeCuentaBancaria: user.metadata?.tipoDeCuentaBancaria || "",
        nroDeCuentaBancaria: user.metadata?.nroDeCuentaBancaria || "",
        aliasBancario: user.metadata?.aliasBancario || "",
        numeroLegajoTango: user.metadata?.numeroLegajoTango || "",
        afiliadoAlSindicato: user.metadata?.afiliadoAlSindicato || false,
        sindicatoIds: user.metadata?.sindicatoIds || [],
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
      // Al editar, el checkbox arranca reflejando lo que la persona ya tiene cargado: si no hay
      // CUIL, queda destildado (y el campo oculto) en vez de aparecer vacío como si faltara.
      setTieneCuil(!!user.metadata?.cuit);
    } else {
      // ── Alta ──
      const defaultRole = roles.find((role) => role.isDefault);
      const mobileCollabRole = roles.find((role) => role.name.toLowerCase() === "mobile-colaborador");
      const defaultRolesSet = new Set<string>();
      if (defaultRole) defaultRolesSet.add(defaultRole._id);
      if (mobileCollabRole) defaultRolesSet.add(mobileCollabRole._id);

      // Argentina viene preseleccionada en el ALTA: es la nacionalidad de casi todas, y hasta que se
      // elegía una, documento y CUIL quedaban apagados. En la edición no se toca: manda lo cargado.
      const argentina = opcionArgentina(nationalityOptions);
      setFormData({
        ...emptyForm(),
        roles: Array.from(defaultRolesSet),
        nacionalidadId: argentina ? Number(argentina.data?.id) : undefined,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user, mode, catalogsLoaded]);

  // ─────────── Submit ───────────
  /**
   * Un CBU argentino tiene 22 dígitos. Los CVU también, pero acá el campo es el CBU: llamarlo
   * «CBU / CVU» daba a entender que acepta dos cosas distintas cuando el formato es uno solo.
   */
  const cbuIncompleto = !!formData.cbu && formData.cbu.length > 0 && formData.cbu.length < CBU_DIGITOS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // El CUIT/CUIL se valida con el algoritmo de ARCA (módulo 11), no solo por largo: un número mal
    // tipeado se detecta acá y no viaja a la base ni al TXT de ARCA.
    /*
      Un CBU a medias no se guarda.

      Vacío SÍ: no todo el mundo tiene los datos bancarios cargados, y exigirlo bloquearía editar
      cualquier otra cosa de la ficha. Lo que no puede pasar es guardar 12 dígitos y que después
      una transferencia falle contra un número que nunca fue un CBU.
    */
    if (cbuIncompleto) {
      sweetAlert.error("CBU incompleto", `Un CBU tiene ${CBU_DIGITOS} dígitos y cargaste ${(formData.cbu || "").length}. Completalo o dejalo vacío.`);
      setModalActiveTab("bancarios");
      return;
    }
    if (cuilVisible && formData.cuit && !isValidCuit(formData.cuit)) {
      sweetAlert.error("CUIT/CUIL inválido", "El CUIT/CUIL no es válido. Revisá los 11 dígitos.");
      setModalActiveTab("general");
      return;
    }
    // Se exige cuando la persona DICE TENERLO, no según la nacionalidad: el switch prendido es la
    // declaración de que tiene CUIL, y entonces hay que cargarlo. Si no lo tiene, se destilda y el
    // alta sigue por el circuito "Sin CUIT" — lo que no sirve es un CUIL a medias.
    if (cuilVisible && !formData.cuit) {
      sweetAlert.error("Falta el CUIT/CUIL", cuilObligatorio ? "Para una persona argentina nativa el CUIT/CUIL es obligatorio." : 'Está tildado "Tiene CUIT / CUIL argentino": cargalo, o destildá el switch para seguir sin CUIT.');
      setModalActiveTab("general");
      return;
    }
    /*
      Afiliado/a pero sin gremio elegido no es un estado que se pueda guardar.

      Guardado así sería indistinguible de "no afiliado/a" para cualquiera que lea la ficha —el dato
      no dice a qué sindicato, que es lo único que lo hace servir para algo—, con la diferencia de
      que además afirma una afiliación. O se elige el gremio, o se apaga el switch.
    */
    if (formData.afiliadoAlSindicato && (formData.sindicatoIds || []).length === 0) {
      sweetAlert.error("Falta el sindicato", 'Está encendido "Afiliado a un sindicato": elegí al menos uno, o apagá el switch para registrar a la persona como no afiliada.');
      setModalActiveTab("general");
      return;
    }
    if (bloqueadoHastaValidar) {
      sweetAlert.error("Falta validar el CUIT", "Apretá «Validar CUIT»: nombre, apellido y documento los trae ARCA, y así el alta queda confirmada contra el organismo.");
      setModalActiveTab("general");
      return;
    }
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
          // Se persiste la declaración de "no tiene CUIT/CUIL argentino" para poder listarlos
          // después (pestaña "Sin CUIT"): no alcanza con inferirlo de un campo vacío.
          sinCuit: !cuilVisible,
          // Ver `esCuilObligatorio`: solo importa cuando nacionalidadId es Argentina.
          nacionalizado: !!formData.nacionalizado,
          paisNacimientoId: formData.paisNacimientoId,
          estadoCivil: formData.estadoCivil,
          calle: formData.calle,
          altura: formData.altura,
          pisoDepto: formData.pisoDepto,
          codigoPostal: formData.codigoPostal,
          localidad: formData.localidad,
          paisId: formData.paisId,
          nacionalidadId: formData.nacionalidadId,
          nivelEstudioId: formData.nivelEstudioId,
          fechaNac: formData.fechaNac,
          telefono: formData.telefono,
          bancoId: formData.bancoId,
          cbu: formData.cbu,
          tipoDeCuentaBancaria: formData.tipoDeCuentaBancaria,
          nroDeCuentaBancaria: formData.nroDeCuentaBancaria,
          aliasBancario: formData.aliasBancario,
          numeroLegajoTango: formData.numeroLegajoTango,
          afiliadoAlSindicato: formData.afiliadoAlSindicato,
          // Sin el switch no hay sindicatos que guardar: mandarlos igual dejaría en la base gremios
          // colgados de alguien que declaró no estar afiliado.
          sindicatoIds: formData.afiliadoAlSindicato ? formData.sindicatoIds || [] : [],
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
        // Mismo criterio que el alta: el sello lo pone el servidor tras ver la respuesta de ARCA.
        await usersAPI.update(user._id, { ...submitData, validarConArca: validadoEnArca });
        sweetAlert.success(formData.isSolicitud ? "Solicitud Aprobada" : "Usuario actualizado", formData.isSolicitud ? "El usuario ha sido dado de alta correctamente" : "Los cambios se han guardado correctamente");
      } else {
        // `validarConArca`: el sello lo escribe el SERVIDOR después de ver la respuesta del organismo.
        // Mandar el `nombreValidadoArcaAt` desde acá sería marcar como confirmado algo que ARCA no vio.
        await usersAPI.create({ ...submitData, validarConArca: validadoEnArca });
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
    ) : formData.isSolicitud ? (
      "Aprobar Solicitud de Contratación"
    ) : user ? (
      `Editar Usuario: ${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email
    ) : (
      "Nuevo Usuario"
    );

  // En "Cambiar contraseña" el subtítulo dice de QUIÉN es: el modal se abre desde la tarjeta de una
  // persona y antes no había forma de confirmar que era la correcta.
  const subtitle =
    mode === "password" ? (
      user ? (
        `${`${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email}${user.firstName || user.lastName ? ` · ${user.email}` : ""}`
      ) : undefined
    ) : (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {formData.isSolicitud && <span>Completa los datos para dar de alta al usuario</span>}
        <span className="text-gray-400 dark:text-gray-500 text-sm">
          Los campos marcados con <span className="text-red-500">*</span> son obligatorios
        </span>
      </span>
    );

  // --- Nacionalidad → Tipo de documento / CUIL (ver utils/nacionalidadDocumento.ts) ---
  // El catálogo de nacionalidades es el de países (no existe un `nacionalidad` propio).
  const nationalityOptions = nationalities.length > 0 ? nationalities : countries;
  const opcionesNacionalidad = nationalityOptions.map((it) => ({ id: it.data.id, name: it.name }));
  // Para dibujar el desplegable. Las reglas siguen mirando el catálogo crudo, sin la sintética.
  const opcionesNacionalidadSelect = opcionesDeNacionalidad(opcionesNacionalidad);
  const nacionalidadElegida = !!formData.nacionalidadId;
  /**
   * Los sindicatos elegidos, resueltos contra el catálogo.
   *
   * Un id puede no encontrarse: si alguien borra el registro del catálogo, el usuario queda apuntando
   * a algo que ya no existe. Ese id se omite en vez de dibujar un badge con un nombre inventado.
   */
  const sindicatosElegidos = (formData.sindicatoIds || []).map((id) => sindicatos.find((sind) => sind._id === id)).filter((sind): sind is SimpleCatalogItem => !!sind);
  /** Agregar o quitar uno, sin duplicarlo. */
  const toggleSindicato = (id: string, elegido: boolean) => {
    setFormData((prev) => {
      const actuales = prev.sindicatoIds || [];
      return { ...prev, sindicatoIds: elegido ? [...actuales.filter((x) => x !== id), id] : actuales.filter((x) => x !== id) };
    });
  };
  // `nombreSindicato` y no `.name`: así el buscador encuentra también por sigla ("SATSAID").
  const sindicatosFiltrados = sindicatos.filter((sind) => fuzzyMatch(nombreSindicato(sind), sindicatoSearch));
  const esArgentino = esNacionalidadArgentina(opcionesNacionalidad, formData.nacionalidadId);
  // Argentino/a (nativo/a o nacionalizado/a): sin Pasaporte. Otra nacionalidad: con Pasaporte.
  const tiposDocumentoDisponibles = tiposDocumentoParaNacionalidad(documentTypes, esArgentino);
  /**
   * El CUIL se pide cuando la persona DICE TENERLO, salvo en el único caso donde no hay nada que
   * decir: argentino/a nativo/a (`cuilObligatorio`, ver utils/nacionalidadDocumento.ts). Ahí el
   * switch ni se muestra y `tieneCuil` queda en true. En los otros dos casos —nacionalizado/a o de
   * otra nacionalidad— declararlo con el switch es lo mismo que hacerlo obligatorio: o va completo y
   * válido, o se destilda y el alta sigue por el circuito "Sin CUIT". Un CUIL a medias pasa los
   * controles de la pantalla y falla recién contra ARCA.
   */
  const cuilObligatorio = esCuilObligatorio(esArgentino, !!formData.nacionalizado);
  const cuilVisible = cuilObligatorio || tieneCuil;

  /*
    CON CUIT, PRIMERO SE VALIDA. Después se llena el resto.

    Nombre, apellido, tipo y número de documento salen del Padrón: dejarlos escribir antes es invitar
    a tipear algo que el organismo va a contradecir, y el alta queda con un nombre que no es el de
    ARCA. Los renombres masivos que corregimos venían casi todos de acá.

    Solo aplica al ALTA y solo si la persona declara tener CUIT/CUIL: quien va por el circuito «Sin
    CUIT» no tiene nada que validar, y una ficha ya creada se corrige desde la columna ARCA de Usuarios.
  */
  const bloqueadoHastaValidar = !user && cuilVisible && !validadoEnArca && !inactivoEnArca;

  /*
    LO QUE VINO DE ARCA NO SE EDITA.

    Nombre, apellido, tipo y número de documento son literalmente lo que el organismo tiene para ese
    CUIT, y el alta se guarda marcada como validada. Dejar retocarlos después convertiría ese sello en
    una mentira: diría "confirmado contra ARCA" sobre un dato que alguien cambió a mano.

    Si están mal, lo que está mal es el CUIT. Cambiarlo apaga el sello (ver el onChange del campo) y
    todo vuelve a quedar en blanco para validar de nuevo.
  */
  const camposDeArcaBloqueados = validadoEnArca;
  const tituloArca = camposDeArcaBloqueados ? "Lo trae ARCA para este CUIT. Para cambiarlo, corregí el CUIT y validá de nuevo." : undefined;
  /*
    Bloqueado, pero con el texto en el color normal.

    El gris de `:disabled` está pensado para un campo VACÍO que todavía no se puede usar. Acá el campo
    tiene un dato real y correcto —el que devolvió ARCA—, y pintarlo gris lo hacía leer como un
    placeholder: parecía que no se había completado nada. El fondo hundido sigue diciendo que no se
    edita; el texto en blanco dice que ahí hay contenido.
  */
  const claseArca = camposDeArcaBloqueados ? "input-field disabled:text-gray-900 dark:disabled:text-white" : "input-field";

  const actions =
    mode === "password"
      ? [
          { label: "Actualizar", onClick: () => document.querySelector<HTMLFormElement>("#password-form")?.requestSubmit(), variant: "primary" as const, disabled: !passwordValida },
          { label: "Cancelar", onClick: onClose, variant: "ghost" as const },
        ]
      : [
          /*
            EN EL ALTA SE AVANZA POR PASOS: General → Domicilio → Datos Bancarios → Crear.

            Con «Crear» disponible desde la primera pestaña, quien no conocía el formulario lo apretaba
            ahí y se llevaba el rebote por un campo obligatorio que ni había visto —está dos pestañas
            más adelante—. Los pasos hacen que el recorrido sea el orden natural, y el botón final
            aparece recién cuando ya se pasó por todo.

            En la EDICIÓN no: ahí se entra a corregir un dato puntual, casi siempre de una sola
            pestaña, y obligar a recorrer las tres para guardarlo sería puro trámite.
          */
          /*
            «Anterior» a partir del segundo paso, solo en el ALTA.

            Sin él, revisar algo que quedó atrás obligaba a tocar la pestaña en el encabezado, que no
            se lee como parte del recorrido: los pasos avanzaban con un botón y se volvía por otro
            lado. Editando no hace falta, porque ahí no hay recorrido.
          */
          ...(!user && ORDEN_TABS.indexOf(modalActiveTab) > 0 ? [{ label: "Anterior", onClick: () => setModalActiveTab(ORDEN_TABS[ORDEN_TABS.indexOf(modalActiveTab) - 1]), variant: "secondary" as const }] : []),
          ...(user ? [{ label: formData.isSolicitud ? "Aprobar y Crear" : "Actualizar", onClick: () => document.querySelector<HTMLFormElement>("#user-form")?.requestSubmit(), variant: "primary" as const }] : modalActiveTab !== ORDEN_TABS[ORDEN_TABS.length - 1] ? [{ label: "Siguiente", onClick: () => setModalActiveTab(ORDEN_TABS[ORDEN_TABS.indexOf(modalActiveTab) + 1]), variant: "primary" as const, disabled: bloqueadoHastaValidar }] : [{ label: "Crear", onClick: () => document.querySelector<HTMLFormElement>("#user-form")?.requestSubmit(), variant: "primary" as const }]),
          { label: "Cancelar", onClick: onClose, variant: "ghost" as const },
        ];

  /*
    Los datos que trajo ARCA se descartan si cambia aquello de lo que dependían.

    Valen para UN CUIT concreto. Si se cambia la nacionalidad o se declara que la persona no tiene
    CUIL, ese CUIT deja de estar en juego y lo que quedó en pantalla —nombre, apellido y documento del
    organismo, más el sello de validado— ya no corresponde a nadie. Peor todavía: el alta se guardaría
    marcada como confirmada contra ARCA con los datos de otra persona.

    Solo en el ALTA: editando a alguien existente, cambiarle la nacionalidad no tiene por qué borrarle
    el nombre.
  */
  /**
   * El switch de afiliación. Al apagarlo se vacían los sindicatos elegidos.
   *
   * Si no se vaciaran, apagar y volver a prender devolvería gremios que la persona ya había
   * desmarcado, y en el medio el formulario tendría "no afiliado" con sindicatos cargados al
   * lado — dos campos que se contradicen.
   */
  const handleAfiliadoChange = (afiliado: boolean) => {
    setFormData((prev) => ({ ...prev, afiliadoAlSindicato: afiliado, sindicatoIds: afiliado ? prev.sindicatoIds : [] }));
  };

  const limpiarDatosDeArca = () => {
    // El sello cae siempre: dejó de corresponder al CUIT que tiene el formulario.
    setValidadoEnArca(false);
    setInactivoEnArca(false);
    // Vaciar los campos, solo en el alta. Editando a alguien existente sería borrarle datos guardados
    // por tocar un select; lo que hace falta ahí es destrabarlos para poder corregirlos.
    if (user) return;
    setFormData((prev) => ({ ...prev, firstName: "", lastName: "", documento: "", tipoDocumentoId: undefined }));
  };

  /**
   * Al cambiar la nacionalidad hay que revisar lo que dependía de ella para no dejar datos inválidos.
   *
   * Recibe el value crudo del <select> porque una de las opciones es sintética: "Argentino/a
   * nacionalizado/a" no es una entrada del catálogo, se traduce a Argentina + `nacionalizado`.
   *
   * `paisNacimientoId` se resetea siempre: solo tiene sentido para un nacionalizado/a, y dejarlo
   * pegado de una elección anterior es el mismo problema que el CUIT arrastrado que ya se resolvía.
   *
   * `tieneCuil` se fija explícito en los dos sentidos (antes solo se forzaba a `true` al entrar a
   * Argentina, y quedaba en lo que fuera al salir): un extranjero recién elegido tiene que arrancar
   * en "no tiene CUIL" por default, no en lo último que haya quedado prendido.
   */
  const handleNacionalidadChange = (value: string) => {
    const { nacionalidadId, nacionalizado } = leerNacionalidadElegida(opcionesNacionalidad, value);
    const nuevoId = parseInt(nacionalidadId) || undefined;
    const ahoraEsArgentino = esNacionalidadArgentina(opcionesNacionalidad, nuevoId);
    const tiposValidos = tiposDocumentoParaNacionalidad(documentTypes, ahoraEsArgentino).map((t) => ({ id: t.data.id, name: t.name }));
    setFormData((prev) => ({
      ...prev,
      nacionalidadId: nuevoId,
      // Si el tipo elegido ya no está disponible (tenía Pasaporte y pasó a argentino/a), se limpia.
      tipoDocumentoId: tipoDocumentoSigueValido(tiposValidos, prev.tipoDocumentoId) ? prev.tipoDocumentoId : undefined,
      nacionalizado,
      paisNacimientoId: undefined,
      // El CUIT también: quedó atado a la nacionalidad anterior.
      cuit: "",
    }));
    // Nativo/a argentino/a → obligatorio (el switch ni se muestra). Cualquier otro caso —incluido el
    // nacionalizado/a— arranca en "no tiene", que es lo más común y evita darlo por hecho.
    setTieneCuil(esCuilObligatorio(ahoraEsArgentino, nacionalizado));
    limpiarDatosDeArca();
  };

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
                <input type={showNewPassword ? "text" : "password"} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input-field pr-10" placeholder="••••••••" minLength={PASSWORD_MIN} autoComplete="new-password" autoFocus />
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
                <input type={showNewPassword ? "text" : "password"} required value={repetirPassword} onChange={(e) => setRepetirPassword(e.target.value)} className={`input-field pr-10 ${repetirPassword && !passwordsCoinciden ? "border-red-400 dark:border-red-600" : ""}`} placeholder="••••••••" autoComplete="new-password" />
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
                Personales
              </button>
              <button type="button" onClick={() => setModalActiveTab("domicilio")} disabled={bloqueadoHastaValidar} title={bloqueadoHastaValidar ? "Validá el CUIT primero" : undefined} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${modalActiveTab === "domicilio" ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                <FontAwesomeIcon icon={faMapMarkerAlt} className="text-xs" />
                Domicilio
              </button>
              <button type="button" onClick={() => setModalActiveTab("bancarios")} disabled={bloqueadoHastaValidar} title={bloqueadoHastaValidar ? "Validá el CUIT primero" : undefined} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${modalActiveTab === "bancarios" ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                <FontAwesomeIcon icon={faUniversity} className="text-xs" />
                Bancarios
              </button>
              <button type="button" onClick={() => setModalActiveTab("sistema")} disabled={bloqueadoHastaValidar} title={bloqueadoHastaValidar ? "Validá el CUIT primero" : undefined} className={`flex-1 py-3 text-sm font-bold transition-all border-b-2 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${modalActiveTab === "sistema" ? "border-blue-500 text-blue-500 bg-blue-50/30 dark:bg-blue-500/10" : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`}>
                <FontAwesomeIcon icon={faUserShield} className="text-xs" />
                Sistema
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Tab Content */}
            {modalActiveTab === "general" && (
              <div className="space-y-6 animate-fadeIn">
                {/*
                  ORDEN DEL FORMULARIO: nacionalidad → CUIT → lo que ARCA completa.

                  La nacionalidad decide si hay CUIL y qué tipos de documento existen; el CUIT es lo
                  único que hay que tipear, y de él salen nombre, apellido, tipo y número de documento.
                  Tenerlos en el orden inverso —escribir a mano un nombre que dos campos más abajo se
                  iba a pisar con el de ARCA— era hacer dos veces el mismo trabajo.
                */}
                {/* La nacionalidad va PRIMERO: de ella dependen el tipo de documento y el CUIL. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      Nacionalidad <span className="text-red-500">*</span>
                    </label>
                    {/* "Argentino/a nacionalizado/a" es una opción más acá adentro, debajo de
                        Argentina: es la misma pregunta, no una segunda. Ver `opcionesDeNacionalidad`. */}
                    <select required value={valorDeNacionalidad(formData.nacionalidadId, !!formData.nacionalizado)} onChange={(e) => handleNacionalidadChange(e.target.value)} className="input-field">
                      <option value="">Seleccionar...</option>
                      {opcionesNacionalidadSelect.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </select>
                    {!nacionalidadElegida && <p className="text-[11px] text-gray-400 mt-1">Elegí la nacionalidad para completar documento y CUIL.</p>}
                  </div>
                  {/* Solo se abre cuando corresponde: un nacionalizado/a nació en otro país, y a un
                      nativo/a o a un extranjero no hay por qué preguntárselo. */}
                  {formData.nacionalizado && (
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        País de nacimiento <span className="text-red-500">*</span>
                      </label>
                      <select required value={formData.paisNacimientoId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, paisNacimientoId: parseInt(e.target.value) || undefined }))} className="input-field">
                        <option value="">Seleccionar...</option>
                        {countries.map((it) => (
                          <option key={it._id} value={it.data.id}>
                            {it.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/*
                 * ORDEN: nacionalidad → CUIT/CUIL → tipo y número de documento. El CUIL va pegado a
                 * la nacionalidad porque es lo que depende de ella; el documento, después.
                 *
                 * Ninguno de los dos se monta y desmonta: siempre están, y cuando no aplican quedan
                 * DESHABILITADOS. Un campo que aparece y desaparece hace saltar el formulario entero
                 * y deja la duda de si se perdió lo cargado.
                 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    {/* Mismo motivo que en Rol/es Empresa: el ⓘ adentro de un <label> `block` deja
                        toda la fila como área activa de ese botón. Ver el comentario de allá. */}
                    <div className="flex items-center gap-1.5 mb-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      <span className="inline-flex items-center gap-1.5">
                        {/* El asterisco sigue al switch: si dice tenerlo, hay que cargarlo. */}
                        CUIT / CUIL {cuilVisible && <span className="text-red-500">*</span>}
                        {/* Solo para extranjeros: un argentino siempre tiene CUIL, así que la pregunta que
                            contesta este ⓘ —«¿y si no tiene?»— ahí no existe. */}
                        {/* Antes solo para "no argentino": un nacionalizado/a también puede no tenerlo
                            todavía, así que la pregunta le cabe igual. */}
                        {!cuilObligatorio && (
                          <button type="button" onClick={() => setSinCuitInfoOpen(true)} title="¿Qué pasa si no tiene CUIT/CUIL?" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 normal-case tracking-normal font-normal shrink-0">
                            <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                    {/* El switch tiene sentido salvo para el nativo/a argentino/a: nacionalizado/a o
                        de otra nacionalidad comparten el mismo "puede tenerlo o no". */}
                    {nacionalidadElegida && !cuilObligatorio && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={tieneCuil}
                        onClick={() => {
                          const nuevo = !tieneCuil;
                          setTieneCuil(nuevo);
                          if (!nuevo) setFormData((prev) => ({ ...prev, cuit: "" }));
                          // Con o sin CUIT, lo traído del Padrón deja de aplicar.
                          limpiarDatosDeArca();
                        }}
                        className="flex items-center gap-2 mb-2 text-xs text-gray-600 dark:text-gray-300"
                      >
                        <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${tieneCuil ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}>
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${tieneCuil ? "translate-x-[1.15rem]" : "translate-x-0.5"}`} />
                        </span>
                        Tiene CUIT / CUIL argentino
                      </button>
                    )}
                    {/* Input y botón en la misma línea: el botón es lo que hace ese campo, no un paso aparte. */}
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <CuitInput
                          value={cuilVisible ? formData.cuit || "" : ""}
                          onChange={(v) => {
                            setFormData((prev) => ({ ...prev, cuit: v }));
                            // Tocar el CUIT invalida lo traído: si no, se valida uno y se guarda otro.
                            setValidadoEnArca(false);
                            setInactivoEnArca(false);
                          }}
                          className={`input-field ${cuilVisible ? "" : "opacity-50 cursor-not-allowed"}`}
                          placeholder="XX-XXXXXXXX-X"
                          disabled={!cuilVisible}
                        />
                      </div>
                      {/*
                        El botón ES el indicador de estado: validado le cambia el ícono y el color, en vez
                        de sumar un cartel aparte que ocupa dos renglones para lo mismo.

                        Vale igual en alta y en edición: la ficha de alguien confirmado abre mostrando
                        «Validado» y con los campos de ARCA bloqueados, y la de alguien sin confirmar
                        permite hacerlo desde acá, sin ir hasta la columna ARCA del listado.
                      */}
                      {cuilVisible && (
                        <button type="button" onClick={traerDeArca} disabled={consultandoPadron || validadoEnArca || !cuitEsValido(String(formData.cuit || "").replace(/\D/g, ""))} title={validadoEnArca ? "Nombre, apellido y documento son los de ARCA. Se guarda marcado como validado." : "Consulta el Padrón de ARCA: confirma que el CUIT existe y completa nombre, apellido y documento con lo que tiene el organismo"} className={`shrink-0 inline-flex items-center gap-2 px-3 h-[42px] rounded-lg text-xs font-semibold border transition-colors disabled:cursor-not-allowed whitespace-nowrap ${validadoEnArca ? "border-green-300 dark:border-green-700 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 disabled:opacity-100" : "border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-50"}`}>
                          <FontAwesomeIcon icon={consultandoPadron ? faSpinner : validadoEnArca ? faCircleCheck : faLandmark} spin={consultandoPadron} className="h-3 w-3" />
                          {consultandoPadron ? "Validando…" : validadoEnArca ? "Validado" : "Validar CUIT"}
                        </button>
                      )}
                    </div>
                    {!nacionalidadElegida && <p className="text-[11px] text-gray-400 mt-1">Elegí la nacionalidad para completarlo.</p>}
                    {nacionalidadElegida && !cuilVisible && <p className="text-[11px] text-gray-400 mt-1">Se registra sin CUIT/CUIL. Se puede cargar más adelante.</p>}
                  </div>
                </div>

                {/*
                  TODO LO QUE VIENE DESPUÉS DEL CUIT, DESHABILITADO HASTA VALIDARLO.

                  Se hace con un <fieldset disabled>, que el navegador propaga a TODOS los controles
                  de adentro: no hay que acordarse de poner `disabled` campo por campo, ni queda
                  ninguno suelto cuando mañana se agregue otro.

                  Lleva su propio `space-y-6` porque el del contenedor padre solo separa a sus hijos
                  directos, y ahora el fieldset ES un único hijo: sin esto los bloques de adentro
                  quedaban pegados uno contra otro.
                */}
                <fieldset disabled={bloqueadoHastaValidar} className={`space-y-6 ${bloqueadoHastaValidar ? "opacity-60" : ""}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Nombre <span className="text-red-500">*</span>
                      </label>
                      <input type="text" required value={formData.firstName} onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))} className={claseArca} placeholder="Ej: Juan" disabled={camposDeArcaBloqueados} title={tituloArca} />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Apellido <span className="text-red-500">*</span>
                      </label>
                      <input type="text" required value={formData.lastName} onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))} className={claseArca} placeholder="Ej: Pérez" disabled={camposDeArcaBloqueados} title={tituloArca} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tipo de Documento</label>
                      <select value={formData.tipoDocumentoId || ""} onChange={(e) => setFormData((prev) => ({ ...prev, tipoDocumentoId: parseInt(e.target.value) || undefined }))} className={claseArca} disabled={!nacionalidadElegida || camposDeArcaBloqueados} title={tituloArca}>
                        <option value="">Seleccionar...</option>
                        {tiposDocumentoDisponibles.map((it) => (
                          <option key={it._id} value={it.data.id}>
                            {it.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Documento <span className="text-red-500">*</span>
                      </label>
                      <input type="text" required value={formData.documento || ""} onChange={(e) => setFormData((prev) => ({ ...prev, documento: e.target.value }))} className={claseArca} placeholder={esArgentino ? "Nº de documento" : "DNI / Pasaporte"} disabled={!nacionalidadElegida || camposDeArcaBloqueados} title={tituloArca} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input type="email" required value={formData.email} onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))} className="input-field" placeholder="usuario@ejemplo.com" />
                    </div>
                    {/*
                      El teléfono, al lado del email: los dos son cómo se contacta a la persona, y
                      estaba en Domicilio, que es dónde vive.

                      Va al final de esta grilla y no en una fila propia: editando, la celda de la
                      derecha está libre —la contraseña solo aparece en el alta— así que cae
                      exactamente al lado; en el alta pasa al renglón siguiente por su cuenta.
                    */}
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Teléfono</label>
                      <input type="text" value={formData.telefono || ""} onChange={(e) => setFormData((prev) => ({ ...prev, telefono: e.target.value }))} className="input-field" placeholder="Ej: 11 1234-5678" />
                    </div>
                    {(!user || formData.isSolicitud) && (
                      <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                          {formData.isSolicitud ? "Asignar Contraseña" : "Contraseña"} <span className="text-red-500">*</span>
                        </label>
                        {/* Mismo patrón que el CUIT: campo + acción a la derecha, en la misma línea. */}
                        <div className="flex items-start gap-2">
                          <div className="relative flex-1 min-w-0">
                            <input type={showPassword ? "text" : "password"} required value={formData.password} onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))} className="input-field pr-10" placeholder="••••••••" minLength={6} />
                            <button type="button" onClick={() => setShowPassword((v) => !v)} title={showPassword ? "Ocultar" : "Mostrar"} className="absolute inset-y-0 right-0 pr-3 flex items-center">
                              <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-4 w-4 text-gray-400" />
                            </button>
                          </div>
                          {/* Generar la revela y la copia: una contraseña que no se puede ver ni pegar hay
                            que volver a escribirla a mano, que es justo lo que se quiere evitar. */}
                          <button
                            type="button"
                            onClick={async () => {
                              const nueva = generarPassword();
                              setFormData((prev) => ({ ...prev, password: nueva }));
                              setShowPassword(true);
                              try {
                                await navigator.clipboard.writeText(nueva);
                                sweetAlert.success("Contraseña generada", "Ya está copiada al portapapeles.");
                              } catch {
                                // Sin permiso de portapapeles (o sin HTTPS): igual queda visible en el campo.
                                sweetAlert.success("Contraseña generada", "Copiala del campo antes de guardar.");
                              }
                            }}
                            title="Generar una contraseña segura al azar y copiarla al portapapeles"
                            className="shrink-0 inline-flex items-center gap-2 px-3 h-[42px] rounded-lg text-xs font-semibold border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            <FontAwesomeIcon icon={faWandMagicSparkles} className="h-3 w-3" />
                            Generar
                          </button>
                        </div>
                      </div>
                    )}
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

                  {/* CUIT/CUIL y Nacionalidad se movieron arriba (la nacionalidad decide el resto). */}

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
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Estado civil</label>
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

                  {/*
                   * Acá había un selector de Obra Social y los toggles OS Prepaga / In House.
                   *
                   * La obra social se fue porque es un dato de la RELACIÓN LABORAL, no de la persona:
                   * ARCA la declara en cada alta (pos. 40-45 del TXT), dos contratos de la misma
                   * persona en dos empleadoras llevan cada uno el suyo, y caduca sola —por
                   * desregulación alguien cambia de obra social sin que su empleadora se entere—.
                   * Guardarla acá la propagaba, sin fecha ni verificación, a todos los contratos
                   * futuros. Ahora vive en el contrato y se constata contra el padrón de la SSS.
                   *
                   * Los dos toggles se fueron con ella: describían la cobertura de salud de la persona
                   * y ya no se decide nada con eso acá. Los campos siguen existiendo porque los MANDA
                   * FRAME en la sincronización (`utils/additiveSync.ts`), y se ven en Mi Perfil — pero
                   * son un dato que llega, no uno que se carga a mano.
                   */}

                  {/*
                    UN CAMPO QUE ABRE UN MODAL, no una grilla incrustada.

                    El listado tiene cientos de especialidades: metido en el formulario ocupaba 300px con
                    scroll propio dentro del scroll del modal —dos barras anidadas—, empujaba todo lo de
                    abajo fuera de la vista y obligaba a recorrerlo entero para saber qué había marcado.

                    Ahora el formulario muestra solo lo elegido y la elección pasa a una ventana dedicada,
                    donde hay lugar para buscar y ver la lista completa.
                  */}
                </fieldset>
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

                {/* El teléfono se fue a General, al lado del email: es un dato de contacto de la
                    persona, no de dónde vive. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Código Postal</label>
                    <input type="text" value={formData.codigoPostal || ""} onChange={(e) => setFormData((prev) => ({ ...prev, codigoPostal: e.target.value }))} className="input-field" placeholder="Ej: 1425" />
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
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">CBU</label>
                    {/*
                      SOLO DÍGITOS, Y EXACTAMENTE 22.

                      Era un campo de texto libre con `minLength`/`maxLength`: `maxLength` frena el
                      largo pero no el contenido —entraba cualquier cosa tipeada— y `minLength` solo
                      actúa en una validación nativa de formulario que este modal no dispara, así que
                      un CBU de 12 caracteres se guardaba igual.

                      Se filtra al escribir en vez de avisar después: un CBU con letras no es un CBU
                      mal cargado, es otra cosa, y no hay motivo para dejar que llegue al campo.
                    */}
                    <input type="text" inputMode="numeric" value={formData.cbu || ""} onChange={(e) => setFormData((prev) => ({ ...prev, cbu: soloDigitos(e.target.value).slice(0, CBU_DIGITOS) }))} className="input-field" placeholder={`${CBU_DIGITOS} dígitos`} />
                    {/* El contador y el aviso, mientras está incompleto: el largo es la única regla */}
                    {/* que hay que cumplir y verla evita contar dígitos a mano. */}
                    {cbuIncompleto && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">
                        Faltan {CBU_DIGITOS - (formData.cbu || "").length} dígito(s): un CBU tiene {CBU_DIGITOS}.
                      </p>
                    )}
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

            {modalActiveTab === "sistema" && (
              <div className="space-y-6 animate-fadeIn">
                {/*
                  DATOS SISTEMA: lo que la plataforma necesita saber de la persona, no la persona.

                  Roles, legajo, afiliación y estado de la cuenta se decidían en «General», que es
                  donde van nombre, documento y contacto. Son dos cosas distintas —quién es y cómo
                  opera dentro del sistema— y juntas hacían de General una pestaña que había que
                  scrollear entera para llegar a lo último.

                  Sin <fieldset disabled>: el bloqueo hasta validar el CUIT protege los datos que
                  ARCA completa, y acá no hay ninguno. Igual la pestaña no se puede abrir sin validar,
                  como las otras dos.
                */}
                {/* La fecha de ingreso y los días extra son del VÍNCULO con la empresa, no de la
                    persona: por eso viajan con los roles y el estado de la cuenta. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      Fecha de Ingreso <span className="text-red-500">*</span>
                    </label>
                    <input type="date" required value={formData.hireDate} onChange={(e) => setFormData((prev) => ({ ...prev, hireDate: e.target.value }))} className="input-field" />
                  </div>
                </div>

                {/* Debajo de la fecha de ingreso y no al lado: es una EXCEPCIÓN, y ponerla en la misma
                    fila la hacía ver como un dato de carga habitual. El ⓘ va fuera del <label>: uno
                    que contiene un control se asocia a él y toda la fila queda como área activa. */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Vacaciones (Días Extra)</span>
                      <button type="button" onClick={() => setVacacionesInfoOpen(true)} title="¿Para qué sirven los días extra?" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                        <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input type="number" min="0" value={formData.extraVacationDays} onChange={(e) => setFormData((prev) => ({ ...prev, extraVacationDays: parseInt(e.target.value) || 0 }))} className="input-field" />
                  </div>
                </div>
                <div>
                  {/*
                    Los botones van FUERA del <label>, en una fila propia.

                    Un <label> que contiene un control se asocia a él, y este es `block`: con el ⓘ
                    adentro, TODA la fila —los 100% de ancho, incluido el vacío a la derecha—
                    quedaba como área activa de ese botón. Un <span> nombra el campo sin capturar
                    clicks; el campo real de acá abajo es un botón que abre una ventana, no un input
                    al que un label pueda dar foco.
                  */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Rol/es Empresa</span>
                    <button type="button" onClick={() => setRolesEmpresaInfoOpen(true)} title="¿Qué son los roles empresa?" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                      <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
                    </button>
                    {/* Solo con algo elegido: sin nada, abajo está el buscador ancho y este [+]
                        sería un segundo camino a lo mismo. */}
                    {(formData.rolesFrameIds || []).length > 0 && <BotonAgregar onClick={() => setRolesEmpresaOpen(true)} title="Agregar otro rol" />}
                  </div>
                  <div>
                    {(formData.rolesFrameIds || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(formData.rolesFrameIds || []).map((id) => {
                          const rf = allRoleFrames.find((x) => x._id === id);
                          return (
                            <span key={id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                              {rf?.name || "Rol"}
                              <button type="button" onClick={() => setFormData((prev) => ({ ...prev, rolesFrameIds: (prev.rolesFrameIds || []).filter((x) => x !== id) }))} title={`Quitar ${rf?.name || "rol"}`} className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-0.5">
                                <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {/*
                    El buscador ancho SOLO cuando no hay nada elegido.

                    Con roles ya puestos, ese campo repetía la invitación a elegir debajo de lo que
                    ya estaba elegido y se llevaba el alto de una fila entera para eso. Con algo
                    seleccionado alcanza un «+ Más» al lado de los badges, que abre la misma
                    ventana. Lo elegido va ARRIBA y no adentro del input: badges dentro de un campo
                    lo hacen crecer y se leen como texto escrito en el buscador.
                  */}
                    {(formData.rolesFrameIds || []).length === 0 && (
                      <button type="button" onClick={() => setRolesEmpresaOpen(true)} className="input-field text-left flex items-center gap-2 hover:border-blue-400 dark:hover:border-blue-600 transition-colors">
                        <span className="text-gray-400 dark:text-gray-500">Elegí uno o más roles…</span>
                        <FontAwesomeIcon icon={faSearch} className="h-3 w-3 text-gray-400 ml-auto shrink-0" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Legajo Tango</label>
                    <input type="text" value={formData.numeroLegajoTango || ""} onChange={(e) => setFormData((prev) => ({ ...prev, numeroLegajoTango: e.target.value }))} className="input-field" placeholder="Ej: 01505" />
                  </div>
                </div>

                {/*
                  AFILIACIÓN SINDICAL — bloque propio, con el mismo marco que "Roles de Sistema".

                  Antes era un checkbox suelto al lado de Legajo Tango, y ahí no se entendía: la
                  afiliación es un dato con su propia pregunta de seguimiento (a QUÉ gremio), y un
                  tilde perdido en la fila de otro campo no deja lugar para hacerla.
                */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Afiliación sindical</label>
                  {/*
                    El switch va FUERA del recuadro, y el recuadro solo aparece cuando hay algo
                    adentro.

                    Encerrarlo junto a los sindicatos daba a entender que el marco agrupaba las dos
                    cosas, cuando el switch es la pregunta y el recuadro es la respuesta. Y con el
                    switch apagado el marco quedaba dibujado alrededor de una sola línea.
                  */}
                  <div className="flex items-center gap-3">
                    <label className="flex items-center space-x-3 cursor-pointer group w-fit">
                      <div className={`w-10 h-6 flex items-center rounded-full p-1 duration-300 ease-in-out ${formData.afiliadoAlSindicato ? "bg-blue-500 dark:bg-blue-600" : "bg-gray-300 dark:bg-gray-700"}`}>
                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ease-in-out ${formData.afiliadoAlSindicato ? "translate-x-4" : ""}`}></div>
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Afiliado a un sindicato</span>
                      <input type="checkbox" className="hidden" checked={!!formData.afiliadoAlSindicato} onChange={(e) => handleAfiliadoChange(e.target.checked)} />
                    </label>
                    {/* Al lado del switch, y solo con algo elegido: sin nada, abajo está el
                        buscador ancho. Va FUERA del <label> del switch — adentro, apretarlo
                        también lo tildaría, porque un label propaga el click a su control. */}
                    {formData.afiliadoAlSindicato && sindicatosElegidos.length > 0 && (
                      <BotonAgregar
                        onClick={() => {
                          setSindicatoSearch("");
                          setSindicatoOpen(true);
                        }}
                        title="Agregar otro sindicato"
                      />
                    )}
                  </div>

                  {/*
                      La pregunta de seguimiento: solo existe si la respuesta anterior fue que sí.

                      Mismo patrón que Rol/es Empresa —badge arriba, campo que abre una ventana con
                      buscador— y no un <select>: son dos elecciones de catálogo en la misma pantalla,
                      y que se vieran distinto era la única razón para tener que mirarlas dos veces.
                    */}
                  {formData.afiliadoAlSindicato && (
                    <div className="mt-2">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        Sindicato <span className="text-red-500">*</span>
                      </label>
                      {sindicatosElegidos.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {sindicatosElegidos.map((sind) => (
                            <span key={sind._id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                              {nombreSindicato(sind)}
                              <button type="button" onClick={() => toggleSindicato(sind._id, false)} title={`Quitar ${nombreSindicato(sind)}`} className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-0.5">
                                <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      {/*
                          El buscador ancho SOLO cuando no hay nada elegido: con sindicatos ya
                          puestos repetía la invitación a elegir debajo de lo elegido y se llevaba
                          el alto de una fila para eso. Lo elegido va ARRIBA y no adentro del input:
                          un badge dentro de un campo lo hace crecer y se lee como texto escrito.
                        */}
                      {sindicatosElegidos.length === 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSindicatoSearch("");
                            setSindicatoOpen(true);
                          }}
                          className="input-field text-left flex items-center gap-2 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
                        >
                          <span className="text-gray-400 dark:text-gray-500">Elegí uno o más sindicatos…</span>
                          <FontAwesomeIcon icon={faSearch} className="h-3 w-3 text-gray-400 ml-auto shrink-0" />
                        </button>
                      )}
                      {/* Un catálogo vacío sin explicación se lee como un error de la pantalla. */}
                      {sindicatos.length === 0 && <p className="text-[11px] text-gray-400 mt-1">Todavía no hay sindicatos cargados. Se cargan en Configuración → Sindicatos.</p>}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Roles de Sistema</label>
                  <div className="space-y-4">
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
                        {coordinacionBloqueada && (
                          <p className="mb-3 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                            Coordina turnos en <strong>{coordinaEn.join(", ")}</strong>, así que el rol Mobile no se puede cambiar. Liberalo desde el equipo del proyecto primero.
                          </p>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {roles
                            .filter((r) => r.name.toLowerCase().includes("mobile"))
                            .map((r) => (
                              <label key={r._id} title={coordinacionBloqueada ? `Coordina turnos en ${coordinaEn.join(", ")}. Liberalo desde el equipo del proyecto para poder cambiarle el rol.` : undefined} className={`flex items-start space-x-3 p-3 rounded-lg border transition-all ${coordinacionBloqueada ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${formData.roles.includes(r._id) ? "bg-indigo-50 border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800 ring-2 ring-indigo-500/20" : "bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-200"}`}>
                                <input
                                  type="checkbox"
                                  checked={formData.roles.includes(r._id)}
                                  disabled={coordinacionBloqueada}
                                  onChange={(e) => {
                                    if (coordinacionBloqueada) {
                                      sweetAlert.warningAlert("No se puede cambiar el rol Mobile", `${user?.firstName || "Esta persona"} coordina turnos en ${coordinaEn.join(", ")}. Sacale la coordinación desde el equipo del proyecto y después cambiale el rol.`);
                                      return;
                                    }
                                    let newRoles = e.target.checked ? [...formData.roles, r._id] : formData.roles.filter((id) => id !== r._id);
                                    const name = r.name.toLowerCase();
                                    if (e.target.checked) {
                                      if (name.includes("coordinador"))
                                        newRoles = newRoles.filter(
                                          (id) =>
                                            !roles
                                              .find((ro) => ro._id === id)
                                              ?.name.toLowerCase()
                                              .includes("colaborador"),
                                        );
                                      else if (name.includes("colaborador"))
                                        newRoles = newRoles.filter(
                                          (id) =>
                                            !roles
                                              .find((ro) => ro._id === id)
                                              ?.name.toLowerCase()
                                              .includes("coordinador"),
                                        );
                                    } else {
                                      if (
                                        !newRoles.some((id) =>
                                          roles
                                            .find((ro) => ro._id === id)
                                            ?.name.toLowerCase()
                                            .includes("mobile"),
                                        )
                                      ) {
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

                {/* El mismo bloque que Proyecto y Contrato: ver `components/ui/BloqueEstado`. */}
                <BloqueEstado activo={!!formData.isActive} onChange={(activo) => setFormData((prev) => ({ ...prev, isActive: activo }))} />
              </div>
            )}
          </div>
        </form>
      )}
      {/* El selector, en su propia ventana: acá el listado tiene lugar para respirar. */}
      {rolesEmpresaOpen && (
        <Modal
          isOpen={rolesEmpresaOpen}
          onClose={() => setRolesEmpresaOpen(false)}
          title="Rol/es Empresa"
          subtitle={`${(formData.rolesFrameIds || []).length} seleccionado(s) · el oficio con el que la persona trabaja en una producción`}
          size="lg"
          zIndex={90}
          footer={
            <>
              <button type="button" onClick={() => setFormData((prev) => ({ ...prev, rolesFrameIds: [] }))} className="btn-secondary" disabled={(formData.rolesFrameIds || []).length === 0}>
                Limpiar
              </button>
              <button type="button" onClick={() => setRolesEmpresaOpen(false)} className="btn-primary">
                Listo
              </button>
            </>
          }
        >
          {/* Alto fijo: con la altura atada al contenido, filtrar encogía el modal y el botón «Listo»
              se movía debajo del cursor. Lo que scrollea es la grilla, no la ventana. */}
          <div className="h-[60vh] flex flex-col">
            {(formData.rolesFrameIds || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
                {(formData.rolesFrameIds || []).map((id) => {
                  const rf = allRoleFrames.find((x) => x._id === id);
                  return (
                    <span key={id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                      {rf?.name || "Rol"}
                      <button type="button" onClick={() => setFormData((prev) => ({ ...prev, rolesFrameIds: (prev.rolesFrameIds || []).filter((x) => x !== id) }))} title={`Quitar ${rf?.name || "rol"}`} className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-0.5">
                        <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="relative mb-3 shrink-0">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FontAwesomeIcon icon={faSearch} className="h-3.5 w-3.5 text-gray-400" />
              </div>
              <input type="text" autoFocus value={roleFrameSearch} onChange={(e) => setRoleFrameSearch(e.target.value)} placeholder="Buscar especialidad..." className="input-field pl-9 pr-8" />
              {roleFrameSearch && (
                <button type="button" onClick={() => setRoleFrameSearch("")} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 flex-1 overflow-y-auto content-start pr-1">
              {allRoleFrames
                .filter((rf) => fuzzyMatch(rf.name, roleFrameSearch))
                .map((rf) => (
                  <label key={rf._id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${formData.rolesFrameIds?.includes(rf._id) ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 ring-2 ring-blue-500/20" : "bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300"}`}>
                    <input
                      type="checkbox"
                      checked={formData.rolesFrameIds?.includes(rf._id)}
                      onChange={(e) => {
                        const nuevos = e.target.checked ? [...(formData.rolesFrameIds || []), rf._id] : (formData.rolesFrameIds || []).filter((id) => id !== rf._id);
                        setFormData((prev) => ({ ...prev, rolesFrameIds: nuevos }));
                      }}
                      className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4 shrink-0"
                    />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{rf.name}</span>
                  </label>
                ))}
              {allRoleFrames.filter((rf) => fuzzyMatch(rf.name, roleFrameSearch)).length === 0 && <div className="col-span-full py-8 text-center text-xs text-gray-500 italic">No se encontraron especialidades que coincidan con "{roleFrameSearch}"</div>}
            </div>
          </div>
        </Modal>
      )}

      {sindicatoOpen && (
        <Modal
          isOpen={sindicatoOpen}
          onClose={() => setSindicatoOpen(false)}
          title="Sindicato"
          subtitle={`${(formData.sindicatoIds || []).length} seleccionado(s) · el o los gremios a los que está afiliada la persona`}
          size="lg"
          zIndex={90}
          footer={
            <>
              <button type="button" onClick={() => setFormData((prev) => ({ ...prev, sindicatoIds: [] }))} className="btn-secondary" disabled={(formData.sindicatoIds || []).length === 0}>
                Limpiar
              </button>
              <button type="button" onClick={() => setSindicatoOpen(false)} className="btn-primary">
                Listo
              </button>
            </>
          }
        >
          {/* Alto fijo: con la altura atada al contenido, filtrar encogía el modal y el botón «Listo»
              se movía debajo del cursor. Lo que scrollea es la grilla, no la ventana. */}
          <div className="h-[60vh] flex flex-col">
            {sindicatosElegidos.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3 shrink-0">
                {sindicatosElegidos.map((sind) => (
                  <span key={sind._id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
                    {nombreSindicato(sind)}
                    <button type="button" onClick={() => toggleSindicato(sind._id, false)} title={`Quitar ${nombreSindicato(sind)}`} className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-0.5">
                      <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="relative mb-3 shrink-0">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FontAwesomeIcon icon={faSearch} className="h-3.5 w-3.5 text-gray-400" />
              </div>
              <input type="text" autoFocus value={sindicatoSearch} onChange={(e) => setSindicatoSearch(e.target.value)} placeholder="Buscar sindicato..." className="input-field pl-9 pr-8" />
              {sindicatoSearch && (
                <button type="button" onClick={() => setSindicatoSearch("")} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 flex-1 overflow-y-auto content-start pr-1">
              {sindicatosFiltrados.map((sind) => (
                <label key={sind._id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${(formData.sindicatoIds || []).includes(sind._id) ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 ring-2 ring-blue-500/20" : "bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300"}`}>
                  <input type="checkbox" checked={(formData.sindicatoIds || []).includes(sind._id)} onChange={(e) => toggleSindicato(sind._id, e.target.checked)} className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4 shrink-0" />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate" title={nombreSindicato(sind)}>
                    {nombreSindicato(sind)}
                  </span>
                </label>
              ))}
              {sindicatosFiltrados.length === 0 && <div className="col-span-full py-8 text-center text-xs text-gray-500 italic">{sindicatos.length === 0 ? "Todavía no hay sindicatos cargados. Se cargan en Configuración → Sindicatos." : `No se encontraron sindicatos que coincidan con "${sindicatoSearch}"`}</div>}
            </div>
          </div>
        </Modal>
      )}

      {rolesEmpresaInfoOpen && (
        <Modal isOpen={rolesEmpresaInfoOpen} onClose={() => setRolesEmpresaInfoOpen(false)} title="Rol/es Empresa" size="md" zIndex={90}>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <p>Es el oficio con el que la persona trabaja en una producción: Actor, Animador 2D, Asistente de Cámara, Sonidista.</p>
            <p>
              <strong>Se puede elegir más de uno.</strong> Es lo normal: alguien puede ser Asistente de Cámara en un proyecto y Foquista en otro. Marcá todos los que correspondan.
            </p>
            <p className="text-[11px] text-gray-500">No tiene que ver con los permisos del sistema: eso se define en Usuarios → Roles.</p>
          </div>
        </Modal>
      )}

      {vacacionesInfoOpen && (
        <Modal isOpen={vacacionesInfoOpen} onClose={() => setVacacionesInfoOpen(false)} title="Vacaciones: días extra" size="md" zIndex={90}>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <p>
              Son días que <strong>se suman</strong> a los que ya le corresponden a la persona por antigüedad. No los reemplazan: el cálculo habitual sigue funcionando igual y esto se agrega arriba.
            </p>
            <p>
              Es una <strong>excepción</strong>, no la regla. Se usa cuando la empresa decide reconocerle días adicionales a alguien en particular —una política interna, un acuerdo puntual, una situación que se quiera compensar— y por eso se carga persona por persona y no en una configuración general.
            </p>
            <p>
              Se aplica solo a quienes la empresa defina. Si a esta persona no le corresponde ninguno, dejalo en <strong>0</strong>.
            </p>
          </div>
        </Modal>
      )}

      {sinCuitInfoOpen && (
        <Modal isOpen={sinCuitInfoOpen} onClose={() => setSinCuitInfoOpen(false)} title="Si la persona todavía no tiene CUIT/CUIL" size="md" zIndex={90}>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <p>
              Se puede dar de alta igual: destildá <strong>&quot;Tiene CUIT / CUIL argentino&quot;</strong> y seguí con el resto de los datos.
            </p>
            <p>
              Su trámite de ARCA/ANSES <strong>no se descarta</strong>: queda <strong>pendiente</strong> hasta que cuente con la documentación migratoria necesaria (DNI precario, residencia en trámite, etc.).
            </p>
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100 mb-1">Mientras tanto, con sus contratos:</p>
              <ul className="space-y-1.5 list-disc list-inside">
                <li>
                  Aparecen en la pestaña <strong>Sin CUIT</strong> de Contratos, y no en Alta temprana de ARCA ni en Constancia de CUIT.
                </li>
                <li>Hay que cargarles documentación de respaldo (pasaporte, DNI precario, constancia de residencia en trámite o CUIL provisorio) y marcar la validación.</li>
                <li>
                  Recién ahí se los puede enviar a <strong>Generar Documentos</strong>, donde se generan el Contrato y el Release como siempre.
                </li>
                <li>Queda una fecha de seguimiento (90 días por defecto) para revisar si ya obtuvo el CUIL y pasarlo al circuito normal.</li>
              </ul>
            </div>
          </div>
        </Modal>
      )}
    </InfoModal>
  );
};

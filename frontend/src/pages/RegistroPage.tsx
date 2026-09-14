import { CBU_DIGITOS, soloDigitosCbu, contadorCbu, cbuIncompleto, faltanDigitosCbu } from "../utils/cbu";
import { SIN_BANCO, TIPO_ENTIDAD_OPTIONS, camposDe, labelTipo } from "../utils/bancarios";
import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faCircleInfo, faSpinner, faLandmark, faCircleCheck, faEye, faEyeSlash, faWandMagicSparkles, faSearch, faTimes, faXmark, faUser, faMapMarkerAlt, faUniversity } from "@fortawesome/free-solid-svg-icons";
import { useSearchParams, Link } from "react-router-dom";
import { CuitInput, isValidCuit } from "../components/ui/CuitInput";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { sweetAlert } from "../utils/sweetAlert";
import { generarPassword } from "../utils/password";
import { fuzzyMatch } from "../utils/searchHelpers";
import { mensajeErrorArca } from "../utils/errorArca";
import { esNacionalidadArgentina, tiposDocumentoParaNacionalidad, tipoDocumentoSigueValido, opcionArgentina, esCuilObligatorio, opcionesDeNacionalidad, valorDeNacionalidad, leerNacionalidadElegida, tipoDocumentoDeArca } from "../utils/nacionalidadDocumento";

type Tab = "general" | "domicilio" | "bancarios";

interface InfoOption {
  id: number | string;
  name: string;
}

interface BancoOption extends InfoOption {
  tipoEntidad?: string;
}

interface RegistroForm {
  firstName: string;
  lastName: string;
  email: string;
  cuit: string;
  tipoDocumentoId: string;
  documento: string;
  fechaNac: string;
  generoId: string;
  nivelEstudioId: string;
  nacionalidadId: string;
  /** Argentino/a por naturalización, no nativo/a. Solo tiene sentido con nacionalidadId = Argentina. */
  nacionalizado: boolean;
  /** Solo si `nacionalizado`: un nativo nació acá, no hace falta preguntarlo. */
  paisNacimientoId: string;
  estadoCivil: string;
  password: string;
  rolesFrameIds: string[];
  // Domicilio
  pais: string;
  localidad: string;
  calle: string;
  altura: string;
  pisoDepto: string;
  codigoPostal: string;
  telefono: string;
  // Bancarios
  tipoEntidadFinanciera: string;
  bancoId: string;
  tipoDeCuentaBancaria: string;
  cbu: string;
  aliasBancario: string;
  nroDeCuentaBancaria: string;
  solicitaCreacionCuenta: boolean;
}

const emptyForm: RegistroForm = {
  firstName: "",
  lastName: "",
  email: "",
  cuit: "",
  tipoDocumentoId: "",
  documento: "",
  fechaNac: "",
  generoId: "",
  nivelEstudioId: "",
  nacionalidadId: "",
  nacionalizado: false,
  paisNacimientoId: "",
  estadoCivil: "",
  password: "",
  rolesFrameIds: [],
  pais: "",
  localidad: "",
  calle: "",
  altura: "",
  pisoDepto: "",
  codigoPostal: "",
  telefono: "",
  tipoEntidadFinanciera: "",
  bancoId: "",
  tipoDeCuentaBancaria: "",
  cbu: "",
  aliasBancario: "",
  nroDeCuentaBancaria: "",
  solicitaCreacionCuenta: false,
};

// Valor especial: el usuario no tiene banco y pide que le creen una cuenta.

// Validación de formato de email (local@dominio.tld).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (email: string): boolean => EMAIL_RE.test((email || "").trim());

/*
  Las mismas clases que el formulario de Nuevo Usuario, a propósito.

  Es el mismo formulario: uno lo completa un administrativo y el otro la persona, pero los campos, el
  orden y las reglas son idénticos. Tenían tipografías, altos y paddings distintos, y eso hacía que
  «copiá el comportamiento de aquel» terminara siendo dos pantallas que se parecen de lejos.

  `input-field` es la clase compartida de la app (ver index.css), la que ya trae el estado
  `:disabled`. Los 42px de alto que salen de ahí son los que hacen que el botón «Validar CUIT»
  —también de 42px— quede alineado con el campo, en vez de flotar más arriba.
*/
const labelClass = "block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2";
const fieldClass = "input-field";

// La cascada de datos bancarios vive en utils/bancarios.ts: la comparten esta pantalla y el
// modal de Nuevo/Editar Usuario. Ver el comentario de ese archivo.

/**
 * Qué son los Roles Empresa y por qué se puede elegir más de uno.
 *
 * La aclaración vivía como un renglón de texto suelto arriba de la grilla, compitiendo con el título
 * y con el buscador. Como ⓘ dice lo mismo sin ocupar lugar, y de paso hay sitio para explicar QUÉ es
 * un rol empresa, que era lo que en realidad no se entendía.
 */
const InfoRolesEmpresa: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="¿Qué son los roles empresa?" aria-label="¿Qué son los roles empresa?" className="ml-1.5 text-gray-400 hover:text-gray-200 transition-colors normal-case tracking-normal font-normal align-middle">
        <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
            <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
                <h3 className="text-sm font-bold text-gray-100">Rol/es Empresa</h3>
                <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-200 text-lg leading-none">
                  ✕
                </button>
              </div>
              <div className="px-5 py-4 space-y-3 text-sm text-gray-300">
                <p>Es el oficio con el que trabajás en una producción: Actor, Animador 2D, Asistente de Cámara, Sonidista.</p>
                <p>
                  <strong>Podés elegir más de uno.</strong> Es lo normal: alguien puede ser Asistente de Cámara en un proyecto y Foquista en otro. Marcá todos los que correspondan.
                </p>
                <p className="text-[11px] text-gray-500">No tiene que ver con los permisos del sistema: eso se define aparte y no lo elegís vos.</p>
              </div>
              <div className="flex justify-end px-5 py-3 border-t border-gray-700">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700">
                  Entendido
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

/**
 * Qué pasa si la persona no tiene CUIT/CUIL: explica el circuito "Sin CUIT" de Contratos, para que
 * quien se registra sepa de antemano que puede avanzar igual y qué se le va a pedir después.
 */
const InfoSinCuit: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="¿Qué pasa si no tengo CUIT/CUIL?" aria-label="¿Qué pasa si no tengo CUIT/CUIL?" className="ml-1.5 text-gray-400 hover:text-gray-200 transition-colors normal-case tracking-normal font-normal align-middle">
        <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
            <div className="w-full max-w-lg rounded-xl border border-gray-700 bg-gray-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
                <h3 className="text-sm font-bold text-gray-100">Si todavía no tenés CUIT/CUIL</h3>
                <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-200 text-lg leading-none">
                  ✕
                </button>
              </div>
              <div className="px-5 py-4 space-y-3 text-sm text-gray-300">
                <p>
                  Podés registrarte igual: destildá <strong>&quot;Tiene CUIT / CUIL argentino&quot;</strong> y seguí con el resto de los datos.
                </p>
                <p>
                  Tu trámite de ARCA/ANSES <strong>no se descarta</strong>: queda <strong>pendiente</strong> hasta que cuentes con la documentación migratoria necesaria (DNI precario, residencia en trámite, etc.).
                </p>
                <div>
                  <p className="font-semibold text-gray-200 mb-1">Mientras tanto, con tus contratos:</p>
                  <ul className="space-y-1.5 list-disc list-inside text-gray-300">
                    <li>
                      Quedan en un circuito aparte llamado <strong>Sin CUIT</strong>, en vez de los trámites normales de ARCA.
                    </li>
                    <li>Se te va a pedir documentación de respaldo (pasaporte, DNI precario, constancia de residencia en trámite o CUIL provisorio).</li>
                    <li>Una vez validada esa documentación, el contrato avanza igual y se generan tu Contrato y tu Release para firmar.</li>
                    <li>Cuando obtengas el CUIL, se carga en tu ficha y pasás al circuito normal de ARCA.</li>
                  </ul>
                </div>
                <p className="text-[11px] text-gray-500">Si ya tenés CUIT/CUIL, dejá el check tildado y cargalo: es lo que agiliza el alta.</p>
              </div>
              <div className="flex justify-end px-5 py-3 border-t border-gray-700">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700">
                  Entendido
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

/** Selector con modal y buscador, para listas largas (Nacionalidad, Rol frame). */
const SearchableSelect: React.FC<{
  title: string;
  value: string;
  options: InfoOption[];
  onChange: (id: string) => void;
  invalid?: boolean;
}> = ({ title, value, options, onChange, invalid }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = options.find((o) => String(o.id) === String(value));
  const term = search.trim().toLowerCase();
  const filtered = term ? options.filter((o) => o.name.toLowerCase().includes(term)) : options;

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSearch("");
          setOpen(true);
        }}
        className={`${fieldClass}${invalid ? " !border-red-500 ring-2 ring-red-500/40" : ""} flex items-center justify-between text-left`}
      >
        <span className={selected ? "text-gray-100" : "text-gray-400"}>{selected ? selected.name : "Seleccionar..."}</span>
        <svg className="h-4 w-4 text-gray-400 shrink-0 ml-2" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
            <div className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border border-gray-700 bg-gray-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-200">{title}</h3>
                <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-200 text-lg leading-none">
                  ✕
                </button>
              </div>
              <div className="p-3 border-b border-gray-700">
                <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
              </div>
              <div className="overflow-y-auto">
                <button type="button" onClick={() => pick("")} className="w-full text-left px-4 py-3 text-sm text-gray-400 hover:bg-gray-700/50">
                  Seleccionar...
                </button>
                {filtered.map((o) => (
                  <button key={o.id} type="button" onClick={() => pick(String(o.id))} className={`w-full text-left px-4 py-3 text-sm hover:bg-gray-700/50 ${String(o.id) === String(value) ? "text-blue-400 bg-blue-500/10" : "text-gray-200"}`}>
                    {o.name}
                  </button>
                ))}
                {filtered.length === 0 && <div className="px-4 py-6 text-center text-sm text-gray-500">Sin resultados</div>}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export const RegistroPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [form, setForm] = useState<RegistroForm>(emptyForm);
  /** Solo para extranjeros: si declaró tener CUIL. Los argentinos siempre lo llevan. */
  const [tieneCuil, setTieneCuil] = useState(true);
  const [generos, setGeneros] = useState<InfoOption[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<InfoOption[]>([]);
  const [nivelesEstudio, setNivelesEstudio] = useState<InfoOption[]>([]);
  const [nacionalidades, setNacionalidades] = useState<InfoOption[]>([]);
  // País de NACIMIENTO (solo para nacionalizado/a): catálogo aparte del de nacionalidad.
  const [paises, setPaises] = useState<InfoOption[]>([]);
  const [bancos, setBancos] = useState<BancoOption[]>([]);
  const [rolesFrame, setRolesFrame] = useState<InfoOption[]>([]);
  /**
   * El link mismo: cuántos días le quedan y, si lo compartió un supervisor o coordinador desde el
   * móvil, quién invita y para qué proyecto, área y turno. `null` para links viejos que no lo traen.
   */
  const [linkInfo, setLinkInfo] = useState<{ expiresAt: string; diasRestantes: number; proyecto: string | null; area: string | null; turno: string | null; invitadoPor: string | null } | null>(null);

  const [loading, setLoading] = useState(true);
  const [invalidToken, setInvalidToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Campos obligatorios faltantes (para marcarlos en rojo por paso).
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const apiUrl = import.meta.env.VITE_API_URL;

  // Cargar catálogos validando el token
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setInvalidToken(true);
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${apiUrl}/auth/registro-info?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          if (!cancelled) setInvalidToken(true);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        setGeneros(data.generos || []);
        setTiposDocumento(data.tiposDocumento || []);
        setNivelesEstudio(data.nivelesEstudio || []);
        const nacs: InfoOption[] = data.nacionalidades || [];
        setNacionalidades(nacs);
        setPaises(data.paises || []);
        // Argentina viene preseleccionada: es la nacionalidad de casi todas las altas, y hasta que se
        // elegía una, los campos que dependen de ella —documento y CUIL— quedaban apagados. Sigue
        // siendo un default: cambiarla reajusta los tipos de documento y muestra el switch del CUIL.
        const argentina = opcionArgentina(nacs);
        if (argentina) setForm((prev) => (prev.nacionalidadId ? prev : { ...prev, nacionalidadId: String(argentina.id) }));
        setBancos(data.bancos || []);
        setRolesFrame(data.rolesFrame || []);
        setLinkInfo(data.link || null);
      } catch {
        if (!cancelled) setInvalidToken(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, apiUrl]);

  const set = <K extends keyof RegistroForm>(key: K, value: RegistroForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => (prev[key as string] ? { ...prev, [key as string]: false } : prev));
    setError(null);
  };

  // Al cambiar el tipo de entidad, reseteamos la entidad y los datos de cuenta
  // (evita arrastrar una entidad o valores de otro tipo).
  const onTipoEntidadChange = (value: string) => {
    setForm((prev) => ({ ...prev, tipoEntidadFinanciera: value, bancoId: "", tipoDeCuentaBancaria: "", cbu: "", aliasBancario: "", nroDeCuentaBancaria: "", solicitaCreacionCuenta: false }));
    setFieldErrors((prev) => ({ ...prev, tipoEntidadFinanciera: false, bancoId: false, tipoDeCuentaBancaria: false, cbu: false, aliasBancario: false, nroDeCuentaBancaria: false, solicitaCreacionCuenta: false }));
    setError(null);
  };

  // Clase de un input, con borde rojo si el campo obligatorio quedó vacío.
  const inputClass = (key: string) => `${fieldClass}${fieldErrors[key] ? " !border-red-500 ring-2 ring-red-500/40" : ""}`;

  // Entidades filtradas por el tipo elegido (las no clasificadas cuentan como "banco").
  const bancosFiltrados = useMemo(() => (form.tipoEntidadFinanciera ? bancos.filter((b) => (b.tipoEntidad || "banco") === form.tipoEntidadFinanciera) : []), [bancos, form.tipoEntidadFinanciera]);

  // --- Nacionalidad → Tipo de documento / CUIL (ver utils/nacionalidadDocumento.ts) ---
  const nacionalidadElegida = !!form.nacionalidadId;
  const esArgentino = useMemo(() => esNacionalidadArgentina(nacionalidades, form.nacionalidadId), [nacionalidades, form.nacionalidadId]);
  // Para dibujar el desplegable. Las reglas siguen mirando el catálogo crudo, sin la sintética.
  const opcionesNacionalidadSelect = useMemo(() => opcionesDeNacionalidad(nacionalidades), [nacionalidades]);
  // Argentino/a (nativo/a o nacionalizado/a): sin Pasaporte. Otra nacionalidad: con Pasaporte.
  const tiposDocumentoDisponibles = useMemo(() => tiposDocumentoParaNacionalidad(tiposDocumento, esArgentino), [tiposDocumento, esArgentino]);
  /**
   * El CUIL se pide cuando la persona DICE TENERLO, salvo un único caso: argentino/a nativo/a
   * (`cuilObligatorio`, ver utils/nacionalidadDocumento.ts) — ahí no hay switch, es obligatorio y
   * punto. Un nacionalizado/a comparte el switch con un extranjero, aunque su nacionalidad sea
   * Argentina: puede tener el trámite hecho o no. Cargarlo a medias no sirve: o va completo y válido,
   * o se destilda el switch y el alta sigue por el circuito "Sin CUIT" — un CUIL a medias es peor que
   * ninguno, pasa los controles de la pantalla y falla recién contra ARCA.
   */
  const cuilObligatorio = esCuilObligatorio(esArgentino, form.nacionalizado);
  const cuilVisible = cuilObligatorio || tieneCuil;

  /*
    VALIDAR EL CUIT CONTRA ARCA, igual que en el alta interna de Usuarios.

    Mismo trato: el CUIT es lo único que se tipea, y de él salen nombre, apellido y documento. Acá pesa
    todavía más que en el alta interna — quien completa esto es la propia persona, escribiendo su
    nombre como cree que figura en el DNI, y después alguien tiene que corregirlo contra el organismo.

    El endpoint es público pero pide el token de invitación, el mismo del resto del formulario.
  */
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [rolEmpresaBusqueda, setRolEmpresaBusqueda] = useState("");
  const [rolesEmpresaOpen, setRolesEmpresaOpen] = useState(false);
  const [validadoEnArca, setValidadoEnArca] = useState(false);
  /** Se consulto el padron y contesto INACTIVO: no hay sello, pero tampoco se frena el registro. */
  const [inactivoEnArca, setInactivoEnArca] = useState(false);
  const [consultandoPadron, setConsultandoPadron] = useState(false);

  const validarCuitEnArca = async () => {
    const cuit = String(form.cuit || "").replace(/\D/g, "");
    if (!isValidCuit(cuit)) {
      sweetAlert.error("CUIT inválido", "Revisá los dígitos: con un CUIT que no pasa el verificador, ARCA solo devuelve error.");
      return;
    }
    setConsultandoPadron(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/auth/registro/validar-cuit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, cuit }),
      });
      // Puede no ser JSON (una página de error del proxy, por ejemplo): no se puede asumir.
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const m = mensajeErrorArca(res.status, data);
        sweetAlert.error(m.titulo, m.detalle);
        return;
      }
      if (data.yaExiste) {
        // Cortar acá y no al final: si no, completa las tres pestañas para recibir un 409.
        sweetAlert.error("CUIT ya registrado", `Ese CUIT ya figura a nombre de ${data.yaExiste.nombre}.\n\nSi sos vos, entrá con tu cuenta o escribile a la productora. Si no, revisá el número: puede haber un dígito mal.`);
        return;
      }
      const tipoDni = tiposDocumentoDisponibles.find((o) => /dni/i.test(o.name));
      /*
        CUIT INACTIVO: se avisa y se sigue. Mismo criterio que en el alta desde Usuarios.

        ARCA contesta el inactivo con un fault que no trae nombre ni apellido, así que no hay nada que
        traer y el registro no queda sellado. Pero frenarlo sería dejar afuera a alguien que existe y
        que tiene que firmar: que su CUIT esté dado de baja es un trámite suyo ante el organismo.

        Acá importa más que en el alta interna: del otro lado del link hay una persona sola, sin nadie
        a quien preguntarle por qué el formulario no la deja seguir.
      */
      if (data.estado === "inactivo") {
        setInactivoEnArca(true);
        setForm((prev) => ({
          ...prev,
          documento: data.documento || prev.documento,
          tipoDocumentoId: tipoDni ? String(tipoDni.id) : prev.tipoDocumentoId,
        }));
        setFieldErrors((prev) => ({ ...prev, documento: false, cuit: false }));
        sweetAlert.warningAlert("Tu CUIT existe, pero figura INACTIVO en ARCA", "El número está bien: lo que pasa es que ese CUIT está dado de baja en el organismo, y de un CUIT inactivo el Padrón no devuelve el nombre.\n\nPodés terminar el registro igual: cargá tu nombre y apellido tal como figuran en tu documento. Si más adelante no coincidieran con los que tiene ARCA, la productora los corrige de su lado.");
        return;
      }
      if (!data.nombre || !data.apellido) {
        sweetAlert.warningAlert("Es una persona jurídica", `ARCA devolvió «${data.denominacion}». Este formulario es para personas: no hay nombre y apellido para separar.`);
        return;
      }
      /*
        SE PRELLENA LO QUE ARCA YA MANDÓ EN ESTA MISMA RESPUESTA.

        Acá pesa más que en el alta interna: del otro lado del link hay una persona sola, muchas veces
        desde el teléfono, y `REQUIRED_BY_STEP` le pide localidad, calle, altura y código postal antes
        de dejarla seguir. Cuatro de esos cinco campos ya vinieron en la consulta que acaba de hacer.

        Solo campos vacíos, y ninguno queda bloqueado: el domicilio del padrón es el declarado ante el
        organismo y puede no ser donde vive. Se ofrece completado para que lo confirme o lo corrija,
        que es bastante más rápido que tipearlo de cero.
      */
      const dom = data.domicilio as { calle?: string; numero?: string; localidad?: string; codigoPostal?: string } | undefined;
      const tipoDeArca = tipoDocumentoDeArca(tiposDocumentoDisponibles as any[], data.tipoDocumento);
      setForm((prev) => ({
        ...prev,
        firstName: data.nombre,
        lastName: data.apellido,
        documento: data.documento || prev.documento,
        // El tipo que dice ARCA; si su sigla no está en el catálogo (TRAM, ACTA, CERT…), lo que ya estaba.
        tipoDocumentoId: tipoDeArca ? String((tipoDeArca as any).id) : prev.tipoDocumentoId || (tipoDni ? String(tipoDni.id) : prev.tipoDocumentoId),
        fechaNac: prev.fechaNac || data.fechaNacimiento || "",
        calle: prev.calle || dom?.calle || "",
        altura: prev.altura || dom?.numero || "",
        localidad: prev.localidad || dom?.localidad || "",
        codigoPostal: prev.codigoPostal || dom?.codigoPostal || "",
      }));
      setFieldErrors((prev) => ({ ...prev, firstName: false, lastName: false, documento: false, cuit: false }));
      setValidadoEnArca(true);
      sweetAlert.success("Datos traídos de ARCA", `${data.nombre} ${data.apellido}${data.documento ? ` · ${data.tipoDocumento || "DNI"} ${data.documento}` : ""}`);
    } catch {
      const m = mensajeErrorArca(undefined, null);
      sweetAlert.error(m.titulo, m.detalle);
    } finally {
      setConsultandoPadron(false);
    }
  };

  /*
    Con CUIT, primero se valida; después se llena el resto. Y lo que trajo ARCA no se edita: el
    registro se guarda marcado como validado, y dejar retocarlo convertiría ese sello en una mentira.
  */
  const bloqueadoHastaValidar = cuilVisible && !validadoEnArca && !inactivoEnArca;
  const camposDeArcaBloqueados = validadoEnArca;
  const tituloArca = camposDeArcaBloqueados ? "Lo trae ARCA para este CUIT. Para cambiarlo, corregí el CUIT y validá de nuevo." : undefined;
  /** Bloqueado, pero con el texto legible: tiene un dato real, no está vacío. */
  const claseArca = camposDeArcaBloqueados ? "input-field disabled:text-gray-900 dark:disabled:text-white" : fieldClass;

  /** Lo traído del Padrón deja de aplicar si cambia el CUIT o aquello de lo que dependía. */
  const limpiarDatosDeArca = () => {
    setValidadoEnArca(false);
    setInactivoEnArca(false);
    setForm((prev) => ({ ...prev, firstName: "", lastName: "", documento: "", tipoDocumentoId: "" }));
  };

  /**
   * Al cambiar la nacionalidad hay que revisar lo que dependía de ella para no dejar datos inválidos.
   *
   * Recibe el value crudo del desplegable porque una de las opciones es sintética: "Argentino/a
   * nacionalizado/a" no es una entrada del catálogo, se traduce a Argentina + `nacionalizado`.
   *
   * `paisNacimientoId` se resetea siempre: solo tiene sentido para un nacionalizado/a, y dejarlo
   * pegado de una elección anterior repite el problema que ya se resolvía con el CUIT arrastrado.
   * `tieneCuil` se fija en los dos sentidos —antes solo se forzaba a `true` al elegir Argentina, y
   * quedaba en lo que fuera al salir— para que un extranjero recién elegido arranque en "no tiene
   * CUIL" por default, que es la situación real más común.
   */
  const onNacionalidadChange = (value: string) => {
    const { nacionalidadId, nacionalizado } = leerNacionalidadElegida(nacionalidades, value);
    const ahoraEsArgentino = esNacionalidadArgentina(nacionalidades, nacionalidadId);
    const tiposValidos = tiposDocumentoParaNacionalidad(tiposDocumento, ahoraEsArgentino);
    setForm((prev) => ({
      ...prev,
      nacionalidadId,
      // Si el tipo elegido ya no está disponible (tenía Pasaporte y pasó a argentino/a), se limpia.
      tipoDocumentoId: tipoDocumentoSigueValido(tiposValidos, prev.tipoDocumentoId) ? prev.tipoDocumentoId : "",
      nacionalizado,
      paisNacimientoId: "",
      // El CUIT y lo que ARCA devolvió para él quedaron atados a la nacionalidad anterior.
      cuit: "",
    }));
    // Nativo/a argentino/a → obligatorio (el switch ni se muestra). Cualquier otro caso —incluido el
    // nacionalizado/a— arranca en "no tiene", que es lo más común y evita darlo por hecho.
    setTieneCuil(esCuilObligatorio(ahoraEsArgentino, nacionalizado));
    limpiarDatosDeArca();
    setFieldErrors((prev) => ({ ...prev, nacionalidadId: false, tipoDocumentoId: false, paisNacimientoId: false }));
    setError(null);
  };

  // Campos obligatorios por paso (los marcados con * en la UI).
  // El CUIL solo es obligatorio para argentinos: un extranjero puede no tenerlo (lo declara con el
  // checkbox y en ese caso el campo ni se muestra).
  const REQUIRED_BY_STEP: Record<"general" | "domicilio", { key: keyof RegistroForm; label: string }[]> = {
    general: [{ key: "firstName", label: "Nombre" }, { key: "lastName", label: "Apellido" }, { key: "email", label: "Email" }, { key: "nacionalidadId", label: "Nacionalidad" }, ...(cuilObligatorio ? [{ key: "cuit" as keyof RegistroForm, label: "CUIT / CUIL" }] : []), ...(form.nacionalizado ? [{ key: "paisNacimientoId" as keyof RegistroForm, label: "País de nacimiento" }] : []), { key: "documento", label: "Documento" }, { key: "password", label: "Contraseña" }, { key: "fechaNac", label: "Fecha de nacimiento" }, { key: "telefono", label: "Teléfono" }, { key: "rolesFrameIds", label: "Rol/es Empresa" }],
    domicilio: [
      { key: "pais", label: "País" },
      { key: "localidad", label: "Localidad" },
      { key: "calle", label: "Calle" },
      { key: "altura", label: "Altura" },
      { key: "codigoPostal", label: "Código postal" },
    ],
  };

  // Faltantes de datos bancarios (cascada según el tipo de entidad).
  const getMissingBancarios = (): { key: string; label: string }[] => {
    const t = form.tipoEntidadFinanciera;
    if (!t) return [{ key: "tipoEntidadFinanciera", label: "Tipo de entidad financiera" }];
    if (t === SIN_BANCO) {
      return form.solicitaCreacionCuenta ? [] : [{ key: "solicitaCreacionCuenta", label: "Autorización de creación de cuenta" }];
    }
    const c = camposDe(t);
    const miss: { key: string; label: string }[] = [];
    if (!form.bancoId) miss.push({ key: "bancoId", label: labelTipo(t) });
    if (c.tipoCuenta && !form.tipoDeCuentaBancaria) miss.push({ key: "tipoDeCuentaBancaria", label: "Tipo de cuenta" });
    /*
      Vacío e INCOMPLETO se informan distinto, porque son dos problemas distintos.

      Antes solo se miraba que no estuviera vacío, así que un CBU de 19 dígitos pasaba: la persona
      terminaba el registro, el dato quedaba guardado y roto, y aparecía recién cuando alguien iba a
      transferirle. Con el aviso genérico de campo faltante tampoco se entendía —el campo TIENE algo—,
      por eso el mensaje dice cuántos le faltan.
    */
    if (!form.cbu.trim()) miss.push({ key: "cbu", label: c.cbuLabel });
    else if (cbuIncompleto(form.cbu)) miss.push({ key: "cbu", label: `${c.cbuLabel} (faltan ${faltanDigitosCbu(form.cbu)} de ${CBU_DIGITOS} dígitos)` });
    if (!form.aliasBancario.trim()) miss.push({ key: "aliasBancario", label: "Alias" });
    if (c.nroCuenta && !form.nroDeCuentaBancaria.trim()) miss.push({ key: "nroDeCuentaBancaria", label: "Número de cuenta" });
    return miss;
  };

  // Faltantes de un paso: devuelve [{key,label}] de los obligatorios vacíos.
  const getMissingForStep = (step: Tab): { key: string; label: string }[] => {
    if (step === "bancarios") return getMissingBancarios();
    return (REQUIRED_BY_STEP[step] || [])
      .filter((r) => {
        /*
          Los obligatorios no son todos texto: Rol/es Empresa es una lista.

          `String([])` da "" y por casualidad caía del lado correcto, pero `String(["a","b"])` da
          "a,b" y una lista de un solo id vacío pasaría como cargada. Se pregunta por el largo, que
          es lo que realmente significa «no eligió ninguno».
        */
        const v = form[r.key] as unknown;
        return Array.isArray(v) ? v.length === 0 : !String(v ?? "").trim();
      })
      .map((r) => ({ key: r.key as string, label: r.label }));
  };

  // Marca los faltantes en rojo y arma el mensaje de error del paso.
  const flagMissing = (step: Tab, missing: { key: string; label: string }[]) => {
    setFieldErrors(Object.fromEntries(missing.map((m) => [m.key, true])));
    if (step === "bancarios" && form.tipoEntidadFinanciera === SIN_BANCO && !form.solicitaCreacionCuenta) {
      setError("Para continuar, necesitás autorizar la creación de la cuenta.");
    } else {
      setError(`Completá los campos obligatorios: ${missing.map((m) => m.label).join(", ")}.`);
    }
  };

  const tabs: { key: Tab; label: string; icon: IconDefinition }[] = useMemo(
    () => [
      { key: "general", label: "Personales", icon: faUser },
      { key: "domicilio", label: "Domicilio", icon: faMapMarkerAlt },
      { key: "bancarios", label: "Bancarios", icon: faUniversity },
    ],
    [],
  );

  /** El paso anterior. Sin validar: se está saliendo del paso, no avanzando. */
  const handleBack = () => {
    const i = tabs.findIndex((t) => t.key === activeTab);
    if (i > 0) {
      setFieldErrors({});
      setError(null);
      setActiveTab(tabs[i - 1].key);
    }
  };

  const handleNext = () => {
    const missing = getMissingForStep(activeTab);
    if (missing.length > 0) {
      flagMissing(activeTab, missing);
      return;
    }
    // Validaciones de formato del paso General.
    if (activeTab === "general" && form.password.trim().length > 0 && form.password.length < 6) {
      sweetAlert.error("Contraseña muy corta", "Tiene que tener al menos 6 caracteres. Podés usar el botón «Generar» y te la copiamos al portapapeles.");
      setFieldErrors((prev) => ({ ...prev, password: true }));
      return;
    }
    if (activeTab === "general" && !isValidEmail(form.email)) {
      setFieldErrors({ email: true });
      setError("Ingresá un email válido (ej: nombre@dominio.com).");
      return;
    }
    // El formato del CUIL se valida solo si corresponde cargarlo (argentino, o extranjero que declaró tenerlo).
    if (activeTab === "general" && cuilVisible && !isValidCuit(form.cuit)) {
      setFieldErrors({ cuit: true });
      setError("El CUIT/CUIL no es válido. Revisá los 11 dígitos.");
      return;
    }
    setFieldErrors({});
    setError(null);
    if (activeTab === "general") {
      setActiveTab("domicilio");
      return;
    }
    if (activeTab === "domicilio") {
      setActiveTab("bancarios");
      return;
    }
    void handleSubmit();
  };

  const handleSubmit = async () => {
    // Validar todos los pasos; saltar al primero con faltantes y marcarlos.
    for (const step of ["general", "domicilio", "bancarios"] as Tab[]) {
      const missing = getMissingForStep(step);
      if (missing.length > 0) {
        setActiveTab(step);
        flagMissing(step, missing);
        return;
      }
      if (step === "general" && !isValidEmail(form.email)) {
        setActiveTab("general");
        setFieldErrors({ email: true });
        setError("Ingresá un email válido (ej: nombre@dominio.com).");
        return;
      }
      if (step === "general" && cuilVisible && !isValidCuit(form.cuit)) {
        setActiveTab("general");
        setFieldErrors({ cuit: true });
        setError("El CUIT/CUIL no es válido. Revisá los 11 dígitos.");
        return;
      }
    }
    setFieldErrors({});
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        token,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        // La contraseña de la plataforma ES el documento (DNI). Se envía explícito
        // para que funcione tanto con el backend nuevo (deriva de documento) como
        password: form.password,
        cuit: form.cuit,
        // Declaración explícita de "no tiene CUIT/CUIL argentino": se persiste para poder listarlos
        // después (pestaña "Sin CUIT") en vez de inferirlo de un campo vacío.
        sinCuit: !cuilVisible,
        // Ver `esCuilObligatorio`: solo importa cuando nacionalidadId es Argentina.
        nacionalizado: form.nacionalizado,
        paisNacimientoId: form.paisNacimientoId,
        tipoDocumentoId: form.tipoDocumentoId,
        documento: form.documento,
        fechaNac: form.fechaNac,
        generoId: form.generoId,
        nivelEstudioId: form.nivelEstudioId,
        nacionalidadId: form.nacionalidadId,
        estadoCivil: form.estadoCivil,
        rolesFrameIds: form.rolesFrameIds,
        pais: form.pais,
        localidad: form.localidad,
        calle: form.calle,
        altura: form.altura,
        pisoDepto: form.pisoDepto,
        codigoPostal: form.codigoPostal,
        telefono: form.telefono,
        tipoEntidadFinanciera: form.tipoEntidadFinanciera,
        solicitaCreacionCuenta: form.solicitaCreacionCuenta,
        bancoId: form.bancoId,
        tipoDeCuentaBancaria: form.tipoDeCuentaBancaria,
        cbu: form.cbu,
        aliasBancario: form.aliasBancario,
        nroDeCuentaBancaria: form.nroDeCuentaBancaria,
        // El sello lo pone el servidor: vuelve a consultar el Padrón, no confía en este flag.
        validarConArca: validadoEnArca,
      };
      const res = await fetch(`${apiUrl}/auth/registro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudo completar el registro.");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("No se pudo completar el registro. Intentá nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        {/* El mismo spinner que el resto de la app: un texto suelto no distingue "esperá" de "se colgó". */}
        <LoadingSpinner message="Cargando el formulario..." />
      </div>
    );
  }

  if (invalidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 px-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-100 mb-2">Link inválido o expirado</h1>
          <p className="text-gray-400">Solicitá un nuevo link de registro al administrador.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 px-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-100 mb-2">¡Registro completado!</h1>
          <p className="text-gray-400 mb-6">Tu cuenta fue creada correctamente. Ya podés iniciar sesión.</p>
          <Link to="/login" className="inline-block py-3 px-8 rounded-lg text-center text-white font-medium tracking-wide uppercase bg-blue-600 hover:bg-blue-700 transition-colors">
            Iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    /*
      Una tarjeta centrada, no la pantalla entera.

      Estirado a todo el ancho, cada fila de dos columnas quedaba con campos larguísimos y una franja
      de aire a la derecha, y no se parecía en nada al modal donde se hace exactamente lo mismo. Con
      el mismo ancho que un modal `lg`, las dos pantallas se leen igual.
    */
    <div className="min-h-screen bg-gray-900 text-gray-100 py-6 px-4 flex items-start justify-center">
      <div className="w-full max-w-4xl h-[92vh] flex flex-col rounded-2xl border border-gray-700 bg-gray-800 shadow-xl overflow-hidden">
        {/* Header fijo con los tabs */}
        <div className="shrink-0 border-b border-gray-700">
          <div className="px-6 pt-5">
            <h1 className="text-xl font-bold text-gray-100">Registro</h1>
            {/* Solo el asterisco va en rojo; el texto usa el gris de las pestañas inactivas. */}
            <p className={`text-sm text-gray-400 mt-1 ${linkInfo ? "mb-3" : "mb-4"}`}>
              Los campos marcados con <span className="text-red-500">*</span> son obligatorios
            </p>
            {/*
              HASTA CUÁNDO SIRVE ESTE LINK, y para dónde es. Quien lo abre desde un grupo de WhatsApp no
              sabe si llegó a tiempo; así lo ve antes de empezar a completar. En ámbar los últimos 2 días.
            */}
            {linkInfo && (
              <div className={`mb-4 rounded-lg border px-3 py-2 text-xs ${linkInfo.diasRestantes <= 2 ? "border-amber-600/50 bg-amber-500/10 text-amber-300" : "border-blue-600/40 bg-blue-500/10 text-blue-200"}`}>
                <p className="font-semibold">
                  {linkInfo.diasRestantes === 0 ? "Este link vence hoy" : `Este link vence en ${linkInfo.diasRestantes} ${linkInfo.diasRestantes === 1 ? "día" : "días"}`} ({new Date(linkInfo.expiresAt).toLocaleDateString("es-AR")})
                </p>
                {(linkInfo.invitadoPor || linkInfo.proyecto) && (
                  <p className="mt-0.5 text-gray-300">
                    {linkInfo.invitadoPor && <>Te invita {linkInfo.invitadoPor}</>}
                    {linkInfo.invitadoPor && linkInfo.proyecto && " · "}
                    {linkInfo.proyecto && [linkInfo.proyecto, linkInfo.area, linkInfo.turno].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            )}
            <div className="flex">
              {tabs.map((t) => (
                <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} disabled={bloqueadoHastaValidar && t.key !== "general"} title={bloqueadoHastaValidar && t.key !== "general" ? "Validá el CUIT primero" : undefined} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${activeTab === t.key ? "border-blue-500 text-blue-400 bg-blue-500/5" : "border-transparent text-gray-400 hover:text-gray-200"}`}>
                  <FontAwesomeIcon icon={t.icon} className="text-xs" />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Contenido scrolleable */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-6">
            {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

            <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
              {/* General */}
              {activeTab === "general" && (
                <div className="space-y-6">
                  {/* La nacionalidad va PRIMERO: de ella dependen el tipo de documento y el CUIL. */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>
                        Nacionalidad <span className="text-red-500">*</span>
                      </label>
                      {/* "Argentino/a nacionalizado/a" es una opción más acá adentro, debajo de
                        Argentina: es la misma pregunta, no una segunda. Ver `opcionesDeNacionalidad`. */}
                      <SearchableSelect title="Nacionalidad" value={valorDeNacionalidad(form.nacionalidadId, form.nacionalizado)} options={opcionesNacionalidadSelect} onChange={onNacionalidadChange} />
                      {!nacionalidadElegida && <p className="text-[11px] text-gray-400 mt-1">Elegila para completar documento y CUIL.</p>}
                    </div>
                    {/* Solo se abre cuando corresponde: un nacionalizado/a nació en otro país, y a un
                      nativo/a o a un extranjero no hay por qué preguntárselo. */}
                    {form.nacionalizado && (
                      <div>
                        <label className={labelClass}>
                          País de nacimiento <span className="text-red-500">*</span>
                        </label>
                        <SearchableSelect title="País de nacimiento" value={form.paisNacimientoId} options={paises} onChange={(v) => set("paisNacimientoId", v)} invalid={!!fieldErrors.paisNacimientoId} />
                      </div>
                    )}
                  </div>
                  {/*
                   * ORDEN: nacionalidad → CUIT/CUIL → tipo y número de documento.
                   *
                   * El CUIL va pegado a la nacionalidad porque es lo que depende de ella (si es
                   * obligatorio, y si aparece el switch de "no tengo"). Antes iba después del
                   * documento y la dependencia no se leía.
                   *
                   * El campo NO se monta y desmonta: siempre está, y cuando no aplica queda
                   * DESHABILITADO. Un campo que desaparece hace saltar todo Lo siguientey deja la duda
                   * de si se perdió el dato; apagado se ve que existe y por qué no se puede completar.
                   */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>
                        CUIT / CUIL {cuilObligatorio && <span className="text-red-500">*</span>}
                        {/* Solo para extranjeros: un argentino siempre tiene CUIL, así que la pregunta que
                          contesta este ⓘ —«¿y si no tengo?»— ahí no existe. */}
                        {/* Antes solo para "no argentino": un nacionalizado/a también puede no tenerlo
                          todavía, así que la pregunta le cabe igual. */}
                        {!cuilObligatorio && <InfoSinCuit />}
                      </label>
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
                            if (!nuevo) set("cuit", "");
                            limpiarDatosDeArca();
                          }}
                          className="flex items-center gap-2 mb-2 text-xs text-gray-300"
                        >
                          <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${tieneCuil ? "bg-blue-600" : "bg-gray-600"}`}>
                            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${tieneCuil ? "translate-x-[1.15rem]" : "translate-x-0.5"}`} />
                          </span>
                          Tiene CUIT / CUIL argentino
                        </button>
                      )}
                      {/* Input y acción en la misma línea, igual que en el alta interna. */}
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <CuitInput
                            className={`${fieldClass} ${cuilVisible ? "" : "opacity-50 cursor-not-allowed"}`}
                            invalid={!!fieldErrors.cuit}
                            value={cuilVisible ? form.cuit : ""}
                            onChange={(v) => {
                              set("cuit", v);
                              // Tocar el CUIT invalida lo traído: si no, se valida uno y se guarda otro.
                              limpiarDatosDeArca();
                            }}
                            placeholder="XX-XXXXXXXX-X"
                            disabled={!cuilVisible}
                          />
                        </div>
                        {cuilVisible && (
                          <button type="button" onClick={validarCuitEnArca} disabled={consultandoPadron || validadoEnArca || !isValidCuit(String(form.cuit || "").replace(/\D/g, ""))} title={validadoEnArca ? "Nombre, apellido y documento son los de ARCA. Se guarda marcado como validado." : "Consulta el Padrón de ARCA: confirma que el CUIT existe y completa nombre, apellido y documento"} className={`shrink-0 inline-flex items-center gap-2 px-3 h-[42px] rounded-lg text-xs font-semibold border transition-colors disabled:cursor-not-allowed whitespace-nowrap ${validadoEnArca ? "border-green-500/50 text-green-400 bg-green-500/10 disabled:opacity-100" : "border-blue-500/50 text-blue-300 hover:bg-blue-500/10 disabled:opacity-50"}`}>
                            <FontAwesomeIcon icon={consultandoPadron ? faSpinner : validadoEnArca ? faCircleCheck : faLandmark} spin={consultandoPadron} className="h-3 w-3" />
                            {consultandoPadron ? "Validando…" : validadoEnArca ? "Validado" : "Validar CUIT"}
                          </button>
                        )}
                      </div>
                      {!nacionalidadElegida && <p className="text-[11px] text-gray-400 mt-1">Elegí la nacionalidad para completarlo.</p>}
                      {nacionalidadElegida && !cuilVisible && <p className="text-[11px] text-gray-400 mt-1">Te registrás sin CUIT/CUIL. Se puede cargar más adelante.</p>}
                    </div>
                  </div>
                  {/*
                  TODO LO QUE VIENE DESPUÉS DEL CUIT, DESHABILITADO HASTA VALIDARLO.

                  Mismo recurso que en Nuevo Usuario: un <fieldset disabled>, que el navegador
                  propaga a todos los controles de adentro. No hay que acordarse de poner `disabled`
                  campo por campo, ni queda ninguno suelto cuando se agregue otro.
                */}
                  <fieldset disabled={bloqueadoHastaValidar} className={`space-y-6 ${bloqueadoHastaValidar ? "opacity-60" : ""}`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>
                          Nombre <span className="text-red-500">*</span>
                        </label>
                        <input className={camposDeArcaBloqueados ? claseArca : inputClass("firstName")} autoComplete="off" placeholder="Ej: Juan" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} disabled={bloqueadoHastaValidar || camposDeArcaBloqueados} title={tituloArca} />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Apellido <span className="text-red-500">*</span>
                        </label>
                        <input className={camposDeArcaBloqueados ? claseArca : inputClass("lastName")} autoComplete="off" placeholder="Ej: Pérez" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} disabled={bloqueadoHastaValidar || camposDeArcaBloqueados} title={tituloArca} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Tipo de Documento</label>
                        <select className={claseArca} value={form.tipoDocumentoId} onChange={(e) => set("tipoDocumentoId", e.target.value)} disabled={!nacionalidadElegida || bloqueadoHastaValidar || camposDeArcaBloqueados} title={tituloArca}>
                          <option value="">Seleccionar...</option>
                          {tiposDocumentoDisponibles.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>
                          Documento <span className="text-red-500">*</span>
                        </label>
                        <input className={camposDeArcaBloqueados ? claseArca : inputClass("documento")} autoComplete="off" placeholder={esArgentino ? "Nº de documento" : "DNI / Pasaporte"} value={form.documento} onChange={(e) => set("documento", e.target.value)} disabled={!nacionalidadElegida || bloqueadoHastaValidar || camposDeArcaBloqueados} title={tituloArca} />
                      </div>
                    </div>
                    {/* Mismo pareo de columnas que Nuevo Usuario: email+contraseña, fecha+nivel, género+estado. */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>
                          Email <span className="text-red-500">*</span>
                        </label>
                        <input type="email" className={inputClass("email")} autoComplete="off" placeholder="usuario@ejemplo.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
                      </div>
                      <div>
                        <label className={labelClass}>
                          Contraseña <span className="text-red-500">*</span>
                        </label>
                        {/*
                      La contraseña la elige la persona.

                      Antes el registro guardaba SIEMPRE el DNI como contraseña: un dato que figura en el
                      contrato, en el CUIT y en cualquier planilla del proyecto, o sea que la credencial
                      de cada quien era pública dentro de la organización.
                    */}
                        <div className="flex items-start gap-2">
                          <div className="relative flex-1 min-w-0">
                            <input type={mostrarPassword ? "text" : "password"} className={`${inputClass("password")} pr-10`} autoComplete="new-password" placeholder="Mínimo 6 caracteres" value={form.password} onChange={(e) => set("password", e.target.value)} />
                            <button type="button" onClick={() => setMostrarPassword((v) => !v)} title={mostrarPassword ? "Ocultar" : "Mostrar"} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400">
                              <FontAwesomeIcon icon={mostrarPassword ? faEyeSlash : faEye} className="h-4 w-4" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              const nueva = generarPassword();
                              set("password", nueva);
                              setMostrarPassword(true);
                              try {
                                await navigator.clipboard.writeText(nueva);
                                sweetAlert.success("Contraseña generada", "Ya está copiada al portapapeles. Guardala: es con la que vas a entrar.");
                              } catch {
                                sweetAlert.success("Contraseña generada", "Guardala antes de continuar: es con la que vas a entrar.");
                              }
                            }}
                            title="Generar una contraseña segura al azar y copiarla al portapapeles"
                            className="shrink-0 inline-flex items-center gap-2 px-3 h-[42px] rounded-lg text-xs font-semibold border border-blue-500/50 text-blue-300 hover:bg-blue-500/10 transition-colors whitespace-nowrap"
                          >
                            <FontAwesomeIcon icon={faWandMagicSparkles} className="h-3 w-3" />
                            Generar
                          </button>
                        </div>
                      </div>
                      {/* El teléfono, con el email: los dos son cómo se contacta a la persona. Estaba en
                      Domicilio —dónde vive— y en Nuevo Usuario ya vive acá. */}
                      <div>
                        <label className={labelClass}>
                          Telefono <span className="text-red-500">*</span>
                        </label>
                        <input className={inputClass("telefono")} autoComplete="off" placeholder="Ej: 11 1234-5678" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>
                          Fecha de Nacimiento <span className="text-red-500">*</span>
                        </label>
                        <input type="date" className={inputClass("fechaNac")} value={form.fechaNac} onChange={(e) => set("fechaNac", e.target.value)} />
                      </div>
                      <div>
                        <label className={labelClass}>Nivel de Estudio</label>
                        <select className={fieldClass} value={form.nivelEstudioId} onChange={(e) => set("nivelEstudioId", e.target.value)}>
                          <option value="">Seleccionar...</option>
                          {nivelesEstudio.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Género</label>
                        <select className={fieldClass} value={form.generoId} onChange={(e) => set("generoId", e.target.value)}>
                          <option value="">Seleccionar...</option>
                          {generos.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Estado civil</label>
                        <select className={fieldClass} value={form.estadoCivil} onChange={(e) => set("estadoCivil", e.target.value)}>
                          <option value="">Seleccionar...</option>
                          <option value="Soltero">Soltero/a</option>
                          <option value="Casado">Casado/a</option>
                          <option value="Divorciado">Divorciado/a</option>
                          <option value="Viudo">Viudo/a</option>
                          <option value="Concubino">Concubino/a</option>
                        </select>
                      </div>
                    </div>
                    {/*
                     * Acá se pedía la Obra social. Se sacó: quien se registra no puede saber qué RNOS le
                     * corresponde ante ARCA, y es un dato de la RELACIÓN LABORAL, no de la persona —
                     * vive en el contrato y se constata en el padrón de la SSS al hacerlo.
                     */}
                    {/* Roles Empresa: la misma grilla de checkboxes que Nuevo Usuario. Son VARIOS a propósito
                    —alguien puede ser Asistente de Cámara en un proyecto y Foquista en otro—, y con un
                    selector de a uno ese dato entraba incompleto y había que arreglarlo a mano después. */}
                    {/*
                  UN CAMPO QUE ABRE UN MODAL, no una grilla incrustada.

                  El listado tiene cientos de especialidades: metido en el formulario ocupaba 300px con
                  scroll propio dentro del scroll de la tarjeta —dos barras anidadas— y obligaba a
                  recorrerlo entero para saber qué había marcado. Acá se ve solo lo elegido.
                */}
                    <div>
                      <label className={labelClass}>
                        Rol/es Empresa <span className="text-red-500">*</span>
                        <InfoRolesEmpresa />
                      </label>
                      {/* El campo abre el selector; lo elegido va DEBAJO, no adentro.
                          Usa `inputClass` y no `fieldClass` para que se pinte de rojo como el resto
                          de los obligatorios cuando se intenta avanzar sin elegir ninguno. */}
                      <button type="button" onClick={() => setRolesEmpresaOpen(true)} className={`${inputClass("rolesFrameIds")} text-left flex items-center gap-2 hover:border-blue-500 transition-colors`}>
                        <span className="text-gray-500">Elegí uno o más roles…</span>
                        <FontAwesomeIcon icon={faSearch} className="h-3 w-3 text-gray-400 ml-auto shrink-0" />
                      </button>
                      {form.rolesFrameIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {form.rolesFrameIds.map((id) => {
                            const rf = rolesFrame.find((x) => String(x.id) === id);
                            return (
                              <span key={id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold bg-blue-900/30 text-blue-300 border border-blue-800">
                                {rf?.name || "Rol"}
                                <button
                                  type="button"
                                  onClick={() =>
                                    set(
                                      "rolesFrameIds",
                                      form.rolesFrameIds.filter((x) => x !== id),
                                    )
                                  }
                                  title={`Quitar ${rf?.name || "rol"}`}
                                  className="rounded-full hover:bg-blue-800/60 p-0.5"
                                >
                                  <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {rolesEmpresaOpen &&
                      createPortal(
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => setRolesEmpresaOpen(false)}>
                          {/* Alto FIJO: con `max-h` el modal se encogía a medida que el filtro reducía la lista, así que
                          escribir en el buscador hacía saltar la ventana y moverse el botón «Listo». */}
                          <div className="w-full max-w-3xl h-[85vh] flex flex-col rounded-xl border border-gray-700 bg-gray-800 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
                              <div>
                                <h3 className="text-sm font-bold text-gray-100">Rol/es Empresa</h3>
                                <p className="text-[11px] text-gray-400 mt-0.5">{form.rolesFrameIds.length} seleccionado(s) · el oficio con el que trabajás en una producción</p>
                              </div>
                              <button type="button" onClick={() => setRolesEmpresaOpen(false)} className="text-gray-400 hover:text-gray-200 text-lg leading-none">
                                ✕
                              </button>
                            </div>
                            {/* Alto fijo para el cuerpo: lo que scrollea es la grilla, no la ventana. */}
                            <div className="flex-1 min-h-0 flex flex-col px-5 py-4">
                              {/* Badges y buscador quedan arriba y fijos: en una lista de cientos, es lo que
                              hay que tener a mano mientras se scrollea. */}
                              <div className="shrink-0 space-y-3 pb-3">
                                {form.rolesFrameIds.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {form.rolesFrameIds.map((id) => {
                                      const rf = rolesFrame.find((x) => String(x.id) === id);
                                      return (
                                        <span key={id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold bg-blue-900/30 text-blue-300 border border-blue-800">
                                          {rf?.name || "Rol"}
                                          <button
                                            type="button"
                                            onClick={() =>
                                              set(
                                                "rolesFrameIds",
                                                form.rolesFrameIds.filter((x) => x !== id),
                                              )
                                            }
                                            title={`Quitar ${rf?.name || "rol"}`}
                                            className="rounded-full hover:bg-blue-800/60 p-0.5"
                                          >
                                            <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                                          </button>
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                                <div className="relative">
                                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <FontAwesomeIcon icon={faSearch} className="h-3.5 w-3.5 text-gray-400" />
                                  </div>
                                  <input type="text" autoFocus value={rolEmpresaBusqueda} onChange={(e) => setRolEmpresaBusqueda(e.target.value)} placeholder="Buscar especialidad..." className={`${fieldClass} pl-9 pr-8`} />
                                  {rolEmpresaBusqueda && (
                                    <button type="button" onClick={() => setRolEmpresaBusqueda("")} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-200">
                                      <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 flex-1 min-h-0 overflow-y-auto content-start pr-1">
                                {rolesFrame
                                  .filter((rf) => fuzzyMatch(rf.name, rolEmpresaBusqueda))
                                  .map((rf) => (
                                    <label key={rf.id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${form.rolesFrameIds.includes(String(rf.id)) ? "bg-blue-900/20 border-blue-800 ring-2 ring-blue-500/20" : "bg-gray-900/40 border-gray-700 hover:border-gray-600"}`}>
                                      <input
                                        type="checkbox"
                                        checked={form.rolesFrameIds.includes(String(rf.id))}
                                        onChange={(e) => {
                                          const id = String(rf.id);
                                          set("rolesFrameIds", e.target.checked ? [...form.rolesFrameIds, id] : form.rolesFrameIds.filter((x) => x !== id));
                                        }}
                                        className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4 shrink-0"
                                      />
                                      <span className="text-xs font-medium text-gray-300 truncate">{rf.name}</span>
                                    </label>
                                  ))}
                                {rolesFrame.filter((rf) => fuzzyMatch(rf.name, rolEmpresaBusqueda)).length === 0 && <div className="col-span-full py-8 text-center text-xs text-gray-500 italic">No se encontraron especialidades que coincidan con "{rolEmpresaBusqueda}"</div>}
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-700 shrink-0">
                              <button type="button" onClick={() => set("rolesFrameIds", [])} disabled={form.rolesFrameIds.length === 0} className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-600 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed">
                                Limpiar
                              </button>
                              <button type="button" onClick={() => setRolesEmpresaOpen(false)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700">
                                Listo
                              </button>
                            </div>
                          </div>
                        </div>,
                        document.body,
                      )}
                  </fieldset>
                </div>
              )}

              {/* Domicilio */}
              {activeTab === "domicilio" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>
                        Pais <span className="text-red-500">*</span>
                      </label>
                      <input className={inputClass("pais")} autoComplete="off" placeholder="Ej: Argentina" value={form.pais} onChange={(e) => set("pais", e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Localidad <span className="text-red-500">*</span>
                      </label>
                      <input className={inputClass("localidad")} autoComplete="off" placeholder="Ej: CABA" value={form.localidad} onChange={(e) => set("localidad", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>
                        Calle <span className="text-red-500">*</span>
                      </label>
                      <input className={inputClass("calle")} autoComplete="off" placeholder="Ej: Av. Libertador" value={form.calle} onChange={(e) => set("calle", e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Altura <span className="text-red-500">*</span>
                      </label>
                      <input className={inputClass("altura")} autoComplete="off" placeholder="Ej: 1234" value={form.altura} onChange={(e) => set("altura", e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      {/* No lleva `*`: una casa a la calle no tiene piso ni depto, y pedirlo obligaba
                          a inventar algo para poder seguir. */}
                      <label className={labelClass}>Piso / Depto</label>
                      <input className={fieldClass} autoComplete="off" placeholder="Ej: 4B" value={form.pisoDepto} onChange={(e) => set("pisoDepto", e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Código postal <span className="text-red-500">*</span>
                      </label>
                      <input className={inputClass("codigoPostal")} autoComplete="off" placeholder="Ej: 1425" value={form.codigoPostal} onChange={(e) => set("codigoPostal", e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Datos bancarios — flujo en cascada según el tipo de entidad */}
              {activeTab === "bancarios" && (
                <div className="space-y-6">
                  {/* Paso 1: tipo de entidad financiera */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>
                        Tipo de Entidad Financiera <span className="text-red-500">*</span>
                      </label>
                      <select className={inputClass("tipoEntidadFinanciera")} value={form.tipoEntidadFinanciera} onChange={(e) => onTipoEntidadChange(e.target.value)}>
                        <option value="">Seleccionar...</option>
                        {TIPO_ENTIDAD_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Aviso al elegir un tipo de entidad real (no aplica a "No tengo Banco", que ya tiene su propia leyenda). */}
                  {form.tipoEntidadFinanciera && form.tipoEntidadFinanciera !== SIN_BANCO && (
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300">
                      <span className="font-semibold">IMPORTANTE:</span> La cuenta debe estar a tu nombre.
                    </div>
                  )}

                  {/* "No tengo Banco": pedido de creación de cuenta + leyenda (sin entidad ni CBU) */}
                  {form.tipoEntidadFinanciera === SIN_BANCO && (
                    <div className={`rounded-lg border bg-gray-800/50 p-5 space-y-3 ${fieldErrors.solicitaCreacionCuenta ? "border-red-500 ring-2 ring-red-500/40" : "border-gray-700"}`}>
                      <label className="flex items-center gap-3 cursor-pointer text-gray-100">
                        <input type="checkbox" className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500" checked={form.solicitaCreacionCuenta} onChange={(e) => set("solicitaCreacionCuenta", e.target.checked)} />
                        <span className="font-medium">Autorizo a que se cree una cuenta bancaria a mi nombre</span>
                      </label>
                      <p className="text-xs text-gray-400 leading-relaxed">La plataforma se encarga del alta de la cuenta. Cuando esté lista, te avisamos con una notificación en la app.</p>
                    </div>
                  )}

                  {/* Paso 2: entidad (aparece al elegir el tipo, filtrada por ese tipo) */}
                  {form.tipoEntidadFinanciera && form.tipoEntidadFinanciera !== SIN_BANCO && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>
                          {labelTipo(form.tipoEntidadFinanciera)} <span className="text-red-500">*</span>
                        </label>
                        <SearchableSelect title={labelTipo(form.tipoEntidadFinanciera)} value={form.bancoId} options={bancosFiltrados} onChange={(v) => set("bancoId", v)} invalid={fieldErrors.bancoId} />
                        {bancosFiltrados.length === 0 && <p className="mt-2 text-xs text-amber-400">No hay entidades cargadas de este tipo. Cargalas en el ABM de Entidades Financieras.</p>}
                      </div>
                    </div>
                  )}

                  {/* Paso 3: datos de la cuenta (aparece al elegir la entidad; los campos dependen del tipo) */}
                  {form.tipoEntidadFinanciera !== SIN_BANCO && form.tipoEntidadFinanciera && form.bancoId && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {camposDe(form.tipoEntidadFinanciera).tipoCuenta && (
                          <div>
                            <label className={labelClass}>
                              Tipo de cuenta <span className="text-red-500">*</span>
                            </label>
                            <select className={inputClass("tipoDeCuentaBancaria")} value={form.tipoDeCuentaBancaria} onChange={(e) => set("tipoDeCuentaBancaria", e.target.value)}>
                              <option value="">Seleccionar...</option>
                              <option value="Caja de ahorro $">Caja de ahorro $</option>
                              <option value="Cuenta Corriente $">Cuenta Corriente $</option>
                              <option value="Caja de ahorro u$s">Caja de ahorro u$s</option>
                            </select>
                          </div>
                        )}
                        <div>
                          <label className={labelClass}>
                            {camposDe(form.tipoEntidadFinanciera).cbuLabel} <span className="text-red-500">*</span>
                          </label>
                          {/*
                            SOLO DÍGITOS, Y EXACTAMENTE 22. Misma regla que «Nuevo Usuario» (`utils/cbu.ts`).

                            Tenía `minLength`/`maxLength` y texto libre: `maxLength` frena el largo pero
                            no el contenido, y `minLength` solo actúa en la validación nativa del
                            formulario, que este flujo no dispara — así que un CBU corto o con letras
                            se enviaba igual. Y acá importa más que en el alta interna: del otro lado
                            hay una persona sola, pegando el número del homebanking, sin nadie a quien
                            preguntarle por qué no le toma lo que copió.
                          */}
                          <input
                            className={inputClass("cbu")}
                            autoComplete="off"
                            inputMode="numeric"
                            placeholder={`${CBU_DIGITOS} dígitos, sin guiones`}
                            value={form.cbu}
                            onChange={(e) => set("cbu", soloDigitosCbu(e.target.value))}
                          />
                          {/* El contador va siempre: es la única regla que hay que cumplir y contar 22
                              dígitos a ojo es lo que nadie hace. */}
                          <p className={`text-[11px] mt-1 ${cbuIncompleto(form.cbu) ? "text-amber-400" : "text-gray-400"}`}>{contadorCbu(form.cbu)}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className={labelClass}>
                            Alias <span className="text-red-500">*</span>
                          </label>
                          <input className={inputClass("aliasBancario")} autoComplete="off" placeholder="Ej: LUNES.MALETA.CUNA" value={form.aliasBancario} onChange={(e) => set("aliasBancario", e.target.value)} />
                        </div>
                        {camposDe(form.tipoEntidadFinanciera).nroCuenta && (
                          <div>
                            <label className={labelClass}>
                              Nro. de cuenta <span className="text-red-500">*</span>
                            </label>
                            <input className={inputClass("nroDeCuentaBancaria")} autoComplete="off" placeholder="Ej: 347-333020/7" value={form.nroDeCuentaBancaria} onChange={(e) => set("nroDeCuentaBancaria", e.target.value)} />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Footer fijo con el botón */}
        <div className="shrink-0 border-t border-gray-700">
          {/* «Anterior» a partir del segundo paso: sin él, revisar algo que quedó atrás obligaba a
            tocar la pestaña del encabezado, que no se lee como parte del recorrido. Ocupa lo que
            necesita y deja el ancho al botón que avanza, que es la acción principal. */}
          <div className="px-6 py-4 flex items-center gap-3">
            {activeTab !== tabs[0].key && (
              <button type="button" onClick={handleBack} disabled={submitting} className="shrink-0 px-6 py-4 rounded-lg text-center font-medium tracking-wide uppercase border border-gray-600 text-gray-300 hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                Anterior
              </button>
            )}
            <button type="button" onClick={handleNext} disabled={submitting || bloqueadoHastaValidar} title={bloqueadoHastaValidar ? "Validá el CUIT para continuar" : undefined} className="flex-1 py-4 rounded-lg text-center text-white font-medium tracking-wide uppercase bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
              {submitting ? "Enviando…" : activeTab === "bancarios" ? "Registrarse" : "Siguiente"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegistroPage;

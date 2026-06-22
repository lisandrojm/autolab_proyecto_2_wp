import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";

type Tab = "general" | "domicilio" | "bancarios";

interface InfoOption {
  id: number | string;
  name: string;
}

interface RegistroForm {
  firstName: string;
  lastName: string;
  email: string;
  cuit: string;
  password: string;
  passwordRepeat: string;
  tipoDocumentoId: string;
  documento: string;
  fechaNac: string;
  generoId: string;
  nivelEstudioId: string;
  nacionalidadId: string;
  osId: string;
  estadoCivil: string;
  rolFrameId: string;
  // Domicilio
  pais: string;
  localidad: string;
  calle: string;
  altura: string;
  pisoDepto: string;
  codigoPostal: string;
  telefono: string;
  telefono2: string;
  visa: boolean;
  // Bancarios
  bancoId: string;
  tipoDeCuentaBancaria: string;
  cbu: string;
  aliasBancario: string;
  nroDeCuentaBancaria: string;
}

const emptyForm: RegistroForm = {
  firstName: "",
  lastName: "",
  email: "",
  cuit: "",
  password: "",
  passwordRepeat: "",
  tipoDocumentoId: "",
  documento: "",
  fechaNac: "",
  generoId: "",
  nivelEstudioId: "",
  nacionalidadId: "",
  osId: "",
  estadoCivil: "",
  rolFrameId: "",
  pais: "",
  localidad: "",
  calle: "",
  altura: "",
  pisoDepto: "",
  codigoPostal: "",
  telefono: "",
  telefono2: "",
  visa: false,
  bancoId: "",
  tipoDeCuentaBancaria: "",
  cbu: "",
  aliasBancario: "",
  nroDeCuentaBancaria: "",
};

const labelClass = "block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2";
const fieldClass = "w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors";

/** Selector con modal y buscador, para listas largas (Nacionalidad, Obra social, Rol frame). */
const SearchableSelect: React.FC<{
  title: string;
  value: string;
  options: InfoOption[];
  onChange: (id: string) => void;
}> = ({ title, value, options, onChange }) => {
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
      <button type="button" onClick={() => { setSearch(""); setOpen(true); }} className={`${fieldClass} flex items-center justify-between text-left`}>
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
                <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-200 text-lg leading-none">✕</button>
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
  const [generos, setGeneros] = useState<InfoOption[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<InfoOption[]>([]);
  const [nivelesEstudio, setNivelesEstudio] = useState<InfoOption[]>([]);
  const [nacionalidades, setNacionalidades] = useState<InfoOption[]>([]);
  const [obrasSociales, setObrasSociales] = useState<InfoOption[]>([]);
  const [bancos, setBancos] = useState<InfoOption[]>([]);
  const [rolesFrame, setRolesFrame] = useState<InfoOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [invalidToken, setInvalidToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setNacionalidades(data.nacionalidades || []);
        setObrasSociales(data.obrasSociales || []);
        setBancos(data.bancos || []);
        setRolesFrame(data.rolesFrame || []);
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
    setError(null);
  };

  const tabs: { key: Tab; label: string }[] = useMemo(
    () => [
      { key: "general", label: "General" },
      { key: "domicilio", label: "Domicilio" },
      { key: "bancarios", label: "Datos bancarios" },
    ],
    [],
  );

  const handleNext = () => {
    if (activeTab === "general") {
      if (!form.firstName || !form.lastName || !form.email || !form.password || !form.passwordRepeat) {
        setError("Completá los campos obligatorios (*).");
        return;
      }
      if (form.password !== form.passwordRepeat) {
        setError("Las contraseñas no coinciden.");
        return;
      }
      if (form.password.length < 6) {
        setError("La contraseña debe tener al menos 6 caracteres.");
        return;
      }
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
    if (form.password !== form.passwordRepeat) {
      setActiveTab("general");
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        token,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
        cuit: form.cuit,
        tipoDocumentoId: form.tipoDocumentoId,
        documento: form.documento,
        fechaNac: form.fechaNac,
        generoId: form.generoId,
        nivelEstudioId: form.nivelEstudioId,
        nacionalidadId: form.nacionalidadId,
        osId: form.osId,
        estadoCivil: form.estadoCivil,
        rolFrameId: form.rolFrameId,
        pais: form.pais,
        localidad: form.localidad,
        calle: form.calle,
        altura: form.altura,
        pisoDepto: form.pisoDepto,
        codigoPostal: form.codigoPostal,
        telefono: form.telefono,
        telefono2: form.telefono2,
        visa: form.visa,
        bancoId: form.bancoId,
        tipoDeCuentaBancaria: form.tipoDeCuentaBancaria,
        cbu: form.cbu,
        aliasBancario: form.aliasBancario,
        nroDeCuentaBancaria: form.nroDeCuentaBancaria,
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
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-gray-400">
        <p>Cargando…</p>
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
          <p className="text-gray-400">Tu cuenta fue creada correctamente. Ya podés iniciar sesión.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-gray-100">
      {/* Header fijo con los tabs */}
      <div className="shrink-0 border-b border-gray-800">
        <div className="max-w-5xl mx-auto px-6 pt-6">
          <h1 className="text-3xl font-light text-gray-100">Registro</h1>
          <p className="text-center text-sm text-red-400 -mt-6 mb-4">Los campos marcados con '*' son obligatorios</p>
          <div className="flex">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`flex-1 py-3 text-sm font-bold border-b-2 transition-all ${
                  activeTab === t.key ? "border-blue-500 text-blue-400 bg-blue-500/5" : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contenido scrolleable */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

          <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
          {/* General */}
          {activeTab === "general" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Nombre como figura en el DNI *</label>
                  <input className={fieldClass} autoComplete="off" placeholder="Ej: Juan" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Apellido como figura en el DNI *</label>
                  <input className={fieldClass} autoComplete="off" placeholder="Ej: Pérez" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Email *</label>
                  <input type="email" className={fieldClass} autoComplete="off" placeholder="usuario@ejemplo.com" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Cuil *</label>
                  <input className={fieldClass} autoComplete="off" placeholder="20-XXXXXXXX-X" value={form.cuit} onChange={(e) => set("cuit", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Contraseña *</label>
                  <input type="password" className={fieldClass} autoComplete="new-password" placeholder="••••••••" minLength={6} value={form.password} onChange={(e) => set("password", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Repetir contraseña *</label>
                  <input type="password" className={fieldClass} autoComplete="new-password" placeholder="••••••••" minLength={6} value={form.passwordRepeat} onChange={(e) => set("passwordRepeat", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Tipo documento</label>
                  <select className={fieldClass} value={form.tipoDocumentoId} onChange={(e) => set("tipoDocumentoId", e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {tiposDocumento.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Documento *</label>
                  <input className={fieldClass} autoComplete="off" placeholder="DNI / Pasaporte" value={form.documento} onChange={(e) => set("documento", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Fecha nacimiento *</label>
                  <input type="date" className={fieldClass} value={form.fechaNac} onChange={(e) => set("fechaNac", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Genero</label>
                  <select className={fieldClass} value={form.generoId} onChange={(e) => set("generoId", e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {generos.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Nivel de estudio</label>
                  <select className={fieldClass} value={form.nivelEstudioId} onChange={(e) => set("nivelEstudioId", e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {nivelesEstudio.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Nacionalidad</label>
                  <SearchableSelect title="Nacionalidad" value={form.nacionalidadId} options={nacionalidades} onChange={(v) => set("nacionalidadId", v)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Obra social</label>
                  <SearchableSelect title="Obra social" value={form.osId} options={obrasSociales} onChange={(v) => set("osId", v)} />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Rol frame</label>
                  <SearchableSelect title="Rol frame" value={form.rolFrameId} options={rolesFrame} onChange={(v) => set("rolFrameId", v)} />
                </div>
              </div>
            </div>
          )}

          {/* Domicilio */}
          {activeTab === "domicilio" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Pais *</label>
                  <input className={fieldClass} autoComplete="off" placeholder="Ej: Argentina" value={form.pais} onChange={(e) => set("pais", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Localidad *</label>
                  <input className={fieldClass} autoComplete="off" placeholder="Ej: CABA" value={form.localidad} onChange={(e) => set("localidad", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Calle *</label>
                  <input className={fieldClass} autoComplete="off" placeholder="Ej: Av. Libertador" value={form.calle} onChange={(e) => set("calle", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Altura *</label>
                  <input className={fieldClass} autoComplete="off" placeholder="Ej: 1234" value={form.altura} onChange={(e) => set("altura", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Piso / Depto *</label>
                  <input className={fieldClass} autoComplete="off" placeholder="Ej: 4B" value={form.pisoDepto} onChange={(e) => set("pisoDepto", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Codigo postal</label>
                  <input className={fieldClass} autoComplete="off" placeholder="Ej: 1425" value={form.codigoPostal} onChange={(e) => set("codigoPostal", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Telefono *</label>
                  <input className={fieldClass} autoComplete="off" placeholder="Ej: 11 1234-5678" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Telefono de emergencia</label>
                  <input className={fieldClass} autoComplete="off" placeholder="Ej: 11 8765-4321" value={form.telefono2} onChange={(e) => set("telefono2", e.target.value)} />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-gray-200">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500" checked={form.visa} onChange={(e) => set("visa", e.target.checked)} />
                <span>Visa</span>
              </label>
            </div>
          )}

          {/* Datos bancarios */}
          {activeTab === "bancarios" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Banco *</label>
                  <SearchableSelect title="Banco" value={form.bancoId} options={bancos} onChange={(v) => set("bancoId", v)} />
                </div>
                <div>
                  <label className={labelClass}>Tipo de cuenta *</label>
                  <select className={fieldClass} value={form.tipoDeCuentaBancaria} onChange={(e) => set("tipoDeCuentaBancaria", e.target.value)}>
                    <option value="">Seleccionar...</option>
                    <option value="Caja de ahorro $">Caja de ahorro $</option>
                    <option value="Cuenta Corriente $">Cuenta Corriente $</option>
                    <option value="Caja de ahorro u$s">Caja de ahorro u$s</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>CBU *</label>
                  <input className={fieldClass} autoComplete="off" placeholder="22 dígitos" minLength={22} maxLength={22} value={form.cbu} onChange={(e) => set("cbu", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Alias *</label>
                  <input className={fieldClass} autoComplete="off" placeholder="Ej: LUNES.MALETA.CUNA" value={form.aliasBancario} onChange={(e) => set("aliasBancario", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Nro. de cuenta *</label>
                  <input className={fieldClass} autoComplete="off" placeholder="Ej: 347-333020/7" value={form.nroDeCuentaBancaria} onChange={(e) => set("nroDeCuentaBancaria", e.target.value)} />
                </div>
              </div>
            </div>
          )}
          </form>
        </div>
      </div>

      {/* Footer fijo con el botón */}
      <div className="shrink-0 border-t border-gray-800">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <button
            type="button"
            onClick={handleNext}
            disabled={submitting}
            className="w-full py-4 rounded-lg text-center text-white font-medium tracking-wide uppercase bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
          >
            {submitting ? "Enviando…" : activeTab === "bancarios" ? "Registrarse" : "Siguiente"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegistroPage;

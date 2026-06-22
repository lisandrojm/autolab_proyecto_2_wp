import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

type Tab = "general" | "domicilio" | "bancarios";

interface InfoOption {
  id: number;
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
  nacionalidad: string;
  obraSocial: string;
  estadoCivil: string;
  rolFrame: string;
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
  banco: string;
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
  nacionalidad: "",
  obraSocial: "",
  estadoCivil: "",
  rolFrame: "",
  pais: "",
  localidad: "",
  calle: "",
  altura: "",
  pisoDepto: "",
  codigoPostal: "",
  telefono: "",
  telefono2: "",
  visa: false,
  banco: "",
  tipoDeCuentaBancaria: "",
  cbu: "",
  aliasBancario: "",
  nroDeCuentaBancaria: "",
};

const labelClass = "block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2";
const fieldClass = "w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-colors";

export const RegistroPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [form, setForm] = useState<RegistroForm>(emptyForm);
  const [generos, setGeneros] = useState<InfoOption[]>([]);
  const [tiposDocumento, setTiposDocumento] = useState<InfoOption[]>([]);
  const [nivelesEstudio, setNivelesEstudio] = useState<InfoOption[]>([]);

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
        nacionalidad: form.nacionalidad,
        obraSocial: form.obraSocial,
        estadoCivil: form.estadoCivil,
        rolFrame: form.rolFrame,
        pais: form.pais,
        localidad: form.localidad,
        calle: form.calle,
        altura: form.altura,
        pisoDepto: form.pisoDepto,
        codigoPostal: form.codigoPostal,
        telefono: form.telefono,
        telefono2: form.telefono2,
        visa: form.visa,
        banco: form.banco,
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
    <div className="min-h-screen bg-gray-900 text-gray-100 pb-28">
      <div className="max-w-5xl mx-auto px-6 pt-8">
        <h1 className="text-3xl font-light text-gray-100">Registro</h1>
        <p className="text-center text-sm text-red-400 -mt-6 mb-6">Los campos marcados con '*' son obligatorios</p>

        {/* Tabs estilo modal */}
        <div className="flex border-b border-gray-700 mb-6">
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

        {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
          {/* General */}
          {activeTab === "general" && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Nombre como figura en el DNI *</label>
                  <input className={fieldClass} autoComplete="off" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Apellido como figura en el DNI *</label>
                  <input className={fieldClass} autoComplete="off" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Email *</label>
                  <input type="email" className={fieldClass} autoComplete="off" value={form.email} onChange={(e) => set("email", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Cuil *</label>
                  <input className={fieldClass} autoComplete="off" value={form.cuit} onChange={(e) => set("cuit", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Contraseña *</label>
                  <input type="password" className={fieldClass} autoComplete="new-password" value={form.password} onChange={(e) => set("password", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Repetir contraseña *</label>
                  <input type="password" className={fieldClass} autoComplete="new-password" value={form.passwordRepeat} onChange={(e) => set("passwordRepeat", e.target.value)} />
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
                  <input className={fieldClass} autoComplete="off" value={form.documento} onChange={(e) => set("documento", e.target.value)} />
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
                  <input className={fieldClass} autoComplete="off" value={form.nacionalidad} onChange={(e) => set("nacionalidad", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Obra social</label>
                  <input className={fieldClass} autoComplete="off" value={form.obraSocial} onChange={(e) => set("obraSocial", e.target.value)} />
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
                  <input className={fieldClass} autoComplete="off" value={form.rolFrame} onChange={(e) => set("rolFrame", e.target.value)} />
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
                  <input className={fieldClass} autoComplete="off" value={form.pais} onChange={(e) => set("pais", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Localidad *</label>
                  <input className={fieldClass} autoComplete="off" value={form.localidad} onChange={(e) => set("localidad", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Calle *</label>
                  <input className={fieldClass} autoComplete="off" value={form.calle} onChange={(e) => set("calle", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Altura *</label>
                  <input className={fieldClass} autoComplete="off" value={form.altura} onChange={(e) => set("altura", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Piso / Depto *</label>
                  <input className={fieldClass} autoComplete="off" value={form.pisoDepto} onChange={(e) => set("pisoDepto", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Codigo postal</label>
                  <input className={fieldClass} autoComplete="off" value={form.codigoPostal} onChange={(e) => set("codigoPostal", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Telefono *</label>
                  <input className={fieldClass} autoComplete="off" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Telefono de emergencia</label>
                  <input className={fieldClass} autoComplete="off" value={form.telefono2} onChange={(e) => set("telefono2", e.target.value)} />
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
                  <input className={fieldClass} autoComplete="off" value={form.banco} onChange={(e) => set("banco", e.target.value)} />
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
                  <input className={fieldClass} autoComplete="off" value={form.cbu} onChange={(e) => set("cbu", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Alias *</label>
                  <input className={fieldClass} autoComplete="off" value={form.aliasBancario} onChange={(e) => set("aliasBancario", e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className={labelClass}>Nro. de cuenta *</label>
                  <input className={fieldClass} autoComplete="off" value={form.nroDeCuentaBancaria} onChange={(e) => set("nroDeCuentaBancaria", e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </form>
      </div>

      {/* Botón fijo inferior */}
      <button
        type="button"
        onClick={handleNext}
        disabled={submitting}
        className="fixed bottom-0 left-0 right-0 py-4 text-center text-white font-medium tracking-wide uppercase bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
      >
        {submitting ? "Enviando…" : activeTab === "bancarios" ? "Registrarse" : "Siguiente"}
      </button>
    </div>
  );
};

export default RegistroPage;

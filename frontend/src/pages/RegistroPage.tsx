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

const inputClass = "w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 focus:border-cyan-400";

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

  // Forzar tema claro en esta página pública
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains("dark");
    root.classList.remove("dark");
    root.classList.add("light");
    return () => {
      if (hadDark) {
        root.classList.remove("light");
        root.classList.add("dark");
      }
    };
  }, []);

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
      // Validaciones mínimas del primer paso
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
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-500">
        <p>Cargando…</p>
      </div>
    );
  }

  if (invalidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-800 mb-2">Link inválido o expirado</h1>
          <p className="text-gray-500">Solicitá un nuevo link de registro al administrador.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-800 mb-2">¡Registro completado!</h1>
          <p className="text-gray-500">Tu cuenta fue creada correctamente. Ya podés iniciar sesión.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-gray-800 pb-24">
      <div className="px-6 pt-6">
        <h1 className="text-3xl font-light text-gray-700">Registro</h1>
        <p className="text-center text-sm text-red-500 -mt-6 mb-4">Los campos marcados con '*' son obligatorios</p>

        {/* Tabs */}
        <div className="flex gap-1 mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-3 text-center text-sm rounded-md transition-colors ${
                activeTab === t.key ? "bg-white text-gray-800 border border-gray-300 shadow-sm font-medium" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

        {/* General */}
        {activeTab === "general" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className={inputClass} placeholder="Nombre como figura en el DNI*" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
              <input className={inputClass} placeholder="Apellido como figura en el DNI*" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="email" className={inputClass} placeholder="Email*" value={form.email} onChange={(e) => set("email", e.target.value)} />
              <input className={inputClass} placeholder="Cuil *" value={form.cuit} onChange={(e) => set("cuit", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="password" className={inputClass} placeholder="Contraseña*" value={form.password} onChange={(e) => set("password", e.target.value)} />
              <input type="password" className={inputClass} placeholder="Repetir contraseña*" value={form.passwordRepeat} onChange={(e) => set("passwordRepeat", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select className={`${inputClass} ${form.tipoDocumentoId ? "text-gray-700" : "text-gray-400"}`} value={form.tipoDocumentoId} onChange={(e) => set("tipoDocumentoId", e.target.value)}>
                <option value="">Tipo documento</option>
                {tiposDocumento.map((o) => (
                  <option key={o.id} value={o.id} className="text-gray-700">
                    {o.name}
                  </option>
                ))}
              </select>
              <input className={inputClass} placeholder="Documento*" value={form.documento} onChange={(e) => set("documento", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Fecha nacimiento *</label>
                <input type="date" className={`${inputClass} ${form.fechaNac ? "text-gray-700" : "text-gray-400"}`} placeholder="DD/MM/AAAA" value={form.fechaNac} onChange={(e) => set("fechaNac", e.target.value)} />
              </div>
              <select className={`${inputClass} ${form.generoId ? "text-gray-700" : "text-gray-400"}`} value={form.generoId} onChange={(e) => set("generoId", e.target.value)}>
                <option value="">Genero</option>
                {generos.map((o) => (
                  <option key={o.id} value={o.id} className="text-gray-700">
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select className={`${inputClass} ${form.nivelEstudioId ? "text-gray-700" : "text-gray-400"}`} value={form.nivelEstudioId} onChange={(e) => set("nivelEstudioId", e.target.value)}>
                <option value="">Nivel de estudio</option>
                {nivelesEstudio.map((o) => (
                  <option key={o.id} value={o.id} className="text-gray-700">
                    {o.name}
                  </option>
                ))}
              </select>
              <input className={inputClass} placeholder="Nacionalidad" value={form.nacionalidad} onChange={(e) => set("nacionalidad", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className={inputClass} placeholder="Obra social" value={form.obraSocial} onChange={(e) => set("obraSocial", e.target.value)} />
              <select className={`${inputClass} ${form.estadoCivil ? "text-gray-700" : "text-gray-400"}`} value={form.estadoCivil} onChange={(e) => set("estadoCivil", e.target.value)}>
                <option value="">Estado civil</option>
                <option value="Soltero" className="text-gray-700">Soltero/a</option>
                <option value="Casado" className="text-gray-700">Casado/a</option>
                <option value="Divorciado" className="text-gray-700">Divorciado/a</option>
                <option value="Viudo" className="text-gray-700">Viudo/a</option>
                <option value="Concubino" className="text-gray-700">Concubino/a</option>
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className={inputClass} placeholder="Rol frame" value={form.rolFrame} onChange={(e) => set("rolFrame", e.target.value)} />
            </div>
          </div>
        )}

        {/* Domicilio */}
        {activeTab === "domicilio" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className={inputClass} placeholder="Pais*" value={form.pais} onChange={(e) => set("pais", e.target.value)} />
              <input className={inputClass} placeholder="Localidad*" value={form.localidad} onChange={(e) => set("localidad", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className={inputClass} placeholder="Calle*" value={form.calle} onChange={(e) => set("calle", e.target.value)} />
              <input className={inputClass} placeholder="Altura*" value={form.altura} onChange={(e) => set("altura", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className={inputClass} placeholder="Piso / Depto*" value={form.pisoDepto} onChange={(e) => set("pisoDepto", e.target.value)} />
              <input className={inputClass} placeholder="Codigo postal" value={form.codigoPostal} onChange={(e) => set("codigoPostal", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className={inputClass} placeholder="Telefono*" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />
              <input className={inputClass} placeholder="Telefono de emergencia" value={form.telefono2} onChange={(e) => set("telefono2", e.target.value)} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer text-gray-700">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400" checked={form.visa} onChange={(e) => set("visa", e.target.checked)} />
              <span>Visa</span>
            </label>
          </div>
        )}

        {/* Datos bancarios */}
        {activeTab === "bancarios" && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className={inputClass} placeholder="Banco*" value={form.banco} onChange={(e) => set("banco", e.target.value)} />
              <select className={`${inputClass} ${form.tipoDeCuentaBancaria ? "text-gray-700" : "text-gray-400"}`} value={form.tipoDeCuentaBancaria} onChange={(e) => set("tipoDeCuentaBancaria", e.target.value)}>
                <option value="">Tipo de cuenta*</option>
                <option value="Caja de ahorro $" className="text-gray-700">Caja de ahorro $</option>
                <option value="Cuenta Corriente $" className="text-gray-700">Cuenta Corriente $</option>
                <option value="Caja de ahorro u$s" className="text-gray-700">Caja de ahorro u$s</option>
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className={inputClass} placeholder="CBU*" value={form.cbu} onChange={(e) => set("cbu", e.target.value)} />
              <input className={inputClass} placeholder="Alias*" value={form.aliasBancario} onChange={(e) => set("aliasBancario", e.target.value)} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input className={inputClass} placeholder="Nro. de cuenta*" value={form.nroDeCuentaBancaria} onChange={(e) => set("nroDeCuentaBancaria", e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {/* Botón fijo inferior */}
      <button
        type="button"
        onClick={handleNext}
        disabled={submitting}
        className="fixed bottom-0 left-0 right-0 py-4 text-center text-white font-medium tracking-wide uppercase bg-[#5bc0cf] hover:bg-[#4fb3c2] disabled:opacity-60 transition-colors"
      >
        {submitting ? "Enviando…" : "Siguiente"}
      </button>
    </div>
  );
};

export default RegistroPage;

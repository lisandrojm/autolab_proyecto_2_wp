import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileSignature, faSpinner, faCheck, faTriangleExclamation, faEnvelope } from "@fortawesome/free-solid-svg-icons";
import { dropboxSignAPI, DropboxSignConfig } from "../api/dropboxSign";
import { PageLayout } from "../components/ui/PageLayout";
import { sweetAlert } from "../utils/sweetAlert";

const fmtFechaHora = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/**
 * "DropboxSign | Firmas": casilla de correo que recibe las copias de "documento enviado" de Dropbox
 * Sign. Es lo que permite detectar qué contratos ya se mandaron a firmar y moverlos de "Outbox" a
 * "Pendbox" — o sea, lo que separa la bandeja "Para Firmar" de "Pendiente de firma".
 */
export const DropboxSignConfigPage: React.FC = () => {
  const [cfg, setCfg] = useState<DropboxSignConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  /** Explicación de para qué sirve la casilla (modal del ⓘ de la cabecera). */
  const [showInfo, setShowInfo] = useState(false);
  const [form, setForm] = useState({ email: "", imapHost: "", imapPort: 993, imapSecure: true, imapUser: "", imapPassword: "", enabled: false });

  const cargar = async () => {
    setLoading(true);
    try {
      const c = await dropboxSignAPI.config();
      setCfg(c);
      setForm({ email: c.email, imapHost: c.imapHost, imapPort: c.imapPort, imapSecure: c.imapSecure, imapUser: c.imapUser, imapPassword: "", enabled: c.enabled });
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo cargar la configuración.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const guardar = async () => {
    setGuardando(true);
    try {
      await dropboxSignAPI.save({ ...form, imapPassword: form.imapPassword || undefined });
      sweetAlert.success("Guardado", "La configuración se guardó correctamente.");
      await cargar();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo guardar la configuración.");
    } finally {
      setGuardando(false);
    }
  };

  const inputClass = "w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30";
  const labelClass = "block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1";

  return (
    <PageLayout
      title="DropboxSign | Firmas"
      subtitle="Casilla que recibe los avisos de envío a firmar de Dropbox Sign"
      faIcon={{ icon: faFileSignature }}
      shouldShowInfo
      infoModal={{
        isOpen: showInfo,
        onOpen: () => setShowInfo(true),
        onClose: () => setShowInfo(false),
        title: "Para qué sirve esta casilla",
        content: (
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <p>
              Dropbox Sign no avisa por API qué contratos ya se enviaron a firmar, pero sí manda una <strong>copia por correo de cada envío</strong> (se activa en Dropbox Sign → Configuración → Perfil →
              Notificaciones, sin costo).
            </p>
            <p>
              Leyendo esa casilla, el sistema detecta el envío, identifica el contrato con el mismo criterio de siempre (CUIT en el nombre del archivo, después CUIT dentro del PDF, después nombre y
              apellido) y mueve el archivo de <span className="font-mono text-xs">Outbox</span> a <span className="font-mono text-xs">Pendbox</span>. Eso es lo que hace avanzar el contrato de{" "}
              <strong>Para Firmar</strong> a <strong>Pendiente de firma</strong>, y evita que se mande a firmar dos veces.
            </p>
            <p className="flex items-start gap-1.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Si no logra identificar exactamente un contrato, no mueve nada — nunca adivina, igual que el escaneo de carpetas.</span>
            </p>
          </div>
        ),
      }}
    >
      {loading ? (
        <div className="flex justify-center py-16 text-gray-400">
          <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Cargando...
        </div>
      ) : (
        <div className="space-y-4 max-w-3xl">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Casilla de correo</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Correo que recibe los avisos</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="rrhh@frame.com.ar" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Usuario IMAP (si es distinto del correo)</label>
                <input type="text" value={form.imapUser} onChange={(e) => setForm((f) => ({ ...f, imapUser: e.target.value }))} placeholder="Se usa el correo si lo dejás vacío" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Servidor IMAP</label>
                <input type="text" value={form.imapHost} onChange={(e) => setForm((f) => ({ ...f, imapHost: e.target.value }))} placeholder="mail.frame.com.ar" className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Puerto</label>
                  <input type="number" value={form.imapPort} onChange={(e) => setForm((f) => ({ ...f, imapPort: Number(e.target.value) }))} className={inputClass} />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
                    <input type="checkbox" checked={form.imapSecure} onChange={(e) => setForm((f) => ({ ...f, imapSecure: e.target.checked }))} className="rounded border-gray-300" />
                    SSL/TLS
                  </label>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Contraseña de la casilla</label>
                <input
                  type="password"
                  value={form.imapPassword}
                  onChange={(e) => setForm((f) => ({ ...f, imapPassword: e.target.value }))}
                  placeholder={cfg?.tienePassword ? "•••••••• (guardada — completá solo si la querés cambiar)" : "Contraseña o clave de aplicación"}
                  className={inputClass}
                  autoComplete="new-password"
                />
                <p className="text-[11px] text-gray-400 mt-1">Se guarda cifrada y nunca se devuelve al navegador.</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} className="rounded border-gray-300" />
                Activar la lectura automática de la casilla
              </label>
              <button type="button" onClick={guardar} disabled={guardando} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                <FontAwesomeIcon icon={guardando ? faSpinner : faCheck} spin={guardando} className="h-4 w-4" />
                Guardar
              </button>
            </div>
          </div>

          {cfg?.configuredAt && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-2 text-sm">
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Estado</p>
              <p className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <FontAwesomeIcon icon={faEnvelope} className="h-3.5 w-3.5 text-gray-400" />
                Configurada el {fmtFechaHora(cfg.configuredAt)} · lectura {cfg.enabled ? <span className="text-green-600 dark:text-green-400 font-semibold">activada</span> : <span className="text-gray-500">desactivada</span>}
              </p>
              <p className="text-gray-600 dark:text-gray-300">
                Última lectura: {fmtFechaHora(cfg.lastCheckAt)}
                {cfg.lastCheckOk === false && cfg.lastCheckDetalle ? <span className="text-red-600 dark:text-red-400"> — {cfg.lastCheckDetalle}</span> : null}
              </p>
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
};

export default DropboxSignConfigPage;

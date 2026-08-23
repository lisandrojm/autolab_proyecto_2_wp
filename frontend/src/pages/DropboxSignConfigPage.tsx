import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faCheck, faTriangleExclamation, faEnvelope, faInbox, faListUl, faCircleCheck, faCircleMinus, faFolderOpen, faBan, faCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { faDropbox } from "@fortawesome/free-brands-svg-icons";
import { dropboxSignAPI, DropboxSignConfig, LineaLog, CorridaLog } from "../api/dropboxSign";
import { InfoModal } from "../components/ui/InfoModal";
import { PageLayout } from "../components/ui/PageLayout";
import { sweetAlert } from "../utils/sweetAlert";

const fmtFechaHora = (iso?: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/**
 * "DropboxSign": casilla de correo que recibe las copias de "documento enviado" de Dropbox
 * Sign. Es lo que permite detectar qué contratos ya se mandaron a firmar y moverlos de "Outbox" a
 * "Pendbox" — o sea, lo que separa la bandeja "Para Firmar" de "Enviado a la firma".
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

  /** Corre la lectura de la casilla: `prueba` solo verifica la conexión, sin escribir en Dropbox. */
  const [leyendo, setLeyendo] = useState<'prueba' | 'real' | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const leerAhora = async (prueba: boolean) => {
    setLeyendo(prueba ? 'prueba' : 'real');
    try {
      const r = await dropboxSignAPI.leer(prueba);
      if (r.ok) sweetAlert.success(prueba ? 'Conexión OK' : 'Lectura completa', r.detalle);
      else sweetAlert.error(prueba ? 'No se pudo conectar' : 'Lectura con problemas', r.detalle);
      if (!prueba) await cargar();
    } catch (e: any) {
      sweetAlert.error('Error', e?.response?.data?.error || 'No se pudo leer la casilla.');
    } finally {
      setLeyendo(null);
    }
  };

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
      // Igual que en Dropbox: el menú dice "DropboxSign" y el "| Email" que llevaba el ítem se
      // explica acá, donde hay lugar para decir qué casilla es y por qué hace falta.
      title="DropboxSign"
      subtitle="La casilla de correo que recibe los avisos de envío a firmar"
      faIcon={{ icon: faDropbox }}
      shouldShowInfo
      infoModal={{
        isOpen: showInfo,
        onOpen: () => setShowInfo(true),
        onClose: () => setShowInfo(false),
        title: "DropboxSign: la casilla de avisos",
        content: (
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <p className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300">
              Esta pantalla configura un <strong>correo</strong>, no la cuenta de Dropbox: la conexión con Dropbox y el escaneo de carpetas se configuran en <strong>Dropbox</strong>. Acá se define la
              casilla donde llegan los avisos de Dropbox Sign, que es lo que marca un contrato como enviado a firmar.
            </p>
            <p>
              Dropbox Sign no avisa por API qué contratos ya se enviaron a firmar, pero sí manda una <strong>copia por correo de cada envío</strong> (se activa en Dropbox Sign → Configuración → Perfil →
              Notificaciones, sin costo).
            </p>
            <p>
              El sistema lee el <strong>asunto</strong> del aviso (“Se inició el proceso de firma de…”), que trae el <strong>nombre del archivo</strong>, y de ahí saca el CUIT de la persona. No abre el
              PDF ni los adjuntos.
            </p>
            {/* De qué depende. Misma explicación que en Nomenclatura de archivos y en Dropbox, contada
                desde acá — con el agregado propio de esta pantalla: el asunto pasa por Dropbox Sign,
                que transforma algunos caracteres, así que el nombre no se compara entero. */}
            <p className="flex items-start gap-1.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                O sea que esto depende de <strong>lo que diga el nombre del archivo</strong>, igual que el escaneo de carpetas. Y con una vuelta más: el nombre viaja por el asunto de un correo que pasó
                por Dropbox Sign, que transforma algunos caracteres —por eso el <strong>«@» del email se escribe como «-ARROBA-»</strong> y el nombre nunca se compara entero, solo se buscan los datos
                que identifican. Qué lleva cada nombre se define en <strong>Plantillas → Nomenclatura de archivos</strong>.
              </span>
            </p>
            <p>
              Con esos datos busca el archivo en <span className="font-mono text-xs">Outbox</span> y, si está, lo <strong>mueve a</strong> <span className="font-mono text-xs">Pendbox</span>. Ese
              movimiento es el único efecto: no se genera ningún archivo extra. Es lo que hace avanzar el contrato de <strong>Para Firmar</strong> a <strong>Enviado a la firma</strong>, y evita que se
              mande a firmar dos veces.
            </p>
            <p className="flex items-start gap-1.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Si el documento no está en <span className="font-mono text-xs">Outbox</span>, o si ya está en <span className="font-mono text-xs">Pendbox</span>, el aviso se saltea — nunca
                adivina ni mueve dos veces, igual que el escaneo de carpetas.
              </span>
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
              <div className="flex items-center gap-2">
                {/* Probar = solo conecta y cuenta avisos. Leer ahora = procesa y archiva en Pendbox. */}
                <button type="button" onClick={() => leerAhora(true)} disabled={!!leyendo || guardando} title="Conecta a la casilla y cuenta los avisos pendientes, sin escribir nada" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  <FontAwesomeIcon icon={leyendo === 'prueba' ? faSpinner : faEnvelope} spin={leyendo === 'prueba'} className="h-4 w-4" />
                  Probar conexión
                </button>
                <button type="button" onClick={() => leerAhora(false)} disabled={!!leyendo || guardando} title="Lee la casilla y archiva en Pendbox los avisos de envío a firmar" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-gray-700 text-white hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 disabled:opacity-50 transition-colors">
                  <FontAwesomeIcon icon={leyendo === 'real' ? faSpinner : faInbox} spin={leyendo === 'real'} className="h-4 w-4" />
                  Leer ahora
                </button>
                {/* Detalle aviso por aviso: sirve para entender por qué un documento no se movió. */}
                <button
                  type="button"
                  onClick={() => setShowLogs(true)}
                  disabled={!cfg?.lastCheckAt}
                  title={cfg?.lastCheckAt ? "Ver qué pasó con cada aviso en la última lectura" : "Todavía no se corrió ninguna lectura"}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  <FontAwesomeIcon icon={faListUl} className="h-4 w-4" />
                  Logs
                  {cfg?.lastCheckHistorial?.length ? <span className="text-xs font-bold text-gray-500 dark:text-gray-400">({cfg.lastCheckHistorial.length})</span> : null}
                </button>
                <button type="button" onClick={guardar} disabled={guardando} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  <FontAwesomeIcon icon={guardando ? faSpinner : faCheck} spin={guardando} className="h-4 w-4" />
                  Guardar
                </button>
              </div>
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

      <InfoModal
        isOpen={showLogs}
        onClose={() => setShowLogs(false)}
        title="Logs de lecturas"
        subtitle={`Últimas ${cfg?.lastCheckHistorial?.length || 0} lecturas con actividad · la más reciente arriba`}
        size="xl"
        actions={[{ label: "Cerrar", onClick: () => setShowLogs(false), variant: "ghost" }]}
      >
        <HistorialLecturas corridas={cfg?.lastCheckHistorial || []} />
      </InfoModal>
    </PageLayout>
  );
};

/** Cómo se presenta cada resultado posible: color, ícono y qué significa. */
const ESTILO_LOG: Record<LineaLog["resultado"], { label: string; icon: any; clase: string; ayuda: string }> = {
  archivado: { label: "Movido a Pendbox", icon: faCircleCheck, clase: "text-green-600 dark:text-green-400", ayuda: "El PDF pasó de Outbox a Pendbox: el contrato queda como enviado a la firma." },
  duplicado: { label: "Ya estaba", icon: faCircleMinus, clase: "text-gray-500 dark:text-gray-400", ayuda: "El documento ya estaba en Pendbox, así que no se volvió a mover." },
  "sin-archivo": { label: "Sin PDF en Outbox", icon: faFolderOpen, clase: "text-amber-600 dark:text-amber-400", ayuda: "Llegó el aviso pero el documento no está en Outbox, así que no hay nada que mover." },
  ignorado: { label: "No es un envío", icon: faBan, clase: "text-gray-400 dark:text-gray-500", ayuda: "El asunto no corresponde a un envío a firmar (avisos de firmado, resúmenes, etc.)." },
  error: { label: "Error", icon: faCircleXmark, clase: "text-red-600 dark:text-red-400", ayuda: "Falló algún paso al procesar este aviso." },
};

/** Las líneas de una corrida, agrupadas por resultado. */
const LineasCorrida: React.FC<{ logs: LineaLog[] }> = ({ logs }) => {
  const orden: LineaLog["resultado"][] = ["archivado", "sin-archivo", "error", "duplicado", "ignorado"];
  const grupos = orden.map((r) => ({ resultado: r, items: logs.filter((l) => l.resultado === r) })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {grupos.map((g) => {
        const est = ESTILO_LOG[g.resultado];
        return (
          <div key={g.resultado}>
            <p className={`flex items-center gap-2 text-sm font-bold ${est.clase}`}>
              <FontAwesomeIcon icon={est.icon} className="h-4 w-4" />
              {est.label}
              <span className="text-xs font-semibold text-gray-400">({g.items.length})</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">{est.ayuda}</p>
            <div className="space-y-2">
              {g.items.map((l, i) => (
                <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-2.5 text-xs space-y-1">
                  {/* break-all + whitespace-pre-wrap: los nombres son largos y hay que poder leerlos enteros. */}
                  {l.archivo && <p className="font-mono text-gray-700 dark:text-gray-200 break-all whitespace-pre-wrap">{l.archivo}</p>}
                  {l.asunto && l.asunto !== l.archivo && <p className="text-gray-500 dark:text-gray-400 break-all whitespace-pre-wrap">Asunto: {l.asunto}</p>}
                  {(l.cuit || l.documento) && (
                    <p className="text-gray-500 dark:text-gray-400">
                      {l.cuit ? `CUIL ${l.cuit}` : "sin CUIL"}
                      {l.documento ? ` · Doc ${l.documento}` : ""}
                    </p>
                  )}
                  {l.detalle && <p className="text-gray-600 dark:text-gray-300 break-words whitespace-pre-wrap">{l.detalle}</p>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** Historial de lecturas: una sección por corrida, de la más reciente a la más vieja. */
const HistorialLecturas: React.FC<{ corridas: CorridaLog[] }> = ({ corridas }) => {
  if (!corridas.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Todavía no hay lecturas con actividad. Solo se guardan las corridas que encontraron algún aviso o que fallaron — las que no tienen nada que informar no se registran. Si esperabas ver alguna,
        revisá que el envío a firmar tenga en copia al correo configurado acá y que haya ocurrido dentro de los últimos 30 días.
      </p>
    );
  }

  return (
    <div className="max-h-[65vh] overflow-y-auto pr-1 space-y-4">
      {corridas.map((c, idx) => (
        <div key={idx} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
          <div className="flex items-start gap-2 mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
            <FontAwesomeIcon icon={c.ok ? faCircleCheck : faCircleXmark} className={`h-4 w-4 mt-0.5 shrink-0 ${c.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{fmtFechaHora(c.at)}</p>
              {c.detalle && <p className="text-xs text-gray-500 dark:text-gray-400 break-words whitespace-pre-wrap">{c.detalle}</p>}
            </div>
          </div>
          {c.logs?.length ? <LineasCorrida logs={c.logs} /> : <p className="text-xs text-gray-400">Sin detalle por aviso.</p>}
        </div>
      ))}
    </div>
  );
};

export default DropboxSignConfigPage;

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faCheck, faPaperPlane, faStop, faListUl, faListCheck, faTriangleExclamation, faCircleCheck, faCircleXmark, faRobot, faFlask } from "@fortawesome/free-solid-svg-icons";
import { dropboxSignBotAPI, type BotConfig, type BotCola, type BotCorrida, type BotLog, type BotEnvioRegistro, type BotLinea } from "../../api/dropboxSign";
import { InfoModal } from "../ui/InfoModal";
import { sweetAlert } from "../../utils/sweetAlert";

/*
  «ENVÍO AUTOMÁTICO A LA FIRMA» (22/10/2026): el bot que manda a firmar, por la web de Dropbox Sign,
  los documentos del tab «Para Firmar» (Outbox), sin que nadie entre más a app.sign.dropbox.com.
  Acá se configuran la cuenta, el throttle (la web frena a los ~55-60 envíos por día) y se sigue la
  corrida en vivo. El circuito IMAP de arriba sigue igual: con el CC correcto, mueve lo enviado a Pendbox.
*/

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const POLL_MS = 2000;

const ESTADO_LINEA: Record<BotLinea["estado"], { label: string; clase: string }> = {
  enviado: { label: "Enviado", clase: "text-green-600 dark:text-green-400" },
  seco: { label: "[SECO] listo", clase: "text-blue-600 dark:text-blue-400" },
  error: { label: "Error", clase: "text-red-600 dark:text-red-400" },
  limite: { label: "Límite de Dropbox Sign", clase: "text-amber-600 dark:text-amber-400" },
  requiere_revision: { label: "Requiere revisión", clase: "text-amber-600 dark:text-amber-400" },
  salteado: { label: "Ya enviado", clase: "text-gray-500" },
};

export const EnvioAutomaticoCard: React.FC = () => {
  const [cfg, setCfg] = useState<BotConfig | null>(null);
  const [form, setForm] = useState({ loginEmail: "", loginPassword: "", activo: false, tamanoTanda: 10, intervaloHoras: 4, topeDiario: 40, enfriamientoHoras: 6, horaDesde: 8, horaHasta: 22 });
  const [guardando, setGuardando] = useState(false);
  const [corrida, setCorrida] = useState<BotCorrida | null>(null);
  const [arrancando, setArrancando] = useState(false);
  const [cola, setCola] = useState<{ abierta: boolean; cargando: boolean; datos: BotCola | null }>({ abierta: false, cargando: false, datos: null });
  const [logs, setLogs] = useState<{ abiertos: boolean; cargando: boolean; datos: { logs: BotLog[]; requierenRevision: BotEnvioRegistro[] } | null }>({ abiertos: false, cargando: false, datos: null });
  const [revision, setRevision] = useState<BotEnvioRegistro[]>([]);
  const intervalo = useRef<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const c = await dropboxSignBotAPI.config();
      setCfg(c);
      setForm((f) => ({ ...f, loginEmail: c.loginEmail, loginPassword: "", ...c.envio }));
      const l = await dropboxSignBotAPI.logs().catch(() => null);
      if (l) setRevision(l.requierenRevision.filter((r) => r.estado === "requiere_revision"));
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo cargar el envío automático.");
    }
  }, []);

  const parar = useCallback(() => {
    if (intervalo.current) window.clearInterval(intervalo.current);
    intervalo.current = null;
  }, []);
  const consultar = useCallback(async () => {
    const r = await dropboxSignBotAPI.corrida().catch(() => null);
    if (!r) return;
    setCorrida(r);
    if (!r.corriendo) {
      parar();
      void cargar();
    }
  }, [parar, cargar]);
  const seguir = useCallback(() => {
    parar();
    void consultar();
    intervalo.current = window.setInterval(consultar, POLL_MS);
  }, [consultar, parar]);

  useEffect(() => {
    void cargar();
    void consultar();
    return parar;
  }, [cargar, consultar, parar]);
  useEffect(() => {
    if (cfg?.corriendo && !intervalo.current) seguir();
  }, [cfg?.corriendo, seguir]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const { loginEmail, loginPassword, ...envio } = form;
      const r = await dropboxSignBotAPI.save({ loginEmail: loginEmail || undefined, loginPassword: loginPassword || undefined, envio });
      setCfg(r);
      setForm((f) => ({ ...f, loginPassword: "" }));
      sweetAlert.success("Guardado", "La configuración del envío automático se guardó.");
    } catch (e: any) {
      sweetAlert.error("No se pudo guardar", e?.response?.data?.error || e?.message || "");
      void cargar();
    } finally {
      setGuardando(false);
    }
  };

  const arrancar = async (enSeco: boolean) => {
    const seco = enSeco || !!cfg?.enSecoForzado;
    const r = await sweetAlert.confirm(
      seco ? "Probar una tanda en seco" : "Enviar una tanda a firmar ahora",
      seco
        ? "Recorre todo el flujo en Dropbox Sign (cargar, firmante, campo de firma, CC y título) y se detiene antes de «Enviar para firmar». No se envía nada."
        : `Se envían hasta ${form.tamanoTanda} documentos del Outbox (quedan ${cfg?.cupoHoy ?? "?"} de cupo hoy), con el título exacto del archivo y CC a ${cfg?.cc || "la casilla configurada"}. Cada envío es irreversible.`,
      seco ? "Sí, probar" : "Sí, enviar",
    );
    if (!r.isConfirmed) return;
    setArrancando(true);
    try {
      await dropboxSignBotAPI.arrancar(enSeco);
      seguir();
    } catch (e: any) {
      sweetAlert.error("No se pudo arrancar", e?.response?.data?.error || e?.message || "");
    } finally {
      setArrancando(false);
    }
  };

  const detener = async () => {
    try {
      const r = await dropboxSignBotAPI.detener();
      if (!r.ok) sweetAlert.info("No hay nada que detener", r.motivo || "");
    } catch (e: any) {
      sweetAlert.error("No se pudo detener", e?.response?.data?.error || "");
    }
  };

  const verCola = async () => {
    setCola({ abierta: true, cargando: true, datos: null });
    try {
      setCola({ abierta: true, cargando: false, datos: await dropboxSignBotAPI.cola() });
    } catch (e: any) {
      setCola({ abierta: false, cargando: false, datos: null });
      sweetAlert.error("No se pudo armar la cola", e?.response?.data?.error || e?.message || "");
    }
  };
  const verLogs = async () => {
    setLogs({ abiertos: true, cargando: true, datos: null });
    try {
      setLogs({ abiertos: true, cargando: false, datos: await dropboxSignBotAPI.logs() });
    } catch (e: any) {
      setLogs({ abiertos: false, cargando: false, datos: null });
      sweetAlert.error("No se pudieron cargar los logs", e?.response?.data?.error || "");
    }
  };

  const inputClass = "w-full px-3 py-2 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30";
  const labelClass = "block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1";
  const num = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: Number(e.target.value) }));
  const corriendo = !!corrida?.corriendo;
  const puedeOperar = !!cfg && (cfg.tieneSesion || cfg.tienePassword);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <FontAwesomeIcon icon={faRobot} /> Envío automático a la firma
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Un navegador del servidor entra a Dropbox Sign y manda a firmar los documentos de <strong>Para Firmar</strong> (Outbox): título = nombre exacto del archivo, firmante desde la base, CC a{" "}
            <span className="font-mono">{cfg?.cc || "la casilla de arriba"}</span>. Dropbox Sign frena a los ~55-60 envíos por día: por eso va por tandas.
          </p>
        </div>
        {cfg?.enSecoForzado && (
          <span className="shrink-0 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300" title="DROPBOX_SIGN_BOT_EN_SECO: en este servidor no se aprieta «Enviar para firmar»">
            Modo seco en este servidor
          </span>
        )}
      </div>

      {/* Cuenta y sesión */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Usuario de Dropbox Sign (correo)</label>
          <input type="email" value={form.loginEmail} onChange={(e) => setForm((f) => ({ ...f, loginEmail: e.target.value }))} className={inputClass} autoComplete="off" />
        </div>
        <div>
          <label className={labelClass}>Contraseña</label>
          <input type="password" value={form.loginPassword} onChange={(e) => setForm((f) => ({ ...f, loginPassword: e.target.value }))} placeholder={cfg?.tienePassword ? "•••••••• (guardada — completá solo si la querés cambiar)" : "Se guarda cifrada; nunca vuelve al navegador"} className={inputClass} autoComplete="new-password" />
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">
        <p>
          Sesión guardada: {cfg?.tieneSesion ? <span className="text-green-600 dark:text-green-400 font-semibold">sí</span> : <span className="text-amber-600 dark:text-amber-400 font-semibold">no</span>}
          {cfg?.sesionGuardadaAt ? ` · renovada ${fmt(cfg.sesionGuardadaAt)}` : ""}
          {cfg?.ultimoLoginAt ? ` · último login ${fmt(cfg.ultimoLoginAt)}` : ""}
        </p>
        {cfg?.ultimoError && (
          <p className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
            <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 shrink-0" />
            <span>
              {cfg.ultimoError}
              {/captcha|c[oó]digo|segundo factor|login manual/i.test(cfg.ultimoError) && (
                <>
                  {" "}
                  <strong>Repetir login manual:</strong> en el servidor, dentro de <span className="font-mono">server/</span>: <span className="font-mono">TENANT=&lt;slug&gt; npm run dropbox-sign:login</span>
                </>
              )}
            </span>
          </p>
        )}
        {!cfg?.tieneSesion && (
          <p>
            La primera vez la sesión se captura con una ventana, para resolver el captcha a mano: en el servidor, <span className="font-mono">TENANT=&lt;slug&gt; npm run dropbox-sign:login</span>. Después el bot corre solo y la renueva en cada corrida.
          </p>
        )}
      </div>

      {/* Throttle */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div>
          <label className={labelClass}>Tanda</label>
          <input type="number" min={1} max={50} value={form.tamanoTanda} onChange={num("tamanoTanda")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Cada (horas)</label>
          <input type="number" min={0.5} step={0.5} max={48} value={form.intervaloHoras} onChange={num("intervaloHoras")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Tope por día</label>
          <input type="number" min={1} max={60} value={form.topeDiario} onChange={num("topeDiario")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Enfriamiento (h)</label>
          <input type="number" min={1} max={48} value={form.enfriamientoHoras} onChange={num("enfriamientoHoras")} className={inputClass} title="Cuánto esperar después de que Dropbox Sign frene los envíos" />
        </div>
        <div>
          <label className={labelClass}>Desde (h AR)</label>
          <input type="number" min={0} max={23} value={form.horaDesde} onChange={num("horaDesde")} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Hasta (h AR)</label>
          <input type="number" min={1} max={24} value={form.horaHasta} onChange={num("horaHasta")} className={inputClass} />
        </div>
      </div>

      {/* Estado */}
      {cfg && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
            <p className="text-[11px] text-gray-500">Enviados hoy</p>
            <p className="font-bold text-gray-800 dark:text-gray-100">
              {cfg.enviadosHoy} <span className="text-xs font-normal text-gray-500">· quedan {cfg.cupoHoy}</span>
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
            <p className="text-[11px] text-gray-500">Última tanda</p>
            <p className="font-bold text-gray-800 dark:text-gray-100">{cfg.ultimaCorrida ? `${fmt(cfg.ultimaCorrida.arrancadaEl)} · ${cfg.ultimaCorrida.enviados} env.${cfg.ultimaCorrida.enSeco ? " (seco)" : ""}` : "—"}</p>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 md:col-span-2">
            <p className="text-[11px] text-gray-500">Próximo envío automático</p>
            <p className={`font-semibold ${cfg.enfriadoHasta && new Date(cfg.enfriadoHasta) > new Date() ? "text-amber-600 dark:text-amber-400" : "text-gray-800 dark:text-gray-100"}`}>{cfg.proximaCorrida}</p>
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
          <input type="checkbox" checked={form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} className="rounded border-gray-300" />
          Activar el envío automático
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {corriendo ? (
            <button type="button" onClick={detener} disabled={!!corrida?.detenerPedido} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/20 disabled:opacity-50">
              <FontAwesomeIcon icon={faStop} /> {corrida?.detenerPedido ? "Deteniendo…" : "Detener"}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => arrancar(true)} disabled={!puedeOperar || arrancando || guardando} title="Recorre todo sin apretar «Enviar para firmar»" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                <FontAwesomeIcon icon={faFlask} /> Probar en seco
              </button>
              <button type="button" onClick={() => arrancar(false)} disabled={!puedeOperar || arrancando || guardando} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                <FontAwesomeIcon icon={arrancando ? faSpinner : faPaperPlane} spin={arrancando} /> Enviar tanda ahora
              </button>
            </>
          )}
          <button type="button" onClick={verCola} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700" title="Qué enviaría la próxima tanda (lee el Outbox; no envía)">
            <FontAwesomeIcon icon={faListCheck} /> Ver cola
          </button>
          <button type="button" onClick={verLogs} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
            <FontAwesomeIcon icon={faListUl} /> Logs
          </button>
          <button type="button" onClick={guardar} disabled={guardando || corriendo} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-700 text-white hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500 disabled:opacity-50">
            <FontAwesomeIcon icon={guardando ? faSpinner : faCheck} spin={guardando} /> Guardar
          </button>
        </div>
      </div>

      {/* La corrida en vivo */}
      {corrida?.hay && (corriendo || (corrida.eventos?.length ?? 0) > 0) && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-300 flex items-center gap-2">
            {corriendo && <FontAwesomeIcon icon={faSpinner} spin />}
            {corriendo ? "Corrida en curso" : "Última corrida"}
            {corrida.enSeco ? " · en seco" : ""} · {corrida.enviados ?? 0} enviado(s) · {corrida.errores ?? 0} error(es)
            {corrida.limite ? " · frenada por el límite de Dropbox Sign" : ""}
            {corrida.irreversible ? " · apretando «Enviar para firmar»" : ""}
          </p>
          <ul className="mt-2 max-h-56 overflow-y-auto space-y-1 text-[11px] font-mono text-gray-600 dark:text-gray-300">
            {[...(corrida.eventos || [])].slice(-60).map((e, i) => (
              <li key={i} className={e.tipo === "fallo" || e.estado === "error" ? "text-red-600 dark:text-red-400" : e.tipo === "limite" ? "text-amber-600 dark:text-amber-400" : e.estado === "enviado" ? "text-green-600 dark:text-green-400" : ""}>
                {fmt(e.at)} · {e.texto}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lo que requiere revisión */}
      {revision.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {revision.length} documento(s) que el bot no envía: requieren revisión
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-amber-900 dark:text-amber-200 max-h-40 overflow-y-auto">
            {revision.map((r) => (
              <li key={r._id} className="break-all">
                <span className="font-mono">{r.archivo}</span> — {r.detalle}
              </li>
            ))}
          </ul>
        </div>
      )}

      <InfoModal isOpen={cola.abierta} onClose={() => setCola((c) => ({ ...c, abierta: false }))} title="La próxima tanda" subtitle={cola.datos ? `${cola.datos.enCola} en la cola · ${cola.datos.tanda.length} en la próxima tanda · ${cola.datos.pendientesDespues} quedan para después · ${cola.datos.archivosEnOutbox} archivo(s) en Outbox · cupo hoy ${cola.datos.cupoHoy}` : undefined} size="xl" actions={[{ label: "Cerrar", onClick: () => setCola((c) => ({ ...c, abierta: false })), variant: "ghost" }]}>
        {cola.cargando || !cola.datos ? (
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <FontAwesomeIcon icon={faSpinner} spin /> Leyendo la cola y el Outbox…
          </p>
        ) : (
          <div className="space-y-4 text-xs max-h-[65vh] overflow-y-auto">
            {cola.datos.motivoNoCorre && <p className="text-amber-700 dark:text-amber-300">El scheduler ahora no correría: {cola.datos.motivoNoCorre}</p>}
            <p className="text-gray-500">La cola se arma desde Contratos → Para Firmar («Enviar a la firma» o «Encolar todo lo elegible»).</p>
            <div>
              <p className="font-bold text-gray-700 dark:text-gray-200 mb-1">Se enviarían ({cola.datos.tanda.length})</p>
              {cola.datos.tanda.length === 0 ? <p className="text-gray-500">Nada en la cola para esta tanda.</p> : cola.datos.tanda.map((t) => <p key={t.codigo} className="font-mono break-all text-gray-700 dark:text-gray-200">#{t.orden} {t.archivo} → {t.firmante} ({t.email}) · {t.tipo}</p>)}
            </div>
            {cola.datos.faltantes.length > 0 && (
              <div>
                <p className="font-bold text-amber-700 dark:text-amber-300 mb-1">Encolados que ya no están en Outbox ({cola.datos.faltantes.length})</p>
                {cola.datos.faltantes.map((t) => <p key={t.codigo} className="font-mono break-all text-gray-700 dark:text-gray-200">{t.archivo}</p>)}
              </div>
            )}
          </div>
        )}
      </InfoModal>

      <InfoModal isOpen={logs.abiertos} onClose={() => setLogs((l) => ({ ...l, abiertos: false }))} title="Logs del envío automático" subtitle="Últimas 50 corridas · la más reciente arriba · se borran a los 30 días" size="xl" actions={[{ label: "Cerrar", onClick: () => setLogs((l) => ({ ...l, abiertos: false })), variant: "ghost" }]}>
        {logs.cargando || !logs.datos ? (
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <FontAwesomeIcon icon={faSpinner} spin /> Cargando…
          </p>
        ) : logs.datos.logs.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no corrió ninguna tanda.</p>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto space-y-3">
            {logs.datos.logs.map((l) => (
              <div key={l._id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-xs">
                <p className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-200">
                  <FontAwesomeIcon icon={l.resultado === "ok" || l.resultado === "sin_tanda" ? faCircleCheck : faCircleXmark} className={l.resultado === "ok" || l.resultado === "sin_tanda" ? "text-green-600" : l.limite ? "text-amber-600" : "text-red-600"} />
                  {fmt(l.inicio)} · {l.resultado}{l.enSeco ? " · seco" : ""}{l.automatica ? " · automática" : " · manual"} · {l.enviados} enviado(s) · {l.errores} error(es)
                </p>
                {l.error && <p className="text-red-600 dark:text-red-400 mt-1 break-words">{l.error}</p>}
                <ul className="mt-2 space-y-1">
                  {l.lineas.map((x, i) => (
                    <li key={i} className="break-all">
                      <span className={`font-semibold ${ESTADO_LINEA[x.estado]?.clase || ""}`}>{ESTADO_LINEA[x.estado]?.label || x.estado}</span> · <span className="font-mono">{x.archivo}</span>
                      {x.detalle ? <span className="text-gray-500"> — {x.detalle}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </InfoModal>
    </div>
  );
};

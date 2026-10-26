import React, { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faCheck, faPaperPlane, faStop, faListUl, faListCheck, faTriangleExclamation, faCircleCheck, faCircleXmark, faRobot, faFlask, faEye, faPlug, faCircleQuestion, faRightToBracket, faImage } from "@fortawesome/free-solid-svg-icons";
import { dropboxSignBotAPI, type BotConfig, type BotCola, type BotCorrida, type BotLog, type BotEnvioRegistro, type BotLinea } from "../../api/dropboxSign";
import { InfoModal } from "../ui/InfoModal";
import { sweetAlert } from "../../utils/sweetAlert";
import { PrevisualizacionColocacion } from "./PrevisualizacionColocacion";
import { IndicadorColocacion } from "./ReglasColocacionCard";
import { LoginAsistidoModal } from "./LoginAsistidoModal";
import { TrabadosPorMotivo } from "../contratos/ColaDeEnvioFirma";

/*
  «ENVÍO AUTOMÁTICO A LA FIRMA» (22/10/2026): el bot que manda a firmar, por la web de Dropbox Sign,
  los documentos del tab «Para Firmar» (Outbox), sin que nadie entre más a app.sign.dropbox.com.
  Acá se configuran la cuenta, el throttle (la web frena a los ~55-60 envíos por día) y se sigue la
  corrida en vivo. El circuito IMAP de arriba sigue igual: con el CC correcto, mueve lo enviado a Pendbox.
*/

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

/*
  EL ERROR DEL NAVEGADOR DEL SERVIDOR (Playwright) viene con el «call log» entero, con restos de códigos
  de color de la terminal («[2m», «[22m») y URLs larguísimas: en la tarjeta se muestra sólo la primera
  línea, sin esos restos, y el texto completo va al modal de Logs (pedido del 22/10/2026).
*/
const limpiarAnsi = (texto: string) => texto.replace(/\u001b?\[\d{1,2}m/g, "");
const resumenDelError = (texto: string) => {
  const primera = limpiarAnsi(texto).split(/\r?\n/)[0].split(/\s+Call log:/i)[0].trim();
  return primera.length > 160 ? `${primera.slice(0, 157)}…` : primera;
};
const PIDE_LOGIN_MANUAL = /captcha|c[oó]digo|segundo factor|login manual|password|contraseña|login_password/i;
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
  const [probandoConexion, setProbandoConexion] = useState(false);
  /** El login asistido (el navegador del servidor en pantalla) y la captura de lo que vio cuando falló. */
  const [login, setLogin] = useState(false);
  const [captura, setCaptura] = useState<string | null>(null);
  const [cola, setCola] = useState<{ abierta: boolean; cargando: boolean; datos: BotCola | null }>({ abierta: false, cargando: false, datos: null });
  const [logs, setLogs] = useState<{ abiertos: boolean; cargando: boolean; datos: { logs: BotLog[]; requierenRevision: BotEnvioRegistro[] } | null }>({ abiertos: false, cargando: false, datos: null });
  const [revision, setRevision] = useState<BotEnvioRegistro[]>([]);
  // Los trabados agrupados por motivo (de la vista de la cola). Si el server todavía no los da, queda la lista plana.
  const [vistaCola, setVistaCola] = useState<BotCola | null>(null);
  /** El archivo cuya colocación de firma se está previsualizando. */
  const [preview, setPreview] = useState<string | null>(null);
  const intervalo = useRef<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const c = await dropboxSignBotAPI.config();
      setCfg(c);
      setForm((f) => ({ ...f, loginEmail: c.loginEmail, loginPassword: "", ...c.envio }));
      const l = await dropboxSignBotAPI.logs().catch(() => null);
      if (l) {
        setRevision(l.requierenRevision.filter((r) => r.estado === "requiere_revision"));
        // Se guardan ya: el botón «Logs» muestra cuántas corridas hay sin esperar a abrirlo.
        setLogs((x) => ({ ...x, datos: l }));
      }
      const v = await dropboxSignBotAPI.cola().catch(() => null);
      setVistaCola(v?.trabados ? v : null);
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

  /** «Probar conexión»: el navegador del servidor entra a Dropbox Sign y se cierra. No envía nada. */
  const probarConexion = async () => {
    setProbandoConexion(true);
    try {
      const { conexion } = await dropboxSignBotAPI.probarConexion();
      if (conexion.estado === "ok") sweetAlert.success("Conectado", conexion.detalle);
      else sweetAlert.error("Conexión caída", conexion.detalle);
    } catch (e: any) {
      sweetAlert.error("No se pudo probar", e?.response?.data?.error || e?.message || "");
    } finally {
      setProbandoConexion(false);
      void cargar();
    }
  };

  const verCaptura = async () => {
    try {
      const blob = await dropboxSignBotAPI.capturaConexion();
      setCaptura(URL.createObjectURL(blob));
    } catch (e: any) {
      sweetAlert.error("Sin captura", e?.response?.data?.error || "No hay captura de la última conexión.");
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
      {/* EL ESTADO DE LA CONEXIÓN (23/10/2026): lo que pasó la última vez que el bot abrió Dropbox Sign, y un botón para probarlo ahora. */}
      {cfg && (
        <div className={`rounded-lg border p-3 text-xs space-y-1 ${cfg.conexion?.estado === "ok" ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20" : cfg.conexion?.estado === "caida" ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20" : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-bold">
              <FontAwesomeIcon icon={faPlug} className={cfg.conexion?.estado === "ok" ? "text-green-600 dark:text-green-400" : cfg.conexion?.estado === "caida" ? "text-red-600 dark:text-red-400" : "text-gray-400"} />
              <span className="text-gray-700 dark:text-gray-200">Conexión con Dropbox Sign:</span>
              {cfg.conexion?.estado === "ok" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-white px-2 py-0.5 text-[11px] text-green-700 dark:border-green-700 dark:bg-green-950 dark:text-green-300">
                  <FontAwesomeIcon icon={faCircleCheck} /> Conectada
                </span>
              ) : cfg.conexion?.estado === "caida" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-white px-2 py-0.5 text-[11px] text-red-700 dark:border-red-700 dark:bg-red-950 dark:text-red-300">
                  <FontAwesomeIcon icon={faCircleXmark} /> Caída
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[11px] text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  <FontAwesomeIcon icon={faCircleQuestion} /> Sin probar
                </span>
              )}
              {cfg.conexion && <span className="font-normal text-gray-500">· probada {fmt(cfg.conexion.probadaAt)}{cfg.conexion.via === "sesion" ? " · con la sesión guardada" : cfg.conexion.via === "login" ? " · con usuario y contraseña" : ""}</span>}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setLogin(true)} disabled={corriendo || probandoConexion} title="El navegador del servidor aparece en tu pantalla para iniciar sesión y resolver captcha o código. La sesión queda guardada para el bot." className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                <FontAwesomeIcon icon={faRightToBracket} /> {cfg.loginAsistidoAbierto ? "Seguir conectándose" : "Conectarse a Dropbox Sign"}
              </button>
              <button type="button" onClick={probarConexion} disabled={probandoConexion || corriendo || cfg.loginAsistidoAbierto || (!cfg.tieneSesion && !cfg.tienePassword)} title="Abre el navegador del servidor, entra a Dropbox Sign y lo cierra. No envía nada. Tarda entre 15 s y 1 min." className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                <FontAwesomeIcon icon={probandoConexion ? faSpinner : faPlug} spin={probandoConexion} /> {probandoConexion ? "Probando…" : "Probar conexión"}
              </button>
              {cfg.conexion?.tieneCaptura && (
                <button type="button" onClick={verCaptura} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700" title="La pantalla en la que quedó el navegador cuando no pudo entrar">
                  <FontAwesomeIcon icon={faImage} /> Ver qué vio el navegador
                </button>
              )}
            </div>
          </div>
          {cfg.conexion?.estado === "caida" && <p className="break-words text-red-700 dark:text-red-300">{resumenDelError(cfg.conexion.detalle)}</p>}
          {cfg.conexion?.estado === "ok" && <p className="text-green-700 dark:text-green-300">{cfg.conexion.detalle}</p>}
          {!cfg.tieneSesion && (
            <p className="text-gray-600 dark:text-gray-300">
              {cfg.tienePassword ? "Sin sesión guardada, el bot intenta entrar con usuario y contraseña; si Dropbox Sign pide un captcha o un código, " : "No hay sesión guardada: "}
              usá <strong>«Conectarse a Dropbox Sign»</strong> e iniciá sesión desde acá. Queda guardada y el bot la renueva en cada corrida.
            </p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 text-xs text-gray-600 dark:text-gray-300 space-y-1">
        <p>
          Sesión guardada: {cfg?.tieneSesion ? <span className="text-green-600 dark:text-green-400 font-semibold">sí</span> : <span className="text-amber-600 dark:text-amber-400 font-semibold">no</span>}
          {cfg?.sesionGuardadaAt ? ` · renovada ${fmt(cfg.sesionGuardadaAt)}` : ""}
          {cfg?.ultimoLoginAt ? ` · último login ${fmt(cfg.ultimoLoginAt)}` : ""}
        </p>
        {cfg?.ultimoError && (
          <div className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
            <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1 break-words">
              <span title="El texto completo está en Logs">{resumenDelError(cfg.ultimoError)}</span>{" "}
              <button type="button" onClick={verLogs} className="font-semibold underline underline-offset-2 hover:text-red-700 dark:hover:text-red-300">
                Ver completo en Logs
              </button>
              {PIDE_LOGIN_MANUAL.test(cfg.ultimoError) && (
                <p className="mt-1 text-gray-600 dark:text-gray-300">
                  Iniciá sesión con <strong>«Conectarse a Dropbox Sign»</strong> (arriba): ahí podés resolver el captcha o el código.
                </p>
              )}
            </div>
          </div>
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-2.5">
            <p className="text-[11px] text-gray-500">Envío automático</p>
            <p className={`font-bold ${cfg.envio.activo ? "text-green-600 dark:text-green-400" : "text-gray-500"}`}>{cfg.envio.activo ? "Activado" : "Desactivado"}</p>
          </div>
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
            {logs.datos?.logs.length ? <span className="text-xs font-bold text-gray-500 dark:text-gray-400">({logs.datos.logs.length})</span> : null}
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
      {vistaCola?.trabados ? (
        <TrabadosPorMotivo
          grupos={vistaCola.trabados}
          verificacion={vistaCola.verificacion}
          onVerificar={() => {
            dropboxSignBotAPI
              .verificarTodos("outbox")
              .then(() => sweetAlert.success("Verificando", "Se están verificando la cola y lo trabado. Al terminar, recargá para ver el resultado."))
              .catch((e: any) => sweetAlert.error("No se pudo verificar", e?.response?.data?.error || e?.message || ""));
          }}
          onCambio={cargar}
        />
      ) : revision.length > 0 && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <FontAwesomeIcon icon={faTriangleExclamation} /> {revision.length} documento(s) que el bot no envía: requieren revisión
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-amber-900 dark:text-amber-200 max-h-40 overflow-y-auto">
            {revision.map((r) => (
              <li key={r._id} className="break-all">
                <span className="font-mono">{r.archivo}</span> — {r.detalle}{" "}
                <button type="button" onClick={() => setPreview(r.archivo)} className="whitespace-nowrap font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800 dark:text-blue-300" title="Ver sobre el PDF dónde iría la firma y qué se descartó">
                  <FontAwesomeIcon icon={faEye} className="h-3 w-3" /> Previsualizar
                </button>
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
              {cola.datos.tanda.length === 0 ? (
                <p className="text-gray-500">Nada en la cola para esta tanda.</p>
              ) : (
                cola.datos.tanda.map((t) => (
                  <div key={t.codigo} className="flex items-start gap-2 py-0.5">
                    <p className="min-w-0 flex-1 break-all text-gray-700 dark:text-gray-200">
                      <span className="font-mono">
                        #{t.orden} {t.archivo}
                      </span>{" "}
                      → {t.firmante} ({t.email}) · {t.tipo}
                      {t.estimadoAt ? <span className="text-gray-500"> · sale aprox. {fmt(t.estimadoAt)}</span> : null} <IndicadorColocacion c={t.colocacion} />
                    </p>
                    <button type="button" onClick={() => setPreview(t.archivo)} className="shrink-0 font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400" title="Ver sobre el PDF dónde va la firma">
                      <FontAwesomeIcon icon={faEye} /> Previsualizar
                    </button>
                  </div>
                ))
              )}
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
        ) : (
          <div className="max-h-[65vh] overflow-y-auto space-y-3">
            {/* El último error del navegador, entero: es lo que la tarjeta muestra resumido. */}
            {cfg?.ultimoError && (
              <div className="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-xs">
                <p className="flex items-center gap-2 font-semibold text-red-700 dark:text-red-300">
                  <FontAwesomeIcon icon={faTriangleExclamation} /> Último error del navegador del servidor
                  {cfg.ultimoLoginAt ? <span className="font-normal text-red-600/80 dark:text-red-300/80">· último login bueno {fmt(cfg.ultimoLoginAt)}</span> : null}
                </p>
                <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] text-red-800 dark:text-red-200">{limpiarAnsi(cfg.ultimoError)}</pre>
                {PIDE_LOGIN_MANUAL.test(cfg.ultimoError) && (
                  <p className="mt-2 text-gray-700 dark:text-gray-300">
                    Iniciá sesión con <strong>«Conectarse a Dropbox Sign»</strong> en la tarjeta del bot: ahí podés resolver el captcha o el código. El error se borra solo cuando el bot vuelve a entrar bien.
                  </p>
                )}
              </div>
            )}
            {logs.datos.logs.length === 0 && <p className="text-sm text-gray-500">Todavía no corrió ninguna tanda.</p>}
            {logs.datos.logs.map((l) => (
              <div key={l._id} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-xs">
                <p className="flex items-center gap-2 font-semibold text-gray-700 dark:text-gray-200">
                  <FontAwesomeIcon icon={l.resultado === "ok" || l.resultado === "sin_tanda" ? faCircleCheck : faCircleXmark} className={l.resultado === "ok" || l.resultado === "sin_tanda" ? "text-green-600" : l.limite ? "text-amber-600" : "text-red-600"} />
                  {fmt(l.inicio)} · {l.resultado}{l.enSeco ? " · seco" : ""}{l.automatica ? " · automática" : " · manual"} · {l.enviados} enviado(s) · {l.errores} error(es)
                  {l.tieneCaptura && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setCaptura(URL.createObjectURL(await dropboxSignBotAPI.capturaLog(l._id)));
                        } catch (e: any) {
                          sweetAlert.error("Sin captura", e?.response?.data?.error || "");
                        }
                      }}
                      className="ml-auto inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      title="La pantalla de Dropbox Sign en el momento del primer error de esta corrida"
                    >
                      <FontAwesomeIcon icon={faImage} /> Ver qué vio el navegador
                    </button>
                  )}
                </p>
                {l.error && <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] text-red-600 dark:text-red-400">{limpiarAnsi(l.error)}</pre>}
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

      {preview && <PrevisualizacionColocacion archivo={preview} onClose={() => setPreview(null)} />}
      {login && (
        <LoginAsistidoModal
          onClose={() => {
            setLogin(false);
            void cargar();
          }}
          onConectado={() => void cargar()}
        />
      )}
      {captura && (
        <InfoModal isOpen onClose={() => setCaptura(null)} title="Lo que vio el navegador del servidor" subtitle={cfg?.conexion ? `${fmt(cfg.conexion.probadaAt)} · ${resumenDelError(cfg.conexion.detalle)}` : undefined} size="xl" zIndex={70} actions={[{ label: "Cerrar", onClick: () => setCaptura(null), variant: "ghost" }]}>
          <img src={captura} alt="Captura del navegador" className="block w-full rounded-lg border border-gray-300 dark:border-gray-600" />
        </InfoModal>
      )}
    </div>
  );
};

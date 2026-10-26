import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faPaperPlane, faStop, faGear, faRobot, faTriangleExclamation, faCircleCheck, faClock, faHourglassHalf, faListCheck, faCrosshairs, faRightToBracket } from "@fortawesome/free-solid-svg-icons";
import { dropboxSignAPI, dropboxSignBotAPI, type BotConfig, type BotCorrida, type EstadoArchivoFirma } from "../../api/dropboxSign";
import { sweetAlert } from "../../utils/sweetAlert";
import { LoginAsistidoModal } from "../dropboxSign/LoginAsistidoModal";

/*
  EL «ENVIAR A LA FIRMA» DESDE EL TAB «PARA FIRMAR» (22/10/2026). El envío es por COLA: desde el tab se
  tildan archivos y se encolan; el bot (corrida manual o scheduler) consume la cola respetando tanda,
  tope diario, ventana horaria y enfriamiento. Nada se envía si no fue encolado. La página de
  configuración de DropboxSign queda sólo para credenciales y throttle.
*/

const POLL_MS = 4000;
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

/** Cuenta regresiva corta («2 d 5 h», «1 h 20 min», «15 min»), o "" si ya pasó. */
export const faltan = (iso: string | null | undefined, ahora: number): string => {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - ahora;
  if (ms <= 0) return "";
  const min = Math.ceil(ms / 60000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
};

/*
  CUÁNDO SALE CADA ARCHIVO (pedido del 22/10/2026): el server simula el scheduler (tanda, intervalo,
  ventana horaria, tope diario, enfriamiento) y le asigna a cada ítem de la cola la hora de su tanda
  (`estimadoAt`). Acá se muestra como cuenta regresiva en días, horas y minutos. Es una estimación:
  una tanda manual, un cambio de configuración o un freno de Dropbox Sign la corren.
*/
const EXPLICACION_ESTIMADO = "Estimado con la tanda, el intervalo, la ventana horaria y el tope diario configurados. Una tanda manual o un freno de Dropbox Sign lo cambian.";
const cuandoSale = (iso: string | null | undefined, ahora: number): string => {
  if (!iso) return "";
  const f = faltan(iso, ahora);
  return f ? ` · en ${f}` : " · en la próxima tanda";
};

/** Todo lo que el tab necesita del bot: config, estados por archivo, corrida en vivo y las acciones. */
export function useBotFirma(archivos: string[], activo: boolean, hashes: Record<string, string> = {}) {
  const [cfg, setCfg] = useState<BotConfig | null>(null);
  const [estados, setEstados] = useState<Map<string, EstadoArchivoFirma>>(new Map());
  const [corrida, setCorrida] = useState<BotCorrida | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  /** Un reloj de 30 s para las cuentas regresivas de los badges. */
  const [ahora, setAhora] = useState(Date.now());
  const intervalo = useRef<number | null>(null);
  const nombres = useMemo(() => archivos.join("\n"), [archivos]);
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const cargarEstados = useCallback(async () => {
    if (!activo || archivos.length === 0) {
      setEstados(new Map());
      return;
    }
    try {
      const r = await dropboxSignBotAPI.estadoArchivos(archivos, hashes);
      setEstados(new Map(r.map((e) => [e.archivo, e])));
    } catch {
      /* sin estados: la columna queda en «—» */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, nombres]);
  const cargarCfg = useCallback(async () => {
    if (!activo) return;
    setCfg(await dropboxSignBotAPI.config().catch(() => null));
  }, [activo]);

  const parar = useCallback(() => {
    if (intervalo.current) window.clearInterval(intervalo.current);
    intervalo.current = null;
  }, []);
  const consultar = useCallback(async () => {
    const r = await dropboxSignBotAPI.corrida().catch(() => null);
    if (!r) return;
    setCorrida(r);
    // Fila por fila: cada documento que termina cambia su badge.
    void cargarEstados();
    if (!r.corriendo) {
      parar();
      void cargarCfg();
    }
  }, [cargarEstados, cargarCfg, parar]);
  const seguir = useCallback(() => {
    parar();
    void consultar();
    intervalo.current = window.setInterval(consultar, POLL_MS);
  }, [consultar, parar]);

  useEffect(() => {
    void cargarCfg();
    void cargarEstados();
    return parar;
  }, [cargarCfg, cargarEstados, parar]);
  useEffect(() => {
    if (cfg?.corriendo && !intervalo.current) seguir();
  }, [cfg?.corriendo, seguir]);

  const refrescar = useCallback(async () => {
    await Promise.all([cargarCfg(), cargarEstados()]);
  }, [cargarCfg, cargarEstados]);

  /** Resumen de un encolado: cuántos entraron y, agrupado por motivo, cuántos quedaron afuera. */
  const informar = (titulo: string, r: { encolados: number; porMotivo: Record<string, number> }) => {
    const motivos = Object.entries(r.porMotivo).map(([m, n]) => `${n} × ${m}`);
    if (motivos.length === 0) sweetAlert.success(titulo, `${r.encolados} documento${r.encolados === 1 ? "" : "s"} en la cola.`);
    else sweetAlert.warning(titulo, `${r.encolados} en la cola. Quedaron afuera:\n${motivos.join("\n")}`);
  };

  /** Encola los elegidos y, si el bot está libre y hay cupo, arranca la corrida. */
  const enviarALaFirma = async (seleccionados: string[]) => {
    if (seleccionados.length === 0 || !cfg) return;
    const seco = cfg.enSecoForzado;
    const r = await sweetAlert.confirm(
      `Enviar ${seleccionados.length} documento${seleccionados.length === 1 ? "" : "s"} a la firma`,
      `Se encolan y el bot los manda por Dropbox Sign${seco ? " (en este servidor en MODO SECO: no se aprieta «Enviar para firmar»)" : ""}. Cupo restante hoy: ${cfg.cupoHoy} de ${cfg.envio.topeDiario}; cada tanda manda hasta ${cfg.envio.tamanoTanda}. CC a ${cfg.cc || "la casilla configurada"}. Título = nombre exacto del archivo.`,
      "Sí, enviar",
    );
    if (!r.isConfirmed) return;
    setOcupado("encolando");
    try {
      const res = await dropboxSignBotAPI.encolar({ archivos: seleccionados });
      informar("Encolados", res);
      if (res.encolados > 0 && !cfg.corriendo && cfg.cupoHoy > 0) {
        try {
          await dropboxSignBotAPI.arrancar(false);
          seguir();
        } catch (e: any) {
          sweetAlert.info("Quedaron en la cola", e?.response?.data?.error || "El bot no pudo arrancar ahora; los manda en la próxima tanda.");
        }
      }
      await refrescar();
    } catch (e: any) {
      sweetAlert.error("No se pudo encolar", e?.response?.data?.error || e?.message || "");
    } finally {
      setOcupado(null);
    }
  };

  const encolarTodo = async () => {
    const r = await sweetAlert.confirm("Encolar todo lo elegible", "Se encola todo lo del Outbox que tenga tipo soportado, código y firmante, y que no esté enviado ni en la cola. Lo demás se informa por motivo. No arranca el envío: eso lo hace «Enviar tanda ahora» o el envío automático.", "Sí, encolar");
    if (!r.isConfirmed) return;
    setOcupado("encolando");
    try {
      informar("Encolado todo lo elegible", await dropboxSignBotAPI.encolar({ todosElegibles: true }));
      await refrescar();
    } catch (e: any) {
      sweetAlert.error("No se pudo encolar", e?.response?.data?.error || e?.message || "");
    } finally {
      setOcupado(null);
    }
  };

  const quitarDeLaCola = async (seleccionados: string[]) => {
    const codigos = seleccionados.map((a) => estados.get(a)).filter((e) => e && e.estado === "en_cola" || e?.estado === "seco").map((e) => e!.codigo);
    if (codigos.length === 0) {
      sweetAlert.info("Nada que quitar", "Ninguno de los tildados está en la cola.");
      return;
    }
    setOcupado("quitando");
    try {
      const r = await dropboxSignBotAPI.desencolar(codigos);
      sweetAlert.success("Fuera de la cola", `${r.quitados} documento${r.quitados === 1 ? "" : "s"}.`);
      await refrescar();
    } catch (e: any) {
      sweetAlert.error("No se pudo quitar", e?.response?.data?.error || "");
    } finally {
      setOcupado(null);
    }
  };

  const enviarTandaAhora = async () => {
    if (!cfg) return;
    const r = await sweetAlert.confirm("Enviar tanda ahora", `El bot manda hasta ${cfg.envio.tamanoTanda} de la cola (cupo hoy: ${cfg.cupoHoy})${cfg.enSecoForzado ? ". En este servidor corre en MODO SECO: no se aprieta «Enviar para firmar»" : ""}.`, "Sí, enviar");
    if (!r.isConfirmed) return;
    setOcupado("arrancando");
    try {
      await dropboxSignBotAPI.arrancar(false);
      seguir();
    } catch (e: any) {
      sweetAlert.error("No se pudo arrancar", e?.response?.data?.error || e?.message || "");
    } finally {
      setOcupado(null);
    }
  };

  const detener = async () => {
    const r = await dropboxSignBotAPI.detener().catch((e: any) => ({ ok: false, motivo: e?.response?.data?.error }));
    if (!r.ok) sweetAlert.info("No hay nada que detener", r.motivo || "");
  };

  return { cfg, estados, corrida, ocupado, ahora, enviarALaFirma, encolarTodo, quitarDeLaCola, enviarTandaAhora, detener, refrescar };
}

/**
 * El ✓/✗ de la última detección del ancla de la firma (previsualización, «Verificar todos» o la
 * corrida): dice en qué página y con qué rótulo iría, o por qué no. Sin detección no muestra nada.
 */
const IndicadorAncla: React.FC<{ e: EstadoArchivoFirma }> = ({ e }) => {
  const c = e.colocacion;
  if (!c) return null;
  /*
    DESACTUALIZADA (25/10/2026): el resultado guardado es de otro PDF, de otras reglas o de otra versión
    de la plantilla. Se muestra en gris y con el motivo, no como el estado actual: antes una
    verificación de días atrás se leía como si fuera de hoy.
  */
  const viejo = (c.desactualizado || []).length > 0;
  const deDonde = c.origen === "plantilla" ? "posición declarada por la plantilla" : `sobre «${c.rotulo}»`;
  const titulo = c.ok ? `Firma ${deDonde} en la pág. ${c.pagina} (verificado ${fmt(c.verificadaAt)})` : `Sin ubicar la firma (verificado ${fmt(c.verificadaAt)}): ${c.motivo}`;
  return (
    <FontAwesomeIcon
      icon={faCrosshairs}
      className={`h-3 w-3 ${viejo ? "text-gray-400 dark:text-gray-500" : c.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
      title={viejo ? `Verificación desactualizada: ${c.desactualizado!.join("; ")}. Volvé a verificar. Lo último que dio: ${titulo}` : titulo}
    />
  );
};

/** El badge de la columna «Firma», con la cuenta regresiva y el ✓/✗ del ancla al lado. */
export const BadgeFirma: React.FC<{ e?: EstadoArchivoFirma; ahora?: number }> = ({ e, ahora }) => {
  if (!e || !e.estado) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {badgeDe(e, ahora ?? Date.now())}
      <IndicadorAncla e={e} />
    </span>
  );
};

const badgeDe = (e: EstadoArchivoFirma, ahora: number): React.ReactNode => {
  const base = "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border whitespace-nowrap";
  const sale = cuandoSale(e.estimadoAt, ahora);
  const tituloCola = e.estimadoAt ? `Sale aprox. ${fmt(e.estimadoAt)}. ${EXPLICACION_ESTIMADO}` : e.detalle || "Sale cuando alguien aprieta «Enviar tanda ahora» (el envío automático está desactivado)";
  switch (e.estado) {
    case "en_cola":
      return <span className={`${base} border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300`} title={tituloCola}>En cola{e.posicion ? ` (#${e.posicion})` : ""}{sale}</span>;
    case "seco":
      return <span className={`${base} border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300`} title={tituloCola}>[SECO] listo{e.posicion ? ` (#${e.posicion})` : ""}{sale}</span>;
    case "enviando":
      return <span className={`${base} border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-900/30 dark:text-purple-300`}><FontAwesomeIcon icon={faSpinner} spin className="h-3 w-3" /> Enviando…</span>;
    case "enviado":
      return <span className={`${base} border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300`} title={e.detalle}><FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" /> Enviado {fmt(e.enviadoAt)}</span>;
    case "limite":
      return <span className={`${base} border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300`} title={e.estimadoAt ? `${e.detalle} Reintento aprox. ${fmt(e.estimadoAt)}.` : e.detalle}><FontAwesomeIcon icon={faHourglassHalf} className="h-3 w-3" /> Límite — reintenta{sale}</span>;
    case "error":
      return <span className={`${base} border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300`} title={e.detalle}>Error</span>;
    case "requiere_revision":
      return <span className={`${base} border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300`} title={e.detalle}><FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" /> Requiere revisión</span>;
    default:
      return <span className="text-xs text-gray-400">—</span>;
  }
};

/** El panel compacto arriba del listado: estado del bot y la corrida en vivo. */
export const PanelBotFirma: React.FC<{ bot: ReturnType<typeof useBotFirma>; enCola: number }> = ({ bot, enCola }) => {
  const { cfg, corrida, ocupado } = bot;
  const [ahora, setAhora] = useState(Date.now());
  const [login, setLogin] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  if (!cfg) return null;
  const corriendo = !!corrida?.corriendo;
  const enfriando = faltan(cfg.enfriadoHasta, ahora);
  const ultimo = corrida?.eventos?.length ? corrida.eventos[corrida.eventos.length - 1] : null;
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
        <span className="inline-flex items-center gap-1.5 font-bold text-gray-700 dark:text-gray-200">
          <FontAwesomeIcon icon={faRobot} /> Envío a la firma
          {cfg.enSecoForzado && <span className="rounded-full border border-blue-300 bg-blue-50 px-1.5 text-[10px] text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">modo seco</span>}
        </span>
        <span>
          Hoy <strong>{cfg.enviadosHoy}</strong> / {cfg.envio.topeDiario} enviados
        </span>
        <span>
          En cola <strong>{enCola}</strong>
        </span>
        <span className="inline-flex items-center gap-1" title={cfg.envio.activo ? `${cfg.proximaCorrida} ${cfg.proximaCorridaAt ? EXPLICACION_ESTIMADO : ""}` : undefined}>
          <FontAwesomeIcon icon={faClock} className="text-gray-400" />{" "}
          {!cfg.envio.activo ? "Envío automático desactivado" : cfg.proximaCorridaAt ? `Próxima tanda ${faltan(cfg.proximaCorridaAt, ahora) ? `en ${faltan(cfg.proximaCorridaAt, ahora)}` : "en el próximo minuto"} (${fmt(cfg.proximaCorridaAt)})` : cfg.proximaCorrida}
        </span>
        {enfriando && (
          <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300 font-semibold">
            <FontAwesomeIcon icon={faHourglassHalf} /> Enfriamiento: {enfriando}
          </span>
        )}
        <span title={cfg.conexion ? `${cfg.conexion.detalle} (probada ${fmt(cfg.conexion.probadaAt)})` : "El bot todavía no abrió Dropbox Sign"}>
          Conexión con Dropbox Sign:{" "}
          {cfg.conexion?.estado === "ok" ? <span className="text-green-600 dark:text-green-400 font-semibold">conectada</span> : cfg.conexion?.estado === "caida" ? <span className="text-red-600 dark:text-red-400 font-semibold">caída ({fmt(cfg.conexion.probadaAt)})</span> : <span className="text-gray-500 font-semibold">sin probar</span>}
          {" · "}sesión {cfg.tieneSesion ? <span className="text-green-600 dark:text-green-400 font-semibold">guardada</span> : <span className="text-red-600 dark:text-red-400 font-semibold">no hay</span>}
        </span>
        <Link to="/dropbox-sign?tab=envio" className="ml-auto inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold">
          <FontAwesomeIcon icon={faGear} /> Configuración
        </Link>
      </div>
      {(!cfg.tieneSesion || cfg.conexion?.estado === "caida") && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-red-600 dark:text-red-400">
          <span>{cfg.conexion?.estado === "caida" ? "La conexión con Dropbox Sign está caída: el bot no puede enviar." : "Sin sesión de Dropbox Sign el bot no puede enviar."}</span>
          <button type="button" onClick={() => setLogin(true)} disabled={corriendo} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" title="El navegador del servidor aparece en tu pantalla para iniciar sesión">
            <FontAwesomeIcon icon={faRightToBracket} /> Conectarse a Dropbox Sign
          </button>
        </div>
      )}
      {login && (
        <LoginAsistidoModal
          onClose={() => {
            setLogin(false);
            void bot.refrescar();
          }}
          onConectado={() => void bot.refrescar()}
        />
      )}
      {cfg.ultimoError && <p className="text-[11px] text-red-600 dark:text-red-400 break-words">Último error del bot: {cfg.ultimoError}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {corriendo ? (
          <>
            <span className="inline-flex items-center gap-2 text-xs text-purple-700 dark:text-purple-300">
              <FontAwesomeIcon icon={faSpinner} spin /> Corrida en curso: {corrida?.enviados ?? 0} enviado(s), {corrida?.errores ?? 0} error(es)
              {corrida?.irreversible ? " · apretando «Enviar para firmar»" : ""}
            </span>
            <button type="button" onClick={bot.detener} disabled={!!corrida?.detenerPedido} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 disabled:opacity-50" title="No interrumpe el documento en curso">
              <FontAwesomeIcon icon={faStop} /> {corrida?.detenerPedido ? "Deteniendo…" : "Detener"}
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={bot.enviarTandaAhora} disabled={!!ocupado || enCola === 0 || cfg.cupoHoy === 0 || !!enfriando} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50" title={enCola === 0 ? "No hay nada en la cola" : `Manda hasta ${cfg.envio.tamanoTanda} de la cola`}>
              <FontAwesomeIcon icon={ocupado === "arrancando" ? faSpinner : faPaperPlane} spin={ocupado === "arrancando"} /> Enviar tanda ahora
            </button>
            <button type="button" onClick={bot.encolarTodo} disabled={!!ocupado} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50" title="Encola todo lo del Outbox con tipo soportado, código y firmante (excluye enviados y requiere revisión)">
              <FontAwesomeIcon icon={ocupado === "encolando" ? faSpinner : faListCheck} spin={ocupado === "encolando"} /> Encolar todo lo elegible
            </button>
          </>
        )}
        {ultimo && <span className="text-[11px] font-mono text-gray-500 dark:text-gray-400 truncate max-w-[60ch]" title={ultimo.texto}>{ultimo.texto}</span>}
      </div>
    </div>
  );
};

/**
 * La casilla de CC: la configurada en Configuración → DropboxSign. Antes estaba escrita fija
 * («rrhh@frame.com.ar») y quedó vieja.
 */
export const CasillaCC: React.FC = () => {
  const [cc, setCc] = useState<string | null>(null);
  useEffect(() => {
    dropboxSignAPI
      .config()
      .then((c) => setCc(c.email || ""))
      .catch(() => setCc(""));
  }, []);
  if (cc === null) return <span className="font-mono text-xs">…</span>;
  return cc ? <span className="font-mono text-xs">{cc}</span> : <span className="italic">la casilla configurada en Configuración → DropboxSign (todavía no hay ninguna)</span>;
};

/**
 * Instructivo de cómo se envía a firmar. Ya no hay paso manual en Dropbox Sign: se tilda, se envía, y
 * el estado avanza solo cuando llega el aviso al mail. Se muestra en el ⓘ del stepper y en el del tab.
 */
export const InstructivoParaFirmar: React.FC = () => (
  <div className="space-y-3">
    <p className="text-sm text-gray-600 dark:text-gray-300">
      Los PDF de esta bandeja están en la carpeta <span className="font-mono text-xs">Outbox</span> de Dropbox. Antes había que entrar a Dropbox Sign y mandarlos a mano, uno por uno. Ahora lo hace el
      sistema:
    </p>
    <ol className="list-decimal pl-5 space-y-1.5 text-sm text-gray-700 dark:text-gray-200">
      <li>
        <strong>Tildá</strong> los documentos y apretá <strong>Enviar a la firma</strong>. Quedan en la <strong>cola</strong> (columna «Firma»).
      </li>
      <li>
        El <strong>bot</strong> —un navegador del servidor— los manda por Dropbox Sign de a tandas, con el <strong>título igual al nombre del archivo</strong>, el <strong>firmante desde la base</strong>, la firma colocada
        según el tipo de documento y <strong>copia (CC)</strong> a <CasillaCC />.
      </li>
      <li>
        Cuando llega el aviso a esa casilla, el archivo pasa solo de <span className="font-mono text-xs">Outbox</span> a <span className="font-mono text-xs">Pendbox</span> y el contrato aparece en{" "}
        <strong>Enviado a la firma</strong>. No hay que tocar nada.
      </li>
    </ol>
    <div className="rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-sm text-amber-800 dark:text-amber-200 space-y-1">
      <p className="font-bold">Por qué va de a tandas</p>
      <p>Dropbox Sign frena la cuenta después de unos 55-60 envíos en un día. Por eso el bot manda tandas chicas, respeta un tope diario y, si Dropbox Sign lo frena igual, espera unas horas y sigue solo.</p>
    </div>
    <p className="text-sm text-gray-600 dark:text-gray-300">
      Lo que marca <strong>Requiere revisión</strong> no se envía: es un tipo de documento que todavía no tiene definido dónde va la firma (por ejemplo los recibos de sueldo), o una persona que no se
      encontró en la base. El motivo se ve pasando el mouse por el badge.
    </p>
    <p className="text-sm text-gray-600 dark:text-gray-300">
      Cuando vuelve firmado queda en <span className="font-mono text-xs">Requested signatures</span> y se ve en la pestaña <strong>Firmados</strong>. En ese momento el original sale solo de{" "}
      <span className="font-mono text-xs">Pendbox</span>.
    </p>
  </div>
);

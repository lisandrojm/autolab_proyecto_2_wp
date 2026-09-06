import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate, faBolt, faFolder, faSpinner, faCheck, faCopy, faStopwatch, faSitemap, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { faDropbox } from "@fortawesome/free-brands-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { infoAPI, InfoItem } from "../api/info";
import { dropboxAPI, DiagnosticoCarpeta, DropboxStatus, EscaneoConfig } from "../api/dropbox";
import { DropboxConexionCard } from "../components/documents/DropboxConexionCard";
import { sweetAlert } from "../utils/sweetAlert";
import { urlWebhookDropbox } from "../utils/urlWebhook";

/**
 * El ancla de la sección del webhook adentro del modal de ayuda.
 *
 * La explicación del alta vive UNA sola vez, en el modal. La tarjeta de la pantalla tiene lo que se
 * usa todos los días —la URL y el botón de copiar— y un link que abre el modal ahí. Con el texto
 * repetido en los dos lados, el día que Dropbox cambie el nombre de una pestaña se corrige uno solo.
 */
const ID_SECCION_WEBHOOK = "ayuda-alta-webhook";

/** Nombre de carpeta (última parte del path), para mostrar algo legible en vez del path completo. */
const nombreCarpeta = (path: string): string => path.split("/").filter(Boolean).pop() || path;

const formatCuentaRegresiva = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export function EscaneoDropboxConfigPage() {
  /**
   * Cómo se está resolviendo cada carpeta. EL SÍNTOMA QUE ANTES NO EXISTÍA.
   *
   * Una carpeta que no se puede resolver no generaba ninguna señal: el escaneo pasaba de largo y el
   * problema aparecía semanas después como «los contratos dejaron de avanzar». Va en esta pantalla,
   * al lado de la última lectura, porque es donde alguien mira cuando sospecha del escaneo.
   */
  const [diagnostico, setDiagnostico] = useState<DiagnosticoCarpeta[]>([]);
  const [status, setStatus] = useState<DropboxStatus | null>(null);
  const [config, setConfig] = useState<EscaneoConfig | null>(null);
  const [estados, setEstados] = useState<InfoItem[]>([]);
  const [loading, setLoading] = useState(true);
  /** Explicación de cómo funciona el escaneo (modal del ⓘ de la cabecera, como el resto de las páginas). */
  const [showInfo, setShowInfo] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  /*
    LA URL DEL WEBHOOK, SIEMPRE ABSOLUTA.

    Se armaba acá mismo concatenando `VITE_API_URL`, y en producción esa variable vale `/api/v1`: lo
    que salía —y lo que copiaba el botón— era `/api/v1/dropbox/webhook`, una ruta relativa que en la
    App Console de Dropbox no sirve para nada. El error que esta sección existía para evitar.

    La cuenta se mudó a `urlWebhookDropbox`, que resuelve contra el origen del navegador cuando la
    base es relativa y tiene tests: es una cadena que se copia y se pega en otro sistema, así que
    equivocarla no se nota acá sino allá.
  */
  const urlWebhook = urlWebhookDropbox(import.meta.env.VITE_API_URL, window.location.origin);

  const copiarWebhook = async () => {
    try {
      await navigator.clipboard.writeText(urlWebhook);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      sweetAlert.error('No se pudo copiar', 'Copiala a mano desde el recuadro de al lado.');
    }
  };

  /*
    Abre el modal de ayuda Y baja hasta la sección del alta.

    El modal es largo y esa sección está al final: abrirlo arriba deja a quien vino a dar de alta el
    webhook buscándola. El frame de gracia es porque el contenido se monta con el modal, así que el
    `id` todavía no existe cuando se pide el scroll.
  */
  const verComoDarDeAlta = () => {
    setShowInfo(true);
    setTimeout(() => document.getElementById(ID_SECCION_WEBHOOK)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
  };
  const [intervaloInput, setIntervaloInput] = useState("");
  const [savingIntervalo, setSavingIntervalo] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = async () => {
    try {
      const [s, c, e] = await Promise.all([dropboxAPI.status(), dropboxAPI.getEscaneoConfig(), infoAPI.listEstados()]);
      dropboxAPI.diagnosticoCarpetas().then((d) => setDiagnostico(d.carpetas)).catch(() => setDiagnostico([]));
      setStatus(s);
      setConfig(c);
      setIntervaloInput(String(c.intervalMinutos));
      setEstados(e);
    } catch (err: any) {
      sweetAlert.error("Error", err?.response?.data?.error || "No se pudo cargar la configuración del escaneo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick del reloj para la cuenta regresiva (1x por segundo, solo mientras hay algo que contar).
  useEffect(() => {
    if (!config?.proximoEscaneoAt) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [config?.proximoEscaneoAt]);

  const forzarEscaneo = async () => {
    setEscaneando(true);
    try {
      const { transicionesAplicadas } = await dropboxAPI.forzarEscaneoEstados();
      sweetAlert.success("Escaneo completo", transicionesAplicadas > 0 ? `Se aplicaron ${transicionesAplicadas} transición(es).` : "No se encontraron archivos nuevos para aplicar.");
      const c = await dropboxAPI.getEscaneoConfig();
      setConfig(c);
    } catch (e: any) {
      sweetAlert.error("No se pudo escanear", e?.response?.data?.error || "No se pudo forzar el escaneo. Intentá de nuevo.");
    } finally {
      setEscaneando(false);
    }
  };

  const guardarIntervalo = async () => {
    const minutos = Number(intervaloInput);
    if (!Number.isFinite(minutos)) {
      sweetAlert.error("Valor inválido", "Ingresá un número de minutos válido.");
      return;
    }
    setSavingIntervalo(true);
    try {
      const c = await dropboxAPI.setEscaneoIntervalo(minutos);
      setConfig(c);
      setIntervaloInput(String(c.intervalMinutos));
      sweetAlert.success("Guardado", `El escaneo automático ahora corre cada ${c.intervalMinutos} minutos.`);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo guardar el intervalo.");
    } finally {
      setSavingIntervalo(false);
    }
  };

  const estadosConTransicion = estados.filter((e) => (e.data?.transicionAutomatica?.carpetas || []).length > 0);

  const cuentaRegresiva = useMemo(() => {
    if (!config?.proximoEscaneoAt) return null;
    return formatCuentaRegresiva(config.proximoEscaneoAt - ahora);
  }, [config?.proximoEscaneoAt, ahora]);

  return (
    <PageLayout
      // El menú dice "Dropbox" a secas: el calificador que antes llevaba el ítem ("| Conexión") vive
      // acá, en el subtítulo y en el ⓘ, que es donde se puede explicar de verdad.
      title="Dropbox"
      subtitle="La conexión con la cuenta y el escaneo automático que hace avanzar los contratos de estado"
      faIcon={{ icon: faDropbox }}
      shouldShowInfo
      infoModal={{
        isOpen: showInfo,
        onOpen: () => setShowInfo(true),
        onClose: () => setShowInfo(false),
        title: "Dropbox: conexión y escaneo",
        content: (
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            {/* Lo primero es dónde estás parado: hay tres pantallas de Dropbox en el menú y sin el
                sufijo "| Conexión" del ítem hay que decirlo en algún lado. */}
            <p className="p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-300">
              Esta es la pantalla de <strong>configuración</strong>: con qué cuenta de Dropbox se trabaja, cada cuánto se revisa y qué carpetas se miran. Los documentos que el escaneo encuentra se ven
              en <strong>Admin GENERAL → Documentos</strong>, y los avisos de firma se configuran aparte, en <strong>DropboxSign</strong>.
            </p>
            <p>
              Cuando un <strong>Estado</strong> tiene una <strong>transición automática</strong> configurada, el sistema revisa solo la carpeta de Dropbox indicada: si aparece un archivo nuevo y se puede
              identificar sin ambigüedad a qué contrato pertenece, lo avanza a ese Estado.
            </p>
            <p>
              Para identificar el contrato, el sistema usa los <strong>campos obligatorios de la nomenclatura</strong> —quién es (CUIT y email) y las fechas del período—, los mismos que lee{" "}
              <strong>DropboxSign</strong>. Prueba en este orden: <strong>1)</strong> el CUIT en el nombre del archivo, <strong>2)</strong> el <strong>email</strong> del nombre, <strong>3)</strong> si el
              nombre no trae ninguno de los dos, el CUIT dentro del contenido del PDF, y <strong>4)</strong> como último recurso, el nombre y apellido de la persona. Si una persona tiene{" "}
              <strong>dos contratos</strong> que podrían ser, desempata con las <strong>fechas</strong> del nombre. Y si no logra identificar exactamente uno, no hace nada — nunca adivina.
            </p>
            <p>
              Van los <strong>dos</strong> identificadores porque el CUIT no siempre está: hay personas sin CUIL cargado, y para ellas lo único que identifica es el email, que es obligatorio al
              registrarse. Por eso las dos variables son obligatorias en el patrón.
            </p>
            {/* De qué depende todo esto. Es la misma explicación que está en Nomenclatura de archivos y
                en DropboxSign, contada desde acá: quien entra por esta pantalla tiene que poder llegar
                al lugar donde se decide qué dice el nombre. */}
            <p className="flex items-start gap-1.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Todo esto depende de <strong>lo que diga el nombre del archivo</strong>: acá no se consulta ninguna base ni ningún identificador interno. Un archivo cuyo nombre no traiga el CUIT ni el email —o las
                fechas, cuando hay que desempatar— aparece en la carpeta y se queda ahí. Qué lleva cada nombre se define en <strong>Plantillas → Nomenclatura de archivos</strong>, que no deja guardar un
                patrón sin esos datos justamente por esto.
              </span>
            </p>

            {/*
              EL ALTA DEL WEBHOOK. Vive acá y no en la tarjeta, y en ningún README.

              La tarjeta de la pantalla tiene la URL y el botón de copiar —que es lo que se necesita
              todos los días— y un link que abre esto. La explicación completa está una sola vez: son
              pasos que se siguen una vez por despliegue, y repetidos en dos lados se corrige uno solo.
            */}
            <div id={ID_SECCION_WEBHOOK} className="pt-3 mt-1 border-t border-gray-200 dark:border-gray-700 space-y-3 scroll-mt-4">
              <p className="text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <FontAwesomeIcon icon={faBolt} className="h-3.5 w-3.5 text-amber-500" />
                Dar de alta el aviso de Dropbox (webhook)
              </p>
              <p>
                Con esto configurado, Dropbox le avisa al servidor cada vez que se agrega o se saca un archivo, y el escaneo corre en <strong>segundos</strong> en lugar de esperar el intervalo. El
                escaneo por intervalo <strong>no se reemplaza</strong>: Dropbox entrega «al menos una vez» y no reintenta para siempre, así que un aviso que llega justo mientras el servidor se reinicia
                se pierde y nadie lo reclama. Los dos conviven a propósito — el aviso da la velocidad, el reloj es la red.
              </p>
              <p>
                Se hace una sola vez, en la <strong>App Console</strong> de Dropbox: entrá a tu app, pestaña <strong>Settings</strong>, sección <strong>Webhook URIs</strong>, pegá la URL que muestra
                esta pantalla y apretá <strong>Add</strong>. Dropbox llama a esa URL en el momento con un <em>challenge</em> y solo la guarda si le responde bien; cuando la acepta, la fila queda en{" "}
                <strong>Enabled</strong>. Si no responde como espera, no la guarda y hay que volver a empezar.
              </p>
              <p>
                Por eso el orden importa: el servidor tiene que estar <strong>desplegado y con el endpoint andando antes</strong> de pegar la URL. Y tiene que ser <strong>HTTPS alcanzable desde
                internet</strong> — contra <span className="font-mono text-[12px]">localhost</span> Dropbox no llega; para probar antes de desplegar hace falta un túnel.
              </p>
              <p className="flex items-start gap-1.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
                <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  <strong>Pegala sin barra final.</strong> Con la barra, el pedido no llega al endpoint: lo atiende el frontend, que responde <strong>200 con una página HTML</strong>. Dropbox acepta el
                  alta y después da <strong>todas</strong> las entregas por exitosas contra una página estática — el servidor nunca se entera de nada y no queda rastro en ningún log. Es el modo de falla
                  más caro que tiene esto, porque desde afuera se ve exactamente igual que funcionar.
                </span>
              </p>
              <p>
                <strong>Cómo confirmar que quedó bien:</strong> que la fila de la App Console diga <strong>Enabled</strong>, y que al agregar un archivo a una carpeta vigilada el cambio aparezca en
                segundos en vez de esperar el intervalo. Si aparece recién cuando pasa el reloj, el aviso no está llegando.
              </p>

              <p className="text-sm font-bold text-gray-800 dark:text-gray-100 pt-1">Para replicarlo en otro sistema</p>
              <p>
                <strong>No hay variables de entorno de Dropbox.</strong> Las credenciales son <strong>de cada organización</strong> y se cargan en la tarjeta de arriba de esta misma pantalla, que pide
                cuatro cosas: <strong>App key</strong>, <strong>App secret</strong>, <strong>Refresh token (offline)</strong> y la <strong>ruta raíz</strong> (por defecto{" "}
                <span className="font-mono text-[12px]">/HelloSign</span>, que solo define dónde arranca el navegador de carpetas y no restringe el acceso). Se guardan cifradas contra la organización,
                no en el servidor.
              </p>
              <p>
                Esa es la razón de que la firma del webhook se verifique <strong>con el secret de la organización dueña de la cuenta</strong> y no contra un secret global: como cada una conecta su
                propia app de Dropbox, un secret único no existiría. El aviso trae solo el identificador de cuenta, se resuelve a quién pertenece, y recién ahí se comprueba la firma con el suyo.
              </p>
              <p>
                La app de Dropbox tiene que crearse con <strong>Access type: Full Dropbox</strong> —con «App folder» la API solo ve su propia carpeta y no se puede cambiar después— y con estos cuatro
                permisos tildados y <strong>submiteados</strong> en la pestaña <strong>Permissions</strong> antes de autorizar:
              </p>
              <p className="font-mono text-[12px] bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2.5 py-2">
                account_info.read · files.metadata.read · files.content.read · files.content.write
              </p>
              <p>
                El orden importa acá también: Dropbox otorga la intersección entre lo que pide la autorización y lo que la app tiene habilitado, así que con Permissions incompleto el token sale con
                menos permisos <strong>sin ningún error visible</strong> — la conexión parece hecha y después falla todo. Cambiarlos más tarde obliga a regenerar el refresh token.
              </p>
              <p>
                <strong>No hay redirect URI</strong> ni pantalla de autorización en la app: el refresh token se genera a mano una vez, con la URL de autorización de Dropbox pidiendo{" "}
                <span className="font-mono text-[12px]">token_access_type=offline</span> y esos cuatro permisos, y se pega en el formulario de arriba.
              </p>
              <p>
                Y nada de esto sirve si el escaneo no puede identificar los archivos: eso depende del nombre y se configura en <strong>Plantillas → Nomenclatura de archivos</strong>, como dice el
                recuadro de arriba.
              </p>
            </div>
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
          {/* Vincular / desvincular la cuenta desde acá: el escaneo depende justamente de ella, así
              que tener que ir a otra pantalla para cambiarla no tenía sentido. */}
          <DropboxConexionCard status={status} onChanged={cargar} />

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Frecuencia del escaneo</p>
            {/* Uno abajo del otro, no al lado: se editan el intervalo y se guarda, y recién ahí el
                próximo escaneo dice algo distinto. En fila parecían dos campos del mismo formulario,
                cuando el de la derecha no se edita — es la consecuencia del de arriba. */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400">Revisar cada (minutos)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={5}
                    max={1440}
                    className="input-field w-28"
                    value={intervaloInput}
                    onChange={(e) => setIntervaloInput(e.target.value)}
                    disabled={!status?.canManageConnection}
                  />
                  <button
                    type="button"
                    onClick={guardarIntervalo}
                    disabled={savingIntervalo || !status?.canManageConnection || String(config?.intervalMinutos) === intervaloInput}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <FontAwesomeIcon icon={savingIntervalo ? faSpinner : faCheck} spin={savingIntervalo} />
                    Guardar
                  </button>
                </div>
                <p className="text-[11px] text-gray-400">Entre 5 y 1440 minutos (1 día).</p>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400">Próximo escaneo automático</label>
                <div className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 text-sm font-mono text-gray-700 dark:text-gray-200">
                  <FontAwesomeIcon icon={faStopwatch} className="h-3.5 w-3.5 text-blue-500" />
                  {cuentaRegresiva || "Todavía no corrió ningún escaneo"}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-gray-100 dark:border-gray-700/60">
              <button
                type="button"
                onClick={forzarEscaneo}
                disabled={escaneando}
                title="Forzar ya mismo el escaneo, sin esperar el intervalo configurado"
                className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed w-fit"
              >
                <FontAwesomeIcon icon={faArrowsRotate} spin={escaneando} />
                <span>{escaneando ? "Escaneando…" : "Forzar escaneo"}</span>
              </button>
            </div>

            {/*
              EL AVISO DE DROPBOX, que es lo que hace que este intervalo casi no importe.

              Con el webhook dado de alta, cada archivo que entra o sale de las carpetas dispara el
              escaneo en segundos, y el reloj de arriba queda como red por si un aviso se pierde. Sin
              darlo de alta, la app funciona igual — solo que esperando el intervalo.

              La URL va acá y no en la documentación porque es un dato de ESTA instalación: cambia
              según el dominio, y buscarla en otro lado es la forma seguar de pegar la del servidor
              equivocado. El botón de copiar existe por lo mismo: un carácter de menos y Dropbox
              rechaza la verificación sin decir cuál.
            */}
            <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-700/60 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                  <FontAwesomeIcon icon={faBolt} className="h-3 w-3 text-amber-500" />
                  Escanear apenas Dropbox avisa
                </p>
                {/* Los pasos completos están en el ⓘ de la pantalla, una sola vez. Acá va el link. */}
                <button type="button" onClick={verComoDarDeAlta} className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40">
                  Cómo darlo de alta
                </button>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Dropbox puede avisarle al servidor cada vez que se agrega o se saca un archivo de las carpetas, y entonces el escaneo corre en segundos en vez de esperar el intervalo de arriba. Se da
                de alta <strong>una sola vez</strong>, pegando esta URL en la App Console:
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="px-2 py-1.5 rounded-md bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-[11.5px] font-mono text-gray-700 dark:text-gray-200 break-all">{urlWebhook}</code>
                <button
                  type="button"
                  onClick={copiarWebhook}
                  title="Copiar la URL del webhook"
                  className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <FontAwesomeIcon icon={copiado ? faCheck : faCopy} className="h-3 w-3" />
                  {copiado ? "Copiada" : "Copiar"}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Pegala <strong>sin barra final</strong>: con la barra el aviso no llega al servidor y Dropbox lo da por entregado igual. Si no lo das de alta no se rompe nada — el escaneo sigue
                corriendo por el intervalo de arriba.
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Carpetas vigiladas</p>
            {diagnostico.length > 0 && (
              <div className="mb-4 space-y-1">
                {diagnostico.map((d) => (
                  <div key={d.proposito} className="flex items-start gap-2 text-[11px]">
                    <span className="font-semibold text-gray-600 dark:text-gray-300 w-40 shrink-0">{d.etiqueta}</span>
                    {d.origen === "no_resuelta" ? (
                      <span className="text-red-600 dark:text-red-400">sin carpeta — esa función no se puede usar</span>
                    ) : (
                      <span className="min-w-0">
                        <span className="font-mono text-gray-500 dark:text-gray-400 break-all">{d.carpeta}</span>
                        {/* «anda» y «anda de casualidad» son cosas distintas y acá se dicen distinto. */}
                        {d.origen === "patron" && <span className="ml-1.5 text-amber-700 dark:text-amber-400">se encontró por su NOMBRE: si la renombrás, deja de funcionar. Cargale el propósito.</span>}
                        {d.origen === "derivada" && <span className="ml-1.5 text-amber-700 dark:text-amber-400">ruta deducida: no está vigilada por el escaneo.</span>}
                        {d.existe === false && <span className="ml-1.5 text-red-600 dark:text-red-400">no existe en Dropbox.</span>}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {estadosConTransicion.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Todavía no hay ninguna transición automática configurada.</p>
            ) : (
              <div className="space-y-3">
                {estadosConTransicion.map((estado) => (
                  <div key={estado._id} className="flex flex-wrap items-start gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-200 shrink-0">
                      <FontAwesomeIcon icon={faBolt} className="h-3 w-3 text-blue-500" />
                      {estado.name}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(estado.data?.transicionAutomatica?.carpetas || []).map((c) => (
                        <span
                          key={c.dropboxCarpeta}
                          title={c.detalle ? `${c.dropboxCarpeta} — ${c.detalle}` : c.dropboxCarpeta}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/50 rounded px-1.5 py-0.5"
                        >
                          <FontAwesomeIcon icon={faFolder} className="h-2.5 w-2.5 text-amber-500" />
                          {nombreCarpeta(c.dropboxCarpeta)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Las carpetas vigiladas salen de las dependencias entre estados: el acceso a editarlas
                va acá, junto a lo que configura. */}
            <a
              href="/contratos?tab=dependencies"
              className="mt-4 px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm w-fit"
            >
              <FontAwesomeIcon icon={faSitemap} />
              <span>Dependencias</span>
            </a>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default EscaneoDropboxConfigPage;

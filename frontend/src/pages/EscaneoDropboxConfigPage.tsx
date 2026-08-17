import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate, faBolt, faFolder, faSpinner, faCheck, faStopwatch, faSitemap } from "@fortawesome/free-solid-svg-icons";
import { faDropbox } from "@fortawesome/free-brands-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { infoAPI, InfoItem } from "../api/info";
import { dropboxAPI, DropboxStatus, EscaneoConfig } from "../api/dropbox";
import { DropboxConexionCard } from "../components/documents/DropboxConexionCard";
import { sweetAlert } from "../utils/sweetAlert";

/** Nombre de carpeta (última parte del path), para mostrar algo legible en vez del path completo. */
const nombreCarpeta = (path: string): string => path.split("/").filter(Boolean).pop() || path;

const formatCuentaRegresiva = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};

export function EscaneoDropboxConfigPage() {
  const [status, setStatus] = useState<DropboxStatus | null>(null);
  const [config, setConfig] = useState<EscaneoConfig | null>(null);
  const [estados, setEstados] = useState<InfoItem[]>([]);
  const [loading, setLoading] = useState(true);
  /** Explicación de cómo funciona el escaneo (modal del ⓘ de la cabecera, como el resto de las páginas). */
  const [showInfo, setShowInfo] = useState(false);
  const [escaneando, setEscaneando] = useState(false);
  const [intervaloInput, setIntervaloInput] = useState("");
  const [savingIntervalo, setSavingIntervalo] = useState(false);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = async () => {
    try {
      const [s, c, e] = await Promise.all([dropboxAPI.status(), dropboxAPI.getEscaneoConfig(), infoAPI.listEstados()]);
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
              Para identificar el contrato, el sistema prueba en este orden: <strong>1)</strong> el CUIT en el nombre del archivo, <strong>2)</strong> si no lo encuentra ahí, el CUIT dentro del contenido
              del PDF, y <strong>3)</strong> si tampoco hay CUIT disponible, el nombre y apellido de la persona en el nombre del archivo. Si no logra identificar exactamente un contrato, no hace nada —
              nunca adivina.
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
          {/* Vincular / desvincular la cuenta desde acá: el escaneo depende justamente de ella, así
              que tener que ir a otra pantalla para cambiarla no tenía sentido. */}
          <DropboxConexionCard status={status} onChanged={cargar} />

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Frecuencia del escaneo</p>
            <div className="flex flex-wrap items-end gap-3">
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

              <div className="flex-1 min-w-[220px] space-y-1">
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
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3">Carpetas vigiladas</p>
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

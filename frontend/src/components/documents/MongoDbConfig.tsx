import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { backupsAPI, ConfigBackup } from "../../api/backups";
import { sweetAlert } from "../../utils/sweetAlert";

/**
 * Configuración → DDBB → «MongoDB».
 *
 * Dos cosas que hasta acá solo vivían en el código: cada cuánto se hace la copia automática, y cómo se
 * importa una copia a Atlas. Lo segundo importa tanto como lo primero — un backup que nadie sabe
 * restaurar no es un backup, y el momento en que hace falta no es el momento de ir a leer el fuente.
 *
 * Es un PANEL y no un modal: vive en su propia pantalla del menú, y la pestaña DDBB de Documentos
 * linkea acá. Como modal no se podía linkear ni dejar abierta al lado de la carpeta que explica.
 */

const formatearFecha = (iso: string | null): string => {
  if (!iso) return "todavía no se hizo ninguna";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const Comando: React.FC<{ children: string }> = ({ children }) => (
  <pre className="mt-1 overflow-x-auto rounded bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-2 text-[11px] leading-relaxed text-gray-800 dark:text-gray-200">{children}</pre>
);

export const MongoDbConfig: React.FC = () => {
  const [config, setConfig] = useState<ConfigBackup | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [intervalo, setIntervalo] = useState(12);
  const [retener, setRetener] = useState(14);

  useEffect(() => {
    setCargando(true);
    backupsAPI
      .config()
      .then((c) => {
        setConfig(c);
        setIntervalo(c.intervaloHoras);
        setRetener(c.retener);
      })
      .catch((e: any) => sweetAlert.error("No se pudo leer la configuración", String(e?.response?.data?.error || e?.message || "")))
      .finally(() => setCargando(false));
  }, []);

  const guardar = async () => {
    setGuardando(true);
    try {
      await backupsAPI.guardarConfig(intervalo, retener);
      // El scheduler la relee en su próxima vuelta: no hay que reiniciar nada, pero tampoco es instantáneo.
      sweetAlert.success("Configuración guardada", `Copia cada ${intervalo} h, conservando ${retener}. Toma efecto en la próxima revisión (hasta 15 minutos).`);
    } catch (e: any) {
      sweetAlert.error("No se pudo guardar", String(e?.response?.data?.error || e?.message || ""));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6 max-w-3xl">
      {cargando ? (
        <div className="py-10 text-center text-sm text-gray-500">
          <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
          Cargando…
        </div>
      ) : (
        <div className="space-y-6 text-sm text-gray-700 dark:text-gray-300">
          {config?.ultimoError && (
            <div className="flex items-start gap-2 rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-red-700 dark:text-red-300">
              <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5" />
              <div>
                <p className="font-semibold">La última copia automática falló</p>
                <p className="text-xs mt-0.5 break-words">{config.ultimoError}</p>
              </div>
            </div>
          )}

          <section className="space-y-3">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">Copia automática</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-xs font-medium mb-1">Frecuencia</span>
                <select value={intervalo} onChange={(e) => setIntervalo(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white">
                  {(config?.intervalosValidos || [6, 12, 24, 48]).map((h) => (
                    <option key={h} value={h}>
                      Cada {h} horas
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="block text-xs font-medium mb-1">Copias que se conservan</span>
                <input type="number" min={1} max={200} value={retener} onChange={(e) => setRetener(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white" />
                <span className="block text-[11px] text-gray-500 mt-1">Al subir una nueva se borran las más viejas.</span>
              </label>
            </div>
            <p className="text-xs text-gray-500">
              Carpeta: <code>{config?.carpeta}</code> · Última copia: <strong>{formatearFecha(config?.ultimoBackupAt ?? null)}</strong>
              {config?.enCurso && <span className="ml-2 text-blue-600 dark:text-blue-400">· hay una en curso</span>}
            </p>

            {/*
              El segundo destino. Se dice el estado y no solo «sí/no» porque «sin configurar» y «mal
              configurado» son cosas distintas: la primera es una instalación que todavía no lo activó,
              la segunda es una URI que apunta a la base que se está respaldando —que no sería un backup—.
            */}
            <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-xs">
              <span className="font-semibold text-gray-700 dark:text-gray-300">Segundo destino (otra base de Mongo): </span>
              {config?.mongoDestino?.estado === "ok" && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  conectado a <code>{config.mongoDestino.base}</code> · se conserva solo la última copia
                </span>
              )}
              {config?.mongoDestino?.estado === "sin_configurar" && (
                <span className="text-gray-500">
                  sin configurar. Las copias van solo a Dropbox. Se activa con <code>MONGO_URI_BACKUP</code> en el servidor.
                </span>
              )}
              {config?.mongoDestino?.estado === "error" && <span className="text-red-600 dark:text-red-400">{config.mongoDestino.error}</span>}
            </div>
          </section>

          <section className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-4">
            <h4 className="font-semibold text-gray-900 dark:text-gray-100">Cómo importarla</h4>
            <p className="text-xs">
              Cada copia es una carpeta con un archivo <code>.json</code> por colección, en JSON extendido y sin comprimir: se puede abrir y leer tal cual. Es el formato que lee{" "}
              <code>mongoimport</code>, así que entra en Atlas sin pasos intermedios. Bajá la carpeta y, parada en ella:
            </p>
            <Comando>{`mongoimport --uri "mongodb+srv://<usuario>:<clave>@<cluster>/<base>" \\
  --collection users --file users.json`}</Comando>
            <p className="text-xs">Para importar la carpeta entera, una colección por archivo:</p>
            <Comando>{`for f in *.json; do
  [ "$f" = "_backup.json" ] && continue   # el manifiesto no es una colección
  mongoimport --uri "mongodb+srv://<usuario>:<clave>@<cluster>/<base>" \\
    --collection "\${f%.json}" --file "$f"
done`}</Comando>
            <p className="text-xs text-gray-500">
              <strong>Importá siempre sobre una base vacía</strong>, no sobre una con datos: <code>mongoimport</code> no borra lo que ya está, y los documentos con el mismo{" "}
              <code>_id</code> se rechazan mientras el resto entra — quedaría una base mezclada.
            </p>
            <p className="text-xs text-gray-500">
              El archivo <code>_backup.json</code> de cada carpeta dice de qué base salió, cuándo y cuántos documentos tiene cada colección: sirve para comprobar que la
              importación quedó completa.
            </p>
            <p className="text-xs text-gray-500">
              Sin <code>mongoimport</code> a mano, en el repo está <code>npm run restaurar:backup</code>, que hace lo mismo con la carpeta entera y arranca en modo simulación.
            </p>
          </section>
        </div>
      )}

      {!cargando && (
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-100 dark:border-gray-700 pt-4">
          <button onClick={guardar} disabled={guardando || !config?.dropboxConectado} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2">
            {guardando && <FontAwesomeIcon icon={faSpinner} spin />}
            Guardar
          </button>
        </div>
      )}
    </div>
  );
};

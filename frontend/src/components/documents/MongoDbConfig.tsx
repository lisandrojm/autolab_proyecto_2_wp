import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { backupsAPI, ConfigBackup } from "../../api/backups";
import { sweetAlert } from "../../utils/sweetAlert";
import { mensajeErrorApi } from "../../utils/errorApi";

/** Un solo lugar para los errores de esta pantalla: distingue «falta deployar» de un error real. */
const mostrarError = (e: any, titulo: string) => {
  const m = mensajeErrorApi(e, titulo);
  sweetAlert.error(m.titulo, m.detalle);
};

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
      .catch((e: any) => mostrarError(e, "No se pudo leer la configuración"))
      .finally(() => setCargando(false));
  }, []);

  const guardar = async () => {
    setGuardando(true);
    try {
      await backupsAPI.guardarConfig(intervalo, retener);
      // El scheduler la relee en su próxima vuelta: no hay que reiniciar nada, pero tampoco es instantáneo.
      sweetAlert.success("Configuración guardada", `Copia cada ${intervalo} h, conservando ${retener}. Toma efecto en la próxima revisión (hasta 15 minutos).`);
    } catch (e: any) {
      mostrarError(e, "No se pudo guardar");
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
          {/*
            EL CARTEL DICE QUÉ FALLÓ, NO «FALLÓ».

            Los destinos son dos y se intentan por separado. Decir «la última copia falló» cuando la
            copia SÍ quedó en Dropbox y lo que no salió fue el clon dentro de Mongo manda a buscar un
            problema que no existe —y peor: hace dudar de una copia que está bien—.
          */}
          {config?.ultimoError &&
            (() => {
              const soloMongo = /^Mongo de backup:/.test(config.ultimoError) && !/Dropbox:/.test(config.ultimoError);
              // El clon dentro de Mongo está apagado: un error que es SÓLO de él quedó guardado de una
              // corrida anterior y ya no dice nada de la copia actual. No se muestra.
              if (soloMongo) return null;
              return (
                <div className={`flex items-start gap-2 rounded border p-3 ${soloMongo ? "border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300" : "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"}`}>
                  <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5" />
                  <div>
                    <p className="font-semibold">{soloMongo ? "La copia quedó en Dropbox, pero el clon dentro de Mongo falló" : "La última copia falló"}</p>
                    <p className="text-xs mt-0.5 break-words">{config.ultimoError}</p>
                    {soloMongo && <p className="text-xs mt-1 opacity-80">La copia de Dropbox está completa y sirve para restaurar. Lo que falta es la copia consultable desde Atlas.</p>}
                  </div>
                </div>
              );
            })()}

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
              DÓNDE QUEDA LA COPIA: sólo en Dropbox.

              Antes también se clonaba la base entera dentro del mismo cluster de Mongo. Se apagó: cada clon
              suma todas las colecciones de la base y el cluster llegó a su tope de 500, y encima no protegía
              de una caída del cluster. Dropbox está afuera y es la copia que sirve para restaurar.
            */}
            <div className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 px-3 py-2 text-xs">
              <span className="font-semibold text-gray-700 dark:text-gray-300">Destino: </span>
              <span className="text-emerald-600 dark:text-emerald-400">sólo Dropbox.</span>{" "}
              <span className="text-gray-500">La copia ya no se clona dentro de Mongo: llenaba el cluster y no protegía de que se cayera.</span>
            </div>
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

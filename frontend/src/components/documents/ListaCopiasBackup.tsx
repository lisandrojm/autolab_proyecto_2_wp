import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faFolder, faDownload, faTriangleExclamation, faRotate } from "@fortawesome/free-solid-svg-icons";
import { backupsAPI, CopiaBackup } from "../../api/backups";
import { sweetAlert } from "../../utils/sweetAlert";

/**
 * El listado de copias, con FECHA y TAMAÑO.
 *
 * Antes esta pestaña usaba el explorador genérico de Dropbox, y ahí cada copia es una carpeta: Dropbox
 * no devuelve el tamaño de una carpeta, así que la columna mostraba un guion y la única pista de cuándo
 * se había hecho la copia era leer la fecha adentro del nombre.
 *
 * Los datos salen del `_backup.json` de cada copia, que el backend lee y resume (`GET /backups/copias`).
 * Una copia SIN manifiesto se lista igual, marcada como incompleta: es exactamente la señal de que la
 * subida se cortó a la mitad, y esconderla haría que parezca sana.
 */

const formatearFecha = (iso: string | null, nombre: string): string => {
  if (iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  // Respaldo: el nombre de la carpeta lleva el sello `<base>_YYYY-MM-DD_HHMM`.
  const m = /_(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})$/.exec(nombre);
  return m ? `${m[1].split("-").reverse().join("/")} ${m[2]}:${m[3]}` : "—";
};

const formatearTamano = (bytes: number): string => {
  if (!bytes) return "—";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
};

export const ListaCopiasBackup: React.FC<{ recarga?: number; frecuenciaHoras?: number; retener?: number }> = ({ recarga = 0, frecuenciaHoras, retener }) => {
  const [copias, setCopias] = useState<CopiaBackup[]>([]);
  const [cargando, setCargando] = useState(true);
  const [conectado, setConectado] = useState(true);

  const cargar = () => {
    setCargando(true);
    backupsAPI
      .copias()
      .then((r) => {
        setCopias(r.copias);
        setConectado(r.dropboxConectado);
      })
      .catch((e: any) => sweetAlert.error("No se pudieron listar las copias", String(e?.response?.data?.error || e?.message || "")))
      .finally(() => setCargando(false));
  };

  useEffect(cargar, [recarga]);

  const descargar = async (copia: CopiaBackup) => {
    try {
      // Se baja el manifiesto, que es lo que dice qué tiene la copia. Los `.json` de cada colección se
      // bajan desde Dropbox: son varios archivos y no tiene sentido zipearlos del lado del server.
      const url = await backupsAPI.linkDescarga(`${copia.path}/_backup.json`);
      window.open(url, "_blank", "noopener");
    } catch (e: any) {
      sweetAlert.error("No se pudo generar el link", String(e?.response?.data?.error || e?.message || ""));
    }
  };

  const total = copias.reduce((a, c) => a + c.bytes, 0);

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Copias ({copias.length})</h3>
          {/* La frecuencia, a la vista donde están las copias: es la respuesta a «¿cada cuánto se hace esto?». */}
          <p className="text-xs text-gray-500 mt-1">
            {frecuenciaHoras ? (
              <>
                Se genera una copia <strong>cada {frecuenciaHoras} horas</strong>
                {retener ? (
                  <>
                    {" "}
                    y se conservan las <strong>últimas {retener}</strong>
                  </>
                ) : null}
                .
              </>
            ) : (
              "Copia automática de la base."
            )}
            {total > 0 && <> Ocupan {formatearTamano(total)} en total.</>}
          </p>
        </div>
        <button onClick={cargar} disabled={cargando} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
          <FontAwesomeIcon icon={faRotate} spin={cargando} className="h-3 w-3" />
          Actualizar
        </button>
      </div>

      {!conectado ? (
        <p className="py-10 text-center text-sm text-gray-500">Dropbox no está conectado: no hay dónde leer las copias.</p>
      ) : cargando ? (
        <p className="py-10 text-center text-sm text-gray-500">
          <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
          Cargando…
        </p>
      ) : copias.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">Todavía no hay ninguna copia. Generá una con «Backup ahora».</p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Copia</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Fecha</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tamaño</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Colecciones</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Documentos</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {copias.map((c) => (
                <tr key={c.path} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <span className="inline-flex items-center gap-2 text-gray-800 dark:text-gray-200">
                      <FontAwesomeIcon icon={faFolder} className="text-amber-500" />
                      {c.nombre}
                    </span>
                    {!c.completa && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase text-red-600 dark:text-red-400" title="No tiene _backup.json: la subida quedó a medias">
                        <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                        Incompleta
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{formatearFecha(c.fecha, c.nombre)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600 dark:text-gray-300">{formatearTamano(c.bytes)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600 dark:text-gray-300">{c.colecciones || "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600 dark:text-gray-300">{c.documentos ? c.documentos.toLocaleString("es-AR") : "—"}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <button onClick={() => descargar(c)} disabled={!c.completa} title={c.completa ? "Ver el manifiesto de esta copia" : "Sin manifiesto: la copia está incompleta"} className="p-2 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-40 disabled:cursor-not-allowed">
                      <FontAwesomeIcon icon={faDownload} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

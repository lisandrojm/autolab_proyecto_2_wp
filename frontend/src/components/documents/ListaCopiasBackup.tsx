import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faFolder, faFolderOpen, faDownload, faTriangleExclamation, faTrash, faChevronRight, faChevronDown, faEye, faFileLines } from "@fortawesome/free-solid-svg-icons";
import { backupsAPI, CopiaBackup, ArchivoCopia } from "../../api/backups";
import { Modal } from "../ui/Modal";
import { sweetAlert } from "../../utils/sweetAlert";
import { mensajeErrorApi } from "../../utils/errorApi";

/** Un solo lugar para los errores de esta pantalla: distingue «falta deployar» de un error real. */
const mostrarError = (e: any, titulo: string) => {
  const m = mensajeErrorApi(e, titulo);
  sweetAlert.error(m.titulo, m.detalle);
};

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
  const [tildadas, setTildadas] = useState<Set<string>>(new Set());

  const cargar = () => {
    setCargando(true);
    backupsAPI
      .copias()
      .then((r) => {
        setCopias(r.copias);
        setConectado(r.dropboxConectado);
        // La selección es de ESTA lista: si algo se borró o entró una copia nueva, lo tildado ya no
        // corresponde y arrastrarlo llevaría a borrar otra cosa.
        setTildadas(new Set());
      })
      .catch((e: any) => mostrarError(e, "No se pudieron listar las copias"))
      .finally(() => setCargando(false));
  };

  useEffect(cargar, [recarga]);

  const [bajando, setBajando] = useState<string | null>(null);

  /*
    ABRIR UNA COPIA PARA VER SUS COLECCIONES.

    La tabla mostraba «58 colecciones» y ahí se terminaba: para saber cuáles, o mirar una, había que
    bajar los 31 MB del zip. Ahora la fila se despliega y lista los `.json` con su tamaño.
  */
  const [abierta, setAbierta] = useState<string | null>(null);
  const [archivos, setArchivos] = useState<Record<string, ArchivoCopia[]>>({});
  const [cargandoArchivos, setCargandoArchivos] = useState(false);
  const [viendo, setViendo] = useState<{ nombre: string; contenido: string; bytes: number; recortado: boolean; limite: number } | null>(null);
  const [cargandoVista, setCargandoVista] = useState(false);

  const abrir = async (copia: CopiaBackup) => {
    if (abierta === copia.path) {
      setAbierta(null);
      return;
    }
    setAbierta(copia.path);
    // Se pide una sola vez por copia: el contenido de una copia no cambia.
    if (archivos[copia.path]) return;
    setCargandoArchivos(true);
    try {
      // El `await` va afuera del updater: la función que recibe `setArchivos` no puede ser async.
      const lista = await backupsAPI.archivosDeCopia(copia.path);
      setArchivos((prev) => ({ ...prev, [copia.path]: lista }));
    } catch (e: any) {
      mostrarError(e, "No se pudo abrir la copia");
      setAbierta(null);
    } finally {
      setCargandoArchivos(false);
    }
  };

  const ver = async (archivo: ArchivoCopia) => {
    setCargandoVista(true);
    try {
      const r = await backupsAPI.verArchivo(archivo.path);
      setViendo({ nombre: archivo.nombre, ...r });
    } catch (e: any) {
      mostrarError(e, "No se pudo leer el archivo");
    } finally {
      setCargandoVista(false);
    }
  };

  const bajarArchivo = async (archivo: ArchivoCopia) => {
    try {
      window.open(await backupsAPI.linkArchivo(archivo.path), "_blank", "noopener");
    } catch (e: any) {
      mostrarError(e, "No se pudo generar el link");
    }
  };

  /**
   * Baja la copia ENTERA, en un zip.
   *
   * Antes bajaba `_backup.json`, que es el MANIFIESTO: un archivo de pocos KB que dice qué hay en la
   * copia. Servía para verificar, no para restaurar — para importar a Atlas hacen falta los `.json` de
   * las colecciones, que son los que ahora vienen adentro del zip.
   */
  const descargar = async (copia: CopiaBackup) => {
    setBajando(copia.path);
    try {
      const blob = await backupsAPI.descargarCopia(copia.path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${copia.nombre}.zip`;
      a.click();
      // Sin esto el blob queda retenido en memoria hasta que se recargue la página; con 31 MB se nota.
      URL.revokeObjectURL(url);
    } catch (e: any) {
      mostrarError(e, "No se pudo descargar la copia");
    } finally {
      setBajando(null);
    }
  };

  /*
    Borrar una copia es destructivo y no se deshace, así que el cartel dice EXACTAMENTE cuál se va a
    borrar —fecha y tamaño, no solo el nombre— y avisa que el histórico se acorta en una.
  */
  const borrar = async (copia: CopiaBackup) => {
    const res = await sweetAlert.confirm(
      "¿Eliminar esta copia?",
      `Se va a borrar de Dropbox la copia del ${formatearFecha(copia.fecha, copia.nombre)}${copia.bytes ? ` (${formatearTamano(copia.bytes)})` : ""}.\n\nEl clon dentro de Mongo no se toca: ese es siempre el de la última corrida. Esta acción no se puede deshacer.`,
      "Sí, eliminar",
    );
    if (!res.isConfirmed) return;
    try {
      await backupsAPI.borrarCopia(copia.path);
      // Se recarga desde el servidor y no se saca de la lista a mano: así el total y el contador quedan
      // con lo que hay de verdad en Dropbox, no con lo que suponemos.
      cargar();
      sweetAlert.success("Copia eliminada", `Se borró ${copia.nombre}.`);
    } catch (e: any) {
      mostrarError(e, "No se pudo eliminar");
    }
  };

  const alternar = (path: string) =>
    setTildadas((prev) => {
      const s = new Set(prev);
      s.has(path) ? s.delete(path) : s.add(path);
      return s;
    });

  const todasTildadas = copias.length > 0 && tildadas.size === copias.length;

  /**
   * Borrado masivo. En SERIE y no en paralelo: son varias llamadas a Dropbox y mandarlas todas juntas
   * es la forma más rápida de comerse un 429. Las que fallan se cuentan y se informan; las demás siguen.
   */
  const borrarTildadas = async () => {
    const aBorrar = copias.filter((c) => tildadas.has(c.path));
    if (aBorrar.length === 0) return;

    // Se nombran las primeras: «¿Eliminar 5 copias?» sin decir cuáles se confirma a ciegas.
    const muestra = aBorrar
      .slice(0, 5)
      .map((c) => `• ${formatearFecha(c.fecha, c.nombre)} (${formatearTamano(c.bytes)})`)
      .join("\n");
    /*
      Si se llevan TODAS, se dice. Quedarse sin ninguna copia es una situación distinta de borrar unas
      cuantas, y es justo la que uno no quiere descubrir el día que hace falta restaurar.
    */
    const seLlevaTodo = aBorrar.length === copias.length;
    const res = await sweetAlert.confirm(
      aBorrar.length === 1 ? "¿Eliminar esta copia?" : `¿Eliminar ${aBorrar.length} copias?`,
      `${seLlevaTodo ? "SON TODAS las copias que hay: si las borrás no queda ninguna para restaurar.\n\n" : ""}Se borran de Dropbox y no se puede deshacer.\n\n${muestra}${aBorrar.length > 5 ? `\n…y ${aBorrar.length - 5} más.` : ""}\n\nEl clon dentro de Mongo no se toca.`,
      "Sí, eliminar",
    );
    if (!res.isConfirmed) return;

    const fallaron: string[] = [];
    let borradas = 0;
    for (const c of aBorrar) {
      try {
        await backupsAPI.borrarCopia(c.path);
        borradas++;
      } catch {
        fallaron.push(c.nombre);
      }
    }
    cargar();
    if (fallaron.length === 0) sweetAlert.success("Listo", `Se ${borradas === 1 ? "eliminó 1 copia" : `eliminaron ${borradas} copias`}.`);
    else sweetAlert.warningAlert("Quedaron algunas sin eliminar", `Se eliminaron ${borradas} de ${aBorrar.length}.\n\nNo se pudo con:\n${fallaron.slice(0, 5).map((n) => `• ${n}`).join("\n")}`);
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
        {/* El número va en el botón: se ve cuántas se llevan antes de apretar, no recién en el cartel. */}
        <button
          onClick={borrarTildadas}
          disabled={tildadas.size === 0}
          title={tildadas.size === 0 ? "Tildá copias en la lista para poder eliminarlas juntas" : `Eliminar de Dropbox las ${tildadas.size} copias tildadas`}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-red-50 hover:text-red-700 hover:border-red-300 dark:hover:bg-red-900/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-700 dark:disabled:hover:text-gray-300"
        >
          <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
          {tildadas.size > 0 ? `Eliminar (${tildadas.size})` : "Eliminar"}
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
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={todasTildadas}
                    onChange={() => setTildadas(todasTildadas ? new Set() : new Set(copias.map((c) => c.path)))}
                    title={todasTildadas ? "Destildar todas" : "Tildar todas"}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
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
                <tr key={c.path} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${tildadas.has(c.path) ? "bg-blue-50/60 dark:bg-blue-900/10" : ""}`}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={tildadas.has(c.path)} onChange={() => alternar(c.path)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <button onClick={() => abrir(c)} className="inline-flex items-center gap-2 text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400" title="Ver las colecciones de esta copia">
                      <FontAwesomeIcon icon={abierta === c.path ? faChevronDown : faChevronRight} className="h-3 w-3 text-gray-400" />
                      <FontAwesomeIcon icon={abierta === c.path ? faFolderOpen : faFolder} className="text-amber-500" />
                      {c.nombre}
                    </button>
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
                    <button
                      onClick={() => descargar(c)}
                      disabled={!c.completa || bajando === c.path}
                      title={c.completa ? "Descargar la copia entera (.zip) para importar a Atlas" : "Sin manifiesto: la copia está incompleta"}
                      className="p-2 rounded text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FontAwesomeIcon icon={bajando === c.path ? faSpinner : faDownload} spin={bajando === c.path} />
                    </button>
                    {/* Una copia incompleta SÍ se puede borrar: es justamente la que hay que sacar. */}
                    <button onClick={() => borrar(c)} title="Eliminar esta copia de Dropbox" className="p-2 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))}
              {/* La fila desplegada va aparte para no romper el colspan de la tabla. */}
              {copias.map((c) =>
                abierta === c.path ? (
                  <tr key={`${c.path}-abierta`} className="bg-gray-50 dark:bg-gray-800/40">
                    <td colSpan={7} className="px-4 py-3">
                      {cargandoArchivos && !archivos[c.path] ? (
                        <p className="text-xs text-gray-500">
                          <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
                          Leyendo la copia…
                        </p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                          {(archivos[c.path] || []).map((a) => (
                            <div key={a.path} className="flex items-center gap-2 text-xs px-2 py-1 rounded hover:bg-white dark:hover:bg-gray-800">
                              <FontAwesomeIcon icon={faFileLines} className="h-3 w-3 text-gray-400 shrink-0" />
                              <span className="flex-1 truncate text-gray-700 dark:text-gray-300" title={a.nombre}>
                                {a.nombre}
                              </span>
                              <span className="text-gray-400 tabular-nums shrink-0">{formatearTamano(a.bytes)}</span>
                              <button onClick={() => ver(a)} title="Ver el contenido" className="p-1 rounded text-gray-500 hover:text-blue-600 shrink-0">
                                <FontAwesomeIcon icon={faEye} className="h-3 w-3" />
                              </button>
                              <button onClick={() => bajarArchivo(a)} title="Descargar este archivo" className="p-1 rounded text-gray-500 hover:text-blue-600 shrink-0">
                                <FontAwesomeIcon icon={faDownload} className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ) : null,
              )}
            </tbody>
          </table>
        </div>
      )}

      {cargandoVista && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-gray-900/40">
          <FontAwesomeIcon icon={faSpinner} spin className="h-6 w-6 text-white" />
        </div>
      )}

      {/*
        El contenido llega RECORTADO por el servidor: son NDJSON de hasta varios MB y volcarlos enteros
        en el DOM cuelga la pestaña. Para el archivo completo está la descarga.
      */}
      <Modal isOpen={!!viendo} onClose={() => setViendo(null)} title={viendo?.nombre || ""} subtitle="Un documento por línea, en JSON extendido" size="xl">
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            {formatearTamano(viendo?.bytes || 0)} en total
            {viendo?.recortado && <> · se muestran los primeros {formatearTamano(viendo.limite)}; para verlo entero, descargalo</>}
          </p>
          <pre className="max-h-[60vh] overflow-auto rounded bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-3 text-[11px] leading-relaxed text-gray-800 dark:text-gray-200 whitespace-pre">{viendo?.contenido}</pre>
        </div>
      </Modal>
    </div>
  );
};

import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faTriangleExclamation, faCheck } from "@fortawesome/free-solid-svg-icons";
import { backupsAPI, BaseActual, CopiaBackup, ManifiestoCopia } from "../../api/backups";
import { sweetAlert } from "../../utils/sweetAlert";
import { mensajeErrorApi } from "../../utils/errorApi";

/** Un solo lugar para los errores de esta pantalla: distingue «falta deployar» de un error real. */
const mostrarError = (e: any, titulo: string) => {
  const m = mensajeErrorApi(e, titulo);
  sweetAlert.error(m.titulo, m.detalle);
};

/**
 * LA BASE VIVA, Y LA COMPARACIÓN CONTRA UNA COPIA.
 *
 * Un backup que nadie verificó no es un backup. Hasta acá la única forma de saber si una copia estaba
 * completa era bajarla y contar a mano. Esta pantalla pone las dos columnas al lado: cuántos documentos
 * tiene cada colección HOY y cuántos tenía cuando se hizo la copia.
 *
 * Lo que importa no es que los números sean iguales —entre una copia y hoy la base siguió trabajando—
 * sino que no falte una colección entera ni haya una diferencia que no se explique. Por eso se marcan
 * los dos casos feos: colección que está en la base y NO en la copia (la copia quedó incompleta), y
 * colección que está en la copia y no en la base (se borró algo).
 */

const formatearTamano = (bytes: number): string => {
  if (!bytes) return "—";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
};

const nro = (n: number) => n.toLocaleString("es-AR");

export const BaseActualVsCopia: React.FC<{ copias: CopiaBackup[] }> = ({ copias }) => {
  const [base, setBase] = useState<BaseActual | null>(null);
  const [cargando, setCargando] = useState(true);
  const [comparar, setComparar] = useState<string>("");
  const [manifiesto, setManifiesto] = useState<ManifiestoCopia | null>(null);
  const [cargandoCopia, setCargandoCopia] = useState(false);

  useEffect(() => {
    setCargando(true);
    backupsAPI
      .baseActual()
      .then(setBase)
      .catch((e: any) => mostrarError(e, "No se pudo leer la base"))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    if (!comparar) {
      setManifiesto(null);
      return;
    }
    setCargandoCopia(true);
    backupsAPI
      .manifiesto(comparar)
      .then(setManifiesto)
      .catch((e: any) => mostrarError(e, "No se pudo leer la copia"))
      .finally(() => setCargandoCopia(false));
  }, [comparar]);

  const enCopia = new Map((manifiesto?.colecciones || []).map((c) => [c.nombre, c.documentos]));
  // La unión de las dos: una colección que solo está de un lado es justamente lo que hay que ver.
  const nombres = [...new Set([...(base?.colecciones || []).map((c) => c.nombre), ...enCopia.keys()])].sort();

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Base actual{base ? `: ${base.base}` : ""}</h3>
          {base && (
            <p className="text-xs text-gray-500 mt-1">
              {base.colecciones.length} colecciones · {nro(base.documentos)} documentos
              {base.bytes > 0 && <> · {formatearTamano(base.bytes)}</>}
            </p>
          )}
        </div>
        <label className="text-xs">
          <span className="block mb-1 font-medium text-gray-600 dark:text-gray-400">Comparar contra una copia</span>
          <select value={comparar} onChange={(e) => setComparar(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white text-sm min-w-[16rem]">
            <option value="">Sin comparar</option>
            {copias
              .filter((c) => c.completa)
              .map((c) => (
                <option key={c.path} value={c.path}>
                  {c.nombre}
                </option>
              ))}
          </select>
        </label>
      </div>

      {cargando ? (
        <p className="py-10 text-center text-sm text-gray-500">
          <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
          Leyendo la base…
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Colección</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Documentos (hoy)</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tamaño</th>
                {comparar && <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">En la copia</th>}
                {comparar && <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Diferencia</th>}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {cargandoCopia ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                    <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
                    Leyendo la copia…
                  </td>
                </tr>
              ) : (
                nombres.map((nombre) => {
                  const viva = base?.colecciones.find((c) => c.nombre === nombre);
                  const copia = enCopia.get(nombre);
                  const faltaEnCopia = !!comparar && copia === undefined;
                  const faltaEnBase = !!comparar && !viva;
                  const diferencia = comparar && viva && copia !== undefined ? viva.documentos - copia : null;
                  return (
                    <tr key={nombre} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${faltaEnCopia || faltaEnBase ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}`}>
                      <td className="px-4 py-2.5 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200">
                        {nombre}
                        {faltaEnCopia && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400" title="Está en la base pero no en la copia: la copia quedó incompleta">
                            <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                            falta en la copia
                          </span>
                        )}
                        {faltaEnBase && (
                          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400" title="Está en la copia pero ya no en la base: se borró después del backup">
                            <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                            ya no está en la base
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right tabular-nums text-gray-600 dark:text-gray-300">{viva ? nro(viva.documentos) : "—"}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right text-gray-500">{formatearTamano(viva?.bytes || 0)}</td>
                      {comparar && <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right tabular-nums text-gray-600 dark:text-gray-300">{copia !== undefined ? nro(copia) : "—"}</td>}
                      {comparar && (
                        <td className="px-4 py-2.5 whitespace-nowrap text-sm text-right tabular-nums">
                          {diferencia === null ? (
                            <span className="text-gray-400">—</span>
                          ) : diferencia === 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400" title="Sin cambios desde la copia">
                              <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                            </span>
                          ) : (
                            <span className={diferencia > 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"} title={diferencia > 0 ? "Se agregaron documentos después de la copia" : "Hay menos documentos que en la copia"}>
                              {diferencia > 0 ? "+" : ""}
                              {nro(diferencia)}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {comparar && manifiesto && (
        <p className="mt-3 text-xs text-gray-500">
          La copia se hizo el {new Date(manifiesto.fecha).toLocaleString("es-AR")} con {nro(manifiesto.documentos)} documentos. Una diferencia positiva es la base que siguió
          trabajando desde entonces; una negativa o una colección faltante sí merecen una mirada.
        </p>
      )}
    </div>
  );
};

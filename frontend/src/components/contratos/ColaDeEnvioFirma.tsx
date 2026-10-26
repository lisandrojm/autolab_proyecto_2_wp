import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUp, faArrowDown, faGripVertical, faLock, faSpinner, faTriangleExclamation, faChevronDown, faChevronRight, faRotateLeft, faEye, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { dropboxSignBotAPI, type BotCola, type GrupoTrabados, type ItemDeColaFirma } from "../../api/dropboxSign";
import { sweetAlert } from "../../utils/sweetAlert";
import { PrevisualizacionColocacion } from "../dropboxSign/PrevisualizacionColocacion";

/**
 * LA COLA DE ENVÍO A LA FIRMA Y LO TRABADO, COMO SE ENTIENDE (25/10/2026).
 *
 * Antes el panel decía «En cola 0» con 195 archivos en el Outbox, y «79 requieren revisión» como una
 * lista plana con el mismo motivo repetido. Ahora:
 *  · LA COLA DE VERDAD: lo que se va a enviar, en orden, con la hora estimada y la LÍNEA DE CORTE del
 *    cupo de 24 h; se ordena a mano (subir/bajar, selección múltiple, arrastre) y el orden vive en el
 *    servidor. Mientras el bot envía, la tabla es de sólo lectura (y el server rechaza con 409).
 *  · LO TRABADO, AGRUPADO POR MOTIVO, con la salida de cada uno.
 */

const POR_PAGINA = 50;
const hora = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const hoy = new Date();
  const mismoDia = d.toDateString() === hoy.toDateString();
  const manana = new Date(hoy.getTime() + 86400_000).toDateString() === d.toDateString();
  const hm = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  return mismoDia ? `hoy ~${hm}` : manana ? `mañana ~${hm}` : `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ~${hm}`;
};
const hace = (iso: string | null) => {
  if (!iso) return "nunca";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
};

export const ColaDeEnvioFirma: React.FC<{ vista: BotCola; actual: string | null; onCambio: () => Promise<void> | void }> = ({ vista, actual, onCambio }) => {
  const [abierta, setAbierta] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [pagina, setPagina] = useState(0);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [moviendo, setMoviendo] = useState(false);
  const [arrastrado, setArrastrado] = useState<string | null>(null);
  const items = vista.items || [];
  const r = vista.resumen;
  const bloqueada = !!vista.corriendo;

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return q ? items.filter((x) => `${x.archivo} ${x.firmante} ${x.tipo}`.toLowerCase().includes(q)) : items;
  }, [items, filtro]);
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const visibles = filtrados.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  // La línea de corte va después del último que entra (en el orden completo, no en el filtrado).
  const ultimoQueEntra = useMemo(() => [...items].reverse().find((x) => x.entra)?.codigo || null, [items]);

  const mover = async (codigos: string[], a: "tope" | "fondo" | "antes", antesDe?: string) => {
    if (bloqueada || codigos.length === 0) return;
    setMoviendo(true);
    try {
      await dropboxSignBotAPI.moverEnCola(codigos, a, antesDe);
      setMarcados(new Set());
      await onCambio();
    } catch (e: any) {
      sweetAlert.error("No se pudo ordenar", e?.response?.data?.error || e?.message || "");
    } finally {
      setMoviendo(false);
    }
  };
  const ordenAutomatico = async () => {
    setMoviendo(true);
    try {
      await dropboxSignBotAPI.ordenAutomatico();
      await onCambio();
    } catch (e: any) {
      sweetAlert.error("No se pudo ordenar", e?.response?.data?.error || e?.message || "");
    } finally {
      setMoviendo(false);
    }
  };
  const alternar = (codigo: string) => setMarcados((s) => {
    const n = new Set(s);
    if (n.has(codigo)) n.delete(codigo);
    else n.add(codigo);
    return n;
  });

  if (!r) return null;
  const btn = "inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40";

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700">
      <button type="button" onClick={() => setAbierta((a) => !a)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-xs">
        <FontAwesomeIcon icon={abierta ? faChevronDown : faChevronRight} className="h-3 w-3 text-gray-400" />
        <span className="font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">Cola de envío</span>
        <span className="text-gray-600 dark:text-gray-300">
          <strong>{r.listos}</strong> listos · <strong className="text-green-700 dark:text-green-400">{r.entranAhora}</strong> entran en las próximas 24 h · <strong>{r.quedan}</strong> quedan para después
        </span>
        {vista.ordenManual && <span className="rounded-full border border-blue-300 bg-blue-50 px-1.5 text-[10px] font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">orden manual</span>}
      </button>
      {abierta && (
        <div className="space-y-2 border-t border-gray-100 px-3 py-2 dark:border-gray-700">
          {bloqueada && (
            <p className="flex items-center gap-1.5 rounded bg-purple-50 px-2 py-1 text-[11px] text-purple-800 dark:bg-purple-900/20 dark:text-purple-300">
              <FontAwesomeIcon icon={faLock} /> Enviando — el orden se puede cambiar cuando termine.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input value={filtro} onChange={(e) => { setFiltro(e.target.value); setPagina(0); }} placeholder="Filtrar por archivo, firmante o tipo…" className="min-w-[220px] flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800" />
            <button type="button" className={btn} disabled={bloqueada || moviendo || marcados.size === 0} onClick={() => void mover([...marcados], "tope")} title="Los tildados pasan al principio, en el orden en que están">
              <FontAwesomeIcon icon={faArrowUp} /> Mover al principio{marcados.size ? ` (${marcados.size})` : ""}
            </button>
            <button type="button" className={btn} disabled={bloqueada || moviendo || marcados.size === 0} onClick={() => void mover([...marcados], "fondo")}>
              <FontAwesomeIcon icon={faArrowDown} /> Al fondo
            </button>
            {vista.ordenManual && (
              <button type="button" className={btn} disabled={bloqueada || moviendo} onClick={() => void ordenAutomatico()} title="El orden en que se encolaron">
                <FontAwesomeIcon icon={faRotateLeft} /> Volver al orden automático
              </button>
            )}
            {moviendo && <FontAwesomeIcon icon={faSpinner} spin className="text-gray-400" />}
          </div>
          {items.length === 0 ? (
            <p className="py-2 text-xs text-gray-500">La cola está vacía. Se arma desde la lista: tildá y «Enviar a la firma», o «Encolar todo lo elegible».</p>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 dark:bg-gray-900/40">
                  <tr>
                    <th className="w-6 px-2 py-1.5" />
                    <th className="w-8 px-2 py-1.5 text-right">#</th>
                    <th className="px-2 py-1.5 text-left">Documento</th>
                    <th className="px-2 py-1.5 text-left">Firmante</th>
                    <th className="px-2 py-1.5 text-left">Sale</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {visibles.map((x: ItemDeColaFirma) => {
                    const enviandoAhora = x.estado === "enviando" || x.archivo === actual;
                    return (
                      <React.Fragment key={x.codigo}>
                        <tr
                          draggable={!bloqueada}
                          onDragStart={() => setArrastrado(x.codigo)}
                          onDragOver={(e) => { if (arrastrado && arrastrado !== x.codigo) e.preventDefault(); }}
                          onDrop={(e) => { e.preventDefault(); if (arrastrado && arrastrado !== x.codigo) void mover([arrastrado], "antes", x.codigo); setArrastrado(null); }}
                          onDragEnd={() => setArrastrado(null)}
                          className={`${enviandoAhora ? "bg-purple-50 dark:bg-purple-900/20" : !x.enOutbox ? "opacity-50" : ""} ${arrastrado === x.codigo ? "opacity-40" : ""}`}
                        >
                          <td className="px-2 py-1">
                            <input type="checkbox" disabled={bloqueada} checked={marcados.has(x.codigo)} onChange={() => alternar(x.codigo)} className="rounded border-gray-300" />
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums text-gray-500">{x.posicion}</td>
                          <td className="px-2 py-1">
                            <span className="flex items-center gap-1.5">
                              {!bloqueada && <FontAwesomeIcon icon={faGripVertical} className="h-3 w-3 cursor-grab text-gray-300" title="Arrastrá para cambiar el orden" />}
                              <span className="break-all font-mono text-gray-700 dark:text-gray-200">{x.archivo}</span>
                            </span>
                            {!x.enOutbox && <span className="text-[10px] text-amber-700 dark:text-amber-400">ya no está en el Outbox: no se envía</span>}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-gray-600 dark:text-gray-300">{x.firmante || "—"}</td>
                          <td className="whitespace-nowrap px-2 py-1">
                            {enviandoAhora ? (
                              <span className="font-semibold text-purple-700 dark:text-purple-300"><FontAwesomeIcon icon={faSpinner} spin /> enviando ahora</span>
                            ) : x.estado === "limite" ? (
                              <span className="text-amber-700 dark:text-amber-300">frenado por Dropbox Sign · reintenta</span>
                            ) : x.estimadoAt ? (
                              <span className={x.entra ? "text-green-700 dark:text-green-400" : "text-gray-500"}>{hora(x.estimadoAt)}</span>
                            ) : (
                              <span className={x.entra ? "text-green-700 dark:text-green-400" : "text-gray-500"}>{x.entra ? "entra ahora" : "después"}</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1 text-right">
                            <button type="button" disabled={bloqueada || moviendo || x.posicion === 1} onClick={() => void mover([x.codigo], "tope")} className="px-1 text-gray-500 hover:text-blue-600 disabled:opacity-30" title="Subir al tope">
                              <FontAwesomeIcon icon={faArrowUp} />
                            </button>
                            <button type="button" disabled={bloqueada || moviendo || x.posicion === items.length} onClick={() => void mover([x.codigo], "fondo")} className="px-1 text-gray-500 hover:text-blue-600 disabled:opacity-30" title="Bajar al fondo">
                              <FontAwesomeIcon icon={faArrowDown} />
                            </button>
                          </td>
                        </tr>
                        {x.codigo === ultimoQueEntra && !filtro && x.posicion < items.length && (
                          <tr>
                            <td colSpan={6} className="bg-amber-50 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                              corte del cupo: lo de abajo sale cuando Dropbox Sign libere lugar (ventana de 24 h)
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {paginas > 1 && (
            <div className="flex items-center justify-end gap-2 text-[11px] text-gray-600 dark:text-gray-300">
              <button type="button" className={btn} disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
              <span>Página {pagina + 1} de {paginas} · {filtrados.length} documento(s)</span>
              <button type="button" className={btn} disabled={pagina >= paginas - 1} onClick={() => setPagina((p) => p + 1)}>Siguiente</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Lo trabado, agrupado por motivo, con la salida de cada uno y cuándo se verificó. */
export const TrabadosPorMotivo: React.FC<{ grupos: GrupoTrabados[]; verificacion?: BotCola["verificacion"]; onVerificar: () => void; onCambio: () => Promise<void> | void }> = ({ grupos, verificacion, onVerificar, onCambio }) => {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const total = grupos.reduce((a, g) => a + g.cantidad, 0);
  const descartar = async (g: GrupoTrabados) => {
    const r = await sweetAlert.confirm(`Sacar ${g.cantidad} de la lista`, "No se envían. Si vuelven a aparecer en el Outbox y se encolan, se evalúan de nuevo.", "Sí, sacar");
    if (!r.isConfirmed) return;
    try {
      await dropboxSignBotAPI.descartarTrabados(g.items.map((x) => x.codigo));
      await onCambio();
    } catch (e: any) {
      sweetAlert.error("No se pudo", e?.response?.data?.error || e?.message || "");
    }
  };
  const accion = (g: GrupoTrabados, archivo?: string) => {
    const d = g.accion.destino;
    if (d === "previsualizar") return archivo ? <button type="button" onClick={() => setPreview(archivo)} className="text-blue-600 hover:underline dark:text-blue-400"><FontAwesomeIcon icon={faEye} /> {g.accion.texto}</button> : null;
    if (d === "descartar") return archivo ? null : <button type="button" onClick={() => void descartar(g)} className="text-blue-600 hover:underline dark:text-blue-400">{g.accion.texto}</button>;
    return <Link to={d} className="text-blue-600 hover:underline dark:text-blue-400">→ {g.accion.texto}</Link>;
  };

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs ${total ? "border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-900/10" : "border-gray-200 dark:border-gray-700"}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`inline-flex items-center gap-1.5 font-bold ${total ? "text-amber-800 dark:text-amber-300" : "text-gray-600 dark:text-gray-300"}`}>
          {total ? <FontAwesomeIcon icon={faTriangleExclamation} /> : <FontAwesomeIcon icon={faCircleCheck} className="text-green-600" />}
          {total ? `${total} documento${total === 1 ? "" : "s"} trabado${total === 1 ? "" : "s"}` : "Nada trabado"}
        </span>
        {/* Cuándo se verificó: un resultado viejo no se muestra como el estado de hoy. */}
        <span className={verificacion?.desactualizada ? "text-amber-700 dark:text-amber-400" : "text-gray-500"}>
          {verificacion?.corriendo ? (
            <><FontAwesomeIcon icon={faSpinner} spin /> verificando…</>
          ) : verificacion?.desactualizada ? (
            <>desactualizado ({verificacion.ultimaAt ? `verificado ${hace(verificacion.ultimaAt)}` : "nunca verificado"}) —{" "}
              <button type="button" onClick={onVerificar} className="font-semibold underline">verificar de nuevo</button>
            </>
          ) : (
            <>verificado {hace(verificacion?.ultimaAt || null)} · <button type="button" onClick={onVerificar} className="underline">verificar</button></>
          )}
        </span>
      </div>
      {grupos.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {grupos.map((g) => (
            <li key={g.tipo}>
              <div className="flex flex-wrap items-center gap-x-2">
                <button type="button" onClick={() => setAbierto((a) => (a === g.tipo ? null : g.tipo))} className="inline-flex items-center gap-1 text-gray-700 dark:text-gray-200">
                  <FontAwesomeIcon icon={abierto === g.tipo ? faChevronDown : faChevronRight} className="h-2.5 w-2.5 text-gray-400" />
                  <strong>{g.cantidad}</strong> · {g.titulo}
                </button>
                <span>{accion(g)}</span>
              </div>
              {abierto === g.tipo && (
                <ul className="ml-4 mt-1 max-h-56 space-y-1 overflow-y-auto">
                  {g.items.map((x) => (
                    <li key={x.codigo} className="border-l-2 border-amber-200 pl-2 dark:border-amber-800">
                      <span className="break-all font-mono text-gray-700 dark:text-gray-200">{x.archivo}</span>
                      <span className="ml-2">{accion(g, x.archivo)}</span>
                      <p className="text-[11px] text-gray-500">{x.detalle}</p>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {preview && <PrevisualizacionColocacion archivo={preview} onClose={() => setPreview(null)} />}
    </div>
  );
};

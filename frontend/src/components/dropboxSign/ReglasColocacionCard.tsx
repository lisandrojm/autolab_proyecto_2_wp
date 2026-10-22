import React, { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faCheck, faCircleCheck, faCircleXmark, faCrosshairs, faPen, faPlus, faTrash, faRotateLeft, faListCheck, faStop, faEye, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { dropboxSignBotAPI, type AlcanceVerificacion, type AnclaRegla, type ReglaColocacion, type ReglasColocacion, type TipoAncla, type Verificacion } from "../../api/dropboxSign";
import { InfoModal } from "../ui/InfoModal";
import { sweetAlert } from "../../utils/sweetAlert";
import { PrevisualizacionColocacion } from "./PrevisualizacionColocacion";

/*
  «REGLAS DE COLOCACIÓN DE LA FIRMA» (22/10/2026): la tabla tipo de documento → ancla, editable y
  guardada por tenant, y la verificación ANTES de que el bot envíe nada: «Previsualizar colocación»
  dibuja sobre la página del PDF exactamente lo que el bot va a colocar, y «Verificar todos» corre la
  misma detección en seco sobre la cola (o lo que requiere revisión, o el Outbox entero) y resume
  cuántos quedarían enviables y por qué no los demás. No envía ni cambia estados.
*/

const POLL_MS = 2000;
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const PAGINAS: Record<ReglaColocacion["pagina"], string> = { primera: "Primera", ultima: "Última", cualquiera: "Cualquiera" };
const OCURRENCIAS: Record<AnclaRegla["ocurrencia"], string> = { ultima: "la última válida", primera: "la primera válida" };
const ALCANCES: Record<AlcanceVerificacion, string> = { cola_y_revision: "La cola y lo que requiere revisión", cola: "Sólo la cola", revision: "Sólo lo que requiere revisión", outbox: "Todo el Outbox (menos lo enviado)" };
const POSICION: Record<TipoAncla, string> = { derechaDelRotulo: "A la derecha del rótulo, sobre la línea", sobreRotulo: "Encima de la línea, centrada en el rótulo", columnaDelFirmante: "Sobre la línea de la columna del firmante" };

const anclaNueva = (): AnclaRegla => ({ tipo: "derechaDelRotulo", rotulo: "Firma:", ocurrencia: "ultima", excluir: ["Empleador"], offset: { dx: 0, dy: 0 } });
const reglaNueva = (): ReglaColocacion => ({ tipo: "", patronNombre: "", estado: "activo", pagina: "ultima", anclas: [anclaNueva()], ocr: null, campo: { alto: 45, anchoFijo: 170 }, validaciones: [], descripcion: "" });
const copia = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const inputClass = "w-full px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30";
const labelClass = "block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-0.5";
const btnBase = "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold disabled:opacity-50";
const btnGris = `${btnBase} border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700`;

/** El ✓/✗ de una detección, en una línea. */
export const IndicadorColocacion: React.FC<{ c?: { ok: boolean; pagina: number | null; rotulo: string; motivo: string; verificadaAt?: string } | null }> = ({ c }) => {
  if (!c) return <span className="text-gray-400">· ancla sin verificar</span>;
  if (c.ok)
    return (
      <span className="text-green-600 dark:text-green-400" title={c.verificadaAt ? `Verificado ${fmt(c.verificadaAt)}` : undefined}>
        <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" /> ancla «{c.rotulo}» en la pág. {c.pagina}
      </span>
    );
  return (
    <span className="text-red-600 dark:text-red-400" title={c.motivo}>
      <FontAwesomeIcon icon={faCircleXmark} className="h-3 w-3" /> sin ancla: {c.motivo}
    </span>
  );
};

export const ReglasColocacionCard: React.FC = () => {
  const [datos, setDatos] = useState<ReglasColocacion | null>(null);
  const [reglas, setReglas] = useState<ReglaColocacion[]>([]);
  const [sucias, setSucias] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [editor, setEditor] = useState<{ indice: number | null; borrador: ReglaColocacion; validaciones: string } | null>(null);
  const [alcance, setAlcance] = useState<AlcanceVerificacion>("cola_y_revision");
  const [verif, setVerif] = useState<Verificacion | null>(null);
  const [arrancando, setArrancando] = useState(false);
  const [soloNo, setSoloNo] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const intervalo = useRef<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await dropboxSignBotAPI.reglas();
      setDatos(d);
      setReglas(copia(d.reglas));
      setSucias(false);
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudieron cargar las reglas de colocación.");
    }
  }, []);

  const parar = useCallback(() => {
    if (intervalo.current) window.clearInterval(intervalo.current);
    intervalo.current = null;
  }, []);
  const consultar = useCallback(async () => {
    const v = await dropboxSignBotAPI.verificacion().catch(() => null);
    if (!v) return;
    setVerif(v);
    if (!v.corriendo) parar();
  }, [parar]);
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
    if (verif?.corriendo && !intervalo.current) seguir();
  }, [verif?.corriendo, seguir]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const d = await dropboxSignBotAPI.guardarReglas(reglas);
      setDatos(d);
      setReglas(copia(d.reglas));
      setSucias(false);
      sweetAlert.success("Reglas guardadas", "El bot y la verificación usan estas reglas desde ahora.");
    } catch (e: any) {
      sweetAlert.error("No se pudieron guardar", e?.response?.data?.error || e?.message || "");
    } finally {
      setGuardando(false);
    }
  };
  const restaurar = async () => {
    const r = await sweetAlert.confirm("Restaurar el catálogo de fábrica", "Se descartan las reglas editadas de esta organización y vuelven las del código.", "Sí, restaurar");
    if (!r.isConfirmed) return;
    try {
      const d = await dropboxSignBotAPI.restaurarReglas();
      setDatos(d);
      setReglas(copia(d.reglas));
      setSucias(false);
    } catch (e: any) {
      sweetAlert.error("No se pudo restaurar", e?.response?.data?.error || "");
    }
  };

  const abrirEditor = (indice: number | null) => {
    const borrador = indice === null ? reglaNueva() : copia(reglas[indice]);
    setEditor({ indice, borrador, validaciones: JSON.stringify(borrador.validaciones, null, 2) });
  };
  const confirmarEditor = () => {
    if (!editor) return;
    let validaciones: ReglaColocacion["validaciones"];
    try {
      validaciones = JSON.parse(editor.validaciones || "[]");
      if (!Array.isArray(validaciones)) throw new Error("tiene que ser una lista");
    } catch (e: any) {
      sweetAlert.error("Validaciones", `El JSON de las validaciones no es válido: ${e?.message || e}`);
      return;
    }
    const regla: ReglaColocacion = { ...editor.borrador, tipo: editor.borrador.tipo.trim(), patronNombre: editor.borrador.patronNombre.trim(), validaciones };
    if (!regla.tipo || !regla.patronNombre) {
      sweetAlert.error("Falta algo", "El tipo y el patrón del nombre de archivo son obligatorios.");
      return;
    }
    setReglas((rs) => (editor.indice === null ? [...rs, regla] : rs.map((r, i) => (i === editor.indice ? regla : r))));
    setSucias(true);
    setEditor(null);
  };
  const quitar = async (i: number) => {
    const r = await sweetAlert.confirm(`Quitar la regla ${reglas[i].tipo}`, "Los archivos de ese tipo quedan «sin regla» y no se envían hasta que se vuelva a definir. Se aplica al guardar.", "Sí, quitar");
    if (!r.isConfirmed) return;
    setReglas((rs) => rs.filter((_, j) => j !== i));
    setSucias(true);
  };
  const editarBorrador = (cambio: Partial<ReglaColocacion>) => setEditor((e) => (e ? { ...e, borrador: { ...e.borrador, ...cambio } } : e));
  const editarAncla = (j: number, cambio: Partial<AnclaRegla>) => setEditor((e) => (e ? { ...e, borrador: { ...e.borrador, anclas: e.borrador.anclas.map((a, k) => (k === j ? { ...a, ...cambio } : a)) } } : e));

  const verificarTodos = async () => {
    const r = await sweetAlert.confirm("Verificar todos", `Se baja cada PDF del Outbox (${ALCANCES[alcance].toLowerCase()}) y se corre la misma detección del ancla que usa el bot, sin abrir Dropbox Sign y sin cambiar estados. Puede tardar varios minutos.${sucias ? "\n\nOJO: hay reglas sin guardar; la verificación usa las guardadas." : ""}`, "Sí, verificar");
    if (!r.isConfirmed) return;
    setArrancando(true);
    try {
      await dropboxSignBotAPI.verificarTodos(alcance);
      seguir();
    } catch (e: any) {
      sweetAlert.error("No se pudo arrancar", e?.response?.data?.error || e?.message || "");
    } finally {
      setArrancando(false);
    }
  };
  const detener = async () => {
    const r = await dropboxSignBotAPI.detenerVerificacion().catch((e: any) => ({ ok: false, motivo: e?.response?.data?.error }));
    if (!r.ok) sweetAlert.info("No hay nada que detener", r.motivo || "");
  };

  const corriendo = !!verif?.corriendo;
  const resultados = (verif?.resultados || []).filter((x) => !soloNo || !x.ok);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <FontAwesomeIcon icon={faCrosshairs} /> Reglas de colocación de la firma
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Por tipo de documento (se reconoce por el nombre del archivo): qué rótulo se busca en el PDF, dónde va el campo respecto de él y qué se descarta siempre (<span className="font-mono">Empleador</span>). Si el ancla no aparece, el
            documento queda en revisión con el motivo y no se envía. Lo que muestra «Previsualizar» es exactamente lo que coloca el bot.
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${datos?.personalizadas ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300" : "border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-300"}`}>
          {datos?.personalizadas ? `Editadas · ${fmt(datos.actualizadasAt)}` : "Catálogo de fábrica"}
        </span>
      </div>

      {!datos ? (
        <p className="text-sm text-gray-500 flex items-center gap-2">
          <FontAwesomeIcon icon={faSpinner} spin /> Cargando…
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-900/40 text-[11px] uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Tipo</th>
                <th className="px-3 py-2 text-left">Nombre matchea</th>
                <th className="px-3 py-2 text-left">Página</th>
                <th className="px-3 py-2 text-left">Ancla y posición</th>
                <th className="px-3 py-2 text-left">Campo</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {reglas.map((r, i) => (
                <tr key={`${r.tipo}-${i}`} className="align-top">
                  <td className="px-3 py-2 font-semibold text-gray-800 dark:text-gray-100">
                    {r.tipo}
                    {r.descripcion && <p className="mt-0.5 max-w-[28ch] font-normal text-[11px] text-gray-500">{r.descripcion}</p>}
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-300">{r.patronNombre}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{PAGINAS[r.pagina]}</td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                    {r.anclas.length === 0 && <span className="text-gray-400">—</span>}
                    {r.anclas.map((a, j) => (
                      <p key={j} className={j > 0 ? "mt-1 border-t border-dashed border-gray-200 pt-1 dark:border-gray-700" : ""}>
                        <span className="font-mono text-gray-800 dark:text-gray-100">«{a.rotulo}»</span> · {POSICION[a.tipo]} · {OCURRENCIAS[a.ocurrencia]}
                        {a.excluir.length > 0 && <span className="text-red-600 dark:text-red-400"> · nunca si contiene {a.excluir.map((e) => `«${e}»`).join(", ")}</span>}
                      </p>
                    ))}
                    {r.ocr && <p className="mt-0.5 text-[11px] text-gray-500">Rótulo dibujado: se lee por OCR la franja {Math.round(r.ocr.desde * 100)}–{Math.round(r.ocr.hasta * 100)} % de la página.</p>}
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                    {r.campo.alto} pt de alto
                    <br />
                    <span className="text-[11px] text-gray-500">ancho = la línea (o {r.campo.anchoFijo} pt)</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.estado === "activo" && r.anclas.length > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700 dark:border-green-800 dark:bg-green-900/30 dark:text-green-300">
                        <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" /> Definida
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300" title={r.motivoPendiente}>
                        <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" /> Sin definir
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <button type="button" onClick={() => abrirEditor(i)} className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold" title="Editar">
                      <FontAwesomeIcon icon={faPen} /> Editar
                    </button>
                    <button type="button" onClick={() => quitar(i)} className="ml-3 text-red-600 hover:text-red-700 dark:text-red-400 font-semibold" title="Quitar">
                      <FontAwesomeIcon icon={faTrash} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => abrirEditor(null)} className={btnGris}>
            <FontAwesomeIcon icon={faPlus} /> Agregar regla
          </button>
          <button type="button" onClick={restaurar} disabled={guardando} className={btnGris} title="Vuelve a las reglas del código">
            <FontAwesomeIcon icon={faRotateLeft} /> Restaurar catálogo
          </button>
          <button type="button" onClick={guardar} disabled={!sucias || guardando} className={`${btnBase} bg-gray-700 text-white hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-500`}>
            <FontAwesomeIcon icon={guardando ? faSpinner : faCheck} spin={guardando} /> Guardar reglas{sucias ? " *" : ""}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={alcance} onChange={(e) => setAlcance(e.target.value as AlcanceVerificacion)} className={`${inputClass} w-auto`} disabled={corriendo}>
            {(Object.keys(ALCANCES) as AlcanceVerificacion[]).map((k) => (
              <option key={k} value={k}>
                {ALCANCES[k]}
              </option>
            ))}
          </select>
          {corriendo ? (
            <button type="button" onClick={detener} disabled={!!verif?.detenerPedido} className={`${btnBase} border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300`}>
              <FontAwesomeIcon icon={faStop} /> {verif?.detenerPedido ? "Deteniendo…" : "Detener"}
            </button>
          ) : (
            <button type="button" onClick={verificarTodos} disabled={arrancando} className={`${btnBase} bg-blue-600 text-white hover:bg-blue-700`} title="Corre la detección del ancla en seco, sin abrir Dropbox Sign ni cambiar estados">
              <FontAwesomeIcon icon={arrancando ? faSpinner : faListCheck} spin={arrancando} /> Verificar todos
            </button>
          )}
        </div>
      </div>

      {verif?.hay && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-semibold text-gray-700 dark:text-gray-200">
            {corriendo && <FontAwesomeIcon icon={faSpinner} spin />}
            <span>
              {corriendo ? "Verificando" : "Última verificación"} · {verif.hechos ?? 0} de {verif.total ?? 0} · {ALCANCES[verif.alcance || "cola_y_revision"].toLowerCase()} · {fmt(verif.arrancadaEl)}
            </span>
            <span className="text-green-600 dark:text-green-400">
              <FontAwesomeIcon icon={faCircleCheck} /> {verif.enviables ?? 0} enviable{(verif.enviables ?? 0) === 1 ? "" : "s"}
            </span>
            <span className="text-amber-700 dark:text-amber-300">
              <FontAwesomeIcon icon={faCircleXmark} /> {verif.noEnviables ?? 0} no enviable{(verif.noEnviables ?? 0) === 1 ? "" : "s"}
            </span>
            {verif.actual && <span className="font-mono font-normal text-gray-500 truncate max-w-[50ch]">{verif.actual}</span>}
            {verif.error && <span className="text-red-600 dark:text-red-400 font-normal">{verif.error}</span>}
          </div>
          {verif.porMotivo && Object.keys(verif.porMotivo).length > 0 && (
            <ul className="space-y-0.5 text-amber-800 dark:text-amber-200">
              {Object.entries(verif.porMotivo)
                .sort((a, b) => b[1] - a[1])
                .map(([m, n]) => (
                  <li key={m}>
                    <strong>{n}</strong> × {m}
                  </li>
                ))}
            </ul>
          )}
          {(verif.resultados?.length ?? 0) > 0 && (
            <>
              <label className="inline-flex items-center gap-2 text-gray-600 dark:text-gray-300 cursor-pointer">
                <input type="checkbox" checked={soloNo} onChange={(e) => setSoloNo(e.target.checked)} className="rounded border-gray-300" /> Mostrar sólo los no enviables
              </label>
              <div className="max-h-72 overflow-y-auto rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <table className="min-w-full">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {resultados.map((x) => (
                      <tr key={x.archivo} className="align-top">
                        <td className="px-2 py-1.5">
                          <span className="font-mono break-all text-gray-700 dark:text-gray-200">{x.archivo}</span>
                          <span className="text-gray-400"> · {x.tipo || "sin regla"}{x.estado ? ` · ${x.estado}` : ""}</span>
                          <p>
                            <IndicadorColocacion c={{ ok: x.ok, pagina: x.pagina, rotulo: x.rotulo, motivo: x.motivo }} />
                          </p>
                        </td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-right">
                          <button type="button" onClick={() => setPreview(x.archivo)} className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold">
                            <FontAwesomeIcon icon={faEye} /> Previsualizar
                          </button>
                        </td>
                      </tr>
                    ))}
                    {resultados.length === 0 && (
                      <tr>
                        <td className="px-2 py-2 text-gray-500">{soloNo ? "Todos enviables." : "Sin resultados."}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {editor && (
        <InfoModal isOpen onClose={() => setEditor(null)} title={editor.indice === null ? "Nueva regla de colocación" : `Regla ${editor.borrador.tipo}`} subtitle="Se aplica al guardar las reglas" size="lg" actions={[{ label: "Aceptar", onClick: confirmarEditor }, { label: "Cancelar", onClick: () => setEditor(null), variant: "ghost" }]}>
          <div className="space-y-3 text-sm max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Tipo de documento</label>
                <input value={editor.borrador.tipo} onChange={(e) => editarBorrador({ tipo: e.target.value })} className={inputClass} placeholder="Contrato_Servicios" />
              </div>
              <div>
                <label className={labelClass}>El nombre del archivo matchea (expresión regular)</label>
                <input value={editor.borrador.patronNombre} onChange={(e) => editarBorrador({ patronNombre: e.target.value })} className={`${inputClass} font-mono`} placeholder="_Contrato_Servicios" />
              </div>
              <div>
                <label className={labelClass}>Estado</label>
                <select value={editor.borrador.estado} onChange={(e) => editarBorrador({ estado: e.target.value as ReglaColocacion["estado"] })} className={inputClass}>
                  <option value="activo">Definida (se envía)</option>
                  <option value="pendiente">Sin definir (queda en revisión)</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Página donde se busca el ancla</label>
                <select value={editor.borrador.pagina} onChange={(e) => editarBorrador({ pagina: e.target.value as ReglaColocacion["pagina"] })} className={inputClass}>
                  {(Object.keys(PAGINAS) as ReglaColocacion["pagina"][]).map((p) => (
                    <option key={p} value={p}>
                      {PAGINAS[p]}
                    </option>
                  ))}
                </select>
              </div>
              {editor.borrador.estado === "pendiente" && (
                <div className="md:col-span-2">
                  <label className={labelClass}>Motivo que ve el usuario</label>
                  <input value={editor.borrador.motivoPendiente || ""} onChange={(e) => editarBorrador({ motivoPendiente: e.target.value })} className={inputClass} placeholder="falta definir posición de firma" />
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Anclas (se prueban en orden)</p>
                <button type="button" onClick={() => editarBorrador({ anclas: [...editor.borrador.anclas, anclaNueva()] })} className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400">
                  <FontAwesomeIcon icon={faPlus} /> Agregar ancla
                </button>
              </div>
              {editor.borrador.anclas.map((a, j) => (
                <div key={j} className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Rótulo a buscar (texto o expresión regular)</label>
                    <input value={a.rotulo} onChange={(e) => editarAncla(j, { rotulo: e.target.value })} className={`${inputClass} font-mono`} />
                  </div>
                  <div>
                    <label className={labelClass}>Posición relativa del campo</label>
                    <select value={a.tipo} onChange={(e) => editarAncla(j, { tipo: e.target.value as TipoAncla })} className={inputClass}>
                      {(Object.keys(POSICION) as TipoAncla[]).map((t) => (
                        <option key={t} value={t}>
                          {POSICION[t]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Con varias coincidencias válidas</label>
                    <select value={a.ocurrencia} onChange={(e) => editarAncla(j, { ocurrencia: e.target.value as AnclaRegla["ocurrencia"] })} className={inputClass}>
                      <option value="ultima">Usar la última del documento</option>
                      <option value="primera">Usar la primera del documento</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Nunca si el texto contiene (separado por coma)</label>
                    <input value={a.excluir.join(", ")} onChange={(e) => editarAncla(j, { excluir: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} className={inputClass} placeholder="Empleador" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelClass}>Ajuste x (pt)</label>
                      <input type="number" value={a.offset.dx} onChange={(e) => editarAncla(j, { offset: { ...a.offset, dx: Number(e.target.value) || 0 } })} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Ajuste y (pt)</label>
                      <input type="number" value={a.offset.dy} onChange={(e) => editarAncla(j, { offset: { ...a.offset, dy: Number(e.target.value) || 0 } })} className={inputClass} />
                    </div>
                  </div>
                  <div className="flex items-end justify-end">
                    <button type="button" onClick={() => editarBorrador({ anclas: editor.borrador.anclas.filter((_, k) => k !== j) })} className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400">
                      <FontAwesomeIcon icon={faTrash} /> Quitar ancla
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>Alto del campo (pt)</label>
                <input type="number" min={10} max={200} value={editor.borrador.campo.alto} onChange={(e) => editarBorrador({ campo: { ...editor.borrador.campo, alto: Number(e.target.value) || 45 } })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Ancho si no se mide la línea (pt)</label>
                <input type="number" min={20} max={500} value={editor.borrador.campo.anchoFijo} onChange={(e) => editarBorrador({ campo: { ...editor.borrador.campo, anchoFijo: Number(e.target.value) || 170 } })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Rótulo dibujado: leer por OCR la franja (% del alto)</label>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={!!editor.borrador.ocr} onChange={(e) => editarBorrador({ ocr: e.target.checked ? { desde: 0.85, hasta: 1 } : null })} className="rounded border-gray-300" />
                  <input type="number" min={0} max={100} disabled={!editor.borrador.ocr} value={editor.borrador.ocr ? Math.round(editor.borrador.ocr.desde * 100) : 85} onChange={(e) => editarBorrador({ ocr: { desde: Math.min(99, Math.max(0, Number(e.target.value))) / 100, hasta: editor.borrador.ocr?.hasta ?? 1 } })} className={`${inputClass} w-20`} />
                  <span className="text-gray-400">–</span>
                  <input type="number" min={1} max={100} disabled={!editor.borrador.ocr} value={editor.borrador.ocr ? Math.round(editor.borrador.ocr.hasta * 100) : 100} onChange={(e) => editarBorrador({ ocr: { desde: editor.borrador.ocr?.desde ?? 0.85, hasta: Math.min(100, Math.max(1, Number(e.target.value))) / 100 } })} className={`${inputClass} w-20`} />
                </div>
              </div>
            </div>
            <div>
              <label className={labelClass}>Descripción (lo que se espera ver; va al log)</label>
              <input value={editor.borrador.descripcion} onChange={(e) => editarBorrador({ descripcion: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Validaciones del campo (JSON: enMitadIzquierda, enMitadDerecha, lejosDeTexto {"{patron, distanciaMin}"}, textoCercano {"{patron, distanciaMax}"}; «FIRMANTE» = el nombre del firmante)</label>
              <textarea value={editor.validaciones} onChange={(e) => setEditor((x) => (x ? { ...x, validaciones: e.target.value } : x))} rows={4} className={`${inputClass} font-mono text-xs`} />
            </div>
          </div>
        </InfoModal>
      )}

      {preview && <PrevisualizacionColocacion archivo={preview} onClose={() => setPreview(null)} />}
    </div>
  );
};

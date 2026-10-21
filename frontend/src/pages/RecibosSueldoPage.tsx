import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faReceipt, faUpload, faFilePdf, faPaperPlane, faTrash, faFileCode, faSpinner, faUserPen, faAlignLeft, faCircleCheck, faCircleXmark, faClock, faUserSlash, faRotateRight, faChevronDown, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Modal } from "../components/ui/Modal";
import { BotonOrden, useOrdenTabla } from "../components/ui/OrdenTabla";
import { recibosSueldoAPI, ETIQUETA_ESTADO_RECIBO, type LoteRecibos, type ReciboDelLote, type PersonaBuscada, type ResultadoMasivo } from "../api/recibosSueldo";
import { getImageUrl } from "../utils/imageHelpers";
import { sweetAlert } from "../utils/sweetAlert";
import { DetalleRecibo, fmtCuil, fechaHora, periodoTexto, importeNumero, pesos } from "../components/recibos/DetalleRecibo";
import { RegistroEnviadosRecibos } from "../components/recibos/RegistroEnviadosRecibos";
import { BadgesLote, ElegirSabana, conteoDe } from "../components/recibos/ElegirSabana";

/*
  RECIBOS DE SUELDO (Contratación, 20/10/2026). Se sube la sábana PDF con todos los recibos del mes (dos
  páginas por persona) junto con el TXT que MEMOSOFT exporta con ella; el server parte el PDF en un recibo
  por persona y saca los datos del TXT (legajo, CUIL, categoría, tarea, importes, conceptos…), sin OCR. Sin
  TXT se lee el PDF por OCR, con menos datos y errores posibles. Se asocia a la persona por su CUIL. Cada fila tiene su PDF para
  revisarlo y, tildando, se mandan a firmar por el mismo circuito que los contratos (Outbox de Dropbox,
  nomenclatura «Recibos de sueldo»). Lo que el lector entendió se puede bajar entero como JSON.
*/

const CLASE_ESTADO: Record<string, string> = {
  sin_persona: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  listo: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  enviando: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800",
  enviado: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  firmado: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  error: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
};
const ICONO_ESTADO: Record<string, any> = {
  sin_persona: faUserSlash,
  listo: faCircleCheck,
  enviando: faSpinner,
  enviado: faClock,
  firmado: faCircleCheck,
  error: faCircleXmark,
};

export const RecibosSueldoPage: React.FC = () => {
  const [lotes, setLotes] = useState<LoteRecibos[] | null>(null);
  const [loteId, setLoteId] = useState<string | null>(null);
  const [lote, setLote] = useState<LoteRecibos | null>(null);
  const [cargandoLote, setCargandoLote] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [buscar, setBuscar] = useState("");
  const [paginasPorRecibo, setPaginasPorRecibo] = useState(2);
  const [verTexto, setVerTexto] = useState<{
    recibo: ReciboDelLote;
    texto: string | null;
  } | null>(null);
  const [asignando, setAsignando] = useState<ReciboDelLote | null>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);
  const [resultado, setResultado] = useState<ResultadoMasivo | null>(null);
  const [vista, setVista] = useState<"lotes" | "enviados">("lotes");
  const [eligiendoSabana, setEligiendoSabana] = useState(false);

  const cargarLotes = useCallback(async () => {
    try {
      const l = await recibosSueldoAPI.lotes();
      setLotes(l);
      if (!loteId && l.length > 0) setLoteId(l[0]._id);
    } catch (e: any) {
      sweetAlert.error("No se pudieron cargar los lotes", e?.response?.data?.error || e?.message || "");
      setLotes([]);
    }
  }, [loteId]);
  useEffect(() => {
    void cargarLotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cargarLote = useCallback(async (id: string) => {
    setCargandoLote(true);
    try {
      setLote(await recibosSueldoAPI.lote(id));
    } catch (e: any) {
      sweetAlert.error("No se pudo cargar el lote", e?.response?.data?.error || e?.message || "");
    } finally {
      setCargandoLote(false);
    }
  }, []);
  useEffect(() => {
    setSeleccion(new Set());
    if (loteId) void cargarLote(loteId);
    else setLote(null);
  }, [loteId, cargarLote]);

  /*
    Se relee solo: cada 2 s mientras el lote se está leyendo (OCR en el server, ~1 s por página) o
    enviando a firmar (también en el server, recibo por recibo), y cada medio minuto mientras haya
    recibos enviados (el escaneo de Dropbox los marca firmados).
  */
  const enviandoLote = lote?.envio?.estado === "enviando";
  useEffect(() => {
    if (!loteId || !lote) return;
    const rapido = lote.estadoLote === "leyendo" || lote.envio?.estado === "enviando";
    if (!rapido && !lote.recibos.some((r) => r.estado === "enviado")) return;
    const t = setInterval(() => void cargarLote(loteId), rapido ? 2_000 : 30_000);
    return () => clearInterval(t);
  }, [loteId, lote, cargarLote]);
  // Cuando termina el envío, el resumen: cuántos salieron y cuántos fallaron (con el motivo en su fila).
  const envioAnterior = useRef<string | undefined>(undefined);
  useEffect(() => {
    const e = lote?.envio;
    if (envioAnterior.current === "enviando" && e && e.estado !== "enviando") {
      if (e.estado === "error") sweetAlert.error("El envío se cortó", `${e.hechos} enviado${e.hechos === 1 ? "" : "s"} antes del corte. ${e.error || ""}`);
      else if (e.fallidos) sweetAlert.warning(`${e.hechos} enviado${e.hechos === 1 ? "" : "s"}, ${e.fallidos} con error`, "El motivo de cada uno está en su fila; quedaron «Listo» para reintentar.");
      else sweetAlert.success("Envío terminado", `${e.hechos} recibo${e.hechos === 1 ? "" : "s"} al Outbox.`);
      void cargarLotes();
    }
    envioAnterior.current = e?.estado;
  }, [lote?.envio, cargarLotes]);
  // Cuando termina la lectura, el resumen del selector de lotes también cambia.
  const estadoAnterior = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (estadoAnterior.current === "leyendo" && lote?.estadoLote && lote.estadoLote !== "leyendo") void cargarLotes();
    estadoAnterior.current = lote?.estadoLote;
  }, [lote?.estadoLote, cargarLotes]);

  /*
    SUBIDA: se eligen de una vez todas las sábanas PDF y sus TXT (pedido del 21/10/2026). El server
    empareja cada TXT con su PDF y crea un lote por par; el resultado queda a la vista. Un PDF solo, sin
    TXT, se lee por OCR, después de avisar que es más lento y menos preciso.
  */
  const subir = async (lista: FileList) => {
    const archivos = Array.from(lista);
    if (inputArchivo.current) inputArchivo.current.value = "";
    const pdfs = archivos.filter((f) => /\.pdf$/i.test(f.name));
    const txts = archivos.filter((f) => /\.txt$/i.test(f.name));
    if (pdfs.length === 0) {
      sweetAlert.error("Falta el PDF", "Elegí las sábanas PDF junto con sus TXT (los dos archivos que exporta MEMOSOFT por cada liquidación).");
      return;
    }
    setResultado(null);
    if (pdfs.length === 1 && txts.length === 0) {
      const r = await sweetAlert.confirm("¿Subir sin el TXT?", "Sin el TXT que exporta MEMOSOFT, el PDF se lee por OCR: tarda unos 3 segundos por página, trae menos datos (sin categoría, tarea ni importes) y puede leer mal algún CUIL o nombre. Para subir con el TXT, elegí los dos juntos en el selector de archivos.", "Sí, leer por OCR");
      if (!r.isConfirmed) return;
      setSubiendo(true);
      try {
        const nuevo = await recibosSueldoAPI.subir(pdfs[0], null, paginasPorRecibo);
        await cargarLotes();
        setLoteId(nuevo._id);
        sweetAlert.info("Leyendo la sábana", `${nuevo.paginas} página${nuevo.paginas === 1 ? "" : "s"}. Los datos están dibujados en el PDF, así que cada página pasa por OCR en tres pasadas: unos 3 segundos por página. La lista se arma sola cuando termina.`, 6000);
      } catch (e: any) {
        sweetAlert.error("No se pudo leer la sábana", e?.response?.data?.error || e?.message || "");
      } finally {
        setSubiendo(false);
      }
      return;
    }
    setSubiendo(true);
    try {
      const res = await recibosSueldoAPI.subirVarios(archivos, paginasPorRecibo);
      setResultado(res);
      await cargarLotes();
      if (res.lotes[0]) setLoteId(res.lotes[0].loteId);
    } catch (e: any) {
      sweetAlert.error("No se pudieron subir", e?.response?.data?.error || e?.message || "");
    } finally {
      setSubiendo(false);
    }
  };

  const recibos = lote?.recibos || [];
  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const digitos = q.replace(/\D/g, "");
    const textos = (r: ReciboDelLote) => [r.nombreUsuario, r.datos.nombre, r.datos.legajo, r.datos.categoria, r.datos.tarea, r.datos.sector, r.datos.numeroRecibo, r.nombreProyecto].map((x) => (x || "").toLowerCase());
    return q ? recibos.filter((r) => textos(r).some((t) => t.includes(q)) || (digitos.length >= 3 && r.datos.cuil.includes(digitos))) : recibos;
  }, [recibos, buscar]);
  const { ordenados, orden, alternar } = useOrdenTabla(
    filtrados,
    {
      pagina: (r) => r.paginas[0] || 0,
      persona: (r) => r.nombreUsuario || r.datos.nombre,
      legajo: (r) => Number(r.datos.legajo) || 0,
      cuil: (r) => r.datos.cuil,
      puesto: (r) => `${r.datos.categoria || ""} ${r.datos.tarea || ""}`,
      ingreso: (r) => (r.datos.ingreso || "").split("/").reverse().join(""),
      bruto: (r) => importeNumero(r.datos.sueldoBruto),
      descuentos: (r) => importeNumero(r.datos.descuentos),
      neto: (r) => importeNumero(r.datos.neto),
      recibo: (r) => Number(r.datos.numeroRecibo) || 0,
      estado: (r) => r.estado,
    },
    { columna: "pagina", direccion: "asc" },
  );
  const deTxt = lote?.fuente === "txt";
  const listos = recibos.filter((r) => r.estado === "listo");
  /** Se puede tildar (y releer) todo lo que todavía no salió a firmar. Enviar toma sólo los listos de entre lo tildado. */
  const sePuedeTildar = (r: ReciboDelLote) => r.estado === "sin_persona" || r.estado === "listo" || r.estado === "error";
  // Con el TXT no hay nada que releer: los datos son los del archivo.
  const sePuedeReleer = (r: ReciboDelLote) => !deTxt && sePuedeTildar(r);
  const tildables = filtrados.filter(sePuedeTildar);
  const tildados = recibos.filter((r) => seleccion.has(r._id) && sePuedeTildar(r));
  const seleccionados = tildados.filter((r) => r.estado === "listo");

  /*
    RELEER EN COLA (pedido del 21/10/2026): las filas tildadas pasan de a una por la relectura, como si se
    tocara el botón de cada una, con el avance a la vista y la posibilidad de frenar. Cada recibo son
    unos 10 s (dos páginas, cuatro pasadas de OCR).
  */
  const [cola, setCola] = useState<{
    actual: number;
    total: number;
    nombre: string;
  } | null>(null);
  const frenarCola = useRef(false);
  const releerEnCola = async (items: ReciboDelLote[]) => {
    if (!lote || items.length === 0) return;
    frenarCola.current = false;
    let hechos = 0;
    let fallidos = 0;
    for (const [i, r] of items.entries()) {
      if (frenarCola.current) break;
      setCola({
        actual: i + 1,
        total: items.length,
        nombre: r.nombreUsuario || r.datos.nombre || `páginas ${r.paginas.join("-")}`,
      });
      try {
        setLote(await recibosSueldoAPI.releer(lote._id, r._id));
        hechos++;
      } catch {
        fallidos++;
      }
    }
    setCola(null);
    setSeleccion(new Set());
    void cargarLotes();
    sweetAlert.info(frenarCola.current ? "Relectura frenada" : "Relectura terminada", `${hechos} releído${hechos === 1 ? "" : "s"}${fallidos ? `, ${fallidos} con error` : ""}.`, 4000);
  };

  const enviar = async (items: ReciboDelLote[]) => {
    if (!lote || items.length === 0) return;
    const r = await sweetAlert.confirm(`¿Enviar ${items.length === 1 ? "este recibo" : `${items.length} recibos`} a firmar?`, "Cada PDF va al Outbox de Dropbox con la nomenclatura «Recibos de sueldo» y Dropbox Sign lo manda a la persona. Cuando vuelva firmado, la fila pasa a «Firmado».", "Sí, enviar");
    if (!r.isConfirmed) return;
    setEnviando(true);
    try {
      // El server responde en el acto y sigue mandando solo: el avance se ve arriba de la tabla.
      const res = await recibosSueldoAPI.enviar(lote._id, items.map((x) => x._id));
      setLote(res.lote);
      setSeleccion(new Set());
    } catch (e: any) {
      sweetAlert.error("No se pudo enviar", e?.response?.data?.error || e?.message || "");
      void cargarLote(lote._id);
    } finally {
      setEnviando(false);
    }
  };

  const eliminarLote = async () => {
    if (!lote) return;
    const r = await sweetAlert.confirm("¿Borrar este lote?", "Se borran los PDFs separados y lo leído. La sábana original no se toca. No se puede borrar si ya hay recibos enviados.", "Sí, borrar");
    if (!r.isConfirmed) return;
    try {
      await recibosSueldoAPI.eliminar(lote._id);
      setLoteId(null);
      setLote(null);
      await cargarLotes();
    } catch (e: any) {
      sweetAlert.error("No se pudo borrar", e?.response?.data?.error || e?.message || "");
    }
  };

  /** Volver a leer un recibo: su PDF pasa otra vez por OCR a más resolución. Unos segundos por recibo. */
  const [releyendo, setReleyendo] = useState<string | null>(null);
  const releer = async (recibo: ReciboDelLote) => {
    if (!lote) return;
    setReleyendo(recibo._id);
    try {
      const nuevo = await recibosSueldoAPI.releer(lote._id, recibo._id);
      setLote(nuevo);
      const r = nuevo.recibos.find((x) => x._id === recibo._id);
      sweetAlert.info("Recibo releído", r ? `${r.datos.nombre || "sin nombre"} · CUIL ${fmtCuil(r.datos.cuil)} · ${ETIQUETA_ESTADO_RECIBO[r.estado]}` : "", 4000);
      void cargarLotes();
    } catch (e: any) {
      sweetAlert.error("No se pudo releer", e?.response?.data?.error || e?.message || "");
    } finally {
      setReleyendo(null);
    }
  };

  const abrirTexto = async (recibo: ReciboDelLote) => {
    if (!lote) return;
    setVerTexto({ recibo, texto: null });
    try {
      setVerTexto({
        recibo,
        texto: await recibosSueldoAPI.textoDeRecibo(lote._id, recibo._id),
      });
    } catch (e: any) {
      setVerTexto({
        recibo,
        texto: `No se pudo leer: ${e?.response?.data?.error || e?.message || ""}`,
      });
    }
  };

  const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 text-left";

  return (
    <PageLayout
      title="Recibos de sueldo"
      itemCount={recibos.length}
      faIcon={{ icon: faReceipt }}
      subtitle="Subí de una vez las sábanas PDF y sus TXT de MEMOSOFT: cada PDF se separa por persona, los datos salen de su TXT y se manda a firmar"
      headerActions={
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-gray-500" title="Cuántas páginas tiene el recibo de cada persona. Es la pista para partir la sábana cuando el texto no alcanza; con el CUIL en cada hoja se parte solo.">
            Páginas por persona
            <input type="number" min={1} max={10} value={paginasPorRecibo} onChange={(e) => setPaginasPorRecibo(Math.min(10, Math.max(1, Number(e.target.value) || 2)))} className="input-field w-14 py-1 text-center" />
          </label>
          <input ref={inputArchivo} type="file" multiple accept="application/pdf,.pdf,text/plain,.txt" className="hidden" onChange={(e) => e.target.files?.length && subir(e.target.files)} />
          <button type="button" onClick={() => inputArchivo.current?.click()} disabled={subiendo} className="btn-primary flex items-center gap-2 text-sm px-4 py-2" title="Elegí todos juntos (Cmd/Ctrl + clic o Cmd/Ctrl + A): las sábanas PDF y sus TXT. Cada TXT se empareja solo con su PDF, por nombre o por cantidad de páginas">
            <FontAwesomeIcon icon={subiendo ? faSpinner : faUpload} spin={subiendo} />
            {subiendo ? "Subiendo…" : "Subir sábanas (PDF + TXT)"}
          </button>
        </div>
      }
    >
      {/* Dos vistas: los lotes subidos (para revisar y enviar) y el registro de lo que ya se envió, que no se borra. */}
      <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(
          [
            ["lotes", "Sábanas subidas"],
            ["enviados", "Enviados (registro)"],
          ] as const
        ).map(([v, t]) => (
          <button key={v} type="button" onClick={() => setVista(v)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${vista === v ? "border-blue-600 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"}`}>
            {t}
          </button>
        ))}
      </div>
      {vista === "enviados" ? (
        <RegistroEnviadosRecibos />
      ) : (
        <>
          {resultado && <ResultadoSubida resultado={resultado} lotes={lotes || []} onElegir={setLoteId} onCerrar={() => setResultado(null)} />}
          {lotes === null ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner />
            </div>
          ) : lotes.length === 0 ? (
            <div className="text-center py-16 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
              <FontAwesomeIcon icon={faReceipt} className="h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Todavía no se subió ninguna sábana de recibos.</p>
              <p className="text-xs text-gray-400 mt-1">Las sábanas PDF del mes y el TXT que MEMOSOFT exporta con cada una: se eligen todos juntos y se emparejan solos.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Los lotes subidos: uno por sábana. */}
              <div className="flex flex-wrap items-center gap-2">
                {/* La sábana que se está viendo; se cambia en una ventana con todas, con sus números como badges. */}
                {(() => {
                  const actual = lotes.find((l) => l._id === loteId);
                  return (
                    <button type="button" onClick={() => setEligiendoSabana(true)} className="flex min-w-0 max-w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left hover:border-blue-300 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-700" title="Elegir otra sábana">
                      <FontAwesomeIcon icon={faLayerGroup} className="text-blue-500" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-gray-800 dark:text-gray-100">{actual ? `${periodoTexto(actual.periodo)} · ${actual.nombreArchivo}` : "Elegir sábana"}</span>
                        <span className="text-[11px] text-gray-500">
                          {lotes.length} sábana{lotes.length === 1 ? "" : "s"} subida{lotes.length === 1 ? "" : "s"} · cambiar
                        </span>
                      </span>
                      <FontAwesomeIcon icon={faChevronDown} className="ml-1 text-xs text-gray-400" />
                    </button>
                  );
                })()}
                {lote && (
                  <>
                    <button type="button" onClick={() => recibosSueldoAPI.descargarExportacion(lote)} className="btn-secondary flex items-center gap-2 text-sm px-3 py-2" title="Bajar un JSON con todo lo que el lector entendió de cada recibo, incluido el texto crudo">
                      <FontAwesomeIcon icon={faFileCode} /> Descargar lo leído (JSON)
                    </button>
                    <button type="button" onClick={eliminarLote} className="btn-secondary flex items-center gap-2 text-sm px-3 py-2 text-red-600" title="Borrar el lote (sólo si no se envió nada)">
                      <FontAwesomeIcon icon={faTrash} /> Borrar lote
                    </button>
                  </>
                )}
              </div>

              {!lote && cargandoLote ? (
                <div className="flex justify-center py-16">
                  <LoadingSpinner />
                </div>
              ) : !lote ? null : lote.estadoLote === "leyendo" ? (
                /* La lectura en el server: se muestra el avance y la lista aparece sola al terminar. */
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/20">
                  <p className="flex items-center gap-2 text-sm font-semibold text-blue-800 dark:text-blue-200">
                    <FontAwesomeIcon icon={faSpinner} spin />
                    Leyendo la sábana: página {lote.progreso?.leidas ?? 0} de {lote.progreso?.total || lote.paginas}
                  </p>
                  <div className="mt-3 h-2 w-full rounded-full bg-blue-100 dark:bg-blue-950">
                    <div
                      className="h-2 rounded-full bg-blue-600 transition-all"
                      style={{
                        width: `${Math.round(((lote.progreso?.leidas ?? 0) / Math.max(1, lote.progreso?.total || lote.paginas)) * 100)}%`,
                      }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-blue-700/80 dark:text-blue-300/80">Cada página se renderiza y pasa por OCR (los datos del recibo están dibujados, no son texto). Tres pasadas por página (la caja de datos, la página a 2 y a 3 aumentos): unos 3 segundos cada una. Podés salir de esta pantalla: la lectura sigue en el server.</p>
                </div>
              ) : lote.estadoLote === "error" ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
                  <p className="font-semibold">No se pudo leer la sábana.</p>
                  <p className="mt-1 text-xs">{lote.error || "Error desconocido."} Borrá el lote y volvé a subirla.</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre, CUIL o legajo…" className="input-field py-2 text-sm w-72" />
                    <BadgesLote lote={lote} conteo={conteoDe({ ...lote, resumen: undefined })} />
                    <div className="ml-auto flex items-center gap-2">
                      {deTxt ? null : cola ? (
                        <span className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                          <FontAwesomeIcon icon={faSpinner} spin /> Releyendo {cola.actual} de {cola.total}: {cola.nombre}
                          <button type="button" onClick={() => (frenarCola.current = true)} className="ml-1 rounded border border-blue-300 px-2 py-0.5 text-[11px] hover:bg-blue-100 dark:hover:bg-blue-900/40">
                            Frenar
                          </button>
                        </span>
                      ) : (
                        <button type="button" disabled={enviando || tildados.length === 0} onClick={() => releerEnCola(tildados)} className="btn-secondary flex items-center gap-2 text-sm px-3 py-2 disabled:opacity-50" title="Volver a leer las filas tildadas, de a una, en orden">
                          <FontAwesomeIcon icon={faRotateRight} /> Releer tildados {tildados.length > 0 ? `(${tildados.length})` : ""}
                        </button>
                      )}
                      <button type="button" disabled={enviando || enviandoLote || !!cola || seleccionados.length === 0} onClick={() => enviar(seleccionados)} className="btn-primary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-50" title="Manda a firmar los listos de entre los tildados">
                        <FontAwesomeIcon icon={enviando ? faSpinner : faPaperPlane} spin={enviando} /> Enviar a firmar {seleccionados.length > 0 ? `(${seleccionados.length} listo${seleccionados.length === 1 ? "" : "s"})` : ""}
                      </button>
                      <button type="button" disabled={enviando || enviandoLote || listos.length === 0} onClick={() => enviar(listos)} className="btn-secondary text-sm px-3 py-2 disabled:opacity-50" title="Todos los recibos listos del lote">
                        Enviar todos los listos ({listos.length})
                      </button>
                    </div>
                  </div>

                  {/* El envío a firmar corre en el server: el avance, recibo por recibo. Se puede salir de la pantalla. */}
                  {enviandoLote && lote.envio && (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-800 dark:bg-sky-900/20">
                      <p className="flex items-center gap-2 text-sm font-semibold text-sky-800 dark:text-sky-200">
                        <FontAwesomeIcon icon={faSpinner} spin />
                        Enviando a firmar: {lote.envio.hechos + lote.envio.fallidos} de {lote.envio.total}
                        {lote.envio.fallidos ? <span className="text-red-600 dark:text-red-400"> · {lote.envio.fallidos} con error</span> : null}
                      </p>
                      <div className="mt-2 h-2 w-full rounded-full bg-sky-100 dark:bg-sky-950">
                        <div className="h-2 rounded-full bg-sky-600 transition-all" style={{ width: `${Math.round(((lote.envio.hechos + lote.envio.fallidos) / Math.max(1, lote.envio.total)) * 100)}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-sky-700/80 dark:text-sky-300/80">Cada recibo se sube al Outbox de Dropbox y queda marcado apenas sale. Podés salir de esta pantalla: el envío sigue en el servidor.</p>
                    </div>
                  )}

                  <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr>
                          <th className={th}>
                            <input type="checkbox" checked={tildables.length > 0 && tildables.every((r) => seleccion.has(r._id))} onChange={(e) => setSeleccion(e.target.checked ? new Set(tildables.map((r) => r._id)) : new Set())} title="Tildar todas las filas que todavía no se enviaron (las de la búsqueda, si hay una)" />
                          </th>
                          <th className={th}>
                            <BotonOrden columna="pagina" orden={orden} onAlternar={alternar}>
                              Páginas
                            </BotonOrden>
                          </th>
                          <th className={th}>
                            <BotonOrden columna="persona" orden={orden} onAlternar={alternar}>
                              Persona
                            </BotonOrden>
                          </th>
                          <th className={th}>
                            <BotonOrden columna="legajo" orden={orden} onAlternar={alternar}>
                              Legajo
                            </BotonOrden>
                          </th>
                          <th className={th}>
                            <BotonOrden columna="cuil" orden={orden} onAlternar={alternar}>
                              CUIL
                            </BotonOrden>
                          </th>
                          <th className={th}>
                            <BotonOrden columna="puesto" orden={orden} onAlternar={alternar}>
                              Categoría · Tarea
                            </BotonOrden>
                          </th>
                          <th className={th}>
                            <BotonOrden columna="ingreso" orden={orden} onAlternar={alternar}>
                              Ingreso
                            </BotonOrden>
                          </th>
                          <th className={th}>Período</th>
                          <th className={`${th} text-right`}>
                            <BotonOrden columna="bruto" orden={orden} onAlternar={alternar}>
                              Bruto
                            </BotonOrden>
                          </th>
                          <th className={`${th} text-right`}>
                            <BotonOrden columna="descuentos" orden={orden} onAlternar={alternar}>
                              Descuentos
                            </BotonOrden>
                          </th>
                          <th className={`${th} text-right`}>
                            <BotonOrden columna="neto" orden={orden} onAlternar={alternar}>
                              Neto a cobrar
                            </BotonOrden>
                          </th>
                          <th className={th}>
                            <BotonOrden columna="recibo" orden={orden} onAlternar={alternar}>
                              Recibo
                            </BotonOrden>
                          </th>
                          <th className={th}>PDF</th>
                          <th className={th}>
                            <BotonOrden columna="estado" orden={orden} onAlternar={alternar}>
                              Estado | Firma
                            </BotonOrden>
                          </th>
                          <th className={th}></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {ordenados.length === 0 && (
                          <tr>
                            <td colSpan={16} className="px-4 py-10 text-center text-sm text-gray-500">
                              Ningún recibo coincide con la búsqueda.
                            </td>
                          </tr>
                        )}
                        {ordenados.map((r) => (
                          <tr key={r._id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                            <td className="px-4 py-3">
                              {sePuedeTildar(r) && (
                                <input
                                  type="checkbox"
                                  checked={seleccion.has(r._id)}
                                  onChange={(e) =>
                                    setSeleccion((s) => {
                                      const n = new Set(s);
                                      if (e.target.checked) n.add(r._id);
                                      else n.delete(r._id);
                                      return n;
                                    })
                                  }
                                />
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{r.paginas.join("-")}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col min-w-[12rem]">
                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{r.nombreUsuario || <span className="italic text-amber-600 dark:text-amber-400">Sin persona en la plataforma</span>}</span>
                                {/* Lo que dice el recibo, para cotejar con la persona asociada. */}
                                {r.datos.nombre && <span className="text-xs text-gray-500">En el recibo: {r.datos.nombre}</span>}
                                {r.nombreProyecto && (
                                  <span className="text-[11px] text-gray-400">
                                    {r.nombreProyecto}
                                    {r.asignadoAMano ? " · elegida a mano" : ""}
                                  </span>
                                )}
                                {r.asociadoPorNombre && !r.asignadoAMano && <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Asociada por nombre (sin CUIL legible): revisá antes de enviar</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm font-mono">{r.datos.legajo || "—"}</td>
                            <td className="px-4 py-3 text-sm font-mono whitespace-nowrap">{fmtCuil(r.datos.cuil)}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col min-w-[10rem]">
                                <span className="text-sm text-gray-800 dark:text-gray-200">{r.datos.categoria || "—"}</span>
                                {r.datos.tarea && <span className="text-xs text-gray-500">{r.datos.tarea}</span>}
                                {r.datos.sector && <span className="text-[11px] text-gray-400">Sector: {r.datos.sector}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col whitespace-nowrap">
                                <span className="text-sm">{r.datos.ingreso || "—"}</span>
                                {r.datos.antiguedad && <span className="text-xs text-gray-500">{r.datos.antiguedad}</span>}
                                {r.datos.modalidad && (
                                  <span className="text-[11px] text-gray-400 max-w-[12rem] truncate" title={r.datos.modalidad}>
                                    {r.datos.modalidad}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm whitespace-nowrap">{periodoTexto(r.datos.periodo)}</td>
                            <td className="px-4 py-3 text-sm whitespace-nowrap text-right" title={r.datos.basico ? `Básico ${r.datos.basico}` : ""}>
                              {pesos(r.datos.sueldoBruto)}
                            </td>
                            <td className="px-4 py-3 text-sm whitespace-nowrap text-right text-red-600 dark:text-red-400">{pesos(r.datos.descuentos)}</td>
                            <td className="px-4 py-3 text-sm whitespace-nowrap text-right font-semibold" title={r.datos.otros ? `Sueldo neto ${r.datos.sueldoNeto || "—"} · Otros ${r.datos.otros}` : ""}>
                              {pesos(r.datos.neto)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col whitespace-nowrap">
                                <span className="text-sm font-mono">{r.datos.numeroRecibo ? `N° ${r.datos.numeroRecibo}` : "—"}</span>
                                {r.datos.fechaPago && <span className="text-[11px] text-gray-400">Pago {r.datos.fechaPago}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <a href={getImageUrl(r.archivoUrl)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300" title="Abrir el PDF de este recibo">
                                <FontAwesomeIcon icon={faFilePdf} /> Ver
                              </a>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                <span className={`inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-[11px] font-semibold border ${CLASE_ESTADO[r.estado]}`} title={r.error || r.nombreEnviado || ""}>
                                  <FontAwesomeIcon icon={ICONO_ESTADO[r.estado]} spin={r.estado === "enviando"} className="h-3 w-3" /> {ETIQUETA_ESTADO_RECIBO[r.estado]}
                                </span>
                                {r.enviadoEl && (
                                  <span className="text-[11px] text-gray-400">
                                    Enviado {fechaHora(r.enviadoEl)}
                                    {r.codigo ? ` · ${r.codigo}` : ""}
                                  </span>
                                )}
                                {r.firmadoEl && <span className="text-[11px] text-green-600">Firmado {fechaHora(r.firmadoEl)}</span>}
                                {r.error && <span className="text-[11px] text-red-600 max-w-xs">{r.error}</span>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {(r.estado === "sin_persona" || r.estado === "listo" || r.estado === "error") && (
                                  <button type="button" onClick={() => setAsignando(r)} className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg" title="Elegir la persona de este recibo">
                                    <FontAwesomeIcon icon={faUserPen} />
                                  </button>
                                )}
                                <button type="button" onClick={() => abrirTexto(r)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Ver el detalle del recibo: conceptos y el texto leído">
                                  <FontAwesomeIcon icon={faAlignLeft} />
                                </button>
                                <button type="button" onClick={() => recibosSueldoAPI.descargarJsonDeRecibo(lote, r)} className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg" title="Bajar el JSON de este recibo (datos, persona y texto leído)">
                                  <FontAwesomeIcon icon={faFileCode} />
                                </button>
                                {sePuedeReleer(r) && (
                                  <button type="button" disabled={releyendo === r._id} onClick={() => releer(r)} className="p-2 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg disabled:opacity-50" title="Volver a leer el PDF de este recibo (OCR a más resolución)">
                                    <FontAwesomeIcon icon={releyendo === r._id ? faSpinner : faRotateRight} spin={releyendo === r._id} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {verTexto && (
        <Modal isOpen onClose={() => setVerTexto(null)} title="Detalle del recibo" subtitle={`Páginas ${verTexto.recibo.paginas.join("-")} · ${verTexto.recibo.nombreUsuario || verTexto.recibo.datos.nombre || "sin persona"}`} size="lg">
          <div className="space-y-3">
            <DetalleRecibo datos={verTexto.recibo.datos} />
            <details>
              <summary className="cursor-pointer text-xs font-semibold text-gray-500">Datos leídos (JSON)</summary>
              <pre className="mt-2 text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-h-[40vh] overflow-auto whitespace-pre-wrap">{JSON.stringify({ ...verTexto.recibo.datos, conceptos: undefined }, null, 2)}</pre>
            </details>
            {verTexto.texto === null ? <LoadingSpinner /> : <pre className="text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 max-h-[50vh] overflow-auto whitespace-pre-wrap">{verTexto.texto || "(sin texto: el PDF puede ser una imagen escaneada)"}</pre>}
            <p className="text-[11px] text-gray-400">
              Arriba, lo que se entendió; abajo, el texto tal cual se leyó ({lote?.fuente === "txt" ? "del TXT de MEMOSOFT" : "por OCR del PDF"}
              ).
            </p>
          </div>
        </Modal>
      )}

      {eligiendoSabana && lotes && <ElegirSabana lotes={lotes} actual={loteId} onElegir={setLoteId} onClose={() => setEligiendoSabana(false)} />}

      {asignando && lote && (
        <AsignarPersona
          recibo={asignando}
          onClose={() => setAsignando(null)}
          onElegir={async (p) => {
            try {
              setLote(await recibosSueldoAPI.asignarPersona(lote._id, asignando._id, p._id));
              setAsignando(null);
              void cargarLotes();
            } catch (e: any) {
              sweetAlert.error("No se pudo asignar", e?.response?.data?.error || e?.message || "");
            }
          }}
        />
      )}
    </PageLayout>
  );
};

const COMO_SE_EMPAREJO: Record<string, string> = {
  nombre: "por nombre",
  paginas: "por cantidad de páginas",
  unicos: "único PDF con único TXT",
};

/** Lo que pasó con cada archivo de la subida: qué TXT fue con qué PDF y qué quedó afuera, con el motivo. */
const ResultadoSubida: React.FC<{
  resultado: ResultadoMasivo;
  lotes: LoteRecibos[];
  onElegir: (id: string) => void;
  onCerrar: () => void;
}> = ({ resultado, lotes, onElegir, onCerrar }) => {
  const total = resultado.lotes.reduce((n, l) => n + l.recibos, 0);
  return (
    <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <p className="font-semibold text-gray-800 dark:text-gray-200">
          {resultado.lotes.length} sábana
          {resultado.lotes.length === 1 ? "" : "s"} subida
          {resultado.lotes.length === 1 ? "" : "s"} · {total} recibo
          {total === 1 ? "" : "s"}
          {resultado.omitidos.length > 0 && (
            <span className="text-amber-600 dark:text-amber-400">
              {" "}
              · {resultado.omitidos.length} archivo
              {resultado.omitidos.length === 1 ? "" : "s"} sin subir
            </span>
          )}
        </p>
        <button type="button" onClick={onCerrar} className="text-xs text-gray-400 hover:text-gray-600" title="Cerrar">
          <FontAwesomeIcon icon={faCircleXmark} />
        </button>
      </div>
      {resultado.lotes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {resultado.lotes.map((l) => {
            const lote = lotes.find((x) => x._id === l.loteId);
            return (
              <li key={l.loteId} className="flex flex-wrap items-center gap-x-2 text-xs">
                <FontAwesomeIcon icon={faCircleCheck} className="text-green-600" />
                <button type="button" onClick={() => onElegir(l.loteId)} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
                  {l.pdf}
                </button>
                <span className="text-gray-400">+ {l.txt}</span>
                <span className="text-gray-500">
                  · {l.recibos} recibos · {COMO_SE_EMPAREJO[l.por] || l.por}
                </span>
                {lote?.resumen?.sinPersona ? <span className="text-amber-600 dark:text-amber-400">· {lote.resumen.sinPersona} sin persona</span> : null}
              </li>
            );
          })}
        </ul>
      )}
      {resultado.omitidos.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2 dark:border-gray-700">
          {resultado.omitidos.map((o) => (
            <li key={o.archivo} className="text-xs">
              <FontAwesomeIcon icon={faCircleXmark} className="mr-1 text-amber-500" />
              <span className="font-medium text-gray-700 dark:text-gray-300">{o.archivo}</span>: <span className="text-gray-500">{o.motivo}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Elegir a mano la persona de un recibo: por nombre, email o CUIL. */
const AsignarPersona: React.FC<{
  recibo: ReciboDelLote;
  onClose: () => void;
  onElegir: (p: PersonaBuscada) => Promise<void>;
}> = ({ recibo, onClose, onElegir }) => {
  const [q, setQ] = useState(recibo.datos.cuil || recibo.datos.nombre || "");
  const [resultados, setResultados] = useState<PersonaBuscada[] | null>(null);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResultados([]);
      return;
    }
    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        const r = await recibosSueldoAPI.buscarPersonas(q.trim());
        if (!cancelado) setResultados(r);
      } catch {
        if (!cancelado) setResultados([]);
      }
    }, 300);
    return () => {
      cancelado = true;
      clearTimeout(t);
    };
  }, [q]);
  return (
    <Modal isOpen onClose={onClose} title="Elegir la persona del recibo" subtitle={`Páginas ${recibo.paginas.join("-")}${recibo.datos.nombre ? ` · el recibo dice «${recibo.datos.nombre}»` : ""}${recibo.datos.cuil ? ` · CUIL ${fmtCuil(recibo.datos.cuil)}` : ""}`} size="md">
      <div className="space-y-3">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, email o CUIL…" className="input-field w-full" />
        {resultados === null ? (
          <LoadingSpinner />
        ) : resultados.length === 0 ? (
          <p className="text-sm text-gray-500">{q.trim().length < 2 ? "Escribí al menos dos letras." : "Nadie coincide."}</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg max-h-72 overflow-auto">
            {resultados.map((p) => (
              <li key={p._id}>
                <button type="button" onClick={() => onElegir(p)} className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{p.nombre}</span>
                  <span className="text-xs text-gray-500 font-mono">
                    {fmtCuil(p.cuil)}
                    {p.email ? ` · ${p.email}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-gray-400">El recibo se asocia al contrato vigente de esa persona. Si no tiene ninguno, queda sin persona hasta que lo tenga.</p>
      </div>
    </Modal>
  );
};

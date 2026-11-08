import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileArrowDown, faBolt, faSpinner, faCircleCheck, faCircleXmark, faCircleQuestion, faClock } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { CuentaRegresiva } from "../components/ui/CuentaRegresiva";
import { BotonOrden, useOrdenTabla } from "../components/ui/OrdenTabla";
import { projectsAPI, horaTexto, type EstadoDescargasArca, type FueraDeLaCorrida, type PendienteDeConstancia } from "../api/projects";
import { sweetAlert } from "../utils/sweetAlert";
import { usePuedeAbrir } from "../hooks/usePuedeAbrir";
import { TablaConEncabezadoFijo, useAltoDeBarra } from "../components/ui/TablaConEncabezadoFijo";
import { BotonVolverABajar } from "../components/contratos/HistorialAltasArca";

/*
  A.R.C.A DESCARGAS AUTOMÁTICAS (pedido del 18/10/2026): la hermana de «A.R.C.A Altas Automáticas». Muestra
  las altas ya presentadas que esperan su constancia, con la cuenta regresiva hasta la próxima descarga
  automática, y deja forzar la descarga de una, de las tildadas o de todas. La descarga en sí es la del
  registro de Altas Masivas («Descargar altas tempranas»): una persona por vez, con pausa, por empleadora.
*/

const fechaCorta = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—");
const fmtCuil = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
const fechaArgentina = (iso: string) => fechaCorta(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(iso)));
const claveDe = (p: PendienteDeConstancia) => `${p.userProjectId}:${p.contractIndex}`;

/*
  EL ESTADO DE CADA PENDIENTE (07/11/2026, de `constancias_arca`): nueva (nunca se pidió), reintento
  (falló, espera su fecha: 1 día, después 2; son 3 intentos como mucho) o en revisión (no se pide sola
  ni ocupa cupo: hay que mirarla y apretar «Reintentar»).
*/
const MAX_INTENTOS = 3;
type Situacion = "nueva" | "reintento" | "revision";
const situacionDe = (p: PendienteDeConstancia): Situacion => (p.ciclo?.estado === "requiere_revision" ? "revision" : p.ciclo?.estado === "constancia_pendiente" ? "reintento" : "nueva");
// Desde el último «Volver a bajar»: una re-descarga arranca con sus 3 intentos (como `trasUnFallo` en el servidor).
const intentosDesdeLaRedescarga = (p: PendienteDeConstancia) => {
  const t = p.ciclo?.intentos || [];
  return t.slice(t.map((i) => i.resultado).lastIndexOf("redescarga") + 1);
};
const intentosAutomaticos = (p: PendienteDeConstancia) => intentosDesdeLaRedescarga(p).filter((i) => !i.manual && i.resultado !== "descargada").length;
const EtiquetaRedescarga: React.FC<{ p: PendienteDeConstancia }> = ({ p }) =>
  p.ciclo?.redescarga?.enCurso ? (
    <p className="text-[11px] text-violet-700 dark:text-violet-300" title="Se pidió volver a bajarla porque el documento anterior no está en ninguna carpeta">
      Re-descarga pedida el {fechaArgentina(p.ciclo.redescarga.pedidaEl)}
      {p.ciclo.redescarga.codigoAnterior ? ` · se perdió ${p.ciclo.redescarga.codigoAnterior}` : ""}
    </p>
  ) : null;
const EstadoDelCiclo: React.FC<{ p: PendienteDeConstancia }> = ({ p }) => {
  const s = situacionDe(p);
  const ultimo = intentosDesdeLaRedescarga(p).slice(-1)[0];
  if (s === "nueva")
    return p.ciclo?.redescarga?.enCurso ? (
      <div className="space-y-0.5 max-w-xs">
        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300">Re-descarga</span>
        <EtiquetaRedescarga p={p} />
      </div>
    ) : (
      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">Nueva</span>
    );
  if (s === "reintento")
    return (
      <div className="space-y-0.5 max-w-xs">
        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          {p.ciclo?.redescarga?.enCurso ? "Re-descarga · reintento" : "Reintento"} {intentosAutomaticos(p) + 1} de {MAX_INTENTOS}
        </span>
        <EtiquetaRedescarga p={p} />
        {ultimo?.detalle && <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2" title={ultimo.detalle}>Último: {ultimo.detalle}</p>}
      </div>
    );
  return (
    <div className="space-y-0.5 max-w-xs">
      <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">Requiere revisión</span>
      {p.ciclo?.motivoRevision && <p className="text-[11px] text-gray-600 dark:text-gray-300" title={p.ciclo.motivoRevision}>{p.ciclo.motivoRevision}</p>}
    </div>
  );
};

/** «5 nuevas quedan para mañana por el tope · 3 reintentos esperan su fecha · 2 en revisión». */
const textoFuera = (f?: FueraDeLaCorrida) => {
  if (!f) return "";
  const partes = [
    f.nuevasPorTope > 0 && `${f.nuevasPorTope} nueva${f.nuevasPorTope === 1 ? "" : "s"} para mañana por el tope`,
    f.reintentosPorTope > 0 && `${f.reintentosPorTope} reintento${f.reintentosPorTope === 1 ? "" : "s"} para mañana por el tope (las nuevas van primero)`,
    f.esperandoReintento > 0 && `${f.esperandoReintento} reintento${f.esperandoReintento === 1 ? "" : "s"} esperando su fecha`,
    f.enRevision > 0 && `${f.enRevision} en revisión (no se piden solas)`,
  ].filter(Boolean);
  return partes.length ? ` Quedaron afuera: ${partes.join(" · ")}.` : "";
};

export const DescargasArcaPage: React.FC = () => {
  // La barra de «N tildadas» también se pega debajo del header: el encabezado de la tabla va debajo de ella.
  const [barraRef, altoBarra] = useAltoDeBarra();
  const puedeAbrir = usePuedeAbrir();
  const [estado, setEstado] = useState<EstadoDescargasArca | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [forzando, setForzando] = useState(false);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [buscar, setBuscar] = useState("");
  // La hora del SERVIDOR: la cuenta regresiva no puede depender de un reloj de PC atrasado.
  const [desfase, setDesfase] = useState(0);
  const [ahora, setAhora] = useState(Date.now());

  const cargar = useCallback(async () => {
    try {
      const e = await projectsAPI.descargasArca();
      setEstado(e);
      setDesfase(new Date(e.ahora).getTime() - Date.now());
    } catch (err: any) {
      sweetAlert.error("No se pudo cargar", err?.response?.data?.error || err?.message || "");
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    void cargar();
  }, [cargar]);
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  // Mientras algo se baja, se refresca seguido para ver el avance y la lista que se achica.
  const enCurso = !!estado?.descarga?.corriendo || (!!estado?.forzado && !estado.forzado.terminado);
  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => void cargar(), 5000);
    return () => clearInterval(t);
  }, [enCurso, cargar]);
  const ahoraServidor = ahora + desfase;

  const cambiarActiva = async (activa: boolean) => {
    if (activa) {
      const r = await sweetAlert.confirm("Activar la descarga automática", `Todos los días a las ${horaTexto(estado?.config)} se van a bajar de ARCA las constancias de las altas presentadas que todavía no la tienen (hasta ${estado?.maxPorEmpleadora ?? 40} por empleadora). Sólo lee en ARCA.`, "Sí, activar", "Cancelar");
      if (!r.isConfirmed) return;
    }
    setGuardando(true);
    try {
      await projectsAPI.setDescargaConstanciasAutomatica({ activa });
      await cargar();
    } catch (err: any) {
      sweetAlert.error("No se pudo guardar", err?.response?.data?.error || err?.message || "");
    } finally {
      setGuardando(false);
    }
  };

  const pendientes = estado?.pendientes || [];
  const filtrados = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return q ? pendientes.filter((p) => p.nombre.toLowerCase().includes(q) || p.cuil.includes(q.replace(/\D/g, "")) || p.empresa.razonSocial.toLowerCase().includes(q)) : pendientes;
  }, [pendientes, buscar]);
  const { ordenados, orden, alternar } = useOrdenTabla(filtrados, { persona: (p) => p.nombre, empresa: (p) => p.empresa.razonSocial, alta: (p) => p.fechaAlta, presentada: (p) => p.presentadaEl }, { columna: "presentada", direccion: "desc" });
  const seleccionadas = useMemo(() => pendientes.filter((p) => seleccion.has(claveDe(p))), [pendientes, seleccion]);
  // Validadas cuyo documento se perdió (07/11/2026): no esperan constancia, se «Vuelven a bajar» y pasan a la cola de abajo.
  const noUbicadas = estado?.noUbicadas || [];
  const [tildadasNoUbicadas, setTildadasNoUbicadas] = useState<Set<string>>(new Set());
  const noUbicadasTildadas = noUbicadas.filter((k) => tildadasNoUbicadas.has(k.clave));
  const trasVolverABajar = () => {
    setTildadasNoUbicadas(new Set());
    void cargar();
  };

  const forzar = async (items: PendienteDeConstancia[], titulo: string) => {
    if (items.length === 0) return;
    const empresas = [...new Set(items.map((p) => p.empresa.razonSocial))];
    const r = await sweetAlert.confirm(titulo, `Se bajan ya de ARCA ${items.length === 1 ? "la constancia" : `${items.length} constancias`}, a nombre de ${empresas.join(" y ")} (${empresas.length === 1 ? "una corrida" : `${empresas.length} corridas, una por empleadora, en fila`}). Cada una se valida contra el contrato y va al Outbox o a «No firmar». Sólo lee en ARCA.`, "Sí, bajar", "Cancelar");
    if (!r.isConfirmed) return;
    setForzando(true);
    try {
      const res = await projectsAPI.forzarDescargasArca(items.map((p) => ({ userProjectId: p.userProjectId, contractIndex: p.contractIndex })));
      setSeleccion(new Set());
      if (res.omitidas > 0) sweetAlert.info("Algunas no", `${res.omitidas} ya tenían su constancia o no se encontraron.`, 3000);
      await cargar();
    } catch (err: any) {
      sweetAlert.error("No se pudo arrancar la descarga", err?.response?.data?.error || err?.message || "");
    } finally {
      setForzando(false);
    }
  };

  const personasEnCurso = useMemo(() => {
    const porCuil = new Map<string, any>();
    for (const e of estado?.descarga?.eventos || []) if (e.tipo === "persona") porCuil.set(e.cuil, e);
    return [...porCuil.values()];
  }, [estado]);
  const u = estado?.ultimaCorrida;
  const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 text-left";

  return (
    <PageLayout
      title="A.R.C.A Descargas Automáticas"
      itemCount={pendientes.length}
      faIcon={{ icon: faFileArrowDown }}
      subtitle="Las altas ya presentadas que esperan su constancia, cuándo se bajan solas, y forzar la descarga"
      headerActions={
        estado ? (
          <label className="inline-flex items-center gap-2 cursor-pointer select-none" title={estado.activa ? "Desactivar la descarga automática" : "Activar la descarga automática"}>
            <input type="checkbox" className="sr-only peer" checked={estado.activa} disabled={guardando} onChange={(e) => cambiarActiva(e.target.checked)} />
            <span className="relative w-11 h-6 rounded-full bg-gray-300 dark:bg-gray-600 peer-checked:bg-green-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
            <span className={`text-sm font-semibold ${estado.activa ? "text-green-700 dark:text-green-400" : "text-gray-500"}`}>{estado.activa ? "Activada" : "Desactivada"}</span>
          </label>
        ) : undefined
      }
    >
      {cargando || !estado ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2">
            <FontAwesomeIcon icon={faClock} className="text-gray-400" />
            Todos los días a las <strong>{horaTexto(estado.config)}</strong>, hasta {estado.maxPorEmpleadora} por empleadora.
            {puedeAbrir("/arca/descarga-constancias") && (
              <Link to="/arca/descarga-constancias" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold">
                Cambiar horario
              </Link>
            )}
          </p>

          {/* La próxima descarga, con la cuenta regresiva, y el botón para no esperarla. */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Próxima descarga automática</p>
              {estado.proximaCorrida ? (
                <div className="mt-2 flex items-center gap-4">
                  <CuentaRegresiva destino={estado.proximaCorrida} ahora={ahoraServidor} grande />
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    {fechaArgentina(estado.proximaCorrida)} a las {horaTexto(estado.config)}
                    <br />
                    <span className="text-xs text-gray-500">
                      {pendientes.length} constancia{pendientes.length === 1 ? "" : "s"} esperando{pendientes.length > estado.maxPorEmpleadora ? ` (salen de a ${estado.maxPorEmpleadora} por empleadora y por día)` : ""}
                    </span>
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">La descarga automática está desactivada: las constancias se bajan sólo forzándolas desde acá.</p>
              )}
            </div>
            <button type="button" onClick={() => forzar(pendientes, `Bajar ahora las ${pendientes.length} constancias`)} disabled={forzando || enCurso || pendientes.length === 0} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
              <FontAwesomeIcon icon={forzando || enCurso ? faSpinner : faBolt} spin={forzando || enCurso} />
              {enCurso ? "Bajando…" : `Forzar descarga de todas (${pendientes.length})`}
            </button>
          </div>

          {/* Lo que se está bajando ahora: empleadora, avance y persona por persona. */}
          {(estado.descarga || (estado.forzado && !estado.forzado.terminado)) && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 p-5 space-y-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {estado.forzado && !estado.forzado.terminado ? `Descarga forzada: ${estado.forzado.terminadas} de ${estado.forzado.empresas.length} empleadora(s) listas · ${estado.forzado.listas} constancia(s) bajadas${estado.forzado.empresaActual ? ` · ahora ${estado.forzado.empresaActual}` : ""}` : estado.descarga?.corriendo ? `Bajando las constancias de ${estado.descarga.empresaRazonSocial} (${estado.descarga.total})…` : `Última descarga de ${estado.descarga?.empresaRazonSocial}: ${estado.descarga?.eventos.find((e) => e.tipo === "fin")?.listas ?? 0} de ${estado.descarga?.total} bajada(s)`}
              </p>
              {estado.forzado?.errores.map((e, i) => (
                <p key={i} className="text-xs text-red-700 dark:text-red-400">
                  {e}
                </p>
              ))}
              {estado.descarga?.eventos.find((e) => e.tipo === "fallo") && <p className="text-xs text-red-700 dark:text-red-400">La descarga se cortó: {estado.descarga.eventos.find((e) => e.tipo === "fallo")?.mensaje}</p>}
              {personasEnCurso.length > 0 && (
                <ul className="divide-y divide-blue-100 dark:divide-blue-900/40 text-xs max-h-56 overflow-y-auto">
                  {personasEnCurso.map((p) => {
                    const bien = p.estado === "lista";
                    const bajando = p.estado === "descargando";
                    return (
                      <li key={p.cuil} className="py-1 flex items-start gap-2">
                        <FontAwesomeIcon icon={bajando ? faSpinner : bien ? faCircleCheck : p.estado === "sin_constancia" ? faCircleQuestion : faCircleXmark} spin={bajando} className={`h-3 w-3 mt-0.5 shrink-0 ${bajando ? "text-blue-500" : bien ? "text-green-600 dark:text-green-400" : p.estado === "sin_constancia" ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`} />
                        <span className="font-semibold text-gray-900 dark:text-gray-100 shrink-0">{p.nombre}</span>
                        <span className={bien || bajando ? "text-gray-600 dark:text-gray-400" : "text-red-700 dark:text-red-400"}>{bajando ? "bajando…" : p.detalle}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {u && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-1">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Última automática: {fechaCorta(u.dia)} · {new Date(u.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} h
              </p>
              {u.error && <p className="text-xs text-red-600 dark:text-red-400">{u.error}</p>}
              {u.empresas.length === 0 && !u.error && <p className="text-xs text-gray-500">No había constancias pendientes ese día.</p>}
              {u.empresas.map((e) => (
                <p key={e.empresa} className={`text-xs ${e.error ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-300"}`}>
                  {e.empresa}: {e.listas} de {e.pedidas} bajada(s){e.fuera ? textoFuera(e.fuera) : e.pendientes > e.pedidas ? ` (${e.pendientes - e.pedidas} quedaron para el día siguiente por el tope)` : ""}
                  {e.error ? ` · ${e.error}` : ""}
                </p>
              ))}
            </div>
          )}

          {seleccionadas.length > 0 && (
            <div ref={barraRef} className="sticky top-[var(--wp-sticky-top,144px)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 px-4 py-2.5 shadow-sm">
              <p className="text-sm text-blue-900 dark:text-blue-100">
                <strong>{seleccionadas.length}</strong> tildada{seleccionadas.length === 1 ? "" : "s"} · {[...new Set(seleccionadas.map((p) => p.empresa.razonSocial))].join(", ")}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSeleccion(new Set())} className="text-xs font-semibold text-blue-800 dark:text-blue-200 hover:underline">
                  Destildar
                </button>
                <button type="button" onClick={() => forzar(seleccionadas, `Bajar ahora ${seleccionadas.length} constancia${seleccionadas.length === 1 ? "" : "s"}`)} disabled={forzando || enCurso} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap">
                  <FontAwesomeIcon icon={forzando ? faSpinner : faBolt} spin={forzando} className="h-3 w-3" />
                  Forzar descarga de {seleccionadas.length}
                </button>
              </div>
            </div>
          )}

          {noUbicadas.length > 0 && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Documento no ubicado ({noUbicadas.length})</h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Se bajaron y validaron, pero el PDF se borró antes de firmarse. «Volver a bajar» las pone en la cola de abajo como «Re-descarga».</p>
                </div>
                {noUbicadasTildadas.length > 0 && <BotonVolverABajar ciclos={noUbicadasTildadas} onHecho={trasVolverABajar} texto={`Volver a bajar ${noUbicadasTildadas.length}`} disabled={enCurso} />}
              </div>
              <div className="overflow-x-auto rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-800">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={`${th} w-8`}>
                        <input type="checkbox" className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" checked={noUbicadasTildadas.length === noUbicadas.length} onChange={() => setTildadasNoUbicadas(noUbicadasTildadas.length === noUbicadas.length ? new Set() : new Set(noUbicadas.map((k) => k.clave)))} title="Tildar todas" />
                      </th>
                      <th className={th}>Persona</th>
                      <th className={th}>Empresa</th>
                      <th className={th}>Alta</th>
                      <th className={th}>Qué pasó</th>
                      <th className={`${th} col-acciones`}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {noUbicadas.map((k) => (
                      <tr key={k.clave} className={`border-t border-gray-100 dark:border-gray-800 align-top ${tildadasNoUbicadas.has(k.clave) ? "bg-violet-50/60 dark:bg-violet-900/10" : ""}`}>
                        <td className="px-3 py-3 w-8">
                          <input type="checkbox" className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" checked={tildadasNoUbicadas.has(k.clave)} onChange={() => setTildadasNoUbicadas((prev) => { const t = new Set(prev); if (t.has(k.clave)) t.delete(k.clave); else t.add(k.clave); return t; })} />
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{k.nombre}</p>
                          <p className="text-xs font-mono text-gray-500">{fmtCuil(k.cuil)}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{k.empresaRazonSocial}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{fechaCorta(k.fechaAlta)}</td>
                        <td className="px-4 py-3 text-[11px] text-gray-600 dark:text-gray-300 max-w-md">
                          {k.documento?.codigo && <span className="font-mono font-semibold">{k.documento.codigo} · </span>}
                          {k.motivoRevision}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <BotonVolverABajar ciclos={[k]} onHecho={trasVolverABajar} disabled={enCurso} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Esperan su constancia ({pendientes.length})</h2>
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por persona, CUIL o empresa…" className="input-field text-sm w-72" />
            </div>
            {pendientes.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 px-6 py-10 text-center text-sm text-gray-500">No hay altas presentadas esperando su constancia.</p>
            ) : (
              <TablaConEncabezadoFijo top={`calc(var(--wp-sticky-top, 144px) + ${altoBarra}px)`} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800" tabla="min-w-full">
                <thead>
                  <tr>
                    <th className={`${th} w-8`}>
                      <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={filtrados.length > 0 && filtrados.every((p) => seleccion.has(claveDe(p)))} disabled={filtrados.length === 0} onChange={() => setSeleccion((prev) => { const s = new Set(prev); const todas = filtrados.every((p) => s.has(claveDe(p))); for (const p of filtrados) { if (todas) s.delete(claveDe(p)); else s.add(claveDe(p)); } return s; })} title="Tildar todas" />
                    </th>
                    <th className={th}>
                      <BotonOrden columna="persona" orden={orden} onAlternar={alternar}>
                        Persona
                      </BotonOrden>
                    </th>
                    <th className={th}>
                      <BotonOrden columna="empresa" orden={orden} onAlternar={alternar}>
                        Empresa
                      </BotonOrden>
                    </th>
                    <th className={th}>
                      <BotonOrden columna="alta" orden={orden} onAlternar={alternar}>
                        Alta
                      </BotonOrden>
                    </th>
                    <th className={th}>
                      <BotonOrden columna="presentada" orden={orden} onAlternar={alternar}>
                        Presentada en ARCA
                      </BotonOrden>
                    </th>
                    <th className={th}>Estado</th>
                    <th className={th}>Se baja en</th>
                    <th className={`${th} col-acciones`}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenados.map((p) => (
                    <tr key={claveDe(p)} className={`border-t border-gray-100 dark:border-gray-800 align-top ${seleccion.has(claveDe(p)) ? "bg-blue-50/60 dark:bg-blue-900/10" : ""}`}>
                      <td className="px-3 py-3 w-8">
                        <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" checked={seleccion.has(claveDe(p))} onChange={() => setSeleccion((prev) => { const s = new Set(prev); if (s.has(claveDe(p))) s.delete(claveDe(p)); else s.add(claveDe(p)); return s; })} />
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{p.nombre}</p>
                        <p className="text-xs font-mono text-gray-500">{fmtCuil(p.cuil)}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{p.empresa.razonSocial}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{fechaCorta(p.fechaAlta)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{p.presentadaEl ? `${new Date(p.presentadaEl).toLocaleDateString("es-AR")} ${new Date(p.presentadaEl).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : "—"}</td>
                      <td className="px-4 py-3">
                        <EstadoDelCiclo p={p} />
                      </td>
                      <td className="px-4 py-3">
                        {situacionDe(p) === "revision" ? (
                          <span className="text-xs text-gray-500">No se pide sola</span>
                        ) : situacionDe(p) === "reintento" && p.ciclo?.proximoIntentoEl && new Date(p.ciclo.proximoIntentoEl).getTime() > ahoraServidor ? (
                          <span className="text-xs text-gray-600 dark:text-gray-400">En la descarga del {fechaArgentina(p.ciclo.proximoIntentoEl)}</span>
                        ) : estado.proximaCorrida ? (
                          <div className="space-y-1">
                            <CuentaRegresiva destino={estado.proximaCorrida} ahora={ahoraServidor} />
                            <p className="text-[11px] text-gray-500">{new Date(estado.proximaCorrida).getTime() <= ahoraServidor ? "En la descarga en curso" : `${fechaArgentina(estado.proximaCorrida)} a las ${horaTexto(estado.config)}`}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Automática desactivada</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => forzar([p], `Bajar ahora la constancia de ${p.nombre}`)} disabled={forzando || enCurso} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
                          <FontAwesomeIcon icon={faBolt} className="h-3 w-3" />
                          {situacionDe(p) === "nueva" ? "Forzar descarga" : "Reintentar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TablaConEncabezadoFijo>
            )}
          </section>
        </div>
      )}
    </PageLayout>
  );
};

export default DescargasArcaPage;

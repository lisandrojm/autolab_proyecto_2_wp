import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotate, faSpinner, faCircleCheck, faCircleXmark, faChevronDown, faChevronRight, faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { arcaRelacionesAPI, type AntiguedadFila, type EmpresaConCuit, type EstadoSyncRelaciones, type RelacionLaboral } from "../../api/arcaRelaciones";
import { BotonOrden, useOrdenTabla } from "../ui/OrdenTabla";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { sweetAlert } from "../../utils/sweetAlert";

/*
  ANTIGÜEDAD SEGÚN ARCA: la copia local de las relaciones laborales de Simplificación Registral y la
  antigüedad de cada persona calculada sobre ella (ver `server/src/utils/antiguedadArca.ts`). Arriba,
  la sincronización: cuándo corre sola, cómo le fue la última vez y «Sincronizar ahora». Abajo, la
  tabla por persona: con «Todas las empresas» se ven las filas globales (las tres empleadoras
  juntas, sin contar dos veces los días solapados); con una empresa, las de esa empleadora.
*/

const fmtCuil = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
const fechaCorta = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const hace = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
};
/** "5,53 años"; los días van debajo, en gris. */
const anios = (a: number) => `${a.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} años`;
const dias = (d: number) => `${d.toLocaleString("es-AR")} días`;
const importe = (n: number | null) => (n === null || n === undefined ? "—" : n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 text-left";
const td = "px-4 py-3 text-sm text-gray-700 dark:text-gray-300";

export const AntiguedadArcaTab: React.FC<{ onCountChange?: (n: number | undefined) => void }> = ({ onCountChange }) => {
  const [estado, setEstado] = useState<EstadoSyncRelaciones | null>(null);
  const [empresas, setEmpresas] = useState<EmpresaConCuit[]>([]);
  const [filas, setFilas] = useState<AntiguedadFila[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [empresaCuit, setEmpresaCuit] = useState("");
  const [q, setQ] = useState("");
  const [qAplicada, setQAplicada] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [relaciones, setRelaciones] = useState<Record<string, RelacionLaboral[] | "cargando">>({});
  const [guardando, setGuardando] = useState(false);
  const [verUltima, setVerUltima] = useState(false);
  const ultimaSyncVista = useRef<string | null>(null);

  const razonSocialDe = useCallback((cuit: string) => empresas.find((e) => e.cuit === cuit)?.razonSocial || cuit, [empresas]);

  const cargarEstado = useCallback(async () => {
    try {
      setEstado(await arcaRelacionesAPI.estado());
    } catch (err: any) {
      sweetAlert.error("No se pudo cargar el estado", err?.response?.data?.error || err?.message || "");
    }
  }, []);

  const cargarFilas = useCallback(async () => {
    try {
      const r = await arcaRelacionesAPI.antiguedad({ empresaCuit: empresaCuit || undefined, q: qAplicada || undefined });
      setEmpresas(r.empresas);
      setFilas(r.filas);
      setTotal(r.total);
      onCountChange?.(r.total);
    } catch (err: any) {
      sweetAlert.error("No se pudo cargar la antigüedad", err?.response?.data?.error || err?.message || "");
    } finally {
      setCargando(false);
    }
  }, [empresaCuit, qAplicada, onCountChange]);

  useEffect(() => { void cargarEstado(); }, [cargarEstado]);
  useEffect(() => { void cargarFilas(); }, [cargarFilas]);
  // La búsqueda va al server, con una pausa corta para no pedir por cada tecla.
  useEffect(() => { const t = setTimeout(() => setQAplicada(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  // Mientras hay una sincronización en curso se mira cada 4 s; si no, cada minuto. Al terminar, se recarga la tabla.
  const enCurso = !!estado?.enCurso;
  useEffect(() => {
    const id = setInterval(() => void cargarEstado(), enCurso ? 4_000 : 60_000);
    return () => clearInterval(id);
  }, [enCurso, cargarEstado]);
  useEffect(() => {
    const fecha = estado?.ultimaSync?.fecha || null;
    if (ultimaSyncVista.current && fecha && fecha !== ultimaSyncVista.current) void cargarFilas();
    ultimaSyncVista.current = fecha;
  }, [estado?.ultimaSync?.fecha, cargarFilas]);

  const cambiarConfig = async (cambios: Partial<EstadoSyncRelaciones["config"]>) => {
    if (cambios.activa === true) {
      const r = await sweetAlert.confirm("Activar la sincronización automática", `Todos los días a las ${estado?.config.hora || "06:00"} se leen en ARCA los movimientos del mes de cada empleadora (altas y bajas) y se actualiza la antigüedad. Sólo lee: no presenta nada.`, "Sí, activar", "Cancelar");
      if (!r.isConfirmed) return;
    }
    setGuardando(true);
    try {
      const cfg = await arcaRelacionesAPI.setConfig(cambios);
      setEstado((e) => (e ? { ...e, config: cfg } : e));
      sweetAlert.success("Guardado", cfg.activa ? `Sincroniza sola todos los días a las ${cfg.hora}.` : "La sincronización automática queda apagada.");
    } catch (err: any) {
      sweetAlert.error("No se pudo guardar", err?.response?.data?.error || err?.message || "");
    } finally {
      setGuardando(false);
    }
  };

  const sincronizarAhora = async () => {
    const meses = estado?.config.meses || 1;
    const r = await sweetAlert.confirm("Sincronizar ahora", `Se abre la sesión de ARCA y se leen los movimientos de ${meses === 1 ? "este mes" : `los últimos ${meses} meses`} de cada empleadora. Tarda unos minutos; se puede seguir acá.`, "Sí, sincronizar", "Cancelar");
    if (!r.isConfirmed) return;
    try {
      await arcaRelacionesAPI.sincronizar();
      await cargarEstado();
    } catch (err: any) {
      sweetAlert.error("No arrancó", err?.response?.data?.error || err?.message || "");
    }
  };

  const toggleFila = async (cuil: string) => {
    if (abierta === cuil) { setAbierta(null); return; }
    setAbierta(cuil);
    if (!relaciones[cuil]) {
      setRelaciones((r) => ({ ...r, [cuil]: "cargando" }));
      try {
        const lista = await arcaRelacionesAPI.relacionesDe(cuil);
        setRelaciones((r) => ({ ...r, [cuil]: lista }));
      } catch (err: any) {
        setRelaciones((r) => { const { [cuil]: _x, ...resto } = r; return resto; });
        sweetAlert.error("No se pudieron cargar las relaciones", err?.response?.data?.error || err?.message || "");
      }
    }
  };

  const { ordenados, orden, alternar } = useOrdenTabla(
    filas,
    useMemo(() => ({
      colaborador: (f: AntiguedadFila) => f.apellidoNombre,
      primeraAlta: (f: AntiguedadFila) => f.primeraAlta,
      antiguedad: (f: AntiguedadFila) => f.antiguedadDesdePrimeraAlta.dias,
      trabajados: (f: AntiguedadFila) => f.diasTrabajados,
      contratos: (f: AntiguedadFila) => f.cantidadContratos,
      ultima: (f: AntiguedadFila) => f.ultimaFecha,
    }), []),
    { columna: "colaborador", direccion: "asc", porDefecto: true },
  );

  const ultima = estado?.ultimaSync || null;
  const puedeSincronizar = !!estado && !estado.enCurso && !estado.arcaOcupadaPor && estado.hayCredenciales;

  return (
    <div className="space-y-6">
      {/* La sincronización */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[260px]">
            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              Sincronización con ARCA
              {estado && (
                <label className="inline-flex items-center gap-2 cursor-pointer select-none ml-2" title={estado.config.activa ? "Desactivar la sincronización diaria" : "Activar la sincronización diaria"}>
                  <input type="checkbox" className="sr-only peer" checked={estado.config.activa} disabled={guardando} onChange={(e) => void cambiarConfig({ activa: e.target.checked })} />
                  <span className="relative w-11 h-6 rounded-full bg-gray-300 dark:bg-gray-600 peer-checked:bg-green-600 peer-disabled:opacity-50 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
                  <span className={`text-xs font-semibold ${estado.config.activa ? "text-green-600 dark:text-green-400" : "text-gray-500"}`}>{estado.config.activa ? "Automática" : "Apagada"}</span>
                </label>
              )}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Lee en ARCA los movimientos del mes (altas y bajas) de cada empleadora y recalcula la antigüedad. Sólo lee: no presenta nada.
            </p>
            {estado && (
              <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-gray-600 dark:text-gray-300">
                <label className="flex items-center gap-1.5">
                  Hora
                  <input type="time" className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs" defaultValue={estado.config.hora} key={estado.config.hora} disabled={guardando} onBlur={(e) => { if (e.target.value && e.target.value !== estado.config.hora) void cambiarConfig({ hora: e.target.value }); }} />
                </label>
                <label className="flex items-center gap-1.5">
                  Meses hacia atrás
                  <select className="px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs" value={estado.config.meses} disabled={guardando} onChange={(e) => void cambiarConfig({ meses: Number(e.target.value) })}>
                    {[1, 2, 3, 6, 12].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <span className="text-gray-400">
                  {estado.totales.relaciones.toLocaleString("es-AR")} relaciones · {estado.totales.personas.toLocaleString("es-AR")} personas
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => void sincronizarAhora()}
              disabled={!puedeSincronizar}
              title={!estado?.hayCredenciales ? "Faltan las credenciales de ARCA (Configuración → ARCA → Conexión)" : estado?.arcaOcupadaPor ? `ARCA está ocupada por ${estado.arcaOcupadaPor}` : estado?.enCurso ? "Ya está sincronizando" : "Leer ahora los movimientos en ARCA"}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={estado?.enCurso ? faSpinner : faRotate} spin={!!estado?.enCurso} />
              {estado?.enCurso ? "Sincronizando…" : "Sincronizar ahora"}
            </button>
            {estado?.arcaOcupadaPor && <span className="text-[11px] text-amber-600">ARCA está ocupada por {estado.arcaOcupadaPor}.</span>}
          </div>
        </div>

        {estado?.enCurso && (
          <div className="mt-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-3 text-xs text-blue-900 dark:text-blue-200">
            <p className="font-semibold">En curso desde {fechaHora(estado.enCurso.desde)}{estado.enCurso.automatica ? " (automática)" : ""}</p>
            <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto font-mono">
              {estado.enCurso.progreso.slice(-12).map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}

        {ultima && !estado?.enCurso && (
          <div className="mt-3 text-xs">
            <button type="button" onClick={() => setVerUltima((v) => !v)} className="inline-flex items-center gap-2 text-gray-700 dark:text-gray-200 hover:underline">
              <FontAwesomeIcon icon={verUltima ? faChevronDown : faChevronRight} className="h-3 w-3" />
              <FontAwesomeIcon icon={ultima.error ? faCircleXmark : faCircleCheck} className={ultima.error ? "text-red-500" : "text-green-500"} />
              Última sincronización {hace(ultima.fecha)} ({fechaHora(ultima.fecha)}{ultima.automatica ? ", automática" : ""}) · {ultima.meses.join(", ")} ·{" "}
              {`${ultima.empresas.reduce((s, e) => s + e.nuevas, 0)} nuevas, ${ultima.empresas.reduce((s, e) => s + e.actualizadas, 0)} actualizadas, ${ultima.empresas.reduce((s, e) => s + e.bajasAplicadas, 0)} bajas · ${Math.round(ultima.duracionMs / 1000)} s`}
              {ultima.error && <span className="text-red-600"> · {ultima.error}</span>}
            </button>
            {ultima.htmlGuardado && <p className="mt-1 text-[11px] text-amber-600">Se guardó una pantalla de ARCA para revisar: <code>{ultima.htmlGuardado}</code></p>}
            {verUltima && (
              <table className="mt-2 min-w-[480px] text-xs">
                <thead>
                  <tr>
                    <th className={th}>Empleadora</th>
                    <th className={th}>Meses</th>
                    <th className={th}>Nuevas</th>
                    <th className={th}>Actualizadas</th>
                    <th className={th}>Bajas</th>
                    <th className={th}>Sin cambios</th>
                  </tr>
                </thead>
                <tbody>
                  {ultima.empresas.map((e) => (
                    <tr key={e.cuit} className="border-t border-gray-100 dark:border-gray-800">
                      <td className={td}>{e.razonSocial}{e.error && <p className="text-red-600 text-[11px]">{e.error}</p>}</td>
                      <td className={td}>{e.meses.map((m) => `${m.mes}: ${m.resultado === "sin_datos" ? "sin movimientos" : m.resultado === "ok" ? `${m.filas} filas en ${m.paginas} pág.${m.descartes ? ` (${m.descartes} sin leer)` : ""}` : m.error || "error"}`).join(" · ")}</td>
                      <td className={td}>{e.nuevas}</td>
                      <td className={td}>{e.actualizadas}</td>
                      <td className={td}>{e.bajasAplicadas}</td>
                      <td className={td}>{e.sinCambios}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por apellido o CUIL…"
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm w-72"
        />
        <select value={empresaCuit} onChange={(e) => setEmpresaCuit(e.target.value)} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm">
          <option value="">Todas las empresas (global)</option>
          {empresas.map((e) => <option key={e.cuit} value={e.cuit}>{e.razonSocial}</option>)}
        </select>
        <span className="text-xs text-gray-500">{total.toLocaleString("es-AR")} persona(s)</span>
        <span className="text-[11px] text-gray-400 inline-flex items-center gap-1" title="Antigüedad: días corridos desde la primera alta hasta hoy, con huecos. Trabajados: días de cada relación sumados, sin contar dos veces los que se solapan; una relación abierta cuenta hasta hoy.">
          <FontAwesomeIcon icon={faCircleInfo} /> Antigüedad vs. trabajados
        </span>
      </div>

      {/* La tabla */}
      {cargando ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : filas.length === 0 ? (
        <p className="text-sm text-gray-500 py-10 text-center">
          {estado && estado.totales.relaciones === 0 ? "Todavía no hay relaciones cargadas: corré el seed desde los TXT de Dropbox o «Sincronizar ahora»." : "No hay personas que coincidan."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={th}><BotonOrden columna="colaborador" orden={orden} onAlternar={alternar}>Colaborador</BotonOrden></th>
                {!empresaCuit && <th className={th}>Empresas</th>}
                <th className={th}><BotonOrden columna="primeraAlta" orden={orden} onAlternar={alternar}>Primera alta</BotonOrden></th>
                <th className={th}><BotonOrden columna="antiguedad" orden={orden} onAlternar={alternar}>Antigüedad</BotonOrden></th>
                <th className={th}><BotonOrden columna="trabajados" orden={orden} onAlternar={alternar}>Trabajados</BotonOrden></th>
                <th className={th}><BotonOrden columna="contratos" orden={orden} onAlternar={alternar}># Contratos</BotonOrden></th>
                <th className={th}><BotonOrden columna="ultima" orden={orden} onAlternar={alternar}>Última fecha</BotonOrden></th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((f) => {
                const clave = `${f.cuil}|${f.empleadoraCuit || ""}`;
                const desplegada = abierta === f.cuil;
                const rel = relaciones[f.cuil];
                return (
                  <React.Fragment key={clave}>
                    <tr className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer" onClick={() => void toggleFila(f.cuil)}>
                      <td className={td}>
                        <div className="flex items-center gap-2">
                          <FontAwesomeIcon icon={desplegada ? faChevronDown : faChevronRight} className="h-3 w-3 text-gray-400" />
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{f.apellidoNombre || "—"}</p>
                            <p className="text-xs text-gray-500 font-mono">{fmtCuil(f.cuil)}{f.tieneRelacionAbierta && <span className="ml-2 px-1.5 rounded bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 text-[10px] font-bold uppercase">activa</span>}</p>
                          </div>
                        </div>
                      </td>
                      {!empresaCuit && <td className={`${td} text-xs`}>{f.empresas.map(razonSocialDe).join(" · ")}</td>}
                      <td className={`${td} whitespace-nowrap`}>{fechaCorta(f.primeraAlta)}</td>
                      <td className={`${td} whitespace-nowrap`} title={dias(f.antiguedadDesdePrimeraAlta.dias)}>{anios(f.antiguedadDesdePrimeraAlta.anios)}<span className="block text-[11px] text-gray-400">{dias(f.antiguedadDesdePrimeraAlta.dias)}</span></td>
                      <td className={`${td} whitespace-nowrap`}>{anios(f.aniosTrabajados)}<span className="block text-[11px] text-gray-400">{dias(f.diasTrabajados)}</span></td>
                      <td className={`${td} text-center`}>{f.cantidadContratos}</td>
                      <td className={`${td} whitespace-nowrap`}>{fechaCorta(f.ultimaFecha)}</td>
                    </tr>
                    {desplegada && (
                      <tr className="bg-gray-50 dark:bg-gray-900/40">
                        <td colSpan={empresaCuit ? 6 : 7} className="px-6 py-3">
                          {rel === "cargando" || !rel ? (
                            <span className="text-xs text-gray-500"><FontAwesomeIcon icon={faSpinner} spin /> Cargando relaciones…</span>
                          ) : (
                            <table className="min-w-full text-xs">
                              <thead>
                                <tr>
                                  <th className={th}>Empleadora</th>
                                  <th className={th}>Inicio</th>
                                  <th className={th}>Fin</th>
                                  <th className={th}>Modalidad</th>
                                  <th className={th}>Puesto / Categoría</th>
                                  <th className={th}>Obra social</th>
                                  <th className={th}>Retribución</th>
                                  <th className={th}>Baja</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rel.map((r) => (
                                  <tr key={r._id} className="border-t border-gray-100 dark:border-gray-800 align-top">
                                    <td className="px-4 py-2 whitespace-nowrap">{razonSocialDe(r.empleadoraCuit)}</td>
                                    <td className="px-4 py-2 whitespace-nowrap">{fechaCorta(r.fechaInicio)}</td>
                                    <td className="px-4 py-2 whitespace-nowrap">{r.fechaFin ? fechaCorta(r.fechaFin) : <span className="text-green-600 font-semibold">abierta</span>}</td>
                                    <td className="px-4 py-2 max-w-[220px]">{r.modalidadContrato}</td>
                                    <td className="px-4 py-2 max-w-[260px]">{r.puestoDesempenado}{r.categoria && <span className="block text-gray-500">{r.categoria}</span>}</td>
                                    <td className="px-4 py-2 max-w-[220px]">{r.obraSocial}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-right">{importe(r.retribucionPactada)} <span className="text-gray-400">{r.modLiquidacion}</span></td>
                                    <td className="px-4 py-2 max-w-[220px]">{r.situacionBaja}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
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
    </div>
  );
};

export default AntiguedadArcaTab;

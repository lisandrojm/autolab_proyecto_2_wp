import React, { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faRotate, faSpinner, faCircleCheck, faCircleXmark, faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { arcaRelacionesAPI, type EstadoSyncRelaciones } from "../../api/arcaRelaciones";
import { sweetAlert } from "../../utils/sweetAlert";
import { TablaConEncabezadoFijo } from "../ui/TablaConEncabezadoFijo";
import { SincronizarBajasModal } from "./SincronizarBajasModal";
import { GlosarioArca } from "./GlosarioArca";
import { BajasArcaDespuesDeSincronizar } from "./MovimientosBajasArca";
import { arcaOperacionesAPI, type ListaBajasArca } from "../../api/arcaOperaciones";

/*
  LA SINCRONIZACIÓN CON ARCA, EN UN SOLO COMPONENTE (22/11/2026): cuándo corre sola, cómo le fue la última vez,
  qué trajo y «Sincronizar ahora». Lo usan Documentos › Antigüedad ARCA y Gestión › Bajas ARCA.

  LOS DOS NÚMEROS DE LA BARRA SON COSAS DISTINTAS, y por eso van en dos líneas y en dos tonos:
   - «N para que mire una persona»: el total de la Auditoría ARCA. Es trabajo pendiente.
   - «N altas históricas hechas a mano donde ARCA termina después que el contrato · no requieren acción»: una
     diferencia ya investigada (ver `GlosarioArca`), que no es trabajo de nadie.
  Antes iban sumados en un solo «838 para que mire una persona»: un contador que mezcla las dos cosas no lo mira nadie.

  CUANDO TERMINA UNA SINCRONIZACIÓN CON LA PANTALLA ABIERTA (el caso de «Sincronizar ahora») se vuelve a calcular la
  lista de Bajas ARCA y se muestra qué cambió respecto de la última foto de la corrida automática. La foto NO se
  reemplaza (la guarda sólo la corrida de las 06:00), pero el que aprieta el botón a mano ve qué cambió.
*/

const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const hace = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
};

const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 text-left";
const td = "px-4 py-3 text-sm text-gray-700 dark:text-gray-300";

export const EncabezadoSincronizacionArca: React.FC<{
  /** Cada vez que se lee el estado (la pantalla que lo usa puede necesitarlo). */
  onEstado?: (e: EstadoSyncRelaciones) => void;
  /**
   * Terminó una sincronización con la pantalla abierta: hay que volver a leer lo que dependa del espejo. Llega la
   * lista de Bajas ARCA recién calculada, si se pudo leer (quien la muestra no tiene que pedirla otra vez).
   */
  onSincronizada?: (bajas?: ListaBajasArca) => void;
}> = ({ onEstado, onSincronizada }) => {
  const [estado, setEstado] = useState<EstadoSyncRelaciones | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [verUltima, setVerUltima] = useState(false);
  const [verBajas, setVerBajas] = useState(false);
  const [verGlosario, setVerGlosario] = useState(false);
  const [bajasTrasSync, setBajasTrasSync] = useState<ListaBajasArca | null>(null);
  const ultimaSyncVista = useRef<string | null>(null);
  const alEstado = useRef(onEstado);
  alEstado.current = onEstado;
  const alSincronizar = useRef(onSincronizada);
  alSincronizar.current = onSincronizada;

  const cargarEstado = useCallback(async () => {
    try {
      const e = await arcaRelacionesAPI.estado();
      setEstado(e);
      alEstado.current?.(e);
    } catch (err: any) {
      sweetAlert.error("No se pudo cargar el estado", err?.response?.data?.error || err?.message || "");
    }
  }, []);

  useEffect(() => { void cargarEstado(); }, [cargarEstado]);

  // Mientras hay una sincronización en curso se mira cada 4 s; si no, cada minuto. Al terminar, avisa.
  const enCurso = !!estado?.enCurso;
  useEffect(() => {
    const id = setInterval(() => void cargarEstado(), enCurso ? 4_000 : 60_000);
    return () => clearInterval(id);
  }, [enCurso, cargarEstado]);
  useEffect(() => {
    const fecha = estado?.ultimaSync?.fecha || null;
    if (ultimaSyncVista.current && fecha && fecha !== ultimaSyncVista.current) {
      // La lista de Bajas ARCA con lo que trajo la sincronización, y su diferencia contra la última foto.
      arcaOperacionesAPI
        .lista()
        .then((l) => {
          setBajasTrasSync(l);
          alSincronizar.current?.(l);
        })
        .catch(() => alSincronizar.current?.());
    }
    ultimaSyncVista.current = fecha;
  }, [estado?.ultimaSync?.fecha]);

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

  const ultima = estado?.ultimaSync || null;
  const puedeSincronizar = !!estado && !estado.enCurso && !estado.arcaOcupadaPor && estado.hayCredenciales;
  const bajas = ultima?.bajasContratos;
  const totales = estado?.auditoria?.totales || null;
  const historicas = totales?.historicasArcaPosterior;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      <SincronizarBajasModal isOpen={verBajas} onClose={() => setVerBajas(false)} />
      <GlosarioArca isOpen={verGlosario} onClose={() => setVerGlosario(false)} />
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
              <button type="button" onClick={() => setVerGlosario(true)} className="text-blue-600 dark:text-blue-400 hover:underline">Glosario</button>
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
          {/* Lleva a los CONTRATOS las bajas que el espejo ya tiene (etapa 3, paso 2): no abre ARCA. */}
          <button
            type="button"
            onClick={() => setVerBajas(true)}
            disabled={!!estado?.enCurso}
            title={estado?.enCurso ? "Esperá a que termine la sincronización: las bajas salen del espejo actualizado" : "Escribir en los contratos las bajas que ARCA ya tiene (con misma persona, empleadora y fecha de alta)"}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-blue-600 text-blue-700 dark:text-blue-300 text-sm font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Sincronizar bajas a contratos
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
          {/* Las bajas de ARCA que la corrida automática aplicó sola a los contratos, o frenó por el tope. */}
          {bajas && (
            <p className={`mt-1 text-[11px] font-semibold ${bajas.frenada || bajas.error ? "text-red-600" : "text-gray-600 dark:text-gray-300"}`}>
              {bajas.error
                ? `Bajas de ARCA a contratos: falló (${bajas.error}).`
                : bajas.frenada
                  ? `Bajas de ARCA a contratos: FRENADA. Iban a aplicarse ${bajas.aplicables} y el tope es ${bajas.tope}: no se escribió ninguna. Revisalas en «Sincronizar bajas a contratos».`
                  : `Bajas de ARCA a contratos: ${bajas.aplicadas} aplicadas solas${bajas.excluidasPorEmpleadora ? ` · ${bajas.excluidasPorEmpleadora} sin aplicar por una empleadora con error` : ""}${bajas.cambiaron ? ` · ${bajas.cambiaron} cambiaron en el medio` : ""}`}
            </p>
          )}
          {/* Lo que SÍ es trabajo pendiente: el total de la Auditoría ARCA. */}
          {totales && (
            <p className={`mt-1 text-[11px] font-semibold ${totales.total ? "text-amber-700 dark:text-amber-300" : "text-gray-600 dark:text-gray-300"}`}>
              {totales.total ? `${totales.total.toLocaleString("es-AR")} para que mire una persona` : "Nada para que mire una persona"}
              <span className="font-normal text-gray-500 dark:text-gray-400"> · están en Documentos › Auditoría ARCA</span>
            </p>
          )}
          {/* Y lo que NO lo es, aparte y en otro tono: una diferencia ya investigada. */}
          {!!historicas && (
            <p className="mt-0.5 text-[11px] italic text-gray-400 dark:text-gray-500">
              {historicas.toLocaleString("es-AR")} altas históricas hechas a mano donde ARCA termina después que el contrato · no requieren acción (
              <button type="button" onClick={() => setVerGlosario(true)} className="underline hover:text-gray-600 dark:hover:text-gray-300">ver glosario</button>)
            </p>
          )}
          {verUltima && (
            <TablaConEncabezadoFijo className="mt-2" tabla="min-w-[480px] text-xs">
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
            </TablaConEncabezadoFijo>
          )}
        </div>
      )}
      {bajasTrasSync && (
        <div className="mt-3">
          <BajasArcaDespuesDeSincronizar lista={bajasTrasSync} onCerrar={() => setBajasTrasSync(null)} />
        </div>
      )}
    </div>
  );
};

export default EncabezadoSincronizacionArca;

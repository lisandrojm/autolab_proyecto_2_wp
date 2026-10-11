import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt, faClock, faTriangleExclamation, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { projectsAPI, type AltaPendienteArca, type EstadoPresentacionAutomatica } from "../api/projects";
import { CorridaAltasArca } from "../components/contratos/CorridaAltasArca";
import { sweetAlert } from "../utils/sweetAlert";

/*
  PRESENTACIONES AUTOMÁTICAS A.R.C.A: cada alta temprana se presenta sola a las 14 h (hora argentina)
  del día de su alta. Acá se ve qué va a salir y cuándo —con la cuenta regresiva de cada una—, qué no
  va a salir y por qué, y se puede forzar una para presentarla ya. La corrida la hace el servidor
  (`services/arca/presentacionAutomatica.ts`); esta pantalla sólo la muestra y la prende o apaga.
*/

const fechaCorta = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—");
const fmtCuil = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);

/** Días, horas y minutos que faltan; null si ya pasó. */
const faltan = (destinoMs: number, ahoraMs: number): { d: number; h: number; m: number } | null => {
  const ms = destinoMs - ahoraMs;
  if (ms <= 0) return null;
  const min = Math.floor(ms / 60_000);
  return { d: Math.floor(min / 1440), h: Math.floor((min % 1440) / 60), m: min % 60 };
};

const CuentaRegresiva: React.FC<{ destino: string; ahora: number; grande?: boolean }> = ({ destino, ahora, grande }) => {
  const r = faltan(new Date(destino).getTime(), ahora);
  if (!r) return null;
  const caja = grande ? "min-w-[64px] px-3 py-2" : "min-w-[42px] px-2 py-1";
  const num = grande ? "text-2xl" : "text-sm";
  return (
    <div className="flex items-stretch gap-1.5" aria-label={`Faltan ${r.d} días, ${r.h} horas y ${r.m} minutos`}>
      {[
        [r.d, r.d === 1 ? "día" : "días"],
        [r.h, r.h === 1 ? "hora" : "horas"],
        [r.m, r.m === 1 ? "minuto" : "minutos"],
      ].map(([n, et]) => (
        <div key={String(et)} className={`${caja} rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800 text-center`}>
          <div className={`${num} font-bold tabular-nums text-blue-700 dark:text-blue-300 leading-tight`}>{n}</div>
          <div className="text-[10px] uppercase tracking-wide text-blue-500 dark:text-blue-400">{et}</div>
        </div>
      ))}
    </div>
  );
};

export const PresentacionesArcaPage: React.FC = () => {
  const [estado, setEstado] = useState<EstadoPresentacionAutomatica | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [corridaAbierta, setCorridaAbierta] = useState(false);
  // La hora del SERVIDOR: la cuenta regresiva no puede depender de un reloj de PC atrasado.
  const [desfase, setDesfase] = useState(0);
  const [ahora, setAhora] = useState(Date.now());

  const cargar = useCallback(async () => {
    try {
      const e = await projectsAPI.presentacionAutomatica();
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
    const t = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const ahoraServidor = ahora + desfase;

  const cambiarActiva = async (activa: boolean) => {
    if (activa) {
      const r = await sweetAlert.confirm(
        "Activar la presentación automática",
        `Todos los días a las ${estado?.hora ?? 14} h se van a presentar en ARCA, sin que nadie apriete nada, las altas que empiezan ese día y están completas. No se deshace.`,
        "Sí, activar",
        "Cancelar",
      );
      if (!r.isConfirmed) return;
    }
    setGuardando(true);
    try {
      await projectsAPI.setPresentacionAutomatica(activa);
      await cargar();
    } catch (err: any) {
      sweetAlert.error("No se pudo guardar", err?.response?.data?.error || err?.message || "");
    } finally {
      setGuardando(false);
    }
  };

  const forzar = async (c: AltaPendienteArca) => {
    const antes = estado && c.fechaAlta > estado.hoy;
    const r = await sweetAlert.confirm(
      `Presentar ahora a ${c.nombre}`,
      `${antes ? `Todavía no es el día de la presentación: su alta es el ${fechaCorta(c.fechaAlta)}. ` : ""}Se presenta ya en ARCA, a nombre de ${c.empresa?.razonSocial || "su empleadora"}. No se deshace.`,
      "Sí, presentar",
      "Cancelar",
    );
    if (!r.isConfirmed) return;
    try {
      await projectsAPI.forzarPresentacionArca({ userProjectId: c.userProjectId, contractIndex: c.contractIndex });
      setCorridaAbierta(true);
    } catch (err: any) {
      const d = err?.response?.data;
      const detalle = Array.isArray(d?.detalle) ? d.detalle.map((x: any) => (typeof x === "string" ? x : `${x.etiqueta}: ${x.campo}`)).join(" · ") : "";
      sweetAlert.error("No se presentó", [d?.error || err?.message, detalle].filter(Boolean).join(" "));
    }
  };

  const { proximas, vencidas } = useMemo(() => {
    const lista = estado?.contratos || [];
    const hoy = estado?.hoy || "";
    // Vencidas: su día ya pasó (o hoy ya pasaron las 14 h) y siguen sin presentar.
    const vencida = (c: AltaPendienteArca) => c.fechaAlta < hoy || (c.fechaAlta === hoy && new Date(c.momento).getTime() <= ahoraServidor);
    return { proximas: lista.filter((c) => !vencida(c)), vencidas: lista.filter(vencida) };
  }, [estado, ahoraServidor]);

  const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 text-left";

  const fila = (c: AltaPendienteArca, esVencida: boolean) => (
    <tr key={`${c.userProjectId}-${c.contractIndex}`} className="border-t border-gray-100 dark:border-gray-800 align-top">
      <td className="px-4 py-3">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.nombre}</p>
        <p className="text-xs font-mono text-gray-500">{fmtCuil(c.cuil)}</p>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
        <p>{c.proyecto}</p>
        {c.cliente && <p className="text-xs text-gray-500">{c.cliente}</p>}
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{c.empresa?.razonSocial || "—"}</td>
      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
        <p className="text-sm text-gray-700 dark:text-gray-300">{c.tipoContrato || "—"}</p>
        <p>
          <span className="text-gray-400">Alta:</span> {fechaCorta(c.fechaAlta)} · <span className="text-gray-400">Baja:</span> {fechaCorta(c.fechaBaja)}
        </p>
      </td>
      <td className="px-4 py-3 text-xs max-w-[280px]">
        {c.presentable ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800">
            <FontAwesomeIcon icon={faCircleCheck} className="h-2.5 w-2.5" />
            Lista
          </span>
        ) : (
          <p className="text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{c.motivo}</span>
          </p>
        )}
      </td>
      <td className="px-4 py-3">
        {esVencida ? (
          <span className="text-xs font-semibold text-red-600 dark:text-red-400">{c.fechaAlta === estado?.hoy ? "Hoy, sin presentar" : "Su día pasó sin presentarse"}</span>
        ) : (
          <div className="space-y-1">
            <CuentaRegresiva destino={c.momento} ahora={ahoraServidor} />
            <p className="text-[11px] text-gray-500">
              {fechaCorta(c.fechaAlta)} a las {estado?.hora ?? 14} h{!estado?.activa ? " (si está activada)" : ""}
            </p>
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => forzar(c)}
          disabled={!c.presentable}
          title={c.presentable ? `Presentar ya a ${c.nombre} en ARCA, sin esperar su día` : c.motivo}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          <FontAwesomeIcon icon={faBolt} className="h-3 w-3" />
          Forzar presentación
        </button>
      </td>
    </tr>
  );

  const tabla = (lista: AltaPendienteArca[], esVencida: boolean) => (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <table className="min-w-full">
        <thead>
          <tr>
            <th className={th}>Persona</th>
            <th className={th}>Proyecto</th>
            <th className={th}>Empresa</th>
            <th className={th}>Contrato</th>
            <th className={th}>Estado</th>
            <th className={th}>{esVencida ? "Presentación" : "Se presenta en"}</th>
            <th className={`${th} text-right`}>Acción</th>
          </tr>
        </thead>
        <tbody>{lista.map((c) => fila(c, esVencida))}</tbody>
      </table>
    </div>
  );

  const u = estado?.ultimaCorrida;

  return (
    <PageLayout
      title="Presentaciones Automáticas A.R.C.A"
      subtitle={`Cada alta temprana se presenta sola en ARCA a las ${estado?.hora ?? 14} h del día de su alta.`}
      faIcon={{ icon: faClock }}
      itemCount={estado?.contratos.length ?? 0}
      infoModal={{
        isOpen: ayuda,
        onOpen: () => setAyuda(true),
        onClose: () => setAyuda(false),
        title: "Presentaciones Automáticas A.R.C.A",
        content: (
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <p>Con la automática activada, todos los días a las {estado?.hora ?? 14} h (hora argentina) se presentan en ARCA las altas tempranas que empiezan ese día. Sólo las de ese día.</p>
            <p>Entran los contratos creados en WeProdu (Solicitudes o «Agregar miembro») que están en Alta temprana de ARCA y tienen todos los datos completos. Los que no están completos no se presentan y figuran con su motivo.</p>
            <p>Una persona no tiene dos altas a la vez con la misma empleadora: si ya tiene una presentada que no terminó, la nueva espera.</p>
            <p>
              <strong>Forzar presentación</strong> presenta una ya, sin esperar su día. Lo que se presentó, a mano o solo, queda en el registro de «Alta Temprana A.R.C.A» de Contratos.
            </p>
            <p>Si se activa después de las {estado?.hora ?? 14} h, empieza al día siguiente: las de hoy se fuerzan a mano.</p>
          </div>
        ),
      }}
      shouldShowInfo
    >
      {cargando || !estado ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 flex flex-wrap items-center justify-between gap-6">
            <div className="space-y-2">
              <label className="inline-flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" className="sr-only peer" checked={estado.activa} disabled={guardando} onChange={(e) => cambiarActiva(e.target.checked)} />
                <span className="relative w-11 h-6 rounded-full bg-gray-300 dark:bg-gray-600 peer-checked:bg-green-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Presentación automática {estado.activa ? "activada" : "desactivada"}</span>
              </label>
              {!estado.activa && <p className="text-xs text-amber-700 dark:text-amber-400">Desactivada: no se presenta nada sola. Activala para que cada alta salga a las {estado.hora} h de su día.</p>}
              {estado.enSeco && <p className="text-xs text-gray-500">Este servidor corre en prueba: llega hasta antes de presentar y no manda nada a ARCA.</p>}
            </div>
            {estado.activa && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Próxima presentación</p>
                <CuentaRegresiva destino={estado.proximaCorrida} ahora={ahoraServidor} grande />
                <p className="text-[11px] text-gray-500">
                  {fechaCorta(estado.proximaCorrida.slice(0, 10))} a las {estado.hora} h · {proximas.filter((c) => c.momento === estado.proximaCorrida && c.presentable).length} lista(s) para ese día
                </p>
              </div>
            )}
          </div>

          {u && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Última automática: {fechaCorta(u.dia)} · {new Date(u.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} h
              </p>
              {u.error && <p className="text-xs text-red-600 dark:text-red-400">{u.error}</p>}
              {u.empresas.length === 0 && !u.error && <p className="text-xs text-gray-500">No había altas completas para presentar ese día.</p>}
              {u.empresas.map((e) => (
                <p key={e.empresa} className={`text-xs ${e.error ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-300"}`}>
                  {e.empresa}: {e.error ? e.error : `${e.enviados} enviada(s) a ARCA${e.enSeco ? " (en seco)" : ""}`}
                </p>
              ))}
              {u.omitidos.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  <p className="font-semibold">Sin presentar ({u.omitidos.length}):</p>
                  <ul className="list-disc ml-5">
                    {u.omitidos.map((o, i) => (
                      <li key={`${o.cuil}-${i}`}>
                        {o.nombre}: {o.motivo}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Próximas ({proximas.length})</h2>
            {proximas.length === 0 ? <p className="text-sm text-gray-500">No hay altas por presentar en los próximos días.</p> : tabla(proximas, false)}
          </section>

          {vencidas.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-red-600 dark:text-red-400">Sin presentar ({vencidas.length})</h2>
              <p className="text-xs text-gray-500">Su día ya pasó y siguen sin presentarse (últimos 30 días). La automática no vuelve sobre días anteriores: se presentan con «Forzar».</p>
              {tabla(vencidas, true)}
            </section>
          )}
        </div>
      )}

      {corridaAbierta && (
        <CorridaAltasArca
          isOpen={corridaAbierta}
          onClose={() => {
            setCorridaAbierta(false);
            void cargar();
          }}
          lote={null}
          onTerminado={() => void cargar()}
        />
      )}
    </PageLayout>
  );
};

export default PresentacionesArcaPage;

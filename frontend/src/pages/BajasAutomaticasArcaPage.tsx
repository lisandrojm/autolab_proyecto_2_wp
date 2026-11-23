import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faLock, faRobot, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { sweetAlert } from "../utils/sweetAlert";
import { arcaOperacionesAPI, type CorridaBajasAutomaticas, type EstadoBajasAutomaticas, type ModoBajasAutomaticas } from "../api/arcaOperaciones";

/*
  A.R.C.A BAJAS AUTOMÁTICAS (22/11/2026): PRESENTA EN ARCA LO QUE SE CERRÓ EN WEPRODU. Va en Automatizaciones y
  archivo, al lado de Altas Automáticas y Descargas Automáticas, con la misma estructura: el interruptor (acá, tres
  modos), cuándo corre, la última corrida, el historial y el log. Todo lo decide el server
  (`services/arca/presentacionBajasAutomatica.ts`); acá se elige el modo y se lee.

  NO CONFUNDIR con «Bajas de ARCA a contratos (copia lo que ARCA ya tiene)», que va en el sentido contrario y corre
  antes, en la misma sincronización. En pantalla cada uno dice su sentido.

   - Tres modos: Apagada / Solo simular / Presentar. Los dos últimos tienen un escalón que se ve con candado
     mientras no se cumple: una prueba en seco a mano habilita simular; una baja real confirmada, presentar.
   - No tiene hora propia: corre al final de la sincronización de las 06:00, nunca antes ni suelta.
   - «Qué haría hoy» se calcula con el espejo que hay, sin tocar ARCA.
*/

const MODOS: ModoBajasAutomaticas[] = ["apagada", "simular", "presentar"];
const QUE_HACE: Record<ModoBajasAutomaticas, string> = {
  apagada: "No hace nada. Las bajas se presentan a mano desde Bajas ARCA.",
  simular: "Hace la prueba en seco de cada una (entra a ARCA, completa y cancela) y deja el resultado. No confirma nada.",
  presentar: "Presenta la baja en ARCA con el motivo cargado en el contrato.",
};
const TONO_MODO: Record<ModoBajasAutomaticas, string> = {
  apagada: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  simular: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
  presentar: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
};
const TONO_RESULTADO: Record<string, string> = { presentada: "text-green-700 dark:text-green-400", simulada: "text-blue-700 dark:text-blue-300", sin_confirmar: "text-amber-700 dark:text-amber-400", rechazada: "text-red-600 dark:text-red-400", fallida: "text-red-600 dark:text-red-400" };
const NOMBRE_RESULTADO: Record<string, string> = { presentada: "Presentada", simulada: "Simulada", sin_confirmar: "Sin confirmar", rechazada: "Rechazada por ARCA", fallida: "Falló" };

const fechaHora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : "—");
const fmtCuil = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
const tarjeta = "rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5";
const titulo = "text-sm font-bold uppercase tracking-wide text-gray-500";

const resumenDeCorrida = (c: CorridaBajasAutomaticas) =>
  !c.corrio
    ? "No corrió"
    : `${c.candidatas} candidata${c.candidatas === 1 ? "" : "s"} · ${c.modo === "simular" ? `${c.simuladas} simulada${c.simuladas === 1 ? "" : "s"}` : `${c.presentadas} presentada${c.presentadas === 1 ? "" : "s"}`} · ${c.salteadas.length} salteada${c.salteadas.length === 1 ? "" : "s"}`;

const Salteadas: React.FC<{ salteadas: CorridaBajasAutomaticas["salteadas"] }> = ({ salteadas }) => (
  <ul className="space-y-1">
    {salteadas.map((s) => (
      <li key={`${s.clave}-${s.razon}`} className="text-[11px]">
        <span className="font-semibold text-amber-700 dark:text-amber-400">Salteada</span> <span className="text-gray-900 dark:text-gray-100">{s.persona}</span> <span className="font-mono text-gray-500">{fmtCuil(s.cuil)}</span>{" "}
        <span className="text-gray-500">· {s.empleadora} · situación {s.situacion}:</span> <span className="text-gray-700 dark:text-gray-300">{s.texto}</span>
      </li>
    ))}
  </ul>
);

const DetalleDeCorrida: React.FC<{ c: CorridaBajasAutomaticas }> = ({ c }) => (
  <div className="mt-2 ml-1 space-y-2">
    {c.items.length > 0 && (
      <ul className="space-y-1">
        {c.items.map((i) => (
          <li key={i.clave} className="text-[11px]">
            <span className={`font-semibold ${TONO_RESULTADO[i.resultado] || ""}`}>{NOMBRE_RESULTADO[i.resultado] || i.resultado}</span> <span className="text-gray-900 dark:text-gray-100">{i.persona}</span> <span className="font-mono text-gray-500">{fmtCuil(i.cuil)}</span>{" "}
            <span className="text-gray-500">· {i.empleadora}</span>
            {i.detalle && <span className="text-gray-700 dark:text-gray-300"> · {i.detalle}</span>}
          </li>
        ))}
      </ul>
    )}
    {c.salteadas.length > 0 && <Salteadas salteadas={c.salteadas} />}
    {c.log.length > 0 && (
      <details>
        <summary className="cursor-pointer text-[11px] text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">Log de la corrida</summary>
        <pre className="mt-1 whitespace-pre-wrap rounded bg-gray-50 dark:bg-gray-900/60 p-2 text-[11px] text-gray-700 dark:text-gray-300">{c.log.join("\n")}</pre>
      </details>
    )}
  </div>
);

export const BajasAutomaticasArcaPage: React.FC = () => {
  const [estado, setEstado] = useState<EstadoBajasAutomaticas | null>(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [ayuda, setAyuda] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setError("");
      setEstado(await arcaOperacionesAPI.automatica());
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "No se pudo leer el estado.");
    }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const elegir = async (modo: ModoBajasAutomaticas) => {
    if (!estado || modo === estado.modo || guardando) return;
    if (estado.bloqueos[modo]) {
      sweetAlert.error(`Todavía no se puede elegir «${estado.nombres[modo]}»`, estado.bloqueos[modo]);
      return;
    }
    const texto =
      modo === "presentar"
        ? `Después de cada sincronización automática se van a PRESENTAR EN ARCA, sin que nadie las mire, las bajas de los contratos terminados que tengan el motivo cargado (hasta ${estado.tope} por corrida). Queda registrado que lo prendiste vos.`
        : modo === "simular"
          ? `Después de cada sincronización automática se va a hacer la prueba en seco de cada baja (hasta ${estado.tope} por corrida). No se confirma nada en ARCA. Queda registrado que lo prendiste vos.`
          : "Las bajas vuelven a presentarse sólo a mano, desde Bajas ARCA.";
    const r = await sweetAlert.confirm(`Pasar a «${estado.nombres[modo]}»`, texto, "Sí, cambiar");
    if (!r.isConfirmed) return;
    setGuardando(true);
    try {
      setEstado(await arcaOperacionesAPI.setAutomatica(modo));
    } catch (e: any) {
      sweetAlert.error("No se pudo cambiar el modo", e?.response?.data?.error || e?.message || "");
    } finally {
      setGuardando(false);
    }
  };

  const u = estado?.ultimaCorrida || null;
  const p = estado?.previa;

  return (
    <PageLayout
      title="A.R.C.A Bajas Automáticas"
      subtitle="Presenta en ARCA lo que se cerró en WeProdu: las bajas de los contratos terminados, con el motivo cargado en el contrato."
      faIcon={{ icon: faRobot }}
      infoModal={{
        isOpen: ayuda,
        onOpen: () => setAyuda(true),
        onClose: () => setAyuda(false),
        title: "A.R.C.A Bajas Automáticas",
        size: "md",
        content: (
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <p><strong>Qué presenta:</strong> sólo las relaciones de Bajas ARCA en situación 1 (terminado en WeProdu) y 2 (termina antes de su fecha). Usa el mismo plan y el mismo envío que el panel: no hay otro camino hacia ARCA.</p>
            <p><strong>Qué no presenta nunca:</strong> las situaciones 3, 4, 5 y 6 ni las de botón deshabilitado; las relaciones con modalidad de directores (LRT); los contratos sin motivo de baja, o con renuncia sin fecha de telegrama (nunca elige un motivo por defecto); y nada que el panel rechazaría. Lo que saltea queda listado con el motivo.</p>
            <p><strong>Frenos:</strong> hasta {estado?.tope ?? 5} por corrida (si hay más, no presenta ninguna y avisa); si una queda sin confirmar o ARCA la rechaza, la corrida se corta ahí; no corre con una sincronización en curso.</p>
            <p><strong>Cuándo corre:</strong> al final de la sincronización automática de Relaciones Laborales, nunca antes: necesita el espejo del día. Corre después de «Bajas de ARCA a contratos (copia lo que ARCA ya tiene)», que es el proceso contrario.</p>
            <p><strong>Qué deja:</strong> cada operación en Bajas ARCA › Operaciones, marcada «automática», con la pantalla de ARCA. Y acá, por corrida: candidatas, presentadas, salteadas y por qué.</p>
          </div>
        ),
      }}
      shouldShowInfo
    >
      <div className="space-y-6">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!estado ? (
          !error && <div className="flex justify-center py-16"><LoadingSpinner /></div>
        ) : (
          <>
            {/* EL MODO: el interruptor de esta automatización, con sus dos escalones. */}
            <section className={`${tarjeta} space-y-4`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={titulo}>Modo</h2>
                <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold ${TONO_MODO[estado.modo]}`}>{estado.nombres[estado.modo]}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {MODOS.map((m) => {
                  const elegido = estado.modo === m;
                  const bloqueo = estado.bloqueos[m];
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => void elegir(m)}
                      disabled={guardando}
                      aria-pressed={elegido}
                      title={bloqueo || QUE_HACE[m]}
                      className={`text-left rounded-lg border p-3 transition-colors ${elegido ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/20" : bloqueo ? "border-dashed border-gray-300 dark:border-gray-600 opacity-70 cursor-not-allowed" : "border-gray-200 dark:border-gray-700 hover:border-gray-400"}`}
                    >
                      <span className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                        {bloqueo ? <FontAwesomeIcon icon={faLock} className="h-3 w-3 text-gray-400" /> : elegido ? <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5 text-blue-600" /> : null}
                        {estado.nombres[m]}
                      </span>
                      <span className="mt-1 block text-xs text-gray-600 dark:text-gray-400">{QUE_HACE[m]}</span>
                      {bloqueo && <span className="mt-2 block text-[11px] text-amber-700 dark:text-amber-400">{bloqueo}</span>}
                    </button>
                  );
                })}
              </div>
              {/* Los dos escalones, siempre a la vista. */}
              <ul className="text-xs space-y-1">
                <li className={estado.requisitos.secoManual.cumplido ? "text-green-700 dark:text-green-400" : "text-gray-600 dark:text-gray-400"}>
                  <FontAwesomeIcon icon={estado.requisitos.secoManual.cumplido ? faCircleCheck : faLock} className="h-3 w-3 mr-1.5" />
                  Para simular: una prueba en seco de una baja hecha a mano desde el panel.{" "}
                  {estado.requisitos.secoManual.cumplido ? `Hecha el ${fechaHora(estado.requisitos.secoManual.el)}.` : "Todavía no hay ninguna."}
                </li>
                <li className={estado.requisitos.bajaConfirmada.cumplido ? "text-green-700 dark:text-green-400" : "text-gray-600 dark:text-gray-400"}>
                  <FontAwesomeIcon icon={estado.requisitos.bajaConfirmada.cumplido ? faCircleCheck : faLock} className="h-3 w-3 mr-1.5" />
                  Para presentar: una baja mandada a mano desde el panel y confirmada por la sincronización.{" "}
                  {estado.requisitos.bajaConfirmada.cumplido
                    ? `Confirmada la del ${fechaHora(estado.requisitos.bajaConfirmada.el)}.`
                    : estado.requisitos.bajaConfirmada.pendientesDeSincronizar > 0
                      ? "Hay una mandada; falta que la sincronización la traiga cerrada."
                      : "Todavía no hay ninguna: nunca se confirmó una baja real."}
                </li>
              </ul>
              {estado.enSecoForzado && <p className="text-xs text-amber-700 dark:text-amber-400">Este servidor fuerza la prueba en seco: aunque el modo sea «Presentar», no se confirma nada en ARCA.</p>}
            </section>

            {/* CUÁNDO CORRE: no tiene hora propia, depende de la sincronización. */}
            <section className={`${tarjeta} space-y-1`}>
              <h2 className={titulo}>Cuándo corre</h2>
              <p className="text-sm text-gray-700 dark:text-gray-200">
                Al final de la sincronización automática de Relaciones Laborales{estado.sincronizacion.activa ? <>, todos los días a las <strong>{estado.sincronizacion.hora}</strong></> : null}. Nunca antes: necesita el espejo del día para no presentar algo que ARCA ya tiene.
              </p>
              <p className="text-xs text-gray-500">Corre después de «Bajas de ARCA a contratos (copia lo que ARCA ya tiene)», que va en el sentido contrario. «Sincronizar ahora» no la dispara.</p>
              {!estado.sincronizacion.activa && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 mr-1.5" />
                  La sincronización automática de Relaciones Laborales está desactivada: mientras siga así, esto no corre.
                </p>
              )}
            </section>

            {/* QUÉ HARÍA HOY, con el espejo que hay. No toca ARCA. */}
            {p && (
              <section className={`${tarjeta} space-y-2`}>
                <h2 className={titulo}>Qué haría hoy</h2>
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  <strong>{p.candidatas}</strong> candidata{p.candidatas === 1 ? "" : "s"} (situaciones 1 y 2 de{" "}
                  <Link to="/admin/arca-bajas" className="underline hover:text-gray-900 dark:hover:text-white">Bajas ARCA</Link>): <strong>{p.paraPresentar.length}</strong> para presentar y <strong>{p.salteadas.length}</strong> salteada{p.salteadas.length === 1 ? "" : "s"}.
                </p>
                {p.superaElTope && <p className="text-sm font-semibold text-red-600">Son más que el tope de {estado.tope} por corrida: no presentaría ninguna.</p>}
                {p.paraPresentar.length > 0 && (
                  <ul className="space-y-1">
                    {p.paraPresentar.map((x) => (
                      <li key={x.clave} className="text-[11px]">
                        <span className="font-semibold text-green-700 dark:text-green-400">Para presentar</span> <span className="text-gray-900 dark:text-gray-100">{x.persona}</span> <span className="font-mono text-gray-500">{fmtCuil(x.cuil)}</span>{" "}
                        <span className="text-gray-500">· {x.empleadora} · fin {x.fechaFin.split("-").reverse().join("/")} · motivo {x.motivo}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {p.salteadas.length > 0 && <Salteadas salteadas={p.salteadas} />}
                {estado.modo === "apagada" && p.candidatas > 0 && <p className="text-xs text-gray-500">Está apagada: no va a hacer nada de esto.</p>}
              </section>
            )}

            {/* LA ÚLTIMA CORRIDA */}
            <section className={`${tarjeta} space-y-2`}>
              <h2 className={titulo}>Última corrida</h2>
              {u ? (
                <>
                  <p className="text-sm text-gray-700 dark:text-gray-200">
                    <span className="font-mono text-gray-500">{fechaHora(u.el)}</span> · <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${TONO_MODO[u.modo]}`}>{estado.nombres[u.modo]}</span> · {resumenDeCorrida(u)}
                  </p>
                  {u.aviso && <p className="text-sm font-semibold text-red-600 dark:text-red-400">{u.aviso}</p>}
                  <DetalleDeCorrida c={u} />
                </>
              ) : (
                <p className="text-sm text-gray-500">Todavía no corrió ninguna vez.</p>
              )}
            </section>

            {/* EL HISTORIAL */}
            {estado.corridas.length > 1 && (
              <section className={`${tarjeta} space-y-3`}>
                <h2 className={titulo}>Últimas corridas ({estado.corridas.length})</h2>
                <ul className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {estado.corridas.map((c) => (
                    <li key={c.el} className="py-2">
                      <details>
                        <summary className="cursor-pointer list-none flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <span className="font-mono text-gray-500 whitespace-nowrap">{fechaHora(c.el)}</span>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${TONO_MODO[c.modo]}`}>{estado.nombres[c.modo]}</span>
                          <span className="text-gray-700 dark:text-gray-200">{resumenDeCorrida(c)}</span>
                          {c.aviso && <span className="text-red-600 dark:text-red-400">{c.aviso}</span>}
                        </summary>
                        <DetalleDeCorrida c={c} />
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* QUIÉN CAMBIÓ EL MODO */}
            <section className={`${tarjeta} space-y-2`}>
              <h2 className={titulo}>Quién cambió el modo</h2>
              {estado.cambios.length === 0 ? (
                <p className="text-sm text-gray-500">Nadie la prendió nunca: está apagada desde el principio.</p>
              ) : (
                <ul className="space-y-1 text-xs text-gray-700 dark:text-gray-300">
                  {estado.cambios.map((c) => (
                    <li key={c.el}>
                      <span className="font-mono text-gray-500">{fechaHora(c.el)}</span> · <strong>{c.por.nombre || "(sin nombre)"}</strong> la pasó de «{estado.nombres[c.de]}» a «{estado.nombres[c.a]}»
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default BajasAutomaticasArcaPage;

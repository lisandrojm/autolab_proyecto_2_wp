import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faShieldHeart, faPlay, faUnlock, faCircleCheck, faCircleXmark, faSpinner, faHourglassHalf, faCircle } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { projectsAPI, type ContratoDeValidacionOS, type EstadoValidacionAutomaticaOS, type PendienteValidacionOS } from "../api/projects";
import { sweetAlert } from "../utils/sweetAlert";

/*
  O.S VALIDACIÓN AUTOMÁTICA: qué está esperando que ARCA le valide la obra social, en qué estado está
  cada uno y qué hicieron las últimas corridas automáticas. Es la pantalla que faltaba: la validación
  corría sola (cola al crear el contrato + barrido cada 10 min) sin que nadie pudiera ver si avanzaba,
  y una corrida colgada frenaba todo sin avisar. Desde acá se ve, se fuerza («Validar ahora») y se
  destraba.
*/

const fmtCuil = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
const fechaCorta = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—");
const hace = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
};

/** El contrato en dos líneas: tipo con fechas, y proyecto con estado. */
const Contrato: React.FC<{ c: ContratoDeValidacionOS | null }> = ({ c }) =>
  c ? (
    <div className="text-xs text-gray-600 dark:text-gray-400">
      <p className="text-sm text-gray-800 dark:text-gray-200">{c.tipo || "—"}</p>
      <p>
        <span className="text-gray-400">Alta:</span> {fechaCorta(c.alta)} · <span className="text-gray-400">Baja:</span> {fechaCorta(c.baja)}
      </p>
      <p>
        {c.proyecto && <span>{c.proyecto}</span>}
        {c.estado && <span className="ml-1 px-1 rounded bg-gray-100 dark:bg-gray-800 text-[10px] uppercase font-bold">{c.estado}</span>}
      </p>
      {c.obraSocialActual && <p className="text-[11px] text-gray-500">O.S. actual: {c.obraSocialActual}</p>}
    </div>
  ) : (
    <span className="text-xs text-gray-400">—</span>
  );

const ESTADO: Record<PendienteValidacionOS["estado"], { texto: string; clase: string; icono: any }> = {
  en_corrida: { texto: "Validando ahora", clase: "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300 border-blue-200 dark:border-blue-800", icono: faSpinner },
  en_cola: { texto: "En cola", clase: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 border-amber-200 dark:border-amber-800", icono: faHourglassHalf },
  esperando_reintento: { texto: "Esperando reintento", clase: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 border-amber-200 dark:border-amber-800", icono: faHourglassHalf },
  pendiente: { texto: "Pendiente", clase: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700", icono: faCircle },
};

export const ValidacionObrasSocialesPage: React.FC = () => {
  const [estado, setEstado] = useState<EstadoValidacionAutomaticaOS | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [ayuda, setAyuda] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [abriLaPrimera, setAbriLaPrimera] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setEstado(await projectsAPI.estadoValidacionAutomaticaOS());
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
    if (!abriLaPrimera && estado?.ultimas.length) {
      setAbierta(estado.ultimas[0]._id);
      setAbriLaPrimera(true);
    }
  }, [estado, abriLaPrimera]);
  // Mientras corre, cada 5 s; si no, cada minuto.
  useEffect(() => {
    const t = setInterval(cargar, estado?.corrida?.corriendo ? 5_000 : 60_000);
    return () => clearInterval(t);
  }, [cargar, estado?.corrida?.corriendo]);

  const cambiarActiva = async (activa: boolean) => {
    if (activa) {
      const r = await sweetAlert.confirm("Activar la validación automática", "Cada contrato nuevo valida sola su obra social contra ARCA a los pocos segundos, y un barrido cada 10 minutos reintenta lo que quedó sin validar. Nunca frena el alta.", "Sí, activar", "Cancelar");
      if (!r.isConfirmed) return;
    }
    setOcupado(true);
    try {
      await projectsAPI.setValidacionAutomaticaOS(activa);
      await cargar();
    } catch (err: any) {
      sweetAlert.error("No se pudo guardar", err?.response?.data?.error || err?.message || "");
    } finally {
      setOcupado(false);
    }
  };

  const validarAhora = async () => {
    setOcupado(true);
    try {
      const r = await projectsAPI.validarObrasSocialesAhora();
      const textos: Record<string, string> = {
        arrancada: `Arrancó la corrida con ${r.total} persona(s). Acá abajo se ve cómo avanza.`,
        ocupado: "ARCA está ocupada con otra corrida. Si lleva mucho tiempo sin avanzar, usá «Destrabar».",
        nada: "No hay nadie pendiente.",
        apagada: "La validación automática está apagada: activala arriba.",
        sin_credenciales: "Faltan las credenciales de ARCA (Configuración → ARCA → Conexión).",
        fallo: "No se pudo arrancar. Mirá el detalle en la última corrida.",
      };
      (r.resultado === "arrancada" ? sweetAlert.success : sweetAlert.warningAlert)(r.resultado === "arrancada" ? "Validando" : "No arrancó", textos[r.resultado] || r.resultado);
      await cargar();
    } catch (err: any) {
      sweetAlert.error("No se pudo arrancar", err?.response?.data?.error || err?.message || "");
    } finally {
      setOcupado(false);
    }
  };

  const destrabar = async () => {
    const r = await sweetAlert.confirm("Destrabar la corrida", "Se da por terminada la corrida que quedó colgada y se libera ARCA para la próxima. Lo ya guardado queda guardado.", "Sí, destrabar", "Cancelar");
    if (!r.isConfirmed) return;
    setOcupado(true);
    try {
      const x = await projectsAPI.destrabarValidacionOS();
      sweetAlert.success(x.destrabada ? "Destrabada" : "No había nada que destrabar", x.destrabada ? "ARCA quedó libre. El barrido vuelve a intentar en el próximo minuto, o apretá «Validar ahora»." : "No hay una corrida colgada.");
      await cargar();
    } catch (err: any) {
      sweetAlert.error("No se pudo destrabar", err?.response?.data?.error || err?.message || "");
    } finally {
      setOcupado(false);
    }
  };

  const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 text-left";
  const c = estado?.corrida;

  return (
    <PageLayout
      title="O.S Validación Automática"
      subtitle="Las obras sociales que esperan validarse solas contra ARCA, y cómo van."
      faIcon={{ icon: faShieldHeart }}
      itemCount={estado?.pendientes.length ?? 0}
      infoModal={{
        isOpen: ayuda,
        onOpen: () => setAyuda(true),
        onClose: () => setAyuda(false),
        title: "O.S Validación Automática",
        content: (
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <p>Cuando se crea un contrato —al aprobar una Solicitud o con «Agregar miembro»— la obra social de la persona entra en cola y a los 20 segundos sale una corrida a ARCA con todos los que se crearon seguidos. Nunca frena el alta.</p>
            <p>Cada 10 minutos un barrido toma lo que quedó sin validar en los últimos 30 días y lo vuelve a intentar. A quien ARCA rechazó lo reintenta pasada una hora («Esperando reintento»).</p>
            <p>Una corrida que lleva 20 minutos sin novedades se considera colgada: el barrido la destraba solo, y también se puede destrabar desde acá.</p>
            <p>«Validar ahora» manda ya a todos los pendientes, sin esperar la cola ni el reintento. Los botones de Contratos siguen como reintento por persona.</p>
          </div>
        ),
      }}
      shouldShowInfo
      titleBadge={
        estado && (
          <label className="inline-flex items-center gap-2 cursor-pointer select-none ml-2 shrink-0" title={estado.apagadaPorEntorno ? "Apagada en este servidor por configuración (ARCA_VALIDACION_AUTOMATICA=0)" : estado.activa ? "Desactivar" : "Activar"}>
            <input type="checkbox" className="sr-only peer" checked={estado.activa} disabled={ocupado || estado.apagadaPorEntorno} onChange={(e) => cambiarActiva(e.target.checked)} />
            <span className="relative w-11 h-6 rounded-full bg-gray-300 dark:bg-gray-600 peer-checked:bg-green-600 peer-disabled:opacity-50 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
            <span className={`text-sm font-semibold whitespace-nowrap ${estado.activa ? "text-green-600 dark:text-green-400" : "text-gray-500"}`}>{estado.apagadaPorEntorno ? "Apagada en este servidor" : estado.activa ? "Activada" : "Desactivada"}</span>
          </label>
        )
      }
    >
      {cargando || !estado ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="space-y-6">
          {/* ── Estado general y acciones ── */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
              {!estado.conCredenciales && (
                <p className="text-amber-700 dark:text-amber-400">
                  Faltan las credenciales de ARCA: sin eso no se valida nada. Cargalas en <Link to="/arca/conexion-obras-sociales" className="font-semibold underline">Configuración → ARCA → Conexión</Link>.
                </p>
              )}
              {c?.corriendo ? (
                <p className={c.colgada ? "text-red-600 dark:text-red-400 font-semibold" : "text-blue-700 dark:text-blue-300"}>
                  <FontAwesomeIcon icon={c.colgada ? faCircleXmark : faSpinner} spin={!c.colgada} className="mr-1.5" />
                  {c.colgada ? `Corrida colgada: sin novedades desde ${hace(c.ultimoEventoEl)}. Bloquea a las demás hasta que se destrabe.` : `${c.automatica ? "Corrida automática" : "Corrida manual"} en curso: ${c.hechas}/${c.total}, última novedad ${hace(c.ultimoEventoEl)}.`}
                </p>
              ) : (
                <p>
                  Sin corrida en curso.{estado.enCola > 0 ? ` ${estado.enCola} en cola.` : ""}
                  {estado.esperandoReintento > 0 ? ` ${estado.esperandoReintento} esperando reintento.` : ""} Próximo barrido {hace(estado.proximoBarrido).replace("hace", "en").replace("recién", "en menos de un minuto")}.
                </p>
              )}
              {estado.ultimaCorrida && (
                <p className="text-xs text-gray-500">
                  Última automática {hace(estado.ultimaCorrida.fecha)}: {estado.ultimaCorrida.validadas}/{estado.ultimaCorrida.total} con obra social, {estado.ultimaCorrida.guardadas} guardadas
                  {estado.ultimaCorrida.errores > 0 ? `, ${estado.ultimaCorrida.errores} con error` : ""}
                  {estado.ultimaCorrida.faltaron > 0 ? `, ${estado.ultimaCorrida.faltaron} sin leer` : ""}
                  {estado.ultimaCorrida.motivo ? ` · ${estado.ultimaCorrida.motivo}` : ""}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {c?.corriendo && c.colgada && (
                <button type="button" onClick={destrabar} disabled={ocupado} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                  <FontAwesomeIcon icon={faUnlock} className="h-3.5 w-3.5" />
                  Destrabar
                </button>
              )}
              <button
                type="button"
                onClick={validarAhora}
                disabled={ocupado || estado.pendientes.length === 0 || !!c?.corriendo || !estado.conCredenciales}
                title={c?.corriendo ? "Hay una corrida en curso" : estado.pendientes.length === 0 ? "No hay nadie pendiente" : "Manda ya a todos los pendientes, sin esperar la cola ni el reintento"}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FontAwesomeIcon icon={faPlay} className="h-3.5 w-3.5" />
                Validar ahora ({estado.pendientes.length})
              </button>
            </div>
          </div>

          {/* ── Pendientes ── */}
          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Pendientes ({estado.pendientes.length})</h2>
            {estado.pendientes.length === 0 ? (
              <p className="text-sm text-gray-500">No hay obras sociales sin validar entre los contratos de los últimos 30 días.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className={th}>Colaborador</th>
                      <th className={th}>Empresa</th>
                      <th className={th}>Contrato</th>
                      <th className={th}>Cargado el</th>
                      <th className={th}>Validación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estado.pendientes.map((p) => {
                      const e = ESTADO[p.estado] || ESTADO.pendiente;
                      return (
                        <tr key={`${p.cuil}-${p.empresaId}`} className="border-t border-gray-100 dark:border-gray-800 align-top">
                          <td className="px-4 py-3">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">{p.nombre}</p>
                            <p className="text-xs font-mono text-gray-500">{fmtCuil(p.cuil)}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{p.empresa}</td>
                          <td className="px-4 py-3">
                            <Contrato c={p.contrato ? { ...p.contrato, proyecto: p.contrato.proyecto || p.proyecto } : null} />
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{fechaCorta(p.fechaCarga)}</td>
                          <td className="px-4 py-3 text-xs">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${e.clase}`}>
                              <FontAwesomeIcon icon={e.icono} spin={p.estado === "en_corrida"} className="h-2.5 w-2.5" />
                              {e.texto}
                            </span>
                            {p.detalle && <p className="mt-1 text-gray-500">{p.detalle}</p>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Últimas corridas automáticas ── */}
          <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Últimas corridas automáticas</h2>
            {estado.ultimas.length === 0 ? (
              <p className="text-sm text-gray-500">La automática todavía no corrió ninguna vez en este servidor.</p>
            ) : (
              <ul className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                {estado.ultimas.map((u) => {
                  const ok = !u.error && u.faltaron === 0;
                  const abiertaEsta = abierta === u._id;
                  return (
                    <li key={u._id} className="px-4 py-3">
                      <button type="button" onClick={() => setAbierta(abiertaEsta ? null : u._id)} className="w-full flex items-start justify-between gap-3 text-left">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 dark:text-gray-200 flex items-center gap-2 flex-wrap">
                            <FontAwesomeIcon icon={ok ? faCircleCheck : faCircleXmark} className={`h-3.5 w-3.5 ${ok ? "text-green-500" : "text-red-500"}`} />
                            <span className="font-semibold">{u.empresaRazonSocial || "Empleadora sin nombre"}</span>
                            <span className="text-xs text-gray-500">
                              {u.validadas}/{u.total} con obra social · {u.guardadas} guardadas{u.sinDeclarar > 0 ? ` · ${u.sinDeclarar} sin declarar` : ""}{u.errores > 0 ? ` · ${u.errores} con error` : ""}{u.faltaron > 0 ? ` · ${u.faltaron} sin leer` : ""}
                            </span>
                          </p>
                          {(u.error || u.motivo) && <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">{u.error || u.motivo}</p>}
                        </div>
                        <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">{new Date(u.fecha).toLocaleString("es-AR")}</span>
                      </button>
                      {abiertaEsta && u.detalle.length > 0 && (
                        <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                          <table className="min-w-full">
                            <thead>
                              <tr>
                                <th className={th}>Colaborador</th>
                                <th className={th}>Empresa</th>
                                <th className={th}>Contrato</th>
                                <th className={th}>Resultado en ARCA</th>
                              </tr>
                            </thead>
                            <tbody>
                              {u.detalle.map((d, i) => (
                                <tr key={`${d.cuil}-${i}`} className="border-t border-gray-100 dark:border-gray-800 align-top">
                                  <td className="px-4 py-2">
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{d.nombre || "(sin ficha)"}</p>
                                    <p className="text-xs font-mono text-gray-500">{fmtCuil(d.cuil)}</p>
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{d.empresa || u.empresaRazonSocial}</td>
                                  <td className="px-4 py-2">
                                    <Contrato c={d.contrato} />
                                  </td>
                                  <td className="px-4 py-2 text-xs max-w-[360px]">
                                    {d.error ? (
                                      <span className="text-red-600 dark:text-red-400">{d.error}</span>
                                    ) : d.rnos ? (
                                      <span className="text-green-700 dark:text-green-400">
                                        <span className="font-mono">{d.rnos}</span>
                                        {d.obraSocial ? ` · ${d.obraSocial}` : ""}
                                      </span>
                                    ) : (
                                      <span className="text-gray-500">Sin obra social declarada en ARCA: rige la del convenio.</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </PageLayout>
  );
};

export default ValidacionObrasSocialesPage;

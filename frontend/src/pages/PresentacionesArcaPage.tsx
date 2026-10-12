import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt, faClock, faTriangleExclamation, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Link } from "react-router-dom";
import { projectsAPI, horaTexto, anticipacionTexto, type AltaPendienteArca, type EstadoPresentacionAutomatica, type CorridaAltasGuardada } from "../api/projects";
import { BotonOrden, useOrdenTabla } from "../components/ui/OrdenTabla";
import { CorridaAltasArca } from "../components/contratos/CorridaAltasArca";
import { sweetAlert } from "../utils/sweetAlert";

/*
  A.R.C.A ALTAS AUTOMÁTICAS: cada alta temprana se presenta sola a la hora configurada (14:00 argentinas
  por defecto) del día de su alta, o con la anticipación configurada (Configuración → ARCA → Altas Automáticas). Acá se ve qué va a salir y cuándo —con la cuenta regresiva de cada una—, qué no
  va a salir y por qué, y se puede forzar una para presentarla ya. La corrida la hace el servidor
  (`services/arca/presentacionAutomatica.ts`); esta pantalla sólo la muestra y la prende o apaga.
*/

const fechaCorta = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—");
const fmtCuil = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
/** La fecha argentina de un instante ISO ("DD/MM/AAAA"): la corrida de las 22 h ya es «mañana» en UTC. */
const fechaArgentina = (iso: string) => fechaCorta(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(iso)));

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
  /*
    DOS PESTAÑAS: lo que falta presentar y lo que ya se presentó. El registro es el mismo que abre
    «Alta Temprana A.R.C.A» en Contratos (las corridas guardadas, de todas las empleadoras), aplanado a
    una fila por persona: acá se viene a buscar «¿salió el alta de fulano?», no la corrida.
  */
  const [tab, setTab] = useState<"pendientes" | "presentadas">("pendientes");
  const [corridas, setCorridas] = useState<CorridaAltasGuardada[] | null>(null);
  const [buscar, setBuscar] = useState("");
  // Por defecto, sólo lo que salió solo: es lo que se viene a confirmar («¿se presentó?»). Las manuales y forzadas se ven destildando.
  const [soloAutomaticas, setSoloAutomaticas] = useState(true);
  const cargarRegistro = useCallback(async () => {
    try {
      setCorridas(await projectsAPI.historialAltasArca());
    } catch (err: any) {
      sweetAlert.error("No se pudo cargar el registro", err?.response?.data?.error || err?.message || "");
      setCorridas([]);
    }
  }, []);
  useEffect(() => {
    if (tab === "presentadas" && corridas === null) void cargarRegistro();
  }, [tab, corridas, cargarRegistro]);
  const presentadas = useMemo(() => {
    const filas = (corridas || []).filter((k) => !soloAutomaticas || k.automatica).flatMap((k) =>
      k.contratos.map((x, i) => ({
        clave: `${k._id}-${i}`,
        fecha: k.createdAt,
        nombre: x.nombre,
        cuil: x.cuil,
        empresa: k.empresaRazonSocial,
        resultado: k.enSeco ? "seco" : x.resultado,
        motivo: x.motivo || "",
        quien: k.usuario || "—",
        constancia: x.constancia,
      })),
    );
    const q = buscar.trim().toLowerCase();
    return q ? filas.filter((r) => r.nombre.toLowerCase().includes(q) || r.cuil.includes(q.replace(/\D/g, "")) || r.empresa.toLowerCase().includes(q)) : filas;
  }, [corridas, buscar, soloAutomaticas]);
  const { ordenados: presentadasOrdenadas, orden: ordenRegistro, alternar: alternarRegistro } = useOrdenTabla(
    presentadas,
    { fecha: (r) => r.fecha, persona: (r) => r.nombre, empresa: (r) => r.empresa, resultado: (r) => r.resultado, quien: (r) => r.quien },
    { columna: "fecha", direccion: "desc" },
  );
  const RESULTADO: Record<string, { texto: string; clase: string }> = {
    presentada: { texto: "Presentada", clase: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800" },
    rechazada: { texto: "Rechazada", clase: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800" },
    indeterminado: { texto: "Incierta", clase: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800" },
    pendiente: { texto: "Sin presentar", clase: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700" },
    seco: { texto: "En seco", clase: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700" },
  };
  const CONSTANCIA: Record<string, string> = { outbox: "En el Outbox", no_firmar: "No firmar", sin_subir: "Sin subir" };
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
        `Todos los días a las ${horaTexto(estado?.config)} se van a presentar en ARCA, sin que nadie apriete nada, las altas completas que empiezan ${anticipacionTexto(estado?.config) === "el mismo día del alta" ? "ese día" : "en los próximos días (" + anticipacionTexto(estado?.config) + ")"}. No se deshace.`,
        "Sí, activar",
        "Cancelar",
      );
      if (!r.isConfirmed) return;
    }
    setGuardando(true);
    try {
      await projectsAPI.setPresentacionAutomatica({ activa });
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
    // Fuera de la automática: el servidor no les encontró una próxima corrida (más de 30 días de
    // atraso). Las atrasadas de menos entran solas en la corrida siguiente y van en «Próximas».
    const vencida = (c: AltaPendienteArca) => !c.momento;
    return { proximas: lista.filter((c) => !vencida(c)), vencidas: lista.filter(vencida) };
  }, [estado]);

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
          <span className="text-xs font-semibold text-red-600 dark:text-red-400">
            {c.terminado ? `Ya terminó (baja el ${fechaCorta(c.fechaBaja)}): no tiene sentido dar el alta` : "Más de 30 días de atraso: no entra en la automática"}
          </span>
        ) : (
          <div className="space-y-1">
            <CuentaRegresiva destino={c.momento} ahora={ahoraServidor} />
            <p className="text-[11px] text-gray-500">
              {new Date(c.momento).getTime() <= ahoraServidor ? "En la corrida en curso" : `${fechaArgentina(c.momento)} a las ${horaTexto(estado?.config)}`}
              {!estado?.activa ? " (si está activada)" : ""}
            </p>
            {estado && c.fechaAlta < estado.hoy && (
              <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Atrasada: su alta fue el {fechaCorta(c.fechaAlta)}. Entra en la próxima corrida.</p>
            )}
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
      title="A.R.C.A Altas Automáticas"
      subtitle={`Cada alta temprana se presenta sola en ARCA a las ${horaTexto(estado?.config)}, ${anticipacionTexto(estado?.config)}.`}
      faIcon={{ icon: faClock }}
      itemCount={estado?.contratos.length ?? 0}
      infoModal={{
        isOpen: ayuda,
        onOpen: () => setAyuda(true),
        onClose: () => setAyuda(false),
        title: "A.R.C.A Altas Automáticas",
        content: (
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <p>
              Con la automática activada, todos los días a las {horaTexto(estado?.config)} (hora argentina) se presentan en ARCA las altas tempranas que empiezan ese día
              {estado?.config.diasAntes ? ` o en los próximos ${estado.config.diasAntes} día(s)` : ""}. El horario y la anticipación se cambian en Configuración → ARCA → Altas Automáticas.
            </p>
            <p>Entran los contratos creados en WeProdu (Solicitudes o «Agregar miembro») que están en Alta temprana de ARCA y tienen todos los datos completos. Los que no están completos no se presentan y figuran con su motivo.</p>
            <p>Una persona no tiene dos altas a la vez con la misma empleadora: si ya tiene una presentada que no terminó, la nueva espera.</p>
            <p>
              <strong>Forzar presentación</strong> presenta una ya, sin esperar su día. Lo que se presentó, a mano o solo, queda en el registro de «Alta Temprana A.R.C.A» de Contratos.
            </p>
            <p>
              Las atrasadas también entran: si una corrida falló, o el contrato se cargó después de su fecha de inicio, el alta se presenta en la corrida siguiente y en todas las que vengan hasta
              que salga. Solo las de más de 30 días quedan fuera, para forzar a mano.
            </p>
            <p>
              <strong>Si la baja ya pasó, no se da el alta.</strong> Un contrato cuya fecha de baja es anterior a hoy ya terminó entero: presentar su alta no tiene sentido. Queda en «Fuera de la
              automática» con ese motivo, y tampoco se puede forzar.
            </p>
            <p>Si se activa después de las {horaTexto(estado?.config)}, empieza al día siguiente.</p>
          </div>
        ),
      }}
      shouldShowInfo
      titleBadge={
        estado && (
          // Al lado del título: es lo primero que se decide en esta pantalla.
          <label className="inline-flex items-center gap-2 cursor-pointer select-none ml-2 shrink-0" title={estado.activa ? "Desactivar la presentación automática" : "Activar la presentación automática"}>
            <input type="checkbox" className="sr-only peer" checked={estado.activa} disabled={guardando} onChange={(e) => cambiarActiva(e.target.checked)} />
            <span className="relative w-11 h-6 rounded-full bg-gray-300 dark:bg-gray-600 peer-checked:bg-green-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
            <span className={`text-sm font-semibold whitespace-nowrap ${estado.activa ? "text-green-600 dark:text-green-400" : "text-gray-500"}`}>{estado.activa ? "Activada" : "Desactivada"}</span>
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
          <div className="space-y-1">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              <FontAwesomeIcon icon={faClock} className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
              Todos los días a las <strong>{horaTexto(estado.config)}</strong>, {anticipacionTexto(estado.config)}.{" "}
              <Link to="/arca/altas-automaticas" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold">
                Cambiar horario
              </Link>
            </p>
            {!estado.activa && <p className="text-sm text-amber-700 dark:text-amber-400">Desactivada: no se presenta nada sola. Activala para que cada alta salga a las {horaTexto(estado.config)} de su día.</p>}
            {estado.enSeco && <p className="text-xs text-gray-500">Este servidor corre en prueba: llega hasta antes de presentar y no manda nada a ARCA.</p>}
          </div>

          <div className="flex border-b border-gray-200 dark:border-gray-700">
            {(
              [
                ["pendientes", `Pendientes (${estado.contratos.length})`],
                ["presentadas", `Presentadas${corridas ? ` (${presentadas.length})` : ""}`],
              ] as const
            ).map(([k, etiqueta]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === k ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`}
              >
                {etiqueta}
              </button>
            ))}
          </div>

          {tab === "presentadas" && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por persona, CUIL o empresa…" className="input-field text-sm flex-1 min-w-[240px]" />
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
                  <input type="checkbox" checked={soloAutomaticas} onChange={(e) => setSoloAutomaticas(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  Solo las automáticas
                </label>
                <button type="button" onClick={() => void cargarRegistro()} className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold">
                  Actualizar
                </button>
              </div>
              {corridas === null ? (
                <div className="flex justify-center py-10">
                  <LoadingSpinner />
                </div>
              ) : presentadasOrdenadas.length === 0 ? (
                <p className="text-sm text-gray-500">{buscar ? "Sin resultados para la búsqueda." : soloAutomaticas ? "La automática todavía no presentó ninguna alta. Destildá «Solo las automáticas» para ver las manuales y forzadas." : "Todavía no se presentó ninguna alta por Altas Masivas."}</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className={th}>
                          <BotonOrden columna="fecha" orden={ordenRegistro} onAlternar={alternarRegistro}>
                            Fecha
                          </BotonOrden>
                        </th>
                        <th className={th}>
                          <BotonOrden columna="persona" orden={ordenRegistro} onAlternar={alternarRegistro}>
                            Persona
                          </BotonOrden>
                        </th>
                        <th className={th}>
                          <BotonOrden columna="empresa" orden={ordenRegistro} onAlternar={alternarRegistro}>
                            Empresa
                          </BotonOrden>
                        </th>
                        <th className={th}>
                          <BotonOrden columna="resultado" orden={ordenRegistro} onAlternar={alternarRegistro}>
                            Resultado
                          </BotonOrden>
                        </th>
                        <th className={th}>Constancia</th>
                        <th className={th}>
                          <BotonOrden columna="quien" orden={ordenRegistro} onAlternar={alternarRegistro}>
                            Presentó
                          </BotonOrden>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {presentadasOrdenadas.map((r) => {
                        const res = RESULTADO[r.resultado] || { texto: r.resultado, clase: RESULTADO.pendiente.clase };
                        return (
                          <tr key={r.clave} className="border-t border-gray-100 dark:border-gray-800 align-top">
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                              {new Date(r.fecha).toLocaleDateString("es-AR")} {new Date(r.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">{r.nombre}</p>
                              <p className="text-xs font-mono text-gray-500">{fmtCuil(r.cuil)}</p>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">{r.empresa}</td>
                            <td className="px-4 py-3 text-xs max-w-[280px]">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${res.clase}`}>{res.texto}</span>
                              {r.motivo && <p className="mt-1 text-gray-500">{r.motivo}</p>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                              {r.constancia === undefined ? "—" : r.constancia === null ? "Sin bajar" : CONSTANCIA[r.constancia.destino] || r.constancia.destino}
                              {r.constancia?.validadaEl && <p className="text-[11px] text-gray-400">validada el {fechaCorta(String(r.constancia.validadaEl).slice(0, 10))}</p>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{r.quien}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {tab === "pendientes" && (
            <>
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
              <h2 className="text-sm font-bold uppercase tracking-wide text-red-600 dark:text-red-400">Fuera de la automática ({vencidas.length})</h2>
              <p className="text-xs text-gray-500">
                La automática no las toma: su contrato ya terminó (la baja es anterior a hoy, y un alta de una relación que ya pasó no tiene sentido), o su alta fue hace más de 30 días. Las de más de
                30 días se presentan con «Forzar».
              </p>
              {tabla(vencidas, true)}
            </section>
          )}
            </>
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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt, faClock, faTriangleExclamation, faCircleCheck, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Link } from "react-router-dom";
import { projectsAPI, horaTexto, anticipacionTexto, type AltaPendienteArca, type EstadoPresentacionAutomatica, type CorridaAltasGuardada } from "../api/projects";
import { BotonOrden, useOrdenTabla } from "../components/ui/OrdenTabla";
import { CorridaAltasArca } from "../components/contratos/CorridaAltasArca";
import { CuentaRegresiva } from "../components/ui/CuentaRegresiva";
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

// La cuenta regresiva vive en `components/ui/CuentaRegresiva.tsx`: la comparte con «A.R.C.A Descargas Automáticas».

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
  // Las rechazadas que después salieron (forzadas o en la cola del día siguiente) se ven con su aclaración; este filtro las saca de la vista.
  const [ocultarResueltas, setOcultarResueltas] = useState(false);
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
        presentadaDespues: x.presentadaDespues || null,
      })),
    ).filter((r) => !ocultarResueltas || !r.presentadaDespues);
    const q = buscar.trim().toLowerCase();
    return q ? filas.filter((r) => r.nombre.toLowerCase().includes(q) || r.cuil.includes(q.replace(/\D/g, "")) || r.empresa.toLowerCase().includes(q)) : filas;
  }, [corridas, buscar, soloAutomaticas, ocultarResueltas]);
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

  /*
    FORZAR EN MASA (pedido del 18/10/2026): se tildan filas (o todas las presentables de una tabla) y un
    solo botón las presenta; el server arma una corrida por empleadora, en fila, y acá se sigue como una
    sola. Las que no se pueden presentar no se tildan y, si igual llegan, vuelven como «omitidas».
  */
  const claveDe = (c: AltaPendienteArca) => `${c.userProjectId}:${c.contractIndex}`;
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [forzandoMasivo, setForzandoMasivo] = useState(false);
  const alternarSeleccion = (c: AltaPendienteArca) =>
    setSeleccion((prev) => {
      const s = new Set(prev);
      if (s.has(claveDe(c))) s.delete(claveDe(c));
      else s.add(claveDe(c));
      return s;
    });
  const alternarTodas = (lista: AltaPendienteArca[]) =>
    setSeleccion((prev) => {
      const s = new Set(prev);
      const presentables = lista.filter((c) => c.presentable);
      const todasMarcadas = presentables.length > 0 && presentables.every((c) => s.has(claveDe(c)));
      for (const c of presentables) {
        if (todasMarcadas) s.delete(claveDe(c));
        else s.add(claveDe(c));
      }
      return s;
    });
  const seleccionadas = useMemo(() => (estado?.contratos || []).filter((c) => seleccion.has(claveDe(c)) && c.presentable), [estado, seleccion]);
  const forzarSeleccionadas = async () => {
    if (seleccionadas.length === 0) return;
    const empresas = [...new Set(seleccionadas.map((c) => c.empresa?.razonSocial || "su empleadora"))];
    const avisos = [seleccionadas.some((c) => c.terminado) ? "Algunas ya terminaron (la baja pasó)." : "", seleccionadas.some((c) => c.rechazoDefinitivo || c.agotado) ? "Algunas ya fueron rechazadas por ARCA: si nada cambió, van a rechazarse de nuevo." : ""].filter(Boolean).join(" ");
    const r = await sweetAlert.confirm(
      `Presentar ahora ${seleccionadas.length} alta${seleccionadas.length === 1 ? "" : "s"}`,
      `Se presentan ya en ARCA, a nombre de ${empresas.join(" y ")} (${empresas.length === 1 ? "una corrida" : `${empresas.length} corridas, una por empleadora, en fila`}). ${avisos} No se deshace.`,
      "Sí, presentar",
      "Cancelar",
    );
    if (!r.isConfirmed) return;
    setForzandoMasivo(true);
    try {
      const res = await projectsAPI.forzarPresentacionArcaMasiva(seleccionadas.map((c) => ({ userProjectId: c.userProjectId, contractIndex: c.contractIndex })));
      setSeleccion(new Set());
      setCorridaAbierta(true);
      if (res.omitidas.length > 0) sweetAlert.warning(`${res.omitidas.length} no se presentan`, res.omitidas.map((o) => `${o.nombre}: ${o.motivo}`).join(" · "));
    } catch (err: any) {
      const d = err?.response?.data;
      sweetAlert.error("No se presentaron", [d?.error || err?.message, ...(Array.isArray(d?.omitidas) ? d.omitidas.map((o: any) => `${o.nombre}: ${o.motivo}`) : [])].filter(Boolean).join(" · "));
    } finally {
      setForzandoMasivo(false);
    }
  };

  const forzar = async (c: AltaPendienteArca) => {
    const antes = estado && c.fechaAlta > estado.hoy;
    const r = await sweetAlert.confirm(
      `Presentar ahora a ${c.nombre}`,
      `${antes ? `Todavía no es el día de la presentación: su alta es el ${fechaCorta(c.fechaAlta)}. ` : ""}${c.terminado ? `El contrato ya terminó (baja el ${fechaCorta(c.fechaBaja)}): se declara una relación que ya pasó. ` : ""}${c.rechazoDefinitivo ? `ARCA ya la rechazó («${c.rechazoDefinitivo}»): si nada cambió en ARCA, va a rechazarla de nuevo. ` : c.agotado ? `La automática ya la presentó ${c.intentos} veces y ARCA la rechazó todas: revisá el motivo antes de insistir. ` : ""}Se presenta ya en ARCA, a nombre de ${c.empresa?.razonSocial || "su empleadora"}. No se deshace.`,
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
    <tr key={`${c.userProjectId}-${c.contractIndex}`} className={`border-t border-gray-100 dark:border-gray-800 align-top ${seleccion.has(claveDe(c)) ? "bg-amber-50/60 dark:bg-amber-900/10" : ""}`}>
      <td className="px-3 py-3 w-8">
        <input type="checkbox" className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 disabled:opacity-30" checked={seleccion.has(claveDe(c))} disabled={!c.presentable} onChange={() => alternarSeleccion(c)} title={c.presentable ? "Tildar para forzar en masa" : c.motivo} />
      </td>
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
            {c.rechazoDefinitivo
              ? `ARCA ya la rechazó: ${c.rechazoDefinitivo} La automática no insiste; revisala o forzala`
              : c.agotado
                ? `ARCA la rechazó ${c.intentos} veces${c.primerIntentoEl ? ` (la primera el ${fechaArgentina(c.primerIntentoEl)})` : ""}: la automática no insiste más; revisala o forzala`
                : c.terminado
                  ? `Ya terminó (baja el ${fechaCorta(c.fechaBaja)}): la automática no la toma; se puede forzar`
                  : "Más de 30 días de atraso: no entra en la automática"}
          </span>
        ) : (
          <div className="space-y-1">
            <CuentaRegresiva destino={c.momento} ahora={ahoraServidor} />
            <p className="text-[11px] text-gray-500">
              {new Date(c.momento).getTime() <= ahoraServidor ? "En la corrida en curso" : `${fechaArgentina(c.momento)} a las ${horaTexto(estado?.config)}`}
              {!estado?.activa ? " (si está activada)" : ""}
            </p>
            {/* Rechazada por ARCA en una corrida anterior: vuelve a entrar, hasta el tope de intentos. */}
            {(c.intentos || 0) > 0 ? (
              <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                Rechazada {c.intentos} de {estado?.maxIntentos || 3}: se vuelve a presentar en la próxima corrida.
              </p>
            ) : (
              estado && c.fechaAlta < estado.hoy && <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Atrasada: su alta fue el {fechaCorta(c.fechaAlta)}. Entra en la próxima corrida.</p>
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
            <th className={`${th} w-8`}>
              <input type="checkbox" className="rounded border-gray-300 text-amber-600 focus:ring-amber-500" checked={lista.some((c) => c.presentable) && lista.filter((c) => c.presentable).every((c) => seleccion.has(claveDe(c)))} disabled={!lista.some((c) => c.presentable)} onChange={() => alternarTodas(lista)} title="Tildar todas las que se pueden presentar" />
            </th>
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
              <strong>Una rechazada vuelve al día siguiente, hasta {estado?.maxIntentos || 3} veces.</strong> Si ARCA la rechaza en una corrida automática, entra de nuevo en la siguiente (el dato
              pudo corregirse). Al tercer rechazo la automática deja de insistir y queda en «Fuera de la automática», para revisarla o forzarla. Los rechazos que no cambian por insistir («ya posee
              una relación laboral activa») no se repiten ni una vez.
            </p>
            <p>
              <strong>Si la baja ya pasó, la automática no la presenta.</strong> Un contrato cuya fecha de baja es anterior a hoy ya terminó entero. Queda en «Fuera de la automática» con ese
              motivo, y se puede forzar a mano si igual hace falta declararlo.
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
                <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none" title="Saca de la lista las rechazadas o inciertas cuyo contrato ya se presentó después (forzado o en la cola del día siguiente)">
                  <input type="checkbox" checked={ocultarResueltas} onChange={(e) => setOcultarResueltas(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  Ocultar las que después se presentaron
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
                              {/* No salió en esta corrida, pero el contrato se presentó después: cuándo y quién. */}
                              {r.presentadaDespues && (
                                <p className="mt-1 font-semibold text-green-700 dark:text-green-400 flex items-start gap-1">
                                  <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3 mt-0.5 shrink-0" />
                                  <span>
                                    Presentada después: {new Date(r.presentadaDespues.fecha).toLocaleDateString("es-AR")} {new Date(r.presentadaDespues.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                                    {r.presentadaDespues.automatica ? " · en la corrida automática" : r.presentadaDespues.usuario ? ` · a mano por ${r.presentadaDespues.usuario}` : r.presentadaDespues.via === "carga_masiva" ? " · por Carga Masiva" : ""}
                                  </span>
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                              {r.constancia === undefined ? "—" : r.constancia === null ? "Sin bajar" : CONSTANCIA[r.constancia.destino] || r.constancia.destino}
                              {r.constancia?.validadaEl && <p className="text-[11px] text-gray-400">validada el {fechaCorta(String(r.constancia.validadaEl).slice(0, 10))}</p>}
                              {r.constancia?.origen && <p className="text-[11px] text-gray-500">{r.constancia.origen === "automatica" ? "Bajada automática" : r.constancia.origen === "descarga" ? `Bajada por ${r.constancia.por || "un usuario"}` : `Subida por ${r.constancia.por || "un usuario"}`}</p>}
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

          {seleccionadas.length > 0 && (
            <div className="sticky top-[var(--wp-sticky-top,144px)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-4 py-2.5 shadow-sm">
              <p className="text-sm text-amber-900 dark:text-amber-100">
                <strong>{seleccionadas.length}</strong> alta{seleccionadas.length === 1 ? "" : "s"} tildada{seleccionadas.length === 1 ? "" : "s"} · {[...new Set(seleccionadas.map((c) => c.empresa?.razonSocial || ""))].filter(Boolean).join(", ")}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSeleccion(new Set())} className="text-xs font-semibold text-amber-800 dark:text-amber-200 hover:underline">
                  Destildar
                </button>
                <button type="button" onClick={forzarSeleccionadas} disabled={forzandoMasivo} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap">
                  <FontAwesomeIcon icon={forzandoMasivo ? faSpinner : faBolt} spin={forzandoMasivo} className="h-3 w-3" />
                  Forzar presentación de {seleccionadas.length}
                </button>
              </div>
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
                La automática no las toma: su contrato ya terminó (la baja es anterior a hoy), su alta fue hace más de 30 días, o ARCA ya la rechazó {estado?.maxIntentos || 3} veces. Todas se pueden presentar igual con «Forzar», si hace falta
                declarar una relación que ya pasó.
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

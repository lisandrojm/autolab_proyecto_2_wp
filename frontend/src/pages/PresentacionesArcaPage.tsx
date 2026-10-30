import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt, faClock, faTriangleExclamation, faCircleCheck, faSpinner, faSearch, faXmark, faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { Link } from "react-router-dom";
import { projectsAPI, horaTexto, horarioTexto, frecuenciaTexto, type AltaPendienteArca, type ResumenCorridaAutomatica, type EstadoPresentacionAutomatica, type CorridaAltasGuardada } from "../api/projects";
import { BotonOrden, useOrdenTabla } from "../components/ui/OrdenTabla";
import { CorridaAltasArca } from "../components/contratos/CorridaAltasArca";
import { CuentaRegresiva } from "../components/ui/CuentaRegresiva";
import { sweetAlert } from "../utils/sweetAlert";
import { ProjectTeamPage } from "./ProjectTeamPage";
import { TablaConEncabezadoFijo, useAltoDeBarra } from "../components/ui/TablaConEncabezadoFijo";

/*
  A.R.C.A ALTAS AUTOMÁTICAS: cada alta temprana se presenta sola a la hora configurada (14:00 argentinas
  por defecto) del día de su alta, o con la anticipación configurada (Configuración → ARCA → Altas Automáticas). Acá se ve qué va a salir y cuándo —con la cuenta regresiva de cada una—, qué todavía
  no puede salir y por qué, y se puede forzar una para presentarla ya. Nada queda fuera de la
  automática (pedido del 19/10/2026): terminadas, atrasadas y rechazadas siguen en la cola. La corrida la hace el servidor
  (`services/arca/presentacionAutomatica.ts`); esta pantalla sólo la muestra y la prende o apaga.
*/

const fechaCorta = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—");
const fmtCuil = (c: string) => (c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c);
/** La fecha argentina de un instante ISO ("DD/MM/AAAA"): la corrida de las 22 h ya es «mañana» en UTC. */
/** La hora argentina de un instante ISO ("HH:MM"): en modo frecuente cada alta tiene la suya. */
const horaArgentina = (iso: string) => new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
const diaArgentina = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(iso));
const fechaArgentina = (iso: string) => fechaCorta(diaArgentina(iso));
/** «1 vez» / «3 veces». */
const veces = (n: number) => `${n} ${n === 1 ? "vez" : "veces"}`;

// La cuenta regresiva vive en `components/ui/CuentaRegresiva.tsx`: la comparte con «A.R.C.A Descargas Automáticas».

export const PresentacionesArcaPage: React.FC = () => {
  // La barra de «N altas tildadas» también se pega debajo del header: el encabezado de la tabla va debajo de ella.
  const [barraRef, altoBarra] = useAltoDeBarra();
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
        // El desde/hasta del contrato: distingue dos filas de la misma persona (otro contrato o el mismo reintentado).
        contrato: x.contrato || null,
      })),
    ).filter((r) => !ocultarResueltas || !r.presentadaDespues);
    const q = buscar.trim().toLowerCase();
    // También por las fechas del contrato («25/10/2026»): es lo que distingue dos filas de la misma persona.
    const textoContrato = (r: (typeof filas)[number]) => (r.contrato ? `${fechaCorta(r.contrato.alta)} ${r.contrato.baja ? fechaCorta(r.contrato.baja) : "indeterminado"}` : "");
    return q ? filas.filter((r) => r.nombre.toLowerCase().includes(q) || r.cuil.includes(q.replace(/\D/g, "")) || r.empresa.toLowerCase().includes(q) || textoContrato(r).includes(q)) : filas;
  }, [corridas, buscar, soloAutomaticas, ocultarResueltas]);
  const { ordenados: presentadasOrdenadas, orden: ordenRegistro, alternar: alternarRegistro } = useOrdenTabla(
    presentadas,
    { fecha: (r) => r.fecha, persona: (r) => r.nombre, contrato: (r) => r.contrato?.alta || "", empresa: (r) => r.empresa, resultado: (r) => r.resultado, quien: (r) => r.quien },
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

  // Editar o eliminar un contrato de la cola (pedido del 20/10/2026): el que ARCA rechaza porque ya
  // tiene un alta activa, o al que le falta algo. Editar abre el mismo formulario del equipo, en modal.
  const [editando, setEditando] = useState<AltaPendienteArca | null>(null);
  const [borrando, setBorrando] = useState("");

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
        `Se van a presentar en ARCA, sin que nadie apriete nada, las altas completas: ${horarioTexto(estado?.config)}. No se deshace.`,
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
  // Mientras el forzado en masa sigue, la pantalla se refresca sola: las corridas van saliendo una por una.
  const forzadoEnCurso = !!estado?.forzado && !estado.forzado.terminado;
  useEffect(() => {
    if (!forzadoEnCurso) return;
    const t = setInterval(() => void cargar(), 5000);
    return () => clearInterval(t);
  }, [forzadoEnCurso, cargar]);
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
    const avisos = [seleccionadas.some((c) => c.terminado) ? "Algunas ya terminaron (la baja pasó)." : "", seleccionadas.some((c) => c.rechazoDefinitivo || (c.intentos || 0) > 0) ? "Algunas ya fueron rechazadas por ARCA: si nada cambió, van a rechazarse de nuevo." : ""].filter(Boolean).join(" ");
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
      if (res.arrancada) setCorridaAbierta(true);
      else sweetAlert.error("La corrida no arrancó", res.error || "ARCA no respondió. Mirá el detalle abajo.");
      if (res.omitidas.length > 0) sweetAlert.warning(`${res.omitidas.length} no se presentan`, res.omitidas.map((o) => `${o.nombre}: ${o.motivo}`).join(" · "));
      void cargar();
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
      `${antes ? `Todavía no es el día de la presentación: su alta es el ${fechaCorta(c.fechaAlta)}. ` : ""}${c.terminado ? `El contrato ya terminó (baja el ${fechaCorta(c.fechaBaja)}): se declara una relación que ya pasó. ` : ""}${c.rechazoDefinitivo ? `ARCA ya la rechazó («${c.rechazoDefinitivo}»): si nada cambió en ARCA, va a rechazarla de nuevo. ` : (c.intentos || 0) > 0 ? `ARCA ya la rechazó ${veces(c.intentos || 0)}: revisá el motivo antes de insistir. ` : ""}Se presenta ya en ARCA, a nombre de ${c.empresa?.razonSocial || "su empleadora"}. No se deshace.`,
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

  // Buscador de pendientes (pedido del 18/10/2026): por nombre, CUIL (con o sin guiones), empresa o proyecto. Filtra las dos tablas.
  const [buscarPendientes, setBuscarPendientes] = useState("");
  const proximas = useMemo(() => {
    const q = buscarPendientes.trim().toLowerCase();
    const qDigitos = q.replace(/\D/g, "");
    const coincide = (c: AltaPendienteArca) => !q || c.nombre.toLowerCase().includes(q) || (qDigitos.length > 0 && c.cuil.includes(qDigitos)) || (c.empresa?.razonSocial || "").toLowerCase().includes(q) || c.proyecto.toLowerCase().includes(q);
    // Todas en una sola lista: ya no hay «Fuera de la automática».
    return (estado?.contratos || []).filter(coincide);
  }, [estado, buscarPendientes]);

  const th = "px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap bg-gray-50 dark:bg-gray-900 text-left";

  const fila = (c: AltaPendienteArca) => (
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
        {c.momento ? (
          <div className="space-y-1">
            <CuentaRegresiva destino={c.momento} ahora={ahoraServidor} />
            <p className="text-[11px] text-gray-500">
              {new Date(c.momento).getTime() <= ahoraServidor ? "En la corrida en curso" : `${fechaArgentina(c.momento)} a las ${horaArgentina(c.momento)}`}
              {!estado?.activa ? " (si está activada)" : ""}
            </p>
            {/* Rechazada por ARCA: se retoma al final de la próxima pasada; la del padrón de hoy, mañana. */}
            {(c.intentos || 0) > 0 || c.rechazoDefinitivo ? (
              <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">
                {c.rechazoDefinitivo ? `ARCA la rechazó: ${c.rechazoDefinitivo}` : `Rechazada ${veces(c.intentos || 0)}${c.primerIntentoEl ? ` (la primera el ${fechaArgentina(c.primerIntentoEl)})` : ""}.`}{" "}
                {c.rechazoDefinitivo && c.rechazadaEl && estado && diaArgentina(c.rechazadaEl) === estado.hoy ? "Vuelve a intentarse mañana." : "Se retoma al final de la próxima pasada."}
              </p>
            ) : (
              estado && c.fechaAlta < estado.hoy && <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">Atrasada: su alta fue el {fechaCorta(c.fechaAlta)}. Va en la cola.</p>
            )}
            {(c.envios || 0) > 0 && <p className="text-[11px] text-gray-500">Enviada a ARCA {veces(c.envios || 0)}.</p>}
            {c.terminado && <p className="text-[11px] text-gray-500">Ya terminó (baja el {fechaCorta(c.fechaBaja)}): se declara igual.</p>}
          </div>
        ) : (
          <span className="text-xs text-gray-500">Sin fecha de alta válida</span>
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
        {c.projectId && (
          <div className="mt-2 flex items-center justify-end gap-1">
            <button type="button" onClick={() => setEditando(c)} title="Editar este contrato" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
              <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => eliminar(c)} disabled={!!borrando} title="Eliminar este contrato" className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <FontAwesomeIcon icon={borrando === claveDe(c) ? faSpinner : faTrash} spin={borrando === claveDe(c)} className="h-4 w-4" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );

  const eliminar = async (c: AltaPendienteArca) => {
    if (!c.projectId) return;
    const r = await sweetAlert.confirm(
      "¿Eliminar contrato?",
      `Se eliminará el contrato «${c.tipoContrato || "sin tipo"}» de ${c.nombre} en «${c.proyecto}» (alta ${fechaCorta(c.fechaAlta)}). Sale de la cola y no se presenta. En ARCA no cambia nada. No se puede deshacer.`,
      "Sí, eliminar",
    );
    if (!r.isConfirmed) return;
    setBorrando(claveDe(c));
    try {
      await projectsAPI.deleteMemberContract(c.projectId, c.userId, c.contractIndex);
      sweetAlert.success("Contrato eliminado", `${c.nombre} salió de la cola.`);
      await cargar();
    } catch (err: any) {
      sweetAlert.error("No se pudo eliminar", err?.response?.data?.error || err?.message || "");
    } finally {
      setBorrando("");
    }
  };

  const tabla = (lista: AltaPendienteArca[]) => (
    <TablaConEncabezadoFijo top={`calc(var(--wp-sticky-top, 144px) + ${altoBarra}px)`} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800" tabla="min-w-full">
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
          <th className={th}>Se presenta en</th>
          <th className={`${th} text-right`}>Acción</th>
        </tr>
      </thead>
      <tbody>{lista.map((c) => fila(c))}</tbody>
    </TablaConEncabezadoFijo>
  );

  const u = estado?.ultimaCorrida;
  // Lo que hizo una corrida (la del día o una pasada de la cola): por empresa, y lo que no salió con su motivo.
  const tarjetaCorrida = (titulo: string, r: ResumenCorridaAutomatica | null, vacia: string) => (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-2">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{titulo}</p>
      {r?.error && <p className="text-xs text-red-600 dark:text-red-400">{r.error}</p>}
      {r && r.empresas.length === 0 && !r.error && <p className="text-xs text-gray-500">{vacia}</p>}
      {r?.empresas.map((e, i) => (
        <p key={`${e.empresa}-${i}`} className={`text-xs ${e.error ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-300"}`}>
          {e.empresa}: {e.error ? e.error : `${e.enviados} enviada(s) a ARCA${e.enSeco ? " (en seco)" : ""}`}
        </p>
      ))}
      {r && r.omitidos.length > 0 && (
        <div className="text-xs text-amber-700 dark:text-amber-400">
          <p className="font-semibold">Sin presentar ({r.omitidos.length}):</p>
          <ul className="list-disc ml-5">
            {r.omitidos.map((o, i) => (
              <li key={`${o.cuil}-${i}`}>
                {o.nombre}: {o.motivo}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  return (
    <PageLayout
      title="A.R.C.A Altas Automáticas"
      subtitle={`Cada alta temprana se presenta sola en ARCA: ${horarioTexto(estado?.config)}.`}
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
              Con la automática activada, todos los días a las {horaTexto(estado?.config)} (hora argentina) se presentan en ARCA, primero y en corridas propias, las altas tempranas que empiezan ese día
              {estado?.config.diasAntes ? ` o en los próximos ${estado.config.diasAntes} día(s)` : ""}; después, las pendientes atrasadas.
              {estado?.config.modo === "frecuente" ? ` Además, ${frecuenciaTexto(estado.config.cadaMinutos)} corre la cola de pendientes.` : ""} El horario se cambia en Configuración → ARCA → Altas Automáticas.
            </p>
            <p>Entran los contratos creados en WeProdu (Solicitudes o «Agregar miembro») que están en Alta temprana de ARCA y tienen todos los datos completos. Los que no están completos no se presentan y figuran con su motivo.</p>
            <p>Una persona no tiene dos altas a la vez con la misma empleadora: si ya tiene una presentada que no terminó, la nueva espera.</p>
            <p>
              <strong>Forzar presentación</strong> presenta una ya, sin esperar su día. Lo que se presentó, a mano o solo, queda en el registro de «Alta Temprana A.R.C.A» de Contratos.
            </p>
            <p>
              <strong>Nada queda fuera de la automática.</strong> Las atrasadas de cualquier fecha, los contratos cuya baja ya pasó y las rechazadas por ARCA siguen en la cola hasta que se
              presenten. Una rechazada se vuelve a intentar recién al día siguiente, para no insistir con lo mismo cada pocos minutos.
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
              {horarioTexto(estado.config).replace(/^t/, "T")}.{" "}
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
                <TablaConEncabezadoFijo className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800" tabla="min-w-full">
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
                      {/* Desde → hasta del contrato: sin esto, dos filas de la misma persona (otro contrato, o el
                          mismo reintentado) parecían duplicadas y no se sabía cuál había fallado. */}
                      <th className={th}>
                        <BotonOrden columna="contrato" orden={ordenRegistro} onAlternar={alternarRegistro}>
                          Contrato
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
                          <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap tabular-nums">
                            {r.contrato ? (
                              <>
                                <p>Desde {fechaCorta(r.contrato.alta)}</p>
                                <p className="text-gray-500">Hasta {r.contrato.baja ? fechaCorta(r.contrato.baja) : "indeterminado"}</p>
                              </>
                            ) : (
                              <span className="text-gray-400" title="El contrato ya no está en la ficha de la persona (se borró o se editó)">—</span>
                            )}
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
                            {r.constancia && <p className="text-[11px] text-gray-500">{r.constancia.origen === "automatica" ? "Bajada automática" : r.constancia.origen === "descarga" ? `Bajada por ${r.constancia.por || "un usuario"}` : r.constancia.origen === "subida" ? `Subida por ${r.constancia.por || "un usuario"}` : "Origen sin registrar"}</p>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{r.quien}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </TablaConEncabezadoFijo>
              )}
            </section>
          )}

          {tab === "pendientes" && (
            <>
          {u && tarjetaCorrida(`Última corrida del día: ${fechaCorta(u.dia)} · ${new Date(u.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} h`, u, "No había altas completas para presentar ese día.")}
          {estado.config.modo === "frecuente" &&
            tarjetaCorrida(
              `Cola de pendientes (${frecuenciaTexto(estado.config.cadaMinutos)})${estado.ultimaCorridaCola ? ` · última: ${new Date(estado.ultimaCorridaCola.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} h` : ""}${estado.proximaCola ? ` · próxima: ${horaArgentina(estado.proximaCola)} h` : ""}`,
              estado.ultimaCorridaCola || null,
              "No había pendientes para presentar.",
            )}

          {/* El último forzado en masa: una corrida por empleadora (y por vuelta si alguien tenía dos contratos), con cómo terminó cada una. */}
          {estado?.forzado && (
            <div className={`rounded-xl border px-5 py-4 space-y-1.5 ${estado.forzado.terminado ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800" : "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20"}`}>
              <p className="text-sm font-semibold text-gray-900 dark:text-white inline-flex items-center gap-2">
                {!estado.forzado.terminado && <FontAwesomeIcon icon={faSpinner} spin className="text-amber-600" />}
                Forzado en masa {new Date(estado.forzado.arrancadoEl).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} h · {estado.forzado.total} alta(s) · {estado.forzado.empresas.join(", ")}
                {estado.forzado.terminado ? " · terminado" : ` · ${estado.forzado.resultados.length} de ${estado.forzado.empresas.length} corrida(s) listas`}
              </p>
              {estado.forzado.resultados.map((r, i) => (
                <p key={i} className={`text-xs ${r.error ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-300"}`}>
                  {r.empresa}: {r.error ? r.error : `${r.enviados} enviada(s) a ARCA${r.enSeco ? " (en seco)" : ""}`}
                </p>
              ))}
              {estado.forzado.omitidas.length > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">Sin presentar: {estado.forzado.omitidas.map((o) => `${o.nombre} (${o.motivo})`).join(" · ")}</p>}
              {!estado.forzado.terminado && (
                <button type="button" onClick={() => setCorridaAbierta(true)} className="text-xs font-semibold text-blue-600 hover:underline">
                  Ver la corrida en curso
                </button>
              )}
            </div>
          )}

          {seleccionadas.length > 0 && (
            <div ref={barraRef} className="sticky top-[var(--wp-sticky-top,144px)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 px-4 py-2.5 shadow-sm">
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">En cola ({proximas.length})</h2>
              <div className="relative w-full sm:w-80">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-3.5 w-3.5" />
                <input value={buscarPendientes} onChange={(e) => setBuscarPendientes(e.target.value)} placeholder="Buscar por nombre, CUIL, empresa o proyecto…" className="input-field text-sm pl-9 w-full" />
                {buscarPendientes && (
                  <button type="button" onClick={() => setBuscarPendientes("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" title="Limpiar">
                    <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            {proximas.length === 0 ? <p className="text-sm text-gray-500">{buscarPendientes ? `Ninguna pendiente coincide con «${buscarPendientes}».` : "No hay altas por presentar."}</p> : tabla(proximas)}
          </section>

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
      {editando?.projectId && (
        <ProjectTeamPage
          soloAprobacion={{
            projectId: editando.projectId,
            solicitudId: "",
            editarContrato: { userId: editando.userId, contractIndex: editando.contractIndex },
            onCerrar: () => setEditando(null),
            onAprobada: () => {
              setEditando(null);
              void cargar();
            },
          }}
        />
      )}
    </PageLayout>
  );
};

export default PresentacionesArcaPage;

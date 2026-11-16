import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faBell, faCheck, faCircleCheck, faCircleExclamation, faClockRotateLeft, faDownload, faEdit, faFilePdf, faLock, faPaperPlane, faPlus, faScaleBalanced, faSpinner, faTriangleExclamation, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { campaniasVacacionesAPI, errorDeCampania, type Alerta, type Campania, type EstadoVisible, type Invitacion, type Tablero, type VistaPreviaDeInvitacion } from "../../../api/campaniasVacaciones";
import { vacationConfigAPI, type AvailableContract } from "../../../api/vacationConfig";
import { SelectorTiposContrato } from "./SelectorTiposContrato";
import { sweetAlert } from "../../../utils/sweetAlert";
import { fechaCorta } from "@compartido/planVacaciones/fechas";
import { ETIQUETA_ESTADO, contarDiasTramo, resumenDeInvitables } from "@compartido/vacaciones/campania";
import { TablaConEncabezadoFijo } from "../../ui/TablaConEncabezadoFijo";
import { Modal } from "../../ui/Modal";
import { LoadingSpinner } from "../../ui/LoadingSpinner";
import { getImageUrl } from "../../../utils/imageHelpers";

/**
 * «CAMPAÑA» (Vacaciones, 15/11/2026): la campaña de goce. Lista por temporada y, al abrir una, el tablero
 * de estados por persona con las acciones masivas (invitar, recordar, sugerir y confirmar el tramo único
 * que asigna la empresa, exportar) y, por fila, mover o confirmar la asignación y ver el historial.
 * En borrador se elige a qué tipos de contrato se invita, con la cuenta de a cuántas personas alcanza.
 * La campaña abierta va en la URL (`?campaniaId=`), como el plan por proyecto.
 */

const CLASE_ESTADO: Record<EstadoVisible, string> = {
  pendiente_de_invitar: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  invitado: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  acuso_recibo: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  propuso_fechas: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  rechazada: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  aprobado_notificado: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  vencido_sin_definir: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  asignado_por_empresa_notificado: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  sin_dias_pendientes: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
  en_curso: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  gozado: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
};
const ORDEN_ESTADOS: EstadoVisible[] = ["invitado", "acuso_recibo", "propuso_fechas", "rechazada", "vencido_sin_definir", "aprobado_notificado", "asignado_por_empresa_notificado", "en_curso", "gozado", "sin_dias_pendientes"];
const CLASE_CAMPANIA: Record<Campania["estado"], string> = {
  borrador: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  lanzada: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  cerrada: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};
const TEXTO_CAMPANIA: Record<Campania["estado"], string> = { borrador: "Borrador", lanzada: "Lanzada", cerrada: "Cerrada" };
const TEXTO_STATUS_VAC: Record<string, string> = { pending: "En la jerarquía", pre_approved: "Para aprobar (admin)", approved: "Aprobada", delivered: "Entregada", rejected: "Rechazada", cancelled: "Cancelada" };

const fechaHora = (d?: string | null) => (d ? new Date(d).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const th = "text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap";
const FIN_COL_FIJA = "shadow-[inset_-2px_0_0_0_#d1d5db,4px_0_6px_-4px_rgba(0,0,0,0.25)] dark:shadow-[inset_-2px_0_0_0_#4b5563,4px_0_6px_-4px_rgba(0,0,0,0.5)]";

const Alertas: React.FC<{ alertas: Alerta[] }> = ({ alertas }) =>
  alertas.length === 0 ? null : (
    <div className="space-y-1">
      {alertas.map((a) => (
        <p key={a.codigo} className={`text-sm flex items-start gap-2 ${a.nivel === "error" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
          <FontAwesomeIcon icon={a.nivel === "error" ? faCircleExclamation : faTriangleExclamation} className="mt-0.5" />
          {a.mensaje}
        </p>
      ))}
    </div>
  );

export const CampaniaTab: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const campaniaId = new URLSearchParams(location.search).get("campaniaId") || "";
  const abrir = (id: string) => {
    const q = new URLSearchParams(location.search);
    q.set("tab", "campania");
    if (id) q.set("campaniaId", id);
    else q.delete("campaniaId");
    navigate({ search: `?${q.toString()}` });
  };
  return campaniaId ? <TableroCampania id={campaniaId} onVolver={() => abrir("")} /> : <ListaCampanias onAbrir={abrir} />;
};

/* ─────────────────────────── Lista ─────────────────────────── */

const ListaCampanias: React.FC<{ onAbrir: (id: string) => void }> = ({ onAbrir }) => {
  const [campanias, setCampanias] = useState<Campania[] | null>(null);
  const [creando, setCreando] = useState(false);

  useEffect(() => {
    campaniasVacacionesAPI
      .listar()
      .then(setCampanias)
      .catch((e) => {
        sweetAlert.error("No se pudieron cargar las campañas", errorDeCampania(e));
        setCampanias([]);
      });
  }, []);

  const nueva = async () => {
    const r = await sweetAlert.confirm("¿Crear la campaña de la temporada?", "Se crea en borrador con la ventana de la temporada y los plazos de Configuración › Vacaciones › Campaña de goce. Antes de lanzarla vas a ver las alertas de plazo.", "Crear");
    if (!r.isConfirmed) return;
    setCreando(true);
    try {
      const { campania } = await campaniasVacacionesAPI.crear();
      onAbrir(campania._id);
    } catch (e) {
      sweetAlert.error("No se pudo crear", errorDeCampania(e));
    } finally {
      setCreando(false);
    }
  };

  if (!campanias) return <LoadingSpinner message="Cargando campañas..." />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Cada temporada, la empresa invita a cada persona con días disponibles a elegir sus vacaciones dentro de la ventana anual, con una fecha límite. Si no elige, la empresa le asigna un <strong>tramo único</strong>. En los dos casos queda el aviso por escrito y el acuse de recibo. <strong>Nunca se paga en lugar de gozar.</strong>
          </p>
        </div>
        <button type="button" onClick={nueva} disabled={creando} className="btn-primary inline-flex items-center gap-2">
          <FontAwesomeIcon icon={creando ? faSpinner : faPlus} spin={creando} />
          Nueva campaña
        </button>
      </div>
      {campanias.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center text-sm text-gray-500">Todavía no hay campañas. Activala en Configuración › Vacaciones › Campaña de goce y creá la de esta temporada.</div>
      ) : (
        <TablaConEncabezadoFijo className="rounded border dark:border-slate-800" tabla="w-full dark:bg-slate-800/80 table-auto">
          <thead>
            <tr>
              <th className={th}>Campaña</th>
              <th className={th}>Ventana</th>
              <th className={th}>Estado</th>
              <th className={th}>Fecha límite</th>
              <th className={th}>Otorgadas</th>
            </tr>
          </thead>
          <tbody>
            {campanias.map((c) => (
              <tr key={c._id} onClick={() => onAbrir(c._id)} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                <td className="py-3 px-4 font-medium text-gray-900 dark:text-white">{c.nombre}</td>
                <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {fechaCorta(c.ventanaDesde)} al {fechaCorta(c.ventanaHasta)}
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${CLASE_CAMPANIA[c.estado]}`}>{TEXTO_CAMPANIA[c.estado]}</span>
                </td>
                <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{c.fechaLimite ? fechaCorta(c.fechaLimite) : "—"}</td>
                <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">{c.invitaciones?.total ? `${c.invitaciones.resueltas} de ${c.invitaciones.total}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </TablaConEncabezadoFijo>
      )}
    </div>
  );
};

/* ─────────────────────────── Tablero ─────────────────────────── */

const TableroCampania: React.FC<{ id: string; onVolver: () => void }> = ({ id, onVolver }) => {
  const [datos, setDatos] = useState<Tablero | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<EstadoVisible | "">("");
  const [editando, setEditando] = useState<Invitacion | null>(null);
  const [historial, setHistorial] = useState<Invitacion | null>(null);
  // A quién se invita (sólo en borrador): la selección de tipos y la gente con días por tipo, para la vista previa.
  const [tipos, setTipos] = useState<number[]>([]);
  const [catalogo, setCatalogo] = useState<AvailableContract[]>([]);
  const [previa, setPrevia] = useState<VistaPreviaDeInvitacion | null>(null);
  const [errorPrevia, setErrorPrevia] = useState("");
  const esBorrador = datos?.campania.estado === "borrador";

  useEffect(() => {
    if (!esBorrador) return;
    let vigente = true;
    setPrevia(null);
    setErrorPrevia("");
    Promise.all([campaniasVacacionesAPI.vistaPrevia(id), vacationConfigAPI.getAvailableContracts()])
      .then(([p, contratos]) => {
        if (!vigente) return;
        setPrevia(p);
        setTipos(p.tiposContratoInvitar);
        setCatalogo(contratos.filter((t) => t.id !== null && t.id !== undefined));
      })
      .catch((e) => vigente && setErrorPrevia(errorDeCampania(e)));
    return () => {
      vigente = false;
    };
  }, [id, esBorrador]);

  // Cada cambio se guarda en la campaña; si falla, vuelve a lo que estaba guardado.
  const cambiarTipos = async (nueva: number[]) => {
    const antes = tipos;
    setTipos(nueva);
    try {
      await campaniasVacacionesAPI.guardarTiposContrato(id, nueva);
    } catch (e) {
      setTipos(antes);
      sweetAlert.error("No se pudo guardar la selección", errorDeCampania(e));
    }
  };

  const cargar = useCallback(async () => {
    try {
      setDatos(await campaniasVacacionesAPI.tablero(id));
    } catch (e) {
      sweetAlert.error("No se pudo cargar la campaña", errorDeCampania(e));
    }
  }, [id]);
  useEffect(() => {
    void cargar();
  }, [cargar]);

  const accion = async (clave: string, fn: () => Promise<string | void>) => {
    setOcupado(clave);
    try {
      const mensaje = await fn();
      if (mensaje) sweetAlert.success("Listo", mensaje);
      await cargar();
    } catch (e) {
      sweetAlert.error("No se pudo", errorDeCampania(e));
    } finally {
      setOcupado(null);
    }
  };

  const filas = useMemo(() => (datos?.invitaciones || []).filter((i) => !filtro || i.estadoVisible === filtro), [datos, filtro]);
  if (!datos) return <LoadingSpinner message="Cargando campaña..." />;
  const { campania: c, conteos } = datos;
  const vencidas = datos.invitaciones.filter((i) => i.estado === "vencido_sin_definir");
  const paraConfirmar = vencidas.filter((i) => i.asignacion?.desde && !i.asignacion?.vacationId);

  // Los tipos que no se invitan nunca no cuentan como tildados, aunque hayan quedado guardados.
  const seleccion = previa ? tipos.filter((t) => !previa.deshabilitados.includes(t)) : tipos;
  const resumen = previa ? resumenDeInvitables(previa, seleccion, previa.deshabilitados) : null;
  const nombreDeTipo = (idTipo: number) => catalogo.find((t) => t.id === idTipo)?.name || previa?.porTipo.find((t) => t.id === idTipo)?.nombre || `Tipo ${idTipo}`;
  const textoTipos = seleccion.length ? seleccion.map(nombreDeTipo).join(", ") : "todos los habilitados";

  const lanzar = async () => {
    const r = await sweetAlert.confirm(
      "¿Lanzar la campaña?",
      `Se invita a ${resumen ? `${resumen.invitar} persona(s): ` : ""}cada persona activa con días disponibles del período ${c.anio}${seleccion.length ? ` cuyo contrato vigente en su empresa de cómputo sea ${textoTipos}` : ""}, con fecha límite en ${c.plazoParaDefinirDias} días. Les llega el aviso en la app.`,
      "Lanzar",
    );
    if (!r.isConfirmed) return;
    await accion("lanzar", async () => {
      const res = await campaniasVacacionesAPI.lanzar(c._id, previa ? tipos : undefined);
      if (res.alertas.some((a) => a.nivel === "error")) sweetAlert.warningAlert("Lanzada, con alertas de plazo", res.alertas.map((a) => a.mensaje).join("\n\n"));
      return `Se invitó a ${res.invitadas} persona(s).`;
    });
  };
  const confirmarTodas = async (ids?: string[]) => {
    const n = ids?.length ?? paraConfirmar.length;
    const r = await sweetAlert.confirm(`¿Confirmar ${n === 1 ? "la asignación" : `${n} asignaciones`}?`, "Se otorgan las fechas asignadas (tramo único), sale el aviso por escrito (PDF) y le llega a cada persona para que acuse recibo. Verificá que el aviso llegue con la anticipación configurada.", "Confirmar y notificar");
    if (!r.isConfirmed) return;
    await accion("confirmar", async () => {
      const res = await campaniasVacacionesAPI.confirmarAsignaciones(c._id, ids);
      if (res.fallas.length) sweetAlert.warningAlert(`${res.confirmadas} confirmada(s), ${res.fallas.length} con problemas`, res.fallas.map((f) => `${f.nombre}: ${f.error}`).join("\n\n"));
      else return `${res.confirmadas} asignación(es) confirmada(s) y notificada(s).`;
    });
  };
  const exportar = () =>
    accion("csv", async () => {
      const blob = await campaniasVacacionesAPI.reporte(c._id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campania-vacaciones-${c.anio}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });

  const boton = (clave: string, icono: any, texto: string, onClick: () => void, opciones: { primario?: boolean; disabled?: boolean; title?: string } = {}) => (
    <button type="button" onClick={onClick} disabled={!!ocupado || opciones.disabled} title={opciones.title} className={`${opciones.primario ? "btn-primary" : "btn-secondary"} inline-flex items-center gap-2 disabled:opacity-50`}>
      <FontAwesomeIcon icon={ocupado === clave ? faSpinner : icono} spin={ocupado === clave} />
      {texto}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onVolver} className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" title="Volver a las campañas">
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{c.nombre}</h3>
        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${CLASE_CAMPANIA[c.estado]}`}>{TEXTO_CAMPANIA[c.estado]}</span>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Ventana {fechaCorta(c.ventanaDesde)} al {fechaCorta(c.ventanaHasta)} · aviso {c.avisoMinimoDias} días · tramo mínimo {c.minDiasPorTramo} · {c.fechaLimite ? `elegir hasta el ${fechaCorta(c.fechaLimite)}` : `plazo ${c.plazoParaDefinirDias} días desde el lanzamiento`}
        </span>
      </div>

      {/* Con qué tipos de contrato se lanzó: queda escrito en la campaña. */}
      {c.estado !== "borrador" && c.lanzamiento && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          <span className="font-semibold text-gray-800 dark:text-gray-200">Tipos:</span> {c.lanzamiento.todosLosTipos ? "todos los habilitados" : ""}
          {c.lanzamiento.tipos.length > 0 && (c.lanzamiento.todosLosTipos ? ` (${c.lanzamiento.tipos.map((t) => t.nombre || `Tipo ${t.id}`).join(", ")})` : c.lanzamiento.tipos.map((t) => t.nombre || `Tipo ${t.id}`).join(", "))}
          {!c.lanzamiento.todosLosTipos && c.lanzamiento.tipos.length === 0 && "—"}
          {c.lanzamiento.excluidas.tipoNoIncluido + c.lanzamiento.excluidas.tipoDeshabilitado + c.lanzamiento.excluidas.sinContrato > 0 && (
            <span className="text-xs text-gray-500">
              {" "}
              · con días y sin invitar: {[c.lanzamiento.excluidas.tipoNoIncluido && `${c.lanzamiento.excluidas.tipoNoIncluido} de otro tipo de contrato`, c.lanzamiento.excluidas.tipoDeshabilitado && `${c.lanzamiento.excluidas.tipoDeshabilitado} de un tipo sin vacaciones`, c.lanzamiento.excluidas.sinContrato && `${c.lanzamiento.excluidas.sinContrato} sin contrato vigente en su empresa de cómputo`].filter(Boolean).join(", ")}
            </span>
          )}
        </p>
      )}

      {datos.alertas.length > 0 && (
        <div className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3">
          <Alertas alertas={datos.alertas} />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {c.estado === "borrador" && boton("lanzar", faPaperPlane, resumen ? `Lanzar e invitar a ${resumen.invitar}` : "Lanzar e invitar", lanzar, { primario: true, disabled: !!resumen && resumen.invitar === 0, title: resumen && resumen.invitar === 0 ? "Con esta selección no se invitaría a nadie" : undefined })}
        {c.estado === "lanzada" && (
          <>
            {boton("recordar", faBell, "Recordatorio", () => accion("recordar", async () => `Se le recordó a ${(await campaniasVacacionesAPI.recordatorio(c._id)).recordadas} persona(s).`), { title: "A quienes todavía no propusieron fechas" })}
            {boton("sugerir", faWandMagicSparkles, `Sugerir asignaciones${vencidas.length ? ` (${vencidas.length})` : ""}`, () => accion("sugerir", async () => `Se sugirió el tramo único a ${(await campaniasVacacionesAPI.sugerirAsignaciones(c._id)).sugeridas} persona(s).`), { disabled: vencidas.length === 0, title: "Para quienes vencieron sin elegir" })}
            {boton("confirmar", faCheck, `Confirmar asignaciones${paraConfirmar.length ? ` (${paraConfirmar.length})` : ""}`, () => confirmarTodas(), { primario: true, disabled: paraConfirmar.length === 0 })}
          </>
        )}
        {boton("csv", faDownload, "Exportar CSV", exportar, { disabled: datos.invitaciones.length === 0 })}
        {c.estado === "lanzada" &&
          boton("cerrar", faLock, "Cerrar campaña", async () => {
            const r = await sweetAlert.confirm("¿Cerrar la campaña?", "Sólo se cierra si todas las personas tienen sus vacaciones otorgadas y notificadas (o no les quedan días).", "Cerrar");
            if (r.isConfirmed) await accion("cerrar", async () => void (await campaniasVacacionesAPI.cerrar(c._id)));
          })}
      </div>

      {/* Cuántas hay en cada estado; tocar una filtra la tabla. */}
      {datos.invitaciones.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFiltro("")} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${!filtro ? "border-blue-500 ring-2 ring-blue-500/20" : "border-gray-200 dark:border-gray-700"} text-gray-700 dark:text-gray-200`}>
            Todas · {datos.invitaciones.length}
          </button>
          {ORDEN_ESTADOS.filter((e) => conteos[e]).map((e) => (
            <button key={e} type="button" onClick={() => setFiltro(filtro === e ? "" : e)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${CLASE_ESTADO[e]} ${filtro === e ? "ring-2 ring-blue-500/40" : ""}`}>
              {ETIQUETA_ESTADO[e]} · {conteos[e]}
            </button>
          ))}
        </div>
      )}

      {c.estado === "borrador" ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <FontAwesomeIcon icon={faScaleBalanced} className="text-gray-400" /> A quién se invita
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              A cada persona activa con días disponibles del período {c.anio}. Podés limitarlo por tipo de contrato: se mira el <strong>contrato vigente en su empresa de cómputo</strong> (la empleadora de la que sale su antigüedad); si ahí tiene varios, el de alta más reciente.
            </p>
          </div>
          {errorPrevia ? (
            <p className="text-sm text-red-700 dark:text-red-400">No se pudo calcular a quién se invitaría: {errorPrevia}</p>
          ) : !previa || !resumen ? (
            <LoadingSpinner message="Cargando datos..." />
          ) : (
            <>
              <SelectorTiposContrato tipos={catalogo} deshabilitados={previa.deshabilitados} seleccion={seleccion} onChange={cambiarTipos} personas={Object.fromEntries(previa.porTipo.map((t) => [t.id, t.personas]))} disabled={!!ocupado} />
              <p className={`text-sm ${resumen.invitar > 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                Con esta selección se invitaría a <strong>{resumen.invitar}</strong> persona{resumen.invitar === 1 ? "" : "s"}.
              </p>
              {resumen.tipoNoIncluido + resumen.tipoDeshabilitado + resumen.sinContrato > 0 && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Tienen días y quedan afuera: {[resumen.tipoNoIncluido && `${resumen.tipoNoIncluido} con un tipo de contrato no tildado`, resumen.tipoDeshabilitado && `${resumen.tipoDeshabilitado} con un tipo sin vacaciones (Visibilidad por tipo de Contrato)`, resumen.sinContrato && `${resumen.sinContrato} sin contrato vigente en su empresa de cómputo`].filter(Boolean).join(" · ")}.
                </p>
              )}
              <p className="text-xs text-gray-500 dark:text-gray-400">Revisá antes las alertas de plazo. La cuenta es de este momento: al lanzar se vuelve a hacer con los contratos y los días de ese día.</p>
            </>
          )}
        </div>
      ) : (
        <TablaConEncabezadoFijo sinExportar className="rounded border dark:border-slate-800" tabla="w-full dark:bg-slate-800/80 table-auto">
          <thead>
            <tr>
              <th className={`${th} sticky -left-px z-[15] bg-white dark:bg-gray-800 ${FIN_COL_FIJA}`}>Colaborador</th>
              <th className={th}>Días</th>
              <th className={th}>Estado</th>
              <th className={th}>Acuse invitación</th>
              <th className={th}>Fechas</th>
              <th className={th}>Aviso escrito</th>
              <th className={th}>Acuse aviso</th>
              <th className={`col-acciones ${th}`}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((i) => (
              <tr key={i._id} className="group border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 align-top">
                <td className={`py-3 px-4 sticky -left-px z-[5] bg-white dark:bg-[#1b2637] group-hover:bg-gray-50 dark:group-hover:bg-[#293344] ${FIN_COL_FIJA}`}>
                  <p className="font-medium text-gray-900 dark:text-white text-sm whitespace-nowrap">{i.nombre}</p>
                  {i.alertas.map((a) => (
                    <p key={a.codigo} className={`mt-1 text-[11px] flex items-start gap-1 max-w-[16rem] ${a.nivel === "error" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                      <FontAwesomeIcon icon={a.nivel === "error" ? faCircleExclamation : faTriangleExclamation} className="mt-0.5" />
                      {a.mensaje}
                    </p>
                  ))}
                </td>
                <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{i.asignacion?.dias || i.diasDisponibles}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap ${CLASE_ESTADO[i.estadoVisible]}`}>{i.etiquetaEstado}</span>
                  {i.rechazo?.motivo && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400 max-w-[14rem]">{i.rechazo.motivo}</p>}
                  <p className="mt-1 text-[11px] text-gray-400 whitespace-nowrap">Límite {fechaCorta(i.fechaLimite)}</p>
                </td>
                <td className="py-3 px-4 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{i.acuseInvitacionAt ? fechaHora(i.acuseInvitacionAt) : <span className="text-gray-400">—</span>}</td>
                <td className="py-3 px-4 text-xs text-gray-700 dark:text-gray-300">
                  {i.tramos.length > 0 &&
                    i.tramos.map((t, k) => (
                      <p key={k} className="whitespace-nowrap">
                        {fechaCorta(t.desde)} al {fechaCorta(t.hasta)} ({t.dias} d){t.vacacion ? <span className="text-gray-400"> · {TEXTO_STATUS_VAC[t.vacacion.status] || t.vacacion.status}</span> : null}
                      </p>
                    ))}
                  {i.asignacion && (
                    <div className="mt-0.5">
                      {i.asignacion.desde ? (
                        <p className="whitespace-nowrap">
                          <span className="text-orange-600 dark:text-orange-400 font-semibold">{i.asignacion.vacationId ? "Asignado" : "Sugerido"}:</span> {fechaCorta(i.asignacion.desde)} al {fechaCorta(i.asignacion.hasta)} ({i.asignacion.dias} d)
                        </p>
                      ) : null}
                      {i.asignacion.problema && <p className="text-red-600 dark:text-red-400 max-w-[16rem]">{i.asignacion.problema}</p>}
                    </div>
                  )}
                  {i.tramos.length === 0 && !i.asignacion && <span className="text-gray-400">—</span>}
                </td>
                <td className="py-3 px-4 text-xs text-gray-600 dark:text-gray-400">
                  {i.notificacion ? (
                    <div className="space-y-1">
                      <p className="whitespace-nowrap">{fechaHora(i.notificacion.enviadaAt)}</p>
                      {i.notificacion.pdfUrls.map((u, k) => (
                        <a key={k} href={getImageUrl(u)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-600 hover:underline mr-2">
                          <FontAwesomeIcon icon={faFilePdf} /> PDF{i.notificacion!.pdfUrls.length > 1 ? ` ${k + 1}` : ""}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="py-3 px-4 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">{i.acuseOtorgamientoAt ? <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400"><FontAwesomeIcon icon={faCircleCheck} /> {fechaHora(i.acuseOtorgamientoAt)}</span> : <span className="text-gray-400">—</span>}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-center gap-2">
                    {i.estado === "vencido_sin_definir" && c.estado === "lanzada" && (
                      <>
                        <button type="button" onClick={() => setEditando(i)} disabled={!!ocupado} className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40" title="Mover las fechas asignadas">
                          <FontAwesomeIcon icon={faEdit} className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => confirmarTodas([i._id])} disabled={!!ocupado || !i.asignacion?.desde} className="h-8 w-8 rounded flex items-center justify-center bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50 disabled:opacity-40" title={i.asignacion?.desde ? "Confirmar y notificar" : "Primero sugerí o cargá las fechas"}>
                          <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    <button type="button" onClick={() => setHistorial(i)} className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" title="Historial (quién, cuándo, qué)">
                      <FontAwesomeIcon icon={faClockRotateLeft} className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TablaConEncabezadoFijo>
      )}

      {editando && <ModalAsignacion campania={c} invitacion={editando} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); void cargar(); }} />}
      {historial && (
        <Modal isOpen onClose={() => setHistorial(null)} title={`Historial · ${historial.nombre}`} subtitle="Respaldo de cada paso: quién, cuándo y qué" size="lg">
          <div className="space-y-2">
            {[...historial.historial].reverse().map((h, k) => (
              <div key={k} className="rounded border border-gray-200 dark:border-gray-700 p-2.5 text-sm">
                <p className="text-xs text-gray-500">{fechaHora(h.at)} · {h.accion.replace(/_/g, " ")}</p>
                {h.detalle && <p className="text-gray-800 dark:text-gray-200">{h.detalle}</p>}
              </div>
            ))}
            {historial.notificacion?.texto && (
              <div className="rounded border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-3 text-sm text-blue-900 dark:text-blue-100">
                <p className="text-xs font-semibold mb-1">Texto del aviso por escrito</p>
                {historial.notificacion.texto}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

/** Mover el tramo único: misma cantidad de días, dentro de la ventana y con el aviso. */
const ModalAsignacion: React.FC<{ campania: Campania; invitacion: Invitacion; onCerrar: () => void; onGuardado: () => void }> = ({ campania, invitacion, onCerrar, onGuardado }) => {
  const [desde, setDesde] = useState(invitacion.asignacion?.desde || "");
  const [hasta, setHasta] = useState(invitacion.asignacion?.hasta || "");
  const [guardando, setGuardando] = useState(false);
  const dias = invitacion.asignacion?.dias || invitacion.diasDisponibles;
  const tiene = desde && hasta && hasta >= desde ? contarDiasTramo({ desde, hasta }, invitacion.diasCorridos) : 0;
  const guardar = async () => {
    setGuardando(true);
    try {
      await campaniasVacacionesAPI.editarAsignacion(campania._id, invitacion._id, { desde, hasta });
      sweetAlert.success("Guardado", "Fechas asignadas actualizadas. Falta confirmarlas para notificar.");
      onGuardado();
    } catch (e) {
      sweetAlert.error("No se pudo guardar", errorDeCampania(e));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onCerrar}
      title={`Asignar fechas · ${invitacion.nombre}`}
      subtitle={`Un tramo único de ${dias} días ${invitacion.diasCorridos ? "corridos" : "hábiles"} (la empresa no fracciona sin acuerdo)`}
      size="md"
      footer={
        <>
          <button type="button" onClick={onCerrar} className="btn-secondary">
            Cancelar
          </button>
          <button type="button" onClick={guardar} disabled={guardando || tiene !== dias} className="btn-primary disabled:opacity-50">
            {guardando ? "Guardando..." : "Guardar"}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-gray-600 dark:text-gray-400 mb-1">Desde</span>
            <input type="date" value={desde} min={campania.ventanaDesde} max={campania.ventanaHasta} onChange={(e) => setDesde(e.target.value)} className="input-field" />
          </label>
          <label className="text-sm">
            <span className="block text-gray-600 dark:text-gray-400 mb-1">Hasta</span>
            <input type="date" value={hasta} min={desde || campania.ventanaDesde} max={campania.ventanaHasta} onChange={(e) => setHasta(e.target.value)} className="input-field" />
          </label>
        </div>
        <p className={`text-sm ${tiene === dias ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
          {tiene ? `${tiene} de ${dias} días` : `Elegí el tramo: tiene que tener ${dias} días.`}
        </p>
        <p className="text-xs text-gray-500">Ventana {fechaCorta(campania.ventanaDesde)} al {fechaCorta(campania.ventanaHasta)}. El inicio tiene que estar al menos {campania.avisoMinimoDias} días después de la fecha en que se confirme (el aviso por escrito sale ese día).</p>
      </div>
    </Modal>
  );
};

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faBell, faBriefcase, faCheck, faCircleCheck, faCircleExclamation, faClockRotateLeft, faDownload, faEdit, faEye, faFilePdf, faLock, faPaperPlane, faPlus, faScaleBalanced, faSpinner, faTriangleExclamation, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { campaniasVacacionesAPI, errorDeCampania, type Alerta, type Campania, type CambioDeTipos, type EstadoVisible, type Invitacion, type Tablero, type VistaPreviaDeInvitacion } from "../../../api/campaniasVacaciones";
import { vacationConfigAPI, type TipoContratoVacaciones } from "../../../api/vacationConfig";
import { SelectorTiposContrato } from "./SelectorTiposContrato";
import { SelectorDiasDeInicio } from "./SelectorDiasDeInicio";
import { sweetAlert } from "../../../utils/sweetAlert";
import { fechaCorta, sumarDias } from "@compartido/planVacaciones/fechas";
import { ETIQUETA_ESTADO, PUEDE_PROPONER, TEXTO_MOTIVO_NO_INVITAR, contarDiasTramo, estadoDelTurno, normalizarDiasDeInicio, normalizarTiposContrato, resumenDeInvitables, textoDiasDeInicio } from "@compartido/vacaciones/campania";
import { TablaConEncabezadoFijo } from "../../ui/TablaConEncabezadoFijo";
import { Modal } from "../../ui/Modal";
import { LoadingSpinner } from "../../ui/LoadingSpinner";
import { fuzzyMatch } from "../../../utils/searchHelpers";
import { SearchAndFilters, type FilterOption } from "../../ui/SearchAndFilters";
import { CLASE_BADGE_CENTRO_COSTO } from "../../../utils/centroCosto";
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
  retirada: "bg-gray-100 text-gray-400 line-through dark:bg-gray-800 dark:text-gray-500",
};
const ORDEN_ESTADOS: EstadoVisible[] = ["invitado", "acuso_recibo", "propuso_fechas", "rechazada", "vencido_sin_definir", "aprobado_notificado", "asignado_por_empresa_notificado", "en_curso", "gozado", "sin_dias_pendientes", "retirada"];
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

/**
 * `onCantidad`: lo que va entre paréntesis en el título de la página (23/11/2026, pedido del usuario). En la lista,
 * cuántas campañas; en el tablero, cuántas personas se están mostrando con los filtros aplicados.
 */
export const CampaniaTab: React.FC<{ onCantidad?: (n: number | undefined) => void }> = ({ onCantidad }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const campaniaId = new URLSearchParams(location.search).get("campaniaId") || "";
  const abrir = (id: string) => {
    const q = new URLSearchParams(location.search);
    if (id) q.set("campaniaId", id);
    else q.delete("campaniaId");
    navigate({ search: q.toString() ? `?${q.toString()}` : "" });
  };
  return campaniaId ? <TableroCampania id={campaniaId} onVolver={() => abrir("")} onCantidad={onCantidad} /> : <ListaCampanias onAbrir={abrir} onCantidad={onCantidad} />;
};

/* ─────────────────────────── Lista ─────────────────────────── */

const ListaCampanias: React.FC<{ onAbrir: (id: string) => void; onCantidad?: (n: number | undefined) => void }> = ({ onAbrir, onCantidad }) => {
  const [campanias, setCampanias] = useState<Campania[] | null>(null);
  useEffect(() => {
    onCantidad?.(campanias ? campanias.length : undefined);
  }, [campanias, onCantidad]);
  const [creando, setCreando] = useState(false);
  // La campaña a la que se le está cambiando la fecha límite (el lápiz de la fila), o null.
  const [editando, setEditando] = useState<Campania | null>(null);

  const cargar = useCallback(() => {
    campaniasVacacionesAPI
      .listar()
      .then(setCampanias)
      .catch((e) => {
        sweetAlert.error("No se pudieron cargar las campañas", errorDeCampania(e));
        setCampanias((prev) => prev || []);
      });
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);

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
              <th className={`${th} col-acciones`}>Acciones</th>
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
                <td className="py-2 px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => onAbrir(c._id)} className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700" title="Ver la campaña">
                      <FontAwesomeIcon icon={faEye} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditando(c)}
                      disabled={c.estado === "cerrada"}
                      className="p-1.5 rounded text-gray-600 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      title={c.estado === "cerrada" ? "La campaña está cerrada" : c.estado === "lanzada" ? "Editar: días en que pueden empezar y fecha límite para elegir" : "Editar: días en que pueden empezar"}
                    >
                      <FontAwesomeIcon icon={faEdit} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TablaConEncabezadoFijo>
      )}
      {editando && (
        <ModalEditarCampania
          campania={editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
};

/* ─────────────────────── Editar campaña ─────────────────────── */

/**
 * EDITAR UNA CAMPAÑA (23/11/2026): los días de la semana en que pueden empezar las vacaciones (borrador o lanzada) y,
 * en una lanzada, la fecha límite para elegir: la de la campaña y la de cada persona a la que todavía le corre el
 * plazo, de hoy en adelante y dejando lugar para asignar con el aviso dentro de la ventana. No avisa a nadie.
 */
const ModalEditarCampania: React.FC<{ campania: Campania; onCerrar: () => void; onGuardado: () => void }> = ({ campania: c, onCerrar, onGuardado }) => {
  const lanzada = c.estado === "lanzada";
  const diasAntes = normalizarDiasDeInicio(c.diasDeInicio);
  const [dias, setDias] = useState<number[]>(diasAntes);
  const [fecha, setFecha] = useState(c.fechaLimite || "");
  const [guardando, setGuardando] = useState(false);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const valida = /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha >= hoy;
  const desde = valida ? sumarDias(fecha, c.avisoMinimoDias) : "";
  const entra = valida && desde <= c.ventanaHasta;
  const cambiaDias = normalizarDiasDeInicio(dias).join(",") !== diasAntes.join(",");
  const cambiaFecha = lanzada && fecha !== (c.fechaLimite || "");

  // Los tipos de contrato: los de la configuración global o una selección propia de esta campaña.
  const tiposAntes = normalizarTiposContrato(c.tiposContratoInvitar);
  const [catalogo, setCatalogo] = useState<TipoContratoVacaciones[]>([]);
  const [tiposGlobal, setTiposGlobal] = useState<string[] | null>(null);
  const [modoTipos, setModoTipos] = useState<"global" | "propia" | null>(null);
  const [tiposPropios, setTiposPropios] = useState<string[]>(tiposAntes);
  const [previaTipos, setPreviaTipos] = useState<CambioDeTipos | null>(null);
  const [errorTipos, setErrorTipos] = useState("");
  useEffect(() => {
    Promise.all([vacationConfigAPI.getTiposContrato(), vacationConfigAPI.getConfig()])
      .then(([tipos, config]) => {
        setCatalogo(tipos);
        const global = normalizarTiposContrato(config?.campania?.tiposContratoInvitar);
        setTiposGlobal(global);
        setModoTipos(global.join(",") === tiposAntes.join(",") ? "global" : "propia");
      })
      .catch((e) => setErrorTipos(errorDeCampania(e)));
  }, []);
  const tiposElegidos = modoTipos === "global" ? tiposGlobal || [] : normalizarTiposContrato(tiposPropios);
  const cambiaTipos = modoTipos !== null && tiposElegidos.join(",") !== tiposAntes.join(",");
  const nombreTipo = (id: string) => catalogo.find((t) => t.id === id)?.name || "(tipo sin nombre)";
  const textoTipos = (ids: string[]) => (ids.length ? ids.map(nombreTipo).join(", ") : "todos los habilitados");
  // Lanzada: qué haría el cambio (en seco), cada vez que cambia la selección.
  useEffect(() => {
    setPreviaTipos(null);
    if (!lanzada || !cambiaTipos) return;
    let vigente = true;
    const t = setTimeout(() => {
      campaniasVacacionesAPI
        .cambiarTiposContrato(c._id, { tiposContratoInvitar: tiposElegidos, enSeco: true })
        .then((p) => vigente && setPreviaTipos(p))
        .catch((e) => vigente && setErrorTipos(errorDeCampania(e)));
    }, 350);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [tiposElegidos.join(","), lanzada, cambiaTipos]);

  const guardar = async () => {
    if (cambiaTipos && lanzada && previaTipos?.retirar) {
      const r = await sweetAlert.confirm(
        `¿Sacar a ${previaTipos.retirar} persona(s) de la campaña?`,
        `Con ${textoTipos(tiposElegidos)}, a quien todavía no eligió y queda afuera se le retira la invitación: no elige ni se le asignan fechas en esta campaña, y no recibe ningún aviso. Quedan ${previaTipos.quedan} invitadas. Se puede volver atrás cambiando otra vez los tipos.`,
        "Aplicar",
      );
      if (!r.isConfirmed) return;
    }
    setGuardando(true);
    const hecho: string[] = [];
    try {
      if (cambiaTipos) {
        const r = await campaniasVacacionesAPI.cambiarTiposContrato(c._id, { tiposContratoInvitar: tiposElegidos });
        hecho.push(lanzada ? `Tipos: ${textoTipos(tiposElegidos)}; fuera de la campaña ${r.retirar ?? 0}, vuelven ${r.vuelven ?? 0}, invitadas nuevas ${r.invitar ?? 0}.` : `Tipos: ${textoTipos(tiposElegidos)}.`);
      }
      if (cambiaDias) {
        await campaniasVacacionesAPI.cambiarDiasDeInicio(c._id, dias);
        hecho.push(`Las vacaciones empiezan ${textoDiasDeInicio(dias)}.`);
      }
      if (cambiaFecha) {
        const r = await campaniasVacacionesAPI.cambiarFechaLimite(c._id, fecha);
        if (r.aplicado) hecho.push(`Fecha límite al ${fechaCorta(r.nueva)} para ${r.invitaciones} persona(s).`);
      }
      sweetAlert.success("Listo", `${hecho.join(" ") || "No cambió nada."} No se avisó a nadie${lanzada && cambiaTipos ? " (salvo a las invitadas nuevas, que reciben la invitación)" : ""}.`);
      onGuardado();
    } catch (e) {
      sweetAlert.error(hecho.length ? `Se guardó una parte: ${hecho.join(" ")}` : "No se pudo guardar", errorDeCampania(e));
      if (hecho.length) onGuardado();
    } finally {
      setGuardando(false);
    }
  };
  return (
    <Modal
      isOpen
      onClose={onCerrar}
      title="Editar campaña"
      subtitle={`${c.nombre} · ${TEXTO_CAMPANIA[c.estado].toLowerCase()}`}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onCerrar} className="btn-secondary" disabled={guardando}>Cancelar</button>
          <button type="button" onClick={() => void guardar()} className="btn-primary" disabled={guardando || (!cambiaDias && !cambiaFecha && !cambiaTipos) || (cambiaFecha && !entra) || (cambiaTipos && lanzada && !previaTipos)}>{guardando ? "Guardando…" : "Guardar"}</button>
        </>
      }
    >
      <div className="space-y-5 text-sm">
        <div className="space-y-2">
          <p className="font-medium text-gray-800 dark:text-gray-200">Tipos de contrato que se invitan</p>
          {errorTipos ? (
            <p className="text-xs text-red-600">{errorTipos}</p>
          ) : modoTipos === null ? (
            <p className="text-xs text-gray-500">Cargando tipos…</p>
          ) : (
            <>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" checked={modoTipos === "global"} onChange={() => setModoTipos("global")} disabled={guardando} className="mt-1" />
                <span>
                  Los de la configuración global: <strong>{textoTipos(tiposGlobal || [])}</strong>
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input type="radio" checked={modoTipos === "propia"} onChange={() => setModoTipos("propia")} disabled={guardando} className="mt-1" />
                <span>Elegir para esta campaña</span>
              </label>
              {modoTipos === "propia" && (
                <SelectorTiposContrato tipos={catalogo} deshabilitados={catalogo.filter((t) => !t.vacationsEnabled).map((t) => t.id)} seleccion={tiposPropios} onChange={setTiposPropios} personas={Object.fromEntries(catalogo.map((t) => [t.id, t.vigentes]))} queCuenta="personas con un contrato vigente de este tipo" disabled={guardando} />
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400">Se mira el contrato vigente de cada persona en su empresa de cómputo. Quien no tiene contrato vigente en WeProdu no se invita nunca.</p>
              {lanzada && cambiaTipos && (
                <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200 space-y-1">
                  {!previaTipos ? (
                    <p>Calculando qué cambia…</p>
                  ) : (
                    <>
                      <p>
                        Quedan <strong>{previaTipos.quedan}</strong> invitadas. Se retira la invitación a <strong>{previaTipos.retirar}</strong>
                        {previaTipos.retirar ? ` (${Object.entries(previaTipos.retirarPorMotivo || {}).map(([m, n]) => `${n}: ${TEXTO_MOTIVO_NO_INVITAR[m as keyof typeof TEXTO_MOTIVO_NO_INVITAR]}`).join("; ")})` : ""}.
                      </p>
                      {(previaTipos.vuelven || 0) + (previaTipos.invitar || 0) > 0 && <p>Vuelven {previaTipos.vuelven}; se invita a {previaTipos.invitar} nueva(s), que reciben la invitación en la app.</p>}
                      {!!previaTipos.conservan && <p>{previaTipos.conservan} fuera de la selección siguen en la campaña porque ya propusieron, tienen otorgadas o vencieron.</p>}
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <div className="space-y-2">
          <p className="font-medium text-gray-800 dark:text-gray-200">Días en que pueden empezar las vacaciones</p>
          <SelectorDiasDeInicio value={dias} onChange={setDias} disabled={guardando} />
          <p className="text-xs text-gray-600 dark:text-gray-400">Vale para lo que se elija y se asigne desde ahora: lo ya propuesto u otorgado no se toca.</p>
        </div>
        {lanzada && (
          <div className="space-y-2">
            <p className="font-medium text-gray-800 dark:text-gray-200">Fecha límite para elegir <span className="font-normal text-gray-500">(hoy: hasta el {c.fechaLimite ? fechaCorta(c.fechaLimite) : "—"})</span></p>
            <input type="date" value={fecha} min={hoy} max={c.ventanaHasta} onChange={(e) => setFecha(e.target.value)} className="input-field w-full" />
            <p className="text-xs text-gray-600 dark:text-gray-400">Cambia la de la campaña y la de cada persona a la que todavía le corre el plazo (las que ya tienen sus vacaciones otorgadas no se tocan). Queda en el historial de cada una.</p>
            {valida && entra && <p className="text-xs text-gray-600 dark:text-gray-400">A quien no elija, la empresa le asigna desde el {fechaCorta(desde)} (aviso de {c.avisoMinimoDias} días).</p>}
            {valida && !entra && <p className="text-xs text-red-600">Con el aviso de {c.avisoMinimoDias} días, a quien no elija se le asignaría desde el {fechaCorta(desde)}, después del fin de la ventana ({fechaCorta(c.ventanaHasta)}).</p>}
            {!valida && fecha !== "" && <p className="text-xs text-red-600">Tiene que ser de hoy en adelante.</p>}
          </div>
        )}
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">No se avisa a nadie.</p>
      </div>
    </Modal>
  );
};

/* ─────────────────────────── Tablero ─────────────────────────── */

const SIN_CONTRATO = "Sin contratos en WeProdu";
const SIN_DATO = "(sin dato)";

/**
 * EL CONTRATO DE LA PERSONA, como en la ficha (23/11/2026, pedido del usuario): el tipo, VIGENTE / NO VIGENTE, alta,
 * baja y el proyecto. Es el que rige (el vigente o, si no tiene, el último). Si está vigente pero no es de su
 * empresa de cómputo, se aclara que no cuenta para la campaña (la campaña mira ése).
 */
const ContratoDeLaFila: React.FC<{ i: Invitacion }> = ({ i }) => {
  const k = i.contrato;
  if (!k) return <p className="text-amber-600 dark:text-amber-400 text-xs max-w-[10rem]">{SIN_CONTRATO}</p>;
  return (
    <div className="space-y-1 min-w-[10rem]">
      <p className="text-gray-800 dark:text-gray-200 whitespace-nowrap">{k.nombre}</p>
      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${k.vigente ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}`}>
        {k.vigente ? "Vigente" : "No vigente"}
      </span>
      {k.alta && <p className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">Alta: {fechaCorta(k.alta)}</p>}
      <p className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">{k.baja ? `Baja: ${fechaCorta(k.baja)}` : "Sin baja"}</p>
      {k.proyecto && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-400 text-[10px] font-bold uppercase whitespace-nowrap">
          <FontAwesomeIcon icon={faBriefcase} className="h-2.5 w-2.5" /> {k.proyecto}
        </span>
      )}
      {k.empresa && <p className="text-[11px] text-gray-400 whitespace-nowrap">{k.empresa}</p>}
      {k.vigente && !i.tipoContrato && <p className="text-[11px] text-amber-600 dark:text-amber-400 max-w-[12rem]">No es de su empresa de cómputo: no cuenta para la campaña.</p>}
    </div>
  );
};

const TableroCampania: React.FC<{ id: string; onVolver: () => void; onCantidad?: (n: number | undefined) => void }> = ({ id, onVolver, onCantidad }) => {
  const [datos, setDatos] = useState<Tablero | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  /*
    FILTROS (23/11/2026, pedido del usuario: «un botón de filtros con todo para poder ver lo que sirve»): el patrón de
    la app, buscador + «Filtros avanzados», sin chips. Por defecto se ve sólo a quien está EN la campaña (sin las
    «Fuera de la campaña»); el filtro aplicado queda a la vista y se quita con la ✕.
  */
  const [busqueda, setBusqueda] = useState("");
  const [participacion, setParticipacion] = useState("en");
  const [estados, setEstados] = useState<string[]>([]);
  const [tiposFiltro, setTiposFiltro] = useState<string[]>([]);
  const [vigencia, setVigencia] = useState("");
  const [empresasFiltro, setEmpresasFiltro] = useState<string[]>([]);
  const [proyectosFiltro, setProyectosFiltro] = useState<string[]>([]);
  const [clientesFiltro, setClientesFiltro] = useState<string[]>([]);
  const [acuse, setAcuse] = useState("");
  const [cuenta, setCuenta] = useState("");
  const [conAlertas, setConAlertas] = useState(false);
  const [editando, setEditando] = useState<Invitacion | null>(null);
  const [historial, setHistorial] = useState<Invitacion | null>(null);
  // Cambiar la fecha límite para elegir (sólo lanzada).
  const [cambiandoLimite, setCambiandoLimite] = useState(false);
  // A quién se invita (sólo en borrador): la selección de tipos y la gente con días por tipo, para la vista previa.
  const [tipos, setTipos] = useState<string[]>([]);
  const [catalogo, setCatalogo] = useState<TipoContratoVacaciones[]>([]);
  const [previa, setPrevia] = useState<VistaPreviaDeInvitacion | null>(null);
  const [errorPrevia, setErrorPrevia] = useState("");
  const esBorrador = datos?.campania.estado === "borrador";

  useEffect(() => {
    if (!esBorrador) return;
    let vigente = true;
    setPrevia(null);
    setErrorPrevia("");
    Promise.all([campaniasVacacionesAPI.vistaPrevia(id), vacationConfigAPI.getTiposContrato()])
      .then(([p, contratos]) => {
        if (!vigente) return;
        setPrevia(p);
        setTipos(p.tiposContratoInvitar);
        setCatalogo(contratos);
      })
      .catch((e) => vigente && setErrorPrevia(errorDeCampania(e)));
    return () => {
      vigente = false;
    };
  }, [id, esBorrador]);

  // Cada cambio se guarda en la campaña; si falla, vuelve a lo que estaba guardado.
  const cambiarTipos = async (nueva: string[]) => {
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

  // El estado de cada invitación por id: para saber si las que alguien tiene adelante en su turno ya eligieron.
  const estadoPorId = useMemo(() => new Map((datos?.invitaciones || []).map((i) => [i._id, i.estado])), [datos]);
  const filas = useMemo(
    () =>
      (datos?.invitaciones || []).filter((i) => {
        const k = i.contrato;
        if (participacion === "en" && i.estadoVisible === "retirada") return false;
        if (participacion === "fuera" && i.estadoVisible !== "retirada") return false;
        if (estados.length && !estados.includes(i.estadoVisible)) return false;
        if (tiposFiltro.length && !tiposFiltro.includes(k ? k.nombre : SIN_CONTRATO)) return false;
        if (vigencia && vigencia !== (k ? (k.vigente ? "vigente" : "no_vigente") : "sin")) return false;
        if (empresasFiltro.length && !empresasFiltro.includes(k?.empresa || SIN_DATO)) return false;
        if (proyectosFiltro.length && !(i.proyectos?.length ? i.proyectos.map((p) => p.nombre) : [SIN_DATO]).some((p) => proyectosFiltro.includes(p))) return false;
        if (clientesFiltro.length && !(i.clientes?.length ? i.clientes : [SIN_DATO]).some((x) => clientesFiltro.includes(x))) return false;
        if (acuse && (acuse === "si") !== !!i.acuseInvitacionAt) return false;
        if (cuenta && (cuenta === "si") !== !!i.tipoContrato) return false;
        if (conAlertas && i.alertas.length === 0) return false;
        return fuzzyMatch(i.nombre, busqueda.trim());
      }),
    [datos, participacion, estados, tiposFiltro, vigencia, empresasFiltro, proyectosFiltro, clientesFiltro, acuse, cuenta, conAlertas, busqueda],
  );
  // El número del título: las que se ven con los filtros aplicados.
  useEffect(() => {
    onCantidad?.(datos ? filas.length : undefined);
  }, [datos, filas, onCantidad]);
  // Las opciones de cada filtro salen de lo que hay en la campaña, con cuántas personas tiene cada una.
  const opciones = useMemo(() => {
    const contar = (valores: string[]): FilterOption[] => {
      const m = new Map<string, number>();
      for (const v of valores) m.set(v, (m.get(v) || 0) + 1);
      return [...m.entries()].sort((a, b) => ((a[0] === SIN_CONTRATO || a[0] === SIN_DATO) ? 1 : (b[0] === SIN_CONTRATO || b[0] === SIN_DATO) ? -1 : a[0].localeCompare(b[0], "es"))).map(([v, n]) => ({ value: v, label: `${v} · ${n}` }));
    };
    const inv = datos?.invitaciones || [];
    return {
      estados: ORDEN_ESTADOS.filter((e) => datos?.conteos[e]).map((e) => ({ value: e, label: `${ETIQUETA_ESTADO[e]} · ${datos?.conteos[e]}` })),
      tipos: contar(inv.map((i) => i.contrato?.nombre || SIN_CONTRATO)),
      empresas: contar(inv.map((i) => i.contrato?.empresa || SIN_DATO)),
      proyectos: contar(inv.flatMap((i) => (i.proyectos?.length ? i.proyectos.map((p) => p.nombre) : [SIN_DATO]))),
      clientes: contar(inv.flatMap((i) => (i.clientes?.length ? i.clientes : [SIN_DATO]))),
    };
  }, [datos]);
  if (!datos) return <LoadingSpinner message="Cargando campaña..." />;
  const { campania: c, conteos } = datos;
  const vencidas = datos.invitaciones.filter((i) => i.estado === "vencido_sin_definir");
  const paraConfirmar = vencidas.filter((i) => i.asignacion?.desde && !i.asignacion?.vacationId);

  // Los tipos que no se invitan nunca no cuentan como tildados, aunque hayan quedado guardados.
  const seleccion = previa ? tipos.filter((t) => !previa.deshabilitados.includes(t)) : tipos;
  const resumen = previa ? resumenDeInvitables(previa, seleccion, previa.deshabilitados) : null;
  const nombreDeTipo = (idTipo: string) => catalogo.find((t) => t.id === idTipo)?.name || previa?.porTipo.find((t) => t.id === idTipo)?.nombre || "(tipo sin nombre)";
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
        {/* Las reglas de la campaña, cada una en su badge (23/11/2026, pedido del usuario). */}
        {(
          [
            ["Ventana", `${fechaCorta(c.ventanaDesde)} al ${fechaCorta(c.ventanaHasta)}`],
            ["Aviso", `${c.avisoMinimoDias} días`],
            ["Tramo mínimo", `${c.minDiasPorTramo} días`],
            ["Empiezan", textoDiasDeInicio(c.diasDeInicio)],
            c.fechaLimite ? ["Elegir hasta", fechaCorta(c.fechaLimite)] : ["Plazo", `${c.plazoParaDefinirDias} días desde el lanzamiento`],
            ["Invita", c.tiposInvitados?.length ? c.tiposInvitados.join(", ") : "todos los tipos habilitados"],
          ] as [string, string][]
        ).map(([etiqueta, valor]) => (
          <span key={etiqueta} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-xs dark:border-gray-700 dark:bg-gray-800">
            <span className="text-gray-500 dark:text-gray-400">{etiqueta}</span>
            <span className="font-semibold text-gray-800 dark:text-gray-100">{valor}</span>
          </span>
        ))}
        {c.estado !== "cerrada" && (
          <button type="button" onClick={() => setCambiandoLimite(true)} disabled={!!ocupado} aria-label="Editar campaña" title="Editar campaña: tipos de contrato, días en que pueden empezar y fecha límite para elegir" className="h-7 w-7 inline-flex items-center justify-center rounded text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30 disabled:opacity-50">
            <FontAwesomeIcon icon={faEdit} className="h-3.5 w-3.5" />
          </button>
        )}
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

      {/* El buscador y «Filtros avanzados» (sin chips): lo aplicado queda a la vista y se quita con la ✕. */}
      {datos.invitaciones.length > 0 && (
        <div className="space-y-1">
          <SearchAndFilters
            searchTerm={busqueda}
            onSearchChange={setBusqueda}
            searchPlaceholder="Buscar colaborador..."
            selectFilters={[
              { label: "Participación", value: participacion, onChange: setParticipacion, placeholder: `Todas (${datos.invitaciones.length})`, options: [{ value: "en", label: `En la campaña (${datos.invitaciones.length - (conteos.retirada || 0)})` }, { value: "fuera", label: `Fuera de la campaña (${conteos.retirada || 0})` }] },
              { label: "Contrato", value: vigencia, onChange: setVigencia, placeholder: "Con o sin contrato", options: [{ value: "vigente", label: "Vigente" }, { value: "no_vigente", label: "No vigente" }, { value: "sin", label: SIN_CONTRATO }] },
              { label: "Cuenta para la campaña", value: cuenta, onChange: setCuenta, placeholder: "Todas", options: [{ value: "si", label: "Con contrato vigente en su empresa de cómputo" }, { value: "no", label: "Sin contrato vigente en su empresa de cómputo" }] },
              { label: "Acuse de la invitación", value: acuse, onChange: setAcuse, placeholder: "Con o sin acuse", options: [{ value: "si", label: "Acusó recibo" }, { value: "no", label: "No acusó recibo" }] },
            ]}
            multiSelectFilters={[
              { label: "Estado", values: estados, onChange: setEstados, options: opciones.estados, placeholder: "Todos los estados" },
              { label: "Tipo de contrato", values: tiposFiltro, onChange: setTiposFiltro, options: opciones.tipos, placeholder: "Todos los tipos" },
              { label: "Empresa", values: empresasFiltro, onChange: setEmpresasFiltro, options: opciones.empresas, placeholder: "Todas las empresas" },
              { label: "Cliente", values: clientesFiltro, onChange: setClientesFiltro, options: opciones.clientes, placeholder: "Todos los clientes" },
              { label: "Proyecto", values: proyectosFiltro, onChange: setProyectosFiltro, options: opciones.proyectos, placeholder: "Todos los proyectos" },
            ]}
            switchFilters={[{ label: "Sólo con alertas", value: conAlertas, onChange: setConAlertas }]}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">Mostrando {filas.length} de {datos.invitaciones.length}</p>
        </div>
      )}

      {c.estado === "borrador" ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
              <FontAwesomeIcon icon={faScaleBalanced} className="text-gray-400" /> A quién se invita
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              A cada persona activa con días disponibles del período {c.anio} y un contrato vigente en WeProdu (quien no tiene contrato vigente no se invita). Podés limitarlo por tipo de contrato: se mira el <strong>contrato vigente en su empresa de cómputo</strong> (la empleadora de la que sale su antigüedad); si ahí tiene varios, el de alta más reciente.
            </p>
          </div>
          {errorPrevia ? (
            <p className="text-sm text-red-700 dark:text-red-400">No se pudo calcular a quién se invitaría: {errorPrevia}</p>
          ) : !previa || !resumen ? (
            <LoadingSpinner message="Cargando datos..." />
          ) : (
            <>
              <SelectorTiposContrato tipos={catalogo} deshabilitados={previa.deshabilitados} seleccion={seleccion} onChange={cambiarTipos} personas={Object.fromEntries(previa.porTipo.map((t) => [t.id, t.personas]))} queCuenta="personas con días disponibles, por su contrato vigente en la empresa de cómputo" disabled={!!ocupado} />
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
              <th className={th}>Cliente/s</th>
              <th className={th}>Proyecto/s</th>
              <th className={th}>Días</th>
              <th className={th}>Tipo de contrato</th>
              <th className={th}>Estado</th>
              <th className={th}>Alertas</th>
              <th className={th}>Acuse invitación</th>
              <th className={th}>Fechas</th>
              <th className={th}>Aviso escrito</th>
              <th className={th}>Acuse aviso</th>
              <th className={`col-acciones ${th}`}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={12} className="py-8 px-4 text-center text-sm text-gray-500 dark:text-gray-400">
                  Nadie coincide con {busqueda.trim() ? `«${busqueda.trim()}»` : "los filtros"}.
                </td>
              </tr>
            )}
            {filas.map((i) => (
              <tr key={i._id} className="group border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 align-top">
                <td className={`py-3 px-4 sticky -left-px z-[5] bg-white dark:bg-[#1b2637] group-hover:bg-gray-50 dark:group-hover:bg-[#293344] ${FIN_COL_FIJA}`}>
                  <p className="font-medium text-gray-900 dark:text-white text-sm whitespace-nowrap">{i.nombre}</p>
                </td>
                {/* Cliente/s y Proyecto/s (con el centro de costo adelante), como en la lista de Usuarios. */}
                <td className="py-3 px-4">
                  {i.clientes?.length ? (
                    <div className="flex flex-col gap-1">
                      {i.clientes.map((x) => (
                        <span key={x} className="inline-flex w-fit items-center px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 uppercase whitespace-nowrap">{x}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="py-3 px-4">
                  {i.proyectos?.length ? (
                    <div className="flex flex-col gap-1">
                      {i.proyectos.map((p) => (
                        <span key={p.nombre} className="inline-flex items-center gap-1 whitespace-nowrap" title={p.centroCosto ? `${p.nombre} · Centro de costo ${p.centroCosto}` : p.nombre}>
                          {p.centroCosto && <span className={`${CLASE_BADGE_CENTRO_COSTO} px-1.5 py-0.5 text-[10px]`}>{p.centroCosto}</span>}
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                            <FontAwesomeIcon icon={faBriefcase} className="mr-1 opacity-50" />
                            {p.nombre}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 italic">Sin proyecto</span>
                  )}
                </td>
                <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">{i.asignacion?.dias || i.diasDisponibles}</td>
                <td className="py-3 px-4 text-sm">
                  <ContratoDeLaFila i={i} />
                </td>
                <td className="py-3 px-4">
                  <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap ${CLASE_ESTADO[i.estadoVisible]}`}>{i.etiquetaEstado}</span>
                  {i.rechazo?.motivo && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400 max-w-[14rem]">{i.rechazo.motivo}</p>}
                  <p className="mt-1 text-[11px] text-gray-400 whitespace-nowrap">Límite {fechaCorta(i.fechaLimite)}</p>
                  {i.turnos?.length && PUEDE_PROPONER.includes(i.estado)
                    ? (() => {
                        const t = estadoDelTurno(i.turnos, datos.hoy, (otra) => !PUEDE_PROPONER.includes(estadoPorId.get(otra) as any));
                        return (
                          <p className={`mt-1 text-[11px] whitespace-nowrap ${t.abierto ? "text-violet-600 dark:text-violet-300" : "text-amber-600 dark:text-amber-400"}`} title={`Eligen por antigüedad (${t.regla}). Su turno abre el ${fechaCorta(t.desde || "")}, o antes si ya eligieron las que tiene adelante.`}>
                            Turno {t.orden} de {t.de} · {t.abierto ? "ya puede elegir" : `desde el ${fechaCorta(t.desde || "")}`}
                          </p>
                        );
                      })()
                    : null}
                </td>
                <td className="py-3 px-4 min-w-[12rem]">
                  {i.alertas.map((a) => (
                    <p key={a.codigo} className={`mt-1 first:mt-0 text-[11px] flex items-start gap-1 max-w-[16rem] ${a.nivel === "error" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                      <FontAwesomeIcon icon={a.nivel === "error" ? faCircleExclamation : faTriangleExclamation} className="mt-0.5" />
                      {a.mensaje}
                    </p>
                  ))}
                  {i.alertas.length === 0 && <span className="text-xs text-gray-400">—</span>}
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
      {cambiandoLimite && (
        <ModalEditarCampania
          campania={c}
          onCerrar={() => setCambiandoLimite(false)}
          onGuardado={() => {
            setCambiandoLimite(false);
            void cargar();
          }}
        />
      )}
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faCircleQuestion, faCircleXmark, faFlask, faPaperPlane, faSpinner, faStop, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { sweetAlert } from "../../utils/sweetAlert";
import { arcaOperacionesAPI, NOMBRE_OPERACION_ARCA, type DatosOperacionArca, type EstadoOperacionArca, type OperacionArca, type ReferenciaContratoArca, type RelacionParaOperar, type RespuestaPlanArca } from "../../api/arcaOperaciones";

/*
  BAJA, MODIFICACIÓN Y ANULACIÓN DE UNA RELACIÓN EN ARCA, desde el contrato (20/11/2026). Tres pasos, siempre en
  este orden: elegir la operación y sus datos → VER EL PLAN (qué se mandaría exactamente, sin tocar ARCA) → PROBAR
  EN SECO (entra, lee la relación en vivo, completa el formulario, lo muestra y cancela) → recién ahí ENVIAR.

  El resultado se pinta por clase: lo que ARCA rechazó o no habilita (rojo, con su texto literal), lo que no se pudo
  recorrer (ámbar, se puede reintentar sin tocar nada) y lo que quedó sin confirmar (ámbar fuerte: mirar en ARCA,
  no reenviar). La corrida la hace el servidor; acá se consulta cada 2 s, como en las altas.
*/

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ref_: ReferenciaContratoArca;
  zIndex?: number;
  /** Después de una operación real que terminó (para recargar la lista de contratos). */
  onHecho?: () => void;
}

const fechaCorta = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—");
const fechaHora = (v?: string | Date) => (v ? new Date(v).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "");

const ETIQUETA_RESULTADO: Record<string, { texto: string; clase: string; icono: any }> = {
  presentada: { texto: "ARCA la tomó", clase: "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800", icono: faCircleCheck },
  ya_hecha: { texto: "Ya estaba hecha en ARCA", clase: "bg-green-50 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800", icono: faCircleCheck },
  seco: { texto: "Prueba en seco: nada quedó en ARCA", clase: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800", icono: faFlask },
  rechazada: { texto: "ARCA la rechazó", clase: "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800", icono: faCircleXmark },
  fallida: { texto: "No se pudo", clase: "bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800", icono: faCircleXmark },
  indeterminado: { texto: "Sin confirmar: mirá ARCA", clase: "bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-700", icono: faCircleQuestion },
};

const Chip: React.FC<{ texto: string; tono?: "verde" | "rojo" | "ambar" | "gris" | "azul"; title?: string }> = ({ texto, tono = "gris", title }) => {
  const clase = { verde: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300", rojo: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300", ambar: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200", gris: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", azul: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" }[tono];
  return <span title={title} className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${clase}`}>{texto}</span>;
};

/** Un botón deshabilitado del pie: sin el color de botón (ni el primario), opaco, y que no invite a apretarlo. */
const CLASE_DESHABILITADO = "text-sm inline-flex items-center gap-1.5 font-medium py-2 px-4 rounded border border-gray-300 bg-transparent text-gray-500 opacity-50 cursor-not-allowed dark:border-gray-600 dark:text-gray-400";

const tonoDeMarca = (r?: string) => (r === "presentada" ? "verde" : r === "fallida" ? "rojo" : r === "anulada" ? "gris" : r ? "ambar" : "gris");

export const OperacionArcaModal: React.FC<Props> = ({ isOpen, onClose, ref_, zIndex = 80, onHecho }) => {
  const [info, setInfo] = useState<RelacionParaOperar | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [op, setOp] = useState<OperacionArca>("baja");
  // Datos de cada operación.
  const [fechaFin, setFechaFin] = useState("");
  const [situacion, setSituacion] = useState("");
  const [telegrama, setTelegrama] = useState("");
  const [cambios, setCambios] = useState<Record<string, string>>({});
  const [obraSocialTexto, setObraSocialTexto] = useState("");
  const [que, setQue] = useState<"alta" | "baja">("alta");
  const [plan, setPlan] = useState<RespuestaPlanArca | null>(null);
  const [planeando, setPlaneando] = useState(false);
  const [estado, setEstado] = useState<EstadoOperacionArca | null>(null);
  const [arrancando, setArrancando] = useState(false);
  const [deteniendo, setDeteniendo] = useState(false);
  const [probadoEnSeco, setProbadoEnSeco] = useState(false);
  const temporizador = useRef<number | null>(null);
  const hechoAvisado = useRef(false);

  const datos: DatosOperacionArca = useMemo(() => {
    if (op === "baja") return { fechaFin: fechaFin || undefined, situacionBaja: situacion, fechaTelegrama: telegrama || undefined };
    if (op === "modificacion") return { cambios: Object.fromEntries(Object.entries(cambios).filter(([, v]) => String(v || "").trim() !== "")), obraSocialTexto: obraSocialTexto || undefined };
    return { que };
  }, [op, fechaFin, situacion, telegrama, cambios, obraSocialTexto, que]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await arcaOperacionesAPI.relacion(ref_);
      setInfo(r);
      setFechaFin(r.contrato.baja || "");
      // Si la relación ya tiene baja (mandada desde acá o en el espejo), lo natural es anular la baja; si no, el alta.
      setQue(r.contrato.marcas.baja?.resultado === "presentada" || r.espejo?.fin ? "baja" : "alta");
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || "No se pudo cargar el contrato.");
    } finally {
      setCargando(false);
    }
  }, [ref_]);

  const consultar = useCallback(async () => {
    try {
      const e = await arcaOperacionesAPI.estado();
      setEstado(e);
      return e;
    } catch {
      return null;
    }
  }, []);

  const parar = () => {
    if (temporizador.current) window.clearInterval(temporizador.current);
    temporizador.current = null;
  };
  const seguir = useCallback(() => {
    parar();
    temporizador.current = window.setInterval(async () => {
      const e = await consultar();
      if (e && !e.corriendo) {
        parar();
        if (e.resultado && e.resultado.resultado === "seco") setProbadoEnSeco(true);
        if (e.resultado && !e.enSeco && !hechoAvisado.current) {
          hechoAvisado.current = true;
          onHecho?.();
        }
      }
    }, 2000);
  }, [consultar, onHecho]);

  useEffect(() => {
    if (!isOpen) return;
    setInfo(null);
    setPlan(null);
    setEstado(null);
    setProbadoEnSeco(false);
    setCambios({});
    setSituacion("");
    setTelegrama("");
    hechoAvisado.current = false;
    void cargar();
    // Si hay una operación en curso de este mismo contrato, se la sigue.
    consultar().then((e) => {
      if (e?.corriendo && e.userProjectId === ref_.userProjectId) seguir();
    });
    return () => parar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cargar]);

  // Cambiar la operación o sus datos invalida el plan y la prueba en seco.
  useEffect(() => {
    setPlan(null);
    setProbadoEnSeco(false);
  }, [op, fechaFin, situacion, telegrama, cambios, obraSocialTexto, que]);

  const verPlan = async () => {
    setPlaneando(true);
    setError("");
    try {
      setPlan(await arcaOperacionesAPI.plan(op, ref_, datos));
    } catch (e: any) {
      const d = e?.response?.data;
      setPlan(d?.plan ? { plan: d.plan, hoy: "", contexto: { persona: info!.persona, empresa: info!.empresa, contrato: info!.contrato, espejo: info!.espejo }, enSecoForzado: !!info?.enSecoForzado } : null);
      setError(d?.error || e?.message || "No se pudo armar el plan.");
    } finally {
      setPlaneando(false);
    }
  };

  const arrancar = async (confirmar: boolean) => {
    if (confirmar) {
      const ok = await sweetAlert.confirm(
        `${NOMBRE_OPERACION_ARCA[op]} en ARCA: no se deshace`,
        `Se va a ${op === "baja" ? "registrar la baja" : op === "modificacion" ? "modificar la relación" : `anular ${que === "alta" ? "el alta" : "la baja"}`} de ${info?.persona.nombre} con ${info?.empresa.razonSocial} en ARCA. Lo que ARCA tome queda registrado en el organismo.`,
        "Sí, enviar a ARCA",
        "Cancelar",
      );
      if (!ok?.isConfirmed) return;
    }
    setArrancando(true);
    setError("");
    setEstado(null);
    try {
      await arcaOperacionesAPI.arrancar(op, ref_, datos, confirmar);
      await consultar();
      seguir();
    } catch (e: any) {
      const d = e?.response?.data;
      setError(d?.error || e?.message || "No se pudo arrancar.");
      if (d?.plan) setPlan({ plan: d.plan, hoy: "", contexto: { persona: info!.persona, empresa: info!.empresa, contrato: info!.contrato, espejo: info!.espejo }, enSecoForzado: !!info?.enSecoForzado });
    } finally {
      setArrancando(false);
    }
  };

  const detener = async () => {
    setDeteniendo(true);
    try {
      const r = await arcaOperacionesAPI.detener();
      if (!r.detenida && r.motivo) setError(r.motivo);
    } finally {
      setDeteniendo(false);
    }
  };

  const corriendo = !!estado?.corriendo;
  const res = estado && !estado.corriendo ? estado.resultado : undefined;
  /*
    QUÉ FALTA, EN EL TITLE DEL BOTÓN DESHABILITADO (22/11/2026, pedido del usuario). Un «Enviar a ARCA» deshabilitado
    que se ve igual que uno activo enseña que apretarlo no hace nada, hasta el día que sí lo hace: deshabilitado
    pierde el estilo de botón, queda opaco y dice qué falta, en el orden en que se resuelve.
  */
  const faltaParaProbar = corriendo || arrancando ? "Hay una operación de ARCA en curso: esperá a que termine." : !plan ? "Primero tocá «Ver plan»: así se ve exactamente qué se mandaría." : !plan.plan.puede ? plan.plan.motivo || "El plan no se puede mandar a ARCA." : "";
  const faltaParaEnviar = faltaParaProbar || (!probadoEnSeco ? "Hacé primero la prueba en seco: así se ve lo que ARCA tiene y lo que se va a escribir." : "");
  const marcas = info?.contrato.marcas;
  const c = info?.contrato;
  const ev = estado?.eventos || [];
  const formulario = [...ev].reverse().find((x) => x.tipo === "formulario") as any;
  const relacionVista = [...ev].reverse().find((x) => x.tipo === "relacion") as any;

  const pie = (
    <div className="flex flex-wrap items-center justify-between gap-2 w-full">
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {info?.enSecoForzado && "Este servidor corre en prueba: «Enviar» también queda en seco."}
        {!info?.enSecoForzado && info?.ocupadaPor && !corriendo && `Hay otra corrida de ARCA en curso (${info.ocupadaPor}): esperá a que termine.`}
      </div>
      <div className="flex items-center gap-2">
        {corriendo && !estado?.irreversible && (
          <button type="button" onClick={detener} disabled={deteniendo} className="btn-secondary text-sm inline-flex items-center gap-1.5">
            <FontAwesomeIcon icon={faStop} className="h-3.5 w-3.5" />
            Detener
          </button>
        )}
        <button type="button" onClick={onClose} className="btn-secondary text-sm">
          Cerrar
        </button>
        <button type="button" onClick={verPlan} disabled={!info || planeando || corriendo} className="btn-secondary text-sm inline-flex items-center gap-1.5">
          {planeando ? <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5" /> : null}
          Ver plan
        </button>
        {/* El title va también en un span: hay navegadores que no muestran el de un botón deshabilitado. */}
        <span title={faltaParaProbar || undefined}>
          <button type="button" onClick={() => arrancar(false)} disabled={!!faltaParaProbar} title={faltaParaProbar || "Entra a ARCA, lee la relación, completa el formulario, muestra lo que mandaría y lo cancela. Nada queda en ARCA."} className={faltaParaProbar ? CLASE_DESHABILITADO : "btn-secondary text-sm inline-flex items-center gap-1.5"}>
            <FontAwesomeIcon icon={faFlask} className="h-3.5 w-3.5" />
            Probar en seco
          </button>
        </span>
        <span title={faltaParaEnviar || undefined}>
          <button type="button" onClick={() => arrancar(true)} disabled={!!faltaParaEnviar} title={faltaParaEnviar || "Confirma en ARCA. No se deshace."} className={faltaParaEnviar ? CLASE_DESHABILITADO : "btn-primary text-sm inline-flex items-center gap-1.5"}>
            <FontAwesomeIcon icon={faPaperPlane} className="h-3.5 w-3.5" />
            Enviar a ARCA
          </button>
        </span>
      </div>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Relación laboral en ARCA" subtitle="Baja, modificación o anulación · Relaciones Laborales → Modificaciones y Bajas" size="lg" zIndex={zIndex} footer={pie}>
      <div className="space-y-4 text-sm">
        {cargando && <p className="text-gray-500">Cargando el contrato…</p>}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-3 text-red-800 dark:text-red-300 text-sm flex items-start gap-2">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {info && c && (
          <>
            {/* El contrato y lo que ARCA sabe */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1.5">
              <p className="font-semibold text-gray-900 dark:text-white">
                {info.persona.nombre} <span className="text-gray-500 font-normal">· CUIL {info.persona.cuil}</span>
              </p>
              <p className="text-gray-700 dark:text-gray-300">
                {c.nombre_contrato} · {fechaCorta(c.alta)} → {c.baja ? fechaCorta(c.baja) : "sin baja"} · {info.empresa.razonSocial} ({info.empresa.cuit})
              </p>
              <div className="flex flex-wrap gap-1.5 items-center">
                <Chip texto={`Alta: ${marcas?.alta?.resultado || "sin marca"}`} tono={tonoDeMarca(marcas?.alta?.resultado)} title={marcas?.alta?.cat ? `C.A.T. ${marcas.alta.cat}` : undefined} />
                <Chip texto={`Baja: ${marcas?.baja?.resultado || "—"}`} tono={tonoDeMarca(marcas?.baja?.resultado)} title={marcas?.baja ? `${fechaHora(marcas.baja.fecha)}${marcas.baja.acuse?.cbt ? ` · C.B.T. ${marcas.baja.acuse.cbt}` : ""}${marcas.baja.motivo ? ` · ${marcas.baja.motivo}` : ""}` : undefined} />
                <Chip texto={`Modificación: ${marcas?.modificacion?.resultado || "—"}`} tono={tonoDeMarca(marcas?.modificacion?.resultado)} title={marcas?.modificacion?.motivo || undefined} />
                <Chip texto={`Anulación: ${marcas?.anulacion?.resultado ? `${marcas.anulacion.resultado} (${marcas.anulacion.que})` : "—"}`} tono={tonoDeMarca(marcas?.anulacion?.resultado)} title={marcas?.anulacion?.motivo || undefined} />
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Espejo de ARCA (Relaciones Laborales sincronizadas):{" "}
                {info.espejo ? `inicio ${fechaCorta(info.espejo.inicio)} → ${info.espejo.fin ? `fin ${fechaCorta(info.espejo.fin)}${info.espejo.situacionBaja ? ` (${info.espejo.situacionBaja})` : ""}` : "abierta"}${info.espejo.sincronizadoEl ? ` · sincronizado ${fechaHora(info.espejo.sincronizadoEl)}` : ""}` : "no hay una relación con esa fecha de inicio (todavía no se sincronizó, o nunca se dio el alta)."}
              </p>
            </div>

            {/* La operación */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(["baja", "modificacion", "anulacion"] as OperacionArca[]).map((k) => (
                <button key={k} type="button" disabled={corriendo} onClick={() => setOp(k)} className={`text-left rounded-lg border p-3 transition-colors ${op === k ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"}`}>
                  <p className="font-semibold text-gray-900 dark:text-white">{NOMBRE_OPERACION_ARCA[k]}</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{k === "baja" ? "Fecha de fin y motivo. ARCA la habilita sólo en relaciones sin baja." : k === "modificacion" ? "Cambia datos ya informados (fechas, retribución, códigos). El contrato en WeProdu no se toca." : "Anula el alta o la baja comunicada. ARCA la habilita según el plazo."}</p>
                </button>
              ))}
            </div>

            {op === "baja" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Fecha de fin (baja)</span>
                  <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} disabled={corriendo} className="input-field text-sm w-full mt-1" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Motivo de la baja (situación de baja de ARCA)</span>
                  <select value={situacion} onChange={(e) => setSituacion(e.target.value)} disabled={corriendo} className="input-field text-sm w-full mt-1">
                    <option value="">Elegí el motivo…</option>
                    {info.situacionesBaja.map((s) => (
                      <option key={s.codigo} value={s.codigo}>
                        {s.codigo} · {s.descripcion}
                      </option>
                    ))}
                  </select>
                  {info.situacionesBaja.length === 0 && <p className="text-xs text-amber-700 mt-1">La tabla de situaciones de baja está vacía: sembrala con `npm run arca:situaciones-baja` en el servidor.</p>}
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Fecha del telegrama (sólo renuncia)</span>
                  <input type="date" value={telegrama} onChange={(e) => setTelegrama(e.target.value)} disabled={corriendo} className="input-field text-sm w-full mt-1" />
                </label>
              </div>
            )}

            {op === "modificacion" && (
              <div className="space-y-2">
                <p className="text-xs text-gray-600 dark:text-gray-400">Completá sólo lo que cambia. Las fechas en aaaa-mm-dd; la retribución como número; lo demás, el código de ARCA. Lo que quede vacío no se toca.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {info.camposModificables.map((cm) => (
                    <label key={cm.campo} className="block">
                      <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{cm.etiqueta}</span>
                      <input type={cm.campo.startsWith("fecha") ? "date" : "text"} value={cambios[cm.campo] || ""} onChange={(e) => setCambios((prev) => ({ ...prev, [cm.campo]: e.target.value }))} disabled={corriendo} className="input-field text-sm w-full mt-1" placeholder={cm.campo === "retribucion" ? "Ej: 1340020.20" : cm.campo === "obraSocial" ? "RNOS de 6 dígitos" : ""} />
                    </label>
                  ))}
                  {cambios.obraSocial && (
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Nombre de la obra social (ARCA lo pide junto al código)</span>
                      <input type="text" value={obraSocialTexto} onChange={(e) => setObraSocialTexto(e.target.value)} disabled={corriendo} className="input-field text-sm w-full mt-1" />
                    </label>
                  )}
                </div>
              </div>
            )}

            {op === "anulacion" && (
              <div className="flex flex-wrap gap-4">
                {(["alta", "baja"] as const).map((k) => (
                  <label key={k} className="inline-flex items-center gap-2 text-sm">
                    <input type="radio" name="que" checked={que === k} onChange={() => setQue(k)} disabled={corriendo} />
                    Anular {k === "alta" ? "el alta" : "la baja"}
                  </label>
                ))}
                <p className="text-xs text-gray-600 dark:text-gray-400 w-full">Anular el alta no anula el contrato en WeProdu: después se puede anular desde «Todos los contratos». La anulación se confirma al apretar el ícono en ARCA, por eso en seco sólo se mira si está habilitado.</p>
              </div>
            )}

            {/* El plan */}
            {plan && (
              <div className={`rounded-lg border p-3 space-y-2 ${plan.plan.puede ? "border-blue-200 bg-blue-50/50 dark:bg-blue-900/10 dark:border-blue-800" : "border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800"}`}>
                <p className="font-semibold text-gray-900 dark:text-white">{plan.plan.puede ? "Se puede mandar. Esto es exactamente lo que iría a ARCA:" : `No se manda: ${plan.plan.motivo}`}</p>
                <table className="text-xs">
                  <tbody>
                    {Object.entries(plan.plan.payload).map(([k, v]) => (
                      <tr key={k}>
                        <td className="pr-3 py-0.5 text-gray-500 align-top">{k}</td>
                        <td className="py-0.5 font-mono text-gray-900 dark:text-gray-100">
                          {String(v)}
                          {k === "situacionBaja" && plan.contexto.situacionTexto ? <span className="font-sans text-gray-600 dark:text-gray-400"> · {plan.contexto.situacionTexto}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {plan.plan.avisos.length > 0 && (
                  <ul className="list-disc pl-5 text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
                    {plan.plan.avisos.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* La corrida */}
            {estado?.hay && (estado.userProjectId === ref_.userProjectId || corriendo) && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  {corriendo && <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5" />}
                  {estado.enSeco ? "Prueba en seco" : "Envío real"} · {NOMBRE_OPERACION_ARCA[estado.op || op]} · {fechaHora(estado.arrancadaEl)}
                  {estado.irreversible && <Chip texto="ya no se puede detener" tono="ambar" />}
                </p>
                <ol className="text-xs text-gray-700 dark:text-gray-300 space-y-0.5 max-h-40 overflow-auto">
                  {ev.map((e, i) => (
                    <li key={i}>
                      {e.tipo === "abriendo" && "Abriendo la sesión de ARCA…"}
                      {e.tipo === "sesion" && (e.seLogueo ? "Sesión iniciada con clave fiscal." : "Sesión guardada: sin login.")}
                      {e.tipo === "empleadoraVerificada" && `Empleadora verificada en pantalla (CUIT ${e.cuit}).`}
                      {e.tipo === "pantalla" && `Pantalla: ${e.que}.`}
                      {e.tipo === "pagina" && `Listado: página ${e.numero}.`}
                      {e.tipo === "relacion" && `Relación en ARCA: inicio ${fechaCorta(e.relacion?.inicio)}${e.relacion?.fin ? `, fin ${fechaCorta(e.relacion.fin)}` : ", sin fin"}${e.relacion?.cat ? ` · C.A.T. ${e.relacion.cat}` : ""}${e.relacion?.cbt ? ` · C.B.T. ${e.relacion.cbt}` : ""}${e.relacion?.iconos ? ` · habilita: ${Object.entries(e.relacion.iconos).filter(([, v]) => v?.habilitado).map(([k]) => k).join(", ") || "nada"}` : ""}`}
                      {e.tipo === "formulario" && `Formulario completado: ${Object.entries(e.valores).map(([k, v]) => `${k}=${String(v)}`).join(" · ")}`}
                      {e.tipo === "seco" && "En seco: se canceló el formulario. Nada quedó en ARCA."}
                      {e.tipo === "irreversible" && <span className="font-semibold text-amber-800 dark:text-amber-300">Se aprieta lo que no se deshace ({e.que}).</span>}
                      {e.tipo === "rechazo" && <span className="text-red-700 dark:text-red-400">ARCA dijo: «{e.motivo}»</span>}
                      {e.tipo === "acuse" && `Acuse: ${Object.entries(e.acuse).map(([k, v]) => `${k} ${String(v)}`).join(" · ") || "sin número"}`}
                      {e.tipo === "dialogoInesperado" && <span className="text-amber-800">ARCA preguntó «{e.mensaje}» y se respondió que no.</span>}
                      {e.tipo === "fallo" && <span className="text-red-700 dark:text-red-400">{e.clase === "regla_arca" ? "Regla de ARCA: " : "Navegación: "}{e.mensaje}</span>}
                      {e.tipo === "fin" && `Fin: ${e.resultado}.`}
                    </li>
                  ))}
                </ol>
                {res && (
                  <div className={`rounded-lg border p-3 text-sm flex items-start gap-2 ${(ETIQUETA_RESULTADO[res.resultado] || ETIQUETA_RESULTADO.fallida).clase}`}>
                    <FontAwesomeIcon icon={(ETIQUETA_RESULTADO[res.resultado] || ETIQUETA_RESULTADO.fallida).icono} className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="font-semibold">
                        {(ETIQUETA_RESULTADO[res.resultado] || ETIQUETA_RESULTADO.fallida).texto}
                        {res.clase === "regla_arca" && " · regla de ARCA"}
                        {res.clase === "navegacion" && " · no se llegó a la pantalla (se puede reintentar)"}
                      </p>
                      {res.motivo && <p>{res.motivo}</p>}
                      {res.resultado === "seco" && formulario && <p>Se habría mandado: {Object.entries(formulario.valores || {}).map(([k, v]) => `${k} = ${String(v)}`).join(" · ")}</p>}
                      {res.resultado === "seco" && !formulario && relacionVista && <p>ARCA muestra la relación con inicio {fechaCorta(relacionVista.relacion?.inicio)}{relacionVista.relacion?.fin ? ` y fin ${fechaCorta(relacionVista.relacion.fin)}` : ""}.</p>}
                      {res.acuse && Object.keys(res.acuse).length > 0 && <p>Acuse: {Object.entries(res.acuse).map(([k, v]) => `${k.toUpperCase()} ${String(v)}`).join(" · ")}</p>}
                      {res.cambios && res.cambios.length > 0 && <p>Cambios: {res.cambios.map((x) => `${x.campo} ${x.antes || "vacío"} → ${x.despues}`).join(" · ")}</p>}
                      {res.pantallaDesconocida && <p className="font-semibold">ARCA mostró una pantalla que el motor no conoce. Se guardó en el registro para relevarla. No se tocó nada más.</p>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

export default OperacionArcaModal;

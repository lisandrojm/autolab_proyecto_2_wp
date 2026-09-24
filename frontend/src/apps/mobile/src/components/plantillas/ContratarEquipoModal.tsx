import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faChevronDown, faChevronRight, faCircleCheck, faCircleExclamation, faSpinner, faTriangleExclamation, faUserSlash } from "@fortawesome/free-solid-svg-icons";
import Swal from "sweetalert2";
import { Modal } from "../Modal";
import { CustomDatePicker } from "../CustomDatePicker";
import { CustomMultiDatePicker } from "../CustomMultiDatePicker";
import { SelectorHora } from "../../../../../components/contratacion/SelectorHora";
import { FilaPreview, Plantilla, plantillasEquipoAPI, Preview, Puntual } from "../../../../../api/plantillasEquipo";
import { Project } from "../../../../../api/projects";
import { sweetAlert } from "../../utils/sweetAlert";
import { CatalogosContratacion, etiquetaProyecto, useAreasDelProyecto } from "./useCatalogosContratacion";
import PersonaPickerModal from "./PersonaPickerModal";
import { Badge, CLASE_CAMPO, CLASE_HORA, esc, fechaCorta, fechaDeHoy, pesos, Rotulo, textoDias } from "./comun";

/*
  CONTRATAR UN EQUIPO: una solicitud por integrante, todas juntas.

  1. Las fechas, iguales para todo el equipo: con un contrato por días sueltos («Jornada») el mismo
     calendario del alta individual; si no, desde/hasta.
  2. Por integrante: excluirlo sólo esta vez; pisar horario, categoría, importe o (Jornada) los días
     SÓLO en esta contratación —la plantilla no cambia—; y el «¿Reemplazo?» de la solicitud, con motivo
     y a quién reemplaza, igual que en el alta individual.
  3. El server calcula (`preview`) con la misma lógica que el alta individual y dice por integrante si
     está bien, si hay advertencias (ej. se superpone con otro contrato) o errores. Con errores no se
     puede contratar; tocar el contador lleva al primero.
  4. «Contratar» muestra el resumen del equipo entero y, al confirmar, manda UN pedido con una clave de
     idempotencia: un doble toque o un reintento no duplica nada.
*/
interface Props {
  isOpen: boolean;
  onClose: () => void;
  plantilla: Plantilla | null;
  proyecto: Project | null;
  catalogos: CatalogosContratacion;
  onContratada: () => void;
}

const nuevaClave = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export default function ContratarEquipoModal({ isOpen, onClose, plantilla, proyecto, catalogos, onContratada }: Props) {
  const [fechas, setFechas] = useState<string[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [jornadasRotativos, setJornadasRotativos] = useState("");
  const [puntuales, setPuntuales] = useState<Record<string, Puntual>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [aQuienReemplaza, setAQuienReemplaza] = useState<string | null>(null);
  /** El puesto sin asignar al que se le está eligiendo persona (sólo esta vez). */
  const [completandoPuesto, setCompletandoPuesto] = useState<string | null>(null);
  const [nombresElegidos, setNombresElegidos] = useState<Record<string, string>>({});
  const [nombresReemplazados, setNombresReemplazados] = useState<Record<string, string>>({});
  const clave = useRef(nuevaClave());
  const areas = useAreasDelProyecto(isOpen ? proyecto?._id : null);

  useEffect(() => {
    if (!isOpen) return;
    setFechas([]);
    setDesde("");
    setHasta("");
    setJornadasRotativos("");
    setPuntuales({});
    setAbierto(null);
    setPreview(null);
    setNombresReemplazados({});
    setNombresElegidos({});
    clave.current = nuevaClave();
  }, [isOpen, plantilla?._id]);

  const contrato = catalogos.contratos.find((c) => c._id === plantilla?.contratoId);
  const porDiasSueltos = (contrato as any)?.data?.modoFechas === "dias";
  const indeterminado = !!(contrato as any)?.data?.esTiempoIndeterminado;
  const esServicios = plantilla?.tipoImpositivo === "constancia_cuit";
  const turno = useMemo(() => {
    const a = plantilla?.areaShiftAssignments?.[0];
    return (areas || []).find((o) => o.areaId === a?.areaId && o.shiftId === a?.shiftIds?.[0]) || null;
  }, [areas, plantilla]);

  const pedido = useMemo(
    () => ({
      ...(porDiasSueltos ? { fechas } : { desde, hasta: indeterminado ? undefined : hasta }),
      jornadasRotativos: plantilla?.diasRotativos && Number(jornadasRotativos) > 0 ? Number(jornadasRotativos) : undefined,
      puntuales,
    }),
    [porDiasSueltos, fechas, desde, hasta, indeterminado, jornadasRotativos, puntuales, plantilla?.diasRotativos],
  );

  // El preview se vuelve a pedir con cada cambio, con una pausa: el server es el que calcula.
  useEffect(() => {
    if (!isOpen || !plantilla) return;
    const hayFechas = porDiasSueltos ? fechas.length > 0 : !!desde;
    if (!hayFechas) {
      setPreview(null);
      return;
    }
    let vigente = true;
    setCalculando(true);
    const t = setTimeout(() => {
      plantillasEquipoAPI
        .preview(plantilla._id, pedido)
        .then((p) => vigente && setPreview(p))
        .catch(() => vigente && setPreview(null))
        .finally(() => vigente && setCalculando(false));
    }, 500);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [isOpen, plantilla, pedido, porDiasSueltos, fechas.length, desde]);

  const filaDe = (integranteId: string): FilaPreview | undefined => preview?.filas.find((f) => f.integranteId === integranteId);
  const pisar = (id: string, x: Partial<Puntual>) => setPuntuales((p) => ({ ...p, [id]: { ...p[id], ...x } }));
  const conErrores = (preview?.filas || []).filter((f) => !f.excluido && f.errores.length > 0);
  const nombreMotivo = (id?: string) => catalogos.motivos.find((m) => m._id === id)?.name || "";
  const nombreRol = (ids: string[]) => ids.map((r) => catalogos.roleFrames.find((x) => x._id === r)?.name).filter(Boolean).join(", ") || "Sin rol";

  if (!plantilla) return null;

  const irAlPrimerError = () => {
    const f = conErrores[0];
    if (!f) return;
    setAbierto(f.integranteId);
    setTimeout(() => document.getElementById(`integrante-${f.integranteId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const contratar = async () => {
    if (!preview) return;
    const incluidas = preview.filas.filter((f) => !f.excluido);
    const periodo = porDiasSueltos ? `${fechas.length} ${fechas.length === 1 ? "jornada" : "jornadas"}: ${[...fechas].sort().map(fechaCorta).join(" · ")}` : `${fechaCorta(desde)} → ${indeterminado ? "sin fecha de baja" : fechaCorta(hasta)}`;
    const empresa = catalogos.companies.find((c) => c._id === plantilla.empresaContratoId) as any;
    const filasHtml = incluidas
      .map((f) => {
        const p = puntuales[f.integranteId] || {};
        const reemplazo = p.isReplacement ? `<div style="color:#fbbf24;font-size:11px">Reemplaza a ${esc(nombresReemplazados[f.integranteId] || "—")} (${esc(nombreMotivo(p.motivoReemplazoId))})</div>` : "";
        const avisos = f.advertencias.length ? `<div style="color:${f.superposicionHorario ? "#f87171" : "#fbbf24"};font-size:11px">⚠ ${f.advertencias.map(esc).join("<br>⚠ ")}</div>` : "";
        return `<div style="padding:8px 0;border-bottom:1px solid rgba(148,163,184,.25)">
          <div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(f.nombre)}</b><b>${pesos(f.importes.total)}</b></div>
          <div style="font-size:11px;opacity:.8">${esc(f.categoriaNombre || (esServicios ? "Servicio" : "—"))} · ${esc(f.inTime)} a ${esc(f.outTime)} · ${f.jornadas} jornada${f.jornadas === 1 ? "" : "s"} × ${pesos(f.importes.jornada)}</div>
          ${reemplazo}${avisos}</div>`;
      })
      .join("");
    const html = `<div style="font-size:12px;line-height:1.45">
      <div style="margin-bottom:8px;opacity:.9"><b>${esc(plantilla.nombre)}</b><br>${esc(proyecto ? etiquetaProyecto(proyecto) : "")}<br>${esc(empresa?.razonSocial || "Sin empresa")} · ${esc(plantilla.nombreContrato || "—")}<br>${esc(turno ? `${turno.areaNombre} · ${turno.turnoNombre}` : "")} · ${esc(periodo)}</div>
      ${filasHtml}
      <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:14px"><b>${incluidas.length} ${incluidas.length === 1 ? "persona" : "personas"} · ${preview.totales.jornadas} jornadas</b><b>${pesos(preview.totales.importe)}</b></div>
    </div>`;

    const r = await sweetAlert.resumenLote({
      title: "¿Contratar al equipo?",
      html,
      confirmText: `Confirmar y enviar (${incluidas.length})`,
      enviar: () => plantillasEquipoAPI.contratar(plantilla._id, pedido, clave.current),
    });
    if (!r) return;
    if (r.ok) {
      clave.current = nuevaClave();
      await Swal.fire({ icon: "success", title: r.valor.repetido ? "Ya se había enviado" : "Solicitudes enviadas", text: `Se enviaron ${r.valor.solicitudIds.length} solicitudes del equipo «${r.valor.nombrePlantilla}». Quedan pendientes de aprobación.`, confirmButtonColor: "#3b82f6", customClass: { popup: "mobile-swal-popup", title: "mobile-swal-title" } });
      onContratada();
      onClose();
      return;
    }
    // Falló: nada se creó (es todo o nada). Se muestra el detalle por integrante y se conserva lo cargado.
    const datos = r.error?.response?.data;
    if (datos?.plan) setPreview(datos.plan);
    sweetAlert.error("No se envió ninguna solicitud", datos?.error || "Probá de nuevo en un momento.");
  };

  const hayFechas = porDiasSueltos ? fechas.length > 0 : !!desde && (indeterminado || !!hasta);
  const puedeContratar = !!preview && hayFechas && !calculando && preview.errores.length === 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Contratar: ${plantilla.nombre}`}
      subtitle={proyecto ? etiquetaProyecto(proyecto) : undefined}
      size="fullscreen"
      zIndex={60}
      footer={
        <div className="w-full space-y-2">
          {preview && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                {preview.totales.personas} personas · {preview.totales.jornadas} jornadas · <b className="text-slate-800 dark:text-slate-100">{pesos(preview.totales.importe)}</b>
              </span>
              {conErrores.length > 0 && (
                <button type="button" onClick={irAlPrimerError} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                  <FontAwesomeIcon icon={faCircleExclamation} />
                  {conErrores.length} con errores
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-700 py-3 text-sm font-bold text-white">
              Cancelar
            </button>
            <button type="button" onClick={() => void contratar()} disabled={!puedeContratar} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-40">
              {calculando && <FontAwesomeIcon icon={faSpinner} spin />}
              Contratar {preview ? `(${preview.totales.personas})` : ""}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── LO DEL EQUIPO ── */}
        <div className="rounded-xl border border-slate-200 p-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
          <p>
            <b>{plantilla.nombreContrato || "Sin tipo de contrato"}</b> · {turno ? `${turno.areaNombre} · ${turno.turnoNombre}` : "Sin área y turno"}
          </p>
          <p>
            {plantilla.inTime || "—"} a {plantilla.outTime || "—"} · {porDiasSueltos ? "por días sueltos" : textoDias(plantilla.diasSemana)} · {plantilla.integrantes.length} integrantes
          </p>
        </div>

        {/* ── FECHAS ── */}
        <div className="space-y-2">
          {porDiasSueltos ? (
            <>
              <CustomMultiDatePicker label="Días que trabaja el equipo" value={fechas} onChange={(d: string | string[]) => setFechas([...new Set(Array.isArray(d) ? d : d ? [d] : [])].sort())} minDate={fechaDeHoy()} />
              <p className="text-[11px] text-slate-400">{fechas.length > 0 ? `${fechas.length} ${fechas.length === 1 ? "jornada" : "jornadas"}: ${fechas.map(fechaCorta).join(" · ")}` : "Cada día marcado es una jornada, igual para todo el equipo."}</p>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <CustomDatePicker label="Desde" value={desde} onChange={setDesde} />
              {indeterminado ? <p className="self-end pb-3 text-[11px] text-slate-400">Tiempo indeterminado: sin fecha de baja.</p> : <CustomDatePicker label="Hasta" value={hasta} onChange={setHasta} />}
            </div>
          )}
          {plantilla.diasRotativos && !porDiasSueltos && (
            <div>
              <Rotulo obligatorio>Jornadas (días rotativos)</Rotulo>
              <input type="number" min={1} value={jornadasRotativos} onChange={(e) => setJornadasRotativos(e.target.value)} className={CLASE_CAMPO} placeholder="Cuántas jornadas trabaja cada uno" />
            </div>
          )}
          {preview && preview.errores.length > 0 && hayFechas && <p className="text-[11px] font-medium text-red-600 dark:text-red-400">{preview.errores.join(" ")}</p>}
        </div>

        {/* ── INTEGRANTES ── */}
        <div className="space-y-2">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Integrantes</h4>
          {!hayFechas && <p className="text-[11px] text-slate-500">Elegí las fechas para ver cuánto sale cada uno.</p>}
          {plantilla.integrantes.map((i, n) => {
            const p = puntuales[i._id] || {};
            const vacante = !i.userId;
            const nombrePersona = vacante ? (p.userId ? nombresElegidos[i._id] || "Elegida" : "") : i.nombre;
            const f = filaDe(i._id);
            const excluido = !!p.excluido;
            const estado = excluido ? "excluido" : !f ? "sin" : f.errores.length ? "error" : f.advertencias.length ? "aviso" : "ok";
            const abiertoAca = abierto === i._id;
            const pisado = !!(p.inTime || p.outTime || p.dailyRate || p.categoriaSatId || p.fechas?.length);
            // Entró en la plantilla en lugar de otra persona desde la última contratación: se sugiere (sin activarlo).
            const sugerirCubre = !!i.reemplazadoDePersonaId && (!plantilla.ultimaContratacionEl || (i.reemplazadoEl && i.reemplazadoEl > plantilla.ultimaContratacionEl)) && !p.isReplacement;
            const categorias = catalogos.categoriasPara(proyecto, plantilla.empresaContratoId, plantilla.convenioId, i.rolesFrame).documentos;
            return (
              <div key={i._id} id={`integrante-${i._id}`} className={`rounded-xl border bg-white dark:bg-slate-900/60 ${estado === "error" ? "border-red-400 dark:border-red-800" : estado === "aviso" ? (f?.superposicionHorario ? "border-red-300 dark:border-red-900/60" : "border-amber-300 dark:border-amber-800/60") : "border-slate-200 dark:border-slate-700"} ${excluido ? "opacity-50" : ""}`}>
                <div className="flex items-center gap-3 p-3">
                  <input type="checkbox" checked={!excluido} onChange={(e) => pisar(i._id, { excluido: !e.target.checked })} className="h-5 w-5 shrink-0 rounded" aria-label={`Incluir el puesto ${n + 1}`} />
                  <button type="button" onClick={() => setAbierto(abiertoAca ? null : i._id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-bold text-slate-400">{n + 1}.</span>
                        <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{nombreRol(i.rolesFrame)}</span>
                        {nombrePersona ? <span className="truncate text-xs text-slate-600 dark:text-slate-300">· {nombrePersona}</span> : <Badge tono="ambar">Sin asignar</Badge>}
                        {pisado && !excluido && <Badge tono="azul">Sólo esta vez</Badge>}
                        {p.isReplacement && !excluido && <Badge tono="ambar">Reemplazo</Badge>}
                      </div>
                      <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {excluido ? "No se contrata esta vez" : f ? `${f.jornadas} jornadas × ${pesos(f.importes.jornada)} = ${pesos(f.importes.total)}` : "—"}
                      </p>
                    </div>
                    <FontAwesomeIcon
                      icon={estado === "ok" ? faCircleCheck : estado === "error" ? faCircleExclamation : estado === "aviso" ? faTriangleExclamation : estado === "excluido" ? faUserSlash : faChevronRight}
                      className={`h-4 w-4 shrink-0 ${estado === "ok" ? "text-green-500" : estado === "error" ? "text-red-500" : estado === "aviso" ? (f?.superposicionHorario ? "text-red-400" : "text-amber-500") : "text-slate-400"}`}
                    />
                    <FontAwesomeIcon icon={abiertoAca ? faChevronDown : faChevronRight} className="h-3 w-3 shrink-0 text-slate-400" />
                  </button>
                </div>

                {!excluido && f && (f.errores.length > 0 || f.advertencias.length > 0) && (
                  <ul className="space-y-1 px-3 pb-2 text-[11px]">
                    {f.errores.map((e, k) => (
                      <li key={`e${k}`} className="text-red-600 dark:text-red-400">
                        • {e}
                      </li>
                    ))}
                    {f.advertencias.map((a, k) => (
                      <li key={`a${k}`} className={f.superposicionHorario ? "text-red-500 dark:text-red-300" : "text-amber-600 dark:text-amber-400"}>
                        ⚠ {a}
                      </li>
                    ))}
                  </ul>
                )}

                {vacante && !excluido && (
                  <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                    <span>{p.userId ? `Esta vez lo ocupa ${nombrePersona}.` : "Puesto sin asignar: elegí quién lo ocupa esta vez, o destildalo."}</span>
                    <button type="button" onClick={() => setCompletandoPuesto(i._id)} className="shrink-0 rounded-lg bg-amber-500 px-2.5 py-1 font-bold text-white">
                      {p.userId ? "Cambiar" : "Elegí quién"}
                    </button>
                  </div>
                )}

                {sugerirCubre && !excluido && (
                  <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                    <span>Entró en lugar de {i.reemplazadoDeNombre}. ¿Lo cubre en esta contratación?</span>
                    <button
                      type="button"
                      onClick={() => {
                        pisar(i._id, { isReplacement: true, replacedUserId: i.reemplazadoDePersonaId || undefined });
                        setNombresReemplazados((n) => ({ ...n, [i._id]: i.reemplazadoDeNombre }));
                        setAbierto(i._id);
                      }}
                      className="shrink-0 font-bold underline"
                    >
                      Sí, cubre
                    </button>
                  </div>
                )}

                {abiertoAca && !excluido && (
                  <div className="space-y-4 border-t border-slate-100 p-3 dark:border-slate-800">
                    <p className="text-[11px] text-slate-500">Lo que cambies acá vale sólo para esta contratación: la plantilla no cambia.</p>
                    <div>
                      <Rotulo accion={p.inTime || p.outTime ? <button type="button" onClick={() => pisar(i._id, { inTime: undefined, outTime: undefined })} className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Volver al de la plantilla</button> : undefined}>Horario</Rotulo>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <SelectorHora valor={p.inTime || ""} onCambio={(h) => pisar(i._id, { inTime: h || undefined })} etiqueta="Entrada" placeholder={i.inTime || plantilla.inTime || "Entrada"} className={CLASE_HORA} zIndex={110} />
                        </div>
                        <FontAwesomeIcon icon={faArrowRight} className="text-xs text-slate-400" />
                        <div className="flex-1">
                          <SelectorHora valor={p.outTime || ""} onCambio={(h) => pisar(i._id, { outTime: h || undefined })} etiqueta="Salida" placeholder={i.outTime || plantilla.outTime || "Salida"} desde={p.inTime || i.inTime || plantilla.inTime} className={CLASE_HORA} zIndex={110} />
                        </div>
                      </div>
                    </div>
                    {!esServicios && (
                      <div>
                        <Rotulo>Categoría</Rotulo>
                        <select value={p.categoriaSatId || ""} onChange={(e) => pisar(i._id, { categoriaSatId: e.target.value || undefined })} className={CLASE_CAMPO}>
                          <option value="">La de la plantilla{f?.categoriaNombre && !p.categoriaSatId ? ` (${f.categoriaNombre})` : ""}</option>
                          {categorias.map((c) => (
                            <option key={c._id} value={c._id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div>
                      <Rotulo>Importe por jornada</Rotulo>
                      <input type="number" inputMode="decimal" min={0} step="0.01" value={p.dailyRate ?? ""} onChange={(e) => pisar(i._id, { dailyRate: Number(e.target.value) > 0 ? Number(e.target.value) : undefined })} placeholder={f?.importes.jornada ? `${pesos(f.importes.jornada)} (${f.origenImporte === "plantilla" ? "fijado en la plantilla" : "de la escala"})` : "El de la escala"} className={CLASE_CAMPO} />
                    </div>
                    {porDiasSueltos && (
                      <div>
                        <CustomMultiDatePicker label="Otros días para esta persona" value={p.fechas || []} onChange={(d: string | string[]) => pisar(i._id, { fechas: [...new Set(Array.isArray(d) ? d : d ? [d] : [])].sort() })} minDate={fechaDeHoy()} />
                        <p className="mt-1 text-[11px] text-slate-400">{p.fechas?.length ? `${p.fechas.length} jornadas propias` : "Vacío = los días del equipo."}</p>
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <label className="flex items-center justify-between gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                        ¿Reemplazo?
                        <input type="checkbox" checked={!!p.isReplacement} onChange={(e) => pisar(i._id, e.target.checked ? { isReplacement: true } : { isReplacement: false, motivoReemplazoId: undefined, replacedUserId: undefined })} className="h-5 w-5" />
                      </label>
                      {p.isReplacement && (
                        <div className="mt-3 space-y-3">
                          <div>
                            <Rotulo obligatorio>Motivo</Rotulo>
                            <select value={p.motivoReemplazoId || ""} onChange={(e) => pisar(i._id, { motivoReemplazoId: e.target.value || undefined })} className={CLASE_CAMPO}>
                              <option value="">Elegí el motivo…</option>
                              {catalogos.motivos.map((m) => (
                                <option key={m._id} value={m._id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Rotulo obligatorio>¿A quién reemplaza?</Rotulo>
                            <button type="button" onClick={() => setAQuienReemplaza(i._id)} className={`${CLASE_CAMPO} text-left ${p.replacedUserId ? "" : "text-slate-400"}`}>
                              {p.replacedUserId ? nombresReemplazados[i._id] || "Elegida" : "Elegí del equipo del proyecto…"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <PersonaPickerModal
        isOpen={!!completandoPuesto}
        onClose={() => setCompletandoPuesto(null)}
        titulo={(() => {
          const i = plantilla.integrantes.find((x) => x._id === completandoPuesto);
          return i ? `¿Quién ocupa el puesto de ${nombreRol(i.rolesFrame)}?` : "";
        })()}
        rolInicial={(() => {
          const i = plantilla.integrantes.find((x) => x._id === completandoPuesto);
          return i ? catalogos.roleFrames.find((r) => r._id === i.rolesFrame[0])?.name : undefined;
        })()}
        excluir={[...(plantilla.integrantes.map((x) => x.userId).filter(Boolean) as string[]), ...Object.entries(puntuales).filter(([k, v]) => k !== completandoPuesto && v.userId).map(([, v]) => v.userId!)]}
        roleFrames={catalogos.roleFrames}
        onElegir={(ps) => {
          const id = completandoPuesto;
          if (!id || !ps[0]) return;
          pisar(id, { userId: ps[0]._id });
          setNombresElegidos((n) => ({ ...n, [id]: ps[0].nombre }));
        }}
      />
      <PersonaPickerModal
        isOpen={!!aQuienReemplaza}
        onClose={() => setAQuienReemplaza(null)}
        titulo="¿A quién reemplaza?"
        projectId={proyecto?._id}
        roleFrames={catalogos.roleFrames}
        onElegir={(ps) => {
          const id = aQuienReemplaza;
          if (!id || !ps[0]) return;
          pisar(id, { replacedUserId: ps[0]._id });
          setNombresReemplazados((n) => ({ ...n, [id]: ps[0].nombre }));
        }}
      />
    </Modal>
  );
}

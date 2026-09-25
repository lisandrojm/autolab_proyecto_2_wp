import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation, faClone, faSliders, faSpinner, faTriangleExclamation, faUsers } from "@fortawesome/free-solid-svg-icons";
import Swal from "sweetalert2";
import { Modal } from "../Modal";
import { CustomDatePicker } from "../CustomDatePicker";
import { CustomMultiDatePicker } from "../CustomMultiDatePicker";
import { Equipo, PedidoDeContratacion, Plantilla, plantillasEquipoAPI, Preview, Puesto, puestosDelEquipo } from "../../../../../api/plantillasEquipo";
import { Project } from "../../../../../api/projects";
import { CatalogosContratacion, etiquetaProyecto } from "./useCatalogosContratacion";
import { sweetAlert } from "../../utils/sweetAlert";
import { esc, fechaCorta, fechaDeHoy, pesos } from "./comun";

/*
  «CONTRATAR TODOS»: todos los equipos de una plantilla de una vez.

  Cada equipo lleva SUS fechas (el de «Sábado noche» y el de «Domingo tarde» no trabajan los mismos
  días); «Usar en todos» copia las de uno a los demás. El server arma un plan por equipo —con los
  avisos de superposición entre equipos: la misma persona en dos que se pisan— y, al confirmar, crea
  todo en una transacción: si un equipo tiene errores, no sale ninguno. Un lote por equipo, así el
  Historial los sigue mostrando por separado.

  Lo que se cambia «sólo esta vez» por persona (otra persona, otro horario, un reemplazo) no se hace
  acá: para eso está «Ajustar», que abre la contratación de ese equipo solo.
*/
interface Props {
  isOpen: boolean;
  onClose: () => void;
  plantilla: Plantilla | null;
  proyecto: Project | null;
  catalogos: CatalogosContratacion;
  onContratada: () => void;
  /** Abrir la contratación de un solo equipo, para ajustar persona por persona. */
  onAjustar: (equipoId: string) => void;
}

interface FechasEquipo {
  incluido: boolean;
  fechas: string[];
  desde: string;
  hasta: string;
}

const nuevaClave = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export default function ContratarTodosModal({ isOpen, onClose, plantilla, proyecto, catalogos, onContratada, onAjustar }: Props) {
  const [porEquipo, setPorEquipo] = useState<Record<string, FechasEquipo>>({});
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [calculando, setCalculando] = useState(false);
  const clave = useRef(nuevaClave());

  useEffect(() => {
    if (!isOpen || !plantilla) return;
    setPorEquipo(Object.fromEntries(plantilla.equipos.map((e) => [e._id, { incluido: true, fechas: [], desde: "", hasta: "" }])));
    setPreviews({});
    clave.current = nuevaClave();
  }, [isOpen, plantilla?._id]);

  // Qué fechas pide cada equipo, según el tipo de contrato de los puestos que usa.
  const contratoDe = (i: Puesto) => catalogos.contratos.find((c) => c._id === i.contratoId) as any;
  const porDiasSueltos = (i: Puesto) => contratoDe(i)?.data?.modoFechas === "dias";
  const formaDe = (e: Equipo) => {
    const puestos = plantilla ? puestosDelEquipo(plantilla, e) : [];
    const conDias = puestos.some(porDiasSueltos);
    const conPeriodo = puestos.some((i) => !porDiasSueltos(i));
    const indeterminado = conPeriodo && puestos.filter((i) => !porDiasSueltos(i)).every((i) => !!contratoDe(i)?.data?.esTiempoIndeterminado);
    return { puestos, conDias, conPeriodo, indeterminado };
  };
  const completo = (e: Equipo) => {
    const f = porEquipo[e._id];
    if (!f) return false;
    const { conDias, conPeriodo, indeterminado } = formaDe(e);
    return (!conDias || f.fechas.length > 0) && (!conPeriodo || (!!f.desde && (indeterminado || !!f.hasta)));
  };
  const incluidos = (plantilla?.equipos || []).filter((e) => porEquipo[e._id]?.incluido);
  const listos = incluidos.filter(completo);

  const pedidos: PedidoDeContratacion[] = useMemo(
    () =>
      listos.map((e) => {
        const f = porEquipo[e._id];
        const { conDias, conPeriodo, indeterminado } = formaDe(e);
        return { equipoId: e._id, ...(conDias ? { fechas: f.fechas } : {}), ...(conPeriodo ? { desde: f.desde, hasta: indeterminado ? undefined : f.hasta } : {}), puntuales: {} };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [porEquipo, plantilla],
  );

  // El preview se pide con cada cambio, con una pausa: el server es el que calcula.
  useEffect(() => {
    if (!isOpen || !plantilla || pedidos.length === 0) {
      setPreviews({});
      return;
    }
    let vigente = true;
    setCalculando(true);
    const t = setTimeout(() => {
      plantillasEquipoAPI
        .previewVarios(plantilla._id, pedidos)
        .then((r) => vigente && setPreviews(Object.fromEntries(r.equipos.map((x) => [x.equipoId, x]))))
        .catch(() => vigente && setPreviews({}))
        .finally(() => vigente && setCalculando(false));
    }, 500);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [isOpen, plantilla, pedidos]);

  if (!plantilla) return null;

  const cambiar = (id: string, x: Partial<FechasEquipo>) => setPorEquipo((p) => ({ ...p, [id]: { ...p[id], ...x } }));
  const usarEnTodos = (id: string) => {
    const f = porEquipo[id];
    setPorEquipo((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, fechas: [...f.fechas], desde: f.desde, hasta: f.hasta }])));
  };

  const totales = listos.reduce(
    (t, e) => {
      const pv = previews[e._id];
      return pv ? { personas: t.personas + pv.totales.personas, jornadas: t.jornadas + pv.totales.jornadas, importe: t.importe + pv.totales.importe } : t;
    },
    { personas: 0, jornadas: 0, importe: 0 },
  );
  const conErrores = listos.filter((e) => (previews[e._id]?.errores.length || 0) > 0);
  const puedeContratar = incluidos.length > 0 && listos.length === incluidos.length && listos.every((e) => previews[e._id]) && conErrores.length === 0 && !calculando;

  const contratar = async () => {
    const bloques = listos
      .map((e) => {
        const pv = previews[e._id];
        const f = porEquipo[e._id];
        const { conDias, conPeriodo, indeterminado } = formaDe(e);
        const periodo = [conDias ? `${f.fechas.length} jornada(s): ${f.fechas.map(fechaCorta).join(" · ")}` : "", conPeriodo ? `${fechaCorta(f.desde)} → ${indeterminado ? "sin fecha de baja" : fechaCorta(f.hasta)}` : ""].filter(Boolean).join(" / ");
        const avisos = pv.filas.filter((x) => !x.excluido && x.advertencias.length).map((x) => `<div style="color:${x.superposicionHorario ? "#f87171" : "#fbbf24"};font-size:11px">⚠ ${esc(x.nombre)}: ${x.advertencias.map(esc).join(" ")}</div>`);
        return `<div style="padding:8px 0;border-bottom:1px solid rgba(148,163,184,.25)">
          <div style="display:flex;justify-content:space-between;gap:8px"><b>«${esc(e.nombre)}»</b><b>${pesos(pv.totales.importe)}</b></div>
          <div style="font-size:11px;opacity:.8">${pv.totales.personas} personas · ${pv.totales.jornadas} jornadas · ${esc(periodo)}</div>${avisos.join("")}</div>`;
      })
      .join("");
    const html = `<div style="font-size:12px;line-height:1.45">
      <div style="margin-bottom:8px;opacity:.9"><b>${esc(plantilla.nombre)}</b><br>${esc(proyecto ? etiquetaProyecto(proyecto) : "")}</div>
      ${bloques}
      <div style="display:flex;justify-content:space-between;margin-top:10px;font-size:14px"><b>${listos.length} equipos · ${totales.personas} personas</b><b>${pesos(totales.importe)}</b></div>
    </div>`;
    const r = await sweetAlert.resumenLote({
      title: "¿Contratar todos los equipos?",
      html,
      confirmText: `Confirmar y enviar (${totales.personas})`,
      enviar: () => plantillasEquipoAPI.contratarVarios(plantilla._id, pedidos, clave.current),
    });
    if (!r) return;
    if (r.ok) {
      clave.current = nuevaClave();
      const n = r.valor.lotes.reduce((s, l) => s + l.solicitudIds.length, 0);
      await Swal.fire({ icon: "success", title: r.valor.repetido ? "Ya se había enviado" : "Solicitudes enviadas", text: `Se enviaron ${n} solicitudes de ${r.valor.lotes.length} equipos. Quedan pendientes de aprobación.`, confirmButtonColor: "#3b82f6", customClass: { popup: "mobile-swal-popup", title: "mobile-swal-title" } });
      onContratada();
      onClose();
      return;
    }
    // Falló: nada se creó (es todo o nada). Se muestra el detalle por equipo y se conserva lo cargado.
    const datos = r.error?.response?.data;
    if (Array.isArray(datos?.plan?.equipos)) setPreviews(Object.fromEntries(datos.plan.equipos.map((x: any) => [x.equipoId, x])));
    sweetAlert.error("No se envió ninguna solicitud", datos?.error || "Probá de nuevo en un momento.");
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Contratar todos: ${plantilla.nombre}`}
      subtitle={proyecto ? etiquetaProyecto(proyecto) : undefined}
      size="lg"
      zIndex={60}
      footer={
        <div className="w-full space-y-2">
          {totales.personas > 0 && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                {listos.length} equipos · {totales.personas} personas · {totales.jornadas} jornadas · <b className="text-slate-800 dark:text-slate-100">{pesos(totales.importe)}</b>
              </span>
              {conErrores.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                  <FontAwesomeIcon icon={faCircleExclamation} />
                  {conErrores.length} con errores
                </span>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-700 py-3 text-sm font-bold text-white">
              Cancelar
            </button>
            <button type="button" onClick={() => void contratar()} disabled={!puedeContratar} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white disabled:opacity-40">
              {calculando && <FontAwesomeIcon icon={faSpinner} spin />}
              Contratar todos {totales.personas ? `(${totales.personas})` : ""}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">Elegí las fechas de cada equipo. Se envían todos juntos: si alguno tiene errores, no sale ninguno. Para cambiar a alguien o su horario sólo esta vez, usá «Ajustar».</p>
        {plantilla.equipos.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">La plantilla no tiene equipos.</p>}
        {plantilla.equipos.map((e) => {
          const f = porEquipo[e._id];
          if (!f) return null;
          const { puestos, conDias, conPeriodo, indeterminado } = formaDe(e);
          const pv = f.incluido ? previews[e._id] : undefined;
          const errores = pv ? [...pv.errores.filter((x) => !/integrantes? tienen? errores/.test(x)), ...pv.filas.filter((x) => !x.excluido && x.errores.length).map((x) => `${x.nombre}: ${x.errores.join(" ")}`)] : [];
          const avisos = pv ? pv.filas.filter((x) => !x.excluido && x.advertencias.length) : [];
          return (
            <div key={e._id} className={`rounded-xl border bg-white p-3 dark:bg-slate-900/60 ${!f.incluido ? "border-slate-200 opacity-60 dark:border-slate-700" : errores.length ? "border-red-400 dark:border-red-800" : avisos.length ? "border-amber-300 dark:border-amber-800/60" : "border-slate-200 dark:border-slate-700"}`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={f.incluido} onChange={(x) => cambiar(e._id, { incluido: x.target.checked })} className="h-5 w-5 shrink-0 rounded" aria-label={`Incluir ${e.nombre}`} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-bold text-slate-900 dark:text-white">
                    <FontAwesomeIcon icon={faUsers} className="h-3 w-3 text-slate-400" />
                    {e.nombre}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {puestos.length} puestos
                    {pv ? ` · ${pv.totales.personas} personas · ${pv.totales.jornadas} jornadas · ${pesos(pv.totales.importe)}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onAjustar(e._id);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300"
                >
                  <FontAwesomeIcon icon={faSliders} />
                  Ajustar
                </button>
              </div>

              {f.incluido && (
                <div className="mt-3 space-y-2">
                  {conDias && (
                    <>
                      <CustomMultiDatePicker label={conPeriodo ? "Días de los puestos por jornada" : "Días que trabaja"} value={f.fechas} onChange={(d: string | string[]) => cambiar(e._id, { fechas: [...new Set(Array.isArray(d) ? d : d ? [d] : [])].sort() })} minDate={fechaDeHoy()} />
                      {f.fechas.length > 0 && <p className="text-[11px] text-slate-400">{f.fechas.length} {f.fechas.length === 1 ? "jornada" : "jornadas"}: {f.fechas.map(fechaCorta).join(" · ")}</p>}
                    </>
                  )}
                  {conPeriodo && (
                    <div className="grid grid-cols-2 gap-3">
                      <CustomDatePicker label="Desde" value={f.desde} onChange={(v: string) => cambiar(e._id, { desde: v })} />
                      {indeterminado ? <p className="self-end pb-3 text-[11px] text-slate-400">Tiempo indeterminado: sin fecha de baja.</p> : <CustomDatePicker label="Hasta" value={f.hasta} onChange={(v: string) => cambiar(e._id, { hasta: v })} />}
                    </div>
                  )}
                  {plantilla.equipos.length > 1 && completo(e) && (
                    <button type="button" onClick={() => usarEnTodos(e._id)} className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                      <FontAwesomeIcon icon={faClone} className="mr-1" />
                      Usar estas fechas en todos los equipos
                    </button>
                  )}
                  {errores.map((m) => (
                    <p key={m} className="flex items-start gap-1.5 rounded-lg bg-red-50 p-2 text-[11px] text-red-700 dark:bg-red-900/20 dark:text-red-300">
                      <FontAwesomeIcon icon={faCircleExclamation} className="mt-0.5 shrink-0" />
                      {m}
                    </p>
                  ))}
                  {avisos.map((x) => (
                    <p key={x.integranteId} className={`flex items-start gap-1.5 rounded-lg p-2 text-[11px] ${x.superposicionHorario ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" : "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"}`}>
                      <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 shrink-0" />
                      <span>
                        <b>{x.nombre}:</b> {x.advertencias.join(" ")}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

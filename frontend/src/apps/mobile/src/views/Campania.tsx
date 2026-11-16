import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarAlt, faCheck, faCircleCheck, faClock, faFilePdf, faHourglassHalf, faPlus, faTrash, faTriangleExclamation, faUmbrellaBeach } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../../../components/ui/LoadingSpinner";
import { campaniasVacacionesAPI, errorDeCampania, type MiInvitacion, type Tramo } from "../../../../api/campaniasVacaciones";
import { fechaCorta } from "@compartido/planVacaciones/fechas";
import { ETIQUETA_ESTADO, OTORGADOS, contarDiasTramo, validarPropuesta } from "@compartido/vacaciones/campania";
import { getImageUrl } from "../../../../utils/imageHelpers";
import SectionHeader from "../components/SectionHeader";
import { CustomDatePicker } from "../components/CustomDatePicker";
import { useRefrescoEnFoco } from "../hooks/useRefrescoEnFoco";
import { sweetAlert } from "../utils/sweetAlert";
import { ViewType } from "../types";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «ELEGÍ TUS VACACIONES» (campaña de goce, 15/11/2026)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * La empresa invita a elegir las vacaciones de la temporada dentro de la ventana, con fecha límite. Acá
 * la persona acusa recibo, propone uno o más tramos (las mismas reglas que el server, de
 * `@compartido/vacaciones/campania`), sigue la aprobación y, al otorgarse, acusa recibo del aviso por
 * escrito. Si no elige a tiempo, la empresa le asigna un tramo único: nunca se paga en lugar de gozar.
 */

const INFO =
  "La empresa te invita a elegir tus vacaciones de la temporada dentro de la ventana, antes de la fecha límite.\n\nPodés tomarlas de una vez o dividirlas en tramos (cada uno de al menos el mínimo). Tu propuesta la aprueba tu supervisor, tu coordinador y RR.HH.; cuando se aprueba te llega el aviso por escrito y acusás recibo.\n\nSi no elegís a tiempo, la empresa te asigna un período continuo. Las vacaciones se gozan: no se pagan en lugar de tomarlas.";

const caja = "rounded-xl border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70";
const TEXTO_STATUS: Record<string, string> = { pending: "Esperando aprobación", pre_approved: "Esperando a RR.HH.", approved: "Aprobada", delivered: "Aprobada", rejected: "Rechazada", cancelled: "Cancelada" };

export default function Campania({ onNavigate }: { onNavigate: (view: ViewType) => void }) {
  const [datos, setDatos] = useState<MiInvitacion | null | undefined>(undefined);
  const [tramos, setTramos] = useState<Tramo[]>([{ desde: "", hasta: "" }]);
  const [enviando, setEnviando] = useState(false);

  const cargar = useCallback(() => {
    campaniasVacacionesAPI
      .mia()
      .then(setDatos)
      .catch(() => setDatos(null));
  }, []);
  useEffect(() => {
    cargar();
  }, [cargar]);
  useRefrescoEnFoco(cargar);

  const inv = datos?.invitacion;
  const c = datos?.campania;
  const diasCorridos = inv?.diasCorridos ?? true;
  const completos = tramos.filter((t) => t.desde && t.hasta);
  const suma = completos.reduce((s, t) => s + (t.hasta >= t.desde ? contarDiasTramo(t, diasCorridos) : 0), 0);
  const errores = useMemo(
    () =>
      datos && c && inv
        ? validarPropuesta({ tramos: completos, diasDisponibles: datos.diasDisponibles, ventana: { desde: c.ventanaDesde, hasta: c.ventanaHasta }, ventanaPersona: (inv as any).ventanaPersona?.enabled ? (inv as any).ventanaPersona : null, hoy: datos.hoy, avisoDias: c.avisoMinimoDias, minPorTramo: c.minDiasPorTramo, diasCorridos })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos, JSON.stringify(completos)],
  );

  const accion = async (fn: () => Promise<MiInvitacion | null>, ok?: string) => {
    setEnviando(true);
    try {
      setDatos(await fn());
      if (ok) sweetAlert.success("Listo", ok);
    } catch (e) {
      sweetAlert.error("No se pudo", errorDeCampania(e));
    } finally {
      setEnviando(false);
    }
  };

  const proponer = async () => {
    const r = await sweetAlert.confirm("¿Enviar tu propuesta?", `${completos.map((t) => `${fechaCorta(t.desde)} al ${fechaCorta(t.hasta)}`).join(" y ")} (${suma} días). La revisan tu supervisor, tu coordinador y RR.HH.`, "Enviar");
    if (!r.isConfirmed) return;
    await accion(() => campaniasVacacionesAPI.proponer(completos), "Tu propuesta quedó enviada. Te avisamos cuando se apruebe.");
  };

  if (datos === undefined) return <LoadingSpinner message="Cargando..." />;

  const encabezado = <SectionHeader icon={faUmbrellaBeach} titulo="Elegí tus vacaciones" onBack={() => onNavigate("home")} info={INFO} />;
  if (!datos || !inv || !c)
    return (
      <div className="flex-1 pb-24">
        {encabezado}
        <div className="px-4 pt-4">
          <div className="flex flex-col items-center rounded-xl border bg-slate-50 p-10 text-center dark:bg-slate-800/50">
            <FontAwesomeIcon icon={faUmbrellaBeach} className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No tenés una invitación para elegir vacaciones.</p>
          </div>
        </div>
      </div>
    );

  const desdeMinimo = datos.primerInicioPosible > c.ventanaDesde ? datos.primerInicioPosible : c.ventanaDesde;
  const otorgada = OTORGADOS.includes(inv.estado);
  const faltan = datos.diasParaLaFechaLimite;

  return (
    <div className="flex-1 pb-24">
      {encabezado}
      <div className="space-y-3 px-4 pt-4">
        {/* Lo que le toca y hasta cuándo. */}
        <div className={caja}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{c.nombre}</p>
              <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">{datos.diasDisponibles} días</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {diasCorridos ? "corridos" : "hábiles"}, entre el {fechaCorta(c.ventanaDesde)} y el {fechaCorta(c.ventanaHasta)}
              </p>
            </div>
            <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">{ETIQUETA_ESTADO[datos.estadoVisible]}</span>
          </div>
          {/* El recordatorio es siempre ámbar, aunque falten pocos días: informa, no alarma. */}
          {datos.puedeProponer && (
            <div className="mt-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-950/20">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                <FontAwesomeIcon icon={faHourglassHalf} />
                {faltan === 0 ? "Hoy es el último día para elegir" : `Te quedan ${faltan} día(s) para elegir (hasta el ${fechaCorta(c.fechaLimite)})`}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                Si para esa fecha todavía no elegiste, no te preocupes: la empresa te propone unas fechas para que no te quedes sin organizarlas.
              </p>
            </div>
          )}
        </div>

        {/* El acuse de la invitación. */}
        {!inv.acuseInvitacionAt && datos.puedeProponer && (
          <button type="button" disabled={enviando} onClick={() => accion(() => campaniasVacacionesAPI.acusar(), "Registramos que recibiste la invitación.")} className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 py-3 text-sm font-bold text-primary active:scale-[0.99] disabled:opacity-50">
            <FontAwesomeIcon icon={faCircleCheck} /> Recibí la invitación
          </button>
        )}
        {inv.acuseInvitacionAt && !otorgada && <p className="text-center text-[11px] text-slate-400">Acusaste recibo el {new Date(inv.acuseInvitacionAt).toLocaleString("es-AR")}</p>}

        {inv.estado === "rechazada" && inv.rechazo && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            <FontAwesomeIcon icon={faTriangleExclamation} className="mr-2" />
            No se aprobó parte de tu propuesta{inv.rechazo.motivo ? `: ${inv.rechazo.motivo}` : ""}. Elegí de nuevo esos días.
          </div>
        )}

        {/* Lo propuesto o lo asignado, con su estado. */}
        {datos.vacaciones.length > 0 && (
          <div className={caja}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{inv.asignacion?.vacationId ? "Asignadas por la empresa" : "Tu propuesta"}</p>
            <div className="space-y-2">
              {datos.vacaciones.map((v) => (
                <div key={v._id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
                    <FontAwesomeIcon icon={faCalendarAlt} className="text-primary opacity-70" />
                    {fechaCorta(String(v.startDate).slice(0, 10))} al {fechaCorta(String(v.endDate).slice(0, 10))} · {v.daysRequested} d
                  </span>
                  <span className={`shrink-0 text-[11px] font-bold ${["approved", "delivered"].includes(v.status) ? "text-emerald-600 dark:text-emerald-400" : ["rejected", "cancelled"].includes(v.status) ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>{TEXTO_STATUS[v.status] || v.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {inv.estado === "vencido_sin_definir" && (
          <div className={`${caja} text-sm text-slate-700 dark:text-slate-300`}>
            <FontAwesomeIcon icon={faClock} className="mr-2 text-amber-500" />
            Venció el plazo para elegir. La empresa te va a asignar un período continuo y te llega el aviso por escrito acá.
          </div>
        )}

        {/* El aviso por escrito del otorgamiento, y su acuse. */}
        {otorgada && inv.notificacion && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider">Aviso de otorgamiento</p>
            <p className="whitespace-pre-wrap">{inv.notificacion.texto}</p>
            {inv.notificacion.pdfUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-3">
                {inv.notificacion.pdfUrls.map((u, k) => (
                  <a key={k} href={getImageUrl(u)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-violet-700 dark:text-violet-300">
                    <FontAwesomeIcon icon={faFilePdf} /> Ver PDF{inv.notificacion!.pdfUrls.length > 1 ? ` ${k + 1}` : ""}
                  </a>
                ))}
              </div>
            )}
            {inv.acuseOtorgamientoAt ? (
              <p className="mt-3 text-xs">
                <FontAwesomeIcon icon={faCircleCheck} className="mr-1" />
                Acusaste recibo el {new Date(inv.acuseOtorgamientoAt).toLocaleString("es-AR")}
              </p>
            ) : (
              <button type="button" disabled={enviando} onClick={() => accion(() => campaniasVacacionesAPI.acusarOtorgamiento(), "Registramos que recibiste el aviso.")} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white active:scale-[0.99] disabled:opacity-50">
                <FontAwesomeIcon icon={faCheck} /> Recibí el aviso
              </button>
            )}
          </div>
        )}

        {/* Elegir: uno o más tramos. */}
        {datos.puedeProponer && (
          <div className={caja}>
            <p className="mb-1 text-sm font-bold text-slate-900 dark:text-slate-100">Elegí tus fechas</p>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
              Desde el {fechaCorta(desdeMinimo)} (hay que avisarte con {c.avisoMinimoDias} días) hasta el {fechaCorta(c.ventanaHasta)}. Si las dividís, cada parte de al menos {c.minDiasPorTramo} días.
            </p>
            <div className="space-y-3">
              {tramos.map((t, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{tramos.length > 1 ? `Tramo ${i + 1}` : "Período"}</span>
                    <span className="text-xs text-slate-500">{t.desde && t.hasta && t.hasta >= t.desde ? `${contarDiasTramo(t, diasCorridos)} días` : ""}</span>
                    {tramos.length > 1 && (
                      <button type="button" onClick={() => setTramos(tramos.filter((_, k) => k !== i))} className="text-slate-400" aria-label="Quitar tramo">
                        <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <CustomDatePicker label="Desde" value={t.desde} minDate={desdeMinimo} maxDate={c.ventanaHasta} onChange={(d) => setTramos(tramos.map((x, k) => (k === i ? { ...x, desde: d, hasta: x.hasta && x.hasta < d ? "" : x.hasta } : x)))} />
                    <CustomDatePicker label="Hasta" value={t.hasta} minDate={t.desde || desdeMinimo} maxDate={c.ventanaHasta} onChange={(d) => setTramos(tramos.map((x, k) => (k === i ? { ...x, hasta: d } : x)))} />
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setTramos([...tramos, { desde: "", hasta: "" }])} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 py-2 text-xs font-bold text-slate-600 dark:border-slate-600 dark:text-slate-300">
              <FontAwesomeIcon icon={faPlus} /> Dividir en otro tramo
            </button>

            <p className={`mt-3 text-sm font-semibold ${suma === datos.diasDisponibles ? "text-emerald-600 dark:text-emerald-400" : "text-slate-600 dark:text-slate-300"}`}>
              {suma} de {datos.diasDisponibles} días
            </p>
            {completos.length > 0 && errores.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-red-600 dark:text-red-400">
                {errores.map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
            )}
            <button type="button" disabled={enviando || completos.length === 0 || errores.length > 0} onClick={proponer} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-100 py-3 text-sm font-bold text-green-700 active:bg-green-200 disabled:opacity-50 dark:border-green-900/60 dark:bg-green-900/30 dark:text-green-400">
              <FontAwesomeIcon icon={enviando ? faClock : faCheck} />
              {enviando ? "Enviando..." : "Enviar propuesta"}
            </button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-500 dark:text-slate-400">
              <span aria-hidden="true">🌴</span>
              {faltan === 0 ? "Todavía estás a tiempo: hoy podés elegir con calma." : "Podés tomarte tu tiempo, estás a tiempo de elegir."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

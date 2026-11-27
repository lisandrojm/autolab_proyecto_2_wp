import { useCallback, useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarAlt, faCheck, faChevronRight, faCircleCheck, faClock, faFilePdf, faHourglassHalf, faPen, faPlus, faTrash, faTriangleExclamation, faUmbrellaBeach } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../../../components/ui/LoadingSpinner";
import { campaniasVacacionesAPI, errorDeCampania, type MiInvitacion, type Tramo } from "../../../../api/campaniasVacaciones";
import { fechaCorta } from "@compartido/planVacaciones/fechas";
import { contarDiasTramo, erroresDePropuesta, erroresDelTramo, minimoDelTramo } from "@compartido/vacaciones/campania";
import { TEXTO_ESTADO_VACACION, encabezado, erroresDelTramoEnPantalla, motivoDelBoton, parrafoDeInvitacion, pasoDe, progreso, puedeAgregarTramo, reglaDelPaso, situacionDe, textoDeFechas, textoDeRegreso, textoDelTramo, type DatosDePantalla } from "@compartido/vacaciones/pantallaEmpleado";
import { getImageUrl } from "../../../../utils/imageHelpers";
import SectionHeader from "../components/SectionHeader";
import CalendarioVacaciones, { type ModoCalendario } from "../components/CalendarioVacaciones";
import { useVacations } from "../hooks/useVacations";
import { useProfile } from "../hooks/useProfile";
import VacationDetailModal from "../components/VacationDetailModal";
import { vacationsAPI, type VacationRequest } from "../../../../api/vacations";
import { fechaPermitida, textoDeVentana } from "@compartido/ventanaGoce";
import { useRefrescoEnFoco } from "../hooks/useRefrescoEnFoco";
import { sweetAlert } from "../utils/sweetAlert";
import { ViewType } from "../types";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * «VACACIONES» DEL EMPLEADO INVITADO (campaña de goce, 15/11/2026; por pasos desde el 27/11/2026)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * La empresa invita a elegir las vacaciones de la temporada dentro de la ventana, con fecha límite. Esta
 * pantalla va por pasos, con una sola cosa protagonista en cada uno (las decisiones están en
 * `@compartido/vacaciones/pantallaEmpleado`, probadas):
 *   · A — invitada: qué le toca y hasta cuándo, y dos acciones: «Solicitar vacaciones» (registra el acuse de
 *     la invitación como acto de la persona y pasa a elegir) y «Mis solicitudes y saldo».
 *   · B — eligiendo: el avance en días, la regla en una línea, los tramos como tarjetas (editar y borrar,
 *     también con uno solo) y el botón de enviar fijo abajo, con el motivo neutro mientras no se pueda.
 *   · C — enviada, otorgada, asignada por la empresa o vencida: el resumen, quién la tiene y qué sigue; el
 *     aviso por escrito con su acuse cuando llega. Sin formulario.
 *
 * Las reglas de la propuesta son las mismas del server (`@compartido/vacaciones/campania`): lo que acá cambia
 * es que «te faltan repartir N días» es avance (gris) y sólo un tramo mal armado se marca en rojo. El texto
 * completo de las reglas vive en un solo lugar: el ⓘ del encabezado.
 */

const INFO =
  "La empresa te invita a elegir tus vacaciones de la temporada dentro de la ventana, antes de la fecha límite.\n\nPodés tomarlas de una vez o dividirlas en tramos: en orden de fecha, cada uno de al menos el mínimo, salvo el último si te quedan menos. Si tenés menos días que el mínimo, van seguidos. Si en tu rol eligen por antigüedad, esperás tu turno. Tu propuesta la aprueba tu supervisor, tu coordinador y RR.HH.; cuando se aprueba te llega el aviso por escrito y acusás recibo.\n\nSi no elegís a tiempo, la empresa te asigna un período continuo. Las vacaciones se gozan: no se pagan en lugar de tomarlas.";

const caja = "rounded-xl border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70";
const botonPrimario = "flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-white shadow-sm active:scale-[0.99] disabled:opacity-50";
const botonSecundario = "flex w-full items-center justify-between rounded-xl border bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm active:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200 dark:active:bg-slate-800";
const iso = (v: unknown): string => String(v ?? "").slice(0, 10);
const colorDeEstado = (status: string): string => (["approved", "delivered"].includes(status) ? "text-emerald-600 dark:text-emerald-400" : ["rejected", "cancelled"].includes(status) ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400");
const TRAMO_VACIO: Tramo = { desde: "", hasta: "" };

export default function Campania({ onNavigate }: { onNavigate: (view: ViewType) => void }) {
  const [datos, setDatos] = useState<MiInvitacion | null | undefined>(undefined);
  // Paso B: la persona entró a elegir (lo demás lo decide el server).
  const [eligiendo, setEligiendo] = useState(false);
  const [tramos, setTramos] = useState<Tramo[]>([TRAMO_VACIO]);
  const [enviando, setEnviando] = useState(false);
  // El calendario de «Mis Vacaciones», abierto para un tramo.
  const [calendario, setCalendario] = useState<{ tramo: number; modo: ModoCalendario | null } | null>(null);
  const { occupiedDates, pendingDates, refetch: refrescarOcupadas } = useVacations();
  // El detalle de un tramo (la misma ficha que «Mis Vacaciones»), con la cancelación de la campaña.
  const { profile } = useProfile();
  const [detalle, setDetalle] = useState<VacationRequest | null>(null);
  const abrirDetalle = async (id: string) => {
    try {
      setDetalle(await vacationsAPI.getById(id));
    } catch (e) {
      sweetAlert.error("No se pudo", errorDeCampania(e));
    }
  };

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
  // Lo que la pantalla decide con lo que manda el server.
  const pantalla: DatosDePantalla | null =
    datos && inv && c
      ? {
          estado: inv.estado,
          estadoVisible: datos.estadoVisible,
          puedeProponer: datos.puedeProponer,
          turnoCerradoDesde: datos.turno && !datos.turno.abierto ? datos.turno.desde || "" : null,
          diasDisponibles: datos.diasDisponibles,
          diasCorridos,
          minPorTramo: c.minDiasPorTramo,
          diasDeInicio: c.diasDeInicio,
          ventanaDesde: c.ventanaDesde,
          ventanaHasta: c.ventanaHasta,
          fechaLimite: c.fechaLimite,
          nombreCampania: c.nombre,
          acuseOtorgamientoAt: inv.acuseOtorgamientoAt,
          hayAviso: !!inv.notificacion,
          asignadaPorEmpresa: !!inv.asignacion?.vacationId,
          rechazoMotivo: inv.estado === "rechazada" && inv.rechazo ? inv.rechazo.motivo || "" : null,
          vacaciones: datos.vacaciones,
        }
      : null;
  const paso = pantalla ? pasoDe(pantalla, eligiendo) : null;

  // Los tramos con las dos fechas y en qué posición de `tramos` está cada uno (los errores apuntan a `completos`).
  const indicesCompletos = tramos.map((_, i) => i).filter((i) => tramos[i].desde && tramos[i].hasta);
  const completos = indicesCompletos.map((i) => tramos[i]);
  const erroresDeLaPropuesta = useMemo(
    () =>
      datos && c && inv
        ? erroresDePropuesta({ tramos: completos, diasDisponibles: datos.diasDisponibles, ventana: { desde: c.ventanaDesde, hasta: c.ventanaHasta }, ventanaPersona: (inv as any).ventanaPersona?.enabled ? (inv as any).ventanaPersona : null, hoy: datos.hoy, avisoDias: c.avisoMinimoDias, minPorTramo: c.minDiasPorTramo, diasCorridos, diasDeInicio: c.diasDeInicio })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [datos, JSON.stringify(completos)],
  );
  const avance = pantalla ? progreso(tramos, pantalla.diasDisponibles, diasCorridos) : null;
  const motivo = pantalla && avance ? motivoDelBoton({ tramos, errores: erroresDeLaPropuesta, indicesCompletos, faltan: avance.faltan }) : null;

  /** Una acción contra el server; `true` si salió. */
  const accion = async (fn: () => Promise<MiInvitacion | null>, ok?: string): Promise<boolean> => {
    setEnviando(true);
    try {
      setDatos(await fn());
      if (ok) sweetAlert.success("Listo", ok);
      return true;
    } catch (e) {
      sweetAlert.error("No se pudo", errorDeCampania(e));
      return false;
    } finally {
      setEnviando(false);
    }
  };

  // «Solicitar vacaciones»: el acuse de la invitación queda registrado como acto de la persona, y pasa a elegir.
  const solicitar = async () => {
    if (!inv?.acuseInvitacionAt && !(await accion(() => campaniasVacacionesAPI.acusar()))) return;
    setEligiendo(true);
  };

  const proponer = async () => {
    const r = await sweetAlert.confirm("¿Enviar tu propuesta?", `${completos.map((t) => `${fechaCorta(t.desde)} al ${fechaCorta(t.hasta)}`).join(" y ")} (${avance?.repartidos ?? 0} días). La revisan tu supervisor, tu coordinador y RR.HH.`, "Enviar");
    if (!r.isConfirmed) return;
    if (await accion(() => campaniasVacacionesAPI.proponer(completos), "Tu propuesta quedó enviada. Te avisamos cuando se apruebe.")) {
      setEligiendo(false);
      setTramos([TRAMO_VACIO]);
      await refrescarOcupadas();
    }
  };

  const agregarTramo = () => {
    setTramos([...tramos, TRAMO_VACIO]);
    setCalendario({ tramo: tramos.length, modo: "start" });
  };
  // Borrar el único tramo lo deja vacío: siempre se puede borrar (pedido del 27/11/2026).
  const borrarTramo = (i: number) => setTramos(tramos.length > 1 ? tramos.filter((_, k) => k !== i) : [TRAMO_VACIO]);

  if (datos === undefined) return <LoadingSpinner message="Cargando..." />;

  if (!datos || !inv || !c || !pantalla || !paso || !avance)
    return (
      <div className="flex-1 pb-24">
        <SectionHeader icon={faUmbrellaBeach} titulo="Vacaciones" onBack={() => onNavigate("home")} info={INFO} />
        <div className="px-4 pt-4">
          <div className="flex flex-col items-center rounded-xl border bg-slate-50 p-10 text-center dark:bg-slate-800/50">
            <FontAwesomeIcon icon={faUmbrellaBeach} className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500 dark:text-slate-400">No tenés una invitación para elegir vacaciones.</p>
          </div>
        </div>
      </div>
    );

  const desdeMinimo = datos.primerInicioPosible > c.ventanaDesde ? datos.primerInicioPosible : c.ventanaDesde;
  const ventanaPersona = (inv as any).ventanaPersona?.enabled ? (inv as any).ventanaPersona : null;
  // Lo que el calendario avisa del tramo que se está eligiendo: su mínimo al fraccionar y lo que está mal con lo elegido hasta ahora.
  const tramoEnEdicion = calendario ? tramos[calendario.tramo] : null;
  const minimoDelCalendario = calendario && tramoEnEdicion ? minimoDelTramo({ desde: tramoEnEdicion.desde, otros: tramos.filter((_, k) => k !== calendario.tramo), diasDisponibles: datos.diasDisponibles, minPorTramo: c.minDiasPorTramo, diasCorridos }) : 0;
  const kEnEdicion = calendario ? indicesCompletos.indexOf(calendario.tramo) : -1;
  const erroresDelCalendario = kEnEdicion >= 0 ? erroresDelTramo(erroresDeLaPropuesta, kEnEdicion).map((e) => e.mensaje) : [];
  const situacion = situacionDe(pantalla);

  const irAMisSolicitudes = (
    <button type="button" onClick={() => onNavigate("vacations")} className={botonSecundario}>
      <span className="flex items-center gap-2">
        <FontAwesomeIcon icon={faUmbrellaBeach} className="text-primary opacity-70" />
        Mis solicitudes y saldo
      </span>
      <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 text-slate-400" />
    </button>
  );

  // Lo propuesto o lo asignado, con su estado (A: lo que quedó de una propuesta rechazada en parte; C: la propuesta).
  const listaDeVacaciones = datos.vacaciones.length > 0 && (
    <div className="mt-2 space-y-2">
      {datos.vacaciones.map((v) => (
        <button type="button" key={v._id} onClick={() => abrirDetalle(v._id)} className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left active:bg-slate-100 dark:active:bg-slate-800">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-800 dark:text-slate-200">
              {textoDeFechas(iso(v.startDate), iso(v.endDate))} · {v.daysRequested} {v.daysRequested === 1 ? "día" : "días"}
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">{textoDeRegreso(iso(v.endDate))}</span>
          </span>
          <span className={`shrink-0 text-[11px] font-bold ${colorDeEstado(v.status)}`}>{TEXTO_ESTADO_VACACION[v.status] || v.status}</span>
          <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 shrink-0 text-slate-400" />
        </button>
      ))}
    </div>
  );

  return (
    <div className={`flex-1 ${paso === "B" ? "pb-44" : "pb-24"}`}>
      <SectionHeader icon={faUmbrellaBeach} titulo="Vacaciones" subtitulo={encabezado(pantalla)} onBack={() => (paso === "B" ? setEligiendo(false) : onNavigate("home"))} info={INFO} />

      {/* ───────── A: invitada ───────── */}
      {paso === "A" && (
        <div className="space-y-3 px-4 pt-4">
          <div className={caja}>
            <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">{c.nombre}</p>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-slate-100">
              {datos.diasDisponibles} {datos.diasDisponibles === 1 ? "día" : "días"}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{parrafoDeInvitacion(pantalla)}</p>
            {pantalla.rechazoMotivo != null && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 shrink-0" />
                <span>
                  No se aprobó parte de tu propuesta{pantalla.rechazoMotivo ? `: ${pantalla.rechazoMotivo}` : ""}. Elegí de nuevo esos días.
                </span>
              </p>
            )}
            {/* Eligen por antigüedad en su rol: espera su turno (no pierde su plazo). */}
            {datos.turno && !datos.turno.abierto && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-violet-50 p-3 text-sm text-violet-700 dark:bg-violet-950/20 dark:text-violet-300">
                <FontAwesomeIcon icon={faHourglassHalf} className="mt-0.5 shrink-0" />
                <span>
                  Tu turno para elegir empieza el {fechaCorta(datos.turno.desde || "")}: en tu rol eligen primero las personas con más antigüedad (sos la {datos.turno.orden}ª de {datos.turno.de}).
                </span>
              </p>
            )}
          </div>

          {listaDeVacaciones && (
            <div className={caja}>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Lo que ya quedó</p>
              {listaDeVacaciones}
            </div>
          )}

          <button type="button" disabled={!datos.puedeProponer || enviando} onClick={solicitar} className={botonPrimario}>
            <FontAwesomeIcon icon={enviando ? faClock : faCalendarAlt} />
            Solicitar vacaciones
          </button>
          {irAMisSolicitudes}
        </div>
      )}

      {/* ───────── B: eligiendo ───────── */}
      {paso === "B" && (
        <div className="space-y-3 px-4 pt-4">
          <div className={caja}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{avance.texto}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{avance.faltan > 0 ? `faltan ${avance.faltan}` : "completo"}</p>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${avance.total > 0 ? Math.min(100, Math.round((avance.repartidos / avance.total) * 100)) : 0}%` }} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{reglaDelPaso(pantalla)}</p>
          </div>

          {tramos.map((t, i) => {
            const texto = textoDelTramo(t, diasCorridos);
            const errores = erroresDelTramoEnPantalla(erroresDeLaPropuesta, indicesCompletos, i);
            return (
              <div key={i} className={`${caja} ${errores.length > 0 ? "border-red-300 dark:border-red-900/60" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{tramos.length > 1 ? `Tramo ${i + 1}` : "Tus vacaciones"}</p>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setCalendario({ tramo: i, modo: "start" })} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 active:bg-slate-100 dark:active:bg-slate-800" aria-label={`Editar ${tramos.length > 1 ? `tramo ${i + 1}` : "las fechas"}`}>
                      <FontAwesomeIcon icon={faPen} className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => borrarTramo(i)} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 active:bg-slate-100 dark:active:bg-slate-800" aria-label={`Borrar ${tramos.length > 1 ? `tramo ${i + 1}` : "las fechas"}`}>
                      <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {texto ? (
                  <>
                    <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{texto}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{textoDeRegreso(t.hasta)}</p>
                  </>
                ) : (
                  <button type="button" onClick={() => setCalendario({ tramo: i, modo: "start" })} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/50 py-2.5 text-sm font-semibold text-primary active:bg-primary/10">
                    <FontAwesomeIcon icon={faCalendarAlt} />
                    {t.desde ? `Desde el ${fechaCorta(t.desde)}: elegí hasta cuándo` : "Elegí las fechas"}
                  </button>
                )}
                {errores.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-red-600 dark:text-red-400">
                    {errores.map((e) => (
                      <li key={e}>· {e}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}

          {puedeAgregarTramo({ tramos, faltan: avance.faltan, diasDisponibles: pantalla.diasDisponibles, minPorTramo: pantalla.minPorTramo }) && (
            <button type="button" onClick={agregarTramo} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-bold text-slate-600 active:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:active:bg-slate-800">
              <FontAwesomeIcon icon={faPlus} /> Agregar tramo
            </button>
          )}

          {/* El botón fijo abajo, con el motivo en una línea neutra mientras no se pueda. */}
          <div className="fixed bottom-20 left-1/2 z-10 w-full -translate-x-1/2 px-4 xl:w-1/2">
            <div className="rounded-xl border bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <p className="mb-2 text-center text-xs text-slate-500 dark:text-slate-400">{motivo ?? "Todo repartido: podés enviar tu propuesta."}</p>
              <button type="button" disabled={!!motivo || enviando} onClick={proponer} className={botonPrimario}>
                <FontAwesomeIcon icon={enviando ? faClock : faCheck} />
                {enviando ? "Enviando..." : "Enviar propuesta"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────── C: enviada, otorgada, asignada o vencida ───────── */}
      {paso === "C" && (
        <div className="space-y-3 px-4 pt-4">
          <div className={caja}>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{situacion.titulo}</p>
            {listaDeVacaciones}
            {situacion.clave === "vencida" && (
              <p className="mt-2 flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <FontAwesomeIcon icon={faClock} className="mt-0.5 shrink-0 text-amber-500" />
                <span>Pasó el {fechaCorta(c.fechaLimite)} sin elegir.</span>
              </p>
            )}
            {situacion.detalle && <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{situacion.detalle}</p>}
            {situacion.queSigue && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{situacion.queSigue}</p>}
          </div>

          {/* El aviso por escrito del otorgamiento, y su acuse. */}
          {situacion.clave === "otorgada" && inv.notificacion && (
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

          {irAMisSolicitudes}
        </div>
      )}

      {/* Ver la propuesta completa; se puede cancelar mientras nada esté aprobado, nunca editar. */}
      <VacationDetailModal
        vacation={detalle}
        profile={profile}
        isOpen={!!detalle}
        onClose={() => setDetalle(null)}
        cancelacion={{
          permitida: !!detalle && !inv.asignacion?.vacationId && ["pending", "pre_approved"].includes(detalle.status) && !datos.vacaciones.some((v) => ["approved", "delivered"].includes(v.status)),
          titulo: "¿Cancelar tu propuesta?",
          texto:
            (datos.vacaciones.length > 1 ? `Se cancelan los ${datos.vacaciones.length} tramos de tu propuesta y se te devuelven los días.` : "Se cancela tu propuesta y se te devuelven los días.") +
            (datos.diasParaLaFechaLimite >= 0 ? " Después podés volver a elegir tus fechas." : " Como ya pasó la fecha límite, la empresa te va a proponer unas fechas."),
          cancelar: async () => {
            setDatos(await campaniasVacacionesAPI.cancelarPropuesta());
            setEligiendo(false);
            await refrescarOcupadas();
          },
        }}
      />

      {/* El mismo calendario que «Mis Vacaciones»: sólo cambia qué días se pueden elegir y el tope del tramo. */}
      {calendario && tramos[calendario.tramo] && (
        <CalendarioVacaciones
          modo={calendario.modo}
          setModo={(m) => setCalendario(m ? { ...calendario, modo: m } : null)}
          desde={tramos[calendario.tramo].desde}
          hasta={tramos[calendario.tramo].hasta}
          onCambiar={(desde, hasta) => setTramos(tramos.map((x, k) => (k === calendario.tramo ? { desde, hasta } : x)))}
          disponibles={datos.diasDisponibles - tramos.reduce((s, t, k) => s + (k !== calendario.tramo && t.desde && t.hasta && t.hasta >= t.desde ? contarDiasTramo(t, diasCorridos) : 0), 0)}
          diasCorridos={diasCorridos}
          ocupadas={occupiedDates}
          pendientes={pendingDates || []}
          permitida={(f) => f >= desdeMinimo && f <= c.ventanaHasta && (!ventanaPersona || fechaPermitida(f, ventanaPersona))}
          textoVentana={`entre el ${fechaCorta(desdeMinimo)} y el ${fechaCorta(c.ventanaHasta)}${ventanaPersona ? ` (${textoDeVentana(ventanaPersona)})` : ""}`}
          mesInicial={desdeMinimo}
          diasDeInicio={c.diasDeInicio}
          minimo={minimoDelCalendario}
          errores={erroresDelCalendario}
          onConfirmar={() => setCalendario(null)}
        />
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase, faCalendarAlt, faCircleCheck, faClock, faTriangleExclamation, faUsers } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../../../../components/ui/LoadingSpinner";
import { vacationsAPI, type DetalleParaAprobar } from "../../../../api/vacations";
import { fechaCorta } from "@compartido/planVacaciones/fechas";
import { textoDeDias } from "../../../../utils/jerarquiaTurnos";
import { getImageUrl } from "../../../../utils/imageHelpers";
import { Modal } from "./Modal";

/**
 * EL DETALLE DE UNA SOLICITUD PARA QUIEN LA APRUEBA (16/11/2026, pedido del usuario).
 *
 * Lo abre la tarjeta de «Aprobaciones»: la solicitud, la persona (rol empresa, antigüedad, saldo), por
 * cada proyecto donde aprobás su contrato, área y turno, y quiénes del proyecto están de vacaciones en
 * esas fechas —primero los de su misma área y turno—, más sus otras vacaciones del año. Los datos los arma
 * el server (`services/vacaciones/detalleParaAprobar.ts`); sin sueldos, porque lo ven también los supervisores.
 */

const STATUS: Record<string, { texto: string; clase: string }> = {
  pending: { texto: "Pendiente", clase: "text-amber-600 dark:text-amber-400" },
  pre_approved: { texto: "Espera a RR.HH.", clase: "text-amber-600 dark:text-amber-400" },
  approved: { texto: "Aprobada", clase: "text-emerald-600 dark:text-emerald-400" },
  delivered: { texto: "Entregada", clase: "text-emerald-600 dark:text-emerald-400" },
  rejected: { texto: "Rechazada", clase: "text-red-600 dark:text-red-400" },
  cancelled: { texto: "Cancelada", clase: "text-slate-500" },
};
const ORIGEN: Record<string, string> = { solicitud: "Pedido de la persona", plan: "Plan por proyecto", campania: "Campaña de goce" };

/** El día que vuelve: el siguiente hábil (lunes a viernes) al último de vacaciones. */
function regreso(hasta: string): string {
  const d = new Date(`${hasta}T12:00:00`);
  do d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6);
  return d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
}

const Fila = ({ label, valor }: { label: string; valor?: React.ReactNode }) =>
  valor === "" || valor == null ? null : (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0 dark:border-slate-800">
      <p className="shrink-0 pt-0.5 text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <div className="min-w-0 break-words text-right text-sm font-semibold text-slate-800 dark:text-slate-200">{valor}</div>
    </div>
  );

const Bloque = ({ titulo, icono, children }: { titulo: string; icono: any; children: React.ReactNode }) => (
  <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
      <FontAwesomeIcon icon={icono} className="h-3 w-3 text-primary opacity-70" />
      {titulo}
    </p>
    {children}
  </div>
);

interface Props {
  vacationId: string | null;
  onClose: () => void;
  /** Los botones de la tarjeta (aprobar/rechazar o pedirle al supervisor), para decidir sin volver a la lista. */
  acciones?: React.ReactNode;
}

export default function DetalleAprobacionModal({ vacationId, onClose, acciones }: Props) {
  const [d, setD] = useState<DetalleParaAprobar | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!vacationId) return;
    let cancelado = false;
    setD(null);
    setError("");
    vacationsAPI
      .detalleParaAprobar(vacationId)
      .then((x) => !cancelado && setD(x))
      .catch((e) => !cancelado && setError(e?.response?.data?.error || "No se pudo cargar el detalle."));
    return () => {
      cancelado = true;
    };
  }, [vacationId]);

  if (!vacationId) return null;
  const s = d?.solicitud;
  const p = d?.persona;
  const iniciales = (p?.nombre || "")
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Modal isOpen onClose={onClose} title={p?.nombre || "Detalle de la solicitud"} subtitle={s?.vacationNumber} size="md" footer={d && acciones ? <div className="w-full">{acciones}</div> : undefined}>
      {error ? (
        <p className="p-6 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : !d || !s || !p ? (
        <LoadingSpinner message="Cargando datos..." />
      ) : (
        <div className="space-y-3">
          {/* La solicitud. */}
          <Bloque titulo="Solicitud" icono={faCalendarAlt}>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                {fechaCorta(s.desde)} al {fechaCorta(s.hasta)}
              </p>
              <span className="shrink-0 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                {s.dias} días{s.diasCorridos === null ? "" : s.diasCorridos ? " corridos" : " hábiles"}
              </span>
            </div>
            <Fila label="Vuelve" valor={<span className="capitalize">{regreso(s.hasta)}</span>} />
            <Fila label="Origen" valor={s.campania ? `${ORIGEN.campania} · ${s.campania.nombre}` : ORIGEN[s.origen] || s.origen} />
            {s.campania && <Fila label="Ventana" valor={`${fechaCorta(s.campania.ventanaDesde)} al ${fechaCorta(s.campania.ventanaHasta)}`} />}
            <Fila label="Pedida el" valor={s.creadaAt ? new Date(s.creadaAt).toLocaleDateString("es-AR") : ""} />
            <Fila label="Paso" valor={s.etapa === "supervisor" ? "Espera al supervisor" : s.etapa === "coordinador" ? "Espera al coordinador" : STATUS[s.status]?.texto || s.status} />
            {s.aprobaciones.supervisor && (
              <Fila
                label="Supervisor"
                valor={
                  <span className="text-emerald-600 dark:text-emerald-400">
                    <FontAwesomeIcon icon={faCircleCheck} className="mr-1" />
                    {s.aprobaciones.supervisor.nombre}
                    {s.aprobaciones.supervisor.at ? ` · ${new Date(s.aprobaciones.supervisor.at).toLocaleDateString("es-AR")}` : ""}
                  </span>
                }
              />
            )}
            {s.recordatorios > 0 && <Fila label="Recordatorios" valor={`${s.recordatorios} al supervisor`} />}
            {s.motivo && s.motivo !== "Solicitud de vacaciones" && <p className="mt-2 rounded bg-slate-100 p-2 text-xs italic text-slate-600 dark:bg-slate-800 dark:text-slate-300">«{s.motivo}»</p>}
          </Bloque>

          {/* La persona. */}
          <Bloque titulo="Persona" icono={faUsers}>
            <div className="mb-2 flex items-center gap-3">
              {p.foto ? (
                <img src={getImageUrl(p.foto)} alt="" className="h-10 w-10 rounded object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/80 text-sm font-bold text-white">{iniciales}</div>
              )}
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{p.nombre}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{p.rolEmpresa || "Sin rol empresa"}</p>
              </div>
            </div>
            <Fila label="CUIL" valor={p.cuil} />
            <Fila label="Antigüedad" valor={p.antiguedad ? `${p.antiguedad}${p.empresaComputo ? ` (en ${p.empresaComputo})` : ""}` : ""} />
            {p.saldo && (
              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                {[
                  ["Total", p.saldo.total, "text-blue-500"],
                  ["Gozados", p.saldo.gozados, "text-slate-700 dark:text-slate-200"],
                  ["Pendientes", p.saldo.pendientes, "text-amber-500"],
                  ["Disponibles", p.saldo.disponibles, "text-blue-500"],
                ].map(([t, n, c]) => (
                  <div key={String(t)} className="rounded-lg border border-slate-100 p-1.5 dark:border-slate-700">
                    <p className="text-[9px] uppercase text-slate-400">{t}</p>
                    <p className={`text-base font-bold ${c}`}>{n}</p>
                  </div>
                ))}
              </div>
            )}
            {p.saldo && <p className="mt-1 text-[10px] text-slate-400">Saldo {p.saldo.anio}: «pendientes» incluye esta solicitud.</p>}
          </Bloque>

          {/* Por proyecto: contrato, área y turno, y quiénes están de vacaciones en esas fechas. */}
          {d.proyectos.map((pr) => {
            const c = pr.contrato;
            const mismas = pr.superposiciones.filter((x) => x.mismaAreaTurno);
            return (
              <Bloque key={pr.projectId} titulo={pr.nombre || "Proyecto"} icono={faBriefcase}>
                <Fila label="Rol empresa" valor={pr.rolEmpresa} />
                <Fila
                  label="Área y turno"
                  valor={
                    pr.areasTurnos.length ? (
                      <div className="space-y-0.5">
                        {pr.areasTurnos.map((a, k) => (
                          <p key={k}>
                            {a.area}
                            {a.turnos.length ? ` · ${a.turnos.join(", ")}` : ""}
                          </p>
                        ))}
                      </div>
                    ) : (
                      "Sin área"
                    )
                  }
                />
                {c ? (
                  <>
                    <Fila label="Contrato" valor={c.tipo} />
                    <Fila label="Categoría" valor={c.categoria} />
                    <Fila label="Vigencia" valor={`Desde ${fechaCorta(c.alta)}${c.baja ? ` hasta ${fechaCorta(c.baja)}` : " · sin fecha de fin"}`} />
                    <Fila label="Horario" valor={c.horario} />
                    <Fila label="Días" valor={c.diasSemana.length ? `${textoDeDias(c.diasSemana)}${c.diasPorSemana ? ` · ${c.diasPorSemana} por semana` : ""}` : c.diasPorSemana ? `${c.diasPorSemana} por semana` : ""} />
                    <Fila label="Sede" valor={c.sede} />
                    <Fila label="Empresa" valor={c.empresa} />
                  </>
                ) : (
                  <Fila label="Contrato" valor="Sin contrato vigente" />
                )}
                <Fila label="Supervisión" valor={pr.supervisores.join(", ") || "Sin supervisor"} />
                <Fila label="Coordinación" valor={pr.coordinadores.join(", ") || "Sin coordinador"} />

                <div className="mt-2">
                  {pr.superposiciones.length === 0 ? (
                    <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                      <FontAwesomeIcon icon={faCircleCheck} />
                      Nadie más del proyecto tiene vacaciones en esas fechas.
                    </p>
                  ) : (
                    <>
                      <p className={`mb-1 flex items-center gap-2 text-xs font-semibold ${mismas.length ? "text-amber-600 dark:text-amber-400" : "text-slate-600 dark:text-slate-300"}`}>
                        <FontAwesomeIcon icon={mismas.length ? faTriangleExclamation : faClock} />
                        {pr.superposiciones.length} de vacaciones en esas fechas{mismas.length ? ` · ${mismas.length} de su misma área y turno` : ""}
                      </p>
                      <div className="space-y-1">
                        {pr.superposiciones.map((x, k) => (
                          <div key={k} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs ${x.mismaAreaTurno ? "bg-amber-50 dark:bg-amber-950/30" : "bg-slate-50 dark:bg-slate-800/50"}`}>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-800 dark:text-slate-200">{x.nombre}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {fechaCorta(x.desde)} al {fechaCorta(x.hasta)} · {x.dias} d{x.mismaAreaTurno ? " · misma área y turno" : ""}
                              </p>
                            </div>
                            <span className={`shrink-0 text-[10px] font-bold ${STATUS[x.status]?.clase || ""}`}>{STATUS[x.status]?.texto || x.status}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </Bloque>
            );
          })}

          {/* Sus otras vacaciones del año. */}
          <Bloque titulo={`Sus otras vacaciones de ${s.desde.slice(0, 4)}`} icono={faCalendarAlt}>
            {d.otrasDelAnio.length === 0 ? (
              <p className="py-1 text-xs text-slate-500 dark:text-slate-400">No tiene otras solicitudes este año.</p>
            ) : (
              d.otrasDelAnio.map((x, k) => (
                <div key={k} className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 text-xs last:border-b-0 dark:border-slate-800">
                  <span className="text-slate-700 dark:text-slate-300">
                    {fechaCorta(x.desde)} al {fechaCorta(x.hasta)} · {x.dias} d
                  </span>
                  <span className={`shrink-0 text-[10px] font-bold ${STATUS[x.status]?.clase || ""}`}>{STATUS[x.status]?.texto || x.status}</span>
                </div>
              ))
            )}
          </Bloque>
        </div>
      )}
    </Modal>
  );
}


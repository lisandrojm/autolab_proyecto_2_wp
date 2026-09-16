import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faUsers, faUserPlus, faBriefcase, faCalendarAlt, faLayerGroup, faIdCard, faFileContract, faClock, faTrash, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { useUserHistory } from "../hooks/useUserHistory";
import { ViewType } from "../types";
import { UserRegistrationModal } from "../components/UserRegistrationModal";
/*
  EL DETALLE ES EL MISMO QUE EN EL PANEL.

  Antes había uno propio de la app («Detalles del Alta») que mostraba otra cosa que lo cargado: el área
  salía de un campo que una solicitud nunca llena, la categoría aparecía hasta en un servicio —que no
  la tiene— y faltaban el tipo de contrato, la empresa, los días, las jornadas y los importes. Se
  reemplazó por el compartido: lo que se ve acá es exactamente lo que se pidió.
*/
import { SolicitudDetalleModal } from "../../../../components/solicitudes/SolicitudDetalleModal";
import { solicitudDesdeUser, useCatalogosDeSolicitudes } from "../../../../components/solicitudes/SolicitudesTable";
import { User, usersAPI } from "../../../../api/users";
import SectionHeader from "../components/SectionHeader";
import { contratosPorVencerAPI, ContratoPorVencer } from "../../../../api/contratosPorVencer";
import { sweetAlert } from "../utils/sweetAlert";
import AvisoNovedades from "../components/AvisoNovedades";
import { useNovedades } from "../hooks/useNovedades";
import { NOVEDAD_SOLICITUD, NOVEDAD_SOLICITUD_APROBADA, NOVEDAD_SOLICITUD_RECHAZADA } from "../../../../api/personnel";

/*
  CÓMO SE MUESTRA EL ESTADO DE UNA SOLICITUD.

  Las mismas cuatro etiquetas y los mismos colores que el detalle y que el panel: una solicitud que
  acá dice APROBADA y allá PENDIENTE es una solicitud que nadie sabe en qué estado está.
*/
const ESTADOS_SOLICITUD: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "PENDIENTE", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  aprobada: { label: "APROBADA", cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  rechazada: { label: "RECHAZADA", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  cancelada: { label: "CANCELADA", cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
};

interface UserHistoryProps {
  onNavigate: (view: ViewType) => void;
}

export default function UserHistory({ onNavigate }: UserHistoryProps) {
  const { users, loading, refetch } = useUserHistory();
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  /** Los catálogos con los que el detalle resuelve rol empresa, categoría y trámite. */
  const catalogosSolicitudes = useCatalogosDeSolicitudes();
  const [cancelando, setCancelando] = useState(false);
  /** Qué solicitud se está borrando: la tarjeta se apaga mientras el server contesta. */
  const [borrando, setBorrando] = useState<string | null>(null);
  /** Qué solicitudes son nuevas (aviso sin leer) y cómo marcarlas leídas, de a una o todas. */
  const novedades = useNovedades([NOVEDAD_SOLICITUD, NOVEDAD_SOLICITUD_APROBADA, NOVEDAD_SOLICITUD_RECHAZADA]);

  /*
    POR VENCER: los contratos de la gente a cargo que terminan en la próxima semana, para renovarlos o
    dejarlos vencer. Qué entra y quién lo ve lo decide el server (`services/contratosPorVencer.ts`).
    Se piden al entrar y no al abrir la pestaña: el número va en la pestaña, y avisar es el punto.
  */
  const [pestana, setPestana] = useState<"historial" | "por_vencer">("historial");
  const [porVencer, setPorVencer] = useState<ContratoPorVencer[] | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  /** El contrato que se está renovando: abre el formulario de solicitud ya completo. */
  const [renovacion, setRenovacion] = useState<{ plantilla: any; userProjectId: string; fechaBajaContrato: string } | null>(null);

  const cargarPorVencer = () => {
    contratosPorVencerAPI
      .listar()
      .then(setPorVencer)
      .catch(() => setPorVencer([]));
  };
  useEffect(cargarPorVencer, []);

  /** Un contrato no tiene `_id` propio: lo nombran su asignación y su fecha de baja. */
  const claveDe = (c: ContratoPorVencer) => `${c.userProjectId}::${c.fechaBaja}`;
  const fechaCorta = (f: string) => {
    const [y, m, d] = String(f || "").slice(0, 10).split("-");
    return y && m && d ? `${d}/${m}/${y.slice(2)}` : f || "—";
  };
  const textoVence = (dias: number) => (dias <= 0 ? "Vence hoy" : dias === 1 ? "Vence mañana" : `Vence en ${dias} días`);

  const renovar = (c: ContratoPorVencer) => {
    setEditingUser(null);
    setRenovacion({ plantilla: c.plantilla, userProjectId: c.userProjectId, fechaBajaContrato: c.fechaBaja });
    setShowRegistrationModal(true);
  };

  const dejarVencer = async (c: ContratoPorVencer) => {
    const r: any = await sweetAlert.confirm("¿Dejar vencer el contrato?", `El contrato de ${c.nombre} en ${c.proyectoNombre} termina el ${fechaCorta(c.fechaBaja)} y no se renueva. Sale de esta lista.`, "Dejar vencer", "Cancelar");
    if (!(r === true || r?.isConfirmed)) return;
    setProcesando(claveDe(c));
    try {
      await contratosPorVencerAPI.dejarVencer(c.userProjectId, c.fechaBaja);
      setPorVencer((prev) => (prev || []).filter((x) => claveDe(x) !== claveDe(c)));
      sweetAlert.success("Listo", "El contrato va a terminar en su fecha.");
    } catch (e: any) {
      sweetAlert.error("No se pudo guardar", e?.response?.data?.error || "Probá de nuevo en un momento.");
    } finally {
      setProcesando(null);
    }
  };

  const renderPorVencer = () => {
    if (porVencer === null)
      return (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900/70" />
          ))}
        </div>
      );
    if (porVencer.length === 0)
      return (
        <div className="flex flex-col items-center justify-center rounded-xl border bg-slate-50 p-10 text-center dark:bg-slate-800/50">
          {/* Contrato con reloj: lo que se muestra acá son contratos a los que se les acaba el tiempo. */}
          <div className="relative mb-3">
            <FontAwesomeIcon icon={faFileContract} className="w-10 h-10 text-slate-300" />
            <span className="absolute -bottom-1 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-800">
              <FontAwesomeIcon icon={faClock} className="w-3.5 h-3.5 text-amber-500" />
            </span>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">No hay contratos por vencer</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Acá aparecen, una semana antes, los contratos de tu gente que terminan.</p>
        </div>
      );
    return (
      <div className="space-y-3">
        {porVencer.map((c) => {
          const clave = claveDe(c);
          const urgente = c.diasRestantes <= 2;
          return (
            <div key={clave} className="bg-white border dark:border-slate-700 dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="font-bold text-slate-900 dark:text-slate-100 truncate">{c.nombre}</h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{c.clienteNombre ? `${c.clienteNombre} | ${c.proyectoNombre}` : c.proyectoNombre}</p>
                </div>
                <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap ${urgente ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>{textoVence(c.diasRestantes)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5 min-w-0">
                  <FontAwesomeIcon icon={faLayerGroup} className="w-3 h-3 opacity-70 text-primary" />
                  <span className="truncate">{[c.areaNombre, c.turnoNombre].filter(Boolean).join(" · ") || "Sin área"}</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <FontAwesomeIcon icon={faIdCard} className="w-3 h-3 opacity-70 text-primary" />
                  <span className="truncate">{c.rolFrame || "Sin rol"}</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <FontAwesomeIcon icon={faBriefcase} className="w-3 h-3 opacity-70 text-primary" />
                  <span className="truncate">{c.contrato || "Sin contrato"}</span>
                </div>
                <div className="flex items-center gap-1.5 min-w-0">
                  <FontAwesomeIcon icon={faCalendarAlt} className="w-3 h-3 opacity-70 text-primary" />
                  <span className="truncate">
                    {fechaCorta(c.fechaAlta)} → {fechaCorta(c.fechaBaja)}
                  </span>
                </div>
              </div>

              {c.renovacionRechazada && <p className="mt-2 text-[11px] font-medium text-red-600 dark:text-red-400">Ya se pidió la renovación y la rechazaron o cancelaron.</p>}

              <div className="grid grid-cols-2 gap-2 mt-3">
                <button type="button" onClick={() => dejarVencer(c)} disabled={procesando === clave} className="rounded-lg border border-slate-200 dark:border-slate-700 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 active:bg-slate-50 dark:active:bg-slate-800 disabled:opacity-50">
                  {procesando === clave ? "Guardando..." : "Dejar vencer"}
                </button>
                <button type="button" onClick={() => renovar(c)} disabled={procesando === clave} className="rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white active:bg-emerald-700 disabled:opacity-50">
                  Renovar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  /*
    CANCELAR LA SOLICITUD: la da de baja quien la pidió, mientras nadie la decidió todavía.

    NO SE BORRA: queda con estado «cancelada», para que el historial diga que se pidió y se dio de baja
    —y no que nunca existió—.
  */
  const cancelarSolicitud = async () => {
    if (!selectedUser) return;
    const nombre = selectedUser.metadata?.fullName || `${selectedUser.firstName || ""} ${selectedUser.lastName || ""}`.trim();
    const r: any = await sweetAlert.confirm("¿Cancelar la solicitud?", `La solicitud de ${nombre} queda cancelada y no se va a aprobar.`, "Sí, cancelar", "No");
    if (!(r === true || r?.isConfirmed)) return;
    setCancelando(true);
    try {
      await usersAPI.setSolicitudStatus(selectedUser._id, "cancelada");
      sweetAlert.success("Solicitud cancelada", "Quedó registrada como cancelada.");
      setShowDetailModal(false);
      setSelectedUser(null);
      refetch();
    } catch (e: any) {
      sweetAlert.error("No se pudo cancelar", e?.response?.data?.error || "Probá de nuevo en un momento.");
    } finally {
      setCancelando(false);
    }
  };

  /*
    BORRAR LA SOLICITUD, que es distinto de cancelarla.

    Cancelar la deja registrada como cancelada —hubo un pedido y se dio de baja—. Borrar es para lo que
    no aporta historial: una prueba, una cargada dos veces. El server no deja borrar una aprobada y, si
    era una renovación, al borrarla el contrato vuelve a «Por vencer» para decidirlo de nuevo.
  */
  const borrarSolicitud = async (user: User) => {
    const nombre = user.metadata?.fullName || `${user.firstName || ""} ${user.lastName || ""}`.trim();
    const r: any = await sweetAlert.confirm("¿Borrar la solicitud?", `Se borra la solicitud de ${nombre} y desaparece del historial. Esto no se puede deshacer; si querés que quede registrada, canceliá en vez de borrarla.`, "Borrar", "Cancelar");
    if (!(r === true || r?.isConfirmed)) return;
    setBorrando(user._id);
    try {
      await usersAPI.eliminarSolicitud(user._id);
      sweetAlert.success("Solicitud borrada", `${nombre} salió del historial.`);
      refetch();
    } catch (e: any) {
      sweetAlert.error("No se pudo borrar", e?.response?.data?.error || "Probá de nuevo en un momento.");
    } finally {
      setBorrando(null);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setShowDetailModal(false);
    setShowRegistrationModal(true);
  };

  return (
    <div className="flex-1 pb-24">
      {/* HEADER */}
      <SectionHeader
        icon={faUsers}
        titulo="Solicitud de Contratación"
        onBack={() => onNavigate("home")}
        info={"Pedí altas de personal. Con el + cargás una solicitud con los datos de la persona, el área y el turno donde va a trabajar.\n\nLa solicitud queda pendiente hasta que la aprueben. En «Historial» están las solicitudes de contratación con el estado de cada una —pendiente, aprobada, rechazada o cancelada—; tocá una para ver el detalle. Quiénes se registraron con tu link no son solicitudes: eso se mira en Registro.\n\nEn «Por vencer» aparecen, una semana antes, los contratos de tu gente que terminan: renovalos —sale una solicitud con la etiqueta Renovación— o dejalos vencer."}
      />

      <div className="px-4 pt-4">
        <AvisoNovedades tipos={[NOVEDAD_SOLICITUD, NOVEDAD_SOLICITUD_APROBADA, NOVEDAD_SOLICITUD_RECHAZADA]} texto={(n) => (n === 1 ? "1 novedad de contratación" : `${n} novedades de contratación`)} />
        {/* Lo que se pidió, y lo que hay que decidir antes de que venza. */}
        <div className="grid grid-cols-2 gap-1 p-1 mb-4 rounded-xl bg-slate-100 dark:bg-slate-800/60">
          {(
            [
              { id: "historial", label: "Historial" },
              { id: "por_vencer", label: "Por vencer" },
            ] as const
          ).map((t) => (
            <button key={t.id} type="button" onClick={() => setPestana(t.id)} className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-colors ${pestana === t.id ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}>
              {t.label}
              {t.id === "por_vencer" && porVencer && porVencer.length > 0 && <span className="min-w-[18px] rounded-full bg-amber-500 px-1.5 text-[10px] leading-[18px] text-white">{porVencer.length}</span>}
            </button>
          ))}
        </div>

        {pestana === "por_vencer" ? (
          renderPorVencer()
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm border dark:border-slate-800">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1">
                    <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded-md mb-2" />
                    <div className="h-3 w-48 bg-slate-200 dark:bg-slate-700 rounded-md" />
                  </div>
                </div>
                <div className="h-8 w-full bg-slate-100 dark:bg-slate-800 rounded-md" />
              </div>
            ))}
          </div>
        ) : users.length > 0 ? (
          <div className="space-y-3">
            {users.map((user) => {
              const meta: any = user.metadata || {};
              const displayName = meta.fullName || `${user.firstName} ${user.lastName}`.trim();
              // Fallback para las solicitudes anteriores al campo `solicitudStatus`, igual que en el detalle.
              const estadoClave = String(meta.solicitudStatus || (meta.isSolicitud ? "pendiente" : "aprobada"));
              const estado = ESTADOS_SOLICITUD[estadoClave] || ESTADOS_SOLICITUD.pendiente;
              const periodo = [fechaCorta(meta.startDate), meta.dueDate ? fechaCorta(meta.dueDate) : "indeterminado"].join(" → ");

              return (
                <div
                  key={user._id}
                  onClick={() => {
                    setSelectedUser(user);
                    setShowDetailModal(true);
                    // Abrirla ES mirarla: queda leído su aviso y no el de las otras.
                    void novedades.marcarLeido(user._id);
                  }}
                  className={`relative bg-white border dark:border-slate-700 dark:bg-slate-900/70 rounded-xl p-4 shadow-sm active:bg-slate-50 dark:active:bg-slate-800 transition-colors cursor-pointer ${borrando === user._id ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="font-bold text-slate-900 dark:text-slate-100 truncate">{displayName}</h4>
                        <div className="flex shrink-0 items-center gap-1">
                          {/* Sin mirar todavía. Se marca leída al abrirla, o todas desde el banner. */}
                          {novedades.esNuevo(user._id) && <span className="rounded bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">Nueva</span>}
                          {/* Renueva un contrato que vencía: no es un ingreso nuevo. */}
                          {meta.esRenovacion && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Renovación</span>}
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${estado.cls}`}>{estado.label}</span>
                        </div>
                      </div>
                      {/* El período pedido: es lo que distingue una solicitud de otra de la misma persona. */}
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <FontAwesomeIcon icon={faCalendarAlt} className="w-3 h-3 opacity-70" />
                        <span className="truncate">{periodo}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pr-10 pt-2 dark:border-slate-800">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <FontAwesomeIcon icon={faFileContract} className="w-3 h-3 opacity-70 text-primary" />
                      <span className="truncate">{meta.nombre_contrato || "Sin tipo de contrato"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <FontAwesomeIcon icon={faClock} className="w-3 h-3 opacity-70 text-primary" />
                      <span className="truncate">{meta.schedule || "Sin horario"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      <FontAwesomeIcon icon={faCalendarAlt} className="w-3 h-3 opacity-70 text-primary" />
                      <span>Solicitado: {new Date(user.createdAt).toLocaleDateString("es-ES")}</span>
                    </div>
                  </div>

                  {/*
                    BORRAR LA SOLICITUD.

                    Para lo que no aporta historial —una prueba, una cargada dos veces—: lo que sí se
                    pidió y se dio de baja se cancela, y queda registrado como cancelado. El server no
                    deja borrar una aprobada, que ya es una contratación.
                  */}
                  {/* Una aprobada no se borra: ya es una contratación, y el server la rechaza igual. */}
                  {estadoClave !== "aprobada" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void borrarSolicitud(user);
                    }}
                    disabled={borrando === user._id}
                    aria-label={`Borrar la solicitud de ${displayName}`}
                    title="Borrar la solicitud"
                    className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:text-slate-500"
                  >
                    <FontAwesomeIcon icon={borrando === user._id ? faSpinner : faTrash} className={`h-3.5 w-3.5 ${borrando === user._id ? "animate-spin" : ""}`} />
                  </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-slate-50 p-10 dark:bg-slate-800/50">
            <FontAwesomeIcon icon={faUserPlus} className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Todavía no hay solicitudes de contratación</p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Con el + pedís un alta; acá queda, con el estado en que está.</p>
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed bottom-24 z-10 w-full xl:w-1/2 left-1/2 -translate-x-1/2 flex justify-end px-6 pointer-events-none">
        <button
          onClick={() => {
            setEditingUser(null);
            setShowRegistrationModal(true);
          }}
          className="pointer-events-auto flex items-center justify-center w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl transition-transform hover:scale-105 active:scale-95"
          title="Nuevo Usuario"
        >
          <FontAwesomeIcon icon={faPlus} className="w-6 h-6" />
        </button>
      </div>

      <UserRegistrationModal
        isOpen={showRegistrationModal}
        onClose={() => {
          setShowRegistrationModal(false);
          setEditingUser(null);
          setRenovacion(null);
        }}
        editingUser={editingUser}
        renovacion={renovacion}
        onSuccess={() => {
          setShowRegistrationModal(false);
          setEditingUser(null);
          // La renovación enviada saca al contrato de «Por vencer»: se vuelve a pedir la lista.
          if (renovacion) cargarPorVencer();
          setRenovacion(null);
          refetch();
        }}
      />

      {/* `solicitudCompleta`: la app ya la tiene del listado, y pedirla por id exige permiso de administración. */}
      <SolicitudDetalleModal
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false);
          setSelectedUser(null);
        }}
        solicitud={selectedUser ? solicitudDesdeUser(selectedUser) : null}
        catalogos={catalogosSolicitudes}
        solicitudCompleta={selectedUser}
        onEditar={() => selectedUser && handleEdit(selectedUser)}
        onCancelar={() => void cancelarSolicitud()}
        cancelando={cancelando}
      />
    </div>
  );
}

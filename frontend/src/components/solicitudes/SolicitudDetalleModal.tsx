import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faCommentDots, faTriangleExclamation , faPenToSquare , faRotateLeft, faStar } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { AvisosSuperposicion } from "./AvisosSuperposicion";
import { usersAPI, User } from "../../api/users";
import { estadoLabel } from "../EstadoSelect";
import { ESTADO_SOLICITUD, EstadoSolicitud, ProyectoDeSolicitud, SolicitudVista, formatFechaHoraSolicitud, useCatalogosDeSolicitudes } from "./SolicitudesTable";
import { ResumenDelAlta, fecha } from "./ResumenDelAlta";

/*
  REVISAR UNA SOLICITUD ANTES DE DECIDIRLA.

  Aprobar era un botón en una fila de tabla: se veían siete columnas y se abría el alta con datos que
  quien aprobaba no había leído. Lo que se pidió está completo en la solicitud —tipo de contrato,
  período, días, jornadas, horario, convenio, categoría, importe, empresa, área/turno, reemplazo— y
  eso es lo que hay que poder mirar de una, en el mismo orden en que se cargó desde la app.

  Es SÓLO LECTURA. Corregir se corrige en el alta, que se abre ya cargada con estos datos: acá se
  decide, no se edita. Rechazar pide un motivo, porque un rechazo sin motivo obliga a quien pidió el
  alta a preguntar por afuera qué faltaba.

  Los nombres se resuelven contra los catálogos, no se guardan en la solicitud: así muestran lo que el
  ABM dice HOY. Lo que no se pueda resolver se muestra como «—» y no se inventa.

  ES EL MISMO DETALLE EN LA APP Y EN EL PANEL, y por eso está acá. La app tenía su propia pantalla
  («Detalles del Alta») que mostraba otra cosa: el área salía de un campo que una solicitud nunca
  llena —siempre decía «Sin área»—, la categoría aparecía incluso en un servicio, que por definición no
  tiene, y faltaban el tipo de contrato, la empresa, los días, las jornadas y los importes. Dos
  pantallas para el mismo dato terminan contestando distinto; ésta es una sola.

  El cuerpo (quién, contrato, importes, área y turno, reemplazo) es `ResumenDelAlta`, el mismo que
  muestra el detalle de un contrato en Contratos. Acá queda lo propio de una solicitud: su estado, los
  avisos de rechazo/revisión/reenvío y las acciones.
*/

/** Un campo que quien aprobó cambió respecto de lo que se había pedido (lo arma el server). */
interface CambioDeRevision {
  campo: string;
  pedido: string;
  aprobado: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** La fila que se tocó: da el estado y el encabezado mientras carga el detalle completo. */
  solicitud: SolicitudVista | null;
  catalogos: ReturnType<typeof useCatalogosDeSolicitudes>;
  /** Los proyectos ya resueltos por la pantalla (la global los trae con su cliente). */
  proyectos?: ProyectoDeSolicitud[];
  /**
   * La solicitud COMPLETA, cuando la pantalla ya la tiene cargada.
   *
   * La app la pasa: su listado de Contratación trae las solicitudes enteras, y pedir la ficha por id
   * (`GET /users/:id`) exige permiso de administración, que quien usa la app no tiene —con lo cual el
   * detalle se abría vacío—. El panel no la pasa y se pide sola, que es lo que hace que la pantalla
   * global (que trae filas resumidas) muestre exactamente lo mismo.
   */
  solicitudCompleta?: User | null;
  /** Falta cuando la pantalla no puede aprobar (la aprobación vive en el equipo del proyecto). */
  onAprobar?: (s: SolicitudVista) => void;
  onRechazar?: (s: SolicitudVista) => void;
  /** Acciones de quien PIDIÓ el alta (la app): corregirla o darla de baja mientras está pendiente. */
  onEditar?: (s: SolicitudVista) => void;
  onCancelar?: (s: SolicitudVista) => void;
  cancelando?: boolean;
  /**
   * Calificar a la persona de una RENOVACIÓN (el escritorio): quien decide si se renueva es quien mejor
   * sabe cómo trabajó. Recibe el id de la persona, no el de la solicitud.
   */
  onCalificar?: (s: SolicitudVista, userId: string) => void;
}

export const SolicitudDetalleModal: React.FC<Props> = ({ isOpen, onClose, solicitud, catalogos, proyectos, solicitudCompleta, onAprobar, onRechazar, onEditar, onCancelar, cancelando, onCalificar }) => {
  const [detalle, setDetalle] = useState<User | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const id = solicitud?._id || "";

  /*
    El detalle se pide entero al abrir, en vez de recibirlo de la fila.

    La pantalla global trae filas resumidas (una decena de campos) y la del proyecto trae el `User`
    completo: si se dibujara con lo que cada una tiene, la misma solicitud se vería distinta según
    desde dónde se la mire. Pedirla acá hace que las dos muestren lo mismo.
  */
  useEffect(() => {
    if (!isOpen || !id) return;
    let vivo = true;
    setCargando(true);
    setError("");
    setDetalle(null);
    // Ya cargada por la pantalla: no se vuelve a pedir (y no hace falta el permiso para pedirla).
    if (solicitudCompleta && String(solicitudCompleta._id) === String(id)) {
      setDetalle(solicitudCompleta);
      setCargando(false);
      return;
    }
    usersAPI
      .get(id)
      .then((u) => {
        if (!vivo) return;
        setDetalle(u);
        setCargando(false);
      })
      .catch((e: any) => {
        if (!vivo) return;
        setError(e?.response?.data?.error || "No se pudo cargar la solicitud. Probá de nuevo en un momento.");
        setCargando(false);
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, id, solicitudCompleta]);

  const m: any = detalle?.metadata || {};

  /** Qué se corrigió al aprobarla y qué dejó dicho quien aprobó (ver `solicitudRevision`). */
  const revision: { cambios?: CambioDeRevision[]; comentario?: string; porNombre?: string; el?: string } | null = m.solicitudRevision || null;
  const cambiosDeLaRevision: CambioDeRevision[] = revision?.cambios || [];

  const estado: EstadoSolicitud = (m.solicitudStatus as EstadoSolicitud) || solicitud?.estado || "pendiente";
  const puedeDecidir = estado === "pendiente" && !cargando && !!detalle;
  /*
    UNA RECHAZADA TAMBIÉN SE EDITA.

    Un rechazo dice qué faltaba justamente para que se pueda arreglar; si sólo se pudiera corregir
    una pendiente, la única salida sería cargarla de nuevo desde cero. Guardarla la devuelve a
    pendiente sola (ver `solicitudReenviada` en el server), así que el botón dice eso y no «editar»:
    quien la corrige tiene que saber que con guardar ya la volvió a mandar.
  */
  const puedeEditar = (estado === "pendiente" || estado === "rechazada") && !cargando && !!detalle;
  /** Se corrigió después de un rechazo y volvió a la bandeja (ver `solicitudReenviada`). */
  const reenviada: { veces?: number; el?: string; motivoAnterior?: string } | null = m.solicitudReenviada || null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          {solicitud?.nombre || "Solicitud"}
          {m.esRenovacion && <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Renovación</span>}
        </span>
      }
      subtitle={`Solicitud de contratación · solicitada el ${formatFechaHoraSolicitud(solicitud?.creadaEl) || "N/A"}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold ${ESTADO_SOLICITUD[estado].clase}`}>
            <FontAwesomeIcon icon={ESTADO_SOLICITUD[estado].icono} className="text-[9px]" />
            {ESTADO_SOLICITUD[estado].texto}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cerrar
            </button>
            {onCalificar && solicitud && m.esRenovacion && m.solicitudUserId && (
              <button onClick={() => onCalificar(solicitud, String(m.solicitudUserId))} className="px-3 py-2 text-sm font-semibold rounded-lg border border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-2">
                <FontAwesomeIcon icon={faStar} className="text-[11px]" />
                Calificar
              </button>
            )}
            {/* Lo de quien la pidió: corregirla o darla de baja, sólo mientras nadie la decidió. */}
            {puedeDecidir && onCancelar && solicitud && (
              <button onClick={() => onCancelar(solicitud)} disabled={cancelando} className="px-3 py-2 text-sm font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                {cancelando ? "Cancelando…" : "Cancelar solicitud"}
              </button>
            )}
            {puedeEditar && onEditar && solicitud && (
              <button onClick={() => onEditar(solicitud)} className="px-3 py-2 text-sm font-semibold rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                {estado === "rechazada" ? "Corregir y reenviar" : "Editar solicitud"}
              </button>
            )}
            {puedeDecidir && onRechazar && solicitud && (
              <button onClick={() => onRechazar(solicitud)} className="px-3 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
                <FontAwesomeIcon icon={faTimes} className="text-[11px]" />
                Rechazar
              </button>
            )}
            {puedeDecidir && onAprobar && solicitud && (
              <button onClick={() => onAprobar(solicitud)} className="px-3 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm flex items-center gap-2">
                <FontAwesomeIcon icon={faCheck} className="text-[11px]" />
                Aprobar
              </button>
            )}
          </div>
        </div>
      }
    >
      {cargando && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-700/50" />
          ))}
        </div>
      )}

      {!cargando && error && <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

      {!cargando && !error && (
        <div className="space-y-4">
          {/*
            SE SUPERPONÍA CON LO QUE LA PERSONA YA TENÍA cuando se pidió (contratos en cualquier proyecto u
            otras solicitudes suyas): la foto la sacó el server al crearla. Arriba, porque cambia qué se
            aprueba. Ver `server/src/services/superposicion.ts`.
          */}
          {Array.isArray(m.avisosSuperposicion) && m.avisosSuperposicion.length > 0 && <AvisosSuperposicion avisos={m.avisosSuperposicion} titulo="Se superpone con contrato que ya tiene" />}

          {/* Por qué se rechazó: lo primero, porque explica todo lo que sigue. */}
          {estado === "rechazada" && m.solicitudMotivoRechazo && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              <p className="flex items-start gap-2">
                <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-bold">Motivo del rechazo: </span>
                  <span className="whitespace-pre-wrap">{m.solicitudMotivoRechazo}</span>
                </span>
              </p>
              {/* Un rechazo no es el final: se dice acá mismo cómo seguir, que es el botón de abajo. */}
              {puedeEditar && onEditar && <p className="mt-1.5 pl-[22px] text-[11px] opacity-80">Corregilo y volvé a enviarla con «Corregir y reenviar».</p>}
            </div>
          )}

          {/*
            YA SE CORRIGIÓ DESPUÉS DE UN RECHAZO.

            Para quien la recibe: esta solicitud no es nueva, es una que se rechazó y se arregló. Sin
            decirlo vuelve a la bandeja idéntica a cualquier otra y quien la había rechazado no tiene
            cómo saber si lo que objetó se corrigió. Por eso va también lo que se había objetado: el
            motivo del rechazo se borra al volver a pendiente, pero la pregunta sigue siendo esa.
          */}
          {reenviada?.el && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
              <p className="flex items-start gap-2 font-bold">
                <FontAwesomeIcon icon={faRotateLeft} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Se corrigió y se volvió a enviar{(reenviada.veces || 1) > 1 ? ` (${reenviada.veces} veces)` : ""} · {fecha(reenviada.el)}
              </p>
              {reenviada.motivoAnterior && (
                <p className="mt-1.5 pl-[22px] text-[13px]">
                  <span className="font-semibold">Se había rechazado por: </span>
                  <span className="whitespace-pre-wrap italic">{reenviada.motivoAnterior}</span>
                </p>
              )}
            </div>
          )}

          {/*
            QUÉ SE LE CORRIGIÓ AL APROBARLA, y qué le dejó dicho quien aprobó.

            Va arriba de todo lo demás, igual que el motivo del rechazo: quien abre una solicitud
            aprobada la abre para ver si salió como la pidió. Antes no había forma de saberlo —decía
            «APROBADA» y nada más—, así que el mismo error se volvía a cargar la vez siguiente.

            Los valores llegan ya resueltos a texto desde el server (ver `revisionDeSolicitud`): son
            lo que se decidió ESE día, aunque después se renombre el área o la empresa.
          */}
          {revision && (cambiosDeLaRevision.length > 0 || revision.comentario) && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
              <p className="flex items-start gap-2 font-bold">
                <FontAwesomeIcon icon={faPenToSquare} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {cambiosDeLaRevision.length > 0 ? `Se ${cambiosDeLaRevision.length === 1 ? "corrigió 1 dato" : `corrigieron ${cambiosDeLaRevision.length} datos`} al aprobarla` : "Comentario de quien aprobó"}
              </p>

              {cambiosDeLaRevision.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {cambiosDeLaRevision.map((c: CambioDeRevision, i: number) => (
                    <li key={`${c.campo}-${i}`} className="rounded-lg bg-white/70 px-2.5 py-1.5 dark:bg-blue-900/30">
                      <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">{c.campo}</p>
                      {/*
                        Los valores pasan por `estadoLabel`, que es donde se traduce la nomenclatura vieja
                        («Pedido de AFIP» → «Pedido de ARCA»). Es inocuo para todo lo demás —devuelve el
                        texto tal cual— y evita que acá se lea AFIP mientras el resto de la app dice ARCA.
                      */}
                      <p className="text-[13px] leading-snug">
                        <span className="line-through opacity-60">{estadoLabel(c.pedido) || "—"}</span>
                        <span className="px-1.5 opacity-60">→</span>
                        <span className="font-bold">{estadoLabel(c.aprobado) || "—"}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              {revision.comentario && <p className="mt-2 whitespace-pre-wrap border-l-2 border-blue-300 pl-2.5 italic dark:border-blue-700">{revision.comentario}</p>}

              {(revision.porNombre || revision.el) && (
                <p className="mt-2 text-[11px] opacity-70">
                  {revision.porNombre}
                  {revision.porNombre && revision.el ? " · " : ""}
                  {revision.el ? fecha(revision.el) : ""}
                </p>
              )}
            </div>
          )}

          {/* Lo que escribió quien pidió el alta, completo: es contexto de la decisión. */}
          {m.comentarios && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
              <p className="flex items-start gap-2">
                <FontAwesomeIcon icon={faCommentDots} className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="whitespace-pre-wrap">{m.comentarios}</span>
              </p>
            </div>
          )}

          <ResumenDelAlta
            m={m.fullName ? m : { ...m, fullName: solicitud?.nombre }}
            catalogos={catalogos}
            proyectos={proyectos}
            persona={m.solicitudUserId ? "Ya registrada en la plataforma" : "Nueva (se crea al aprobar)"}
          />
        </div>
      )}
    </Modal>
  );
};

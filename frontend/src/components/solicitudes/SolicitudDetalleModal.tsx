import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTimes, faCommentDots, faTriangleExclamation , faPenToSquare } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { usersAPI, User } from "../../api/users";
import { companiesAPI, Company } from "../../api/companies";
import { contratosAPI, ContratoItem } from "../../api/contratos";
import { areasAPI, Area } from "../../api/areas";
import { shiftsAPI, Shift } from "../../api/shifts";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../../api/simpleCatalog";
import { activityLogTypesAPI, RequestConfig } from "../../api/requestConfig";
import { projectsAPI } from "../../api/projects";
import { EstadoBadge, estadoLabel } from "../EstadoSelect";
import { textoDeDias } from "../../utils/jerarquiaTurnos";
import { mesesEquivalentes, periodoDeCalculo } from "../../utils/jornadas";
import { ESTADO_SOLICITUD, EstadoSolicitud, ProyectoDeSolicitud, SolicitudVista, formatFechaSolicitud, useCatalogosDeSolicitudes } from "./SolicitudesTable";

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

  LO QUE NO APLICA NO SE MUESTRA: un servicio no lleva convenio ni categoría (es la misma regla del
  formulario, `tipoImpositivo === "constancia_cuit"`), y sin reemplazo no hay a quién reemplazar.
*/

const conveniosApi = createSimpleCatalogApi("/convenios");

const fecha = (iso?: string | null) => {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
};
const pesos = (n: number | null | undefined) => (n == null || !Number.isFinite(Number(n)) ? "" : `$ ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** Una fila de dato. Sin valor muestra «—»: el campo existe, sólo que la solicitud no lo trajo. */
/** Un campo que quien aprobó cambió respecto de lo que se había pedido (lo arma el server). */
interface CambioDeRevision {
  campo: string;
  pedido: string;
  aprobado: string;
}

const Fila = ({ label, valor }: { label: string; valor?: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 border-b border-gray-100 dark:border-gray-700/60 py-2 last:border-b-0">
    <p className="shrink-0 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</p>
    <div className="min-w-0 break-words text-right text-sm font-medium text-gray-800 dark:text-gray-200">{valor === "" || valor == null ? <span className="text-gray-400">—</span> : valor}</div>
  </div>
);

const Bloque = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <div>
    <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{titulo}</p>
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 bg-white dark:bg-gray-800/40">{children}</div>
  </div>
);

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
}

export const SolicitudDetalleModal: React.FC<Props> = ({ isOpen, onClose, solicitud, catalogos, proyectos, solicitudCompleta, onAprobar, onRechazar, onEditar, onCancelar, cancelando }) => {
  const [detalle, setDetalle] = useState<User | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [empresas, setEmpresas] = useState<Company[]>([]);
  const [contratos, setContratos] = useState<ContratoItem[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [turnos, setTurnos] = useState<Shift[]>([]);
  const [convenios, setConvenios] = useState<SimpleCatalogItem[]>([]);
  const [motivos, setMotivos] = useState<RequestConfig[]>([]);
  /** A quién reemplaza, buscado aparte: viene como id y el nombre no está en la solicitud. */
  const [reemplazado, setReemplazado] = useState<string>("");
  /** Los proyectos pedidos, cuando la pantalla no los trae resueltos (la app no los tiene a mano). */
  const [proyectosPropios, setProyectosPropios] = useState<ProyectoDeSolicitud[]>([]);

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
    setReemplazado("");
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

  // Los catálogos con los que se traducen los ids. Cada uno falla solo: si no llega, ese campo dice «—».
  useEffect(() => {
    if (!isOpen) return;
    let vivo = true;
    const guardar = <T,>(set: (v: T) => void) => (v: T) => {
      if (vivo) set(v);
    };
    companiesAPI.list().then(guardar(setEmpresas)).catch(() => {});
    contratosAPI.list().then(guardar(setContratos)).catch(() => {});
    areasAPI.listAll().then(guardar(setAreas)).catch(() => {});
    shiftsAPI.getAll().then(guardar(setTurnos)).catch(() => {});
    conveniosApi.list().then(guardar(setConvenios)).catch(() => {});
    activityLogTypesAPI.getAll().then(guardar(setMotivos)).catch(() => {});
    return () => {
      vivo = false;
    };
  }, [isOpen]);

  const m: any = detalle?.metadata || {};

  // El nombre de quien se reemplaza: la solicitud guarda el id, no el nombre.
  useEffect(() => {
    const idReemplazado = String(m.replacedUserId || "");
    if (!isOpen || !idReemplazado) return;
    let vivo = true;
    usersAPI
      .get(idReemplazado)
      .then((u) => {
        if (vivo) setReemplazado(u.metadata?.fullName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "");
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [isOpen, m.replacedUserId]);

  /*
    Los proyectos de la solicitud, por su cuenta: `metadata.projectIds` son ids pelados y la app no
    tiene la lista cargada. Se pide sólo si la pantalla no los pasó y hay ids que resolver.
  */
  useEffect(() => {
    const ids: string[] = (m.projectIds || []).map((p: any) => String(typeof p === "object" ? p?._id : p)).filter(Boolean);
    if (!isOpen || (proyectos && proyectos.length > 0) || ids.length === 0) return;
    let vivo = true;
    projectsAPI
      .listAll({ slim: true })
      .then((ps) => {
        if (!vivo) return;
        setProyectosPropios(ps.filter((p) => ids.includes(String(p._id))).map((p) => ({ _id: String(p._id), name: p.name, clienteNombre: typeof p.clientId === "object" ? p.clientId?.name : undefined })));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, detalle, proyectos]);

  const nombreDe = <T extends { _id: string }>(lista: T[], idBuscado: any, campo: (x: T) => string) => {
    const buscado = String(typeof idBuscado === "object" && idBuscado ? idBuscado._id : idBuscado || "");
    if (!buscado) return "";
    const x = lista.find((i) => String(i._id) === buscado);
    return x ? campo(x) : "";
  };

  const rolesEmpresa = useMemo(() => {
    const crudos: any[] = m.roles_frame || m.rolesFrameIds || (m.roleFrameId ? [m.roleFrameId] : []);
    return crudos
      .map((raw) => (typeof raw === "object" && raw ? raw.name || nombreDe(catalogos.roleFrames, raw._id, (rf) => rf.name) : nombreDe(catalogos.roleFrames, raw, (rf) => rf.name)))
      .filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.roles_frame, m.rolesFrameIds, m.roleFrameId, catalogos.roleFrames]);

  const categoria = catalogos.categoriasSat.find((c) => String(c._id) === String(m.categoriaSatId || ""));
  /** Un servicio no tiene convenio ni categoría: el importe se carga a mano (regla del formulario). */
  const esServicios = m.tipoImpositivo === "constancia_cuit";
  const tramite = catalogos.resolverTramite(m.tipoImpositivo);
  const diasSemana: number[] = Array.isArray(m.diasSemana) ? m.diasSemana : [];
  const jornadas = Number(m.workdaysCount) || 0;
  const valorJornada = Number(m.dailyRate) || 0;
  const diasPorSemana = Number(m.diasPorSemana) || 0;
  /*
    Los importes derivados se calculan acá, con las mismas cuentas del formulario.

    La solicitud guarda sólo el importe por jornada: por semana, por mes y el total del contrato son
    los números por los que pregunta quien aprueba, y recalcularlos con la fórmula compartida evita
    que esta pantalla conteste distinto que la que cargó el alta.
  */
  // Tiempo indeterminado: las jornadas son las de un mes completo y no hay total (ver `periodoDeCalculo`).
  const indeterminado = !!contratos.find((c) => String(c._id) === String(m.contratoId || ""))?.data?.esTiempoIndeterminado;
  const periodo = periodoDeCalculo(m.startDate, m.dueDate, indeterminado);
  const mesesEq = mesesEquivalentes(periodo.desde, periodo.hasta, diasSemana);
  const totalCalculado = jornadas > 0 ? valorJornada * jornadas : null;
  const mensual = totalCalculado !== null && mesesEq > 0 ? totalCalculado / mesesEq : null;
  const total = indeterminado ? null : totalCalculado;
  const semanal = valorJornada > 0 && diasPorSemana > 0 ? valorJornada * diasPorSemana : null;

  const areasTurnos: { area: string; turnos: string[] }[] = (m.areaShiftAssignments || []).map((a: any) => ({
    area: nombreDe(areas, a.areaId, (x) => x.name) || "Área",
    turnos: (a.shiftIds || []).map((s: any) => nombreDe(turnos, s, (x) => x.name)).filter(Boolean),
  }));

  /** Qué se corrigió al aprobarla y qué dejó dicho quien aprobó (ver `solicitudRevision`). */
  const revision: { cambios?: CambioDeRevision[]; comentario?: string; porNombre?: string; el?: string } | null = m.solicitudRevision || null;
  const cambiosDeLaRevision: CambioDeRevision[] = revision?.cambios || [];

  const estado: EstadoSolicitud = (m.solicitudStatus as EstadoSolicitud) || solicitud?.estado || "pendiente";
  const proyectosAMostrar = proyectos && proyectos.length > 0 ? proyectos : proyectosPropios;
  const puedeDecidir = estado === "pendiente" && !cargando && !!detalle;

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
      subtitle={`Solicitud de contratación · ${formatFechaSolicitud(solicitud?.creadaEl)}`}
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
            {/* Lo de quien la pidió: corregirla o darla de baja, sólo mientras nadie la decidió. */}
            {puedeDecidir && onCancelar && solicitud && (
              <button onClick={() => onCancelar(solicitud)} disabled={cancelando} className="px-3 py-2 text-sm font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                {cancelando ? "Cancelando…" : "Cancelar solicitud"}
              </button>
            )}
            {puedeDecidir && onEditar && solicitud && (
              <button onClick={() => onEditar(solicitud)} className="px-3 py-2 text-sm font-semibold rounded-lg border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                Editar solicitud
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-4">
              <Bloque titulo="Quién">
                <Fila label="Nombre" valor={m.fullName || solicitud?.nombre} />
                {/* Si el alta es para alguien que ya existe, el contrato va a SU ficha: hay que verlo antes de aprobar. */}
                <Fila label="Persona" valor={m.solicitudUserId ? "Ya registrada en la plataforma" : "Nueva (se crea al aprobar)"} />
                <Fila label="Proyecto" valor={proyectosAMostrar.length > 0 ? <div className="space-y-0.5">{proyectosAMostrar.map((p) => <p key={p._id} className="text-xs">{p.clienteNombre && <span className="text-gray-400">{p.clienteNombre} · </span>}{p.name}</p>)}</div> : ""} />
                <Fila label="Rol empresa" valor={rolesEmpresa.length > 0 ? rolesEmpresa.join(", ") : ""} />
              </Bloque>

              <Bloque titulo="Contrato">
                <Fila label="Empresa del contrato" valor={nombreDe(empresas, m.empresaContratoId, (c) => c.razonSocial)} />
                <Fila label="Tipo de contrato" valor={nombreDe(contratos, m.contratoId, (c) => c.name) || m.nombre_contrato} />
                <Fila label="Tipo de alta" valor={tramite ? <EstadoBadge name={tramite.name} /> : ""} />
                <Fila label="Desde" valor={fecha(m.startDate)} />
                <Fila label="Hasta" valor={m.dueDate ? fecha(m.dueDate) : "Indeterminado"} />
                <Fila label="Horario" valor={m.schedule} />
                <Fila label="Días" valor={diasSemana.length > 0 ? `${m.diasRotativos ? "Rota entre " : ""}${textoDeDias(diasSemana)}${diasPorSemana ? ` · ${diasPorSemana} por semana` : ""}` : diasPorSemana ? `${diasPorSemana} por semana` : ""} />
                {/*
                  LAS JORNADAS AJUSTADAS A MANO SE MUESTRAN COMO TALES.

                  Que sean 18 y no las 22 del calendario es exactamente lo que hay que revisar antes de
                  aprobar, junto con el motivo que se dio. Sin esto, la diferencia pasa sin que nadie la vea.
                */}
                <Fila
                  label="Jornadas"
                  valor={
                    jornadas > 0 ? (
                      <span>
                        {jornadas}
                        {m.workdaysOverridden && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Ajustadas (calendario: {m.workdaysCalculated ?? "—"})</span>
                        )}
                      </span>
                    ) : (
                      ""
                    )
                  }
                />
                {m.workdaysOverridden && <Fila label="Motivo del ajuste" valor={[m.workdaysOverrideReason, m.workdaysOverrideNote].filter(Boolean).join(" · ")} />}
              </Bloque>
            </div>

            <div className="space-y-4">
              <Bloque titulo={esServicios ? "Importes" : "Convenio e importes"}>
                {esServicios ? (
                  <p className="border-b border-gray-100 py-2 text-[11px] text-gray-500 dark:border-gray-700/60 dark:text-gray-400">Es un servicio: no hay convenio ni categoría, así que el importe se cargó a mano.</p>
                ) : (
                  <>
                    <Fila label="Convenio (CCT)" valor={nombreDe(convenios, m.convenioId, (c) => c.name)} />
                    <Fila label="Categoría" valor={categoria?.name} />
                  </>
                )}
                <Fila label="Importe por jornada" valor={pesos(valorJornada || null)} />
                <Fila label="Importe por semana" valor={pesos(semanal)} />
                <Fila label="Importe mensual" valor={pesos(mensual)} />
                <Fila label="Importe total" valor={indeterminado ? <span className="text-gray-400">No tiene: tiempo indeterminado</span> : pesos(total)} />
              </Bloque>

              <Bloque titulo="Área y turno">
                {areasTurnos.length > 0 ? (
                  areasTurnos.map((a, i) => (
                    <Fila
                      key={`${a.area}-${i}`}
                      label={a.area}
                      valor={a.turnos.length > 0 ? a.turnos.join(", ") : <span className="text-gray-400">Sin turno</span>}
                    />
                  ))
                ) : (
                  <Fila label="Área" valor="" />
                )}
              </Bloque>

              <Bloque titulo="Reemplazo">
                <Fila label="Reemplaza a alguien" valor={m.isReplacement ? "Sí" : "No"} />
                {m.isReplacement && <Fila label="Persona reemplazada" valor={reemplazado || (m.empleado_id_reemplezado ? `Legajo ${m.empleado_id_reemplezado}` : "")} />}
                {m.isReplacement && <Fila label="Motivo" valor={nombreDe(motivos, m.motivoReemplazoId, (x) => x.name)} />}
              </Bloque>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

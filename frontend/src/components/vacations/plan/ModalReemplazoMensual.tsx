import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faSearch, faTriangleExclamation, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../../ui/Modal";
import { sweetAlert } from "../../../utils/sweetAlert";
import { cachedFetch } from "../../../utils/refCache";
import { planVacacionesAPI, errorDe, type PlanVacaciones, type GrupoDelPlan, type PreviewReemplazo, type PedidoReemplazo } from "../../../api/planVacaciones";
import { usersAPI, type User } from "../../../api/users";
import { contratosAPI, type ContratoItem } from "../../../api/contratos";
import { contratoFrameAPI } from "../../../api/contratosFrame";
import { infoAPI, type InfoItem } from "../../../api/info";
import { categoriaSatAPI, type CategoriaSatItem } from "../../../api/categoriasSat";
import { activityLogTypesAPI, type RequestConfig } from "../../../api/requestConfig";
import { CampoTipoContrato, ModalTipoContrato } from "../../contratos/ModalTipoContrato";
import { tipoImpositivoDeContrato, estadosImpositivos, type TipoImpositivo } from "../../../utils/tramiteImpositivo";
import { tramiteSinConvenioNiCategoria } from "@compartido/tramiteSinEscala";
import { fechaCorta } from "@compartido/planVacaciones/fechas";
import { mesCorto } from "./estilos";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  plan: PlanVacaciones;
  grupo: GrupoDelPlan;
  mes: string;
  onListo: (plan: PlanVacaciones) => void;
}

const pesos = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }));
const nombreDe = (u: User) => `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.metadata?.fullName || u.email || "";

/**
 * PEDIR EL REEMPLAZO MENSUAL de un rol en un mes: una persona registrada y un tipo de contrato; el
 * server arma la Solicitud de contratación por el mes entero (área, turno, rol, horario del turno,
 * jornadas e importe) marcada como reemplazo de los que se van. «Ver resumen» muestra lo que va a
 * salir y los avisos antes de crear nada.
 */
export const ModalReemplazoMensual: React.FC<Props> = ({ isOpen, onClose, plan, grupo, mes, onListo }) => {
  const [usuarios, setUsuarios] = useState<User[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [userId, setUserId] = useState("");
  const [contratos, setContratos] = useState<ContratoItem[]>([]);
  const [contratoFrames, setContratoFrames] = useState<any[]>([]);
  const [estados, setEstados] = useState<InfoItem[]>([]);
  const [categorias, setCategorias] = useState<CategoriaSatItem[]>([]);
  const [motivos, setMotivos] = useState<RequestConfig[]>([]);
  const [contratoId, setContratoId] = useState("");
  const [tipoAbierto, setTipoAbierto] = useState(false);
  const [filtroTramite, setFiltroTramite] = useState<TipoImpositivo | "">("");
  const [categoriaSatId, setCategoriaSatId] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [comentarios, setComentarios] = useState("");
  const [preview, setPreview] = useState<PreviewReemplazo | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [creando, setCreando] = useState(false);

  // Los catálogos, una vez (los mismos que usa el wizard de alta del equipo).
  useEffect(() => {
    if (!isOpen) return;
    Promise.all([
      usersAPI.list({ picker: true, metadataActivo: "true", limit: 3000 }).then((r) => r.users),
      cachedFetch("contratos:all", () => contratosAPI.list()),
      cachedFetch("contratoFrames:all", () => contratoFrameAPI.list()),
      cachedFetch("info:estado-empleado", () => infoAPI.listByType("estado-empleado")),
      cachedFetch("categoriaSat:all", () => categoriaSatAPI.list()),
      activityLogTypesAPI.getAll(),
    ])
      .then(([us, cs, cfs, es, cats, ms]) => {
        setUsuarios(us);
        setContratos(cs);
        setContratoFrames(cfs as any[]);
        setEstados(es);
        setCategorias(cats);
        const validos = (ms as RequestConfig[]).filter((m) => m.isActive && !/horas extra/i.test(m.name));
        setMotivos(validos);
        const vac = validos.find((m) => /vacacion/i.test(m.name));
        if (vac) setMotivoId(vac._id);
      })
      .catch((err: any) => sweetAlert.error("No se pudieron cargar los catálogos", errorDe(err)));
  }, [isOpen]);

  const tramitePorContrato = useMemo(() => {
    const m = new Map<string, TipoImpositivo>();
    for (const c of contratos) {
      const t = tipoImpositivoDeContrato(c._id, contratoFrames, estados);
      if (t) m.set(c._id, t);
    }
    return m;
  }, [contratos, contratoFrames, estados]);
  const esServicios = !!contratoId && tramiteSinConvenioNiCategoria(tramitePorContrato.get(contratoId));
  const contratosParaElegir = useMemo(() => contratos.filter((c) => (c as any).isActive !== false && (!filtroTramite || tramitePorContrato.get(c._id) === filtroTramite || c._id === contratoId)), [contratos, filtroTramite, tramitePorContrato, contratoId]);

  const cubiertos = useMemo(() => plan.items.filter((i) => i.mes === mes && i.estado !== "cancelado" && i.estado !== "rechazado" && i.areaId === grupo.areaId && i.shiftId === grupo.shiftId && (i.rolFrameId || null) === (grupo.rolFrameId || null) && (i.rolFrameId || i.nombreRol === grupo.nombreRol)), [plan.items, mes, grupo]);
  const nombreMiembro = (id: string) => plan.equipo.find((m) => m.userId === id)?.nombre || "Persona";

  const candidatos = useMemo(() => {
    if (!usuarios) return [];
    const q = busqueda.trim().toLowerCase();
    const afuera = new Set(cubiertos.map((i) => i.userId));
    return usuarios
      .filter((u) => !afuera.has(u._id))
      .filter((u) => !q || nombreDe(u).toLowerCase().includes(q) || String(u.email || "").toLowerCase().includes(q))
      .slice(0, 40);
  }, [usuarios, busqueda, cubiertos]);

  const pedido = (): PedidoReemplazo => ({
    areaId: grupo.areaId,
    shiftId: grupo.shiftId,
    rolFrameId: grupo.rolFrameId,
    nombreRol: grupo.nombreRol,
    mes,
    userId,
    contratoId,
    nombreContrato: contratos.find((c) => c._id === contratoId)?.name,
    tipoImpositivo: tramitePorContrato.get(contratoId),
    categoriaSatId: esServicios ? undefined : categoriaSatId || undefined,
    dailyRate: Number(dailyRate) > 0 ? Number(dailyRate) : undefined,
    motivoReemplazoId: motivoId || undefined,
    comentarios: comentarios.trim() || undefined,
  });
  const listo = !!userId && !!contratoId;

  // Cualquier cambio invalida el resumen: hay que volver a mirarlo antes de crear.
  useEffect(() => setPreview(null), [userId, contratoId, categoriaSatId, dailyRate, motivoId, comentarios]);

  const verResumen = async () => {
    setCargandoPreview(true);
    try {
      setPreview(await planVacacionesAPI.previewReemplazo(plan._id, pedido()));
    } catch (err: any) {
      sweetAlert.error("No se pudo armar el reemplazo", errorDe(err));
    } finally {
      setCargandoPreview(false);
    }
  };
  const crear = async () => {
    setCreando(true);
    try {
      const r = await planVacacionesAPI.crearReemplazo(plan._id, pedido());
      onListo(r);
      sweetAlert.success("Solicitud creada", "El reemplazo quedó pedido en Proyecto › Solicitudes.");
      onClose();
    } catch (err: any) {
      sweetAlert.error("No se pudo crear la solicitud", errorDe(err));
    } finally {
      setCreando(false);
    }
  };

  const label = "block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1";
  const input = "input-field text-sm w-full";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Reemplazo mensual · ${grupo.nombreRol} · ${mesCorto(mes)}`}
      subtitle={`${grupo.areaNombre} › ${grupo.shiftNombre}. Una persona por el mes entero en vez de jornaleros por quincena.`}
      size="lg"
      zIndex={60}
      footer={
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">{preview ? "Revisá el resumen y creá la solicitud." : "Primero «Ver resumen»: muestra jornadas, importe y avisos sin crear nada."}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">
              Cerrar
            </button>
            {!preview ? (
              <button type="button" onClick={verResumen} disabled={!listo || cargandoPreview} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-2">
                {cargandoPreview && <FontAwesomeIcon icon={faSpinner} spin />} Ver resumen
              </button>
            ) : (
              <button type="button" onClick={crear} disabled={creando} className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-2">
                {creando && <FontAwesomeIcon icon={faSpinner} spin />} Crear solicitud
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm">
          <p className="font-semibold text-gray-800 dark:text-gray-100">Cubre a</p>
          {cubiertos.length === 0 ? (
            <p className="text-gray-500 text-xs">No hay bloques en este mes.</p>
          ) : (
            <ul className="text-xs text-gray-600 dark:text-gray-300 mt-1 space-y-0.5">
              {cubiertos.map((i) => (
                <li key={i._id}>
                  {nombreMiembro(i.userId)} · {fechaCorta(i.desde)} – {fechaCorta(i.hasta)} ({i.dias} días)
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <label className={label}>Persona que cubre el mes</label>
          {userId ? (
            <div className="flex items-center justify-between rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-sm">
              <span className="font-semibold text-blue-900 dark:text-blue-100">{nombreDe(usuarios?.find((u) => u._id === userId) || ({} as User)) || "Persona"}</span>
              <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => setUserId("")}>
                Cambiar
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-3.5 w-3.5" />
                <input className={`${input} pl-9`} placeholder="Buscar por nombre o mail…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} autoFocus />
              </div>
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                {usuarios === null ? (
                  <p className="px-3 py-3 text-xs text-gray-500">
                    <FontAwesomeIcon icon={faSpinner} spin /> Cargando personas…
                  </p>
                ) : candidatos.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-gray-500">Sin resultados.</p>
                ) : (
                  candidatos.map((u) => (
                    <button key={u._id} type="button" onClick={() => setUserId(u._id)} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20">
                      <span className="font-medium text-gray-900 dark:text-white">{nombreDe(u)}</span>
                      <span className="text-xs text-gray-500 ml-2">{u.email}</span>
                      {(u as any).rolFrame && <span className="text-[11px] text-gray-400 ml-2">· {(u as any).rolFrame}</span>}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <div>
          <label className={label}>Tipo de contrato</label>
          <CampoTipoContrato contratos={contratosParaElegir} contratoId={contratoId} estados={estados} tramitePorContrato={tramitePorContrato} onAbrir={() => setTipoAbierto(true)} />
          <ModalTipoContrato abierto={tipoAbierto} onCerrar={() => setTipoAbierto(false)} contratos={contratosParaElegir} contratoId={contratoId} estados={estados} tramitePorContrato={tramitePorContrato} onElegir={(id) => setContratoId(id)} filtro={filtroTramite} onFiltro={setFiltroTramite} impositivos={estadosImpositivos(estados)} zIndex={130} />
          <p className="text-[11px] text-gray-500 mt-1">Un mensual, no un jornalero: es la idea del reemplazo.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {!esServicios && (
            <div>
              <label className={label}>Categoría (opcional)</label>
              <select className={input} value={categoriaSatId} onChange={(e) => setCategoriaSatId(e.target.value)}>
                <option value="">Sin categoría (se completa al aprobar)</option>
                {categorias
                  .filter((c) => c.isActive !== false)
                  .map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div>
            <label className={label}>Importe por jornada (opcional)</label>
            <input type="number" min={0} className={input} value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} placeholder={esServicios ? "Lo que se pacta" : "Si no, la escala de la categoría"} />
          </div>
          <div>
            <label className={label}>Motivo del reemplazo</label>
            <select className={input} value={motivoId} onChange={(e) => setMotivoId(e.target.value)}>
              <option value="">Elegí un motivo…</option>
              {motivos.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Comentario (opcional)</label>
            <input className={input} value={comentarios} onChange={(e) => setComentarios(e.target.value)} placeholder="Algo más para quien aprueba" />
          </div>
        </div>

        {preview && (
          <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 px-4 py-3 text-sm space-y-2">
            <p className="font-semibold text-violet-900 dark:text-violet-100 inline-flex items-center gap-2">
              <FontAwesomeIcon icon={faCircleCheck} /> Lo que sale
            </p>
            <ul className="text-xs text-violet-900 dark:text-violet-100 space-y-0.5">
              <li>
                <strong>{preview.resumen.persona}</strong> · {preview.resumen.nombreContrato} · {fechaCorta(preview.resumen.desde)} – {fechaCorta(preview.resumen.hasta)}
              </li>
              <li>
                {preview.resumen.jornadas} jornadas · {pesos(preview.resumen.dailyRate || null)} por jornada · mensual {pesos(preview.resumen.importes.mensual)} · total {pesos(preview.resumen.importes.total)}
              </li>
              <li>Motivo: {preview.resumen.motivo || "sin motivo"}</li>
            </ul>
            {preview.avisos.length > 0 && (
              <ul className="text-xs text-amber-800 dark:text-amber-200 space-y-0.5 pt-1">
                {preview.avisos.map((a, i) => (
                  <li key={i} className="inline-flex items-start gap-1.5">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 shrink-0" /> <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCopy, faPen, faPlus, faRightLeft, faSpinner, faTrash, faUserPlus, faUserXmark, faUsers } from "@fortawesome/free-solid-svg-icons";
import Swal from "sweetalert2";
import { Modal } from "../Modal";
import { Equipo, Plantilla, plantillasEquipoAPI, Puesto } from "../../../../../api/plantillasEquipo";
import { Project } from "../../../../../api/projects";
import { sweetAlert } from "../../utils/sweetAlert";
import { CatalogosContratacion, etiquetaProyecto, useAreasDelProyecto } from "./useCatalogosContratacion";
import PersonaPickerModal from "./PersonaPickerModal";
import PuestoModal from "./PuestoModal";
import PuestosModal from "./PuestosModal";
import { Badge, CLASE_CAMPO, Rotulo, textoDias } from "./comun";

/*
  CREAR O EDITAR UNA PLANTILLA DE EQUIPO, en tres hojas:

   1. GENERAL: nombre, empresa (y con ella el convenio), tipo de contrato y comentario. Nada más: ni
      áreas ni horarios, que son de cada puesto.
   2. PUESTOS: por rol («1 director, 2 cámaras…»), cada uno con su área y turno, su horario y sus días
      (los del turno, modificables), su categoría. Se editan uno por uno.
   3. EQUIPOS: quién ocupa cada puesto. Se guardan varios con nombre («Semana A», «Semana B») para
      repetirlos cuando haga falta; al contratar se elige uno.

  Las fechas y los importes NO se guardan acá: se eligen y se calculan en cada contratación.
*/
interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** `null` = plantilla nueva. */
  plantillaId: string | null;
  proyecto: Project | null;
  catalogos: CatalogosContratacion;
  onCambio: () => void;
}

interface General {
  nombre: string;
  empresaContratoId: string;
  convenioId: string;
  contratoId: string;
  comentarios: string;
}
const vacio: General = { nombre: "", empresaContratoId: "", convenioId: "", contratoId: "", comentarios: "" };

export default function PlantillaEditor({ isOpen, onClose, plantillaId, proyecto, catalogos, onCambio }: Props) {
  const [plantilla, setPlantilla] = useState<Plantilla | null>(null);
  const [g, setG] = useState<General>(vacio);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);
  const [hoja, setHoja] = useState<1 | 2 | 3>(1);
  const [agregandoPuestos, setAgregandoPuestos] = useState(false);
  const [editando, setEditando] = useState<Puesto | null>(null);
  const [equipoId, setEquipoId] = useState("");
  const [asignando, setAsignando] = useState<Puesto | null>(null);
  const areas = useAreasDelProyecto(isOpen ? proyecto?._id : null);

  const aplicar = (p: Plantilla) => {
    setPlantilla(p);
    setG({ nombre: p.nombre, empresaContratoId: p.empresaContratoId || "", convenioId: p.convenioId || "", contratoId: p.contratoId || "", comentarios: p.comentarios || "" });
    setSucio(false);
    setEquipoId((actual) => (p.equipos.some((e) => e._id === actual) ? actual : p.equipos[0]?._id || ""));
  };

  useEffect(() => {
    if (!isOpen) return;
    setPlantilla(null);
    setG(vacio);
    setSucio(false);
    setHoja(1);
    setEquipoId("");
    if (!plantillaId) return;
    setCargando(true);
    plantillasEquipoAPI
      .obtener(plantillaId)
      .then((p) => {
        aplicar(p);
        setHoja(p.integrantes.length ? 3 : 2);
      })
      .catch(() => sweetAlert.error("No se pudo abrir la plantilla"))
      .finally(() => setCargando(false));
  }, [isOpen, plantillaId]);

  const cambiar = (x: Partial<General>) => {
    setG((p) => ({ ...p, ...x }));
    setSucio(true);
  };

  // La cadena del alta individual: empresa del proyecto → convenio. Con una sola opción, se elige sola.
  const empresas = catalogos.empresasDelProyecto(proyecto);
  useEffect(() => {
    if (!isOpen || cargando || plantilla) return;
    if (!g.empresaContratoId && empresas.length === 1) cambiar({ empresaContratoId: empresas[0]._id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cargando, empresas.length]);
  const convenios = catalogos.conveniosDisponibles(proyecto, g.empresaContratoId, g.convenioId);
  useEffect(() => {
    if (!isOpen || cargando) return;
    const valido = convenios.some((x) => catalogos.convenioPorCct(x.externalId)?._id === g.convenioId);
    if (!valido && convenios.length === 1) {
      const id = catalogos.convenioPorCct(convenios[0].externalId)?._id || "";
      if (id && id !== g.convenioId) cambiar({ convenioId: id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, cargando, g.empresaContratoId, convenios.length]);

  const contrato = catalogos.contratos.find((x) => x._id === g.contratoId);
  const tramite = g.contratoId ? catalogos.tramitePorContrato.get(g.contratoId) || "" : "";
  const esServicios = tramite === "constancia_cuit";
  const porDiasSueltos = (contrato as any)?.data?.modoFechas === "dias";

  const guardarGeneral = async (): Promise<Plantilla | null> => {
    if (!g.nombre.trim()) {
      sweetAlert.warning("Falta el nombre", "Poné un nombre a la plantilla (ej. «Noticiero LN+»).");
      return null;
    }
    if (!proyecto) return null;
    const datos = { nombre: g.nombre.trim(), empresaContratoId: g.empresaContratoId || null, convenioId: esServicios ? null : g.convenioId || null, contratoId: g.contratoId || null, nombreContrato: contrato?.name || "", tipoImpositivo: tramite, comentarios: g.comentarios };
    setGuardando(true);
    try {
      const nueva = !plantilla;
      const p = plantilla ? await plantillasEquipoAPI.actualizar(plantilla._id, datos) : await plantillasEquipoAPI.crear({ ...datos, projectId: proyecto._id });
      aplicar(p);
      onCambio();
      if (nueva) {
        setHoja(2);
        void sweetAlert.alert("Plantilla creada", "Ahora armá los puestos: «Agregar puestos» por rol (ej. 1 director, 2 cámaras), cada uno con su área y turno. Después, en Equipos, elegí quién ocupa cada puesto.", "info");
      }
      return p;
    } catch (e: any) {
      sweetAlert.error("No se pudo guardar", e?.response?.data?.error || "Probá de nuevo.");
      return null;
    } finally {
      setGuardando(false);
    }
  };

  /** Una operación sobre puestos o equipos; si la hoja general tiene cambios sin guardar, se guardan antes. */
  const conPlantilla = async (fn: (p: Plantilla) => Promise<Plantilla>, tirar = false) => {
    const p = !plantilla || sucio ? await guardarGeneral() : plantilla;
    if (!p) return;
    try {
      aplicar(await fn(p));
      onCambio();
    } catch (e: any) {
      if (tirar) throw e;
      sweetAlert.error("No se pudo guardar", e?.response?.data?.error || "Probá de nuevo.");
    }
  };

  const nombreRol = useMemo(() => new Map(catalogos.roleFrames.map((r) => [r._id, r.name])), [catalogos.roleFrames]);
  const nombreCategoria = useMemo(() => new Map(catalogos.categoriasSat.map((x) => [x._id, x.name])), [catalogos.categoriasSat]);
  const rolDe = (p: Puesto) => p.rolesFrame.map((r) => nombreRol.get(r) || "Rol").join(", ") || "Sin rol";
  const turnoDe = (p: Puesto) => {
    const t = (areas || []).find((o) => o.areaId === p.areaId && o.shiftId === p.shiftId);
    return t ? `${t.areaNombre} · ${t.turnoNombre}` : "";
  };
  const equipo: Equipo | undefined = plantilla?.equipos.find((e) => e._id === equipoId);
  const quienEn = (puestoId: string) => equipo?.asignaciones.find((a) => a.puestoId === puestoId);

  const quitarPuesto = async (p: Puesto, n: number) => {
    const r: any = await sweetAlert.confirm(`¿Sacar el puesto ${n}?`, `${rolDe(p)} deja de estar en la plantilla (y en todos sus equipos). Las solicitudes ya pedidas no cambian.`, "Sacar", "Cancelar");
    if (!(r === true || r?.isConfirmed)) return;
    await conPlantilla((pl) => plantillasEquipoAPI.quitarPuesto(pl._id, p._id));
  };

  const nuevoEquipo = async () => {
    if (!plantilla) return;
    const r = await Swal.fire({
      title: "Nuevo equipo",
      html: `<p style="font-size:.85em;margin-bottom:.5em">Un equipo es quién ocupa cada puesto (ej. «Semana A»).</p>`,
      input: "text",
      inputPlaceholder: `Equipo ${plantilla.equipos.length + 1}`,
      showCancelButton: true,
      showDenyButton: !!equipo,
      confirmButtonText: "Vacío",
      denyButtonText: equipo ? `Copiar «${equipo.nombre}»` : undefined,
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#3b82f6",
      denyButtonColor: "#10b981",
      customClass: { popup: "mobile-swal-popup", title: "mobile-swal-title" },
      // Con «Copiar» el texto no viaja en `value`: se lee del campo antes de que se cierre.
      preDeny: () => (Swal.getInput() as HTMLInputElement | null)?.value || "",
    });
    if (r.isDismissed) return;
    const nombre = String(r.value || "").trim();
    await conPlantilla(async (pl) => {
      const nueva = await plantillasEquipoAPI.crearEquipo(pl._id, nombre, r.isDenied ? equipo?._id : undefined);
      setEquipoId(nueva.equipos[nueva.equipos.length - 1]?._id || "");
      return nueva;
    });
  };

  const renombrarEquipo = async () => {
    if (!plantilla || !equipo) return;
    const r = await Swal.fire({ title: "Nombre del equipo", input: "text", inputValue: equipo.nombre, showCancelButton: true, confirmButtonText: "Guardar", cancelButtonText: "Cancelar", confirmButtonColor: "#3b82f6", customClass: { popup: "mobile-swal-popup", title: "mobile-swal-title" } });
    if (!r.isConfirmed || !String(r.value || "").trim()) return;
    await conPlantilla((pl) => plantillasEquipoAPI.renombrarEquipo(pl._id, equipo._id, String(r.value).trim()));
  };

  const borrarEquipo = async () => {
    if (!plantilla || !equipo) return;
    const r: any = await sweetAlert.confirm("¿Borrar el equipo?", `«${equipo.nombre}» deja de estar en la plantilla. Los puestos no cambian.`, "Borrar", "Cancelar");
    if (!(r === true || r?.isConfirmed)) return;
    await conPlantilla((pl) => plantillasEquipoAPI.borrarEquipo(pl._id, equipo._id));
  };

  const hojas = [
    { n: 1 as const, t: "General", hecho: !!plantilla },
    { n: 2 as const, t: `Puestos${plantilla ? ` (${plantilla.integrantes.length})` : ""}`, hecho: !!plantilla?.integrantes.length },
    { n: 3 as const, t: `Equipos${plantilla ? ` (${plantilla.equipos.length})` : ""}`, hecho: !!plantilla?.equipos.some((e) => e.asignaciones.length) },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={plantilla ? plantilla.nombre : "Nueva plantilla"}
      subtitle={proyecto ? etiquetaProyecto(proyecto) : undefined}
      size="lg"
      zIndex={60}
      footer={
        <div className="flex w-full gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-slate-700 py-3 text-sm font-bold text-white">
            {sucio ? "Cerrar sin guardar" : "Cerrar"}
          </button>
          {hoja === 1 && (
            <button type="button" onClick={() => void guardarGeneral()} disabled={guardando || (!sucio && !!plantilla)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white disabled:opacity-50">
              {guardando && <FontAwesomeIcon icon={faSpinner} spin />}
              {plantilla ? "Guardar cambios" : "Crear plantilla"}
            </button>
          )}
          {hoja === 2 && (
            <button type="button" onClick={() => setAgregandoPuestos(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white">
              <FontAwesomeIcon icon={faPlus} />
              Agregar puestos
            </button>
          )}
          {hoja === 3 && (
            <button type="button" onClick={() => void nuevoEquipo()} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-bold text-white">
              <FontAwesomeIcon icon={faPlus} />
              Nuevo equipo
            </button>
          )}
        </div>
      }
    >
      {cargando ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* LAS TRES HOJAS: primero lo general; los puestos y los equipos, con la plantilla ya creada. */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
            {hojas.map((t) => (
              <button
                key={t.n}
                type="button"
                disabled={t.n > 1 && !plantilla}
                onClick={() => setHoja(t.n)}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-colors disabled:opacity-40 ${hoja === t.n ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100" : "text-slate-500 dark:text-slate-400"}`}
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${t.hecho ? "bg-green-600 text-white" : "bg-slate-300 text-slate-700 dark:bg-slate-600 dark:text-slate-200"}`}>{t.hecho ? "✓" : t.n}</span>
                {t.t}
              </button>
            ))}
          </div>

          {/* ── 1. GENERAL ── */}
          {hoja === 1 && (
            <section className="space-y-4">
              <p className="rounded-xl bg-blue-50 p-3 text-[11px] text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
                Primero lo general, que vale para todo el equipo. Con la plantilla creada armás los <b>puestos</b> (cada uno con su área, turno y horario) y después los <b>equipos</b> (quién ocupa cada puesto).
              </p>
              <div>
                <Rotulo obligatorio>Nombre</Rotulo>
                <input value={g.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} placeholder="Ej. Noticiero LN+" className={CLASE_CAMPO} maxLength={120} />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Rotulo>Empresa que contrata</Rotulo>
                  <select value={g.empresaContratoId} onChange={(e) => cambiar({ empresaContratoId: e.target.value, convenioId: "" })} className={CLASE_CAMPO}>
                    <option value="">Elegí la empresa…</option>
                    {empresas.map((e) => (
                      <option key={e._id} value={e._id}>
                        {(e as any).razonSocial || (e as any).name}
                      </option>
                    ))}
                  </select>
                </div>
                {!esServicios && (
                  <div>
                    <Rotulo>Convenio</Rotulo>
                    <select value={g.convenioId} onChange={(e) => cambiar({ convenioId: e.target.value })} className={CLASE_CAMPO} disabled={convenios.length <= 1}>
                      <option value="">{convenios.length ? "Elegí el convenio…" : "Sale de la empresa"}</option>
                      {convenios.map((x) => {
                        const doc = catalogos.convenioPorCct(x.externalId);
                        return doc ? (
                          <option key={doc._id} value={doc._id}>
                            {x.externalId} {doc.name ? `· ${doc.name}` : ""}
                          </option>
                        ) : null;
                      })}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <Rotulo obligatorio>Tipo de contrato</Rotulo>
                <select value={g.contratoId} onChange={(e) => cambiar({ contratoId: e.target.value })} className={CLASE_CAMPO}>
                  <option value="">Elegí el tipo de contrato…</option>
                  {catalogos.contratos.map((x) => (
                    <option key={x._id} value={x._id}>
                      {x.name} {catalogos.tramitePorContrato.get(x._id) === "constancia_cuit" ? "· PEDIDO DE SERVICIOS" : catalogos.tramitePorContrato.get(x._id) ? "· PEDIDO DE ARCA" : ""}
                    </option>
                  ))}
                </select>
                {porDiasSueltos && <p className="mt-1 text-[11px] text-slate-400">Se pide por días sueltos: los días se eligen en cada contratación, uno por jornada.</p>}
              </div>
              <div>
                <Rotulo>Comentario (para cada solicitud)</Rotulo>
                <textarea rows={2} value={g.comentarios} onChange={(e) => cambiar({ comentarios: e.target.value })} placeholder="Opcional" className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white" />
              </div>
            </section>
          )}

          {/* ── 2. PUESTOS ── */}
          {hoja === 2 && plantilla && (
            <section className="space-y-2">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Cada puesto tiene su rol, su área y turno y su horario. Tocá uno para editarlo.</p>
              {plantilla.integrantes.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Todavía no hay puestos. Con «Agregar puestos» elegís los roles y cuántos de cada uno.</p>
              )}
              {plantilla.integrantes.map((p, n) => {
                const turno = turnoDe(p);
                const falta = !turno || !p.inTime || !p.outTime || (!esServicios && !p.categoriaSatId);
                return (
                  <div key={p._id} className={`rounded-xl border bg-white p-3 dark:bg-slate-900/60 ${falta ? "border-dashed border-amber-400 dark:border-amber-700" : "border-slate-200 dark:border-slate-700"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" onClick={() => setEditando(p)} className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-400">{n + 1}.</span>
                          <span className="truncate text-sm font-bold text-slate-900 dark:text-white">{rolDe(p)}</span>
                          {falta && <Badge tono="ambar">Completar</Badge>}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {turno || "Sin área y turno"} · {p.inTime && p.outTime ? `${p.inTime} a ${p.outTime}` : "sin horario"} {!porDiasSueltos && p.diasSemana?.length ? `· ${textoDias(p.diasSemana)}` : ""}
                        </p>
                        {!esServicios && (
                          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                            {p.categoriaSatId ? nombreCategoria.get(p.categoriaSatId) || "Categoría" : "Sin categoría"}
                            {p.dailyRateManual ? ` · $ ${p.dailyRateManual.toLocaleString("es-AR")} fijado` : ""}
                          </p>
                        )}
                      </button>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => setEditando(p)} aria-label={`Editar el puesto ${n + 1}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 dark:border-slate-700">
                          <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                        </button>
                        <button type="button" onClick={() => void quitarPuesto(p, n + 1)} aria-label={`Sacar el puesto ${n + 1}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-red-500 dark:border-slate-700">
                          <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {/* ── 3. EQUIPOS ── */}
          {hoja === 3 && plantilla && (
            <section className="space-y-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">Un equipo es quién ocupa cada puesto. Guardá los que repetís (ej. «Semana A», «Semana B») y al contratar elegís cuál.</p>
              {plantilla.equipos.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {plantilla.equipos.map((e) => (
                    <button key={e._id} type="button" onClick={() => setEquipoId(e._id)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${e._id === equipoId ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"}`}>
                      <FontAwesomeIcon icon={faUsers} className="mr-1.5" />
                      {e.nombre} ({e.asignaciones.length}/{plantilla.integrantes.length})
                    </button>
                  ))}
                </div>
              )}
              {equipo && (
                <div className="flex gap-3 text-[11px] font-semibold">
                  <button type="button" onClick={() => void renombrarEquipo()} className="text-blue-600 dark:text-blue-400">
                    <FontAwesomeIcon icon={faPen} className="mr-1" />
                    Renombrar
                  </button>
                  <button type="button" onClick={() => void borrarEquipo()} className="text-red-500">
                    <FontAwesomeIcon icon={faTrash} className="mr-1" />
                    Borrar equipo
                  </button>
                </div>
              )}
              {plantilla.integrantes.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">Primero armá los puestos.</p>}
              {equipo &&
                plantilla.integrantes.map((p, n) => {
                  const a = quienEn(p._id);
                  return (
                    <div key={p._id} className={`flex items-center gap-2 rounded-xl border bg-white p-3 dark:bg-slate-900/60 ${a ? (a.activo ? "border-slate-200 dark:border-slate-700" : "border-red-300 dark:border-red-900/60") : "border-dashed border-amber-400 dark:border-amber-700"}`}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-slate-500 dark:text-slate-400">
                          {n + 1}. {rolDe(p)} {turnoDe(p) ? `· ${turnoDe(p)}` : ""}
                        </p>
                        <p className={`truncate text-sm font-semibold ${a ? "text-slate-900 dark:text-white" : "text-amber-600 dark:text-amber-400"}`}>
                          {a ? a.nombre : "Sin asignar"} {a && !a.activo && <Badge tono="rojo">Inactiva</Badge>}
                        </p>
                        {a?.reemplazadoDeNombre && <p className="text-[10px] text-slate-400">Entró en lugar de {a.reemplazadoDeNombre}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => setAsignando(p)}
                        aria-label={a ? `Cambiar a ${a.nombre}` : `Asignar el puesto ${n + 1}`}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${a ? "border border-slate-200 text-slate-500 dark:border-slate-700" : "bg-amber-500 text-white"}`}
                      >
                        <FontAwesomeIcon icon={a ? faRightLeft : faUserPlus} className="h-3 w-3" />
                      </button>
                      {a && (
                        <button type="button" onClick={() => void conPlantilla((pl) => plantillasEquipoAPI.asignar(pl._id, equipo._id, p._id, null))} aria-label={`Dejar sin asignar el puesto ${n + 1}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-400 dark:border-slate-700">
                          <FontAwesomeIcon icon={faUserXmark} className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              {equipo && (
                <button type="button" onClick={() => void nuevoEquipo()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2.5 text-xs font-bold text-slate-500 dark:border-slate-700">
                  <FontAwesomeIcon icon={faCopy} />
                  Otro equipo (vacío o copiando «{equipo.nombre}»)
                </button>
              )}
            </section>
          )}
        </div>
      )}

      {plantilla && (
        <PuestosModal
          isOpen={agregandoPuestos}
          onClose={() => setAgregandoPuestos(false)}
          roleFrames={catalogos.roleFrames}
          areas={areas}
          onAgregar={(puestos, turno) =>
            void conPlantilla((pl) =>
              plantillasEquipoAPI.agregarPuestos(
                pl._id,
                puestos.map((x) => ({
                  rolesFrame: [x.rolId],
                  cantidad: x.cantidad,
                  ...(turno ? { areaId: turno.areaId, shiftId: turno.shiftId, inTime: turno.inicio || null, outTime: turno.fin || null, diasSemana: turno.dias, diasPorSemana: turno.dias.length || null } : {}),
                })),
              ),
            )
          }
        />
      )}
      {plantilla && (
        <PuestoModal
          isOpen={!!editando}
          onClose={() => setEditando(null)}
          plantilla={{ ...plantilla, empresaContratoId: g.empresaContratoId || null, convenioId: g.convenioId || null, contratoId: g.contratoId || null, tipoImpositivo: tramite }}
          proyecto={proyecto}
          puesto={editando}
          numero={editando ? plantilla.integrantes.findIndex((x) => x._id === editando._id) + 1 : 0}
          areas={areas}
          catalogos={catalogos}
          onGuardar={(cambios) => conPlantilla((pl) => plantillasEquipoAPI.actualizarPuesto(pl._id, editando!._id, cambios), true)}
        />
      )}
      <PersonaPickerModal
        isOpen={!!asignando}
        onClose={() => setAsignando(null)}
        titulo={asignando ? `¿Quién ocupa el puesto de ${rolDe(asignando)}?` : ""}
        excluir={equipo?.asignaciones.filter((a) => a.puestoId !== asignando?._id).map((a) => a.userId) || []}
        roleFrames={catalogos.roleFrames}
        rolInicial={asignando ? nombreRol.get(asignando.rolesFrame[0]) : undefined}
        onElegir={(ps) => {
          const p = asignando;
          if (!p || !ps[0] || !equipo) return;
          void conPlantilla((pl) => plantillasEquipoAPI.asignar(pl._id, equipo._id, p._id, ps[0]._id));
        }}
      />
    </Modal>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faBriefcase, faBuilding, faCheck, faChevronDown, faChevronRight, faClock, faFileContract, faLayerGroup, faMinus, faPlus, faSearch, faTimes, faUserPlus, faUsers } from "@fortawesome/free-solid-svg-icons";
import { Plantilla, PlantillaResumen, plantillasEquipoAPI } from "../../../../../api/plantillasEquipo";
import { SelectorHora } from "../../../../../components/contratacion/SelectorHora";
import { ChipValoracionDelProyecto } from "../../../../../components/proyectos/ChipValoracion";
import { sweetAlert } from "../../utils/sweetAlert";
import { etiquetaProyecto, OpcionAreaTurno } from "./useCatalogosContratacion";
import { usePlantillas } from "./contexto";
import { Pantalla } from "./Pantalla";
import { HojaInferior } from "./HojaInferior";
import { SelectorPersona } from "./SelectorPersona";
import { cambiosDeContrato, cambiosDeTurno, porDiasSueltos } from "./Condiciones";
import { categoriasDelNivel, rutas } from "./equipoUtil";
import CampoConvenio from "./CampoConvenio";
import { fuzzyMatch } from "../../../../../utils/searchHelpers";
import { CLASE_CAMPO, CLASE_HORA, DIAS } from "./comun";

/*
  NUEVO EQUIPO, EN UNA SOLA PANTALLA Y EN EL ORDEN DE LA SOLICITUD INDIVIDUAL.

  Se completa de arriba abajo, igual que un alta de a uno: Cliente | Proyecto → Grupo de puestos
  (uno que ya existe o uno nuevo, con sus roles y cantidades) y Empresa que contrata → Tipo de
  contrato → Área y turno (completa horario y días) → Horario y días → Nombre → Personas (opcional:
  se pueden asignar ahora o después). «Crear equipo» crea el grupo si es nuevo, el equipo con sus
  condiciones y asigna a las personas elegidas.

  Lo cargado queda en la sesión: ir a buscar a alguien, volver o recargar no pierde nada.
*/

const CLAVE = "plantillas:nuevo-equipo";
const NUEVO = "__nuevo__";

interface Borrador {
  projectId: string;
  grupoId: string; // un grupo existente, o NUEVO
  nombreGrupo: string;
  /** Grupo nuevo: cuántos de cada rol (en el orden en que se agregaron). */
  roles: { rolId: string; cantidad: number }[];
  empresaContratoId: string;
  convenioId: string;
  contratoId: string;
  turno: string; // "areaId::shiftId"
  inTime: string;
  outTime: string;
  diasSemana: number[];
  nombre: string;
  copiarDe: string;
  /** Personas por número de puesto (1, 2, …). */
  personas: Record<number, { _id: string; nombre: string }>;
}

const vacio = (projectId = "", grupoId = ""): Borrador => ({ projectId, grupoId, nombreGrupo: "", roles: [], empresaContratoId: "", convenioId: "", contratoId: "", turno: "", inTime: "", outTime: "", diasSemana: [], nombre: "", copiarDe: "", personas: {} });

/** Rótulo de campo, igual al de la solicitud individual. */
function Rotulo({ icono, children, obligatorio }: { icono: any; children: React.ReactNode; obligatorio?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
      <FontAwesomeIcon icon={icono} className="text-[10px] text-blue-500" />
      {children}
      {obligatorio && <span className="text-red-500">*</span>}
    </label>
  );
}

export default function NuevoEquipo() {
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const { catalogos, areasDe, cargar } = usePlantillas();
  const [b, setB] = useState<Borrador>(() => {
    try {
      const guardado = JSON.parse(sessionStorage.getItem(CLAVE) || "null");
      const grupo = query.get("grupo") || "";
      if (guardado && (!grupo || guardado.grupoId === grupo)) return guardado;
      return vacio(query.get("proyecto") || "", grupo);
    } catch {
      return vacio(query.get("proyecto") || "", query.get("grupo") || "");
    }
  });
  const [grupos, setGrupos] = useState<PlantillaResumen[] | null>(null);
  const [grupo, setGrupo] = useState<Plantilla | null>(null);
  const [hoja, setHoja] = useState<null | "proyecto" | "roles" | "contrato" | { persona: number }>(null);
  const [areasAbiertas, setAreasAbiertas] = useState<Set<string>>(new Set());
  const [creando, setCreando] = useState(false);
  const [intento, setIntento] = useState(false);

  const cambiar = (x: Partial<Borrador>) => setB((p) => ({ ...p, ...x }));
  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE, JSON.stringify(b));
    } catch {
      /* sin storage: vale mientras la pantalla esté abierta */
    }
  }, [b]);

  // El proyecto: el pedido, el recordado o el único.
  const proyectos = catalogos.proyectos;
  useEffect(() => {
    if (!proyectos?.length || proyectos.some((p) => p._id === b.projectId)) return;
    let recordado = "";
    try {
      recordado = localStorage.getItem("plantillas:proyecto") || "";
    } catch {
      /* nada */
    }
    cambiar({ projectId: proyectos.some((p) => p._id === recordado) ? recordado : proyectos[0]._id });
  }, [proyectos, b.projectId]);
  const proyecto = proyectos?.find((p) => p._id === b.projectId) || null;
  const areas = areasDe(b.projectId);

  // Los grupos de puestos (sirven en cualquier proyecto); sin ninguno, arranca uno nuevo.
  useEffect(() => {
    setGrupos(null);
    plantillasEquipoAPI
      .listar("")
      .then((l) => {
        setGrupos(l);
        setB((p) => (p.grupoId && (p.grupoId === NUEVO || l.some((g) => g._id === p.grupoId)) ? p : { ...p, grupoId: l.length === 1 ? l[0]._id : l.length ? "" : NUEVO }));
      })
      .catch(() => setGrupos([]));
  }, []);
  useEffect(() => {
    setGrupo(null);
    if (!b.grupoId || b.grupoId === NUEVO) return;
    void cargar(b.grupoId).then(setGrupo);
  }, [b.grupoId, cargar]);

  // La empresa: con una sola, elegida sola (como en el alta individual).
  const empresas = catalogos.empresasDelProyecto(proyecto);
  useEffect(() => {
    if (!b.empresaContratoId && empresas.length === 1) cambiar({ empresaContratoId: empresas[0]._id });
  }, [empresas.length, b.empresaContratoId]);
  const convenioId = b.convenioId || catalogos.convenioUnico(proyecto, b.empresaContratoId)?._id || "";

  // Los puestos: los del grupo elegido, o los del grupo nuevo (rol × cantidad).
  const esNuevo = b.grupoId === NUEVO;
  const puestos: { n: number; rolId: string }[] = useMemo(() => {
    if (esNuevo) {
      const lista: { n: number; rolId: string }[] = [];
      for (const r of b.roles) for (let i = 0; i < r.cantidad; i++) lista.push({ n: lista.length + 1, rolId: r.rolId });
      return lista;
    }
    return (grupo?.integrantes || []).map((i, k) => ({ n: k + 1, rolId: i.rolesFrame[0] || "" }));
  }, [esNuevo, b.roles, grupo]);
  const nombreRol = (id: string) => catalogos.roleFrames.find((r) => r._id === id)?.name || "Rol";

  const contrato = catalogos.contratos.find((c) => c._id === b.contratoId);
  const sueltos = porDiasSueltos(catalogos, b.contratoId);
  const turno = (areas || []).find((o) => `${o.areaId}::${o.shiftId}` === b.turno);
  const areasAgrupadas = useMemo(() => {
    const m = new Map<string, { areaId: string; nombre: string; turnos: OpcionAreaTurno[] }>();
    for (const o of areas || []) {
      const g = m.get(o.areaId) || { areaId: o.areaId, nombre: o.areaNombre, turnos: [] };
      g.turnos.push(o);
      m.set(o.areaId, g);
    }
    return [...m.values()];
  }, [areas]);
  // Con un solo turno en el proyecto, elegido solo.
  useEffect(() => {
    if (areas?.length === 1 && !b.turno) elegirTurno(areas[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas?.length]);

  const elegirTurno = (o: OpcionAreaTurno) => {
    const c = cambiosDeTurno(o);
    setB((p) => ({ ...p, turno: `${o.areaId}::${o.shiftId}`, inTime: c.inTime || "", outTime: c.outTime || "", diasSemana: c.diasSemana || p.diasSemana, nombre: p.nombre || o.turnoNombre }));
  };

  // Qué falta, en el orden del formulario.
  const falta = !proyecto
    ? { texto: "Elegí el proyecto", id: "campo-proyecto" }
    : !b.grupoId
      ? { texto: "Elegí el grupo de puestos", id: "campo-grupo" }
      : esNuevo && !b.nombreGrupo.trim()
        ? { texto: "Poné el nombre del grupo", id: "campo-grupo" }
        : puestos.length === 0
          ? { texto: "Elegí los roles del grupo", id: "campo-roles" }
          : !b.empresaContratoId
            ? { texto: "Elegí la empresa que contrata", id: "campo-roles" }
            : !convenioId && (!catalogos.categoriasCargadas || !catalogos.conveniosCargados)
              ? { texto: "Cargando el convenio…", id: "campo-roles" }
              : !convenioId && catalogos.conveniosDisponibles(proyecto, b.empresaContratoId, "").length > 0
                ? { texto: "Elegí el convenio", id: "campo-roles" }
            : !b.contratoId && catalogos.contratos.length > 0
              ? { texto: "Elegí el tipo de contrato", id: "campo-contrato" }
              : !b.turno && (areas?.length || 0) > 0
                ? { texto: "Elegí el área y el turno", id: "campo-turno" }
                : !b.nombre.trim()
                  ? { texto: "Poné el nombre del equipo", id: "campo-nombre" }
                  : null;
  const irA = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });

  /*
    SE VA MOSTRANDO A MEDIDA QUE SE COMPLETA: cada sección aparece recién cuando la anterior está
    completa, en el orden del alta individual. Así nunca hay un campo que todavía no se puede llenar.
  */
  const okProyecto = !!proyecto;
  const okGrupo = okProyecto && !!b.grupoId && (!esNuevo || !!b.nombreGrupo.trim());
  const okRoles = okGrupo && puestos.length > 0 && !!b.empresaContratoId && (!falta || !["campo-grupo", "campo-roles"].includes(falta.id));
  const okContrato = okRoles && (!!b.contratoId || catalogos.contratos.length === 0);
  const okTurno = okContrato && (!!b.turno || (areas?.length ?? 1) === 0);
  const okNombre = okTurno && !!b.nombre.trim();
  // Lo que aparece por un toque se trae a la vista: la PRIMERA sección nueva (con el turno aparecen
  // horario y personas juntas). Lo que aparece escribiendo, no: movería la pantalla mientras se tipea.
  const secciones = [okRoles && "campo-contrato", okContrato && "campo-turno", okTurno && "campo-horario", okNombre && "campo-personas"].filter(Boolean) as string[];
  const [vistas, setVistas] = useState<string[] | null>(null);
  useEffect(() => {
    if (vistas === null) return setVistas(secciones);
    const nueva = secciones.find((x) => !vistas.includes(x));
    if (nueva) setTimeout(() => document.getElementById(nueva)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    if (secciones.join() !== vistas.join()) setVistas(secciones);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secciones.join()]);

  const crear = async () => {
    setIntento(true);
    if (falta || !proyecto) {
      if (falta) irA(falta.id);
      return;
    }
    setCreando(true);
    try {
      // 1. El grupo, si es nuevo: sólo roles y cantidades (sirve en cualquier proyecto).
      let p: Plantilla;
      if (esNuevo) {
        p = await plantillasEquipoAPI.crear({ nombre: b.nombreGrupo.trim(), sinEquipos: true });
        p = await plantillasEquipoAPI.agregarPuestos(p._id, puestos.map((x) => ({ rolesFrame: [x.rolId] })));
      } else {
        p = grupo!;
      }
      // 2. El equipo, con sus condiciones.
      const condiciones = {
        ...(b.contratoId ? cambiosDeContrato(catalogos, b.contratoId) : {}),
        ...(turno ? { areaId: turno.areaId, shiftId: turno.shiftId } : {}),
        inTime: b.inTime || null,
        outTime: b.outTime || null,
        ...(sueltos ? {} : { diasSemana: b.diasSemana, diasPorSemana: b.diasSemana.length || null }),
      };
      // El equipo lleva su proyecto, su empresa, su convenio y la categoría de cada puesto en el nivel de ESE proyecto.
      const categorias = categoriasDelNivel(catalogos, proyecto, b.empresaContratoId, convenioId, p.integrantes);
      p = await plantillasEquipoAPI.crearEquipo(p._id, b.nombre.trim(), b.copiarDe || undefined, condiciones as any, { projectId: proyecto._id, empresaContratoId: b.empresaContratoId || null, convenioId: convenioId || null, categorias });
      const equipo = p.equipos[p.equipos.length - 1];
      // 3. Las personas elegidas acá.
      for (const [n, persona] of Object.entries(b.personas)) {
        const puesto = p.integrantes[Number(n) - 1];
        if (puesto) p = await plantillasEquipoAPI.asignar(p._id, equipo._id, puesto._id, persona._id);
      }
      try {
        sessionStorage.removeItem(CLAVE);
        localStorage.setItem("plantillas:proyecto", proyecto._id);
      } catch {
        /* nada */
      }
      void cargar(p._id);
      navigate(rutas.equipo(p._id, equipo._id), { replace: true });
    } catch (e: any) {
      sweetAlert.error("No se pudo crear", e?.response?.data?.error || "Probá de nuevo.");
    } finally {
      setCreando(false);
    }
  };

  const error = (id: string) => intento && falta?.id === id;
  const asignadas = Object.keys(b.personas).length;

  return (
    <Pantalla
      titulo="Nuevo equipo"
      contexto={proyecto ? etiquetaProyecto(proyecto) : undefined}
      atras={b.grupoId && b.grupoId !== NUEVO ? rutas.grupo(b.grupoId) : rutas.lista}
      boton={{ texto: esNuevo ? "Crear grupo y equipo" : "Crear equipo", onClick: () => void crear(), deshabilitado: !!falta, motivo: falta?.texto, onMotivo: falta ? () => irA(falta.id) : undefined, cargando: creando }}
    >
      <div className="space-y-6">
        {/* CLIENTE | PROYECTO */}
        <div id="campo-proyecto" className="space-y-2 scroll-mt-24">
          <Rotulo icono={faBriefcase} obligatorio>
            Cliente | Proyecto
          </Rotulo>
          <div className="flex items-center gap-2">
            <div className="flex min-h-[48px] flex-1 items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 dark:border-blue-700 dark:bg-blue-900/20">
              <FontAwesomeIcon icon={faBriefcase} className="text-[10px] text-blue-500" />
              <span className="text-sm font-medium text-blue-800 dark:text-blue-300">{proyecto ? etiquetaProyecto(proyecto) : "Elegí un proyecto"}</span>
              {proyecto && <ChipValoracionDelProyecto project={proyecto} valoraciones={catalogos.valoraciones} mostrarSinValorar className="ml-auto shrink-0" />}
            </div>
            {(proyectos?.length || 0) > 1 && (
              <button type="button" onClick={() => setHoja("proyecto")} className="min-h-[48px] shrink-0 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">
                Cambiar
              </button>
            )}
          </div>
        </div>

        {okProyecto && (
          <>
        {/* GRUPO DE PUESTOS */}
        <div id="campo-grupo" className="space-y-2 scroll-mt-24">
          <Rotulo icono={faLayerGroup} obligatorio>
            Grupo de puestos
          </Rotulo>
          {grupos === null ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">Cargando los grupos del proyecto…</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {grupos.map((g) => (
                <button key={g._id} type="button" aria-pressed={b.grupoId === g._id} onClick={() => cambiar({ grupoId: g._id, personas: {}, copiarDe: "" })} className={`min-h-[44px] rounded-lg border px-3 text-sm font-medium ${b.grupoId === g._id ? "border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-900/30 dark:text-blue-200" : "border-slate-300 text-slate-800 dark:border-slate-600 dark:text-slate-100"}`}>
                  {g.nombre} <span className="text-xs opacity-70">· {g.puestos}</span>
                </button>
              ))}
              <button type="button" aria-pressed={esNuevo} onClick={() => cambiar({ grupoId: NUEVO, personas: {}, copiarDe: "" })} className={`min-h-[44px] rounded-lg border border-dashed px-3 text-sm font-semibold ${esNuevo ? "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200" : "border-slate-400 text-slate-700 dark:text-slate-200"}`}>
                <FontAwesomeIcon icon={faPlus} className="mr-1.5" />
                Nuevo grupo
              </button>
            </div>
          )}
          {esNuevo && <input value={b.nombreGrupo} onChange={(e) => cambiar({ nombreGrupo: e.target.value })} placeholder="Nombre del grupo (ej. Equipo Técnica)" maxLength={120} className={`${CLASE_CAMPO} ${error("campo-grupo") ? "border-red-500" : ""}`} aria-label="Nombre del grupo" />}
          {error("campo-grupo") && <p className="text-xs font-medium text-red-600 dark:text-red-400">{falta?.texto}.</p>}
        </div>
          </>
        )}

        {okGrupo && (
          <>
        {/* ROL/ES EMPRESA + EMPRESA QUE CONTRATA */}
        <div id="campo-roles" className="grid grid-cols-1 gap-4 scroll-mt-24 md:grid-cols-2">
          <div className="space-y-2">
            <Rotulo icono={faBriefcase} obligatorio>
              Rol/es empresa
            </Rotulo>
            {esNuevo ? (
              b.roles.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {b.roles.map((r) => (
                    <span key={r.rolId} className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 py-1 pl-2.5 pr-1.5 text-xs font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                      {r.cantidad} × {nombreRol(r.rolId)}
                      <button type="button" onClick={() => cambiar({ roles: b.roles.filter((x) => x.rolId !== r.rolId), personas: {} })} aria-label={`Quitar ${nombreRol(r.rolId)}`} className="rounded-full p-1 hover:bg-blue-200 dark:hover:bg-blue-800/60">
                        <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                  <button type="button" onClick={() => setHoja("roles")} className="min-h-[36px] rounded-full px-2 text-xs font-bold text-blue-700 dark:text-blue-300">
                    <FontAwesomeIcon icon={faPlus} className="mr-1" />
                    Roles
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setHoja("roles")} className={`flex h-12 w-full items-center gap-2 rounded-xl border bg-slate-50 px-4 text-left dark:bg-slate-900 ${error("campo-roles") ? "border-red-500" : "border-slate-300 dark:border-slate-600"}`}>
                  <FontAwesomeIcon icon={faSearch} className="text-sm text-slate-500" />
                  <span className="truncate text-slate-600 dark:text-slate-300">Elegí los roles y cuántos de cada uno…</span>
                </button>
              )
            ) : grupo ? (
              <p className="text-sm text-slate-800 dark:text-slate-100">{resumenRoles(puestos.map((x) => x.rolId), nombreRol) || "Sin puestos"}</p>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-300">{b.grupoId ? "Cargando los puestos…" : "Elegí primero el grupo."}</p>
            )}
          </div>
          <div className="space-y-2">
            <Rotulo icono={faBuilding}>Empresa que contrata</Rotulo>
            {empresas.length === 0 ? (
              <p className="py-2 text-xs text-amber-700 dark:text-amber-300">{proyecto ? "El proyecto no tiene empresa del contrato asignada." : "Elegí primero el proyecto."}</p>
            ) : empresas.length === 1 ? (
              <p className="flex h-12 items-center rounded-xl bg-slate-100 px-4 text-sm font-medium text-slate-900 dark:bg-slate-800 dark:text-white">{(empresas[0] as any).razonSocial}</p>
            ) : (
              <select value={b.empresaContratoId} onChange={(e) => cambiar({ empresaContratoId: e.target.value, convenioId: "" })} className={CLASE_CAMPO}>
                <option value="">Elegí la empresa</option>
                {empresas.map((c) => (
                  <option key={c._id} value={c._id}>
                    {(c as any).razonSocial}
                  </option>
                ))}
              </select>
            )}
            {b.empresaContratoId && <CampoConvenio proyecto={proyecto} empresaId={b.empresaContratoId} convenioId={b.convenioId} catalogos={catalogos} onChange={(id) => id !== b.convenioId && cambiar({ convenioId: id })} />}
          </div>
        </div>
          </>
        )}

        {okRoles && (
          <>
        {/* TIPO DE CONTRATO */}
        <div id="campo-contrato" className="space-y-2 scroll-mt-24">
          <Rotulo icono={faFileContract} obligatorio>
            Tipo de contrato
          </Rotulo>
          <button type="button" onClick={() => setHoja("contrato")} className={`flex min-h-[48px] w-full items-center gap-3 rounded-lg border bg-white px-3 text-left dark:bg-slate-900 ${error("campo-contrato") ? "border-red-500" : "border-slate-300 dark:border-slate-600"}`}>
            {contrato ? (
              <>
                <span className="flex-1 text-sm font-medium text-slate-900 dark:text-white">{contrato.name}</span>
                <span className="text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">{catalogos.tramitePorContrato.get(contrato._id) === "constancia_cuit" ? "Pedido de servicios" : "Pedido de ARCA"}</span>
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faSearch} className="text-[10px] text-slate-500" />
                <span className="flex-1 text-sm text-slate-600 dark:text-slate-300">Elegí el tipo de contrato…</span>
              </>
            )}
          </button>
        </div>
          </>
        )}

        {okContrato && (
          <>
        {/* ÁREA Y TURNO */}
        <div id="campo-turno" className="space-y-2 scroll-mt-24">
          <Rotulo icono={faBriefcase} obligatorio>
            Área y turno
          </Rotulo>
          {areas === null ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">Cargando las áreas y turnos del proyecto…</p>
          ) : areas.length === 0 ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">El proyecto no tiene áreas y turnos configurados.</p>
          ) : (
            <>
              <p className="text-xs text-slate-600 dark:text-slate-300">El horario y los días se completan con los del turno; abajo los podés cambiar.</p>
              <div className="space-y-2">
                {areasAgrupadas.map((area) => {
                  const abierta = areasAbiertas.has(area.areaId) || turno?.areaId === area.areaId;
                  return (
                    <div key={area.areaId} className={`rounded-lg border ${error("campo-turno") ? "border-red-400" : "border-slate-200 dark:border-slate-700"}`}>
                      <button type="button" onClick={() => setAreasAbiertas((s) => { const n = new Set(s); if (n.has(area.areaId)) n.delete(area.areaId); else n.add(area.areaId); return n; })} aria-expanded={abierta} className="flex min-h-[44px] w-full items-center gap-2 px-3 text-left">
                        <FontAwesomeIcon icon={abierta ? faChevronDown : faChevronRight} className="h-3 w-3 shrink-0 text-slate-500" />
                        <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wide text-slate-800 dark:text-slate-100">{area.nombre}</span>
                        {turno?.areaId === area.areaId ? (
                          <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">{turno.turnoNombre}</span>
                        ) : (
                          <span className="shrink-0 text-[11px] text-slate-600 dark:text-slate-300">{area.turnos.length} {area.turnos.length === 1 ? "turno" : "turnos"}</span>
                        )}
                      </button>
                      {abierta && (
                        <div className="grid grid-cols-1 gap-1.5 px-2.5 pb-2.5 sm:grid-cols-2">
                          {area.turnos.map((t) => {
                            const elegido = turno?.areaId === t.areaId && turno?.shiftId === t.shiftId;
                            return (
                              <button key={t.shiftId} type="button" onClick={() => elegirTurno(t)} aria-pressed={elegido} className={`flex min-h-[48px] items-center gap-2 rounded-lg border px-2.5 text-left ${elegido ? "border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-900/20 dark:text-blue-200" : "border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"}`}>
                                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${elegido ? "border-blue-600" : "border-slate-400"}`}>{elegido && <span className="h-2 w-2 rounded-full bg-blue-600" />}</span>
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium">{t.turnoNombre}</span>
                                  <span className="block text-[11px] text-slate-600 dark:text-slate-300">{[t.inicio && t.fin ? `${t.inicio}–${t.fin}` : "", t.diasTexto].filter(Boolean).join(" · ")}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
          </>
        )}

        {okTurno && (
          <>
        {/* HORARIO Y DÍAS */}
        <div id="campo-horario" className="space-y-2 scroll-mt-24">
          <Rotulo icono={faClock}>Horario (entrada - salida)</Rotulo>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <SelectorHora valor={b.inTime} onCambio={(h) => cambiar({ inTime: h || "" })} etiqueta="Entrada" placeholder="Entrada" className={CLASE_HORA} zIndex={120} />
            </div>
            <FontAwesomeIcon icon={faArrowRight} className="text-xs text-slate-500" aria-hidden />
            <div className="flex-1">
              <SelectorHora valor={b.outTime} onCambio={(h) => cambiar({ outTime: h || "" })} etiqueta="Salida" placeholder="Salida" desde={b.inTime} className={CLASE_HORA} zIndex={120} />
            </div>
          </div>
          {sueltos ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">Por jornada: los días se eligen al contratar.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {DIAS.map((d) => {
                const on = b.diasSemana.includes(d.i);
                return (
                  <button key={d.i} type="button" aria-pressed={on} onClick={() => cambiar({ diasSemana: on ? b.diasSemana.filter((x) => x !== d.i) : [...b.diasSemana, d.i].sort() })} className={`h-11 w-11 rounded-xl text-sm font-bold ${on ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200"}`}>
                    {d.corto}
                  </button>
                );
              })}
            </div>
          )}
        </div>
          </>
        )}

        {okTurno && (
          <>
        {/* NOMBRE DEL EQUIPO */}
        <div id="campo-nombre" className="space-y-2 scroll-mt-24">
          <Rotulo icono={faUsers} obligatorio>
            Nombre del equipo
          </Rotulo>
          <input value={b.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} placeholder="Ej. Sábado noche" maxLength={80} className={`${CLASE_CAMPO} ${error("campo-nombre") ? "border-red-500" : ""}`} aria-label="Nombre del equipo" />
        </div>
          </>
        )}

        {okNombre && (
          <>
        {/* PERSONAS (opcional) */}
        {puestos.length > 0 && (
          <div id="campo-personas" className="space-y-2 scroll-mt-24">
            <div className="flex items-center justify-between gap-2">
              <Rotulo icono={faUserPlus}>
                Personas · {asignadas}/{puestos.length}
              </Rotulo>
              <span className="text-xs text-slate-600 dark:text-slate-300">Opcional: también después</span>
            </div>
            {!esNuevo && (grupo?.equipos.length || 0) > 0 && (
              <select value={b.copiarDe} onChange={(e) => cambiar({ copiarDe: e.target.value, personas: {} })} className={CLASE_CAMPO} aria-label="Copiar personas de otro equipo">
                <option value="">Sin copiar de otro equipo</option>
                {grupo!.equipos.map((e) => (
                  <option key={e._id} value={e._id}>
                    Copiar las personas de «{e.nombre}»
                  </option>
                ))}
              </select>
            )}
            {!b.copiarDe && (
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/70">
                {puestos.map((x) => {
                  const persona = b.personas[x.n];
                  return (
                    <div key={x.n} className="flex min-h-[56px] items-center gap-3 px-3 py-1.5">
                      <span className="w-5 text-center text-sm font-bold tabular-nums text-slate-600 dark:text-slate-300">{x.n}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-slate-600 dark:text-slate-300">{nombreRol(x.rolId)}</span>
                        <span className={`block truncate text-sm font-semibold ${persona ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>{persona ? persona.nombre : "Sin asignar"}</span>
                      </span>
                      {persona ? (
                        <button type="button" onClick={() => { const n = { ...b.personas }; delete n[x.n]; cambiar({ personas: n }); }} className="min-h-[40px] shrink-0 rounded-lg px-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                          Quitar
                        </button>
                      ) : (
                        <button type="button" onClick={() => setHoja({ persona: x.n })} className="flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border border-blue-500 px-2.5 text-xs font-bold text-blue-700 dark:text-blue-300">
                          <FontAwesomeIcon icon={faUserPlus} />
                          Asignar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>

      {/* Paneles: uno por vez. */}
      <HojaInferior abierta={hoja === "proyecto"} onCerrar={() => setHoja(null)} titulo="Cliente | Proyecto">
        <div className="space-y-2">
          {(proyectos || []).map((p) => (
            <button key={p._id} type="button" onClick={() => { cambiar({ projectId: p._id, empresaContratoId: "", convenioId: "", turno: "", inTime: "", outTime: "", diasSemana: [] }); setHoja(null); }} className={`flex min-h-[48px] w-full items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold ${p._id === b.projectId ? "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200" : "border-slate-200 text-slate-900 dark:border-slate-700 dark:text-white"}`}>
              {p._id === b.projectId && <FontAwesomeIcon icon={faCheck} />}
              {etiquetaProyecto(p)}
            </button>
          ))}
        </div>
      </HojaInferior>
      <HojaRoles abierta={hoja === "roles"} onCerrar={() => setHoja(null)} roles={b.roles} roleFrames={catalogos.roleFrames} onCambio={(roles) => cambiar({ roles, personas: {} })} />
      <HojaInferior abierta={hoja === "contrato"} onCerrar={() => setHoja(null)} titulo="Tipo de contrato">
        <div className="space-y-2">
          {catalogos.contratos.map((c) => (
            <button key={c._id} type="button" onClick={() => { cambiar({ contratoId: c._id }); setHoja(null); }} className={`flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl border px-3 text-left ${c._id === b.contratoId ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-slate-200 dark:border-slate-700"}`}>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">{c.name}</span>
              <span className="shrink-0 text-[11px] font-bold uppercase text-slate-600 dark:text-slate-300">{catalogos.tramitePorContrato.get(c._id) === "constancia_cuit" ? "Servicios" : "ARCA"}</span>
            </button>
          ))}
        </div>
      </HojaInferior>
      <SelectorPersona
        abierta={!!hoja && typeof hoja === "object"}
        onCerrar={() => setHoja(null)}
        titulo={hoja && typeof hoja === "object" ? `Puesto ${hoja.persona} · ${nombreRol(puestos.find((x) => x.n === hoja.persona)?.rolId || "")}` : ""}
        projectId={b.projectId}
        rol={hoja && typeof hoja === "object" ? nombreRol(puestos.find((x) => x.n === hoja.persona)?.rolId || "") : undefined}
        marcas={new Map(Object.entries(b.personas).map(([n, p]) => [p._id, `Ya está en el puesto ${n}`]))}
        onElegir={(p) => hoja && typeof hoja === "object" && cambiar({ personas: { ...b.personas, [hoja.persona]: p } })}
      />
    </Pantalla>
  );
}

/** «2 Camarógrafo · 1 Director», en orden de aparición. */
function resumenRoles(ids: string[], nombre: (id: string) => string) {
  const cuenta = new Map<string, number>();
  for (const id of ids) cuenta.set(id, (cuenta.get(id) || 0) + 1);
  return [...cuenta.entries()].map(([id, c]) => `${c} ${nombre(id)}`).join(" · ");
}

/** Los roles del grupo nuevo, con + y −, y un buscador para sumar otros. */
function HojaRoles({ abierta, onCerrar, roles, roleFrames, onCambio }: { abierta: boolean; onCerrar: () => void; roles: { rolId: string; cantidad: number }[]; roleFrames: { _id: string; name: string }[]; onCambio: (r: { rolId: string; cantidad: number }[]) => void }) {
  const [busca, setBusca] = useState("");
  useEffect(() => {
    if (abierta) setBusca("");
  }, [abierta]);
  const cantidad = (id: string) => roles.find((r) => r.rolId === id)?.cantidad || 0;
  const poner = (id: string, n: number) => {
    if (n <= 0) onCambio(roles.filter((r) => r.rolId !== id));
    else if (roles.some((r) => r.rolId === id)) onCambio(roles.map((r) => (r.rolId === id ? { ...r, cantidad: n } : r)));
    else onCambio([...roles, { rolId: id, cantidad: n }]);
  };
  const q = busca.trim().toLowerCase();
  // Sin tildes ni mayúsculas, como los demás buscadores: «camarografo» encuentra «Camarógrafo».
  const lista = [...roleFrames].filter((r) => (q ? fuzzyMatch(r.name, busca) : cantidad(r._id) > 0)).sort((a, b) => a.name.localeCompare(b.name));
  const total = roles.reduce((s, r) => s + r.cantidad, 0);
  return (
    <HojaInferior abierta={abierta} onCerrar={onCerrar} titulo="Rol/es empresa" subtitulo={`${total} ${total === 1 ? "puesto" : "puestos"}`} pie={<button type="button" onClick={onCerrar} className="min-h-[48px] w-full rounded-xl bg-blue-600 text-sm font-bold text-white">Listo</button>}>
      <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar un rol para agregar…" aria-label="Buscar rol" className={`${CLASE_CAMPO} mb-3`} />
      {lista.length === 0 && <p className="py-4 text-center text-sm text-slate-700 dark:text-slate-200">{roleFrames.length === 0 ? "Cargando los roles…" : q ? "Ningún rol coincide." : "Buscá los roles del grupo (ej. Camarógrafo)."}</p>}
      <div className="space-y-1.5">
        {lista.map((r) => {
          const n = cantidad(r._id);
          return (
            <div key={r._id} className="flex min-h-[52px] items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">{r.name}</span>
              <button type="button" onClick={() => poner(r._id, n - 1)} disabled={n === 0} aria-label={`Un ${r.name} menos`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 text-slate-700 disabled:opacity-30 dark:border-slate-600 dark:text-slate-200">
                <FontAwesomeIcon icon={faMinus} />
              </button>
              <span className="w-6 text-center text-base font-bold tabular-nums text-slate-900 dark:text-white">{n}</span>
              <button type="button" onClick={() => poner(r._id, n + 1)} aria-label={`Un ${r.name} más`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-white">
                <FontAwesomeIcon icon={faPlus} />
              </button>
            </div>
          );
        })}
      </div>
    </HojaInferior>
  );
}

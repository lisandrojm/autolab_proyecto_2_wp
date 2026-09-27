import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faBriefcase, faBuilding, faCheck, faChevronRight, faClock, faFileContract, faLayerGroup, faMinus, faPlus, faSearch, faTimes, faUserPlus, faUsers } from "@fortawesome/free-solid-svg-icons";
import { Plantilla, PlantillaResumen, plantillasEquipoAPI } from "../../../../../api/plantillasEquipo";
import { SelectorHora } from "../../../../../components/contratacion/SelectorHora";
import { ChipValoracionDelProyecto } from "../../../../../components/proyectos/ChipValoracion";
import { sweetAlert } from "../../utils/sweetAlert";
import { etiquetaProyecto, OpcionAreaTurno } from "./useCatalogosContratacion";
import { usePlantillas } from "./contexto";
import { ALTO_ENCABEZADO, Pantalla } from "./Pantalla";
import { HojaModal } from "./HojaModal";
import { SelectorPersona } from "./SelectorPersona";
import { cambiosDeContrato, cambiosDeTurno, porDiasSueltos } from "./Condiciones";
import { categoriasDelNivel, rutas } from "./equipoUtil";
import CampoConvenio from "./CampoConvenio";
import { fuzzyMatch } from "../../../../../utils/searchHelpers";
import { CLASE_CAMPO, CLASE_HORA, DIAS } from "./comun";
import { BotonInfo } from "../ModalInfo";
import { EstadoBadge } from "../../../../../components/EstadoSelect";
import { InfoItem } from "../../../../../api/info";
import { TipoImpositivo, estadoImpositivoPorTipo } from "../../../../../utils/tramiteImpositivo";

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
  /** Las áreas y turnos que cubre el equipo ("areaId::shiftId"); el PRIMERO es el principal (el del equipo). */
  turnos: string[];
  /** A cuál va cada puesto (por número), si no es el principal. */
  turnoPorPuesto: Record<number, string>;
  inTime: string;
  outTime: string;
  diasSemana: number[];
  nombre: string;
  copiarDe: string;
  /** Personas por número de puesto (1, 2, …). */
  personas: Record<number, { _id: string; nombre: string }>;
}

const vacio = (projectId = "", grupoId = ""): Borrador => ({ projectId, grupoId, nombreGrupo: "", roles: [], empresaContratoId: "", convenioId: "", contratoId: "", turnos: [], turnoPorPuesto: {}, inTime: "", outTime: "", diasSemana: [], nombre: "", copiarDe: "", personas: {} });

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

/**
 * A QUÉ TRÁMITE VA ESE TIPO DE CONTRATO: ARCA o Servicios.
 *
 * El estado sale del ABM (`estadoImpositivoPorTipo`) y se dibuja con `EstadoBadge`, el mismo
 * componente que usa desk, así que el color es idéntico en las dos pantallas. Sólo se acorta el
 * texto: «PEDIDO DE ARCA» repetido en catorce renglones no entra en un teléfono.
 *
 * Sin estado configurado no se dibuja nada. Inventar un badge gris sería afirmar que el trámite es
 * uno de los dos cuando lo que pasa es que todavía nadie lo configuró.
 */
function BadgeTramite({ estados, tramite }: { estados: InfoItem[]; tramite: TipoImpositivo | null | undefined }) {
  const estado = estadoImpositivoPorTipo(estados, tramite || "");
  if (!estado) return null;
  return <EstadoBadge name={estado.name} etiqueta={tramite === "constancia_cuit" ? "Servicios" : "ARCA"} className="shrink-0" />;
}

export default function NuevoEquipo() {
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const { catalogos, areasDe, cargar } = usePlantillas();
  const [b, setB] = useState<Borrador>(() => {
    try {
      const guardado = JSON.parse(sessionStorage.getItem(CLAVE) || "null");
      const grupo = query.get("grupo") || "";
      // Un borrador de antes (un solo turno) se lee como la lista nueva.
      if (guardado && (!grupo || guardado.grupoId === grupo)) return { ...vacio(), ...guardado, turnos: guardado.turnos || (guardado.turno ? [guardado.turno] : []), turnoPorPuesto: guardado.turnoPorPuesto || {} };
      return vacio(query.get("proyecto") || "", grupo);
    } catch {
      return vacio(query.get("proyecto") || "", query.get("grupo") || "");
    }
  });
  const [grupos, setGrupos] = useState<PlantillaResumen[] | null>(null);
  const [grupo, setGrupo] = useState<Plantilla | null>(null);
  const [hoja, setHoja] = useState<null | "proyecto" | "roles" | "contrato" | "turno" | { persona: number }>(null);
  /*
    EL ÁREA ABIERTA ENCIMA DE LA HOJA DE ÁREAS.

    Va en su propio estado y no dentro de `hoja` justamente porque las dos tienen que estar abiertas a
    la vez: elegir un turno cierra la de arriba y deja la de abajo, que es lo que permite elegir el
    segundo turno sin volver a la página.
  */
  const [areaEnHoja, setAreaEnHoja] = useState<string | null>(null);
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
  const opcion = (v?: string) => (areas || []).find((o) => `${o.areaId}::${o.shiftId}` === v);
  /** El principal: el primero que se eligió. Define el horario, los días y el nombre del equipo. */
  const turno = opcion(b.turnos[0]);
  const elegidos = b.turnos.map(opcion).filter(Boolean) as OpcionAreaTurno[];
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
    if (areas?.length === 1 && !b.turnos.length) elegirTurno(areas[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areas?.length]);

  /**
   * Tildar o destildar un área y turno. El equipo puede cubrir varios (cada puesto va a uno); el primero
   * es el principal: su horario y sus días son los del equipo. Si se saca el principal, el siguiente pasa a serlo.
   */
  const elegirTurno = (o: OpcionAreaTurno) => {
    const v = `${o.areaId}::${o.shiftId}`;
    setB((p) => {
      const turnos = p.turnos.includes(v) ? p.turnos.filter((x) => x !== v) : [...p.turnos, v];
      const turnoPorPuesto = Object.fromEntries(Object.entries(p.turnoPorPuesto).filter(([, t]) => turnos.includes(t) && t !== turnos[0]));
      const principal = opcion(turnos[0]);
      if (!principal) return { ...p, turnos, turnoPorPuesto, inTime: "", outTime: "" };
      if (principal && turnos[0] === p.turnos[0]) return { ...p, turnos, turnoPorPuesto };
      const c = cambiosDeTurno(principal);
      return { ...p, turnos, turnoPorPuesto, inTime: c.inTime || "", outTime: c.outTime || "", diasSemana: c.diasSemana || p.diasSemana, nombre: p.nombre || principal.turnoNombre };
    });
  };

  // Qué falta, en el orden del formulario.
  const falta = !proyecto
    ? { texto: "Elegí el proyecto", id: "campo-proyecto" }
    : !b.grupoId
      ? { texto: "Elegí un grupo o creá uno nuevo", id: "campo-grupo" }
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
              : !b.turnos.length && (areas?.length || 0) > 0
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
  const okTurno = okContrato && (b.turnos.length > 0 || (areas?.length ?? 1) === 0);
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
      // Los puestos que van a otra área o turno que el principal: su horario y sus días son los de ESE turno.
      const condicionesPorPuesto: Record<string, any> = {};
      for (const [n, v] of Object.entries(b.turnoPorPuesto)) {
        const o = opcion(v);
        const puesto = p.integrantes[Number(n) - 1];
        if (!o || !puesto || v === b.turnos[0]) continue;
        const c = cambiosDeTurno(o);
        condicionesPorPuesto[puesto._id] = sueltos ? { areaId: c.areaId, shiftId: c.shiftId, inTime: c.inTime, outTime: c.outTime } : c;
      }
      p = await plantillasEquipoAPI.crearEquipo(p._id, b.nombre.trim(), b.copiarDe || undefined, condiciones as any, { projectId: proyecto._id, empresaContratoId: b.empresaContratoId || null, convenioId: convenioId || null, categorias, condicionesPorPuesto });
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
        {/* GRUPO DE PUESTOS: sin grupos todavía, directamente su nombre; con grupos, uno de ellos o «Nuevo grupo». */}
        <div id="campo-grupo" className="space-y-2 scroll-mt-24">
          <Rotulo icono={faLayerGroup} obligatorio>
            {grupos && grupos.length === 0 ? "Nombre del grupo de puestos" : "Grupo de puestos"}
          </Rotulo>
          {grupos === null ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">Cargando tus grupos…</p>
          ) : grupos.length > 0 ? (
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
          ) : null}
          {/* El nombre aparece recién al elegir «Nuevo grupo» (o solo, si todavía no hay grupos). */}
          {esNuevo && grupos !== null && (
            <input
              autoFocus={grupos.length > 0}
              value={b.nombreGrupo}
              onChange={(e) => cambiar({ nombreGrupo: e.target.value })}
              placeholder="Ej. Equipo Técnica"
              maxLength={120}
              className={`${CLASE_CAMPO} ${error("campo-grupo") ? "border-red-500" : ""}`}
              aria-label="Nombre del grupo"
            />
          )}
          {error("campo-grupo") && <p className="text-xs font-medium text-red-600 dark:text-red-400">{falta?.texto}.</p>}
        </div>
          </>
        )}

        {/*
          ESTA SECCIÓN SE VE DESDE EL PRINCIPIO, no cuando el grupo ya tiene nombre.

          Estaba detrás de `okGrupo`, así que la pantalla quedaba con dos campos y el resto en blanco
          hasta tipear la primera letra: no se sabía cuánto faltaba ni qué había que decidir. Lo que
          hay que distinguir no es «existe / no existe», es «esto lo tengo que completar» de «esto ya
          viene dado» — y eso se dice apagando el campo, no escondiéndolo.
        */}
        {/* EMPRESA Y CONVENIO, uno al lado del otro; debajo, ROL/ES EMPRESA (como en el alta individual). */}
        <div id="campo-roles" className="space-y-6 scroll-mt-24">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Rotulo icono={faBuilding} obligatorio>
                Empresa que contrata
              </Rotulo>
              {empresas.length === 0 ? (
                <p className="py-2 text-xs text-amber-700 dark:text-amber-300">{proyecto ? "El proyecto no tiene empresa del contrato asignada." : "Elegí primero el proyecto."}</p>
              ) : empresas.length === 1 ? (
                /*
                  Una sola: no es una elección, es el dato del proyecto. Va apagada y nada más —un
                  cartel que diga «fijo» es una palabra de más para algo que el gris ya dice, y encima
                  compite por el lugar con el dato.
                */
                <p className="flex h-12 items-center rounded-xl bg-slate-100 px-4 text-sm font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">{(empresas[0] as any).razonSocial}</p>
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
            </div>
            <div className="space-y-2">
              <Rotulo icono={faFileContract} obligatorio>
                Convenio
              </Rotulo>
              {b.empresaContratoId ? (
                <CampoConvenio sinRotulo proyecto={proyecto} empresaId={b.empresaContratoId} convenioId={b.convenioId} catalogos={catalogos} onChange={(id) => id !== b.convenioId && cambiar({ convenioId: id })} />
              ) : (
                <p className="flex h-12 items-center rounded-xl bg-slate-100 px-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">Elegí primero la empresa</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {/*
              QUÉ SE ESPERA ACÁ, en la «i» de siempre y no en un recuadro adentro del formulario.

              Un grupo de puestos es una PLANTILLA: la lista completa de roles que hace falta para
              armar ese equipo, con cuántos de cada uno. «Rol/es» invita a poner uno y seguir, y
              después el equipo sale incompleto sin que nada lo avise.

              La explicación va en el modal de ayuda —el mismo de todas las secciones— y no en un
              cartel fijo: un texto de cuatro renglones arriba del campo empuja hacia abajo justo lo
              que hay que completar, y se lee una sola vez en la vida.
            */}
            {/*
              EL RÓTULO SE PEGA DEBAJO DEL ENCABEZADO cuando ya hay roles.

              La lista de badges es larga —catorce oficios son catorce pastillas— y al scrollear se
              perdía de vista de qué eran: quedaban pastillas azules sueltas arriba del tipo de
              contrato. Con el rótulo pegado, todo lo que se ve abajo tiene su título encima.

              Sin roles no se pega: no hay nada que titular y un rótulo flotando sobre el vacío es un
              elemento de más.
            */}
            <div className={`flex items-center gap-1 ${b.roles.length ? "sticky z-20 -mx-4 border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-900" : ""}`} style={b.roles.length ? { top: ALTO_ENCABEZADO } : undefined}>
              <Rotulo icono={faBriefcase} obligatorio>
                Rol/es empresa
              </Rotulo>
              <BotonInfo
                icono={faBriefcase}
                titulo="Rol/es empresa"
                texto={
                  "Un grupo de puestos es una plantilla: poné TODOS los roles que hacen falta para armar este grupo, con cuántas personas de cada uno.\n\nLo que cargues acá es lo que se va a pedir cada vez que se use el grupo, así que conviene que esté completo: un rol que falte hay que agregarlo a mano en cada equipo.\n\nCon el + elegís roles y con los botones de cada uno cambiás la cantidad."
                }
              />
              {/*
                EL «+» ABRE EL MODAL, y vive al lado del rótulo.

                Antes el disparador era una caja del ancho de la pantalla que decía «Elegí uno o más
                roles…» y desaparecía en cuanto había uno: el control para agregar el segundo estaba
                en otro lugar que el del primero. Ahora es siempre el mismo botón, esté vacío o con
                catorce, y la frase pasó adentro del modal, que es donde se elige.
              */}
              {esNuevo && (
                <button
                  type="button"
                  onClick={() => setHoja("roles")}
                  aria-label="Elegí uno o más roles"
                  className={`ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white ${error("campo-roles") ? "ring-2 ring-red-500 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900" : ""}`}
                >
                  <FontAwesomeIcon icon={faPlus} />
                </button>
              )}
            </div>
            {esNuevo ? (
              b.roles.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {b.roles.map((r) => (
                    <BadgeRol key={r.rolId} nombre={nombreRol(r.rolId)} cantidad={r.cantidad} onCantidad={(n) => cambiar({ roles: n > 0 ? b.roles.map((x) => (x.rolId === r.rolId ? { ...x, cantidad: n } : x)) : b.roles.filter((x) => x.rolId !== r.rolId), personas: {} })} />
                  ))}
                </div>
              ) : null
            ) : grupo ? (
              <p className="text-sm text-slate-800 dark:text-slate-100">{resumenRoles(puestos.map((x) => x.rolId), nombreRol) || "Sin puestos"}</p>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-300">{b.grupoId ? "Cargando los puestos…" : "Elegí primero el grupo."}</p>
            )}
          </div>
        </div>

        {okRoles && (
          <>
        {/* TIPO DE CONTRATO */}
        <div id="campo-contrato" className="space-y-2 scroll-mt-24">
          {/*
            UNO SOLO PARA TODO EL EQUIPO, y hay que decirlo acá.

            Es una decisión de practicidad: doce puestos son doce contratos, y elegir tipo por
            puesto en el alta convierte un formulario en una planilla. Lo que se pierde no se pierde
            —cada puesto se edita entero después— pero eso el que mira la pantalla no lo sabe, y sin
            decirlo el campo se lee como «todos van a tener el mismo contrato y no hay vuelta atrás».
          */}
          <div className="flex items-center gap-1">
            <Rotulo icono={faFileContract} obligatorio>
              Tipo de contrato
            </Rotulo>
            <BotonInfo
              icono={faFileContract}
              titulo="Tipo de contrato"
              texto={
                "Acá elegís UN tipo de contrato para todo el equipo. Es por practicidad: en un grupo de doce puestos, elegirlo de a uno convierte el alta en una planilla.\n\nDespués, cada puesto se edita por separado y se le puede cambiar absolutamente todo —el tipo de contrato incluido, además del horario, los días, la categoría y el sueldo—.\n\nO sea que esto es el punto de partida del equipo, no una regla que después no se pueda tocar."
              }
            />
          </div>
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
            /*
              ELEGIR ES UN MODAL, NO UN ACORDEÓN.

              Abrir un área acá adentro empujaba media pantalla hacia abajo: había que bajar hasta el
              área, abrirla, elegir el turno y volver a subir para ver qué había quedado. Con cuatro
              áreas de cuatro turnos, eso es subir y bajar todo el tiempo.

              Ahora la página muestra SÓLO lo elegido, como badges, y elegir pasa en hojas que se
              abren encima y se cierran al tocar: la página no se mueve nunca.
            */
            <>
              {elegidos.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {elegidos.map((o, i) => (
                    <BadgeTurno key={`${o.areaId}::${o.shiftId}`} opcion={o} principal={i === 0 && elegidos.length > 1} onQuitar={() => elegirTurno(o)} />
                  ))}
                  <button type="button" onClick={() => setHoja("turno")} aria-label="Agregar área y turno" className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white">
                    <FontAwesomeIcon icon={faPlus} />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setHoja("turno")} className={`flex h-12 w-full items-center gap-2 rounded-xl border bg-slate-50 px-4 text-left dark:bg-slate-900 ${error("campo-turno") ? "border-red-500" : "border-slate-300 dark:border-slate-600"}`}>
                  <FontAwesomeIcon icon={faSearch} className="text-sm text-slate-500" />
                  <span className="truncate text-slate-600 dark:text-slate-300">Elegí el área y el turno…</span>
                </button>
              )}
              <p className="text-xs text-slate-600 dark:text-slate-300">Podés elegir varios: cada puesto va a uno (lo elegís abajo, en Puestos). El primero es el principal: su horario y sus días son los del equipo.</p>
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
                Puestos · personas {asignadas}/{puestos.length}
              </Rotulo>
              <span className="text-xs text-slate-600 dark:text-slate-300">Personas: opcional</span>
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
            {(!b.copiarDe || elegidos.length > 1) && (
              <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/70">
                {puestos.map((x) => {
                  const persona = b.personas[x.n];
                  return (
                    <div key={x.n} className="flex min-h-[56px] items-center gap-3 px-3 py-1.5">
                      <span className="w-5 text-center text-sm font-bold tabular-nums text-slate-600 dark:text-slate-300">{x.n}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-slate-600 dark:text-slate-300">{nombreRol(x.rolId)}</span>
                        {!b.copiarDe && <span className={`block truncate text-sm font-semibold ${persona ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>{persona ? persona.nombre : "Sin asignar"}</span>}
                        {/* Con varias áreas y turnos, a cuál va este puesto (por defecto, el principal). */}
                        {elegidos.length > 1 && (
                          <select
                            value={b.turnoPorPuesto[x.n] || b.turnos[0]}
                            onChange={(e) => {
                              const t = { ...b.turnoPorPuesto };
                              if (e.target.value === b.turnos[0]) delete t[x.n];
                              else t[x.n] = e.target.value;
                              cambiar({ turnoPorPuesto: t });
                            }}
                            aria-label={`Área y turno del puesto ${x.n}`}
                            className="mt-1 h-9 w-full rounded-lg border border-slate-300 bg-slate-50 px-2 text-xs font-medium text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                          >
                            {elegidos.map((o) => (
                              <option key={`${o.areaId}::${o.shiftId}`} value={`${o.areaId}::${o.shiftId}`}>
                                {o.areaNombre} · {o.turnoNombre}
                              </option>
                            ))}
                          </select>
                        )}
                      </span>
                      {b.copiarDe ? null : persona ? (
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
      <HojaModal abierta={hoja === "proyecto"} onCerrar={() => setHoja(null)} titulo="Cliente | Proyecto">
        <div className="space-y-2">
          {(proyectos || []).map((p) => (
            <button key={p._id} type="button" onClick={() => { cambiar({ projectId: p._id, empresaContratoId: "", convenioId: "", turnos: [], turnoPorPuesto: {}, inTime: "", outTime: "", diasSemana: [] }); setHoja(null); }} className={`flex min-h-[48px] w-full items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold ${p._id === b.projectId ? "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200" : "border-slate-200 text-slate-900 dark:border-slate-700 dark:text-white"}`}>
              {p._id === b.projectId && <FontAwesomeIcon icon={faCheck} />}
              {etiquetaProyecto(p)}
            </button>
          ))}
        </div>
      </HojaModal>
      {/*
        ÁREA Y TURNO: DOS HOJAS, UNA SOBRE OTRA.

        La de abajo lista las áreas; tocar una abre sus turnos encima; tildar un turno cierra la de
        arriba y deja la de abajo, lista para el siguiente. La página nunca se mueve, y lo elegido se
        ve en los badges cuando las dos se cierran.
      */}
      <HojaModal abierta={hoja === "turno"} onCerrar={() => { setHoja(null); setAreaEnHoja(null); }} titulo="Área y turno" subtitulo={elegidos.length > 0 ? `${elegidos.length} elegido${elegidos.length === 1 ? "" : "s"} · el primero es el principal` : "Tocá un área para ver sus turnos"}>
        <div className="space-y-2">
          {areasAgrupadas.map((area) => {
            const enArea = elegidos.filter((o) => o.areaId === area.areaId);
            return (
              <button key={area.areaId} type="button" onClick={() => setAreaEnHoja(area.areaId)} className="flex min-h-[56px] w-full items-center gap-2 rounded-xl border border-slate-200 px-3 text-left dark:border-slate-700">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold uppercase tracking-wide text-slate-800 dark:text-slate-100">{area.nombre}</span>
                  <span className="block truncate text-[11px] text-slate-600 dark:text-slate-300">
                    {enArea.length > 0 ? enArea.map((o) => o.turnoNombre).join(" · ") : `${area.turnos.length} ${area.turnos.length === 1 ? "turno" : "turnos"}`}
                  </span>
                </span>
                {enArea.length > 0 && <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">{enArea.length}</span>}
                <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 shrink-0 text-slate-400" />
              </button>
            );
          })}
        </div>
      </HojaModal>

      <HojaModal
        nivel={2}
        abierta={!!areaEnHoja}
        onCerrar={() => setAreaEnHoja(null)}
        titulo={areasAgrupadas.find((a) => a.areaId === areaEnHoja)?.nombre || "Turnos"}
        subtitulo="Tocá el turno que va a cubrir el equipo"
      >
        <div className="space-y-2">
          {(areasAgrupadas.find((a) => a.areaId === areaEnHoja)?.turnos || []).map((t) => {
            const v = `${t.areaId}::${t.shiftId}`;
            const elegido = b.turnos.includes(v);
            const principal = b.turnos[0] === v && b.turnos.length > 1;
            return (
              <button
                key={t.shiftId}
                type="button"
                // Elegir CIERRA: esta hoja ya cumplió, y lo que sigue —otro turno de otra área— está en la de abajo.
                onClick={() => { elegirTurno(t); setAreaEnHoja(null); }}
                aria-pressed={elegido}
                className={`flex min-h-[56px] w-full items-center gap-2 rounded-xl border px-3 text-left ${elegido ? "border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-900/20 dark:text-blue-200" : "border-slate-200 text-slate-800 dark:border-slate-700 dark:text-slate-100"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${elegido ? "border-blue-600 bg-blue-600 text-white" : "border-slate-400"}`}>{elegido && <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {t.turnoNombre}
                    {principal && <span className="ml-1.5 rounded bg-blue-600/15 px-1 text-[10px] font-bold uppercase">Principal</span>}
                  </span>
                  <span className="block truncate text-[11px] text-slate-600 dark:text-slate-300">{[t.inicio && t.fin ? `${t.inicio}–${t.fin}` : "", t.diasTexto].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            );
          })}
        </div>
      </HojaModal>

      <HojaRoles abierta={hoja === "roles"} onCerrar={() => setHoja(null)} roles={b.roles} roleFrames={catalogos.roleFrames} onCambio={(roles) => cambiar({ roles, personas: {} })} />
      <HojaModal abierta={hoja === "contrato"} onCerrar={() => setHoja(null)} titulo="Tipo de contrato">
        <div className="space-y-2">
          {catalogos.contratos.map((c) => (
            <button key={c._id} type="button" onClick={() => { cambiar({ contratoId: c._id }); setHoja(null); }} className={`flex min-h-[48px] w-full items-center justify-between gap-2 rounded-xl border px-3 text-left ${c._id === b.contratoId ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30" : "border-slate-200 dark:border-slate-700"}`}>
              <span className="text-sm font-semibold text-slate-900 dark:text-white">{c.name}</span>
              {/*
                EL MISMO BADGE QUE EN DESK, con el texto corto.

                El color es lo que distingue un contrato que va a ARCA de uno de servicios, y sale del
                ABM igual que allá: en gris, el renglón no dice nada y hay que acordarse cuál es cuál.
                El texto sí se acorta —«PEDIDO DE ARCA» al lado de cada nombre no entra en un teléfono—.
              */}
              <BadgeTramite estados={catalogos.estados} tramite={catalogos.tramitePorContrato.get(c._id)} />
            </button>
          ))}
        </div>
      </HojaModal>
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

/** Un rol elegido: su nombre, cuántos (− y +) y ✕ para sacarlo. */
/**
 * UN TURNO ELEGIDO, en la página: área, turno y su horario, con la X para sacarlo.
 *
 * El horario va adentro del badge y no sólo en la hoja: es lo que distingue «Mañana» de «Tarde»
 * cuando dos áreas tienen turnos con el mismo nombre, y sin él habría que abrir la hoja para saber
 * cuál quedó.
 */
function BadgeTurno({ opcion, principal, onQuitar }: { opcion: OpcionAreaTurno; principal: boolean; onQuitar: () => void }) {
  const horario = [opcion.inicio && opcion.fin ? `${opcion.inicio}–${opcion.fin}` : "", opcion.diasTexto].filter(Boolean).join(" · ");
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 py-1 pl-3 pr-1 text-xs font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
      <span className="min-w-0">
        <span className="block truncate">
          {opcion.areaNombre} · {opcion.turnoNombre}
          {/* El principal manda: su horario y sus días son los del equipo. Sin decirlo, el orden de los badges no significa nada. */}
          {principal && <span className="ml-1.5 rounded bg-blue-600/15 px-1 text-[10px] font-bold uppercase">Principal</span>}
        </span>
        {horario && <span className="block text-[10px] font-normal opacity-80">{horario}</span>}
      </span>
      <button type="button" onClick={onQuitar} aria-label={`Quitar ${opcion.areaNombre} ${opcion.turnoNombre}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60">
        <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

/**
 * UN ROL DEL GRUPO: DOS PASTILLAS SEPARADAS, la cantidad y el nombre.
 *
 * Eran una sola con cinco controles pegados —menos, número, más, nombre, quitar— y en un teléfono
 * eso es una fila de blancos de siete milímetros donde el dedo no acierta: querías sumar uno y
 * borrabas el rol. Separadas, cada grupo se lee por lo que hace y hay aire entre el «+» y la «×»,
 * que son las dos que no conviene confundir.
 *
 * BORRAR ES SÓLO LA «×». Con uno, el «−» queda apagado: restar de uno sacaba el rol de la lista, así
 * que el mismo botón bajaba la cantidad ocho veces y a la novena borraba todo — y en un teléfono eso
 * pasa de más, tocando rápido sin mirar el número.
 */
function BadgeRol({ nombre, cantidad, onCantidad }: { nombre: string; cantidad: number; onCantidad: (n: number) => void }) {
  // Las dos pastillas viajan juntas: `inline-flex` acá adentro evita que una quede sola al final de un renglón.
  const pastilla = "inline-flex items-center rounded-full border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-200";
  const redondo = "flex h-8 w-8 items-center justify-center rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${pastilla} px-0.5`}>
        <button
          type="button"
          onClick={() => onCantidad(cantidad - 1)}
          disabled={cantidad <= 1}
          aria-label={cantidad <= 1 ? `${nombre}: para sacarlo, la cruz` : `Un ${nombre} menos`}
          title={cantidad <= 1 ? "Para sacar el rol, la cruz" : undefined}
          className={`${redondo} disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent`}
        >
          <FontAwesomeIcon icon={faMinus} className="h-2.5 w-2.5" />
        </button>
        <span className="min-w-[1.25rem] text-center tabular-nums">{cantidad}</span>
        <button type="button" onClick={() => onCantidad(cantidad + 1)} aria-label={`Un ${nombre} más`} className={redondo}>
          <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5" />
        </button>
      </span>
      <span className={`${pastilla} py-0.5 pl-3 pr-0.5`}>
        {nombre}
        <button type="button" onClick={() => onCantidad(0)} aria-label={`Quitar ${nombre}`} className={`ml-1 ${redondo}`}>
          <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
        </button>
      </span>
    </span>
  );
}

/**
 * ELEGIR LOS ROLES DEL GRUPO, como Rol/es Empresa del alta individual: arriba los elegidos (badges, con
 * cuántos de cada uno), el buscador y todos los roles con su casilla. Tildar suma uno; los badges ajustan
 * la cantidad («2 × Camarógrafo»).
 */
function HojaRoles({ abierta, onCerrar, roles, roleFrames, onCambio }: { abierta: boolean; onCerrar: () => void; roles: { rolId: string; cantidad: number }[]; roleFrames: { _id: string; name: string }[]; onCambio: (r: { rolId: string; cantidad: number }[]) => void }) {
  const [busca, setBusca] = useState("");
  useEffect(() => {
    if (abierta) setBusca("");
  }, [abierta]);
  const nombre = (id: string) => roleFrames.find((r) => r._id === id)?.name || "Rol";
  const poner = (id: string, n: number) => {
    if (n <= 0) onCambio(roles.filter((r) => r.rolId !== id));
    else if (roles.some((r) => r.rolId === id)) onCambio(roles.map((r) => (r.rolId === id ? { ...r, cantidad: n } : r)));
    else onCambio([...roles, { rolId: id, cantidad: n }]);
  };
  // Sin tildes ni mayúsculas, como los demás buscadores: «camarografo» encuentra «Camarógrafo».
  const lista = [...roleFrames].filter((r) => fuzzyMatch(r.name, busca)).sort((a, b) => a.name.localeCompare(b.name));
  const total = roles.reduce((s, r) => s + r.cantidad, 0);
  return (
    <HojaModal
      abierta={abierta}
      onCerrar={onCerrar}
      titulo="Rol/es empresa"
      // Con ninguno, la instrucción; con alguno, el recuento. Lo que hace falta saber cambia según en cuál de los dos estás.
      subtitulo={total === 0 ? "Elegí uno o más roles…" : `${total} ${total === 1 ? "puesto" : "puestos"} · el oficio de cada puesto`}
      pie={
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={() => onCambio([])} disabled={roles.length === 0} className="min-h-[44px] px-2 text-sm font-bold text-red-600 disabled:opacity-40 dark:text-red-400">
            Limpiar
          </button>
          <button type="button" onClick={onCerrar} className="min-h-[44px] rounded-xl bg-blue-600 px-8 text-sm font-bold text-white">
            Listo
          </button>
        </div>
      }
    >
      {roles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {roles.map((r) => (
            <BadgeRol key={r.rolId} nombre={nombre(r.rolId)} cantidad={r.cantidad} onCantidad={(n) => poner(r.rolId, n)} />
          ))}
        </div>
      )}
      <div className="relative mb-3">
        <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar especialidad…" aria-label="Buscar rol" className={`${CLASE_CAMPO} pl-9`} />
      </div>
      {roleFrames.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-700 dark:text-slate-200">Cargando los roles…</p>
      ) : lista.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-700 dark:text-slate-200">Ningún rol coincide.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
          {lista.map((r) => {
            const n = roles.find((x) => x.rolId === r._id)?.cantidad || 0;
            return (
              <label key={r._id} className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border px-3 ${n ? "border-blue-500 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"}`}>
                <input type="checkbox" checked={n > 0} onChange={() => poner(r._id, n ? 0 : 1)} className="h-4 w-4 shrink-0 rounded" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100" title={r.name}>
                  {r.name}
                </span>
                {n > 1 && <span className="shrink-0 rounded bg-blue-600 px-1.5 text-xs font-bold text-white">×{n}</span>}
              </label>
            );
          })}
        </div>
      )}
    </HojaModal>
  );
}

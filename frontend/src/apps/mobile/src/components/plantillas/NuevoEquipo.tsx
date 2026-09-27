import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase, faBuilding, faCheck, faChevronRight, faFileContract, faLayerGroup, faPen, faPlus, faTimes, faUserPlus, faUsers } from "@fortawesome/free-solid-svg-icons";
import { Plantilla, PlantillaResumen, plantillasEquipoAPI } from "../../../../../api/plantillasEquipo";
import { ChipValoracionDelProyecto } from "../../../../../components/proyectos/ChipValoracion";
import { sweetAlert } from "../../utils/sweetAlert";
import { etiquetaProyecto, OpcionAreaTurno } from "./useCatalogosContratacion";
import { usePlantillas } from "./contexto";
import { Pantalla, TOPE_PEGADO } from "./Pantalla";
import { Pasos, PASOS_EQUIPO } from "./Pasos";
import { HojaModal } from "./HojaModal";
import { SelectorPersona } from "./SelectorPersona";
import { cambiosDeTurno } from "./Condiciones";
import { categoriasDelNivel, rutas } from "./equipoUtil";
import CampoConvenio from "./CampoConvenio";
import { CLASE_CAMPO } from "./comun";
import { BotonInfo } from "../ModalInfo";
import { AIRE, ENTRE, BadgeRol, CHICO, HojaRoles, ResumenTurnos, Rotulo, pastillaDe, resumenRoles } from "./piezas";

/*
  NUEVO EQUIPO, EN CUATRO PASOS: UNA DECISIÓN POR PANTALLA.

  Era una sola pantalla de siete campos que se iban destapando de a uno. En un teléfono eso son
  cuatro pantallas de scroll: nunca se ve cuánto falta, el botón fijo de abajo tapa el campo que se
  está completando, y al volver de elegir a alguien hay que buscar dónde se estaba. El formulario ya
  venía partido por dentro —cada sección esperaba a que la anterior estuviera completa—; lo único
  que faltaba era decirlo.

    1. PROYECTO Y CONVENIO — bajo qué condiciones se contrata. Casi siempre viene contestado solo:
       el proyecto trae su empresa y la empresa su convenio.
    2. GRUPO — uno que ya existe o uno nuevo, con sus roles y cuántos de cada uno. Es lo REUSABLE:
       el grupo sirve en cualquier proyecto.
    3. ÁREA Y TURNO — dónde y cuándo. Es lo que ata este equipo a ESTE proyecto, y de donde sale el
       nombre que se le propone.
    4. PERSONAS — quiénes lo cubren (opcional: se pueden asignar ahora o después).

  Ninguno de los cortes se inventó: el 2, el 3 y el 4 son los que ya hacían los gates `okRoles`,
  `okTurno` y `okNombre`. El 1 es el único agregado, y es el que más se nota: separa lo que casi
  siempre ya está de lo único que hay que completar.

  El paso vive en `?paso` y cada avance empuja al historial, así que el atrás del teléfono vuelve un
  paso —no tira el formulario— y recargar cae donde se estaba. Lo cargado queda en la sesión: ir a
  buscar a alguien, volver o recargar no pierde nada.

  «Crear equipo» crea el grupo si es nuevo, el equipo con sus condiciones y asigna a las personas.
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

export default function NuevoEquipo() {
  const [query, setQuery] = useSearchParams();
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
  /**
   * LOS PUESTOS A LOS QUE SE LES ESTÁ CAMBIANDO EL ÁREA Y TURNO.
   *
   * Es un conjunto y no un puesto suelto porque lo normal es mover VARIOS a la vez: un equipo de
   * catorce que cubre cinco áreas se reparte de a grupos —los cuatro de Vestuario, los tres de
   * Postproducción—, y hacerlo de a uno son catorce idas y vueltas.
   *
   * `null` = cerrado. Se abre con el puesto que se tocó ya adentro, que es el caso de uno solo.
   */
  const [puestosEnHoja, setPuestosEnHoja] = useState<Set<number> | null>(null);
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
  /*
    EL NOMBRE DE UN ROL, o su respaldo.

    «Rol» es lo que se ve cuando el id no está en el catálogo. Mientras el catálogo VIENE EN CAMINO,
    en cambio, no se dibuja el respaldo sino un esqueleto: catorce pastillas que dicen «Rol» y se
    acomodan solas un segundo después se leen como un error y no como una espera (ver `rolesCargados`).
  */
  const nombreRol = (id: string) => catalogos.roleFrames.find((r) => r._id === id)?.name || "Rol";

  const opcion = (v?: string) => (areas || []).find((o) => `${o.areaId}::${o.shiftId}` === v);
  const textoTurno = (v?: string) => {
    const o = opcion(v);
    return o ? `${o.areaNombre} · ${o.turnoNombre}` : "Sin turno";
  };
  /** Le pone el mismo área y turno a todos los puestos abiertos. El primero elegido no se guarda: es el que va por defecto. */
  const ponerTurnoA = (puestosN: Set<number>, v: string) => {
    const t = { ...b.turnoPorPuesto };
    for (const n of puestosN) {
      if (v === b.turnos[0]) delete t[n];
      else t[n] = v;
    }
    cambiar({ turnoPorPuesto: t });
  };
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

  /*
    QUÉ FALTA, UNA LISTA POR PASO Y EN EL ORDEN DE LOS CAMPOS.

    Como listas y no como ternarios anidados: eran nueve, con la indentación ya rota en el medio —dos
    ramas al mismo nivel que sus hermanas—, y agregar o mover un campo exigía contar signos de
    pregunta. Acá el orden se lee de arriba abajo y es el mismo en el que están los campos en la
    pantalla, que es lo que hace que «Elegí el convenio» lleve al de arriba y no al de abajo.

    Una por paso porque el botón de «Siguiente» sólo puede mirar lo de SU paso: con la lista entera
    quedaría apagado en el 1 por un turno que todavía no se puede elegir.

    `FALTAS` las pone en el orden de los pasos, y de ahí salen las tres respuestas que hacen falta:
    hasta dónde se puede avanzar, qué le falta al paso en el que se está, y si ya se puede crear.
  */
  const primeroQueFalta = (lista: readonly (readonly [boolean, string, string])[]) => lista.reduce<{ texto: string; id: string } | null>((primera, [cond, texto, id]) => primera || (cond ? { texto, id } : null), null);
  const FALTAS = [
    primeroQueFalta([
      [!proyecto, "Elegí el proyecto", "campo-proyecto"],
      [!b.empresaContratoId, "Elegí la empresa que contrata", "campo-empresa"],
      [!convenioId && (!catalogos.categoriasCargadas || !catalogos.conveniosCargados), "Cargando el convenio…", "campo-empresa"],
      [!convenioId && catalogos.conveniosDisponibles(proyecto, b.empresaContratoId, "").length > 0, "Elegí el convenio", "campo-empresa"],
    ] as const),
    primeroQueFalta([
      [!b.grupoId, "Elegí un grupo o creá uno nuevo", "campo-grupo"],
      [esNuevo && !b.nombreGrupo.trim(), "Poné el nombre del grupo", "campo-grupo"],
      [puestos.length === 0, "Elegí los roles del grupo", "campo-roles"],
    ] as const),
    primeroQueFalta([
      // Mientras cargan no se puede pasar de largo: sin la lista, «no hay turnos» y «todavía no llegaron» se ven igual.
      [areas === null, "Cargando las áreas y turnos…", "campo-turno"],
      [!b.turnos.length && (areas?.length || 0) > 0, "Elegí el área y el turno", "campo-turno"],
      [!b.nombre.trim(), "Poné el nombre del equipo", "campo-nombre"],
    ] as const),
    // Las personas son opcionales: el último paso nunca frena.
    null,
  ];
  const falta = FALTAS.find((f) => f) || null;
  const irA = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });

  /*
    EN QUÉ PASO SE ESTÁ.

    Sale de la URL para que el atrás del teléfono vuelva un paso y recargar caiga donde se estaba;
    pero se recorta contra el PRIMER PASO INCOMPLETO, así que un `?paso=4` escrito a mano —o una
    sesión vieja reabierta— no puede caer en una pantalla que depende de lo que todavía no se
    eligió. Para atrás nunca se recorta: volver a revisar siempre se puede.
  */
  const incompleto = FALTAS.findIndex((f) => f);
  const tope = incompleto === -1 ? PASOS_EQUIPO.length : incompleto + 1;
  const paso = Math.min(Math.max(1, Number(query.get("paso")) || 1), tope);
  const faltaDelPaso = FALTAS[paso - 1];
  const irAlPaso = (n: number) => {
    const q = new URLSearchParams(query);
    q.set("paso", String(n));
    // Empuja al historial —no reemplaza— para que el atrás del teléfono vuelva un paso.
    setQuery(q);
    setIntento(false);
    window.scrollTo(0, 0);
  };

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
      /*
        SIN TIPO DE CONTRATO: se elige en la pantalla del equipo, antes de contratar.

        El equipo nace sin él y esa pantalla lo pide en ámbar («Elegí el contrato»), que es donde
        corresponde: el tipo cambia entre una contratación y la siguiente, y fijarlo acá era fijar
        justo lo que más cambia.

        Los días y el horario salen del turno elegido (`cambiosDeTurno`), no de un campo propio.
      */
      const condiciones = {
        ...(turno ? { areaId: turno.areaId, shiftId: turno.shiftId } : {}),
        inTime: b.inTime || null,
        outTime: b.outTime || null,
        diasSemana: b.diasSemana,
        diasPorSemana: b.diasSemana.length || null,
      };
      // El equipo lleva su proyecto, su empresa, su convenio y la categoría de cada puesto en el nivel de ESE proyecto.
      const categorias = categoriasDelNivel(catalogos, proyecto, b.empresaContratoId, convenioId, p.integrantes);
      // Los puestos que van a otra área o turno que el principal: su horario y sus días son los de ESE turno.
      const condicionesPorPuesto: Record<string, any> = {};
      for (const [n, v] of Object.entries(b.turnoPorPuesto)) {
        const o = opcion(v);
        const puesto = p.integrantes[Number(n) - 1];
        if (!o || !puesto || v === b.turnos[0]) continue;
        /*
          Del turno de ESE puesto sale todo: área, turno, horario y días.

          Antes, con contratos por jornada se le sacaban los días —los elige quien contrata— pero eso
          ya no se sabe acá: el tipo de contrato se elige después. Los días del turno viajan siempre y
          la contratación los reemplaza si corresponde, que es donde se conoce el contrato.
        */
        condicionesPorPuesto[puesto._id] = cambiosDeTurno(o);
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

  const error = (id: string) => intento && faltaDelPaso?.id === id;
  const asignadas = Object.keys(b.personas).length;

  return (
    <Pantalla
      titulo="Nuevo equipo"
      contexto={proyecto ? etiquetaProyecto(proyecto) : undefined}
      // Lo que se va nombrando viaja en el encabezado: a la cuarta pantalla de scroll ya no se ve.
      chips={[
        { etiqueta: "Grupo", valor: esNuevo ? b.nombreGrupo.trim() : grupo?.nombre },
        { etiqueta: "Equipo", valor: b.nombre.trim() },
      ]}
      atras={b.grupoId && b.grupoId !== NUEVO ? rutas.grupo(b.grupoId) : rutas.lista}
      /*
        SIN EL CARTEL DE «QUÉ FALTA» DEBAJO DEL BOTÓN.

        Decía «Poné el nombre del grupo» sobre un formulario donde ese campo está a la vista, con su
        asterisco y su rótulo: era repetir en el pie lo que ya dice el campo, y encima ocupaba un
        renglón fijo del poco alto que queda en un teléfono.

        El botón apagado sigue diciendo que falta algo; qué falta lo dicen los asteriscos.
      */
      /* Desde el 2 se puede volver un paso. En el 1 sobra: la flecha de arriba sale del formulario. */
      atrasPaso={paso > 1 ? () => irAlPaso(paso - 1) : undefined}
      boton={
        paso < PASOS_EQUIPO.length
          ? { texto: "Siguiente", onClick: () => irAlPaso(paso + 1), deshabilitado: !!faltaDelPaso }
          : { texto: esNuevo ? "Crear grupo y equipo" : "Crear equipo", onClick: () => void crear(), deshabilitado: !!falta, cargando: creando }
      }
    >
      <div className="space-y-6">
        <Pasos actual={paso} pasos={PASOS_EQUIPO} />

        {paso === 1 && (
          <>
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

        {/*
          LA EMPRESA Y EL CONVENIO, ANTES DEL NOMBRE DEL GRUPO.

          Estaban entre el nombre y los roles, y ahí llegan tarde: los roles que se ofrecen y las
          categorías que se les pueden poner dependen del convenio, así que leerlo recién después
          de nombrar el grupo obliga a volver para arriba para saber bajo qué convenio se está
          armando. Van pegados al proyecto, que es de donde salen.

          Y así, después del nombre del grupo vienen directamente sus roles.
        */}
        <div id="campo-empresa" className="grid scroll-mt-24 grid-cols-1 gap-4 md:grid-cols-2">
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
          </>
        )}

        {paso === 2 && (
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
          {error("campo-grupo") && <p className="text-xs font-medium text-red-600 dark:text-red-400">{faltaDelPaso?.texto}.</p>}
        </div>

        {/*
          ESTA SECCIÓN SE VE DESDE EL PRINCIPIO, no cuando el grupo ya tiene nombre.

          Estaba detrás de `okGrupo`, así que la pantalla quedaba con dos campos y el resto en blanco
          hasta tipear la primera letra: no se sabía cuánto faltaba ni qué había que decidir. Lo que
          hay que distinguir no es «existe / no existe», es «esto lo tengo que completar» de «esto ya
          viene dado» — y eso se dice apagando el campo, no escondiéndolo.
        */}
        <div id="campo-roles" className="space-y-6 scroll-mt-24">

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
            <div className={`flex items-center gap-1 ${b.roles.length ? "sticky z-20 -mx-4 border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-900" : ""}`} style={b.roles.length ? { top: TOPE_PEGADO } : undefined}>
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
                /*
                  MIENTRAS NO ESTÉN LOS NOMBRES, UN ESQUELETO.

                  Los roles se guardan por id y el nombre sale del catálogo, que llega por su cuenta.
                  Entrando con un borrador ya cargado —volver de buscar una persona, o recargar— las
                  pastillas se dibujaban con el respaldo «Rol»: catorce que decían lo mismo y se
                  acomodaban solas un segundo después. Eso se lee como un error, no como una espera.
                */
                !catalogos.rolesCargados ? (
                  <div className={`flex flex-wrap items-center ${ENTRE}`} aria-busy="true" aria-label="Cargando los roles">
                    {b.roles.map((r) => (
                      <span key={r.rolId} className="inline-flex items-center gap-1.5">
                        <span className="h-9 w-[4.5rem] animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                        <span className="h-9 w-28 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className={`flex flex-wrap items-center ${ENTRE}`}>
                    {b.roles.map((r) => (
                      <BadgeRol key={r.rolId} nombre={nombreRol(r.rolId)} cantidad={r.cantidad} onCantidad={(n) => cambiar({ roles: n > 0 ? b.roles.map((x) => (x.rolId === r.rolId ? { ...x, cantidad: n } : x)) : b.roles.filter((x) => x.rolId !== r.rolId), personas: {} })} />
                    ))}
                  </div>
                )
              ) : null
            ) : grupo ? (
              <p className="text-sm text-slate-800 dark:text-slate-100">{resumenRoles(puestos.map((x) => x.rolId), nombreRol) || "Sin puestos"}</p>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-300">{b.grupoId ? "Cargando los puestos…" : "Elegí primero el grupo."}</p>
            )}
          </div>
        </div>
          </>
        )}

        {paso === 3 && (
          <>
        {/* ÁREA Y TURNO */}
        <div id="campo-turno" className="space-y-2 scroll-mt-24">
          {/*
            LA MISMA DISPOSICIÓN QUE ROL/ES EMPRESA: rótulo, «i» y «+», y el rótulo pegado debajo del
            encabezado mientras haya algo elegido.

            Son la misma clase de campo —una lista de cosas que se eligen de a varias en un modal— y
            hasta acá se veían distintos: uno con «+» y badges, el otro con una caja de búsqueda que
            desaparecía al primer turno. Dos formas para lo mismo se aprenden dos veces.
          */}
          <div className={`flex items-center gap-1 ${elegidos.length ? "sticky z-20 -mx-4 border-b border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-900" : ""}`} style={elegidos.length ? { top: TOPE_PEGADO } : undefined}>
            <Rotulo icono={faBriefcase} obligatorio>
              Área y turno
            </Rotulo>
            <BotonInfo
              icono={faBriefcase}
              titulo="Área y turno"
              texto={
                "Podés elegir varios: el equipo puede cubrir más de un área o turno, y después cada puesto va a uno (lo elegís abajo, en Puestos).\n\nEl horario y los días que aparecen más abajo se precargan con los del PRIMER turno que elijas, y el nombre del equipo se propone desde ahí. Los dos se pueden cambiar a mano.\n\nCon el + se abre la lista de áreas; tocá una para ver sus turnos."
              }
            />
            {areas !== null && areas.length > 0 && (
              <button
                type="button"
                onClick={() => setHoja("turno")}
                aria-label="Elegí el área y el turno"
                className={`ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white ${error("campo-turno") ? "ring-2 ring-red-500 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900" : ""}`}
              >
                <FontAwesomeIcon icon={faPlus} />
              </button>
            )}
          </div>
          {areas === null ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">Cargando las áreas y turnos del proyecto…</p>
          ) : areas.length === 0 ? (
            <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">El proyecto no tiene áreas y turnos configurados.</p>
          ) : elegidos.length > 0 ? (
            <ResumenTurnos elegidos={elegidos} onEditar={(areaId) => setAreaEnHoja(areaId)} onQuitarArea={(areaId) => elegidos.filter((o) => o.areaId === areaId).forEach(elegirTurno)} />
          ) : null}
        </div>

        {/* EL NOMBRE DEL EQUIPO, DEBAJO DEL TURNO QUE LO PROPONE: ahí se entiende de dónde salió. */}
        <div id="campo-nombre" className="space-y-2 scroll-mt-24">
          <Rotulo icono={faUsers} obligatorio>
            Nombre del equipo
          </Rotulo>
          <input value={b.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} placeholder="Ej. Sábado noche" maxLength={80} className={`${CLASE_CAMPO} ${error("campo-nombre") ? "border-red-500" : ""}`} aria-label="Nombre del equipo" />
        </div>
          </>
        )}

        {paso === 4 && (
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
                        {catalogos.rolesCargados ? <span className="block truncate text-xs text-slate-600 dark:text-slate-300">{nombreRol(x.rolId)}</span> : <span className="block h-3 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />}
                        {/*
                          LA PERSONA ASIGNADA, EN VERDE.

                          El verde es el único dato de este renglón que NO es una configuración: el
                          rol y el turno son decisiones del equipo, la persona es un puesto cubierto.
                          Contra catorce pastillas azules, las verdes dicen cuánto falta sin contar.

                          Misma forma que las demás —lo elegido se ve igual en toda la pantalla—; lo
                          que cambia es el color, y cambia porque significa otra cosa.

                          Sin persona no se escribe nada: el «+» de al lado ya es la respuesta.
                        */}
                        {!b.copiarDe && persona && (
                          <span className={`mt-0.5 max-w-full ${pastillaDe("verde")} ${AIRE}`}>
                            <span className="truncate">{persona.nombre}</span>
                          </span>
                        )}
                        {/*
                          A CUÁL DE LAS ÁREAS Y TURNOS VA ESTE PUESTO (por defecto, el primero).

                          Un botón que abre una hoja, no un `<select>` nativo: el desplegable del
                          sistema tapa la pantalla con su propia lista, no deja ver a qué puesto
                          pertenece, y sobre todo mueve UNO SOLO. Repartir catorce puestos entre
                          cinco áreas de a uno son catorce desplegables.
                        */}
                        {elegidos.length > 1 &&
                          /*
                            CON PERSONA, PASTILLA; SIN PERSONA, CONTROL.

                            Es la misma distinción que en todo el formulario: lo que falta decidir se
                            ve como un campo con su borde, y lo ya elegido como pastilla azul. Con el
                            puesto cubierto, el renglón entero —persona y turno— se lee de un vistazo
                            como resuelto en vez de parecer que todavía hay algo que tocar.

                            Sigue abriendo la hoja en los dos casos: cambia el aspecto, no lo que hace.
                          */
                          (persona ? (
                            <button type="button" onClick={() => setPuestosEnHoja(new Set([x.n]))} aria-label={`Cambiar el área y turno del puesto ${x.n}`} className={`mt-1 max-w-full ${pastillaDe("azul")} ${AIRE}`}>
                              <span className="truncate">{textoTurno(b.turnoPorPuesto[x.n] || b.turnos[0])}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setPuestosEnHoja(new Set([x.n]))}
                              aria-label={`Cambiar el área y turno del puesto ${x.n}`}
                              className="mt-1 flex h-9 w-full items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-2 text-left text-xs font-medium text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                            >
                              <span className="min-w-0 flex-1 truncate">{textoTurno(b.turnoPorPuesto[x.n] || b.turnos[0])}</span>
                              <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 shrink-0 text-slate-400" />
                            </button>
                          ))}
                      </span>
                      {/*
                        LOS MISMOS BOTONES QUE EN TODA LA PANTALLA: «+» azul para agregar, «×» gris
                        para sacar, lápiz gris para cambiar.

                        Eran «Asignar» con un ícono de persona y «Quitar» en texto: dos formas más
                        para lo que el resto de la pantalla ya resuelve con «+» y «×». En catorce
                        renglones, además, la palabra repetida catorce veces pesa más que el nombre de
                        la persona, que es lo que hay que leer.

                        Con persona son dos: el lápiz, que la CAMBIA —sin él, cambiar a alguien era
                        sacarlo y volver a buscar desde cero—, y la cruz, que la saca. Chicos y en
                        fila: son acciones sobre el renglón, no el renglón, y apilados le sumaban
                        alto a una lista de catorce.
                      */}
                      {b.copiarDe ? null : persona ? (
                        <span className="flex shrink-0 items-center gap-1">
                          <button type="button" onClick={() => setHoja({ persona: x.n })} aria-label={`Cambiar a ${persona.nombre} en el puesto ${x.n}`} className={CHICO}>
                            <FontAwesomeIcon icon={faPen} className="h-2.5 w-2.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const n = { ...b.personas };
                              delete n[x.n];
                              cambiar({ personas: n });
                            }}
                            aria-label={`Sacar a ${persona.nombre} del puesto ${x.n}`}
                            className={CHICO}
                          >
                            <FontAwesomeIcon icon={faTimes} className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setHoja({ persona: x.n })} aria-label={`Asignar a alguien al puesto ${x.n}`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                          <FontAwesomeIcon icon={faPlus} />
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
        ÁREA Y TURNO: DOS HOJAS, UNA SOBRE OTRA, Y NINGUNA SE CIERRA SOLA.

        La de abajo lista las áreas; tocar una abre sus turnos encima. Adentro se tildan los que haga
        falta y se sale con «Listo» — como en Rol/es empresa.

        Antes tildar un turno cerraba la hoja: la idea era no mover la pantalla, pero elegir cuatro
        turnos de un área era abrir y cerrar cuatro veces. Cerrar es una decisión de quien elige, no
        una consecuencia de tildar.
      */}
      <HojaModal
        abierta={hoja === "turno"}
        onCerrar={() => {
          setHoja(null);
          setAreaEnHoja(null);
        }}
        titulo="Área y turno"
        subtitulo={elegidos.length === 0 ? "Elegí el área y el turno…" : `${elegidos.length} elegido${elegidos.length === 1 ? "" : "s"}`}
        pie={
          <div className="flex items-center justify-between gap-3">
            {/* «Limpiar» borra TODO lo elegido, que es lo que muestra esta hoja. El de la hoja de turnos, sólo lo de su área. */}
            <button type="button" onClick={() => b.turnos.forEach((v) => { const o = opcion(v); if (o) elegirTurno(o); })} disabled={elegidos.length === 0} className="min-h-[44px] px-2 text-sm font-bold text-red-600 disabled:opacity-40 dark:text-red-400">
              Limpiar
            </button>
            <button type="button" onClick={() => { setHoja(null); setAreaEnHoja(null); }} className="min-h-[44px] rounded-xl bg-blue-600 px-8 text-sm font-bold text-white">
              Listo
            </button>
          </div>
        }
      >
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
        subtitulo="Tildá los turnos que va a cubrir el equipo"
        pie={
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => (areasAgrupadas.find((a) => a.areaId === areaEnHoja)?.turnos || []).forEach((t) => b.turnos.includes(`${t.areaId}::${t.shiftId}`) && elegirTurno(t))}
              disabled={!elegidos.some((o) => o.areaId === areaEnHoja)}
              className="min-h-[44px] px-2 text-sm font-bold text-red-600 disabled:opacity-40 dark:text-red-400"
            >
              Limpiar
            </button>
            <button type="button" onClick={() => setAreaEnHoja(null)} className="min-h-[44px] rounded-xl bg-blue-600 px-8 text-sm font-bold text-white">
              Listo
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          {(areasAgrupadas.find((a) => a.areaId === areaEnHoja)?.turnos || []).map((t) => {
            const v = `${t.areaId}::${t.shiftId}`;
            const elegido = b.turnos.includes(v);
            return (
              <button
                key={t.shiftId}
                type="button"
                // Tildar NO cierra: se eligen todos los que hagan falta y se sale con «Listo».
                onClick={() => elegirTurno(t)}
                aria-pressed={elegido}
                className={`flex min-h-[56px] w-full items-center gap-2 rounded-xl border px-3 text-left ${elegido ? "border-blue-500 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-900/20 dark:text-blue-200" : "border-slate-200 text-slate-800 dark:border-slate-700 dark:text-slate-100"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${elegido ? "border-blue-600 bg-blue-600 text-white" : "border-slate-400"}`}>{elegido && <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{t.turnoNombre}</span>
                  <span className="block truncate text-[11px] text-slate-600 dark:text-slate-300">{[t.inicio && t.fin ? `${t.inicio}–${t.fin}` : "", t.diasTexto].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            );
          })}
        </div>
      </HojaModal>

      {/*
        EL ÁREA Y TURNO DE UNOS PUESTOS.

        Arriba, los puestos: se abre con el que se tocó y se pueden sumar los demás. Abajo, los
        turnos del equipo: tocar uno se lo pone a todos los que estén tildados y cierra.
      */}
      <HojaModal
        abierta={!!puestosEnHoja}
        onCerrar={() => setPuestosEnHoja(null)}
        titulo="Área y turno del puesto"
        subtitulo={puestosEnHoja && puestosEnHoja.size > 1 ? `${puestosEnHoja.size} puestos elegidos` : "Tildá los puestos que van al mismo turno"}
      >
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Puestos</p>
            <div className="flex flex-wrap gap-1.5">
              {puestos.map((x) => {
                const tildado = !!puestosEnHoja?.has(x.n);
                return (
                  <button
                    key={x.n}
                    type="button"
                    onClick={() =>
                      setPuestosEnHoja((prev) => {
                        const n = new Set(prev || []);
                        if (n.has(x.n)) n.delete(x.n);
                        else n.add(x.n);
                        // Sin ninguno no hay a quién aplicarle el turno: se deja el que se tocó.
                        return n.size === 0 ? new Set([x.n]) : n;
                      })
                    }
                    aria-pressed={tildado}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${tildado ? "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200" : "border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200"}`}
                  >
                    <span className="tabular-nums">{x.n}</span>
                    <span className="max-w-[9rem] truncate font-normal">{nombreRol(x.rolId)}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Va a</p>
            <div className="space-y-2">
              {elegidos.map((o) => {
                const v = `${o.areaId}::${o.shiftId}`;
                const todos = [...(puestosEnHoja || [])].every((n) => (b.turnoPorPuesto[n] || b.turnos[0]) === v);
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      ponerTurnoA(puestosEnHoja || new Set(), v);
                      setPuestosEnHoja(null);
                    }}
                    className={`flex min-h-[56px] w-full items-center gap-2 rounded-xl border px-3 text-left ${todos ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-slate-200 dark:border-slate-700"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{o.areaNombre} · {o.turnoNombre}</span>
                      <span className="block truncate text-[11px] text-slate-600 dark:text-slate-300">{[o.inicio && o.fin ? `${o.inicio}–${o.fin}` : "", o.diasTexto].filter(Boolean).join(" · ")}</span>
                    </span>
                    {todos && <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-300" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </HojaModal>

      <HojaRoles abierta={hoja === "roles"} onCerrar={() => setHoja(null)} roles={b.roles} roleFrames={catalogos.roleFrames} onCambio={(roles) => cambiar({ roles, personas: {} })} />
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


import { useEffect, useMemo, useState } from "react";
import { projectsAPI, Project } from "../../../../../api/projects";
import { companiesAPI, Company } from "../../../../../api/companies";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../../../../../api/simpleCatalog";
import { categoriaSatAPI, CategoriaSatItem } from "../../../../../api/categoriasSat";
import { roleFrameAPI, RoleFrameItem } from "../../../../../api/roleFrames";
import { contratosAPI, ContratoItem } from "../../../../../api/contratos";
import { contratoFrameAPI, ContratoFrameItem } from "../../../../../api/contratosFrame";
import { infoAPI, InfoItem } from "../../../../../api/info";
import { activityLogTypesAPI, RequestConfig } from "../../../../../api/requestConfig";
import { categoriasOfrecidas, codigosDeConveniosDeLaEmpleadora, conveniosOfrecidos } from "../../../../../utils/seleccionConvenioCategoria";
import { TipoImpositivo, tipoImpositivoDeContrato } from "../../../../../utils/tramiteImpositivo";
import { claveOrdenTurno, textoDeDias } from "../../../../../utils/jerarquiaTurnos";
import { useProfile } from "../../hooks/useProfile";

/*
  LOS CATÁLOGOS DE LA CONTRATACIÓN, para las plantillas de equipo.

  Son los mismos que carga el formulario individual (`UserRegistrationModal`) y se usan con las MISMAS
  funciones puras: la cadena proyecto → empresa → convenio (`codigosDeConveniosDeLaEmpleadora`,
  `conveniosOfrecidos`), las categorías del rol dentro del convenio (`categoriasOfrecidas`) y el trámite
  de cada tipo de contrato (`tipoImpositivoDeContrato`). Así una plantilla ofrece exactamente lo que
  ofrecería el alta de a uno.
*/

export interface OpcionAreaTurno {
  areaId: string;
  areaNombre: string;
  shiftId: string;
  turnoNombre: string;
  inicio: string;
  fin: string;
  dias: number[];
  diasTexto: string;
  orden: string;
}

const idDe = (x: any) => (x && typeof x === "object" ? String(x._id) : String(x || ""));

export const opcionAreaTurno = (area: any, turno: any): OpcionAreaTurno => {
  const t = turno && typeof turno === "object" ? turno : null;
  return {
    areaId: idDe(area),
    areaNombre: (area && typeof area === "object" && area.name) || "Área",
    shiftId: idDe(turno),
    turnoNombre: t?.name || "Turno",
    inicio: t?.startTime || "",
    fin: t?.endTime || "",
    dias: Array.isArray(t?.days) ? t.days.map(Number) : [],
    diasTexto: Array.isArray(t?.days) && t.days.length > 0 ? textoDeDias(t.days) : "",
    orden: claveOrdenTurno(t),
  };
};

/** «Cliente | Proyecto», que es como se lo reconoce: el nombre solo se repite entre clientes. */
export const etiquetaProyecto = (p: Project) => (typeof p.clientId === "object" && (p.clientId as any)?.name ? `${(p.clientId as any).name} | ${p.name}` : p.name);

const conveniosApi = createSimpleCatalogApi("/convenios");

export function useCatalogosContratacion(activo = true) {
  const { profile } = useProfile();
  const [proyectosActivos, setProyectosActivos] = useState<Project[] | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [convenios, setConvenios] = useState<SimpleCatalogItem[]>([]);
  const [categoriasSat, setCategoriasSat] = useState<CategoriaSatItem[]>([]);
  /** Las categorías tardan (son más de mil): sin ellas no se sabe qué convenios ofrecer. */
  const [categoriasCargadas, setCategoriasCargadas] = useState(false);
  const [roleFrames, setRoleFrames] = useState<RoleFrameItem[]>([]);
  const [contratos, setContratos] = useState<ContratoItem[]>([]);
  const [contratoFrames, setContratoFrames] = useState<ContratoFrameItem[]>([]);
  const [estados, setEstados] = useState<InfoItem[]>([]);
  const [motivos, setMotivos] = useState<RequestConfig[]>([]);

  useEffect(() => {
    if (!activo) return;
    // Cada uno se pinta cuando llega y falla solo, igual que en el formulario individual.
    projectsAPI
      .listAll({ slim: true })
      .then((ps) => setProyectosActivos(ps.filter((p) => p.status === "active")))
      .catch(() => setProyectosActivos([]));
    companiesAPI.list({ slim: true }).then(setCompanies).catch(() => undefined);
    conveniosApi.list().then(setConvenios).catch(() => undefined);
    categoriaSatAPI
      .list()
      .then(setCategoriasSat)
      .catch(() => undefined)
      .finally(() => setCategoriasCargadas(true));
    roleFrameAPI.list().then(setRoleFrames).catch(() => undefined);
    contratosAPI
      .list()
      .then((cs) => setContratos(cs.filter((c) => c.isActive !== false)))
      .catch(() => undefined);
    contratoFrameAPI.list().then(setContratoFrames).catch(() => undefined);
    infoAPI.listByType("estado-empleado").then(setEstados).catch(() => undefined);
    // Mismo filtro que Novedades y el alta individual: activos y sin «horas extra».
    activityLogTypesAPI
      .getAll()
      .then((tipos) => setMotivos(tipos.filter((t) => t.isActive && !t.name.toLowerCase().includes("horas extra"))))
      .catch(() => undefined);
  }, [activo]);

  /** Los proyectos que la persona tiene a cargo, si el perfil dice cuáles (mismo criterio que el alta). */
  const proyectos = useMemo(() => {
    if (!proyectosActivos) return null;
    const propios = profile?.projectIds || [];
    return propios.length > 0 ? proyectosActivos.filter((p) => propios.includes(p._id)) : proyectosActivos;
  }, [proyectosActivos, profile]);

  /** El trámite que declara cada tipo de contrato; «constancia_cuit» = servicios. */
  const tramitePorContrato = useMemo(() => {
    const m = new Map<string, TipoImpositivo>();
    for (const c of contratos) {
      const t = tipoImpositivoDeContrato(c._id, contratoFrames, estados);
      if (t) m.set(c._id, t);
    }
    return m;
  }, [contratos, contratoFrames, estados]);

  /** Las empleadoras del proyecto (las que no usa, no se ofrecen). */
  const empresasDelProyecto = (proyecto: Project | null | undefined) => {
    const ids = new Set(((proyecto?.contratoEmpresas || []) as any[]).map(String));
    return companies.filter((c) => ids.has(c._id));
  };

  /** Los CCT posibles: los de la empleadora, acotados por los del proyecto si los declaró. */
  const codigosEmpleadora = (proyecto: Project | null | undefined, empresaId: string | null | undefined) => {
    const deLaEmpresa = codigosDeConveniosDeLaEmpleadora(
      companies.find((c) => c._id === empresaId),
      convenios,
    );
    if (!deLaEmpresa) return null;
    const delProyecto = new Set<string>();
    for (const id of (proyecto as any)?.convenioIds || []) {
      const cct = String(convenios.find((c) => c._id === String(id))?.externalId || "").trim();
      if (cct) delProyecto.add(cct);
    }
    if (delProyecto.size === 0) return deLaEmpresa;
    const cruce = deLaEmpresa.filter((cct) => delProyecto.has(cct));
    return cruce.length > 0 ? cruce : deLaEmpresa;
  };

  const cctDeConvenio = (convenioId: string | null | undefined) => String(convenios.find((c) => c._id === convenioId)?.externalId || "").trim();
  const convenioPorCct = (cct: string) => convenios.find((c) => String(c.externalId || "").trim() === cct) || null;

  const conveniosDisponibles = (proyecto: Project | null | undefined, empresaId: string | null | undefined, convenioId: string | null | undefined) =>
    conveniosOfrecidos({ codigosEmpleadora: codigosEmpleadora(proyecto, empresaId), convenioElegido: cctDeConvenio(convenioId), categorias: categoriasSat, convenios });

  /**
   * EL CONVENIO DE LA EMPRESA, cuando es uno solo (el caso normal: 2030 y FZERO sólo tienen categorías
   * en el 0634/11). Se muestra y se usa directamente, sin depender de que un efecto lo haya preseleccionado.
   * `null` si hay que elegir entre varios, si no hay ninguno o si todavía no llegaron las categorías.
   */
  const convenioUnico = (proyecto: Project | null | undefined, empresaId: string | null | undefined) => {
    if (!empresaId || !categoriasCargadas) return null;
    const lista = conveniosOfrecidos({ codigosEmpleadora: codigosEmpleadora(proyecto, empresaId), convenioElegido: "", categorias: categoriasSat, convenios });
    if (lista.length !== 1) return null;
    const doc = convenioPorCct(lista[0].externalId);
    return doc ? { _id: doc._id, cct: lista[0].externalId, nombre: doc.name || lista[0].name || "" } : null;
  };

  /**
   * Las categorías que se le pueden dar a alguien con esos roles, dentro del convenio: el mismo cruce
   * que el formulario individual. Devuelve los documentos del catálogo (`_id`), que es lo que se guarda.
   */
  const categoriasPara = (proyecto: Project | null | undefined, empresaId: string | null | undefined, convenioId: string | null | undefined, rolesFrameIds: string[], verTodasDelConvenio = false) => {
    const r = categoriasOfrecidas({
      rolesFrame: roleFrames.filter((rf) => rolesFrameIds.includes(rf._id)),
      convenioElegido: cctDeConvenio(convenioId),
      codigosEmpleadora: codigosEmpleadora(proyecto, empresaId),
      categorias: categoriasSat,
      verTodasDelConvenio,
      valoracionProyecto: proyecto?.valoracionId ? (typeof proyecto.valoracionId === "object" ? String((proyecto.valoracionId as any)._id) : String(proyecto.valoracionId)) : "",
    });
    const porDataId = new Map(categoriasSat.map((c) => [String(c.data?.id), c]));
    return { ...r, documentos: r.categorias.map((c) => porDataId.get(String(c.id))).filter(Boolean) as CategoriaSatItem[] };
  };

  return {
    proyectos,
    companies,
    convenios,
    categoriasSat,
    roleFrames,
    contratos,
    motivos,
    tramitePorContrato,
    empresasDelProyecto,
    conveniosDisponibles,
    convenioUnico,
    categoriasCargadas,
    convenioPorCct,
    cctDeConvenio,
    categoriasPara,
  };
}

export type CatalogosContratacion = ReturnType<typeof useCatalogosContratacion>;

/** Las áreas y turnos del proyecto, del documento completo (el listado liviano no los trae). `null` mientras llega. */
export function useAreasDelProyecto(projectId: string | null | undefined) {
  const [opciones, setOpciones] = useState<OpcionAreaTurno[] | null>(null);
  useEffect(() => {
    setOpciones(null);
    if (!projectId) return;
    let cancelado = false;
    projectsAPI
      .getProject(projectId, { team: "ids" })
      .then((p) => !cancelado && setOpciones(((p.areasConfig || []) as any[]).flatMap((ac) => (ac.shiftIds || []).map((s: any) => opcionAreaTurno(ac.areaId, s))).sort((a, b) => `${a.areaNombre}${a.orden}`.localeCompare(`${b.areaNombre}${b.orden}`))))
      .catch(() => !cancelado && setOpciones([]));
    return () => {
      cancelado = true;
    };
  }, [projectId]);
  return opciones;
}

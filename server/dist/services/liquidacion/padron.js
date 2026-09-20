import UserProject from "../../models/UserProject.js";
import { User } from "../../models/User.js";
import { Project } from "../../models/Project.js";
import { Company } from "../../models/Company.js";
import { CentroCosto } from "../../models/CentroCosto.js";
import { contratoVigenteEn, empresaDelContrato, limitesDelPeriodo, regimenDelContrato, resolvio, aDia, } from "../../utils/liquidacion/contratos.js";
/** Los campos del contrato que el padrón necesita. Nada más: cada uno se paga en bytes. */
const CAMPOS_CONTRATO = {
    nombre_contrato: "$contracts.nombre_contrato",
    tipo_contrato_id: "$contracts.tipo_contrato_id",
    cantidad_jornadas_laborales: "$contracts.cantidad_jornadas_laborales",
    fecha_alta_contrato: "$contracts.fecha_alta_contrato",
    fecha_baja_contrato: "$contracts.fecha_baja_contrato",
    empresaContratoId: "$contracts.empresaContratoId",
    nombre_rol_frame: "$contracts.nombre_rol_frame",
};
export async function armarPadron(tenantId, periodo, filtros = {}) {
    const { desde, hasta } = limitesDelPeriodo(periodo);
    /*
      EL TENANT SE ACOTA POR PROYECTO, no por un campo.
  
      `users_&_projects` no tiene `tenantId` —es una colección heredada del importador—, así que la
      única forma correcta de no mezclar tenants es partir de los proyectos del tenant y filtrar por
      ellos. Son 44, entran en un `$in` sin problema.
    */
    const proyectos = await Project.find({ tenantId })
        .select("name metadata.centroCostoId metadata.centroCostoEmpresaTangoId")
        .lean();
    const proyectoPorId = new Map(proyectos.map((p) => [String(p._id), p]));
    const idsProyectos = proyectos.map((p) => p._id);
    const idsFiltrados = filtros.projectId ? idsProyectos.filter((id) => String(id) === filtros.projectId) : idsProyectos;
    const empresas = await Company.find({}).select("razonSocial").lean();
    const conocidas = empresas.map((e) => ({ id: String(e._id), razonSocial: e.razonSocial }));
    const empresaPorId = new Map(conocidas.map((e) => [e.id, e.razonSocial]));
    /*
      LA VIGENCIA SE FILTRA EN MONGO, NO ACÁ.
  
      Medido: desenrollar los 7.462 contratos y filtrarlos en JavaScript son 8,4 s; filtrarlos en la
      consulta y traer los 582 que sirven son 0,75 s. Once veces, y la diferencia se paga en cada
      corrida.
  
      El `$convert` está porque `fecha_alta_contrato` viene MEZCLADA: en unos contratos es Date y en
      otros string. Comparar tipos distintos en Mongo no falla, da de menos en silencio —la primera
      versión de esto perdía 12 contratos—, así que las dos se llevan a "AAAA-MM-DD" antes de comparar.
    */
    const aTexto = (campo) => ({
        $substrBytes: [{ $convert: { input: campo, to: "string", onError: "", onNull: "" } }, 0, 10],
    });
    const vinculos = await UserProject.aggregate([
        { $match: { projectId: { $in: idsFiltrados } } },
        { $unwind: "$contracts" },
        { $addFields: { _alta: aTexto("$contracts.fecha_alta_contrato"), _baja: aTexto("$contracts.fecha_baja_contrato") } },
        { $match: { _alta: { $gt: "", $lte: hasta }, $or: [{ _baja: "" }, { _baja: { $gte: desde } }] } },
        { $project: { userId: 1, projectId: 1, contrato: CAMPOS_CONTRATO } },
    ]);
    // La vigencia exacta la decide igual la función testeada: la consulta acota, no manda.
    const vigentes = vinculos.filter((v) => contratoVigenteEn(v.contrato, desde, hasta));
    const idsUsuarios = [...new Set(vigentes.map((v) => String(v.userId)))];
    const usuarios = await User.find({ _id: { $in: idsUsuarios }, tenantId })
        .select("firstName lastName metadata.numeroLegajoTango metadata.legajosPorEmpresa")
        .lean();
    const usuarioPorId = new Map(usuarios.map((u) => [String(u._id), u]));
    /* Los centros de costo de los proyectos que participan, resueltos por (empresa de Tango, id). */
    const pares = proyectos
        .map((p) => ({ id: p.metadata?.centroCostoId, empresaTangoId: p.metadata?.centroCostoEmpresaTangoId }))
        .filter((x) => Number.isFinite(Number(x.id)) && Number(x.id) > 0);
    const centros = pares.length
        ? await CentroCosto.find({ idAuxiliar: { $in: [...new Set(pares.map((x) => Number(x.id)))] } })
            .select("idAuxiliar codAuxiliar descAuxiliar empresaTangoId")
            .lean()
        : [];
    const filas = [];
    const excepciones = [];
    for (const v of vigentes) {
        const contrato = v.contrato;
        const usuario = usuarioPorId.get(String(v.userId));
        if (!usuario)
            continue; // De otro tenant: el proyecto es de este, la persona no.
        const proyecto = proyectoPorId.get(String(v.projectId));
        const apellidoYNombre = `${usuario.lastName || ""}, ${usuario.firstName || ""}`.replace(/^, |, $/g, "").trim();
        const filaId = [String(v.userId), String(v.projectId), aDia(contrato.fecha_alta_contrato), contrato.nombre_contrato || ""].join("|");
        const base = { filaId, userId: String(v.userId), apellidoYNombre, projectId: String(v.projectId), proyectoNombre: proyecto?.name || "" };
        const anotar = (tipo, detalle) => excepciones.push({ ...base, tipo, detalle });
        /* Empresa */
        const rEmpresa = empresaDelContrato(contrato, conocidas);
        const empresaId = resolvio(rEmpresa) ? rEmpresa.valor : null;
        if (!resolvio(rEmpresa))
            anotar(rEmpresa.motivo, rEmpresa.detalle);
        /* Régimen */
        const rRegimen = regimenDelContrato(contrato);
        const regimen = resolvio(rRegimen) ? rRegimen.valor : null;
        if (!resolvio(rRegimen))
            anotar(rRegimen.motivo, rRegimen.detalle);
        /* Centro de costo: (empresa de Tango, id) identifica uno solo; el id solo es ambiguo. */
        const ccId = Number(proyecto?.metadata?.centroCostoId);
        const ccEmpresaTango = proyecto?.metadata?.centroCostoEmpresaTangoId;
        let centro = null;
        if (Number.isFinite(ccId) && ccId > 0) {
            const candidatos = centros.filter((c) => Number(c.idAuxiliar) === ccId);
            const exacto = candidatos.filter((c) => Number(c.empresaTangoId) === Number(ccEmpresaTango));
            if (exacto.length === 1)
                centro = exacto[0];
            else if (candidatos.length === 1)
                centro = candidatos[0];
            else if (candidatos.length > 1)
                anotar("centro_de_costo_ambiguo", `El centro ${ccId} existe en ${candidatos.length} empresas de Tango y el proyecto no dice en cuál.`);
            else
                anotar("sin_centro_de_costo", `El proyecto apunta al centro ${ccId}, que no está en el catálogo.`);
        }
        else {
            anotar("sin_centro_de_costo", "El proyecto no tiene centro de costo asignado.");
        }
        /* Legajo: el de la empresa si está, el heredado de Tango como respaldo. */
        const porEmpresa = (usuario.metadata?.legajosPorEmpresa || []).find((l) => empresaId && String(l.empresaId) === empresaId);
        const legajoTango = String(usuario.metadata?.numeroLegajoTango || "").trim();
        const legajo = porEmpresa?.legajo || legajoTango || null;
        if (!legajo)
            anotar("sin_legajo", "No tiene legajo cargado, ni por empresa ni el heredado de Tango.");
        filas.push({
            ...base,
            legajo,
            empresaId,
            empresaNombre: empresaId ? empresaPorId.get(empresaId) || null : null,
            ccCodigo: centro?.codAuxiliar ?? null,
            ccNombre: centro?.descAuxiliar ?? null,
            regimen,
            rolFrame: contrato.nombre_rol_frame || null,
            contrato: {
                nombre: contrato.nombre_contrato || null,
                tipoId: contrato.tipo_contrato_id ?? null,
                jornadas: contrato.cantidad_jornadas_laborales ?? null,
                alta: aDia(contrato.fecha_alta_contrato),
                baja: aDia(contrato.fecha_baja_contrato),
            },
            origen: {
                empresa: resolvio(rEmpresa) ? rEmpresa.origen : null,
                regimen: resolvio(rRegimen) ? rRegimen.origen : null,
                legajo: porEmpresa ? "por_empresa" : legajoTango ? "tango" : null,
            },
        });
    }
    /*
      EL MISMO LEGAJO PARA DOS PERSONAS DENTRO DE UNA EMPRESA ES UNA COLISIÓN, y en Memosoft significa
      que las novedades de una se le cargan a la otra. Sólo choca dentro de la empresa: el 00001 de
      2030 y el 00001 de FZERO son dos personas distintas y eso está bien.
    */
    const porEmpresaYLegajo = new Map();
    for (const f of filas) {
        if (!f.legajo || !f.empresaId)
            continue;
        const clave = `${f.empresaId}|${f.legajo}`;
        porEmpresaYLegajo.set(clave, (porEmpresaYLegajo.get(clave) || new Set()).add(f.userId));
    }
    for (const f of filas) {
        if (!f.legajo || !f.empresaId)
            continue;
        const comparten = porEmpresaYLegajo.get(`${f.empresaId}|${f.legajo}`);
        if (comparten.size > 1) {
            excepciones.push({
                tipo: "legajo_duplicado",
                filaId: f.filaId,
                userId: f.userId,
                apellidoYNombre: f.apellidoYNombre,
                projectId: f.projectId,
                proyectoNombre: f.proyectoNombre,
                detalle: `El legajo ${f.legajo} de ${f.empresaNombre} lo tienen ${comparten.size} personas.`,
            });
        }
    }
    /* Los filtros finos se aplican acá, sobre filas ya resueltas: filtrar por algo que todavía no se
       calculó (el régimen, la empresa) obligaría a repetir la resolución dentro de la consulta. */
    const filtradas = filas.filter((f) => {
        if (filtros.empresaId && f.empresaId !== filtros.empresaId)
            return false;
        if (filtros.regimen && f.regimen !== filtros.regimen)
            return false;
        if (filtros.ccCodigo && f.ccCodigo !== filtros.ccCodigo)
            return false;
        if (filtros.tipoContratoId != null && Number(f.contrato.tipoId) !== Number(filtros.tipoContratoId))
            return false;
        if (filtros.rolFrame && f.rolFrame !== filtros.rolFrame)
            return false;
        return true;
    });
    /*
      LAS EXCEPCIONES SIGUEN AL FILTRO. Si se pide sólo el régimen mensual, el anexo tiene que hablar
      de esas filas y no de las 582 del período entero: un anexo que no se achica con el filtro hace
      que quien mira los mensuales crea que le faltan 57 casos que no son suyos.
    */
    const enElFiltro = new Set(filtradas.map((f) => f.filaId));
    const excepcionesFiltradas = excepciones.filter((e) => enElFiltro.has(e.filaId));
    const idsConExcepcion = new Set(excepcionesFiltradas.map((e) => e.filaId));
    const porRegimen = {};
    filtradas.forEach((f) => {
        const clave = f.regimen || "sin_resolver";
        porRegimen[clave] = (porRegimen[clave] || 0) + 1;
    });
    return {
        periodo,
        desde,
        hasta,
        filas: filtradas,
        excepciones: excepcionesFiltradas,
        resumen: {
            contratos: filtradas.length,
            personas: new Set(filtradas.map((f) => f.userId)).size,
            completos: filtradas.filter((f) => f.legajo && f.empresaId && f.ccCodigo && f.regimen).length,
            conExcepcion: filtradas.filter((f) => idsConExcepcion.has(f.filaId)).length,
            porRegimen,
        },
    };
}

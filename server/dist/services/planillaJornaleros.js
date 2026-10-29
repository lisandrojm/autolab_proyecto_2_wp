import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Types } from "mongoose";
import { User } from "../models/User.js";
import { RoleFrame } from "../models/RoleFrame.js";
import { Categoria } from "../models/Categoria.js";
import { ConvenioGrupo } from "../models/ConvenioGrupo.js";
import { armarPlanilla, rangoDelMes } from "../utils/planillaJornaleros.js";
import { generarXlsxJornaleros } from "./planillaJornalerosXlsx.js";
/*
  LA PLANILLA DE JORNALEROS DEL MES: de la base a las filas (ver `utils/planillaJornaleros.ts`).

  La fuente es la SOLICITUD APROBADA, no el contrato: un documento de `users` («usuario fantasma»)
  vinculado a la persona real por `solicitudUserId`. Filtros:
    · `metadata.solicitudStatus = "aprobada"` y `metadata.startDate` dentro del mes.
    · NO `isSolicitud`: pasa a false al aprobarse, y filtrar por él deja el mes vacío.
    · `metadata.nombre_contrato = "Jornada"`: los mensualizados (plazo fijo) y los de servicios van
      por otro circuito.
  `categoriaSatId` apunta a `categorias` (no a `categorias-sat`); el número de categoría es el del
  grupo del convenio.
*/
const DIR = path.dirname(fileURLToPath(import.meta.url));
/** `server/plantillas/` desde `src/services` (tsx) y desde `dist/services` (producción). */
export const RUTA_PLANTILLA = path.resolve(DIR, "../../plantillas/jornaleros.xlsx");
export const TIPO_CONTRATO_JORNALEROS = "Jornada";
export async function datosPlanillaJornaleros(tenantId, mes) {
    const { desde, hasta } = rangoDelMes(mes);
    const solicitudes = await User.find({
        tenantId,
        "metadata.solicitudStatus": "aprobada",
        "metadata.nombre_contrato": TIPO_CONTRATO_JORNALEROS,
        "metadata.startDate": { $gte: desde, $lte: hasta },
    }, { firstName: 1, lastName: 1, metadata: 1 }).lean();
    const idsPersonas = [...new Set(solicitudes.map((s) => s.metadata?.solicitudUserId).filter(Boolean).map(String))];
    const idsRoles = [...new Set(solicitudes.flatMap((s) => s.metadata?.roles_frame || []).map(String))];
    const idsCategorias = [...new Set(solicitudes.map((s) => s.metadata?.categoriaSatId).filter((id) => id && Types.ObjectId.isValid(id)).map(String))];
    const [personas, roles, categorias] = await Promise.all([
        User.find({ _id: { $in: idsPersonas }, tenantId }, { firstName: 1, lastName: 1, "metadata.apellido": 1, "metadata.nombre": 1, "metadata.numeroLegajoTango": 1 }).lean(),
        RoleFrame.find({ _id: { $in: idsRoles } }, { name: 1 }).lean(),
        Categoria.find({ _id: { $in: idsCategorias } }, { nombre: 1, grupoId: 1 }).lean(),
    ]);
    const grupos = await ConvenioGrupo.find({ _id: { $in: categorias.map((c) => c.grupoId).filter(Boolean) } }, { numero: 1 }).lean();
    const personaPorId = new Map(personas.map((p) => [String(p._id), p]));
    const rolPorId = new Map(roles.map((r) => [String(r._id), r.name]));
    const numeroPorGrupo = new Map(grupos.map((g) => [String(g._id), Number(g.numero)]));
    const categoriaPorId = new Map(categorias.map((c) => [String(c._id), { nombre: c.nombre, numero: c.grupoId ? numeroPorGrupo.get(String(c.grupoId)) ?? null : null }]));
    const filas = solicitudes.map((s) => {
        const m = s.metadata || {};
        // Sin `solicitudUserId` la solicitud es el alta de alguien nuevo: la persona es ella misma.
        const persona = (m.solicitudUserId && personaPorId.get(String(m.solicitudUserId))) || s;
        const cat = categoriaPorId.get(String(m.categoriaSatId || ""));
        const fechas = Array.isArray(m.fechasTrabajadas) && m.fechasTrabajadas.length ? m.fechasTrabajadas : m.startDate ? [m.startDate] : [];
        return {
            id: String(s._id),
            personaId: String(persona._id),
            legajo: String(persona.metadata?.numeroLegajoTango || "").trim(),
            apellido: String(persona.metadata?.apellido || persona.lastName || "").trim(),
            nombre: String(persona.metadata?.nombre || persona.firstName || "").trim(),
            rol: (m.roles_frame || []).map((id) => rolPorId.get(String(id))).filter(Boolean).join(" / "),
            categoriaNumero: cat?.numero ?? null,
            categoriaNombre: cat?.nombre || "",
            dailyRate: Number(m.dailyRate) || 0,
            fechas: [...new Set(fechas)],
        };
    });
    return armarPlanilla(mes, filas);
}
export async function xlsxPlanillaJornaleros(p) {
    return generarXlsxJornaleros(await fs.promises.readFile(RUTA_PLANTILLA), p);
}

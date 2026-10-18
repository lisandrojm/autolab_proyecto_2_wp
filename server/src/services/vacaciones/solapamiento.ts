import { Types } from "mongoose";
import { Vacation } from "../../models/Vacation.js";
import { VacationConfig, type IEmbeddedOverlap } from "../../models/VacationConfig.js";
import { User } from "../../models/User.js";
import { UserProfile } from "../../models/UserProfile.js";
import { Area } from "../../models/Area.js";
import UserProject from "../../models/UserProject.js";
import { RoleFrame } from "../../models/RoleFrame.js";

/**
 * LAS REGLAS DE SOLAPAMIENTO DE VACACIONES (Vacaciones → Reglas → Solapamiento), EN UN SOLO LUGAR.
 *
 * Una regla dice «en este ámbito (área / proyecto / rol empresa; lo que quede en “Cualquiera” se
 * evalúa por cada ámbito de la persona) no puede haber más de N personas de vacaciones a la vez».
 * Esto estaba escrito dos veces en `routes/vacations.ts` —en `GET /availability` (qué fechas se le
 * bloquean a la persona en la app) y en `POST /` (si el pedido viola una regla)— y se separaron con el
 * tiempo. Acá queda UNA lectura de las reglas y UNA forma de armar el ámbito; lo que sigue distinto, a
 * propósito, es cómo cuenta cada uso:
 *   · `fechasBloqueadas` cuenta vacaciones por día (como el GET de siempre).
 *   · `violaSolapamiento` cuenta personas distintas en todo el rango pedido (como el POST de siempre).
 * El plan de vacaciones por proyecto usa la segunda, con `vacacionesVirtuales`: sus bloques todavía no
 * son `Vacation` y tienen que contarse igual para que dos editores del mismo rol no salgan juntos.
 *
 * Qué se mira de la persona (igual que antes): el área es la de su ficha (`UserProfile.department`,
 * por nombre de Área), los proyectos son `User.projectIds`, y el rol empresa es el de sus vínculos
 * (`metadata.projects[].rol_frame_id` contra `RoleFrame.externalId` / `data.rol.id`). El `clientId` de
 * la regla no se evalúa (nunca se evaluó).
 */

export interface PerfilSolapamiento {
  userId: string;
  /** El usuario con `metadata.projects` poblado: de ahí salen los roles y los horarios de sus contratos. */
  user: any;
  userAreaId: string | null;
  projectIds: any[];
}

/** La persona tal como la miran las reglas. `null` si no existe. */
export async function perfilDeSolapamiento(tenantId: any, userId: string): Promise<PerfilSolapamiento | null> {
  const user: any = await User.findById(userId).populate("metadata.projects");
  if (!user) return null;
  let userAreaId: string | null = null;
  const profile = await UserProfile.findOne({ userId, tenantId });
  if (profile?.department) {
    const area = await Area.findOne({ tenantId, name: profile.department });
    if (area) userAreaId = String(area._id);
  }
  return { userId: String(userId), user, userAreaId, projectIds: user.projectIds || [] };
}

/**
 * Las reglas activas que le aplican a la persona, quedándose sólo con las MÁS ESPECÍFICAS («Specific
 * overrides General»): cada criterio fijado en la regla suma un punto, y sólo cuentan las de puntaje
 * máximo. Vacío si no hay configuración o ninguna le aplica.
 */
export async function reglasAplicables(tenantId: any, perfil: PerfilSolapamiento): Promise<IEmbeddedOverlap[]> {
  const vacConfig = await VacationConfig.findOne({ tenantId });
  if (!vacConfig || !vacConfig.overlaps || vacConfig.overlaps.length === 0) return [];
  const aplicables: Array<{ rule: IEmbeddedOverlap; score: number }> = [];
  for (const rule of vacConfig.overlaps) {
    if (!rule.isActive) continue;
    let matches = true;
    let score = 0;
    if (rule.areaId) {
      score++;
      if (!perfil.userAreaId || perfil.userAreaId !== String(rule.areaId)) matches = false;
    }
    if (matches && rule.projectId) {
      score++;
      const userProjects = perfil.projectIds.map((p: any) => String(p));
      if (!userProjects.includes(String(rule.projectId))) matches = false;
    }
    if (matches && rule.roleFrameId) {
      score++;
      try {
        const rf: any = await RoleFrame.findById(rule.roleFrameId);
        if (rf) {
          const userMetaProjects = perfil.user.metadata?.projects || [];
          const hasRole = userMetaProjects.some((p: any) => p.rol_frame_id == rf.externalId || p.rol_frame_id == rf.data?.rol?.id);
          if (!hasRole) matches = false;
        } else matches = false;
      } catch {
        matches = false;
      }
    }
    if (matches) aplicables.push({ rule, score });
  }
  if (aplicables.length === 0) return [];
  const maxScore = Math.max(...aplicables.map((r) => r.score));
  return aplicables.filter((r) => r.score === maxScore).map((r) => r.rule);
}

const minutosDe = (timeStr: string): number => {
  if (!timeStr) return -1;
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
};

/**
 * ¿Comparten franja horaria? Se miran los contratos no vencidos de cada una (en ese proyecto, si se
 * pasa) y se comparan sus `hora_inicio`/`hora_fin`; 00:00 de fin es 24:00 y un turno nocturno cruza
 * la medianoche. Si alguna no tiene horario cargado se asume que sí se pisan: es lo seguro.
 */
export function hayChoqueDeHorario(meta1: any, meta2: any, contextPId?: string): boolean {
  const turnosDe = (meta: any) => {
    const shifts: { start: number; end: number }[] = [];
    if (!meta?.projects) return shifts;
    for (const p of meta.projects) {
      const pIdStr = p.projectId?._id?.toString() || p.projectId?.toString();
      if (contextPId && pIdStr !== String(contextPId)) continue;
      for (const c of p.contracts || []) {
        const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
        const isActive = !endDate || endDate >= new Date();
        if (!isActive || !c.hora_inicio || !c.hora_fin) continue;
        const start = minutosDe(c.hora_inicio);
        let end = minutosDe(c.hora_fin);
        if (start === -1 || end === -1) continue;
        if (end === 0) end = 1440;
        if (end < start) end += 1440;
        shifts.push({ start, end });
      }
    }
    return shifts;
  };
  const s1 = turnosDe(meta1);
  const s2 = turnosDe(meta2);
  if (s1.length === 0 || s2.length === 0) return true;
  for (const a of s1) for (const b of s2) if (Math.max(a.start, b.start) < Math.min(a.end, b.end)) return true;
  return false;
}

/** Los ámbitos (proyecto × área) contra los que se evalúa una regla para esta persona: lo fijado en la regla, o cada uno de los suyos. */
export function ambitosDe(rule: IEmbeddedOverlap, perfil: PerfilSolapamiento): Array<{ pId?: any; aId?: any }> {
  const projectsToCheck = rule.projectId ? [rule.projectId] : perfil.projectIds.length ? perfil.projectIds : [];
  const areasToCheck = rule.areaId ? [rule.areaId] : perfil.userAreaId ? [perfil.userAreaId] : [];
  const finalProjects: any[] = projectsToCheck.length > 0 ? projectsToCheck : [undefined];
  const finalAreas: any[] = areasToCheck.length > 0 ? areasToCheck : [undefined];
  const out: Array<{ pId?: any; aId?: any }> = [];
  for (const pId of finalProjects) for (const aId of finalAreas) out.push({ pId, aId });
  return out;
}

/** Las OTRAS personas activas del ámbito (con el rol de la regla, si lo fija), con `metadata.projects` poblado para el horario. */
export async function personasDelAmbito(tenantId: any, perfil: PerfilSolapamiento, rule: IEmbeddedOverlap, ambito: { pId?: any; aId?: any }): Promise<any[]> {
  const query: any = { tenantId, "metadata.activo": true, _id: { $ne: perfil.userId } };
  if (ambito.pId) query.projectIds = ambito.pId;
  if (ambito.aId) {
    const usersInArea = await UserProject.find({ areaId: ambito.aId }).distinct("userId");
    query._id = { $in: usersInArea, $ne: perfil.userId };
  }
  if (rule.roleFrameId) {
    const rf: any = await RoleFrame.findById(rule.roleFrameId);
    if (rf) {
      const values: any[] = [];
      if (rf.externalId) values.push(rf.externalId);
      if (rf.data?.rol?.id) values.push(rf.data.rol.id);
      if (values.length > 0) query["metadata.projects"] = { $elemMatch: { rol_frame_id: { $in: values } } };
    }
  }
  return User.find(query).select("_id metadata").populate("metadata.projects");
}

/**
 * Qué fechas tiene bloqueadas la persona por las reglas (lo que la app pinta como ocupado): de este
 * mes a 18 meses adelante, un día se bloquea si en algún ámbito la cantidad de vacaciones (no
 * rechazadas ni canceladas, de personas que comparten horario) llega al máximo de la regla.
 * `status` dice si lo que bloquea es sólo pendiente o ya aprobado.
 */
export async function fechasBloqueadas(tenantId: any, userId: string): Promise<Array<{ date: string; status: string }>> {
  const perfil = await perfilDeSolapamiento(tenantId, userId);
  if (!perfil) return [];
  const reglas = await reglasAplicables(tenantId, perfil);
  if (reglas.length === 0) return [];

  const now = new Date();
  const searchStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
  const searchEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 18, 1));
  const blockedDatesMap = new Map<string, string>();

  for (const rule of reglas) {
    for (const ambito of ambitosDe(rule, perfil)) {
      const matchingUsers = await personasDelAmbito(tenantId, perfil, rule, ambito);
      const matchingUserIds = matchingUsers.map((u: any) => u._id);
      const overlappingVacations = await Vacation.find({
        tenantId,
        userId: { $in: matchingUserIds },
        status: { $nin: ["rejected", "cancelled"] },
        endDate: { $gte: searchStart },
        startDate: { $lte: searchEnd },
      }).lean();

      const occupancy: Record<string, { count: number; hasPending: boolean }> = {};
      for (const v of overlappingVacations) {
        const vUser = matchingUsers.find((u: any) => String(u._id) === String(v.userId));
        if (vUser && !hayChoqueDeHorario(perfil.user.metadata, vUser.metadata, ambito.pId ? String(ambito.pId) : undefined)) continue;
        const current = new Date(v.startDate < searchStart ? searchStart : v.startDate);
        const end = new Date(v.endDate > searchEnd ? searchEnd : v.endDate);
        const isPending = v.status === "pending";
        while (current <= end) {
          const dateStr = current.toISOString().split("T")[0];
          if (!occupancy[dateStr]) occupancy[dateStr] = { count: 0, hasPending: false };
          occupancy[dateStr].count++;
          if (isPending) occupancy[dateStr].hasPending = true;
          current.setDate(current.getDate() + 1);
        }
      }
      for (const [date, data] of Object.entries(occupancy)) {
        if (data.count < rule.maxSimultaneousUsers) continue;
        const existing = blockedDatesMap.get(date);
        const currentStatus = data.hasPending ? "pending" : "approved";
        if (!existing) blockedDatesMap.set(date, currentStatus);
        else if (existing === "pending" && currentStatus === "approved") blockedDatesMap.set(date, "approved");
      }
    }
  }
  return Array.from(blockedDatesMap.entries()).map(([date, status]) => ({ date, status }));
}

/** Una vacación que todavía no existe en la base pero tiene que contar (los bloques de un plan). */
export interface VacacionVirtual {
  userId: string;
  startDate: Date;
  endDate: Date;
}

export interface Violacion {
  viola: boolean;
  /** Mensaje listo para mostrar, como lo daba el POST. */
  mensaje?: string;
  regla?: IEmbeddedOverlap;
  personas?: number;
}

/**
 * ¿Un pedido de `start` a `end` viola alguna regla? En cada ámbito se cuentan las personas DISTINTAS
 * que comparten horario y ya tienen vacaciones que se pisan con el rango; si llegan al máximo, viola.
 * `vacacionesVirtuales` se suman a las de la base (y `ignorarVacationIds` se descuentan, p. ej. la
 * propia al editar).
 */
export async function violaSolapamiento(tenantId: any, userId: string, start: Date, end: Date, extra: { vacacionesVirtuales?: VacacionVirtual[]; ignorarVacationIds?: string[] } = {}): Promise<Violacion> {
  const perfil = await perfilDeSolapamiento(tenantId, userId);
  if (!perfil) return { viola: false };
  const reglas = await reglasAplicables(tenantId, perfil);
  if (reglas.length === 0) return { viola: false };
  const ignorar = new Set((extra.ignorarVacationIds || []).map(String));

  for (const rule of reglas) {
    for (const ambito of ambitosDe(rule, perfil)) {
      const matchingUsers = await personasDelAmbito(tenantId, perfil, rule, ambito);
      const matchingUserIds = matchingUsers.map((u: any) => u._id);
      const enBase = await Vacation.find({
        tenantId,
        userId: { $in: matchingUserIds },
        status: { $nin: ["rejected", "cancelled"] },
        $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
      }).select("userId");
      const idsDelAmbito = new Set(matchingUserIds.map(String));
      const candidatas: Array<{ _id?: any; userId: any }> = [
        ...enBase.filter((v: any) => !ignorar.has(String(v._id))),
        ...(extra.vacacionesVirtuales || []).filter((v) => idsDelAmbito.has(String(v.userId)) && v.startDate <= end && v.endDate >= start).map((v) => ({ userId: new Types.ObjectId(String(v.userId)) })),
      ];
      const conflictingUserIds = new Set<string>();
      for (const v of candidatas) {
        const vUser = matchingUsers.find((u: any) => String(u._id) === String(v.userId));
        if (vUser && hayChoqueDeHorario(perfil.user.metadata, vUser.metadata, ambito.pId ? String(ambito.pId) : undefined)) conflictingUserIds.add(String(v.userId));
      }
      if (conflictingUserIds.size >= rule.maxSimultaneousUsers) {
        let scopeDesc = "";
        if (!rule.projectId && ambito.pId) scopeDesc += " (en tu mismo Proyecto)";
        if (!rule.areaId && ambito.aId) scopeDesc += " (en tu misma Área)";
        return {
          viola: true,
          regla: rule,
          personas: conflictingUserIds.size,
          mensaje: `Conflicto de solapamiento. Hay ${conflictingUserIds.size} personas con este perfil (Regla: ${rule.description || "Personalizada"}${scopeDesc}) de vacaciones en este periodo (Límite: ${rule.maxSimultaneousUsers}).`,
        };
      }
    }
  }
  return { viola: false };
}

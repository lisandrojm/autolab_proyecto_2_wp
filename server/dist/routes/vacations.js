import express from "express";
import { Types } from "mongoose";
import { Vacation } from "../models/Vacation.js";
import { VacationConfig } from "../models/VacationConfig.js";
import { Notification } from "../models/Notification.js";
import { Tenant } from "../models/Tenant.js";
import { Pdf } from "../models/Pdf.js";
import { authenticateToken } from "../middleware/auth.js";
import { generateVacationPDF } from "../utils/pdfGenerator.js";
import { User } from "../models/User.js";
import { UserProfile } from "../models/UserProfile.js";
import { Area } from "../models/Area.js";
import { Project } from "../models/Project.js";
import UserProject from "../models/UserProject.js";
const router = express.Router();
// Apply authentication to all routes
router.use(authenticateToken);
async function adjustBalanceOnRequestChange(tenantId, userId, year, days, type) {
    try {
        const { UserVacationBalance } = await import("../models/UserVacationBalance.js");
        const override = await UserVacationBalance.findOne({ tenantId, userId, year });
        if (!override)
            return;
        let totalAnnual = override.totalAnnual ?? 0;
        let taken = override.taken ?? 0;
        let pending = override.pending ?? 0;
        let available = override.available ?? 0;
        if (type === "create") {
            pending += days;
            available = Math.max(0, available - days);
        }
        else if (type === "approve" || type === "sign" || type === "deliver") {
            // Move from pending to taken
            pending = Math.max(0, pending - days);
            taken += days;
        }
        else if (type === "reject" || type === "cancel") {
            if (pending >= days) {
                pending -= days;
            }
            else {
                const rest = days - pending;
                pending = 0;
                taken = Math.max(0, taken - rest);
            }
            available += days;
        }
        override.taken = taken;
        override.pending = pending;
        override.available = available;
        await override.save();
    }
    catch (error) {
        console.error("Error adjusting overridden user vacation balance:", error);
    }
}
// POST /api/vacations/:id/regenerate-pdf - Regenerate a vacation PDF
router.post("/:id/regenerate-pdf", async (req, res) => {
    console.log("[VACATIONS] Regenerate PDF request for ID:", req.params.id);
    try {
        const tenantId = req.tenantId;
        const tenantObjectId = req.tenantObjectId;
        const vacation = await Vacation.findOne({
            _id: req.params.id,
            tenantId: tenantObjectId,
        }).populate("userId");
        if (!vacation) {
            console.warn("[VACATIONS] Vacation not found for ID:", req.params.id, "and tenant:", tenantId);
            res.status(404).json({ error: "Vacation request not found" });
            return;
        }
        const tenant = await Tenant.findById(tenantObjectId);
        if (!tenant) {
            res.status(404).json({ error: "Tenant not found" });
            return;
        }
        let templateId = vacation.rules?.pdfId;
        if (!templateId || templateId.toString().trim() === "") {
            const defaultTemplate = await Pdf.findOne({
                tenantId: tenantObjectId,
                code: { $regex: /^vacaciones$/i },
                isActive: true
            });
            if (defaultTemplate) {
                templateId = defaultTemplate._id.toString();
            }
        }
        if (!templateId || templateId.toString().trim() === "") {
            res.status(400).json({ error: "No se encontró una plantilla PDF configurada para esta solicitud" });
            return;
        }
        const template = await Pdf.findOne({
            _id: templateId,
            tenantId: tenantObjectId,
            isActive: true,
        });
        if (!template) {
            res.status(404).json({ error: "Plantilla PDF no encontrada o inactiva" });
            return;
        }
        const user = typeof vacation.userId === "object" && "firstName" in vacation.userId ? vacation.userId : await User.findById(vacation.userId);
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }
        const pdfResult = await generateVacationPDF(vacation, template, user, tenantId.toString(), tenant.name, vacation.vacationNumber);
        if (!pdfResult.success) {
            res.status(500).json({ error: `Error al generar PDF: ${pdfResult.error}` });
            return;
        }
        // Optional: delete old PDF if exists
        if (vacation.pdfPreAprobacionUrl) {
            try {
                const { deletePdfFromStorage } = await import("../utils/pdfStorage.js");
                await deletePdfFromStorage(vacation.pdfPreAprobacionUrl);
            }
            catch (e) {
                console.warn("Could not delete old PDF:", e);
            }
        }
        vacation.pdfPreAprobacionUrl = pdfResult.pdfUrl;
        await vacation.save();
        res.json(vacation);
    }
    catch (error) {
        console.error("Regenerate vacation PDF error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
// GET /api/vacations/availability - Get dates that are fully booked for user's area
router.get("/availability", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const userId = req.user.userId;
        const user = await User.findById(userId).populate("metadata.projects");
        let userAreaId = null;
        // Resolve areaId via UserProfile department (Standardized way now)
        const profile = await UserProfile.findOne({ userId, tenantId });
        if (profile && profile.department) {
            const area = await Area.findOne({ tenantId, name: profile.department });
            if (area) {
                userAreaId = area._id;
            }
        }
        // Note: userAreaId may be null/undefined if user has no area assigned.
        // This is fine - global rules (where areaId is null) should still apply.
        // -------------------------------------------------------------------------
        // Helper: Check overlap rules
        // -------------------------------------------------------------------------
        const vacConfig = await VacationConfig.findOne({ tenantId });
        if (!vacConfig)
            return res.json([]);
        // Get RoleFrames to resolve IDs if needed
        const RoleFrame = (await import("../models/RoleFrame.js")).RoleFrame;
        const applicableRules = [];
        // Fallback logic for userAreaId is handled above.
        // Ensure we use the userAreaId resolved at lines 29-40.
        for (const rule of vacConfig.overlaps) {
            if (!rule.isActive)
                continue;
            let matches = true;
            let score = 0;
            // 1. Area Check
            if (rule.areaId) {
                score++;
                if (!userAreaId || userAreaId.toString() !== rule.areaId.toString()) {
                    matches = false;
                }
            }
            // 2. Position Check (Legacy field removed, skip or check profile)
            if (matches && rule.positionId) {
                // Since user.positionId is gone, we skip this for now or could match profile.position
                // For strict decoupling we ignore this or return false if rule is specific.
                // Let's assume rules should now use profile fields or project fields.
                matches = false;
            }
            // 3. Level Check (Legacy field removed, skip)
            if (matches && rule.levelId) {
                matches = false;
            }
            // 4. Project Check
            if (matches && rule.projectId) {
                score++;
                const userProjects = user.projectIds?.map((p) => p.toString()) || [];
                if (!userProjects.includes(rule.projectId.toString())) {
                    matches = false;
                }
            }
            // 5. RoleFrame Check
            if (matches && rule.roleFrameId) {
                score++;
                try {
                    const rf = await RoleFrame.findById(rule.roleFrameId);
                    if (rf) {
                        const userMetaProjects = user.metadata?.projects || [];
                        const hasRole = userMetaProjects.some((p) => p.rol_frame_id == rf.externalId || p.rol_frame_id == rf.data?.rol?.id);
                        if (!hasRole)
                            matches = false;
                    }
                    else {
                        matches = false;
                    }
                }
                catch (e) {
                    matches = false;
                }
            }
            if (matches) {
                applicableRules.push({ rule, score });
            }
        }
        console.log(`[Availability Debug] User: ${userId}, userAreaId: ${userAreaId}, overlaps count: ${vacConfig.overlaps?.length}, applicableRules: ${applicableRules.length}`);
        applicableRules.forEach((r, i) => {
            console.log(`[Availability Debug] Rule ${i}: score=${r.score}, maxSimultaneousUsers=${r.rule.maxSimultaneousUsers}, desc=${r.rule.description}`);
        });
        if (applicableRules.length === 0) {
            return res.json([]);
        }
        // FILTER BY MAX SPECIFICITY (Specific overrides General)
        const maxScore = Math.max(...applicableRules.map((r) => r.score));
        const finalRules = applicableRules.filter((r) => r.score === maxScore).map((r) => r.rule);
        // Process availability for ALL applicable rules
        const now = new Date();
        const searchStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
        const searchEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 18, 1));
        // We will aggregate blocked dates.
        // If a date is blocked by ANY rule, it is blocked.
        // However, the response format is list of dates with status.
        const blockedDatesMap = new Map(); // date -> status ('pending' takes precedence?)
        for (const rule of finalRules) {
            // Logic for "Per Scope" Generic Rules:
            // If a rule field is undefined (Any), we must check against the User's specific values for that field.
            // E.g. If Rule Project is Any -> We iterate all User Projects. The limit applies to EACH project bucket.
            // 1. Determine Scope Buckets
            // Projects: If rule has specific project, check only that. If Any, check all user projects.
            const projectsToCheck = rule.projectId ? [rule.projectId] : user.projectIds?.length ? user.projectIds : [];
            // Areas: If rule has specific area, check that. If Any, check user area.
            const areasToCheck = rule.areaId ? [rule.areaId] : userAreaId ? [userAreaId] : [];
            // Positions (Legacy field removed)
            const positionsToCheck = [undefined];
            // Levels (Legacy field removed)
            const levelsToCheck = [undefined];
            // RoleFrames (Complex, let's keep basic logic for now or iterate if possible)
            // For now, if rule has RF, we use it. If Any, we ignore RF constraint (global to all roles) OR matching user metadata?
            // Given specificity, if I have "Any Role", it applies to me.
            // If I want "Limit 1 per Role", I need to iterate user roles.
            // Metadata roles are complex. Let's assume for "Any", we treat it as "regardless of role".
            // Unless we want "Per Role" limit?
            // User said "where Any is left... users within that scope... respect rule".
            // Let's iterate if rule.roleFrameId is defined. If undefined, we don't filter by role (apply to all).
            // Taking "Any" as "All" for complex metadata is safer unless explicit request.
            // But for Project/Area/Position/Level it's clearly "Per Project", "Per Area".
            // We'll stick to P/A/Pos/Lvl iteration.
            // Flatten the check: usage must not exceed limit in ANY of the permutations the user belongs to.
            // e.g. User in P1, P2.
            // Check P1 context -> if full, block.
            // Check P2 context -> if full, block.
            // If user has NO project and rule is Any Project -> Check Global (no project filter)?
            // If user.projectIds is empty, we strictly check "no project" or "all projects"?
            // Usually "no project" means internal staff.
            // Let's add `null` or `undefined` to iteration if list empty?
            // No, if list empty, we check once with "no project criteria"?
            // Let's default to [undefined] if empty to ensure at least one check?
            // But database stores projectIds: [] or null.
            // If we query { projectIds: undefined }, it matches docs where projectIds is missing?
            const finalProjects = projectsToCheck.length > 0 ? projectsToCheck : [undefined];
            const finalAreas = areasToCheck.length > 0 ? areasToCheck : [undefined];
            const finalPositions = positionsToCheck.length > 0 ? positionsToCheck : [undefined];
            const finalLevels = levelsToCheck.length > 0 ? levelsToCheck : [undefined];
            for (const pId of finalProjects) {
                for (const aId of finalAreas) {
                    for (const posId of finalPositions) {
                        for (const lId of finalLevels) {
                            // Construct specific query for this bucket
                            const query = { tenantId, "metadata.activo": true, _id: { $ne: userId } };
                            if (pId)
                                query.projectIds = pId;
                            if (posId)
                                query.positionId = posId;
                            if (lId)
                                query.levelId = lId;
                            if (aId) {
                                const usersInArea = await UserProject.find({ areaId: aId }).distinct("userId");
                                query._id = { $in: usersInArea, $ne: userId };
                            }
                            // Handle RoleFrame if specific rule exists
                            if (rule.roleFrameId) {
                                const rf = await RoleFrame.findById(rule.roleFrameId);
                                if (rf) {
                                    const values = [];
                                    if (rf.externalId)
                                        values.push(rf.externalId);
                                    if (rf.data?.rol?.id)
                                        values.push(rf.data.rol.id);
                                    if (values.length > 0) {
                                        query["metadata.projects"] = {
                                            $elemMatch: { rol_frame_id: { $in: values } },
                                        };
                                    }
                                }
                            }
                            // Query DB for users in this scope
                            const matchingUsers = await User.find(query).select("_id metadata").populate("metadata.projects");
                            const matchingUserIds = matchingUsers.map((u) => u._id);
                            // Find vacations
                            const overlappingVacations = await Vacation.find({
                                tenantId,
                                userId: { $in: matchingUserIds },
                                status: { $nin: ["rejected", "cancelled"] },
                                endDate: { $gte: searchStart },
                                startDate: { $lte: searchEnd },
                            }).lean();
                            console.log(`[Availability Debug] Found ${matchingUserIds.length} matching users, ${overlappingVacations.length} overlapping vacations`);
                            // Aggregate occupancy (Similar to before but inside loop)
                            // We need to merge this into the main blockedDatesMap
                            // If this bucket is full, we block.
                            const occupancy = {};
                            // Helper to check schedule overlaps
                            const getScheduleMinutes = (timeStr) => {
                                if (!timeStr)
                                    return -1;
                                const [h, m] = timeStr.split(":").map(Number);
                                return h * 60 + m;
                            };
                            const hasScheduleOverlap = (user1Meta, user2Meta, contextPId) => {
                                // Helper: extract active shifts
                                const getShifts = (meta) => {
                                    const shifts = [];
                                    if (!meta?.projects)
                                        return shifts;
                                    meta.projects.forEach((p) => {
                                        const pIdStr = p.projectId?._id?.toString() || p.projectId?.toString();
                                        // If contextPId is provided, strict filter. If not (Global rule), maybe allow all?
                                        // User request implies checking contracts. Usually rules are per project.
                                        if (contextPId && pIdStr !== contextPId.toString())
                                            return;
                                        if (p.contracts) {
                                            p.contracts.forEach((c) => {
                                                const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
                                                const isActive = !endDate || endDate >= new Date();
                                                if (isActive && c.hora_inicio && c.hora_fin) {
                                                    const start = getScheduleMinutes(c.hora_inicio);
                                                    let end = getScheduleMinutes(c.hora_fin);
                                                    if (start !== -1 && end !== -1) {
                                                        // Handle 00:00 as 24:00 (1440 minutes) if it's the end time
                                                        if (end === 0)
                                                            end = 1440;
                                                        // Handle overnight shifts (e.g., 22:00 - 06:00)
                                                        if (end < start)
                                                            end += 1440;
                                                        shifts.push({ start, end });
                                                    }
                                                }
                                            });
                                        }
                                    });
                                    return shifts;
                                };
                                const shifts1 = getShifts(user1Meta);
                                const shifts2 = getShifts(user2Meta);
                                // Safe default: if no schedule info found, assume overlap
                                if (shifts1.length === 0 || shifts2.length === 0)
                                    return true;
                                for (const s1 of shifts1) {
                                    for (const s2 of shifts2) {
                                        // Simple interval overlap check: max(start1, start2) < min(end1, end2)
                                        const start = Math.max(s1.start, s2.start);
                                        const end = Math.min(s1.end, s2.end);
                                        if (start < end)
                                            return true;
                                    }
                                }
                                return false;
                            };
                            for (const v of overlappingVacations) {
                                // CHECK SCHEDULE OVERLAP
                                // Find the user object for this vacation
                                const vUser = matchingUsers.find((u) => u._id.toString() === v.userId.toString());
                                // We effectively use pId from the outer loop as the context project ID
                                // Note: pId can be undefined (if rule is Any Project). In that case, we check ALL projects?
                                // Providing undefined to hasScheduleOverlap checks all projects (logic update needed above? No, passing undefined checks all if we write it so).
                                // My previous helper had: if (contextPId && ...)
                                // If pId is undefined, it skips the check, effectively aggregating all contracts.
                                if (vUser && !hasScheduleOverlap(user.metadata, vUser.metadata, pId?.toString())) {
                                    continue; // Skip counting this vacation if schedules don't overlap
                                }
                                let current = new Date(v.startDate < searchStart ? searchStart : v.startDate);
                                const end = new Date(v.endDate > searchEnd ? searchEnd : v.endDate);
                                const isPending = v.status === "pending";
                                while (current <= end) {
                                    const dateStr = current.toISOString().split("T")[0];
                                    if (!occupancy[dateStr])
                                        occupancy[dateStr] = { count: 0, hasPending: false };
                                    occupancy[dateStr].count++;
                                    if (isPending)
                                        occupancy[dateStr].hasPending = true;
                                    current.setDate(current.getDate() + 1);
                                }
                            }
                            // Check violations for this bucket
                            Object.entries(occupancy).forEach(([date, data]) => {
                                if (data.count >= rule.maxSimultaneousUsers) {
                                    const existing = blockedDatesMap.get(date);
                                    const currentStatus = data.hasPending ? "pending" : "approved";
                                    if (!existing) {
                                        blockedDatesMap.set(date, currentStatus);
                                    }
                                    else if (existing === "pending" && currentStatus === "approved") {
                                        blockedDatesMap.set(date, "approved");
                                    }
                                }
                            });
                        }
                    }
                }
            }
        }
        const blockedDates = Array.from(blockedDatesMap.entries()).map(([date, status]) => ({
            date,
            status,
        }));
        // console.log(`[Availability] User: ${userId}. Blocked Dates: ${blockedDates.length}`);
        res.json(blockedDates);
    }
    catch (error) {
        console.error("Error fetching availability:", error);
        res.status(500).json({ error: "Error al obtener disponibilidad de vacaciones" });
    }
});
// GET /api/vacations/users-balance - Get vacation balances (calculated & overrides) for all users for a specific year
router.get("/users-balance", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const yearStr = req.query.year;
        const selectedYear = yearStr ? parseInt(yearStr) : new Date().getFullYear();
        if (isNaN(selectedYear)) {
            return res.status(400).json({ error: "Año inválido" });
        }
        // 1. Get all active, non-system users in the tenant
        const users = await User.find({ tenantId, isSystem: { $ne: true } })
            .select("firstName lastName email hireDate extraVacationDays carryOverVacationDays metadata projectIds")
            .populate({
            path: "metadata.projects",
            populate: {
                path: "projectId",
                select: "name",
            }
        });
        // 2. Fetch all overrides for the selected year
        const { UserVacationBalance } = await import("../models/UserVacationBalance.js");
        const overrides = await UserVacationBalance.find({ tenantId, year: selectedYear }).lean();
        const overridesMap = new Map(overrides.map((o) => [o.userId.toString(), o]));
        // 3. Fetch all active vacations for the selected year to compute used/pending
        const startOfYear = new Date(selectedYear, 0, 1);
        const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
        const allVacations = await Vacation.find({
            tenantId,
            status: { $nin: ["rejected", "cancelled"] },
            startDate: { $gte: startOfYear, $lte: endOfYear }
        }).lean();
        // Map vacations by user
        const userVacationsMap = new Map();
        for (const v of allVacations) {
            const uIdStr = v.userId.toString();
            if (!userVacationsMap.has(uIdStr)) {
                userVacationsMap.set(uIdStr, []);
            }
            userVacationsMap.get(uIdStr).push(v);
        }
        // Get global vacation config for benefit days & carry over settings
        const globalConfig = await VacationConfig.findOne({ tenantId });
        const globalBenefitDays = globalConfig?.diasBeneficio || 0;
        const isArrastreEnabled = globalConfig?.permiteArrastre || false;
        // Helper: calculate seniority text
        const { differenceInYears, differenceInMonths, differenceInDays } = await import("date-fns");
        const calculateSeniorityText = (hireDate, contractsDays = 0) => {
            if (contractsDays > 0) {
                const years = Math.floor(contractsDays / 365);
                const remainingAfterYears = contractsDays % 365;
                const months = Math.floor(remainingAfterYears / 30);
                const days = remainingAfterYears % 30;
                const parts = [];
                if (years > 0)
                    parts.push(`${years} ${years === 1 ? "año" : "años"}`);
                if (months > 0)
                    parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
                if (days > 0)
                    parts.push(`${days} ${days === 1 ? "día" : "días"}`);
                return parts.length > 0 ? parts.join(", ") : "0 días";
            }
            if (!hireDate)
                return "—";
            const now = new Date();
            const years = differenceInYears(now, hireDate);
            const months = differenceInMonths(now, hireDate) % 12;
            const tempDate = new Date(hireDate);
            tempDate.setFullYear(tempDate.getFullYear() + years);
            tempDate.setMonth(tempDate.getMonth() + months);
            const days = differenceInDays(now, tempDate);
            const parts = [];
            if (years > 0)
                parts.push(`${years} ${years === 1 ? "año" : "años"}`);
            if (months > 0)
                parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
            if (days > 0)
                parts.push(`${days} ${days === 1 ? "día" : "días"}`);
            return parts.length > 0 ? parts.join(", ") : "0 días";
        };
        const responseData = [];
        for (const user of users) {
            const uIdStr = user._id.toString();
            // A. Calculate seniority days from contracts (if any)
            let contractsDays = 0;
            if (user.metadata?.projects && Array.isArray(user.metadata.projects)) {
                contractsDays = user.metadata.projects.reduce((acc, p) => {
                    if (!p || !p.contracts || !Array.isArray(p.contracts))
                        return acc;
                    return (acc +
                        p.contracts.reduce((cAcc, c) => {
                            if (!c.fecha_alta_contrato)
                                return cAcc;
                            const start = new Date(c.fecha_alta_contrato);
                            const end = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : new Date();
                            end.setHours(23, 59, 59, 999);
                            const diffTime = end.getTime() - start.getTime();
                            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            return cAcc + Math.max(0, days);
                        }, 0));
                }, 0);
            }
            // B. Seniority Text (relative to today)
            const seniorityText = calculateSeniorityText(user.hireDate, contractsDays);
            // C. LCT days based on seniority at Dec 31 of selectedYear
            let projectedTotalDays = contractsDays;
            if (contractsDays > 0 && user.metadata?.activo !== false) {
                const now = new Date();
                const yearEnd = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
                if (yearEnd > now) {
                    const daysToYearEnd = Math.max(0, Math.ceil((yearEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                    projectedTotalDays += daysToYearEnd;
                }
            }
            let seniorityYears = projectedTotalDays / 365;
            if (contractsDays === 0 && user.hireDate) {
                seniorityYears = differenceInYears(new Date(selectedYear, 11, 31), new Date(user.hireDate));
            }
            let lawDays = 0;
            if (seniorityYears < 0.5) {
                // Less than 6 months: 1 day per 20 worked (approx)
                lawDays = Math.floor(projectedTotalDays / 20) || 0;
            }
            else if (seniorityYears < 5) {
                lawDays = 14;
            }
            else if (seniorityYears < 10) {
                lawDays = 21;
            }
            else if (seniorityYears < 20) {
                lawDays = 28;
            }
            else {
                lawDays = 35;
            }
            // D. Total Dynamic allowed days
            const extraDays = user.extraVacationDays || 0;
            const carryOverDays = user.carryOverVacationDays || 0;
            const calculatedTotalAnnual = lawDays + extraDays + globalBenefitDays + (isArrastreEnabled ? carryOverDays : 0);
            // E. Taken / Pending from vacations list
            let calculatedTaken = 0;
            let calculatedPending = 0;
            const userVacations = userVacationsMap.get(uIdStr) || [];
            for (const v of userVacations) {
                const isSigned = v.signatureStatus === "signed";
                const isDelivered = v.status === "delivered";
                if (isDelivered || isSigned || (v.status === "approved" && !v.requiresSignature)) {
                    calculatedTaken += v.daysRequested;
                }
                else {
                    calculatedPending += v.daysRequested;
                }
            }
            const calculatedAvailable = Math.max(0, calculatedTotalAnnual - calculatedTaken - calculatedPending);
            // F. Fetch overrides
            const override = overridesMap.get(uIdStr);
            const displayTotalAnnual = override?.totalAnnual ?? calculatedTotalAnnual;
            const displayTaken = override?.taken ?? calculatedTaken;
            const displayPending = override?.pending ?? calculatedPending;
            const displayAvailable = override?.available ?? Math.max(0, displayTotalAnnual - displayTaken - displayPending);
            responseData.push({
                userId: uIdStr,
                firstName: user.firstName || "",
                lastName: user.lastName || "",
                email: user.email,
                hireDate: user.hireDate ? user.hireDate.toISOString().split("T")[0] : null,
                seniority: seniorityText,
                calculated: {
                    totalAnnual: calculatedTotalAnnual,
                    taken: calculatedTaken,
                    pending: calculatedPending,
                    available: calculatedAvailable,
                },
                override: override
                    ? {
                        totalAnnual: override.totalAnnual,
                        taken: override.taken,
                        pending: override.pending,
                        available: override.available,
                    }
                    : undefined,
                display: {
                    totalAnnual: displayTotalAnnual,
                    taken: displayTaken,
                    pending: displayPending,
                    available: displayAvailable,
                },
                // Meta field for filters in frontend
                projectIds: user.projectIds?.map((p) => (p._id || p).toString()) || [],
                metadata: user.metadata,
            });
        }
        res.json(responseData);
    }
    catch (error) {
        console.error("Error fetching users vacation balance:", error);
        res.status(500).json({ error: "Error al obtener la gestión de vacaciones de los usuarios" });
    }
});
// POST /api/vacations/users-balance - Save/override user vacation balances
router.post("/users-balance", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { updates } = req.body;
        if (!Array.isArray(updates)) {
            return res.status(400).json({ error: "Formato de actualización inválido" });
        }
        const { UserVacationBalance } = await import("../models/UserVacationBalance.js");
        const promises = updates.map(async (update) => {
            const { userId, year, totalAnnual, taken, pending, available } = update;
            if (!userId || !year) {
                throw new Error("userId y year son requeridos para cada actualización");
            }
            // Upsert the override record
            return UserVacationBalance.findOneAndUpdate({ tenantId, userId, year }, {
                $set: {
                    totalAnnual,
                    taken,
                    pending,
                    available,
                },
            }, { new: true, upsert: true });
        });
        await Promise.all(promises);
        res.json({ message: "Balances de vacaciones guardados correctamente" });
    }
    catch (error) {
        console.error("Error saving user vacation balances:", error);
        res.status(500).json({ error: "Error al guardar los balances de vacaciones", details: error.message });
    }
});
// GET /api/vacations - Get all vacation requests
// GET /api/vacations - Get all vacation requests
router.get("/", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { mine, page = 1, limit = 50 } = req.query;
        let limitNum = Number(limit);
        if (limitNum > 100)
            limitNum = 100; // Cap limit
        const query = { tenantId };
        if (mine === "true") {
            query.userId = req.user.userId;
        }
        const skip = (Number(page) - 1) * limitNum;
        const [vacations, total] = await Promise.all([
            Vacation.find(query)
                .populate({
                path: "userId",
                select: "firstName lastName email metadata projectIds clientIds",
                populate: [
                    { path: "projectIds", select: "name" },
                    { path: "clientIds", select: "name" },
                    {
                        path: "metadata.projects",
                        model: UserProject,
                        select: "projectId nombre_proyecto nombre_rol_frame contracts.fecha_baja_contrato contracts.nombre_sede contracts.nombre_rol_frame",
                        populate: {
                            path: "projectId",
                            select: "name",
                        },
                    },
                ],
            })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Vacation.countDocuments(query),
        ]);
        const mappedVacations = vacations.map((v) => {
            const userObj = v.userId;
            let projectsInfo = [];
            let userProject = "-";
            let userRoleFrame = "-";
            // Snapshot data structure
            const userSnapshot = {
                sedes: new Set(),
                rolFrames: new Set(),
                clients: new Set(),
                projects: [],
                rolesFrameIds: [],
            };
            // Helper to avoid duplicates in projects list
            const addProjectSnapshot = (name, clientName = "") => {
                if (name && !userSnapshot.projects.some((p) => p.name === name)) {
                    userSnapshot.projects.push({ name, clientName });
                }
            };
            if (userObj) {
                // Extract Role Frame IDs from metadata
                if (userObj.metadata?.roles_frame && Array.isArray(userObj.metadata.roles_frame)) {
                    userSnapshot.rolesFrameIds = userObj.metadata.roles_frame.map((id) => id.toString());
                }
                else if (userObj.metadata?.rolesFrameIds && Array.isArray(userObj.metadata.rolesFrameIds)) {
                    userSnapshot.rolesFrameIds = userObj.metadata.rolesFrameIds.map((id) => id.toString());
                }
                // DEBUG: Inspect populated data
                console.log(`[Vacations Debug] Processing user ${userObj._id}`);
                if (userObj.projectIds && userObj.projectIds.length > 0) {
                    console.log("[Vacations Debug] ProjectIds sample:", JSON.stringify(userObj.projectIds[0], null, 2));
                }
                else {
                    console.log("[Vacations Debug] No projectIds found");
                }
                if (userObj.metadata?.projects && userObj.metadata.projects.length > 0) {
                    console.log("[Vacations Debug] Metadata Projects sample:", JSON.stringify(userObj.metadata.projects[0], null, 2));
                }
                // 1. Metadata extraction (Sedes, Rol Frames, Legacy ProjectsInfo, Deep Linked Clients)
                if (userObj.metadata && Array.isArray(userObj.metadata.projects)) {
                    projectsInfo = userObj.metadata.projects.map((p) => ({
                        name: p.nombre_proyecto || "-",
                        role: p.nombre_rol_frame || "-",
                    }));
                    userObj.metadata.projects.forEach((p) => {
                        // Check contracts for Sedes and RolFrames
                        if (Array.isArray(p.contracts)) {
                            p.contracts.forEach((c) => {
                                const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
                                const isActive = !endDate || endDate >= new Date();
                                if (isActive) {
                                    if (c.nombre_sede)
                                        userSnapshot.sedes.add(c.nombre_sede);
                                    const rf = c.nombre_rol_frame || p.nombre_rol_frame;
                                    if (rf)
                                        userSnapshot.rolFrames.add(rf);
                                }
                            });
                        }
                        // Fallback for role frame
                        if (p.nombre_rol_frame)
                            userSnapshot.rolFrames.add(p.nombre_rol_frame);
                        // Extract Client and Project from deep link (UserProject -> Project -> Client)
                        if (p.projectId) {
                            const internalProj = p.projectId;
                            let clientName = "";
                            if (internalProj.clientId && internalProj.clientId.name) {
                                clientName = internalProj.clientId.name;
                                userSnapshot.clients.add(clientName);
                            }
                            if (internalProj.name) {
                                addProjectSnapshot(internalProj.name, clientName);
                            }
                        }
                    });
                }
                // 2. Internal Data extraction (Clients, Projects from user.projectIds)
                if (Array.isArray(userObj.clientIds)) {
                    userObj.clientIds.forEach((c) => {
                        if (c && c.name)
                            userSnapshot.clients.add(c.name);
                    });
                }
                if (Array.isArray(userObj.projectIds)) {
                    userObj.projectIds.forEach((p) => {
                        if (p && p.name) {
                            let clientName = "";
                            if (p.clientId && p.clientId.name) {
                                clientName = p.clientId.name;
                                userSnapshot.clients.add(clientName);
                            }
                            addProjectSnapshot(p.name, clientName);
                        }
                    });
                }
            }
            if (projectsInfo.length > 0) {
                userProject = projectsInfo.map((p) => p.name).join(", ");
                userRoleFrame = projectsInfo.map((p) => p.role).join(", ");
            }
            return {
                ...v,
                userId: userObj && userObj._id ? userObj._id : v.userId, // Restore ID if populated
                userProject,
                userRoleFrame,
                projectsInfo,
                userSnapshot: {
                    sedes: Array.from(userSnapshot.sedes),
                    rolFrames: Array.from(userSnapshot.rolFrames),
                    clients: Array.from(userSnapshot.clients),
                    projects: userSnapshot.projects,
                    rolesFrameIds: userSnapshot.rolesFrameIds,
                },
            };
        });
        res.json(mappedVacations);
    }
    catch (error) {
        console.error("Error fetching vacations:", error);
        res.status(500).json({ error: "Error al obtener las solicitudes de vacaciones" });
    }
});
// GET /api/vacations/:id - Get a single vacation request
router.get("/:id", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { id } = req.params;
        const vacation = await Vacation.findOne({ _id: id, tenantId });
        if (!vacation) {
            return res.status(404).json({ error: "Solicitud no encontrada" });
        }
        res.json(vacation);
    }
    catch (error) {
        console.error("Error fetching vacation:", error);
        res.status(500).json({ error: "Error al obtener la solicitud de vacaciones" });
    }
});
// POST /api/vacations - Create a new vacation request
router.post("/", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const userId = req.user.userId;
        // 0. Fetch User & Profile Data
        const user = await User.findById(userId).populate("metadata.projects");
        if (!user) {
            return res.status(404).json({ error: "Usuario no encontrado" });
        }
        const profile = await UserProfile.findOne({ userId, tenantId });
        // Fetch Position Name
        let positionName = profile?.position || "Sin Cargo";
        // Fetch Level Name
        let levelName = "Sin Nivel";
        const userName = user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : profile ? `${profile.firstName} ${profile.lastName}` : "Usuario";
        // Check Overlap Rules
        const { startDate, endDate, reason } = req.body;
        if (!startDate || !endDate) {
            return res.status(400).json({ error: "Fechas requeridas" });
        }
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return res.status(400).json({ error: "Fechas inválidas" });
        }
        if (start > end) {
            return res.status(400).json({ error: "La fecha de inicio no puede ser posterior a la fecha de fin" });
        }
        // Check for user's own overlapping vacations
        const existingVacation = await Vacation.findOne({
            tenantId,
            userId,
            status: { $nin: ["rejected", "cancelled"] },
            $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
        });
        if (existingVacation) {
            return res.status(400).json({ error: "Ya tienes una solicitud de vacaciones activa en este rango de fechas." });
        }
        // Check Overlap Rules
        const vacConfig = await VacationConfig.findOne({ tenantId });
        if (vacConfig && vacConfig.overlaps && vacConfig.overlaps.length > 0) {
            // Determine area via profile department
            let userAreaId = null;
            if (profile?.department) {
                const area = await Area.findOne({ tenantId, name: profile.department });
                if (area)
                    userAreaId = area._id;
            }
            const RoleFrame = (await import("../models/RoleFrame.js")).RoleFrame;
            const applicableRules = [];
            for (const rule of vacConfig.overlaps) {
                if (!rule.isActive)
                    continue;
                let matches = true;
                let score = 0;
                if (rule.areaId) {
                    score++;
                    if (!userAreaId || userAreaId.toString() !== rule.areaId.toString())
                        matches = false;
                }
                if (matches && rule.positionId) {
                    // Legacy positionId removed from User
                    matches = false;
                }
                if (matches && rule.levelId) {
                    matches = false;
                }
                if (matches && rule.projectId) {
                    score++;
                    const userProjects = user.projectIds?.map((p) => p.toString()) || [];
                    if (!userProjects.includes(rule.projectId.toString()))
                        matches = false;
                }
                if (matches && rule.roleFrameId) {
                    score++;
                    try {
                        const rf = await RoleFrame.findById(rule.roleFrameId);
                        if (rf) {
                            const userMetaProjects = user.metadata?.projects || [];
                            const hasRole = userMetaProjects.some((p) => p.rol_frame_id == rf.externalId || p.rol_frame_id == rf.data?.rol?.id);
                            if (!hasRole)
                                matches = false;
                        }
                        else {
                            matches = false;
                        }
                    }
                    catch (e) {
                        matches = false;
                    }
                }
                if (matches) {
                    applicableRules.push({ rule, score });
                }
            }
            // FILTER BY MAX SPECIFICITY (Specific overrides General)
            const maxScore = Math.max(...applicableRules.map((r) => r.score));
            const finalRules = applicableRules.filter((r) => r.score === maxScore).map((r) => r.rule);
            for (const rule of finalRules) {
                // Logic for "Per Scope" Generic Rules:
                // Use nested loop to iterate only "Any" fields against User's context.
                const projectsToCheck = rule.projectId ? [rule.projectId] : user.projectIds?.length ? user.projectIds : [];
                const areasToCheck = rule.areaId ? [rule.areaId] : userAreaId ? [userAreaId] : [];
                const positionsToCheck = [undefined];
                const levelsToCheck = [undefined];
                const finalProjects = projectsToCheck.length > 0 ? projectsToCheck : [undefined];
                const finalAreas = areasToCheck.length > 0 ? areasToCheck : [undefined];
                const finalPositions = positionsToCheck.length > 0 ? positionsToCheck : [undefined];
                const finalLevels = levelsToCheck.length > 0 ? levelsToCheck : [undefined];
                for (const pId of finalProjects) {
                    for (const aId of finalAreas) {
                        for (const posId of finalPositions) {
                            for (const lId of finalLevels) {
                                const otherUsersQuery = { tenantId, "metadata.activo": true, _id: { $ne: userId } };
                                if (pId)
                                    otherUsersQuery.projectIds = pId;
                                if (aId) {
                                    const usersInArea = await UserProject.find({ areaId: aId }).distinct("userId");
                                    otherUsersQuery._id = { $in: usersInArea, $ne: userId };
                                }
                                if (rule.roleFrameId) {
                                    const rf = await RoleFrame.findById(rule.roleFrameId);
                                    if (rf) {
                                        const values = [];
                                        if (rf.externalId)
                                            values.push(rf.externalId);
                                        if (rf.data?.rol?.id)
                                            values.push(rf.data.rol.id);
                                        if (values.length > 0) {
                                            otherUsersQuery["metadata.projects"] = {
                                                $elemMatch: { rol_frame_id: { $in: values } },
                                            };
                                        }
                                    }
                                }
                                const matchingUsers = await User.find(otherUsersQuery).select("_id metadata").populate("metadata.projects");
                                const matchingUserIds = matchingUsers.map((u) => u._id);
                                // Check overlaps for these users in the requested range
                                const potentialConflictingVacations = await Vacation.find({
                                    tenantId,
                                    userId: { $in: matchingUserIds },
                                    status: { $nin: ["rejected", "cancelled"] },
                                    $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
                                }).select("userId");
                                // Filter by Schedule Overlap
                                // We use a Set to count distinct users who physically overlap in time
                                const conflictingUserIds = new Set();
                                for (const v of potentialConflictingVacations) {
                                    const vUser = matchingUsers.find((u) => u._id.toString() === v.userId.toString());
                                    // Use helper defined earlier in the file (available in scope since defined at top of route handler?)
                                    // Wait, helper was defined inside GET /availability. I need to move it to module scope or redefine it.
                                    // Defining it inside this block or loop is inefficient but safe.
                                    // Better: Duplicate logic here for now as I cannot move it easily without touching unrelated code.
                                    // Duplicate Helper Logic locally
                                    const checkScheduleOverlap = (u1, u2, cPId) => {
                                        const getScheduleMinutes = (timeStr) => {
                                            if (!timeStr)
                                                return -1;
                                            const [h, m] = timeStr.split(":").map(Number);
                                            return h * 60 + m;
                                        };
                                        const getS = (meta) => {
                                            const sh = [];
                                            if (!meta?.projects)
                                                return sh;
                                            meta.projects.forEach((kp) => {
                                                const kId = kp.projectId?._id?.toString() || kp.projectId?.toString();
                                                if (cPId && kId !== cPId.toString())
                                                    return;
                                                if (kp.contracts) {
                                                    kp.contracts.forEach((kc) => {
                                                        const ke = kc.fecha_baja_contrato ? new Date(kc.fecha_baja_contrato) : null;
                                                        if (!ke || ke >= new Date()) {
                                                            if (kc.hora_inicio && kc.hora_fin) {
                                                                const s = getScheduleMinutes(kc.hora_inicio);
                                                                let e = getScheduleMinutes(kc.hora_fin);
                                                                if (s !== -1 && e !== -1) {
                                                                    if (e === 0)
                                                                        e = 1440;
                                                                    if (e < s)
                                                                        e += 1440;
                                                                    sh.push({ s, e });
                                                                }
                                                            }
                                                        }
                                                    });
                                                }
                                            });
                                            return sh;
                                        };
                                        const s1 = getS(u1);
                                        const s2 = getS(u2);
                                        if (s1.length === 0 || s2.length === 0)
                                            return true;
                                        for (const a of s1) {
                                            for (const b of s2) {
                                                const start = Math.max(a.s, b.s);
                                                const end = Math.min(a.e, b.e);
                                                if (start < end)
                                                    return true;
                                            }
                                        }
                                        return false;
                                    };
                                    if (vUser && checkScheduleOverlap(user.metadata, vUser.metadata, pId?.toString())) {
                                        conflictingUserIds.add(v.userId.toString());
                                    }
                                }
                                if (conflictingUserIds.size >= rule.maxSimultaneousUsers) {
                                    // Determine scope name for clearer error
                                    let scopeDesc = "";
                                    if (!rule.projectId && pId) {
                                        // Try to let user know which project blocked them?
                                        // Optimization: fetch project name only if error?
                                        // For now, generic message is fine.
                                        scopeDesc += " (en tu mismo Proyecto)";
                                    }
                                    if (!rule.areaId && aId)
                                        scopeDesc += " (en tu misma Área)";
                                    return res.status(400).json({
                                        error: `Conflicto de solapamiento. Hay ${conflictingUserIds.size} personas con este perfil (Regla: ${rule.description || "Personalizada"}${scopeDesc}) de vacaciones en este periodo (Límite: ${rule.maxSimultaneousUsers}).`,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        const globalConfig = await VacationConfig.findOne({ tenantId });
        if (!globalConfig) {
            return res.status(400).json({ error: "No se encontró configuración global de vacaciones para este tenant" });
        }
        // Determine effective rules based on Project assignment
        // Lógica de Resolución de Conflictos para Usuarios Multiproyecto
        // 1. Fraccionamiento: Prioridad al que permita (TRUE wins). Si ambos permiten, el de MENOR días mínimos.
        // 2. Tipo de Días: Prioridad a Días Hábiles (FALSE wins over TRUE for diasCorridos).
        let effectivePermiteFraccionadas = globalConfig.permiteFraccionadas;
        let effectiveMinDiasFraccion = globalConfig.minDiasFraccion || 7;
        let effectiveDiasCorridos = globalConfig.diasCorridos;
        if (user.projectIds && user.projectIds.length > 0) {
            const projects = await Project.find({
                _id: { $in: user.projectIds },
                tenantId,
            });
            // Map to effective config per project (if useGlobal, uses global values)
            const projectConfigs = projects.map((p) => {
                if (p.vacationConfig && !p.vacationConfig.useGlobalConfig) {
                    return {
                        permiteFraccionadas: p.vacationConfig.permiteFraccionadas,
                        minDiasFraccion: p.vacationConfig.minDiasFraccion,
                        diasCorridos: p.vacationConfig.diasCorridos,
                    };
                }
                return {
                    permiteFraccionadas: globalConfig.permiteFraccionadas,
                    minDiasFraccion: globalConfig.minDiasFraccion,
                    diasCorridos: globalConfig.diasCorridos,
                };
            });
            if (projectConfigs.length > 0) {
                // 1. Fraccionamiento: True if ANY allows it
                effectivePermiteFraccionadas = projectConfigs.some((c) => c.permiteFraccionadas);
                // 2. Min Dias: Minimum of those that allow it (or just min of all if forced to check)
                // Only relevant if allowed.
                if (effectivePermiteFraccionadas) {
                    const allowedConfigs = projectConfigs.filter((c) => c.permiteFraccionadas);
                    // Get min value, default to global or 1 if missing
                    const mins = allowedConfigs.map((c) => c.minDiasFraccion ?? globalConfig.minDiasFraccion ?? 7);
                    effectiveMinDiasFraccion = Math.min(...mins);
                }
                // 3. Dias Corridos (True) vs Dias Hábiles (False). Prioridad Hábiles (False).
                // If ANY is False (Hábiles), result is False.
                // Result is True ONLY if ALL are True.
                // Handle undefined as "use global" or "true" depending on safety?
                // We already mapped useGlobal so undefined in p.vacationConfig (if explicit custom but field missing)
                // should probably default to global. But let's assume mapped correctly.
                // Actually map returns undefined for optional fields if not set.
                // Let's safe guard the map above.
                // Refined map above handles standard cases. For diasCorridos, if missing in custom, it might be undefined.
                // If undefined, let's assume it inherits global for that project context or defaults to true?
                // Let's safeguard the reduction:
                const corridosValues = projectConfigs.map((c) => c.diasCorridos ?? globalConfig.diasCorridos ?? true);
                effectiveDiasCorridos = corridosValues.every((v) => v === true);
            }
        }
        // CONSTANTS CALCULATION
        let daysRequested = 0;
        if (effectiveDiasCorridos) {
            // Días Corridos (Calendar Days)
            const timeDiff = Math.abs(end.getTime() - start.getTime());
            daysRequested = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1; // Inclusive days
        }
        else {
            // Días Hábiles (Working Days: Mon-Fri)
            let count = 0;
            let cur = new Date(start);
            // Clone to avoid modifying start
            const loopEnd = new Date(end);
            while (cur <= loopEnd) {
                const day = cur.getDay();
                if (day !== 0 && day !== 6) {
                    // 0=Sun, 6=Sat
                    count++;
                }
                cur.setDate(cur.getDate() + 1);
            }
            daysRequested = count;
        }
        // BALANCE CALCULATION
        // Base = globalConfig.diasAnuales
        // Used = Gozados (Delivered/Signed)
        // Pending = Active (Pending/PreApproved/Approved)
        const activeVacations = await Vacation.find({
            tenantId,
            userId,
            status: { $nin: ["rejected", "cancelled"] },
        }).lean();
        let daysUsed = 0;
        let daysPending = 0;
        for (const v of activeVacations) {
            const isSigned = v.signatureStatus === "signed";
            const isDelivered = v.status === "delivered";
            const isNotRequired = v.signatureStatus === "not_required";
            const isApproved = v.status === "approved";
            if (isDelivered || isSigned || (isApproved && isNotRequired)) {
                daysUsed += v.daysRequested;
            }
            else {
                daysPending += v.daysRequested;
            }
        }
        // Balance available BEFORE this request
        const requestYear = start.getFullYear();
        const { UserVacationBalance } = await import("../models/UserVacationBalance.js");
        const override = await UserVacationBalance.findOne({ tenantId, userId, year: requestYear }).lean();
        let totalAnnualDays = user.vacationDays?.totalDays || 0;
        let currentAvailable = totalAnnualDays - daysUsed - daysPending;
        if (override && override.available !== undefined) {
            currentAvailable = override.available;
            totalAnnualDays = override.totalAnnual ?? totalAnnualDays;
        }
        // New Balance (Remaining)
        const newBalance = currentAvailable - daysRequested;
        const vacationData = {
            ...req.body,
            tenantId,
            userId,
            userName,
            position: positionName,
            level: levelName,
            daysRequested,
            diasDeVacacionesAnuales: totalAnnualDays,
            balance: newBalance,
            reason: reason || "Solicitud de vacaciones",
            comments: reason, // Map 'reason' from body to 'comments' in db
            requiresSignature: globalConfig.requiereFirma,
            rules: {
                diasAnuales: totalAnnualDays,
                diasBeneficio: globalConfig.diasBeneficio,
                maxDiasGozados: globalConfig.maxDiasGozados,
                permiteArrastre: globalConfig.permiteArrastre,
                maxDiasArrastre: globalConfig.maxDiasArrastre,
                vencimientoArrastreDias: globalConfig.vencimientoArrastreDias,
                maxDiasHabiles: globalConfig.maxDiasHabiles,
                anticipacionMinimaDias: globalConfig.anticipacionMinimaDias,
                permiteFraccionadas: effectivePermiteFraccionadas,
                minDiasFraccion: effectiveMinDiasFraccion,
                diasCorridos: effectiveDiasCorridos,
                requiereFirma: globalConfig.requiereFirma,
                pdfId: globalConfig.pdfId,
            },
        };
        const newVacation = new Vacation(vacationData);
        await newVacation.save();
        // Trigger sync for overridden balance if any
        await adjustBalanceOnRequestChange(tenantId, userId, requestYear, daysRequested, "create");
        res.status(201).json(newVacation);
    }
    catch (error) {
        console.error("Error creating vacation:", error);
        if (error.message === "Tenant not found") {
            return res.status(404).json({ error: "Tenant no encontrado" });
        }
        res.status(500).json({ error: "Error al crear la solicitud de vacaciones", details: error.message });
    }
});
// PATCH /api/vacations/:id - Update a vacation request
router.patch("/:id", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { id } = req.params;
        const updatedVacation = await Vacation.findOneAndUpdate({ _id: id, tenantId }, { $set: req.body }, { new: true, runValidators: true });
        if (!updatedVacation) {
            return res.status(404).json({ error: "Solicitud no encontrada" });
        }
        res.json(updatedVacation);
    }
    catch (error) {
        console.error("Error updating vacation:", error);
        res.status(500).json({ error: "Error al actualizar la solicitud de vacaciones" });
    }
});
// DELETE /api/vacations/:id - Delete a vacation request
router.delete("/:id", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const { id } = req.params;
        const deletedVacation = await Vacation.findOneAndDelete({ _id: id, tenantId });
        if (!deletedVacation) {
            return res.status(404).json({ error: "Solicitud no encontrada" });
        }
        res.json({ message: "Solicitud eliminada correctamente" });
    }
    catch (error) {
        console.error("Error deleting vacation:", error);
        res.status(500).json({ error: "Error al eliminar la solicitud de vacaciones" });
    }
});
// PUT /api/vacations/:id/pre-approve - Pre-approve a vacation request
router.put("/:id/pre-approve", async (req, res) => {
    try {
        const preApproverId = req.user.userId;
        const tenantId = req.tenantId;
        const vacation = await Vacation.findOne({
            _id: req.params.id,
            tenantId,
        }).populate("userId");
        if (!vacation) {
            return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
        }
        if (vacation.status !== "pending") {
            return res.status(400).json({ error: "Solo las solicitudes pendientes pueden ser preaprobadas" });
        }
        vacation.status = "pre_approved";
        vacation.preApprovedBy = new Types.ObjectId(preApproverId);
        vacation.preApprovedAt = new Date();
        await vacation.save();
        // Generate PDF
        console.log("[VACATIONS] Pre-approved saved. Starting PDF generation for vacation:", vacation._id);
        let templateId = vacation.rules?.pdfId;
        // Fallback: Try to find default template if not specified in rules
        if (!templateId || templateId.toString().trim() === "") {
            console.log("[VACATIONS] No pdfId in rules, looking for default 'vacaciones' template");
            const defaultTemplate = await Pdf.findOne({
                tenantId: req.tenantObjectId,
                code: { $regex: /^vacaciones$/i }, // Case insensitive match
                isActive: true
            });
            if (defaultTemplate) {
                templateId = defaultTemplate._id.toString();
                console.log("[VACATIONS] Found default template:", templateId);
            }
            else {
                console.warn("[VACATIONS] Default 'vacaciones' template NOT found for tenant:", tenantId);
            }
        }
        if (templateId && templateId.toString().trim() !== "") {
            try {
                const template = await Pdf.findOne({
                    _id: templateId,
                    tenantId: req.tenantObjectId,
                    isActive: true,
                });
                if (template) {
                    console.log("[VACATIONS] Template found. Resolving user...");
                    // Robust user resolution
                    const user = typeof vacation.userId === "object" && "firstName" in vacation.userId ? vacation.userId : await User.findById(vacation.userId);
                    if (!user) {
                        console.error("[VACATIONS] User NOT found for vacation:", vacation._id);
                    }
                    else {
                        const tenant = await Tenant.findById(req.tenantObjectId);
                        const tenantName = tenant?.name || tenant?.slug || "Organización";
                        console.log("[VACATIONS] Generating PDF with template:", template.name, "for user:", user.email);
                        const result = await generateVacationPDF(vacation, template, user, req.tenantObjectId.toString(), tenantName, vacation.vacationNumber);
                        if (result.success && result.pdfUrl) {
                            console.log("[VACATIONS] PDF generated successfully:", result.pdfUrl);
                            vacation.pdfPreAprobacionUrl = result.pdfUrl;
                            await vacation.save();
                        }
                        else {
                            console.error("[VACATIONS] Error generating PDF for vacation:", result.error);
                        }
                    }
                }
                else {
                    console.error("[VACATIONS] Template NOT found or inactive for ID:", templateId);
                }
            }
            catch (pdfError) {
                console.error("[VACATIONS] Exception during PDF generation:", pdfError);
            }
        }
        else {
            console.warn("[VACATIONS] No template ID resolved for PDF generation");
        }
        res.json(vacation);
    }
    catch (error) {
        console.error("Pre-approve vacation error:", error);
        res.status(500).json({ error: "Error al preAprobar la solicitud de vacaciones" });
    }
});
// PUT /api/vacations/:id/approve - Approve a vacation request
router.put("/:id/approve", async (req, res) => {
    try {
        const approverId = req.user.userId;
        const tenantId = req.tenantId;
        const vacation = await Vacation.findOne({
            _id: req.params.id,
            tenantId,
        });
        if (!vacation) {
            return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
        }
        if (vacation.status !== "pre_approved") {
            return res.status(400).json({ error: "Solo las solicitudes preaprobadas pueden ser aprobadas" });
        }
        vacation.status = "approved";
        vacation.approvedBy = new Types.ObjectId(approverId);
        vacation.approvedAt = new Date();
        // Check if rules requires signature
        const requiresSignature = vacation.rules?.requiereFirma || false;
        vacation.requiresSignature = requiresSignature;
        if (requiresSignature) {
            vacation.signatureStatus = "sent";
            vacation.signatureSentAt = new Date();
        }
        await vacation.save();
        await adjustBalanceOnRequestChange(tenantId, vacation.userId, vacation.startDate.getFullYear(), vacation.daysRequested, "approve");
        if (requiresSignature) {
            await Notification.create({
                tenantId,
                userId: vacation.userId,
                type: "vacation",
                title: "Documento enviado para firma",
                message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido aprobada. Revisá tu casilla de email para firmar el documento.`,
                linkUrl: `/vacations`,
            });
        }
        else {
            await Notification.create({
                tenantId,
                userId: vacation.userId,
                type: "vacation",
                title: "Solicitud de vacaciones aprobada",
                message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido aprobada.`,
                linkUrl: `/vacations`,
            });
        }
        res.json(vacation);
    }
    catch (error) {
        console.error("Approve vacation error:", error);
        res.status(500).json({ error: "Error al aprobar la solicitud de vacaciones" });
    }
});
// PUT /api/vacations/:id/reject - Reject a vacation request
router.put("/:id/reject", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const vacation = await Vacation.findOne({
            _id: req.params.id,
            tenantId,
        });
        if (!vacation) {
            return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
        }
        if (!["pending", "pre_approved", "approved"].includes(vacation.status)) {
            return res.status(400).json({ error: "Solo las solicitudes pendientes, preaprobadas o aprobadas pueden ser rechazadas" });
        }
        vacation.status = "rejected";
        await vacation.save();
        await adjustBalanceOnRequestChange(tenantId, vacation.userId, vacation.startDate.getFullYear(), vacation.daysRequested, "reject");
        await Notification.create({
            tenantId,
            userId: vacation.userId,
            type: "vacation",
            title: "Solicitud de Vacaciones Rechazada",
            message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido rechazada.`,
            linkUrl: `/vacations`,
        });
        res.json(vacation);
    }
    catch (error) {
        console.error("Reject vacation error:", error);
        res.status(500).json({ error: "Error al rechazar la solicitud de vacaciones" });
    }
});
// PUT /api/vacations/:id/cancel - Cancel vacation request
router.put("/:id/cancel", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const vacation = await Vacation.findOne({
            _id: req.params.id,
            tenantId,
        });
        if (!vacation) {
            return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
        }
        if (!["pending", "pre_approved", "approved", "delivered"].includes(vacation.status)) {
            return res.status(400).json({ error: "Esta solicitud no puede ser cancelada" });
        }
        vacation.status = "cancelled";
        vacation.cancelledAt = new Date();
        await vacation.save();
        await adjustBalanceOnRequestChange(tenantId, vacation.userId, vacation.startDate.getFullYear(), vacation.daysRequested, "cancel");
        res.json(vacation);
    }
    catch (error) {
        console.error("Cancel vacation error:", error);
        res.status(500).json({ error: "Error al cancelar la solicitud de vacaciones" });
    }
});
// PUT /api/vacations/:id/deliver - Mark vacation as delivered
router.put("/:id/deliver", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const vacation = await Vacation.findOne({
            _id: req.params.id,
            tenantId,
        });
        if (!vacation) {
            return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
        }
        if (vacation.status !== "approved") {
            return res.status(400).json({ error: "Solo las solicitudes aprobadas pueden ser marcadas como entregadas" });
        }
        vacation.status = "delivered";
        vacation.deliveredAt = new Date();
        await vacation.save();
        await adjustBalanceOnRequestChange(tenantId, vacation.userId, vacation.startDate.getFullYear(), vacation.daysRequested, "deliver");
        await Notification.create({
            tenantId,
            userId: vacation.userId,
            type: "vacation",
            title: "Vacaciones Confirmadas",
            message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido confirmada y entregada.`,
            linkUrl: `/vacations`,
        });
        res.json(vacation);
    }
    catch (error) {
        console.error("Deliver vacation error:", error);
        res.status(500).json({ error: "Error al marcar como entregada la solicitud de vacaciones" });
    }
});
// PUT /api/vacations/:id/send-signature - Send vacation for signature
router.put("/:id/send-signature", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const vacation = await Vacation.findOne({
            _id: req.params.id,
            tenantId,
        });
        if (!vacation) {
            return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
        }
        if (vacation.status !== "approved") {
            return res.status(400).json({ error: "Solo las solicitudes aprobadas pueden ser enviadas para firma" });
        }
        vacation.signatureStatus = "sent";
        vacation.signatureSentAt = new Date();
        await vacation.save();
        await Notification.create({
            tenantId,
            userId: vacation.userId,
            type: "vacation",
            title: "Documento enviado para firma",
            message: `El documento de tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido enviado para firma.`,
            linkUrl: `/vacations`,
        });
        res.json(vacation);
    }
    catch (error) {
        console.error("Send signature vacation error:", error);
        res.status(500).json({ error: "Error al enviar para firma la solicitud de vacaciones" });
    }
});
// PUT /api/vacations/:id/notify-signature - User notifies they have signed
router.put("/:id/notify-signature", async (req, res) => {
    try {
        const tenantId = req.tenantId;
        const vacation = await Vacation.findOne({
            _id: req.params.id,
            tenantId,
        });
        if (!vacation) {
            return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
        }
        if (vacation.signatureStatus !== "sent") {
            // Allow re-notifying? Or fail? Better fail if not in sent state.
            return res.status(400).json({ error: "Solo las solicitudes enviadas para firma pueden ser notificadas" });
        }
        vacation.signatureNotifiedAt = new Date();
        await vacation.save();
        // Notify the approver (Supervisor/Admin)
        const approverId = vacation.approvedBy; // Assuming approvedBy is the admin/manager
        if (approverId) {
            await Notification.create({
                tenantId,
                userId: approverId,
                type: "vacation",
                title: "Firma completada por usuario",
                message: `El usuario ha notificado que completó la firma de la solicitud N°: ${vacation.vacationNumber}. Por favor verificá.`,
                linkUrl: `/vacations?id=${vacation._id}`,
            });
        }
        res.json(vacation);
    }
    catch (error) {
        console.error("Notify signature error:", error);
        res.status(500).json({ error: "Error al notificar la firma" });
    }
});
// PUT /api/vacations/:id/mark-signed - Mark vacation as signed
router.put("/:id/mark-signed", async (req, res) => {
    try {
        const signerId = req.user.userId;
        const tenantId = req.tenantId;
        const vacation = await Vacation.findOne({
            _id: req.params.id,
            tenantId,
        });
        if (!vacation) {
            return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
        }
        if (vacation.signatureStatus !== "sent") {
            return res.status(400).json({ error: "Solo las solicitudes enviadas para firma pueden ser marcadas como firmadas" });
        }
        vacation.signatureStatus = "signed";
        vacation.signedAt = new Date();
        vacation.signedBy = new Types.ObjectId(signerId);
        await vacation.save();
        await adjustBalanceOnRequestChange(tenantId, vacation.userId, vacation.startDate.getFullYear(), vacation.daysRequested, "sign");
        // Notify the approver (Supervisor/Admin)
        if (vacation.approvedBy) {
            await Notification.create({
                tenantId,
                userId: vacation.approvedBy,
                type: "vacation",
                title: "Documento firmado por colaborador",
                message: `El colaborador ha confirmado la firma de la solicitud N°: ${vacation.vacationNumber}. Verifique el documento.`,
                linkUrl: `/vacations/${vacation._id}`,
            });
        }
        res.json(vacation);
    }
    catch (error) {
        console.error("Mark signed vacation error:", error);
        res.status(500).json({ error: "Error al marcar como firmada la solicitud de vacaciones" });
    }
});
export const vacationsRoutes = router;

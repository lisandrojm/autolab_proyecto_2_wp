import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { User } from "../models/User.js";
import { Tenant } from "../models/Tenant.js";
import { Vacation } from "../models/Vacation.js";
import { VacationConfig } from "../models/VacationConfig.js";
import UserProject from "../models/UserProject.js";
import { Project } from "../models/Project.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";

async function run() {
  try {
    process.env.MONGO_DB_NAME = "weprodu_production_integration";
    await connectDB();
    console.log("Connected to DB successfully.");
    console.log("Referencing models to register them:", UserProject.modelName, Project.modelName, Area.modelName, Shift.modelName);

    const tenants = await Tenant.find();
    console.log(`Found ${tenants.length} tenants in database.`);
    let selectedTenant = null;
    for (const t of tenants) {
      const userCount = await User.countDocuments({ tenantId: t._id, isSystem: { $ne: true } });
      console.log(`Tenant ${t.name} (ID: ${t._id}) has ${userCount} users.`);
      if (userCount > 0 && !selectedTenant) {
        selectedTenant = t;
      }
    }
    if (!selectedTenant) {
      console.log("No tenant with active users found");
      return;
    }
    const tenantId = selectedTenant._id;
    const selectedYear = 2026;
    console.log("Testing with tenant ID:", tenantId, "Name:", selectedTenant.name, "Year:", selectedYear);

    // 1. Get all active, non-system users in the tenant
    console.log("Fetching users...");
    const users = await User.find({ tenantId, isSystem: { $ne: true } })
      .select("firstName lastName email hireDate extraVacationDays carryOverVacationDays metadata projectIds")
      .populate({
        path: "metadata.projects",
        populate: {
          path: "projectId",
          select: "name",
        }
      });
    console.log("Users fetched:", users.length);

    // 2. Fetch all overrides for the selected year
    console.log("Fetching overrides...");
    const { UserVacationBalance } = await import("../models/UserVacationBalance.js");
    const overrides = await UserVacationBalance.find({ tenantId, year: selectedYear }).lean();
    const overridesMap = new Map(overrides.map((o) => [o.userId.toString(), o]));
    console.log("Overrides fetched:", overrides.length);

    // 3. Fetch all active vacations for the selected year to compute used/pending
    console.log("Fetching vacations...");
    const startOfYear = new Date(selectedYear, 0, 1);
    const endOfYear = new Date(selectedYear, 11, 31, 23, 59, 59, 999);
    const allVacations = await Vacation.find({
      tenantId,
      status: { $nin: ["rejected", "cancelled"] },
      startDate: { $gte: startOfYear, $lte: endOfYear }
    }).lean();
    console.log("Vacations fetched:", allVacations.length);

    // Map vacations by user
    const userVacationsMap = new Map<string, typeof allVacations>();
    for (const v of allVacations) {
      const uIdStr = v.userId.toString();
      if (!userVacationsMap.has(uIdStr)) {
        userVacationsMap.set(uIdStr, []);
      }
      userVacationsMap.get(uIdStr)!.push(v);
    }

    // Get global vacation config for benefit days & carry over settings
    console.log("Fetching global config...");
    const globalConfig = await VacationConfig.findOne({ tenantId });
    const globalBenefitDays = globalConfig?.diasBeneficio || 0;
    const isArrastreEnabled = globalConfig?.permiteArrastre || false;
    console.log("Global config fetched. Benefit days:", globalBenefitDays, "Arrastre:", isArrastreEnabled);

    // Helper: calculate seniority text
    console.log("Loading date-fns dynamically...");
    const { differenceInYears, differenceInMonths, differenceInDays } = await import("date-fns");
    console.log("date-fns loaded successfully.");
    const calculateSeniorityText = (hireDate?: Date, contractsDays: number = 0): string => {
      if (contractsDays > 0) {
        const years = Math.floor(contractsDays / 365);
        const remainingAfterYears = contractsDays % 365;
        const months = Math.floor(remainingAfterYears / 30);
        const days = remainingAfterYears % 30;

        const parts = [];
        if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`);
        if (months > 0) parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
        if (days > 0) parts.push(`${days} ${days === 1 ? "día" : "días"}`);
        return parts.length > 0 ? parts.join(", ") : "0 días";
      }

      if (!hireDate) return "—";

      const now = new Date();
      const years = differenceInYears(now, hireDate);
      const months = differenceInMonths(now, hireDate) % 12;
      const tempDate = new Date(hireDate);
      tempDate.setFullYear(tempDate.getFullYear() + years);
      tempDate.setMonth(tempDate.getMonth() + months);
      const days = differenceInDays(now, tempDate);

      const parts = [];
      if (years > 0) parts.push(`${years} ${years === 1 ? "año" : "años"}`);
      if (months > 0) parts.push(`${months} ${months === 1 ? "mes" : "meses"}`);
      if (days > 0) parts.push(`${days} ${days === 1 ? "día" : "días"}`);
      return parts.length > 0 ? parts.join(", ") : "0 días";
    };

    const responseData = [];

    console.log("Processing users loop...");
    for (const user of users) {
      console.log("Processing user:", user.email);
      const uIdStr = user._id.toString();

      // A. Calculate seniority days from contracts (if any)
      let contractsDays = 0;
      if (user.metadata?.projects && Array.isArray(user.metadata.projects)) {
        contractsDays = user.metadata.projects.reduce((acc: number, p: any) => {
          if (!p || !p.contracts || !Array.isArray(p.contracts)) return acc;
          return (
            acc +
            p.contracts.reduce((cAcc: number, c: any) => {
              if (!c.fecha_alta_contrato) return cAcc;
              const start = new Date(c.fecha_alta_contrato);
              const end = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : new Date();
              end.setHours(23, 59, 59, 999);
              const diffTime = end.getTime() - start.getTime();
              const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              return cAcc + Math.max(0, days);
            }, 0)
          );
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
        lawDays = Math.floor(projectedTotalDays / 20) || 0;
      } else if (seniorityYears < 5) {
        lawDays = 14;
      } else if (seniorityYears < 10) {
        lawDays = 21;
      } else if (seniorityYears < 20) {
        lawDays = 28;
      } else {
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
        } else {
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
      });
    }

    console.log("Successfully ran entire loop! Result count:", responseData.length);
  } catch (error) {
    console.error("ERROR IN DIAGNOSTIC SCRIPT:", error);
  } finally {
    await disconnectDB();
  }
}

run();

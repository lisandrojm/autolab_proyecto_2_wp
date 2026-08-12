import { ImportConfig } from "../models/ImportConfig.js";
import { ExternalApiService } from "./externalApiService.js";
const externalApi = new ExternalApiService();
let isCronRunning = false;
export const initCronScheduler = () => {
    console.log("[CRON SERVICE] Initializing Import Users Background Scheduler...");
    // Run check every 15 minutes
    const INTERVAL_MS = 15 * 60 * 1000;
    // Perform immediate initial check after startup (after 10 seconds)
    setTimeout(() => {
        checkAndRunImports().catch((err) => {
            console.error("[CRON SERVICE] Initial check error:", err);
        });
    }, 10 * 1000);
    setInterval(async () => {
        try {
            await checkAndRunImports();
        }
        catch (err) {
            console.error("[CRON SERVICE] Scheduler interval check failed:", err);
        }
    }, INTERVAL_MS);
};
const checkAndRunImports = async () => {
    if (isCronRunning) {
        console.log("[CRON SERVICE] A check is already running. Skipping...");
        return;
    }
    isCronRunning = true;
    try {
        const now = new Date();
        // Find configurations that are enabled and due to run (nextRun <= now or nextRun is null)
        const configs = await ImportConfig.find({
            isEnabled: true,
            $or: [
                { nextRun: { $lte: now } },
                { nextRun: { $exists: false } },
                { nextRun: null }
            ]
        });
        if (configs.length === 0) {
            isCronRunning = false;
            return;
        }
        console.log(`[CRON SERVICE] Found ${configs.length} import configs due for synchronization.`);
        for (const config of configs) {
            try {
                console.log(`[CRON SERVICE] Running automated import for tenant ${config.tenantId}...`);
                // Execute the import
                await externalApi.importUsers(config.tenantId.toString(), "system", config.syncProjects === true, config.sinceDays);
                // Update run dates
                config.lastRun = new Date();
                const nextRunTime = new Date();
                nextRunTime.setHours(nextRunTime.getHours() + (config.intervalHours || 24));
                config.nextRun = nextRunTime;
                await config.save();
                console.log(`[CRON SERVICE] Automated import finished for tenant ${config.tenantId}. Next run scheduled for: ${config.nextRun}`);
            }
            catch (tenantError) {
                console.error(`[CRON SERVICE] Automated import failed for tenant ${config.tenantId}:`, tenantError);
                // Even if failed, reschedule nextRun to avoid infinite tight retry loop
                const nextRunTime = new Date();
                nextRunTime.setHours(nextRunTime.getHours() + (config.intervalHours || 24));
                config.nextRun = nextRunTime;
                await config.save().catch((e) => console.error("[CRON SERVICE] Failed to update nextRun after failure:", e));
            }
        }
    }
    finally {
        isCronRunning = false;
    }
};

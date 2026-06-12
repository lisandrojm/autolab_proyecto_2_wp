import { Request, Response } from "express";
import { ExternalApiService } from "../services/externalApiService.js";

const externalApi = new ExternalApiService();

export const checkImportUsers = async (req: Request, res: Response) => {
    try {
        const { sinceDays } = req.body;
        if (sinceDays === undefined || isNaN(Number(sinceDays))) {
            res.status(400).json({ message: "sinceDays parameter is required and must be a number" });
            return;
        }

        const result = await externalApi.checkImportUsers(Number(sinceDays));
        res.json(result);
    } catch (error) {
        console.error("Check import error:", error);
        res.status(500).json({ message: "Failed to check import users" });
    }
};

export const importUsers = async (req: Request, res: Response) => {
    try {
        // @ts-ignore
        const tenantId = req.user?.tenantId?.toString();

        if (!tenantId) {
            res.status(400).json({ message: "User must be part of a tenant to import users" });
            return;
        }

        const { syncProjects, sinceDays } = req.body;
        const limitDays = sinceDays !== undefined && !isNaN(Number(sinceDays)) ? Number(sinceDays) : undefined;
        const stats = await externalApi.importUsers(tenantId, syncProjects === true, limitDays);
        res.json({ message: "Import completed", ...stats });
    } catch (error) {
        console.error("Import error:", error);
        res.status(500).json({ message: "Failed to import users" });
    }
};

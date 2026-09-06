import { env } from "../config/env.js";
import { Tenant } from "../models/Tenant.js";
import { Types } from "mongoose";
export function requireTenant(req, res, next) {
    const headerName = (env.TENANCY_HEADER || "X-Tenant-Id").toLowerCase();
    const tenantIdOrSlug = req.headers[headerName] || req.headers["x-tenant-id"];
    if (!tenantIdOrSlug) {
        res.status(400).json({ error: "Missing tenantId header" });
        return;
    }
    req.tenantId = tenantIdOrSlug;
    (async () => {
        try {
            let tenant;
            if (Types.ObjectId.isValid(tenantIdOrSlug)) {
                tenant = await Tenant.findById(tenantIdOrSlug).select("_id");
            }
            else {
                tenant = await Tenant.findOne({ slug: tenantIdOrSlug }).select("_id");
            }
            if (!tenant) {
                res.status(404).json({ error: "Tenant not found" });
                return;
            }
            req.tenantId = String(tenant._id);
            req.tenantObjectId = tenant._id;
            next();
        }
        catch (error) {
            console.error("Error resolving tenant:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    })();
}
export async function resolveTenant(req, res, next) {
    const tenantIdOrSlug = req.tenantId;
    if (!tenantIdOrSlug) {
        res.status(400).json({ error: "Missing tenantId" });
        return;
    }
    try {
        let tenant;
        if (Types.ObjectId.isValid(tenantIdOrSlug)) {
            tenant = await Tenant.findById(tenantIdOrSlug).select("_id");
        }
        else {
            tenant = await Tenant.findOne({ slug: tenantIdOrSlug }).select("_id");
        }
        if (!tenant) {
            res.status(404).json({ error: "Tenant not found" });
            return;
        }
        req.tenantId = String(tenant._id);
        req.tenantObjectId = tenant._id;
        next();
    }
    catch (error) {
        console.error("Error resolving tenant:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

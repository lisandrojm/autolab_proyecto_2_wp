import axios from "axios";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import mongoose from "mongoose";
import { ImportHistory } from "../models/ImportHistory.js";
import { Project } from "../models/Project.js";
import { Client } from "../models/Client.js";
import { Role } from "../models/Role.js";
import { buildAdditiveSet, findNewContracts, USER_FRAME_WHITELIST, USERPROJECT_FRAME_WHITELIST, } from "../utils/additiveSync.js";
import { resolveRoleFrameRefs } from "../utils/roleFrameSync.js";
import { valoracionParaMargen } from "./valoracionDelTenant.js";
export class ExternalApiService {
    api;
    token = null;
    constructor() {
        this.api = axios.create({
            baseURL: process.env.FRAME_API_URL || "https://frame.weprodu.com/api",
            headers: {
                "Content-Type": "application/json",
            },
        });
        this.api.interceptors.request.use((config) => {
            if (this.token) {
                config.headers.Authorization = `Bearer ${this.token}`;
            }
            return config;
        });
    }
    async login() {
        try {
            console.log(`[EXTERNAL API] Authenticating as ${process.env.FRAME_API_USER}...`);
            const response = await this.api.post("/sesion", {}, {
                auth: {
                    username: process.env.FRAME_API_USER || "",
                    password: process.env.FRAME_API_PASSWORD || "",
                },
            });
            if (response.data && response.data.token) {
                this.token = response.data.token;
                console.log("[EXTERNAL API] Authenticated successfully.");
            }
            else {
                throw new Error("No token received from external API");
            }
        }
        catch (error) {
            console.error("[EXTERNAL API] Login failed:", error);
            throw error;
        }
    }
    async getEmployees() {
        if (!this.token) {
            await this.login();
        }
        try {
            const { data } = await this.api.get("/empleado");
            return data;
        }
        catch (error) {
            console.error("[EXTERNAL API] Failed to fetch employees:", error);
            throw error;
        }
    }
    async getEmployeeProjects(employeeId) {
        if (!this.token) {
            await this.login();
        }
        try {
            const { data } = await this.api.get(`/proyecto-empleado/empleado/v2/${employeeId}`);
            return data;
        }
        catch (error) {
            console.error(`[EXTERNAL API] Failed to fetch employee projects for ${employeeId}:`, error);
            throw error;
        }
    }
    /** Lista global de proyectos de FRAME (GET /proyecto). Trae cliente/responsable/fechas. */
    async getAllProjects() {
        if (!this.token) {
            await this.login();
        }
        try {
            const { data } = await this.api.get("/proyecto");
            return Array.isArray(data) ? data : [];
        }
        catch (error) {
            console.error("[EXTERNAL API] Failed to fetch projects:", error);
            return [];
        }
    }
    /**
     * Crea en WeProdu los Project de FRAME que todavía no existen (match por externalId).
     * ADITIVO y seguro: no toca proyectos existentes. Solo crea si el cliente de FRAME mapea a
     * un Client de WeProdu (por Client.externalId) y hay responsable. Colisiones de nombre+cliente
     * (índice único) se saltean vía error 11000. Mismo shape que la creación manual (routes/projects.ts).
     * Devuelve cuántos creó y registra los nombres en `addedProjectsMap` para el reporte.
     */
    async createMissingProjects(tenantObjectId, executedBy, addedProjectsMap) {
        const frameProjects = await this.getAllProjects();
        if (!frameProjects.length)
            return 0;
        const clients = await Client.find({ tenantId: tenantObjectId }).select("_id externalId").lean();
        const clientByExt = new Map(clients.filter((c) => c.externalId != null && c.externalId !== "").map((c) => [String(c.externalId), c._id]));
        const existing = await Project.find({ tenantId: tenantObjectId, externalId: { $ne: null } }).select("externalId").lean();
        const existingExt = new Set(existing.map((p) => Number(p.externalId)));
        // createdBy es un String requerido; el sync automático puede correr como "system".
        const createdBy = executedBy === "system" ? "system" : String(executedBy);
        // Los proyectos que llegan de FRAME no traen margen: nacen con la valoración POR DEFECTO, igual
        // que un alta a mano. Una sola consulta para toda la corrida, no una por proyecto.
        const valoracionDeAlta = await valoracionParaMargen(tenantObjectId, null);
        let created = 0;
        for (const fp of frameProjects) {
            const extId = Number(fp.id);
            if (!extId || existingExt.has(extId))
                continue;
            if (fp.responsableId == null) {
                console.warn(`[EXTERNAL API] Skip create project ${extId} "${fp.nombre}": FRAME sin responsableId.`);
                continue;
            }
            const clientId = fp.clienteId != null ? clientByExt.get(String(fp.clienteId)) : undefined;
            if (!clientId) {
                console.warn(`[EXTERNAL API] Skip create project ${extId} "${fp.nombre}": cliente FRAME ${fp.clienteId} no existe en WeProdu.`);
                continue;
            }
            try {
                const proj = new Project({
                    tenantId: tenantObjectId,
                    clientId,
                    name: fp.nombre,
                    description: fp.descripcion || "",
                    status: fp.activo === false ? "archived" : "active",
                    startDate: fp.fechaInicio ? new Date(fp.fechaInicio) : undefined,
                    endDate: fp.fechaFin ? new Date(fp.fechaFin) : undefined,
                    objectives: [],
                    createdBy,
                    externalId: extId,
                    assignedUsers: [],
                    valoracionId: valoracionDeAlta,
                    valoracionManual: false,
                    metadata: {
                        id: extId,
                        nombre: fp.nombre,
                        descripcion: fp.descripcion || "",
                        responsableId: Number(fp.responsableId),
                        clienteId: fp.clienteId != null ? Number(fp.clienteId) : undefined,
                        fechaInicio: fp.fechaInicio || "",
                        fechaFin: fp.fechaFin || "",
                        fechaAlta: fp.fechaAlta || new Date().toISOString(),
                        activo: fp.activo !== false,
                        sedeId: fp.sedeId != null ? Number(fp.sedeId) : undefined,
                        centroCostoId: fp.centroCostoId != null ? Number(fp.centroCostoId) : undefined,
                    },
                });
                await proj.save();
                await Client.findByIdAndUpdate(clientId, { $addToSet: { proyectos: proj._id } });
                addedProjectsMap.set(extId, fp.nombre);
                existingExt.add(extId);
                created++;
                console.log(`[EXTERNAL API] Proyecto creado desde FRAME: ${extId} "${fp.nombre}"`);
            }
            catch (e) {
                if (e?.code === 11000) {
                    console.warn(`[EXTERNAL API] Proyecto "${fp.nombre}" ya existe (nombre+cliente duplicado); no se crea.`);
                }
                else {
                    console.error(`[EXTERNAL API] Error creando proyecto ${extId} "${fp.nombre}":`, e?.message || e);
                }
            }
        }
        return created;
    }
    /**
     * roles_frame asignados directamente al empleado (relación empleado_rol_frame).
     * Es el mismo dato que muestra la web de FRAME en la ficha de la persona,
     * independiente de los contratos/proyectos.
     */
    async getEmployeeRolesFrame(employeeId) {
        if (!this.token) {
            await this.login();
        }
        try {
            const { data } = await this.api.get(`/rol-frame/empleado/${employeeId}`);
            return Array.isArray(data)
                ? data.map((r) => ({ id: Number(r.id), nombre: String(r.nombre ?? "").trim() }))
                : [];
        }
        catch (error) {
            console.error(`[EXTERNAL API] Failed to fetch roles_frame for employee ${employeeId}:`, error);
            return [];
        }
    }
    async checkImportUsers(sinceDays) {
        console.log(`[EXTERNAL API] Checking user import (sinceDays=${sinceDays})...`);
        const employees = await this.getEmployees();
        let thresholdDate = null;
        if (sinceDays) {
            thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - sinceDays);
            thresholdDate.setHours(0, 0, 0, 0);
        }
        const filteredEmployees = [];
        for (const emp of employees) {
            if (!emp.email)
                continue;
            if (thresholdDate && emp.fechaAlta) {
                const empDate = new Date(emp.fechaAlta);
                if (isNaN(empDate.getTime()) || empDate < thresholdDate) {
                    continue;
                }
            }
            filteredEmployees.push({
                name: `${emp.nombre || ''} ${emp.apellido || ''}`.trim() || `ID: ${emp.id}`,
                email: emp.email,
                fechaAlta: emp.fechaAlta
            });
        }
        return {
            count: filteredEmployees.length,
            employees: filteredEmployees
        };
    }
    /**
     * Synchronise users (and optionally their projects/contracts) from FRAME
     * into WeProdu.
     *
     * ── ADDITIVE / NON-DESTRUCTIVE MODE ──────────────────────────────────
     * • New records   → INSERT as before.
     * • Existing recs → only fill fields that are currently empty in WeProdu
     *                    (null / undefined / "" / [] / {}).  Fields that already
     *                    have a value are NEVER overwritten.
     * • Contracts     → APPEND-ONLY.  Existing contracts are immutable from
     *                    FRAME's perspective.
     *
     * Matching keys (unchanged):
     *   users         → metadata.id  (FRAME employee id)
     *   projects      → externalId
     *   userProjects  → { externalProjectId, externalEmployeeId }
     *
     * Decision: if FRAME CHANGES a field that WeProdu already has, the change
     * is NOT applied.  A future "snapshot diff" mechanism can be enabled to
     * propagate real FRAME changes selectively — see additiveSync.ts header.
     * ─────────────────────────────────────────────────────────────────────
     */
    async importUsers(tenantId, executedBy, syncProjects = false, sinceDays) {
        console.log(`[EXTERNAL API] Starting ADDITIVE user import (syncProjects=${syncProjects}, sinceDays=${sinceDays})...`);
        const addedUsers = [];
        const addedProjectsMap = new Map(); // Use map to keep projects unique
        let created = 0;
        let updated = 0; // Now counts records where ≥1 empty field was filled or ≥1 contract pushed
        let skipped = 0;
        let errors = 0;
        let thresholdDate = null;
        // Se guarda ANTES de recorrer los empleados (puede tardar varios minutos con ~1900+
        // empleados, cada uno con llamadas secuenciales a FRAME) para que el frontend pueda hacer
        // polling de `GET /import/history/latest` y saber que sigue en curso en vez de asumir que
        // se colgó. Al terminar se actualiza este mismo documento a "success"/"failed".
        const runningRecord = await ImportHistory.create({
            tenantId: new mongoose.Types.ObjectId(tenantId),
            status: "running",
            executedBy: executedBy === "system" ? "system" : new mongoose.Types.ObjectId(executedBy),
            stats: { createdUsers: 0, updatedUsers: 0, skippedUsers: 0, errorsUsers: 0 },
        });
        try {
            const employees = await this.getEmployees();
            const tenantObjectId = new mongoose.Types.ObjectId(tenantId);
            /*
              Rol de toda alta importada: el que el tenant tenga marcado POR DEFECTO.

              Antes se buscaba el rol llamado "Mobile-Colaborador", con un regex tolerante al guion y a
              los espacios porque el nombre había mutado con los años. Ese rol dejó de ser especial: lo
              que abre la app hoy son permisos, y cuál de ellos recibe una persona recién importada lo
              decide el rol por defecto, que se elige desde Usuarios → Roles.

              Si el tenant no tiene rol por defecto, las altas quedan sin permisos y no pueden entrar a
              ningún lado: por eso el aviso es ruidoso.
            */
            const rolPorDefecto = await Role.findOne({ tenantId: tenantObjectId, isDefault: true });
            const defaultRoleIds = rolPorDefecto ? [rolPorDefecto._id] : [];
            if (!rolPorDefecto) {
                console.warn("[EXTERNAL API] Este tenant no tiene rol por defecto. Los usuarios nuevos se van a crear SIN rol y no van a poder entrar a la app.");
            }
            if (sinceDays) {
                thresholdDate = new Date();
                thresholdDate.setDate(thresholdDate.getDate() - sinceDays);
                thresholdDate.setHours(0, 0, 0, 0);
            }
            // Crear los proyectos nuevos de FRAME ANTES de vincular empleados, así el linking
            // por empleado (más abajo) los encuentra. Aditivo: no toca proyectos existentes.
            if (syncProjects) {
                const createdProjects = await this.createMissingProjects(tenantObjectId, executedBy, addedProjectsMap);
                console.log(`[EXTERNAL API] Proyectos nuevos creados desde FRAME: ${createdProjects}`);
            }
            for (const emp of employees) {
                try {
                    // ── Guard: skip employees without FRAME id (native/system users) ──
                    if (!emp.id) {
                        console.warn(`[EXTERNAL API] Skipping employee without metadata.id (email: ${emp.email || "N/A"}).`);
                        skipped++;
                        continue;
                    }
                    if (!emp.email) {
                        console.warn(`[EXTERNAL API] Skipping employee ${emp.id} without email.`);
                        skipped++;
                        continue;
                    }
                    if (thresholdDate && emp.fechaAlta) {
                        const empDate = new Date(emp.fechaAlta);
                        if (isNaN(empDate.getTime()) || empDate < thresholdDate) {
                            continue;
                        }
                    }
                    // Map external fields to metadata
                    const metadata = {
                        id: emp.id,
                        nombre: emp.nombre,
                        apellido: emp.apellido,
                        generoId: emp.generoId,
                        tipoDocumentoId: emp.tipoDocumentoId,
                        documento: emp.documento,
                        cuit: emp.cuit,
                        estadoCivil: emp.estadoCivil,
                        calle: emp.calle,
                        altura: emp.altura,
                        pisoDepto: emp.pisoDepto,
                        codigoPostal: emp.codigoPostal,
                        localidad: emp.localidad,
                        paisId: emp.paisId,
                        nacionalidadId: emp.nacionalidadId,
                        nivelEstudioId: emp.nivelEstudioId,
                        // `emp.osId` NO se mapea a propósito, aunque FRAME lo siga mandando.
                        //
                        // La obra social es un dato de la RELACIÓN LABORAL, no de la persona: vive en
                        // el contrato (`UserProject.contracts[].obraSocialId`) y se constata contra el
                        // padrón de la SSS. FRAME no puede saber cuál corresponde — no sabe con qué
                        // empleadora se va a contratar, y ARCA declara el RNOS por alta, no por CUIL.
                        //
                        // Y no es solo redundante: la sincronización es ADITIVA (escribe cuando el
                        // valor está vacío), así que mapearlo revive `metadata.osId` en el import
                        // siguiente a la migración que lo vació. Ver `utils/additiveSync.ts`.
                        osPrepaga: emp.osPrepaga,
                        fechaNac: emp.fechaNac,
                        fechaAlta: emp.fechaAlta,
                        telefono: emp.telefono,
                        activo: emp.activo,
                        bancoId: emp.bancoId,
                        cbu: emp.cbu,
                        tipoDeCuentaBancaria: emp.tipoDeCuentaBancaria,
                        nroDeCuentaBancaria: emp.nroDeCuentaBancaria,
                        aliasBancario: emp.aliasBancario,
                        email: emp.email,
                        estadoId: emp.estadoId,
                        inHouse: emp.inHouse,
                        numeroLegajoTango: emp.numeroLegajoTango,
                        afiliadoAlSindicato: emp.afiliadoAlSindicato,
                        rutaImagen: emp.rutaImagen,
                        bancoReceptor: emp.bancoReceptor,
                        swift: emp.swift,
                        informacionBancariaAdicional: emp.informacionBancariaAdicional,
                    };
                    // Password = DNI (documento). Schema requires minlength 6; fall back
                    // to a safe default when the employee has no usable documento.
                    const dni = (emp.documento ?? "").toString().trim();
                    const password = dni.length >= 6 ? dni : "ChangeMe123!";
                    const userPayload = {
                        email: emp.email,
                        firstName: emp.nombre,
                        lastName: emp.apellido,
                        name: `${emp.nombre} ${emp.apellido}`.trim(),
                        isActive: emp.activo ?? true,
                        hireDate: emp.fechaAlta ? new Date(emp.fechaAlta) : new Date(),
                        tenantId: tenantObjectId,
                        metadata: metadata,
                        password,
                        roles: defaultRoleIds,
                    };
                    // ── Match by metadata.id (FRAME employee id) ──────────────────
                    const existingUser = await User.findOne({
                        "metadata.id": emp.id,
                        tenantId: tenantObjectId,
                    });
                    let userDoc; // Will hold the User document (new or existing)
                    let userWasCreated = false;
                    if (existingUser) {
                        // ── ADDITIVE UPDATE: fill only empty whitelisted fields ────
                        const additiveSet = buildAdditiveSet(userPayload, existingUser.toObject(), USER_FRAME_WHITELIST);
                        if (Object.keys(additiveSet).length > 0) {
                            await User.updateOne({ _id: existingUser._id }, { $set: additiveSet });
                            updated++;
                            console.log(`[EXTERNAL API] Additively updated user ${emp.email} (${Object.keys(additiveSet).length} fields filled).`);
                        }
                        else {
                            skipped++;
                        }
                        userDoc = existingUser;
                    }
                    else {
                        // ── INSERT brand-new user ─────────────────────────────────
                        userDoc = await User.create(userPayload);
                        created++;
                        userWasCreated = true;
                        addedUsers.push({ name: userPayload.name, email: userPayload.email, dni: password });
                    }
                    // ── Sync projects for BOTH new and existing users ─────────────
                    if (syncProjects) {
                        try {
                            const projectsValues = await this.getEmployeeProjects(emp.id);
                            if (projectsValues && projectsValues.length > 0) {
                                const userProjectIds = [];
                                const internalProjectIds = [];
                                let userProjectsChanged = false;
                                const groupedProjects = {};
                                projectsValues.forEach((p) => {
                                    if (!groupedProjects[p.proyecto_id]) {
                                        groupedProjects[p.proyecto_id] = [];
                                    }
                                    groupedProjects[p.proyecto_id].push(p);
                                });
                                for (const extProjIdStr in groupedProjects) {
                                    const extProjId = Number(extProjIdStr);
                                    const frameContracts = groupedProjects[extProjId];
                                    // Find internal Project ID
                                    const internalProject = await Project.findOne({
                                        externalId: extProjId,
                                        tenantId: tenantObjectId,
                                    });
                                    if (!internalProject) {
                                        console.warn(`[EXTERNAL API] Skipping user-project relationship for employee ${emp.email} and project ${extProjId} because the project does not exist in Weprodu.`);
                                        continue;
                                    }
                                    // Ensure user is in Project.assignedUsers
                                    if (userDoc._id) {
                                        await Project.updateOne({ _id: internalProject._id }, { $addToSet: { assignedUsers: userDoc._id } });
                                        internalProjectIds.push(internalProject._id);
                                    }
                                    const projectName = frameContracts.length > 0 ? frameContracts[0].nombre_proyecto : "";
                                    const query = {
                                        externalProjectId: extProjId,
                                        externalEmployeeId: emp.id,
                                    };
                                    let savedProj = await UserProject.findOne(query);
                                    if (!savedProj) {
                                        // ── New UserProject: insert with all contracts ──
                                        savedProj = await UserProject.create({
                                            externalProjectId: extProjId,
                                            externalEmployeeId: emp.id,
                                            nombre_proyecto: projectName,
                                            projectId: internalProject._id,
                                            userId: userDoc._id,
                                            contracts: frameContracts,
                                            nombre_rol_frame: frameContracts.length > 0 ? frameContracts[0].nombre_rol_frame : "",
                                        });
                                        addedProjectsMap.set(extProjId, projectName);
                                        userProjectsChanged = true;
                                    }
                                    else {
                                        // ── Existing UserProject: additive merge ──────
                                        let upChanged = false;
                                        // 1) Fill empty flat fields
                                        const flatFrameData = {
                                            nombre_proyecto: projectName,
                                            nombre_rol_frame: frameContracts.length > 0 ? frameContracts[0].nombre_rol_frame : "",
                                        };
                                        const flatSet = buildAdditiveSet(flatFrameData, savedProj.toObject(), USERPROJECT_FRAME_WHITELIST);
                                        // 2) Append-only contracts
                                        const { newContracts, collisionWarnings } = findNewContracts(frameContracts, savedProj.contracts || []);
                                        for (const warn of collisionWarnings) {
                                            console.warn(warn);
                                        }
                                        // Build the update operation
                                        const updateOps = {};
                                        if (Object.keys(flatSet).length > 0) {
                                            updateOps.$set = flatSet;
                                            upChanged = true;
                                        }
                                        if (newContracts.length > 0) {
                                            updateOps.$push = { contracts: { $each: newContracts } };
                                            upChanged = true;
                                            console.log(`[EXTERNAL API] Appending ${newContracts.length} new contract(s) to UserProject ${savedProj._id} (emp ${emp.email}, proj ${extProjId}).`);
                                        }
                                        if (upChanged) {
                                            await UserProject.updateOne({ _id: savedProj._id }, updateOps);
                                            userProjectsChanged = true;
                                            // If the user wasn't already counted as updated, count now
                                            if (!userWasCreated && !existingUser) {
                                                // This case shouldn't happen, but safety net
                                            }
                                        }
                                    }
                                    if (savedProj) {
                                        userProjectIds.push(savedProj._id);
                                    }
                                }
                                // Update user's metadata.projects and projectIds references
                                // Only if there are new associations to add (additive!)
                                if (userProjectsChanged || userWasCreated) {
                                    // Use $addToSet to avoid duplicates in the user's arrays
                                    const userUpdate = {};
                                    if (userProjectIds.length > 0) {
                                        userUpdate.$addToSet = {
                                            "metadata.projects": { $each: userProjectIds },
                                            projectIds: { $each: internalProjectIds },
                                        };
                                    }
                                    if (Object.keys(userUpdate).length > 0) {
                                        await User.updateOne({ _id: userDoc._id }, userUpdate);
                                    }
                                }
                            }
                        }
                        catch (projErr) {
                            console.error(`[EXTERNAL API] Failed to sync projects for ${emp.email}:`, projErr);
                        }
                    }
                    // ── Sync roles_frame propios del empleado (relación empleado_rol_frame) ──
                    // Independiente de los proyectos: son los roles asignados directamente al empleado
                    // (GET /rol-frame/empleado/{id}). Merge aditivo (no borra refs existentes).
                    try {
                        const frameRoles = await this.getEmployeeRolesFrame(Number(emp.id));
                        if (frameRoles.length > 0) {
                            const { refs, created } = await resolveRoleFrameRefs(frameRoles);
                            if (created.length > 0) {
                                console.log(`[EXTERNAL API] Creados ${created.length} RoleFrame para emp ${emp.email}: ${created.map((c) => c.nombre).join(", ")}`);
                            }
                            if (refs.length > 0) {
                                await User.updateOne({ _id: userDoc._id }, { $addToSet: { "metadata.roles_frame": { $each: refs } } });
                            }
                        }
                    }
                    catch (rfErr) {
                        console.error(`[EXTERNAL API] Failed to sync roles_frame for ${emp.email}:`, rfErr);
                    }
                }
                catch (error) {
                    console.error(`[EXTERNAL API] Error importing user ${emp?.email || "unknown"}:`, error);
                    errors++;
                }
            }
            // Update the "running" record → success
            await ImportHistory.findByIdAndUpdate(runningRecord._id, {
                status: "success",
                stats: {
                    createdUsers: created,
                    updatedUsers: updated,
                    skippedUsers: skipped,
                    errorsUsers: errors
                },
                addedUsers,
                addedProjects: Array.from(addedProjectsMap.entries()).map(([externalId, name]) => ({
                    name,
                    externalId
                }))
            });
        }
        catch (globalError) {
            console.error("[EXTERNAL API] Global import failure:", globalError);
            // Update the "running" record → failed
            await ImportHistory.findByIdAndUpdate(runningRecord._id, {
                status: "failed",
                errorDetails: globalError?.message ? String(globalError.message) : undefined,
                stats: {
                    createdUsers: created,
                    updatedUsers: updated,
                    skippedUsers: skipped,
                    errorsUsers: errors + 1
                },
                addedUsers,
                addedProjects: Array.from(addedProjectsMap.entries()).map(([externalId, name]) => ({
                    name,
                    externalId
                }))
            });
            throw globalError;
        }
        console.log(`[EXTERNAL API] Import finished. Created: ${created}, Updated (additive): ${updated}, Skipped (no changes): ${skipped}, Errors: ${errors}`);
        return { created, updated, skipped, errors };
    }
}

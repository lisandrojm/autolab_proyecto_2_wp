import axios, { AxiosInstance } from "axios";
import { User, IUserMetadata } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import mongoose, { Types } from "mongoose";
import { ImportHistory } from "../models/ImportHistory.js";
import { Project } from "../models/Project.js";
import { Role } from "../models/Role.js";

export class ExternalApiService {
    private api: AxiosInstance;
    private token: string | null = null;

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

    async login(): Promise<void> {
        try {
            console.log(`[EXTERNAL API] Authenticating as ${process.env.FRAME_API_USER}...`);
            const response = await this.api.post(
                "/sesion",
                {},
                {
                    auth: {
                        username: process.env.FRAME_API_USER || "",
                        password: process.env.FRAME_API_PASSWORD || "",
                    },
                }
            );

            if (response.data && response.data.token) {
                this.token = response.data.token;
                console.log("[EXTERNAL API] Authenticated successfully.");
            } else {
                throw new Error("No token received from external API");
            }
        } catch (error) {
            console.error("[EXTERNAL API] Login failed:", error);
            throw error;
        }
    }

    async getEmployees(): Promise<any[]> {
        if (!this.token) {
            await this.login();
        }
        try {
            const { data } = await this.api.get("/empleado");
            return data;
        } catch (error) {
            console.error("[EXTERNAL API] Failed to fetch employees:", error);
            throw error;
        }
    }

    async getEmployeeProjects(employeeId: number): Promise<any[]> {
        if (!this.token) {
            await this.login();
        }
        try {
            const { data } = await this.api.get(`/proyecto-empleado/empleado/v2/${employeeId}`);
            return data;
        } catch (error) {
            console.error(`[EXTERNAL API] Failed to fetch employee projects for ${employeeId}:`, error);
            throw error;
        }
    }

    async checkImportUsers(sinceDays: number): Promise<{ count: number; employees: Array<{ name: string; email: string; fechaAlta?: string }> }> {
        console.log(`[EXTERNAL API] Checking user import (sinceDays=${sinceDays})...`);
        const employees = await this.getEmployees();
        
        let thresholdDate: Date | null = null;
        if (sinceDays) {
            thresholdDate = new Date();
            thresholdDate.setDate(thresholdDate.getDate() - sinceDays);
            thresholdDate.setHours(0, 0, 0, 0);
        }

        const filteredEmployees: Array<{ name: string; email: string; fechaAlta?: string }> = [];

        for (const emp of employees) {
            if (!emp.email) continue;
            
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

    async importUsers(
        tenantId: string, 
        executedBy: mongoose.Types.ObjectId | "system",
        syncProjects: boolean = false,
        sinceDays?: number
    ): Promise<{ created: number; updated: number; skipped: number; errors: number }> {
        console.log(`[EXTERNAL API] Starting user import (syncProjects=${syncProjects}, sinceDays=${sinceDays})...`);

        const addedUsers: Array<{ name: string; email: string; dni: string }> = [];
        const addedProjectsMap = new Map<number, string>(); // Use map to keep projects unique

        let created = 0;
        // INSERT-ONLY IMPORT: existing documents are never modified. `updated`
        // stays 0 and is kept only for backward compatibility of the result shape.
        let updated = 0;
        let skipped = 0;
        let errors = 0;
        let thresholdDate: Date | null = null;

        try {
            const employees = await this.getEmployees();

            const tenantObjectId = new mongoose.Types.ObjectId(tenantId);

            // Default role assigned to every newly imported user: "Mobile-Colaborador".
            // Tolerant match (hyphen/spaces, case-insensitive) to cover legacy naming.
            const mobileCollabRole = await Role.findOne({
                tenantId: tenantObjectId,
                name: { $regex: /^mobile\s*-?\s*colaborador$/i },
            });
            const defaultRoleIds = mobileCollabRole ? [mobileCollabRole._id] : [];
            if (!mobileCollabRole) {
                console.warn("[EXTERNAL API] Role 'Mobile-Colaborador' not found for this tenant. New users will be created WITHOUT a role.");
            }

            if (sinceDays) {
                thresholdDate = new Date();
                thresholdDate.setDate(thresholdDate.getDate() - sinceDays);
                thresholdDate.setHours(0, 0, 0, 0);
            }

            for (const emp of employees) {
                try {
                    if (!emp.email) {
                        console.warn(`[EXTERNAL API] Skipping employee ${emp.id} without email.`);
                        continue;
                    }

                    if (thresholdDate && emp.fechaAlta) {
                        const empDate = new Date(emp.fechaAlta);
                        if (isNaN(empDate.getTime()) || empDate < thresholdDate) {
                            continue;
                        }
                    }

                    // Map external fields to metadata
                    const metadata: IUserMetadata = {
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
                        osId: emp.osId,
                        osPrepaga: emp.osPrepaga,
                        fechaNac: emp.fechaNac,
                        fechaAlta: emp.fechaAlta,
                        telefono: emp.telefono,
                        telefono2: emp.telefono2,
                        visa: emp.visa,
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

                    const existingUser = await User.findOne({ email: emp.email, tenantId: userPayload.tenantId });

                    // NEVER touch existing users: if the user is already in the platform we
                    // leave it completely untouched (firstName, lastName, isActive, metadata,
                    // relations, etc. are preserved) and move on to the next employee.
                    if (existingUser) {
                        skipped++;
                        continue;
                    }

                    // Only brand-new users are inserted, using the current model schema.
                    const userDoc = await User.create(userPayload);
                    created++;
                    // `password` here is the DNI (or the fallback when there is no valid documento).
                    addedUsers.push({ name: userPayload.name, email: userPayload.email, dni: password });

                    // Sync Projects only for this newly created user.
                    if (syncProjects) {
                        try {
                            const projectsValues = await this.getEmployeeProjects(emp.id);
                            if (projectsValues && projectsValues.length > 0) {
                                const projectIds: Types.ObjectId[] = [];
                                const internalProjectIds: Types.ObjectId[] = [];

                                const groupedProjects: { [key: number]: any[] } = {};
                                projectsValues.forEach((p: any) => {
                                    if (!groupedProjects[p.proyecto_id]) {
                                        groupedProjects[p.proyecto_id] = [];
                                    }
                                    groupedProjects[p.proyecto_id].push(p);
                                });

                                for (const extProjIdStr in groupedProjects) {
                                    const extProjId = Number(extProjIdStr);
                                    const contracts = groupedProjects[extProjId];

                                    // Find internal Project ID
                                    const internalProject = await Project.findOne({ externalId: extProjId, tenantId: userPayload.tenantId });

                                    if (!internalProject) {
                                        console.warn(`[EXTERNAL API] Skipping user-project relationship for employee ${emp.email} and project ${extProjId} because the project does not exist in Weprodu.`);
                                        continue;
                                    }

                                    if (userDoc._id) {
                                        await Project.updateOne(
                                            { _id: internalProject._id },
                                            { $addToSet: { assignedUsers: userDoc._id } }
                                        );
                                        internalProjectIds.push(internalProject._id as Types.ObjectId);
                                    }

                                    const projectName = contracts.length > 0 ? contracts[0].nombre_proyecto : "";

                                    const query = {
                                        externalProjectId: extProjId,
                                        externalEmployeeId: emp.id
                                    };

                                    // INSERT-ONLY: never overwrite an existing relation. If the
                                    // user-project relation already exists we leave it untouched
                                    // and only reuse its id; otherwise we create a new one.
                                    let savedProj = await UserProject.findOne(query);
                                    if (!savedProj) {
                                        savedProj = await UserProject.create({
                                            externalProjectId: extProjId,
                                            externalEmployeeId: emp.id,
                                            nombre_proyecto: projectName,
                                            projectId: internalProject._id,
                                            userId: userDoc._id,
                                            contracts: contracts,
                                            nombre_rol_frame: contracts.length > 0 ? contracts[0].nombre_rol_frame : ""
                                        });
                                        addedProjectsMap.set(extProjId, projectName);
                                    }
                                    if (savedProj) {
                                        projectIds.push(savedProj._id as Types.ObjectId);
                                    }
                                }

                                userDoc.metadata = userDoc.metadata || {} as any;
                                userDoc.metadata.projects = projectIds;
                                userDoc.projectIds = internalProjectIds;
                                userDoc.markModified('metadata');
                                await userDoc.save();
                            }
                        } catch (projErr) {
                            console.error(`[EXTERNAL API] Failed to sync projects for ${emp.email}:`, projErr);
                        }
                    }

                } catch (error) {
                    console.error(`[EXTERNAL API] Error importing user ${emp.email}:`, error);
                    errors++;
                }
            }

            // Save success history record
            await ImportHistory.create({
                tenantId: new mongoose.Types.ObjectId(tenantId),
                status: "success",
                executedBy: executedBy === "system" ? "system" : new mongoose.Types.ObjectId(executedBy),
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

        } catch (globalError: any) {
            console.error("[EXTERNAL API] Global import failure:", globalError);
            // Save failure history record
            await ImportHistory.create({
                tenantId: new mongoose.Types.ObjectId(tenantId),
                status: "failed",
                executedBy: executedBy === "system" ? "system" : new mongoose.Types.ObjectId(executedBy),
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
                })),
                errorDetails: globalError.message || String(globalError)
            });
            throw globalError;
        }

        console.log(`[EXTERNAL API] Import finished. Created: ${created}, Skipped (existing, untouched): ${skipped}, Errors: ${errors}`);
        return { created, updated, skipped, errors };
    }
}

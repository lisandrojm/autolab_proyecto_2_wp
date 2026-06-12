import axios, { AxiosInstance } from "axios";
import User, { IUserMetadata } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import mongoose, { Types } from "mongoose";

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

    async importUsers(tenantId: string, syncProjects: boolean = false, sinceDays?: number): Promise<{ created: number; updated: number; errors: number }> {
        console.log(`[EXTERNAL API] Starting user import (syncProjects=${syncProjects}, sinceDays=${sinceDays})...`);
        const employees = await this.getEmployees();
        let created = 0;
        let updated = 0;
        let errors = 0;

        let thresholdDate: Date | null = null;
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

                const userPayload = {
                    email: emp.email,
                    firstName: emp.nombre,
                    lastName: emp.apellido,
                    name: `${emp.nombre} ${emp.apellido}`.trim(),
                    isActive: emp.activo ?? true,
                    hireDate: emp.fechaAlta ? new Date(emp.fechaAlta) : new Date(),
                    tenantId: new mongoose.Types.ObjectId(tenantId),
                    metadata: metadata,
                    password: "ChangeMe123!",
                };

                let userDoc = await User.findOne({ email: emp.email });

                if (userDoc) {
                    userDoc.firstName = userPayload.firstName;
                    userDoc.lastName = userPayload.lastName;
                    userDoc.name = userPayload.name;
                    userDoc.isActive = userPayload.isActive;
                    if (!sinceDays && userDoc.metadata && userDoc.metadata.projects) {
                        metadata.projects = userDoc.metadata.projects;
                    }
                    userDoc.metadata = metadata;
                    userDoc.markModified('metadata');
                    await userDoc.save();
                    updated++;
                } else {
                    userDoc = await User.create(userPayload);
                    created++;
                }

                // Sync Projects if requested
                if (syncProjects && userDoc) {
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
                                // @ts-ignore
                                const internalProject = await import("./Project.js").then(m => m.default.findOne({ externalId: extProjId })).catch(() => null);

                                if (internalProject && userDoc._id) {
                                    // @ts-ignore
                                    await import("./Project.js").then(m => m.default.updateOne(
                                        { _id: internalProject._id },
                                        { $addToSet: { assignedUsers: userDoc._id } }
                                    )).catch(() => null);
                                    // @ts-ignore
                                    internalProjectIds.push(internalProject._id);
                                }

                                const projectName = contracts.length > 0 ? contracts[0].nombre_proyecto : "";

                                const query = {
                                    externalProjectId: extProjId,
                                    externalEmployeeId: emp.id
                                };

                                const update = {
                                    externalProjectId: extProjId,
                                    externalEmployeeId: emp.id,
                                    nombre_proyecto: projectName,
                                    projectId: internalProject ? internalProject._id : undefined,
                                    contracts: contracts,
                                    nombre_rol_frame: contracts.length > 0 ? contracts[0].nombre_rol_frame : ""
                                };
                                const options = { upsert: true, new: true, setDefaultsOnInsert: true };

                                const savedProj = await UserProject.findOneAndUpdate(query, update, options);
                                if (savedProj) {
                                    // @ts-ignore
                                    projectIds.push(savedProj._id);
                                }
                            }

                            userDoc.metadata = userDoc.metadata || {} as any;
                            // @ts-ignore
                            userDoc.metadata.projects = projectIds;
                            // @ts-ignore
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

        console.log(`[EXTERNAL API] Import finished. Created: ${created}, Updated: ${updated}, Errors: ${errors}`);
        return { created, updated, errors };
    }
}

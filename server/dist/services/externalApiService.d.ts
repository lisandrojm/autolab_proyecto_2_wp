import mongoose from "mongoose";
export declare class ExternalApiService {
    private api;
    private token;
    constructor();
    login(): Promise<void>;
    getEmployees(): Promise<any[]>;
    getEmployeeProjects(employeeId: number): Promise<any[]>;
    checkImportUsers(sinceDays: number): Promise<{
        count: number;
        employees: Array<{
            name: string;
            email: string;
            fechaAlta?: string;
        }>;
    }>;
    importUsers(tenantId: string, executedBy: mongoose.Types.ObjectId | "system", syncProjects?: boolean, sinceDays?: number): Promise<{
        created: number;
        updated: number;
        errors: number;
    }>;
}

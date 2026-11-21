import { Document, Types, Model } from "mongoose";
export interface IEmbeddedOverlap {
    _id?: Types.ObjectId;
    areaId?: Types.ObjectId;
    projectId?: Types.ObjectId;
    clientId?: Types.ObjectId;
    roleFrameId?: Types.ObjectId;
    maxSimultaneousUsers: number;
    description?: string;
    isActive: boolean;
    useActiveContractSchedule?: boolean;
}
export interface IVacationConfig extends Document {
    tenantId: Types.ObjectId;
    diasBeneficio?: number;
    maxDiasGozados?: number;
    permiteArrastre: boolean;
    maxDiasArrastre?: number;
    vencimientoArrastreDias?: number;
    maxDiasHabiles?: number;
    anticipacionMinimaDias?: number;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos: boolean;
    /**
     * VENTANA ANUAL DE GOCE (10/11/2026): el tramo del año en que se pueden tomar vacaciones, sin año
     * ("MM-DD"), p. ej. 11-01 → 04-30. Apagada por defecto. Reglas en `compartido/ventanaGoce.ts`.
     */
    ventanaGoce?: {
        enabled: boolean;
        inicio: string;
        fin: string;
    };
    /**
     * CAMPAÑA DE GOCE (15/11/2026): invitar a elegir fechas dentro de la ventana, con fecha límite, y si no
     * eligen, que la empresa asigne un tramo único. Reglas en `compartido/vacaciones/campania.ts`. No hay
     * opción de pagar en lugar de gozar: no es configurable porque no existe.
     */
    campania?: {
        activa: boolean;
        plazoParaDefinirDias: number;
        avisoMinimoDias: number;
        minDiasPorTramo: number;
        tiposContratoInvitar?: number[];
    };
    /**
     * DE QUÉ EMPLEADORA SE TOMA LA ANTIGÜEDAD (15/11/2026). Ya no se suman los días de todas: cuenta la
     * de una sola (ver `empresaDeComputo` en utils/antiguedadArca.ts).
     *  - `modo`: "empresaVigente" (la de la relación vigente o más reciente) o "precedenciaManual".
     *  - `precedencia`: empresas (ids de Company) en orden; la primera que la persona tenga gana. Sólo en modo manual.
     *  - `sumarEntreEmpresas`: el comportamiento viejo (todas sumadas). Apagado por defecto.
     */
    computoAntiguedad?: {
        modo: "empresaVigente" | "precedenciaManual";
        precedencia: Types.ObjectId[];
        sumarEntreEmpresas: boolean;
    };
    requiereFirma: boolean;
    pdfId?: string;
    overlaps: IEmbeddedOverlap[];
    contractRules?: {
        contractId: number;
        contractName: string;
        vacationsEnabled: boolean;
    }[];
    vacationSequence: number;
    createdAt: Date;
    updatedAt: Date;
}
interface IVacationConfigModel extends Model<IVacationConfig> {
    getOrCreateDefault(tenantId: Types.ObjectId): Promise<IVacationConfig>;
    getNextVacationSequence(tenantId: Types.ObjectId): Promise<number>;
}
export declare const VacationConfig: IVacationConfigModel;
export {};

import { Types } from "mongoose";
export declare function detalleParaAprobar(o: {
    tenantId: any;
    tenantObjectId: Types.ObjectId;
    vacationId: string;
    userId: string;
    esAdmin: boolean;
}): Promise<{
    solicitud: {
        _id: string;
        vacationNumber: any;
        desde: string;
        hasta: string;
        dias: any;
        diasCorridos: any;
        motivo: any;
        creadaAt: any;
        status: any;
        etapa: import("../../compartido/vacaciones/etapaDeAprobacion.js").Etapa;
        origen: any;
        campania: {
            nombre: any;
            ventanaDesde: any;
            ventanaHasta: any;
        };
        asignadaPorEmpresa: boolean;
        aprobaciones: {
            supervisor: {
                nombre: string;
                at: any;
            };
            coordinador: {
                nombre: string;
                at: any;
            };
        };
        recordatorios: any;
    };
    persona: {
        _id: string;
        nombre: any;
        email: any;
        cuil: any;
        foto: any;
        rolEmpresa: any;
        antiguedad: any;
        empresaComputo: any;
        saldo: {
            anio: number;
            total: any;
            gozados: any;
            pendientes: any;
            disponibles: any;
        };
    };
    proyectos: {
        projectId: string;
        nombre: string;
        rolEmpresa: any;
        contrato: {
            tipo: any;
            categoria: any;
            empresa: any;
            alta: string;
            baja: string;
            horario: string;
            diasSemana: any;
            diasPorSemana: any;
            sede: any;
        };
        areasTurnos: {
            area: string;
            turnos: string[];
        }[];
        supervisores: any;
        coordinadores: any;
        soyAprobador: boolean;
        superposiciones: {
            nombre: any;
            desde: string;
            hasta: string;
            dias: any;
            status: any;
            mismaAreaTurno: boolean;
        }[];
    }[];
    otrasDelAnio: {
        vacationNumber: any;
        desde: string;
        hasta: string;
        dias: any;
        status: any;
        origen: any;
    }[];
}>;
export type DetalleParaAprobar = Awaited<ReturnType<typeof detalleParaAprobar>>;

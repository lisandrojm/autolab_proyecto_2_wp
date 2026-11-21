export declare class CierreInvalido extends Error {
}
export declare function cerrarSinFirma(o: {
    up: any;
    idx: number;
    motivo: string;
    por?: string | null;
    porNombre?: string;
}): Promise<{
    estadoAnterior: string;
    estadoNuevo: string;
    constancia: string;
}>;

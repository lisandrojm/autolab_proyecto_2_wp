export declare class CandadoDropboxSignOcupado extends Error {
    status: number;
    constructor(desde: Date);
}
export declare const quienTieneDropboxSign: (tenantId: string) => {
    desde: Date;
    automatica: boolean;
};
export declare function tomarCandadoDropboxSign(tenantId: string, automatica: boolean): void;
export declare function soltarCandadoDropboxSign(tenantId: string): void;

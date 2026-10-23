import type { PantallaDropboxSign } from "./clasificarPantalla.js";
export interface EstadoLoginAsistido {
    estado: "abierto" | "conectado" | "cerrado";
    pantalla: PantallaDropboxSign | "";
    url: string;
    detalle: string;
    viewport: {
        width: number;
        height: number;
    };
    abiertoEl: string | null;
    /** La captura (JPEG base64), cuando se pide la pantalla. */
    jpeg?: string;
}
export type AccionLoginAsistido = {
    tipo: "click";
    x: number;
    y: number;
} | {
    tipo: "tipear";
    texto: string;
} | {
    tipo: "tecla";
    tecla: string;
} | {
    tipo: "scroll";
    dy: number;
};
/** Abre el navegador en el login (o reusa el que ya está abierto). Si entra directo con la sesión guardada, conecta y cierra. */
export declare function abrirLoginAsistido(tenantId: string): Promise<EstadoLoginAsistido>;
/** La captura actual más el estado. Si el navegador llegó al listado, conecta. */
export declare function pantallaLoginAsistido(tenantId: string): Promise<EstadoLoginAsistido>;
/** Un click, texto o tecla del usuario, reenviados al navegador. Devuelve la captura resultante. */
export declare function accionLoginAsistido(tenantId: string, accion: AccionLoginAsistido): Promise<EstadoLoginAsistido>;
export declare function cerrarLoginAsistido(tenantId: string, motivo?: string): Promise<{
    ok: boolean;
    estado: EstadoLoginAsistido["estado"];
}>;
export declare const hayLoginAsistido: (tenantId: string) => boolean;

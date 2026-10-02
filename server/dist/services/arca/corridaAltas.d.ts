import { ItemLoteAltas, LoteAltasValidado } from "./validarLoteAltas.js";
import type { ModoAltas } from "./cotejoAltas.js";
/**
 * PRESENTAR ALTAS EN ARCA DESDE EL SERVIDOR: Carga Masiva (archivo de 130) o Altas Masivas (pegado
 * de 85, máximo 9).
 *
 * Mismo mecanismo que la validación de obras sociales (`corridaServidor.ts`): arranca, vuelve
 * enseguida, y el progreso se sigue por eventos que el modal pide cada ~2 s. Comparte con ella el
 * CANDADO (`candadoArca.ts`): usan la misma sesión de ARCA y no pueden correr a la vez.
 *
 * Lo que agrega es que ESTA corrida no se deshace. Las reglas:
 *
 *   · El lote lo decide el servidor (`validarLoteAltas.ts`): cada registro se coteja contra la base.
 *   · «Detener» funciona hasta el paso ANTERIOR al envío. Desde el evento `irreversible` ya no.
 *   · Nunca se reintenta un Enviar ni un Aceptar. Si después del click algo falla o no se puede leer,
 *     el resultado es «indeterminado», y queda así en el contrato para que nadie lo vuelva a presentar
 *     sin mirar ARCA primero.
 *   · En desarrollo corre EN SECO por defecto (ver `enSecoForzado`).
 */
export type EventoAltas = {
    tipo: "abriendo";
} | {
    tipo: "sesion";
    seLogueo: boolean;
} | {
    tipo: "empleadoraVerificada";
    cuit: string;
} | {
    tipo: "pantalla";
    que: string;
} | {
    tipo: "novedadCreada";
    codigo: string;
} | {
    tipo: "archivoCargado";
} | {
    tipo: "validacion";
    estado: string;
    errores: string;
    registrosLeidos: number;
    enviados: number;
} | {
    tipo: "grillaVacia";
} | {
    tipo: "pegado";
    registros: number;
} | {
    tipo: "grillaCargada";
    cuils: string[];
} | {
    tipo: "irreversible";
    que: "enviar" | "aceptar";
} | {
    tipo: "enviada";
    estado: string;
    fechaPresentacion: string;
    nroTransaccion: string;
} | {
    tipo: "persona";
    cuil: string;
    estado: "alta" | "rechazada" | "indeterminado";
    motivo?: string;
} | {
    tipo: "seco";
    codigoNovedad?: string;
} | {
    tipo: "indeterminado";
    comoVerificar: string;
} | {
    tipo: "fin";
    resultado: string;
} | {
    tipo: "fallo";
    mensaje: string;
    textoArca?: string;
    codigoNovedad?: string;
};
interface CorridaAltas {
    tenantId: string;
    tipo: ModoAltas;
    empresaId: string;
    empresaRazonSocial: string;
    empresaCuit: string;
    personas: Array<{
        cuil: string;
        nombre: string;
    }>;
    total: number;
    enSeco: boolean;
    eventos: EventoAltas[];
    terminada: boolean;
    /** Se apretó (o se está por apretar) el botón que no se deshace. Desde acá «Detener» no corta. */
    irreversible: boolean;
    señal: {
        cortada: boolean;
    };
    arrancadaEl: Date;
}
export declare const corridaAltasDe: (tenantId: string) => CorridaAltas | undefined;
/**
 * En desarrollo NO se presenta nada de verdad salvo que se pida explícito con
 * `ARCA_ALTAS_EN_SECO=false`. En producción es real salvo `ARCA_ALTAS_EN_SECO=true`. El cliente puede
 * pedir seco, nunca lo contrario.
 */
export declare const enSecoForzado: () => boolean;
export declare function detenerCorridaAltas(tenantId: string): {
    detenida: boolean;
    motivo?: string;
};
export declare function arrancarCorridaAltas(opts: {
    tenantId: string;
    tenantObjectId: any;
    usuarioId?: string;
    modo: ModoAltas;
    empresaId: string;
    items: ItemLoteAltas[];
    enSeco?: boolean;
    forzar?: boolean;
}): Promise<{
    total: number;
    enSeco: boolean;
    empresa: LoteAltasValidado["empresa"];
}>;
export {};

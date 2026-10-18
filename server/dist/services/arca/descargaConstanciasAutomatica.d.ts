import { Types } from "mongoose";
/**
 * DESCARGA AUTOMÁTICA DE LAS CONSTANCIAS DE ALTA TEMPRANA (pedido del 18/10/2026). Una vez por día, a la
 * hora configurada por el tenant, se bajan de ARCA las constancias de las altas ya presentadas que
 * todavía no la tienen, y cada una sigue su camino (Outbox si se firma, «No firmar» si no). Es lo mismo
 * que el botón «Descargar altas tempranas» del registro de Altas Masivas, empleadora por empleadora.
 *
 * CÓMO NO COLGAR A ARCA. La descarga ya va con cuidado (ver `constanciasAltas.ts`): una persona por vez,
 * pausa de 1,5 a 3 s entre personas, una pestaña por descarga, y lo que ARCA no entrega a tiempo se
 * vuelve a pedir al final (hasta 3 vueltas). ARCA no publica un tope de consultas, pero una corrida de
 * cientos seguidas es justo lo que la sesión no aguanta; por eso acá además hay un TOPE POR EMPLEADORA Y
 * POR CORRIDA (`MAX_POR_EMPLEADORA`): lo que sobra sale al día siguiente. Las empleadoras van en fila,
 * esperando el candado de ARCA entre una y otra (otra corrida en curso —altas, obras sociales— no se pisa).
 */
export declare const MAX_POR_EMPLEADORA = 40;
export interface ResumenEmpresaConstancias {
    empresa: string;
    pendientes: number;
    pedidas: number;
    listas: number;
    error?: string;
}
export interface ResumenDescargaConstancias {
    fecha: string;
    dia: string;
    empresas: ResumenEmpresaConstancias[];
    error?: string;
}
/** La corrida del día de UN tenant. Devuelve el resumen que se guarda en el tenant y se muestra en la pantalla. */
export declare function correrDescargaConstanciasDelDia(tenantId: string, tenantObjectId: Types.ObjectId, tenantCarpeta: string, dia: string): Promise<ResumenDescargaConstancias>;

import { Document, Model } from "mongoose";
/**
 * Tabla oficial de ARCA (Simplificación Registral): tipo de servicio.
 *
 * Es un nomenclador del organismo, no un dato del negocio: se siembra desde el CSV extraído de la
 * pantalla de alta individual de ARCA (`src/scripts/seedTablasArca.ts`) y se edita a mano solo si
 * ARCA la actualiza. Sigue la forma de los demás catálogos simples para poder reusar el ABM genérico.
 *
 * `externalId` es el CÓDIGO tal cual lo espera el TXT (3 díg., pos. 107-109 del TXT de alta), con sus ceros a la izquierda.
 * Se guarda como string justamente para no perderlos.
 */
export interface IArcaTipoServicio extends Document {
    externalId: string;
    name: string;
    /**
     * Código del Grupo de Tipo de Servicio (`l_GTS`): "1" continuos, "2" discontinuos.
     *
     * NO viaja en el TXT — el registro de 130 posiciones no le reserva ninguna. Está para desambiguar
     * el selector: 49 nombres de este catálogo aparecen dos veces (98 registros), y sin el grupo las
     * dos filas se ven idénticas. Ver `models/ArcaGrupoTipoServicio.ts`.
     *
     * Vacío = todavía no se clasificó. No se asume ningún grupo por defecto: elegir mal acá es escribir
     * otro código en las posiciones 107-109.
     */
    grupo?: string;
    data: {
        id: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const ArcaTipoServicio: Model<IArcaTipoServicio>;

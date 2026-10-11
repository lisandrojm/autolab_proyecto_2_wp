import type { ContractOverviewRow } from "./tiposArca.js";
import { AfipCatalogs, AfipValues } from "./afipCompleteness.js";
import { CampoRegistro } from "./afipTxt.js";
export declare function describirRegistro85(row: ContractOverviewRow, cat: AfipCatalogs): {
    campos: CampoRegistro[];
    valores: AfipValues;
};
/** El registro de 85 de un contrato, o null si le falta algún dato. */
export declare function buildAltaRecord85(row: ContractOverviewRow, cat: AfipCatalogs): string | null;
/**
 * El texto que se pega en ARCA: un registro por línea, separados por LF y SIN salto final.
 *
 * Distinto del archivo de 130 (que cierra con LF): esto va a un textarea, y una línea vacía al final
 * puede leerse como un décimo registro vacío. Lo confirma o corrige el relevamiento de la pantalla.
 */
export declare const buildAltasMasivasTexto: (records: string[]) => string;

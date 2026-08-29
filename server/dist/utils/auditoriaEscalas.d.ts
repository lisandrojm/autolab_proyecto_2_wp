/**
 * El cuarto chequeo de la familia: ESCALAS VENCIDAS.
 *
 *   1. Categoría sin convenio ni código      → banner de huérfanas
 *   2. Función FRAME sin categoría válida    → BannerFuncionesRotas
 *   3. Contrato apuntando a categoría inexistente → BannerContratosHuerfanos
 *   4. Escala vencida                        → esto
 *
 * Los tres primeros detectan cosas ROTAS. Este detecta algo que funciona y está desactualizado, que
 * es distinto y por eso NO bloquea: una escala vencida sigue siendo la última paritaria pactada, y
 * generar el alta con ella es mejor que no generarla. Lo que no puede pasar es que alguien mande un
 * TXT creyendo que el importe está al día cuando no lo está.
 *
 * POR QUÉ HACE FALTA UN CAMPO Y NO ALCANZA CON MIRAR `fechaActualizacion`
 *
 * Una escala de hace tres meses puede estar perfectamente vigente —las paritarias duran lo que duran—
 * y una de hace tres semanas puede haber vencido ayer. La antigüedad no dice nada; lo único que dice
 * algo es la fecha que la propia paritaria declara. Por eso el aviso solo aparece cuando hay
 * `vigenciaHasta`: sin ese dato, callarse es más honesto que adivinar un plazo.
 */
export interface FuenteDeEscala {
    convenio?: string;
    /** Nombre para mostrar: el del grupo, o el de la categoría cuando el convenio no tiene grupos. */
    nombre?: string;
    numero?: number;
    codigoArca?: string;
    sueldoBruto?: number;
    fechaActualizacion?: Date | string;
    vigenciaHasta?: Date | string;
}
export interface EscalaVencida {
    convenio: string;
    /** `grupo` o `categoria`: dónde vive la escala en ese convenio. */
    donde: "grupo" | "categoria";
    nombre: string;
    vigenciaHasta: string;
    /** Días desde que venció. Ordena por esto: la más vieja es la más urgente. */
    diasVencida: number;
}
/**
 * Las escalas cuya vigencia ya pasó.
 *
 * `hoy` se recibe y no se toma del reloj para que el resultado sea reproducible: un chequeo cuyo
 * resultado cambia según cuándo se lo corra no se puede testear ni comparar entre dos corridas.
 *
 * Solo entran las que TIENEN escala cargada: una en cero no está vencida, está sin cargar, y eso ya
 * lo dice el indicador «Sin escala: bloquea el alta». Mezclarlas haría que arreglar una tapara a la
 * otra.
 */
export declare function escalasVencidas(fuentes: Array<FuenteDeEscala & {
    donde: "grupo" | "categoria";
}>, hoy: string): EscalaVencida[];
/** Agrupado por convenio, que es como lo muestra la pantalla: el problema es del CCT, no de la fila. */
export declare function vencidasPorConvenio(vencidas: EscalaVencida[]): Array<{
    convenio: string;
    escalas: number;
    vigenciaHasta: string;
    diasVencida: number;
}>;

/**
 * EL CONTRATO QUE RIGE DE CADA MIEMBRO, ELEGIDO ADENTRO DE MONGO.
 *
 * Los vínculos de un proyecto grande pesan: 254 personas con 22 contratos de promedio son 5,3 MB.
 * Traerlos para quedarse con UNO por persona hacía que `area-shift-counts` bajara ~1 MB aun pidiendo
 * cuatro campos (11 s medidos), y la Jerarquía lo repetía una vez por área. Acá la elección se hace
 * en la base con la misma regla que `getContratoActivo` —vigentes; entre ellos manda el tiempo
 * indeterminado; el más reciente por alta y, a igualdad, por carga; sin vigentes, el más reciente de
 * todos— y viaja una fila chica por persona.
 *
 * Si se toca la regla de `getContratoActivo`, hay que tocar esta también.
 *
 * Devuelve userId → contrato que rige (sólo los campos que usan los contadores y el detalle), o sin
 * entrada si la persona no tiene vínculo con el proyecto.
 */
export declare function contratosQueRigenDelProyecto(projectId: string, hoy: string): Promise<Map<string, any>>;

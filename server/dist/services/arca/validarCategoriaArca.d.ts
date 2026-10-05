/**
 * LA BARRERA DEL ABM DE CATEGORÍAS: el código de ARCA no se tipea, se elige del espejo.
 *
 * Se llama al crear y al editar una categoría (y al reactivarla). Es del lado del server a propósito:
 * el formulario ya ofrece solo códigos del espejo, pero un request armado a mano, un script o una
 * pantalla vieja tienen que chocar contra lo mismo. Es lo que faltaba cuando se cruzaron 41 códigos.
 *
 *   · el par (convenio, código) existe y está vigente en el espejo          → si no, 400
 *   · si ARCA dice «- GRUPO N», el grupo de la categoría es N               → si no, 400
 *   · si el nombre no se parece a la descripción de ARCA                    → 409 `requiereConfirmacion`
 *     El cliente reenvía con `confirmarNombre: true` y queda registrado quién confirmó.
 *
 * Con el espejo vacío (sin sembrar) no se valida: no hay contra qué, y bloquear todo el ABM por eso
 * sería peor. `npm run catalogo-arca:sembrar` lo llena.
 */
export declare class CategoriaArcaInvalida extends Error {
    status: 400 | 409;
    extra: Record<string, unknown>;
    constructor(message: string, status: 400 | 409, extra?: Record<string, unknown>);
}
export declare function validarCategoriaContraEspejo(o: {
    convenio: string;
    codigoArca: string;
    nombre: string;
    grupoNumero: number | null;
    confirmarNombre?: boolean;
    confirmacionActual?: {
        descripcionArca?: string;
    } | null;
    usuarioId?: string;
}): Promise<{
    descripcionArca: string;
    confirmacionNombre: {
        descripcionArca: string;
        por?: string;
        el: Date;
    } | null;
}>;

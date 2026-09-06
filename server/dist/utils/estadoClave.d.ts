/**
 * La clave con la que se compara un estado contra otro, del lado del server.
 *
 * Es el espejo de `frontend/src/utils/estadoClave.ts`. Vivía copiada adentro de `routes/users.ts`
 * como `estadoCanonico`, y una segunda copia acá habría sido la tercera: los alias tienen que ser
 * los mismos en los dos lados o un contrato guardado como «Falta pedido de AFIP» se encuentra
 * desde una pantalla y no desde la otra.
 *
 * NO se toca la lista de alias sin mirar también el archivo del front.
 */
export declare const normalizarEstado: (s: string) => string;
export declare const claveEstado: (name: string) => string;

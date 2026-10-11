/**
 * La clave con la que se compara un estado contra otro. SIN dependencias de React.
 *
 * Vivía adentro de `components/EstadoSelect.tsx`, y eso la volvía inimportable desde código que no
 * es de pantalla: traerla arrastraba el componente, sus stores y `axiosConfig`, que en un test bajo
 * `tsx --test` explota al tocar `import.meta.env`. El cálculo del alta temprana la necesita, así que
 * la parte pura vive acá y `EstadoSelect` la reexporta.
 */
export declare const normalizarEstado: (s: string) => string;
export declare const claveEstado: (name: string) => string;

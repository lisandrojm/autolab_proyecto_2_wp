/**
 * QUIÉN ES EL GREMIO en el campo `signatario` del nomenclador de ARCA.
 *
 * Es texto libre cargado a mano durante veinte años, y de ahí sale la única forma de saber cuántas
 * ENTIDADES hay que visitar para cubrir el catálogo — el número que decide si la carga de fuentes por
 * gremio es un par de semanas o no se termina nunca.
 *
 * TRES FORMATOS, NO UNO
 *
 *   1. `SINDICATO C/ CÁMARA`              el gremio está a la IZQUIERDA
 *   2. `SIGLA - SINDICATO // CONTRAPARTE` el gremio está a la IZQUIERDA (formato moderno, con `//`)
 *   3. `EMPRESA / SINDICATO`              el gremio está a la DERECHA (convenios de empresa)
 *
 * El primer intento cortaba siempre por la izquierda y por eso devolvía el nombre de la EMPRESA en
 * todos los convenios de empresa: «1.403 entidades con un solo convenio» no eran 1.403 gremios, eran
 * 1.403 empresas, y detrás un puñado de federaciones que se repetían.
 *
 * Y LA BARRA SIMPLE NO ALCANZA PARA DECIDIR EL LADO:
 *
 *   `ACEITERA VICENTIN S.A. / FEDERACION DE OBREROS…`   → gremio a la derecha
 *   `ASOC.PERS.TECNICO AERONAUTICO / LAN ARGENTINA SA`  → gremio a la izquierda
 *
 * Los dos son «algo / algo». Lo que los distingue no es la posición sino cuál de los dos lados es una
 * EMPRESA, así que se elige por eso y la posición queda solo como desempate.
 *
 * ESTO ES UNA HEURÍSTICA Y SE DECLARA COMO TAL. Sirve para dimensionar el trabajo, no para afirmar
 * quién firmó un convenio: para eso está el texto crudo, que no se toca.
 */
/**
 * El lado del texto donde está el gremio, sin partir todavía en entidades.
 *
 * Devuelve también la regla que se aplicó: sin eso, revisar un resultado raro obliga a reproducir el
 * razonamiento entero a mano.
 */
export declare const ladoDelGremio: (signatario: string) => {
    lado: string;
    regla: string;
};
/** Las entidades gremiales que firman un convenio. Puede ser más de una. */
export declare const gremiosDe: (signatario: string) => string[];
/**
 * La clave con la que dos escrituras del mismo gremio se reconocen como una.
 *
 * «UNION TRABAJADORES DE ENTIDADES DEPORTIVAS Y CIVILES» y «UNION DE TRABAJADORES DE ENTIDADES
 * DEPORTIVAS Y CIVILES» son UTEDYC las dos. Sin esto aparecen como dos entidades y la cola larga se
 * ve el doble de larga de lo que es.
 */
export declare const claveEntidad: (nombre: string) => string;
/**
 * Agrupa claves donde una es el COMIENZO EXACTO de otra.
 *
 * «SINDICATO ARGENTINO TELEVISION» y «SINDICATO ARGENTINO TELEVISION SERVICIOS AUDIOVISUALES
 * INTERACTIVOS DATOS» son el SATSAID: el gremio se renombró y el nomenclador guarda las dos épocas.
 *
 * Se exige que sea un PREFIJO de tokens y no un subconjunto: con subconjunto, «UNION FERROVIARIA»
 * absorbería cualquier nombre que contuviera esas dos palabras en cualquier lado, y ahí se estarían
 * fusionando gremios distintos para que el número dé más lindo.
 */
export declare const canonizar: (claves: string[]) => Map<string, string>;

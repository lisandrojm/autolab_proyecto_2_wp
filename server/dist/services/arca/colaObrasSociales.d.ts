/**
 * VALIDAR LA OBRA SOCIAL EN SEGUNDO PLANO, apenas nace el contrato.
 *
 * Hasta acá la validación contra ARCA la disparaba una persona con el botón «Validar obra social» y se
 * quedaba mirando la pantalla los ~15 s que tarda. Pero el momento en que hace falta se conoce de
 * antes: cuando se crea un contrato —o se le asigna empleadora— para alguien con CUIL. Esto lo encola
 * ahí, y cuando alguien abre Contratos el dato ya está. El botón queda como reintento manual.
 *
 * NO ES OTRO CAMINO A ARCA: usa la MISMA corrida (`arrancarCorrida`) y el MISMO candado
 * (`candadoArca`). Lo único nuevo es quién aprieta el botón y cuándo.
 *
 * AGRUPA. Aprobar veinte solicitudes seguidas no puede ser veinte corridas —veinte logins—: lo que
 * llega dentro de la ventana de espera (`ARCA_COLA_ESPERA_SEG`, 20 s) sale en UNA corrida, con las
 * empleadoras como grupos de la misma sesión.
 *
 * QUIÉN SE VALIDA LO DECIDE `pendientesObraSocial`, igual que con el botón: al vaciar la cola se
 * intersecta lo encolado con lo que sigue pendiente. Así nunca se vuelve a consultar a alguien ya
 * constatado (lo validaron a mano mientras esperaba, o ya estaba) ni se pisa nada: el aplicador es el
 * de siempre, con sus reglas.
 *
 * SI ARCA ESTÁ OCUPADA, ESPERA. Con el candado tomado (otra validación, una Carga Masiva) no se
 * dispara nada: se reintenta cada `ARCA_COLA_REINTENTO_SEG` (30 s) hasta `MAX_INTENTOS` veces, y si
 * no hubo caso se suelta — queda pendiente y con el botón a mano, que es exactamente lo de antes.
 *
 * NUNCA ROMPE LO QUE LA LLAMÓ. Encolar no tira, no espera y no toca la base: crear un contrato no puede
 * fallar ni demorarse porque ARCA esté caída o falten las credenciales.
 *
 * EN MEMORIA, como la corrida y el candado. Un reinicio del proceso pierde la cola: esas personas
 * quedan pendientes y se validan con el botón o con el próximo contrato de su empleadora.
 *
 * SE APAGA con `ARCA_VALIDACION_AUTOMATICA=0`. El server de desarrollo (`npm run local`) corre contra
 * la base de producción y lo trae apagado: no tiene que entrar a ARCA solo por crear un contrato de
 * prueba, ni abrir una segunda sesión del mismo usuario de AFIP al lado de la del VPS.
 */
export interface DepsCola {
    /** Quiénes siguen pendientes en esa empleadora (`pendientesObraSocial`). */
    pendientes: (tenantObjectId: unknown, empresaId: string) => Promise<Array<{
        cuil: string;
    }>>;
    /** Arranca la corrida (`arrancarCorrida`). Vuelve enseguida; tira `CandadoArcaOcupado` si hay otra. */
    arrancar: (o: {
        tenantId: string;
        tenantObjectId: any;
        grupos: Array<{
            empresaId: string;
            cuils: string[];
        }>;
        usuarioId?: string;
    }) => Promise<unknown>;
    /** ¿Hay una corrida de ARCA en curso para el tenant? */
    ocupado: (tenantId: string) => boolean;
    /** Cuánto se espera desde el primer encolado para juntar los que vengan atrás. */
    esperaMs: number;
    /** Cada cuánto se reintenta si ARCA está ocupada. */
    reintentoMs: number;
    maxIntentos: number;
}
/** Hasta 20 reintentos de 30 s: diez minutos esperando a que se libere ARCA. Después se suelta. */
export declare const MAX_INTENTOS = 20;
export declare const validacionAutomaticaActiva: (valor?: string | undefined) => boolean;
/** Lo encolado de un tenant, para mirar y para los tests. */
export declare const enCola: (tenantId: string) => Array<{
    empresaId: string;
    cuils: string[];
}>;
/** Olvida todo sin validar nada. Para los tests. */
export declare function olvidarColas(): void;
/**
 * Suma una persona a la cola de su tenant. Devuelve si quedó encolada.
 *
 * El temporizador se arma con el PRIMER encolado y no se reinicia con los siguientes: los que llegan
 * dentro de la ventana se suman a esa corrida, y una ráfaga larga no posterga para siempre a los
 * primeros.
 */
export declare function encolarValidacionObraSocial(p: {
    tenantId: string;
    tenantObjectId: any;
    empresaId: string;
    cuil: unknown;
    usuarioId?: string;
}, deps?: DepsCola): boolean;
export type ResultadoDeVaciar = "vacia" | "ocupado" | "abandonada" | "nada_pendiente" | "arrancada" | "fallo";
/**
 * Saca la cola del tenant en UNA corrida. La llama el temporizador; exportada para probarla.
 *
 * Lo que entra a la corrida se quita de la cola recién cuando la corrida ARRANCÓ: si ARCA estaba
 * ocupada o el arranque falla por el candado, sigue encolado. Lo que se encole mientras tanto
 * (durante el `await` de pendientes) no se pierde: queda para la vuelta siguiente.
 */
export declare function vaciarCola(tenantId: string, deps?: DepsCola): Promise<ResultadoDeVaciar>;
/**
 * El gancho para las rutas: encola si el contrato lo amerita. No tira nunca.
 *
 * Mismos requisitos que el botón «Validar obra social» (ver `CeldaObraSocial`): empleadora, categoría
 * —de ella sale el convenio; un servicio no lleva obra social— y CUIL válido. Lo ya constatado en ARCA
 * no se encola: no hay nada que validar.
 */
export declare function encolarSiCorresponde(o: {
    tenantObjectId: any;
    usuarioId?: string;
    cuit: unknown;
    contrato: any;
}, deps?: DepsCola): boolean;

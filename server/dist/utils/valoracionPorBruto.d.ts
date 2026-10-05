/**
 * QUÉ VALORACIÓN LE CORRESPONDE A CADA CATEGORÍA DE UNA FUNCIÓN, SEGÚN SU BRUTO.
 *
 * Es la otra mitad de la valoración. El PROYECTO la toma de su margen (`valoracionAutomatica.ts`);
 * la CATEGORÍA, de su sueldo: dentro de una función, la más barata es la de nivel bajo.
 *
 * La regla, dentro de cada convenio de la función, de MENOR A MAYOR:
 *   - las categorías se ordenan de la más barata a la más cara;
 *   - la primera toma el nivel más bajo, la siguiente el que sigue, y así;
 *   - si hay más categorías que niveles, las que sobran quedan en el nivel más alto.
 *
 * EMPATADAS EN EL BRUTO: TAMBIÉN OCUPAN NIVELES SEGUIDOS, en el orden de la escala. Compartían nivel
 * —«si cobran lo mismo, valen lo mismo»— y eso dejaba niveles sin nadie: Sonidista tiene Compaginador
 * Musical y Operador de Sonido en $1.481.789,76 y Microfonista más abajo, así que con tres niveles
 * Oro quedaba vacío y un proyecto Oro no tenía qué ofrecer. Entre dos que cobran igual, el desempate
 * es el NOMBRE, para que la sugerencia sea siempre la misma la pida quien la pida.
 *
 * Con Plata y Oro: la más barata Plata, el resto Oro. Un proyecto Plata recibe sola la más barata
 * —que es para lo que existe esto— y uno Oro elige entre las caras. Con Bronce y Platino la regla
 * escala sin cambiar nada.
 *
 * POR CONVENIO y no por función entera: al contratar, el filtro de convenio va ANTES que el de
 * valoración (lo exige ARCA). Si la más barata de la función fuera de otro convenio, un proyecto
 * Plata que contrata por éste se quedaría sin opción de su nivel.
 *
 * QUEDA SIN VALORAR —y se dice por qué— lo que no tiene nada que elegir:
 *   - una categoría sin bruto: no se puede ubicar en la escala;
 *   - un convenio con UNA SOLA categoría. Valorarla dejaría a los demás niveles sin ninguna, y el
 *     server pediría motivo en cada alta por una categoría que igual era la única posible. Sin
 *     valorar, el modo permisivo la ofrece y el alta la elige sola.
 *
 * Una sola implementación, del lado del server: la usan el formulario de Roles Empresa (que la pide
 * para sugerir) y el script que la aplica a todas las funciones. Dos copias —una en cada lado—
 * terminarían diciendo cosas distintas.
 */
export interface CategoriaParaValorar {
    id: string;
    convenio: string;
    bruto: number | null | undefined;
    /** Sólo para desempatar dos que cobran lo mismo. Sin nombre, desempata el id. */
    nombre?: string;
}
export interface NivelParaValorar {
    _id: unknown;
    orden?: number | null;
}
export interface ValoracionSugerida {
    valoracionId: string | null;
    /** Por qué quedó sin valorar. Vacío cuando tiene valoración. */
    motivo?: string;
}
export declare function valorarPorBruto(categorias: CategoriaParaValorar[], niveles: NivelParaValorar[]): Map<string, ValoracionSugerida>;

/**
 * QUÉ VALORACIÓN LE CORRESPONDE A CADA CATEGORÍA DE UNA FUNCIÓN, SEGÚN SU BRUTO.
 *
 * Es la otra mitad de la valoración. El PROYECTO la toma de su margen (`valoracionAutomatica.ts`);
 * la CATEGORÍA, de su sueldo: dentro de una función, la más barata es la de nivel bajo.
 *
 * La regla, dentro de cada convenio de la función, de MENOR A MAYOR:
 *   - los brutos distintos se ordenan de menor a mayor;
 *   - el más barato toma el nivel más bajo, el siguiente el que sigue, y así;
 *   - si hay más brutos que niveles, los que sobran quedan en el nivel más alto;
 *   - dos categorías con el MISMO bruto reciben el mismo nivel.
 *
 * Con Plata y Oro: la más barata Plata, el resto Oro. Un proyecto Plata recibe sola la más barata
 * —que es para lo que existe esto— y uno Oro elige entre las caras. Con Bronce y Platino la regla
 * escala sin cambiar nada.
 *
 * POR CONVENIO y no por función entera: al contratar, el filtro de convenio va ANTES que el de
 * valoración (lo exige ARCA). Si la más barata de la función fuera de otro convenio, un proyecto
 * Plata que contrata por éste se quedaría sin opción de su nivel.
 *
 * QUEDA SIN VALORAR —y se dice por qué— lo que no tiene elección por precio:
 *   - una categoría sin bruto: no se puede decir si es la barata;
 *   - un convenio con una sola categoría, o con todas al mismo bruto. Valorarla como Plata dejaría a
 *     un proyecto Oro sin ninguna de su nivel, y el server le exigiría motivo en cada alta por una
 *     categoría que igual era la única posible. Sin valorar, el modo permisivo la ofrece y el alta
 *     la elige sola.
 *
 * Una sola implementación, del lado del server: la usan el formulario de Roles Empresa (que la pide
 * para sugerir) y el script que la aplica a todas las funciones. Dos copias —una en cada lado—
 * terminarían diciendo cosas distintas.
 */

export interface CategoriaParaValorar {
  id: string;
  convenio: string;
  bruto: number | null | undefined;
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

const brutoValido = (b: number | null | undefined): b is number => typeof b === "number" && Number.isFinite(b) && b > 0;

export function valorarPorBruto(categorias: CategoriaParaValorar[], niveles: NivelParaValorar[]): Map<string, ValoracionSugerida> {
  const resultado = new Map<string, ValoracionSugerida>();
  /*
    La escala, de MENOR A MAYOR nivel. En Valoraciones el `orden` 1 es el nivel MÁS ALTO —Oro arriba,
    como se lee un podio—, así que el más bajo es el de `orden` más grande: se ordena al revés.
    Sin `orden` van al principio, entre los bajos: no se puede afirmar que sean de los altos, y
    ponerlos arriba les daría las categorías más caras por un dato que falta.
  */
  const escala = [...niveles].sort((a, b) => (b.orden ?? Number.POSITIVE_INFINITY) - (a.orden ?? Number.POSITIVE_INFINITY));

  if (escala.length === 0) {
    for (const c of categorias) resultado.set(c.id, { valoracionId: null, motivo: "no hay valoraciones activas" });
    return resultado;
  }

  const porConvenio = new Map<string, CategoriaParaValorar[]>();
  for (const c of categorias) porConvenio.set(c.convenio || "", [...(porConvenio.get(c.convenio || "") || []), c]);

  for (const grupo of porConvenio.values()) {
    for (const c of grupo) if (!brutoValido(c.bruto)) resultado.set(c.id, { valoracionId: null, motivo: "no tiene bruto en el catálogo" });

    const distintos = [...new Set(grupo.map((c) => c.bruto).filter(brutoValido))].sort((a, b) => a - b);
    if (distintos.length < 2) {
      const motivo = distintos.length === 0 ? "no tiene bruto en el catálogo" : grupo.filter((c) => brutoValido(c.bruto)).length === 1 ? "es la única de su convenio: no hay qué elegir" : "todas las de su convenio cobran lo mismo";
      for (const c of grupo) if (brutoValido(c.bruto)) resultado.set(c.id, { valoracionId: null, motivo });
      continue;
    }

    for (const c of grupo) {
      if (!brutoValido(c.bruto)) continue;
      const puesto = distintos.indexOf(c.bruto);
      const nivel = escala[Math.min(puesto, escala.length - 1)];
      resultado.set(c.id, { valoracionId: String(nivel._id) });
    }
  }
  return resultado;
}

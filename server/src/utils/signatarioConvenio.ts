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

/** Separadores de entidades DENTRO de un lado. La coma no entra: va adentro de los nombres. */
const ENTRE_ENTIDADES = /\s*;\s*/;

/** Con qué arranca el nombre de una entidad gremial o de una cámara. */
const ARRANQUE_ENTIDAD = /^(SINDICATO|SIND\b|FEDERACION|FED\b|ASOCIACION|ASOC\b|UNION|CAMARA|CENTRO|CONFEDERACION|COLEGIO|CIRCULO|AGREMIACION|SOCIEDAD|LA FRATERNIDAD)/;

/** Lo que delata a una empresa y no a un gremio. */
const ES_EMPRESA =
  /(\bS\.?\s?A\.?(\s?I\.?\s?C\.?\s?F?\.?)?$|\bS\.?R\.?L\.?$|\bSRL$|\bSA$|\bLTDA?\.?$|\bCOOPERATIVA\b|\bSOCIEDAD DEL ESTADO\b|\bENTE AUTARQUICO\b|\bADMINISTRACION PORTUARIA\b|\bEMPRESA (DISTRIBUIDORA|DE TRANSPORTE|OPERADORA)\b|\bCENTRAL PUERTO\b|\bCAJA DE PREVISION\b)/;

/** Prefijos administrativos: `SMATA - 227 - `, `11 - `, `5275 - `, `UTEDYC - `. */
const PREFIJO = /^(?:[A-ZÁÉÍÓÚÑ.]{2,12}|\d{1,5})\s*-\s*/;

const limpiar = (s: string): string =>
  s
    .replace(/^["'\s/]+|["'\s/]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Saca los paréntesis: casi siempre son siglas o «(REEMPLAZA AL CCT 0359/03)», con barras adentro. */
const sinParentesis = (s: string): string => s.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

/** Quita los prefijos de sigla/número, que pueden venir encadenados. */
const sinPrefijo = (s: string): string => {
  let t = limpiar(s);
  for (let i = 0; i < 3 && PREFIJO.test(t); i++) t = limpiar(t.replace(PREFIJO, ""));
  return t;
};

const pareceEmpresa = (s: string): boolean => ES_EMPRESA.test(sinPrefijo(s).toUpperCase());
const pareceEntidad = (s: string): boolean => ARRANQUE_ENTIDAD.test(sinPrefijo(s).toUpperCase());

/**
 * El lado del texto donde está el gremio, sin partir todavía en entidades.
 *
 * Devuelve también la regla que se aplicó: sin eso, revisar un resultado raro obliga a reproducir el
 * razonamiento entero a mano.
 */
export const ladoDelGremio = (signatario: string): { lado: string; regla: string } => {
  const s = sinParentesis(String(signatario || ""));
  if (!s) return { lado: "", regla: "vacío" };

  /*
    1. `C/`, `CON`, `CONTRA`: convención de convenio de actividad. El gremio va primero.

    La barra NO lleva `\s+` obligatorio detrás: en el nomenclador abunda `...AUTOMOTOR C/ASOCIACION`
    sin espacio, y exigirlo hacía que esta regla no matcheara y el texto cayera en la de barra
    simple — que cortaba en el `/` y dejaba el nombre del gremio terminado en una «C» suelta.
    `CON`/`CONTRA` sí lo llevan, para no partir «CONFEDERACION».
  */
  const conC = s.search(/\s*\b(?:C\/|c\/)|\s+\b(?:CON|CONTRA)\s+/);
  if (conC > 0) return { lado: s.slice(0, conC), regla: "C/ → izquierda" };

  // 2. `//`: formato moderno `SIGLA - GREMIO // CONTRAPARTE`. También el gremio primero.
  const doble = s.indexOf("//");
  if (doble > 0) return { lado: s.slice(0, doble), regla: "// → izquierda" };

  // 3. Barra simple: AMBIGUA. Decide cuál de los dos lados NO es una empresa.
  const barra = s.indexOf("/");
  if (barra > 0) {
    const izq = s.slice(0, barra);
    const der = s.slice(barra + 1);
    if (pareceEmpresa(izq) && !pareceEmpresa(der)) return { lado: der, regla: "/ → derecha (la izquierda es una empresa)" };
    if (pareceEmpresa(der) && !pareceEmpresa(izq)) return { lado: izq, regla: "/ → izquierda (la derecha es una empresa)" };
    if (pareceEntidad(izq) && !pareceEntidad(der)) return { lado: izq, regla: "/ → izquierda (solo ella arranca como entidad)" };
    if (pareceEntidad(der) && !pareceEntidad(izq)) return { lado: der, regla: "/ → derecha (solo ella arranca como entidad)" };
    // Empate: se queda con la izquierda, que es la convención dominante.
    return { lado: izq, regla: "/ → izquierda (empate)" };
  }

  /*
    4. Sin ningún separador. Hay casos con « Y » uniendo gremio y contraparte
    (`UNION FERROVIARIA Y METROVIAS S.A.`). Se corta ahí solo si lo que sigue parece una empresa: la
    « Y » está dentro de demasiados nombres legítimos («LUZ Y FUERZA», «PAPEL, CARTON Y QUIMICOS»)
    como para cortarla a ciegas.
  */
  const conY = s.search(/\s+[YyEe]\s+/);
  if (conY > 0) {
    const derecha = s.slice(conY).replace(/^\s+[YyEe]\s+/, "");
    // Se corta si lo que sigue es una EMPRESA (`UNION FERROVIARIA Y METROVIAS S.A.`) o una entidad
    // nueva, que en esta posición es siempre la contraparte (`UTEDYC y FEDERACION ARGENTINA DE
    // CLUBES DE CAMPO`). Se conserva solo la izquierda: la derecha es con quién se firmó, no quién.
    if (pareceEmpresa(derecha) || pareceEntidad(derecha)) return { lado: s.slice(0, conY), regla: "Y → izquierda (la derecha es la contraparte)" };
  }
  return { lado: s, regla: "sin separador" };
};

/**
 * Corta por coma, pero SOLO cuando lo que sigue arranca como una entidad nueva.
 *
 * «FEDERACION DE OBREROS Y EMPLEADOS DE LA INDUSTRIA DEL PAPEL, CARTON Y QUIMICOS» lleva la coma
 * adentro del nombre: partirla a ciegas inventaría un gremio llamado «CARTON Y QUIMICOS».
 */
const partirPorComa = (s: string): string[] =>
  s.split(",").reduce<string[]>((acc, parte, i) => {
    const t = parte.trim();
    if (!t) return acc;
    if (i === 0 || ARRANQUE_ENTIDAD.test(t.toUpperCase())) acc.push(t);
    else acc[acc.length - 1] += ", " + t;
    return acc;
  }, []);

/** Las entidades gremiales que firman un convenio. Puede ser más de una. */
export const gremiosDe = (signatario: string): string[] => {
  const { lado } = ladoDelGremio(signatario);
  return lado
    .split(ENTRE_ENTIDADES)
    .flatMap(partirPorComa)
    .map(sinPrefijo)
    .map((e) => limpiar(e).toUpperCase())
    .filter(Boolean);
};

/** Abreviaturas del nomenclador, para poder reconocer que dos escrituras son la misma entidad. */
const ABREVIATURAS: Array<[RegExp, string]> = [
  [/\bSIND\b\.?/g, "SINDICATO"],
  [/\bFED\b\.?/g, "FEDERACION"],
  [/\bASOC\b\.?/g, "ASOCIACION"],
  [/\bCONFED\b\.?/g, "CONFEDERACION"],
  [/\bIND\b\.?/g, "INDUSTRIA"],
  [/\bOBR\b\.?/g, "OBREROS"],
  [/\bEMP\b\.?/g, "EMPLEADOS"],
  [/\bPERS\b\.?/g, "PERSONAL"],
  [/\bTRANSP\b\.?/g, "TRANSPORTE"],
  [/\bREP\b\.?/g, "REPUBLICA"],
  [/\bARG\b\.?/g, "ARGENTINA"],
  [/\bR\.?\s?A\.?\b/g, "REPUBLICA ARGENTINA"],
  [/\bTELECOM\b\.?/g, "TELECOMUNICACIONES"],
  [/\bJERARQ\b\.?/g, "JERARQUICO"],
  [/\bCOM\.?\s?RIV\b\.?/g, "COMODORO RIVADAVIA"],
];

/** Palabras que no distinguen a nadie y solo hacen que dos escrituras del mismo nombre no coincidan. */
const VACIAS = new Set(["DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "E", "EN", "A", "AL", "SU"]);

/**
 * La clave con la que dos escrituras del mismo gremio se reconocen como una.
 *
 * «UNION TRABAJADORES DE ENTIDADES DEPORTIVAS Y CIVILES» y «UNION DE TRABAJADORES DE ENTIDADES
 * DEPORTIVAS Y CIVILES» son UTEDYC las dos. Sin esto aparecen como dos entidades y la cola larga se
 * ve el doble de larga de lo que es.
 */
export const claveEntidad = (nombre: string): string =>
  ABREVIATURAS.reduce((s, [de, a]) => s.replace(de, a), ` ${String(nombre || "").toUpperCase()} `)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !VACIAS.has(t))
    .join(" ")
    .trim();

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
export const canonizar = (claves: string[]): Map<string, string> => {
  const unicas = [...new Set(claves)].sort((a, b) => a.split(" ").length - b.split(" ").length);
  const destino = new Map<string, string>();
  for (const c of unicas) {
    // Se busca la más larga que empiece exactamente con esta.
    const padre = unicas.find((otra) => otra !== c && otra.startsWith(c + " ") && c.split(" ").length >= 3);
    destino.set(c, padre ? destino.get(padre) || padre : c);
  }
  // Segunda pasada: las cadenas de prefijos se resuelven hasta el final.
  for (const c of unicas) {
    let d = destino.get(c)!;
    for (let i = 0; i < 5 && destino.get(d) && destino.get(d) !== d; i++) d = destino.get(d)!;
    destino.set(c, d);
  }
  return destino;
};

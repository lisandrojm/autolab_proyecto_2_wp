/**
 * PARA QUÉ SIRVE CADA CARPETA VIGILADA DE DROPBOX. La única fuente.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * Hasta acá, saber qué carpeta era cuál se hacía matcheando texto contra el ÚLTIMO tramo del path:
 * `[/alta/i, /temprana|afip/i]` encontraba «Alta temprana de Arca» por la palabra «temprana». Anda,
 * pero queda atado al nombre que una persona le puso a la carpeta en Dropbox — y el día que alguien
 * la renombre a «Alta ARCA», deja de matchear **en silencio**: la transición no se dispara, no hay
 * error, no hay log, y el síntoma aparece semanas después como «los contratos no avanzan».
 *
 * Con un propósito explícito, el nombre de la carpeta pasa a ser lo que es —una etiqueta para
 * humanos— y la resolución deja de depender de él.
 *
 * DE ACÁ CONSUMEN TODOS: el tipo del campo, el backfill, la validación, la resolución, el
 * desplegable del modal y los tests. Un array escrito a mano en el componente sería una segunda
 * verdad sobre lo mismo, que es exactamente cómo se generó el problema anterior con las etiquetas.
 *
 * LOS SEIS NO SON OBLIGATORIOS. Un tenant puede legítimamente no usar alguno: en el tenant demo,
 * «Alta temprana de Arca» y «Sin cuit» están vacías. Faltar un propósito produce un 400 recién
 * cuando alguien usa esa función concreta (`routes/afip.ts`, `routes/firmaDigital.ts`), no al
 * guardar la configuración. Por eso la completitud es una ADVERTENCIA, nunca un bloqueo.
 */

export interface DefinicionProposito {
  valor: string;
  /** Cómo se llama en el desplegable. */
  etiqueta: string;
  /** Qué pasa cuando llega un archivo ahí. Es lo que la persona necesita para elegir bien. */
  descripcion: string;
  /**
   * Cómo se lo reconocía por el nombre. Se conserva SOLO para dos cosas: inferir el propósito de las
   * carpetas ya configuradas (backfill) y como red de contención mientras queden sin migrar.
   *
   * Todos los patrones tienen que matchear. Se prueban contra `detalle + nombre de la carpeta`.
   */
  patrones: RegExp[];
}

/**
 * El orden importa: es el del flujo real de un contrato —trámite impositivo, después firma— y es el
 * que va a ver quien abra el desplegable.
 */
export const PROPOSITOS = [
  {
    valor: "alta_temprana",
    etiqueta: "Alta temprana de ARCA",
    descripcion: "Llega el acuse del alta temprana. El contrato avanza a Envío de documentación.",
    // `arca` además de `temprana|afip`: la carpeta ya se llama «Alta temprana de Arca» y un tenant
    // podría llamarla «Alta ARCA» — el caso exacto que este campo viene a dejar de romper.
    patrones: [/alta/i, /temprana|afip|arca/i],
  },
  {
    valor: "constancia_cuit",
    etiqueta: "Constancia de CUIT",
    descripcion: "Se archiva la constancia de inscripción consultada en ARCA.",
    patrones: [/constancia/i, /cuit/i],
  },
  {
    valor: "sin_cuit",
    etiqueta: "Sin CUIT",
    descripcion: "Comprobante de las personas que todavía no tienen CUIT/CUIL argentino.",
    patrones: [/sin/i, /cuit/i],
  },
  {
    valor: "outbox",
    etiqueta: "Outbox (para firmar)",
    descripcion: "Donde se dejan los documentos que Dropbox Sign tiene que mandar a firmar.",
    patrones: [/outbox/i],
  },
  {
    valor: "pendbox",
    etiqueta: "Pendbox (firma enviada)",
    descripcion: "Intermedia: el documento ya se envió y espera la firma del destinatario.",
    patrones: [/pendbox/i],
  },
  {
    valor: "firmados",
    etiqueta: "Firmados",
    descripcion: "Donde Dropbox Sign deja los documentos ya firmados. La carpeta se llama «Requested signatures»: ese nombre lo pone Dropbox Sign, no nosotros.",
    patrones: [/requested/i, /signature/i],
  },
] as const satisfies readonly DefinicionProposito[];

export type PropositoCarpeta = (typeof PROPOSITOS)[number]["valor"];

/** Los valores sueltos, para el `enum` de Mongoose y las validaciones. */
export const VALORES_PROPOSITO: readonly PropositoCarpeta[] = PROPOSITOS.map((p) => p.valor);

export const esProposito = (v: unknown): v is PropositoCarpeta => VALORES_PROPOSITO.includes(String(v) as PropositoCarpeta);

export const definicionDe = (v: string): DefinicionProposito | undefined => PROPOSITOS.find((p) => p.valor === v);

/** Cómo se llama un propósito en pantalla. Cae al valor crudo antes que mostrar vacío. */
export const etiquetaProposito = (v: string): string => definicionDe(v)?.etiqueta || v;

/** El texto contra el que corren los patrones: la nota libre más el nombre visible de la carpeta. */
export const textoDeCarpeta = (c: { dropboxCarpeta?: string; detalle?: string }): string => `${c.detalle || ""} ${(c.dropboxCarpeta || "").split("/").filter(Boolean).pop() || ""}`;

/**
 * Qué propósito tendría esta carpeta según su nombre.
 *
 * Devuelve TODOS los que matchean, no el primero. Un nombre que encaja en dos propósitos es un dato
 * que hay que ver: significa que el matcheo por texto era ambiguo también antes, y que la carpeta
 * podía estar resolviendo cualquiera de los dos según el orden en que estuvieran cargadas.
 */
export const inferirPropositos = (c: { dropboxCarpeta?: string; detalle?: string }): PropositoCarpeta[] => {
  const texto = textoDeCarpeta(c);
  return PROPOSITOS.filter((p) => p.patrones.every((re) => re.test(texto))).map((p) => p.valor);
};

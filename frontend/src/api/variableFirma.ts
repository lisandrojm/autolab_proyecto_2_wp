/**
 * La variable de firma, UNA sola vez para las cuatro pantallas de plantillas.
 *
 * QUÉ RINDE, LITERAL
 *
 *     Firma: ______________________________
 *
 * POR QUÉ ESA FORMA Y NO OTRA
 *
 * No es estética. La detección automática de campos de firma —la de Dropbox Sign, y la de los
 * asistentes que leen el PDF en el navegador— está entrenada con documentos reales, donde una firma
 * se ve así: la palabra «Firma», dos puntos y una línea. Un placeholder tipo `[FIRMA]`, `<firma>` o
 * `FIRMA AQUÍ` le parece texto del cuerpo y no propone ningún campo. El documento sale, se manda a
 * firmar, y del otro lado no hay dónde firmar.
 *
 * POR QUÉ ESTÁ APARTE Y NO CON LAS DE LA EMPRESA
 *
 * En Pedidos y Vacaciones estaba dentro de «Variables de la empresa», y ahí se leía como un dato de
 * la empleadora —al lado de la razón social y el CUIT— cuando es lo contrario: es DÓNDE FIRMA LA
 * PERSONA. La empresa no firma estos documentos; su parte viene en el membrete. Agrupada con los
 * datos de la empleadora, la variable que decide si el circuito de firma funciona quedaba escondida
 * entre cinco campos de relleno.
 */
export interface GrupoVariables {
  grupo: string;
  vars: string[];
  /** Resalta el título del grupo y le pone un info al lado. El chip queda igual que los demás. */
  destacado?: boolean;
  /** Lo que se ve en el documento, tal cual, para poder reconocerlo en el PDF. */
  ejemplo?: string;
  nota?: string;
  /** Lo que puede salir MAL si se usa donde no va. Se muestra destacado adentro del info. */
  advertencia?: string;
}

/**
 * Para CONTRATOS y RELEASES: acá la firma hace falta.
 *
 * `documentPdf.ts` no imprime ninguna línea de firma del empleado por su cuenta — el pie que arma
 * `buildFirmaFooter` es la firma de la EMPRESA, y solo aparece si hay membrete. Sin `{{firma}}` en el
 * cuerpo, el documento sale sin ningún lugar donde firme la persona.
 */
export const GRUPO_FIRMA: GrupoVariables = {
  grupo: "Firma",
  vars: ["{{firma}}"],
  destacado: true,
  ejemplo: "Firma: ______________________________",
  nota: "Es dónde firma la persona, y va al final del documento. Se reemplaza por una línea de firma clásica: así la reconocen Dropbox Sign y los asistentes que leen el PDF, y proponen el campo de firma solos. Escrita de otra forma —«[FIRMA]», «FIRMA AQUÍ»— parece texto del cuerpo del documento y no se propone ningún campo: el documento se manda a firmar y del otro lado no hay dónde hacerlo.",
};

/**
 * Para PEDIDOS y VACACIONES: acá la firma YA VIENE, y ponerla otra vez la duplica.
 *
 * `pdfGenerator.ts` cierra todos estos documentos con un pie de DOS COLUMNAS:
 *
 *     Firma: __________________________          [firma de la empresa]
 *     Aclaración: <nombre de la persona>         <firmante> · <cargo>
 *
 * Y eso es justamente para qué sirve el pie: deja las dos firmas ENFRENTADAS, que es lo que hace
 * válido al documento. No es un adorno que se pueda apagar.
 *
 * Las dos mitades no salen con la misma condición, y la diferencia importa:
 *
 *   izquierda (la persona)  SIEMPRE. Está fuera de todo condicional — ver el `<div class="footer">`
 *                           en pdfGenerator.ts. Sale con el membrete apagado también.
 *   derecha (la empresa)    solo con `usaMembrete`, igual que el encabezado.
 *
 * Por eso el aviso no dice «si tenés membrete»: la mitad que `{{firma}}` duplica es la de la
 * persona, y esa está siempre. Pegarla en el cuerpo de un Pedido o una Vacación deja DOS líneas de
 * firma para la misma persona, la detección automática propone un campo por cada una, y quien lo
 * firma no sabe cuál es la buena.
 *
 * La variable se sigue ofreciendo —una plantilla puede querer una firma a mitad del texto, por
 * ejemplo una conformidad aparte— pero con el aviso a la vista de que el pie ya la trae.
 */
export const GRUPO_FIRMA_PIE_AUTOMATICO: GrupoVariables = {
  ...GRUPO_FIRMA,
  grupo: "Firma (ya viene en el pie)",
  nota: "Estos documentos se cierran solos con un pie de firmas: a la izquierda la línea y la aclaración de la persona, a la derecha la firma de la empresa con su firmante y su cargo (esa mitad aparece si la plantilla tiene el membrete activo). Ese pie es lo que deja las dos firmas enfrentadas, así que normalmente NO hace falta agregar nada. La variable existe por si querés una firma ADICIONAL en medio del texto —una conformidad aparte, un segundo firmante—, no para la del final.",
  advertencia: "Si la pegás igual, la persona va a quedar con dos líneas de firma: la del pie y la tuya. La detección automática propone un campo por cada una y quien firma no sabe cuál es la buena. Revisalo en «Previsualizar» antes de guardar.",
};

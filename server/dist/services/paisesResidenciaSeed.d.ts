/**
 * LA PRIMERA CARGA DEL ABM DE PAÍSES DE RESIDENCIA, UNA SOLA VEZ.
 *
 * Copia los países de FRAME (`Info` con `type: "pais"`) CON SU MISMO `data.id`. Ese es el punto: los
 * domicilios ya guardados tienen `metadata.paisId` apuntando a esos ids, así que al mudar el país del
 * domicilio a este catálogo siguen resolviendo a su nombre sin migrar ningún usuario.
 *
 * Después de la primera vez NO vuelve a tocar nada: el catálogo es de quien lo administra desde el
 * ABM, y un reinicio no puede reponer un país que alguien borró. Por eso se anota en
 * `SemillaAplicada` en vez de preguntar si la colección está vacía.
 *
 * La marca se toma ANTES de copiar y con `upsert`: si el server corre en más de una instancia, sólo la
 * que la crea hace la copia. Si la copia falla, se suelta la marca para reintentar en el próximo arranque.
 */
export declare function sembrarPaisesResidenciaUnaVez(): Promise<void>;

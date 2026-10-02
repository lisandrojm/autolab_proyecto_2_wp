import { estadoCategoria, TEXTO_ESTADO_CATEGORIA } from "../../compartido/catalogoArca.js";
import { espejoCategorias } from "./espejoArca.js";

/**
 * LA BARRERA DEL ABM DE CATEGORÍAS: el código de ARCA no se tipea, se elige del espejo.
 *
 * Se llama al crear y al editar una categoría (y al reactivarla). Es del lado del server a propósito:
 * el formulario ya ofrece solo códigos del espejo, pero un request armado a mano, un script o una
 * pantalla vieja tienen que chocar contra lo mismo. Es lo que faltaba cuando se cruzaron 41 códigos.
 *
 *   · el par (convenio, código) existe y está vigente en el espejo          → si no, 400
 *   · si ARCA dice «- GRUPO N», el grupo de la categoría es N               → si no, 400
 *   · si el nombre no se parece a la descripción de ARCA                    → 409 `requiereConfirmacion`
 *     El cliente reenvía con `confirmarNombre: true` y queda registrado quién confirmó.
 *
 * Con el espejo vacío (sin sembrar) no se valida: no hay contra qué, y bloquear todo el ABM por eso
 * sería peor. `npm run catalogo-arca:sembrar` lo llena.
 */
export class CategoriaArcaInvalida extends Error {
  constructor(
    message: string,
    public status: 400 | 409,
    public extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function validarCategoriaContraEspejo(o: {
  convenio: string;
  codigoArca: string;
  nombre: string;
  grupoNumero: number | null;
  confirmarNombre?: boolean;
  confirmacionActual?: { descripcionArca?: string } | null;
  usuarioId?: string;
}): Promise<{ descripcionArca: string; confirmacionNombre: { descripcionArca: string; por?: string; el: Date } | null }> {
  const espejo = await espejoCategorias();
  if (!espejo.hay) return { descripcionArca: "", confirmacionNombre: null };
  const fila = espejo.mapa.get(`${o.convenio}|${o.codigoArca}`) || null;
  const e = estadoCategoria({ nombre: o.nombre, grupoNumero: o.grupoNumero, fila, confirmacion: o.confirmacionActual });

  if (e.estado === "no_existe_en_arca") throw new CategoriaArcaInvalida(`ARCA no tiene el código ${o.codigoArca} para el convenio ${o.convenio}. Elegilo de la lista de códigos de ARCA.`, 400, { estado: e.estado });
  if (e.estado === "no_vigente") throw new CategoriaArcaInvalida(`ARCA dejó de publicar el código ${o.codigoArca} (${e.descripcionArca}). Elegí uno vigente.`, 400, { estado: e.estado });
  if (e.estado === "grupo_distinto") throw new CategoriaArcaInvalida(`ARCA ubica el código ${o.codigoArca} en el grupo ${e.grupoArca} («${e.descripcionArca}») y la categoría está en el grupo ${o.grupoNumero}.`, 400, { estado: e.estado, grupoArca: e.grupoArca });
  if (e.estado === "nombre_distinto" && !e.confirmada) {
    if (!o.confirmarNombre) {
      throw new CategoriaArcaInvalida(`ARCA llama al código ${o.codigoArca} «${e.descripcionArca}», y la categoría se llama «${o.nombre}». ${TEXTO_ESTADO_CATEGORIA.nombre_distinto}: confirmá que es la misma categoría.`, 409, {
        requiereConfirmacion: true,
        descripcionArca: e.descripcionArca,
      });
    }
    return { descripcionArca: e.descripcionArca, confirmacionNombre: { descripcionArca: e.descripcionArca, por: o.usuarioId, el: new Date() } };
  }
  // ok, o nombre distinto ya confirmado para esta misma descripción: se conserva la confirmación.
  return { descripcionArca: e.descripcionArca, confirmacionNombre: e.confirmada ? (o.confirmacionActual as any) : null };
}

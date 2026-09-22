import mongoose, { Schema, Document, Model } from "mongoose";

/**
 * Valoración comercial: el nivel (Plata, Oro…) que se le pone a un proyecto según su MARGEN, y a
 * cada categoría de ARCA dentro de una función de Roles Empresa.
 *
 * PARA QUÉ EXISTE. Una función ofrece hoy todas sus categorías sin distinguirlas: «Director de
 * Programas» propone 035283 ($2.122.135 bruto) y 035303 ($1.481.790), y nada dice cuál corresponde a
 * este proyecto. La valoración es lo que cruza las dos puntas — el margen del proyecto y la escala
 * de la categoría — para que el selector ofrezca sólo lo que corresponde.
 *
 * EL NIVEL LO DEFINE EL MARGEN, NO EL PRESUPUESTO. Un proyecto grande con margen flaco no puede
 * pagar las categorías más caras, y uno chico con buen margen sí: el volumen no dice nada sobre lo
 * que se puede pagar. El presupuesto se guarda igual en el proyecto, como contexto, pero no entra
 * en este cálculo.
 *
 * ES DEL TENANT, y ahí se aparta del resto de los catálogos simples (Bancos, Sindicatos, Obras
 * Sociales), que son globales porque son el nomenclador de ARCA: el organismo publica los mismos
 * códigos para todo el mundo. «Plata» y «Oro», con sus rangos de margen, son la política
 * comercial de ESTA productora. Compartirlos entre tenants significaría que cambiar un rango acá le
 * mueve los contratos a otra empresa.
 *
 * NO TOCA EL NOMENCLADOR. La valoración de una categoría no vive acá ni en `categorias`, sino en la
 * ASOCIACIÓN función ↔ categoría (`RoleFrame.data.categoriasSat[].valoracionId`): el mismo código de
 * ARCA puede ser Oro en una función y Plata en otra, porque lo que cambia es lo que la productora
 * paga por ese puesto, no la categoría del convenio.
 */
export interface IValoracion extends Document {
  tenantId: mongoose.Types.ObjectId;
  externalId: string;
  name: string;
  data: {
    id?: number;
    nombre?: string;
  };
  /**
   * La jerarquía, de menor a mayor (1 = la más baja). No es decorativo: es el orden en que
   * `resolverValoracion` recorre los rangos, así que dos valoraciones con el mismo `orden` dejan el
   * resultado a merced del orden de Mongo.
   */
  orden?: number | null;
  /**
   * El rango de MARGEN que le corresponde, en PORCENTAJE y SEMIABIERTO: `[margenDesde, margenHasta)`.
   *
   * Cerrarlo de los dos lados obliga a elegir de qué lado cae el borde exacto, y ese es justo el
   * número redondo que alguien va a cargar. Con el tope abierto, «hasta 20» y «desde 20» no se pisan
   * y un margen de 20 % cae en la segunda sin que haya que pensarlo.
   *
   * `null` es un extremo ABIERTO —«sin mínimo», «sin techo»—, distinto de 0, que es un margen válido
   * (y uno muy concreto: trabajar sin ganancia).
   *
   * Admite decimales: un margen de 12,5 % es un dato corriente.
   */
  margenDesde?: number | null;
  margenHasta?: number | null;
  /** Con qué color se la muestra en los chips. Vacío = la pantalla elige uno. */
  color?: string;
  /**
   * La que se usa cuando el margen no cae en ningún rango (o no hay margen cargado).
   *
   * Tiene que haber UNA sola: `resolverValoracion` devuelve «la» default, en singular, así que con
   * dos marcadas el resultado lo decidiría el orden de Mongo. La ruta apaga las demás al guardar.
   */
  esDefault?: boolean;
  /**
   * Si se ofrece en las altas nuevas. Mismo criterio que `esElegible` en categorías: una valoración
   * que se dejó de usar se apaga, no se borra — los proyectos y contratos que la tienen puesta
   * necesitan seguir resolviendo su nombre.
   */
  activo?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const valoracionSchema = new Schema<IValoracion>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    externalId: { type: String },
    name: { type: String, required: true },
    data: {
      id: { type: Number },
      nombre: { type: String },
    },
    orden: { type: Number, default: null },
    margenDesde: { type: Number, default: null },
    margenHasta: { type: Number, default: null },
    color: { type: String, default: "" },
    esDefault: { type: Boolean, default: false },
    // Ausente cuenta como activa: lo que se cargó antes de que existiera el campo no se apaga solo.
    activo: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "valoraciones",
  },
);

// El nombre identifica a la valoración dentro del tenant: dos «Oro» en la misma productora no son
// dos niveles, son un error de carga.
valoracionSchema.index({ tenantId: 1, name: 1 }, { unique: true });
// Por `orden` se recorren los rangos al resolver, y es el orden en que se listan.
valoracionSchema.index({ tenantId: 1, orden: 1 });

export const Valoracion: Model<IValoracion> = mongoose.model<IValoracion>("Valoracion", valoracionSchema);

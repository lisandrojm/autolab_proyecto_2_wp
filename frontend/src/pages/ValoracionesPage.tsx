import React from "react";
import { faRankingStar } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";
import { ChipValoracion } from "../components/proyectos/ChipValoracion";

const valoracionesApi = createSimpleCatalogApi("/valoraciones");

/**
 * Los metales de siempre, de menor a mayor. Plata y Oro son los hex que ya tienen cargados las
 * valoraciones existentes: si la paleta usara otros, abrir una para editarla no marcaría su color
 * como elegido. Platino va azulado a propósito: el platino real es casi igual a la plata, y dos
 * niveles que no se distinguen a simple vista no sirven como tag.
 */
const METALES = [
  { hex: "#cd7f32", label: "Bronce" },
  { hex: "#9ca3af", label: "Plata" },
  { hex: "#d4af37", label: "Oro" },
  { hex: "#8ea9c1", label: "Platino" },
];

/**
 * Valoraciones: el nivel comercial (Plata, Oro…) que cruza el MARGEN de un proyecto con la escala
 * de una categoría.
 *
 * Lo define el margen y no el presupuesto: un proyecto grande con margen flaco no puede pagar las
 * categorías caras, y uno chico con buen margen sí.
 *
 * Sin esto, una función ofrece todas sus categorías sin distinguirlas: «Director de Programas»
 * propone 035283 ($2.122.135 bruto) y 035303 ($1.481.790), y nada dice cuál corresponde a este
 * proyecto. Acá se definen los niveles y el rango de presupuesto de cada uno; la valoración de cada
 * categoría se carga en Roles Empresa, porque el mismo código de ARCA puede ser Oro en una función y
 * Plata en otra.
 *
 * ES DEL TENANT, a diferencia de los otros catálogos de esta sección: Bancos u Obras Sociales son el
 * nomenclador de ARCA, igual para todos, pero «Oro» con su rango de margen es la política comercial
 * de esta productora. Ver `server/src/models/Valoracion.ts`.
 *
 * NO tiene import de Excel ni carga masiva, y el server los rechaza con 405: la planilla no trae los
 * rangos —los campos numéricos no participan del import— así que entrarían valoraciones sin rango y
 * sin pasar por la validación de solapamiento, que es justo lo que hace que el filtro funcione.
 */
export const ValoracionesPage: React.FC = () => (
  <SimpleCatalogManager
    title="Valoraciones"
    subtitle="Niveles comerciales por margen. Definen qué categorías se ofrecen al armar un contrato."
    icon={faRankingStar}
    entityLabel="valoración"
    api={valoracionesApi}
    templateBaseName="valoraciones"
    // El id externo es del nomenclador de ARCA; esto es interno de la productora y no tiene uno.
    showExternalId={false}
    /*
      Sin plantilla ni import: el server los contesta con 405 (los campos numéricos no viajan en el
      Excel, así que entrarían valoraciones sin rango). Ofrecer los botones igual sería prometer algo
      que no se puede hacer y hacerlo descubrir con un error.
    */
    permiteImportExcel={false}
    extraFields={[
      {
        key: "orden",
        label: "Orden",
        type: "numero",
        showColumn: true,
        columnLabel: "Orden",
        placeholder: "1",
        ayuda: "La jerarquía, de menor a mayor: 1 es el nivel más bajo. Define en qué orden se evalúan los rangos.",
      },
      {
        key: "margenDesde",
        label: "Margen desde (%)",
        type: "numero",
        decimales: true,
        showColumn: true,
        columnLabel: "Desde %",
        placeholder: "Sin mínimo",
        ayuda: "Vacío = sin mínimo. El porcentaje exacto ENTRA en este nivel. Admite decimales (12,5).",
      },
      {
        key: "margenHasta",
        label: "Margen hasta (%)",
        type: "numero",
        decimales: true,
        showColumn: true,
        columnLabel: "Hasta %",
        placeholder: "Sin tope",
        /*
          El rango es semiabierto y conviene decirlo acá: es la única forma de que «hasta 20» y
          «desde 20» no se pisen, y de que nadie tenga que decidir de qué lado cae el número redondo
          que sí o sí alguien va a cargar.
        */
        ayuda: "Vacío = sin tope. El porcentaje exacto NO entra en este nivel: pasa al siguiente.",
      },
      {
        key: "color",
        label: "Color",
        type: "color",
        paleta: METALES,
        // El mismo tag que se ve en proyectos y al contratar: lo que se previsualiza es lo que sale.
        vistaPrevia: (color, nombre) => <ChipValoracion nombre={nombre.trim() || "Valoración"} color={color || undefined} />,
        showColumn: true,
        columnLabel: "Color",
        placeholder: "#d4af37",
        ayuda: "El color del tag del nivel en proyectos y al contratar. Vacío = gris neutro.",
      },
      {
        key: "esDefault",
        label: "Es la valoración por defecto",
        type: "estado",
        // No es «dada de baja»: es una marca exclusiva. Sin esto, todas las que NO son la default se
        // dibujaban en gris, como si no se ofrecieran.
        marcaInactivo: false,
        // Y arranca APAGADA: si viniera encendida, cada valoración nueva le robaría la default a la
        // que ya la tenía, sin que nadie lo pida.
        valorInicial: "false",
        options: [
          { value: "true", label: "Por defecto" },
          { value: "false", label: "No" },
        ],
        showColumn: true,
        columnLabel: "Por defecto",
        ayuda: "A dónde cae un proyecto cuyo margen no entra en ningún rango, o que todavía no tiene margen cargado. Sólo puede haber una: al marcarla, se apagan las demás.",
      },
      {
        key: "activo",
        label: "Activa",
        type: "estado",
        options: [
          { value: "true", label: "Activa" },
          { value: "false", label: "Inactiva" },
        ],
        showColumn: true,
        columnLabel: "Estado",
        filtrable: true,
        valorPorDefecto: "true",
        ayuda: "Una valoración inactiva no se ofrece en contratos nuevos, pero sigue resolviendo los proyectos y contratos que ya la tienen puesta. Es la alternativa a borrarla.",
      },
    ]}
  />
);

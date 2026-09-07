import React from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar } from "@fortawesome/free-solid-svg-icons";
import { useArcaDefaults } from "./DefaultArcaStar";
import { CampoDefaultArca } from "../../api/arcaDefaults";

/**
 * QUÉ DICE LA INSTALACIÓN PARA ESTE CAMPO, Y SI ESTA EMPLEADORA LO ESTÁ PISANDO.
 *
 * La cascada existía y funcionaba, pero era invisible: la ficha de una empleadora mostraba su ★ sin
 * decir en ningún lado que había un escalón debajo. Eso deja dos lecturas erróneas, las dos caras:
 *
 *   · Una empresa SIN marcar parecía «sin configurar», cuando en realidad hereda un valor que sí se
 *     va a usar. Se marcaba un default idéntico al global «por las dudas», y a partir de ahí ese
 *     valor dejaba de seguir a la instalación: cambiar el global ya no la alcanzaba.
 *   · Una empresa CON marca no avisaba que estaba tapando otra cosa. Cambiar el global no producía
 *     ningún efecto acá, y no había forma de saber por qué.
 *
 * Por eso el aviso NOMBRA el valor global en vez de solo mencionar que existe: sin verlo no se puede
 * decidir si hace falta pisarlo.
 */

/** Dónde se marca la ★ de la instalación de cada campo, para poder ir a verla. */
const RUTA_GLOBAL: Record<CampoDefaultArca, string> = {
  convenioId: "/convenios",
  sucursalId: "/arca/sucursales",
  grupoTipoServicio: "/arca/grupos-tipo-servicio",
  tipoServicio: "/arca/tipos-servicio",
  modalidadContratacion: "/arca/modalidades-contratacion",
  modalidadLiquidacion: "/arca/modalidades-liquidacion",
  obraSocial: "/obras-sociales",
  actividad: "/arca/actividades",
  fuenteParitariaId: "/arca/fuentes-paritaria",
};

interface Props {
  /** El campo de los defaults de la instalación con el que se compara. */
  campo: CampoDefaultArca;
  /** Lo que tiene marcado ESTA empleadora. `''` o `null` es «sin marcar». */
  valorEmpresa: string | null | undefined;
  /**
   * Cómo se muestra un valor del nomenclador. Lo resuelve la pantalla, que ya tiene su catálogo
   * cargado: acá no se vuelve a pedir, para no disparar un request por cada aviso.
   */
  nombreDe: (valor: string) => string;
  /**
   * Por qué el default de la instalación NO rige para esta empleadora, si es que no rige.
   *
   * Convenios y Domicilios son POR CUIT: el código de domicilio de una empleadora no existe para
   * otra, y ARCA solo acepta categorías de los convenios que ESE CUIT registró. La cascada del TXT
   * ya descarta el global en ese caso (ver `afipCompleteness.ts`), así que decir «rige el de la
   * instalación» sería falso: no rige, y el alta saldría sin el dato.
   */
  noAplica?: string;
}

export const HerenciaGlobal: React.FC<Props> = ({ campo, valorEmpresa, nombreDe, noAplica }) => {
  const { defaults } = useArcaDefaults();
  const global = String(defaults[campo] ?? "").trim();
  const empresa = String(valorEmpresa ?? "").trim();

  const link = (
    <Link to={RUTA_GLOBAL[campo]} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
      la instalación
    </Link>
  );
  const nombreGlobal = <strong className="font-semibold">{nombreDe(global) || global}</strong>;

  /*
    Cuatro combinaciones y cuatro mensajes. Decir «hereda de la instalación» cuando la instalación no
    tiene nada manda a buscar un valor que no existe: es el mismo error de vaguedad, al revés.
  */
  let texto: React.ReactNode;
  let pisa = false;
  if (!global && !empresa) {
    texto = <>Sin valor por defecto acá ni en {link}.</>;
  } else if (!global) {
    texto = <>{link} no tiene uno marcado: rige este.</>;
  } else if (noAplica) {
    // El global existe pero no alcanza a esta empleadora, así que acá no hay herencia ni hay nada
    // que pisar: lo único cierto es que sin marca propia el alta sale sin el dato.
    pisa = !empresa;
    texto = (
      <>
        {link} marcó {nombreGlobal}, pero acá no rige: {noAplica}
        {empresa ? "" : " Sin marcar uno propio, el alta sale sin este dato."}
      </>
    );
  } else if (!empresa) {
    texto = <>Sin marcar acá: rige el de {link}, {nombreGlobal}.</>;
  } else if (empresa === global) {
    texto = <>El mismo que {link}. Marcado acá deja de seguirla: si allá cambia, esta empleadora se queda con {nombreGlobal}.</>;
  } else {
    pisa = true;
    texto = <>Pisa el de {link}, que es {nombreGlobal}.</>;
  }

  return (
    <p className={`mt-1 flex items-start gap-1.5 text-[11px] ${pisa ? "text-amber-700 dark:text-amber-400" : "text-gray-500 dark:text-gray-400"}`}>
      <FontAwesomeIcon icon={faStar} className="h-2.5 w-2.5 mt-[3px] shrink-0" />
      <span>{texto}</span>
    </p>
  );
};

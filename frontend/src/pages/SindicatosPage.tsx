import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPeopleGroup, faEye } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi, SimpleCatalogItem } from "../api/simpleCatalog";

const sindicatosApi = createSimpleCatalogApi("/sindicatos");
const conveniosApi = createSimpleCatalogApi("/convenios");

/** Cuántos badges se muestran antes de resumir el resto en un "+N". */
const BADGES_VISIBLES = 3;

/**
 * Sindicatos: el catálogo de gremios a los que alguien puede estar AFILIADO.
 *
 * Es un catálogo propio y no una lectura de Convenios a propósito. Estar comprendido por un CCT
 * alcanza a todo el personal de la actividad; estar afiliado es voluntario y es lo que habilita el
 * descuento de la cuota sindical. Son dos preguntas distintas y una no se deduce de la otra.
 * Ver `server/src/models/Sindicato.ts`.
 */
export const SindicatosPage: React.FC = () => {
  // `?buscar=` deja este catálogo abierto con el gremio ya filtrado: es a donde llega el ojito de
  // la columna Sindicato en /convenios.
  const [paramsUrl] = useSearchParams();
  const busquedaInicial = paramsUrl.get("buscar") || "";
  /*
    LOS CONVENIOS DE CADA GREMIO.

    La relación vive del lado del convenio (`Convenio.sindicatoId`), así que para saber cuáles tiene
    un sindicato hay que mirarlos a ellos. Se piden una vez y se agrupan acá.

    El costo es real y conviene tenerlo escrito: son los 2.669 convenios (~841 KB) para pintar los
    badges de una tabla de 180 filas. Se banca porque es un solo pedido al entrar, en una pantalla de
    configuración que no se abre a cada rato. Si molesta, lo que lo arregla es un filtro de
    desigualdad en el server (`sindicatoId != null`) que hoy no existe: el filtro es por igualdad, y
    por eso tampoco se puede pedir "solo los que tienen gremio".
  */
  const [convenios, setConvenios] = useState<SimpleCatalogItem[]>([]);

  useEffect(() => {
    // Con su propio catch: sin los convenios la columna queda vacía, pero el ABM de sindicatos
    // —que es lo que esta pantalla administra— tiene que seguir funcionando igual.
    void conveniosApi
      .list()
      .then((c) => setConvenios(Array.isArray(c) ? c : []))
      .catch(() => setConvenios([]));
  }, []);

  /** sindicatoId → sus convenios, ya agrupados. Se recalcula solo cuando cambia la lista. */
  const porSindicato = useMemo(() => {
    const mapa = new Map<string, SimpleCatalogItem[]>();
    for (const c of convenios) {
      // El server lo devuelve poblado ({_id, name, sigla}); si viniera pelado, sirve igual.
      const ref = c.sindicatoId;
      const id = ref && typeof ref === "object" ? String((ref as { _id?: unknown })._id ?? "") : ref ? String(ref) : "";
      if (!id) continue;
      const lista = mapa.get(id);
      if (lista) lista.push(c);
      else mapa.set(id, [c]);
    }
    return mapa;
  }, [convenios]);

  const conveniosDe = (sindicatoId: string): SimpleCatalogItem[] => porSindicato.get(sindicatoId) || [];

  return (
    <SimpleCatalogManager
      title="Sindicatos"
      subtitle="Gremios a los que puede estar afiliada una persona. Cargá registros manualmente o importá un Excel."
      icon={faPeopleGroup}
      entityLabel="sindicato"
      api={sindicatosApi}
      templateBaseName="sindicatos"
      showExternalId={false}
      busquedaInicial={busquedaInicial}
      /*
        El mismo control de dos estados que Convenios, con los recuentos a la vista.

        `arrancaAcotado: false` y ahí se separa de Convenios: este catálogo se administra, no se
        consulta. Abrirlo mostrando los 2 que tienen convenio escondería los otros 178 justo cuando
        lo que se viene a hacer es cargarlos o asignarlos.

        No hace falta un tercer estado "sin convenios": "Ver todos" menos los del recuento acotado ya
        deja ver cuáles faltan, y son la enorme mayoría.
      */
      filtroDestacado={{
        etiqueta: "Sindicatos con convenios asociados",
        aplica: (s) => conveniosDe(s._id).length > 0,
        arrancaAcotado: false,
      }}
      extraFields={[
        {
          key: "sigla",
          label: "Sigla",
          type: "text",
          showColumn: true,
          columnLabel: "Sigla",
          placeholder: "Ej: SATSAID",
        },
      ]}
      /*
        SUS CONVENIOS: los códigos como badges, más un ojito que abre /convenios ya filtrado.

        Los badges dicen QUÉ convenios son sin salir de la pantalla —que es lo que un "Ver convenios"
        a secas no contestaba—, y el ojito queda para cuando hace falta operar sobre ellos: ahí está
        la tabla completa, con actividad, obra social, paritarias y edición.

        Se cortan en tres: un gremio grande puede firmar decenas, y una fila que crece hasta empujar
        a las demás fuera de la vista deja de servir como tabla.
      */
      columnasCalculadas={[
        {
          label: "Convenios",
          render: (item) => {
            const suyos = conveniosDe(item._id);
            if (suyos.length === 0) return <span className="text-gray-400 dark:text-gray-600">—</span>;
            const visibles = suyos.slice(0, BADGES_VISIBLES);
            const resto = suyos.length - visibles.length;
            return (
              <div className="flex items-center gap-1.5 flex-wrap">
                {visibles.map((c) => (
                  <span
                    key={c._id}
                    title={c.name}
                    className="inline-flex items-center px-2 py-0.5 rounded-full font-mono text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800"
                  >
                    {c.externalId || c.name}
                  </span>
                ))}
                {resto > 0 && <span className="text-[11px] text-gray-500 dark:text-gray-400">+{resto}</span>}
                <Link
                  to={`/convenios?sindicatoId=${item._id}`}
                  title={`Ver los ${suyos.length} convenio(s) de ${item.name}`}
                  aria-label={`Ver los convenios de ${item.name}`}
                  className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 ml-0.5"
                >
                  <FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5" />
                </Link>
              </div>
            );
          },
        },
      ]}
    />
  );
};

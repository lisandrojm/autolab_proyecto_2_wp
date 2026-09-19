import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faCheck, faTimes, faPiggyBank, faSpinner } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { agruparCentrosPorCodigo, etiquetaCentroCosto, GrupoCentroCosto, idCentroCosto, opcionesCentroCosto, SUFIJO_INHABILITADO } from "../../utils/centroCosto";
import { buscarCentrosCosto, centroCostoPorIdAuxiliar, centrosCostoPorCodigo, CentroCostoFila } from "../../api/centrosCosto";

/*
  ELEGIR EL CENTRO DE COSTO DE UN PROYECTO.

  Era un `<select>` nativo. Con 47 centros se podía; con los 806 de Tango es una lista de números
  —«405, 406, 407…»— por la que hay que scrollear a ojo, sin poder buscar y sin saber qué es cada uno:
  el código solo no dice nada si no te lo acordás de memoria.

  Acá se ve el CÓDIGO y su DESCRIPCIÓN juntos, y se busca por cualquiera de los dos: quien conoce el
  número escribe «682» y quien conoce el proyecto escribe «PEGSA».

  LA BÚSQUEDA LA HACE EL SERVER. Antes cada pantalla bajaba el catálogo entero —2.208 filas, más de un
  megabyte, nueve segundos— y filtraba en memoria; y lo bajaba también sólo para mostrar el centro que
  el proyecto YA tenía puesto. Ahora se piden veinte resultados por lo que se tipea, y el elegido se
  resuelve por su id. La pantalla de Proyectos dejó de esperar ese megabyte para abrir un formulario.

  UNA FILA POR CÓDIGO, con las empresas de Tango en badges. El catálogo trae el mismo código una vez
  por empresa, y repetido tres veces no daba nada para elegir: el centro es el mismo.

  LOS INHABILITADOS NO SE OFRECEN —Tango dice que no se usan más—, salvo el que el proyecto ya tiene
  puesto: sacarlo de la lista dejaría el campo vacío sobre un proyecto que sí tiene centro, y el
  próximo guardado se lo borraría sin que nadie lo pidiera. Ése aparece con «(inhabilitado)» al lado.
  La regla vive en `opcionesCentroCosto`, compartida.
*/

interface SelectorCentroCostoProps {
  /** El `idAuxiliar` elegido (lo que se guarda en `metadata.centroCostoId`). */
  valor?: number | null;
  /** De qué empresa de Tango es ese centro: sin esto el id es ambiguo (ver `opcionesCentroCosto`). */
  empresaTangoId?: number | null;
  /** Devuelve el par: el id y la empresa de Tango a la que pertenece. */
  onCambio: (id: number | undefined, empresaTangoId?: number) => void;
  /**
   * Opcional y en retirada: un catálogo ya cargado por la pantalla. Si viene, se usa para resolver el
   * valor elegido sin ir al server; si no, se resuelve pidiéndolo. Ninguna pantalla necesita cargarlo.
   */
  catalogo?: any[];
  /** Sin él, el campo ofrece «Quitar»: no todos los proyectos tienen centro. */
  required?: boolean;
  disabled?: boolean;
  /** Por encima del modal del formulario, que vive en z-50. */
  zIndex?: number;
}

/** Cuántas filas trae cada búsqueda. Son filas, no códigos: un mismo código ocupa una por empresa. */
const POR_BUSQUEDA = 50;

export const SelectorCentroCosto: React.FC<SelectorCentroCostoProps> = ({ valor, empresaTangoId, onCambio, catalogo, required, disabled, zIndex = 100 }) => {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<CentroCostoFila[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  /** Las filas del centro que el proyecto tiene puesto: una por empresa de Tango donde existe. */
  const [filasDelElegido, setFilasDelElegido] = useState<CentroCostoFila[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Descarta respuestas viejas: al tipear rápido, la lenta puede llegar después de la nueva. */
  const pedidoRef = useRef(0);

  /*
    EL CENTRO QUE YA ESTÁ ELEGIDO, resuelto aparte de la búsqueda.

    Es lo que se muestra en el campo cerrado, y casi nunca está entre los primeros resultados. Se
    resuelve por `idAuxiliar` —que es lo que guarda el proyecto— y después se piden todas las filas de
    ese código, que son las empresas donde existe: eso son los badges.
  */
  useEffect(() => {
    if (!valor) {
      setFilasDelElegido([]);
      return;
    }
    let cancelado = false;
    (async () => {
      const delCatalogo = (catalogo || []).filter((c) => idCentroCosto(c) === Number(valor));
      const base = delCatalogo.length > 0 ? (delCatalogo as CentroCostoFila[]) : await centroCostoPorIdAuxiliar(Number(valor), empresaTangoId ?? undefined).catch(() => [] as CentroCostoFila[]);
      if (cancelado) return;
      setFilasDelElegido(base);

      const codigo = etiquetaCentroCosto(base[0]);
      if (!codigo) return;
      const todas = await centrosCostoPorCodigo(codigo).catch(() => [] as CentroCostoFila[]);
      if (!cancelado && todas.length > 0) setFilasDelElegido(todas);
    })();
    return () => {
      cancelado = true;
    };
  }, [valor, empresaTangoId, catalogo]);

  // Al abrir: foco en el buscador —se abre para buscar, no para scrollear— y la lista limpia.
  useEffect(() => {
    if (!abierto) return;
    setBusqueda("");
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [abierto]);

  /*
    LA BÚSQUEDA, CON ESPERA: 300 ms desde la última tecla.

    Sin eso, «PEGSA» son cinco consultas de las que sirve una. Con el campo vacío se traen igual los
    primeros: abrir la ventana y ver una lista en blanco no dice si no hay nada o si hay que escribir.
  */
  useEffect(() => {
    if (!abierto) return;
    const q = busqueda.trim();
    const pedido = ++pedidoRef.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const filas = await buscarCentrosCosto(q, POR_BUSQUEDA);
        if (pedido !== pedidoRef.current) return; // llegó tarde: ya se tipeó otra cosa
        setResultados(filas);
        setError("");
      } catch {
        if (pedido === pedidoRef.current) setError("No se pudieron buscar los centros de costo. Probá de nuevo.");
      } finally {
        if (pedido === pedidoRef.current) setBuscando(false);
      }
    }, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [abierto, busqueda]);

  /*
    Las opciones son los resultados MÁS el elegido: si no, el centro que el proyecto tiene puesto no
    aparecería tildado hasta que alguien lo busque, y el campo se vería vacío.
  */
  const opciones = useMemo(() => opcionesCentroCosto([...resultados, ...filasDelElegido], valor), [resultados, filasDelElegido, valor]);
  const grupos = useMemo(() => agruparCentrosPorCodigo(opciones), [opciones]);

  /* La opción exacta es el par (empresa, id). Sin empresa guardada, la primera con ese id. */
  const elegida = (empresaTangoId ? opciones.find((o) => o.id === Number(valor) && o.empresaTangoId === Number(empresaTangoId)) : undefined) || opciones.find((o) => o.id === Number(valor));

  /*
    TODAS las empresas donde existe el código elegido, no sólo la de la fila que se eligió.

    El mismo número vive en varias empresas de Tango, y el campo tiene que decirlo: «662» a secas no
    aclara de qué empresa es, y mostrar una sola haría creer que es exclusivo de ésa.
  */
  const empresasDelElegido = useMemo(() => [...new Set(filasDelElegido.map((f) => String(f.empresaNombre || "").trim()).filter(Boolean))], [filasDelElegido]);

  const elegir = (id: number, empresa?: number) => {
    onCambio(id, empresa);
    setAbierto(false);
  };

  /*
    ELEGIR UN CÓDIGO GUARDA LA PRIMERA DE SUS FILAS —salvo que ya esté elegida otra de ese mismo
    código, y ahí se respeta la que está—.

    El proyecto guarda el par (empresa de Tango, id) porque el id solo es ambiguo, así que el grupo
    tiene que resolverse a UNA fila. Volver a tocar el código que ya estaba elegido no le cambia la
    empresa por debajo: sería reescribir un dato que nadie pidió tocar.
  */
  const elegirGrupo = (g: GrupoCentroCosto) => {
    const yaElegida = g.opciones.find((o) => o.id === Number(valor) && (!empresaTangoId || o.empresaTangoId === Number(empresaTangoId)));
    const o = yaElegida || g.opciones[0];
    elegir(o.id, o.empresaTangoId);
  };

  return (
    <>
      <button type="button" onClick={() => !disabled && setAbierto(true)} disabled={disabled} aria-haspopup="dialog" className="input-field flex w-full items-center justify-between gap-2 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60">
        {elegida ? (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono font-bold">{elegida.etiqueta}</span>
            {elegida.descripcion && <span className="min-w-0 truncate text-gray-500 dark:text-gray-400">{elegida.descripcion}</span>}
            {/* Las empresas a las que pertenece ese centro, en badges. */}
            {empresasDelElegido.map((e) => (
              <span key={e} className="whitespace-nowrap rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {e}
              </span>
            ))}
          </span>
        ) : valor ? (
          // Hay un centro guardado pero todavía no llegó su ficha: decirlo es mejor que parecer vacío.
          <span className="flex-1 text-gray-400 dark:text-gray-500">Buscando el centro de costo…</span>
        ) : (
          <span className="flex-1 text-gray-400 dark:text-gray-500">Seleccionar centro de costo...</span>
        )}
        <FontAwesomeIcon icon={faSearch} className="h-3 w-3 shrink-0 text-gray-400" />
      </button>

      <Modal
        isOpen={abierto}
        onClose={() => setAbierto(false)}
        title="Centro de costo"
        subtitle="Buscá por código, descripción o empresa. Los resultados salen del catálogo de Tango."
        size="lg"
        zIndex={zIndex}
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {/* Quitar sólo donde el campo no es obligatorio: si lo es, vaciarlo no es una opción. */}
            {!required && valor ? (
              <button
                type="button"
                onClick={() => {
                  onCambio(undefined, undefined);
                  setAbierto(false);
                }}
                className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
              >
                <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
                Quitar el centro de costo
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">
              Cerrar
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="relative">
            <FontAwesomeIcon icon={buscando ? faSpinner : faSearch} className={`pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 ${buscando ? "animate-spin" : ""}`} />
            <input
              ref={inputRef}
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="682, PEGSA, REELSHORT..."
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
          </div>

          {/* Cuántos se están mostrando, y que puede haber más: son los primeros, no todos. */}
          <p className="text-[11px] text-gray-500 dark:text-gray-400">{buscando ? "Buscando…" : grupos.length === 0 ? "" : `${grupos.length} ${grupos.length === 1 ? "centro" : "centros"}${resultados.length >= POR_BUSQUEDA ? " — afiná la búsqueda para ver otros" : ""}`}</p>

          {/*
            Alto fijo con scroll propio: la ventana no puede crecer con los resultados, porque el
            buscador quedaría fuera de la vista justo cuando hay muchos.
          */}
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            {error ? (
              <div className="p-6 text-center text-sm text-red-600 dark:text-red-400">{error}</div>
            ) : grupos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <FontAwesomeIcon icon={faPiggyBank} className="h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">{buscando ? "Buscando…" : busqueda.trim() ? `Ningún centro coincide con «${busqueda}».` : "No hay centros de costo cargados."}</p>
                {!buscando && busqueda.trim() && <p className="text-xs text-gray-400">Probá con el código («682») o con una palabra de la descripción.</p>}
              </div>
            ) : (
              grupos.map((g) => {
                const esLaElegida = !!elegida && g.etiqueta === elegida.etiqueta.replace(SUFIJO_INHABILITADO, "");
                return (
                  <button
                    key={g.etiqueta}
                    type="button"
                    onClick={() => elegirGrupo(g)}
                    // Cuando las empresas describen el mismo código distinto, las otras se leen acá: son una sola línea y no entran.
                    title={g.otrasDescripciones.length > 0 ? `También figura como: ${g.otrasDescripciones.join(" · ")}` : undefined}
                    className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-2.5 text-left last:border-0 dark:border-gray-700/60 ${esLaElegida ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-900/40"}`}
                  >
                    <span className="w-24 shrink-0 font-mono text-sm font-bold text-gray-900 dark:text-white">{g.etiqueta}</span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${g.inhabilitado ? "text-gray-400 line-through" : "text-gray-600 dark:text-gray-300"}`}>{g.descripcion || "—"}</span>
                    {/* Dado de baja en TODAS sus empresas: se ofrece igual porque es el que el proyecto tiene puesto. */}
                    {g.inhabilitado && <span className="shrink-0 text-[11px] italic text-gray-400">inhabilitado</span>}
                    {/* En qué empresas de Tango existe ese código: es lo que antes decía cada fila repetida. */}
                    <span className="flex shrink-0 flex-wrap justify-end gap-1">
                      {g.empresas.map((e) => (
                        <span key={e} className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          {e}
                        </span>
                      ))}
                    </span>
                    {esLaElegida && <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};

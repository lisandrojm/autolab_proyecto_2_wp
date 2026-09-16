import React, { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPiggyBank, faFileImport, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { Modal } from "../components/ui/Modal";
import { centrosCostoApi, importarCentrosCostoJson, type CentroCosto, type ResultadoImportCentrosCosto } from "../api/centrosCosto";
import { validarArchivoCentrosCosto, type ResumenArchivoCentrosCosto } from "../utils/centrosCostoImport";
import { sweetAlert } from "../utils/sweetAlert";
import { etiquetaCentroCosto } from "../utils/centroCosto";

/*
  CENTROS DE COSTOS: EL CATÁLOGO DE Tango.

  LA PANTALLA MUESTRA TRES COSAS: el CÓDIGO (`codAuxiliar`, «682» — el número real con el que se lo
  nombra), la descripción y si está habilitado. Nada de ids.

  Ni «ID Externo» ni el id del auxiliar de Tango: son el mismo número interno con dos nombres, no
  significan nada para quien mira la pantalla, y antes se pedían los dos —con el agregado de que el
  campo «Nombre» era en realidad el código—. El id de Tango sigue existiendo en el registro, porque es
  lo que cada proyecto guarda para apuntar a su centro, pero lo trae el import y no se edita a mano.

  El catálogo no se carga a mano: son 806 registros que se importan del JSON que exporta Tango (botón
  «Importar JSON»). El alta manual queda para el caso puntual —un centro nuevo que todavía no está en
  el export—, y por eso el formulario sigue existiendo.
*/

const HABILITADO_OPCIONES = [
  { value: "S", label: "Sí (S)" },
  { value: "N", label: "No (N)" },
];

/** Cómo se lee cada fila de la tabla. `S` es lo normal; `N` se marca porque no se puede elegir. */
const BadgeHabilitado: React.FC<{ valor?: string }> = ({ valor }) => {
  const inhabilitado = String(valor || "S").toUpperCase() === "N";
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold ${inhabilitado ? "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`} title={inhabilitado ? "Inhabilitado en Tango: no se ofrece para elegir en los proyectos" : "Habilitado"}>
      {inhabilitado ? "N" : "S"}
    </span>
  );
};

/*
  EL IMPORT DEL JSON DE Tango.

  Pasos, en este orden y a la vista: se elige el archivo, se valida ACÁ (las mismas reglas que el
  server), se muestra el resumen —cuántos, cuántos inhabilitados, los primeros cinco— y recién
  entonces se puede importar. En modo «Reemplazar todo» hay una confirmación que dice cuántos se
  borran y cuántos se crean, porque es exactamente lo que no se puede deshacer desde la pantalla.

  «Remapear proyectos» viene tildado: sin eso, los proyectos quedan apuntando a los ids viejos, que en
  la numeración nueva son OTROS centros. El reemplazo sin remapeo no es la mitad del trabajo, es el
  trabajo mal hecho.
*/
const ImportarJsonModal: React.FC<{ abierto: boolean; onCerrar: () => void; onListo: () => void }> = ({ abierto, onCerrar, onListo }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resumen, setResumen] = useState<ResumenArchivoCentrosCosto | null>(null);
  const [modo, setModo] = useState<"reemplazar" | "actualizar">("reemplazar");
  const [remapear, setRemapear] = useState(true);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoImportCentrosCosto | null>(null);

  const limpiar = () => {
    setArchivo(null);
    setResumen(null);
    setResultado(null);
    setImportando(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const elegir = async (f: File | null) => {
    setArchivo(f);
    setResumen(null);
    setResultado(null);
    if (!f) return;
    try {
      const texto = await f.text();
      setResumen(validarArchivoCentrosCosto(JSON.parse(texto)));
    } catch (e: any) {
      setResumen({ ok: false, items: [], errores: [`No se pudo leer el JSON: ${e?.message || "archivo inválido"}.`], total: 0, habilitados: 0, inhabilitados: 0 });
    }
  };

  const importar = async () => {
    if (!resumen?.ok) return;
    if (modo === "reemplazar") {
      const r = await sweetAlert.confirm(
        "¿Reemplazar todo el catálogo?",
        `Se borran TODOS los centros de costo que hay hoy y se crean los ${resumen.items.length} del archivo.${remapear ? " Los proyectos se actualizan para que sigan apuntando al mismo código." : " Los proyectos NO se actualizan: van a quedar apuntando a centros equivocados."}`,
        "Sí, reemplazar",
      );
      if (!r.isConfirmed) return;
    }
    setImportando(true);
    try {
      const res = await importarCentrosCostoJson({ modo, items: resumen.items, total: resumen.items.length, remapearProyectos: modo === "reemplazar" ? remapear : false });
      setResultado(res);
      onListo();
    } catch (e: any) {
      const data = e?.response?.data;
      sweetAlert.error("No se pudo importar", [data?.error || "Probá de nuevo en un momento.", ...(data?.errores || []).slice(0, 5)].join("\n"));
    } finally {
      setImportando(false);
    }
  };

  return (
    <Modal
      isOpen={abierto}
      onClose={() => {
        limpiar();
        onCerrar();
      }}
      title="Importar centros de costo (JSON de Tango)"
      subtitle="El archivo que exporta Tango con los auxiliares (iD_TIPO_AUXILIAR 1)."
      size="lg"
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <button
            className="btn-secondary"
            onClick={() => {
              limpiar();
              onCerrar();
            }}
            disabled={importando}
          >
            {resultado ? "Cerrar" : "Cancelar"}
          </button>
          {!resultado && (
            <button className="btn-primary" onClick={importar} disabled={!resumen?.ok || importando}>
              {importando ? "Importando..." : modo === "reemplazar" ? "Reemplazar catálogo" : "Actualizar catálogo"}
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {!resultado && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Archivo</label>
              <input ref={inputRef} type="file" accept=".json,application/json" onChange={(e) => void elegir(e.target.files?.[0] || null)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white" />
              {archivo && <p className="mt-1 text-[11px] text-gray-500">{archivo.name} · {Math.round(archivo.size / 1024)} KB</p>}
            </div>

            {resumen && (
              <div className={`rounded-lg border p-3 text-sm ${resumen.ok ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30"}`}>
                {resumen.ok ? (
                  <>
                    <p className="font-bold text-emerald-800 dark:text-emerald-300">
                      {resumen.total} centros de costo · {resumen.habilitados} habilitados · {resumen.inhabilitados} inhabilitados
                    </p>
                    <ul className="mt-2 space-y-0.5 text-[12px] text-emerald-900/80 dark:text-emerald-200/80">
                      {resumen.items.slice(0, 5).map((i) => (
                        <li key={i.idAuxiliar}>
                          <span className="font-mono font-bold">{i.codAuxiliar}</span> · {i.descAuxiliar}
                        </li>
                      ))}
                      {resumen.total > 5 && <li className="italic">…y {resumen.total - 5} más.</li>}
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="flex items-center gap-2 font-bold text-red-800 dark:text-red-300">
                      <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5" />
                      El archivo tiene {resumen.errores.length} {resumen.errores.length === 1 ? "error" : "errores"}: no se puede importar.
                    </p>
                    <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-[12px] text-red-900/80 dark:text-red-200/80">
                      {resumen.errores.slice(0, 20).map((e, i) => (
                        <li key={i}>· {e}</li>
                      ))}
                      {resumen.errores.length > 20 && <li className="italic">…y {resumen.errores.length - 20} más.</li>}
                    </ul>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cómo importar</label>
              {(
                [
                  { value: "reemplazar", titulo: "Reemplazar todo", texto: "Borra el catálogo actual y lo deja exactamente como el archivo. Es lo que corresponde cuando el archivo es el catálogo de Tango completo." },
                  { value: "actualizar", titulo: "Solo actualizar", texto: "Agrega los que faltan y corrige los que ya están, por ID de Tango. No borra nada." },
                ] as const
              ).map((o) => (
                <label key={o.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${modo === o.value ? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-950/30" : "border-gray-200 dark:border-gray-700"}`}>
                  <input type="radio" name="modo-import-cc" checked={modo === o.value} onChange={() => setModo(o.value)} className="mt-1" />
                  <span>
                    <span className="block text-sm font-bold text-gray-900 dark:text-white">{o.titulo}</span>
                    <span className="block text-[12px] text-gray-500 dark:text-gray-400">{o.texto}</span>
                  </span>
                </label>
              ))}
            </div>

            {modo === "reemplazar" && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <input type="checkbox" checked={remapear} onChange={(e) => setRemapear(e.target.checked)} className="mt-1" />
                <span>
                  <span className="block text-sm font-bold text-gray-900 dark:text-white">Remapear proyectos existentes</span>
                  <span className="block text-[12px] text-gray-500 dark:text-gray-400">
                    Corrige el centro de costo de cada proyecto cruzando por código, para que uno que decía «682» siga diciendo «682». Los que no tengan equivalente en Tango quedan como están y se informan al final. Destildarlo deja los proyectos apuntando a la numeración vieja.
                  </span>
                </span>
              </label>
            )}
          </>
        )}

        {resultado && (
          <div className="space-y-3">
            <p className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">{resultado.message}</p>
            <ul className="text-[13px] text-gray-600 dark:text-gray-300">
              <li>Borrados: {resultado.borrados}</li>
              <li>Creados: {resultado.creados}</li>
              <li>Actualizados: {resultado.actualizados}</li>
              {resultado.remapeados !== undefined && <li>Proyectos remapeados: {resultado.remapeados}</li>}
            </ul>
            {(resultado.sinEquivalente?.length || 0) > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">{resultado.sinEquivalente!.length} proyectos quedaron sin remapear</p>
                <p className="mt-0.5 text-[12px] text-amber-800/80 dark:text-amber-200/80">Su centro de costo no existe en Tango. Hay que elegirles uno a mano desde la ficha del proyecto.</p>
                <ul className="mt-2 space-y-0.5 text-[12px] text-amber-900/80 dark:text-amber-200/80">
                  {resultado.sinEquivalente!.map((p) => (
                    <li key={p.projectId}>· {p.nombre} (centro {p.centroCostoId})</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export const CentrosCostoPage: React.FC = () => {
  const [importAbierto, setImportAbierto] = useState(false);
  /** Se incrementa al terminar un import para que el manager vuelva a pedir la lista. */
  const [recarga, setRecarga] = useState(0);

  return (
    <>
      <SimpleCatalogManager
        key={recarga}
        title="Centros de Costos"
        subtitle="El catálogo de Tango. El código es el número real del centro; el catálogo completo se importa del JSON que exporta Tango."
        icon={faPiggyBank}
        entityLabel="centro de costo"
        api={centrosCostoApi}
        templateBaseName="centros_costo"
        helpKey="centrosCosto"
        /* El «nombre» de un centro es su CÓDIGO. Ver el comentario de arriba. */
        nombreLabel="Código"
        /*
          NINGÚN ID EN ESTA PANTALLA (ver el comentario de arriba): el registro tiene el id del auxiliar
          de Tango y `externalId` derivado, pero los dos son números internos que no le dicen nada a
          quien administra el catálogo. Los trae el import.
        */
        showExternalId={false}
        extraFields={[
          { key: "descAuxiliar", label: "Descripción", type: "text", placeholder: "682_PEGSA_FILMATIC_UNREAL_ON11E", ayuda: "Como figura en Tango. Suele empezar con el código." },
          { key: "habilitado", label: "Habilitado", type: "select", options: HABILITADO_OPCIONES, filtrable: true, valorPorDefecto: "S", ayuda: "Un centro inhabilitado no se ofrece para elegir en los proyectos (los que ya lo tienen lo conservan)." },
        ]}
        /*
          NI PLANTILLA NI IMPORTAR EXCEL: este catálogo se carga del JSON de Tango, completo.

          Eran dos botones para un camino que nadie va a usar —y que, ofrecido al lado del que sí
          corresponde, invita a cargar el catálogo por donde no es—. El «Importar JSON» ocupa ese
          lugar en el encabezado, que es donde se busca una acción de la pantalla.
        */
        permiteImportExcel={false}
        accionesEncabezado={
          <button onClick={() => setImportAbierto(true)} className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30">
            <FontAwesomeIcon icon={faFileImport} className="h-3.5 w-3.5" />
            Importar JSON
          </button>
        }
        tablaPropia={({ items, renderAcciones }) => (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-gray-50 dark:bg-gray-900/50">
                  <tr className="border-b border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    <th className="px-5 py-3">Código</th>
                    <th className="px-5 py-3">Descripción</th>
                    <th className="px-5 py-3 text-center">Habilitado</th>
                    <th className="px-5 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const cc = it as CentroCosto;
                    return (
                      <tr key={cc._id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-700/60 dark:hover:bg-gray-900/40">
                        {/* El código, en mono y negrita: es el dato con el que se nombra al centro. */}
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-sm font-bold text-gray-900 dark:text-white">{etiquetaCentroCosto(cc) || "—"}</td>
                        <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">{cc.descAuxiliar || <span className="text-gray-400">—</span>}</td>
                        <td className="px-5 py-3 text-center">
                          <BadgeHabilitado valor={cc.habilitado} />
                        </td>
                        <td className="px-5 py-3 text-right">{renderAcciones(it)}</td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-500">
                        No hay centros de costo cargados. Importá el JSON de Tango.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      />

      <ImportarJsonModal abierto={importAbierto} onCerrar={() => setImportAbierto(false)} onListo={() => setRecarga((n) => n + 1)} />
    </>
  );
};

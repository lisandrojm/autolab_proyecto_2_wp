import React, { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faCircleCheck, faCloudArrowUp, faDownload, faSpinner, faTriangleExclamation, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { ErrorFilaImport, RevisionPlanilla, ResultadoImport, solicitudesMasivasAPI } from "../../api/solicitudesMasivas";
import { sweetAlert } from "../../utils/sweetAlert";

/*
  CARGA MASIVA DE SOLICITUDES, EN TRES PASOS: bajar la planilla, subirla, revisar y crear.

  LA VISTA PREVIA NO ES UN ADORNO. Una planilla de cuarenta filas tiene errores —un CUIL de más, una
  categoría de otro convenio, un turno que no es de esa área— y descubrirlos DESPUÉS de crear
  cuarenta solicitudes significa borrarlas de a una. Acá se ve qué va a entrar y qué no antes de
  tocar nada, y las filas con problema se informan con su número de fila para corregirlas en el Excel.

  LAS FILAS CON ERROR NO FRENAN A LAS DEMÁS: se crean las que están bien y las otras se corrigen y se
  vuelven a subir. Rechazar la tanda entera por una fila es rehacer la planilla completa por un dedazo.
*/

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Se llama al terminar con algo creado: la pantalla recarga su listado. */
  onImportado: () => void;
}

/** Las filas con problemas, agrupadas por fila del Excel: una fila puede fallar en varios campos. */
const porFila = (errores: ErrorFilaImport[]): { fila: number; problemas: ErrorFilaImport[] }[] => {
  const mapa = new Map<number, ErrorFilaImport[]>();
  for (const e of errores) mapa.set(e.fila, [...(mapa.get(e.fila) || []), e]);
  return [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([fila, problemas]) => ({ fila, problemas }));
};

export const CargaMasivaModal: React.FC<Props> = ({ isOpen, onClose, onImportado }) => {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [revision, setRevision] = useState<RevisionPlanilla | null>(null);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [cargando, setCargando] = useState<"" | "plantilla" | "revisando" | "importando">("");
  const inputRef = useRef<HTMLInputElement>(null);

  const limpiar = () => {
    setArchivo(null);
    setRevision(null);
    setResultado(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const cerrar = () => {
    // Lo creado ya se avisó al confirmar: cerrar no vuelve a recargar ni pierde nada.
    limpiar();
    onClose();
  };

  const bajarPlantilla = async () => {
    setCargando("plantilla");
    try {
      await solicitudesMasivasAPI.descargarPlantilla();
    } catch (e: any) {
      sweetAlert.error("No se pudo bajar la plantilla", e?.response?.data?.error || "Probá de nuevo en un momento.");
    } finally {
      setCargando("");
    }
  };

  /** Al elegir el archivo se revisa solo: elegirlo y después tener que apretar «revisar» es un paso de más. */
  const elegirArchivo = async (file: File | null) => {
    setArchivo(file);
    setRevision(null);
    setResultado(null);
    if (!file) return;
    setCargando("revisando");
    try {
      setRevision(await solicitudesMasivasAPI.previsualizar(file));
    } catch (e: any) {
      sweetAlert.error("No se pudo leer la planilla", e?.response?.data?.error || "Revisá que sea el archivo de la plantilla.");
      limpiar();
    } finally {
      setCargando("");
    }
  };

  const importar = async () => {
    if (!archivo || !revision || revision.listas.length === 0) return;
    setCargando("importando");
    try {
      const r = await solicitudesMasivasAPI.importar(archivo);
      setResultado(r);
      if (r.creadas > 0) onImportado();
    } catch (e: any) {
      sweetAlert.error("No se pudo importar", e?.response?.data?.error || "Probá de nuevo en un momento.");
    } finally {
      setCargando("");
    }
  };

  const conError = revision ? porFila(revision.errores) : [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={cerrar}
      title="Carga masiva de solicitudes"
      subtitle="Una fila por persona: cada una entra como una solicitud pendiente de aprobación"
      size="lg"
      zIndex={95}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <button type="button" onClick={bajarPlantilla} disabled={cargando !== ""} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400">
            <FontAwesomeIcon icon={cargando === "plantilla" ? faSpinner : faDownload} className={`h-3.5 w-3.5 ${cargando === "plantilla" ? "animate-spin" : ""}`} />
            Descargar plantilla
          </button>
          <div className="flex items-center gap-3">
            <button type="button" onClick={cerrar} className="btn-secondary">
              {resultado ? "Cerrar" : "Cancelar"}
            </button>
            {!resultado && (
              <button type="button" onClick={importar} disabled={!revision || revision.listas.length === 0 || cargando !== ""} className="btn-primary disabled:cursor-not-allowed disabled:opacity-50">
                {cargando === "importando" ? (
                  <>
                    <FontAwesomeIcon icon={faSpinner} className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Creando…
                  </>
                ) : (
                  `Crear ${revision?.listas.length || 0} solicitud${revision?.listas.length === 1 ? "" : "es"}`
                )}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* YA ESTÁ HECHO: qué entró, qué se creó de paso y qué quedó sin importar. */}
        {resultado ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
              <FontAwesomeIcon icon={faCircleCheck} className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-sm font-bold text-green-800 dark:text-green-300">
                  {resultado.creadas} solicitud{resultado.creadas === 1 ? "" : "es"} creada{resultado.creadas === 1 ? "" : "s"}, pendiente{resultado.creadas === 1 ? "" : "s"} de aprobación
                </p>
                {resultado.personasCreadas > 0 && (
                  <p className="mt-1 text-xs text-green-700 dark:text-green-400">
                    Se crearon {resultado.personasCreadas} ficha{resultado.personasCreadas === 1 ? "" : "s"} de personas que no estaban en la plataforma.
                  </p>
                )}
              </div>
            </div>
            {resultado.errores.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">Filas que no entraron</p>
                <ListaDeErrores filas={porFila(resultado.errores)} />
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Corregilas en la misma planilla y volvé a subirla: las que ya entraron no se duplican porque no van a estar en el archivo corregido.</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 1. LA PLANILLA. Se explica antes de pedir el archivo: bajarla es el primer paso. */}
            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Bajá la plantilla (abajo a la izquierda): viene con los <strong>proyectos, áreas, turnos, roles, tipos de contrato, convenios y categorías de esta cuenta</strong> como desplegables, y una hoja «Catálogos» con todos los valores.
              </p>
              <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                Funciona en Excel, LibreOffice y Google Sheets. Las combinaciones —que el turno sea de esa área en ese proyecto, que la categoría sea del convenio— se revisan acá al subirla, así que se pueden completar en cualquiera de los tres.
              </p>
            </div>

            {/* 2. EL ARCHIVO. */}
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 p-6 text-center transition-colors hover:border-blue-400 dark:border-gray-600 dark:hover:border-blue-500">
              <FontAwesomeIcon icon={cargando === "revisando" ? faSpinner : faCloudArrowUp} className={`h-6 w-6 text-gray-400 ${cargando === "revisando" ? "animate-spin" : ""}`} />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{archivo ? archivo.name : "Elegí la planilla completada"}</span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400">{cargando === "revisando" ? "Revisando fila por fila…" : ".xlsx hasta 5 MB"}</span>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => elegirArchivo(e.target.files?.[0] || null)} />
            </label>

            {/* 3. QUÉ VA A PASAR. */}
            {revision && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />
                    {revision.listas.length} lista{revision.listas.length === 1 ? "" : "s"} para crear
                  </span>
                  {conError.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                      {conError.length} fila{conError.length === 1 ? "" : "s"} con problemas
                    </span>
                  )}
                  <span className="text-gray-500 dark:text-gray-400">de {revision.total} en la planilla</span>
                </div>

                {revision.listas.length > 0 && (
                  <div className="max-h-[32vh] overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500 dark:bg-gray-900/60 dark:text-gray-400">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Fila</th>
                          <th className="px-3 py-2 font-semibold">Persona</th>
                          <th className="px-3 py-2 font-semibold">Proyecto · Área / Turno</th>
                          <th className="px-3 py-2 font-semibold">Contrato</th>
                          <th className="px-3 py-2 font-semibold">Período</th>
                        </tr>
                      </thead>
                      <tbody>
                        {revision.listas.map((f) => (
                          <tr key={f.fila} className="border-t border-gray-100 dark:border-gray-700/60">
                            <td className="px-3 py-2 text-gray-400">{f.fila}</td>
                            <td className="px-3 py-2">
                              <span className="font-semibold text-gray-900 dark:text-white">{f.resumen.nombre}</span>
                              <span className="block text-[11px] text-gray-500 dark:text-gray-400">{f.resumen.cuil}</span>
                              {/* Que la ficha no exista no es un error, pero hay que verlo antes de crearla. */}
                              {f.resumen.personaNueva && (
                                <span className="mt-1 inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                  <FontAwesomeIcon icon={faUserPlus} className="h-2.5 w-2.5" />
                                  Se crea la ficha
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                              {f.resumen.proyecto}
                              <span className="block text-[11px] text-gray-500 dark:text-gray-400">{f.resumen.areaTurno}</span>
                            </td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{f.resumen.contrato}</td>
                            <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300">
                              {f.resumen.desde} → {f.resumen.hasta || "Indef."}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {conError.length > 0 && <ListaDeErrores filas={conError} />}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};

/** Las filas con problemas: el número de fila del Excel primero, que es por donde se corrige. */
const ListaDeErrores: React.FC<{ filas: { fila: number; problemas: ErrorFilaImport[] }[] }> = ({ filas }) => (
  <div className="max-h-[28vh] space-y-2 overflow-y-auto rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20">
    {filas.map(({ fila, problemas }) => (
      <div key={fila} className="text-xs">
        <p className="font-bold text-amber-800 dark:text-amber-300">Fila {fila}</p>
        <ul className="ml-3 mt-0.5 space-y-0.5">
          {problemas.map((p, i) => (
            <li key={i} className="text-amber-700 dark:text-amber-400">
              <span className="font-semibold">{p.campo}:</span> {p.motivo}
            </li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

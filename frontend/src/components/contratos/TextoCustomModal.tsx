import React, { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faFloppyDisk, faFileSignature, faSpinner, faTrash } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { RichTextEditor, RichTextViewer } from "../ui/RichTextEditor";
import { sweetAlert } from "../../utils/sweetAlert";
import { textoCustomUsable } from "@compartido/textoCustom";

/*
  EL TEXTO DE UN CONTRATO CUSTOM O UN RELEASE CUSTOM, en Firma digital (ver `@compartido/textoCustom`).

  La plantilla custom sólo tiene un placeholder: el cuerpo se escribe acá, para este trámite, con las
  mismas {{variables}} que cualquier plantilla. Arranca del texto que el trámite ya tenga guardado o,
  si no tiene, del placeholder.

  - «Guardar borrador» guarda el texto en el trámite y no genera nada.
  - «Vista previa» arma el PDF con los datos REALES de la persona y el texto del editor, sin guardarlo.
  - «Guardar y generar» guarda y genera el PDF (o lo regenera, si ya estaba generado).

  Con el trámite ya enviado a firmar se abre en solo lectura: lo que se envió no se cambia.
*/
export const TextoCustomModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  titulo: string;
  subtitulo?: string;
  /** Lo que el trámite ya tiene guardado (o vacío). */
  textoGuardado: string;
  placeholder: string;
  variables: React.ComponentProps<typeof RichTextEditor>["variables"];
  soloLectura?: boolean;
  /** Rótulo del botón principal: «Guardar y generar», «Guardar y regenerar»… */
  rotuloGenerar: string;
  /** Si no se puede generar todavía (falta elegir la empresa, por ejemplo), por qué. Se puede guardar igual. */
  motivoSinGenerar?: string;
  onGuardar: (texto: string) => Promise<void>;
  onVistaPrevia: (texto: string) => Promise<Blob>;
  onGenerar: (texto: string) => Promise<void>;
  /**
   * Con el PDF ya generado no se ofrece «Guardar borrador»: quedaría un PDF que no dice lo que dice el
   * texto. Se guarda regenerando.
   */
  permitirBorrador?: boolean;
  /** Release custom: sacarlo de este trámite (borra el texto y, si estaba generado, regenera sin él). */
  onQuitar?: () => Promise<void>;
}> = ({ isOpen, onClose, titulo, subtitulo, textoGuardado, placeholder, variables, soloLectura = false, rotuloGenerar, motivoSinGenerar, onGuardar, onVistaPrevia, onGenerar, permitirBorrador = true, onQuitar }) => {
  const [texto, setTexto] = useState("");
  const [trabajando, setTrabajando] = useState<null | "guardar" | "preview" | "generar" | "quitar">(null);

  useEffect(() => {
    if (isOpen) setTexto(textoGuardado || placeholder);
  }, [isOpen, textoGuardado, placeholder]);

  const usable = textoCustomUsable(texto);
  const sinCambios = texto === (textoGuardado || placeholder);
  const motivoNoUsable = usable ? "" : "Escribí el texto del documento: vacío o con el texto de ejemplo no se puede generar.";

  const errorDe = (e: any, porDefecto: string) => e?.response?.data?.error || porDefecto;

  const guardar = async () => {
    setTrabajando("guardar");
    try {
      await onGuardar(texto);
      sweetAlert.success("Borrador guardado", "El texto quedó guardado en este trámite. Todavía no se generó el PDF.");
      onClose();
    } catch (e: any) {
      sweetAlert.error("No se pudo guardar", errorDe(e, "No se pudo guardar el texto."));
    } finally {
      setTrabajando(null);
    }
  };

  const vistaPrevia = async () => {
    setTrabajando("preview");
    try {
      const blob = await onVistaPrevia(texto);
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (e: any) {
      sweetAlert.error("No se pudo armar la vista previa", errorDe(e, "No se pudo armar la vista previa."));
    } finally {
      setTrabajando(null);
    }
  };

  const generar = async () => {
    setTrabajando("generar");
    try {
      await onGenerar(texto);
      onClose();
    } catch (e: any) {
      sweetAlert.error("No se pudo generar", errorDe(e, "No se pudo generar el documento."));
    } finally {
      setTrabajando(null);
    }
  };

  const quitar = async () => {
    if (!onQuitar) return;
    const confirm = await sweetAlert.confirm("Quitar de este trámite", "Se borra el texto escrito y este documento deja de ir a firma en este trámite. Si ya estaba generado, se regeneran los demás.", "Sí, quitar", "Cancelar");
    if (!confirm.isConfirmed) return;
    setTrabajando("quitar");
    try {
      await onQuitar();
      onClose();
    } catch (e: any) {
      sweetAlert.error("No se pudo quitar", errorDe(e, "No se pudo quitar el documento."));
    } finally {
      setTrabajando(null);
    }
  };

  const boton = "inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const secundario = `${boton} text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700`;
  const icono = (que: typeof trabajando, base: typeof faEye) => <FontAwesomeIcon icon={trabajando === que ? faSpinner : base} spin={trabajando === que} className="h-4 w-4" />;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !trabajando && onClose()}
      title={titulo}
      subtitle={subtitulo}
      size="xl"
      zIndex={80}
      footer={
        soloLectura ? (
          <div className="flex justify-end w-full">
            <button type="button" onClick={onClose} className={secundario}>
              Cerrar
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap justify-between gap-2 w-full">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={vistaPrevia} disabled={!!trabajando || !usable} title={motivoNoUsable || "Ver el PDF con los datos de la persona, sin guardar"} className={secundario}>
                {icono("preview", faEye)}
                Vista previa
              </button>
              {onQuitar && (
                <button type="button" onClick={quitar} disabled={!!trabajando} className={`${boton} text-red-600 border border-red-200 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20`}>
                  {icono("quitar", faTrash)}
                  Quitar de este trámite
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {permitirBorrador && (
                <button type="button" onClick={guardar} disabled={!!trabajando || sinCambios} title={sinCambios ? "No hay cambios para guardar" : "Guardar el texto sin generar el PDF"} className={secundario}>
                  {icono("guardar", faFloppyDisk)}
                  Guardar borrador
                </button>
              )}
              <button type="button" onClick={generar} disabled={!!trabajando || !usable || !!motivoSinGenerar} title={motivoNoUsable || motivoSinGenerar || ""} className={`${boton} text-white bg-blue-600 hover:bg-blue-700`}>
                {icono("generar", faFileSignature)}
                {rotuloGenerar}
              </button>
            </div>
          </div>
        )
      }
    >
      {soloLectura ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">Este trámite ya se envió a firmar: el texto queda como se envió.</p>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-4 py-3">
            <RichTextViewer html={textoGuardado || placeholder} />
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            El texto vale sólo para este trámite y no cambia la plantilla. Las variables se reemplazan con los datos de la persona y de la empresa; el membrete y la firma salen de la plantilla.
          </p>
          <RichTextEditor value={texto} onChange={setTexto} variables={variables} variablesTitle="Variables" minHeight="320px" />
          {!usable && <p className="text-xs text-amber-600 dark:text-amber-400">{motivoNoUsable}</p>}
          {usable && motivoSinGenerar && <p className="text-xs text-amber-600 dark:text-amber-400">{motivoSinGenerar}</p>}
        </div>
      )}
    </Modal>
  );
};

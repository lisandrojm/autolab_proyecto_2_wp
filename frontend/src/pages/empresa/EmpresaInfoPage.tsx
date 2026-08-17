import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle, faPenToSquare } from '@fortawesome/free-solid-svg-icons';
import { EmpresaContextLayout } from '../../components/empresa/EmpresaContextLayout';
import { Company } from '../../api/companies';
import { empresaAssetUrl } from '../../utils/empresaAssets';
import { EstadoArcaBadge, ArcaRequisitosModal } from '../../components/empresas/ArcaEstado';

/**
 * "Información" del contexto Empresa: los datos propios de la empleadora (razón social, CUIT,
 * domicilio legal, firmante, membrete) y un tablero de qué le falta configurar para ARCA.
 *
 * El tablero es la respuesta al "Faltan N datos" que hoy se descubre abriendo un modal por contrato:
 * la configuración es de la EMPLEADORA y alcanza a todos sus contratos de una vez.
 */
const Dato: React.FC<{ label: string; valor?: string | null; mono?: boolean }> = ({ label, valor, mono }) => (
  <div>
    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{label}</label>
    <div className={`text-sm ${valor ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 italic'} ${mono ? 'font-mono' : ''}`}>{valor || 'sin cargar'}</div>
  </div>
);

/**
 * Una sección DENTRO del recuadro único de datos.
 *
 * Antes cada una era su propia tarjeta con borde: cinco recuadros para cinco pares de campos hacían
 * que la ficha se leyera como cinco cosas separadas y ocupaban una pantalla entera de aire. Son
 * todos el mismo dato —quién es esta empleadora—, así que van en un solo recuadro y lo único que
 * los separa es una línea.
 */
const Bloque: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div className="px-5 py-4">
    <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">{titulo}</h3>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
  </div>
);

/**
 * Logo o firma del membrete, sobre fondo claro.
 *
 * El fondo importa: son PNG con transparencia pensados para un documento en blanco, así que en el
 * tema oscuro un logo negro sobre el panel oscuro se ve como si no hubiera imagen.
 */
const Imagen: React.FC<{ label: string; url?: string }> = ({ label, url }) => (
  <div>
    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">{label}</label>
    {url ? (
      <div className="h-14 min-w-[7rem] px-3 rounded-lg bg-white border border-gray-200 dark:border-gray-600 flex items-center justify-center overflow-hidden">
        <img src={empresaAssetUrl(url)} alt={label} className="max-h-10 max-w-[10rem] object-contain" />
      </div>
    ) : (
      <span className="text-sm text-gray-400 italic">sin cargar</span>
    )}
  </div>
);

export const EmpresaInfoPage: React.FC = () => (
  <EmpresaContextLayout titulo="Información" icono={faInfoCircle} ayuda="empresaFicha" acciones={<Link to="/empresas" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"><FontAwesomeIcon icon={faPenToSquare} className="h-4 w-4" />Editar en el ABM</Link>}>
    {(empresa) => <InfoBody empresa={empresa} />}
  </EmpresaContextLayout>
);

const InfoBody: React.FC<{ empresa: Company }> = ({ empresa }) => {
  const domicilio = [empresa.domicilioCalle, empresa.domicilioNumero, empresa.domicilioPisoDepto].filter(Boolean).join(' ');
  const localidad = [empresa.localidad, empresa.provincia, empresa.codigoPostal].filter(Boolean).join(', ');
  const [verArca, setVerArca] = useState(false);

  return (
    <div className="space-y-6">
      {verArca && <ArcaRequisitosModal empresa={empresa} onClose={() => setVerArca(false)} />}

      {/* UN solo recuadro para toda la ficha, con las secciones separadas por una línea. */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700/60">
        {/* ARCA es la primera sección y no un cartel suelto arriba: si puede dar altas es un dato de
            esta empleadora como el CUIT o el domicilio, y flotando afuera se leía como una alerta del
            sistema. Va primero porque es lo único de la ficha que puede estar mal. */}
        <div className="px-5 py-4">
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">ARCA</h3>
          <EstadoArcaBadge empresa={empresa} onClick={() => setVerArca(true)} tamano="md" />
        </div>

        <Bloque titulo="Identificación">
          <Dato label="Razón social" valor={empresa.razonSocial} />
          <Dato label="CUIT" valor={empresa.cuit} mono />
        </Bloque>

        <Bloque titulo="Domicilio legal">
          <Dato label="Calle y número" valor={domicilio} />
          <Dato label="Localidad / Provincia / CP" valor={localidad} />
        </Bloque>

        <Bloque titulo="Firmante">
          <Dato label="Nombre" valor={empresa.firmanteNombre} />
          <Dato label="DNI" valor={empresa.firmanteDni} mono />
          <Dato label="Cargo" valor={empresa.firmanteCargo} />
        </Bloque>

        <Bloque titulo="Representante legal">
          <Dato label="Nombre" valor={empresa.representanteLegalNombre} />
          <Dato label="Email" valor={empresa.representanteLegalEmail} />
        </Bloque>

        <div className="px-5 py-4">
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Membrete</h3>
          <div className="flex items-end gap-6 flex-wrap">
            {/* `logoUrl` guarda el path relativo que devuelve la subida a `/client-assets/...`: hay que
                resolverlo contra la API. Usarlo crudo en el `src` es lo que rompía la imagen. */}
            <Imagen label="Logo" url={empresa.logoUrl} />
            <Imagen label="Firma" url={empresa.signatureUrl} />
            {/* Mismo botón que "Editar en el ABM": las dos cosas son lo mismo —salir de la ficha a la
                pantalla donde ese dato se edita—, así que se ven igual. Como link de texto se leía
                como una nota al pie y no como la acción que es. */}
            <Link to="/empresas-membretes" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <FontAwesomeIcon icon={faPenToSquare} className="h-4 w-4" />
              Editar membrete y firma
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle, faPenToSquare, faTriangleExclamation, faCheck } from '@fortawesome/free-solid-svg-icons';
import { EmpresaContextLayout } from '../../components/empresa/EmpresaContextLayout';
import { Company } from '../../api/companies';
import { empresaAssetUrl } from '../../utils/empresaAssets';

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

const Bloque: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
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

/** Un requisito de ARCA para esta empleadora: si está, y a dónde se resuelve si no. */
const Requisito: React.FC<{ ok: boolean; titulo: string; detalle: string; to: string }> = ({ ok, titulo, detalle, to }) => (
  <Link to={to} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-colors ${ok ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-950/40'}`}>
    <FontAwesomeIcon icon={ok ? faCheck : faTriangleExclamation} className={`h-4 w-4 mt-0.5 shrink-0 ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
    <div className="min-w-0">
      <p className={`text-sm font-semibold ${ok ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'}`}>{titulo}</p>
      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{detalle}</p>
    </div>
  </Link>
);

export const EmpresaInfoPage: React.FC = () => (
  <EmpresaContextLayout titulo="Información" icono={faInfoCircle} acciones={<Link to="/empresas" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"><FontAwesomeIcon icon={faPenToSquare} className="h-4 w-4" />Editar en el ABM</Link>}>
    {(empresa) => <InfoBody empresa={empresa} />}
  </EmpresaContextLayout>
);

const InfoBody: React.FC<{ empresa: Company }> = ({ empresa }) => {
  const base = `/empresas/${empresa._id}`;
  const domicilio = [empresa.domicilioCalle, empresa.domicilioNumero, empresa.domicilioPisoDepto].filter(Boolean).join(' ');
  const localidad = [empresa.localidad, empresa.provincia, empresa.codigoPostal].filter(Boolean).join(', ');

  const obrasSociales = empresa.obrasSocialesIds?.length || 0;
  const convenios = empresa.convenioIds?.length || 0;
  const domicilios = empresa.sucursalIds?.length || 0;
  const tieneDefault = (empresa.obraSocialDefaultId ?? empresa.obraSocialId) != null;

  return (
    <div className="space-y-6">
      {/* Qué le falta a ESTA empleadora para poder dar altas. Cada ítem se resuelve una vez y vale
          para todos sus contratos: es lo contrario a descubrirlo contrato por contrato. */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Listo para dar altas en ARCA</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Requisito ok={obrasSociales > 0} to={`${base}/arca/obras-sociales`} titulo={obrasSociales > 0 ? `${obrasSociales} obra(s) social(es) registrada(s)` : 'Sin obras sociales registradas'} detalle={obrasSociales > 0 ? (tieneDefault ? 'Con una marcada por defecto.' : 'Ninguna marcada por defecto: las personas sin obra social propia van a usar la global del catálogo.') : 'ARCA solo acepta altas con una obra social registrada para este CUIT.'} />
          <Requisito ok={convenios > 0} to={`${base}/arca/convenios`} titulo={convenios > 0 ? `${convenios} convenio(s) registrado(s)` : 'Sin convenios registrados'} detalle={convenios > 0 ? 'Definen qué categorías se le pueden dar de alta.' : 'Sin convenio no hay categorías posibles: el alta no se puede generar.'} />
          <Requisito ok={domicilios > 0} to={`${base}/arca/domicilios`} titulo={domicilios > 0 ? `${domicilios} domicilio(s) de explotación` : 'Sin domicilios de explotación'} detalle={domicilios > 0 ? 'Con sus actividades declaradas.' : 'El alta declara un domicilio y una de sus actividades.'} />
          <Requisito ok={!!empresa.cuit} to="/empresas" titulo={empresa.cuit ? `CUIT ${empresa.cuit}` : 'Sin CUIT'} detalle={empresa.cuit ? 'Es el CUIT con el que se sube el TXT.' : 'Sin CUIT no se sabe con qué sesión de ARCA se presenta el archivo.'} />
        </div>
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

      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
        <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Membrete</h3>
        <div className="flex items-end gap-6 flex-wrap">
          {/* `logoUrl` guarda el path relativo que devuelve la subida a `/client-assets/...`: hay que
              resolverlo contra la API. Usarlo crudo en el `src` es lo que rompía la imagen. */}
          <Imagen label="Logo" url={empresa.logoUrl} />
          <Imagen label="Firma" url={empresa.signatureUrl} />
          <Link to="/empresas-membretes" className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline pb-1">
            {empresa.logoUrl || empresa.signatureUrl ? 'Cambiar membrete y firma' : 'Cargar membrete y firma'}
          </Link>
        </div>
      </div>
    </div>
  );
};

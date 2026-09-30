import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { ConvenioSelector } from './ConvenioSelector';
import { ObraSocialSelector } from './ObraSocialSelector';
import { SucursalSelector } from './SucursalSelector';
import { companiesAPI, Company, CompanyInput } from '../../api/companies';
import { createSimpleCatalogApi, SimpleCatalogItem } from '../../api/simpleCatalog';
import { arcaSucursalesAPI, ArcaSucursal } from '../../api/arcaSucursales';
import { sweetAlert } from '../../utils/sweetAlert';

const conveniosApi = createSimpleCatalogApi('/convenios');
const obrasSocialesApi = createSimpleCatalogApi('/obras-sociales');

export const EMPTY_COMPANY_FORM: CompanyInput = {
  razonSocial: '',
  cuit: '',
  domicilioCalle: '',
  domicilioNumero: '',
  domicilioPisoDepto: '',
  localidad: '',
  provincia: '',
  codigoPostal: '',
  firmanteNombre: '',
  firmanteDni: '',
  firmanteCargo: '',
  firmanteEmail: '',
  representanteLegalNombre: '',
  representanteLegalEmail: '',
  convenioIds: [],
  sucursalIds: [],
  obrasSocialesIds: [],
};

/** Los datos de una empresa, en la forma que espera el formulario. */
export const companyAForm = (c: Company): CompanyInput => ({
  razonSocial: c.razonSocial || '',
  cuit: c.cuit || '',
  domicilioCalle: c.domicilioCalle || '',
  domicilioNumero: c.domicilioNumero || '',
  domicilioPisoDepto: c.domicilioPisoDepto || '',
  localidad: c.localidad || '',
  provincia: c.provincia || '',
  codigoPostal: c.codigoPostal || '',
  firmanteNombre: c.firmanteNombre || '',
  firmanteDni: c.firmanteDni || '',
  firmanteCargo: c.firmanteCargo || '',
  firmanteEmail: c.firmanteEmail || '',
  representanteLegalNombre: c.representanteLegalNombre || '',
  representanteLegalEmail: c.representanteLegalEmail || '',
  convenioIds: (c.convenioIds || []).map((x) => String(x)),
  sucursalIds: (c.sucursalIds || []).map((x) => String(x)),
  obrasSocialesIds: (c.obrasSocialesIds || []).map((x) => String(x)),
});

/**
 * El formulario de alta y edición de una empresa.
 *
 * Vivía dentro de `EmpresasPage`, con su estado local. Se extrajo para que la FICHA de empresa
 * —contexto empresa → Información— edite exactamente lo mismo en vez de mandar al ABM: eran los
 * mismos datos, y salir de la ficha para tocarlos obligaba a volver a entrar.
 *
 * Los catálogos (convenios, obras sociales, sucursales) se cargan acá adentro y una sola vez por
 * apertura: la ficha no los tiene cargados y la página sí, y pedírselos al que llama habría dejado
 * dos formas distintas de montar el mismo formulario.
 */
interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** La empresa a editar; `null` para un alta. */
  empresa: Company | null;
  /** Se llama después de guardar con éxito (refrescar la lista o la ficha). */
  onGuardado: () => void;
}

export const EmpresaFormModal: React.FC<Props> = ({ isOpen, onClose, empresa, onGuardado }) => {
  const [form, setForm] = useState<CompanyInput>(EMPTY_COMPANY_FORM);
  const [saving, setSaving] = useState(false);
  const [convenios, setConvenios] = useState<SimpleCatalogItem[]>([]);
  const [obrasSociales, setObrasSociales] = useState<SimpleCatalogItem[]>([]);
  const [sucursales, setSucursales] = useState<ArcaSucursal[]>([]);
  // Un flag por catálogo: cada selector avisa que está cargando en vez de mostrarse vacío, que se
  // lee como «no hay ninguno» justo mientras se está pidiendo.
  const [cargandoConvenios, setCargandoConvenios] = useState(false);
  const [cargandoObrasSociales, setCargandoObrasSociales] = useState(false);
  const [cargandoSucursales, setCargandoSucursales] = useState(false);
  const editing = empresa;

  useEffect(() => {
    if (!isOpen) return;
    setForm(empresa ? companyAForm(empresa) : EMPTY_COMPANY_FORM);
  }, [isOpen, empresa]);

  useEffect(() => {
    if (!isOpen) return;
    // Cada uno con su catch: que falte un catálogo deja ese selector vacío, no rompe el formulario.
    setCargandoConvenios(true);
    void conveniosApi
      .list()
      .then(setConvenios)
      .catch(() => setConvenios([]))
      .finally(() => setCargandoConvenios(false));
    setCargandoObrasSociales(true);
    void obrasSocialesApi
      .list()
      .then(setObrasSociales)
      .catch(() => setObrasSociales([]))
      .finally(() => setCargandoObrasSociales(false));
    setCargandoSucursales(true);
    void arcaSucursalesAPI
      .list()
      .then(setSucursales)
      .catch(() => setSucursales([]))
      .finally(() => setCargandoSucursales(false));
  }, [isOpen]);

  const setField = (key: keyof CompanyInput, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const labelClass = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';
  const inputClass = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-transparent dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500 text-sm';

  /** Un campo de texto del formulario. Se repite quince veces; escribirlo una vez evita que quince
      inputs se vayan pareciendo cada vez menos entre sí. */
  const field = (label: string, key: keyof CompanyInput, opts?: { required?: boolean; placeholder?: string; type?: string }) => (
    <div>
      <label className={labelClass}>
        {label} {opts?.required && <span className="text-red-500">*</span>}
      </label>
      <input type={opts?.type || 'text'} className={inputClass} value={(form[key] as string) || ''} onChange={(e) => setField(key, e.target.value)} placeholder={opts?.placeholder} required={opts?.required} />
    </div>
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.razonSocial.trim()) {
      sweetAlert.error('Datos incompletos', 'La razón social es obligatoria');
      return;
    }
    try {
      setSaving(true);
      if (editing) {
        await companiesAPI.update(editing._id, form);
        sweetAlert.success('Empresa actualizada', 'Los cambios se guardaron correctamente');
      } else {
        await companiesAPI.create(form);
        sweetAlert.success('Empresa creada', 'La empresa se creó correctamente');
      }
      onClose();
      onGuardado();
    } catch (error: any) {
      console.error('Error saving company:', error);
      sweetAlert.error('Error', error?.response?.data?.error || 'No se pudo guardar la empresa');
    } finally {
      setSaving(false);
    }
  };

  return (
      <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={editing ? 'Editar Empresa' : 'Nueva Empresa'}
    subtitle="Datos de la empresa para armar los contratos"
    size="lg"
    footer={
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="px-5 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          Cancelar
        </button>
        <button type="submit" form="company-form" disabled={saving} className="btn-primary px-6 py-2 disabled:opacity-50">
          {saving ? 'Guardando...' : editing ? 'Guardar' : 'Crear'}
        </button>
      </div>
    }
      >
    <form id="company-form" onSubmit={handleSave} className="space-y-6">
      {/* Datos generales */}
      <div>
        <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Datos generales</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('Razón Social', 'razonSocial', { required: true, placeholder: 'Ej: 2030 S.R.L.' })}
          {field('CUIT', 'cuit', { placeholder: '30-71706837-4' })}
        </div>
      </div>

      {/* Domicilio legal */}
      <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
        <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Domicilio legal</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('Calle', 'domicilioCalle', { placeholder: 'Ruiz Huidobro' })}
          {field('Número', 'domicilioNumero', { placeholder: '4365' })}
          {field('Piso / Depto', 'domicilioPisoDepto')}
          {field('Localidad', 'localidad', { placeholder: 'CABA' })}
          {field('Provincia', 'provincia')}
          {field('Código Postal', 'codigoPostal', { placeholder: '1430' })}
        </div>
      </div>

      {/* Firmante */}
      <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
        <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Firmante</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {field('Nombre', 'firmanteNombre', { placeholder: 'Norma Olivo' })}
          {field('DNI', 'firmanteDni', { placeholder: '5.453.082' })}
          {field('Cargo', 'firmanteCargo', { placeholder: 'Socio Gerente' })}
          {/* Va acá y no en Representante legal: son dos personas distintas. En 2030 S.R.L. firma
              Norma Olivo y el representante legal es Hernán Pellegrini — el bloque de partes del
              contrato imprime el nombre y el DNI del FIRMANTE, así que el mail que va al lado
              tiene que ser el suyo. */}
          {field('Email', 'firmanteEmail', { type: 'email', placeholder: 'norma.olivo@frame.com.ar' })}
        </div>
      </div>

      {/* Convenios */}
      <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
        <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Convenios</h4>
        <ConvenioSelector convenios={convenios} cargando={cargandoConvenios} value={form.convenioIds || []} onChange={(ids) => setForm((prev) => ({ ...prev, convenioIds: ids }))} />
      </div>

      {/* Obras sociales registradas ante ARCA para este CUIT */}
      <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
        <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Obras sociales</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Las que este CUIT tiene registradas ante ARCA (&laquo;obras sociales relacionadas a su actividad&raquo;). El organismo solo acepta altas con una de ellas. Cuál se usa por defecto se elige en la ficha de la empresa, en ARCA &rarr; Obras Sociales.</p>
        <ObraSocialSelector obrasSociales={obrasSociales} cargando={cargandoObrasSociales} value={form.obrasSocialesIds || []} onChange={(ids) => setForm((prev) => ({ ...prev, obrasSocialesIds: ids }))} />
      </div>

      {/* Sucursales de ARCA asignadas */}
      <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
        <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">Sucursales de ARCA</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Cuáles de las sucursales del padrón le corresponden a esta empresa. Los datos de cada una (código, domicilio, actividades) se cargan en Configuración → ARCA → Sucursales.</p>
        <SucursalSelector sucursales={sucursales} cargando={cargandoSucursales} value={form.sucursalIds || []} onChange={(ids) => setForm((prev) => ({ ...prev, sucursalIds: ids }))} />
      </div>

      {/* Representante legal */}
      <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
        <h4 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">Representante legal</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('Nombre', 'representanteLegalNombre', { placeholder: 'Hernán Marcelo Pellegrini' })}
          {field('Email', 'representanteLegalEmail', { type: 'email', placeholder: 'hernan.pellegrini@frame.com.ar' })}
        </div>
      </div>
    </form>
      </Modal>
  );
};

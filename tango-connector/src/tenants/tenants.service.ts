import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { CONFIGURACION, type Configuracion } from '../config/configuracion';
import { cifrar, descifrar } from '../database/cifrado';
import { Empresa, Tenant } from '../database/entidades';

/** Lo que hace falta para hablar con Tango en nombre de una empresa. */
export interface DestinoTango {
  /** El slug con que está registrada: los permisos de las keys se escriben con él. */
  slug: string;
  urlBase: string;
  tangoCompanyId: number;
  token: string;
}

/** Para iniciar sesión en la web de Tango (ADR 0003). */
export interface CredencialesWeb {
  urlBase: string;
  usuario: string;
  password: string;
}

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Empresa) private readonly empresas: Repository<Empresa>,
    @Inject(CONFIGURACION) private readonly config: Configuracion,
  ) {}

  /**
   * El destino de `/:tenant/:empresa`, o `null` si no está registrado. `empresa` puede ser el
   * slug (`fzero-srl`) o el Company ID de Tango (`3`): así una plataforma que ya guarda el ID
   * no necesita conocer el slug.
   */
  async resolver(tenantSlug: string, empresa: string): Promise<DestinoTango | null> {
    const porId = /^\d+$/.test(empresa);
    const registrada = await this.empresas.findOne({
      where: porId
        ? { tangoCompanyId: Number(empresa), tenant: { slug: tenantSlug } }
        : { slug: empresa, tenant: { slug: tenantSlug } },
      relations: { tenant: true },
    });
    if (!registrada) return null;
    return {
      slug: registrada.slug,
      urlBase: registrada.tenant.urlBase.replace(/\/+$/, ''),
      tangoCompanyId: registrada.tangoCompanyId,
      token: descifrar(registrada.tokenCifrado, this.config.claveCifrado),
    };
  }

  crearTenant(slug: string, nombre: string, urlBase: string): Promise<Tenant> {
    return this.tenants.save(this.tenants.create({ slug, nombre, urlBase }));
  }

  async crearEmpresa(
    tenantSlug: string,
    datos: { slug: string; nombre: string; tangoCompanyId: number; token: string },
  ): Promise<Empresa> {
    // Un slug solo de dígitos se confundiría con un Company ID en la URL.
    if (/^\d+$/.test(datos.slug)) throw new Error('El slug no puede ser solo números: se confunde con el Company ID');
    const tenant = await this.tenants.findOneByOrFail({ slug: tenantSlug });
    return this.empresas.save(
      this.empresas.create({
        tenant,
        slug: datos.slug,
        nombre: datos.nombre,
        tangoCompanyId: datos.tangoCompanyId,
        tokenCifrado: cifrar(datos.token, this.config.claveCifrado),
      }),
    );
  }

  /** Guarda (cifradas) las credenciales del usuario técnico de la web de Tango. */
  async guardarCredencialesWeb(tenantSlug: string, usuario: string, password: string): Promise<void> {
    const tenant = await this.tenants.findOneByOrFail({ slug: tenantSlug });
    tenant.webUsuarioCifrado = cifrar(usuario, this.config.claveCifrado);
    tenant.webPasswordCifrado = cifrar(password, this.config.claveCifrado);
    await this.tenants.save(tenant);
  }

  /** Las credenciales web del tenant, o `null` si no tiene. */
  async credencialesWeb(tenantSlug: string): Promise<CredencialesWeb | null> {
    const tenant = await this.tenants.findOneBy({ slug: tenantSlug });
    if (!tenant?.webUsuarioCifrado || !tenant.webPasswordCifrado) return null;
    return {
      urlBase: tenant.urlBase.replace(/\/+$/, ''),
      usuario: descifrar(tenant.webUsuarioCifrado, this.config.claveCifrado),
      password: descifrar(tenant.webPasswordCifrado, this.config.claveCifrado),
    };
  }

  listar(): Promise<Tenant[]> {
    return this.tenants.find({ relations: { empresas: true }, order: { slug: 'ASC' } });
  }
}

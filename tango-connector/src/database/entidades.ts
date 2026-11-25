import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Un servidor Tango: el de un cliente, al que se llega por su túnel. Es el `tenantSlug` de
 * la URL, igual que en lumba-tango.
 */
@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  slug: string;

  @Column()
  nombre: string;

  /** URL base de Tango, sin `/Api`. En el VPS: `http://127.0.0.1:<puerto del túnel>`. */
  @Column({ name: 'url_base' })
  urlBase: string;

  /**
   * Usuario y contraseña del usuario técnico de la **web** de Tango, cifrados. Hacen falta
   * para los datos que la API no expone (ADR 0003). `null` si el tenant no los tiene.
   */
  @Column({ name: 'web_usuario_cifrado', type: 'text', nullable: true })
  webUsuarioCifrado: string | null;

  @Column({ name: 'web_password_cifrado', type: 'text', nullable: true })
  webPasswordCifrado: string | null;

  @OneToMany(() => Empresa, (e) => e.tenant)
  empresas: Empresa[];

  @CreateDateColumn({ name: 'creado' })
  creado: Date;
}

/** Una empresa de Tango dentro de un servidor. Es el `companySlug` de la URL. */
@Entity('empresas')
@Index(['tenant', 'slug'], { unique: true })
@Index(['tenant', 'tangoCompanyId'], { unique: true })
export class Empresa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant, (t) => t.empresas, { nullable: false, onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column()
  slug: string;

  @Column()
  nombre: string;

  /** El ID de empresa de Tango: va en el header `Company`. */
  @Column({ name: 'tango_company_id', type: 'int' })
  tangoCompanyId: number;

  /** Token de la API de Tango, cifrado con `CLAVE_CIFRADO`. Nunca sale del servicio. */
  @Column({ name: 'token_cifrado', type: 'text' })
  tokenCifrado: string;

  @CreateDateColumn({ name: 'creado' })
  creado: Date;
}

/**
 * Qué puede hacer una API key.
 * - `empresas`: `"tenant/empresa"` o `"tenant/*"`.
 * - `procesos`: por ID de proceso (o `"*"` para todos), la lista de endpoints permitidos.
 * - `filtroSql`: si puede usar `GetByFilter`, que manda SQL a la base de Tango.
 */
export interface Permisos {
  empresas: string[];
  procesos: Record<string, string[]>;
  filtroSql: boolean;
}

/** La key de una plataforma. Se guarda solo el hash; la key completa se muestra una vez. */
@Entity('api_keys')
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  plataforma: string;

  /** Primeros caracteres de la key, para buscarla sin recorrer todos los hashes. */
  @Index({ unique: true })
  @Column()
  prefijo: string;

  /** SHA-256 de la key completa, en hex. */
  @Column()
  hash: string;

  @Column({ type: 'jsonb' })
  permisos: Permisos;

  @Column({ default: true })
  activa: boolean;

  @CreateDateColumn({ name: 'creada' })
  creada: Date;

  @Column({ name: 'ultimo_uso', type: 'timestamptz', nullable: true })
  ultimoUso: Date | null;
}

/**
 * Cada escritura en Tango hecha por el connector, salga bien o mal (ADR 0004). Los datos van
 * completos: son datos fiscales y bancarios de proveedores, no secretos de acceso.
 */
@Entity('auditoria_escrituras')
export class AuditoriaEscritura {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({ name: 'creada' })
  creada: Date;

  @Column({ name: 'api_key_id', type: 'uuid', nullable: true })
  apiKeyId: string | null;

  @Column()
  plataforma: string;

  @Column()
  tenant: string;

  @Column()
  empresa: string;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  /** `AltaDeProveedor`, `ActualizarProveedor`, … */
  @Column()
  operacion: string;

  @Column({ name: 'id_registro', type: 'int', nullable: true })
  idRegistro: number | null;

  /** Lo que se mandó a Tango (o lo que se iba a mandar). */
  @Column({ type: 'jsonb', nullable: true })
  cuerpo: Record<string, unknown> | null;

  /** `ok`, `error`, o `desconocido` si la escritura se cortó y no se sabe si Tango la guardó. */
  @Column()
  resultado: string;

  @Column({ type: 'text', nullable: true })
  mensaje: string | null;
}

export const ENTIDADES = [Tenant, Empresa, ApiKey, AuditoriaEscritura];

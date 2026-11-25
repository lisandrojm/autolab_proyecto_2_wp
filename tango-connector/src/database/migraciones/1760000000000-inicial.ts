import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Inicial1760000000000 implements MigrationInterface {
  name = 'Inicial1760000000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE tenants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug varchar NOT NULL,
        nombre varchar NOT NULL,
        url_base varchar NOT NULL,
        creado timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX tenants_slug ON tenants (slug)`);

    await q.query(`
      CREATE TABLE empresas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tenantId" uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
        slug varchar NOT NULL,
        nombre varchar NOT NULL,
        tango_company_id int NOT NULL,
        token_cifrado text NOT NULL,
        creado timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX empresas_tenant_slug ON empresas ("tenantId", slug)`);

    await q.query(`
      CREATE TABLE api_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        plataforma varchar NOT NULL,
        prefijo varchar NOT NULL,
        hash varchar NOT NULL,
        permisos jsonb NOT NULL,
        activa boolean NOT NULL DEFAULT true,
        creada timestamptz NOT NULL DEFAULT now(),
        ultimo_uso timestamptz
      )`);
    await q.query(`CREATE UNIQUE INDEX api_keys_prefijo ON api_keys (prefijo)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE api_keys`);
    await q.query(`DROP TABLE empresas`);
    await q.query(`DROP TABLE tenants`);
  }
}

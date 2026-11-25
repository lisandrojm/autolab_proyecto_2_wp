import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Una empresa también se busca por Company ID en la URL: no puede repetirse en un tenant. */
export class EmpresaPorCompanyId1760100000000 implements MigrationInterface {
  name = 'EmpresaPorCompanyId1760100000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE UNIQUE INDEX empresas_tenant_company ON empresas ("tenantId", tango_company_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX empresas_tenant_company`);
  }
}

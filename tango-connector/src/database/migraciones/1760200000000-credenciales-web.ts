import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Credenciales del usuario técnico de la web de Tango, por tenant (ADR 0003). */
export class CredencialesWeb1760200000000 implements MigrationInterface {
  name = 'CredencialesWeb1760200000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE tenants ADD COLUMN web_usuario_cifrado text, ADD COLUMN web_password_cifrado text`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE tenants DROP COLUMN web_usuario_cifrado, DROP COLUMN web_password_cifrado`);
  }
}

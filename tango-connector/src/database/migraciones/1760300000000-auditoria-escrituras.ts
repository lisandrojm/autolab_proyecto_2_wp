import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Auditoría de las escrituras en Tango (ADR 0004). */
export class AuditoriaEscrituras1760300000000 implements MigrationInterface {
  name = 'AuditoriaEscrituras1760300000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE auditoria_escrituras (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        creada timestamptz NOT NULL DEFAULT now(),
        api_key_id uuid,
        plataforma varchar NOT NULL,
        tenant varchar NOT NULL,
        empresa varchar NOT NULL,
        company_id int NOT NULL,
        operacion varchar NOT NULL,
        id_registro int,
        cuerpo jsonb,
        resultado varchar NOT NULL,
        mensaje text
      )`);
    await q.query(`CREATE INDEX auditoria_escrituras_creada ON auditoria_escrituras (creada)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE auditoria_escrituras`);
  }
}

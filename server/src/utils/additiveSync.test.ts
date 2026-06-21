/**
 * Unit tests for the additive sync helpers.
 *
 * Run with:
 *   npx tsx src/utils/additiveSync.test.ts
 *   – or –
 *   npm run test:additive
 *
 * Uses Node.js built-in test runner (node:test + node:assert).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isEmpty,
  buildAdditiveSet,
  buildContractKey,
  findNewContracts,
  USER_FRAME_WHITELIST,
  USERPROJECT_FRAME_WHITELIST,
} from "./additiveSync.js";

// =========================================================================
// (a) isEmpty
// =========================================================================
describe("isEmpty", () => {
  it("returns true for undefined", () => {
    assert.equal(isEmpty(undefined), true);
  });

  it("returns true for null", () => {
    assert.equal(isEmpty(null), true);
  });

  it('returns true for ""', () => {
    assert.equal(isEmpty(""), true);
  });

  it("returns true for []", () => {
    assert.equal(isEmpty([]), true);
  });

  it("returns true for {}", () => {
    assert.equal(isEmpty({}), true);
  });

  it("returns false for non-empty string", () => {
    assert.equal(isEmpty("hello"), false);
  });

  it("returns false for 0", () => {
    assert.equal(isEmpty(0), false);
  });

  it("returns false for false", () => {
    assert.equal(isEmpty(false), false);
  });

  it("returns false for non-empty array", () => {
    assert.equal(isEmpty([1]), false);
  });

  it("returns false for object with keys", () => {
    assert.equal(isEmpty({ a: 1 }), false);
  });

  it("returns false for Date", () => {
    assert.equal(isEmpty(new Date()), false);
  });
});

// =========================================================================
// (b) + (c) + (d) buildAdditiveSet
// =========================================================================
describe("buildAdditiveSet", () => {
  const whitelist = ["email", "firstName", "metadata.nombre", "metadata.apellido"];

  it("(a) returns all fields for a brand-new doc (existingDoc = null)", () => {
    const frame = {
      email: "test@test.com",
      firstName: "Juan",
      metadata: { nombre: "Juan", apellido: "Perez" },
    };

    const result = buildAdditiveSet(frame, null, whitelist);

    assert.deepEqual(result, {
      email: "test@test.com",
      firstName: "Juan",
      "metadata.nombre": "Juan",
      "metadata.apellido": "Perez",
    });
  });

  it("(a) returns all fields for a brand-new doc (existingDoc = {})", () => {
    const frame = {
      email: "test@test.com",
      firstName: "Juan",
      metadata: { nombre: "Juan", apellido: "Perez" },
    };

    const result = buildAdditiveSet(frame, {}, whitelist);

    assert.deepEqual(result, {
      email: "test@test.com",
      firstName: "Juan",
      "metadata.nombre": "Juan",
      "metadata.apellido": "Perez",
    });
  });

  it("(b) fills fields that are null/undefined/''/[]/{}  in existing doc", () => {
    const frame = {
      email: "new@test.com",
      firstName: "Carlos",
      metadata: { nombre: "Carlos", apellido: "Garcia" },
    };

    const existing = {
      email: null,
      firstName: "",
      metadata: { nombre: undefined, apellido: "" },
    };

    const result = buildAdditiveSet(frame, existing, whitelist);

    assert.deepEqual(result, {
      email: "new@test.com",
      firstName: "Carlos",
      "metadata.nombre": "Carlos",
      "metadata.apellido": "Garcia",
    });
  });

  it("(c) does NOT overwrite fields that already have a value in WeProdu", () => {
    const frame = {
      email: "frame@test.com",
      firstName: "FrameName",
      metadata: { nombre: "FrameNombre", apellido: "FrameApellido" },
    };

    const existing = {
      email: "weprodu@test.com",
      firstName: "WeProduName",
      metadata: { nombre: "WeProduNombre", apellido: "WeProduApellido" },
    };

    const result = buildAdditiveSet(frame, existing, whitelist);

    assert.deepEqual(result, {});
  });

  it("(c) only fills empty fields, leaves populated fields intact", () => {
    const frame = {
      email: "frame@test.com",
      firstName: "FrameName",
      metadata: { nombre: "FrameNombre", apellido: "FrameApellido" },
    };

    const existing = {
      email: "weprodu@test.com", // has value → keep
      firstName: "",              // empty → fill
      metadata: {
        nombre: "ExistingNombre", // has value → keep
        // apellido: missing     → fill
      },
    };

    const result = buildAdditiveSet(frame, existing, whitelist);

    assert.deepEqual(result, {
      firstName: "FrameName",
      "metadata.apellido": "FrameApellido",
    });
  });

  it("(d) returns {} when all existing fields are populated → 0 writes", () => {
    const frame = {
      email: "same@test.com",
      firstName: "Same",
      metadata: { nombre: "Same", apellido: "Same" },
    };

    const existing = {
      email: "same@test.com",
      firstName: "Same",
      metadata: { nombre: "Same", apellido: "Same" },
    };

    const result = buildAdditiveSet(frame, existing, whitelist);

    assert.deepEqual(result, {});
  });

  it("ignores fields NOT in the whitelist", () => {
    const frame = {
      email: "test@test.com",
      password: "secret123",       // NOT whitelisted
      roles: ["admin"],            // NOT whitelisted
      firstName: "Juan",
      metadata: { nombre: "Juan", apellido: "Perez" },
    };

    const result = buildAdditiveSet(frame, {}, whitelist);

    // password and roles should NOT appear
    assert.equal("password" in result, false);
    assert.equal("roles" in result, false);
    assert.equal(result.email, "test@test.com");
  });

  it("skips fields where FRAME value is also empty", () => {
    const frame = {
      email: "",
      firstName: null as any,
      metadata: { nombre: undefined as any, apellido: "" },
    };

    const result = buildAdditiveSet(frame, {}, whitelist);

    assert.deepEqual(result, {});
  });

  it("handles numeric 0 and boolean false as non-empty (preserves them)", () => {
    const wl = ["metadata.generoId", "metadata.activo"];
    const frame = { metadata: { generoId: 0, activo: false } };
    const existing = { metadata: { generoId: undefined, activo: null } };

    const result = buildAdditiveSet(frame, existing, wl);

    assert.deepEqual(result, {
      "metadata.generoId": 0,
      "metadata.activo": false,
    });
  });
});

// =========================================================================
// buildContractKey
// =========================================================================
describe("buildContractKey", () => {
  it("builds composite key from contract fields", () => {
    const contract = {
      proyecto_id: 10,
      empleado_id: 20,
      fecha_alta_contrato: "2024-01-15",
      tipo_contrato_id: 3,
      categoria_sat_id: 5,
    };

    assert.equal(buildContractKey(contract), "10|20|2024-01-15|3|5");
  });

  it("handles missing fields gracefully", () => {
    const contract = { proyecto_id: 10 };
    assert.equal(buildContractKey(contract), "10||||");
  });
});

// =========================================================================
// (f) + (g) + (h) findNewContracts
// =========================================================================
describe("findNewContracts", () => {
  const makeContract = (overrides: Record<string, any> = {}) => ({
    proyecto_id: 1,
    empleado_id: 100,
    fecha_alta_contrato: "2024-01-01",
    tipo_contrato_id: 1,
    categoria_sat_id: 1,
    hora_inicio: "08:00",
    hora_fin: "17:00",
    ...overrides,
  });

  it("(g) identifies genuinely new contracts", () => {
    const existing = [makeContract()];
    const frame = [
      makeContract(),                                      // same as existing → skip
      makeContract({ fecha_alta_contrato: "2024-06-01" }), // different key → new
    ];

    const { newContracts, collisionWarnings } = findNewContracts(frame, existing);

    assert.equal(newContracts.length, 1);
    assert.equal(newContracts[0].fecha_alta_contrato, "2024-06-01");
    assert.equal(collisionWarnings.length, 0);
  });

  it("(f) does NOT return existing contracts — hora_inicio/hora_fin remain untouched", () => {
    const existing = [
      makeContract({ hora_inicio: "09:00", hora_fin: "18:00" }), // edited in WeProdu
    ];
    const frame = [
      makeContract({ hora_inicio: "08:00", hora_fin: "17:00" }), // FRAME has original values
    ];

    // Same composite key → contract is NOT new → won't be pushed
    const { newContracts } = findNewContracts(frame, existing);

    assert.equal(newContracts.length, 0);
    // The existing contract in WeProdu keeps its edited values (09:00, 18:00)
    // because we never touch it.
    assert.equal(existing[0].hora_inicio, "09:00");
    assert.equal(existing[0].hora_fin, "18:00");
  });

  it("(h) double run → no duplicates", () => {
    const existing = [makeContract()];
    const frame = [
      makeContract({ fecha_alta_contrato: "2024-06-01" }), // new contract
    ];

    // First run: should find 1 new
    const run1 = findNewContracts(frame, existing);
    assert.equal(run1.newContracts.length, 1);

    // Simulate that the new contract was pushed to existing
    const afterPush = [...existing, ...run1.newContracts];

    // Second run with same FRAME data: should find 0 new
    const run2 = findNewContracts(frame, afterPush);
    assert.equal(run2.newContracts.length, 0);
  });

  it("detects collisions in existing contracts", () => {
    // Two existing contracts with the same key (collision)
    const existing = [makeContract(), makeContract()];
    const frame = [makeContract()];

    const { newContracts, collisionWarnings } = findNewContracts(frame, existing);

    assert.equal(newContracts.length, 0); // already present
    assert.equal(collisionWarnings.length, 1);
    assert.ok(collisionWarnings[0].includes("collision"));
  });

  it("deduplicates FRAME contracts with same key", () => {
    const existing: any[] = [];
    const frame = [
      makeContract({ fecha_alta_contrato: "2024-06-01" }),
      makeContract({ fecha_alta_contrato: "2024-06-01" }), // duplicate in FRAME batch
    ];

    const { newContracts } = findNewContracts(frame, existing);

    // Only one copy should be pushed
    assert.equal(newContracts.length, 1);
  });

  it("returns empty when FRAME has no contracts", () => {
    const { newContracts, collisionWarnings } = findNewContracts([], [makeContract()]);

    assert.equal(newContracts.length, 0);
    assert.equal(collisionWarnings.length, 0);
  });

  it("returns all when existing has no contracts", () => {
    const frame = [
      makeContract(),
      makeContract({ fecha_alta_contrato: "2024-06-01" }),
    ];

    const { newContracts } = findNewContracts(frame, []);

    assert.equal(newContracts.length, 2);
  });
});

// =========================================================================
// (e) User without metadata.id — tested at integration level but we can
//     verify the whitelist doesn't include protected fields.
// =========================================================================
describe("Whitelists", () => {
  it("USER_FRAME_WHITELIST does NOT contain protected fields", () => {
    const protectedFields = [
      "password",
      "roles",
      "clientIds",
      "projectIds",
      "tenantId",
      "extraVacationDays",
      "carryOverVacationDays",
      "lastLoginAt",
      "isSystem",
      "__v",
    ];

    for (const field of protectedFields) {
      assert.equal(
        USER_FRAME_WHITELIST.includes(field),
        false,
        `USER_FRAME_WHITELIST should NOT include '${field}'`,
      );
    }
  });

  it("USERPROJECT_FRAME_WHITELIST does NOT contain projectId/userId", () => {
    assert.equal(USERPROJECT_FRAME_WHITELIST.includes("projectId"), false);
    assert.equal(USERPROJECT_FRAME_WHITELIST.includes("userId"), false);
  });
});

console.log("\n✅ All additive sync tests defined. Running via node:test...\n");

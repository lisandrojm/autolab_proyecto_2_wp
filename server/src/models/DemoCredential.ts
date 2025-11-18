import { Schema, model } from "mongoose";

/**
 * Solo para DEMOS / QA:
 * Guarda la password en claro para que el Login pueda autocompletar.
 * Proteger con ALLOW_DEMO_PASSWORDS=true en .env (desactivar cuando no se use).
 */
const DemoCredentialSchema = new Schema(
  {
    tenantId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    email: { type: String, required: true },
    passwordPlain: { type: String, required: true },
    label: { type: String, default: "demo" },
  },
  { timestamps: true }
);

export const DemoCredential = model("DemoCredential", DemoCredentialSchema);

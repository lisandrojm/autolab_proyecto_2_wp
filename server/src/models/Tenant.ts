import mongoose, { Document, Schema } from "mongoose";

export interface ITenant extends Document {
  name: string;
  slug: string;
  domain?: string;
  userIds: mongoose.Types.ObjectId[];
  isSystem: boolean;
  company: {
    legalName: string;
    taxId?: string;
    industry?: string;
    address?: {
      street: string;
      city: string;
      state?: string;
      postalCode: string;
      country: string;
    };
    website?: string;
    description?: string;
    logoUrl?: string;
    firmaRRHHUrl?: string;
  };
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    position?: string;
    department?: string;
  };
  settings: { timezone: string; currency: string; language: string; features: string[] };
  integrations?: {
    dropbox?: {
      appKey?: string;
      appSecretEnc?: string; // cifrado en reposo
      refreshTokenEnc?: string; // cifrado en reposo
      rootPath?: string; // ej: "/HelloSign"
      accountEmail?: string; // solo para mostrar quién está conectado
      connectedAt?: Date;
      /** Cada cuántos minutos se revisan las carpetas vigiladas por transición automática. Default 20. */
      scanIntervalMinutes?: number;
    };
    afip?: {
      /** CUIT representada (el CUIT propio del tenant, dado de alta en AFIP como titular del certificado). */
      cuitRepresentada?: string;
      /** Certificado X.509 en formato PEM — no es secreto, se guarda tal cual. */
      certificadoPem?: string;
      /** Clave privada del certificado — cifrada en reposo. */
      clavePrivadaEnc?: string;
      ambiente?: "homologacion" | "produccion";
      connectedAt?: Date;
      /** Resultado de la última autoconsulta de prueba contra Consulta Padrón A13 (no solo el login
       *  WSAA) — ver `verificarServicioPadron` en afipService.ts. "connected" (arriba) no garantiza
       *  que el servicio esté autorizado en AFIP; esto sí lo prueba. */
      servicioPadronOk?: boolean;
      servicioPadronEstado?: "ok" | "no_autorizado" | "error";
      servicioPadronDetalle?: string;
      servicioPadronFaultCode?: string;
      servicioPadronFaultString?: string;
      servicioPadronVerificadoAt?: Date;
    };
    /**
     * Casilla de correo que recibe las copias de "documento enviado" de Dropbox Sign (se activa en
     * Dropbox Sign → Configuración → Perfil → Notificaciones). Leyéndola se detecta qué contratos ya
     * se enviaron a firmar, para moverlos de "Outbox" a "Pendbox" sin que nadie toque archivos.
     */
    dropboxSign?: {
      /** Casilla que recibe las notificaciones (ej. rrhh@frame.com.ar). */
      email?: string;
      imapHost?: string;
      imapPort?: number;
      imapSecure?: boolean;
      /** Usuario IMAP: suele ser el mismo email, pero algunos proveedores usan otro. */
      imapUser?: string;
      /** Contraseña IMAP — cifrada en reposo, igual que el resto de las credenciales. */
      imapPasswordEnc?: string;
      /** Mientras esté en false no se lee la casilla ni se mueve ningún archivo. */
      enabled?: boolean;
      configuredAt?: Date;
      /** Última lectura de la casilla y su resultado, para poder diagnosticar desde la UI. */
      lastCheckAt?: Date;
      lastCheckOk?: boolean;
      lastCheckDetalle?: string;
    };
  };
  subscription: { plan: "free" | "basic" | "pro" | "enterprise"; status: "active" | "suspended" | "cancelled"; expiresAt?: Date };
  usage: {
    users: { current: number; limit: number };
    clients: { current: number; limit: number };
    storage: { usedMB: number; limitMB: number };
    apiCalls: { current: number; limit: number; resetDate: Date };
    lastUpdated: Date;
  };
  billing: {
    currentPeriod: {
      startDate: Date;
      endDate: Date;
      amount: number;
      currency: string;
    };
    paymentMethod?: {
      type: "card" | "bank" | "paypal";
      last4?: string;
      expiryDate?: string;
    };
    invoices: {
      id: string;
      date: Date;
      amount: number;
      status: "paid" | "pending" | "overdue" | "cancelled";
      downloadUrl?: string;
    }[];
    nextBillingDate?: Date;
    autoRenew: boolean;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const tenantSchema = new Schema<ITenant>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    domain: { type: String, trim: true },
    userIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
    isSystem: { type: Boolean, default: false, index: true },

    company: {
      legalName: { type: String, required: true, trim: true },
      taxId: { type: String, trim: true },
      industry: { type: String, trim: true },
      address: {
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        postalCode: { type: String, trim: true },
        country: { type: String, trim: true },
      },
      website: { type: String, trim: true },
      description: { type: String, trim: true },
      logoUrl: { type: String, trim: true },
      firmaRRHHUrl: { type: String, trim: true },
    },

    contact: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
      phone: { type: String, trim: true },
      position: { type: String, trim: true },
      department: { type: String, trim: true },
    },

    settings: {
      timezone: { type: String, default: "UTC" },
      currency: { type: String, default: "USD" },
      language: { type: String, default: "en" },
      features: [{ type: String }],
    },

    integrations: {
      dropbox: {
        appKey: { type: String },
        appSecretEnc: { type: String },
        refreshTokenEnc: { type: String },
        rootPath: { type: String, default: "/HelloSign" },
        accountEmail: { type: String },
        connectedAt: { type: Date },
        scanIntervalMinutes: { type: Number, default: 20 },
      },
      afip: {
        cuitRepresentada: { type: String },
        certificadoPem: { type: String },
        clavePrivadaEnc: { type: String },
        ambiente: { type: String, enum: ["homologacion", "produccion"], default: "homologacion" },
        connectedAt: { type: Date },
        servicioPadronOk: { type: Boolean },
        servicioPadronEstado: { type: String, enum: ["ok", "no_autorizado", "error"] },
        servicioPadronDetalle: { type: String },
        servicioPadronFaultCode: { type: String },
        servicioPadronFaultString: { type: String },
        servicioPadronVerificadoAt: { type: Date },
      },
      dropboxSign: {
        email: { type: String },
        imapHost: { type: String },
        imapPort: { type: Number, default: 993 },
        imapSecure: { type: Boolean, default: true },
        imapUser: { type: String },
        imapPasswordEnc: { type: String },
        enabled: { type: Boolean, default: false },
        configuredAt: { type: Date },
        lastCheckAt: { type: Date },
        lastCheckOk: { type: Boolean },
        lastCheckDetalle: { type: String },
      },
    },

    subscription: {
      plan: { type: String, enum: ["free", "basic", "pro", "enterprise"], default: "free" },
      status: { type: String, enum: ["active", "suspended", "cancelled"], default: "active" },
      expiresAt: Date,
    },

    usage: {
      users: {
        current: { type: Number, default: 0, min: 0 },
        limit: { type: Number, default: 10, min: 1 },
      },
      clients: {
        current: { type: Number, default: 0, min: 0 },
        limit: { type: Number, default: 50, min: 1 },
      },
      storage: {
        usedMB: { type: Number, default: 0, min: 0 },
        limitMB: { type: Number, default: 1024, min: 100 }, // 1GB default
      },
      apiCalls: {
        current: { type: Number, default: 0, min: 0 },
        limit: { type: Number, default: 10000, min: 100 },
        resetDate: { type: Date, default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, // 30 días
      },
      lastUpdated: { type: Date, default: Date.now },
    },

    billing: {
      currentPeriod: {
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },
        amount: { type: Number, required: true, min: 0 },
        currency: { type: String, default: "USD" },
      },
      paymentMethod: {
        type: { type: String, enum: ["card", "bank", "paypal"] },
        last4: { type: String, maxlength: 4 },
        expiryDate: { type: String }, // MM/YY format
      },
      invoices: [
        {
          id: { type: String, required: true },
          date: { type: Date, required: true },
          amount: { type: Number, required: true, min: 0 },
          status: { type: String, enum: ["paid", "pending", "overdue", "cancelled"], default: "pending" },
          downloadUrl: { type: String },
        },
      ],
      nextBillingDate: Date,
      autoRenew: { type: Boolean, default: true },
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Índices para optimizar consultas
tenantSchema.index({ slug: 1 }, { unique: true });
tenantSchema.index({ domain: 1 });
tenantSchema.index({ "contact.email": 1 });
tenantSchema.index({ "subscription.status": 1 });
tenantSchema.index({ isActive: 1 });

tenantSchema.post("save", async function (doc) {
  if (this.isNew) {
    try {
      const { ensureDefaultRoles } = await import("../services/roleInitService.js");
      const { Types } = await import("mongoose");
      const tenantId = new Types.ObjectId(doc._id as any);
      await ensureDefaultRoles(tenantId);
    } catch (error) {
      console.error(`[Tenant Post-Save Hook] Failed to create default roles for tenant ${doc._id}:`, error);
    }
  }
});

export const Tenant = mongoose.model<ITenant>("Tenant", tenantSchema);

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
  settings: {
    timezone: string;
    currency: string;
    language: string;
    features: string[];
    /** Cuántos días dura un link de registro generado desde la app móvil (sección Registro). Ver `routes/registroLinks.ts`. */
    registroDiasLinkMovil?: number;
  };
  integrations?: {
    dropbox?: {
      appKey?: string;
      appSecretEnc?: string; // cifrado en reposo
      refreshTokenEnc?: string; // cifrado en reposo
      rootPath?: string; // ej: "/HelloSign"
      accountEmail?: string; // solo para mostrar quién está conectado
      /**
       * El id de cuenta de Dropbox (dbid:...). NO es decorativo: es lo unico que trae el webhook.
       *
       * La notificacion de Dropbox dice «algo cambio para estas cuentas» y nada mas — ni carpeta ni
       * archivo. Sin este id no hay forma de saber a que tenant escanear, y habria que escanearlos a
       * todos por cada aviso. Se completa al conectar, y para los ya conectados lo rellena solo el
       * primer escaneo que corra (ver `estadoDropboxCronService.ts`), sin pedirle nada a nadie.
       */
      accountId?: string;
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
     * Backup automático de la base a Dropbox (ver `services/backupService.ts`).
     *
     * Vive en el tenant y no en una variable de entorno para que se pueda cambiar desde la pantalla
     * —Documentos → DDBB → MongoDB— sin tocar el VPS ni reiniciar el proceso: el scheduler lee esto en
     * cada vuelta.
     */
    backup?: {
      /** Cada cuántas horas se genera una copia. */
      intervaloHoras?: number;
      /** Cuántas copias se conservan; las más viejas se borran al subir una nueva. */
      retener?: number;
      /** Cuándo terminó la última copia. Es lo que decide si toca una nueva, así que sobrevive a un reinicio. */
      ultimoBackupAt?: Date;
      ultimoError?: string;
      /**
       * La base donde quedó el clon de la última copia (`<prefijo>_<fecha>_<hora>`).
       *
       * Se guarda para poder BORRARLA cuando entre la siguiente. La alternativa era enumerar las bases
       * del cluster, y `listDatabases` pide permisos de admin que el usuario de la aplicación no tiene
       * en los tiers compartidos de Atlas: la limpieza fallaría y las copias se acumularían hasta
       * llenar la cuota.
       */
      ultimaBaseCopia?: string;
      /**
       * Cuál de los dos slots (`A`/`B`) tiene la copia buena.
       *
       * La próxima corrida escribe en el OTRO: mientras se llena, este sigue siendo una copia completa.
       * Reemplaza a la lógica vieja de borrar la anterior, que dejaba una ventana sin ninguna copia.
       */
      ultimoSlotOk?: "A" | "B";
    };
    /**
     * Usuario de clave fiscal con el que el SERVIDOR opera Simplificación Registral por su cuenta.
     *
     * ES OTRA COSA QUE `afip` DE ARRIBA. Aquel es un certificado X.509 para webservices (Consulta
     * Padrón A13): no tiene clave fiscal y no puede entrar a ninguna pantalla. Este es un login de
     * persona, porque la obra social de un trabajador NO la publica ningún webservice — solo aparece
     * precompletada en la pantalla de altas, adentro de una sesión con clave fiscal.
     *
     * ⚠ TIENE QUE SER UN USUARIO DELEGADO, NO EL DEL APODERADO.
     *
     * Una clave fiscal no está acotada a esta pantalla: abre presentación de DDJJ, VEP y pagos,
     * facturación electrónica, domicilio fiscal electrónico y el Administrador de Relaciones —que
     * permite delegarle servicios a otros CUIT—. Guardar la del apoderado convierte un servidor
     * comprometido en una identidad tributaria comprometida.
     *
     * Lo correcto, y lo que se asumió al construir esto, es un usuario de AFIP aparte al que se le
     * delegó ÚNICAMENTE «Simplificación Registral» desde Administrador de Relaciones. Así lo peor que
     * puede pasar es que alguien llegue a una pantalla de altas.
     *
     * La app no puede verificar qué servicios tiene delegados ese usuario: eso se controla en AFIP.
     * Por eso está escrito acá, donde lo va a leer quien mantenga esto.
     */
    arcaSimplificacion?: {
      /** CUIT del usuario delegado. No es el de la empleadora: es con el que se inicia sesión. */
      cuitUsuario?: string;
      /** Clave fiscal — cifrada en reposo con `secretCrypto`, igual que el resto de las credenciales. */
      claveEnc?: string;
      /**
       * Sesión de AFIP ya iniciada (`storageState` de Playwright), cifrada.
       *
       * Se guarda para no loguearse en cada corrida. Mientras dura es CASI tan poderosa como la
       * clave: quien la tenga entra sin contraseña. Por eso se cifra igual que la clave y no se
       * guarda en claro ni en un archivo suelto.
       */
      sesionEnc?: string;
      sesionGuardadaAt?: Date;
      /** Último login exitoso, para poder decir desde cuándo no entra. */
      ultimoLoginAt?: Date;
      /** Qué pasó la última vez, para que un fallo no haya que ir a buscarlo a los logs. */
      ultimoError?: string;
      /**
       * PRESENTACIÓN AUTOMÁTICA de las altas de cada día a las 14 h (ver `presentacionAutomatica.ts`).
       * Apagada por defecto: presenta en ARCA sin que nadie apriete nada, así que se prende a mano.
       */
      /** Validar la obra social sola al crear el contrato (cola + barrido). Prendida por defecto; se apaga en Configuración → ARCA → Conexión. */
      validacionAutomaticaObrasSociales?: { activa?: boolean };
      /**
       * DESCARGA AUTOMÁTICA DE CONSTANCIAS de alta temprana, una vez por día a la hora configurada
       * (ver `descargaConstanciasAutomatica.ts`). Apagada por defecto. Sólo lee en ARCA.
       */
      descargaConstancias?: {
        activa?: boolean;
        hora?: number;
        minuto?: number;
        ultimoDia?: string;
        ultimaCorrida?: any;
      };
      presentacionAutomatica?: {
        activa?: boolean;
        /** A qué hora corre (Argentina), cuántos días de anticipación y si la cola corre además cada N minutos. Ver `horarioAltasAutomaticas.ts`. */
        hora?: number;
        minuto?: number;
        diasAntes?: number;
        modo?: "diaria" | "frecuente";
        cadaMinutos?: number;
        /** "YYYY-MM-DD" del último día que corrió la corrida del día: no se repite en el mismo día. */
        ultimoDia?: string;
        /** Qué hizo la última corrida del día: por empresa, y lo que no se presentó con su motivo. */
        ultimaCorrida?: any;
        /** ISO de la última pasada de la cola (o de la corrida del día, que también la cuenta). */
        ultimaCola?: string;
        /** Qué hizo la última pasada de la cola (modo frecuente). */
        ultimaCorridaCola?: any;
      };
      /**
       * SINCRONIZACIÓN DE RELACIONES LABORALES: una vez por día lee en ARCA los movimientos (altas y
       * bajas) del mes de cada empleadora y actualiza `RelacionLaboralArca` y `AntiguedadArca`
       * (ver `services/arca/sincronizarRelaciones.ts`). Sólo lee; aun así se prende a mano.
       */
      sincronizacionRelaciones?: {
        activa?: boolean;
        /** "HH:MM" en hora argentina. Lejos de las 14:00 de la presentación de altas: comparten la sesión. */
        hora?: string;
        /** Cuántos meses hacia atrás se consultan (el actual incluido). */
        meses?: number;
        ultimoDia?: string;
        ultimaSync?: any;
        /** Reintento de la automática del día cuando falló (ver `sincronizacionRelacionesCronService`). */
        reintento?: { dia?: string; numero?: number; desde?: Date | null };
      };
    };
    /**
     * Casilla de correo que recibe las copias de "documento enviado" de Dropbox Sign (se activa en
     * Dropbox Sign → Configuración → Perfil → Notificaciones). Leyéndola se detecta qué contratos ya
     * se enviaron a firmar, para moverlos de "Outbox" a "Pendbox" sin que nadie toque archivos.
     */
    dropboxSign?: {
      /** Casilla que recibe las notificaciones (ej. framerecursoshumanos@gmail.com). Es también el CC obligatorio de cada envío del bot. */
      email?: string;
      /**
       * EL BOT QUE ENVÍA A LA FIRMA (ver `services/dropboxSignBot/`): un Chromium del servidor que opera
       * app.sign.dropbox.com como una persona (el plan Essentials no incluye la API). Credenciales y
       * sesión cifradas igual que las de ARCA; el throttle existe porque la web corta a los ~55-60
       * envíos por día.
       */
      bot?: {
        loginEmail?: string;
        loginPasswordEnc?: string;
        /** `storageState` de Playwright, cifrado. */
        sesionEnc?: string;
        sesionGuardadaAt?: Date;
        envio?: {
          activo?: boolean;
          tamanoTanda?: number;
          intervaloHoras?: number;
          topeDiario?: number;
          enfriamientoHoras?: number;
          horaDesde?: number;
          horaHasta?: number;
        };
        /** Enviados en el día (fecha AR, YYYY-MM-DD). */
        contadorDia?: { fecha?: string; enviados?: number };
        /** Hasta cuándo no se reintenta después del freno antiabuso de Dropbox Sign. */
        enfriadoHasta?: Date | null;
        ultimoLoginAt?: Date | null;
        /** Cuándo arrancó la última corrida (es el candado entre procesos del scheduler). */
        ultimaCorridaAt?: Date | null;
        ultimoError?: string | null;
        /** Resumen de la última tanda. */
        ultimaCorrida?: any;
        /** Las reglas de colocación de la firma editadas por el tenant (ver `compartido/reglasColocacionFirma.ts`). Sin esto rige el catálogo. */
        reglasColocacion?: any[];
        reglasColocacionAt?: Date | null;
        /** Cuándo cambiaron las reglas por última vez (también al volver al catálogo): una verificación anterior queda desactualizada. */
        reglasCambiadasAt?: Date | null;
        ordenManual?: boolean;
        /** Última vez que el bot abrió Dropbox Sign: si llegó al listado y cómo, o por qué no (ver `navegador.ts`). */
        conexion?: { estado: "ok" | "caida"; probadaAt: Date; via: string; pantalla: string; detalle: string } | null;
      };
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
      /** Última «Probar conexión» de la casilla (sólo conecta y cuenta avisos). */
      conexionAt?: Date | null;
      conexionOk?: boolean | null;
      conexionDetalle?: string;
      /** Rescatar del adjunto del email los firmados que la integración de Dropbox no depositó (default true). */
      rescatarFirmados?: boolean;
      ultimoRescate?: { at?: Date; archivos?: number } | null;
      /**
       * Historial de lecturas, de la más reciente a la más vieja. Solo se guardan las corridas que
       * encontraron algo o que fallaron: el job corre cada 5 minutos y la mayoría no tiene nada que
       * informar. Se conservan las últimas 50.
       */
      lastCheckHistorial?: {
        at: Date;
        ok: boolean;
        detalle?: string;
        logs?: {
          resultado: "archivado" | "duplicado" | "sin-archivo" | "ignorado" | "error";
          asunto?: string;
          archivo?: string;
          cuit?: string;
          documento?: string;
          detalle?: string;
        }[];
      }[];
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
      registroDiasLinkMovil: { type: Number, default: 7, min: 1, max: 365 },
    },

    integrations: {
      dropbox: {
        appKey: { type: String },
        appSecretEnc: { type: String },
        refreshTokenEnc: { type: String },
        rootPath: { type: String, default: "/HelloSign" },
        accountEmail: { type: String },
        // Índice: el webhook llega con el account_id y hay que resolver el tenant en cada notificación.
        accountId: { type: String, index: true },
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
      // Backup automático de la base a Dropbox. Ver el comentario en la interfaz, arriba.
      backup: {
        intervaloHoras: { type: Number, default: 12 },
        retener: { type: Number, default: 14 },
        ultimoBackupAt: { type: Date },
        ultimoError: { type: String },
        ultimaBaseCopia: { type: String },
        ultimoSlotOk: { type: String, enum: ["A", "B"] },
      },
      // Usuario DELEGADO de clave fiscal para operar Simplificación Registral. Ver el comentario
      // largo en la interfaz, arriba: no puede ser el del apoderado.
      arcaSimplificacion: {
        cuitUsuario: { type: String },
        claveEnc: { type: String },
        sesionEnc: { type: String },
        sesionGuardadaAt: { type: Date },
        ultimoLoginAt: { type: Date },
        ultimoError: { type: String },
        validacionAutomaticaObrasSociales: {
          activa: { type: Boolean, default: true },
        },
        descargaConstancias: {
          activa: { type: Boolean, default: false },
          hora: { type: Number },
          minuto: { type: Number },
          ultimoDia: { type: String },
          ultimaCorrida: { type: Schema.Types.Mixed },
        },
        presentacionAutomatica: {
          activa: { type: Boolean, default: false },
          // Declarados a propósito: el esquema es `strict`, y un `$set` sobre un camino que no está
          // acá Mongoose lo descarta en silencio (la hora configurada no se guardaba).
          hora: { type: Number },
          minuto: { type: Number },
          diasAntes: { type: Number },
          modo: { type: String },
          cadaMinutos: { type: Number },
          ultimoDia: { type: String },
          ultimaCorrida: { type: Schema.Types.Mixed },
          ultimaCola: { type: String },
          ultimaCorridaCola: { type: Schema.Types.Mixed },
        },
        sincronizacionRelaciones: {
          activa: { type: Boolean, default: false },
          hora: { type: String },
          meses: { type: Number },
          ultimoDia: { type: String },
          ultimaSync: { type: Schema.Types.Mixed },
          // Declarado a propósito (el esquema es `strict`): el reintento de la automática del día.
          reintento: { dia: { type: String }, numero: { type: Number }, desde: { type: Date } },
        },
      },
      dropboxSign: {
        email: { type: String },
        // Declarados a propósito (el esquema es `strict`): el bot de envío a la firma.
        bot: {
          loginEmail: { type: String },
          loginPasswordEnc: { type: String },
          sesionEnc: { type: String },
          sesionGuardadaAt: { type: Date },
          envio: {
            activo: { type: Boolean, default: false },
            tamanoTanda: { type: Number, default: 10 },
            intervaloHoras: { type: Number, default: 4 },
            topeDiario: { type: Number, default: 40 },
            enfriamientoHoras: { type: Number, default: 6 },
            horaDesde: { type: Number, default: 8 },
            horaHasta: { type: Number, default: 22 },
          },
          contadorDia: { fecha: { type: String }, enviados: { type: Number, default: 0 } },
          enfriadoHasta: { type: Date, default: null },
          ultimoLoginAt: { type: Date, default: null },
          ultimaCorridaAt: { type: Date, default: null },
          ultimoError: { type: String, default: null },
          ultimaCorrida: { type: Schema.Types.Mixed },
          reglasColocacion: { type: Schema.Types.Mixed },
          reglasColocacionAt: { type: Date, default: null },
          reglasCambiadasAt: { type: Date, default: null },
          // La cola se reordenó a mano (25/10/2026): la pantalla lo dice y ofrece volver al orden automático.
          ordenManual: { type: Boolean, default: false },
          conexion: { type: Schema.Types.Mixed, default: null },
        },
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
        conexionAt: { type: Date, default: null },
        conexionOk: { type: Boolean, default: null },
        conexionDetalle: { type: String, default: "" },
        rescatarFirmados: { type: Boolean, default: true },
        ultimoRescate: { at: { type: Date }, archivos: { type: Number } },
        lastCheckHistorial: [
          {
            _id: false,
            at: { type: Date },
            ok: { type: Boolean },
            detalle: { type: String },
            logs: [
              {
                _id: false,
                resultado: { type: String },
                asunto: { type: String },
                archivo: { type: String },
                cuit: { type: String },
                documento: { type: String },
                detalle: { type: String },
              },
            ],
          },
        ],
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

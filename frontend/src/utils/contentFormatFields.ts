import { ContentFormat, Platform } from "../types/post";

export type FieldType = "text" | "textarea" | "number" | "select" | "multiselect" | "tags" | "url" | "datetime";

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  hint?: string;
  required: boolean;
  maxLength?: number;
  minLength?: number;
  rows?: number;
  options?: { value: string; label: string }[];
  validation?: (value: any) => boolean;
  errorMessage?: string;
  supportsHashtags?: boolean;
  supportsMentions?: boolean;
  symbolRequired?: boolean;
}

export interface FormatFieldsConfig {
  fields: FieldConfig[];
  description: string;
  tips: string[];
}

export const CONTENT_FORMAT_FIELDS: Record<ContentFormat, FormatFieldsConfig> = {
  post: {
    description: "Publicación estándar con imágenes y texto para redes sociales",
    tips: [
      "Puedes subir hasta 10 imágenes en formato carrusel",
      "El texto se adapta al límite de cada plataforma seleccionada",
      "Usa hashtags relevantes para aumentar el alcance",
    ],
    fields: [
      {
        name: "title",
        label: "Título del Post",
        type: "text",
        placeholder: "Ej: Lanzamiento de nuestra nueva colección",
        hint: "Un título descriptivo que identifique este post internamente",
        required: true,
        maxLength: 200,
      },
      {
        name: "caption",
        label: "Caption / Descripción",
        type: "textarea",
        placeholder: "Escribe el texto principal de tu publicación...",
        hint: "El texto que acompañará las imágenes. Puedes incluir emojis, hashtags y menciones directamente en el texto.",
        required: true,
        rows: 10,
        supportsHashtags: true,
        supportsMentions: true,
      },
      {
        name: "hashtags",
        label: "Hashtags",
        type: "tags",
        placeholder: "marketing, diseño, tendencias",
        hint: "Escribe solo el texto sin el símbolo #. Ejemplo: marketing, diseño, tendencias",
        required: false,
        supportsHashtags: true,
        symbolRequired: false,
      },
      {
        name: "mentions",
        label: "Menciones",
        type: "tags",
        placeholder: "usuario, marca, colaborador",
        hint: "Escribe solo el nombre de usuario sin el símbolo @. Ejemplo: usuario, marca, colaborador",
        required: false,
        supportsMentions: true,
        symbolRequired: false,
      },
    ],
  },

  reel: {
    description: "Video corto vertical con música y efectos",
    tips: [
      "Formato vertical 9:16 recomendado",
      "Duración óptima: 15-90 segundos",
      "Agrega música popular para mayor alcance",
    ],
    fields: [
      {
        name: "title",
        label: "Título del Reel",
        type: "text",
        placeholder: "Ej: Tutorial rápido de maquillaje",
        hint: "Título que describa el contenido del reel",
        required: true,
        maxLength: 150,
      },
      {
        name: "caption",
        label: "Caption",
        type: "textarea",
        placeholder: "Describe tu reel y anima a la audiencia...",
        hint: "Texto breve y llamativo. Los primeros 125 caracteres son visibles sin expandir.",
        required: true,
        rows: 6,
        maxLength: 2200,
        supportsHashtags: true,
        supportsMentions: true,
      },
      {
        name: "coverText",
        label: "Texto de Portada",
        type: "text",
        placeholder: "Texto que aparece en la miniatura",
        hint: "Texto breve que capte la atención en la portada del reel",
        required: false,
        maxLength: 50,
      },
      {
        name: "hashtags",
        label: "Hashtags",
        type: "tags",
        placeholder: "reels, tutorial, viral",
        hint: "Sin el símbolo #. Usa hashtags populares y relevantes para reels. Ejemplo: reels, tutorial, viral",
        required: false,
        supportsHashtags: true,
        symbolRequired: false,
      },
      {
        name: "mentions",
        label: "Colaboradores / Menciones",
        type: "tags",
        placeholder: "creador, marca",
        hint: "Sin el símbolo @. Menciona colaboradores o marcas asociadas. Ejemplo: creador, marca",
        required: false,
        supportsMentions: true,
        symbolRequired: false,
      },
    ],
  },

  story: {
    description: "Historia temporal (24h) con contenido efímero e interactivo",
    tips: [
      "Las historias desaparecen después de 24 horas",
      "Formato vertical 9:16 obligatorio",
      "Usa stickers, encuestas y enlaces para mayor interacción",
    ],
    fields: [
      {
        name: "title",
        label: "Nombre de la Historia",
        type: "text",
        placeholder: "Ej: Promoción del día",
        hint: "Nombre interno para identificar esta historia",
        required: true,
        maxLength: 100,
      },
      {
        name: "overlayText",
        label: "Texto Superpuesto",
        type: "textarea",
        placeholder: "Texto que aparecerá sobre la imagen/video...",
        hint: "Texto corto y llamativo que se mostrará en la historia. Mantén mensajes breves y claros.",
        required: false,
        rows: 4,
        maxLength: 250,
      },
      {
        name: "callToAction",
        label: "Call to Action (CTA)",
        type: "text",
        placeholder: "Ver más, Comprar ahora, Desliza hacia arriba",
        hint: "Acción que quieres que realice tu audiencia",
        required: false,
        maxLength: 50,
      },
      {
        name: "linkUrl",
        label: "Enlace (Swipe Up / Link Sticker)",
        type: "url",
        placeholder: "https://ejemplo.com/oferta",
        hint: "URL a la que dirigirás a tu audiencia (requiere cuenta verificada o mínimo de seguidores)",
        required: false,
      },
      {
        name: "mentions",
        label: "Menciones",
        type: "tags",
        placeholder: "usuario, marca",
        hint: "Sin el símbolo @. Usuarios o marcas a mencionar en la historia. Ejemplo: usuario, marca",
        required: false,
        supportsMentions: true,
        symbolRequired: false,
      },
    ],
  },

  video: {
    description: "Video horizontal de formato largo con descripción detallada",
    tips: [
      "Formato 16:9 (horizontal) recomendado",
      "Agrega capítulos para videos largos",
      "Optimiza el título para SEO",
    ],
    fields: [
      {
        name: "title",
        label: "Título del Video",
        type: "text",
        placeholder: "Ej: Cómo crear contenido viral en 2024",
        hint: "Título optimizado para búsqueda. Incluye palabras clave relevantes.",
        required: true,
        maxLength: 100,
      },
      {
        name: "description",
        label: "Descripción del Video",
        type: "textarea",
        placeholder: "Describe detalladamente el contenido del video...",
        hint: "Descripción completa con enlaces, timestamps y contexto. Primeras líneas son las más visibles.",
        required: true,
        rows: 12,
        maxLength: 5000,
        supportsHashtags: true,
      },
      {
        name: "category",
        label: "Categoría",
        type: "select",
        placeholder: "Selecciona una categoría",
        hint: "Ayuda a clasificar el contenido",
        required: false,
        options: [
          { value: "education", label: "Educación" },
          { value: "entertainment", label: "Entretenimiento" },
          { value: "howto", label: "Tutorial / Cómo hacer" },
          { value: "technology", label: "Tecnología" },
          { value: "lifestyle", label: "Estilo de vida" },
          { value: "business", label: "Negocios" },
          { value: "sports", label: "Deportes" },
          { value: "other", label: "Otro" },
        ],
      },
      {
        name: "hashtags",
        label: "Hashtags / Tags",
        type: "tags",
        placeholder: "marketing, youtube, tutorial",
        hint: "Sin el símbolo #. Ayudan en la búsqueda y descubrimiento del video. Ejemplo: marketing, youtube, tutorial",
        required: false,
        supportsHashtags: true,
        symbolRequired: false,
      },
    ],
  },

  short: {
    description: "Video corto vertical estilo TikTok/YouTube Shorts",
    tips: [
      "Formato vertical 9:16 obligatorio",
      "Duración máxima: 60 segundos",
      "Hook en los primeros 3 segundos",
    ],
    fields: [
      {
        name: "title",
        label: "Título del Short",
        type: "text",
        placeholder: "Ej: 3 trucos de productividad",
        hint: "Título breve y llamativo que capture la atención",
        required: true,
        maxLength: 100,
      },
      {
        name: "description",
        label: "Descripción",
        type: "textarea",
        placeholder: "Describe tu short de forma breve...",
        hint: "Descripción corta y directa. Incluye call-to-action si es necesario.",
        required: true,
        rows: 6,
        maxLength: 1000,
        supportsHashtags: true,
      },
      {
        name: "hookText",
        label: "Hook / Gancho inicial",
        type: "text",
        placeholder: "¿Sabías que...? No vas a creer esto",
        hint: "Frase inicial que aparecerá en pantalla para captar atención inmediata",
        required: false,
        maxLength: 100,
      },
      {
        name: "hashtags",
        label: "Hashtags",
        type: "tags",
        placeholder: "shorts, viral, tips",
        hint: "Sin el símbolo #. Usa hashtags trending y específicos para shorts. Ejemplo: shorts, viral, tips",
        required: false,
        supportsHashtags: true,
        symbolRequired: false,
      },
    ],
  },

  article: {
    description: "Artículo largo profesional con formato enriquecido",
    tips: [
      "Ideal para contenido profesional y thought leadership",
      "Usa subtítulos para mejor lectura",
      "Incluye datos y referencias cuando sea posible",
    ],
    fields: [
      {
        name: "title",
        label: "Título del Artículo",
        type: "text",
        placeholder: "Ej: El futuro del marketing digital en 2024",
        hint: "Título principal del artículo. Debe ser claro y profesional.",
        required: true,
        maxLength: 150,
      },
      {
        name: "subtitle",
        label: "Subtítulo / Bajada",
        type: "text",
        placeholder: "Un resumen breve del contenido principal",
        hint: "Texto complementario que amplía el título",
        required: false,
        maxLength: 200,
      },
      {
        name: "summary",
        label: "Resumen Ejecutivo",
        type: "textarea",
        placeholder: "Resume los puntos clave del artículo...",
        hint: "Resumen breve que aparecerá antes del contenido completo",
        required: false,
        rows: 4,
        maxLength: 500,
      },
      {
        name: "body",
        label: "Contenido del Artículo",
        type: "textarea",
        placeholder: "Escribe el contenido completo de tu artículo...",
        hint: "Contenido completo con párrafos bien estructurados. Puedes usar formato markdown si la plataforma lo soporta.",
        required: true,
        rows: 20,
        maxLength: 125000,
      },
      {
        name: "hashtags",
        label: "Hashtags / Topics",
        type: "tags",
        placeholder: "marketing, negocio, liderazgo",
        hint: "Sin el símbolo #. Topics profesionales relacionados con el artículo. Ejemplo: marketing, negocio, liderazgo",
        required: false,
        supportsHashtags: true,
        symbolRequired: false,
      },
    ],
  },

  thread: {
    description: "Hilo de tweets conectados para narrativas largas",
    tips: [
      "Cada tweet tiene máximo 280 caracteres",
      "Numera los tweets para mejor seguimiento (1/n, 2/n, etc.)",
      "El primer tweet debe enganchar a la audiencia",
    ],
    fields: [
      {
        name: "title",
        label: "Título del Thread",
        type: "text",
        placeholder: "Ej: 10 lecciones sobre emprendimiento",
        hint: "Nombre interno para identificar este hilo de tweets",
        required: true,
        maxLength: 100,
      },
      {
        name: "tweet1",
        label: "Tweet 1 (Inicial)",
        type: "textarea",
        placeholder: "El primer tweet debe captar la atención...",
        hint: "Tweet inicial del hilo. Debe generar interés para seguir leyendo. Máximo 280 caracteres.",
        required: true,
        rows: 3,
        maxLength: 280,
        supportsHashtags: true,
        supportsMentions: true,
      },
      {
        name: "threadContent",
        label: "Contenido del Thread (Tweets 2+)",
        type: "textarea",
        placeholder: "Escribe los tweets siguientes, separados por saltos de línea dobles...\n\nCada párrafo será un tweet...",
        hint: "Cada párrafo (separado por línea en blanco) será un tweet independiente. Máximo 280 caracteres por tweet.",
        required: true,
        rows: 15,
      },
      {
        name: "conclusion",
        label: "Tweet Final / Conclusión",
        type: "textarea",
        placeholder: "Cierra el thread con una conclusión o call to action...",
        hint: "Último tweet del hilo. Puede incluir CTA, resumen o agradecimiento. Máximo 280 caracteres.",
        required: false,
        rows: 3,
        maxLength: 280,
        supportsHashtags: true,
        supportsMentions: true,
      },
      {
        name: "hashtags",
        label: "Hashtags (para todo el thread)",
        type: "tags",
        placeholder: "thread, Twitter, tips",
        hint: "Sin el símbolo #. Se aplicarán en tweets donde haya espacio disponible. Ejemplo: thread, Twitter, tips",
        required: false,
        supportsHashtags: true,
        symbolRequired: false,
      },
      {
        name: "mentions",
        label: "Menciones",
        type: "tags",
        placeholder: "usuario, colaborador",
        hint: "Sin el símbolo @. Usuarios a mencionar en el thread. Ejemplo: usuario, colaborador",
        required: false,
        supportsMentions: true,
        symbolRequired: false,
      },
    ],
  },
};

export function getFieldsForFormat(format: ContentFormat): FieldConfig[] {
  return CONTENT_FORMAT_FIELDS[format]?.fields || [];
}

export function getFormatDescription(format: ContentFormat): string {
  return CONTENT_FORMAT_FIELDS[format]?.description || "";
}

export function getFormatTips(format: ContentFormat): string[] {
  return CONTENT_FORMAT_FIELDS[format]?.tips || [];
}

export function validateFieldValue(field: FieldConfig, value: any): { valid: boolean; error?: string } {
  if (field.required && (!value || (typeof value === "string" && !value.trim()))) {
    return { valid: false, error: `${field.label} es obligatorio` };
  }

  if (field.maxLength && typeof value === "string" && value.length > field.maxLength) {
    return { valid: false, error: `${field.label} no puede exceder ${field.maxLength} caracteres` };
  }

  if (field.minLength && typeof value === "string" && value.length < field.minLength) {
    return { valid: false, error: `${field.label} debe tener al menos ${field.minLength} caracteres` };
  }

  if (field.type === "url" && value && typeof value === "string") {
    try {
      new URL(value);
    } catch {
      return { valid: false, error: "URL no válida" };
    }
  }

  if (field.validation && !field.validation(value)) {
    return { valid: false, error: field.errorMessage || "Valor no válido" };
  }

  return { valid: true };
}

export function getCharacterLimit(format: ContentFormat, platforms: Platform[]): number {
  const formatConfig = CONTENT_FORMAT_FIELDS[format];
  if (!formatConfig) return 2200;

  const captionField = formatConfig.fields.find(f => f.name === "caption" || f.name === "description" || f.name === "body");
  if (captionField?.maxLength) return captionField.maxLength;

  const limits: Record<Platform, number> = {
    twitter: 280,
    instagram: 2200,
    facebook: 63206,
    linkedin: 3000,
    tiktok: 2200,
    youtube: 5000,
  };

  if (platforms.length === 0) return 2200;

  const selectedLimits = platforms.map(p => limits[p]).filter(Boolean);
  return selectedLimits.length > 0 ? Math.min(...selectedLimits) : 2200;
}

import { PostType, SocialChannel, Channel } from "../models/Post.js";

export interface ChannelMetadata {
  name: string;
  description: string;
  maxCharacters?: number;
  supportedMediaTypes: ("image" | "video" | "carousel")[];
  aspectRatios?: string[];
  maxMediaCount?: number;
  supportsHashtags: boolean;
  supportsMentions: boolean;
  requiredFields?: string[];
}

export const SOCIAL_CHANNELS: Record<SocialChannel, ChannelMetadata> = {
  instagram_post: {
    name: "Instagram Post",
    description: "Post estándar de Instagram",
    maxCharacters: 2200,
    supportedMediaTypes: ["image", "video", "carousel"],
    aspectRatios: ["1:1", "4:5", "16:9"],
    maxMediaCount: 10,
    supportsHashtags: true,
    supportsMentions: true,
  },
  instagram_reel: {
    name: "Instagram Reel",
    description: "Video corto vertical de Instagram",
    maxCharacters: 2200,
    supportedMediaTypes: ["video"],
    aspectRatios: ["9:16"],
    maxMediaCount: 1,
    supportsHashtags: true,
    supportsMentions: true,
  },
  instagram_story: {
    name: "Instagram Story",
    description: "Historia temporal de Instagram (24h)",
    maxCharacters: 2200,
    supportedMediaTypes: ["image", "video"],
    aspectRatios: ["9:16"],
    maxMediaCount: 1,
    supportsHashtags: true,
    supportsMentions: true,
  },
  facebook_post: {
    name: "Facebook Post",
    description: "Publicación estándar de Facebook",
    maxCharacters: 63206,
    supportedMediaTypes: ["image", "video", "carousel"],
    aspectRatios: ["1:1", "16:9", "4:5"],
    maxMediaCount: 10,
    supportsHashtags: true,
    supportsMentions: true,
  },
  facebook_reel: {
    name: "Facebook Reel",
    description: "Video corto vertical de Facebook",
    maxCharacters: 2200,
    supportedMediaTypes: ["video"],
    aspectRatios: ["9:16"],
    maxMediaCount: 1,
    supportsHashtags: true,
    supportsMentions: true,
  },
  facebook_story: {
    name: "Facebook Story",
    description: "Historia temporal de Facebook (24h)",
    maxCharacters: 2200,
    supportedMediaTypes: ["image", "video"],
    aspectRatios: ["9:16"],
    maxMediaCount: 1,
    supportsHashtags: true,
    supportsMentions: true,
  },
  linkedin_post: {
    name: "LinkedIn Post",
    description: "Publicación estándar de LinkedIn",
    maxCharacters: 3000,
    supportedMediaTypes: ["image", "video"],
    aspectRatios: ["1:1", "16:9"],
    maxMediaCount: 9,
    supportsHashtags: true,
    supportsMentions: true,
  },
  linkedin_article: {
    name: "LinkedIn Article",
    description: "Artículo largo de LinkedIn",
    maxCharacters: 125000,
    supportedMediaTypes: ["image"],
    aspectRatios: ["16:9", "1:1"],
    supportsHashtags: true,
    supportsMentions: true,
  },
  tiktok_post: {
    name: "TikTok Post",
    description: "Video de TikTok",
    maxCharacters: 2200,
    supportedMediaTypes: ["video"],
    aspectRatios: ["9:16"],
    maxMediaCount: 1,
    supportsHashtags: true,
    supportsMentions: true,
  },
  tiktok_story: {
    name: "TikTok Story",
    description: "Historia temporal de TikTok",
    maxCharacters: 2200,
    supportedMediaTypes: ["image", "video"],
    aspectRatios: ["9:16"],
    maxMediaCount: 1,
    supportsHashtags: true,
    supportsMentions: true,
  },
  youtube_short: {
    name: "YouTube Short",
    description: "Video corto vertical de YouTube",
    maxCharacters: 5000,
    supportedMediaTypes: ["video"],
    aspectRatios: ["9:16"],
    maxMediaCount: 1,
    supportsHashtags: true,
    supportsMentions: false,
  },
  youtube_video: {
    name: "YouTube Video",
    description: "Video estándar de YouTube",
    maxCharacters: 5000,
    supportedMediaTypes: ["video"],
    aspectRatios: ["16:9"],
    maxMediaCount: 1,
    supportsHashtags: true,
    supportsMentions: false,
  },
  twitter_post: {
    name: "Twitter/X Post",
    description: "Tweet estándar",
    maxCharacters: 280,
    supportedMediaTypes: ["image", "video"],
    aspectRatios: ["16:9", "1:1"],
    maxMediaCount: 4,
    supportsHashtags: true,
    supportsMentions: true,
  },
  twitter_thread: {
    name: "Twitter/X Thread",
    description: "Hilo de tweets",
    maxCharacters: 280,
    supportedMediaTypes: ["image", "video"],
    aspectRatios: ["16:9", "1:1"],
    maxMediaCount: 4,
    supportsHashtags: true,
    supportsMentions: true,
  },
};

export const CHANNEL_CATEGORIES = {
  social: {
    name: "Redes Sociales",
    description: "Publicaciones para plataformas de redes sociales",
    icon: "share-2",
    channels: [
      "instagram_post",
      "instagram_reel",
      "instagram_story",
      "facebook_post",
      "facebook_reel",
      "facebook_story",
      "linkedin_post",
      "linkedin_article",
      "tiktok_post",
      "tiktok_story",
      "youtube_short",
      "youtube_video",
      "twitter_post",
      "twitter_thread",
    ] as SocialChannel[],
  },
  email: {
    name: "Email Marketing",
    description: "Campañas de email y newsletters",
    icon: "mail",
    channels: ["email"] as Channel[],
    requiredFields: ["subject", "body", "recipients"],
  },
  push: {
    name: "Push Notifications",
    description: "Notificaciones push para aplicaciones",
    icon: "bell",
    channels: ["push_notification"] as Channel[],
    requiredFields: ["title", "body"],
  },
};

export function getChannelMetadata(channel: Channel): ChannelMetadata | null {
  if (channel in SOCIAL_CHANNELS) {
    return SOCIAL_CHANNELS[channel as SocialChannel];
  }

  if (channel === "email") {
    return {
      name: "Email",
      description: "Correo electrónico",
      supportedMediaTypes: ["image"],
      supportsHashtags: false,
      supportsMentions: false,
      requiredFields: ["subject", "body", "recipients"],
    };
  }

  if (channel === "push_notification") {
    return {
      name: "Push Notification",
      description: "Notificación push",
      maxCharacters: 240,
      supportedMediaTypes: ["image"],
      supportsHashtags: false,
      supportsMentions: false,
      requiredFields: ["title", "body"],
    };
  }

  return null;
}

export function getPostTypeFromChannel(channel: Channel): PostType {
  if (channel === "email") return "email";
  if (channel === "push_notification") return "push";
  return "social";
}

export function validateChannelConfig(postType: PostType, channelConfig: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (postType === "email") {
    if (!channelConfig.subject) errors.push("Subject is required for email");
    if (!channelConfig.body) errors.push("Body is required for email");
    if (!channelConfig.recipients || !Array.isArray(channelConfig.recipients) || channelConfig.recipients.length === 0) {
      errors.push("At least one recipient is required for email");
    }
  }

  if (postType === "push") {
    if (!channelConfig.title) errors.push("Title is required for push notification");
    if (!channelConfig.body) errors.push("Body is required for push notification");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

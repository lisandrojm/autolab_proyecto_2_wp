export type PostType = "social" | "email" | "push";

export type ContentFormat = "post" | "reel" | "story" | "video" | "short" | "article" | "thread";

export type Platform = "instagram" | "facebook" | "linkedin" | "tiktok" | "youtube" | "twitter";

export type SocialChannel =
  | "instagram_post"
  | "instagram_reel"
  | "instagram_story"
  | "facebook_post"
  | "facebook_reel"
  | "facebook_story"
  | "linkedin_post"
  | "linkedin_article"
  | "tiktok_post"
  | "tiktok_story"
  | "youtube_short"
  | "youtube_video"
  | "twitter_post"
  | "twitter_thread";

export type Channel = SocialChannel | "email" | "push_notification";

export interface EmailConfig {
  subject: string;
  body: string;
  bodyHtml?: string;
  recipients: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  attachments?: { name: string; url: string; type: string }[];
}

export interface PushConfig {
  title: string;
  body: string;
  icon?: string;
  imageUrl?: string;
  clickAction?: string;
  deepLink?: string;
  badge?: number;
  sound?: string;
  priority?: "high" | "normal" | "low";
  segmentation?: {
    userIds?: string[];
    tags?: string[];
    allUsers?: boolean;
  };
}

export type ChannelConfig = EmailConfig | PushConfig | Record<string, any>;

export interface Post {
  _id: string;
  tenantId: string;
  campaignId: string;
  clientId: string;
  title: string;
  postType: PostType;
  channel?: Channel;
  channels?: Channel[];
  contentFormat?: ContentFormat;
  channelConfig?: ChannelConfig;
  content: {
    copy: string;
    hashtags: string[];
    mentions: string[];
  };
  media: {
    type: "image" | "video" | "carousel";
    urls: string[];
    alt?: string;
    assetIds?: string[];
  }[];
  usedAssets: string[];
  platforms: Platform[];
  scheduling: {
    publishAt?: string;
    timezone: string;
    isScheduled: boolean;
    recurrence?: {
      enabled: boolean;
      frequency: "daily" | "weekly" | "monthly" | "yearly";
      interval: number;
      daysOfWeek?: number[];
      dayOfMonth?: number;
      endDate?: string;
      endAfterOccurrences?: number;
    };
  };
  status: "draft" | "pending_approval" | "approved" | "rejected" | "scheduled" | "published";
  approvals: {
    userId: string;
    status: "pending" | "approved" | "rejected";
    feedback?: string;
    decidedAt?: string;
  }[];
  analytics: {
    impressions: number;
    engagement: number;
    clicks: number;
    shares: number;
    lastUpdated?: string;
  };
  createdBy: string;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
  usuarios?: { id: string; email: string; permiso: "ver" | "editar" }[];
}

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

export interface ChannelCategory {
  name: string;
  description: string;
  icon: string;
  channels: Channel[];
  requiredFields?: string[];
}

export interface FormatMetadata {
  name: string;
  description: string;
  platforms: Platform[];
  icon: string;
  maxCharacters?: number;
  aspectRatios?: string[];
  supportedMediaTypes: ("image" | "video" | "carousel")[];
}

export const CONTENT_FORMATS: Record<ContentFormat, FormatMetadata> = {
  post: {
    name: "Post",
    description: "Publicación estándar con imágenes y texto",
    platforms: ["instagram", "facebook", "linkedin", "twitter"],
    icon: "file-text",
    maxCharacters: 280,
    aspectRatios: ["1:1", "4:5", "16:9"],
    supportedMediaTypes: ["image", "carousel"],
  },
  reel: {
    name: "Reel",
    description: "Video corto vertical",
    platforms: ["instagram", "facebook"],
    icon: "video",
    maxCharacters: 2200,
    aspectRatios: ["9:16"],
    supportedMediaTypes: ["video"],
  },
  story: {
    name: "Story",
    description: "Historia temporal (24h)",
    platforms: ["instagram", "facebook", "tiktok"],
    icon: "circle",
    maxCharacters: 2200,
    aspectRatios: ["9:16"],
    supportedMediaTypes: ["image", "video"],
  },
  video: {
    name: "Video",
    description: "Video horizontal de formato largo",
    platforms: ["youtube", "facebook", "linkedin", "instagram", "twitter"],
    icon: "film",
    maxCharacters: 5000,
    aspectRatios: ["16:9"],
    supportedMediaTypes: ["video"],
  },
  short: {
    name: "Short",
    description: "Video corto vertical",
    platforms: ["youtube", "tiktok"],
    icon: "smartphone",
    maxCharacters: 5000,
    aspectRatios: ["9:16"],
    supportedMediaTypes: ["video"],
  },
  article: {
    name: "Article",
    description: "Artículo de formato largo",
    platforms: ["linkedin"],
    icon: "book-open",
    maxCharacters: 125000,
    aspectRatios: ["16:9", "1:1"],
    supportedMediaTypes: ["image"],
  },
  thread: {
    name: "Thread",
    description: "Hilo de publicaciones conectadas",
    platforms: ["twitter"],
    icon: "list",
    maxCharacters: 280,
    aspectRatios: ["16:9", "1:1"],
    supportedMediaTypes: ["image", "video"],
  },
};

export const CHANNEL_CATEGORIES: Record<string, ChannelCategory> = {
  social: {
    name: "Redes Sociales",
    description: "",
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
    description: "",
    icon: "mail",
    channels: ["email"] as Channel[],
    requiredFields: ["subject", "body", "recipients"],
  },
  push: {
    name: "Push App",
    description: "",
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

export function getChannelDisplayName(channel: Channel): string {
  const metadata = getChannelMetadata(channel);
  return metadata?.name || channel;
}

export function getChannelIcon(channel: Channel): string {
  if (channel.startsWith("instagram")) return "instagram";
  if (channel.startsWith("facebook")) return "facebook";
  if (channel.startsWith("linkedin")) return "linkedin";
  if (channel.startsWith("tiktok")) return "music";
  if (channel.startsWith("youtube")) return "youtube";
  if (channel.startsWith("twitter")) return "twitter";
  if (channel === "email") return "mail";
  if (channel === "push_notification") return "bell";
  return "share-2";
}

export function getFormatFromChannel(channel: Channel): ContentFormat | null {
  if (channel.includes("_post")) return "post";
  if (channel.includes("_reel")) return "reel";
  if (channel.includes("_story")) return "story";
  if (channel.includes("_video")) return "video";
  if (channel.includes("_short")) return "short";
  if (channel.includes("_article")) return "article";
  if (channel.includes("_thread")) return "thread";
  return null;
}

export function getPlatformFromChannel(channel: Channel): Platform | null {
  if (channel.startsWith("instagram")) return "instagram";
  if (channel.startsWith("facebook")) return "facebook";
  if (channel.startsWith("linkedin")) return "linkedin";
  if (channel.startsWith("tiktok")) return "tiktok";
  if (channel.startsWith("youtube")) return "youtube";
  if (channel.startsWith("twitter")) return "twitter";
  return null;
}

export function buildChannelFromFormatAndPlatform(format: ContentFormat, platform: Platform): Channel | null {
  const channelKey = `${platform}_${format}` as Channel;
  if (channelKey in SOCIAL_CHANNELS) {
    return channelKey;
  }
  return null;
}

export function getCompatiblePlatforms(format: ContentFormat): Platform[] {
  return CONTENT_FORMATS[format]?.platforms || [];
}

export function getPlatformMaxCharacters(platforms: Platform[]): number {
  const limits: Record<Platform, number> = {
    twitter: 280,
    instagram: 2200,
    facebook: 63206,
    linkedin: 3000,
    tiktok: 2200,
    youtube: 5000,
  };

  const selectedLimits = platforms.map(p => limits[p]).filter(Boolean);
  return selectedLimits.length > 0 ? Math.min(...selectedLimits) : 2200;
}

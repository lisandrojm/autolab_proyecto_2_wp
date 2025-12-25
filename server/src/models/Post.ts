import mongoose, { Document, Schema, Types } from "mongoose";

export type PostType = "social" | "email" | "push";

export type ContentFormat = "post" | "reel" | "story" | "video" | "short" | "article" | "thread";

export type Platform = "facebook" | "instagram" | "twitter" | "linkedin" | "tiktok" | "youtube";

export type SocialChannel = "instagram_post" | "instagram_reel" | "instagram_story" | "facebook_post" | "facebook_reel" | "facebook_story" | "linkedin_post" | "linkedin_article" | "tiktok_post" | "tiktok_story" | "youtube_short" | "youtube_video" | "twitter_post" | "twitter_thread";

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

export interface IPost extends Document {
  tenantId: Types.ObjectId;
  projectId: Types.ObjectId;
  clientId: Types.ObjectId;
  title: string;
  postType: PostType;
  contentFormat?: ContentFormat;
  channel?: Channel;
  channels?: Channel[];
  channelConfig?: ChannelConfig;
  content: { copy: string; hashtags: string[]; mentions: string[] };
  media: { type: "image" | "video" | "carousel"; urls: string[]; alt?: string; assetIds?: Types.ObjectId[] }[];
  usedAssets: Types.ObjectId[];
  platforms: Platform[];
  dynamicFields?: Record<string, any>;
  scheduling: {
    publishAt?: Date;
    timezone: string;
    isScheduled: boolean;
    recurrence?: {
      enabled: boolean;
      frequency: "daily" | "weekly" | "monthly" | "yearly";
      interval: number;
      daysOfWeek?: number[];
      dayOfMonth?: number;
      endDate?: Date;
      endAfterOccurrences?: number;
    };
  };
  status: "draft" | "pending_approval" | "approved" | "rejected" | "scheduled" | "published";
  approvals: { userId: string; status: "pending" | "approved" | "rejected"; feedback?: string; decidedAt?: Date }[];
  analytics: { impressions: number; engagement: number; clicks: number; shares: number; lastUpdated?: Date };
  createdBy: string;
  favorite: boolean;
  createdAt: Date;
  updatedAt: Date;
  usuarios?: { id: string; email: string; permiso: "ver" | "editar" }[];
}

const postSchema = new Schema<IPost>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },

    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: "Client", required: true, index: true },

    title: { type: String, required: false, trim: true, default: "" },

    postType: {
      type: String,
      enum: ["social", "email", "push"],
      default: "social",
      required: true,
      index: true,
    },

    contentFormat: {
      type: String,
      enum: ["post", "reel", "story", "video", "short", "article", "thread"],
      required: false,
      index: true,
    },

    channel: {
      type: String,
      enum: ["instagram_post", "instagram_reel", "instagram_story", "facebook_post", "facebook_reel", "facebook_story", "linkedin_post", "linkedin_article", "tiktok_post", "tiktok_story", "youtube_short", "youtube_video", "twitter_post", "twitter_thread", "email", "push_notification"],
      required: false,
      index: true,
    },

    channels: {
      type: [String],
      enum: ["instagram_post", "instagram_reel", "instagram_story", "facebook_post", "facebook_reel", "facebook_story", "linkedin_post", "linkedin_article", "tiktok_post", "tiktok_story", "youtube_short", "youtube_video", "twitter_post", "twitter_thread", "email", "push_notification"],
      default: [],
      index: true,
    },

    channelConfig: {
      type: Schema.Types.Mixed,
      default: {},
    },

    content: {
      copy: { type: String, required: false, default: "" },
      hashtags: { type: [String], default: [] },
      mentions: { type: [String], default: [] },
    },

    media: [
      {
        type: {
          type: String,
          enum: ["image", "video", "carousel"],
          required: true,
        },
        urls: { type: [String], default: [] },
        alt: String,
        assetIds: [{ type: Schema.Types.ObjectId, ref: "Asset" }],
      },
    ],

    usedAssets: [{ type: Schema.Types.ObjectId, ref: "Asset", index: true }],

    platforms: [{ type: String, enum: ["facebook", "instagram", "twitter", "linkedin", "tiktok", "youtube"] }],

    dynamicFields: {
      type: Schema.Types.Mixed,
      default: {},
    },

    scheduling: {
      publishAt: Date,
      timezone: { type: String, default: "UTC" },
      isScheduled: { type: Boolean, default: false },
      recurrence: {
        enabled: { type: Boolean, default: false },
        frequency: { type: String, enum: ["daily", "weekly", "monthly", "yearly"] },
        interval: { type: Number, min: 1 },
        daysOfWeek: [{ type: Number, min: 0, max: 6 }],
        dayOfMonth: { type: Number, min: 1, max: 31 },
        endDate: Date,
        endAfterOccurrences: { type: Number, min: 1 },
      },
    },

    status: {
      type: String,
      enum: ["draft", "pending_approval", "approved", "rejected", "scheduled", "published"],
      default: "draft",
      index: true,
    },

    approvals: [
      {
        userId: { type: String, required: true },
        status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
        feedback: String,
        decidedAt: Date,
      },
    ],

    analytics: {
      impressions: { type: Number, default: 0 },
      engagement: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      lastUpdated: Date,
    },

    createdBy: { type: String, required: true },

    favorite: { type: Boolean, default: false, index: true },

    usuarios: [
      {
        id: { type: String, required: true },
        email: { type: String, required: true },
        permiso: { type: String, enum: ["ver", "editar"], required: true },
      },
    ],
  },
  { timestamps: true }
);

postSchema.index({ tenantId: 1, createdAt: -1 });
postSchema.index({ tenantId: 1, postType: 1 });
postSchema.index({ tenantId: 1, contentFormat: 1 });
postSchema.index({ tenantId: 1, channel: 1 });
postSchema.index({ tenantId: 1, clientId: 1, postType: 1 });
postSchema.index({ tenantId: 1, projectId: 1 });

postSchema.pre("save", function (next) {
  if (this.postType === "social" && this.contentFormat && this.platforms && this.platforms.length > 0) {
    const generatedChannels: Channel[] = [];

    for (const platform of this.platforms) {
      const channelKey = `${platform}_${this.contentFormat}` as Channel;
      const validChannels = ["instagram_post", "instagram_reel", "instagram_story", "facebook_post", "facebook_reel", "facebook_story", "linkedin_post", "linkedin_article", "tiktok_post", "tiktok_story", "youtube_short", "youtube_video", "twitter_post", "twitter_thread"];

      if (validChannels.includes(channelKey)) {
        generatedChannels.push(channelKey);
      }
    }

    this.channels = generatedChannels;

    if (generatedChannels.length > 0 && !this.channel) {
      this.channel = generatedChannels[0];
    }
  }

  if (!this.channel && this.postType === "email") {
    this.channel = "email" as any;
    this.channels = ["email" as any];
  }

  if (!this.channel && this.postType === "push") {
    this.channel = "push_notification" as any;
    this.channels = ["push_notification" as any];
  }

  if (!this.channel && this.platforms && this.platforms.length > 0) {
    const platformMap: Record<string, string> = {
      instagram: "instagram_post",
      facebook: "facebook_post",
      linkedin: "linkedin_post",
      twitter: "twitter_post",
      tiktok: "tiktok_post",
      youtube: "youtube_video",
    };

    const firstPlatform = this.platforms[0];
    this.channel = (platformMap[firstPlatform] as any) || "instagram_post";
  }

  if (!this.channel) {
    this.channel = "instagram_post" as any;
  }

  next();
});

export const Post = mongoose.model<IPost>("Post", postSchema);

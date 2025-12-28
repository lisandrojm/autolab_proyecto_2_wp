import React from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "./ui/Card";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faTrash, faEye, faCalendar, faHeart, faPaperPlane, faBriefcase } from "@fortawesome/free-solid-svg-icons";
import { getPostTypeDisplay } from "../utils/postTypeHelpers";

interface Post {
  _id: string;
  title: string;
  postType?: "social" | "email" | "push";
  contentFormat?: string;
  channel?: string;
  channels?: string[];
  channelConfig?: any;
  projectId?:
    | {
        _id: string;
        name: string;
      }
    | string;
  clientId?:
    | {
        _id: string;
        name: string;
      }
    | string;
  content: {
    copy: string;
    hashtags: string[];
    mentions: string[];
  };
  media: {
    type: "image" | "video" | "carousel";
    urls: string[];
    alt?: string;
  }[];
  platforms: string[];
  status: "draft" | "pending_approval" | "approved" | "rejected" | "scheduled" | "published";
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
  analytics: {
    impressions: number;
    engagement: number;
    clicks: number;
    shares: number;
  };
  createdAt: string;
  favorite?: boolean;
}

interface PostCardProps {
  post: Post;
  onEdit: (post: Post) => void;
  onDelete: (post: Post) => void;
  onApprove?: (post: Post) => void;
  showBreadcrumbs?: boolean;
  className?: string;
}

export const PostCard: React.FC<PostCardProps> = ({ post, onEdit, onDelete, onApprove, showBreadcrumbs = false, className = "" }) => {
  const navigate = useNavigate();

  const handleViewPost = () => {
    navigate(`/posts/${post._id}`);
  };

  const actions = [
    {
      icon: faEdit,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        onEdit(post);
      },
      title: "Editar publicación",
      variant: "default" as const,
    },
  ];

  if (onApprove && (post.status === "pending_approval" || post.status === "draft")) {
    actions.push({
      icon: faPaperPlane,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        onApprove(post);
      },
      title: "Aprobar post",
      variant: "default" as const,
    });
  }

  actions.push({
    icon: faTrash,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete(post);
    },
    title: "Eliminar post",
    variant: "default" as const,
  });

  const projectName = typeof post.projectId === "object" ? post.projectId.name : "Proyecto";

  const postTypeDisplay = getPostTypeDisplay(post.postType);

  const badges = [
    {
      text: postTypeDisplay.label,
      icon: postTypeDisplay.icon,
      variant: post.postType === "email" ? "default" : post.postType === "push" ? "info" : "info",
    },
  ];

  return (
    <Card
      key={post._id}
      onClick={handleViewPost}
      className={`hover:scale-105 hover:shadow-lg transition-all duration-200 ${className}`}
      header={{
        title: post.title,
        subtitle: post.content.copy.substring(0, 60) + (post.content.copy.length > 60 ? "..." : ""),
        icon: faPaperPlane,
        badges: badges as any,
        ...(showBreadcrumbs && {
          breadcrumbs: {
            first: {
              icon: faBriefcase,
              text: projectName,
              variant: "gray",
            },
          },
        }),
      }}
      footer={{
        leftContent: (
          <div className="space-y-1">
            <div className="text-xs text-gray-500 dark:text-gray-500">{new Date(post.createdAt).toLocaleDateString()}</div>
            <div className="text-xs text-gray-500 dark:text-gray-500">
              {post.platforms.length} plataforma{post.platforms.length !== 1 ? "s" : ""}
            </div>
          </div>
        ),
        actions,
      }}
    >
      <div className="space-y-3">
        {post.media && post.media.length > 0 && post.media[0].urls && post.media[0].urls.length > 0 && (
          <div className="flex justify-start">
            <div className="flex flex-wrap justify-center gap-2">
              {post.media[0].urls.slice(0, 4).map((url, idx) => (
                <div key={idx} className="relative w-40 aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                  <img src={url} alt={`Media ${idx + 1}`} className="w-full h-full object-cover" />
                  {idx === 3 && post.media[0].urls.length > 4 && (
                    <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center">
                      <span className="text-white text-lg font-semibold">+{post.media[0].urls.length - 4}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {post.content.hashtags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.content.hashtags.slice(0, 3).map((hashtag, index) => (
              <span key={index} className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-300">
                #{hashtag}
              </span>
            ))}
            {post.content.hashtags.length > 3 && <span className="text-xs text-gray-500 dark:text-gray-500">+{post.content.hashtags.length - 3}</span>}
          </div>
        )}

        {post.status === "published" && (
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 dark:text-gray-500">
            <div className="flex items-center space-x-1">
              <FontAwesomeIcon icon={faEye} className="h-3 w-3" />
              <span>{post.analytics.impressions.toLocaleString()}</span>
            </div>
            <div className="flex items-center space-x-1">
              <FontAwesomeIcon icon={faHeart} className="h-3 w-3" />
              <span>{post.analytics.engagement.toLocaleString()}</span>
            </div>
          </div>
        )}

        {post.scheduling.isScheduled && post.scheduling.publishAt && (
          <div className="flex items-center space-x-1 text-xs text-blue-600 dark:text-blue-400">
            <FontAwesomeIcon icon={faCalendar} className="h-3 w-3" />
            <span>Programado: {new Date(post.scheduling.publishAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </Card>
  );
};

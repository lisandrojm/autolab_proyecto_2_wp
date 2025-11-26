import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo, faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { InfoModal, type InfoModalAction } from "./InfoModal";
import { getImageUrl } from "../../utils/imageHelpers";

interface InfoModalControlledProps {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: "sm" | "md" | "lg" | "xl";
  actions?: InfoModalAction[];
  content: React.ReactNode;
}

interface ControlledModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: "sm" | "md" | "lg" | "xl";
  actions?: InfoModalAction[];
  content: React.ReactNode;
}

type AvatarProps = {
  src?: string;
  alt?: string;
  fallback?: string;
};

type FaIconProps = {
  icon?: IconDefinition;
  fallback?: string;
};
type FaIconSecondaryProps = {
  icon?: IconDefinition;
  fallback?: string;
};

type ClientMiniAvatarProps = {
  src?: string;
  alt?: string;
  fallback?: string;
  label?: string;
};

type BadgeVariant = "default" | "success" | "warning" | "blue" | "info";
type BadgeSecondaryVariant = "default" | "success" | "warning" | "blue" | "info";
type BadgeTertiaryVariant = "default" | "success" | "warning" | "blue" | "info";
type BadgeStateVariant = "default" | "success" | "warning" | "blue" | "info";

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  badge?: {
    text: string;
    variant?: BadgeVariant;
  };
  badgeSecondary?: {
    text: string;
    variant?: BadgeSecondaryVariant;
  };
  badgeTertiary?: {
    text: string;
    variant?: BadgeTertiaryVariant;
  };
  badgeState?: {
    text: string;
    variant?: BadgeStateVariant;
  };

  infoModal?: InfoModalControlledProps;
  showInfoIcon?: boolean;
  shouldShowInfo?: boolean;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  headerBack?: React.ReactNode;
  onBack?: () => void;
  avatar?: AvatarProps;
  faIcon?: FaIconProps;
  faIconSecondary?: FaIconSecondaryProps;
  clientMiniAvatar?: ClientMiniAvatarProps;
  preSearchContent?: React.ReactNode;
  preSearchTitle?: React.ReactNode;
  preSearchActions?: React.ReactNode;
  searchAndFilters?: React.ReactNode;
  postFaIconSecondary?: FaIconProps;
  postSearchTitle?: React.ReactNode;
  postSearchActions?: React.ReactNode;
  postSearchAndFilters?: React.ReactNode;
  modal?: ControlledModalProps;
  viewModal?: ControlledModalProps;
}

const BADGE_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border dark:border-slate-700",
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  warning: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  blue: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
};

export const PageLayout: React.FC<PageLayoutProps> = ({ title, subtitle, badge, badgeSecondary, badgeTertiary, badgeState, infoModal, showInfoIcon = false, shouldShowInfo, children, headerActions, headerBack, onBack, avatar, faIcon, faIconSecondary, clientMiniAvatar, preSearchContent, preSearchTitle, preSearchActions, searchAndFilters, postFaIconSecondary, postSearchTitle, postSearchActions, postSearchAndFilters, modal, viewModal }) => {
  const shouldShowInfoButton = shouldShowInfo ?? (!!infoModal || showInfoIcon || !!subtitle);

  const renderBack = () => {
    if (headerBack) return headerBack;
    if (!onBack) return null;
    return (
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="btn-ghost" aria-label="Volver">
          <FontAwesomeIcon icon={faArrowLeft} className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const renderAvatar = () => {
    if (!avatar) return null;
    return <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700 flex items-center justify-center">{avatar.src ? <img src={getImageUrl(avatar.src)} alt={avatar.alt || title} className="w-full h-full object-cover" /> : <span className="text-sm sm:text-base font-semibold text-white bg-primary-600 w-full h-full flex items-center justify-center">{avatar.fallback || title?.charAt(0)?.toUpperCase?.() || "?"}</span>}</div>;
  };

  const renderFaIcon = () => {
    if (!faIcon) return null;
    return <div className="text-primary-600 dark:text-primary-400 flex items-center justify-center">{faIcon.icon ? <FontAwesomeIcon icon={faIcon.icon} className="w-5 h-5" /> : <span className="text-sm sm:text-base font-semibold">{faIcon.fallback || title?.charAt(0)?.toUpperCase?.() || "?"}</span>}</div>;
  };

  const renderFaIconSecondary = () => {
    if (!faIconSecondary) return null;
    return <div className="text-primary-600 dark:text-primary-400 flex items-center justify-center">{faIconSecondary.icon ? <FontAwesomeIcon icon={faIconSecondary.icon} className="w-4 h-4 sm:w-5 sm:h-5" /> : <span className="text-sm sm:text-base font-semibold">{faIconSecondary.fallback || title?.charAt(0)?.toUpperCase?.() || "?"}</span>}</div>;
  };

  const renderPostFaIconSecondary = () => {
    if (!postFaIconSecondary) return null;
    return <div className="text-blue-600 dark:text-blue-400 flex items-center justify-center">{postFaIconSecondary.icon ? <FontAwesomeIcon icon={postFaIconSecondary.icon} className="h-6 w-6 sm:h-8 sm:w-8" /> : <span className="text-sm sm:text-base font-semibold">{postFaIconSecondary.fallback || "?"}</span>}</div>;
  };

  const renderClientMiniAvatar = () => {
    if (!clientMiniAvatar) return null;
    return (
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-primary-600 text-white text-xs font-semibold">{clientMiniAvatar.src ? <img src={clientMiniAvatar.src} alt={clientMiniAvatar.alt || clientMiniAvatar.label || "Cliente"} className="w-full h-full object-cover" /> : clientMiniAvatar.fallback || "?"}</div>
        {clientMiniAvatar.label && <span className="text-md text-gray-700 dark:text-gray-300 font-bold">{clientMiniAvatar.label}</span>}
      </div>
    );
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-900">
      <div className="lg:pl-64">
        <div className="px-4 sm:px-6 lg:px-8 pb-6">
          {/* Header sticky */}
          <div className="sticky top-16 z-20 mb-4 bg-gray-100 dark:bg-gray-900 border-b dark:border-slate-700">
            <div className="py-4">
              <div className="flex gap-3 flex-wrap min-w-0">
                {renderClientMiniAvatar()}

                {badge && (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${BADGE_CLASSES[badge.variant ?? "default"]} min-w-0`} title={badge.text}>
                    <span className="truncate max-w-[30vw] sm:max-w-[40vw] md:max-w-[50vw]">{badge.text}</span>
                  </span>
                )}

                {badgeSecondary && (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${BADGE_CLASSES[badgeSecondary.variant ?? "default"]} min-w-0`} title={badgeSecondary.text}>
                    <span className="truncate max-w-[30vw] sm:max-w-[40vw] md:max-w-[50vw]">{badgeSecondary.text}</span>
                  </span>
                )}

                {badgeTertiary && (
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${BADGE_CLASSES[badgeTertiary.variant ?? "default"]} min-w-0`} title={badgeTertiary.text}>
                    <span className="truncate max-w-[30vw] sm:max-w-[40vw] md:max-w-[50vw]">{badgeTertiary.text}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between lg:justify-start gap-3 lg:gap-5 pt-2">
                {renderBack()}
                {/* este wrapper puede crecer, pero permite que hijos se achiquen */}
                <div className="flex items-center gap-3 min-w-0">
                  {renderAvatar()}
                  {renderFaIcon()}
                  {/* columna que contiene el título: permitir truncado */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex justify-start gap-2 min-w-0">
                        <div className="flex gap-2 items-center justify-center min-w-0">
                          {/* ⬇️ título con ellipsis */}
                          <h2
                            className="truncate text-2xl sm:text-3xl font-bold dark:text-gray-100"
                            title={title} // opcional: tooltip con el título completo
                          >
                            {title}
                          </h2>
                          {badgeState && <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${BADGE_CLASSES[badgeState.variant ?? "default"]}`}>{badgeState.text}</span>}
                        </div>
                        {shouldShowInfoButton && (
                          <button type="button" onClick={() => infoModal?.onOpen?.()} className="inline-flex items-center justify-center rounded-full" title="Ver información" aria-label="Ver información">
                            <FontAwesomeIcon icon={faCircleInfo} className="h-4 w-4 text-slate-500" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="shrink-0">{headerActions}</div>
              </div>
            </div>
          </div>

          {preSearchContent && <div className="mb-6">{preSearchContent}</div>}
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {renderFaIconSecondary()}
              {preSearchTitle && <h2 className="flex items-center gap-3 text-xl sm:text-3xl font-bold dark:text-gray-100">{preSearchTitle}</h2>}
            </div>
            {preSearchActions && <div>{preSearchActions}</div>}
          </div>

          {searchAndFilters && <div className="py-4 mb-6">{searchAndFilters}</div>}

          {children}

          {(postSearchTitle || postSearchActions) && (
            <div className="flex items-center justify-between gap-4 mt-8">
              <div className="flex gap-2">
                {renderPostFaIconSecondary()}
                {postSearchTitle && <h2 className="flex items-center gap-3 text-xl sm:text-3xl font-bold dark:text-gray-100">{postSearchTitle}</h2>}
              </div>
              {postSearchActions && <div>{postSearchActions}</div>}
            </div>
          )}

          {postSearchAndFilters && <div className="py-4 mb-6">{postSearchAndFilters}</div>}
        </div>
      </div>

      {infoModal && (
        <InfoModal isOpen={infoModal.isOpen} onClose={infoModal.onClose} title={infoModal.title} subtitle={infoModal.subtitle ?? subtitle} size={infoModal.size} actions={infoModal.actions}>
          {infoModal.content ?? (subtitle ? <p className="whitespace-pre-line">{subtitle}</p> : <p className="text-gray-300">Sin información disponible.</p>)}
        </InfoModal>
      )}

      {viewModal && (
        <InfoModal isOpen={viewModal.isOpen} onClose={viewModal.onClose} title={viewModal.title} subtitle={viewModal.subtitle} size={viewModal.size} actions={viewModal.actions}>
          {viewModal.content}
        </InfoModal>
      )}

      {modal && (
        <InfoModal isOpen={modal.isOpen} onClose={modal.onClose} title={modal.title} subtitle={modal.subtitle} size={modal.size} actions={modal.actions}>
          {modal.content}
        </InfoModal>
      )}
    </div>
  );
};

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, dateFnsLocalizer, View } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, addDays, subDays, addMonths, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { useAuthStore } from "../stores/authStore";
import { PageLayout } from "../components/ui/PageLayout";
import { EmptyState } from "../components/ui/EmptyState";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendar, faCalendarDay, faCalendarWeek, faList, faClock } from "@fortawesome/free-solid-svg-icons";
import { faFacebook, faInstagram, faTwitter, faLinkedin, faTiktok } from "@fortawesome/free-brands-svg-icons";
import { EventType, eventTypeConfig, formatEventTitle, getAvailableEventTypes, isEventTypeEnabled } from "../utils/calendarEvents";
import { Post as PostType, PostType as PostTypeEnum } from "../types/post";
import { getHelp, hasHelp } from "../data/help/helpContent";

const locales = {
  es: es,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: PostType;
  eventType: EventType;
}

const getStatusColor = (status: string): string => {
  switch (status) {
    case "published":
      return "#10b981";
    case "approved":
      return "#059669";
    case "scheduled":
      return "#3b82f6";
    case "pending_approval":
      return "#f59e0b";
    case "rejected":
      return "#ef4444";
    case "draft":
    default:
      return "#6b7280";
  }
};

const getPlatformIcon = (platform: string) => {
  const platformLower = platform.toLowerCase();
  if (platformLower.includes("facebook")) return faFacebook;
  if (platformLower.includes("instagram")) return faInstagram;
  if (platformLower.includes("twitter") || platformLower.includes("x")) return faTwitter;
  if (platformLower.includes("linkedin")) return faLinkedin;
  if (platformLower.includes("tiktok")) return faTiktok;
  return faCalendar;
};

const getChannelIcon = (channel: string) => {
  const channelLower = channel.toLowerCase();
  if (channelLower.includes("facebook")) return faFacebook;
  if (channelLower.includes("instagram")) return faInstagram;
  if (channelLower.includes("twitter") || channelLower.includes("x")) return faTwitter;
  if (channelLower.includes("linkedin")) return faLinkedin;
  if (channelLower.includes("tiktok")) return faTiktok;
  return faCalendar;
};

const messages = {
  allDay: "Todo el día",
  previous: "Anterior",
  next: "Siguiente",
  today: "Hoy",
  month: "Mes",
  week: "Semana",
  day: "Día",
  agenda: "Agenda",
  date: "Fecha",
  time: "Hora",
  event: "Post",
  noEventsInRange: "No hay publicaciones en este rango.",
  showMore: (total: number) => `+${total} más`,
};

const HELP_KEY = "calendar" as const;

export const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const { token, tenantId } = useAuthStore();
  const [posts, setPosts] = useState<PostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState(new Date());
  const [openInfo, setOpenInfo] = useState(false);

  const helpEntry = getHelp(HELP_KEY);

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    const timeoutId = setTimeout(() => {
      console.warn('Calendar posts request taking longer than expected');
    }, 5000);

    try {
      setLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/posts`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Tenant-Id": tenantId,
        },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        setPosts(Array.isArray(data) ? data : []);
      } else {
        console.error("Error fetching posts:", response.status, response.statusText);
        setPosts([]);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error("Error fetching posts:", error?.message || error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  const events: CalendarEvent[] = useMemo(() => {
    return posts.map((post) => {
      let postDate: Date;

      if (post.scheduling.isScheduled && post.scheduling.publishAt) {
        postDate = new Date(post.scheduling.publishAt);
      } else if (post.status === "published" && post.updatedAt) {
        postDate = new Date(post.updatedAt);
      } else {
        postDate = new Date(post.createdAt);
      }

      if (isNaN(postDate.getTime())) {
        postDate = new Date();
      }

      const endDate = new Date(postDate);
      endDate.setHours(postDate.getHours() + 1);

      const eventType: EventType = post.postType || "social";

      return {
        id: post._id,
        title: formatEventTitle(eventType, post.title),
        start: postDate,
        end: endDate,
        resource: post,
        eventType,
      };
    });
  }, [posts]);

  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      navigate(`/posts/${event.id}`);
    },
    [navigate]
  );

  const handleNavigate = useCallback((newDate: Date) => {
    setDate(newDate);
  }, []);

  const handleViewChange = useCallback((newView: View) => {
    setView(newView);
  }, []);

  const eventStyleGetter = useCallback(
    (event: CalendarEvent) => {
      const backgroundColor = getStatusColor(event.resource.status);
      const hasImage = event.resource.media && event.resource.media.length > 0 && event.resource.media[0].urls && event.resource.media[0].urls.length > 0;

      return {
        style: {
          backgroundColor,
          borderRadius: "8px",
          opacity: 0.96,
          color: "white",
          border: "0px",
          display: "block",
          fontSize: "0.875rem",
          fontWeight: "500",
          padding: (view === "week" || view === "day") && hasImage ? "6px" : "2px 4px",
          minHeight: (view === "week" || view === "day") && hasImage ? "70px" : "auto",
          boxShadow: (view === "week" || view === "day") && hasImage ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
        },
      };
    },
    [view]
  );

  const EventComponent = ({ event }: { event: CalendarEvent }) => {
    const config = eventTypeConfig[event.eventType];
    const post = event.resource;
    const hasImage = post.media && post.media.length > 0 && post.media[0].urls && post.media[0].urls.length > 0;
    const imageUrl = hasImage ? post.media[0].urls[0] : null;
    const primaryChannel = post.channels && post.channels.length > 0 ? post.channels[0] : post.channel || null;
    const primaryPlatform = post.platforms && post.platforms.length > 0 ? post.platforms[0] : null;

    if ((view === "week" || view === "day") && imageUrl) {
      return (
        <div className="flex items-start gap-2 overflow-hidden h-full">
          <div className="relative w-14 h-14 flex-shrink-0 rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
            <img src={imageUrl} alt={post.title} className="w-full h-full object-cover" />
            <div className="absolute top-0 left-0 w-5 h-5 bg-white dark:bg-gray-800 rounded-br flex items-center justify-center">
              <FontAwesomeIcon icon={config.icon} className="h-2.5 w-2.5 text-gray-700 dark:text-gray-300" />
            </div>
            {primaryChannel && event.eventType === "social" && (
              <div className="absolute bottom-0 right-0 w-5 h-5 bg-white dark:bg-gray-800 rounded-tl flex items-center justify-center">
                <FontAwesomeIcon icon={getChannelIcon(primaryChannel)} className="h-2.5 w-2.5 text-gray-700 dark:text-gray-300" />
              </div>
            )}
            {!primaryChannel && primaryPlatform && event.eventType === "social" && (
              <div className="absolute bottom-0 right-0 w-5 h-5 bg-white dark:bg-gray-800 rounded-tl flex items-center justify-center">
                <FontAwesomeIcon icon={getPlatformIcon(primaryPlatform)} className="h-2.5 w-2.5 text-gray-700 dark:text-gray-300" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 py-1">
            <div className="flex items-center gap-1 mb-0.5">
              <FontAwesomeIcon icon={faClock} className="h-2.5 w-2.5 opacity-70" />
              <span className="text-xs opacity-90">{format(event.start, "HH:mm")}</span>
            </div>
            <div className="text-xs font-medium truncate leading-tight">{post.title}</div>
            {post.channels && post.channels.length > 1 && (
              <div className="text-[10px] opacity-75 mt-0.5">
                +{post.channels.length - 1} canal{post.channels.length - 1 > 1 ? "es" : ""}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 overflow-hidden">
        <FontAwesomeIcon icon={config.icon} className="h-3 w-3 flex-shrink-0" />
        <span className="truncate">{event.resource.title}</span>
      </div>
    );
  };

  const AgendaEvent = ({ event }: { event: CalendarEvent }) => {
    const config = eventTypeConfig[event.eventType];
    const post = event.resource;
    const hasImage = post.media && post.media.length > 0 && post.media[0].urls && post.media[0].urls.length > 0;
    const imageUrl = hasImage ? post.media[0].urls[0] : null;
    const statusColor = getStatusColor(post.status);
    const primaryChannel = post.channels && post.channels.length > 0 ? post.channels[0] : post.channel || null;

    return (
      <div className="flex items-start gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors cursor-pointer">
        {imageUrl ? (
          <div className="relative w-16 h-16 flex-shrink-0 rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
            <img src={imageUrl} alt={post.title} className="w-full h-full object-cover" />
            <div className="absolute top-0 left-0 w-6 h-6 bg-white dark:bg-gray-800 rounded-br flex items-center justify-center">
              <FontAwesomeIcon icon={config.icon} className="h-3 w-3 text-gray-700 dark:text-gray-300" />
            </div>
          </div>
        ) : (
          <div className="w-16 h-16 flex-shrink-0 rounded bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <FontAwesomeIcon icon={config.icon} className="h-6 w-6 text-gray-500 dark:text-gray-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="font-medium text-gray-900 dark:text-white truncate">{post.title}</h4>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs px-2 py-1 rounded-full font-medium" style={{ backgroundColor: statusColor, color: "white" }}>
                {post.status}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 flex-wrap">
            <div className="flex items-center gap-1">
              <FontAwesomeIcon icon={config.icon} className="h-3 w-3" />
              <span>{config.label}</span>
            </div>
            {post.channels && post.channels.length > 0 && event.eventType === "social" && (
              <>
                <span>•</span>
                <div className="flex items-center gap-1">
                  {post.channels.slice(0, 3).map((channel, idx) => (
                    <FontAwesomeIcon key={idx} icon={getChannelIcon(channel)} className="h-3 w-3" />
                  ))}
                  {post.channels.length > 3 && <span className="ml-1">+{post.channels.length - 3}</span>}
                </div>
              </>
            )}
            {(!post.channels || post.channels.length === 0) && post.platforms && post.platforms.length > 0 && event.eventType === "social" && (
              <>
                <span>•</span>
                <div className="flex items-center gap-1">
                  {post.platforms.slice(0, 3).map((platform, idx) => (
                    <FontAwesomeIcon key={idx} icon={getPlatformIcon(platform)} className="h-3 w-3" />
                  ))}
                  {post.platforms.length > 3 && <span className="ml-1">+{post.platforms.length - 3}</span>}
                </div>
              </>
            )}
            {post.contentFormat && (
              <>
                <span>•</span>
                <span className="capitalize">{post.contentFormat}</span>
              </>
            )}
          </div>
          {post.content?.copy && <p className="text-xs text-gray-500 dark:text-gray-500 mt-1 line-clamp-2">{post.content.copy}</p>}
        </div>
      </div>
    );
  };

  const CustomToolbar = (toolbar: any) => {
    const goToBack = () => {
      if (view === "agenda") {
        const newDate = subMonths(toolbar.date, 1);
        setDate(newDate);
      } else {
        toolbar.onNavigate("PREV");
      }
    };

    const goToNext = () => {
      if (view === "agenda") {
        const newDate = addMonths(toolbar.date, 1);
        setDate(newDate);
      } else {
        toolbar.onNavigate("NEXT");
      }
    };

    const goToToday = () => {
      toolbar.onNavigate("TODAY");
    };

    const label = () => {
      const date = toolbar.date;
      return format(date, view === "month" || view === "agenda" ? "MMMM yyyy" : "MMMM d, yyyy", { locale: es });
    };

    return (
      <div className="flex flex-col xl:flex-row items-center justify-between mb-4 bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700 gap-2">
        <div className="flex items-center gap-2">
          <button onClick={goToBack} className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
            Anterior
          </button>
          <button onClick={goToToday} className="px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors">
            Hoy
          </button>
          <button onClick={goToNext} className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
            Siguiente
          </button>
        </div>

        <h2 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">{label()}</h2>

        <div className="flex flex-col sm:flex-row items-center gap-2">
          <div className="flex gap-2">
            <button onClick={() => toolbar.onView("month")} className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${view === "month" ? "bg-primary-600 text-white" : "text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"}`}>
              <FontAwesomeIcon icon={faCalendar} className="h-4 w-4" />
              Mes
            </button>
            <button onClick={() => toolbar.onView("week")} className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${view === "week" ? "bg-primary-600 text-white" : "text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"}`}>
              <FontAwesomeIcon icon={faCalendarWeek} className="h-4 w-4" />
              Semana
            </button>
          </div>

          <div className="flex gap-2">
            <button onClick={() => toolbar.onView("day")} className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${view === "day" ? "bg-primary-600 text-white" : "text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"}`}>
              <FontAwesomeIcon icon={faCalendarDay} className="h-4 w-4" />
              Día
            </button>
            <button onClick={() => toolbar.onView("agenda")} className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${view === "agenda" ? "bg-primary-600 text-white" : "text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"}`}>
              <FontAwesomeIcon icon={faList} className="h-4 w-4" />
              Agenda
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <PageLayout
      title="Calendario"
      subtitle="Vista de posts programados y publicados"
      faIcon={{ icon: faCalendar }}
      onBack={() => navigate(-1)}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
    >
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Cargando calendario...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-blue-900 dark:text-blue-100">
                  Total de posts: <strong>{posts.length}</strong>
                </span>
                <span className="text-blue-900 dark:text-blue-100">
                  Eventos en calendario: <strong>{events.length}</strong>
                </span>
              </div>
            </div>
          )}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden p-4">
            {posts.length === 0 ? (
              <EmptyState icon={faCalendar} title="No hay eventos" description="Aún no se han creado eventos en el sistema." />
            ) : (
              <Calendar
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                style={{ height: "calc(100vh - 280px)", minHeight: "600px" }}
                onSelectEvent={handleSelectEvent}
                onNavigate={handleNavigate}
                onView={handleViewChange}
                view={view}
                date={date}
                eventPropGetter={eventStyleGetter}
                messages={messages}
                culture="es"
                length={31}
                components={{
                  toolbar: CustomToolbar,
                  event: EventComponent,
                  agenda: {
                    event: AgendaEvent,
                  },
                }}
              />
            )}
          </div>

          <div className="grid grid-cols-1  gap-4">
            {/* Tipos de eventos */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Tipos de Eventos</h3>
              <div className="flex flex-wrap gap-3">
                {getAvailableEventTypes().map((type) => {
                  const config = eventTypeConfig[type];
                  const enabled = isEventTypeEnabled(type);

                  return (
                    <div key={type} className={`flex items-center gap-2 ${!enabled ? "opacity-50" : ""}`} title={config.description}>
                      <div className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 bg-gray-200 dark:bg-gray-700">
                        <FontAwesomeIcon icon={config.icon} className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                      </div>
                      <span className="text-xs text-gray-600 dark:text-gray-400">{config.label}</span>
                      {!enabled && <span className="text-xs text-gray-400 dark:text-gray-500 italic">(próximamente)</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Estados de posts */}
            {/*             <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Estados de Posts</h3>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-600"></div>
                  <span className="text-xs text-gray-600 dark:text-gray-400">Publicado</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-700"></div>
                  <span className="text-xs text-gray-600 dark:text-gray-400">Aprobado</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-xs text-gray-600 dark:text-gray-400">Programado</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <span className="text-xs text-gray-600 dark:text-gray-400">Pendiente</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span className="text-xs text-gray-600 dark:text-gray-400">Rechazado</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                  <span className="text-xs text-gray-600 dark:text-gray-400">Borrador</span>
                </div>
              </div>
            </div> */}
          </div>
        </div>
      )}
    </PageLayout>
  );
};

import { Bell } from 'lucide-react';

interface TopBarProps {
  title: string;
  hasNotifications?: boolean;
  onNotificationClick?: () => void;
}

export default function TopBar({ title, hasNotifications = false, onNotificationClick }: TopBarProps) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between bg-background-light/80 dark:bg-background-dark/80 p-4 pb-2 backdrop-blur-sm">
      <div className="flex size-12 shrink-0 items-center">
        <div
          className="aspect-square size-10 rounded-full bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: 'url("https://lh3.googleusercontent.com/aida-public/AB6AXuDnU5QgjujmeNxIQ7pvt9_qea6WcNgYxkcEOwLGTbpmOMgiHIGlCVJThmfNMwgtI2StbRn_-fsM4f2H7D7V7kzSdBD4nl_ux9WkpBnkzSk7BN0kYBID1tvvY2bitI_6gegGrxmOzHiS4cBqDuzypMZcKskWJpeJXG0rzlDTUzQc-HZBlyLAeYLSuh1IcJJvQzn6IscRJR31tvtB3H3azl8Fs8xuNtTR-PeJrgaFtrYj5-SY0PtflPUrD8ogDtnJCfL_bvQfVpffK5c")'
          }}
        />
      </div>
      <h2 className="flex-1 text-center text-lg font-bold leading-tight tracking-[-0.015em] text-slate-900 dark:text-slate-100">
        {title}
      </h2>
      <div className="flex w-12 items-center justify-end">
        <button
          onClick={onNotificationClick}
          className="relative flex h-12 cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-transparent text-slate-900 dark:text-slate-100 min-w-0 p-0 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Bell className="w-6 h-6" />
          {hasNotifications && (
            <span className="absolute right-3 top-3 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

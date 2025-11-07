/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_APP_FIRST_NAME: string;
  readonly VITE_APP_LAST_NAME: string;
  readonly VITE_DEFAULT_LOCALE: string;
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

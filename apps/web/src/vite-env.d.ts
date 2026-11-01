/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string;
  readonly VITE_SOURCE_URL?: string;
  readonly VITE_GITHUB_URL?: string;
  readonly VITE_PORTFOLIO_URL?: string;
  readonly VITE_VIDEO_URL?: string;
  readonly VITE_RESUME_URL?: string;
  readonly VITE_CONTACT_EMAIL?: string;
  readonly VITE_CONTACT_PHONE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

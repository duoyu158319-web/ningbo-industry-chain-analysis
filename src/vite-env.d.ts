/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AMAP_KEY: string;
  readonly GEMINI_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

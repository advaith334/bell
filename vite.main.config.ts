import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  ssr: {
    /**
     * `openid-client`, `jose` and `ky` are ESM-only. Forge builds the main
     * process as CommonJS and externalizes dependencies by default, which would
     * leave a `require()` of an ESM package to be resolved at runtime — that
     * works on Electron 43's Node 22, but silently on a version-dependent
     * feature, and it fails from inside the asar archive in ways that only show
     * up in a packaged build.
     *
     * Bundling them removes the question. They are small and pure JavaScript.
     * `better-sqlite3` and `electron-updater` stay external because they are
     * native or resolve paths relative to the app bundle.
     */
    noExternal: ['openid-client', 'jose', 'ky', 'oauth4webapi', 'zod'],
  },
  build: {
    rollupOptions: {
      external: ['better-sqlite3', 'electron', 'electron-updater'],
    },
  },
})

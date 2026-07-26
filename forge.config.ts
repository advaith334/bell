import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerZIP } from '@electron-forge/maker-zip'
import { VitePlugin } from '@electron-forge/plugin-vite'

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Bell',
    appBundleId: 'ai.bell.app',
    appCategoryType: 'public.app-category.productivity',
    icon: 'assets/icon',
    asar: true,
    // The Swift helper is copied in verbatim; it must stay outside the asar
    // archive so it remains an executable file on disk. The tray images are
    // read at runtime by nativeImage, which cannot see inside the archive.
    extraResource: [
      'swift-helper/dist/bell-helper',
      'assets/trayTemplate.png',
      'assets/trayTemplate@2x.png',
    ],
    extendInfo: {
      // Menu-bar app: no dock icon until the Home window opens.
      LSUIElement: true,
      NSHighResolutionCapable: true,
      // Shown by macOS when Bell first asks for Accessibility.
      NSAccessibilityUsageDescription:
        'Bell reads the text you have highlighted so it can speak it aloud.',
    },
  },
  rebuildConfig: {},
  makers: [new MakerZIP({}, ['darwin'])],
  plugins: [
    new VitePlugin({
      // Entry basenames must be unique: Vite names each output after its entry
      // file, so two files both called index.ts would emit one index.js and
      // silently overwrite each other.
      build: [
        { entry: 'src/main/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      // The name is load-bearing: Forge derives the injected globals from it,
      // so `main_window` is what produces MAIN_WINDOW_VITE_DEV_SERVER_URL and
      // MAIN_WINDOW_VITE_NAME. Renaming this without renaming those constants
      // leaves them undefined at runtime.
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
}

export default config

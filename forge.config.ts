import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { VitePlugin } from '@electron-forge/plugin-vite'

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Pilcrow',
    appBundleId: 'com.pilcrow.app',
    appCategoryType: 'public.app-category.productivity',
    icon: 'assets/icon',
    asar: true,
    // The Swift helper is copied in verbatim; it must stay outside the asar
    // archive so it remains an executable file on disk. The tray images are
    // read at runtime by nativeImage, which cannot see inside the archive.
    extraResource: [
      'swift-helper/dist/pilcrow-helper',
      'assets/trayTemplate.png',
      'assets/trayTemplate@2x.png',
    ],
    extendInfo: {
      // Menu-bar app: no dock icon until the Home window opens.
      LSUIElement: true,
      NSHighResolutionCapable: true,
      // Shown by macOS when Pilcrow first asks for Accessibility.
      NSAccessibilityUsageDescription:
        'Pilcrow reads the text you have highlighted so it can speak it aloud.',
      // How the browser hands the authorization code back after sign-in. macOS
      // reads the scheme from here, so app.setAsDefaultProtocolClient in main.ts
      // only confirms what this declares.
      CFBundleURLTypes: [
        {
          CFBundleURLName: 'com.pilcrow.app',
          CFBundleURLSchemes: ['pilcrow'],
        },
      ],
    },

    /**
     * Signing and notarization. Both are skipped unless the environment supplies
     * credentials, so `npm run make` still works on a machine without them —
     * you get an unsigned build for local testing rather than a hard failure.
     *
     * The Swift helper in extraResource must be signed too. A nested unsigned
     * executable is the single most likely reason notarization rejects this app,
     * and `osxSign` walks extraResource for exactly that reason.
     */
    osxSign: process.env.APPLE_SIGNING_IDENTITY
      ? {
          identity: process.env.APPLE_SIGNING_IDENTITY,
          optionsForFile: () => ({
            // The hardened runtime is mandatory for notarization. Pilcrow needs
            // the Accessibility API and audio, neither of which requires an
            // entitlement here — the AX permission is granted by the user at
            // runtime, not declared at build time.
            entitlements: 'assets/entitlements.plist',
            hardenedRuntime: true,
          }),
        }
      : undefined,

    osxNotarize: process.env.APPLE_API_KEY_ID
      ? {
          appleApiKey: process.env.APPLE_API_KEY!,
          appleApiKeyId: process.env.APPLE_API_KEY_ID!,
          appleApiIssuer: process.env.APPLE_API_ISSUER!,
        }
      : undefined,
  },
  rebuildConfig: {},
  makers: [
    // The DMG is what pilcrow.app/download hands people; the ZIP is what
    // electron-updater consumes, because it can apply a ZIP delta and cannot
    // mount a disk image.
    new MakerDMG({ name: 'Pilcrow', format: 'ULFO' }, ['darwin']),
    new MakerZIP({}, ['darwin']),
  ],
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

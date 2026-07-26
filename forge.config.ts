import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerZIP } from '@electron-forge/maker-zip'
import { VitePlugin } from '@electron-forge/plugin-vite'

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Bell',
    asar: true,
    // The Swift helper is copied in verbatim; it must stay outside the asar
    // archive so it remains an executable file on disk.
    extraResource: ['swift-helper/dist/bell-helper'],
  },
  rebuildConfig: {},
  makers: [new MakerZIP({}, ['darwin'])],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/index.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload/index.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'renderer', config: 'vite.renderer.config.ts' }],
    }),
  ],
}

export default config

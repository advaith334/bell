import { build } from 'esbuild'
import { rm, mkdir } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { spawn } from 'node:child_process'

/**
 * Bundles each Lambda into a single file. Bundling rather than shipping
 * node_modules matters here: cold start is on the critical path for
 * time-to-first-audio, and the AWS SDK v3 alone is tens of megabytes unbundled.
 *
 * The AWS SDK is marked external because the Lambda Node 22 runtime already
 * provides it — bundling it would add ~8MB for no benefit.
 */

const targets = [
  { name: 'api', entry: 'src/api/handler.ts' },
  { name: 'tts', entry: 'src/tts/handler.ts' },
]

await rm('dist', { recursive: true, force: true })

for (const target of targets) {
  await build({
    entryPoints: [target.entry],
    outfile: `dist/${target.name}/index.mjs`,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    minify: true,
    sourcemap: true,
    external: ['@aws-sdk/*'],
    // esbuild emits ESM that references `require` for some CJS deps; this shim
    // is the documented workaround and is why the output is .mjs.
    banner: {
      js: [
        "import { createRequire as __createRequire } from 'module';",
        'const require = __createRequire(import.meta.url);',
      ].join('\n'),
    },
  })

  await zip(`dist/${target.name}`, `dist/${target.name}.zip`)
  console.log(`built dist/${target.name}.zip`)
}

/** Terraform wants a zip; shelling out to the system zip avoids an extra dependency. */
function zip(directory, output) {
  return new Promise((resolve, reject) => {
    const child = spawn('zip', ['-qr', '-X', '-9', `../${output.split('/').pop()}`, '.'], {
      cwd: directory,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`zip exited ${code}`))))
  })
}

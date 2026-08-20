import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { finding, printReport, report, writeText } from '../internal/io.ts'
import { pluginsDir } from '../internal/paths.ts'
import type { CliOptions } from '../internal/types.ts'

function functionSource(id: string, marker: string): string {
  return `import type { Context } from '@deepseek-ai/cordis'

export const name = '${id}'
export const inject = []

export function apply(_ctx: Context) {
  console.log('${marker}')
}
`
}

function objectSource(id: string, marker: string): string {
  return `import type { Context } from '@deepseek-ai/cordis'

export default {
  name: '${id}',
  apply(_ctx: Context) {
    console.log('${marker}')
  },
}
`
}

function classSource(id: string, marker: string): string {
  return `import { Service, type Context } from '@deepseek-ai/cordis'

export default class ${pascal(id)}Service extends Service {
  constructor(ctx: Context) {
    super(ctx, '${camel(id)}')
    console.log('${marker}')
  }
}
`
}

function clientHostSource(id: string, marker: string): string {
  return `import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'

export const name = '${id}'
export const inject = []

const NS = settingsNamespace('${id}')

export interface Config {
  enabled?: boolean
}

export const Config: z<Config> = z.object({
  enabled: z.boolean().default(true),
})

export function apply(ctx: Context, config: Config) {
  console.log('${marker}')
  let source = () => config
  installSettingsSection(ctx, NS, Config, config, {
    setSource: current => { source = current },
    onChange: () => { void source() },
  })
}
`
}

function clientSource(id: string): string {
  return `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'

export const name = '${id}-client'
export const inject = ['slots', 'settingsScope']

export function apply(ctx: ClientContext) {
  // Official settings card: settings.plugin.item keyed by the Host namespace.
  // Do not register a top-level settings.section unless you need a whole page.
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: '${id}',
  }, ${pascal(id)}Card))
}

function ${pascal(id)}Card() {
  return null
}
`
}

function clientTsconfig(): string {
  return `${JSON.stringify({
    extends: '../../tsconfig.base.client.json',
    compilerOptions: {
      rootDir: 'src',
      outDir: 'lib/types',
    },
    include: ['src'],
    references: [
      { path: '../../vendor/cordis' },
      { path: '../../vendor/schemastery' },
      { path: '../../packages/settings/settings' },
      { path: '../../packages/client/runtime' },
      { path: '../../packages/client/ui-settings-plugins' },
    ],
  }, null, 2)}\n`
}

function clientBuildConfig(id: string): string {
  return `import { externalClientBundle } from '../../tools/dshx/src/client-build.js'

export default externalClientBundle('${id}', ['lib/types/${id}.js'], {
  clientEntry: 'src/client/index.tsx',
})
`
}

function pascal(id: string): string {
  return id.split('-').filter(Boolean).map(part => part[0]!.toUpperCase() + part.slice(1)).join('')
}

function camel(id: string): string {
  const value = pascal(id)
  return value[0]!.toLowerCase() + value.slice(1)
}

function toolSource(id: string, marker: string): string {
  return `import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = '${id}'
export const inject = ['tools']

export function apply(ctx: Context) {
  console.log('${marker}')
  ctx.tools.register(defineTool({
    name: '${id}_ping',
    description: 'Return a short ping so you can see this scratch tool is mounted.',
    parameters: {
      text: { type: 'string', description: 'Optional echo payload' },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args) {
      return args.text ? \`pong: \${args.text}\` : 'pong'
    },
  }))
}
`
}

export function cmdInit(args: string[], options: CliOptions, root: string): number {
  const name = args[0]
  const kinds = new Set(['function', 'tool', 'client', 'object', 'class'])
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name) || !kinds.has(options.kind)) {
    printReport(report('init', [finding('error', 'usage', 'dshx init <kebab-name> [--kind function|tool|client|object|class]')]), options.json)
    return 1
  }
  const dir = join(pluginsDir(root), name)
  if (existsSync(dir) && !options.force) {
    printReport(report('init', [finding('error', 'exists', `already exists: ${dir}`, { hint: 'pass --force to overwrite scaffold files' })]), options.json)
    return 1
  }
  const marker = `[my-plugins/${name}] loaded`
  const entry = `src/${name}.ts`
  const source = options.kind === 'tool'
    ? toolSource(name, marker)
    : options.kind === 'client'
      ? clientHostSource(name, marker)
      : options.kind === 'object'
        ? objectSource(name, marker)
        : options.kind === 'class'
          ? classSource(name, marker)
          : functionSource(name, marker)
  writeText(join(dir, entry), source)
  if (options.kind === 'client') {
    writeText(join(dir, 'src/client/index.tsx'), clientSource(name))
    writeText(join(dir, 'package.json'), `${JSON.stringify({
      name,
      version: '0.0.0',
      description: `External DSH WebUI plugin ${name}`,
      type: 'module',
      main: `lib/${name}.js`,
      types: `lib/types/${name}.d.ts`,
      scripts: {
        build: 'tsc -p tsconfig.json && tsdown',
        typecheck: 'tsc -p tsconfig.json --noEmit',
      },
      exports: {
        '.': {
          types: `./lib/types/${name}.d.ts`,
          default: `./lib/${name}.js`,
        },
        './client': {
          types: './lib/types/client/index.d.ts',
          default: './lib/client.js',
        },
        './package.json': './package.json',
      },
      dsh: {
        client: {
          inject: ['@deepseek-ai/dsh-client-ui-settings-plugins'],
          platform: 'web',
        },
      },
      files: [
        'lib/*.js',
        'lib/*.js.map',
        'lib/types/**/*.d.ts',
        'cordis.yml',
        'README.md',
      ],
      engines: {
        node: '^22.19.0 || >=24.0.0',
      },
      license: 'MIT',
      peerDependencies: {
        '@deepseek-ai/cordis': '^4.0.1',
        '@deepseek-ai/dsh-client-ui-settings-plugins': '^0.1.0-rc.8',
        '@deepseek-ai/dsh-settings': '^0.1.0-rc.8',
        '@deepseek-ai/schemastery': '^3.18.1',
      },
      devDependencies: {
        '@deepseek-ai/cordis': '^4.0.1',
        '@deepseek-ai/dsh-client-runtime': '^0.1.0-rc.8',
        '@deepseek-ai/dsh-client-ui-settings-plugins': '^0.1.0-rc.8',
        '@deepseek-ai/dsh-settings': '^0.1.0-rc.8',
        '@deepseek-ai/schemastery': '^3.18.1',
        '@types/react': '~18.3.1',
        react: '^18.2.0',
        'react-dom': '^18.2.0',
        tsdown: '^0.22.2',
        typescript: '^6.0.3',
      },
    }, null, 2)}\n`)
    writeText(join(dir, 'tsconfig.json'), clientTsconfig())
    writeText(join(dir, 'tsdown.config.ts'), clientBuildConfig(name))
  }
  writeText(join(dir, 'dshx.yml'), [
    `id: ${name}`,
    `entry: ${entry}`,
    `marker: ${JSON.stringify(marker)}`,
    `kind: ${options.kind}`,
    'profile: web',
    '',
  ].join('\n'))
  writeText(join(dir, 'cordis.yml'), [
    '# portable overlay: relative name only. --patch resolves against the profile',
    '# directory, so cold-boot through `dshx start` / `dshx verify-boot`, not raw pnpm dsh.',
    '- insert:',
    `    - id: ${name}`,
    `      name: './${entry}'`,
    '',
  ].join('\n'))
  const clientNotes = options.kind === 'client' ? [
    '',
    'Install this out-of-tree package independently, then build the Host and browser halves:',
    '',
    '```sh',
    `pnpm --dir my-plugins/${name} install --ignore-workspace`,
    `pnpm --dir my-plugins/${name} build`,
    '```',
    '',
    'The generated `tsdown.config.ts` uses dshx `externalClientBundle`; RC8\'s',
    'repository-internal `packages/client/tsdown.client.ts` rejects `my-plugins/*`.',
    '`dshx check` stays red until `lib/client.js` contains the lazy-CJS handoff.',
  ] : []
  writeText(join(dir, 'README.md'), [
    `# ${name}`,
    '',
    'Scratch plugin. Load it from the repository root with:',
    '',
    '```sh',
    `dshx check ${name}`,
    `dshx verify-boot ${name}`,
    `dshx start web ${name}`,
    '```',
    ...clientNotes,
    '',
    'Read `tools/dshx/knowledge/start-here.md` before changing the contract.',
    '',
  ].join('\n'))
  const result = report('init', [
    finding('ok', 'scaffold', `created my-plugins/${name}`),
    ...options.kind === 'client'
      ? [finding('warn', 'client-build-required', 'build lib/client.js with the RC8-compatible lazy-CJS handoff before check/verify-boot')]
      : [],
    finding('info', 'next', `dshx check ${name} && dshx verify-boot ${name}`),
  ], { dir, kind: options.kind, marker })
  printReport(result, options.json)
  return 0
}

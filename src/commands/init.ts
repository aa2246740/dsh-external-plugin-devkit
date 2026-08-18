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

function clientHostSource(id: string, marker: string): string {
  return `import type { Context } from '@deepseek-ai/cordis'

export const name = '${id}'
export const inject = []

export function apply(_ctx: Context) {
  console.log('${marker}')
}
`
}

function clientSource(id: string): string {
  return `import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

export const name = '${id}-client'
export const inject = ['slots']

export function apply(_ctx: ClientContext) {
  // Register additive slots only. Read tools/dshx/knowledge/maps/extension-points.md
  // before touching official ui-files or replacing a core surface.
}
`
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
  if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
    printReport(report('init', [finding('error', 'usage', 'dshx init <kebab-name> [--kind function|tool|client]')]), options.json)
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
      : functionSource(name, marker)
  writeText(join(dir, entry), source)
  if (options.kind === 'client') {
    writeText(join(dir, 'src/client/index.tsx'), clientSource(name))
    writeText(join(dir, 'package.json'), `${JSON.stringify({
      name,
      version: '0.0.0',
      type: 'module',
      main: entry,
      exports: {
        '.': `./${entry}`,
        './client': './src/client/index.tsx',
      },
      dsh: {
        client: {
          inject: ['@deepseek-ai/dsh-client-runtime'],
          platform: 'web',
        },
      },
    }, null, 2)}\n`)
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
    '# directory, so boot through `dshx start` / `dshx verify`, not raw pnpm dsh.',
    '- insert:',
    `    - id: ${name}`,
    `      name: './${entry}'`,
    '',
  ].join('\n'))
  writeText(join(dir, 'README.md'), [
    `# ${name}`,
    '',
    'Scratch plugin. Load it from the repository root with:',
    '',
    '```sh',
    `pnpm dshx check ${name}`,
    `pnpm dshx verify ${name}`,
    `pnpm dshx start web ${name}`,
    '```',
    '',
    'Read `tools/dshx/knowledge/start-here.md` before changing the contract.',
    '',
  ].join('\n'))
  const result = report('init', [
    finding('ok', 'scaffold', `created my-plugins/${name}`),
    finding('info', 'next', `dshx check ${name} && dshx verify ${name}`),
  ], { dir, kind: options.kind, marker })
  printReport(result, options.json)
  return 0
}

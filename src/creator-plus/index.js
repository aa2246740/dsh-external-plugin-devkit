/** Creator Mode+ model tools backed by fixed dshx operations. */

import { currentWebPort, runDshx } from './runner.js'

export const name = 'dshx-creator-plus'
export const inject = ['tools']

const PLUGIN_ID = /^[a-z][a-z0-9-]*$/
const KINDS = new Set(['function', 'tool', 'client', 'object', 'class'])
const CHANGES = new Set(['patch', 'manifest', 'preset', 'client', 'new-client', 'server', 'artifact'])

function pluginId(value) {
  if (!PLUGIN_ID.test(value)) throw new Error('plugin name must be lower-case kebab-case')
  return value
}

function choice(value, allowed, label) {
  if (!allowed.has(value)) throw new Error(`${label} is not supported: ${value}`)
  return value
}

const output = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
}

/** Register file-backed Creator Mode+ operations for one preset scope. */
export function apply(ctx) {
  console.log('[dshx/creator-plus] loaded')

  ctx.tools.register({
    name: 'dshx_scaffold',
    description: 'Create a new file-backed plugin under the configured Harness my-plugins directory. It never overwrites an existing project.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Lower-case kebab-case plugin id' },
        kind: { type: 'string', description: 'function, tool, client, object, or class' },
      },
      required: ['name', 'kind'],
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    output,
    execute(args, exec) {
      return runDshx([
        'init', pluginId(args.name), '--kind', choice(args.kind, KINDS, 'plugin kind'),
      ], exec.signal)
    },
    presentCall: args => ({ card: 'generic', title: `dshx scaffold ${args.name}`, kind: 'edit', rawInput: args }),
  })

  ctx.tools.register({
    name: 'dshx_check',
    description: 'Run external-plugin static checks, including client Cordis service inject, and verify the built-client handoff. Passing proves SOURCE_BUILT only, not live activation.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Plugin id under my-plugins' } },
      required: ['name'],
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    output,
    execute(args, exec) {
      return runDshx(['check', pluginId(args.name)], exec.signal)
    },
    presentCall: args => ({ card: 'generic', title: `dshx check ${args.name}`, kind: 'read', rawInput: args.name }),
  })

  ctx.tools.register({
    name: 'dshx_activation_plan',
    description: 'Classify one change as patch, manifest, preset, client, new-client, server, or artifact before any new-session, reload, or restart decision.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Plugin id under my-plugins' },
        change: { type: 'string', description: 'patch, manifest, preset, client, new-client, server, or artifact' },
      },
      required: ['name', 'change'],
      additionalProperties: false,
    },
    timeoutMs: 60_000,
    output,
    execute(args, exec) {
      return runDshx([
        'activation-plan', pluginId(args.name), '--change', choice(args.change, CHANGES, 'change surface'),
      ], exec.signal)
    },
    presentCall: args => ({ card: 'generic', title: `dshx plan ${args.change}`, kind: 'read', rawInput: args }),
  })

  ctx.tools.register({
    name: 'dshx_activate_new_client',
    description: 'Safely activate one already-built my-plugins Web client: validate it, install its profile link before touching the watched patch, hot-mount the Host row, and prove the current Host boot manifest. It never reloads the browser or restarts DSH.',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Plugin id under my-plugins' } },
      required: ['name'],
      additionalProperties: false,
    },
    timeoutMs: 90_000,
    output,
    execute(args, exec) {
      return runDshx([
        'activate-new-client', pluginId(args.name), '--profile', 'web', '--port', String(currentWebPort()),
      ], exec.signal)
    },
    presentCall: args => ({ card: 'generic', title: `dshx activate ${args.name}`, kind: 'edit', rawInput: args.name }),
  })

  ctx.tools.register({
    name: 'dshx_status',
    description: 'Read the external dshx supervisor and Web Host status. This tool never starts, stops, or restarts DSH.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    timeoutMs: 30_000,
    output,
    execute(_args, exec) {
      return runDshx(['status'], exec.signal)
    },
    presentCall: () => ({ card: 'generic', title: 'dshx status', kind: 'read' }),
  })
}

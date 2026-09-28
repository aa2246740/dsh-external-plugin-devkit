import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
// @ts-ignore -- same portable policy used by the Host bridge.
import { assertPluginSource, auditPluginSource, coreWriteReason, creatorCoreMutationReason } from '../src/core-boundary.js'
import { cmdInit } from '../src/commands/init.ts'
import { loadPlugin } from '../src/internal/plugin.ts'
import { parseCli } from '../src/internal/io.ts'
import { cmdUpdate } from '../src/commands/update.ts'

function fixture(t: { after: (fn: () => void) => void }) {
  const base = mkdtempSync(join(tmpdir(), 'dshx-core-boundary-'))
  t.after(() => rmSync(base, { recursive: true, force: true }))
  const root = join(base, 'harness'), plugin = join(base, 'plugin')
  mkdirSync(join(root, 'packages/client/menu/src'), { recursive: true })
  mkdirSync(plugin)
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-root' }))
  const core = join(root, 'packages/client/menu/src/index.ts')
  writeFileSync(core, 'official source\n')
  return { base, root, plugin, core }
}
test('official source, generated output, new files and copied checkouts are protected', t => {
  const { root, plugin, core } = fixture(t)
  for (const path of [core, join(root, 'packages/client/menu/lib/client.js'), join(root, 'package.json')]) {
    assert.match(coreWriteReason(path, root), /CORE_SOURCE_IMMUTABLE/)
    assert.match(coreWriteReason(path), /CORE_SOURCE_IMMUTABLE/, 'copies do not need active-root identity')
  }
  assert.equal(coreWriteReason(join(plugin, 'src/index.ts'), root), undefined)
  assert.equal(coreWriteReason(join(root, 'my-plugins/demo/src/index.ts'), root), undefined)
})
test('canonical identity blocks symlink and symlink-parent traversal into Host source', t => {
  const { root, plugin, core } = fixture(t)
  symlinkSync(join(root, 'packages/client/menu'), join(plugin, 'host-alias'), 'dir')
  assert.match(coreWriteReason(join(plugin, 'host-alias/src/new.ts'), root), /CORE_SOURCE_IMMUTABLE/)
  assert.match(coreWriteReason(`${plugin}/host-alias/../menu/src/index.ts`, root), /CORE_SOURCE_IMMUTABLE/)
  mkdirSync(join(plugin, 'src'))
  symlinkSync(core, join(plugin, 'src/index.ts'))
  writeFileSync(join(plugin, 'dshx.yml'), 'id: demo\nentry: src/index.ts\nkind: function\n')
  assert.throws(() => loadPlugin(root, plugin), /CORE_SOURCE_IMMUTABLE/)
})
test('init --force cannot overwrite a my-plugins link to official source', t => {
  const { root, core } = fixture(t)
  mkdirSync(join(root, 'my-plugins'))
  symlinkSync(join(root, 'packages/client/menu'), join(root, 'my-plugins/demo'), 'dir')
  const { options } = parseCli(['init', 'demo', '--force', '--json'])
  assert.equal(cmdInit(['demo'], options, root), 1)
  assert.equal(readFileSync(core, 'utf8'), 'official source\n')
})
test('shipping rejects official replacement packages and concrete Host patch artifacts', t => {
  const { root, plugin } = fixture(t)
  writeFileSync(join(plugin, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-client-menu' }))
  assert.throws(() => assertPluginSource(root, plugin), /official package/)
  writeFileSync(join(plugin, 'package.json'), JSON.stringify({ name: 'external-demo' }))
  writeFileSync(join(plugin, 'host.patch'), '--- a/packages/client/menu/src/index.ts\n+++ b/packages/client/menu/src/index.ts\n@@\n-old\n+new\n')
  assert.equal(auditPluginSource(root, plugin).length, 1)
  writeFileSync(join(plugin, 'host.patch'), '--- a/src/index.ts\n+++ b/src/index.ts\n')
  assert.deepEqual(auditPluginSource(root, plugin), [])
})
test('compiler references and outputs cannot write back into the Host', t => {
  const { root, plugin } = fixture(t)
  writeFileSync(join(plugin, 'tsconfig.json'), JSON.stringify({ references: [{ path: '../harness/packages/client/menu' }], compilerOptions: { outDir: '../harness/packages/client/menu/lib' } }))
  assert.equal(auditPluginSource(root, plugin).length, 2)
  writeFileSync(join(plugin, 'tsconfig.json'), JSON.stringify({ compilerOptions: { rootDir: 'src', outDir: 'lib' }, include: ['src'] }))
  assert.deepEqual(auditPluginSource(root, plugin), [])
})
test('direct edits, patch tools, shell and REPL targets deny core writes but allow reads and plugin builds', t => {
  const { root, plugin, core } = fixture(t)
  const agent = { session: { header: { cwd: plugin } } }
  for (const [name, args] of [
    ['write', { file_path: core, content: 'modified' }],
    ['edit', { file_path: core, old_string: 'official', new_string: 'modified' }],
    ['apply_patch', { patch: `*** Update File: ${core}\n@@\n-old\n+new` }],
    ['apply_patch', { patch: `*** Update File: src/index.ts\n*** Move to: ${core}\n@@\n-old\n+new` }],
    ['bash', { command: `cp src/index.ts '${core}'` }],
    ['bash', { command: `node -e "require('fs').writeFileSync('${core}', 'modified')"` }],
    ['terminal_send', { text: `Path('${core}').write_text('modified')` }],
    ['bash', { command: `git -C '${root}' worktree add ./host` }],
    ['bash', { command: 'node scripts/install-host-seam.mjs' }],
    ['bash', { command: 'npm run build', sandbox_permissions: 'danger-full-access' }],
  ] as const) assert.match(creatorCoreMutationReason({ name, arguments: args, agent }, root, { mode: 'workspace-write', workspaceRoot: plugin }), /CORE_SOURCE_IMMUTABLE/, name)
  assert.equal(creatorCoreMutationReason({ name: 'bash', arguments: { command: `cat '${core}'` }, agent }, root), undefined)
  assert.equal(creatorCoreMutationReason({ name: 'bash', arguments: { command: 'npm run build' }, agent }, root, { mode: 'workspace-write', workspaceRoot: plugin }), undefined)
  for (const policy of [{ mode: 'danger-full-access', workspaceRoot: plugin }, { mode: 'workspace-write', workspaceRoot: root }, { mode: 'workspace-write', workspaceRoot: plugin, shellConfined: false }]) {
    assert.match(creatorCoreMutationReason({ name: 'bash', arguments: { command: 'npm run build' }, agent }, root, policy), /CORE_SOURCE_IMMUTABLE/)
  }
  assert.match(creatorCoreMutationReason({ name: 'bash', arguments: { command: 'git push origin HEAD:main' }, agent }, root), /CREATOR_SANDBOX_UNAVAILABLE/)
  assert.equal(creatorCoreMutationReason({ name: 'write', arguments: { file_path: 'src/new.ts' }, agent }, root), undefined)
})

test('source-changing update stages fail before creating state even with --force', async t => {
  const { root, core } = fixture(t)
  for (const action of ['prepare', 'verify', 'apply', 'rollback']) {
    const { options } = parseCli(['update', action, '--force', '--json'])
    assert.equal(await cmdUpdate([action], options, root), 1)
  }
  assert.equal(readFileSync(core, 'utf8'), 'official source\n')
})

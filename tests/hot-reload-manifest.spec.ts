import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { loadPlugin } from '../src/internal/plugin.ts'

function fixture(manifest: string, files: Record<string, string> = {}): { root: string; plugin: string } {
  const root = mkdtempSync(join(tmpdir(), 'dshx-hot-reload-manifest-'))
  const plugin = join(root, 'my-plugins', 'demo')
  mkdirSync(join(plugin, 'src'), { recursive: true })
  writeFileSync(join(plugin, 'dshx.yml'), manifest)
  for (const [path, source] of Object.entries({ 'src/index.ts': 'export default () => {}\n', ...files })) {
    const target = join(plugin, path)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, source)
  }
  return { root, plugin }
}

describe('hotReload manifest artifacts', () => {
  it('does not constrain ordinary manifests and preserves a declared ordered artifact set', () => {
    const implicit = fixture('id: demo\nentry: src/index.ts\n')
    assert.equal(loadPlugin(implicit.root, 'demo').hotReload, undefined)

    const explicit = fixture([
      'id: demo',
      'entry: src/index.ts',
      'hotReload:',
      '  artifacts:',
      '    - src/helper.ts',
      '    - src/index.ts',
      '',
    ].join('\n'), { 'src/helper.ts': 'export const value = 1\n' })
    assert.deepEqual(loadPlugin(explicit.root, 'demo').hotReload!.artifacts, ['src/helper.ts', 'src/index.ts'])
  })

  it('requires the entry, exact runtime source paths, uniqueness, and the 32-file bound', () => {
    const cases: Array<[string, string, RegExp, Record<string, string>?]> = [
      ['missing-entry', '    - src/helper.ts', /must include the plugin entry/, { 'src/helper.ts': '' }],
      ['glob', '    - src/*.ts\n    - src/index.ts', /glob syntax/],
      ['escape', '    - ../outside.ts\n    - src/index.ts', /exact normalized path/],
      ['node-modules', '    - node_modules/pkg/index.js\n    - src/index.ts', /node_modules/],
      ['declaration', '    - src/types.d.ts\n    - src/index.ts', /runtime source file/, { 'src/types.d.ts': '' }],
      ['duplicate', '    - src/index.ts\n    - src/index.ts', /duplicate paths/],
    ]
    for (const [name, list, expected, files] of cases) {
      const test = fixture(`id: demo\nentry: src/index.ts\nhotReload:\n  artifacts:\n${list}\n`, files)
      assert.throws(() => loadPlugin(test.root, 'demo'), expected, name)
    }

    const files: Record<string, string> = {}
    const paths: string[] = []
    for (let i = 0; i < 32; i++) {
      const path = i === 0 ? 'src/index.ts' : `src/file-${i}.ts`
      paths.push(`    - ${path}`)
      files[path] = ''
    }
    paths.push('    - src/file-32.ts')
    files['src/file-32.ts'] = ''
    const tooMany = fixture(`id: demo\nentry: src/index.ts\nhotReload:\n  artifacts:\n${paths.join('\n')}\n`, files)
    assert.throws(() => loadPlugin(tooMany.root, 'demo'), /must contain 1 to 32 files/)
  })

  it('allows the package root symlink but rejects an artifact symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'dshx-hot-reload-link-'))
    const source = join(root, 'source')
    const plugins = join(root, 'my-plugins')
    mkdirSync(join(source, 'src'), { recursive: true })
    mkdirSync(plugins, { recursive: true })
    writeFileSync(join(source, 'dshx.yml'), 'id: demo\nentry: src/index.ts\nhotReload:\n  artifacts: [src/index.ts]\n')
    writeFileSync(join(source, 'src', 'real.ts'), 'export default () => {}\n')
    symlinkSync('real.ts', join(source, 'src', 'index.ts'))
    symlinkSync(source, join(plugins, 'demo'))

    assert.throws(() => loadPlugin(root, 'demo'), /cannot traverse a symlink/)

    writeFileSync(join(source, 'dshx.yml'), 'id: demo\nentry: src/real.ts\nhotReload:\n  artifacts: [src/real.ts]\n')
    assert.deepEqual(loadPlugin(root, 'demo').hotReload!.artifacts, ['src/real.ts'])
  })
})

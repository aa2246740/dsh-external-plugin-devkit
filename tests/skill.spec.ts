import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'

const skill = readFileSync(join(import.meta.dirname, '../skill/dshx/SKILL.md'), 'utf8')
const creatorSkill = readFileSync(join(import.meta.dirname, '../creator-plus/skills/creator-mode-plus/SKILL.md'), 'utf8')

describe('dshx skill workflow', () => {
  it('builds and checks a fresh new client before activation planning', () => {
    assert.doesNotMatch(skill, /target exists and before implementation/)
    assert.doesNotMatch(skill, /Do not implement until the plan/)
    assert.match(skill, /freshly scaffolded `new-client`.*implement, build, and pass `check` before activation-plan/s)
    assert.match(skill, /fresh `new-client`.*after `check` passes/is)
  })

  it('keeps the bundled Creator+ skill on the complete 0.7.3 workflow', () => {
    assert.doesNotMatch(creatorSkill, />=0\.6\.2 <0\.7\.0/)
    assert.doesNotMatch(creatorSkill, /Do not implement until the plan/)
    assert.match(creatorSkill, />=0\.7\.3 <0\.8\.0/)
    assert.match(creatorSkill, /dshx_remove_plugin/)
    assert.match(creatorSkill, /detached-orphan-symlink/)
    assert.match(creatorSkill, /seven fixed model tools/)
    assert.match(creatorSkill, /fresh `new-client`.*only after `dshx_check` exits `0`/s)
    assert.match(creatorSkill, /update plan → prepare → verify → apply/)
    assert.match(creatorSkill, /external `dshx plugin remove <package>/)
  })
})

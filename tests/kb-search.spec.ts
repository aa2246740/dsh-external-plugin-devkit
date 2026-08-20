import { describe, expect, it } from 'vitest'
import { RETRIEVAL_FIXTURES, retrieveKnowledge } from '../src/internal/okf.js'

const REQUIRED_QUERIES = [
  'dshx check',
  'activation-plan',
  'cordis.yml name',
  'externalClientBundle',
  'ctx.commands',
  'agent/pre-step',
  'tools.define',
  'cordis_define',
  'ctx.i18n',
  'ctx.skills',
  '$skill',
  'dollar skill',
  '美元符号',
  'ctx.ui',
  'ctx.session',
  'ctx.storage',
  'ctx.logger',
  'ctx.cron',
  'ctx.http',
] as const

describe('kb retrieval fixtures',
  () => {
    it('covers the required query set',
      () => {
        for (const query of REQUIRED_QUERIES) {
          expect(RETRIEVAL_FIXTURES[query], query).toBeDefined()
          expect(retrieveKnowledge(query).length).toBeGreaterThan(0)
        }
      },
    )
  },
)

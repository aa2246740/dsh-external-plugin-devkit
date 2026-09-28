import { readFileSync } from 'node:fs'
import { createWebProofRequest } from '../internal/web-proof-auth.ts'
const { access, operation, timeoutMs } = JSON.parse(readFileSync(0, 'utf8'))
const request = createWebProofRequest(access.port)
const response = await request(`http://127.0.0.1:${access.port}/dsh-creator-mode-plus/desktop-profile`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-dshx-profile-ticket': access.token },
  body: JSON.stringify(operation), signal: AbortSignal.timeout(timeoutMs),
})
process.stdout.write(await response.text())

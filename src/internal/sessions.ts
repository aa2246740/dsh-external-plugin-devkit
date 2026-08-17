import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

const ZSTD_MAGIC = 0xFD2FB528

interface FrameRange {
  start: number
  end: number
}

function scanZstdFrames(buffer: Buffer): FrameRange[] {
  const frames: FrameRange[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) break
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) break
    offset += 4
    if (offset >= buffer.length) break
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0) break
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) break
    offset += remainingHeaderBytes
    let ok = true
    for (;;) {
      if (buffer.length - offset < 3) {
        ok = false
        break
      }
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03) {
        ok = false
        break
      }
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) {
        ok = false
        break
      }
      offset += payloadBytes
      if (lastBlock) break
    }
    if (!ok) break
    if (checksum) {
      if (buffer.length - offset < 4) break
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return frames
}

export function decodeSessionLog(path: string): string {
  const raw = readFileSync(path)
  if (path.endsWith('.jsonl') && !path.endsWith('.zstd')) return raw.toString('utf8')
  const frames = scanZstdFrames(raw)
  if (frames.length === 0) {
    try {
      return zstdDecompressSync(raw).toString('utf8')
    } catch {
      throw new Error(`cannot decode session log: ${path}`)
    }
  }
  const parts: Buffer[] = []
  for (const frame of frames) {
    parts.push(zstdDecompressSync(raw.subarray(frame.start, frame.end)))
  }
  return Buffer.concat(parts).toString('utf8')
}

export interface SessionSummary {
  id: string
  path: string
  createdAt?: number
  agentPreset?: string
  cwd?: string
  calls: number
  results: number
  orphanCallIds: string[]
  openTurn: boolean
  lastTypes: string[]
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    let stat
    try {
      stat = statSync(path)
    } catch {
      continue
    }
    if (stat.isDirectory()) walkFiles(path, acc)
    else if (name === 'session.jsonl' || name === 'session.jsonl.zstd') acc.push(path)
  }
  return acc
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

export function inspectLogText(path: string, text: string): SessionSummary {
  const lines = text.split(/\r?\n/).filter(Boolean)
  let id = 'unknown'
  let createdAt: number | undefined
  let agentPreset: string | undefined
  let cwd: string | undefined
  const pending = new Set<string>()
  let calls = 0
  let results = 0
  let openTurn = false
  const lastTypes: string[] = []
  for (const line of lines) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      continue
    }
    const rec = asRecord(parsed)
    if (!rec) continue
    const type = typeof rec.type === 'string' ? rec.type : ''
    if (type) {
      lastTypes.push(type)
      if (lastTypes.length > 12) lastTypes.shift()
    }
    if (type === 'session') {
      if (typeof rec.id === 'string') id = rec.id
      if (typeof rec.createdAt === 'number') createdAt = rec.createdAt
      if (typeof rec.agentPreset === 'string') agentPreset = rec.agentPreset
      if (typeof rec.cwd === 'string') cwd = rec.cwd
      continue
    }
    const data = asRecord(rec.data)
    if (type === 'turn/start') openTurn = true
    if (type === 'turn/end') openTurn = false
    if (type === 'tool/call') {
      calls += 1
      const callId = typeof data?.callId === 'string' ? data.callId : undefined
      if (callId) pending.add(callId)
    }
    if (type === 'tool/result') {
      results += 1
      const callId = typeof data?.callId === 'string' ? data.callId : undefined
      if (callId) pending.delete(callId)
    }
  }
  return {
    id,
    path,
    createdAt,
    agentPreset,
    cwd,
    calls,
    results,
    orphanCallIds: [...pending],
    openTurn,
    lastTypes,
  }
}

export function listSessions(root: string): SessionSummary[] {
  const files = walkFiles(root)
  const out: SessionSummary[] = []
  for (const path of files) {
    try {
      out.push(inspectLogText(path, decodeSessionLog(path)))
    } catch (error) {
      out.push({
        id: path,
        path,
        calls: 0,
        results: 0,
        orphanCallIds: [],
        openTurn: false,
        lastTypes: [],
        agentPreset: error instanceof Error ? `decode-failed: ${error.message}` : 'decode-failed',
      })
    }
  }
  return out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

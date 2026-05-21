import type { SseEvent } from './types.js'

export type SseWriter = (event: SseEvent) => Promise<void>

export function createSseWriter(
  writeRaw: (line: string) => Promise<void>
): SseWriter {
  return async (event: SseEvent) => {
    await writeRaw(`data: ${JSON.stringify(event)}\n\n`)
  }
}

/** 兼容旧版 OpenAI delta 格式（可选） */
export async function writeLegacyToken(
  writeRaw: (line: string) => Promise<void>,
  content: string
) {
  await writeRaw(
    `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`
  )
}

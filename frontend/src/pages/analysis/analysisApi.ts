import type { AnalysisSession, ClientEvent, SseEvent } from '../../types/analysis'

export async function dispatchAnalysisEvent(
  session: AnalysisSession | null,
  event: ClientEvent,
  onEvent: (ev: SseEvent) => void
): Promise<void> {
  const res = await fetch('/api/analysis/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session, event })
  })
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (!data || data === '[DONE]') continue
      try {
        const parsed = JSON.parse(data) as SseEvent
        onEvent(parsed)
      } catch {
        /* legacy */
      }
    }
  }
}

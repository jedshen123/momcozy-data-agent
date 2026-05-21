import OpenAI from 'openai'

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  baseURL: 'https://api.deepseek.com'
})

export interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 流式调用 DeepSeek API
 * @param messages 对话历史
 * @param systemPrompt 系统提示词（可选）
 */
export async function* streamChat(messages: Message[], systemPrompt?: string) {
  const allMessages: Message[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  const stream = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: allMessages,
    stream: true,
    temperature: 0.7
  })

  for await (const chunk of stream) {
    const content = chunk.choices[0]?.delta?.content
    if (content) {
      yield content
    }
  }
}

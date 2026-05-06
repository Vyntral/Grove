import { agent, supervise } from '@vyntral/grove-core'

const a = agent({
  name: 'svc',
  model: 'openai/gpt-5/mini',
  system: 'v1',
})

export const tree = supervise({ name: 'r', children: [a] })

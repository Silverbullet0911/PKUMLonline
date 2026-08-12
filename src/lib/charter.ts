export interface CharterBlock {
  id: string
  heading: string
  content: string[]
}

export function splitCharter(raw: string): CharterBlock[] {
  const lines = raw.split(/\r?\n/).map(l => l.replace(/^﻿/, '').trimEnd())
  const blocks: CharterBlock[] = []
  let cur: CharterBlock | null = null
  for (const line of lines) {
    const m = line.match(/^第(\d+)条/)
    if (m) {
      cur = { id: m[1], heading: line, content: [] }
      blocks.push(cur)
    } else if (cur) {
      if (line.trim()) cur.content.push(line)
    } else if (line.trim()) {
      if (!blocks.length) blocks.push({ id: '0', heading: '章程', content: [] })
      blocks[0].content.push(line)
    }
  }
  return blocks
}

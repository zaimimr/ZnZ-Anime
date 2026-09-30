export const keyboardRows: string[][] = [
  ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  ['h', 'i', 'j', 'k', 'l', 'm', 'n'],
  ['o', 'p', 'q', 'r', 's', 't', 'u'],
  ['v', 'w', 'x', 'y', 'z', '-', ':'],
  ['1', '2', '3', '4', '5', '6', '7'],
  ['8', '9', '0', 'space', 'del', 'clear'],
]

const MAX = 60

export function applyKey(text: string, key: string): string {
  if (key === 'del') return text.slice(0, -1)
  if (key === 'clear') return ''
  if (text.length >= MAX) return text
  return text + (key === 'space' ? ' ' : key)
}

import { execFileSync } from 'node:child_process'

const source = new URL('./icon.svg', import.meta.url).pathname
const target = new URL('../public/icon.png', import.meta.url).pathname
execFileSync('rsvg-convert', ['-w', '512', '-h', '512', source, '-o', target])

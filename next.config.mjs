import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

// Asset versioning for fast repeat visits: public/app.html is public/index.html with `?v=<content hash>` added to
// every local script, stylesheet and image it names (also the lazily loaded ones listed in its inline script).
// proxy.ts lets browsers keep such versioned files for a year, and a deploy changes the hash, so new code
// arrives at once. `next dev` keeps serving the unversioned index.html, so edits show up without a rebuild.
export function versionShell(root = process.cwd()) {
  const dir = path.join(root, 'public')
  const hashes = new Map()
  const hash = file => {
    if (!hashes.has(file)) hashes.set(file, createHash('sha256').update(readFileSync(path.join(dir, file))).digest('hex').slice(0, 12))
    return hashes.get(file)
  }
  // Add ?v=<hash> to quoted local file names; `page` is the page's own path, so "../x.js" resolves correctly.
  const version = (html, page) => html.replace(
    /(["'])((?:\.\.\/)*(?:[a-z0-9-]+\/)*[a-z0-9_.-]+\.(?:js|css|png|svg|webp))\1/gi,
    (match, quote, ref) => {
      const file = path.posix.normalize(path.posix.join(path.posix.dirname(page), ref))
      return !file.startsWith('..') && existsSync(path.join(dir, file)) ? `${quote}${ref}?v=${hash(file)}${quote}` : match
    })
  // The framed pages first (they only name scripts and styles), then the shell, which also points at them.
  const frames = { 'quarters/index.html': 'quarters/index.app.html', 'quarters/highs.html': 'quarters/highs.app.html' }
  let shell = version(readFileSync(path.join(dir, 'index.html'), 'utf8'), 'index.html')
  for (const [page, copy] of Object.entries(frames)) {
    writeFileSync(path.join(dir, copy), version(readFileSync(path.join(dir, page), 'utf8'), page))
    shell = shell.replaceAll(page, `${copy}?v=${hash(copy)}`)
  }
  writeFileSync(path.join(dir, 'app.html'), shell)
  return hashes.size
}

export default function config(phase) {
  let shell = '/index.html'
  if (phase !== 'phase-development-server') {   // PHASE_DEVELOPMENT_SERVER (next/constants)
    try { versionShell(); shell = '/app.html' } catch (error) { console.warn('Asset versioning skipped:', error.message) }
  }
  /** @type {import('next').NextConfig} */
  return {
    typescript: { ignoreBuildErrors: true },
    images: { unoptimized: true },
    async rewrites() {
      return [{ source: '/', destination: shell }]
    },
  }
}

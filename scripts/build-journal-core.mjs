// Bundles the vendored LuxAlgo Trade Journal engine (vendor/luxalgo-trade-journal, MIT) into
// public/journal-core.js as the global `LuxJournal`. Run after updating the vendored sources.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const vendor = path.join(root, 'vendor/luxalgo-trade-journal'), out = path.join(root, 'public/journal-core.js')
execFileSync('npx', ['-y', 'esbuild@0.24.2', path.join(vendor, 'entry.ts'), '--bundle', '--format=iife', '--global-name=LuxJournal',
  '--target=es2020', '--minify-syntax', '--legal-comments=none', `--alias:@luxalgo/journal-core=${path.join(vendor, 'core/src/index.ts')}`, `--outfile=${out}`], { stdio: 'inherit' })
const license = readFileSync(path.join(vendor, 'LICENSE'), 'utf8').trim().split('\n').map(l => (' * ' + l).trimEnd()).join('\n')
writeFileSync(out, `/*!\n * LuxAlgo Trade Journal engine and importers (packages/core, packages/importers), bundled.\n * Source: https://github.com/LuxAlgo/trade-journal, see vendor/luxalgo-trade-journal.\n *\n${license}\n */\n` + readFileSync(out, 'utf8'))

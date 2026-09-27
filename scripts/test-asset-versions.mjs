import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { versionShell } from '../next.config.mjs'

// A miniature public/ folder: the shell, one framed page and a few assets.
const root = mkdtempSync(path.join(tmpdir(), 'versions-'))
const pub = path.join(root, 'public')
mkdirSync(path.join(pub, 'quarters'), { recursive: true })
writeFileSync(path.join(pub, 'app.js'), 'one')
writeFileSync(path.join(pub, 'lazy.js'), 'lazy')
writeFileSync(path.join(pub, 'logo.png'), 'png')
writeFileSync(path.join(pub, 'quarters', 'base.css'), 'css')
writeFileSync(path.join(pub, 'quarters', 'highs.html'), '<script src="../app.js"></script>')
writeFileSync(path.join(pub, 'quarters', 'index.html'), '<link rel="stylesheet" href="base.css" /><script src="../app.js"></script><script src="../missing.js"></script>')
writeFileSync(path.join(pub, 'index.html'), `<img src="logo.png"><script src="app.js"></script><script>const LAZY = ["lazy.js", "gone.js"]; const URL = 'quarters/index.html#events', H = 'quarters/highs.html'</script>`)

versionShell(root)
const shell = readFileSync(path.join(pub, 'app.html'), 'utf8')
const frame = readFileSync(path.join(pub, 'quarters', 'index.app.html'), 'utf8')
const v = s => s.match(/\?v=([0-9a-f]{12})/)?.[1]

assert.match(shell, /src="app\.js\?v=[0-9a-f]{12}"/)
assert.match(shell, /src="logo\.png\?v=[0-9a-f]{12}"/)
assert.match(shell, /"lazy\.js\?v=[0-9a-f]{12}"/, 'lazily loaded files named in inline code are versioned too')
assert.match(shell, /"gone\.js"/, 'unknown files are left alone')
assert.match(shell, /'quarters\/index\.app\.html\?v=[0-9a-f]{12}#events'/, 'the framed page is versioned and keeps its fragment')
assert.match(shell, /'quarters\/highs\.app\.html\?v=[0-9a-f]{12}'/)
assert.match(frame, /href="base\.css\?v=[0-9a-f]{12}"/)
assert.match(frame, /src="\.\.\/app\.js\?v=[0-9a-f]{12}"/, '"../" references resolve against the page folder')
assert.match(frame, /src="\.\.\/missing\.js"/)
assert.equal(v(shell.match(/app\.js\?v=\w+/)[0]), v(frame.match(/app\.js\?v=\w+/)[0]), 'one file, one hash, wherever it is named')
assert.ok(existsSync(path.join(pub, 'quarters', 'highs.app.html')))
// Changing a file changes its hash; the source pages are never modified.
const before = v(shell.match(/app\.js\?v=\w+/)[0])
writeFileSync(path.join(pub, 'app.js'), 'two')
versionShell(root)
assert.notEqual(v(readFileSync(path.join(pub, 'app.html'), 'utf8').match(/app\.js\?v=\w+/)[0]), before)
assert.equal(readFileSync(path.join(pub, 'index.html'), 'utf8').includes('?v='), false)

// The real shell: every local script it loads (eagerly or lazily) gets a version.
versionShell(process.cwd())
const real = readFileSync('public/app.html', 'utf8')
const eager = [...readFileSync('public/index.html', 'utf8').matchAll(/<script src="([^"]+)"/g)].map(m => m[1])
for (const src of eager) assert.match(real, new RegExp(`src="${src.replace(/[.]/g, '\\.')}\\?v=`), src)
for (const lazy of ['monitor.js', 'world-data.js', 'post-creator.js']) assert.match(real, new RegExp(`"${lazy.replace('.', '\\.')}\\?v=`), lazy)
console.log('PASS asset versions: scripts, styles, images, lazy lists, framed pages, "../" paths, missing files and hash changes')

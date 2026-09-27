// One shared Hyperliquid WebSocket for the whole page. Panels subscribe to candles, trades, the order book or market
// context; identical subscriptions share one feed (reference counted) and the socket closes shortly after the last
// panel leaves. On reconnect every live subscription is sent again and listeners get a 'gap' status, so callers can
// reload a REST snapshot for the time the socket was down. Exposed as HLStream (browser) or module.exports (tests).
(function (root) {
  'use strict'
  const URL = 'wss://api.hyperliquid.xyz/ws'
  const TYPES = new Set(['candle', 'trades', 'l2Book', 'activeAssetCtx', 'allMids'])

  // The key a subscription and its incoming messages share.
  function keyOf(sub) {
    if (sub.type === 'candle') return `candle:${sub.coin}:${sub.interval}`
    if (sub.type === 'allMids') return `allMids:${sub.dex || ''}`
    return `${sub.type}:${sub.coin}`
  }
  function keyOfMessage(msg) {
    const d = msg.data
    if (!d) return null
    switch (msg.channel) {
      case 'candle': return `candle:${d.s}:${d.i}`
      case 'trades': return Array.isArray(d) && d.length ? `trades:${d[0].coin}` : null
      case 'l2Book': return `l2Book:${d.coin}`
      case 'activeAssetCtx': return `activeAssetCtx:${d.coin}`
      case 'allMids': return `allMids:${d.dex || ''}`
      default: return null
    }
  }

  function create(deps = {}) {
    const Socket = deps.WebSocket || root.WebSocket
    const later = deps.setTimeout || setTimeout, cancel = deps.clearTimeout || clearTimeout
    const now = deps.now || Date.now, random = deps.random || Math.random
    const IDLE_CLOSE = deps.idleClose ?? 30000, PING = 15000, SILENT = 45000
    const subs = new Map()        // key -> { sub, listeners:Set, statusListeners:Set }
    let socket = null, retry = 0, heartbeat = 0, idle = 0, attempts = 0, lastMessage = 0, status = 'idle', wasLive = false

    function setStatus(next) {
      if (next === status) return
      status = next
      for (const entry of subs.values()) for (const fn of entry.statusListeners) try { fn(next) } catch {}
    }
    function send(payload) { if (socket?.readyState === 1) socket.send(JSON.stringify(payload)) }
    function open() {
      cancel(retry); retry = 0
      if (socket || !subs.size) return
      setStatus(wasLive ? 'gap' : 'connecting')
      let current
      try { current = socket = new Socket(URL) } catch { socket = null; reconnect(); return }
      const active = () => current === socket
      current.onopen = () => {
        if (!active()) return
        lastMessage = now()
        for (const { sub } of subs.values()) send({ method: 'subscribe', subscription: sub })
        cancel(heartbeat); heartbeat = later(ping, PING)
      }
      current.onmessage = event => {
        if (!active()) return
        lastMessage = now()
        let msg; try { msg = JSON.parse(event.data) } catch { return }
        if (msg.channel === 'subscriptionResponse' || msg.channel === 'pong') { attempts = 0; if (status !== 'live') { wasLive = true; setStatus('live') } return }
        if (msg.channel === 'error') return
        const entry = subs.get(keyOfMessage(msg))
        if (!entry) return
        attempts = 0
        if (status !== 'live') { wasLive = true; setStatus('live') }
        for (const fn of entry.listeners) try { fn(msg.data) } catch (e) { root.console?.error?.(e) }
      }
      current.onerror = () => { if (active()) current.close() }
      current.onclose = () => { if (!active()) return; socket = null; cancel(heartbeat); if (subs.size) reconnect(); else setStatus('idle') }
      // A handshake that never completes is treated like a dropped connection.
      heartbeat = later(() => { if (active() && current.readyState === 0) current.close() }, PING)
    }
    function ping() {
      if (!socket) return
      if (now() - lastMessage > SILENT) { socket.close(); return }
      send({ method: 'ping' })
      heartbeat = later(ping, PING)
    }
    // Exponential backoff with jitter, capped at 30 s, so many tabs do not reconnect in lockstep.
    function reconnect() {
      if (retry || !subs.size) return
      setStatus('gap')
      const base = Math.min(30000, 1000 * 2 ** Math.min(attempts++, 5))
      retry = later(open, base / 2 + random() * base / 2)
    }
    function closeWhenIdle() {
      cancel(idle)
      idle = later(() => { idle = 0; if (!subs.size && socket) { const s = socket; socket = null; cancel(heartbeat); s.close(); wasLive = false; setStatus('idle') } }, IDLE_CLOSE)
    }

    function subscribe(sub, onData, onStatus) {
      if (!sub || !TYPES.has(sub.type)) throw new Error('Nieznany typ subskrypcji Hyperliquid')
      const key = keyOf(sub)
      let entry = subs.get(key)
      if (!entry) {
        entry = { sub: { ...sub }, listeners: new Set(), statusListeners: new Set() }
        subs.set(key, entry)
        send({ method: 'subscribe', subscription: entry.sub })
      }
      entry.listeners.add(onData)
      if (onStatus) { entry.statusListeners.add(onStatus); onStatus(status) }
      cancel(idle); idle = 0
      if (!socket) open()
      let done = false
      return () => {
        if (done) return
        done = true
        entry.listeners.delete(onData)
        if (onStatus) entry.statusListeners.delete(onStatus)
        if (entry.listeners.size || subs.get(key) !== entry) return
        subs.delete(key)
        send({ method: 'unsubscribe', subscription: entry.sub })
        if (!subs.size) { cancel(retry); retry = 0; closeWhenIdle() }
      }
    }
    return {
      subscribe,
      status: () => status,
      size: () => subs.size,
      // Tests and teardown: drop every subscription and the socket.
      close() { subs.clear(); cancel(retry); cancel(heartbeat); cancel(idle); retry = idle = 0; const s = socket; socket = null; s?.close(); wasLive = false; status = 'idle' },
    }
  }

  // Merge a streamed candle into a sorted candle array: replace the bar with the same time or append a newer one.
  // Returns 'update', 'append' or null (older than the last bar, i.e. out of order: ignore).
  function mergeCandle(candles, bar) {
    const last = candles.at(-1)
    if (!last || bar.time > last.time) { candles.push(bar); return 'append' }
    if (bar.time === last.time) { candles[candles.length - 1] = bar; return 'update' }
    return null
  }
  const candleOf = d => ({ time: Math.floor(Number(d.t) / 1000), open: Number(d.o), high: Number(d.h), low: Number(d.l), close: Number(d.c), volume: Number(d.v) })

  const api = { create, keyOf, keyOfMessage, mergeCandle, candleOf }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  else root.HLStream = { ...api, shared: create() }
})(typeof globalThis === 'undefined' ? this : globalThis)

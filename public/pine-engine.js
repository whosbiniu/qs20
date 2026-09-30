// Pine Script (v5/v6 subset) for the terminal: a lexer, a parser and a bar-by-bar interpreter.
// Scripts are interpreted, never turned into JavaScript: a user's script cannot reach the page, the network or
// storage (the page's CSP forbids eval anyway). The result is plain data — plots, levels, shapes, fills and
// background colours per bar — which terminal-pine.js draws on a chart.
//
//   const program = PineEngine.compile(source)            // throws PineError { message, line, col }
//   const out = PineEngine.run(program, candles, { inputs, interval, ticker })
//
// Supported: indicator(), var/varip, typed declarations, :=, += …, history [n], if/else if/else, for, while,
// switch, ternaries, user functions (single-line and block), tuples, the common ta.*, math.*, str.*, color.*,
// input.*, plot/plotshape/plotchar/hline/fill/bgcolor. Not supported (reported by name): strategies,
// request.security, drawings (label/line/box/table), arrays/maps/matrices, libraries and user types.
(function (root) {
  'use strict';

  class PineError extends Error {
    constructor(message, line = 0, col = 0) { super(message); this.name = 'PineError'; this.line = line; this.col = col; }
  }
  const fail = (message, at) => { throw new PineError(message, at?.line || 0, at?.col || 0); };

  // ==== lexer ======================================================================================================
  // import / export / method / type are only special at the start of a statement (a parameter may be called "type").
  const KEYWORDS = new Set(['and', 'or', 'not', 'if', 'else', 'for', 'to', 'by', 'while', 'var', 'varip', 'true', 'false',
    'switch', 'break', 'continue', 'in']);
  const TYPES = new Set(['int', 'float', 'bool', 'string', 'color', 'series', 'simple', 'const', 'input', 'line', 'label', 'box', 'table']);
  const OPS = ['=>', ':=', '+=', '-=', '*=', '/=', '%=', '==', '!=', '<=', '>=', '?', ':', ',', '(', ')', '[', ']', '+', '-', '*', '/', '%', '<', '>', '='];

  function stripComment(line) {
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; }
      else if (c === '"' || c === "'") quote = c;
      else if (c === '/' && line[i + 1] === '/') return line.slice(0, i);
    }
    return line;
  }
  function tokenize(text, line) {
    const out = [];
    let i = 0;
    while (i < text.length) {
      const c = text[i], col = i + 1;
      if (c === ' ' || c === '\t') { i++; continue; }
      if (c === '"' || c === "'") {
        let s = '', j = i + 1;
        for (; j < text.length && text[j] !== c; j++) {
          if (text[j] === '\\' && j + 1 < text.length) { const n = text[++j]; s += n === 'n' ? '\n' : n === 't' ? '\t' : n; }
          else s += text[j];
        }
        if (j >= text.length) fail('Niezamknięty tekst', { line, col });
        out.push({ t: 'str', v: s, line, col }); i = j + 1; continue;
      }
      if (c === '#' && /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?\b/.test(text.slice(i))) {
        const m = text.slice(i).match(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?/)[0];
        out.push({ t: 'color', v: hexColor(m), line, col }); i += m.length; continue;
      }
      const num = text.slice(i).match(/^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/);
      if (num) { out.push({ t: 'num', v: Number(num[0]), line, col }); i += num[0].length; continue; }
      const id = text.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*/);
      if (id) {
        const v = id[0];
        out.push({ t: KEYWORDS.has(v) ? 'kw' : 'id', v, line, col }); i += v.length; continue;
      }
      const op = OPS.find(o => text.startsWith(o, i));
      if (op) { out.push({ t: 'op', v: op, line, col }); i += op.length; continue; }
      fail(`Nieznany znak „${c}”`, { line, col });
    }
    return out;
  }
  const CONTINUES = new Set([',', '+', '-', '*', '/', '%', '?', ':', '==', '!=', '<', '>', '<=', '>=', 'and', 'or', '(', '[']);
  // Logical lines: brackets left open, a following line indented by a non-multiple of 4 spaces, or a line ending in
  // an operator continue the statement; everything else starts a new one at its indentation level (4 spaces).
  function logicalLines(source) {
    const lines = String(source).replace(/\r\n?/g, '\n').split('\n'), out = [];
    let current = null, depth = 0;
    lines.forEach((raw, i) => {
      const text = stripComment(raw).replace(/\t/g, '    ');
      if (!text.trim()) return;
      const indent = text.length - text.trimStart().length, tokens = tokenize(text, i + 1);
      const last = current?.tokens.at(-1);
      if (current && (depth > 0 || indent % 4 !== 0 || (last && CONTINUES.has(last.v) && last.t !== 'str'))) current.tokens.push(...tokens);
      else { current = { indent: indent / 4, line: i + 1, tokens }; out.push(current); }
      for (const t of tokens) if (t.t === 'op') depth += t.v === '(' || t.v === '[' ? 1 : t.v === ')' || t.v === ']' ? -1 : 0;
    });
    if (depth > 0) fail('Niezamknięty nawias', { line: current?.line });
    return out;
  }

  // ==== parser =====================================================================================================
  let nodeIds = 0;
  const node = (k, at, props) => ({ k, id: ++nodeIds, line: at?.line || 0, col: at?.col || 0, ...props });

  class Tokens {
    constructor(list, line) { this.list = list; this.i = 0; this.line = line; }
    peek(o = 0) { return this.list[this.i + o]; }
    next() { const t = this.list[this.i++]; if (!t) fail('Niepełne wyrażenie', { line: this.line }); return t; }
    is(v, o = 0) { const t = this.peek(o); return !!t && (t.t === 'op' || t.t === 'kw') && t.v === v; }
    eat(v) { if (this.is(v)) return this.next(); return null; }
    expect(v) { const t = this.peek(); if (!this.is(v)) fail(`Oczekiwano „${v}”${t ? `, jest „${t.v}”` : ''}`, t || { line: this.line }); return this.next(); }
    done() { return this.i >= this.list.length; }
  }

  function parseExpression(ts) { return parseTernary(ts); }
  function parseTernary(ts) {
    const cond = parseOr(ts);
    if (!ts.is('?')) return cond;
    const at = ts.next(), a = parseTernary(ts);
    ts.expect(':');
    return node('tern', at, { cond, a, b: parseTernary(ts) });
  }
  function binary(next, ops) {
    return ts => {
      let left = next(ts);
      while (ops.some(o => ts.is(o))) { const at = ts.next(); left = node('bin', at, { op: at.v, a: left, b: next(ts) }); }
      return left;
    };
  }
  function parseUnary(ts) {
    if (ts.is('-') || ts.is('+') || ts.is('not')) { const at = ts.next(); return node('un', at, { op: at.v, a: parseUnary(ts) }); }
    return parsePostfix(ts);
  }
  const parseMul = binary(parseUnary, ['*', '/', '%']);
  const parseAdd = binary(parseMul, ['+', '-']);
  const parseCmp = binary(parseAdd, ['<', '>', '<=', '>=']);
  const parseEq = binary(parseCmp, ['==', '!=']);
  const parseAnd = binary(parseEq, ['and']);
  const parseOr = binary(parseAnd, ['or']);

  function parseArgs(ts) {
    const args = [], named = {};
    if (ts.eat(')')) return { args, named };
    for (;;) {
      const t = ts.peek();
      if (t?.t === 'id' && ts.is('=', 1)) { ts.next(); ts.next(); named[t.v] = parseExpression(ts); }
      else { if (Object.keys(named).length) fail('Argument bez nazwy po nazwanych', t); args.push(parseExpression(ts)); }
      if (ts.eat(')')) return { args, named };
      ts.expect(',');
    }
  }
  function parsePostfix(ts) {
    let e = parsePrimary(ts);
    for (;;) {
      if (ts.is('(') && e.k === 'id') { const at = ts.next(); e = node('call', at, { name: e.name, ...parseArgs(ts), line: e.line, col: e.col }); }
      else if (ts.is('[')) { const at = ts.next(); const offset = parseExpression(ts); ts.expect(']'); e = node('index', at, { target: e, offset }); }
      else return e;
    }
  }
  function parsePrimary(ts) {
    const t = ts.next();
    if (t.t === 'num') return node('lit', t, { v: t.v });
    if (t.t === 'str') return node('lit', t, { v: t.v });
    if (t.t === 'color') return node('lit', t, { v: t.v });
    if (t.t === 'kw' && (t.v === 'true' || t.v === 'false')) return node('lit', t, { v: t.v === 'true' });
    if (t.t === 'id') {
      if (t.v === 'na') return node('lit', t, { v: NaN, na: true });
      // A type cast such as float(x) or int(x) is a call; a generic like array<float> is not supported.
      return node('id', t, { name: t.v });
    }
    if (t.t === 'op' && t.v === '(') { const e = parseExpression(ts); ts.expect(')'); return e; }
    if (t.t === 'op' && t.v === '[') {
      const items = [];
      if (!ts.eat(']')) for (;;) { items.push(parseExpression(ts)); if (ts.eat(']')) break; ts.expect(','); }
      return node('tuple', t, { items });
    }
    if (t.t === 'kw' && (t.v === 'if' || t.v === 'switch')) fail(`„${t.v}” jako wartość musi zaczynać przypisanie (x = ${t.v} …)`, t);
    fail(`Nieoczekiwane „${t.v}”`, t);
  }

  function parseProgram(source) {
    nodeIds = 0;
    const lines = logicalLines(source);
    let at = 0;
    function block(level) {
      const body = [];
      while (at < lines.length && lines[at].indent >= level) {
        if (lines[at].indent > level) fail('Nieoczekiwane wcięcie', { line: lines[at].line });
        body.push(statement(level));
      }
      return body;
    }
    function childBlock(level, where) {
      if (at >= lines.length || lines[at].indent <= level) fail('Brak wciętego bloku', { line: where.line });
      return block(level + 1);
    }
    function ifChain(ts, level, first) {
      const cond = parseExpression(ts);
      if (!ts.done()) fail('Nieoczekiwany tekst po warunku', ts.peek());
      const then = childBlock(level, first);
      let otherwise = null;
      if (at < lines.length && lines[at].indent === level && lines[at].tokens[0]?.v === 'else' && lines[at].tokens[0].t === 'kw') {
        const line = lines[at++], rest = new Tokens(line.tokens.slice(1), line.line);
        if (rest.is('if')) { const t = rest.next(); otherwise = [ifChain(rest, level, t)]; }
        else { if (!rest.done()) fail('Nieoczekiwany tekst po „else”', rest.peek()); otherwise = childBlock(level, line); }
      }
      return node('if', first, { cond, then, otherwise });
    }
    function switchBlock(ts, level, first) {
      const subject = ts.done() ? null : parseExpression(ts);
      const cases = [];
      if (at >= lines.length || lines[at].indent <= level) fail('Brak przypadków „switch”', first);
      while (at < lines.length && lines[at].indent === level + 1) {
        const line = lines[at++], cts = new Tokens(line.tokens, line.line);
        const match = cts.is('=>') ? null : parseExpression(cts);
        cts.expect('=>');
        const body = cts.done() ? childBlock(level + 1, line) : [node('expr', line, { e: parseExpression(cts) })];
        cases.push({ match, body });
      }
      return node('switch', first, { subject, cases });
    }
    // The value after "=" / ":=": an ordinary expression, or an if/switch whose blocks follow.
    function valueOf(ts, level) {
      if (ts.is('if')) { const t = ts.next(); return ifChain(ts, level, t); }
      if (ts.is('switch')) { const t = ts.next(); return switchBlock(ts, level, t); }
      const e = parseExpression(ts);
      if (!ts.done()) fail(`Nieoczekiwane „${ts.peek().v}”`, ts.peek());
      return e;
    }
    function statement(level) {
      const line = lines[at++], toks = line.tokens, ts = new Tokens(toks, line.line), first = toks[0];
      if (first.t === 'id' && toks[1]?.t === 'id') {
        if (first.v === 'import') fail('Biblioteki (import) nie są obsługiwane', first);
        if (first.v === 'type' || first.v === 'method' || first.v === 'export') fail(`„${first.v}” (typy, metody, eksport) nie jest obsługiwane`, first);
      }
      if (first.t === 'kw') {
        if (first.v === 'if') { ts.next(); return ifChain(ts, level, first); }
        if (first.v === 'switch') { ts.next(); return switchBlock(ts, level, first); }
        if (first.v === 'break' || first.v === 'continue') return node(first.v, first, {});
        if (first.v === 'while') { ts.next(); const cond = parseExpression(ts); return node('while', first, { cond, body: childBlock(level, first) }); }
        if (first.v === 'for') {
          ts.next();
          const v = ts.next();
          if (v.t !== 'id') fail('Oczekiwano nazwy zmiennej pętli', v);
          if (ts.is('in')) fail('Pętle „for … in” (tablice) nie są obsługiwane', v);
          ts.expect('=');
          const from = parseAdd(ts); ts.expect('to'); const to = parseAdd(ts);
          const step = ts.eat('by') ? parseAdd(ts) : null;
          return node('for', first, { name: v.v, from, to, step, body: childBlock(level, first) });
        }
      }
      // f(a, b = 2) => …
      if (first.t === 'id' && ts.is('(', 1)) {
        let depth = 0, close = -1;
        for (let i = 1; i < toks.length; i++) { const v = toks[i].t === 'op' ? toks[i].v : ''; if (v === '(') depth++; if (v === ')' && --depth === 0) { close = i; break; } }
        if (close > 0 && toks[close + 1]?.v === '=>' && toks[close + 1].t === 'op') {
          const params = [], inner = toks.slice(2, close);
          let part = [];
          const flush = () => {
            if (!part.length) return;
            const eq = part.findIndex(t => t.t === 'op' && t.v === '='), head = eq < 0 ? part : part.slice(0, eq);
            const nameTok = head.at(-1);
            if (nameTok?.t !== 'id') fail('Oczekiwano nazwy parametru', nameTok || first);
            params.push({ name: nameTok.v, def: eq < 0 ? null : parseExpression(new Tokens(part.slice(eq + 1), line.line)) });
            part = [];
          };
          let d = 0;
          for (const t of inner) { if (t.t === 'op' && (t.v === '(' || t.v === '[')) d++; if (t.t === 'op' && (t.v === ')' || t.v === ']')) d--; if (d === 0 && t.t === 'op' && t.v === ',') flush(); else part.push(t); }
          flush();
          const rest = new Tokens(toks.slice(close + 2), line.line);
          const body = rest.done() ? childBlock(level, first) : [node('expr', first, { e: valueOf(rest, level) })];
          return node('func', first, { name: first.v, params, body });
        }
      }
      // [a, b] = f()
      if (first.t === 'op' && first.v === '[') {
        const close = toks.findIndex(t => t.t === 'op' && t.v === ']');
        const next = toks[close + 1];
        if (close > 0 && next && (next.v === '=' || next.v === ':=')) {
          const names = toks.slice(1, close).filter(t => !(t.t === 'op' && t.v === ',')).map(t => { if (t.t !== 'id') fail('Oczekiwano nazwy zmiennej', t); return t.v; });
          ts.i = close + 2;
          return node('tuple-assign', first, { names, declare: next.v === '=', e: valueOf(ts, level) });
        }
      }
      // [var|varip] [type …] name = value
      let i = 0, mode = null;
      if (toks[0].t === 'kw' && (toks[0].v === 'var' || toks[0].v === 'varip')) { mode = toks[0].v; i = 1; }
      while (toks[i] && toks[i].t === 'id' && TYPES.has(toks[i].v) && toks[i + 1]?.t === 'id') i++;
      if (toks[i]?.t === 'id' && toks[i + 1]?.t === 'op' && toks[i + 1].v === '=') {
        const name = toks[i].v;
        ts.i = i + 2;
        return node('decl', toks[i], { name, mode, e: valueOf(ts, level) });
      }
      if (mode) fail('Oczekiwano deklaracji zmiennej po „var”', first);
      // name := value, name += value …
      if (first.t === 'id' && toks[1]?.t === 'op' && [':=', '+=', '-=', '*=', '/=', '%='].includes(toks[1].v)) {
        ts.i = 2;
        return node('assign', first, { name: first.v, op: toks[1].v, e: valueOf(ts, level) });
      }
      const e = parseExpression(ts);
      if (!ts.done()) fail(`Nieoczekiwane „${ts.peek().v}”`, ts.peek());
      return node('expr', first, { e });
    }
    const body = block(0);
    return { body, nodes: nodeIds };
  }

  // ==== values ======================================================================================================
  // Name tables are plain objects: only their own keys count (never constructor, __proto__ …).
  const own = (table, name) => Object.prototype.hasOwnProperty.call(table, name);
  const isNa = v => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
  const num = v => typeof v === 'boolean' ? (v ? 1 : 0) : (typeof v === 'number' ? v : NaN);
  const truthy = v => typeof v === 'boolean' ? v : typeof v === 'number' ? (!Number.isNaN(v) && v !== 0) : !!v;
  const clean = v => (typeof v === 'number' && !Number.isFinite(v)) ? NaN : v;

  function hexColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    const a = hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
    return rgba(r, g, b, a);
  }
  const rgba = (r, g, b, a) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+a.toFixed(3)})`;
  function parseColor(c) {
    if (typeof c !== 'string') return null;
    if (c[0] === '#') return parseColor(hexColor(c));
    const m = c.match(/^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  }
  const PALETTE = { aqua: '#00BCD4', black: '#363A45', blue: '#2962FF', fuchsia: '#E040FB', gray: '#787B86', green: '#4CAF50', lime: '#00E676',
    maroon: '#880E4F', navy: '#311B92', olive: '#808000', orange: '#FF9800', purple: '#9C27B0', red: '#FF5252', silver: '#B2B5BE',
    teal: '#00897B', white: '#FFFFFF', yellow: '#FFEB3B' };

  // ==== built-in constants and series ==============================================================================
  const CONSTANTS = {
    'math.pi': Math.PI, 'math.e': Math.E, 'math.phi': 1.618033988749895, 'math.rphi': 0.618033988749895,
    'dayofweek.sunday': 1, 'dayofweek.monday': 2, 'dayofweek.tuesday': 3, 'dayofweek.wednesday': 4, 'dayofweek.thursday': 5, 'dayofweek.friday': 6, 'dayofweek.saturday': 7,
  };
  for (const [k, v] of Object.entries(PALETTE)) CONSTANTS['color.' + k] = hexColor(v);
  for (const s of ['line', 'linebr', 'stepline', 'stepline_diamond', 'histogram', 'cross', 'area', 'areabr', 'columns', 'circles', 'steplinebr']) CONSTANTS['plot.style_' + s] = s;
  for (const s of ['xcross', 'cross', 'triangleup', 'triangledown', 'flag', 'circle', 'arrowup', 'arrowdown', 'labelup', 'labeldown', 'square', 'diamond']) CONSTANTS['shape.' + s] = s;
  for (const s of ['abovebar', 'belowbar', 'top', 'bottom', 'absolute']) CONSTANTS['location.' + s] = s;
  for (const s of ['auto', 'tiny', 'small', 'normal', 'large', 'huge']) CONSTANTS['size.' + s] = s;
  for (const s of ['solid', 'dotted', 'dashed']) CONSTANTS['hline.style_' + s] = s;
  for (const s of ['all', 'none', 'data_window', 'pane', 'price_scale', 'status_line']) CONSTANTS['display.' + s] = s;
  for (const s of ['price', 'volume', 'percent', 'inherit', 'mintick']) CONSTANTS['format.' + s] = s;
  for (const s of ['none', 'left', 'right', 'both']) CONSTANTS['extend.' + s] = s;
  for (const s of ['left', 'center', 'right', 'top', 'bottom']) { CONSTANTS['text.align_' + s] = s; CONSTANTS['position.' + s] = s; }
  for (const s of ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4', 'volume']) CONSTANTS['__source.' + s] = s;

  const SERIES = {
    open: (c, i) => c[i].open, high: (c, i) => c[i].high, low: (c, i) => c[i].low, close: (c, i) => c[i].close,
    volume: (c, i) => num(c[i].volume), time: (c, i) => c[i].time * 1000, time_close: (c, i, x) => (c[i].time + x.span) * 1000,
    hl2: (c, i) => (c[i].high + c[i].low) / 2, hlc3: (c, i) => (c[i].high + c[i].low + c[i].close) / 3,
    ohlc4: (c, i) => (c[i].open + c[i].high + c[i].low + c[i].close) / 4, hlcc4: (c, i) => (c[i].high + c[i].low + 2 * c[i].close) / 4,
    bar_index: (c, i) => i, last_bar_index: c => c.length - 1, timenow: () => Date.now(),
    'barstate.isfirst': (c, i) => i === 0, 'barstate.islast': (c, i) => i === c.length - 1, 'barstate.isconfirmed': (c, i) => i < c.length - 1,
    'barstate.isrealtime': (c, i) => i === c.length - 1, 'barstate.ishistory': (c, i) => i < c.length - 1, 'barstate.isnew': () => true,
    'barstate.islastconfirmedhistory': (c, i) => i === c.length - 2,
    year: (c, i) => new Date(c[i].time * 1000).getUTCFullYear(), month: (c, i) => new Date(c[i].time * 1000).getUTCMonth() + 1,
    dayofmonth: (c, i) => new Date(c[i].time * 1000).getUTCDate(), dayofweek: (c, i) => new Date(c[i].time * 1000).getUTCDay() + 1,
    hour: (c, i) => new Date(c[i].time * 1000).getUTCHours(), minute: (c, i) => new Date(c[i].time * 1000).getUTCMinutes(),
    second: (c, i) => new Date(c[i].time * 1000).getUTCSeconds(), weekofyear: (c, i) => isoWeek(c[i].time * 1000),
    'syminfo.ticker': (c, i, x) => x.ticker, 'syminfo.tickerid': (c, i, x) => x.ticker, 'syminfo.mintick': (c, i, x) => x.mintick,
    'syminfo.timezone': () => 'UTC', 'syminfo.currency': () => 'USD', 'syminfo.type': () => 'crypto',
    'timeframe.period': (c, i, x) => x.period, 'timeframe.multiplier': (c, i, x) => x.multiplier,
    'timeframe.isintraday': (c, i, x) => x.span < 86400, 'timeframe.isdaily': (c, i, x) => x.span === 86400,
    'timeframe.isweekly': (c, i, x) => x.span === 604800, 'timeframe.ismonthly': (c, i, x) => x.span >= 2419200,
    'timeframe.isminutes': (c, i, x) => x.span < 86400, 'timeframe.isseconds': () => false,
  };
  function isoWeek(ms) { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7); }

  // ==== stateful helpers (one state object per call site) ===========================================================
  function windowOf(s, len) { s.w ||= []; return s.w; }
  function pushWindow(s, v, len) { const w = windowOf(s); w.push(v); if (w.length > len) w.shift(); return w; }
  function sma(s, v, len) {
    const w = pushWindow(s, v, len);
    if (w.length < len || w.some(isNa)) return NaN;
    let t = 0; for (const x of w) t += x; return t / len;
  }
  // ema/rma are seeded with the simple average of the first `len` values, like TradingView's built-ins.
  function smoothed(s, v, len, alpha) {
    if (isNa(v)) return s.prev ?? NaN;
    if (s.prev === undefined || Number.isNaN(s.prev)) {
      s.seed ||= []; s.seed.push(v);
      if (s.seed.length < len) return NaN;
      s.prev = s.seed.reduce((a, b) => a + b, 0) / len; s.seed = null; return s.prev;
    }
    return s.prev = alpha * v + (1 - alpha) * s.prev;
  }
  const ema = (s, v, len) => smoothed(s, v, len, 2 / (len + 1));
  const rma = (s, v, len) => smoothed(s, v, len, 1 / len);
  function wma(s, v, len) {
    const w = pushWindow(s, v, len);
    if (w.length < len || w.some(isNa)) return NaN;
    let t = 0, n = 0; w.forEach((x, i) => { t += x * (i + 1); n += i + 1; }); return t / n;
  }
  function stdev(s, v, len, biased = true) {
    const w = pushWindow(s, v, len);
    if (w.length < len || w.some(isNa)) return NaN;
    const mean = w.reduce((a, b) => a + b, 0) / len, sq = w.reduce((a, b) => a + (b - mean) ** 2, 0);
    return Math.sqrt(sq / (biased ? len : len - 1));
  }
  const sub = (s, key) => (s[key] ||= {});
  const prevOf = (s, key, v) => { const p = s[key]; s[key] = v; return p === undefined ? NaN : p; };

  // ==== interpreter =================================================================================================
  const MAX_LOOP = 10000, MAX_STEPS = 40e6;
  class Break {} class Continue {}
  const BREAK = new Break(), CONTINUE = new Continue();

  function run(program, candles, options = {}) {
    if (!program?.body) throw new PineError('Brak programu');
    const bars = candles.filter(c => c && [c.time, c.open, c.high, c.low, c.close].every(Number.isFinite));
    const span = options.span || (bars.length > 1 ? bars[bars.length - 1].time - bars[bars.length - 2].time : 60);
    const extra = { ticker: options.ticker || '', mintick: options.mintick || 0.01, period: options.period || '', multiplier: options.multiplier || 1, span };
    const out = { meta: { title: 'Skrypt', shorttitle: '', overlay: false, precision: null }, plots: [], hlines: [], fills: [], shapes: [], bgcolors: [], inputs: [], warnings: [] };
    const overrides = options.inputs || {};
    const functions = new Map(), persistent = new Map(), states = new Map(), nodeHist = new Map(), outputs = new Map(), warned = new Set();
    const varip = [];
    let bar = 0, path = '', steps = 0, depth = 0;
    const warn = (key, text) => { if (!warned.has(key)) { warned.add(key); out.warnings.push(text); } };
    const key = n => path + '#' + n.id;
    const state = n => { const k = key(n); let s = states.get(k); if (!s) states.set(k, s = {}); return s; };
    const series = name => own(SERIES, name) ? SERIES[name](bars, bar, extra) : NaN;

    for (const st of program.body) if (st.k === 'func') functions.set(st.name, st);

    class Scope { constructor(parent) { this.parent = parent; this.vars = new Map(); }
      find(name) { for (let s = this; s; s = s.parent) { const v = s.vars.get(name); if (v) return v; } return null; } }

    function variable(n, name) {
      const k = path + '#' + n.id + ':' + name;
      let v = persistent.get(k);
      if (!v) persistent.set(k, v = { hist: [], val: NaN, init: false, mode: null });
      return v;
    }
    function declare(scope, n, name, value, mode) {
      const v = variable(n, name);
      if (mode) {
        if (!v.init) { v.init = true; v.mode = mode; v.val = value(); varip.push(v); }
      } else v.val = value();
      v.hist[bar] = v.val;
      scope.vars.set(name, v);
      return v.val;
    }
    function execBlock(body, scope) {
      let value = NaN;
      for (const st of body) value = exec(st, scope);
      return value;
    }
    function exec(st, scope) {
      switch (st.k) {
        case 'expr': return evaluate(st.e, scope);
        case 'decl': return declare(scope, st, st.name, () => evaluate(st.e, scope), st.mode);
        case 'assign': {
          const v = scope.find(st.name);
          if (!v) fail(`Zmienna „${st.name}” nie została zadeklarowana`, st);
          const value = evaluate(st.e, scope);
          v.val = st.op === ':=' ? value : arithmetic(st.op[0], v.val, value, st);
          v.hist[bar] = v.val;
          return v.val;
        }
        case 'tuple-assign': {
          const value = evaluate(st.e, scope);
          if (!Array.isArray(value)) fail('Po lewej stronie jest krotka, a wynik nie jest krotką', st);
          st.names.forEach((name, i) => {
            if (name === '_') return;
            if (st.declare) declare(scope, st, name, () => value[i], null);
            else { const v = scope.find(name); if (!v) fail(`Zmienna „${name}” nie została zadeklarowana`, st); v.val = value[i]; v.hist[bar] = v.val; }
          });
          return value;
        }
        case 'if': return evaluate(st, scope);
        case 'switch': return evaluate(st, scope);
        case 'func': return NaN;
        case 'break': throw BREAK;
        case 'continue': throw CONTINUE;
        case 'for': {
          const from = num(evaluate(st.from, scope)), to = num(evaluate(st.to, scope));
          if (isNa(from) || isNa(to)) return NaN;
          let step = st.step ? Math.abs(num(evaluate(st.step, scope))) : 1;
          if (!(step > 0)) fail('Krok pętli musi być większy od zera', st);
          if (to < from) step = -step;
          let value = NaN, n = 0;
          for (let i = from; step > 0 ? i <= to : i >= to; i += step) {
            if (++n > MAX_LOOP) fail(`Pętla przekroczyła ${MAX_LOOP} powtórzeń na świecę`, st);
            const inner = new Scope(scope);
            inner.vars.set(st.name, { hist: [], val: i });
            try { value = execBlock(st.body, inner); } catch (e) { if (e === BREAK) break; if (e === CONTINUE) continue; throw e; }
          }
          return value;
        }
        case 'while': {
          let value = NaN, n = 0;
          while (truthy(evaluate(st.cond, scope))) {
            if (++n > MAX_LOOP) fail(`Pętla przekroczyła ${MAX_LOOP} powtórzeń na świecę`, st);
            try { value = execBlock(st.body, new Scope(scope)); } catch (e) { if (e === BREAK) break; if (e === CONTINUE) continue; throw e; }
          }
          return value;
        }
      }
      fail('Nieobsługiwana instrukcja', st);
    }
    function arithmetic(op, a, b, n) {
      if (op === '+' && (typeof a === 'string' || typeof b === 'string')) return isNa(a) || isNa(b) ? '' : String(a) + String(b);
      const x = num(a), y = num(b);
      switch (op) {
        case '+': return clean(x + y); case '-': return clean(x - y); case '*': return clean(x * y);
        case '/': return clean(x / y); case '%': return clean(x % y);
      }
      fail('Nieznany operator ' + op, n);
    }
    function evaluate(n, scope) {
      if (++steps > MAX_STEPS) fail('Skrypt liczy się zbyt długo (limit operacji)', n);
      switch (n.k) {
        case 'lit': return n.v;
        case 'id': {
          const v = scope.find(n.name);
          if (v) return v.val;
          if (own(CONSTANTS, n.name)) return CONSTANTS[n.name];
          if (own(SERIES, n.name)) return series(n.name);
          if (own(SERIES_TA, n.name)) return seriesTa(n.name, n);
          if (functions.has(n.name) || own(BUILTINS, n.name)) fail(`„${n.name}” to funkcja — brakuje nawiasów`, n);
          unsupported(n.name, n);
          fail(`Nieznana zmienna „${n.name}”`, n);
        }
        case 'index': {
          const offset = Math.trunc(num(evaluate(n.offset, scope)));
          if (isNa(offset) || offset < 0) fail('Indeks historii musi być liczbą ≥ 0', n);
          const t = n.target;
          if (t.k === 'id') {
            const v = scope.find(t.name);
            if (v) return offset === 0 ? v.val : (bar - offset >= 0 ? v.hist[bar - offset] ?? NaN : NaN);
            if (own(SERIES, t.name)) { const i = bar - offset; return i >= 0 ? SERIES[t.name](bars, i, extra) : NaN; }
          }
          const k = key(n);
          let h = nodeHist.get(k);
          if (!h) nodeHist.set(k, h = []);
          h[bar] = evaluate(t, scope);
          return bar - offset >= 0 ? h[bar - offset] ?? NaN : NaN;
        }
        case 'un': {
          const a = evaluate(n.a, scope);
          if (n.op === 'not') return !truthy(a);
          return n.op === '-' ? clean(-num(a)) : num(a);
        }
        case 'bin': {
          if (n.op === 'and') return truthy(evaluate(n.a, scope)) && truthy(evaluate(n.b, scope));
          if (n.op === 'or') return truthy(evaluate(n.a, scope)) || truthy(evaluate(n.b, scope));
          const a = evaluate(n.a, scope), b = evaluate(n.b, scope);
          switch (n.op) {
            case '==': return isNa(a) || isNa(b) ? false : a === b || num(a) === num(b) && typeof a !== 'string';
            case '!=': return isNa(a) || isNa(b) ? false : !(a === b || num(a) === num(b) && typeof a !== 'string');
            case '<': return num(a) < num(b); case '>': return num(a) > num(b);
            case '<=': return num(a) <= num(b); case '>=': return num(a) >= num(b);
          }
          return arithmetic(n.op, a, b, n);
        }
        case 'tern': return truthy(evaluate(n.cond, scope)) ? evaluate(n.a, scope) : evaluate(n.b, scope);
        case 'tuple': return n.items.map(e => evaluate(e, scope));
        case 'if': {
          if (truthy(evaluate(n.cond, scope))) return execBlock(n.then, new Scope(scope));
          return n.otherwise ? execBlock(n.otherwise, new Scope(scope)) : NaN;
        }
        case 'switch': {
          const subject = n.subject ? evaluate(n.subject, scope) : undefined;
          for (const c of n.cases) {
            if (!c.match) return execBlock(c.body, new Scope(scope));
            const m = evaluate(c.match, scope);
            if (n.subject ? (!isNa(m) && (m === subject || num(m) === num(subject) && typeof m !== 'string')) : truthy(m)) return execBlock(c.body, new Scope(scope));
          }
          return NaN;
        }
        case 'call': return call(n, scope);
      }
      fail('Nieobsługiwane wyrażenie', n);
    }
    function unsupported(name, n) {
      const head = name.split('.')[0];
      if (head === 'strategy') fail('Strategie (strategy.*) nie są obsługiwane — tylko wskaźniki (indicator)', n);
      if (name === 'request.security' || head === 'request') fail('request.* (dane z innych rynków lub interwałów) nie jest obsługiwane', n);
      if (['array', 'matrix', 'map'].includes(head)) fail(`${head}.* nie jest jeszcze obsługiwane`, n);
      if (['label', 'line', 'box', 'table', 'polyline', 'linefill'].includes(head)) return 'drawing';
      return null;
    }
    function call(n, scope) {
      const user = functions.get(n.name);
      if (user) {
        if (++depth > 40) fail('Zbyt głębokie wywołania funkcji', n);
        const saved = path; path = path + '>' + n.id;
        const inner = new Scope(null);
        // User functions see the globals, not the caller's locals.
        inner.parent = globals;
        try {
          user.params.forEach((p, i) => {
            const argNode = n.args[i] ?? n.named[p.name] ?? p.def;
            if (!argNode) fail(`Brak argumentu „${p.name}” dla ${user.name}()`, n);
            const value = evaluateIn(argNode, argNode === p.def ? globals : scope, saved);
            declare(inner, user, 'arg:' + p.name, () => value, null);
            inner.vars.set(p.name, inner.vars.get('arg:' + p.name));
          });
          return execBlock(user.body, inner);
        } finally { path = saved; depth--; }
      }
      const b = own(BUILTINS, n.name) ? BUILTINS[n.name] : null;
      if (!b) {
        if (unsupported(n.name, n) === 'drawing') { warn(n.name.split('.')[0], `Rysunki ${n.name.split('.')[0]}.* są pomijane (nieobsługiwane).`); return null; }
        if (/^(alert|alertcondition|barcolor|max_bars_back|runtime\.error|log\.)/.test(n.name)) { if (n.name === 'barcolor') warn('barcolor', 'barcolor() jest pomijane.'); return NaN; }
        fail(`Nieznana funkcja „${n.name}()”`, n);
      }
      const params = b.p || [];
      const named = Object.keys(n.named);
      for (const k of named) if (!params.includes(k)) fail(`${n.name}() nie ma parametru „${k}”`, n);
      if (b.lazy) return b.f({ n, scope, evaluate, args: n.args, named: n.named, state: () => state(n), key: key(n) });
      const values = params.map((p, i) => {
        const e = n.args[i] ?? n.named[p];
        return e ? evaluate(e, scope) : undefined;
      });
      for (let i = params.length; i < n.args.length; i++) values.push(evaluate(n.args[i], scope));
      return b.f(values, { n, state: () => state(n), key: key(n), argNodes: params.map((p, i) => n.args[i] ?? n.named[p]) });
    }
    function evaluateIn(e, scope, savedPath) { const p = path; path = savedPath; try { return evaluate(e, scope); } finally { path = p; } }

    // ---- ta.* variables that behave like series -----------------------------------------------------------------
    const SERIES_TA = { 'ta.tr': 1, 'ta.obv': 1, 'ta.vwap': 1, 'ta.accdist': 1, 'ta.iii': 1, 'ta.nvi': 1, 'ta.pvi': 1, 'ta.wad': 1 };
    function seriesTa(name, n) {
      const s = state(n), c = bars[bar], p = bars[bar - 1];
      switch (name) {
        case 'ta.tr': return p ? Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)) : NaN;
        case 'ta.obv': return s.v = (s.v || 0) + (p ? Math.sign(c.close - p.close) * num(c.volume) : 0);
        case 'ta.vwap': return vwapStep(s, (c.high + c.low + c.close) / 3);
        case 'ta.accdist': return s.v = (s.v || 0) + (c.high === c.low ? 0 : ((c.close - c.low) - (c.high - c.close)) / (c.high - c.low) * num(c.volume));
        case 'ta.iii': return c.high === c.low ? NaN : (2 * c.close - c.high - c.low) / ((c.high - c.low) * num(c.volume));
        case 'ta.wad': return s.v = (s.v || 0) + (p ? (c.close > p.close ? c.close - Math.min(p.close, c.low) : c.close < p.close ? c.close - Math.max(p.close, c.high) : 0) : 0);
        case 'ta.nvi': return s.v = !p ? 1 : num(c.volume) < num(p.volume) ? (s.v ?? 1) * (1 + (c.close - p.close) / p.close) : (s.v ?? 1);
        case 'ta.pvi': return s.v = !p ? 1 : num(c.volume) > num(p.volume) ? (s.v ?? 1) * (1 + (c.close - p.close) / p.close) : (s.v ?? 1);
      }
      return NaN;
    }
    function vwapStep(s, src) {
      const day = Math.floor(bars[bar].time / 86400);
      if (s.day !== day) { s.day = day; s.pv = 0; s.vol = 0; }
      const v = num(bars[bar].volume);
      s.pv += src * v; s.vol += v;
      return s.vol ? s.pv / s.vol : NaN;
    }
    const high = () => bars[bar].high, low = () => bars[bar].low, close = () => bars[bar].close;
    const trueRange = () => { const c = bars[bar], p = bars[bar - 1]; return p ? Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)) : c.high - c.low; };
    const len = (v, name, n, min = 1) => { const l = Math.round(num(v)); if (!(l >= min)) fail(`${name}: długość musi być ≥ ${min}`, n); return l; };

    // ---- outputs ----------------------------------------------------------------------------------------------
    function outputSpec(ctx, make) {
      let spec = outputs.get(ctx.key);
      if (!spec) { spec = make(); outputs.set(ctx.key, spec); }
      return spec;
    }
    const colorArg = c => isNa(c) ? null : typeof c === 'string' ? (c[0] === '#' ? hexColor(c) : c) : null;
    function inputValue(ctx, kind, values, fallback) {
      const spec = outputSpec(ctx, () => {
        const s = { index: out.inputs.length, kind, title: values.title ?? `Ustawienie ${out.inputs.length + 1}`, defval: values.defval, min: values.minval, max: values.maxval,
          step: values.step, options: Array.isArray(values.options) ? values.options : null, group: values.group || null, tooltip: values.tooltip || null };
        out.inputs.push(s);
        return s;
      });
      const override = overrides[spec.index];
      if (override === undefined) return fallback ?? spec.defval;
      if (kind === 'int') return Math.round(num(override));
      if (kind === 'float') return num(override);
      if (kind === 'bool') return override === true || override === 'true';
      return override;
    }
    const inputParams = ['defval', 'title', 'minval', 'maxval', 'step', 'tooltip', 'inline', 'group', 'confirm', 'options', 'display'];
    const obj = (names, values) => Object.fromEntries(names.map((k, i) => [k, values[i]]));

    const BUILTINS = {
      indicator: { p: ['title', 'shorttitle', 'overlay', 'format', 'precision', 'scale', 'max_bars_back', 'timeframe', 'timeframe_gaps', 'explicit_plot_zorder', 'max_lines_count', 'max_labels_count', 'max_boxes_count', 'calc_bars_count', 'max_polylines_count', 'dynamic_requests', 'behind_chart'],
        f: v => { if (bar === 0) Object.assign(out.meta, { title: v[0] ?? 'Skrypt', shorttitle: v[1] ?? '', overlay: !!v[2], precision: isNa(v[4]) || v[4] === undefined ? null : v[4] }); return NaN; } },
      study: { p: ['title', 'shorttitle', 'overlay', 'format', 'precision'], f: v => BUILTINS.indicator.f(v) },
      strategy: { p: [], f: (v, c) => fail('Strategie (strategy) nie są obsługiwane — tylko wskaźniki (indicator)', c.n) },
      library: { p: [], f: (v, c) => fail('Biblioteki (library) nie są obsługiwane', c.n) },
      // inputs
      input: { p: ['defval', 'title', 'type', 'minval', 'maxval', 'step', 'options', 'tooltip', 'group', 'inline', 'confirm'], lazy: true, f: ({ n, scope, args, named, state, key }) => {
        const defNode = args[0] ?? named.defval;
        if (defNode?.k === 'id' && own(SERIES, defNode.name)) return BUILTINS['input.source'].f({ n, scope, args, named, state, key });
        const v = obj(['defval', 'title', 'type', 'minval', 'maxval', 'step', 'options', 'tooltip', 'group'], ['defval', 'title', 'type', 'minval', 'maxval', 'step', 'options', 'tooltip', 'group'].map((p, i) => { const e = args[i] ?? named[p]; return e ? evaluate(e, scope) : undefined; }));
        const kind = typeof v.defval === 'boolean' ? 'bool' : typeof v.defval === 'string' ? (v.defval.startsWith('rgba(') ? 'color' : 'string') : Number.isInteger(v.defval) ? 'int' : 'float';
        return inputValue({ key }, kind, v);
      } },
      'input.int': { p: inputParams, f: (v, c) => inputValue(c, 'int', obj(inputParams, v)) },
      'input.float': { p: inputParams, f: (v, c) => inputValue(c, 'float', obj(inputParams, v)) },
      'input.bool': { p: inputParams, f: (v, c) => inputValue(c, 'bool', obj(inputParams, v)) },
      'input.string': { p: inputParams, f: (v, c) => inputValue(c, 'string', obj(inputParams, v)) },
      'input.color': { p: inputParams, f: (v, c) => inputValue(c, 'color', obj(inputParams, v)) },
      'input.timeframe': { p: inputParams, f: (v, c) => inputValue(c, 'string', obj(inputParams, v)) },
      'input.session': { p: inputParams, f: (v, c) => inputValue(c, 'string', obj(inputParams, v)) },
      'input.symbol': { p: inputParams, f: (v, c) => inputValue(c, 'string', obj(inputParams, v)) },
      'input.price': { p: inputParams, f: (v, c) => inputValue(c, 'float', obj(inputParams, v)) },
      'input.time': { p: inputParams, f: (v, c) => inputValue(c, 'int', obj(inputParams, v)) },
      'input.text_area': { p: inputParams, f: (v, c) => inputValue(c, 'string', obj(inputParams, v)) },
      'input.enum': { p: inputParams, f: (v, c) => inputValue(c, 'string', obj(inputParams, v)) },
      // input.source: the chosen price series (by name), evaluated on every bar.
      'input.source': { p: ['defval', 'title', 'tooltip', 'inline', 'group', 'confirm', 'display'], lazy: true, f: ({ scope, args, named, key }) => {
        const defNode = args[0] ?? named.defval, titleNode = args[1] ?? named.title;
        const defName = defNode?.k === 'id' && own(SERIES, defNode.name) ? defNode.name : 'close';
        const chosen = inputValue({ key }, 'source', { defval: defName, title: titleNode ? evaluate(titleNode, scope) : undefined,
          options: ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4', 'volume'] });
        return series(own(SERIES, chosen) ? chosen : defName);
      } },
      // plots
      plot: { p: ['series', 'title', 'color', 'linewidth', 'style', 'trackprice', 'histbase', 'offset', 'join', 'editable', 'show_last', 'display', 'format', 'precision', 'force_overlay', 'linestyle'],
        f: (v, c) => {
          const spec = outputSpec(c, () => { const s = { kind: 'plot', index: out.plots.length, title: v[1] ?? `Plot ${out.plots.length + 1}`, style: v[4] || 'line', linewidth: num(v[3]) || 1,
            offset: Math.round(num(v[7])) || 0, histbase: isNa(v[6]) || v[6] === undefined ? 0 : num(v[6]), display: v[11] || 'all', values: [], colors: [] }; out.plots.push(s); return s; });
          spec.values[bar] = num(v[0]); spec.colors[bar] = colorArg(v[2]);
          return { ref: spec };
        } },
      hline: { p: ['price', 'title', 'color', 'linestyle', 'linewidth', 'editable', 'display'],
        f: (v, c) => {
          const spec = outputSpec(c, () => { const s = { kind: 'hline', price: num(v[0]), title: v[1] ?? '', color: colorArg(v[2]) || hexColor('#787B86'), style: v[3] || 'dashed', linewidth: num(v[4]) || 1 }; out.hlines.push(s); return s; });
          if (bar === bars.length - 1) spec.price = num(v[0]);
          return { ref: spec };
        } },
      fill: { p: ['hline1', 'hline2', 'color', 'title', 'editable', 'fillgaps', 'display', 'top_value', 'bottom_value', 'top_color', 'bottom_color'],
        f: (v, c) => {
          if (!v[0]?.ref || !v[1]?.ref) fail('fill() wymaga dwóch wyników plot() albo hline()', c.n);
          const spec = outputSpec(c, () => { const s = { kind: 'fill', a: v[0].ref, b: v[1].ref, colors: [] }; out.fills.push(s); return s; });
          spec.colors[bar] = colorArg(v[2]) || colorArg(v[9]);
          return NaN;
        } },
      bgcolor: { p: ['color', 'offset', 'editable', 'show_last', 'title', 'display', 'force_overlay'],
        f: v => { const c = colorArg(v[0]); if (c) out.bgcolors[bar + (Math.round(num(v[1])) || 0)] = c; return NaN; } },
      plotshape: { p: ['series', 'title', 'style', 'location', 'color', 'offset', 'text', 'textcolor', 'editable', 'size', 'show_last', 'display', 'format', 'precision', 'force_overlay'],
        f: (v, c) => shape(c, v[0], { title: v[1], style: v[2] || 'xcross', location: v[3] || 'abovebar', color: v[4], offset: v[5], text: v[6], size: v[9] }) },
      plotchar: { p: ['series', 'title', 'char', 'location', 'color', 'offset', 'text', 'textcolor', 'editable', 'size', 'show_last', 'display', 'format', 'precision', 'force_overlay'],
        f: (v, c) => shape(c, v[0], { title: v[1], style: 'char', char: v[2] || '★', location: v[3] || 'abovebar', color: v[4], offset: v[5], text: v[6], size: v[9] }) },
      plotarrow: { p: ['series', 'title', 'colorup', 'colordown', 'offset', 'minheight', 'maxheight', 'editable', 'show_last', 'display'],
        f: (v, c) => { const x = num(v[0]); if (!isNa(x) && x !== 0) out.shapes.push({ bar, style: x > 0 ? 'arrowup' : 'arrowdown', location: x > 0 ? 'belowbar' : 'abovebar', color: colorArg(x > 0 ? v[2] : v[3]) || (x > 0 ? hexColor('#4CAF50') : hexColor('#FF5252')), text: '' }); return NaN; } },
      // helpers
      na: { p: ['x'], f: v => isNa(v[0]) },
      nz: { p: ['source', 'replacement'], f: v => isNa(v[0]) ? (v[1] === undefined ? 0 : v[1]) : v[0] },
      fixnan: { p: ['source'], f: (v, c) => { const s = c.state(); if (!isNa(v[0])) s.v = v[0]; return s.v ?? NaN; } },
      int: { p: ['x'], f: v => isNa(v[0]) ? NaN : Math.trunc(num(v[0])) },
      float: { p: ['x'], f: v => num(v[0]) },
      bool: { p: ['x'], f: v => truthy(v[0]) },
      string: { p: ['x'], f: v => isNa(v[0]) ? '' : String(v[0]) },
      color: { p: ['x'], f: v => v[0] },
      timestamp: { p: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], f: v => {
        const nums = v.filter(x => typeof x === 'number');
        if (typeof v[0] === 'string' && typeof v[1] !== 'number') { const t = Date.parse(v[0]); return Number.isNaN(t) ? NaN : t; }
        const [y, m, d, h = 0, mi = 0, s = 0] = typeof v[0] === 'string' ? nums : nums;
        return Date.UTC(y, m - 1, d, h, mi, s);
      } },
      time: { p: ['timeframe', 'session', 'timezone'], f: () => bars[bar].time * 1000 },
      'str.tostring': { p: ['value', 'format'], f: v => formatValue(v[0], v[1]) },
      'str.format': { p: ['formatString'], f: v => String(v[0]).replace(/\{(\d+)(,[^}]*)?\}/g, (m, i) => formatValue(v[1 + Number(i)])) },
      'str.length': { p: ['string'], f: v => String(v[0] ?? '').length },
      'str.contains': { p: ['source', 'str'], f: v => String(v[0]).includes(String(v[1])) },
      'str.upper': { p: ['source'], f: v => String(v[0]).toUpperCase() },
      'str.lower': { p: ['source'], f: v => String(v[0]).toLowerCase() },
      'str.tonumber': { p: ['string'], f: v => { const x = Number(v[0]); return Number.isFinite(x) ? x : NaN; } },
      'str.replace_all': { p: ['source', 'target', 'replacement'], f: v => String(v[0]).split(String(v[1])).join(String(v[2])) },
      // colours
      'color.new': { p: ['color', 'transp'], f: v => { const c = parseColor(v[0]); if (!c) return null; return rgba(c[0], c[1], c[2], (100 - Math.min(100, Math.max(0, num(v[1]) || 0))) / 100); } },
      'color.rgb': { p: ['red', 'green', 'blue', 'transp'], f: v => rgba(num(v[0]), num(v[1]), num(v[2]), (100 - (num(v[3]) || 0)) / 100) },
      'color.r': { p: ['color'], f: v => parseColor(v[0])?.[0] ?? NaN },
      'color.g': { p: ['color'], f: v => parseColor(v[0])?.[1] ?? NaN },
      'color.b': { p: ['color'], f: v => parseColor(v[0])?.[2] ?? NaN },
      'color.t': { p: ['color'], f: v => { const c = parseColor(v[0]); return c ? Math.round((1 - c[3]) * 100) : NaN; } },
      'color.from_gradient': { p: ['value', 'bottom_value', 'top_value', 'bottom_color', 'top_color'], f: v => {
        const a = parseColor(v[3]), b = parseColor(v[4]); if (!a || !b || isNa(v[0])) return null;
        const t = Math.min(1, Math.max(0, (num(v[0]) - num(v[1])) / ((num(v[2]) - num(v[1])) || 1)));
        return rgba(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t);
      } },
      // math
      'math.abs': { p: ['number'], f: v => Math.abs(num(v[0])) },
      'math.max': { p: [], f: v => v.some(isNa) ? NaN : Math.max(...v.map(num)) },
      'math.min': { p: [], f: v => v.some(isNa) ? NaN : Math.min(...v.map(num)) },
      'math.avg': { p: [], f: v => v.some(isNa) ? NaN : v.reduce((a, b) => a + num(b), 0) / v.length },
      'math.round': { p: ['number', 'precision'], f: v => { const p = num(v[1]) || 0; const k = 10 ** p; return Math.round(num(v[0]) * k) / k; } },
      'math.round_to_mintick': { p: ['number'], f: v => Math.round(num(v[0]) / extra.mintick) * extra.mintick },
      'math.floor': { p: ['number'], f: v => Math.floor(num(v[0])) },
      'math.ceil': { p: ['number'], f: v => Math.ceil(num(v[0])) },
      'math.sqrt': { p: ['number'], f: v => clean(Math.sqrt(num(v[0]))) },
      'math.pow': { p: ['base', 'exponent'], f: v => clean(num(v[0]) ** num(v[1])) },
      'math.log': { p: ['number'], f: v => clean(Math.log(num(v[0]))) },
      'math.log10': { p: ['number'], f: v => clean(Math.log10(num(v[0]))) },
      'math.exp': { p: ['number'], f: v => clean(Math.exp(num(v[0]))) },
      'math.sign': { p: ['number'], f: v => Math.sign(num(v[0])) },
      'math.sin': { p: ['angle'], f: v => Math.sin(num(v[0])) }, 'math.cos': { p: ['angle'], f: v => Math.cos(num(v[0])) },
      'math.tan': { p: ['angle'], f: v => Math.tan(num(v[0])) }, 'math.atan': { p: ['angle'], f: v => Math.atan(num(v[0])) },
      'math.asin': { p: ['angle'], f: v => clean(Math.asin(num(v[0]))) }, 'math.acos': { p: ['angle'], f: v => clean(Math.acos(num(v[0]))) },
      'math.todegrees': { p: ['radians'], f: v => num(v[0]) * 180 / Math.PI }, 'math.toradians': { p: ['degrees'], f: v => num(v[0]) * Math.PI / 180 },
      'math.random': { p: ['min', 'max', 'seed'], f: v => { const lo = isNa(v[0]) || v[0] === undefined ? 0 : num(v[0]), hi = isNa(v[1]) || v[1] === undefined ? 1 : num(v[1]); return lo + Math.random() * (hi - lo); } },
      'math.sum': { p: ['source', 'length'], f: (v, c) => { const l = len(v[1], 'math.sum', c.n); const w = pushWindow(c.state(), num(v[0]), l); return w.length < l || w.some(isNa) ? NaN : w.reduce((a, b) => a + b, 0); } },
      // technical analysis
      'ta.sma': { p: ['source', 'length'], f: (v, c) => sma(c.state(), num(v[0]), len(v[1], 'ta.sma', c.n)) },
      'ta.ema': { p: ['source', 'length'], f: (v, c) => ema(c.state(), num(v[0]), len(v[1], 'ta.ema', c.n)) },
      'ta.rma': { p: ['source', 'length'], f: (v, c) => rma(c.state(), num(v[0]), len(v[1], 'ta.rma', c.n)) },
      'ta.wma': { p: ['source', 'length'], f: (v, c) => wma(c.state(), num(v[0]), len(v[1], 'ta.wma', c.n)) },
      'ta.vwma': { p: ['source', 'length'], f: (v, c) => { const s = c.state(), l = len(v[1], 'ta.vwma', c.n), vol = num(bars[bar].volume); return clean(sma(sub(s, 'a'), num(v[0]) * vol, l) / sma(sub(s, 'b'), vol, l)); } },
      'ta.swma': { p: ['source'], f: (v, c) => { const w = pushWindow(c.state(), num(v[0]), 4); return w.length < 4 || w.some(isNa) ? NaN : (w[0] + 2 * w[1] + 2 * w[2] + w[3]) / 6; } },
      'ta.hma': { p: ['source', 'length'], f: (v, c) => { const s = c.state(), l = len(v[1], 'ta.hma', c.n), x = num(v[0]);
        const raw = 2 * wma(sub(s, 'half'), x, Math.max(1, Math.floor(l / 2))) - wma(sub(s, 'full'), x, l);
        return wma(sub(s, 'out'), raw, Math.max(1, Math.floor(Math.sqrt(l)))); } },
      'ta.alma': { p: ['series', 'length', 'offset', 'sigma', 'floor'], f: (v, c) => { const l = len(v[1], 'ta.alma', c.n), w = pushWindow(c.state(), num(v[0]), l);
        if (w.length < l || w.some(isNa)) return NaN;
        const off = num(v[2]), sig = num(v[3]), m = (v[4] ? Math.floor(off * (l - 1)) : off * (l - 1)), s = l / sig;
        let t = 0, n = 0; for (let i = 0; i < l; i++) { const k = Math.exp(-((i - m) ** 2) / (2 * s * s)); t += w[i] * k; n += k; } return t / n; } },
      'ta.stdev': { p: ['source', 'length', 'biased'], f: (v, c) => stdev(c.state(), num(v[0]), len(v[1], 'ta.stdev', c.n), v[2] === undefined ? true : !!v[2]) },
      'ta.variance': { p: ['source', 'length', 'biased'], f: (v, c) => { const d = stdev(c.state(), num(v[0]), len(v[1], 'ta.variance', c.n), v[2] === undefined ? true : !!v[2]); return d * d; } },
      'ta.dev': { p: ['source', 'length'], f: (v, c) => { const l = len(v[1], 'ta.dev', c.n), w = pushWindow(c.state(), num(v[0]), l); if (w.length < l || w.some(isNa)) return NaN; const m = w.reduce((a, b) => a + b, 0) / l; return w.reduce((a, b) => a + Math.abs(b - m), 0) / l; } },
      'ta.median': { p: ['source', 'length'], f: (v, c) => { const l = len(v[1], 'ta.median', c.n), w = pushWindow(c.state(), num(v[0]), l); if (w.length < l || w.some(isNa)) return NaN; const s = [...w].sort((a, b) => a - b); return l % 2 ? s[(l - 1) / 2] : (s[l / 2 - 1] + s[l / 2]) / 2; } },
      'ta.highest': { p: ['source', 'length'], f: (v, c) => extreme(c, v, 'high', Math.max, 'ta.highest') },
      'ta.lowest': { p: ['source', 'length'], f: (v, c) => extreme(c, v, 'low', Math.min, 'ta.lowest') },
      'ta.highestbars': { p: ['source', 'length'], f: (v, c) => extremeBars(c, v, 'high', (a, b) => a >= b, 'ta.highestbars') },
      'ta.lowestbars': { p: ['source', 'length'], f: (v, c) => extremeBars(c, v, 'low', (a, b) => a <= b, 'ta.lowestbars') },
      'ta.change': { p: ['source', 'length'], f: (v, c) => { const l = v[1] === undefined ? 1 : len(v[1], 'ta.change', c.n); const w = pushWindow(c.state(), v[0], l + 1); if (w.length <= l) return typeof v[0] === 'boolean' ? false : NaN; return typeof v[0] === 'boolean' ? w[w.length - 1] !== w[0] : clean(num(w[w.length - 1]) - num(w[0])); } },
      'ta.mom': { p: ['source', 'length'], f: (v, c) => { const l = len(v[1], 'ta.mom', c.n), w = pushWindow(c.state(), num(v[0]), l + 1); return w.length <= l ? NaN : w[w.length - 1] - w[0]; } },
      'ta.roc': { p: ['source', 'length'], f: (v, c) => { const l = len(v[1], 'ta.roc', c.n), w = pushWindow(c.state(), num(v[0]), l + 1); return w.length <= l ? NaN : clean(100 * (w[w.length - 1] - w[0]) / w[0]); } },
      'ta.rsi': { p: ['source', 'length'], f: (v, c) => { const s = c.state(), l = len(v[1], 'ta.rsi', c.n), x = num(v[0]), p = prevOf(s, 'p', x);
        const up = rma(sub(s, 'u'), isNa(p) ? NaN : Math.max(x - p, 0), l), down = rma(sub(s, 'd'), isNa(p) ? NaN : Math.max(p - x, 0), l);
        return isNa(up) || isNa(down) ? NaN : down === 0 ? 100 : up === 0 ? 0 : 100 - 100 / (1 + up / down); } },
      'ta.tr': { p: ['handle_na'], f: v => { const p = bars[bar - 1], c = bars[bar]; return p ? Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)) : v[0] ? c.high - c.low : NaN; } },
      'ta.atr': { p: ['length'], f: (v, c) => rma(c.state(), trueRange(), len(v[0], 'ta.atr', c.n)) },
      'ta.cum': { p: ['source'], f: (v, c) => { const s = c.state(); s.v = (s.v || 0) + (isNa(v[0]) ? 0 : num(v[0])); return s.v; } },
      'ta.vwap': { p: ['source', 'anchor', 'stdev_mult'], f: (v, c) => vwapStep(c.state(), num(v[0])) },
      'ta.crossover': { p: ['source1', 'source2'], f: (v, c) => cross(c, v, (a, b, pa, pb) => a > b && pa <= pb) },
      'ta.crossunder': { p: ['source1', 'source2'], f: (v, c) => cross(c, v, (a, b, pa, pb) => a < b && pa >= pb) },
      'ta.cross': { p: ['source1', 'source2'], f: (v, c) => cross(c, v, (a, b, pa, pb) => (a > b && pa <= pb) || (a < b && pa >= pb)) },
      'ta.rising': { p: ['source', 'length'], f: (v, c) => { const l = len(v[1], 'ta.rising', c.n), w = pushWindow(c.state(), num(v[0]), l + 1); return w.length > l && w.slice(0, -1).every(x => w[w.length - 1] > x); } },
      'ta.falling': { p: ['source', 'length'], f: (v, c) => { const l = len(v[1], 'ta.falling', c.n), w = pushWindow(c.state(), num(v[0]), l + 1); return w.length > l && w.slice(0, -1).every(x => w[w.length - 1] < x); } },
      'ta.barssince': { p: ['condition'], f: (v, c) => { const s = c.state(); if (truthy(v[0])) s.at = bar; return s.at === undefined ? NaN : bar - s.at; } },
      'ta.valuewhen': { p: ['condition', 'source', 'occurrence'], f: (v, c) => { const s = c.state(); s.list ||= []; if (truthy(v[0])) { s.list.push(v[1]); if (s.list.length > 500) s.list.shift(); } const k = Math.round(num(v[2]) || 0); return s.list[s.list.length - 1 - k] ?? NaN; } },
      'ta.macd': { p: ['source', 'fastlen', 'slowlen', 'siglen'], f: (v, c) => { const s = c.state(), x = num(v[0]);
        const m = ema(sub(s, 'f'), x, len(v[1], 'ta.macd', c.n)) - ema(sub(s, 's'), x, len(v[2], 'ta.macd', c.n)), sig = ema(sub(s, 'g'), m, len(v[3], 'ta.macd', c.n));
        return [clean(m), sig, clean(m - sig)]; } },
      'ta.bb': { p: ['series', 'length', 'mult'], f: (v, c) => { const s = c.state(), x = num(v[0]), l = len(v[1], 'ta.bb', c.n), b = sma(sub(s, 'm'), x, l), d = num(v[2]) * stdev(sub(s, 'd'), x, l); return [b, b + d, b - d]; } },
      'ta.bbw': { p: ['series', 'length', 'mult'], f: (v, c) => { const s = c.state(), x = num(v[0]), l = len(v[1], 'ta.bbw', c.n), b = sma(sub(s, 'm'), x, l), d = num(v[2]) * stdev(sub(s, 'd'), x, l); return clean(2 * d / b); } },
      'ta.kc': { p: ['series', 'length', 'mult', 'useTrueRange'], f: (v, c) => { const s = c.state(), l = len(v[1], 'ta.kc', c.n), b = ema(sub(s, 'm'), num(v[0]), l), r = ema(sub(s, 'r'), v[3] === false ? high() - low() : trueRange(), l) * num(v[2]); return [b, b + r, b - r]; } },
      'ta.stoch': { p: ['source', 'high', 'low', 'length'], f: (v, c) => { const s = c.state(), l = len(v[3], 'ta.stoch', c.n);
        const hh = extreme({ state: () => sub(s, 'h'), n: c.n }, [num(v[1]), l], 'high', Math.max, 'ta.stoch'), ll = extreme({ state: () => sub(s, 'l'), n: c.n }, [num(v[2]), l], 'low', Math.min, 'ta.stoch');
        return clean(100 * (num(v[0]) - ll) / (hh - ll)); } },
      'ta.cci': { p: ['source', 'length'], f: (v, c) => { const s = c.state(), l = len(v[1], 'ta.cci', c.n), x = num(v[0]), m = sma(sub(s, 'm'), x, l);
        const w = pushWindow(sub(s, 'w'), x, l); if (isNa(m) || w.length < l) return NaN; const d = w.reduce((a, b) => a + Math.abs(b - m), 0) / l; return clean((x - m) / (0.015 * d)); } },
      'ta.mfi': { p: ['series', 'length'], f: (v, c) => { const s = c.state(), l = len(v[1], 'ta.mfi', c.n), x = num(v[0]), p = prevOf(s, 'p', x), vol = num(bars[bar].volume);
        const up = pushWindow(sub(s, 'u'), isNa(p) ? NaN : x > p ? x * vol : 0, l), dn = pushWindow(sub(s, 'd'), isNa(p) ? NaN : x < p ? x * vol : 0, l);
        if (up.length < l || up.some(isNa)) return NaN; const u = up.reduce((a, b) => a + b, 0), d = dn.reduce((a, b) => a + b, 0); return d === 0 ? 100 : clean(100 - 100 / (1 + u / d)); } },
      'ta.wpr': { p: ['length'], f: (v, c) => { const s = c.state(), l = len(v[0], 'ta.wpr', c.n);
        const hh = extreme({ state: () => sub(s, 'h'), n: c.n }, [high(), l], 'high', Math.max, 'ta.wpr'), ll = extreme({ state: () => sub(s, 'l'), n: c.n }, [low(), l], 'low', Math.min, 'ta.wpr');
        return clean(100 * (close() - hh) / (hh - ll)); } },
      'ta.cmo': { p: ['series', 'length'], f: (v, c) => { const s = c.state(), l = len(v[1], 'ta.cmo', c.n), x = num(v[0]), p = prevOf(s, 'p', x), d = isNa(p) ? NaN : x - p;
        const up = pushWindow(sub(s, 'u'), isNa(d) ? NaN : Math.max(d, 0), l), dn = pushWindow(sub(s, 'd'), isNa(d) ? NaN : Math.max(-d, 0), l);
        if (up.length < l || up.some(isNa)) return NaN; const u = up.reduce((a, b) => a + b, 0), q = dn.reduce((a, b) => a + b, 0); return clean(100 * (u - q) / (u + q)); } },
      'ta.tsi': { p: ['source', 'short_length', 'long_length'], f: (v, c) => { const s = c.state(), x = num(v[0]), p = prevOf(s, 'p', x), m = isNa(p) ? NaN : x - p;
        const a = ema(sub(s, 'a2'), ema(sub(s, 'a1'), m, len(v[2], 'ta.tsi', c.n)), len(v[1], 'ta.tsi', c.n)), b = ema(sub(s, 'b2'), ema(sub(s, 'b1'), Math.abs(m), len(v[2], 'ta.tsi', c.n)), len(v[1], 'ta.tsi', c.n));
        return clean(a / b); } },
      'ta.linreg': { p: ['source', 'length', 'offset'], f: (v, c) => { const l = len(v[1], 'ta.linreg', c.n), w = pushWindow(c.state(), num(v[0]), l); if (w.length < l || w.some(isNa)) return NaN;
        let sx = 0, sy = 0, sxy = 0, sxx = 0; w.forEach((y, i) => { sx += i; sy += y; sxy += i * y; sxx += i * i; });
        const slope = (l * sxy - sx * sy) / (l * sxx - sx * sx), icpt = (sy - slope * sx) / l; return icpt + slope * (l - 1 - (num(v[2]) || 0)); } },
      'ta.percentrank': { p: ['source', 'length'], f: (v, c) => { const l = len(v[1], 'ta.percentrank', c.n), w = pushWindow(c.state(), num(v[0]), l + 1); if (w.length <= l || w.some(isNa)) return NaN; const x = w[w.length - 1]; return 100 * w.slice(0, -1).filter(y => y <= x).length / l; } },
      'ta.correlation': { p: ['source1', 'source2', 'length'], f: (v, c) => { const s = c.state(), l = len(v[2], 'ta.correlation', c.n), a = pushWindow(sub(s, 'a'), num(v[0]), l), b = pushWindow(sub(s, 'b'), num(v[1]), l);
        if (a.length < l || a.some(isNa) || b.some(isNa)) return NaN; const ma = a.reduce((x, y) => x + y, 0) / l, mb = b.reduce((x, y) => x + y, 0) / l;
        let cov = 0, va = 0, vb = 0; for (let i = 0; i < l; i++) { cov += (a[i] - ma) * (b[i] - mb); va += (a[i] - ma) ** 2; vb += (b[i] - mb) ** 2; } return clean(cov / Math.sqrt(va * vb)); } },
      'ta.pivothigh': { p: ['source', 'leftbars', 'rightbars'], f: (v, c) => pivot(c, v, 'high', (x, y) => x > y) },
      'ta.pivotlow': { p: ['source', 'leftbars', 'rightbars'], f: (v, c) => pivot(c, v, 'low', (x, y) => x < y) },
      'ta.supertrend': { p: ['factor', 'atrPeriod'], f: (v, c) => { const s = c.state(), atr = rma(sub(s, 'atr'), trueRange(), len(v[1], 'ta.supertrend', c.n)), mid = (high() + low()) / 2, cl = close();
        let up = mid - num(v[0]) * atr, dn = mid + num(v[0]) * atr;
        const prevUp = s.up, prevDn = s.dn, prevClose = s.close, prevST = s.st;
        if (!isNa(prevUp) && prevUp !== undefined) up = prevClose > prevUp ? Math.max(up, prevUp) : up;
        if (!isNa(prevDn) && prevDn !== undefined) dn = prevClose < prevDn ? Math.min(dn, prevDn) : dn;
        let dir;
        if (isNa(atr)) dir = 1; else if (prevST === undefined || isNa(prevST)) dir = 1; else if (prevST === prevDn) dir = cl > dn ? -1 : 1; else dir = cl < up ? 1 : -1;
        const st = isNa(atr) ? NaN : dir === -1 ? up : dn;
        Object.assign(s, { up, dn, close: cl, st }); return [st, dir]; } },
      'ta.dmi': { p: ['diLength', 'adxSmoothing'], f: (v, c) => { const s = c.state(), l = len(v[0], 'ta.dmi', c.n), k = len(v[1], 'ta.dmi', c.n), cur = bars[bar], p = bars[bar - 1];
        const up = p ? cur.high - p.high : NaN, down = p ? p.low - cur.low : NaN;
        const plusDM = isNa(up) ? NaN : up > down && up > 0 ? up : 0, minusDM = isNa(down) ? NaN : down > up && down > 0 ? down : 0;
        const tr = rma(sub(s, 'tr'), trueRange(), l), plus = clean(100 * rma(sub(s, 'p'), plusDM, l) / tr), minus = clean(100 * rma(sub(s, 'm'), minusDM, l) / tr);
        const adx = rma(sub(s, 'a'), clean(100 * Math.abs(plus - minus) / (plus + minus)), k); return [plus, minus, adx]; } },
      'ta.sar': { p: ['start', 'inc', 'max'], f: (v, c) => { const s = c.state(), cur = bars[bar], p = bars[bar - 1];
        if (!p) return NaN;
        if (s.dir === undefined) { s.dir = cur.close > p.close ? 1 : -1; s.sar = s.dir > 0 ? Math.min(p.low, cur.low) : Math.max(p.high, cur.high); s.ep = s.dir > 0 ? cur.high : cur.low; s.af = num(v[0]); return s.sar; }
        let sar = s.sar + s.af * (s.ep - s.sar);
        if (s.dir > 0) { sar = Math.min(sar, p.low); if (cur.low < sar) { s.dir = -1; sar = s.ep; s.ep = cur.low; s.af = num(v[0]); } else if (cur.high > s.ep) { s.ep = cur.high; s.af = Math.min(num(v[2]), s.af + num(v[1])); } }
        else { sar = Math.max(sar, p.high); if (cur.high > sar) { s.dir = 1; sar = s.ep; s.ep = cur.high; s.af = num(v[0]); } else if (cur.low < s.ep) { s.ep = cur.low; s.af = Math.min(num(v[2]), s.af + num(v[1])); } }
        return s.sar = sar; } },
    };
    for (const name of ['math.max', 'math.min', 'math.avg']) BUILTINS[name].p = [];
    function formatValue(v, fmt) {
      if (isNa(v)) return 'NaN';
      if (typeof v !== 'number') return String(v);
      if (typeof fmt === 'string' && /#|0/.test(fmt)) { const d = (fmt.split('.')[1] || '').length; return v.toFixed(d); }
      if (fmt === 'percent') return v.toFixed(2) + '%';
      return String(+v.toFixed(8));
    }
    function extreme(c, v, field, pick, name) {
      // ta.highest(length) uses high; ta.highest(source, length) the given source.
      const oneArg = v[1] === undefined, l = len(oneArg ? v[0] : v[1], name, c.n), x = oneArg ? bars[bar][field] : num(v[0]);
      const w = pushWindow(c.state(), x, l);
      return w.length < l || w.some(isNa) ? NaN : pick(...w);
    }
    function extremeBars(c, v, field, better, name) {
      const oneArg = v[1] === undefined, l = len(oneArg ? v[0] : v[1], name, c.n), x = oneArg ? bars[bar][field] : num(v[0]);
      const w = pushWindow(c.state(), x, l);
      if (w.length < l || w.some(isNa)) return NaN;
      let best = w.length - 1; for (let i = w.length - 1; i >= 0; i--) if (better(w[i], w[best]) && w[i] !== w[best]) best = i;
      return -(w.length - 1 - best);
    }
    function cross(c, v, test) {
      const s = c.state(), a = num(v[0]), b = num(v[1]), pa = s.a, pb = s.b;
      s.a = a; s.b = b;
      return pa !== undefined && ![a, b, pa, pb].some(isNa) && test(a, b, pa, pb);
    }
    function pivot(c, v, field, beats) {
      const twoArgs = v[2] === undefined, left = Math.round(num(twoArgs ? v[0] : v[1])), right = Math.round(num(twoArgs ? v[1] : v[2]));
      const x = twoArgs ? bars[bar][field] : num(v[0]), w = pushWindow(c.state(), x, left + right + 1);
      if (w.length < left + right + 1 || w.some(isNa)) return NaN;
      const centre = w[left];
      for (let i = 0; i < w.length; i++) if (i !== left && !beats(centre, w[i]) && !(i > left && centre === w[i] && false)) return NaN;
      return centre;
    }
    function shape(c, value, o) {
      const on = typeof value === 'boolean' ? value : !isNa(value) && value !== 0 && value !== null;
      if (!on) return NaN;
      out.shapes.push({ bar: bar + (Math.round(num(o.offset)) || 0), title: o.title || '', style: o.style, char: o.char || '', location: o.location,
        price: typeof value === 'number' ? value : NaN, color: colorArg(o.color) || hexColor('#2962FF'), text: isNa(o.text) ? '' : String(o.text ?? ''), size: o.size || 'auto' });
      return NaN;
    }

    const globals = new Scope(null);
    for (bar = 0; bar < bars.length; bar++) {
      path = '';
      for (const st of program.body) {
        if (st.k === 'func') continue;
        try { exec(st, globals); } catch (e) { if (e === BREAK || e === CONTINUE) fail('„break”/„continue” poza pętlą', st); throw e; }
      }
      for (const v of varip) if (v.hist[bar] === undefined) v.hist[bar] = v.val;
      for (const v of globals.vars.values()) if (v.hist[bar] === undefined) v.hist[bar] = v.val;
    }
    // Offsets shift a plot left or right by whole bars.
    for (const p of out.plots) if (p.offset) { const shift = p.offset, vals = [], cols = []; p.values.forEach((x, i) => { vals[i + shift] = x; cols[i + shift] = p.colors[i]; }); p.values = vals; p.colors = cols; }
    out.times = bars.map(b => b.time);
    out.steps = steps;
    return out;
  }

  function compile(source) {
    if (typeof source !== 'string' || !source.trim()) throw new PineError('Skrypt jest pusty');
    if (source.length > 200000) throw new PineError('Skrypt jest za długi (limit 200 000 znaków)');
    const program = parseProgram(source);
    if (!program.body.some(st => st.k === 'expr' && st.e.k === 'call' && ['indicator', 'study'].includes(st.e.name))) {
      if (program.body.some(st => st.k === 'expr' && st.e.k === 'call' && st.e.name === 'strategy')) throw new PineError('Strategie (strategy) nie są obsługiwane — tylko wskaźniki (indicator)');
      throw new PineError('Brak deklaracji indicator("…")');
    }
    return program;
  }
  // The declared title and overlay without running the script (for the indicator list).
  function describe(source) {
    const args = String(source).match(/\b(?:indicator|study)\s*\(([^\n]*)/)?.[1] || '';
    const title = args.match(/\btitle\s*=\s*(["'])(.*?)\1/)?.[2] ?? args.match(/^\s*(["'])(.*?)\1/)?.[2];
    return { title: title || 'Skrypt Pine', overlay: /\boverlay\s*=\s*true/.test(args) };
  }

  const api = { compile, run, describe, PineError, parseColor, isNa };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PineEngine = api;
})(typeof globalThis === 'undefined' ? this : globalThis);

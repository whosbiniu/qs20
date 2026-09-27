// Drawing tools that need candle volume: anchored VWAP, range volume profile and long / short position.
// They plug into Drawings (see Drawings.register) and are offered only on panels with volume (panel.volume).
(function () {
  const M = TerminalStudiesMath;
  const dim = () => Theme.css('--dim');
  const rgb = () => Theme.css('--ink-rgb').replace(/ /g, ',');
  const alpha = a => `rgba(${rgb()},${a})`;
  const compact = n => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
  const inside = (p, x0, y0, x1, y1, pad = 4) => p.x >= Math.min(x0, x1) - pad && p.x <= Math.max(x0, x1) + pad && p.y >= Math.min(y0, y1) - pad && p.y <= Math.max(y0, y1) + pad;

  // ---- anchored VWAP -------------------------------------------------------------------------
  Drawings.register('avwap', {
    title: 'Anchored VWAP: kliknij świecę, od której ma się liczyć (pasma ±1σ i ±2σ)',
    icon: '<path d="M2 13c3-1 4-8 7-8s3 4 5 4"/><path d="M2 8c3-1 4-4 7-4"/><circle cx="2.500" cy="13" r="1.300"/>',
    needs: 1, volume: true,
    paint(ctx, d, api, ink, ghost, active) {
      const line = M.anchoredVwap(api.candles, d.points[0].t);
      if (!line.length) return;
      const project = (k, sign) => line.map(v => api.toScreen({ t: v.time, p: v.value + sign * k * v.sd }));
      const mid = project(0, 0);
      if (mid.some(p => !p)) return;
      const up1 = project(1, 1), dn1 = project(1, -1), up2 = project(2, 1), dn2 = project(2, -1);
      const path = pts => { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); };
      // shaded ±1σ band
      ctx.beginPath(); up1.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); [...dn1].reverse().forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();
      ctx.fillStyle = alpha(ghost ? 0.05 : 0.08); ctx.fill();
      ctx.strokeStyle = alpha(0.5); ctx.lineWidth = 1; ctx.setLineDash(ghost ? [4, 4] : []); path(up1); ctx.stroke(); path(dn1); ctx.stroke();
      ctx.strokeStyle = alpha(0.3); ctx.setLineDash([4, 4]); path(up2); ctx.stroke(); path(dn2); ctx.stroke();
      ctx.setLineDash(ghost ? [4, 4] : []); ctx.strokeStyle = ink; ctx.lineWidth = active ? 2.5 : 1.75; path(mid); ctx.stroke(); ctx.setLineDash([]);
      const first = mid[0], last = mid[mid.length - 1];
      ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(first.x, first.y, 3.5, 0, 7); ctx.fill();
      api.label('AVWAP', first.x + 6, first.y - 14, ink);
      api.label(api.fmtPrice(line[line.length - 1].value), Math.min(last.x + 6, api.size.w - 70), last.y, ink);
    },
    distance(d, p, api) {
      const line = M.anchoredVwap(api.candles, d.points[0].t), step = Math.max(1, Math.floor(line.length / 300));
      let best = Infinity, prev = null;
      for (let i = 0; i < line.length; i += step) {
        const q = api.toScreen({ t: line[i].time, p: line[i].value });
        if (!q) { prev = null; continue; }
        if (prev) best = Math.min(best, api.segDist(p, prev, q));
        prev = q;
      }
      return best;
    },
  });

  // ---- range volume profile ------------------------------------------------------------------
  Drawings.register('vprange', {
    title: 'Profil wolumenu z zakresu: zaznacz początek i koniec (POC, VAH, VAL)',
    icon: '<path d="M2 3h8M2 6h11M2 9h6M2 12h9"/><path d="M14 2v12" stroke-dasharray="1.500 1.500"/>',
    needs: 2, volume: true,
    paint(ctx, d, api, ink, ghost, active) {
      const [from, to] = d.points[0].t <= d.points[1].t ? [d.points[0].t, d.points[1].t] : [d.points[1].t, d.points[0].t];
      const profile = M.volumeProfile(api.candles, { from, to: to + 1, rows: 24, valueArea: 0.7 });
      const a = api.toScreen({ t: from, p: (d.points[0].p + d.points[1].p) / 2 }), b = api.toScreen({ t: to, p: (d.points[0].p + d.points[1].p) / 2 });
      if (!profile || !a || !b) return;
      const top = api.toScreen({ t: from, p: profile.high }), bottom = api.toScreen({ t: from, p: profile.low });
      if (!top || !bottom) return;
      const x0 = a.x, x1 = Math.max(b.x, a.x + 30), room = (x1 - x0) * 0.7, most = Math.max(...profile.rows.map(r => r.total));
      ctx.fillStyle = alpha(0.04); ctx.fillRect(x0, top.y, x1 - x0, bottom.y - top.y);
      ctx.strokeStyle = alpha(active ? 0.9 : 0.4); ctx.lineWidth = 1; ctx.setLineDash(ghost ? [4, 4] : [2, 3]); ctx.strokeRect(x0 + .5, top.y + .5, x1 - x0, bottom.y - top.y); ctx.setLineDash([]);
      for (const r of profile.rows) {
        const y0 = api.toScreen({ t: from, p: r.high }), y1 = api.toScreen({ t: from, p: r.low });
        if (!y0 || !y1) continue;
        const h = Math.max(1, y1.y - y0.y - 1), w = r.total / most * room, downWidth = r.total ? w * r.down / r.total : 0;
        ctx.globalAlpha = r.valueArea ? 1 : 0.55;
        ctx.fillStyle = alpha(0.55); ctx.fillRect(x0, y0.y, w - downWidth, h);
        ctx.fillStyle = alpha(0.22); ctx.fillRect(x0 + w - downWidth, y0.y, downWidth, h);
        ctx.globalAlpha = 1;
      }
      const lineAt = (price, text, dash) => {
        const y = api.toScreen({ t: from, p: price });
        if (!y) return;
        ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x0, y.y); ctx.lineTo(x1, y.y); ctx.stroke(); ctx.setLineDash([]);
        api.label(`${text} ${api.fmtPrice(price)}`, x1 - 4, y.y, ink, 'right');
      };
      lineAt(profile.pocPrice, 'POC', []); lineAt(profile.vah, 'VAH', [3, 3]); lineAt(profile.val, 'VAL', [3, 3]);
      api.label(`Σ ${compact(profile.total)} · ${profile.count} św.`, x0 + 4, top.y - 12, ink);
    },
    distance(d, p, api) {
      const a = api.toScreen(d.points[0]), b = api.toScreen(d.points[1]);
      return a && b && inside(p, a.x, a.y, b.x, b.y) ? 0 : Infinity;
    },
  });

  // ---- long / short position -----------------------------------------------------------------
  // Three clicks: entry, stop (its time sets the box width) and target (only its price matters).
  for (const [id, title, icon] of [
    ['long', 'Pozycja long: wejście, stop, cel (stosunek zysku do ryzyka)', '<rect x="2.500" y="3" width="10" height="4.500"/><rect x="2.500" y="7.500" width="10" height="4.500" stroke-dasharray="1.500 1.500"/>'],
    ['short', 'Pozycja short: wejście, stop, cel (stosunek zysku do ryzyka)', '<rect x="2.500" y="3" width="10" height="4.500" stroke-dasharray="1.500 1.500"/><rect x="2.500" y="7.500" width="10" height="4.500"/>'],
  ]) Drawings.register(id, {
    title, icon, needs: 3, volume: false,
    paint(ctx, d, api, ink, ghost, active) {
      const [entry, stop, target] = d.points;
      const a = api.toScreen(entry), s = api.toScreen(stop), t = api.toScreen({ t: entry.t, p: target.p });
      if (!a || !s || !t) return;
      const x0 = a.x, x1 = Math.max(s.x, x0 + 60), risk = Math.abs(entry.p - stop.p), reward = Math.abs(target.p - entry.p);
      const sign = id === 'long' ? 1 : -1, gain = sign * (target.p - entry.p) / entry.p * 100, loss = sign * (stop.p - entry.p) / entry.p * 100;
      ctx.setLineDash(ghost ? [4, 4] : []);
      ctx.fillStyle = alpha(0.22); ctx.fillRect(x0, Math.min(a.y, t.y), x1 - x0, Math.abs(t.y - a.y));     // reward
      ctx.fillStyle = alpha(0.08); ctx.fillRect(x0, Math.min(a.y, s.y), x1 - x0, Math.abs(s.y - a.y));     // risk
      ctx.strokeStyle = ink; ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(x0 + .5, Math.min(a.y, t.y) + .5, x1 - x0, Math.abs(t.y - a.y)); ctx.strokeRect(x0 + .5, Math.min(a.y, s.y) + .5, x1 - x0, Math.abs(s.y - a.y));
      ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x0, a.y); ctx.lineTo(x1, a.y); ctx.stroke(); ctx.setLineDash([]);
      const rr = risk > 0 ? reward / risk : 0;
      api.label(`Cel ${api.fmtPrice(target.p)} (${gain >= 0 ? '+' : '−'}${Math.abs(gain).toFixed(2)}%)`, x0 + 4, t.y + (t.y < a.y ? 10 : -10), ink);
      api.label(`Stop ${api.fmtPrice(stop.p)} (${loss >= 0 ? '+' : '−'}${Math.abs(loss).toFixed(2)}%)`, x0 + 4, s.y + (s.y < a.y ? 10 : -10), ink);
      api.label(`${id === 'long' ? 'LONG' : 'SHORT'} R:R ${rr.toFixed(2)}`, x0 + 4, a.y, ink);
    },
    distance(d, p, api) {
      const a = api.toScreen(d.points[0]), s = api.toScreen(d.points[1]), t = api.toScreen({ t: d.points[0].t, p: d.points[2].p });
      if (!a || !s || !t) return Infinity;
      const x1 = Math.max(s.x, a.x + 60);
      return inside(p, a.x, Math.min(a.y, s.y, t.y), x1, Math.max(a.y, s.y, t.y)) ? 0 : Infinity;
    },
  });
})();

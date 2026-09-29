/*!
 * LuxAlgo Trade Journal engine and importers (packages/core, packages/importers), bundled.
 * Source: https://github.com/LuxAlgo/trade-journal, see vendor/luxalgo-trade-journal.
 *
 * MIT License
 *
 * Copyright (c) 2026 LuxAlgo Global, LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
"use strict";
var LuxJournal = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: !0 });
  }, __copyProps = (to, from, except, desc) => {
    if (from && typeof from == "object" || typeof from == "function")
      for (let key of __getOwnPropNames(from))
        !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

  // vendor/luxalgo-trade-journal/entry.ts
  var entry_exports = {};
  __export(entry_exports, {
    core: () => src_exports,
    importers: () => src_exports2
  });

  // vendor/luxalgo-trade-journal/core/src/index.ts
  var src_exports = {};
  __export(src_exports, {
    DIMENSIONS: () => DIMENSIONS,
    DURATION_BUCKETS: () => DURATION_BUCKETS,
    EDGE_SCORE_VERSION: () => EDGE_SCORE_VERSION,
    EDGE_SCORE_WEIGHTS: () => EDGE_SCORE_WEIGHTS,
    FILTER_KEYS: () => FILTER_KEYS,
    WEEKDAYS: () => WEEKDAYS,
    analyzeAdherence: () => analyzeAdherence,
    analyzeGroups: () => analyzeGroups,
    buildRoundTrips: () => buildRoundTrips,
    byAssetClass: () => byAssetClass,
    byDirection: () => byDirection,
    byDuration: () => byDuration,
    byHour: () => byHour,
    byMistake: () => byMistake,
    byMonth: () => byMonth,
    byPlaybook: () => byPlaybook,
    bySymbol: () => bySymbol,
    byTag: () => byTag,
    byWeekday: () => byWeekday,
    calendarMonth: () => calendarMonth,
    calendarMonthFromDays: () => calendarMonthFromDays,
    clockTime: () => clockTime,
    computeEdgeScore: () => computeEdgeScore,
    computeMetrics: () => computeMetrics,
    computeOverview: () => computeOverview,
    dailyCumulative: () => dailyCumulative,
    dailyCumulativeFromDays: () => dailyCumulativeFromDays,
    dailyStats: () => dailyStats,
    dayKeyOf: () => dayKeyOf,
    dimensionKeys: () => dimensionKeys,
    drawdown: () => drawdown,
    equityCurve: () => equityCurve,
    hourOf: () => hourOf,
    intradayCurve: () => intradayCurve,
    matchesFilters: () => matchesFilters,
    monthKeyOf: () => monthKeyOf,
    plannedR: () => plannedR,
    readFilters: () => readFilters,
    realizedR: () => realizedR,
    relativeDrawdownCurve: () => relativeDrawdownCurve,
    summarizeGroup: () => summarizeGroup,
    tradeR: () => tradeR,
    tradeRisk: () => tradeRisk,
    weekdayOf: () => weekdayOf
  });

  // vendor/luxalgo-trade-journal/core/src/round-trips.ts
  var sum = (values) => values.reduce((total, v) => total + v, 0), openQuantityOf = (cycle) => sum(cycle.lots.map((lot) => lot.quantity)), consumeLots = (cycle, quantity, method) => {
    let remaining = quantity, matchedNotional = 0;
    if (method === "wavg") {
      let totalQty = openQuantityOf(cycle), totalNotional = sum(cycle.lots.map((lot) => lot.quantity * lot.price));
      matchedNotional = (totalQty > 0 ? totalNotional / totalQty : 0) * quantity;
      let scale = totalQty > 0 ? (totalQty - quantity) / totalQty : 0;
      return cycle.lots = cycle.lots.map((lot) => ({ ...lot, quantity: lot.quantity * scale })).filter((lot) => lot.quantity > 1e-9), matchedNotional;
    }
    for (; remaining > 1e-9 && cycle.lots.length > 0; ) {
      let index = method === "fifo" ? 0 : cycle.lots.length - 1, lot = cycle.lots[index], take = Math.min(lot.quantity, remaining);
      matchedNotional += take * lot.price, lot.quantity -= take, remaining -= take, lot.quantity <= 1e-9 && cycle.lots.splice(index, 1);
    }
    return matchedNotional;
  }, finalizeCycle = (cycle, accountId, symbol, assetClass, closedAt, keyCollisions, importGroup, contractMultiplier) => {
    let openQuantity = openQuantityOf(cycle), netPnl = cycle.grossPnl - cycle.fees, isOpen = openQuantity > 1e-9, status = isOpen ? "open" : Math.abs(netPnl) <= 1e-9 ? "breakeven" : netPnl > 0 ? "win" : "loss", baseKey = `${accountId}|${symbol}|${cycle.direction}|${cycle.openedAt}${importGroup ? `|import:${encodeURIComponent(importGroup)}` : ""}`, collision = keyCollisions.get(baseKey) ?? 0;
    return keyCollisions.set(baseKey, collision + 1), {
      key: collision === 0 ? baseKey : `${baseKey}|${collision}`,
      accountId,
      symbol,
      assetClass,
      direction: cycle.direction,
      status,
      openedAt: cycle.openedAt,
      closedAt: isOpen ? void 0 : closedAt,
      quantity: cycle.entryQuantity,
      openQuantity: isOpen ? openQuantity : 0,
      avgEntry: cycle.entryQuantity > 0 ? cycle.entryNotional / cycle.entryQuantity : 0,
      avgExit: cycle.exitQuantity > 0 ? cycle.exitNotional / cycle.exitQuantity : void 0,
      grossPnl: cycle.grossPnl,
      fees: cycle.fees,
      netPnl,
      executionCount: cycle.executionCount,
      executionIds: cycle.executionIds,
      exits: cycle.exits,
      durationMs: !isOpen && closedAt ? Date.parse(closedAt) - Date.parse(cycle.openedAt) : void 0,
      ...contractMultiplier !== void 0 ? { contractMultiplier } : {}
    };
  }, compareNumbers = (a, b) => a < b ? -1 : a > b ? 1 : 0, importOrderOf = (execution) => execution.importMetadata?.order ?? Number.POSITIVE_INFINITY, compareExecutions = (a, b) => compareNumbers(Date.parse(a.executedAt), Date.parse(b.executedAt)) || compareNumbers(importOrderOf(a), importOrderOf(b)) || a.id.localeCompare(b.id), buildRoundTrips = (executions, options = {}) => {
    let method = options.method ?? "fifo", trips = [], keyCollisions = /* @__PURE__ */ new Map(), groups = /* @__PURE__ */ new Map();
    for (let execution of executions) {
      let groupKey = `${execution.accountId}\0${execution.symbol}${execution.importMetadata?.group ? `\0${execution.importMetadata.group}` : ""}`, group = groups.get(groupKey);
      group ? group.push(execution) : groups.set(groupKey, [execution]);
    }
    for (let group of groups.values()) {
      group.sort(compareExecutions);
      let { accountId, symbol } = group[0], importGroup = group[0].importMetadata?.group, contractMultiplier = options.multipliers?.[symbol], multiplier = contractMultiplier ?? 1, assetClass = group.find((e) => e.assetClass)?.assetClass, cycle = null;
      for (let execution of group) {
        let signedQty = execution.side === "buy" ? execution.quantity : -execution.quantity, feeRemaining = execution.fee, counted = !1;
        for (; Math.abs(signedQty) > 1e-9; ) {
          cycle || (cycle = {
            direction: signedQty > 0 ? "long" : "short",
            openedAt: execution.executedAt,
            lots: [],
            entryQuantity: 0,
            entryNotional: 0,
            exitQuantity: 0,
            exitNotional: 0,
            grossPnl: 0,
            fees: 0,
            executionIds: [],
            exits: [],
            executionCount: 0
          });
          let isEntry = cycle.direction === "long" && signedQty > 0 || cycle.direction === "short" && signedQty < 0;
          if (counted ? cycle.executionIds.includes(execution.id) || (cycle.executionIds.push(execution.id), cycle.executionCount += 1) : (cycle.executionIds.push(execution.id), cycle.executionCount += 1, counted = !0), isEntry) {
            let qty = Math.abs(signedQty);
            cycle.lots.push({ quantity: qty, price: execution.price }), cycle.entryQuantity += qty, cycle.entryNotional += qty * execution.price, cycle.fees += feeRemaining, feeRemaining = 0, signedQty = 0;
          } else {
            let openQty = openQuantityOf(cycle), exitQty = Math.min(Math.abs(signedQty), openQty), matchedNotional = consumeLots(cycle, exitQty, method), exitNotional = exitQty * execution.price, chunkGross = execution.importMetadata?.reportedGrossPnl ?? (cycle.direction === "long" ? (exitNotional - matchedNotional) * multiplier : (matchedNotional - exitNotional) * multiplier), feeShare = Math.abs(signedQty) > 0 ? feeRemaining * (exitQty / Math.abs(signedQty)) : 0;
            cycle.grossPnl += chunkGross, cycle.fees += feeShare, feeRemaining -= feeShare, cycle.exitQuantity += exitQty, cycle.exitNotional += exitNotional, cycle.exits.push({ executionId: execution.id, grossPnl: chunkGross, quantity: exitQty }), signedQty += cycle.direction === "long" ? exitQty : -exitQty, openQuantityOf(cycle) <= 1e-9 && (trips.push(
              finalizeCycle(
                cycle,
                accountId,
                symbol,
                assetClass,
                execution.executedAt,
                keyCollisions,
                importGroup,
                contractMultiplier
              )
            ), cycle = null);
          }
        }
        feeRemaining !== 0 && cycle && (cycle.fees += feeRemaining);
      }
      cycle && trips.push(
        finalizeCycle(
          cycle,
          accountId,
          symbol,
          assetClass,
          void 0,
          keyCollisions,
          importGroup,
          contractMultiplier
        )
      );
    }
    return trips.sort(
      (a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt) || a.key.localeCompare(b.key)
    ), trips;
  };

  // vendor/luxalgo-trade-journal/core/src/time.ts
  var dateFormatters = /* @__PURE__ */ new Map(), partFormatters = /* @__PURE__ */ new Map(), dateFormatter = (timeZone) => {
    let formatter = dateFormatters.get(timeZone);
    return formatter || (formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }), dateFormatters.set(timeZone, formatter)), formatter;
  }, partFormatter = (timeZone) => {
    let formatter = partFormatters.get(timeZone);
    return formatter || (formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      hour12: !1
    }), partFormatters.set(timeZone, formatter)), formatter;
  }, dayKeyOf = (iso, timeZone = "UTC") => dateFormatter(timeZone).format(new Date(iso)), monthKeyOf = (iso, timeZone = "UTC") => dayKeyOf(iso, timeZone).slice(0, 7), WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], weekdayOf = (iso, timeZone = "UTC") => partFormatter(timeZone).formatToParts(new Date(iso)).find((p) => p.type === "weekday")?.value ?? "Sun", hourOf = (iso, timeZone = "UTC") => {
    let parts = partFormatter(timeZone).formatToParts(new Date(iso)), hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    return hour === 24 ? 0 : hour;
  };

  // vendor/luxalgo-trade-journal/core/src/equity.ts
  var closedByCloseTime = (trades) => trades.filter((t) => t.status !== "open" && !!t.closedAt).sort(
    (a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt) || a.key.localeCompare(b.key)
  ), equityCurve = (trades) => {
    let cum = 0;
    return closedByCloseTime(trades).map((trade) => (cum += trade.netPnl, { t: trade.closedAt, cumNetPnl: cum }));
  }, dailyStats = (trades, timeZone = "UTC") => {
    let days = /* @__PURE__ */ new Map();
    for (let trade of closedByCloseTime(trades)) {
      let date = dayKeyOf(trade.closedAt, timeZone), day = days.get(date);
      day || (day = {
        date,
        netPnl: 0,
        grossPnl: 0,
        fees: 0,
        trades: 0,
        wins: 0,
        losses: 0,
        breakevens: 0,
        volume: 0
      }, days.set(date, day)), day.netPnl += trade.netPnl, day.grossPnl += trade.grossPnl, day.fees += trade.fees, day.trades += 1, day.volume += trade.quantity, trade.status === "win" ? day.wins += 1 : trade.status === "loss" ? day.losses += 1 : day.breakevens += 1;
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, dailyCumulative = (trades, timeZone = "UTC") => dailyCumulativeFromDays(dailyStats(trades, timeZone)), dailyCumulativeFromDays = (days) => {
    let cum = 0;
    return days.map((day) => (cum += day.netPnl, { t: day.date, cumNetPnl: cum }));
  }, relativeDrawdownCurve = (curve, initialBalance = 0) => {
    let peak = 0;
    return curve.map((point) => {
      point.cumNetPnl > peak && (peak = point.cumNetPnl);
      let base = initialBalance + peak;
      return {
        t: point.t,
        drawdownPct: base > 0 ? (peak - point.cumNetPnl) / base : null
      };
    });
  }, drawdown = (curve, initialBalance = 0) => {
    let peak = 0, maxDrawdown = 0, maxDrawdownPct = null;
    for (let point of curve) {
      point.cumNetPnl > peak && (peak = point.cumNetPnl);
      let dd = peak - point.cumNetPnl;
      if (dd > maxDrawdown) {
        maxDrawdown = dd;
        let base = initialBalance + peak;
        maxDrawdownPct = base > 0 ? dd / base : null;
      }
    }
    return { maxDrawdown, maxDrawdownPct, peak };
  }, intradayCurve = (trades, executionTimes, date, timeZone = "UTC") => {
    let events = [];
    for (let trade of trades) {
      let totalExitQty = trade.exits.reduce((total, exit) => total + exit.quantity, 0);
      for (let exit of trade.exits) {
        let t = executionTimes.get(exit.executionId);
        if (!t || dayKeyOf(t, timeZone) !== date) continue;
        let feeShare = totalExitQty > 0 ? trade.fees * (exit.quantity / totalExitQty) : 0;
        events.push({ t, pnl: exit.grossPnl - feeShare });
      }
    }
    events.sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
    let cum = 0;
    return events.map((event) => (cum += event.pnl, { t: event.t, cumNetPnl: cum }));
  };

  // vendor/luxalgo-trade-journal/core/src/analysis.ts
  var FILTER_KEYS = [
    "accounts",
    "from",
    "to",
    "symbol",
    "excludeSymbol",
    "tag",
    "mistake",
    "playbookId",
    "direction",
    "status",
    "assetClass",
    "reviewed",
    "ratingMin",
    "ratingMax",
    "quantityMin",
    "quantityMax",
    "entryMin",
    "entryMax",
    "exitMin",
    "exitMax",
    "durationMin",
    "durationMax",
    "rMin",
    "rMax",
    "plannedRMin",
    "plannedRMax",
    "pnlMin",
    "pnlMax",
    "weekdays",
    "entryAfter",
    "entryBefore",
    "exitAfter",
    "exitBefore"
  ], readFilters = (params) => Object.fromEntries(
    FILTER_KEYS.flatMap((key) => params.get(key) ? [[key, params.get(key)]] : [])
  );
  function tradeRisk(trade) {
    let stop = trade.annotations?.stopLoss, multiplier = trade.contractMultiplier ?? (["futures", "option", "cfd", "forex"].includes(trade.assetClass ?? "") ? null : 1);
    if (stop == null || multiplier == null || multiplier <= 0 || trade.quantity <= 0) return null;
    let distance = (trade.avgEntry - stop) * (trade.direction === "long" ? 1 : -1);
    return distance > 0 ? distance * trade.quantity * multiplier : null;
  }
  function tradeR(trade) {
    let risk = tradeRisk(trade);
    return risk && trade.status !== "open" ? trade.netPnl / risk : null;
  }
  function plannedR(trade) {
    let stop = trade.annotations?.stopLoss, target = trade.annotations?.profitTarget;
    if (stop == null || target == null) return null;
    let sign = trade.direction === "long" ? 1 : -1, risk = (trade.avgEntry - stop) * sign, reward = (target - trade.avgEntry) * sign;
    return risk > 0 && reward >= 0 ? reward / risk : null;
  }
  var partsCache = /* @__PURE__ */ new Map();
  function clockTime(iso, timeZone) {
    let format = partsCache.get(timeZone);
    return format || (format = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }), partsCache.set(timeZone, format)), format.format(new Date(iso));
  }
  var list = (value) => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean), within = (value, min, max) => !min && !max ? !0 : value == null || !Number.isFinite(value) ? !1 : (!min || Number.isFinite(Number(min)) && value >= Number(min)) && (!max || Number.isFinite(Number(max)) && value <= Number(max));
  function inTime(iso, after, before, tz) {
    if (!after && !before) return !0;
    if (!iso) return !1;
    let t = clockTime(iso, tz);
    return after && before && after > before ? t >= after || t <= before : (!after || t >= after) && (!before || t <= before);
  }
  function matchesFilters(t, f, tz = "UTC") {
    let a = t.annotations;
    if (f.accounts && !list(f.accounts).includes(t.accountId)) return !1;
    if (f.from || f.to) {
      let day = dayKeyOf(t.closedAt ?? t.openedAt, tz);
      if (f.from && day < f.from || f.to && day > f.to) return !1;
    }
    if (f.symbol && !list(f.symbol.toUpperCase()).includes(t.symbol.toUpperCase()) || list(f.excludeSymbol?.toUpperCase()).includes(t.symbol.toUpperCase()) || f.tag && !list(f.tag).every((tag) => a?.tags?.includes(tag)) || f.mistake && !list(f.mistake).every((tag) => a?.mistakes?.includes(tag)) || f.playbookId && a?.playbook !== f.playbookId || f.direction && t.direction !== f.direction || f.status && (f.status === "closed" ? t.status === "open" : t.status !== f.status) || f.assetClass && t.assetClass !== f.assetClass || f.reviewed && !!a?.reviewed != (f.reviewed === "yes") || !within(a?.rating, f.ratingMin, f.ratingMax) || !within(t.quantity, f.quantityMin, f.quantityMax) || !within(t.avgEntry, f.entryMin, f.entryMax) || !within(t.avgExit, f.exitMin, f.exitMax) || !within(t.durationMs == null ? null : t.durationMs / 6e4, f.durationMin, f.durationMax) || (f.rMin || f.rMax) && !within(tradeR(t), f.rMin, f.rMax) || (f.plannedRMin || f.plannedRMax) && !within(plannedR(t), f.plannedRMin, f.plannedRMax) || !within(t.netPnl, f.pnlMin, f.pnlMax))
      return !1;
    if (f.weekdays) {
      let dayIndex = (/* @__PURE__ */ new Date(dayKeyOf(t.openedAt, tz) + "T12:00:00Z")).getUTCDay();
      if (!list(f.weekdays).includes(String(dayIndex))) return !1;
    }
    return inTime(t.openedAt, f.entryAfter, f.entryBefore, tz) && inTime(t.closedAt, f.exitAfter, f.exitBefore, tz);
  }
  var DIMENSIONS = {
    symbol: "Symbol",
    playbook: "Strategy",
    tag: "Tag",
    mistake: "Mistake",
    direction: "Direction",
    assetClass: "Asset class",
    weekday: "Weekday",
    month: "Month",
    entryHour: "Entry hour",
    exitHour: "Exit hour",
    entry15: "Entry \xB7 15 minutes",
    exit15: "Exit \xB7 15 minutes",
    duration: "Holding time",
    quantity: "Position size",
    entryPrice: "Entry price",
    exitPrice: "Exit price",
    realizedR: "Realized R",
    plannedR: "Planned R",
    outcome: "Outcome"
  }, bands = (n, bounds, labels) => n == null || Number.isNaN(n) ? "Unspecified" : labels[bounds.findIndex((b) => n < b)] ?? labels[labels.length - 1];
  function dimensionKeys(t, dimension, tz) {
    let bucketTime = (iso, step) => {
      if (!iso) return "Open";
      let time = clockTime(iso, tz);
      return time.slice(0, 3) + String(Math.floor(Number(time.slice(3)) / step) * step).padStart(2, "0");
    };
    switch (dimension) {
      case "tag":
        return t.annotations?.tags?.length ? t.annotations.tags : ["Untagged"];
      case "mistake":
        return t.annotations?.mistakes?.length ? t.annotations.mistakes : ["None"];
      case "playbook":
        return [t.annotations?.playbook ?? "Unassigned"];
      case "symbol":
        return [t.symbol];
      case "direction":
        return [t.direction];
      case "outcome":
        return [t.status];
      case "assetClass":
        return [t.assetClass ?? "Unspecified"];
      case "month":
        return [dayKeyOf(t.closedAt ?? t.openedAt, tz).slice(0, 7)];
      case "weekday":
        return [
          ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][(/* @__PURE__ */ new Date(dayKeyOf(t.openedAt, tz) + "T12:00:00Z")).getUTCDay()]
        ];
      case "entryHour":
        return [bucketTime(t.openedAt, 60)];
      case "exitHour":
        return [bucketTime(t.closedAt, 60)];
      case "entry15":
        return [bucketTime(t.openedAt, 15)];
      case "exit15":
        return [bucketTime(t.closedAt, 15)];
      case "duration":
        return [
          bands(
            t.durationMs == null ? void 0 : t.durationMs / 6e4,
            [1, 5, 15, 60, 240, 1440],
            ["<1m", "1\u20135m", "5\u201315m", "15\u201360m", "1\u20134h", "4\u201324h", "1d+"]
          )
        ];
      case "quantity":
        return [
          bands(t.quantity, [1, 10, 100, 1e3], ["<1", "1\u201310", "10\u2013100", "100\u20131,000", "1,000+"])
        ];
      case "entryPrice":
      case "exitPrice":
        return [
          bands(
            dimension === "entryPrice" ? t.avgEntry : t.avgExit,
            [1, 10, 50, 100, 500],
            ["<1", "1\u201310", "10\u201350", "50\u2013100", "100\u2013500", "500+"]
          )
        ];
      case "realizedR":
      case "plannedR":
        return [
          bands(
            (dimension === "realizedR" ? tradeR(t) : plannedR(t)) ?? void 0,
            [-2, -1, 0, 1, 2, 3],
            ["<-2R", "-2 to -1R", "-1 to 0R", "0\u20131R", "1\u20132R", "2\u20133R", "3R+"]
          )
        ];
    }
  }
  function summarizeGroup(all) {
    let ts = all.filter((t) => t.status !== "open"), mean2 = (ns) => {
      let vs = ns.filter((x) => x != null && Number.isFinite(x));
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    }, profit = ts.reduce((s, t) => s + Math.max(0, t.netPnl), 0), loss = ts.reduce((s, t) => s - Math.min(0, t.netPnl), 0);
    return {
      trades: ts.length,
      netPnl: ts.reduce((s, t) => s + t.netPnl, 0),
      winRate: ts.length ? ts.filter((t) => t.status === "win").length / ts.length : null,
      avgRealizedR: mean2(ts.map(tradeR)),
      avgPlannedR: mean2(ts.map(plannedR)),
      avgDurationMs: mean2(ts.map((t) => t.durationMs)),
      volume: ts.reduce((s, t) => s + t.quantity, 0),
      profitFactor: loss ? profit / loss : null,
      noLosses: profit > 0 && loss === 0
    };
  }
  function analyzeGroups(trades, primary, secondary, tz = "UTC") {
    let groups = /* @__PURE__ */ new Map();
    for (let t of trades.filter((t2) => t2.status !== "open"))
      for (let row of new Set(dimensionKeys(t, primary, tz)))
        for (let column of new Set(secondary ? dimensionKeys(t, secondary, tz) : [""])) {
          let key = JSON.stringify([row, column]);
          groups.has(key) || groups.set(key, { row, column, trades: [] }), groups.get(key).trades.push(t);
        }
    return [...groups.values()].map((g) => ({ row: g.row, column: g.column, ...summarizeGroup(g.trades) })).sort((a, b) => b.netPnl - a.netPnl || a.row.localeCompare(b.row));
  }

  // vendor/luxalgo-trade-journal/core/src/metrics.ts
  var mean = (values) => values.length === 0 ? null : values.reduce((total, v) => total + v, 0) / values.length, realizedR = (trade) => tradeR(trade), computeMetrics = (trades, options = {}) => metricsFromOverview(
    trades,
    options,
    dailyStats(trades, options.timeZone ?? "UTC"),
    equityCurve(trades)
  ), metricsFromOverview = (trades, options, days, curve) => {
    let closed = trades.filter((t) => t.status !== "open"), wins = closed.filter((t) => t.status === "win"), losses = closed.filter((t) => t.status === "loss"), breakevens = closed.filter((t) => t.status === "breakeven"), grossProfit = closed.reduce((total, t) => total + Math.max(0, t.netPnl), 0), grossLoss = closed.reduce((total, t) => total - Math.min(0, t.netPnl), 0), winningDays = days.filter((d) => d.netPnl > 0).length, ordered = [...closed].sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt)), maxWinStreak = 0, maxLossStreak = 0, run = 0;
    for (let trade of ordered) {
      if (trade.status === "breakeven") continue;
      let direction = trade.status === "win" ? 1 : -1;
      run = Math.sign(run) === direction ? run + direction : direction, run > maxWinStreak && (maxWinStreak = run), -run > maxLossStreak && (maxLossStreak = -run);
    }
    let dd = drawdown(curve, options.initialBalance ?? 0), netPnl = closed.reduce((total, t) => total + t.netPnl, 0), avgWin = mean(wins.map((t) => t.netPnl)), avgLoss = mean(losses.map((t) => Math.abs(t.netPnl))), winRate = closed.length > 0 ? wins.length / closed.length : null, dayProfits = days.filter((d) => d.netPnl > 0).map((d) => d.netPnl), totalDayProfit = dayProfits.reduce((total, v) => total + v, 0), rMultiples = trades.map((trade) => realizedR(trade)).filter((r) => r !== null);
    return {
      totalTrades: trades.length,
      closedTrades: closed.length,
      openTrades: trades.length - closed.length,
      wins: wins.length,
      losses: losses.length,
      breakevens: breakevens.length,
      netPnl,
      grossPnl: closed.reduce((total, t) => total + t.grossPnl, 0),
      fees: closed.reduce((total, t) => total + t.fees, 0),
      winRate,
      dayWinRate: days.length > 0 ? winningDays / days.length : null,
      tradingDays: days.length,
      profitFactor: closed.length === 0 ? null : grossLoss > 0 ? grossProfit / grossLoss : null,
      profitFactorIsInfinite: closed.length > 0 && grossLoss === 0 && grossProfit > 0,
      avgWin,
      avgLoss,
      avgWinLossRatio: avgWin !== null && avgLoss !== null && avgLoss > 0 ? avgWin / avgLoss : null,
      expectancy: closed.length > 0 ? netPnl / closed.length : null,
      largestWin: wins.reduce((max, t) => Math.max(max, t.netPnl), 0),
      largestLoss: losses.reduce((min, t) => Math.min(min, t.netPnl), 0),
      maxWinStreak,
      maxLossStreak,
      currentStreak: run,
      totalVolume: trades.reduce((total, t) => total + t.quantity, 0),
      avgDurationMs: mean(
        closed.map((t) => t.durationMs).filter((d) => d !== void 0)
      ),
      maxDrawdown: dd.maxDrawdown,
      maxDrawdownPct: dd.maxDrawdownPct,
      recoveryFactor: dd.maxDrawdown > 0 ? netPnl / dd.maxDrawdown : null,
      profitConcentration: totalDayProfit > 0 ? dayProfits.reduce((max, value) => Math.max(max, value), 0) / totalDayProfit : null,
      avgRealizedR: mean(rMultiples),
      tradesWithRisk: rMultiples.length
    };
  }, computeOverview = (trades, options = {}) => {
    let timeZone = options.timeZone ?? "UTC", days = dailyStats(trades, timeZone), equity = equityCurve(trades);
    return {
      metrics: metricsFromOverview(trades, options, days, equity),
      days,
      equity
    };
  };

  // vendor/luxalgo-trade-journal/core/src/aggregate.ts
  var bucketStats = (key, trades) => {
    let closed = 0, wins = 0, netPnl = 0, profit = 0, loss = 0, volume = 0;
    for (let trade of trades)
      volume += trade.quantity, trade.status !== "open" && (closed++, trade.status === "win" && wins++, netPnl += trade.netPnl, profit += Math.max(0, trade.netPnl), loss -= Math.min(0, trade.netPnl));
    return {
      key,
      trades: trades.length,
      netPnl,
      winRate: closed ? wins / closed : null,
      profitFactor: loss > 0 ? profit / loss : null,
      volume
    };
  }, groupInto = (trades, keysOf) => {
    let groups = /* @__PURE__ */ new Map();
    for (let trade of trades)
      for (let key of keysOf(trade)) {
        let group = groups.get(key);
        group ? group.push(trade) : groups.set(key, [trade]);
      }
    return [...groups.entries()].map(([key, group]) => bucketStats(key, group)).sort((a, b) => b.netPnl - a.netPnl);
  }, bySymbol = (trades) => groupInto(trades, (t) => [t.symbol]), byTag = (trades) => groupInto(trades, (t) => t.annotations?.tags ?? []), byMistake = (trades) => groupInto(trades, (t) => t.annotations?.mistakes ?? []), byPlaybook = (trades) => groupInto(trades, (t) => t.annotations?.playbook ? [t.annotations.playbook] : []), byAssetClass = (trades) => groupInto(trades, (t) => [t.assetClass ?? "other"]), byDirection = (trades) => groupInto(trades, (t) => [t.direction]), byWeekday = (trades, timeZone = "UTC") => [...groupInto(trades, (t) => [weekdayOf(t.openedAt, timeZone)])].sort(
    (a, b) => WEEKDAYS.indexOf(a.key) - WEEKDAYS.indexOf(b.key)
  ), byHour = (trades, timeZone = "UTC") => groupInto(trades, (t) => [String(hourOf(t.openedAt, timeZone)).padStart(2, "0")]).sort(
    (a, b) => a.key.localeCompare(b.key)
  ), DURATION_BUCKETS = [
    { key: "< 1m", maxMs: 6e4 },
    { key: "1-5m", maxMs: 3e5 },
    { key: "5-15m", maxMs: 9e5 },
    { key: "15-60m", maxMs: 36e5 },
    { key: "1-4h", maxMs: 144e5 },
    { key: "4-24h", maxMs: 864e5 },
    { key: "> 1d", maxMs: Number.POSITIVE_INFINITY }
  ], byDuration = (trades) => [...groupInto(
    trades.filter((t) => t.durationMs !== void 0),
    (t) => [DURATION_BUCKETS.find((b) => t.durationMs < b.maxMs).key]
  )].sort(
    (a, b) => DURATION_BUCKETS.findIndex((d) => d.key === a.key) - DURATION_BUCKETS.findIndex((d) => d.key === b.key)
  ), byMonth = (trades, timeZone = "UTC") => groupInto(
    trades.filter((t) => t.closedAt),
    (t) => [dayKeyOf(t.closedAt, timeZone).slice(0, 7)]
  ).sort((a, b) => a.key.localeCompare(b.key)), calendarMonth = (trades, year, month, timeZone = "UTC") => calendarMonthFromDays(dailyStats(trades, timeZone), year, month), calendarMonthFromDays = (dayStats, year, month) => {
    let monthPrefix = `${year}-${String(month).padStart(2, "0")}`, days = new Map(
      dayStats.filter((d) => d.date.startsWith(monthPrefix)).map((d) => [d.date, d])
    ), first = new Date(Date.UTC(year, month - 1, 1)), daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate(), leadingBlanks = first.getUTCDay(), cells = Array.from({ length: leadingBlanks }, () => null);
    for (let day = 1; day <= daysInMonth; day++) {
      let date = `${monthPrefix}-${String(day).padStart(2, "0")}`;
      cells.push(
        days.get(date) ?? {
          date,
          netPnl: 0,
          grossPnl: 0,
          fees: 0,
          trades: 0,
          wins: 0,
          losses: 0,
          breakevens: 0,
          volume: 0
        }
      );
    }
    for (; cells.length % 7 !== 0; ) cells.push(null);
    let weeks = [];
    for (let i = 0; i < cells.length; i += 7) {
      let weekDays = cells.slice(i, i + 7);
      weeks.push({
        days: weekDays,
        weekNetPnl: weekDays.reduce((total, d) => total + (d?.netPnl ?? 0), 0),
        weekTrades: weekDays.reduce((total, d) => total + (d?.trades ?? 0), 0)
      });
    }
    let traded = [...days.values()];
    return {
      year,
      month,
      weeks,
      monthNetPnl: traded.reduce((total, d) => total + d.netPnl, 0),
      monthTrades: traded.reduce((total, d) => total + d.trades, 0),
      tradingDays: traded.filter((d) => d.trades > 0).length,
      winningDays: traded.filter((d) => d.netPnl > 0).length
    };
  };

  // vendor/luxalgo-trade-journal/core/src/edge-score.ts
  var EDGE_SCORE_VERSION = 2, EDGE_SCORE_WEIGHTS = {
    winRate: 15,
    profitFactor: 25,
    avgWinLoss: 20,
    drawdown: 15,
    recovery: 10,
    consistency: 15
  }, clamp01 = (value) => Math.min(Math.max(value, 0), 1), computeEdgeScore = (metrics) => {
    let winRate = clamp01((metrics.winRate ?? 0) / 0.6) * 100, pf = metrics.profitFactorIsInfinite ? 3 : metrics.profitFactor ?? 0, profitFactor = clamp01(pf / 3) * 100, avgWinLoss = clamp01((metrics.avgWinLossRatio ?? 0) / 2.5) * 100, ddPct = metrics.maxDrawdownPct, drawdownScore = ddPct === null ? 50 : (1 - clamp01(ddPct / 0.25)) * 100, recovery = metrics.maxDrawdown > 0 ? clamp01((metrics.recoveryFactor ?? 0) / 3) * 100 : metrics.netPnl > 0 ? 100 : 0, concentration = metrics.profitConcentration, consistency = concentration === null ? 0 : concentration <= 0.15 ? 100 : (1 - clamp01((concentration - 0.15) / 0.85)) * 100, components = {
      winRate,
      profitFactor,
      avgWinLoss,
      drawdown: drawdownScore,
      recovery,
      consistency
    }, totalWeight = Object.values(EDGE_SCORE_WEIGHTS).reduce((total, w) => total + w, 0), weighted = Object.entries(components).reduce(
      (total, [k, v]) => total + v * EDGE_SCORE_WEIGHTS[k],
      0
    ) / totalWeight;
    return {
      version: 2,
      score: metrics.closedTrades >= 5 ? Math.round(weighted * 100) / 100 : null,
      components,
      closedTrades: metrics.closedTrades
    };
  };

  // vendor/luxalgo-trade-journal/core/src/adherence.ts
  function analyzeAdherence(trades, books, checks) {
    let tradesByBook = /* @__PURE__ */ new Map();
    for (let trade of trades) {
      let id = trade.annotations?.playbook;
      if (!id || trade.status === "open") continue;
      let group = tradesByBook.get(id) ?? [];
      group.push(trade), tradesByBook.set(id, group);
    }
    let checksByBook = /* @__PURE__ */ new Map();
    for (let check of checks) {
      let book = checksByBook.get(check.playbookId) ?? /* @__PURE__ */ new Map(), trade = book.get(check.tradeKey) ?? /* @__PURE__ */ new Map();
      trade.set(check.rule, check.followed), book.set(check.tradeKey, trade), checksByBook.set(check.playbookId, book);
    }
    return books.map((book) => {
      let ts = tradesByBook.get(book.id) ?? [], rules = [...new Set(book.rules)].map((rule) => ({
        rule,
        followed: [],
        broken: []
      })), followed = [], broken = [], evaluated = 0, positive = 0;
      for (let trade of ts) {
        let assessed = checksByBook.get(book.id)?.get(trade.key), complete = rules.length > 0, hasBroken = !1;
        for (let rule of rules) {
          let result = assessed?.get(rule.rule);
          if (result === void 0) {
            complete = !1;
            continue;
          }
          evaluated++, result ? (positive++, rule.followed.push(trade)) : (hasBroken = !0, rule.broken.push(trade));
        }
        hasBroken ? broken.push(trade) : complete && followed.push(trade);
      }
      return {
        id: book.id,
        total: ts.length,
        evaluated,
        possible: ts.length * rules.length,
        rate: evaluated ? positive / evaluated : null,
        accountIds: [...new Set(ts.map((t) => t.accountId))],
        followed: summarizeGroup(followed),
        broken: summarizeGroup(broken),
        unassessed: ts.length - followed.length - broken.length,
        rules: rules.map((rule) => ({
          rule: rule.rule,
          evaluated: rule.followed.length + rule.broken.length,
          rate: rule.followed.length + rule.broken.length ? rule.followed.length / (rule.followed.length + rule.broken.length) : null,
          followed: summarizeGroup(rule.followed),
          broken: summarizeGroup(rule.broken)
        }))
      };
    });
  }

  // vendor/luxalgo-trade-journal/importers/src/index.ts
  var src_exports2 = {};
  __export(src_exports2, {
    FORMATS: () => FORMATS,
    detectFormat: () => detectFormat,
    headerKey: () => headerKey,
    makeFillsFormat: () => makeFillsFormat,
    parseAuto: () => parseAuto,
    parseCsv: () => parseCsv,
    parseDateAndTime: () => parseDateAndTime,
    parseHistory: () => parseHistory,
    parseMoney: () => parseMoney,
    parseQuantity: () => parseQuantity,
    parseSide: () => parseSide,
    parseTimestamp: () => parseTimestamp,
    parseWithMapping: () => parseWithMapping,
    readHeaders: () => readHeaders,
    tradeToExecutions: () => tradeToExecutions
  });

  // vendor/luxalgo-trade-journal/importers/src/types.ts
  var tradeToExecutions = (trade) => [
    {
      symbol: trade.symbol,
      side: trade.direction === "long" ? "buy" : "sell",
      quantity: trade.quantity,
      price: trade.entryPrice,
      fee: 0,
      executedAt: trade.openedAt,
      assetClass: trade.assetClass
    },
    {
      symbol: trade.symbol,
      side: trade.direction === "long" ? "sell" : "buy",
      quantity: trade.quantity,
      price: trade.exitPrice,
      fee: trade.fees,
      executedAt: trade.closedAt,
      assetClass: trade.assetClass
    }
  ];

  // vendor/luxalgo-trade-journal/importers/src/csv.ts
  var detectDelimiter = (line) => {
    let candidates = [",", ";", "	"], best = ",", bestCount = -1;
    for (let delimiter of candidates) {
      let count = line.split(delimiter).length;
      count > bestCount && (best = delimiter, bestCount = count);
    }
    return best;
  }, parseCsv = (content, delimiter) => {
    let text2 = content.replace(/^﻿/, ""), firstLine = text2.slice(0, text2.indexOf(`
`) === -1 ? text2.length : text2.indexOf(`
`)), sep = delimiter ?? detectDelimiter(firstLine), rows = [], row = [], field = "", inQuotes = !1;
    for (let i = 0; i < text2.length; i++) {
      let char = text2[i];
      inQuotes ? char === '"' ? text2[i + 1] === '"' ? (field += '"', i++) : inQuotes = !1 : field += char : char === '"' ? inQuotes = !0 : char === sep ? (row.push(field), field = "") : char === `
` || char === "\r" ? (char === "\r" && text2[i + 1] === `
` && i++, row.push(field), field = "", row.some((f) => f.trim() !== "") && rows.push(row), row = []) : field += char;
    }
    return row.push(field), row.some((f) => f.trim() !== "") && rows.push(row), rows;
  }, headerKey = (header) => header.toLowerCase().replace(/[^a-z0-9]/g, ""), toRecords = (rows) => {
    let [header, ...data] = rows;
    if (!header) return [];
    let keys = header.map(headerKey);
    return data.map((cells) => {
      let record = {};
      return keys.forEach((key, index) => {
        key && (record[key] = (cells[index] ?? "").trim());
      }), record;
    });
  }, pick = (row, aliases) => {
    for (let alias of aliases) {
      let value = row[alias];
      if (value !== void 0 && value !== "") return value;
    }
  }, hasHeaders = (headers, required) => {
    let keys = new Set(headers.map(headerKey));
    return required.every((aliases) => aliases.some((alias) => keys.has(alias)));
  };

  // vendor/luxalgo-trade-journal/importers/src/dates.ts
  var offsetFormatters = /* @__PURE__ */ new Map(), offsetFormatter = (timeZone) => {
    let formatter = offsetFormatters.get(timeZone);
    return formatter || (formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: !1
    }), offsetFormatters.set(timeZone, formatter)), formatter;
  }, wallClockAsUtc = (utcMs, timeZone) => {
    let parts = offsetFormatter(timeZone).formatToParts(new Date(utcMs)), get = (type) => Number(parts.find((p) => p.type === type)?.value ?? "0"), hour = get("hour") === 24 ? 0 : get("hour");
    return Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      hour,
      get("minute"),
      get("second"),
      new Date(utcMs).getUTCMilliseconds()
    );
  }, naiveToUtc = (naiveUtcMs, timeZone) => {
    let guess = naiveUtcMs - (wallClockAsUtc(naiveUtcMs, timeZone) - naiveUtcMs);
    return guess = naiveUtcMs - (wallClockAsUtc(guess, timeZone) - guess), guess;
  }, MONTHS = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12
  }, toNaive = (value) => {
    let text2 = value.trim(), flexMatch = text2.match(/^(\d{4})(\d{2})(\d{2})[;,](\d{2})(\d{2})(\d{2})$/);
    if (flexMatch)
      return {
        year: Number(flexMatch[1]),
        month: Number(flexMatch[2]),
        day: Number(flexMatch[3]),
        hour: Number(flexMatch[4]),
        minute: Number(flexMatch[5]),
        second: Number(flexMatch[6]),
        millisecond: 0
      };
    let match = text2.match(
      /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ,]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/
    );
    if (match)
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4] ?? 0),
        minute: Number(match[5] ?? 0),
        second: Number(match[6] ?? 0),
        millisecond: Number((match[7] ?? "").padEnd(3, "0"))
      };
    if (match = text2.match(
      /^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})(?:[, ]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(AM|PM|am|pm)?)?$/
    ), match) {
      let hour = Number(match[4] ?? 0), meridiem = match[8]?.toUpperCase();
      return meridiem && (hour < 1 || hour > 12) ? null : (meridiem === "PM" && hour < 12 && (hour += 12), meridiem === "AM" && hour === 12 && (hour = 0), {
        year: Number(match[3].length === 2 ? `20${match[3]}` : match[3]),
        month: Number(match[1]),
        day: Number(match[2]),
        hour,
        minute: Number(match[5] ?? 0),
        second: Number(match[6] ?? 0),
        millisecond: Number((match[7] ?? "").padEnd(3, "0"))
      });
    }
    if (match = text2.match(
      /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})(?:[, ]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(AM|PM|am|pm)?)?$/
    ), match) {
      let month = MONTHS[match[1].slice(0, 3).toLowerCase()];
      if (!month) return null;
      let hour = Number(match[4] ?? 0), meridiem = match[8]?.toUpperCase();
      return meridiem && (hour < 1 || hour > 12) ? null : (meridiem === "PM" && hour < 12 && (hour += 12), meridiem === "AM" && hour === 12 && (hour = 0), {
        year: Number(match[3]),
        month,
        day: Number(match[2]),
        hour,
        minute: Number(match[5] ?? 0),
        second: Number(match[6] ?? 0),
        millisecond: Number((match[7] ?? "").padEnd(3, "0"))
      });
    }
    return null;
  }, parseTimestamp = (value, timeZone = "UTC") => {
    if (!value) return null;
    let text2 = value.trim().replace(/\s+(E[SD]T|C[SD]T|M[SD]T|P[SD]T|UTC|GMT)$/i, "");
    if (text2 === "") return null;
    if (/(Z|[+-]\d{2}:?\d{2})$/.test(text2)) {
      let ms = Date.parse(text2);
      return Number.isNaN(ms) ? null : new Date(ms).toISOString();
    }
    let naive = toNaive(text2);
    if (!naive) return null;
    let naiveUtcMs = Date.UTC(
      naive.year,
      naive.month - 1,
      naive.day,
      naive.hour,
      naive.minute,
      naive.second,
      naive.millisecond
    );
    if (Number.isNaN(naiveUtcMs)) return null;
    let normalized = new Date(naiveUtcMs);
    if (normalized.getUTCFullYear() !== naive.year || normalized.getUTCMonth() !== naive.month - 1 || normalized.getUTCDate() !== naive.day || normalized.getUTCHours() !== naive.hour || normalized.getUTCMinutes() !== naive.minute || normalized.getUTCSeconds() !== naive.second)
      return null;
    let utcMs = timeZone === "UTC" ? naiveUtcMs : naiveToUtc(naiveUtcMs, timeZone);
    return new Date(utcMs).toISOString();
  }, parseDateAndTime = (date, time, timeZone = "UTC") => parseTimestamp([date, time].filter(Boolean).join(" "), timeZone);

  // vendor/luxalgo-trade-journal/importers/src/numbers.ts
  var parseMoney = (value) => {
    if (value === void 0) return NaN;
    let text2 = value.trim();
    if (text2 === "") return NaN;
    let combined = text2.match(/^(-?[\d.,]+)\/(-?[\d.,]+)$/);
    combined && (text2 = combined[2]);
    let negative = /^\(.*\)$/.test(text2) || text2.startsWith("-");
    text2 = text2.replace(/[()$€£\s]/g, "").replace(/^-/, ""), /,\d{1,2}$/.test(text2) && !/\.\d+$/.test(text2) ? text2 = text2.replace(/\./g, "").replace(",", ".") : text2 = text2.replace(/,/g, "");
    let parsed = Number(text2);
    return Number.isNaN(parsed) ? NaN : negative ? -parsed : parsed;
  }, parseQuantity = (value) => {
    if (value === void 0) return NaN;
    let text2 = value.trim(), combined = text2.match(/^(-?[\d.,]+)\/(-?[\d.,]+)$/);
    combined && (text2 = combined[1]);
    let parsed = parseMoney(text2);
    return Number.isNaN(parsed) ? NaN : Math.abs(parsed);
  };

  // vendor/luxalgo-trade-journal/importers/src/formats/ibkr.ts
  var ASSET_MAP = {
    stocks: "equity",
    equityandindexoptions: "option",
    futures: "futures",
    forex: "forex",
    cryptocurrency: "crypto",
    cfds: "cfd"
  }, ibkr = {
    id: "ibkr",
    label: "Interactive Brokers (activity statement)",
    detect: (_headers, content) => /^Trades,Header/m.test(content) || /"?Trades"?,"?Header"?/.test(content),
    parse: (content, options) => {
      let rows = parseCsv(content, ","), headerRow = rows.find((row) => row[0] === "Trades" && row[1] === "Header");
      if (!headerRow)
        return {
          format: "ibkr",
          executions: [],
          skippedRows: 0,
          warnings: ["No Trades section found."]
        };
      let keys = headerRow.map(headerKey), col = (name) => keys.indexOf(name), executions = [], skippedRows = 0;
      for (let row of rows) {
        if (row[0] !== "Trades" || row[1] !== "Data") continue;
        let discriminator = row[col("datadiscriminator")] ?? "";
        if (!/^order$/i.test(discriminator)) {
          skippedRows++;
          continue;
        }
        let symbol = (row[col("symbol")] ?? "").trim().toUpperCase(), quantitySigned = parseMoney(row[col("quantity")]), price = parseMoney(row[col("tprice")] ?? row[col("price")]), executedAt = parseTimestamp(row[col("datetime")], options.timeZone), legacyDate = row[col("datetime")]?.match(/^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}),/), legacyExecutedAt = legacyDate ? parseTimestamp(legacyDate[1], options.timeZone) : null, fee = Math.abs(parseMoney(row[col("commfee")] ?? row[col("commission")]) || 0), assetClass = ASSET_MAP[headerKey(row[col("assetcategory")] ?? "")];
        if (!symbol || !executedAt || !Number.isFinite(quantitySigned) || quantitySigned === 0 || !Number.isFinite(price)) {
          skippedRows++;
          continue;
        }
        executions.push({
          symbol,
          side: quantitySigned > 0 ? "buy" : "sell",
          quantity: parseQuantity(String(Math.abs(quantitySigned))),
          price,
          fee: Number.isFinite(fee) ? fee : 0,
          executedAt,
          ...legacyExecutedAt && legacyExecutedAt !== executedAt ? { legacyExecutedAt } : {},
          assetClass
        });
      }
      return { format: "ibkr", executions, skippedRows, warnings: [] };
    }
  };

  // vendor/luxalgo-trade-journal/importers/src/formats/metatrader.ts
  var stripTags = (html) => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim(), rowCells = (rowHtml) => [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => stripTags(m[1])), metatrader = {
    id: "metatrader",
    label: "MetaTrader 4/5 (HTML statement)",
    detect: (_headers, content) => /<html/i.test(content) && /(MetaTrader|MetaQuotes|Closed Transactions|Strategy Tester)/i.test(content),
    parse: (content, options) => {
      let rows = [...content.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => rowCells(m[1])), executions = [], skippedRows = 0;
      for (let cells of rows) {
        if (cells.length < 10) continue;
        let type = (cells[2] ?? "").toLowerCase();
        if (type !== "buy" && type !== "sell") continue;
        let openedAt = parseTimestamp(cells[1], options.timeZone), quantity = parseQuantity(cells[3]), symbol = (cells[4] ?? "").trim().toUpperCase(), entryPrice = parseMoney(cells[5]), closeIndex = -1;
        for (let i = 6; i < cells.length; i++)
          if (parseTimestamp(cells[i], options.timeZone)) {
            closeIndex = i;
            break;
          }
        if (!openedAt || closeIndex === -1 || !symbol || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(entryPrice)) {
          skippedRows++;
          continue;
        }
        let closedAt = parseTimestamp(cells[closeIndex], options.timeZone), exitPrice = parseMoney(cells[closeIndex + 1]);
        if (!Number.isFinite(exitPrice)) {
          skippedRows++;
          continue;
        }
        let commission = Math.abs(parseMoney(cells[closeIndex + 2]) || 0), swap = Math.abs(parseMoney(cells[closeIndex + 4] ?? cells[closeIndex + 3]) || 0), trade = {
          symbol,
          direction: type === "buy" ? "long" : "short",
          quantity,
          entryPrice,
          exitPrice,
          openedAt,
          closedAt,
          fees: (Number.isFinite(commission) ? commission : 0) + (Number.isFinite(swap) ? swap : 0),
          assetClass: "forex"
        };
        executions.push(...tradeToExecutions(trade));
      }
      return {
        format: "metatrader",
        executions,
        skippedRows,
        warnings: executions.length > 0 ? [
          "MetaTrader statements are trade-level; entry/exit executions were reconstructed at the reported prices. Swap was folded into fees."
        ] : []
      };
    }
  };

  // vendor/luxalgo-trade-journal/importers/src/formats/fills.ts
  var parseSide = (value) => {
    if (!value) return null;
    let text2 = value.trim().toLowerCase();
    return /^(buy|bot|bought|long|b|bid|btc|buytoopen|buytoclose|buy to open|buy to close)$/.test(text2) || /^buy/.test(text2) ? "buy" : /^(sell|sld|sold|short|s|ask|stc|selltoopen|selltoclose|sell to open|sell to close)$/.test(
      text2
    ) || /^sell/.test(text2) ? "sell" : null;
  }, rowsToFills = (records, columns2, options, spec = {}) => {
    let executions = [], skippedRows = 0;
    for (let row of records) {
      if (spec.rowFilter && !spec.rowFilter(row)) {
        skippedRows++;
        continue;
      }
      let symbolRaw = pick(row, columns2.symbol), side = parseSide(pick(row, columns2.side)), quantity = parseQuantity(pick(row, columns2.quantity)), price = parseMoney(pick(row, columns2.price)), executedAt = columns2.timestamp ? parseTimestamp(pick(row, columns2.timestamp), options.timeZone) : null;
      if (!executedAt && (columns2.date || columns2.time) && (executedAt = parseDateAndTime(
        pick(row, columns2.date ?? []),
        pick(row, columns2.time ?? []),
        options.timeZone
      )), !symbolRaw || !side || !executedAt || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price)) {
        skippedRows++;
        continue;
      }
      let fee = (columns2.fees ?? []).map((aliases) => Math.abs(parseMoney(pick(row, aliases)))).filter((value) => Number.isFinite(value)).reduce((total, value) => total + value, 0), symbol = (spec.normalizeSymbol ?? ((s) => s.trim().toUpperCase()))(symbolRaw);
      executions.push({ symbol, side, quantity, price, fee, executedAt });
    }
    return { executions, skippedRows };
  }, makeFillsFormat = (spec) => ({
    id: spec.id,
    label: spec.label,
    detect: (headers) => hasHeaders(headers, spec.required),
    parse: (content, options) => {
      let records = toRecords(parseCsv(content)), { executions, skippedRows } = rowsToFills(records, spec.columns, options, spec);
      return { format: spec.id, executions, skippedRows, warnings: [] };
    }
  });

  // vendor/luxalgo-trade-journal/importers/src/formats/ninjatrader.ts
  var columns = {
    symbol: ["instrument"],
    side: ["action"],
    quantity: ["quantity", "qty"],
    price: ["price"],
    fees: [["commission"]],
    timestamp: ["time"]
  }, ninjatrader = {
    id: "ninjatrader",
    label: "NinjaTrader (executions export)",
    detect: (headers) => hasHeaders(headers, [["instrument"], ["action"], ["price"]]),
    parse: (content, options) => {
      let executions = [], occurrences = /* @__PURE__ */ new Map(), identities = /* @__PURE__ */ new Map(), sourceAccounts = /* @__PURE__ */ new Set(), futures = /* @__PURE__ */ new Set(), errors = /* @__PURE__ */ new Set(), skippedRows = 0, withoutId = !1, withoutAccount = !1;
      for (let row of toRecords(parseCsv(content))) {
        let commission = pick(row, ["commission"]);
        if (commission !== void 0 && (!/^(?:[+-]?[\d.,]+|\([\d.,]+\))$/.test(commission.replace(/[$€£\s]/g, "")) || !/\d/.test(commission) || !Number.isFinite(parseMoney(commission)))) {
          errors.add(
            "An execution has an invalid commission. Correct the value or leave an unavailable commission blank; it will not be treated as zero."
          ), skippedRows++;
          continue;
        }
        let parsed = rowsToFills([row], columns, options, {
          // Preserve the existing display/multiplier symbol convention.
          normalizeSymbol: (symbol) => symbol.split(" ")[0].trim().toUpperCase()
        });
        skippedRows += parsed.skippedRows;
        let fill = parsed.executions[0];
        if (!fill) continue;
        let instrument = row.instrument.trim().replace(/\s+/g, " ").toUpperCase(), account = pick(row, ["account", "accountname", "accountdisplayname"]) ?? "", connection = pick(row, ["connection", "connectionname"]) ?? "", executionId = pick(row, ["executionid", "id"]), effectText = pick(row, ["ex", "entryexit"])?.toLowerCase(), effect = effectText === "entry" ? "entry" : effectText === "exit" ? "exit" : ["reverse", "entry/exit", "exit/entry"].includes(effectText ?? "") ? "reverse" : void 0;
        effectText && !effect && errors.add(
          "Unrecognized NinjaTrader entry/exit value. Export Entry, Exit or Reverse values."
        );
        let sequenceText = pick(row, ["sequence", "executionsequence"]), sequence = sequenceText === void 0 ? void 0 : Number(sequenceText);
        sequence !== void 0 && (!Number.isSafeInteger(sequence) || sequence < 0) && errors.add("Execution sequence must be a non-negative integer."), account ? sourceAccounts.add(account) : withoutAccount = !0;
        let group = `ninjatrader:${JSON.stringify([connection, account, instrument])}`, signature = JSON.stringify([
          fill.symbol,
          fill.side,
          fill.quantity,
          fill.price,
          fill.executedAt
        ]), occurrenceKey = JSON.stringify([group, signature]), occurrence = occurrences.get(occurrenceKey) ?? 0;
        occurrences.set(occurrenceKey, occurrence + 1);
        let id = executionId ? `execution:${executionId}` : `fill:${signature}:${occurrence}`;
        if (withoutId || (withoutId = !executionId), executionId) {
          let key = JSON.stringify([group, id]), previous = identities.get(key);
          previous && previous !== signature && errors.add(
            "One NinjaTrader execution ID describes different fills. Export a consistent execution history before importing."
          ), identities.set(key, signature);
        }
        (/ \d{2}-\d{2,4}$/.test(instrument) || /^[A-Z][A-Z0-9]*[FGHJKMNQUVXZ]\d{1,4}$/.test(instrument)) && (fill.assetClass = "futures", futures.add(fill.symbol)), fill.importMetadata = {
          id,
          group,
          order: executions.length,
          preserveFee: pick(row, ["commission"]) !== void 0
        }, fill.ninjaTrader = {
          sourceKey: JSON.stringify([connection, account]),
          account,
          connection,
          instrument,
          executionId,
          effect,
          sequence,
          reportedFee: pick(row, ["commission"]) === void 0 ? void 0 : fill.fee
        }, executions.push(fill);
      }
      let warnings = [];
      return sourceAccounts.size > 1 && warnings.push(
        `${sourceAccounts.size} source accounts found. Their positions stay separate within the selected journal account.`
      ), withoutAccount && warnings.push(
        "Some rows have no source account. Import only one source account into this journal account, and keep the account and connection columns consistent on re-export."
      ), withoutId && warnings.push(
        "No execution ID is available for some fills. Repeated rows are preserved and the same or reordered export imports once. Overlapping exports that split identical fills cannot be reliably reconciled; use complete exports covering those fills, or include execution IDs consistently."
      ), futures.size && warnings.push(
        `Futures P&L requires the correct contract multiplier in Settings for each imported symbol: ${[...futures].join(", ")}.`
      ), { format: "ninjatrader", executions, skippedRows, warnings, errors: [...errors] };
    }
  };

  // vendor/luxalgo-trade-journal/importers/src/formats/simple.ts
  var tradervue = makeFillsFormat({
    id: "tradervue",
    label: "Tradervue (executions export)",
    required: [["date"], ["time"], ["symbol"], ["quantity"], ["price"], ["side"]],
    columns: {
      symbol: ["symbol"],
      side: ["side"],
      quantity: ["quantity"],
      price: ["price"],
      fees: [["commission"], ["transfee"], ["ecnfee"], ["secfee"]],
      date: ["date"],
      time: ["time"]
    }
  }), tradingview = makeFillsFormat({
    id: "tradingview",
    label: "TradingView (paper trading history)",
    required: [["symbol"], ["side"], ["fillprice"]],
    columns: {
      symbol: ["symbol"],
      side: ["side"],
      quantity: ["qty", "quantity", "filledqty"],
      price: ["fillprice", "avgfillprice"],
      fees: [["commission"]],
      timestamp: ["closingtime", "time", "placingtime"]
    },
    rowFilter: (row) => !("status" in row) || /filled/i.test(row.status ?? "") || row.status === "",
    // "NASDAQ:AAPL" → "AAPL"
    normalizeSymbol: (symbol) => symbol.split(":").pop().trim().toUpperCase()
  }), tradovate = makeFillsFormat({
    id: "tradovate",
    label: "Tradovate (orders export)",
    required: [["contract"], ["bs"], ["filltime", "timestamp"]],
    columns: {
      // Prefer Product (the root symbol, "ES") over Contract ("ESU6").
      symbol: ["product", "contract"],
      side: ["bs", "side"],
      quantity: ["filledqty", "fillqty", "qty"],
      price: ["avgfillprice", "avgprice", "price"],
      fees: [["commission"], ["fees"]],
      timestamp: ["filltime", "timestamp"],
      date: ["date"],
      time: ["filltime"]
    },
    rowFilter: (row) => !("status" in row) || /filled/i.test(row.status ?? ""),
    normalizeSymbol: (symbol) => symbol.trim().toUpperCase()
  }), topstepx = makeFillsFormat({
    id: "topstepx",
    label: "TopstepX (fills export)",
    required: [["contractname"], ["executeprice"], ["filledat"]],
    columns: {
      symbol: ["contractname"],
      side: ["side"],
      // "Bid" = buy, "Ask" = sell (handled by parseSide)
      quantity: ["size", "qty"],
      price: ["executeprice"],
      timestamp: ["filledat"]
    },
    rowFilter: (row) => !("status" in row) || /filled/i.test(row.status ?? "")
  }), ibkrFlex = makeFillsFormat({
    id: "ibkr-flex",
    label: "Interactive Brokers (Flex Query)",
    required: [["clientaccountid"], ["datetime"], ["buysell"]],
    columns: {
      symbol: ["symbol"],
      side: ["buysell"],
      quantity: ["quantity"],
      price: ["price", "tradeprice"],
      fees: [["commission", "ibcommission"]],
      timestamp: ["datetime"]
    }
  }), webull = makeFillsFormat({
    id: "webull",
    label: "Webull (orders export)",
    required: [["symbol"], ["side"], ["status"], ["filled", "filledtotalqty"]],
    columns: {
      symbol: ["symbol"],
      side: ["side"],
      quantity: ["filled", "filledqty", "filledtotalqty"],
      price: ["avgprice", "averagefillprice", "priceavgprice", "price"],
      fees: [["commission"], ["fee"]],
      timestamp: ["filledtime", "timefilled", "placedtime", "time"]
    },
    rowFilter: (row) => /filled/i.test(row.status ?? "")
  }), dastrader = makeFillsFormat({
    id: "das-trader",
    label: "DAS Trader Pro (executions export)",
    required: [["symb", "symbol"], ["bs", "side"], ["price"], ["time"]],
    columns: {
      symbol: ["symb", "symbol"],
      side: ["bs", "side"],
      quantity: ["qty", "shares"],
      price: ["price"],
      fees: [["commission"], ["ecnfee"], ["fee"]],
      date: ["date"],
      time: ["time"]
    }
  });

  // vendor/luxalgo-trade-journal/importers/src/formats/thinkorswim.ts
  var thinkorswim = {
    id: "thinkorswim",
    label: "ThinkorSwim / Charles Schwab (account statement)",
    detect: (_headers, content) => /Account Trade History/i.test(content),
    parse: (content, options) => {
      let lines = content.split(/\r?\n/), start = lines.findIndex((line) => /Account Trade History/i.test(line));
      if (start === -1)
        return {
          format: "thinkorswim",
          executions: [],
          skippedRows: 0,
          warnings: ["No 'Account Trade History' section found."]
        };
      let section = [], headerSeen = !1;
      for (let i = start + 1; i < lines.length; i++) {
        let line = lines[i];
        if (!headerSeen) {
          /exec time/i.test(line) && (headerSeen = !0, section.push(line));
          continue;
        }
        let firstCell = (line.split(",")[0] ?? "").trim();
        if (line.trim() === "" || /^([A-Za-z ]+History|Profits and Losses|Account Summary|Options|Futures( Statements)?|Equities|Forex)$/i.test(
          firstCell
        ))
          break;
        section.push(line);
      }
      let records = toRecords(parseCsv(section.join(`
`))), { executions, skippedRows } = rowsToFills(
        records,
        {
          symbol: ["symbol"],
          side: ["side"],
          quantity: ["qty", "quantity"],
          price: ["price"],
          timestamp: ["exectime"]
        },
        options
      ), warnings = executions.length > 0 ? [
        "ThinkorSwim statements report commissions in a separate section; fees were not attached to fills."
      ] : [];
      return { format: "thinkorswim", executions, skippedRows, warnings };
    }
  };

  // vendor/luxalgo-trade-journal/importers/src/formats/tradezella.ts
  var tradezella = {
    id: "tradezella",
    label: "TradeZella (trades export)",
    detect: (headers) => hasHeaders(headers, [
      ["opendate", "opentime", "entrydate"],
      ["closedate", "closetime", "exitdate"],
      ["symbol", "instrument"],
      ["netpnl", "netpl", "netprofit"]
    ]),
    parse: (content, options) => {
      let records = toRecords(parseCsv(content)), executions = [], skippedRows = 0, warnings = [
        "TradeZella exports are trade-level; entry/exit executions were reconstructed at the reported average prices. Net P&L is preserved exactly."
      ];
      for (let row of records) {
        let symbol = pick(row, ["symbol", "instrument"])?.trim().toUpperCase(), sideText = (pick(row, ["side", "direction", "type"]) ?? "").toLowerCase(), direction = /short|sell/.test(sideText) ? "short" : "long", quantity = parseQuantity(pick(row, ["volume", "quantity", "qty", "size"])), entryPrice = parseMoney(
          pick(row, ["entryprice", "avgentry", "averageentry", "openprice"])
        ), exitPrice = parseMoney(
          pick(row, ["exitprice", "avgexit", "averageexit", "closeprice"])
        ), openedAt = parseTimestamp(
          pick(row, ["opendate", "opentime", "entrydate"]),
          options.timeZone
        ), closedAt = parseTimestamp(
          pick(row, ["closedate", "closetime", "exitdate"]),
          options.timeZone
        ), netPnl = parseMoney(pick(row, ["netpnl", "netpl", "netprofit"])), commissions = Math.abs(parseMoney(pick(row, ["commissions", "commission"])) || 0) + Math.abs(parseMoney(pick(row, ["fees", "fee", "totalfees"])) || 0);
        if (!symbol || !openedAt || !closedAt || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(entryPrice) || !Number.isFinite(exitPrice)) {
          skippedRows++;
          continue;
        }
        let fees = Number.isFinite(commissions) ? commissions : 0;
        if (Number.isFinite(netPnl)) {
          let gross = direction === "long" ? (exitPrice - entryPrice) * quantity : (entryPrice - exitPrice) * quantity, impliedFees = gross - netPnl;
          Math.abs(impliedFees) < Math.abs(gross) * 0.5 + 100 && (fees = impliedFees);
        }
        let trade = {
          symbol,
          direction,
          quantity,
          entryPrice,
          exitPrice,
          openedAt,
          closedAt,
          fees
        };
        executions.push(...tradeToExecutions(trade));
      }
      return { format: "tradezella", executions, skippedRows, warnings };
    }
  };

  // vendor/luxalgo-trade-journal/importers/src/history/aliases.ts
  function normalizeHeader(header) {
    return header.toLowerCase().replace(/%/gu, "pct").replace(/[^a-z0-9]/gu, "");
  }
  var CURRENCY_SUFFIX = /(usd|eur|gbp|jpy|aud|cad|chf|nzd|usdt|usdc|btc|eth)$/;
  function stripCurrency(normalized) {
    return normalized.replace(CURRENCY_SUFFIX, "");
  }
  var ALIASES = [
    // R first: legacy parseTradeLog treated "result" as R, keep that meaning.
    [
      "r",
      [
        "r",
        "rmultiple",
        "rmultiples",
        "rr",
        "rrr",
        "resultr",
        "pnlr",
        "realizedr",
        "rmult",
        "riskmultiple",
        "result",
        "rvalue"
      ]
    ],
    [
      "tradeId",
      [
        "tradeid",
        "trade",
        "tradenumber",
        "tradeno",
        "positionid",
        "position",
        "ticket",
        "ticketnumber",
        "dealid",
        "deal",
        "id",
        "tradeidnumber"
      ]
    ],
    ["orderId", ["orderid", "order", "orderno", "ordernumber", "orderref", "orderreference"]],
    [
      "symbol",
      [
        "symbol",
        "symbols",
        "instrument",
        "ticker",
        "tickersymbol",
        "market",
        "pair",
        "currencypair",
        "asset",
        "security",
        "item",
        "symbolname",
        "underlying"
      ]
    ],
    [
      "direction",
      [
        "direction",
        "side",
        "buysell",
        "bs",
        "longshort",
        "positionside",
        "tradeside",
        "tradetype",
        "marketpos",
        "marketposition",
        "openingdirection"
      ]
    ],
    ["eventType", ["eventtype", "event", "entryexit", "inout", "transactiontype"]],
    [
      "quantity",
      [
        "quantity",
        "qty",
        "size",
        "sizeqty",
        "volume",
        "lots",
        "lotsize",
        "contracts",
        "shares",
        "units",
        "filledqty",
        "fillquantity",
        "filledquantity",
        "filled",
        "positionsize",
        "positionsizeqty",
        "numberofcontracts"
      ]
    ],
    [
      "entryTime",
      [
        "entrytime",
        "opentime",
        "openedat",
        "opened",
        "opendate",
        "dateopened",
        "entrydate",
        "entrydatetime",
        "opentimeutc",
        "openperiod",
        "boughttimestamp",
        "entrytimestamp",
        "opentimestamp",
        "starttime",
        "startdate"
      ]
    ],
    [
      "exitTime",
      [
        "exittime",
        "closetime",
        "closedat",
        "closed",
        "closedate",
        "dateclosed",
        "exitdate",
        "exitdatetime",
        "closetimeutc",
        "soldtimestamp",
        "exittimestamp",
        "closetimestamp",
        "endtime",
        "enddate"
      ]
    ],
    // Single time column (executions / event rows / dateless journals).
    [
      "entryTime",
      [
        "time",
        "date",
        "datetime",
        "dateandtime",
        "timestamp",
        "filltime",
        "executiontime",
        "tradetime",
        "tradedate",
        "transactiontime"
      ]
    ],
    [
      "entryPrice",
      [
        "entryprice",
        "openprice",
        "priceopen",
        "avgentryprice",
        "averageentryprice",
        "buyprice",
        "entry",
        "pricein",
        "openingprice",
        "entryavg",
        "openavg"
      ]
    ],
    [
      "exitPrice",
      [
        "exitprice",
        "closeprice",
        "priceclose",
        "avgexitprice",
        "averageexitprice",
        "sellprice",
        "exit",
        "priceout",
        "closingprice",
        "exitavg",
        "closeavg"
      ]
    ],
    // Single price column (executions / event rows).
    [
      "entryPrice",
      ["price", "fillprice", "avgprice", "avgfillprice", "executionprice", "tradedprice"]
    ],
    [
      "stopPrice",
      [
        "stoploss",
        "stop",
        "sl",
        "stopprice",
        "initialstop",
        "initialstoploss",
        "stoplossprice",
        "slprice",
        "protectivestop"
      ]
    ],
    [
      "pnl",
      [
        "pnl",
        "pl",
        "netpnl",
        "netprofit",
        "profit",
        "profitloss",
        "profitandloss",
        "realizedpnl",
        "realizedpl",
        "realized",
        "netpl",
        "netgain",
        "gain",
        "gainloss",
        "grosspnl",
        "grossprofit",
        "closedpnl",
        "tradepnl"
      ]
    ],
    [
      "fees",
      [
        "commission",
        "commissions",
        "fee",
        "fees",
        "comm",
        "commissionfees",
        "commfees",
        "totalfees",
        "brokeragefees",
        "commissionsfees"
      ]
    ],
    ["swap", ["swap", "swaps", "rollover", "financing", "overnightfee", "overnightfees"]],
    [
      "riskAmount",
      [
        "risk",
        "riskamount",
        "initialrisk",
        "riskedamount",
        "risked",
        "dollarrisk",
        "cashrisk",
        "riskvalue",
        "riskpertrade",
        "maxrisk"
      ]
    ],
    [
      "returnPct",
      ["returnpct", "return", "profitpct", "gainpct", "plpct", "changepct", "returnonequity", "roi"]
    ]
  ], KNOWN_IRRELEVANT = new Set(
    [
      "signal",
      "comment",
      "comments",
      "note",
      "notes",
      "strategy",
      "setup",
      "tags",
      "mistake",
      "rating",
      "cumpnl",
      "cumulativepnl",
      "cumulativeprofit",
      "cumprofit",
      "balance",
      "equity",
      "spread",
      "cumulativepnlpct",
      "cumprofitpct",
      "cumulativeprofitpct",
      "runup",
      "drawdown",
      "runuppct",
      "drawdownpct",
      "favorableexcursion",
      "adverseexcursion",
      "favorableexcursionpct",
      "adverseexcursionpct",
      "mae",
      "mfe",
      "duration",
      "durationbars",
      "bars",
      "holdtime",
      "magic",
      "magicnumber",
      "expert",
      "taxes",
      "tax",
      "tp",
      "takeprofit",
      "takeprofitprice",
      "tpprice",
      "target",
      "targetprice",
      "sizevalue",
      "value",
      "account",
      "accountname",
      "accountid",
      "currency",
      "exchange",
      "broker",
      "session",
      "expiry",
      "cumnetprofit",
      "etd",
      "levelofdetail",
      "assetclass",
      "conid",
      "notescodes",
      "code",
      "codes",
      "entryname",
      "exitname",
      "product",
      "productdescription",
      "priceformat",
      "priceformattype",
      "ticksize",
      "venue",
      "notionalvalue",
      "lastcommandid",
      "versionid",
      "text",
      "decimallimit",
      "decimalstop",
      "decimalfillavg",
      "spreaddefinitionid",
      "limitprice",
      "pairid",
      "netpos",
      "netprice",
      "leverage",
      "margin",
      "levelid",
      "strike",
      "callput",
      "expiration",
      // "status" is consumed by the generic adapter's cancelled-row filter, not mapped.
      "status",
      "state",
      "orderstatus"
    ].map(normalizeHeader)
  ), ENTRY_TO_EXIT = {
    entryTime: "exitTime",
    entryPrice: "exitPrice"
  }, EXACT_LOOKUP = (() => {
    let map = /* @__PURE__ */ new Map();
    for (let [field, names] of ALIASES)
      for (let name of names) map.has(name) || map.set(name, field);
    return map;
  })(), PREFIX_LOOKUP = [
    ["netpnl", "pnl"],
    ["realizedpnl", "pnl"],
    ["profit", "pnl"],
    ["pnl", "pnl"],
    ["commission", "fees"],
    ["entryprice", "entryPrice"],
    ["exitprice", "exitPrice"],
    ["openprice", "entryPrice"],
    ["closeprice", "exitPrice"],
    ["price", "entryPrice"],
    ["stoploss", "stopPrice"],
    ["dateandtime", "entryTime"],
    ["datetime", "entryTime"],
    ["return", "returnPct"]
  ];
  function matchHeader(header) {
    let normalized = normalizeHeader(header);
    if (normalized === "" || KNOWN_IRRELEVANT.has(normalized)) return null;
    let exact = EXACT_LOOKUP.get(normalized) ?? EXACT_LOOKUP.get(stripCurrency(normalized));
    if (exact !== void 0) return exact;
    let stripped = stripCurrency(normalized);
    for (let [prefix, field] of PREFIX_LOOKUP)
      if (stripped.startsWith(prefix)) return field;
    return null;
  }
  var DIRECTION_VALUE = /^(buy|sell|long|short|b|s|bot|sld|bought|sold|1|-1)$/i, EVENT_VALUE = /^(entry|exit|open|close|in|out)([\s_-].*)?$/i;
  function mapHeaders(header, sample) {
    let mapping = {}, unmapped = [], matched = [], claimedBy = /* @__PURE__ */ new Map(), columnValues = (index) => {
      let values = [];
      for (let record of sample.slice(0, 25)) {
        let v = (record.cells[index] ?? "").trim();
        v !== "" && values.push(v);
      }
      return values;
    };
    return header.forEach((raw, index) => {
      let normalized = normalizeHeader(raw), field = matchHeader(raw);
      if (normalized === "type" || normalized === "action" || field === "direction" || field === "eventType") {
        let values = columnValues(index);
        if (values.length > 0) {
          let eventish = values.filter((v) => EVENT_VALUE.test(v)).length, directionish = values.filter((v) => DIRECTION_VALUE.test(v)).length;
          eventish >= directionish && eventish > values.length / 2 ? field = "eventType" : directionish > values.length / 2 ? field = "direction" : (normalized === "type" || normalized === "action") && (field = null);
        } else (normalized === "type" || normalized === "action") && (field = null);
      }
      if (field === null) {
        !KNOWN_IRRELEVANT.has(normalized) && normalized !== "" && unmapped.push(raw);
        return;
      }
      if (mapping[field] !== void 0) {
        let exitField = ENTRY_TO_EXIT[field];
        if (exitField !== void 0 && mapping[exitField] === void 0 && claimedBy.get(field) === normalized) {
          mapping[exitField] = index, matched.push(exitField);
          return;
        }
        unmapped.push(raw);
        return;
      }
      mapping[field] = index, claimedBy.set(field, normalized), matched.push(field);
    }), { mapping, unmapped, matched };
  }
  function parseDirectionValue(raw) {
    let value = raw.trim().toLowerCase();
    return /^(long|buy|b|bot|bought|1|buytoopen|buyopen)$/.test(value.replace(/[\s_-]/g, "")) ? "long" : /^(short|sell|s|sld|sold|-1|selltoopen|sellshort|sellopen)$/.test(value.replace(/[\s_-]/g, "")) ? "short" : null;
  }

  // vendor/luxalgo-trade-journal/importers/src/history/model.ts
  var GENERIC_FORMAT_ADVICE = "Provide symbol, direction, quantity, entry time, exit time, entry price and exit price for completed trades, or timestamp, symbol, side, quantity and price for individual fills.";
  function issue(severity, code, message, where = {}) {
    return { severity, code, message, ...where };
  }
  function sortTrades(trades) {
    return trades.map((trade, index) => ({ trade, index })).sort((a, b) => {
      let at = a.trade.entryTime, bt = b.trade.entryTime;
      return at === null && bt === null ? a.index - b.index : at === null ? 1 : bt === null ? -1 : at - bt || a.index - b.index;
    }).map(({ trade }) => trade);
  }

  // vendor/luxalgo-trade-journal/importers/src/history/csv.ts
  var DEFAULT_MAX_CHARS = 2e7, DEFAULT_MAX_ROWS = 2e5, CANDIDATE_DELIMITERS = [",", ";", "	", "|"];
  function normalizeImportText(raw) {
    let text2 = raw.replace(/^[\uFEFF\uFFFE]+/, ""), probe = text2.slice(0, 4e3), nuls = 0;
    for (let i = 0; i < probe.length; i++) probe.charCodeAt(i) === 0 && nuls++;
    return /^\uFFFD{1,4}[\s\S]\u0000/.test(text2) || probe.length > 20 && nuls > probe.length / 5 ? (text2 = text2.replace(/^\uFFFD+/, "").replaceAll("\0", "").replace(/^[\uFEFF\uFFFE]+/, ""), { text: text2, repairedUtf16: !0 }) : { text: text2, repairedUtf16: !1 };
  }
  function sniffDelimiter(text2) {
    let lines = text2.split(/\r\n|\r|\n/).filter((line) => line.trim() !== "").slice(0, 10);
    if (lines.length === 0) return ",";
    let best = ",", bestScore = -1;
    for (let delimiter of CANDIDATE_DELIMITERS) {
      let counts = lines.map((line) => line.split(delimiter).length), min = Math.min(...counts), max = Math.max(...counts);
      if (max < 2) continue;
      let score = min * 1e3 - (max - min) * 10 + max;
      score > bestScore && (bestScore = score, best = delimiter);
    }
    return best;
  }
  function parseCsv2(text2, limits = {}, delimiter) {
    let issues = [], maxChars = limits.maxChars ?? DEFAULT_MAX_CHARS, maxRows = limits.maxRows ?? DEFAULT_MAX_ROWS, input = text2;
    input.charCodeAt(0) === 65279 && (input = input.slice(1)), input.includes("\0") && (issues.push(
      issue(
        "warning",
        "malformed-csv",
        "The file contains NUL bytes (it may be UTF-16 or binary); they were removed. If columns look garbled, re-export as UTF-8 CSV."
      )
    ), input = input.replaceAll("\0", ""));
    let truncated = !1;
    input.length > maxChars && (issues.push(
      issue(
        "warning",
        "input-truncated",
        `The input is larger than the ${Math.round(maxChars / 1e6)} MB limit; only the first part was read.`
      )
    ), input = input.slice(0, maxChars), truncated = !0);
    let delim = delimiter ?? sniffDelimiter(input), records = [], cells = [], cell = "", inQuotes = !1, line = 1, recordLine = 1, sawUnterminatedQuote = !1, pushCell = () => {
      cells.push(cell), cell = "";
    }, pushRecord = () => (pushCell(), (cells.length > 1 || cells[0].trim() !== "") && (records.push({ cells, line: recordLine }), records.length >= maxRows) ? !1 : (cells = [], !0)), i = 0, n = input.length;
    for (; i < n; ) {
      let ch = input[i];
      if (inQuotes) {
        if (ch === '"') {
          if (input[i + 1] === '"') {
            cell += '"', i += 2;
            continue;
          }
          inQuotes = !1, i++;
          continue;
        }
        if (ch === `
` || ch === "\r") {
          ch === "\r" && input[i + 1] === `
` && i++, cell += `
`, line++, i++;
          continue;
        }
        cell += ch, i++;
        continue;
      }
      if (ch === '"' && cell.trim() === "") {
        inQuotes = !0, cell = "", i++;
        continue;
      }
      if (ch === delim) {
        pushCell(), i++;
        continue;
      }
      if (ch === `
` || ch === "\r") {
        if (ch === "\r" && input[i + 1] === `
` && i++, !pushRecord())
          return issues.push(
            issue(
              "warning",
              "input-truncated",
              `The file has more than ${maxRows.toLocaleString("en-US")} rows; the rest were ignored.`
            )
          ), truncated = !0, cells = [], cell = "", line++, i++, { delimiter: delim, records, issues, truncated };
        line++, recordLine = line, i++;
        continue;
      }
      cell += ch, i++;
    }
    return inQuotes && (sawUnterminatedQuote = !0), (cell !== "" || cells.length > 0) && pushRecord(), sawUnterminatedQuote && issues.push(
      issue(
        "warning",
        "malformed-csv",
        `A quoted field starting around line ${recordLine} is never closed; it was read to the end of the file. Check the export for a stray quote character.`
      )
    ), { delimiter: delim, records, issues, truncated };
  }
  var FORMULA_PREFIX = /^[=@]|^[+-]{2}|^\t/;
  function sanitizeRetainedText(raw) {
    let value = raw.trim(), wasFormulaLike = !1;
    for (; FORMULA_PREFIX.test(value); )
      wasFormulaLike = !0, value = value.replace(FORMULA_PREFIX, "").trim();
    return { value, wasFormulaLike };
  }
  function parseNumericCell(raw) {
    let s = raw.trim();
    if (s === "" || s === "-" || s === "-" || s === "\u2013" || s === "\u2212") return Number.NaN;
    s = s.replace(/−/gu, "-");
    let negative = !1, paren = s.match(/^\((.*)\)$/);
    if (paren !== null && (negative = !0, s = paren[1].trim()), s = s.replace(/^[$€£¥]\s*/u, "").replace(/\s*(USD|EUR|GBP|JPY|usd|eur|gbp|jpy)$/u, ""), s = s.replace(/[%rR]$/u, "").trim(), /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) ? s = s.replaceAll(",", "") : /^[+-]?\d{1,3}(\.\d{3}){2,}(,\d+)?$/.test(s) || /^[+-]?\d{1,3}(\.\d{3})+,\d+$/.test(s) ? s = s.replaceAll(".", "").replace(",", ".") : /^[+-]?\d+,\d+$/.test(s) && (s = s.replace(",", ".")), s = s.replaceAll(/\s/gu, ""), !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return Number.NaN;
    let n = Number(s);
    return Number.isFinite(n) ? negative ? -n : n : Number.NaN;
  }

  // vendor/luxalgo-trade-journal/importers/src/history/reconstruct.ts
  function blankTrade() {
    return {
      id: null,
      symbol: null,
      direction: null,
      entryTime: null,
      exitTime: null,
      entryPrice: null,
      exitPrice: null,
      quantity: null,
      pnl: null,
      fees: null,
      stopPrice: null,
      riskAmount: null,
      r: null,
      rSource: "unavailable",
      status: "closed",
      sourceRows: []
    };
  }
  function weightedAverage(pairs) {
    if (pairs.length === 0) return null;
    if (pairs.some(([, qty]) => qty === null || qty <= 0))
      return pairs.reduce((sum2, [price]) => sum2 + price, 0) / pairs.length;
    let notional = 0, quantity = 0;
    for (let [price, qty] of pairs)
      notional += price * qty, quantity += qty;
    return quantity > 0 ? notional / quantity : null;
  }
  function sumOrNull(values) {
    let present = values.filter((v) => v !== null);
    return present.length > 0 ? present.reduce((a, b) => a + b, 0) : null;
  }
  function buildTradeFromGroup(id, entries, exits, issues) {
    let trade = blankTrade();
    trade.id = id;
    let all = [...entries, ...exits];
    trade.sourceRows = all.map((e) => e.row).sort((a, b) => a - b), trade.symbol = all.find((e) => e.symbol !== null)?.symbol ?? null, trade.direction = entries.find((e) => e.direction !== null)?.direction ?? exits.find((e) => e.direction !== null)?.direction ?? null;
    let entryTimes = entries.map((e) => e.time).filter((t) => t !== null), exitTimes = exits.map((e) => e.time).filter((t) => t !== null);
    trade.entryTime = entryTimes.length > 0 ? Math.min(...entryTimes) : null, trade.exitTime = exitTimes.length > 0 ? Math.max(...exitTimes) : null, trade.entryPrice = weightedAverage(
      entries.filter((e) => e.price !== null).map((e) => [e.price, e.quantity])
    ), trade.exitPrice = weightedAverage(
      exits.filter((e) => e.price !== null).map((e) => [e.price, e.quantity])
    ), trade.quantity = sumOrNull(entries.map((e) => e.quantity)), trade.fees = sumOrNull(all.map((e) => e.fees)), trade.stopPrice = entries.find((e) => e.stopPrice !== null)?.stopPrice ?? null;
    let explicitR = all.filter((e) => e.r !== null).map((e) => e.r);
    explicitR.length > 0 && (trade.r = explicitR[explicitR.length - 1], trade.rSource = "explicit");
    let exitPnl = sumOrNull(exits.map((e) => e.pnl)), entryPnl = sumOrNull(entries.map((e) => e.pnl));
    if (trade.pnlReported = exitPnl !== null || entryPnl !== null, exitPnl !== null) trade.pnl = exitPnl;
    else if (entryPnl !== null) trade.pnl = entryPnl;
    else if (trade.entryPrice !== null && trade.exitPrice !== null && trade.quantity !== null && trade.direction !== null) {
      let sign = trade.direction === "long" ? 1 : -1;
      trade.pnl = (trade.exitPrice - trade.entryPrice) * sign * trade.quantity - Math.abs(trade.fees ?? 0), issues.push(
        issue(
          "info",
          "pnl-derived-from-prices",
          `Trade ${id ?? `at line ${trade.sourceRows[0] ?? "?"}`}: P&L was computed from entry/exit prices \xD7 quantity (assumes 1 currency unit per point per unit of quantity - correct for stocks/spot, NOT for futures or CFDs with a contract multiplier).`,
          trade.sourceRows[0] !== void 0 ? { row: trade.sourceRows[0] } : {}
        )
      );
    }
    trade.entryTime !== null && trade.exitTime !== null && trade.exitTime < trade.entryTime && issues.push(
      issue(
        "warning",
        "exit-before-entry",
        `Trade ${id ?? `at line ${trade.sourceRows[0] ?? "?"}`}: the exit timestamp precedes the entry timestamp. Check the file's row pairing or date format.`,
        trade.sourceRows[0] !== void 0 ? { row: trade.sourceRows[0] } : {}
      )
    );
    let exitedQuantity = sumOrNull(exits.map((e) => e.quantity));
    return trade.quantity !== null && exitedQuantity !== null && exitedQuantity > trade.quantity + 1e-9 && issues.push(
      issue(
        "error",
        "ambiguous-mapping",
        `Trade ${id ?? ""}: exit quantity exceeds entry quantity.`,
        { row: trade.sourceRows[0] }
      )
    ), (exits.length === 0 || trade.quantity !== null && exitedQuantity !== null && exitedQuantity < trade.quantity - 1e-9) && (trade.status = "open"), trade;
  }
  function pairEvents(events, issues) {
    let closed = [], open = [];
    if (events.length === 0) return { closed, open };
    if (events.filter((e) => e.id !== null && e.id !== "").length >= events.length * 0.9) {
      let complete = (group) => {
        if (group.entries.length === 0 || group.exits.length === 0) return !1;
        let entered = sumOrNull(group.entries.map((e) => e.quantity)), exited = sumOrNull(group.exits.map((e) => e.quantity));
        return entered === null || exited === null ? !0 : Math.abs(entered - exited) <= 1e-9;
      }, current = /* @__PURE__ */ new Map(), groups = [], reused = /* @__PURE__ */ new Map();
      for (let event of events) {
        let key = event.id ?? `__row_${event.row}`, group = current.get(key);
        group !== void 0 && complete(group) && (reused.set(key, (reused.get(key) ?? 1) + 1), group = void 0), group === void 0 && (group = { id: key, entries: [], exits: [] }, current.set(key, group), groups.push(group)), (event.kind === "entry" ? group.entries : group.exits).push(event);
      }
      if (reused.size > 0) {
        let sample = [...reused.keys()].slice(0, 5).join(", ");
        issues.push(
          issue(
            "warning",
            "trade-id-reused",
            `${reused.size} trade id(s) (${sample}${reused.size > 5 ? ", ..." : ""}) appear again after the trade with that id was already closed. Each occurrence was imported as a separate trade; the file may combine several exports whose numbering restarts.`
          )
        );
      }
      for (let group of groups) {
        let key = group.id, symbols = new Set(
          [...group.entries, ...group.exits].map((e) => e.symbol).filter((s) => s !== null)
        );
        if (symbols.size > 1) {
          issues.push(
            issue(
              "error",
              "ambiguous-mapping",
              `Trade id "${key}" spans multiple symbols (${[...symbols].join(", ")}); its rows were skipped. The id column mapping is probably wrong.`
            )
          );
          continue;
        }
        if (group.entries.length === 0) {
          issues.push(
            issue(
              "warning",
              "unmatched-exit",
              `Trade id "${key}" has exit rows but no entry row; skipped. The entry may predate the export window.`,
              group.exits[0] !== void 0 ? { row: group.exits[0].row } : {}
            )
          );
          continue;
        }
        let trade = buildTradeFromGroup(key, group.entries, group.exits, issues);
        (trade.status === "open" ? open : closed).push(trade);
      }
      return { closed, open };
    }
    issues.push(
      issue(
        "warning",
        "row-recovered",
        "The file has entry/exit rows but no trade id column, so entries and exits were matched first-in-first-out within each symbol and direction. Verify a few reconstructed trades before trusting the result."
      )
    );
    let sorted = [...events].sort((a, b) => (a.time ?? 0) - (b.time ?? 0) || a.row - b.row), queues = /* @__PURE__ */ new Map(), keyOf = (e) => `${e.symbol ?? ""}|${e.direction ?? ""}`;
    for (let event of sorted) {
      if (event.kind === "entry") {
        let key = keyOf(event), queue2 = queues.get(key) ?? [];
        queue2.push({ ...event }), queues.set(key, queue2);
        continue;
      }
      let queue = queues.get(keyOf(event));
      if (!queue?.length) {
        issues.push(
          issue(
            "warning",
            "unmatched-exit",
            `Line ${event.row}: exit with no prior matching entry; skipped.`,
            { row: event.row }
          )
        );
        continue;
      }
      let remaining = event.quantity;
      do {
        let entry = queue.shift();
        if (!entry) {
          issues.push(
            issue(
              "error",
              "unmatched-exit",
              `Line ${event.row}: exit quantity exceeds the entries in this file.`,
              { row: event.row }
            )
          );
          break;
        }
        let take = remaining !== null && entry.quantity !== null ? Math.min(remaining, entry.quantity) : entry.quantity, entryShare = take !== null && entry.quantity !== null && entry.quantity > 0 ? take / entry.quantity : 1, exitShare = take !== null && event.quantity !== null && event.quantity > 0 ? take / event.quantity : 1, allocated = {
          ...entry,
          quantity: take,
          fees: entry.fees === null ? null : entry.fees * entryShare
        }, exit = {
          ...event,
          quantity: take,
          pnl: event.pnl === null ? null : event.pnl * exitShare,
          fees: event.fees === null ? null : event.fees * exitShare
        };
        entryShare < 1 && take !== null && entry.quantity !== null && queue.unshift({
          ...entry,
          quantity: entry.quantity - take,
          fees: entry.fees === null ? null : entry.fees * (1 - entryShare)
        }), closed.push(buildTradeFromGroup(null, [allocated], [exit], issues)), remaining = remaining !== null && take !== null ? remaining - take : 0;
      } while (remaining > 1e-9);
    }
    for (let queue of queues.values())
      for (let entry of queue) {
        let trade = buildTradeFromGroup(null, [entry], [], issues);
        open.push(trade);
      }
    return { closed, open };
  }

  // vendor/luxalgo-trade-journal/importers/src/history/timestamps.ts
  var SLASH_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/, TZ_ABBREVIATION = /\s+(E[SD]T|C[SD]T|M[SD]T|P[SD]T|UTC|GMT)$/i;
  function detectSlashDateOrder(samples) {
    let sawSlash = !1;
    for (let raw of samples) {
      let match = raw.trim().replace(TZ_ABBREVIATION, "").match(SLASH_DATE);
      if (!match) continue;
      sawSlash = !0;
      let first = Number(match[1]), second = Number(match[2]);
      if (first > 12 && second <= 12) return { order: "DMY", proven: !0 };
      if (second > 12 && first <= 12) return { order: "MDY", proven: !0 };
    }
    return sawSlash ? { order: "MDY", proven: !1 } : { order: null, proven: !1 };
  }
  function parseImportTimestamp(raw, slashOrder = "MDY", timeZone = "UTC") {
    let value = raw.trim().replace(/^"|"$/g, "").trim().replace(TZ_ABBREVIATION, "");
    if (/^\d{10}(\.\d+)?$/.test(value)) return Math.trunc(Number(value) * 1e3);
    if (/^\d{13}$/.test(value)) return Number(value);
    let parts, offset, iso = value.match(
      /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/i
    ), slash = value.match(SLASH_DATE), compact = value.match(/^(\d{4})(\d{2})(\d{2});(\d{2})(\d{2})(\d{2})$/);
    if (iso)
      parts = [
        Number(iso[1]),
        Number(iso[2]),
        Number(iso[3]),
        Number(iso[4] ?? 0),
        Number(iso[5] ?? 0),
        Number(iso[6] ?? 0),
        Number((iso[7] ?? "").padEnd(3, "0").slice(0, 3))
      ], offset = iso[8];
    else if (slash) {
      let first = Number(slash[1]), second2 = Number(slash[2]), dmy = slashOrder === "DMY", year2 = Number(slash[3]);
      slash[3].length === 2 && (year2 += 2e3);
      let hour2 = Number(slash[4] ?? 0);
      if (slash[7]) {
        if (hour2 < 1 || hour2 > 12) return NaN;
        hour2 = hour2 % 12 + (slash[7].toLowerCase() === "pm" ? 12 : 0);
      }
      parts = [
        year2,
        dmy ? second2 : first,
        dmy ? first : second2,
        hour2,
        Number(slash[5] ?? 0),
        Number(slash[6] ?? 0),
        0
      ];
    } else if (compact)
      parts = compact.slice(1).map(Number).concat(0);
    else {
      let fallback = parseTimestamp(value, timeZone);
      return fallback ? Date.parse(fallback) : NaN;
    }
    let [year, month, day, hour, minute, second, millisecond] = parts, utc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond), check = new Date(utc);
    if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59)
      return NaN;
    if (offset) {
      if (offset.toUpperCase() === "Z") return utc;
      let digits = offset.slice(1).replace(":", ""), hours = Number(digits.slice(0, 2)), minutes = Number(digits.slice(2));
      return hours > 23 || minutes > 59 ? NaN : utc - (offset[0] === "-" ? -1 : 1) * (hours * 60 + minutes) * 6e4;
    }
    let converted = parseTimestamp(check.toISOString().slice(0, 19), timeZone);
    return converted ? Date.parse(converted) + millisecond : NaN;
  }

  // vendor/luxalgo-trade-journal/importers/src/history/adapters/generic.ts
  var ENTRY_EVENT = /^(entry|open|in|buytoopen|selltoopen)/i, EXIT_EVENT = /^(exit|close|out|buytoclose|selltoclose)/i;
  function directionFromEvent(eventRaw, isExit) {
    if (/long/i.test(eventRaw)) return "long";
    if (/short/i.test(eventRaw)) return "short";
    let buys = /buy|bought|bot\b/i.test(eventRaw), sells = /sell|sold|sld\b/i.test(eventRaw);
    return buys === sells ? null : buys !== isExit ? "long" : "short";
  }
  function text(record, mapping, field) {
    let index = mapping[field];
    return index === void 0 ? "" : (record.cells[index] ?? "").trim();
  }
  function num(record, mapping, field) {
    let raw = text(record, mapping, field);
    return raw === "" ? Number.NaN : parseNumericCell(raw);
  }
  function nOrNull(value) {
    return Number.isFinite(value) ? value : null;
  }
  function decideShape(mapping, records) {
    if (mapping.eventType !== void 0) return "event-rows";
    let hasExitInfo = mapping.exitTime !== void 0 || mapping.exitPrice !== void 0, hasOutcome = mapping.pnl !== void 0 || mapping.r !== void 0;
    if (hasExitInfo || hasOutcome) return "trade-per-row";
    if (mapping.entryPrice !== void 0 && mapping.quantity !== void 0 && records.length > 0) {
      if (mapping.direction !== void 0) return "executions";
      let qtyIndex = mapping.quantity;
      if (records.slice(0, 50).some((r) => parseNumericCell(r.cells[qtyIndex] ?? "") < 0)) return "executions";
    }
    return "trade-per-row";
  }
  var NON_FILLED_STATUS = /^(cancel(l)?ed|rejected|expired|working|pending|inactive)$/i;
  function filterByStatus(table, issues) {
    let statusIndex = table.header.findIndex(
      (h) => ["status", "state", "orderstatus"].includes(normalizeHeader(h))
    );
    if (statusIndex === -1) return { records: [...table.records], skipped: 0 };
    let records = [], skipped = 0;
    for (let record of table.records) {
      let status = (record.cells[statusIndex] ?? "").trim();
      if (NON_FILLED_STATUS.test(status)) {
        skipped++;
        continue;
      }
      records.push(record);
    }
    return skipped > 0 && issues.push(
      issue(
        "info",
        "cancelled-row-ignored",
        `${skipped} row(s) with a non-filled status (cancelled/rejected/working/...) were ignored.`
      )
    ), { records, skipped };
  }
  function resolveDateOrder(records, mapping, explicit, issues) {
    if (explicit !== void 0) return explicit;
    let samples = [];
    for (let record of records.slice(0, 500))
      for (let field of ["entryTime", "exitTime"]) {
        let index = mapping[field];
        if (index !== void 0) {
          let raw = (record.cells[index] ?? "").trim();
          raw !== "" && samples.push(raw);
        }
      }
    let { order, proven } = detectSlashDateOrder(samples);
    return order !== null && !proven && issues.push(
      issue(
        "warning",
        "date-order-assumed-mdy",
        'Dates like "03/04/2025" are ambiguous between month-first and day-first, and no value in the file settles it. Month-first (US) was assumed - pass dateOrder: "DMY" if the file is day-first.'
      )
    ), order ?? "MDY";
  }
  function parseTradePerRow(records, mapping, dateOrder, timeZone, issues) {
    let closed = [], open = [], skippedRows = 0, pricePnlNoted = !1;
    for (let record of records) {
      if (record.cells.every((c) => c.trim() === "")) continue;
      let rRaw = text(record, mapping, "r"), r = rRaw === "" ? Number.NaN : parseNumericCell(rRaw), pnl = num(record, mapping, "pnl"), entryTime = parseImportTimestamp(text(record, mapping, "entryTime"), dateOrder, timeZone), exitTimeRaw = text(record, mapping, "exitTime"), exitTime = parseImportTimestamp(exitTimeRaw, dateOrder, timeZone), entryPrice = num(record, mapping, "entryPrice"), exitPrice = num(record, mapping, "exitPrice"), quantity = num(record, mapping, "quantity"), fees = num(record, mapping, "fees"), swap = num(record, mapping, "swap"), riskAmount = num(record, mapping, "riskAmount"), stopPrice = num(record, mapping, "stopPrice"), direction = parseDirectionValue(text(record, mapping, "direction")), idClean = sanitizeRetainedText(text(record, mapping, "tradeId")), symbolClean = sanitizeRetainedText(text(record, mapping, "symbol"));
      (idClean.wasFormulaLike || symbolClean.wasFormulaLike) && issues.push(
        issue(
          "warning",
          "formula-like-cell",
          `Line ${record.line}: a text cell starts with a spreadsheet formula character; it was neutralized.`,
          { row: record.line }
        )
      );
      let feesTotal = Number.isFinite(fees) || Number.isFinite(swap) ? (Number.isFinite(fees) ? Math.abs(fees) : 0) - (Number.isFinite(swap) ? swap : 0) : Number.NaN, tradePnl = nOrNull(pnl), hasPrices = Number.isFinite(entryPrice) && Number.isFinite(exitPrice) && Number.isFinite(quantity) && direction !== null;
      if (tradePnl === null && hasPrices) {
        let sign = direction === "long" ? 1 : -1;
        tradePnl = (exitPrice - entryPrice) * sign * quantity - Math.abs(Number.isFinite(feesTotal) ? feesTotal : 0), pricePnlNoted || (pricePnlNoted = !0, issues.push(
          issue(
            "info",
            "pnl-derived-from-prices",
            "This file has no P&L column; P&L was computed from entry/exit prices \xD7 quantity (assumes 1 currency unit per point per unit of quantity - correct for stocks/spot, NOT for futures or CFDs with a contract multiplier)."
          )
        ));
      }
      let hasOutcome = Number.isFinite(r) || tradePnl !== null, isOpenRow = !hasOutcome && Number.isFinite(entryTime) && (mapping.exitTime !== void 0 ? exitTimeRaw === "" || /^open$/i.test(exitTimeRaw) : !1);
      if (!hasOutcome && !isOpenRow) {
        skippedRows++, issues.push(
          issue(
            "warning",
            "row-skipped",
            `Line ${record.line}: no usable outcome (no R, no P&L, and entry/exit prices incomplete); skipped.`,
            { row: record.line }
          )
        );
        continue;
      }
      let trade = {
        id: idClean.value === "" ? null : idClean.value,
        symbol: symbolClean.value === "" ? null : symbolClean.value,
        direction,
        entryTime: Number.isFinite(entryTime) ? entryTime : null,
        exitTime: Number.isFinite(exitTime) ? exitTime : null,
        entryPrice: nOrNull(entryPrice),
        exitPrice: nOrNull(exitPrice),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
        pnl: tradePnl,
        pnlReported: Number.isFinite(pnl),
        fees: nOrNull(feesTotal),
        stopPrice: nOrNull(stopPrice),
        riskAmount: Number.isFinite(riskAmount) && riskAmount > 0 ? riskAmount : null,
        r: nOrNull(r),
        rSource: Number.isFinite(r) ? "explicit" : "unavailable",
        status: isOpenRow ? "open" : "closed",
        sourceRows: [record.line]
      };
      (trade.status === "open" ? open : closed).push(trade);
    }
    return { closed, open, skippedRows };
  }
  function parseEventRows(records, mapping, dateOrder, timeZone, issues) {
    let events = [], skippedRows = 0;
    for (let record of records) {
      if (record.cells.every((c) => c.trim() === "")) continue;
      let eventRaw = text(record, mapping, "eventType"), isEntry = ENTRY_EVENT.test(eventRaw), isExit = !isEntry && EXIT_EVENT.test(eventRaw);
      if (!isEntry && !isExit) {
        skippedRows++, issues.push(
          issue(
            "warning",
            "row-skipped",
            `Line ${record.line}: event "${eventRaw || "(empty)"}" is neither an entry nor an exit; skipped.`,
            { row: record.line }
          )
        );
        continue;
      }
      let direction = parseDirectionValue(text(record, mapping, "direction")) ?? directionFromEvent(eventRaw, isExit), time = parseImportTimestamp(text(record, mapping, "entryTime"), dateOrder, timeZone), idClean = sanitizeRetainedText(text(record, mapping, "tradeId")), symbolClean = sanitizeRetainedText(text(record, mapping, "symbol"));
      events.push({
        row: record.line,
        kind: isEntry ? "entry" : "exit",
        id: idClean.value === "" ? null : idClean.value,
        symbol: symbolClean.value === "" ? null : symbolClean.value,
        direction,
        time: Number.isFinite(time) ? time : null,
        price: nOrNull(num(record, mapping, "entryPrice")),
        quantity: nOrNull(num(record, mapping, "quantity")),
        pnl: nOrNull(num(record, mapping, "pnl")),
        fees: nOrNull(Math.abs(num(record, mapping, "fees"))),
        stopPrice: nOrNull(num(record, mapping, "stopPrice")),
        r: nOrNull(num(record, mapping, "r"))
      });
    }
    let { closed, open } = pairEvents(events, issues);
    return { closed, open, skippedRows };
  }
  function parseExecutions(records, mapping, dateOrder, timeZone, issues) {
    let fills = [], skippedRows = 0;
    for (let record of records) {
      if (record.cells.every((c) => c.trim() === "")) continue;
      let signedMode = mapping.direction === void 0, direction = parseDirectionValue(text(record, mapping, "direction")), quantity = num(record, mapping, "quantity"), price = num(record, mapping, "entryPrice"), time = parseImportTimestamp(text(record, mapping, "entryTime"), dateOrder, timeZone), side = direction !== null ? direction === "long" ? "buy" : "sell" : quantity < 0 ? "sell" : "buy";
      if (!signedMode && direction === null || !Number.isFinite(quantity) || quantity === 0 || !Number.isFinite(price)) {
        skippedRows++, issues.push(
          issue(
            "warning",
            "row-skipped",
            `Line ${record.line}: an execution needs a side (or signed quantity) and a price; skipped.`,
            { row: record.line }
          )
        );
        continue;
      }
      let symbolClean = sanitizeRetainedText(text(record, mapping, "symbol"));
      fills.push({
        id: text(record, mapping, "tradeId") || text(record, mapping, "orderId") || void 0,
        row: record.line,
        symbol: symbolClean.value === "" ? null : symbolClean.value,
        side,
        quantity: Math.abs(quantity),
        price,
        time: Number.isFinite(time) ? time : null,
        fees: nOrNull(Math.abs(num(record, mapping, "fees")))
      });
    }
    return { closed: [], open: [], executions: fills, skippedRows };
  }
  var genericCsvAdapter = {
    id: "generic-csv",
    label: "Generic trade-history CSV (column mapping by header aliases)",
    // The generic adapter never claims a file; the orchestrator uses it as the
    // designated fallback and grades confidence from the mapping coverage.
    detect() {
      return null;
    },
    parse(table, ctx) {
      let issues = [], { mapping, unmapped } = mapHeaders(table.header, table.records);
      if (ctx.mappingOverride !== void 0)
        for (let [field, index] of Object.entries(ctx.mappingOverride))
          typeof index == "number" && index >= 0 && index < table.header.length && (mapping[field] = index);
      unmapped.length > 0 && issues.push(
        issue(
          "info",
          "ambiguous-mapping",
          `Columns not recognized (ignored): ${unmapped.map((h) => `"${h}"`).join(", ")}. If one of them holds the R-multiple, risk, P&L, or a timestamp, map it explicitly.`
        )
      );
      let filtered = filterByStatus(table, issues), records = filtered.records, statusSkipped = filtered.skipped, entryIdx = mapping.entryTime;
      if (entryIdx !== void 0 && /date/.test(normalizeHeader(table.header[entryIdx] ?? ""))) {
        let used = new Set(Object.values(mapping)), timeIdx = table.header.findIndex(
          (h, i) => !used.has(i) && normalizeHeader(h) === "time"
        );
        timeIdx !== -1 && (records = records.map((record) => {
          let cells = [...record.cells], date = (cells[entryIdx] ?? "").trim(), time = (cells[timeIdx] ?? "").trim();
          return date !== "" && time !== "" && (cells[entryIdx] = `${date} ${time}`), { ...record, cells };
        }));
      }
      let dateOrder = resolveDateOrder(records, mapping, ctx.dateOrder, issues), shape = decideShape(mapping, records), parsed = shape === "event-rows" ? parseEventRows(records, mapping, dateOrder, ctx.timeZone, issues) : shape === "executions" ? parseExecutions(records, mapping, dateOrder, ctx.timeZone, issues) : parseTradePerRow(records, mapping, dateOrder, ctx.timeZone, issues);
      return {
        closed: sortTrades(parsed.closed),
        open: parsed.open,
        issues,
        mapping,
        executions: parsed.executions,
        skippedRows: parsed.skippedRows + statusSkipped,
        dedupeSafe: shape !== "executions"
      };
    }
  };

  // vendor/luxalgo-trade-journal/importers/src/history/adapters/metatrader.ts
  var POSITION_TYPES = /^(buy|sell)$/i, PENDING_TYPES = /^(buy|sell)\s*(limit|stop|stop\s*limit)$/i, NON_TRADE_TYPES = /^(balance|credit|deposit|withdrawal|correction)$/i, metaTraderAdapter = {
    id: "metatrader",
    label: "MetaTrader 4/5 account history",
    detect(table) {
      let normalized = table.header.map(normalizeHeader), has = (name) => normalized.includes(name), idish = has("ticket") || has("position") || has("deal") || has("order"), timeCount = normalized.filter(
        (h) => h === "time" || h === "opentime" || h === "closetime"
      ).length, priceCount = normalized.filter(
        (h) => h === "price" || h === "openprice" || h === "closeprice"
      ).length;
      return !idish || !has("profit") || !has("swap") || timeCount < 2 || priceCount < 2 ? null : {
        confidence: "exact",
        signals: [
          "header carries a Ticket/Position id with Swap and Profit columns",
          "open and close Time/Price column pairs are both present (MetaTrader statement layout)"
        ]
      };
    },
    parse(table, ctx) {
      let issues = [], { mapping } = mapHeaders(table.header, table.records);
      ctx.mappingOverride !== void 0 && Object.assign(mapping, ctx.mappingOverride);
      let cell = (record, field) => {
        let index = mapping[field];
        return index === void 0 ? "" : (record.cells[index] ?? "").trim();
      }, closed = [], open = [], skippedRows = 0, typeIndex = table.header.findIndex((h) => normalizeHeader(h) === "type") !== -1 ? table.header.findIndex((h) => normalizeHeader(h) === "type") : mapping.direction ?? mapping.eventType;
      for (let record of table.records) {
        let typeRaw = typeIndex === void 0 ? "" : (record.cells[typeIndex] ?? "").trim();
        if (NON_TRADE_TYPES.test(typeRaw)) {
          skippedRows++, issues.push(
            issue(
              "info",
              "non-trade-row-ignored",
              `Line ${record.line}: "${typeRaw}" row (not a trade); ignored.`,
              {
                row: record.line
              }
            )
          );
          continue;
        }
        if (PENDING_TYPES.test(typeRaw)) {
          skippedRows++, issues.push(
            issue(
              "info",
              "cancelled-row-ignored",
              `Line ${record.line}: pending order "${typeRaw}" (never a position); ignored.`,
              { row: record.line }
            )
          );
          continue;
        }
        if (typeRaw === "") continue;
        if (!POSITION_TYPES.test(typeRaw)) {
          skippedRows++, issues.push(
            issue(
              "warning",
              "row-skipped",
              `Line ${record.line}: unrecognized type "${typeRaw || "(empty)"}"; skipped.`,
              { row: record.line }
            )
          );
          continue;
        }
        let direction = parseDirectionValue(typeRaw), entryTime = parseImportTimestamp(
          cell(record, "entryTime"),
          ctx.dateOrder,
          ctx.timeZone
        ), exitTime = parseImportTimestamp(cell(record, "exitTime"), ctx.dateOrder, ctx.timeZone), entryPrice = parseNumericCell(cell(record, "entryPrice")), exitPrice = parseNumericCell(cell(record, "exitPrice")), quantity = parseNumericCell(cell(record, "quantity")), profit = parseNumericCell(cell(record, "pnl")), commission = parseNumericCell(cell(record, "fees")), swap = parseNumericCell(cell(record, "swap")), stop = parseNumericCell(cell(record, "stopPrice"));
        if (!Number.isFinite(entryTime) || !Number.isFinite(entryPrice)) {
          skippedRows++, issues.push(
            issue(
              "warning",
              "row-skipped",
              `Line ${record.line}: unparseable open time or price; skipped.`,
              {
                row: record.line
              }
            )
          );
          continue;
        }
        let adjustments = (Number.isFinite(commission) ? commission : 0) + (Number.isFinite(swap) ? swap : 0), grossPnl = Number.isFinite(profit) ? profit : null, stillOpen = !Number.isFinite(exitTime) || !Number.isFinite(exitPrice), symbolRaw = sanitizeRetainedText(cell(record, "symbol")).value, idRaw = sanitizeRetainedText(cell(record, "tradeId")).value, trade = {
          id: idRaw === "" ? null : idRaw,
          symbol: symbolRaw === "" ? null : symbolRaw,
          direction,
          entryTime,
          exitTime: stillOpen ? null : exitTime,
          entryPrice,
          exitPrice: stillOpen ? null : exitPrice,
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
          pnl: grossPnl !== null ? grossPnl + adjustments : null,
          pnlReported: grossPnl !== null,
          // Reported as a non-negative cost. When a swap credit outweighs the
          // commission the net adjustment is a credit: the fee is zero and the
          // credit stays inside the (net) P&L, so nothing is lost or invented.
          fees: adjustments !== 0 ? Math.max(0, -adjustments) : null,
          stopPrice: Number.isFinite(stop) && stop !== 0 ? stop : null,
          riskAmount: null,
          r: null,
          rSource: "unavailable",
          status: stillOpen ? "open" : "closed",
          sourceRows: [record.line]
        };
        (stillOpen ? open : closed).push(trade);
      }
      return { closed: sortTrades(closed), open, issues, mapping, skippedRows, dedupeSafe: !0 };
    }
  };

  // vendor/luxalgo-trade-journal/importers/src/history/adapters/mt5deals.ts
  var EVENT_VALUES = /^(in|out|in\/out|out by)$/i, NON_TRADE_TYPES2 = /^(balance|credit|deposit|withdrawal|correction|commission|)$/i;
  function findColumns(header) {
    let normalized = header.map(normalizeHeader), find = (name) => normalized.indexOf(name), time = find("time"), deal = find("deal"), symbol = find("symbol"), type = find("type"), direction = find("direction"), volume = find("volume"), price = find("price"), profit = find("profit");
    if ([time, deal, symbol, type, direction, volume, price, profit].some((i) => i === -1))
      return null;
    let commission = find("commission"), fee = find("fee"), swap = find("swap");
    return {
      time,
      deal,
      symbol,
      type,
      direction,
      volume,
      price,
      commission: commission === -1 ? null : commission,
      fee: fee === -1 ? null : fee,
      swap: swap === -1 ? null : swap,
      profit
    };
  }
  function parseVolume(raw) {
    return parseNumericCell(raw.split("/")[0] ?? "");
  }
  var mt5DealsAdapter = {
    id: "mt5-deals",
    label: "MetaTrader 5 deals (strategy tester / history report)",
    detect(table) {
      let columns2 = findColumns(table.header);
      if (columns2 === null) return null;
      let sample = table.records.slice(0, 20);
      if (sample.length === 0) return null;
      let eventish = sample.filter(
        (r) => EVENT_VALUES.test((r.cells[columns2.direction] ?? "").trim())
      ), balanceish = sample.filter(
        (r) => /^balance$/i.test((r.cells[columns2.type] ?? "").trim())
      );
      return eventish.length + balanceish.length < Math.max(1, sample.length * 0.8) ? null : {
        confidence: "exact",
        signals: [
          'header carries Deal, Direction, Volume, and Profit columns (MetaTrader 5 "Deals" layout)',
          'rows are in/out fill events; "out" rows carry the trade profit'
        ]
      };
    },
    parse(table, ctx) {
      let issues = [], columns2 = findColumns(table.header), executions = [], skippedRows = 0;
      for (let record of table.records) {
        let cells = record.cells, type = (cells[columns2.type] ?? "").trim(), effect = (cells[columns2.direction] ?? "").trim().toLowerCase();
        if (NON_TRADE_TYPES2.test(type)) {
          skippedRows++;
          continue;
        }
        let direction = parseDirectionValue(type), time = parseImportTimestamp(cells[columns2.time] ?? "", ctx.dateOrder, ctx.timeZone), price = parseNumericCell(cells[columns2.price] ?? ""), quantity = parseVolume(cells[columns2.volume] ?? ""), symbol = sanitizeRetainedText(cells[columns2.symbol] ?? "").value;
        if (!direction || !EVENT_VALUES.test(effect) || !Number.isFinite(time) || !Number.isFinite(price) || !(quantity > 0) || !symbol) {
          skippedRows++, issues.push(
            issue(
              "warning",
              "row-skipped",
              `Line ${record.line}: invalid deal side, symbol, quantity, price or timestamp.`,
              { row: record.line }
            )
          );
          continue;
        }
        let adjustments = [columns2.commission, columns2.fee, columns2.swap].reduce(
          (total, index) => total + (index === null ? 0 : parseNumericCell(cells[index] ?? "") || 0),
          0
        ), gross = parseNumericCell(cells[columns2.profit] ?? "");
        executions.push({
          row: record.line,
          id: sanitizeRetainedText(cells[columns2.deal] ?? "").value,
          symbol,
          side: direction === "long" ? "buy" : "sell",
          quantity,
          price,
          time,
          fees: -adjustments,
          effect: effect === "out by" ? "out" : effect,
          ...effect !== "in" && Number.isFinite(gross) ? { reportedGrossPnl: gross } : {}
        });
      }
      let mapping = {
        entryTime: columns2.time,
        tradeId: columns2.deal,
        symbol: columns2.symbol,
        direction: columns2.type,
        eventType: columns2.direction,
        quantity: columns2.volume,
        entryPrice: columns2.price,
        pnl: columns2.profit
      };
      return { closed: [], open: [], executions, issues, mapping, skippedRows, dedupeSafe: !1 };
    }
  };

  // vendor/luxalgo-trade-journal/importers/src/history/adapters/tradingview.ts
  var EVENT_TYPE = /^(entry|exit)\s+(long|short)$/i;
  function findColumns2(header) {
    let normalized = header.map(normalizeHeader), find = (...names) => normalized.findIndex((h) => names.includes(h)), findPrefix = (prefix, excludePct) => normalized.findIndex((h) => h.startsWith(prefix) && (!excludePct || !h.endsWith("pct"))), tradeId = find("tradenumber", "trade", "tradeid", "tradeno"), type = find("type"), time = find("dateandtime", "datetime", "date", "time"), price = findPrefix("price", !0);
    if (tradeId === -1 || type === -1 || time === -1 || price === -1) return null;
    let quantity = find("contracts", "sizeqty", "positionsizeqty", "quantity", "qty"), pnl = findPrefix("netpnl", !0);
    pnl === -1 && (pnl = findPrefix("profit", !0));
    let fees = findPrefix("commission", !0), signal = find("signal"), symbol = find("symbol", "ticker", "instrument");
    return {
      symbol: symbol === -1 ? null : symbol,
      tradeId,
      type,
      time,
      price,
      quantity: quantity === -1 ? null : quantity,
      pnl: pnl === -1 ? null : pnl,
      fees: fees === -1 ? null : fees,
      signal: signal === -1 ? null : signal
    };
  }
  var tradingViewAdapter = {
    id: "tradingview",
    label: "TradingView strategy export (list of trades)",
    detect(table) {
      let columns2 = findColumns2(table.header);
      if (columns2 === null) return null;
      let sample = table.records.slice(0, 20);
      return sample.length === 0 || sample.filter((r) => EVENT_TYPE.test((r.cells[columns2.type] ?? "").trim())).length < Math.max(1, sample.length * 0.8) ? null : {
        confidence: "exact",
        signals: [
          `header carries "${table.header[columns2.tradeId].trim()}", "${table.header[columns2.type].trim()}", and "${table.header[columns2.time].trim()}" columns`,
          'rows are paired "Entry long/short" / "Exit long/short" events sharing a trade number'
        ]
      };
    },
    parse(table, ctx) {
      let issues = [], columns2 = findColumns2(table.header), events = [], skippedRows = 0;
      for (let record of table.records) {
        let cells = record.cells, typeRaw = (cells[columns2.type] ?? "").trim(), match = typeRaw.match(EVENT_TYPE);
        if (match === null) {
          skippedRows++, issues.push(
            issue(
              "warning",
              "row-skipped",
              `Line ${record.line}: "${typeRaw || "(empty)"}" is not an Entry/Exit row; skipped.`,
              { row: record.line, column: table.header[columns2.type] }
            )
          );
          continue;
        }
        let kind = match[1].toLowerCase() === "entry" ? "entry" : "exit", direction = parseDirectionValue(match[2]), id = sanitizeRetainedText(cells[columns2.tradeId] ?? "").value, timeRaw = (cells[columns2.time] ?? "").trim(), time = parseImportTimestamp(timeRaw, ctx.dateOrder, ctx.timeZone);
        if (kind === "exit" && !Number.isFinite(time)) {
          if (/^open$/i.test(timeRaw)) continue;
          skippedRows++, issues.push(
            issue(
              "warning",
              "row-skipped",
              `Line ${record.line}: unparseable exit date "${timeRaw}"; the trade will surface as open.`,
              { row: record.line, column: table.header[columns2.time] }
            )
          );
          continue;
        }
        if (kind === "entry" && !Number.isFinite(time)) {
          skippedRows++, issues.push(
            issue(
              "warning",
              "row-skipped",
              `Line ${record.line}: unparseable entry date "${timeRaw}"; the whole trade ${id} was skipped.`,
              { row: record.line, column: table.header[columns2.time] }
            )
          );
          continue;
        }
        let price = parseNumericCell(cells[columns2.price] ?? ""), quantity = columns2.quantity !== null ? parseNumericCell(cells[columns2.quantity] ?? "") : Number.NaN, pnl = kind === "exit" && columns2.pnl !== null ? parseNumericCell(cells[columns2.pnl] ?? "") : Number.NaN, fees = kind === "exit" && columns2.fees !== null ? parseNumericCell(cells[columns2.fees] ?? "") : Number.NaN;
        events.push({
          row: record.line,
          kind,
          id: id === "" ? null : id,
          symbol: columns2.symbol === null ? null : sanitizeRetainedText(cells[columns2.symbol] ?? "").value || null,
          direction,
          time,
          price: Number.isFinite(price) ? price : null,
          quantity: Number.isFinite(quantity) ? quantity : null,
          pnl: Number.isFinite(pnl) ? pnl : null,
          fees: Number.isFinite(fees) && fees !== 0 ? fees : null,
          stopPrice: null,
          r: null
        });
      }
      let { closed, open } = pairEvents(events, issues), mapping = {
        tradeId: columns2.tradeId,
        eventType: columns2.type,
        entryTime: columns2.time,
        entryPrice: columns2.price,
        ...columns2.quantity !== null ? { quantity: columns2.quantity } : {},
        ...columns2.pnl !== null ? { pnl: columns2.pnl } : {},
        ...columns2.fees !== null ? { fees: columns2.fees } : {}
      };
      return {
        closed: sortTrades(closed),
        open,
        issues,
        mapping,
        skippedRows,
        dedupeSafe: !0
      };
    }
  };

  // vendor/luxalgo-trade-journal/importers/src/history/html.ts
  function looksLikeHtml(text2) {
    let head = text2.slice(0, 4096).replace(/^﻿/, "").trimStart().toLowerCase();
    return !head.startsWith("<") || !/^<(!doctype\s+html|html|head|body|meta|table|div)[\s>]/.test(head) ? !1 : /<table[\s>]/i.test(text2) && /<\/table>/i.test(text2);
  }
  var NAMED_ENTITIES = {
    nbsp: " ",
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    minus: "\u2212",
    ndash: "\u2013",
    mdash: "-"
  };
  function decodeEntities(raw) {
    return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
      if (body.startsWith("#x") || body.startsWith("#X")) {
        let code = Number.parseInt(body.slice(2), 16);
        return Number.isInteger(code) && code >= 0 && code <= 1114111 ? String.fromCodePoint(code) : whole;
      }
      if (body.startsWith("#")) {
        let code = Number.parseInt(body.slice(1), 10);
        return Number.isInteger(code) && code >= 0 && code <= 1114111 ? String.fromCodePoint(code) : whole;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    });
  }
  var TAG = /<(\/)?([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)\/?>|<!--[\s\S]*?-->/g;
  function colspanOf(attrs) {
    let m = attrs.match(/colspan\s*=\s*["']?(\d+)/i), n = m !== null ? Number(m[1]) : 1;
    return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 1;
  }
  function isHidden(attrs) {
    let m = attrs.match(/class\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i), value = m === null ? "" : m[1] ?? m[2] ?? m[3] ?? "";
    return /\bhidden\b/i.test(value);
  }
  function extractHtmlTables(text2, limits = {}) {
    let issues = [], maxChars = limits.maxChars ?? DEFAULT_MAX_CHARS, maxRows = limits.maxRows ?? DEFAULT_MAX_ROWS, input = text2;
    input.includes("\0") && (issues.push(
      issue(
        "warning",
        "malformed-csv",
        "The HTML file contains NUL bytes (it may be UTF-16); they were removed. If values look garbled, re-save the report as UTF-8."
      )
    ), input = input.replaceAll("\0", "")), input.length > maxChars && (issues.push(
      issue(
        "warning",
        "input-truncated",
        `The file is larger than the ${Math.round(maxChars / 1e6)} MB limit; only the first part was read.`
      )
    ), input = input.slice(0, maxChars));
    let tables = [], stack = [], cellBuffer = null, pendingSpan = 1, skipRow = !1, skipCell = !1, totalRows = 0, line = 1, cursor = 0, advanceLines = (upTo) => {
      for (let i = cursor; i < upTo; i++) input.charCodeAt(i) === 10 && line++;
      cursor = upTo;
    }, flushText = (upTo) => {
      cellBuffer !== null && upTo > cursor && cellBuffer.push(input.slice(cursor, upTo)), advanceLines(upTo);
    }, closeCell = () => {
      let table = stack[stack.length - 1];
      if (table === void 0 || table.row === null || cellBuffer === null) {
        cellBuffer = null;
        return;
      }
      let value = decodeEntities(cellBuffer.join(" ")).replace(/\s+/g, " ").trim();
      table.row.push(value), cellBuffer = null;
    }, closeRow = () => {
      closeCell();
      let table = stack[stack.length - 1];
      table === void 0 || table.row === null || (table.row.some((c) => c !== "") && (table.records.push({ cells: table.row, line: table.rowLine }), totalRows++), table.row = null);
    };
    TAG.lastIndex = 0;
    let match;
    for (; (match = TAG.exec(input)) !== null && totalRows < maxRows; ) {
      if (flushText(match.index), advanceLines(TAG.lastIndex), match[0].startsWith("<!--")) continue;
      let closing = match[1] === "/", name = match[2].toLowerCase(), attrs = match[3] ?? "";
      if (!closing && (name === "script" || name === "style")) {
        let end = input.toLowerCase().indexOf(`</${name}`, TAG.lastIndex), resume = end === -1 ? input.length : input.indexOf(">", end) + 1;
        advanceLines(resume === 0 ? input.length : resume), TAG.lastIndex = cursor;
        continue;
      }
      if (name === "br") {
        cellBuffer !== null && cellBuffer.push(" ");
        continue;
      }
      if (name === "table") {
        if (!closing)
          stack.push({ records: [], row: null, rowLine: line });
        else {
          closeRow();
          let done = stack.pop();
          done !== void 0 && done.records.length > 0 && tables.push({ records: done.records });
        }
        continue;
      }
      let table = stack[stack.length - 1];
      if (table !== void 0) {
        if (name === "tr") {
          closeRow(), skipRow = !closing && isHidden(attrs), !closing && !skipRow && (table.row = [], table.rowLine = line);
          continue;
        }
        if (name === "td" || name === "th") {
          if (skipRow) continue;
          if (closing)
            if (skipCell)
              skipCell = !1;
            else {
              if (closeCell(), table.row !== null) for (let i = 1; i < pendingSpan; i++) table.row.push("");
              pendingSpan = 1;
            }
          else {
            if (closeCell(), isHidden(attrs)) {
              skipCell = !0, cellBuffer = null;
              continue;
            }
            skipCell = !1, table.row === null && (table.row = [], table.rowLine = line), cellBuffer = [], pendingSpan = colspanOf(attrs);
          }
          continue;
        }
        cellBuffer !== null && cellBuffer.push(" ");
      }
    }
    for (totalRows >= maxRows && issues.push(
      issue(
        "warning",
        "input-truncated",
        `The document has more than ${maxRows.toLocaleString("en-US")} table rows; the rest were ignored.`
      )
    ), flushText(input.length); stack.length > 0; ) {
      closeRow();
      let done = stack.pop();
      done !== void 0 && done.records.length > 0 && tables.push({ records: done.records });
    }
    return tables.length === 0 && issues.push(
      issue(
        "error",
        "unsupported-format",
        "The file looks like HTML, but no table rows could be extracted from it. Export the statement again, or save it as CSV."
      )
    ), { tables, issues };
  }
  function isSectionTitleRow(cells) {
    let nonEmpty = cells.map((c) => c.trim()).filter((c) => c !== "");
    return nonEmpty.length === 0 ? !1 : nonEmpty.length <= 2 && nonEmpty.every((c) => !/\d/.test(c)) ? !0 : nonEmpty.length <= 4 && /[a-zA-Z]/.test(nonEmpty[0]) && nonEmpty[0].endsWith(":");
  }
  function truncateAtSectionBoundary(records, isHeaderLike) {
    for (let i = 0; i < records.length; i++) {
      let cells = records[i].cells;
      if (isSectionTitleRow(cells) || isHeaderLike(cells))
        return { records: records.slice(0, i), truncatedAt: records[i].line };
    }
    return { records: [...records], truncatedAt: null };
  }

  // vendor/luxalgo-trade-journal/importers/src/history/import.ts
  var ADAPTERS = [
    tradingViewAdapter,
    metaTraderAdapter,
    mt5DealsAdapter,
    genericCsvAdapter
  ];
  function emptyResult(format, issues) {
    return {
      ok: !1,
      format,
      mapping: null,
      header: null,
      trades: [],
      openTrades: [],
      issues,
      stats: { rows: 0, parsedTrades: 0, skippedRows: 0, duplicatesRemoved: 0 }
    };
  }
  function headerScore(cells) {
    let aliasHits = 0, numeric = 0;
    for (let cell of cells) {
      let trimmed = cell.trim();
      trimmed !== "" && (Number.isFinite(parseNumericCell(trimmed)) ? numeric++ : matchHeader(trimmed) !== null && aliasHits++);
    }
    return numeric > 0 ? 0 : aliasHits;
  }
  function locateHeader(records) {
    let best = null, limit = Math.min(records.length, 30);
    for (let i = 0; i < limit; i++) {
      let score = headerScore(records[i].cells);
      if (score >= 2 && (best === null || score > best.score) && (best = { headerIndex: i, score }), best !== null && i > best.headerIndex + 5) break;
    }
    if (best !== null) return best;
    let first = records[0];
    return first.cells.length >= 2 && headerScore(first.cells) >= 1 ? { headerIndex: 0, score: 1 } : null;
  }
  function tradeKey(trade) {
    return trade.id !== null ? `id:${trade.id}|${trade.symbol ?? ""}|${trade.entryTime ?? ""}` : [
      trade.symbol,
      trade.direction,
      trade.entryTime,
      trade.exitTime,
      trade.entryPrice,
      trade.exitPrice,
      trade.quantity,
      trade.pnl
    ].join("|");
  }
  function validateTrades(trades, issues) {
    let mismatches = 0;
    for (let trade of trades)
      if (trade.direction !== null && trade.entryPrice !== null && trade.exitPrice !== null && trade.pnl !== null) {
        let sign = trade.direction === "long" ? 1 : -1, move = (trade.exitPrice - trade.entryPrice) * sign, gross = trade.pnl + Math.abs(trade.fees ?? 0);
        Math.abs(move) > Math.abs(trade.entryPrice) * 1e-4 && gross !== 0 && Math.sign(move) !== Math.sign(gross) && (mismatches++, mismatches <= 3 && issues.push(
          issue(
            "warning",
            "direction-pnl-mismatch",
            `Trade ${trade.id ?? `at line ${trade.sourceRows[0] ?? "?"}`}: a ${trade.direction} from ${trade.entryPrice} to ${trade.exitPrice} should ${move > 0 ? "win" : "lose"}, but P&L is ${trade.pnl}. The direction or price columns may be mapped wrong.`,
            trade.sourceRows[0] !== void 0 ? { row: trade.sourceRows[0] } : {}
          )
        ));
      }
    mismatches > 3 && issues.push(
      issue(
        "warning",
        "direction-pnl-mismatch",
        `${mismatches} trades total have a P&L sign that contradicts their direction and prices - review the column mapping before trusting this import.`
      )
    );
  }
  function chooseStatementSection(tables, issues) {
    let candidates = [];
    for (let table of tables)
      for (let i = 0; i < table.records.length; i++) {
        let score = headerScore(table.records[i].cells);
        score >= 3 && candidates.push({ table, index: i, score });
      }
    if (candidates.length === 0) return null;
    let sectionOf = (candidate) => {
      let headerRecord = candidate.table.records[candidate.index], after = candidate.table.records.slice(candidate.index + 1), trimmed = truncateAtSectionBoundary(after, (cells) => headerScore(cells) >= 3);
      return {
        header: headerRecord.cells.map((c) => c.trim()),
        records: trimmed.records,
        line: headerRecord.line
      };
    }, signatureAdapters = ADAPTERS.filter((a) => a.id !== genericCsvAdapter.id);
    for (let candidate of candidates) {
      let section2 = sectionOf(candidate);
      if (section2.records.length !== 0)
        for (let adapter of signatureAdapters) {
          let match = adapter.detect({
            delimiter: ",",
            header: section2.header,
            records: section2.records
          });
          if (match !== null)
            return issues.push(
              issue(
                "info",
                "row-recovered",
                `HTML statement: the section headed at line ${section2.line} (${section2.records.length} rows) matched "${adapter.label}"; other sections (orders, deals, open positions, summaries) were not imported as trades.`
              )
            ), {
              header: section2.header,
              records: section2.records,
              adapter,
              signals: match.signals
            };
        }
    }
    let best = candidates[0];
    for (let candidate of candidates) candidate.score > best.score && (best = candidate);
    let section = sectionOf(best);
    return section.records.length === 0 ? null : (issues.push(
      issue(
        "info",
        "row-recovered",
        `HTML table detected: the section headed at line ${section.line} (${section.records.length} rows) was selected by its column names.`
      )
    ), {
      header: section.header,
      records: section.records,
      adapter: null,
      signals: ["columns resolved by header aliases in an HTML table"]
    });
  }
  function importTradeHistory(rawText, options = {}) {
    let issues = [], limits = { maxChars: options.maxChars, maxRows: options.maxRows }, normalized = normalizeImportText(rawText), text2 = normalized.text;
    normalized.repairedUtf16 && issues.push(
      issue(
        "warning",
        "malformed-csv",
        "The file appears to be UTF-16 read as UTF-8 (MetaTrader saves reports that way); it was repaired automatically. Non-ASCII symbol names may look garbled - if so, re-save the file as UTF-8."
      )
    );
    let htmlSource = looksLikeHtml(text2), allRecords = [], delimiter = ",", statementSection = null;
    if (htmlSource) {
      let extracted = extractHtmlTables(text2, limits);
      if (issues.push(...extracted.issues), statementSection = chooseStatementSection(extracted.tables, issues), statementSection === null) {
        let best = null;
        for (let candidate of extracted.tables)
          (best === null || candidate.records.length > best.records.length) && (best = candidate);
        allRecords = best?.records ?? [];
      }
    } else {
      let csv = parseCsv2(text2, limits);
      issues.push(...csv.issues), allRecords = csv.records, delimiter = csv.delimiter;
    }
    if (statementSection === null && allRecords.length === 0)
      return issues.push(issue("error", "empty-input", "The input contains no rows.")), emptyResult(
        { kind: "unknown", label: "Empty input", confidence: "exact", signals: [] },
        issues
      );
    if (options.adapterId !== void 0 && !ADAPTERS.some((a) => a.id === options.adapterId))
      return issues.push(
        issue(
          "error",
          "unsupported-format",
          `Unknown adapter "${options.adapterId}". Available: ${ADAPTERS.map((a) => a.id).join(", ")}.`
        )
      ), emptyResult(
        { kind: "unknown", label: "Unknown adapter", confidence: "exact", signals: [] },
        issues
      );
    let located = statementSection === null ? locateHeader(allRecords) : null, header, records;
    if (statementSection !== null)
      header = statementSection.header, records = statementSection.records;
    else if (located !== null)
      header = allRecords[located.headerIndex].cells.map((c) => c.trim()), records = allRecords.slice(located.headerIndex + 1), located.headerIndex > 0 && !htmlSource && issues.push(
        issue(
          "info",
          "row-recovered",
          `The column header was found on line ${allRecords[located.headerIndex].line}; ${located.headerIndex} preamble row(s) above it were ignored.`
        )
      ), htmlSource && (records = truncateAtSectionBoundary(records, (cells) => headerScore(cells) >= 2).records);
    else if (options.mapping !== void 0)
      header = allRecords[0].cells.map((_, i) => `column ${i + 1}`), records = [...allRecords];
    else
      return issues.push(
        issue(
          "error",
          "no-header",
          "No column header row was found, so the columns cannot be interpreted. " + GENERIC_FORMAT_ADVICE + " Alternatively, provide a manual column mapping. If this was meant to be a plain R-multiple series, it contains tokens that are not numbers."
        )
      ), emptyResult(
        { kind: "unknown", label: "Unrecognized tabular data", confidence: "exact", signals: [] },
        issues
      );
    let table = { delimiter, header, records }, ctx = {
      mappingOverride: options.mapping,
      dateOrder: options.dateOrder,
      timeZone: options.timeZone
    }, adapter, format;
    if (options.adapterId !== void 0)
      adapter = ADAPTERS.find((a) => a.id === options.adapterId), format = {
        kind: adapter.id,
        label: adapter.label,
        confidence: "exact",
        signals: ["selected manually"]
      };
    else if (statementSection?.adapter != null)
      adapter = statementSection.adapter, format = {
        kind: adapter.id,
        label: adapter.label,
        confidence: "exact",
        signals: statementSection.signals
      };
    else {
      let match = null;
      for (let candidate of ADAPTERS) {
        if (candidate.id === genericCsvAdapter.id) continue;
        let detection = candidate.detect(table);
        if (detection !== null) {
          match = { adapter: candidate, signals: detection.signals };
          break;
        }
      }
      if (match === null)
        return issues.push(
          issue(
            "error",
            "unsupported-format",
            `The columns (${header.join(", ")}) match no supported export signature. Map the columns manually instead of relying on automatic detection.`
          )
        ), {
          ...emptyResult(
            {
              kind: "unknown",
              label: "Unrecognized columns",
              confidence: "exact",
              signals: ["no supported export signature matched the header"]
            },
            issues
          ),
          header,
          stats: { rows: records.length, parsedTrades: 0, skippedRows: 0, duplicatesRemoved: 0 }
        };
      adapter = match.adapter, format = {
        kind: adapter.id,
        label: adapter.label,
        confidence: "exact",
        signals: match.signals
      };
    }
    let parsed = adapter.parse(table, ctx);
    if (issues.push(...parsed.issues), format.kind === "generic-csv" && parsed.closed.length === 0 && parsed.open.length === 0 && !parsed.executions?.length) {
      let mapped = parsed.mapping === null ? [] : Object.keys(parsed.mapping);
      issues.push(
        issue(
          "error",
          "unmapped-required-fields",
          `A header row was detected (${header.join(", ")}), but no trades could be built from it. Recognized columns: ${mapped.length > 0 ? mapped.join(", ") : "none"}. A usable file needs either an R column, a P&L column, entry/exit prices, or fill rows (side, quantity, price). Map the columns manually if they are named unusually. ` + GENERIC_FORMAT_ADVICE
        )
      ), format = { ...format, confidence: "low" };
    }
    let duplicatesRemoved = 0, closed = parsed.closed;
    if (parsed.dedupeSafe) {
      let seen = /* @__PURE__ */ new Map(), unique = [];
      for (let trade of closed) {
        let key = tradeKey(trade), count = seen.get(key) ?? 0;
        seen.set(key, count + 1), count === 0 ? unique.push(trade) : duplicatesRemoved++;
      }
      duplicatesRemoved > 0 && issues.push(
        issue(
          "warning",
          "duplicate-rows",
          `${duplicatesRemoved} duplicate trade(s) (same id or identical fields) were removed - the file may contain the same history twice.`
        )
      ), closed = unique;
    }
    validateTrades(closed, issues);
    let trades = sortTrades(closed);
    return {
      ok: trades.length > 0 || !!parsed.executions?.length,
      format,
      mapping: parsed.mapping,
      header,
      executions: parsed.executions,
      trades,
      openTrades: parsed.open,
      issues,
      stats: {
        rows: records.length,
        parsedTrades: trades.length,
        skippedRows: parsed.skippedRows,
        duplicatesRemoved
      }
    };
  }

  // vendor/luxalgo-trade-journal/importers/src/formats/history.ts
  var symbolFrom = (content, options) => {
    if (options.symbol?.trim()) return options.symbol.trim().toUpperCase();
    let name = options.fileName?.match(
      /(?:^|_)(?:NASDAQ|NYSE|AMEX|CME|COMEX|CBOT|NYMEX|OANDA|FOREXCOM|BINANCE|COINBASE)_([A-Za-z0-9.!-]+)_(?=\d)/i
    );
    return name ? name[1].toUpperCase() : content.slice(0, 4e3).match(/^(?:symbol|ticker)\s*[,;\t:]\s*"?([A-Za-z0-9:/.!_-]+)"?\s*$/im)?.[1]?.split(":").pop()?.toUpperCase();
  }, recognizable = (result) => {
    if (result.format.kind !== "generic-csv") return result.format.kind !== "unknown";
    let m = result.mapping;
    return !!m && m.entryTime !== void 0 && m.entryPrice !== void 0 && m.quantity !== void 0 && (m.direction !== void 0 || m.eventType !== void 0 || !!result.executions?.length);
  }, issueMessages = (result) => result.issues.filter((item) => item.severity === "warning" && !item.code.startsWith("r-")).map((item) => item.message), pnlBasisFor = (header, hasFeeColumn) => {
    let normalized = normalizeHeader(header);
    return normalized.includes("gross") ? { basis: "gross", explicit: !0 } : normalized.includes("net") ? { basis: "net", explicit: !0 } : hasFeeColumn ? { basis: "gross", explicit: !0 } : { basis: "net", explicit: !1 };
  }, parseHistory = (content, options = {}) => {
    let history = importTradeHistory(content, {
      timeZone: options.timeZone,
      ...options.adapterId !== void 0 ? { adapterId: options.adapterId } : {}
    });
    if (!recognizable(history)) return null;
    let warnings = issueMessages(history), errors = history.issues.filter(
      (i) => i.severity === "error" || i.code === "input-truncated" || i.code === "malformed-csv" && /never closed/.test(i.message)
    ).map((i) => i.message), executions = [], format = `history-${history.format.kind}`, fallbackSymbol = symbolFrom(content, options), needsSymbol = !1, skippedRows = history.stats.skippedRows, occurrences = /* @__PURE__ */ new Map(), nextId = (key) => {
      let n = occurrences.get(key) ?? 0;
      return occurrences.set(key, n + 1), `${key}|${n}`;
    };
    if (history.executions) {
      let positions = /* @__PURE__ */ new Map(), seenDeals = /* @__PURE__ */ new Set(), creditNoted = !1;
      for (let fill of [...history.executions].sort(
        (a, b) => (a.time ?? 0) - (b.time ?? 0) || a.row - b.row
      )) {
        let symbol = (fill.symbol || fallbackSymbol)?.trim().toUpperCase();
        if (symbol || (needsSymbol = !0), !symbol || fill.time === null || !Number.isFinite(fill.time) || !(fill.quantity > 0) || !Number.isFinite(fill.quantity) || !Number.isFinite(fill.price)) {
          skippedRows++;
          continue;
        }
        let executedAt = new Date(fill.time).toISOString(), tuple = JSON.stringify([symbol, fill.side, fill.quantity, fill.price, executedAt]), id = fill.id ? `${format}:${fill.id}` : nextId(`${format}:${tuple}`);
        if (fill.effect) {
          let dealKey = `${id}|${tuple}`;
          if (seenDeals.has(dealKey)) continue;
          seenDeals.add(dealKey);
          let position = positions.get(symbol) ?? 0, signed = fill.side === "buy" ? fill.quantity : -fill.quantity, opposite = position !== 0 && Math.sign(position) !== Math.sign(signed);
          if (fill.effect === "in" && opposite || fill.effect === "out" && (!opposite || Math.abs(signed) > Math.abs(position) + 1e-9) || fill.effect === "in/out" && (!opposite || Math.abs(signed) <= Math.abs(position))) {
            skippedRows++, warnings.push(
              `Line ${fill.row}: the deal has no matching position in this file; skipped.`
            );
            continue;
          }
          let next = position + signed;
          positions.set(symbol, Math.abs(next) < 1e-9 ? 0 : next);
        }
        let fee = fill.fees ?? 0, reportedGrossPnl = fill.reportedGrossPnl;
        fee < 0 && (reportedGrossPnl !== void 0 ? reportedGrossPnl += fee : creditNoted || (creditNoted = !0, warnings.push(
          `Line ${fill.row}: a fee credit (negative fee) on a fill without a reported P&L was recorded as a zero fee.`
        )), fee = 0), executions.push({
          symbol,
          side: fill.side,
          quantity: fill.quantity,
          price: fill.price,
          fee,
          executedAt,
          importMetadata: {
            id,
            order: fill.row,
            preserveFee: fill.fees !== null,
            ...reportedGrossPnl !== void 0 ? { reportedGrossPnl } : {}
          }
        });
      }
    } else {
      let pnlHeader = history.header?.[history.mapping?.pnl ?? -1] ?? "", hasFeeColumn = history.mapping?.fees !== void 0 || history.mapping?.swap !== void 0, basis = history.format.kind === "generic-csv" ? pnlBasisFor(pnlHeader, hasFeeColumn) : { basis: "net", explicit: !0 };
      !basis.explicit && history.mapping?.pnl !== void 0 && warnings.push(
        `The "${pnlHeader}" column does not say whether it is net or gross of fees; it was used as net because the file has no commission column.`
      );
      for (let trade of history.trades) {
        let symbol = (trade.symbol || fallbackSymbol)?.trim().toUpperCase();
        if (symbol || (needsSymbol = !0), !symbol || !trade.direction || trade.entryTime === null || trade.exitTime === null || !Number.isFinite(trade.entryTime) || !Number.isFinite(trade.exitTime) || trade.exitTime < trade.entryTime || trade.entryPrice === null || trade.exitPrice === null || !Number.isFinite(trade.entryPrice) || !Number.isFinite(trade.exitPrice) || trade.quantity === null || !(trade.quantity > 0) || !Number.isFinite(trade.quantity)) {
          skippedRows += trade.sourceRows.length;
          continue;
        }
        let openedAt = new Date(trade.entryTime).toISOString(), closedAt = new Date(trade.exitTime).toISOString(), group = JSON.stringify([
          format,
          trade.id,
          symbol,
          trade.direction,
          openedAt,
          trade.entryPrice,
          ...trade.id ? [] : [closedAt, trade.exitPrice, trade.quantity]
        ]), rawFee = trade.fees ?? 0, fee = Math.max(0, rawFee), credit = rawFee < 0 ? -rawFee : 0, reportedGrossPnl;
        trade.pnlReported && trade.pnl !== null && (reportedGrossPnl = basis.basis === "gross" ? trade.pnl + credit : trade.pnl + fee);
        let preserveFee = trade.fees !== null || reportedGrossPnl !== void 0, side = trade.direction === "long" ? "buy" : "sell";
        executions.push(
          {
            symbol,
            side,
            quantity: trade.quantity,
            price: trade.entryPrice,
            fee: 0,
            executedAt: openedAt,
            importMetadata: { id: "entry", group, order: 0, preserveFee: !0 }
          },
          {
            symbol,
            side: side === "buy" ? "sell" : "buy",
            quantity: trade.quantity,
            price: trade.exitPrice,
            fee,
            executedAt: closedAt,
            importMetadata: {
              id: "exit",
              group,
              order: 1,
              preserveFee,
              ...reportedGrossPnl !== void 0 ? { reportedGrossPnl } : {}
            }
          }
        );
      }
      history.openTrades.length && (skippedRows += history.openTrades.reduce((sum2, trade) => sum2 + trade.sourceRows.length, 0), warnings.push(
        `${history.openTrades.length} incomplete position(s) skipped; this history export requires completed entry/exit pairs.`
      ));
    }
    return needsSymbol && errors.push("Choose the symbol for this file before importing."), skippedRows > history.stats.skippedRows && !needsSymbol && warnings.push(
      "Some history rows lack valid prices, quantity, direction or complete timestamps and were skipped."
    ), !executions.length && !needsSymbol && !errors.length && errors.push("No complete executions could be imported from this history."), {
      format,
      executions: errors.length ? [] : executions,
      skippedRows,
      warnings: [...new Set(warnings)].slice(0, 50),
      ...errors.length ? { errors: [...new Set(errors)].slice(0, 20) } : {},
      ...needsSymbol ? { needsSymbol: !0 } : {}
    };
  }, historyFormat = {
    id: "trade-history",
    label: "Trade history (TradingView strategy and MetaTrader exports)",
    detect: (_headers, content) => recognizable(importTradeHistory(content)),
    parse: (content, options) => parseHistory(content, options) ?? {
      format: "trade-history",
      executions: [],
      skippedRows: 0,
      warnings: [],
      errors: ["History columns could not be recognized."]
    }
  };

  // vendor/luxalgo-trade-journal/importers/src/detect.ts
  var LEGACY_FORMATS = [
    metatrader,
    ibkr,
    ibkrFlex,
    thinkorswim,
    tradezella,
    tradervue,
    topstepx,
    tradingview,
    ninjatrader,
    tradovate,
    webull,
    dastrader
  ], FORMATS = [...LEGACY_FORMATS, historyFormat], route = (content, options) => {
    let headers = parseCsv(content)[0] ?? [], legacyFormat = LEGACY_FORMATS.find((candidate) => candidate.detect(headers, content)), legacy = legacyFormat ? legacyFormat.parse(content, options) : void 0;
    if (legacyFormat && legacy?.executions.length) return { format: legacyFormat, parsed: legacy };
    let history = parseHistory(content, options);
    return history ? { format: historyFormat, parsed: history } : legacyFormat && legacy ? { format: legacyFormat, parsed: legacy } : null;
  }, detectFormat = (content) => route(content, {})?.format ?? null, parseAuto = (content, options = {}) => route(content, options)?.parsed ?? null;

  // vendor/luxalgo-trade-journal/importers/src/formats/generic.ts
  var parseWithMapping = (content, mapping, options = {}) => {
    let records = toRecords(parseCsv(content)), alias = (name) => name ? [headerKey(name)] : [], { executions, skippedRows } = rowsToFills(
      records,
      {
        symbol: alias(mapping.symbol),
        side: alias(mapping.side),
        quantity: alias(mapping.quantity),
        price: alias(mapping.price),
        fees: mapping.fee ? [alias(mapping.fee)] : [],
        timestamp: mapping.timestamp ? alias(mapping.timestamp) : void 0,
        date: alias(mapping.date),
        time: alias(mapping.time)
      },
      options
    );
    return { format: "generic", executions, skippedRows, warnings: [] };
  }, readHeaders = (content) => parseCsv(content)[0] ?? [];
  return __toCommonJS(entry_exports);
})();

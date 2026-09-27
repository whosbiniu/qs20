import AppKit
import Foundation
import SwiftUI

struct Candle: Codable, Identifiable, Sendable {
  var time: Double, open: Double, high: Double, low: Double, close: Double, volume: Double
  var id: Double { time }
}
struct Market: Identifiable, Sendable {
  var id: String, name: String, dex: String
  var price: Double, change: Double, volume: Double, oi: Double, funding: Double
}
struct Trade: Sendable { var id: String, time: Double, price: Double, size: Double, buy: Bool }
struct BookLevel: Identifiable, Sendable {
  var price: Double, size: Double
  var id: Double { price }
}
struct PricePoint: Codable { var time: Double, price: Double }
struct Stroke: Codable, Identifiable {
  var id = UUID()
  var tool: String
  var points: [PricePoint]
  var text: String = ""
}
struct ProfileRow {
  var price: Double, bid: Double = 0, ask: Double = 0, count: Int = 0
  var total: Double { bid + ask }
}
struct Profile {
  var start: Double, end: Double, step: Double, rows: [ProfileRow], poc: Int, lower: Int, upper: Int
}
struct FlowBar {
  var time: Double, delta: Double = 0, cvd: Double = 0, count: Int = 0,
    levels: [Int: ProfileRow] = [:]
}
struct Study: Identifiable {
  let id: String, name: String, group: String, detail: String
  static let all: [Study] = [
    .init(id: "ohlc", name: "OHLC", group: "Podstawowe", detail: "Dane świecy pod kursorem"),
    .init(
      id: "barstats", name: "Bar Stats", group: "Podstawowe",
      detail: "Zakres, korpus i knoty świecy pod kursorem"),
    .init(
      id: "vpvr", name: "VPVR · widoczny zakres", group: "Profile",
      detail: "Szacunek z OHLCV, równomierny rozkład po cenach; nie Bid × Ask"),
    .init(
      id: "vpsv", name: "VPSV · profile dzienne", group: "Profile",
      detail: "Profil dzienny UTC szacowany z OHLCV"),
    .init(
      id: "avwap", name: "Anchored VWAP", group: "Cena",
      detail: "Średnia od wybranej daty, ważona wolumenem OHLCV"),
    .init(
      id: "obprofile", name: "OB Profile", group: "Order flow",
      detail: "Wielkość zleceń oczekujących na poziomach ceny"),
    .init(
      id: "heatmap", name: "Heatmap arkusza", group: "Order flow",
      detail: "Próbki arkusza od włączenia, maksymalnie 300 próbek"),
    .init(id: "volume", name: "Wolumen", group: "Wolumen", detail: "Wolumen świecowy"),
    .init(
      id: "tpo", name: "TPO", group: "Profile", detail: "Profile z zakresów świec 30m; sesje UTC"),
    .init(
      id: "profile", name: "Volume Profile", group: "Order flow",
      detail: "Transakcje zebrane w tej sesji aplikacji"),
    .init(
      id: "footprint", name: "Footprint", group: "Order flow",
      detail: "Bid × Ask; liczby widoczne po przybliżeniu"),
    .init(
      id: "delta", name: "Delta / CVD", group: "Order flow",
      detail: "Skumulowana delta od początku zebranego zakresu"),
    .init(
      id: "vwap", name: "VWAP + pasma", group: "Cena",
      detail: "Średnia ważona wolumenem OHLCV, ±1σ, reset dzienny UTC"),
    .init(
      id: "levels", name: "Poziomy dnia / tygodnia / miesiąca", group: "Cena",
      detail: "High, Low, Open obecnego i poprzedniego okresu z dostępnych świec"),
    .init(
      id: "bubbles", name: "Volume Bubbles", group: "Wolumen",
      detail: "Rozmiar kół odpowiada wolumenowi świec"),
    .init(
      id: "depth", name: "Order Book Depth", group: "Order flow",
      detail: "Skumulowana głębokość bieżącego arkusza"),
    .init(
      id: "oi", name: "Open Interest", group: "Rynek", detail: "Próbki od uruchomienia aplikacji"),
    .init(
      id: "funding", name: "Funding", group: "Rynek", detail: "Godzinowe stawki funding z 14 dni"),
    .init(
      id: "pulse", name: "Trade Counter / Pulse", group: "Order flow",
      detail: "Liczba odebranych transakcji na świecę"),
  ]
}
func num(_ n: Double, _ digits: Int = 2) -> String {
  n.isFinite ? n.formatted(.number.precision(.fractionLength(0...digits))) : "—"
}
func value(_ x: Any?) -> Double {
  if let n = x as? NSNumber { return n.doubleValue }
  return Double(x as? String ?? "") ?? 0
}
func utcCalendar() -> Calendar {
  var c = Calendar(identifier: .gregorian)
  c.timeZone = TimeZone(secondsFromGMT: 0)!
  c.firstWeekday = 2
  c.minimumDaysInFirstWeek = 4
  return c
}
func bucket(_ time: Double, _ frame: String) -> Double {
  let date = Date(timeIntervalSince1970: time)
  let c = utcCalendar()
  if frame == "1M" { return c.dateInterval(of: .month, for: date)!.start.timeIntervalSince1970 }
  if frame == "1w" {
    return c.dateInterval(of: .weekOfYear, for: date)!.start.timeIntervalSince1970
  }
  let span: Double =
    ["1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400][frame]
    ?? 3600
  return floor(time / span) * span
}
func profileBounds(_ time: Double, mode: String, startHour: Double = 8, endHour: Double = 16.5) -> (
  Double, Double
)? {
  guard time.isFinite, startHour.isFinite, endHour.isFinite, (0..<24).contains(startHour),
    (0...24).contains(endHour)
  else { return nil }
  let day = floor(time / 86400) * 86400
  if mode == "Tygodniowe" {
    let s = bucket(time, "1w")
    return (s, s + 604800)
  }
  if mode == "Miesięczne" {
    let d = utcCalendar().dateInterval(of: .month, for: Date(timeIntervalSince1970: time))!
    return (d.start.timeIntervalSince1970, d.end.timeIntervalSince1970)
  }
  if mode == "Sesyjne" {
    var a = day + startHour * 3600
    var b = day + endHour * 3600
    if endHour <= startHour {
      b += 86400
      if time < day + endHour * 3600 {
        a -= 86400
        b -= 86400
      }
    }
    return time >= a && time < b ? (a, b) : nil
  }
  return (day, day + 86400)
}
func profile(_ rows: [ProfileRow], start: Double, end: Double, step: Double, tpo: Bool) -> Profile?
{
  guard !rows.isEmpty else { return nil }
  let weights = rows.map { tpo ? Double($0.count) : $0.total }
  let middle = Double(rows.count - 1) / 2
  let poc =
    weights.indices.max { a, b in
      weights[a] == weights[b]
        ? abs(Double(a) - middle) > abs(Double(b) - middle) : weights[a] < weights[b]
    } ?? 0
  var lower = poc
  var upper = poc
  var sum = weights[poc]
  let goal = weights.reduce(0, +) * 0.7
  while sum < goal && (lower > 0 || upper < rows.count - 1) {
    let a = upper + 1 < rows.count ? weights[upper + 1] : -1
    let b = lower > 0 ? weights[lower - 1] : -1
    if a >= b {
      upper += 1
      sum += weights[upper]
    } else {
      lower -= 1
      sum += weights[lower]
    }
  }
  return Profile(
    start: start, end: end, step: step, rows: rows, poc: poc, lower: lower, upper: upper)
}
func priceStep(low: Double, high: Double, requested: Double) -> Double {
  let raw = max((high - low) / 40, max(abs(high) * 1e-7, 1e-8))
  let p = pow(10, floor(log10(raw)))
  let auto = ([1.0, 2, 5, 10].first { $0 * p >= raw } ?? 10) * p
  return max(requested > 0 ? requested : auto, (high - low) / 300)
}
func tpoProfiles(_ candles: [Candle], mode: String, step: Double, from: Double, to: Double)
  -> [Profile]
{
  var groups: [Double: [Candle]] = [:]
  var ends: [Double: Double] = [:]
  for candle in candles {
    if let (a, b) = profileBounds(candle.time, mode: mode, startHour: from, endHour: to) {
      groups[a, default: []].append(candle)
      ends[a] = b
    }
  }
  return groups.keys.sorted().compactMap { start in
    let bars = groups[start]!
    let low = bars.map(\.low).min()!
    let high = bars.map(\.high).max()!
    let step = priceStep(low: low, high: high, requested: step)
    let first = Int(floor(low / step))
    let last = Int(floor(high / step))
    var rows = (first...last).map { ProfileRow(price: Double($0) * step) }
    var seen: Set<String> = []
    for b in bars {
      for index in Int(floor(b.low / step))...Int(floor(b.high / step)) {
        let key = "\(Int((b.time-start)/1800)):\(index)"
        if seen.insert(key).inserted { rows[index - first].count += 1 }
      }
    }
    return profile(rows, start: start, end: ends[start]!, step: step, tpo: true)
  }
}
func flow(_ trades: [Trade], frame: String, requestedStep: Double) -> (Profile?, [FlowBar]) {
  guard let lo = trades.map(\.price).min(), let hi = trades.map(\.price).max() else {
    return (nil, [])
  }
  let step = priceStep(low: lo, high: hi, requested: requestedStep)
  let first = Int(floor(lo / step))
  let last = Int(floor(hi / step))
  var rows = (first...last).map { ProfileRow(price: Double($0) * step) }
  var bars: [Double: FlowBar] = [:]
  for t in trades {
    let i = Int(floor(t.price / step)) - first
    let time = bucket(t.time, frame)
    if t.buy { rows[i].ask += t.size } else { rows[i].bid += t.size }
    var bar = bars[time] ?? FlowBar(time: time)
    var r = bar.levels[i] ?? ProfileRow(price: rows[i].price)
    if t.buy { r.ask += t.size } else { r.bid += t.size }
    bar.levels[i] = r
    bar.delta += t.buy ? t.size : -t.size
    bar.count += 1
    bars[time] = bar
  }
  var cumulative = 0.0
  let out = bars.keys.sorted().map { time -> FlowBar in
    var b = bars[time]!
    cumulative += b.delta
    b.cvd = cumulative
    return b
  }
  return (
    profile(rows, start: trades.first!.time, end: trades.last!.time, step: step, tpo: false), out
  )
}

enum Disk {
  static var folder: URL {
    let p = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("UNCsWay Native")
    try? FileManager.default.createDirectory(at: p, withIntermediateDirectories: true)
    return p
  }
  static func load<T: Decodable>(_ name: String, as type: T.Type) -> T? {
    guard let d = try? Data(contentsOf: folder.appendingPathComponent(name)) else { return nil }
    return try? JSONDecoder().decode(type, from: d)
  }
  static func save<T: Encodable>(_ value: T, _ name: String) {
    if let d = try? JSONEncoder().encode(value) {
      try? d.write(to: folder.appendingPathComponent(name), options: .atomic)
    }
  }
}

// Alias selects the stable property wrapper when CLT SDK lacks the SwiftUI macro plugin.
typealias ViewState<Value> = SwiftUI.State<Value>

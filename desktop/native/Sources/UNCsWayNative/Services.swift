import Foundation
import SwiftUI

struct APIError: LocalizedError {
  var message: String
  var errorDescription: String? { message }
}
enum API {
  static func data(_ url: String, body: [String: Any]? = nil) async throws -> Data {
    guard let u = URL(string: url) else { throw APIError(message: "Nieprawidłowy URL") }
    var r = URLRequest(url: u)
    r.timeoutInterval = 20
    r.setValue("UNCsWayNative/0.1 (macOS; personal dashboard)", forHTTPHeaderField: "User-Agent")
    if let body {
      r.httpMethod = "POST"
      r.httpBody = try JSONSerialization.data(withJSONObject: body)
      r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    let (d, response) = try await URLSession.shared.data(for: r)
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw APIError(
        message: "\(u.host ?? "Serwer"): HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)")
    }
    return d
  }
  static func json(_ url: String, body: [String: Any]? = nil) async throws -> Any {
    try JSONSerialization.jsonObject(with: await data(url, body: body))
  }
  static func hl(_ body: [String: Any]) async throws -> Any {
    try await json("https://api.hyperliquid.xyz/info", body: body)
  }
  static func markets() async throws -> [Market] {
    let dexes = (try? await hl(["type": "perpDexs"])) as? [Any] ?? []
    let names = [""] + dexes.compactMap { ($0 as? [String: Any])?["name"] as? String }
    return await withTaskGroup(of: [Market].self) { group in
      for dex in names {
        group.addTask {
          guard let pair = try? await hl(["type": "metaAndAssetCtxs", "dex": dex]) as? [Any],
            pair.count == 2, let meta = pair[0] as? [String: Any],
            let universe = meta["universe"] as? [[String: Any]],
            let contexts = pair[1] as? [[String: Any]]
          else { return [] }
          return universe.enumerated().compactMap { i, a in
            guard let name = a["name"] as? String, i < contexts.count else { return nil }
            let c = contexts[i]
            let price = value(c["markPx"])
            let previous = value(c["prevDayPx"])
            return Market(
              id: name, name: String(name.split(separator: ":").last ?? Substring(name)),
              dex: dex.isEmpty ? "Hyperliquid" : dex, price: price,
              change: previous > 0 ? (price / previous - 1) * 100 : 0,
              volume: value(c["dayNtlVlm"]), oi: value(c["openInterest"]),
              funding: value(c["funding"]))
          }
        }
      }
      var out: [Market] = []
      for await chunk in group { out += chunk }
      return out.sorted { $0.volume > $1.volume }
    }
  }
  static func candles(_ coin: String, frame: String, count: Int = 500) async throws -> [Candle] {
    let seconds: Double =
      [
        "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "4h": 14400, "1d": 86400,
        "1w": 604800, "1M": 2_592_000,
      ][frame] ?? 3600
    let now = Date().timeIntervalSince1970 * 1000
    guard
      let rows = try await hl([
        "type": "candleSnapshot",
        "req": [
          "coin": coin, "interval": frame, "startTime": Int(now - seconds * 1000 * Double(count)),
          "endTime": Int(now),
        ],
      ]) as? [[String: Any]]
    else { throw APIError(message: "Nieprawidłowe świece") }
    return rows.map {
      Candle(
        time: value($0["t"]) / 1000, open: value($0["o"]), high: value($0["h"]),
        low: value($0["l"]), close: value($0["c"]), volume: value($0["v"]))
    }.filter { $0.high >= $0.low && $0.close > 0 }.sorted { $0.time < $1.time }
  }
  static func book(_ coin: String) async throws -> ([BookLevel], [BookLevel]) {
    guard let b = try await hl(["type": "l2Book", "coin": coin]) as? [String: Any],
      let levels = b["levels"] as? [[[String: Any]]], levels.count == 2
    else { throw APIError(message: "Brak arkusza") }
    let parse: ([[String: Any]]) -> [BookLevel] = {
      $0.map { BookLevel(price: value($0["px"]), size: value($0["sz"])) }
    }
    return (parse(levels[0]), parse(levels[1]))
  }
  static func yahoo(_ symbol: String, frame: String = "1d", range: String = "1y") async throws
    -> [Candle]
  {
    let aliases = [
      "NQ1!": "NQ=F", "ES1!": "ES=F", "YM1!": "YM=F", "BTC1!": "BTC=F", "GC1!": "GC=F",
      "SI1!": "SI=F", "CL1!": "CL=F", "DXY": "DX-Y.NYB",
    ]
    let feed =
      (aliases[symbol] ?? symbol).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed)
      ?? symbol
    guard
      let root = try await json(
        "https://query1.finance.yahoo.com/v8/finance/chart/\(feed)?interval=\(frame)&range=\(range)"
      ) as? [String: Any], let chart = root["chart"] as? [String: Any],
      let result = (chart["result"] as? [[String: Any]])?.first,
      let times = result["timestamp"] as? [Double],
      let ind = result["indicators"] as? [String: Any],
      let q = (ind["quote"] as? [[String: Any]])?.first
    else { throw APIError(message: "Brak danych Yahoo dla \(symbol)") }
    let o = q["open"] as? [Any] ?? []
    let h = q["high"] as? [Any] ?? []
    let l = q["low"] as? [Any] ?? []
    let c = q["close"] as? [Any] ?? []
    let v = q["volume"] as? [Any] ?? []
    return times.indices.compactMap { i in
      guard i < o.count, i < h.count, i < l.count, i < c.count, !(c[i] is NSNull), value(c[i]) > 0
      else { return nil }
      return Candle(
        time: times[i], open: value(o[i]), high: value(h[i]), low: value(l[i]), close: value(c[i]),
        volume: i < v.count ? value(v[i]) : 0)
    }
  }
}

@MainActor final class TerminalStore: ObservableObject {
  @Published var markets: [Market] = []
  @Published var candles: [Candle] = []
  @Published var bids: [BookLevel] = []
  @Published var asks: [BookLevel] = []
  @Published var coin = UserDefaults.standard.string(forKey: "native.coin") ?? "BTC"
  @Published var frame = "1h"
  @Published var message = "Gotowy"
  @Published var connected = false
  @Published var loading = false
  @Published var indicators = Set(
    UserDefaults.standard.stringArray(forKey: "native.indicators") ?? ["volume"])
  @Published var tool = "cursor"
  @Published var drawings: [Stroke] = []
  @Published var profiles: [Profile] = []
  @Published var volumeProfile: Profile?
  @Published var flows: [FlowBar] = []
  @Published var mode = "Dzienne"
  @Published var priceRow = 0.0
  @Published var sessionStart = 8.0
  @Published var sessionEnd = 16.5
  @Published var trades: [Trade] = []
  @Published var gap = false
  @Published var oiHistory: [(Double, Double)] = []
  var tpoUpdated = Date.distantPast
  var tpoCandles: [Candle] = [], seen: Set<String> = [], task: Task<Void, Never>?,
    stream: Task<Void, Never>?, heartbeat: Task<Void, Never>?, pending: Task<Void, Never>?,
    socket: URLSessionWebSocketTask?
  @Published var anchorDate = Date().addingTimeInterval(-86400)
  @Published var fundingHistory: [(Double, Double)] = []
  @Published var bookHistory: [BookSnapshot] = []
  var fundingUpdated = Date.distantPast
  var lastMarketsRefresh = Date.distantPast
  var generation = UUID(), tradeFloor = 0.0, started = false, drawingsLoaded = false
  var market: Market? { markets.first { $0.id == coin } }
  var drawingKey: String {
    "draw-" + Data(coin.utf8).base64EncodedString().replacingOccurrences(of: "/", with: "_")
      + ".json"
  }
  func start() async {
    guard !started else { return }
    started = true
    markets = (try? await API.markets()) ?? []
    if markets.isEmpty { message = "Nie udało się pobrać rynków. Spróbuj Odśwież." }
    await select(coin)
    task = Task {
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(20))
        if Task.isCancelled { break }
        await refresh()
      }
    }
  }
  func select(_ next: String) async {
    saveDrawings()
    generation = UUID()
    coin = next
    UserDefaults.standard.set(coin, forKey: "native.coin")
    fundingHistory = []
    bookHistory = []
    fundingUpdated = .distantPast
    candles = []
    bids = []
    asks = []
    trades = []
    tpoCandles = []
    profiles = []
    flows = []
    volumeProfile = nil
    seen = []
    oiHistory = []
    tradeFloor = 0
    gap = false
    drawings = Disk.load(drawingKey, as: [Stroke].self) ?? []
    drawingsLoaded = true
    connect()
    await refresh()
  }
  func refresh() async {
    let token = generation
    let selected = coin
    let interval = frame
    loading = true
    if Date().timeIntervalSince(lastMarketsRefresh) > 60 {
      lastMarketsRefresh = Date()
      let updated = (try? await API.markets()) ?? []
      if !updated.isEmpty { markets = updated }
    }
    guard token == generation else { return }
    do {
      async let a = API.candles(selected, frame: interval)
      async let b = API.book(selected)
      let (bars, book) = try await (a, b)
      guard token == generation && interval == frame else { return }
      candles = bars
      bids = book.0
      asks = book.1
      message =
        "Hyperliquid · \(bars.count) świec · \(Date().formatted(date:.omitted,time:.shortened))"
      if indicators.contains("tpo")
        && (tpoCandles.isEmpty || Date().timeIntervalSince(tpoUpdated) > 60)
      {
        let data = try await API.candles(selected, frame: "30m", count: 5000)
        guard token == generation else { return }
        tpoCandles = data
        tpoUpdated = Date()
      }
      if indicators.contains("funding") && Date().timeIntervalSince(fundingUpdated) > 600 {
        let rows =
          try await API.hl([
            "type": "fundingHistory", "coin": selected,
            "startTime": Int(Date().addingTimeInterval(-14 * 86400).timeIntervalSince1970 * 1000),
          ]) as? [[String: Any]] ?? []
        guard token == generation else { return }
        fundingHistory = rows.map { (value($0["time"]) / 1000, value($0["fundingRate"]) * 100) }
          .sorted { $0.0 < $1.0 }
        fundingUpdated = Date()
      }
      recalculate()
      if let m = market {
        oiHistory.append((Date().timeIntervalSince1970, m.oi))
        if oiHistory.count > 1000 { oiHistory.removeFirst() }
      }
    } catch { if token == generation { message = error.localizedDescription } }
    if token == generation { loading = false }
  }
  func toggle(_ id: String) {
    if indicators.contains(id) { indicators.remove(id) } else { indicators.insert(id) }
    UserDefaults.standard.set(Array(indicators), forKey: "native.indicators")
    recalculate()
    if (id == "tpo" && tpoCandles.isEmpty) || id == "funding" { Task { await refresh() } }
  }
  func recalculate(includeTPO: Bool = true) {
    if includeTPO {
      profiles =
        indicators.contains("tpo")
        ? tpoProfiles(tpoCandles, mode: mode, step: priceRow, from: sessionStart, to: sessionEnd)
        : []
    }
    let f = flow(trades, frame: frame, requestedStep: priceRow)
    volumeProfile = f.0
    flows = f.1
  }
  func resetTrades() {
    trades = []
    seen = []
    tradeFloor = Date().timeIntervalSince1970
    recalculate()
  }
  func saveDrawings() { if drawingsLoaded { Disk.save(drawings, drawingKey) } }
  func connect() {
    stream?.cancel()
    heartbeat?.cancel()
    socket?.cancel(with: .goingAway, reason: nil)
    connected = false
    let selected = coin
    let token = generation
    stream = Task {
      var attempt = 0
      while !Task.isCancelled && token == generation {
        let ws = URLSession.shared.webSocketTask(with: URL(string: "wss://api.hyperliquid.xyz/ws")!)
        socket = ws
        ws.resume()
        do {
          let bytes = try JSONSerialization.data(withJSONObject: [
            "method": "subscribe", "subscription": ["type": "trades", "coin": selected],
          ])
          try await ws.send(.string(String(decoding: bytes, as: UTF8.self)))
          let bookBytes = try JSONSerialization.data(withJSONObject: [
            "method": "subscribe", "subscription": ["type": "l2Book", "coin": selected],
          ])
          try await ws.send(.string(String(decoding: bookBytes, as: UTF8.self)))
          heartbeat = Task {
            while !Task.isCancelled {
              try? await Task.sleep(for: .seconds(15))
              if Task.isCancelled { break }
              do { try await ws.send(.string("{\"method\":\"ping\"}")) } catch {
                ws.cancel(with: .goingAway, reason: nil)
                break
              }
            }
          }
          while !Task.isCancelled {
            let msg = try await ws.receive()
            guard token == generation else { return }
            let data: Data
            switch msg {
            case .data(let d): data = d
            case .string(let s): data = Data(s.utf8)
            @unknown default: continue
            }
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
              continue
            }
            connected = true
            attempt = 0
            if json["channel"] as? String == "l2Book", let book = json["data"] as? [String: Any],
              book["coin"] as? String == selected,
              let levels = book["levels"] as? [[[String: Any]]], levels.count == 2
            {
              bids = levels[0].map { BookLevel(price: value($0["px"]), size: value($0["sz"])) }
              asks = levels[1].map { BookLevel(price: value($0["px"]), size: value($0["sz"])) }
              let now = Date().timeIntervalSince1970
              if indicators.contains("heatmap") && now - (bookHistory.last?.time ?? 0) >= 5 {
                bookHistory.append(BookSnapshot(time: now, bids: bids, asks: asks))
                if bookHistory.count > 300 { bookHistory.removeFirst() }
              }
            }
            if json["channel"] as? String == "trades", let list = json["data"] as? [[String: Any]] {
              for t in list {
                let time = value(t["time"]) / 1000
                let price = value(t["px"])
                let size = value(t["sz"])
                let side = t["side"] as? String ?? ""
                guard t["coin"] as? String == selected, price > 0, size > 0, time >= tradeFloor,
                  ["A", "B"].contains(side), let tid = t["tid"]
                else { continue }
                let id = "\(time):\(tid)"
                guard seen.insert(id).inserted else { continue }
                trades.append(Trade(id: id, time: time, price: price, size: size, buy: side == "B"))
              }
              trades.sort { $0.time < $1.time }
              if let latest = trades.last,
                let index = markets.firstIndex(where: { $0.id == selected })
              {
                markets[index].price = latest.price
              }
              if let latest = trades.last, let last = candles.last, latest.time >= last.time {
                let key = bucket(latest.time, frame)
                if key == last.time {
                  candles[candles.count - 1].close = latest.price
                  candles[candles.count - 1].high = max(last.high, latest.price)
                  candles[candles.count - 1].low = min(last.low, latest.price)
                }
              }
              if trades.count > 50000 {
                tradeFloor = trades[trades.count - 50001].time + 0.001
                trades.removeAll { $0.time < tradeFloor }
                seen = Set(trades.map(\.id))
                gap = true
              }
              if pending == nil {
                pending = Task {
                  try? await Task.sleep(for: .milliseconds(350))
                  recalculate(includeTPO: false)
                  pending = nil
                }
              }
            }
          }
        } catch {
          if Task.isCancelled || token != generation { break }
          connected = false
          gap = true
          message = "Strumień: ponawianie połączenia"
        }
        heartbeat?.cancel()
        ws.cancel(with: .goingAway, reason: nil)
        attempt += 1
        try? await Task.sleep(for: .seconds(min(30, pow(2, Double(min(attempt, 4))))))
      }
    }
  }
}

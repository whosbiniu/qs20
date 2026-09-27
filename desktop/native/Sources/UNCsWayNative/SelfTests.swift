import Foundation

enum SelfTests {
  static func run() {
    func check(_ value: Bool, _ label: String) {
      if !value {
        fputs("FAIL: \(label)\n", stderr)
        exit(1)
      }
    }
    let base = 1_790_467_200.0
    let candles = [
      Candle(time: base, open: 100, high: 102, low: 100, close: 101, volume: 5),
      Candle(time: base + 1800, open: 101, high: 103, low: 101, close: 102, volume: 3),
    ]
    let profiles = tpoProfiles(candles, mode: "Dzienne", step: 1, from: 8, to: 16.5)
    check(profiles.count == 1, "TPO sessions")
    check(profiles[0].rows.map(\.count) == [1, 2, 2, 1], "TPO counts")
    let trades = [
      Trade(id: "1", time: base, price: 100, size: 5, buy: true),
      Trade(id: "2", time: base + 1, price: 100, size: 2, buy: false),
      Trade(id: "3", time: base + 60, price: 101, size: 4, buy: true),
    ]
    let (p, b) = flow(trades, frame: "1m", requestedStep: 1)
    check(p?.rows.reduce(0, { $0 + $1.total }) == 11, "profile total")
    check(b.last?.cvd == 7, "CVD buy minus sell")
    check(b.count == 2, "delta time buckets")
    let fmt = ISO8601DateFormatter()
    let night = fmt.date(from: "2026-09-27T01:00:00Z")!.timeIntervalSince1970
    let range = profileBounds(night, mode: "Sesyjne", startHour: 22, endHour: 6)!
    check(range.1 - range.0 == 28800 && night >= range.0 && night < range.1, "overnight profile")
    let project = PostProject()
    check(
      (try? JSONDecoder().decode(PostProject.self, from: JSONEncoder().encode(project)))?.width
        == 2160, "post project roundtrip")
    check(
      Study.all.map(\.id).count == Set(Study.all.map(\.id)).count, "unique indicator identifiers")
    check(
      bucket(fmt.date(from: "2026-09-27T12:00:00Z")!.timeIntervalSince1970, "1w")
        == fmt.date(from: "2026-09-21T00:00:00Z")!.timeIntervalSince1970, "Monday week boundary")
    let monday = fmt.date(from: "2026-09-21T12:00:00Z")!
    let tuesday = fmt.date(from: "2026-09-22T12:00:00Z")!
    let session = Cycles.windows(day: monday, scope: "Sesja")
    check(session.count == 7, "session HP window count")
    check(session.allSatisfy { $0.end.timeIntervalSince($0.start) == 337.5 }, "exact nano duration")
    check(session.filter { $0.quarter == 3 }.count == 1, "NY AM Q1 exclusion")
    check(
      Cycles.windows(day: tuesday, scope: "Dzień").map(\.quarter) == [1, 3], "Tuesday day targets")
    check(
      Cycles.windows(day: monday, scope: "Dzień").map(\.quarter) == [1, 4], "Monday day targets")
    check(
      Cycles.windows(day: fmt.date(from: "2026-09-30T12:00:00Z")!, scope: "Sesja").isEmpty,
      "cross-month Q0")
    check(
      Cycles.start(fmt.date(from: "2026-03-09T12:00:00Z")!) == fmt.date(
        from: "2026-03-08T22:00:00Z")!, "ET daylight saving boundary")
    check(
      Cycles.periodStart(fmt.date(from: "2026-09-21T23:00:00Z")!, frame: "1d") == fmt.date(
        from: "2026-09-21T22:00:00Z")!, "ET trading day boundary")
    check(
      abs((candleProfile(candles)?.rows.reduce(0) { $0 + $1.total } ?? 0) - 8) < 1e-8,
      "OHLCV profile preserves volume")
    check(
      profileBounds(base, mode: "Sesyjne", startHour: 30, endHour: 6) == nil,
      "invalid profile hours")
    let webDocument = Data(
      ##"{"version":2,"activePanel":"aura","charts":[],"aura":{"textColor":"#000","ticks":"123"}}"##
        .utf8)
    let imported = try? PostProject.read(webDocument)
    check(imported?.white == false && imported?.ticks == "123", "web Post Creator migration")
    print("PASS: cycle windows, DST, OHLCV profile, validation")
    print(
      "PASS: TPO, profiles, delta/CVD, overnight sessions, post document, study registry, weekly boundary"
    )
  }
}

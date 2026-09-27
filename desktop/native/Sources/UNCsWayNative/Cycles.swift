import SwiftUI

struct CycleWindow: Identifiable {
  let id: String, title: String, start: Date, end: Date, quarter: Int, probability: Bool
}
enum Cycles {
  static var et: Calendar {
    var c = Calendar(identifier: .gregorian)
    c.timeZone = TimeZone(identifier: "America/New_York")!
    c.firstWeekday = 2
    return c
  }
  static func tradingDate(_ date: Date) -> Date {
    let c = et
    return c.date(
      byAdding: .day, value: c.component(.hour, from: date) >= 18 ? 1 : 0,
      to: c.startOfDay(for: date))!
  }
  static func start(_ date: Date) -> Date {
    let c = et
    let previous = c.date(byAdding: .day, value: -1, to: c.startOfDay(for: date))!
    return c.date(bySettingHour: 18, minute: 0, second: 0, of: previous)!
  }
  static func fullWeek(_ date: Date) -> Int {
    let c = et
    let weekday = (c.component(.weekday, from: date) + 5) % 7
    let monday = c.date(byAdding: .day, value: -weekday, to: c.startOfDay(for: date))!
    let friday = c.date(byAdding: .day, value: 4, to: monday)!
    guard c.component(.month, from: monday) == c.component(.month, from: date),
      c.component(.month, from: friday) == c.component(.month, from: date)
    else { return 0 }
    let month = c.dateInterval(of: .month, for: date)!.start
    let firstMonday = 1 + (9 - c.component(.weekday, from: month)) % 7
    return min(4, (c.component(.day, from: monday) - firstMonday) / 7 + 1)
  }
  static func targets(_ q: Int) -> [Int] { q == 2 || q == 3 ? [1, 3] : [1, 4] }
  static func dayQuarter(_ date: Date) -> Int {
    let w = et.component(.weekday, from: date)
    return w == 6 ? 1 : max(0, min(4, w - 1))
  }
  static func quarters(_ date: Date) -> String {
    let t = tradingDate(date)
    let s = date.timeIntervalSince(start(t))
    let session = Int(s / 21600) + 1
    let m90 = Int(s / 5400) % 4 + 1
    let micro = Int(s / 1350) % 4 + 1
    return
      "M Q\(fullWeek(t)) · W \(et.component(.weekday,from:t) == 6 ? "Q1/Q4" : "Q\(dayQuarter(t))") · D Q\(session) · 90 Q\(m90) · μ Q\(micro)"
  }
  static func windows(day: Date, scope: String) -> [CycleWindow] {
    let begin = start(day)
    let wd = et.component(.weekday, from: day)
    guard (2...6).contains(wd), fullWeek(day) > 0 else { return [] }
    var result: [CycleWindow] = []
    let names = ["Asia", "London", "NY AM", "NY PM"]
    if scope == "Dzień" {
      for q in targets(dayQuarter(day)) {
        let a = begin.addingTimeInterval(Double(q - 1) * (21600 + 5400 + 1350))
        result.append(
          CycleWindow(
            id: "day-\(a.timeIntervalSince1970)", title: "\(names[q-1]) · Q\(q)/Q\(q)/Q\(q)",
            start: a, end: a.addingTimeInterval(1350), quarter: q, probability: true))
      }
    } else {
      for session in 1...4 {
        for q in (session == 3 ? [3] : targets(session)) {
          let a = begin.addingTimeInterval(
            Double(session - 1) * 21600 + Double(q - 1) * (5400 + 1350 + 337.5))
          result.append(
            CycleWindow(
              id: "session-\(a.timeIntervalSince1970)",
              title: "\(names[session-1]) · Q\(q)/Q\(q)/Q\(q)", start: a,
              end: a.addingTimeInterval(337.5), quarter: session, probability: true))
        }
      }
    }
    return result
  }
  static func periodStart(_ date: Date, frame: String) -> Date {
    let day = tradingDate(date)
    let boundary =
      frame == "1w"
      ? et.dateInterval(of: .weekOfYear, for: day)!.start
      : frame == "1M" ? et.dateInterval(of: .month, for: day)!.start : day
    return start(boundary)
  }
  static func format(_ date: Date) -> String {
    let f = DateFormatter()
    f.timeZone = et.timeZone
    f.dateFormat = "HH:mm:ss"
    return f.string(from: date)
  }
}
struct CycleScreen: View {
  @ViewState<Date> var day = Cycles.tradingDate(Date())
  @ViewState<String> var scope = "Sesja"
  @ViewState<Bool> var history = false
  @ViewState<Set<String>> var ssmt = Set<String>()
  var body: some View {
    TimelineView(.periodic(from: .now, by: 1)) { context in
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          HStack {
            Text("Kwartały i okna sesji").font(.title2.bold())
            Spacer()
            DatePicker("Dzień tradingowy", selection: $day, displayedComponents: .date).frame(
              width: 260)
            Button("Dzisiaj") { day = Cycles.tradingDate(Date()) }
          }
          Text("Nowy Jork: \(Cycles.format(context.date)) ET · \(Cycles.quarters(context.date))")
            .font(.system(.body, design: .monospaced))
          GroupBox("Aktywne SSMT") {
            HStack {
              ForEach(["Monthly", "Weekly", "Daily", "Session", "90"], id: \.self) { s in
                Toggle(
                  s,
                  isOn: Binding(
                    get: { ssmt.contains(s) },
                    set: {
                      if $0 { ssmt.insert(s) } else { ssmt.remove(s) }
                      UserDefaults.standard.set(Array(ssmt), forKey: "native.ssmt")
                    }))
              }
            }
            if !ssmt.isEmpty {
              Text(ssmt.sorted().map { "\($0): Oczekuj 2S" }.joined(separator: " · "))
                .foregroundStyle(.yellow)
            }
          }
          ForEach(
            [("DAILY", 21600.0), ("90 MIN", 5400), ("MICRO", 1350), ("NANO", 337.5)], id: \.0
          ) { title, span in
            VStack(alignment: .leading) {
              Text(title).font(.caption)
              GeometryReader { geo in
                let count = Int(86400 / span)
                HStack(spacing: 1) {
                  ForEach(0..<count, id: \.self) { i in
                    let a = Cycles.start(day).addingTimeInterval(Double(i) * span)
                    let b = a.addingTimeInterval(span)
                    Rectangle().fill(
                      [Color.blue, .green, .orange, .purple][i % 4].opacity(
                        context.date >= a && context.date < b ? 1 : 0.35)
                    ).overlay {
                      if geo.size.width / Double(count) > 25 { Text("Q\(i%4+1)").font(.caption2) }
                    }.help("\(Cycles.format(a))–\(Cycles.format(b)) ET")
                  }
                }
              }.frame(height: 34)
            }
          }
          HStack {
            Picker("Zakres", selection: $scope) {
              Text("Sesja").tag("Sesja")
              Text("Dzień").tag("Dzień")
            }.pickerStyle(.segmented).frame(width: 240)
            Toggle("Tylko zakończone", isOn: $history)
          }
          let windows = Cycles.windows(day: day, scope: scope).filter {
            !history || $0.end <= context.date
          }
          if windows.isEmpty {
            Text(
              "Brak okien: weekend, tydzień przecinający granicę miesiąca albo zakres historii bez zakończonych okien."
            ).foregroundStyle(.secondary)
          }
          ForEach(windows) { w in
            HStack {
              Circle().fill(
                w.end <= context.date ? .gray : w.start <= context.date ? .green : .orange
              ).frame(width: 7, height: 7)
              Text(w.title).frame(width: 250, alignment: .leading)
              Text("\(Cycles.format(w.start)) – \(Cycles.format(w.end)) ET").monospaced()
              Spacer()
              if !history {
                Button("Eksport .ics") {
                  exportICS(title: "UNCsWay · \(w.title)", start: w.start, end: w.end)
                }
              }
            }.padding(8).background(.quaternary.opacity(0.3), in: RoundedRectangle(cornerRadius: 6))
          }
          Text(
            "Okna według reguł projektu — nie są prognozą ani pomiarem ekstremów ceny. Eksport .ics zapisuje plik; nie dodaje wydarzeń automatycznie."
          ).font(.caption).foregroundStyle(.secondary)
        }.padding()
      }
    }.onAppear { ssmt = Set(UserDefaults.standard.stringArray(forKey: "native.ssmt") ?? []) }
  }
}
struct HighRecord: Identifiable {
  let id: String, symbol: String, scope: String, high: Double, low: Double, highDate: Date,
    lowDate: Date, partial: Bool
}
struct HighsScreen: View {
  @ViewState<[HighRecord]> var records: [HighRecord] = []
  @ViewState<String> var error = ""
  @ViewState<Bool> var busy = false
  func load() async {
    busy = true
    records = []
    error = ""
    for symbol in ["NQ1!", "ES1!", "YM1!"] {
      do {
        let bars = try await API.yahoo(symbol, frame: "5m", range: "1mo")
        guard let last = bars.last else { continue }
        for (frame, name) in [("1d", "Dzień"), ("1w", "Tydzień"), ("1M", "Miesiąc")] {
          let key = Cycles.periodStart(Date(timeIntervalSince1970: last.time), frame: frame)
            .timeIntervalSince1970
          let list = bars.filter {
            Cycles.periodStart(Date(timeIntervalSince1970: $0.time), frame: frame)
              .timeIntervalSince1970 == key
          }
          if let high = list.max(by: { $0.high < $1.high }),
            let low = list.min(by: { $0.low < $1.low })
          {
            records.append(
              HighRecord(
                id: symbol + name, symbol: symbol, scope: name, high: high.high, low: low.low,
                highDate: Date(timeIntervalSince1970: high.time),
                lowDate: Date(timeIntervalSince1970: low.time),
                partial: (bars.first?.time ?? 0) > key + 300))
          }
        }
      } catch { self.error += "\(symbol): \(error.localizedDescription)\n" }
    }
    busy = false
  }
  var body: some View {
    VStack(alignment: .leading) {
      HStack {
        Text("Aktualne High / Low").font(.title2.bold())
        Spacer()
        if busy { ProgressView().controlSize(.small) }
        Button("Odśwież") { Task { await load() } }
      }
      if !error.isEmpty { Text(error).foregroundStyle(.orange) }
      List(records) { r in
        VStack(alignment: .leading, spacing: 6) {
          HStack {
            Text("\(r.symbol) · \(r.scope)").font(.headline)
            if r.partial { Text("Niepełna historia").foregroundStyle(.orange) }
            Spacer()
            Text("H \(num(r.high))").foregroundStyle(.green)
            Text("L \(num(r.low))").foregroundStyle(.red)
          }
          Text("High \(r.highDate.formatted()) · \(Cycles.quarters(r.highDate))").font(.caption)
          Text("Low \(r.lowDate.formatted()) · \(Cycles.quarters(r.lowDate))").font(.caption)
        }.padding(.vertical, 6)
      }
      Text("Yahoo Finance · świece 5m · dzień tradingowy od 18:00 ET; kwartały ET").font(.caption)
        .foregroundStyle(.secondary)
    }.padding().task { if records.isEmpty { await load() } }
  }
}

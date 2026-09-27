import AppKit
import SwiftUI

enum Screen: String, CaseIterable, Identifiable {
  case home = "Start"
  case charts = "Wykresy"
  case terminal = "Terminal"
  case post = "Post Creator"
  case calendar = "Kalendarz"
  case news = "Wydarzenia"
  case cycles = "Kwartały"
  case highs = "High / Low"
  case monitor = "Monitor"
  case tv = "TV"
  var id: String { rawValue }
  var icon: String {
    switch self {
    case .home: return "square.grid.2x2"
    case .charts: return "chart.xyaxis.line"
    case .terminal: return "chart.bar.xaxis"
    case .post: return "photo.on.rectangle.angled"
    case .calendar: return "calendar"
    case .news: return "newspaper"
    case .cycles: return "clock"
    case .highs: return "arrow.up.arrow.down"
    case .monitor: return "globe.europe.africa"
    case .tv: return "play.tv"
    }
  }
}
@main struct NativeApplication: App {
  @StateObject var terminal = TerminalStore()
  @StateObject var feeds = FeedStore()
  @AppStorage("native.appearance") var appearance = "Ciemny"
  init() {
    if CommandLine.arguments.contains("--self-test") {
      SelfTests.run()
      exit(0)
    }
  }
  var body: some Scene {
    WindowGroup("UNCsWay Native") {
      Shell(terminal: terminal, feeds: feeds).preferredColorScheme(
        appearance == "Ciemny" ? .dark : appearance == "Jasny" ? .light : nil
      ).frame(minWidth: 1050, minHeight: 700)
    }
    .defaultSize(width: 1450, height: 940)
    .commands {
      CommandGroup(replacing: .appInfo) {
        Button("O UNCsWay Native") {
          NSApplication.shared.orderFrontStandardAboutPanel(options: [
            .applicationName: "UNCsWay Native",
            .applicationVersion: "0.1.0 — SwiftUI / AppKit · ARM64",
            .credits: NSAttributedString(
              string: "Natywna wersja projektu qs2.0. Dane rynkowe z publicznych źródeł."),
          ])
        }
      }
    }
    Settings {
      Form {
        Picker("Wygląd", selection: $appearance) {
          ForEach(["Ciemny", "Jasny", "Systemowy"], id: \.self) { Text($0) }
        }
        Text("Dane aplikacji: \(Disk.folder.path)").font(.caption).textSelection(.enabled)
        Text(
          "Order flow jest zbierany w trakcie działania aplikacji. Sesje TPO: UTC. Kwartały: America/New_York."
        ).font(.caption)
      }.padding().frame(width: 450)
    }
  }
}
struct Shell: View {
  @ObservedObject var terminal: TerminalStore
  @ObservedObject var feeds: FeedStore
  @ViewState<Screen?> var screen: Screen? = .home
  var body: some View {
    NavigationSplitView {
      List(Screen.allCases, selection: $screen) { s in Label(s.rawValue, systemImage: s.icon).tag(s)
      }.navigationTitle("UNCsWay").navigationSplitViewColumnWidth(min: 160, ideal: 180, max: 230)
      VStack(alignment: .leading, spacing: 5) {
        Label("Native · Apple Silicon", systemImage: "cpu").font(.caption)
        Text("SwiftUI / AppKit").font(.caption2).foregroundStyle(.secondary)
      }.padding()
    } detail: {
      Group {
        switch screen ?? .home {
        case .home: Dashboard(terminal: terminal, feeds: feeds, screen: $screen)
        case .terminal: TerminalScreen(store: terminal)
        case .charts: ChartsScreen()
        case .post: PostCreatorScreen()
        case .calendar: CalendarScreen(feed: feeds)
        case .news: NewsScreen(feed: feeds)
        case .cycles: CycleScreen()
        case .highs: HighsScreen()
        case .monitor: MonitorScreen(feed: feeds)
        case .tv: TVScreen()
        }
      }.navigationTitle((screen ?? .home).rawValue)
    }.task { await terminal.start() }
  }
}
struct Dashboard: View {
  @ObservedObject var terminal: TerminalStore
  @ObservedObject var feeds: FeedStore
  @Binding var screen: Screen?
  @ViewState<[String]> var panels =
    UserDefaults.standard.stringArray(forKey: "native.dashboard") ?? [
      "Terminal", "Kalendarz", "Wydarzenia", "Kwartały",
    ]
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        HStack {
          VStack(alignment: .leading, spacing: 5) {
            Text("Twój obszar roboczy").font(.largeTitle.bold())
            Text(Date().formatted(date: .complete, time: .omitted)).foregroundStyle(.secondary)
          }
          Spacer()
          Menu("Dodaj panel") {
            ForEach(Screen.allCases.filter { $0 != .home && !panels.contains($0.rawValue) }) { s in
              Button(s.rawValue) {
                panels.append(s.rawValue)
                save()
              }
            }
          }
        }
        LazyVGrid(
          columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 16
        ) {
          ForEach(panels, id: \.self) { name in
            GroupBox {
              VStack(alignment: .leading, spacing: 12) {
                HStack {
                  Label(name, systemImage: Screen(rawValue: name)?.icon ?? "square").font(.headline)
                  Spacer()
                  Button {
                    screen = Screen(rawValue: name)
                  } label: {
                    Image(systemName: "arrow.up.right")
                  }
                  Button {
                    if let i = panels.firstIndex(of: name), i > 0 {
                      panels.swapAt(i, i - 1)
                      save()
                    }
                  } label: {
                    Image(systemName: "arrow.up")
                  }
                  Button {
                    panels.removeAll { $0 == name }
                    save()
                  } label: {
                    Image(systemName: "xmark")
                  }
                }.buttonStyle(.plain)
                if name == "Terminal" {
                  NativeChart(store: terminal).frame(height: 250)
                  HStack {
                    Text(terminal.coin)
                    Spacer()
                    Text(num(terminal.market?.price ?? 0))
                    Circle().fill(terminal.connected ? .green : .orange).frame(width: 7, height: 7)
                  }
                } else if name == "Kalendarz" {
                  ForEach(
                    feeds.events.filter { $0.date >= Date().addingTimeInterval(-3600) }.prefix(5)
                  ) { e in
                    HStack {
                      Text(e.date, style: .time).font(.caption)
                      Text(e.title).lineLimit(2)
                      Spacer()
                    }
                  }
                  if feeds.events.isEmpty {
                    Button("Wczytaj kalendarz") { Task { await feeds.calendar() } }
                  }
                } else if name == "Wydarzenia" {
                  ForEach(feeds.news.prefix(4)) { n in
                    Text(n.title).font(.callout).lineLimit(2)
                    Divider()
                  }
                  if feeds.news.isEmpty {
                    Button("Wczytaj wiadomości") { Task { await feeds.headlines() } }
                  }
                } else if name == "Kwartały" {
                  TimelineView(.periodic(from: .now, by: 1)) { c in
                    Text(Cycles.quarters(c.date)).monospaced()
                    Text("Nowy Jork \(Cycles.format(c.date)) ET").foregroundStyle(.secondary)
                  }
                } else {
                  Label("Otwórz \(name)", systemImage: Screen(rawValue: name)?.icon ?? "square")
                    .frame(height: 100).frame(maxWidth: .infinity).onTapGesture {
                      screen = Screen(rawValue: name)
                    }
                }
              }.frame(maxWidth: .infinity, minHeight: 110, alignment: .topLeading).padding(5)
            }
          }
        }
      }.padding(24)
    }
  }
  func save() { UserDefaults.standard.set(panels, forKey: "native.dashboard") }
}
struct IndicatorLibrary: View {
  @ObservedObject var store: TerminalStore
  @ViewState<String> var query = ""
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Indykatory").font(.title2.bold())
      TextField("Szukaj indykatora", text: $query).textFieldStyle(.roundedBorder)
      ScrollView {
        VStack(alignment: .leading, spacing: 8) {
          ForEach(
            Study.all.filter {
              query.isEmpty || ($0.name + " " + $0.group).localizedCaseInsensitiveContains(query)
            }
          ) { s in
            HStack(alignment: .top) {
              VStack(alignment: .leading, spacing: 4) {
                Text(s.name).font(.headline)
                Text(s.detail).font(.caption).foregroundStyle(.secondary)
              }
              Spacer()
              Button(store.indicators.contains(s.id) ? "Usuń" : "+ Dodaj") { store.toggle(s.id) }
            }.padding(7)
            Divider()
          }
          if store.indicators.contains("tpo") {
            Text("Ustawienia TPO").font(.headline)
            Picker("Zakres", selection: $store.mode) {
              ForEach(["Dzienne", "Sesyjne", "Tygodniowe", "Miesięczne"], id: \.self) { Text($0) }
            }.onChange(of: store.mode) { store.recalculate() }
            if store.mode == "Sesyjne" {
              HStack {
                TextField("Od UTC", value: $store.sessionStart, format: .number)
                TextField("Do UTC", value: $store.sessionEnd, format: .number)
              }.onChange(of: store.sessionStart) { store.recalculate() }.onChange(
                of: store.sessionEnd
              ) { store.recalculate() }
              Text("Godziny UTC, np. 16,5 = 16:30. Sesja może przechodzić przez północ.").font(
                .caption)
            }
          }
          if store.indicators.contains("avwap") {
            DatePicker("Kotwica VWAP", selection: $store.anchorDate)
          }
          TextField("Krok ceny (0 = auto)", value: $store.priceRow, format: .number).onChange(
            of: store.priceRow
          ) { store.recalculate() }
          Button("Nowy zakres order flow") { store.resetTrades() }
          Text(
            "\(store.trades.count) transakcji zebranych w aplikacji. \(store.gap ? "Możliwe braki po przerwie albo ograniczeniu bufora." : "")"
          ).font(.caption).foregroundStyle(.secondary)
        }
      }
    }.padding().frame(width: 345, height: 600)
  }
}
struct TerminalScreen: View {
  @ObservedObject var store: TerminalStore
  @ViewState<String> var search = ""
  @ViewState<Bool> var library = false
  let tools: [(String, String, String)] = [
    ("cursor", "cursorarrow", "Kursor"), ("trend", "line.diagonal", "Linia trendu"),
    ("hline", "minus", "Linia pozioma"), ("vline", "line.diagonal.arrow", "Linia pionowa"),
    ("rect", "rectangle", "Prostokąt"), ("fib", "line.3.horizontal", "Fibonacci"),
    ("brush", "pencil.tip", "Pędzel"), ("measure", "ruler", "Pomiar"),
    ("text", "textformat", "Tekst"), ("erase", "eraser", "Gumka"),
  ]
  var body: some View {
    HSplitView {
      VStack {
        TextField("Szukaj rynku", text: $search).textFieldStyle(.roundedBorder).padding(8)
        List(
          store.markets.filter {
            search.isEmpty || ($0.id + " " + $0.name).localizedCaseInsensitiveContains(search)
          }
        ) { m in
          Button {
            Task { await store.select(m.id) }
          } label: {
            HStack {
              VStack(alignment: .leading) {
                Text(m.name).foregroundStyle(.primary)
                Text(m.dex).font(.caption2).foregroundStyle(.secondary)
              }
              Spacer()
              VStack(alignment: .trailing) {
                Text(num(m.price, 4))
                Text("\(num(m.change))%").foregroundStyle(m.change >= 0 ? .green : .red).font(
                  .caption)
              }
            }.font(.system(.callout, design: .monospaced)).padding(.vertical, 3)
          }.buttonStyle(.plain).listRowBackground(
            store.coin == m.id ? Color.accentColor.opacity(0.12) : Color.clear)
        }
      }.frame(minWidth: 170, idealWidth: 210, maxWidth: 270)
      VStack(spacing: 0) {
        HStack {
          Text(store.coin).font(.title2.bold())
          Text(num(store.market?.price ?? store.candles.last?.close ?? 0, 4)).font(
            .title2.monospaced())
          Spacer()
          Circle().fill(store.connected ? .green : .orange).frame(width: 7, height: 7)
          Text(store.connected ? "Live" : "Łączenie").font(.caption)
          Button("Indykatory") { library.toggle() }.popover(isPresented: $library) {
            IndicatorLibrary(store: store)
          }
          Button {
            Task { await store.refresh() }
          } label: {
            Image(systemName: "arrow.clockwise")
          }
        }.padding(10)
        HStack {
          ForEach(["1m", "5m", "15m", "30m", "1h", "4h", "1d", "1w", "1M"], id: \.self) { f in
            Button(f) {
              store.frame = f
              Task { await store.refresh() }
            }.buttonStyle(.borderless).foregroundStyle(
              store.frame == f ? Color.accentColor : .secondary)
          }
          Spacer()
          if store.loading { ProgressView().controlSize(.small) }
        }.padding(.horizontal, 10).padding(.bottom, 8)
        Divider()
        HStack(spacing: 0) {
          VStack(spacing: 5) {
            ForEach(tools, id: \.0) { tool in
              Button {
                store.tool = tool.0
              } label: {
                Image(systemName: tool.1).frame(width: 25, height: 26).background(
                  store.tool == tool.0 ? Color.accentColor.opacity(0.25) : .clear,
                  in: RoundedRectangle(cornerRadius: 4))
              }.buttonStyle(.plain).help(tool.2)
            }
            Spacer()
            Button {
              if !store.drawings.isEmpty {
                store.drawings.removeLast()
                store.saveDrawings()
              }
            } label: {
              Image(systemName: "arrow.uturn.backward")
            }.help("Usuń ostatni rysunek")
          }.padding(6)
          NativeChart(store: store)
        }
        HStack {
          Text(store.message).lineLimit(1)
          Spacer()
          Text("Rolka: zoom · przeciągnij: przesuwanie · Delete: usuń").lineLimit(1)
        }.font(.caption2).foregroundStyle(.secondary).padding(6)
      }.frame(minWidth: 550)
      VStack {
        Text("ARKUSZ ZLECEŃ").font(.caption.bold()).padding(.top, 12)
        HStack {
          Text("Cena")
          Spacer()
          Text("Wielkość")
        }.font(.caption).foregroundStyle(.secondary)
        ScrollView {
          VStack(spacing: 5) {
            ForEach(store.asks.prefix(15).reversed()) { level in bookRow(level, color: .red) }
            Text("Spread \(num((store.asks.first?.price ?? 0)-(store.bids.first?.price ?? 0),5))")
              .font(.caption).padding(6)
            ForEach(store.bids.prefix(15)) { level in bookRow(level, color: .green) }
          }
        }
      }.padding(.horizontal, 8).frame(minWidth: 150, idealWidth: 175, maxWidth: 220)
    }
  }
  func bookRow(_ level: BookLevel, color: Color) -> some View {
    HStack {
      Text(num(level.price, 4)).foregroundStyle(color)
      Spacer()
      Text(num(level.size, 4))
    }.font(.system(size: 10, design: .monospaced))
  }
}
struct ChartsScreen: View {
  @ViewState<Int> var count = 2
  var body: some View {
    VStack {
      HStack {
        Text("Wykresy · Yahoo Finance").font(.title2.bold())
        Spacer()
        Picker("Układ", selection: $count) {
          Text("1").tag(1)
          Text("2").tag(2)
          Text("4").tag(4)
        }.pickerStyle(.segmented).frame(width: 180)
      }.padding()
      LazyVGrid(
        columns: Array(repeating: GridItem(.flexible()), count: count == 1 ? 1 : 2), spacing: 8
      ) {
        ForEach(0..<count, id: \.self) { i in
          YahooPane(initial: ["NQ1!", "ES1!", "YM1!", "DXY"][i]).frame(
            minHeight: count == 4 ? 280 : 550)
        }
      }.padding(8)
      Spacer(minLength: 0)
    }
  }
}
struct YahooPane: View {
  let initial: String
  @StateObject var store = TerminalStore()
  @ViewState<String> var symbol = ""
  @ViewState<String> var frame = "1d"
  @ViewState<String> var error = ""
  @ViewState<Bool> var loading = false
  @ViewState<UUID> var requestID = UUID()
  func load() async {
    let token = UUID()
    let selected = symbol.uppercased()
    let interval = frame
    requestID = token
    loading = true
    do {
      let bars = try await API.yahoo(
        selected, frame: interval, range: interval == "1h" ? "1mo" : "1y")
      guard requestID == token else { return }
      store.saveDrawings()
      store.coin = selected
      store.frame = interval == "1wk" ? "1w" : interval
      store.candles = bars
      store.drawings = Disk.load(store.drawingKey, as: [Stroke].self) ?? []
      store.drawingsLoaded = true
      error = ""
    } catch { if requestID == token { self.error = error.localizedDescription } }
    if requestID == token { loading = false }
  }
  var body: some View {
    VStack(spacing: 0) {
      HStack {
        TextField("Ticker", text: $symbol).frame(width: 110).onSubmit { Task { await load() } }
        Picker("Interwał", selection: $frame) {
          Text("H1").tag("1h")
          Text("D1").tag("1d")
          Text("W1").tag("1wk")
        }.frame(width: 140).onChange(of: frame) { Task { await load() } }
        Menu("Rysuj") {
          ForEach(
            ["cursor", "trend", "hline", "rect", "brush", "fib", "measure", "text", "erase"],
            id: \.self
          ) { t in Button(t) { store.tool = t } }
        }
        if loading { ProgressView().controlSize(.small) }
        Spacer()
      }.padding(6)
      NativeChart(store: store)
      if !error.isEmpty { Text(error).font(.caption).foregroundStyle(.orange).padding(4) }
    }.background(.quaternary.opacity(0.2)).task {
      symbol = initial
      store.indicators = ["volume"]
      await load()
    }
  }
}

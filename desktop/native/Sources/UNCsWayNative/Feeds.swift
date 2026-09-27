import AVKit
import Foundation
import MapKit
import SwiftUI

struct EconomicEvent: Identifiable {
  let id: String, title: String, country: String, impact: String, date: Date, forecast: String,
    previous: String
}
struct Headline: Identifiable { let id: String, title: String, url: URL?, date: String }
struct MapItem: Identifiable, Codable {
  let id: String, title: String, category: String, latitude: Double, longitude: Double,
    magnitude: Double
  var coordinate: CLLocationCoordinate2D { .init(latitude: latitude, longitude: longitude) }
}
final class RSSParser: NSObject, XMLParserDelegate {
  var items: [Headline] = [], inside = false, field = "", title = "", link = "", date = ""
  func parser(
    _ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?,
    qualifiedName qName: String?, attributes attributeDict: [String: String]
  ) {
    field = elementName
    if elementName == "item" {
      inside = true
      title = ""
      link = ""
      date = ""
    }
  }
  func parser(_ parser: XMLParser, foundCharacters string: String) {
    guard inside else { return }
    switch field {
    case "title": title += string
    case "link": link += string
    case "pubDate": date += string
    default: break
    }
  }
  func parser(
    _ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?,
    qualifiedName qName: String?
  ) {
    if elementName == "item" {
      items.append(
        Headline(id: link.isEmpty ? title : link, title: title, url: URL(string: link), date: date))
      inside = false
    }
    field = ""
  }
}
@MainActor final class FeedStore: ObservableObject {
  @Published var events: [EconomicEvent] = []
  @Published var news: [Headline] = []
  @Published var monitorNews: [Headline] = []
  @Published var mapItems: [MapItem] = []
  @Published var errors: [String: String] = [:]
  @Published var busy = Set<String>()
  func calendar(next: Bool = false) async {
    busy.insert("calendar")
    defer { busy.remove("calendar") }
    do {
      let suffix = next ? "nextweek" : "thisweek"
      let json = try await API.json("https://nfs.faireconomy.media/ff_calendar_\(suffix).json")
      let rows = json as? [[String: Any]] ?? []
      let parser = ISO8601DateFormatter()
      events = rows.enumerated().compactMap { i, r in
        guard let date = parser.date(from: r["date"] as? String ?? "") else { return nil }
        return EconomicEvent(
          id: "\(i)-\(date.timeIntervalSince1970)", title: r["title"] as? String ?? "",
          country: r["country"] as? String ?? "", impact: r["impact"] as? String ?? "", date: date,
          forecast: r["forecast"] as? String ?? "", previous: r["previous"] as? String ?? "")
      }.sorted { $0.date < $1.date }
      errors["calendar"] = nil
    } catch { errors["calendar"] = error.localizedDescription }
  }
  func headlines() async {
    busy.insert("news")
    defer { busy.remove("news") }
    do {
      let d = try await API.data("https://www.financialjuice.com/feed.ashx?xy=rss")
      let delegate = RSSParser()
      let parser = XMLParser(data: d)
      parser.delegate = delegate
      guard parser.parse() else { throw APIError(message: "Nieprawidłowy kanał RSS") }
      news = delegate.items
      errors["news"] = nil
    } catch { errors["news"] = error.localizedDescription }
  }
  func monitor() async {
    busy.insert("monitor")
    defer { busy.remove("monitor") }
    var items: [MapItem] = MonitorReference.items
    var failures: [String] = []
    do {
      let j =
        try await API.json(
          "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson")
        as? [String: Any]
      for f in j?["features"] as? [[String: Any]] ?? [] {
        let p = f["properties"] as? [String: Any] ?? [:]
        let g = f["geometry"] as? [String: Any] ?? [:]
        let c = g["coordinates"] as? [Double] ?? []
        if c.count > 1 {
          items.append(
            MapItem(
              id: f["id"] as? String ?? UUID().uuidString,
              title: p["title"] as? String ?? "Trzęsienie ziemi", category: "Trzęsienia",
              latitude: c[1], longitude: c[0], magnitude: value(p["mag"])))
        }
      }
    } catch { failures.append("USGS: \(error.localizedDescription)") }
    do {
      let j =
        try await API.json("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7&limit=200")
        as? [String: Any]
      for e in j?["events"] as? [[String: Any]] ?? [] {
        if let g = (e["geometry"] as? [[String: Any]])?.last, let c = g["coordinates"] as? [Double],
          c.count > 1
        {
          items.append(
            MapItem(
              id: e["id"] as? String ?? UUID().uuidString,
              title: e["title"] as? String ?? "Zdarzenie", category: "NASA EONET", latitude: c[1],
              longitude: c[0], magnitude: 0))
        }
      }
    } catch { failures.append("NASA: \(error.localizedDescription)") }
    do {
      let j = try await API.json("https://api.adsb.lol/v2/mil") as? [String: Any]
      for a in j?["ac"] as? [[String: Any]] ?? [] {
        if let lat = a["lat"] as? Double, let lon = a["lon"] as? Double {
          items.append(
            MapItem(
              id: a["hex"] as? String ?? UUID().uuidString,
              title: (a["flight"] as? String ?? "Samolot") + " · " + (a["t"] as? String ?? ""),
              category: "Lotnictwo", latitude: lat, longitude: lon, magnitude: 0))
        }
      }
    } catch { failures.append("ADSB: \(error.localizedDescription)") }
    mapItems = items
    do {
      let json =
        try await API.json(
          "https://api.weather.gov/alerts/active?status=actual&severity=Extreme,Severe")
        as? [String: Any]
      items += weatherPoints(json, category: "Alerty USA")
    } catch { failures.append("NOAA: \(error.localizedDescription)") }
    mapItems = items
    do {
      let json =
        try await API.json(
          "https://api.weather.gc.ca/collections/weather-alerts/items?f=json&limit=300")
        as? [String: Any]
      items += weatherPoints(json, category: "Alerty Kanada")
    } catch { failures.append("Kanada: \(error.localizedDescription)") }
    mapItems = items
    do {
      let query = "(war OR attack OR missile OR military OR strike) sourcelang:english"
        .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!
      let json =
        try await API.json(
          "https://api.gdeltproject.org/api/v2/doc/doc?query=\(query)&mode=artlist&maxrecords=25&format=json&sort=datedesc&timespan=7d"
        ) as? [String: Any]
      monitorNews = (json?["articles"] as? [[String: Any]] ?? []).compactMap { row in
        guard let link = row["url"] as? String, let title = row["title"] as? String else {
          return nil
        }
        return Headline(
          id: link, title: title, url: URL(string: link), date: row["seendate"] as? String ?? "")
      }
    } catch { failures.append("GDELT: \(error.localizedDescription)") }
    errors["monitor"] = failures.isEmpty ? nil : failures.joined(separator: "\n")
  }
}
func weatherPoints(_ json: [String: Any]?, category: String) -> [MapItem] {
  func coordinates(_ value: Any?) -> [[Double]] {
    if let pair = value as? [Double], pair.count >= 2 { return [pair] }
    return (value as? [Any] ?? []).flatMap { coordinates($0) }
  }
  return (json?["features"] as? [[String: Any]] ?? []).compactMap { feature in
    let geometry = feature["geometry"] as? [String: Any] ?? [:]
    let points = coordinates(geometry["coordinates"])
    guard !points.isEmpty else { return nil }
    let p = feature["properties"] as? [String: Any] ?? [:]
    let title =
      p["headline"] as? String ?? p["event"] as? String ?? p["alert_type"] as? String
      ?? "Alert pogodowy"
    return MapItem(
      id: category + (feature["id"] as? String ?? UUID().uuidString), title: title,
      category: category, latitude: points.map { $0[1] }.reduce(0, +) / Double(points.count),
      longitude: points.map { $0[0] }.reduce(0, +) / Double(points.count), magnitude: 0)
  }
}

func exportICS(title: String, start: Date, end: Date) {
  let formatter = DateFormatter()
  formatter.dateFormat = "yyyyMMdd'T'HHmmss'Z'"
  formatter.timeZone = TimeZone(secondsFromGMT: 0)
  let safe = title.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(
    of: "\n", with: "\\n"
  ).replacingOccurrences(of: ",", with: "\\,").replacingOccurrences(of: ";", with: "\\;")
  let body =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//UNCsWay Native//PL\r\nBEGIN:VEVENT\r\nUID:\(UUID())@uncsway\r\nDTSTAMP:\(formatter.string(from:Date()))\r\nDTSTART:\(formatter.string(from:start))\r\nDTEND:\(formatter.string(from:end))\r\nSUMMARY:\(safe)\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n"
  let panel = NSSavePanel()
  panel.nameFieldStringValue = "Wydarzenie.ics"
  if panel.runModal() == .OK, let url = panel.url {
    try? body.write(to: url, atomically: true, encoding: .utf8)
  }
}
struct CalendarScreen: View {
  @ObservedObject var feed: FeedStore
  @ViewState<String> var country = "USD"
  @ViewState<String> var impact = "Wszystkie"
  @ViewState<Bool> var next = false
  @ViewState<String> var query = ""
  var filtered: [EconomicEvent] {
    feed.events.filter {
      (country == "Wszystkie" || $0.country == country)
        && (impact == "Wszystkie" || $0.impact == impact)
        && (query.isEmpty || $0.title.localizedCaseInsensitiveContains(query))
    }
  }
  var body: some View {
    VStack(alignment: .leading) {
      HStack {
        Text("Kalendarz ekonomiczny").font(.title2.bold())
        Spacer()
        Toggle("Następny tydzień", isOn: $next).onChange(of: next) {
          Task { await feed.calendar(next: next) }
        }
        Button("Odśwież") { Task { await feed.calendar(next: next) } }
      }
      HStack {
        Picker("Kraj", selection: $country) {
          ForEach(["Wszystkie", "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF"], id: \.self) {
            Text($0)
          }
        }
        Picker("Wpływ", selection: $impact) {
          ForEach(["Wszystkie", "High", "Medium", "Low", "Holiday"], id: \.self) { Text($0) }
        }
        TextField("Szukaj wydarzenia", text: $query)
      }
      if let error = feed.errors["calendar"] { Text(error).foregroundStyle(.orange) }
      if feed.busy.contains("calendar") { ProgressView() }
      Table(filtered) {
        TableColumn("Data") { Text($0.date.formatted(date: .abbreviated, time: .shortened)) }.width(
          170)
        TableColumn("Kraj", value: \.country).width(50)
        TableColumn("Wpływ") {
          Text($0.impact).foregroundStyle($0.impact == "High" ? .red : .secondary)
        }.width(80)
        TableColumn("Wydarzenie", value: \.title)
        TableColumn("Prognoza", value: \.forecast).width(80)
        TableColumn("Poprzednio", value: \.previous).width(80)
        TableColumn("Eksport") { e in
          Button {
            exportICS(title: e.title, start: e.date, end: e.date.addingTimeInterval(1800))
          } label: {
            Image(systemName: "calendar.badge.plus")
          }
        }.width(60)
      }
      Text("Źródło: Forex Factory · godziny w strefie systemowej").font(.caption).foregroundStyle(
        .secondary)
    }.padding().task { if feed.events.isEmpty { await feed.calendar() } }
  }
}
struct NewsScreen: View {
  @ObservedObject var feed: FeedStore
  @ViewState<String> var query = ""
  var body: some View {
    VStack {
      HStack {
        Text("Wydarzenia · FinancialJuice").font(.title2.bold())
        Spacer()
        TextField("Szukaj", text: $query).frame(width: 220)
        Button("Odśwież") { Task { await feed.headlines() } }
      }
      if let error = feed.errors["news"] { Text(error).foregroundStyle(.orange) }
      if feed.busy.contains("news") { ProgressView() }
      List(feed.news.filter { query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) }) {
        n in
        VStack(alignment: .leading, spacing: 6) {
          Text(n.title).font(.headline).textSelection(.enabled)
          HStack {
            Text(n.date).font(.caption).foregroundStyle(.secondary)
            Spacer()
            if let url = n.url { Link("Otwórz źródło ↗", destination: url) }
          }
        }.padding(.vertical, 7)
      }
    }.padding().task { if feed.news.isEmpty { await feed.headlines() } }
  }
}
struct MonitorScreen: View {
  @ObservedObject var feed: FeedStore
  @ViewState<String> var category = "Wszystkie"
  @ViewState<String?> var selected: String?
  var items: [MapItem] {
    feed.mapItems.filter { category == "Wszystkie" || $0.category == category }
  }
  var body: some View {
    VStack {
      HStack {
        Text("Monitor świata").font(.title2.bold())
        Picker("Warstwa", selection: $category) {
          ForEach(["Wszystkie"] + Array(Set(feed.mapItems.map(\.category))).sorted(), id: \.self) {
            Text($0)
          }
        }.frame(width: 260)
        Spacer()
        if feed.busy.contains("monitor") { ProgressView().controlSize(.small) }
        Button("Odśwież") { Task { await feed.monitor() } }
      }
      if let error = feed.errors["monitor"] { Text(error).font(.caption).foregroundStyle(.orange) }
      HSplitView {
        Map(selection: $selected) {
          ForEach(items.prefix(1000)) { item in
            Marker(
              item.title,
              systemImage: item.category == "Lotnictwo" ? "airplane" : "exclamationmark.triangle",
              coordinate: item.coordinate
            ).tint(item.category == "Lotnictwo" ? .blue : .orange).tag(item.id)
          }
        }.mapStyle(.imagery(elevation: .flat)).mapControls {
          MapCompass()
          MapScaleView()
        }
        List(items.prefix(2000), selection: $selected) { item in
          VStack(alignment: .leading) {
            Text(item.title)
            Text(item.category).font(.caption).foregroundStyle(.secondary)
          }.tag(item.id)
        }.frame(minWidth: 220, idealWidth: 300, maxWidth: 350)
      }
      if !feed.monitorNews.isEmpty {
        DisclosureGroup("Doniesienia · GDELT") {
          ScrollView {
            VStack(alignment: .leading) {
              ForEach(feed.monitorNews) { item in
                if let url = item.url { Link(item.title, destination: url).lineLimit(2) }
              }
            }
          }.frame(height: 120)
        }
      }
      Text("USGS · NASA EONET · adsb.lol · NOAA · Kanada · GDELT · punkty referencyjne z projektu")
        .font(
          .caption
        ).foregroundStyle(.secondary)
    }.padding().task { if feed.mapItems.isEmpty { await feed.monitor() } }
  }
}
struct TVScreen: View {
  @ViewState<String> var url = UserDefaults.standard.string(forKey: "native.tv") ?? ""
  @ViewState<AVPlayer?> var player: AVPlayer?
  @ViewState<String> var error = ""
  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Telewizja").font(.title2.bold())
      HStack {
        TextField("Adres strumienia HLS (.m3u8)", text: $url)
        Button("Odtwórz") {
          guard let u = URL(string: url), ["https", "http"].contains(u.scheme ?? "") else {
            error = "Podaj adres HTTP(S) strumienia HLS."
            return
          }
          UserDefaults.standard.set(url, forKey: "native.tv")
          player = AVPlayer(url: u)
          player?.play()
          error = ""
        }
      }
      if !error.isEmpty { Text(error).foregroundStyle(.orange) }
      if let player {
        VideoPlayer(player: player)
      } else {
        ContentUnavailableView(
          "Odtwarzacz natywny", systemImage: "play.tv",
          description: Text(
            "Wklej bezpośredni adres strumienia. YouTube nie udostępnia tego samego odtwarzacza jako natywne AVPlayer."
          ))
      }
      Link(
        "Bloomberg TV — otwórz transmisję w przeglądarce",
        destination: URL(string: "https://www.youtube.com/@markets/live")!)
    }.padding().onDisappear { player?.pause() }
  }
}

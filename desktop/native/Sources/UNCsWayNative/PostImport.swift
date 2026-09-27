import Foundation

extension PostProject {
  static func read(_ data: Data) throws -> PostProject {
    if let native = try? JSONDecoder().decode(PostProject.self, from: data) {
      return try native.validated()
    }
    guard let document = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      document["version"] as? Int == 2, let charts = document["charts"] as? [[String: Any]]
    else { throw APIError(message: "Nieznany format projektu.") }
    func image(_ value: Any?) -> Data? {
      guard let url = value as? String, url.hasPrefix("data:image/"),
        let comma = url.firstIndex(of: ",")
      else { return nil }
      return Data(base64Encoded: String(url[url.index(after: comma)...]))
    }
    var p = PostProject()
    p.mode = document["activePanel"] as? String == "aura" ? "Aura" : "Wykresy"
    p.ticker = document["ticker"] as? String ?? p.ticker
    p.timeframe = document["timeframe"] as? String ?? p.timeframe
    p.name = document["displayName"] as? String ?? p.name
    p.handle = document["handle"] as? String ?? p.handle
    p.avatar = image(document["avatar"])
    p.photo = image(document["background"])
    p.showProfile = document["showHeader"] as? Bool ?? true
    p.showBadge = document["showBadge"] as? Bool ?? true
    p.format = "Poziomy"
    p.layers = charts.compactMap { row in
      guard let data = image(row["data"]) else { return nil }
      let width = value(row["width"])
      let height = value(row["height"])
      return PostLayer(
        name: row["name"] as? String ?? "Obraz", data: data, x: value(row["x"]) + width / 2,
        y: value(row["y"]) + height / 2, width: width, height: height,
        opacity: (row["opacity"] as? Double) ?? 1)
    }
    if p.mode == "Aura", let a = document["aura"] as? [String: Any] {
      p.ticker = a["ticker"] as? String ?? p.ticker
      p.ticks = a["ticks"] as? String ?? p.ticks
      p.rr = a["rr"] as? String ?? p.rr
      p.white = !["#000", "#000000", "black"].contains(
        (a["textColor"] as? String ?? "").lowercased())
      p.photo = image(a["photo"])
      p.zoom = a["zoom"] as? Double ?? 1
      p.dim = a["dim"] as? Double ?? 0
      p.margin = a["footerMargin"] as? Double ?? 0.035
      p.showProfile = a["showBrand"] as? Bool ?? true
      p.showResult = (a["showRR"] as? Bool ?? true) || (a["showTicks"] as? Bool ?? true)
      p.showDate = a["showDate"] as? Bool ?? true
      p.showBadge = a["showIcon"] as? Bool ?? true
      let height = value(a["height"])
      p.format = height == 2160 ? "1:1" : height == 2700 ? "4:5" : height == 3840 ? "9:16" : "3:4"
      let f = DateFormatter()
      f.locale = Locale(identifier: "en_US_POSIX")
      f.dateFormat = "yyyy-MM-dd"
      if let date = f.date(from: a["date"] as? String ?? "") { p.date = date }
    }
    return try p.validated()
  }
  func validated() throws -> PostProject {
    guard version == 1, [zoom, dim, margin].allSatisfy(\.isFinite), (1...4).contains(zoom),
      (0...1).contains(dim), (0...0.25).contains(margin), layers.count <= 100,
      layers.allSatisfy({
        [$0.x, $0.y, $0.width, $0.height, $0.opacity].allSatisfy(\.isFinite) && $0.width > 0
          && $0.width <= 4 && $0.height > 0 && $0.height <= 4 && (0...1).contains($0.opacity)
      })
    else { throw APIError(message: "Nieprawidłowe parametry dokumentu.") }
    return self
  }
}

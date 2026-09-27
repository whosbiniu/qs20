import AppKit
import SwiftUI

struct NativeChart: NSViewRepresentable {
  @ObservedObject var store: TerminalStore
  var override: [Candle]? = nil
  func makeNSView(context: Context) -> ChartSurface { ChartSurface(store: store) }
  func updateNSView(_ view: ChartSurface, context: Context) {
    view.bars = override ?? store.candles
    view.needsDisplay = true
  }
}
@MainActor final class ChartSurface: NSView {
  let store: TerminalStore
  var bars: [Candle] = [], visible = 120.0, offset = 0.0, pending: [PricePoint] = [],
    anchor: NSPoint?, originalOffset = 0.0, hover: NSPoint?, selected: UUID?, currentCoin = "",
    editing: NSTextField?
  var range: (Double, Double) = (0, 1), start = 0, end = 0, plot = CGRect.zero
  override var isFlipped: Bool { true }
  override var acceptsFirstResponder: Bool { true }
  init(store: TerminalStore) {
    self.store = store
    super.init(frame: .zero)
  }
  required init?(coder: NSCoder) { fatalError() }
  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    trackingAreas.forEach(removeTrackingArea)
    addTrackingArea(
      NSTrackingArea(
        rect: bounds,
        options: [.mouseMoved, .mouseEnteredAndExited, .activeInKeyWindow, .inVisibleRect],
        owner: self))
  }
  func x(_ time: Double) -> Double {
    guard bars.count > 1 else { return plot.minX }
    var a = 0
    var b = bars.count - 1
    while b - a > 1 {
      let m = (a + b) / 2
      if bars[m].time <= time { a = m } else { b = m }
    }
    let index = Double(a) + (time - bars[a].time) / max(1, bars[b].time - bars[a].time)
    return plot.minX + (index - Double(start) + 0.5) / Double(max(1, end - start)) * plot.width
  }
  func y(_ p: Double) -> Double { plot.maxY - (p - range.0) / (range.1 - range.0) * plot.height }
  func point(_ location: NSPoint) -> PricePoint? {
    guard bars.count > 1 else { return nil }
    let index =
      Double(start) + (location.x - plot.minX) / plot.width * Double(max(1, end - start)) - 0.5
    let i = max(0, min(bars.count - 2, Int(floor(index))))
    let t = bars[i].time + (index - Double(i)) * (bars[i + 1].time - bars[i].time)
    return PricePoint(
      time: t, price: range.0 + (plot.maxY - location.y) / plot.height * (range.1 - range.0))
  }
  let ink = NSColor(calibratedWhite: 0.85, alpha: 1),
    green = NSColor(calibratedRed: 0.35, green: 0.78, blue: 0.62, alpha: 1),
    red = NSColor(calibratedRed: 0.88, green: 0.4, blue: 0.46, alpha: 1)
  func text(
    _ s: String, _ p: NSPoint, _ color: NSColor = .secondaryLabelColor, _ size: CGFloat = 10
  ) {
    (s as NSString).draw(
      at: p,
      withAttributes: [
        .font: NSFont.monospacedSystemFont(ofSize: size, weight: .regular), .foregroundColor: color,
      ])
  }
  func line(_ a: NSPoint, _ b: NSPoint, _ color: NSColor, _ width: CGFloat = 1) {
    color.setStroke()
    let p = NSBezierPath()
    p.lineWidth = width
    p.move(to: a)
    p.line(to: b)
    p.stroke()
  }
  func rect(_ r: CGRect, _ c: NSColor) {
    c.setFill()
    r.fill()
  }
  override func draw(_ dirtyRect: NSRect) {
    rect(bounds, NSColor(calibratedRed: 0.035, green: 0.045, blue: 0.06, alpha: 1))
    guard bars.count > 1 else {
      text("Oczekiwanie na dane…", NSPoint(x: 24, y: 50))
      return
    }
    if currentCoin != store.coin {
      currentCoin = store.coin
      offset = 0
      visible = 120
    }
    offset = min(offset, Double(max(0, bars.count - 10)))
    end = max(2, bars.count - Int(offset))
    start = max(0, end - Int(visible))
    let shown = Array(bars[start..<end])
    plot = CGRect(
      x: 10, y: 36, width: max(100, bounds.width - 92), height: max(100, bounds.height - 68))
    let lo = shown.map(\.low).min() ?? 0
    let hi = shown.map(\.high).max() ?? 1
    let padding = max((hi - lo) * 0.13, hi * 0.001)
    range = (lo - padding, hi + padding)
    for i in 0...6 {
      let value = range.0 + (range.1 - range.0) * Double(i) / 6
      let y = y(value)
      line(
        NSPoint(x: plot.minX, y: y), NSPoint(x: plot.maxX, y: y),
        NSColor.white.withAlphaComponent(0.07))
      text(num(value, 4), NSPoint(x: plot.maxX + 7, y: y - 6))
    }
    let strideBy = max(1, shown.count / max(1, Int(plot.width / 110)))
    for i in Swift.stride(from: 0, to: shown.count, by: strideBy) {
      let b = shown[i]
      let date = Date(timeIntervalSince1970: b.time)
      text(
        date.formatted(
          .dateTime.month(.twoDigits).day(.twoDigits).hour(.twoDigits(amPM: .omitted))),
        NSPoint(x: x(b.time) - 25, y: plot.maxY + 8), .secondaryLabelColor, 9)
    }
    NSGraphicsContext.saveGraphicsState()
    NSBezierPath(rect: plot).addClip()
    let spacing = plot.width / Double(shown.count)
    let candleWidth = max(1, min(20, spacing * 0.65))
    if store.indicators.contains("vpvr"), let p = candleProfile(shown) {
      drawProfile(p, tpo: false)
    }
    if store.indicators.contains("vpsv") {
      for group in Dictionary(grouping: bars, by: { bucket($0.time, "1d") }).values
      where group.last!.time >= shown.first!.time && group.first!.time <= shown.last!.time {
        if let p = candleProfile(group) { drawProfile(p, tpo: false, atStart: true) }
      }
    }
    if store.indicators.contains("heatmap") { drawHeatmap() }
    if store.indicators.contains("tpo") {
      for p in store.profiles where p.end >= shown.first!.time && p.start <= shown.last!.time {
        drawProfile(p, tpo: true)
      }
    }
    if store.indicators.contains("profile"), let p = store.volumeProfile {
      drawProfile(p, tpo: false)
    }
    let maximum = max(1, shown.map(\.volume).max() ?? 1)
    for b in shown {
      let xpos = x(b.time)
      let c = b.close >= b.open ? green : red
      if store.indicators.contains("volume") {
        let h = b.volume / maximum * plot.height * 0.1
        rect(
          CGRect(x: xpos - candleWidth / 2, y: plot.maxY - h, width: candleWidth, height: h),
          c.withAlphaComponent(0.45))
      }
      line(NSPoint(x: xpos, y: y(b.high)), NSPoint(x: xpos, y: y(b.low)), c)
      rect(
        CGRect(
          x: xpos - candleWidth / 2, y: min(y(b.open), y(b.close)), width: candleWidth,
          height: max(1, abs(y(b.open) - y(b.close)))), c)
      if store.indicators.contains("bubbles") && b.volume > maximum * 0.25 {
        let r = sqrt(b.volume / maximum) * 12
        c.withAlphaComponent(0.2).setFill()
        NSBezierPath(ovalIn: CGRect(x: xpos - r, y: y(b.close) - r, width: r * 2, height: r * 2))
          .fill()
      }
    }
    if store.indicators.contains("vwap") { drawVWAP() }
    if store.indicators.contains("avwap") {
      drawVWAP(anchor: store.anchorDate.timeIntervalSince1970)
    }
    if store.indicators.contains("funding") {
      drawSeries(store.fundingHistory, label: "Funding %", color: .systemPink, lane: 0.54)
    }
    if store.indicators.contains("levels") { drawLevels() }
    if store.indicators.contains("delta") { drawFlow() }
    if store.indicators.contains("footprint") { drawFootprint(spacing: spacing) }
    if store.indicators.contains("depth") || store.indicators.contains("obprofile") {
      for (list, color) in [(store.bids, green), (store.asks, red)] {
        var cumulative = 0.0
        let values = list.map { level -> (Double, Double) in
          cumulative += level.size
          return (level.price, store.indicators.contains("depth") ? cumulative : level.size)
        }
        let maximum = max(0.00001, values.map { $0.1 }.max() ?? 1)
        for (price, size) in values {
          rect(
            CGRect(
              x: plot.maxX - size / maximum * 90, y: y(price), width: size / maximum * 90, height: 2
            ), color.withAlphaComponent(0.7))
        }
      }
    }
    if store.indicators.contains("oi") {
      drawSeries(
        store.oiHistory, label: "OI (próbki od uruchomienia)", color: .systemCyan, lane: 0.3)
    }
    if store.indicators.contains("pulse") {
      drawSeries(
        store.flows.map { ($0.time, Double($0.count)) }, label: "Transakcje / świecę",
        color: .systemPurple, lane: 0.42)
    }
    for d in store.drawings { drawStroke(d, selected: d.id == selected) }
    if !pending.isEmpty { drawStroke(Stroke(tool: store.tool, points: pending), selected: false) }
    if let h = hover, plot.contains(h) {
      line(
        NSPoint(x: h.x, y: plot.minY), NSPoint(x: h.x, y: plot.maxY), ink.withAlphaComponent(0.25))
      line(
        NSPoint(x: plot.minX, y: h.y), NSPoint(x: plot.maxX, y: h.y), ink.withAlphaComponent(0.25))
    }
    NSGraphicsContext.restoreGraphicsState()
    var status = "\(store.coin) · \(store.frame) · \(store.indicators.count) indykatorów"
    if store.indicators.contains("funding"), let m = store.market {
      status += " · Funding \(num(m.funding*100,5))%"
    }
    if store.indicators.contains("oi"), let m = store.market { status += " · OI \(num(m.oi))" }
    if store.indicators.contains("pulse") { status += " · \(store.trades.count) transakcji" }
    text(status, NSPoint(x: 12, y: 10), ink, 11)
    if let time = hover.flatMap(point)?.time,
      let bar = bars.min(by: { abs($0.time - time) < abs($1.time - time) })
    {
      if store.indicators.contains("ohlc") {
        text(
          "O \(num(bar.open)) H \(num(bar.high)) L \(num(bar.low)) C \(num(bar.close)) V \(num(bar.volume))",
          NSPoint(x: 14, y: 30), ink, 10)
      }
      if store.indicators.contains("barstats") {
        text(
          "Zakres \(num(bar.high-bar.low)) · Korpus \(num(abs(bar.close-bar.open))) · Knot ↑ \(num(bar.high-max(bar.open,bar.close))) ↓ \(num(min(bar.open,bar.close)-bar.low))",
          NSPoint(x: 14, y: 45), ink, 10)
      }
    }
    if let p = hover.flatMap(point) {
      text(
        num(p.price, 5),
        NSPoint(x: plot.maxX + 6, y: min(plot.maxY - 12, max(plot.minY, hover!.y))), .white)
    }
  }
  func drawProfile(_ p: Profile, tpo: Bool, atStart: Bool = false) {
    let left = tpo || atStart
    let a = x(p.start)
    let width = left ? min(150, max(4, (x(p.end) - a) * 0.65)) : 130
    let maxValue = max(1, p.rows.map { tpo ? Double($0.count) : $0.total }.max() ?? 1)
    for (i, r) in p.rows.enumerated() {
      let w = (tpo ? Double(r.count) : r.total) / maxValue * width
      let top = y(r.price + p.step)
      let h = max(1, y(r.price) - top - 1)
      let c: NSColor =
        i == p.poc ? .systemYellow : i >= p.lower && i <= p.upper ? .systemBlue : .gray
      rect(
        CGRect(x: left ? a : plot.maxX - w, y: top, width: w, height: h), c.withAlphaComponent(0.42)
      )
    }
    for (label, price) in [
      ("POC", p.rows[p.poc].price), ("VAH", p.rows[p.upper].price + p.step),
      ("VAL", p.rows[p.lower].price),
    ] {
      let xx = left ? a : plot.maxX - width
      line(
        NSPoint(x: xx, y: y(price)), NSPoint(x: xx + width, y: y(price)),
        ink.withAlphaComponent(0.5))
      text(label, NSPoint(x: xx + width - 28, y: y(price) - 12), ink, 9)
    }
  }
  func drawHeatmap() {
    for snapshot in store.bookHistory {
      let levels = snapshot.bids + snapshot.asks
      let maximum = max(0.00001, levels.map(\.size).max() ?? 1)
      for level in levels {
        rect(
          CGRect(
            x: x(snapshot.time), y: y(level.price),
            width: max(2, x(snapshot.time + 5) - x(snapshot.time)), height: 3),
          NSColor.systemOrange.withAlphaComponent(min(0.6, level.size / maximum * 0.6)))
      }
    }
  }
  func drawVWAP(anchor: Double? = nil) {
    var pv = 0.0
    var volume = 0.0
    var squares = 0.0
    var day = -1.0
    var previous: [NSPoint?] = [nil, nil, nil]
    for b in bars {
      if let anchor, b.time < anchor { continue }
      let current = anchor == nil ? floor(b.time / 86400) : 0
      if current != day {
        pv = 0
        volume = 0
        squares = 0
        previous = [nil, nil, nil]
        day = current
      }
      let p = (b.high + b.low + b.close) / 3
      pv += p * b.volume
      volume += b.volume
      squares += p * p * b.volume
      guard volume > 0 else { continue }
      let average = pv / volume
      let deviation = sqrt(max(0, squares / volume - average * average))
      for (i, v) in [average, average + deviation, average - deviation].enumerated() {
        let next = NSPoint(x: x(b.time), y: y(v))
        if let last = previous[i] {
          line(last, next, NSColor.systemBlue.withAlphaComponent(i == 0 ? 1 : 0.4), i == 0 ? 2 : 1)
        }
        previous[i] = next
      }
    }
  }
  func drawLevels() {
    guard let last = bars.last else { return }
    for (frame, name) in [("1d", "D"), ("1w", "W"), ("1M", "M")] {
      let key = bucket(last.time, frame)
      let previousKey = bars.last(where: { $0.time < key }).map { bucket($0.time, frame) }
      for (period, prefix) in [(key, name), (previousKey ?? -1, "Prev " + name)] where period >= 0 {
        let selected = bars.filter { bucket($0.time, frame) == period }
        guard let first = selected.first, let high = selected.map(\.high).max(),
          let low = selected.map(\.low).min()
        else { continue }
        for (label, p) in [
          ("\(prefix) High", high), ("\(prefix) Low", low), ("\(prefix) Open", first.open),
        ] {
          line(
            NSPoint(x: plot.minX, y: y(p)), NSPoint(x: plot.maxX, y: y(p)),
            .systemOrange.withAlphaComponent(0.5))
          text(label, NSPoint(x: plot.maxX - 105, y: y(p) - 13), .systemOrange)
        }
      }
    }
  }
  func drawSeries(_ values: [(Double, Double)], label: String, color: NSColor, lane: Double) {
    let points = values.filter { x($0.0) >= plot.minX && x($0.0) <= plot.maxX }
    guard let low = points.map({ $0.1 }).min(), let high = points.map({ $0.1 }).max() else {
      return
    }
    let base = plot.maxY - plot.height * lane
    let height = plot.height * 0.08
    var previous: NSPoint?
    for (time, value) in points {
      let next = NSPoint(x: x(time), y: base - (value - low) / max(high - low, 0.0000001) * height)
      if let previous { line(previous, next, color, 1.5) }
      previous = next
    }
    text(
      "\(label) · \(num(points.last!.1,5))", NSPoint(x: plot.minX + 5, y: base - height - 13),
      color, 9)
  }
  func drawFlow() {
    let maximum = max(0.00001, store.flows.map { abs($0.delta) }.max() ?? 1)
    let cvMax = max(0.00001, store.flows.map { abs($0.cvd) }.max() ?? 1)
    let base = plot.maxY - plot.height * 0.16
    let height = plot.height * 0.06
    var previous: NSPoint?
    for b in store.flows {
      let xx = x(b.time)
      let deltaHeight = b.delta / maximum * height
      let p = NSPoint(x: xx, y: base - b.cvd / cvMax * height)
      rect(
        CGRect(
          x: xx - 3, y: min(base, base - deltaHeight), width: 6, height: max(1, abs(deltaHeight))),
        b.delta >= 0 ? green : red)
      if let previous { line(previous, p, .systemYellow, 1.5) }
      previous = p
    }
    text("Δ / CVD — zakres zebranych transakcji", NSPoint(x: 14, y: base - height - 15), ink, 9)
  }
  func drawFootprint(spacing: Double) {
    guard let profile = store.volumeProfile else { return }
    for b in store.flows {
      for r in b.levels.values {
        let top = y(r.price + profile.step)
        let h = y(r.price) - top
        let xx = x(b.time)
        let w = min(90, max(2, spacing * 0.8))
        rect(
          CGRect(x: xx - w / 2, y: top, width: w, height: max(1, h - 1)),
          (r.ask >= r.bid ? green : red).withAlphaComponent(0.25))
        if w >= 60 && h >= 12 {
          text("\(num(r.bid,2)) × \(num(r.ask,2))", NSPoint(x: xx - w / 2 + 2, y: top), ink, 9)
        }
      }
    }
  }
  func drawStroke(_ d: Stroke, selected: Bool) {
    guard let first = d.points.first else { return }
    let points = d.points.map { NSPoint(x: x($0.time), y: y($0.price)) }
    let a = points[0]
    let b = points.last!
    ink.setStroke()
    let path = NSBezierPath()
    path.lineWidth = selected ? 2.5 : 1.5
    switch d.tool {
    case "hline":
      path.move(to: NSPoint(x: plot.minX, y: a.y))
      path.line(to: NSPoint(x: plot.maxX, y: a.y))
    case "vline":
      path.move(to: NSPoint(x: a.x, y: plot.minY))
      path.line(to: NSPoint(x: a.x, y: plot.maxY))
    case "rect":
      path.appendRect(
        CGRect(x: min(a.x, b.x), y: min(a.y, b.y), width: abs(b.x - a.x), height: abs(b.y - a.y)))
      ink.withAlphaComponent(0.08).setFill()
      path.fill()
    case "fib":
      for f in [0.0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] {
        let yy = b.y + (a.y - b.y) * f
        path.move(to: NSPoint(x: min(a.x, b.x), y: yy))
        path.line(to: NSPoint(x: max(a.x, b.x), y: yy))
        text(num(f, 3), NSPoint(x: max(a.x, b.x) + 3, y: yy), ink)
      }
    case "text": text(d.text, a, ink, 13)
    case "brush":
      path.lineJoinStyle = .round
      path.lineCapStyle = .round
      path.move(to: a)
      if points.count > 2 {
        for i in 1..<points.count - 1 {
          let mid = NSPoint(
            x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2)
          let prev = path.currentPoint
          path.curve(
            to: mid,
            controlPoint1: NSPoint(
              x: prev.x + (points[i].x - prev.x) * 2 / 3, y: prev.y + (points[i].y - prev.y) * 2 / 3
            ),
            controlPoint2: NSPoint(
              x: mid.x + (points[i].x - mid.x) * 2 / 3, y: mid.y + (points[i].y - mid.y) * 2 / 3))
        }
      }
      path.line(to: b)
    default:
      path.move(to: a)
      path.line(to: b)
      if d.tool == "measure", let last = d.points.last {
        text("Δ \(num(last.price-first.price,4)) · \(num((last.price/first.price-1)*100))%", b, ink)
      }
    }
    path.stroke()
    if selected {
      for q in [a, b] { rect(CGRect(x: q.x - 3, y: q.y - 3, width: 6, height: 6), .systemBlue) }
    }
  }
  override func mouseDown(with event: NSEvent) {
    window?.makeFirstResponder(self)
    let pos = convert(event.locationInWindow, from: nil)
    guard plot.contains(pos), let p = point(pos) else { return }
    anchor = pos
    originalOffset = offset
    if store.tool == "cursor" {
      selected = store.drawings.min(by: { distance($0, pos) < distance($1, pos) }).flatMap {
        distance($0, pos) < 10 ? $0.id : nil
      }
      needsDisplay = true
      return
    }
    if store.tool == "erase" {
      if let d = store.drawings.min(by: { distance($0, pos) < distance($1, pos) }),
        distance(d, pos) < 12
      {
        store.drawings.removeAll { $0.id == d.id }
        store.saveDrawings()
      }
      needsDisplay = true
      return
    }
    if store.tool == "text" {
      let field = NSTextField(frame: CGRect(x: pos.x, y: pos.y, width: 200, height: 24))
      field.placeholderString = "Tekst · Enter"
      field.target = self
      field.action = #selector(commitText)
      addSubview(field)
      editing = field
      pending = [p]
      window?.makeFirstResponder(field)
      return
    }
    pending = [p]
    if ["hline", "vline"].contains(store.tool) { finish() }
    needsDisplay = true
  }
  func distance(_ d: Stroke, _ p: NSPoint) -> Double {
    let pts = d.points.map { NSPoint(x: x($0.time), y: y($0.price)) }
    guard let a = pts.first else { return .infinity }
    if d.tool == "hline" { return abs(p.y - a.y) }
    if d.tool == "vline" { return abs(p.x - a.x) }
    if pts.count == 1 { return hypot(p.x - a.x, p.y - a.y) }
    return zip(pts, pts.dropFirst()).map { a, b in
      let dx = b.x - a.x
      let dy = b.y - a.y
      let t = max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / max(1, dx * dx + dy * dy)))
      return hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
    }.min() ?? .infinity
  }
  @objc func commitText() {
    if let editing, !pending.isEmpty {
      store.drawings.append(Stroke(tool: "text", points: pending, text: editing.stringValue))
      store.saveDrawings()
    }
    editing?.removeFromSuperview()
    editing = nil
    pending = []
    store.tool = "cursor"
    window?.makeFirstResponder(self)
    needsDisplay = true
  }
  override func mouseDragged(with event: NSEvent) {
    let pos = convert(event.locationInWindow, from: nil)
    if store.tool == "cursor", let anchor {
      offset = max(
        0,
        min(
          Double(max(0, bars.count - 10)),
          originalOffset + (pos.x - anchor.x) / plot.width * Double(end - start)))
      needsDisplay = true
      return
    }
    guard let p = point(pos), !pending.isEmpty else { return }
    if store.tool == "brush" {
      if pending.count < 10000 { pending.append(p) }
    } else {
      pending = [pending[0], p]
    }
    needsDisplay = true
  }
  override func mouseUp(with event: NSEvent) {
    if !pending.isEmpty && store.tool != "text" {
      if pending.count > 1 { finish() } else { pending = [] }
    }
    anchor = nil
    needsDisplay = true
  }
  func finish() {
    let d = Stroke(tool: store.tool, points: pending)
    store.drawings.append(d)
    selected = d.id
    pending = []
    store.saveDrawings()
    if store.tool != "brush" { store.tool = "cursor" }
    needsDisplay = true
  }
  override func mouseMoved(with event: NSEvent) {
    hover = convert(event.locationInWindow, from: nil)
    needsDisplay = true
  }
  override func mouseExited(with event: NSEvent) {
    hover = nil
    needsDisplay = true
  }
  override func scrollWheel(with event: NSEvent) {
    if abs(event.scrollingDeltaX) > abs(event.scrollingDeltaY) {
      offset = max(0, offset + event.scrollingDeltaX / 5)
    } else {
      visible = max(15, min(1500, visible * exp(event.scrollingDeltaY * 0.012)))
    }
    needsDisplay = true
  }
  override func magnify(with event: NSEvent) {
    visible = max(15, min(1500, visible * (1 - event.magnification)))
    needsDisplay = true
  }
  override func keyDown(with event: NSEvent) {
    if event.keyCode == 53 {
      pending = []
      store.tool = "cursor"
    }
    if [51, 117].contains(event.keyCode), let selected {
      store.drawings.removeAll { $0.id == selected }
      store.saveDrawings()
      self.selected = nil
    }
    needsDisplay = true
  }
}

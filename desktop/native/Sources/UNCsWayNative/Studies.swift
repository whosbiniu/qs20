import Foundation

/// OHLCV estimate: distributes each candle's volume by price overlap.
/// This is intentionally separate from the executed-trade profile.
func candleProfile(_ candles: [Candle]) -> Profile? {
  guard let first = candles.first, let last = candles.last,
    let low = candles.map(\.low).min(), let high = candles.map(\.high).max()
  else { return nil }
  let step = high > low ? (high - low) / 32 : max(abs(low) * 1e-6, 1e-8)
  var rows = (0..<32).map { ProfileRow(price: low + Double($0) * step) }
  for candle in candles where candle.volume > 0 {
    if candle.high == candle.low {
      let i = max(0, min(31, Int((candle.low - low) / step)))
      if candle.close >= candle.open {
        rows[i].ask += candle.volume
      } else {
        rows[i].bid += candle.volume
      }
    } else {
      for i in rows.indices {
        let overlap = max(
          0, min(candle.high, rows[i].price + step) - max(candle.low, rows[i].price))
        let share = candle.volume * overlap / (candle.high - candle.low)
        if candle.close >= candle.open { rows[i].ask += share } else { rows[i].bid += share }
      }
    }
  }
  return profile(
    rows, start: first.time,
    end: last.time + max(1, candles.count > 1 ? last.time - candles[candles.count - 2].time : 3600),
    step: step, tpo: false)
}
struct BookSnapshot {
  var time: Double
  var bids: [BookLevel]
  var asks: [BookLevel]
}

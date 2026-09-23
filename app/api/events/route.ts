import snapshot from "./snapshot.json"

export const dynamic = "force-dynamic"

type CalendarEvent = {
  title: string
  date: string
  impact: string
  forecast: string
  previous: string
}

type BankHoliday = {
  title: string
  date: string
  country: string
  impact: string
}

function isBankHoliday(event: { impact?: unknown; title?: unknown }) {
  if (String(event.impact || "") !== "Holiday") return false
  return !/daylight saving/i.test(String(event.title || ""))
}

let calendarCache: { data: unknown; expires: number } | null = null
let retryAfter = 0

function fallback() {
  return Response.json(
    { ...snapshot, stale: true },
    { headers: { "Cache-Control": "private, max-age=60" } },
  )
}

export async function GET() {
  if (Date.now() < retryAfter) return fallback()
  if (calendarCache && Date.now() < calendarCache.expires) {
    return Response.json(calendarCache.data, {
      headers: { "Cache-Control": "private, max-age=60" },
    })
  }

  try {
    const response = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: "application/json" },
    })
    if (!response.ok) throw new Error("upstream HTTP " + response.status)
    const data = await response.json()
    if (!Array.isArray(data)) throw new Error("format")

    const dated = data.filter(
      (e) => typeof e.title === "string" && Number.isFinite(Date.parse(e.date)),
    )
    const events: CalendarEvent[] = dated
      .filter((e) => e.country === "USD")
      .map((e) => ({
        title: e.title,
        date: e.date,
        impact: String(e.impact || ""),
        forecast: String(e.forecast || ""),
        previous: String(e.previous || ""),
      }))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))

    const holidays: BankHoliday[] = dated
      .filter(isBankHoliday)
      .map((e) => ({
        title: String(e.title),
        date: e.date,
        country: String(e.country || ""),
        impact: "Holiday",
      }))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))

    const payload = { events, holidays, updatedAt: new Date().toISOString() }
    calendarCache = { data: payload, expires: Date.now() + 900000 }
    return Response.json(payload, {
      headers: { "Cache-Control": "private, max-age=60" },
    })
  } catch (error) {
    console.error("[v0] Calendar fetch failed:", (error as Error).message)
    retryAfter = Date.now() + 3600000
    return fallback()
  }
}

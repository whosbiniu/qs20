import snapshot from "./snapshot.json"

export const dynamic = "force-dynamic"

type CalendarEvent = {
  title: string
  date: string
  impact: string
  forecast: string
  previous: string
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

    const events: CalendarEvent[] = data
      .filter(
        (e) =>
          e.country === "USD" &&
          typeof e.title === "string" &&
          Number.isFinite(Date.parse(e.date)),
      )
      .map((e) => ({
        title: e.title,
        date: e.date,
        impact: String(e.impact || ""),
        forecast: String(e.forecast || ""),
        previous: String(e.previous || ""),
      }))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))

    const payload = { events, updatedAt: new Date().toISOString() }
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

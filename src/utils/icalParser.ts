/**
 * Pure client-side parser for iCalendar (.ics) format files.
 * Extracts VEVENT items and transforms them to workspace CalendarEvent format.
 */

export interface ParsedICalEvent {
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  durationMinutes: number;
  category: "work" | "personal" | "meeting" | "urgent";
  description?: string;
  location?: string;
}

function parseICSDate(raw: string): { date: string; time: string; timestamp: number } {
  // Handles: 20261107T093000Z or 20261107T093000 or 20261107
  const cleaned = raw.trim().replace(/^.*:/, "");
  
  if (cleaned.length >= 8 && !cleaned.includes("T")) {
    // All-day date (YYYYMMDD)
    const y = cleaned.substring(0, 4);
    const m = cleaned.substring(4, 6);
    const d = cleaned.substring(6, 8);
    const dt = new Date(`${y}-${m}-${d}T09:00:00`);
    return {
      date: `${y}-${m}-${d}`,
      time: "09:00",
      timestamp: dt.getTime()
    };
  }

  // DateTime format: YYYYMMDDTHHMMSS[Z]
  const match = cleaned.match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const [, y, m, d, hh, mm] = match;
    const dateStr = `${y}-${m}-${d}`;
    const timeStr = `${hh}:${mm}`;
    const dt = new Date(`${dateStr}T${timeStr}:00`);
    return {
      date: dateStr,
      time: timeStr,
      timestamp: dt.getTime()
    };
  }

  const fallback = new Date();
  return {
    date: fallback.toISOString().split("T")[0],
    time: "09:00",
    timestamp: fallback.getTime()
  };
}

function unescapeICS(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

export function parseICSContent(icsText: string): ParsedICalEvent[] {
  // Normalize line endings and unfold lines (iCal RFC 5545 specifies lines starting with space or tab are continuation)
  const unfolded = icsText.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
  const lines = unfolded.split(/\r\n|\n|\r/);

  const events: ParsedICalEvent[] = [];
  let inEvent = false;
  let currentEvent: any = {};

  for (let line of lines) {
    line = line.trim();
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      currentEvent = {};
      continue;
    }

    if (line === "END:VEVENT") {
      if (inEvent && currentEvent.SUMMARY) {
        const startInfo = currentEvent.DTSTART ? parseICSDate(currentEvent.DTSTART) : null;
        const endInfo = currentEvent.DTEND ? parseICSDate(currentEvent.DTEND) : null;

        if (startInfo) {
          let duration = 60;
          if (endInfo && endInfo.timestamp > startInfo.timestamp) {
            duration = Math.max(15, Math.round((endInfo.timestamp - startInfo.timestamp) / (1000 * 60)));
          }

          // Category heuristic from summary/category
          const rawCat = (currentEvent.CATEGORIES || currentEvent.SUMMARY || "").toLowerCase();
          let category: "work" | "personal" | "meeting" | "urgent" = "personal";
          if (rawCat.includes("meeting") || rawCat.includes("call") || rawCat.includes("sync")) {
            category = "meeting";
          } else if (rawCat.includes("work") || rawCat.includes("project") || rawCat.includes("task")) {
            category = "work";
          } else if (rawCat.includes("urgent") || rawCat.includes("exam") || rawCat.includes("deadline")) {
            category = "urgent";
          }

          events.push({
            title: unescapeICS(currentEvent.SUMMARY),
            date: startInfo.date,
            time: startInfo.time,
            durationMinutes: duration,
            category,
            description: currentEvent.DESCRIPTION ? unescapeICS(currentEvent.DESCRIPTION) : undefined,
            location: currentEvent.LOCATION ? unescapeICS(currentEvent.LOCATION) : undefined,
          });
        }
      }
      inEvent = false;
      currentEvent = {};
      continue;
    }

    if (inEvent) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > -1) {
        let key = line.substring(0, colonIndex);
        const value = line.substring(colonIndex + 1);

        // Strip parameters e.g. DTSTART;VALUE=DATE -> DTSTART
        if (key.includes(";")) {
          key = key.split(";")[0];
        }

        currentEvent[key] = value;
      }
    }
  }

  return events;
}

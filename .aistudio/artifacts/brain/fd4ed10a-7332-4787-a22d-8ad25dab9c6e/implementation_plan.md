# Calendar Import: Google Calendar & Local File (.ics)

Add dual import capabilities to **Calendar & Plan** allowing users to import external schedules seamlessly:
1. **Google Calendar Import**: One-click import and synchronization of events from the user's primary Google Calendar using the Google Calendar API.
2. **Local File Import (.ics)**: Drag-and-drop or file upload for iCalendar standard `.ics` export files (Apple Calendar, Outlook, Google Calendar backups, or university/corporate schedules).
3. **Direct Merge**: Both import options automatically normalize event dates, categories, and times, saving them directly into the user's personal Firestore `calendar_events` collection with duplicate avoidance.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Confirmed Option**: Both Google Calendar live sync and local iCal (.ics) file import are included.
> - **Direct Merge**: Imported events are merged and saved directly to your Firestore calendar in real time.
> - **Google Calendar OAuth**: Google Calendar read-only scope (`https://www.googleapis.com/auth/calendar.events.readonly`) will be requested alongside existing Gmail access.

---

## 1. Overview & Core Features

- **Google Calendar Sync**:
  - Connects to Google Calendar API using the authenticated user's Google token.
  - Fetches events across the active month or upcoming 30 days.
  - Automatically maps summary, date/time, description, and location into the workspace format.
- **Local File (.ics) Import**:
  - File picker accepting `.ics` / `text/calendar` files.
  - Pure client-side parsing of `BEGIN:VEVENT`, `SUMMARY`, `DTSTART`, `DTEND`, `DESCRIPTION`, and `LOCATION`.
  - Instant batch upload into Firestore with visual progress feedback.
- **Duplicate Prevention**:
  - Checks existing events for matching title and start timestamp to prevent double-booking.

---

## 2. Technical Architecture & Integration Flow

```
                      User Choice
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
    [Import from Google]         [Upload .ics File]
             │                           │
  Google Calendar API v3          Client-side iCal Parser
  GET /calendars/primary/events   Reads VEVENT blocks
             │                           │
             └─────────────┬─────────────┘
                           │
            Normalize to CalendarEvent schema
            (title, date, time, duration, category)
                           │
                           ▼
          Batch Save to Firestore (calendar_events)
                           │
                           ▼
              Real-time Monthly Grid Update
```

---

## 3. Implementation Steps

1. **OAuth Setup for Google Calendar**:
   - Register `https://www.googleapis.com/auth/calendar.events.readonly` using the `set_up_oauth` tool.
   - Update `AuthService.ts` and `firebase.ts` with the new Calendar scope.
2. **iCal (.ics) Parser Utility (`src/utils/icalParser.ts`)**:
   - Lightweight, standalone iCalendar parser supporting standard date-time formats (`DTSTART:20261107T090000Z`, `DTSTART;VALUE=DATE:20261107`).
3. **Calendar Page UI Upgrades (`src/pages/CalendarPlan.tsx`)**:
   - Add **"Import Kalendar"** dropdown button in the top action header next to "Tambah Acara".
   - Options:
     - 🗓️ **Import dari Google Calendar** (Fetches events directly via Google API).
     - 📁 **Muat Naik Fail iCal (.ics)** (Opens native file picker).
   - Display a clean import summary toast showing how many events were successfully merged.
4. **Compile & Lint Verification**:
   - Verify build and TypeScript checks pass.

import { useState, useEffect, useRef } from "react";
import { 
  Calendar as CalendarIcon, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Trash2, 
  MapPin, 
  CheckCircle2, 
  AlertCircle,
  Download,
  Upload,
  FileText,
  Loader2
} from "lucide-react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { AuthService } from "../services/AuthService";
import { parseICSContent, ParsedICalEvent } from "../utils/icalParser";

export interface CalendarEvent {
  id: string;
  ownerId: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  durationMinutes: number;
  category: "work" | "personal" | "meeting" | "urgent";
  description?: string;
  location?: string;
  createdAt: any;
}

const CATEGORY_STYLES = {
  work: { text: "text-blue-600", bg: "bg-blue-50 border-blue-200", label: "Work" },
  personal: { text: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Personal" },
  meeting: { text: "text-purple-600", bg: "bg-purple-50 border-purple-200", label: "Meeting" },
  urgent: { text: "text-rose-600", bg: "bg-rose-50 border-rose-200", label: "Urgent" },
};

export default function CalendarPlan() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportDropdown, setShowImportDropdown] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [formDate, setFormDate] = useState(selectedDate);
  const [formTime, setFormTime] = useState("09:00");
  const [duration, setDuration] = useState("60");
  const [category, setCategory] = useState<"work" | "personal" | "meeting" | "urgent">("work");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Listen for live events from Firestore
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const q = query(
      collection(db, "calendar_events"),
      where("ownerId", "==", user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: CalendarEvent[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CalendarEvent, "id">)
      }));
      // Sort in memory to avoid requiring a composite index in Firestore
      items.sort((a, b) => {
        const dateComp = (a.date || "").localeCompare(b.date || "");
        if (dateComp !== 0) return dateComp;
        return (a.time || "").localeCompare(b.time || "");
      });
      setEvents(items);
      setLoading(false);
    }, (err) => {
      console.error("Firestore calendar error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim()) return;

    setSubmitting(true);
    try {
      await addDoc(collection(db, "calendar_events"), {
        ownerId: user.uid,
        title: title.trim(),
        date: formDate,
        time: formTime,
        durationMinutes: parseInt(duration) || 60,
        category,
        description: description.trim(),
        location: location.trim(),
        createdAt: serverTimestamp()
      });

      setShowAddModal(false);
      setTitle("");
      setDescription("");
      setLocation("");
      setNotification({ type: "success", text: "Acara berjaya dimasukkan ke jadual!" });
      setTimeout(() => setNotification(null), 3000);
    } catch (err: any) {
      console.error("Gagal menambah acara:", err);
      setNotification({ type: "error", text: "Gagal menyimpan acara: " + err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Padam acara ini dari kalendar?")) return;
    try {
      await deleteDoc(doc(db, "calendar_events", eventId));
    } catch (err: any) {
      alert("Gagal memadam acara: " + err.message);
    }
  };

  // --- IMPORT: Local iCalendar (.ics) File ---
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsImporting(true);
    setNotification({ type: "info", text: "Membaca fail .ics dan memproses acara..." });

    try {
      const text = await file.text();
      const parsed = parseICSContent(text);

      if (parsed.length === 0) {
        throw new Error("Tiada acara sah dijumpai dalam fail .ics tersebut.");
      }

      await mergeAndSaveEvents(parsed);
      setNotification({
        type: "success",
        text: `Berjaya mengimport ${parsed.length} acara dari fail ${file.name} ke kalendar anda!`
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err: any) {
      console.error("iCal Import Error:", err);
      setNotification({
        type: "error",
        text: "Gagal mengimport fail kalendar: " + (err.message || err)
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setShowImportDropdown(false);
    }
  };

  // --- IMPORT: Google Calendar API Live Sync ---
  const handleGoogleCalendarImport = async () => {
    if (!user) return;
    setIsImporting(true);
    setShowImportDropdown(false);
    setNotification({ type: "info", text: "Menyambung ke Google Calendar API..." });

    try {
      let accessToken = AuthService.getGoogleAccessToken();
      if (!accessToken) {
        setNotification({ type: "info", text: "Sila sahkan kebenaran akaun Google anda..." });
        accessToken = await AuthService.requestGoogleAccess();
      }

      // Fetch upcoming & past events for a wide window (last 60 days to next 180 days)
      const now = new Date();
      const timeMin = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const timeMax = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();

      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=100`;

      let response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        }
      });

      // If token expired, request fresh permission
      if (response.status === 401) {
        setNotification({ type: "info", text: "Menyegarkan token Google Calendar..." });
        accessToken = await AuthService.requestGoogleAccess();
        response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        });
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Google Calendar API returned status ${response.status}`);
      }

      const data = await response.json();
      const googleItems = data.items || [];

      if (googleItems.length === 0) {
        setNotification({
          type: "info",
          text: "Tiada acara ditemui dalam Google Calendar utama anda untuk tempoh ini."
        });
        setIsImporting(false);
        return;
      }

      // Map Google Calendar events to workspace format
      const mappedEvents: ParsedICalEvent[] = googleItems
        .filter((g: any) => g.summary && (g.start?.dateTime || g.start?.date))
        .map((g: any) => {
          let dateStr = "";
          let timeStr = "09:00";
          let durationMin = 60;

          if (g.start.dateTime) {
            const dt = new Date(g.start.dateTime);
            dateStr = dt.toISOString().split("T")[0];
            const hh = String(dt.getHours()).padStart(2, "0");
            const mm = String(dt.getMinutes()).padStart(2, "0");
            timeStr = `${hh}:${mm}`;

            if (g.end?.dateTime) {
              const endDt = new Date(g.end.dateTime);
              durationMin = Math.max(15, Math.round((endDt.getTime() - dt.getTime()) / (1000 * 60)));
            }
          } else if (g.start.date) {
            dateStr = g.start.date;
            timeStr = "09:00";
          }

          // Heuristic category
          const sumLow = g.summary.toLowerCase();
          let cat: "work" | "personal" | "meeting" | "urgent" = "work";
          if (sumLow.includes("meet") || sumLow.includes("call") || sumLow.includes("sync")) {
            cat = "meeting";
          } else if (sumLow.includes("birthday") || sumLow.includes("flight") || sumLow.includes("holiday")) {
            cat = "personal";
          } else if (sumLow.includes("urgent") || sumLow.includes("deadline")) {
            cat = "urgent";
          }

          return {
            title: g.summary,
            date: dateStr,
            time: timeStr,
            durationMinutes: durationMin,
            category: cat,
            description: g.description || undefined,
            location: g.location || undefined
          };
        });

      await mergeAndSaveEvents(mappedEvents);
      setNotification({
        type: "success",
        text: `Berjaya mengimport ${mappedEvents.length} acara dari Google Calendar!`
      });
      setTimeout(() => setNotification(null), 5000);
    } catch (err: any) {
      console.error("Google Calendar Sync Error:", err);
      setNotification({
        type: "error",
        text: "Gagal menyegerak Google Calendar: " + (err.message || err)
      });
    } finally {
      setIsImporting(false);
    }
  };

  // Helper to batch save non-duplicate events into Firestore
  const mergeAndSaveEvents = async (incoming: ParsedICalEvent[]) => {
    if (!user) return;

    // Build deduplication keys set: title + date + time
    const existingKeys = new Set(
      events.map((e) => `${e.title.trim().toLowerCase()}__${e.date}__${e.time}`)
    );

    let addedCount = 0;
    for (const item of incoming) {
      const key = `${item.title.trim().toLowerCase()}__${item.date}__${item.time}`;
      if (existingKeys.has(key)) {
        continue; // Skip duplicate
      }

      await addDoc(collection(db, "calendar_events"), {
        ownerId: user.uid,
        title: item.title,
        date: item.date,
        time: item.time,
        durationMinutes: item.durationMinutes || 60,
        category: item.category || "personal",
        description: item.description || "",
        location: item.location || "",
        createdAt: serverTimestamp()
      });
      existingKeys.add(key);
      addedCount++;
    }

    return addedCount;
  };

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const jumpToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today.toISOString().split("T")[0]);
  };

  const monthNames = [
    "Januari", "Februari", "Mac", "April", "Mei", "Jun",
    "Julai", "Ogos", "September", "Oktober", "November", "Disember"
  ];

  // Selected date events
  const selectedDayEvents = events.filter((e) => e.date === selectedDate);

  const openCreateModalForDate = (dateStr: string) => {
    setFormDate(dateStr);
    setSelectedDate(dateStr);
    setShowAddModal(true);
  };

  return (
    <div className="flex h-full flex-col p-6 sm:p-8 bg-slate-50 overflow-y-auto">
      {/* Hidden file input for .ics import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".ics,text/calendar"
        className="hidden"
      />

      {/* Top Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
              <CalendarIcon className="h-5 w-5" />
            </div>
            Calendar & Plan
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Jadual perancangan masa nyata dan pengurusan acara peribadi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={jumpToday}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors"
          >
            Hari Ini (Today)
          </button>

          {/* Import Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowImportDropdown(!showImportDropdown)}
              disabled={isImporting}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {isImporting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-600" />
              ) : (
                <Download className="h-3.5 w-3.5 text-purple-600" />
              )}
              {isImporting ? "Mengimport..." : "Import Kalendar"}
            </button>

            {showImportDropdown && (
              <div className="absolute right-0 mt-1.5 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg z-20 animate-in fade-in zoom-in-95 duration-100">
                <button
                  onClick={handleGoogleCalendarImport}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-800 hover:bg-purple-50 hover:text-purple-700 transition-colors"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-100 text-purple-600">
                    <CalendarIcon className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="block font-semibold">Google Calendar</span>
                    <span className="block text-[10px] text-slate-400">Import terus dari akaun Google</span>
                  </div>
                </button>

                <button
                  onClick={() => {
                    fileInputRef.current?.click();
                  }}
                  className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-medium text-slate-800 hover:bg-purple-50 hover:text-purple-700 transition-colors"
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-600">
                    <Upload className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="block font-semibold">Fail Tempatan (.ics)</span>
                    <span className="block text-[10px] text-slate-400">Pilih fail iCalendar dari peranti</span>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => openCreateModalForDate(selectedDate)}
            className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-purple-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Tambah Acara
          </button>
        </div>
      </div>

      {notification && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border p-3.5 text-sm shrink-0 ${
          notification.type === "success" 
            ? "border-purple-200 bg-purple-50 text-purple-800" 
            : notification.type === "info"
            ? "border-blue-200 bg-blue-50 text-blue-800"
            : "border-rose-200 bg-rose-50 text-rose-800"
        }`}>
          {notification.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : notification.type === "info" ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{notification.text}</span>
        </div>
      )}

      {/* Main Grid: Month View + Day Details Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Month View (2 cols on large screen) */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">
              {monthNames[month]} {year}
            </h2>
            <div className="flex items-center gap-1.5">
              <button
                onClick={prevMonth}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                title="Bulan sebelumnya"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={nextMonth}
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                title="Bulan seterusnya"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            <span>Aha</span>
            <span>Isn</span>
            <span>Sel</span>
            <span>Rab</span>
            <span>Kha</span>
            <span>Jum</span>
            <span>Sab</span>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty slots for offset */}
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} className="h-20 sm:h-24 rounded-lg bg-slate-50/50 p-1" />
            ))}

            {/* Days of current month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const dayEvents = events.filter((e) => e.date === dateStr);
              const isSelected = selectedDate === dateStr;
              const isToday = new Date().toISOString().split("T")[0] === dateStr;

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`group relative h-20 sm:h-24 rounded-lg p-1.5 transition-all cursor-pointer border flex flex-col justify-between ${
                    isSelected 
                      ? "border-purple-500 bg-purple-50/40 shadow-xs" 
                      : isToday 
                      ? "border-purple-200 bg-white" 
                      : "border-slate-100 hover:border-slate-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`h-6 w-6 rounded-full text-xs font-semibold flex items-center justify-center font-mono ${
                      isToday 
                        ? "bg-purple-600 text-white" 
                        : isSelected 
                        ? "text-purple-700 font-bold" 
                        : "text-slate-700"
                    }`}>
                      {dayNum}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openCreateModalForDate(dateStr);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-purple-600 font-bold p-0.5 hover:bg-purple-100 rounded"
                      title="Tambah acara pada hari ini"
                    >
                      +
                    </button>
                  </div>

                  {/* Event previews */}
                  <div className="mt-1 space-y-1 overflow-hidden">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={`truncate rounded px-1 text-[10px] font-medium ${CATEGORY_STYLES[ev.category]?.bg || "bg-slate-100"} ${CATEGORY_STYLES[ev.category]?.text || "text-slate-700"}`}
                      >
                        {ev.time} {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <span className="text-[9px] font-medium text-slate-400 block px-1">
                        +{dayEvents.length - 2} lagi
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Day Agenda View */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <span className="text-xs uppercase font-semibold text-slate-400">Jadual Hari Ini</span>
              <h3 className="text-base font-bold text-slate-900 font-mono">
                {selectedDate}
              </h3>
            </div>
            <button
              onClick={() => openCreateModalForDate(selectedDate)}
              className="rounded-lg bg-purple-50 p-2 text-purple-600 hover:bg-purple-100 transition-colors"
              title="Tambah acara ke tarikh ini"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-slate-400">Memuatkan jadual...</p>
            ) : selectedDayEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-10 w-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-2">
                  <Clock className="h-5 w-5" />
                </div>
                <p className="text-xs text-slate-500">Tiada acara untuk tarikh ini.</p>
                <button
                  onClick={() => openCreateModalForDate(selectedDate)}
                  className="mt-2 text-xs font-semibold text-purple-600 hover:underline"
                >
                  + Rancang acara sekarang
                </button>
              </div>
            ) : (
              selectedDayEvents.map((ev) => (
                <div
                  key={ev.id}
                  className={`rounded-xl border p-3.5 shadow-xs transition-all ${CATEGORY_STYLES[ev.category]?.bg || "bg-slate-50"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 leading-snug">
                      {ev.title}
                    </span>
                    <button
                      onClick={() => handleDeleteEvent(ev.id)}
                      className="rounded p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      title="Padam acara"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center gap-3 text-xs text-slate-500 font-mono">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-slate-400" />
                      {ev.time} ({ev.durationMinutes} min)
                    </div>
                    {ev.location && (
                      <div className="flex items-center gap-1 font-sans">
                        <MapPin className="h-3 w-3 text-slate-400" />
                        {ev.location}
                      </div>
                    )}
                  </div>

                  {ev.description && (
                    <p className="mt-2 text-xs text-slate-600 font-sans border-t border-slate-200/50 pt-1.5">
                      {ev.description}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">Tambah Acara Kalendar</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddEvent} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Tajuk Acara *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="cth. Perjumpaan Pasukan Projek"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-purple-500 focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Tarikh *
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Masa Mula *
                  </label>
                  <input
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Tempoh (Minit)
                  </label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-purple-500 focus:outline-hidden"
                  >
                    <option value="15">15 minit</option>
                    <option value="30">30 minit</option>
                    <option value="45">45 minit</option>
                    <option value="60">1 jam</option>
                    <option value="90">1.5 jam</option>
                    <option value="120">2 jam</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                    Kategori
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-purple-500 focus:outline-hidden"
                  >
                    <option value="work">Work (Kerja)</option>
                    <option value="personal">Personal (Peribadi)</option>
                    <option value="meeting">Meeting (Mesyuarat)</option>
                    <option value="urgent">Urgent (Kecemasan)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Lokasi / Pautan Maya (Pilihan)
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="cth. Bilik Mesyuarat A / Google Meet"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  Catatan Tambahan
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Agenda mesyuarat atau peringatan..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 focus:border-purple-500 focus:outline-hidden"
                />
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-purple-500 disabled:opacity-50"
                >
                  {submitting ? "Menyimpan..." : "Simpan Acara"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

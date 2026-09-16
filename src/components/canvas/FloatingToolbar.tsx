import { Pen, Highlighter, StickyNote, Mic, MousePointer2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { AnnotationType } from "../../types/canvas";

interface FloatingToolbarProps {
  activeTool: AnnotationType | "select";
  setActiveTool: (tool: AnnotationType | "select") => void;
  activeColor: string;
  setActiveColor: (color: string) => void;
}

const tools = [
  { id: "select", icon: MousePointer2, label: "Select" },
  { id: "drawing", icon: Pen, label: "Draw" },
  { id: "highlight", icon: Highlighter, label: "Highlight" },
  { id: "sticky", icon: StickyNote, label: "Sticky Note" },
  { id: "audio", icon: Mic, label: "Audio Anchor" },
] as const;

const colors = ["#0f172a", "#ef4444", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

export default function FloatingToolbar({
  activeTool,
  setActiveTool,
  activeColor,
  setActiveColor,
}: FloatingToolbarProps) {
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 rounded-full bg-white/90 p-2 shadow-lg backdrop-blur-md border border-slate-200">
      <div className="flex items-center gap-1 border-r border-slate-200 pr-4">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id as AnnotationType | "select")}
              className={cn(
                "p-2.5 rounded-full transition-all flex items-center justify-center",
                isActive 
                  ? "bg-emerald-100 text-emerald-700" 
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
              title={tool.label}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 pl-2 pr-2">
        {colors.map((color) => (
          <button
            key={color}
            onClick={() => setActiveColor(color)}
            className={cn(
              "h-6 w-6 rounded-full transition-transform",
              activeColor === color ? "scale-125 ring-2 ring-slate-400 ring-offset-2" : "hover:scale-110"
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}

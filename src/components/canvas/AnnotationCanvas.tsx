import { useRef, useEffect, useState } from "react";
import { getStroke } from "perfect-freehand";
import { v4 as uuidv4 } from "uuid";
import { Point, AnnotationType, Annotation } from "../../types/canvas";
import { Mic, StickyNote } from "lucide-react";
import { cn } from "../../lib/utils";

interface AnnotationCanvasProps {
  activeTool: AnnotationType | "select";
  activeColor: string;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  activeAnnotationId: string | null;
  setActiveAnnotationId: (id: string | null) => void;
}

// Convert a perfect-freehand stroke to SVG path data
function getSvgPathFromStroke(stroke: number[][]) {
  if (!stroke.length) return "";
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ["M", ...stroke[0], "Q"]
  );
  d.push("Z");
  return d.join(" ");
}

export default function AnnotationCanvas({
  activeTool,
  activeColor,
  annotations,
  setAnnotations,
  activeAnnotationId,
  setActiveAnnotationId,
}: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);

  // Coordinate math
  const getCoordinates = (e: React.PointerEvent | React.MouseEvent): Point => {
    if (!containerRef.current) return [0, 0, 0.5];
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const pressure = (e as any).pressure !== undefined ? (e as any).pressure : 0.5;
    return [x, y, pressure];
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool === "select") {
      // Background click deselects
      if (e.target === containerRef.current) {
        setActiveAnnotationId(null);
      }
      return;
    }

    if (activeTool === "sticky" || activeTool === "audio") {
      // Place an anchor immediately
      const point = getCoordinates(e);
      const newAnnotation: Annotation = {
        id: uuidv4(),
        type: activeTool,
        x: point[0],
        y: point[1],
        color: activeColor,
        isEncrypted: false,
      };
      setAnnotations((prev) => [...prev, newAnnotation]);
      setActiveAnnotationId(newAnnotation.id);
      return;
    }

    // Start drawing/highlighting
    e.currentTarget.setPointerCapture(e.pointerId);
    setCurrentPoints([getCoordinates(e)]);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    if (activeTool === "select" || activeTool === "sticky" || activeTool === "audio") return;

    setCurrentPoints((prev) => [...prev, getCoordinates(e)]);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeTool === "select" || activeTool === "sticky" || activeTool === "audio") return;
    
    if (currentPoints.length > 0) {
      const newAnnotation: Annotation = {
        id: uuidv4(),
        type: activeTool as AnnotationType,
        points: currentPoints,
        color: activeColor,
        isEncrypted: false,
      };
      setAnnotations((prev) => [...prev, newAnnotation]);
      setActiveAnnotationId(newAnnotation.id);
      setCurrentPoints([]);
    }
  };

  // Render a specific stroke
  const renderStroke = (points: Point[], type: AnnotationType, color: string, id: string, isCurrent = false) => {
    const isHighlight = type === "highlight";
    const isActive = activeAnnotationId === id;
    
    const stroke = getStroke(points, {
      size: isHighlight ? 24 : 6,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: type === "drawing",
    });
    
    const pathData = getSvgPathFromStroke(stroke);

    return (
      <path
        key={id}
        d={pathData}
        fill={color}
        opacity={isHighlight ? 0.4 : 1}
        className={cn(
          "transition-opacity cursor-pointer",
          isActive && !isCurrent ? "drop-shadow-md" : ""
        )}
        onClick={(e) => {
          if (activeTool === "select") {
            e.stopPropagation();
            setActiveAnnotationId(id);
          }
        }}
      />
    );
  };

  // Render Anchors (Sticky, Audio)
  const renderAnchor = (ann: Annotation) => {
    if (!ann.x || !ann.y) return null;
    const isActive = activeAnnotationId === ann.id;
    
    return (
      <div
        key={ann.id}
        className={cn(
          "absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full p-2 text-white shadow-md transition-all hover:scale-110",
          isActive ? "ring-4 ring-white ring-offset-2 scale-110" : ""
        )}
        style={{ left: ann.x, top: ann.y, backgroundColor: ann.color }}
        onClick={(e) => {
          if (activeTool === "select") {
            e.stopPropagation();
            setActiveAnnotationId(ann.id);
          }
        }}
      >
        {ann.type === "sticky" ? <StickyNote className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </div>
    );
  };

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative w-full h-full bg-white overflow-hidden shadow-lg border border-slate-200 rounded-lg",
        activeTool !== "select" ? "cursor-crosshair" : "cursor-default"
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Mock Document Background */}
      <div className="pointer-events-none absolute inset-0 p-12">
        <div className="h-full w-full border-2 border-dashed border-slate-200 rounded-lg flex items-center justify-center bg-slate-50">
          <div className="text-center">
            <h3 className="text-2xl font-bold text-slate-300">Document Canvas</h3>
            <p className="text-slate-400 mt-2">PDF/WASM Renderer Area</p>
          </div>
        </div>
      </div>

      <svg className="absolute inset-0 h-full w-full pointer-events-none">
        {/* Make SVG interactive only where drawn if in select mode */}
        <g style={{ pointerEvents: activeTool === "select" ? "auto" : "none" }}>
          {annotations
            .filter(a => a.type === "highlight" || a.type === "drawing")
            .map(ann => renderStroke(ann.points!, ann.type, ann.color, ann.id))}
        </g>
        {currentPoints.length > 0 && (
          <g>
            {renderStroke(currentPoints, activeTool as AnnotationType, activeColor, "current", true)}
          </g>
        )}
      </svg>

      {/* Render HTML overlays for Sticky and Audio markers */}
      <div className={cn("absolute inset-0 pointer-events-none", activeTool === "select" ? "pointer-events-auto" : "")}>
         {annotations
            .filter(a => a.type === "sticky" || a.type === "audio")
            .map(ann => renderAnchor(ann))}
      </div>
    </div>
  );
}

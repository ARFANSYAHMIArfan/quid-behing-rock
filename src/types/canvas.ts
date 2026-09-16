export type Point = [number, number, number]; // [x, y, pressure]

export type AnnotationType = "highlight" | "drawing" | "sticky" | "audio";

export interface Annotation {
  id: string;
  type: AnnotationType;
  // For drawings and highlights
  points?: Point[];
  // For sticky notes or audio anchors
  x?: number;
  y?: number;
  
  color: string;
  isEncrypted?: boolean; // Indicates if this payload is currently encrypted (mock state for now)
}

export interface Note {
  id: string;
  annotationAnchorId: string; // Links to an Annotation on the canvas
  text: string;
  authorId?: string;
  createdAt: number;
}

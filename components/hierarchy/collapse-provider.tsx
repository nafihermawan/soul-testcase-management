"use client";

import { useCallback, useState } from "react";

type DragType = "project" | "suite";

export function useDragReorder() {
  const [dragType, setDragType] = useState<DragType | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const onDragStart = useCallback((type: DragType, id: string) => {
    setDragType(type);
    setDraggedId(id);
  }, []);

  const onDragEnd = useCallback(() => {
    setDragType(null);
    setDraggedId(null);
  }, []);

  return { dragType, draggedId, onDragStart, onDragEnd };
}

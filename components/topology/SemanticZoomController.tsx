'use client';

import React from 'react';
import { useReactFlow } from 'reactflow';

interface SemanticZoomControllerProps {
  currentZoom?: number;
  onZoomChange?: (zoom: number) => void;
}

export const SemanticZoomController: React.FC<SemanticZoomControllerProps> = ({ 
  onZoomChange 
}) => {
  const { setViewport, getViewport } = useReactFlow();

  const handleZoomIn = () => {
    const { x, y, zoom } = getViewport();
    const newZoom = zoom * 1.2;
    setViewport({ x, y, zoom: newZoom }, { duration: 300 });
    if (onZoomChange) onZoomChange(newZoom);
  };

  const handleZoomOut = () => {
    const { x, y, zoom } = getViewport();
    const newZoom = zoom / 1.2;
    setViewport({ x, y, zoom: newZoom }, { duration: 300 });
    if (onZoomChange) onZoomChange(newZoom);
  };

  return (
    <div className="flex flex-col gap-2 bg-white p-2 rounded-lg shadow-lg border border-gray-200">
      <button
        onClick={handleZoomIn}
        className="w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 rounded text-gray-600 font-bold"
        title="Zoom In"
      >
        +
      </button>
      <button
        onClick={handleZoomOut}
        className="w-8 h-8 flex items-center justify-center bg-gray-50 hover:bg-gray-100 rounded text-gray-600 font-bold"
        title="Zoom Out"
      >
        -
      </button>
    </div>
  );
};

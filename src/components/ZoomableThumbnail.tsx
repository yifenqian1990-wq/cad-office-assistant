import React, { useState, useRef } from 'react';

export function ZoomableThumbnail({ src }: { src: string }) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = -e.deltaY * 0.005;
    setScale(Math.min(Math.max(0.5, scale + zoomFactor), 5));
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  return (
    <div 
      className="w-full h-full relative overflow-hidden cursor-move"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      title="鼠标滚轮缩放，拖拽平移，双击复原"
    >
      <img 
        src={src} 
        alt="" 
        className="w-full h-full object-contain pointer-events-none transition-transform duration-75"
        style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
      />
    </div>
  );
}

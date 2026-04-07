import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { sizeToSpan, type WidgetSize } from '../../constants/dashboardWidgets';

interface Props {
  id: string;
  size: WidgetSize;
  children: React.ReactNode;
}

export const SortableDashboardWidget: React.FC<Props> = ({ id, size, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const span = sizeToSpan(size);

  return (
    <div
      ref={setNodeRef}
      className="dash-widget-slot min-w-0"
      style={{
        gridColumn: `span ${span} / span ${span}`,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 999 : 'auto',
        position: 'relative',
      }}
      {...attributes}
    >
      <button
        type="button"
        {...listeners}
        className="absolute z-10 border-none bg-transparent cursor-grab active:cursor-grabbing"
        style={{
          top: 12,
          right: 12,
          color: 'var(--text-muted)',
          fontSize: 16,
          lineHeight: 1,
          padding: 4,
        }}
        aria-label="Drag to reorder"
      >
        ⠿
      </button>
      {children}
    </div>
  );
};

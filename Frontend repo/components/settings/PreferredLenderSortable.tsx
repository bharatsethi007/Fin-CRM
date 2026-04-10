import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon } from '../common/Icon';

type Props = { items: string[]; onChange: (next: string[]) => void };

type ItemProps = { id: string };

/** Renders one draggable lender order row. */
function SortableItem({ id }: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li ref={setNodeRef} style={style} className="flex items-center justify-between rounded border bg-white p-2 dark:bg-gray-800">
      <span>{id}</span>
      <button type="button" {...attributes} {...listeners} className="cursor-grab"><Icon name="GripVertical" className="h-4 w-4" /></button>
    </li>
  );
}

/** Renders drag-and-drop list for preferred lender order. */
export function PreferredLenderSortable({ items, onChange }: Props) {
  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    onChange(arrayMove(items, oldIndex, newIndex));
  }

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">{items.map((id) => <SortableItem key={id} id={id} />)}</ul>
      </SortableContext>
    </DndContext>
  );
}

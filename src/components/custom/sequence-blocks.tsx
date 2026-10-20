'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Portal } from 'radix-ui';
import {
  closestCenter,
  getClientRect,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ChevronUp, ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SequenceKeyboardSensor } from '@/components/custom/sequence-keyboard-sensor';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import type { SequenceBlock } from '@/lib/preset-library';
import type { Team } from '@/types/veto';
import { cn } from '@/lib/utils';

interface SequenceBlocksProps {
  blocks: SequenceBlock[];
  enabled?: boolean;
  onMove: (id: string, position: number, announce?: boolean) => void;
  onUpdate: (id: string, changes: Partial<SequenceBlock>) => void;
  onRemove: (id: string) => void;
}

const teamLabel = (team: Team) => (team === 'a' ? 'Team 1' : 'Team 2');
const title = (block: SequenceBlock) =>
  block.type === 'pick' ? 'Pick + Side' : 'Ban';

function SortableBlock({
  block,
  index,
  count,
  dropEdge,
  onMove,
  onUpdate,
  onRemove,
}: Omit<SequenceBlocksProps, 'blocks'> & {
  block: SequenceBlock;
  index: number;
  count: number;
  dropEdge: 'before' | 'after' | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });
  return (
    <li
      ref={setNodeRef}
      data-block-id={block.id}
      data-block-index={index}
      data-dragging={isDragging || undefined}
      data-drop-edge={dropEdge ?? undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'relative min-w-0 rounded-lg border border-border bg-card p-3',
        isDragging && 'border-dashed border-accent bg-accent/5'
      )}
    >
      {dropEdge && (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 z-10 h-1 rounded-full bg-accent',
            dropEdge === 'before' ? '-top-2' : '-bottom-2'
          )}
        />
      )}
      <div className={cn('space-y-3', isDragging && 'opacity-20')}>
        <div className="flex items-center gap-1">
          <Button
            ref={setActivatorNodeRef}
            type="button"
            variant="ghost"
            className="size-11 shrink-0 touch-none cursor-grab select-none p-0 active:cursor-grabbing"
            {...attributes}
            {...listeners}
            aria-label={`Move block ${index + 1}: ${block.type}`}
          >
            <GripVertical className="size-5" aria-hidden="true" />
          </Button>
          <span className="mr-auto text-sm font-semibold">{title(block)}</span>
          <Button
            type="button"
            variant="ghost"
            className="size-11 shrink-0 p-0"
            aria-label={`Move block ${index + 1} up`}
            aria-disabled={index === 0}
            onClick={() => {
              if (index > 0) onMove(block.id, index - 1);
            }}
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="size-11 shrink-0 p-0"
            aria-label={`Move block ${index + 1} down`}
            aria-disabled={index === count - 1}
            onClick={() => {
              if (index < count - 1) onMove(block.id, index + 1);
            }}
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="size-11 shrink-0 p-0 hover:text-destructive"
            aria-label={`Remove block ${index + 1}`}
            onClick={() => onRemove(block.id)}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <div
          className={cn(
            'grid gap-3 pl-1',
            block.type === 'pick' ? 'grid-cols-2' : 'grid-cols-1'
          )}
        >
          <label className="text-xs text-muted-foreground">
            {block.type === 'ban' ? 'Who Bans?' : 'Who Picks?'}
            {block.actor ? (
              <span className="mt-1 block min-h-11 rounded-md border border-border px-3 py-2 text-sm">
                Team A (upper bracket)
              </span>
            ) : (
              <Select
                value={block.team}
                onValueChange={(value) => {
                  const team = value as Team;
                  onUpdate(block.id, {
                    team,
                    sideTeam: team === 'a' ? 'b' : 'a',
                  });
                }}
              >
                <SelectTrigger
                  className="mt-1"
                  aria-label={block.type === 'ban' ? 'Who Bans?' : 'Who Picks?'}
                />
                <SelectContent>
                  <SelectItem value="a">Team 1</SelectItem>
                  <SelectItem value="b">Team 2</SelectItem>
                </SelectContent>
              </Select>
            )}
          </label>
          {block.type === 'pick' && (
            <label className="text-xs text-muted-foreground">
              Who chooses Side?
              <Select
                value={block.sideTeam}
                onValueChange={(value) =>
                  onUpdate(block.id, { sideTeam: value as Team })
                }
              >
                <SelectTrigger
                  className="mt-1"
                  aria-label="Who chooses Side?"
                />
                <SelectContent>
                  <SelectItem value="a">Team 1</SelectItem>
                  <SelectItem value="b">Team 2</SelectItem>
                </SelectContent>
              </Select>
            </label>
          )}
        </div>
      </div>
    </li>
  );
}

export function SequenceBlocks({
  blocks,
  enabled = true,
  onMove,
  onUpdate,
  onRemove,
}: SequenceBlocksProps) {
  const contextId = useId();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragActive = useRef(false);
  const keyboardTarget = useRef<string | null>(null);
  const cancelActiveDrag = useCallback(() => {
    keyboardTarget.current = null;
    if (!dragActive.current) return;
    // Cancel the sensor through Escape before hiding or unmounting the editor.
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      })
    );
  }, []);
  useEffect(() => {
    if (!enabled) cancelActiveDrag();
    return cancelActiveDrag;
  }, [enabled, cancelActiveDrag]);
  function keyboardDestination(event: KeyboardEvent, active: string | number) {
    const direction =
      event.code === 'ArrowDown' ? 1 : event.code === 'ArrowUp' ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    const index = blocks.findIndex(
      (block) => block.id === (keyboardTarget.current ?? active)
    );
    if (index < 0) return;
    const target = blocks[index + direction];
    if (!target) return;
    // Keyboard intent is a row identity, not a collision awaiting a scroll event.
    // Keep it synchronous so a quick drop (or another arrow) cannot use stale over.
    keyboardTarget.current = target.id;
    setOverId(target.id);
    return target;
  }
  const keyboardCoordinates: KeyboardCoordinateGetter = (
    event,
    { active, context }
  ) => {
    const target = keyboardDestination(event, active);
    if (!target) return;
    const node = context.droppableContainers.get(target.id)?.node.current;
    node?.scrollIntoView({
      block: 'center',
      inline: 'nearest',
      behavior: 'instant',
    });
    const rect =
      (node ? getClientRect(node, { ignoreTransform: true }) : null) ??
      context.droppableRects.get(target.id);
    if (!rect) return;
    return { x: rect.left, y: rect.top };
  };
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 8 },
    }),
    useSensor(SequenceKeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
    })
  );
  const active = blocks.find((block) => block.id === activeId);
  const activeIndex = blocks.findIndex((block) => block.id === activeId);
  const overIndex = blocks.findIndex((block) => block.id === overId);
  const position = (id: string | number) =>
    blocks.findIndex((block) => block.id === id) + 1;
  return (
    <DndContext
      id={contextId}
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Press Space to pick up a block. Use arrow keys to move, Space to drop, or Escape to cancel.',
        },
        announcements: {
          onDragStart: ({ active }) =>
            `Picked up block ${position(active.id)}. Use arrow keys to move, Space to drop, or Escape to cancel.`,
          onDragOver: ({ over }) => {
            const target = keyboardTarget.current ?? over?.id;
            return target
              ? `Drop position ${position(target)} of ${blocks.length}.`
              : 'Outside the sequence. Return to the list to drop.';
          },
          onDragEnd: ({ over }) => {
            const target = keyboardTarget.current ?? over?.id;
            return target
              ? `Block dropped at position ${position(target)}. Pick and side stay together.`
              : 'Drag canceled. Sequence unchanged.';
          },
          onDragCancel: () => 'Drag canceled. Sequence unchanged.',
        },
      }}
      onDragStart={({ active, activatorEvent }) => {
        dragActive.current = true;
        keyboardTarget.current =
          activatorEvent.type === 'keydown' ? String(active.id) : null;
        setActiveId(String(active.id));
        setOverId(String(active.id));
      }}
      onDragOver={({ over }) =>
        setOverId(keyboardTarget.current ?? (over ? String(over.id) : null))
      }
      onDragCancel={() => {
        dragActive.current = false;
        keyboardTarget.current = null;
        setActiveId(null);
        setOverId(null);
      }}
      onDragEnd={({ active, over }) => {
        dragActive.current = false;
        const targetId = keyboardTarget.current ?? over?.id;
        if (enabled && targetId && active.id !== targetId) {
          const target = blocks.findIndex((block) => block.id === targetId);
          if (target >= 0) onMove(String(active.id), target, false);
        }
        setActiveId(null);
        setOverId(null);
      }}
    >
      <SortableContext
        items={blocks.map((block) => block.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol className="space-y-3">
          {blocks.map((block, index) => (
            <SortableBlock
              key={block.id}
              block={block}
              index={index}
              count={blocks.length}
              dropEdge={
                activeId && overId === block.id && activeId !== block.id
                  ? overIndex < activeIndex
                    ? 'before'
                    : 'after'
                  : null
              }
              onMove={onMove}
              onUpdate={onUpdate}
              onRemove={onRemove}
            />
          ))}
        </ol>
      </SortableContext>
      <Portal.Root>
        <DragOverlay dropAnimation={null}>
          {enabled && active ? (
            <div
              data-testid="sequence-drag-preview"
              aria-hidden="true"
              className="pointer-events-none rounded-lg border border-accent bg-card p-3 text-foreground shadow-xl ring-1 ring-accent/40"
            >
              <div className="mb-3 flex items-center gap-2 font-semibold">
                <GripVertical className="size-5 text-muted-foreground" />
                {title(active)}
              </div>
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <p>
                  {active.type === 'ban' ? 'Who Bans?' : 'Who Picks?'}
                  <br />
                  <strong>
                    {active.actor
                      ? 'Team A (upper bracket)'
                      : teamLabel(active.team)}
                  </strong>
                </p>
                {active.type === 'pick' && (
                  <p>
                    Who chooses Side?
                    <br />
                    <strong>{teamLabel(active.sideTeam)}</strong>
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </Portal.Root>
    </DndContext>
  );
}

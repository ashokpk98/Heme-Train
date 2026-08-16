"use client";

import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  TreeSession,
  TreeSessionBlock,
  TreeSlot,
} from "@/lib/db/queries/programs";
import {
  type ExerciseContext,
  type ResolutionContext,
  resolveSet,
} from "@/lib/domain/prescription";
import { Badge, blockTone, humanize } from "@/components/ui";

const STRUCTURES = [
  "straight",
  "superset",
  "triset",
  "circuit",
  "complex",
  "contrast",
  "emom",
  "amrap",
  "for_time",
  "interval",
] as const;

const BLOCK_TYPES = [
  "warmup",
  "activation",
  "power",
  "main_strength",
  "accessory",
  "conditioning",
  "cooldown",
] as const;

export function SessionCanvas({
  session,
  resolution,
  selectedSetId,
  onSelectSet,
  onAddSlot,
  onDeleteSlot,
  onReorderSlots,
  onUpdateBlock,
  onDeleteBlock,
  onAddBlock,
}: {
  session: TreeSession;
  resolution: ResolutionContext;
  selectedSetId: string | null;
  onSelectSet: (slotId: string, setId: string) => void;
  onAddSlot: (sessionBlockId: string) => void;
  onDeleteSlot: (slotId: string) => void;
  onReorderSlots: (sessionBlockId: string, orderedIds: string[]) => void;
  onUpdateBlock: (blockId: string, patch: Record<string, unknown>) => void;
  onDeleteBlock: (blockId: string) => void;
  onAddBlock: () => void;
}) {
  return (
    <div className="space-y-3">
      {session.blocks.map((block) => (
        <SessionBlockCard
          key={block.id}
          block={block}
          resolution={resolution}
          selectedSetId={selectedSetId}
          onSelectSet={onSelectSet}
          onAddSlot={onAddSlot}
          onDeleteSlot={onDeleteSlot}
          onReorderSlots={onReorderSlots}
          onUpdateBlock={onUpdateBlock}
          onDeleteBlock={onDeleteBlock}
        />
      ))}

      <button
        onClick={onAddBlock}
        className="w-full rounded border border-dashed border-border py-2.5 text-[12px] text-text-faint transition-colors hover:border-accent hover:text-accent"
      >
        + Add session block
      </button>
    </div>
  );
}

function SessionBlockCard({
  block,
  resolution,
  selectedSetId,
  onSelectSet,
  onAddSlot,
  onDeleteSlot,
  onReorderSlots,
  onUpdateBlock,
  onDeleteBlock,
}: {
  block: TreeSessionBlock;
  resolution: ResolutionContext;
  selectedSetId: string | null;
  onSelectSet: (slotId: string, setId: string) => void;
  onAddSlot: (sessionBlockId: string) => void;
  onDeleteSlot: (slotId: string) => void;
  onReorderSlots: (sessionBlockId: string, orderedIds: string[]) => void;
  onUpdateBlock: (blockId: string, patch: Record<string, unknown>) => void;
  onDeleteBlock: (blockId: string) => void;
}) {
  const sensors = useSensors(
    // A small activation distance keeps clicks on sets from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = block.slots.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;

    const next = [...ids];
    next.splice(to, 0, ...next.splice(from, 1));
    onReorderSlots(block.id, next);
  }

  const isGrouped = block.structure !== "straight";

  return (
    <section className="rounded border border-border bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <input
          defaultValue={block.name ?? ""}
          onBlur={(e) => {
            const v = e.target.value.trim() || null;
            if (v !== block.name) onUpdateBlock(block.id, { name: v });
          }}
          placeholder="Block name"
          className="w-40 rounded border border-transparent bg-transparent px-1 py-0.5 text-[12px] font-medium hover:border-border focus:border-accent focus:outline-none"
        />

        <Badge tone={blockTone(block.blockType)}>
          {humanize(block.blockType)}
        </Badge>

        <select
          value={block.blockType}
          onChange={(e) => onUpdateBlock(block.id, { blockType: e.target.value })}
          className="rounded border border-border bg-surface px-1 py-0.5 text-[11px] text-text-muted"
        >
          {BLOCK_TYPES.map((t) => (
            <option key={t} value={t}>
              {humanize(t)}
            </option>
          ))}
        </select>

        <select
          value={block.structure}
          onChange={(e) => onUpdateBlock(block.id, { structure: e.target.value })}
          className="rounded border border-border bg-surface px-1 py-0.5 text-[11px] text-text-muted"
        >
          {STRUCTURES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>

        {isGrouped && (
          <>
            <label className="flex items-center gap-1 text-[11px] text-text-faint">
              Rounds
              <input
                type="number"
                defaultValue={block.rounds ?? ""}
                onBlur={(e) =>
                  onUpdateBlock(block.id, {
                    rounds: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="w-12 rounded border border-border bg-surface px-1 py-0.5 text-[11px]"
              />
            </label>
            <label className="flex items-center gap-1 text-[11px] text-text-faint">
              Rest
              <input
                type="number"
                defaultValue={block.restBetweenRoundsSec ?? ""}
                onBlur={(e) =>
                  onUpdateBlock(block.id, {
                    restBetweenRoundsSec:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="w-14 rounded border border-border bg-surface px-1 py-0.5 text-[11px]"
              />
              s
            </label>
          </>
        )}

        <button
          onClick={() => onDeleteBlock(block.id)}
          title="Delete block"
          className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-text-faint hover:bg-surface-2 hover:text-accent"
        >
          ✕
        </button>
      </header>

      {block.notes && (
        <p className="border-b border-border px-3 py-1.5 text-[11px] italic text-text-faint">
          {block.notes}
        </p>
      )}

      <div className="p-2">
        {/*
          dnd-kit derives its accessibility ids from a module-level counter, so
          server and client disagree and React reports a hydration mismatch.
          A stable id per block pins them.
        */}
        <DndContext
          id={`dnd-${block.id}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={block.slots.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1.5">
              {block.slots.map((slot) => (
                <SortableSlot
                  key={slot.id}
                  slot={slot}
                  grouped={isGrouped}
                  resolution={resolution}
                  selectedSetId={selectedSetId}
                  onSelectSet={onSelectSet}
                  onDelete={() => onDeleteSlot(slot.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {block.slots.length === 0 && (
          <p className="px-2 py-3 text-center text-[11px] text-text-faint">
            No exercises in this block yet.
          </p>
        )}

        <button
          onClick={() => onAddSlot(block.id)}
          className="mt-1.5 w-full rounded border border-dashed border-border py-1.5 text-[11px] text-text-faint hover:border-accent hover:text-accent"
        >
          + Add exercise
        </button>
      </div>
    </section>
  );
}

function SortableSlot({
  slot,
  grouped,
  resolution,
  selectedSetId,
  onSelectSet,
  onDelete,
}: {
  slot: TreeSlot;
  grouped: boolean;
  resolution: ResolutionContext;
  selectedSetId: string | null;
  onSelectSet: (slotId: string, setId: string) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slot.id });

  const exerciseCtx: ExerciseContext = {
    id: slot.exercise.id,
    loadBasis: slot.exercise.loadBasis,
    derivedFromExerciseId: slot.exercise.derivedFromExerciseId,
    derivedRatio: slot.exercise.derivedRatio,
    trackedMetrics: slot.exercise.trackedMetrics,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="rounded border border-border bg-surface-2"
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          {...attributes}
          {...listeners}
          aria-label="Reorder exercise"
          className="cursor-grab px-0.5 text-text-faint hover:text-text active:cursor-grabbing"
        >
          ⠿
        </button>

        {grouped && (
          <span className="rounded bg-accent px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent-text">
            {slot.letterLabel}
          </span>
        )}

        <span className="flex-1 truncate text-[12px] font-medium">
          {slot.exercise.name}
        </span>

        <Badge>{humanize(slot.exercise.movementPattern)}</Badge>

        <button
          onClick={onDelete}
          title="Remove exercise"
          className="rounded px-1 text-[11px] text-text-faint hover:text-accent"
        >
          ✕
        </button>
      </div>

      <div className="space-y-0.5 border-t border-border px-2 py-1.5">
        {slot.sets.map((set) => {
          const resolved = resolveSet(set, exerciseCtx, resolution);
          const isSelected = set.id === selectedSetId;
          return (
            <button
              key={set.id}
              onClick={() => onSelectSet(slot.id, set.id)}
              className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left transition-colors ${
                isSelected
                  ? "bg-accent-soft ring-1 ring-accent/40"
                  : "hover:bg-surface-3"
              }`}
            >
              <span className="w-5 shrink-0 text-[10px] text-text-faint">
                {set.setNumber}
              </span>
              {set.setType !== "working" && (
                <Badge tone={set.setType === "top" ? "accent" : "neutral"}>
                  {humanize(set.setType)}
                </Badge>
              )}
              <span
                className={`flex-1 truncate font-mono text-[11px] ${
                  isSelected ? "text-accent" : "text-text-muted"
                }`}
              >
                {resolved.displayText}
              </span>
              {resolved.restText && (
                <span className="shrink-0 text-[10px] text-text-faint">
                  {resolved.restText}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

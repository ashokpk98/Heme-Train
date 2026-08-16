"use client";

import type { ProgramTree } from "@/lib/db/queries/programs";
import { Badge, DAY_NAMES, humanize, sessionTone } from "@/components/ui";

export function ProgramTreePane({
  tree,
  selectedMicrocycleId,
  selectedSessionId,
  onSelectSession,
  onSelectMicrocycle,
}: {
  tree: ProgramTree;
  selectedMicrocycleId: string | null;
  selectedSessionId: string | null;
  onSelectSession: (microcycleId: string, sessionId: string) => void;
  onSelectMicrocycle: (microcycleId: string) => void;
}) {
  return (
    <aside className="w-60 shrink-0 overflow-y-auto border-r border-border bg-surface">
      {tree.blocks.map((block) => (
        <div key={block.id} className="border-b border-border last:border-b-0">
          <div className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="truncate text-[12px] font-semibold">{block.name}</h3>
              <Badge tone="violet">{humanize(block.blockType)}</Badge>
            </div>
            <p className="mt-0.5 text-[10px] text-text-faint">
              {block.weeks} {block.weeks === 1 ? "week" : "weeks"} · vol{" "}
              {block.volumeEmphasis}/5 · int {block.intensityEmphasis}/5
            </p>
          </div>

          <div className="pb-2">
            {block.microcycles.map((micro) => {
              const isCurrentWeek = micro.id === selectedMicrocycleId;
              return (
                <div key={micro.id}>
                  <button
                    onClick={() => onSelectMicrocycle(micro.id)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                      isCurrentWeek
                        ? "bg-surface-2 font-medium text-text"
                        : "text-text-muted hover:bg-surface-2"
                    }`}
                  >
                    <span>Week {micro.weekNumber}</span>
                    {micro.loadType !== "load" && (
                      <Badge
                        tone={micro.loadType === "test" ? "ok" : "warn"}
                      >
                        {humanize(micro.loadType)}
                      </Badge>
                    )}
                  </button>

                  {isCurrentWeek && (
                    <div className="border-l-2 border-accent/40 pb-1 pl-1 ml-3">
                      {micro.sessions.length === 0 && (
                        <p className="px-2 py-1 text-[11px] text-text-faint">
                          No sessions yet
                        </p>
                      )}
                      {micro.sessions.map((sess) => (
                        <button
                          key={sess.id}
                          onClick={() => onSelectSession(micro.id, sess.id)}
                          className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] transition-colors ${
                            sess.id === selectedSessionId
                              ? "bg-accent-soft font-medium text-accent"
                              : "text-text-muted hover:bg-surface-2 hover:text-text"
                          }`}
                        >
                          <span className="w-7 shrink-0 text-text-faint">
                            {DAY_NAMES[sess.dayIndex] ?? `D${sess.dayIndex}`}
                          </span>
                          <span className="truncate">{sess.name}</span>
                          <span className="ml-auto">
                            <Badge tone={sessionTone(sess.sessionType)}>
                              {humanize(sess.sessionType).slice(0, 4)}
                            </Badge>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}

"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import { useTodos } from "../hooks/useTodos";
import { useAssignees } from "../hooks/useAssignees";
import { TodoType, AssigneeType } from "../types";

// ---- 定数 ----
const TOTAL_SLOTS = 48;
const SLOT_HEIGHT_PX = 40;
const WORK_START_SLOT = 18; // 9:00
const WORK_END_SLOT = 36;   // 18:00

// ---- 型定義 ----
type TimelineEntry = {
  id: string;
  todoId: number;
  todo: TodoType;
  startSlot: number;
  durationSlots: number;
};

// ---- ヘルパー関数 ----
function slotToTimeString(slot: number): string {
  const hours = Math.floor(slot / 2);
  const minutes = (slot % 2) * 30;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

function isWorkingHour(slot: number): boolean {
  return slot >= WORK_START_SLOT && slot < WORK_END_SLOT;
}

// ---- サブコンポーネント ----

// 左パネルのドラッグ可能なタスクカード
function DraggableTask({ todo, isPlaced }: { todo: TodoType; isPlaced: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-${todo.id}`,
    data: { type: "task", todo },
  });

  const priorityColor = {
    HIGH: "border-l-red-500",
    MEDIUM: "border-l-yellow-500",
    LOW: "border-l-green-500",
  }[todo.priority];

  const statusBadge = todo.status === "DOING"
    ? <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Doing</span>
    : <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">Todo</span>;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`p-2 rounded-md border border-l-4 ${priorityColor} shadow-sm cursor-grab active:cursor-grabbing bg-white hover:shadow-md transition-shadow select-none ${isPlaced ? "opacity-40" : ""} ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        {statusBadge}
        {todo.assignee && (
          <span
            className="text-[10px] text-white px-1.5 py-0.5 rounded"
            style={{ backgroundColor: todo.assignee.color }}
          >
            {todo.assignee.name}
          </span>
        )}
      </div>
      <div className="text-sm font-medium text-gray-800 truncate">{todo.title}</div>
      {todo.description && (
        <div className="text-xs text-gray-500 truncate mt-0.5">{todo.description}</div>
      )}
    </div>
  );
}

// タイムラインの各30分スロット（ドロップ可能）
function TimelineSlot({ slotIndex }: { slotIndex: number }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot-${slotIndex}`,
    data: { type: "timeline-slot", slotIndex },
  });

  const working = isWorkingHour(slotIndex);
  const isHourBoundary = slotIndex % 2 === 0;

  return (
    <div
      ref={setNodeRef}
      className={`border-b ${isHourBoundary ? "border-gray-300" : "border-gray-200 border-dashed"} ${working ? "bg-white" : "bg-gray-100"} ${isOver ? "!bg-blue-50" : ""} relative`}
      style={{ height: SLOT_HEIGHT_PX }}
    >
      {isHourBoundary && (
        <span className="absolute -left-14 top-[-0.5em] text-xs text-gray-400 w-12 text-right select-none">
          {slotToTimeString(slotIndex)}
        </span>
      )}
    </div>
  );
}

// タイムライン上に配置されたエントリブロック
function TimelineEntryBlock({
  entry,
  onResizeStart,
  onRemove,
  leftOffset,
  widthPercent,
}: {
  entry: TimelineEntry;
  onResizeStart: (e: React.PointerEvent, entry: TimelineEntry) => void;
  onRemove: (entryId: string) => void;
  leftOffset: number;
  widthPercent: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `entry-${entry.id}`,
    data: { type: "timeline-entry", entryId: entry.id },
  });

  const bgColor = entry.todo.assignee?.color ?? "#3B82F6";

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`absolute rounded-md shadow-sm border border-white/30 px-2 py-1 cursor-grab active:cursor-grabbing overflow-hidden select-none ${isDragging ? "opacity-50 z-20" : "z-10"}`}
      style={{
        top: entry.startSlot * SLOT_HEIGHT_PX + 1,
        height: entry.durationSlots * SLOT_HEIGHT_PX - 2,
        left: `${leftOffset}%`,
        width: `${widthPercent}%`,
        backgroundColor: bgColor,
      }}
    >
      <div className="text-white text-xs font-medium truncate pr-4">{entry.todo.title}</div>
      {entry.durationSlots >= 2 && (
        <div className="text-white/70 text-[10px]">
          {slotToTimeString(entry.startSlot)} - {slotToTimeString(entry.startSlot + entry.durationSlots)}
        </div>
      )}
      {/* 削除ボタン */}
      <button
        type="button"
        className="absolute top-0.5 right-1 text-white/60 hover:text-white text-xs leading-none"
        onPointerDown={(e) => {
          e.stopPropagation();
          onRemove(entry.id);
        }}
      >
        &times;
      </button>
      {/* リサイズハンドル */}
      <div
        className="absolute bottom-0 left-0 right-0 h-2.5 cursor-s-resize bg-white/10 hover:bg-white/30 rounded-b"
        onPointerDown={(e) => {
          e.stopPropagation();
          onResizeStart(e, entry);
        }}
      />
    </div>
  );
}

// 左パネル（ドロップ先としても機能：エントリを戻す用）
function TaskPanel({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "task-panel",
    data: { type: "task-panel" },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 overflow-y-auto p-3 space-y-2 ${isOver ? "bg-red-50" : ""}`}
    >
      {children}
    </div>
  );
}

// ---- ドラッグオーバーレイ用プレビュー ----
function DragPreview({ todo }: { todo: TodoType }) {
  return (
    <div className="p-2 rounded-md border shadow-lg bg-white w-52 opacity-90 pointer-events-none">
      <div className="text-sm font-medium text-gray-800 truncate">{todo.title}</div>
      {todo.assignee && (
        <span
          className="text-[10px] text-white px-1.5 py-0.5 rounded mt-1 inline-block"
          style={{ backgroundColor: todo.assignee.color }}
        >
          {todo.assignee.name}
        </span>
      )}
    </div>
  );
}

// ---- メインモーダルコンポーネント ----
type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export default function WorkAllocationModal({ isOpen, onClose }: Props) {
  const { todos } = useTodos() as { todos: TodoType[] | undefined };
  const { assignees } = useAssignees() as { assignees: AssigneeType[] | undefined };

  // 担当者フィルター
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | "all">("all");

  // タイムラインエントリ
  const [entries, setEntries] = useState<TimelineEntry[]>([]);

  // リサイズ状態
  const [resizingEntryId, setResizingEntryId] = useState<string | null>(null);
  const [resizeStartY, setResizeStartY] = useState(0);
  const [resizeOriginalSlots, setResizeOriginalSlots] = useState(1);

  // ドラッグ中のアイテム
  const [activeDragTodo, setActiveDragTodo] = useState<TodoType | null>(null);

  // タイムラインへの参照（自動スクロール用）
  const timelineRef = useRef<HTMLDivElement>(null);

  // センサー
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // フィルタ済みタスク一覧（Todo/Doingのみ）
  const panelTodos: TodoType[] = useMemo(() => {
    if (!todos) return [] as TodoType[];
    return (todos as TodoType[]).filter((t) => {
      if (t.status !== "TODO" && t.status !== "DOING") return false;
      if (selectedAssigneeId !== "all" && t.assigneeId !== selectedAssigneeId) return false;
      return true;
    });
  }, [todos, selectedAssigneeId]);

  // 配置済みtodoIdのセット
  const placedTodoIds = useMemo(() => new Set(entries.map((e) => e.todoId)), [entries]);

  // 重複検出：同じスロットに重なるエントリをグループ化
  const entryLayout = useMemo(() => {
    const layout: Record<string, { leftOffset: number; widthPercent: number }> = {};
    // 各スロットにどのエントリが存在するか
    const slotEntries: Record<number, string[]> = {};
    for (const entry of entries) {
      for (let s = entry.startSlot; s < entry.startSlot + entry.durationSlots; s++) {
        if (!slotEntries[s]) slotEntries[s] = [];
        slotEntries[s].push(entry.id);
      }
    }
    // 各エントリの最大重複数を算出
    const maxOverlap: Record<string, number> = {};
    const overlapPosition: Record<string, number> = {};
    for (const entry of entries) {
      let maxCount = 1;
      for (let s = entry.startSlot; s < entry.startSlot + entry.durationSlots; s++) {
        maxCount = Math.max(maxCount, (slotEntries[s] || []).length);
      }
      maxOverlap[entry.id] = maxCount;
    }
    // 各エントリの位置を決定（簡易的なグリーディ配置）
    const usedColumns: Record<number, Set<number>> = {};
    for (const entry of entries) {
      let col = 0;
      // 使用済みでない最小カラムを探す
      for (let c = 0; c < 10; c++) {
        let available = true;
        for (let s = entry.startSlot; s < entry.startSlot + entry.durationSlots; s++) {
          if (usedColumns[s]?.has(c)) {
            available = false;
            break;
          }
        }
        if (available) {
          col = c;
          break;
        }
      }
      // カラムを記録
      for (let s = entry.startSlot; s < entry.startSlot + entry.durationSlots; s++) {
        if (!usedColumns[s]) usedColumns[s] = new Set();
        usedColumns[s].add(col);
      }
      overlapPosition[entry.id] = col;
    }
    // レイアウト計算
    for (const entry of entries) {
      const total = maxOverlap[entry.id];
      const pos = overlapPosition[entry.id];
      const widthPercent = 100 / total;
      const leftOffset = pos * widthPercent;
      layout[entry.id] = { leftOffset, widthPercent };
    }
    return layout;
  }, [entries]);

  // モーダル開いた時に9:00付近へスクロール
  useEffect(() => {
    if (isOpen && timelineRef.current) {
      const scrollTarget = (WORK_START_SLOT - 1) * SLOT_HEIGHT_PX;
      timelineRef.current.scrollTop = scrollTarget;
    }
  }, [isOpen]);

  // リサイズハンドラ
  const handleResizeStart = useCallback((e: React.PointerEvent, entry: TimelineEntry) => {
    e.preventDefault();
    setResizingEntryId(entry.id);
    setResizeStartY(e.clientY);
    setResizeOriginalSlots(entry.durationSlots);
  }, []);

  const handleResizeMove = useCallback(
    (e: PointerEvent) => {
      if (!resizingEntryId) return;
      const deltaY = e.clientY - resizeStartY;
      const deltaSlots = Math.round(deltaY / SLOT_HEIGHT_PX);
      const newDuration = Math.max(1, resizeOriginalSlots + deltaSlots);

      setEntries((prev) =>
        prev.map((entry) => {
          if (entry.id !== resizingEntryId) return entry;
          const maxDuration = TOTAL_SLOTS - entry.startSlot;
          return { ...entry, durationSlots: Math.min(newDuration, maxDuration) };
        })
      );
    },
    [resizingEntryId, resizeStartY, resizeOriginalSlots]
  );

  const handleResizeEnd = useCallback(() => {
    setResizingEntryId(null);
  }, []);

  useEffect(() => {
    if (resizingEntryId) {
      window.addEventListener("pointermove", handleResizeMove);
      window.addEventListener("pointerup", handleResizeEnd);
      return () => {
        window.removeEventListener("pointermove", handleResizeMove);
        window.removeEventListener("pointerup", handleResizeEnd);
      };
    }
  }, [resizingEntryId, handleResizeMove, handleResizeEnd]);

  // エントリ削除
  const handleRemoveEntry = useCallback((entryId: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }, []);

  // DnDハンドラ
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current;
      if (data?.type === "task") {
        setActiveDragTodo(data.todo as TodoType);
      } else if (data?.type === "timeline-entry") {
        const entryId = data.entryId as string;
        const entry = entries.find((e) => e.id === entryId);
        if (entry) setActiveDragTodo(entry.todo);
      }
    },
    [entries]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragTodo(null);
      const { active, over } = event;
      if (!over) return;

      const activeData = active.data.current;
      const overData = over.data.current;
      if (!activeData || !overData) return;

      // タスクパネルへのドラッグバック → エントリ削除
      if (overData.type === "task-panel" && activeData.type === "timeline-entry") {
        const entryId = activeData.entryId as string;
        setEntries((prev) => prev.filter((e) => e.id !== entryId));
        return;
      }

      if (overData.type !== "timeline-slot") return;
      const slotIndex = overData.slotIndex as number;

      if (activeData.type === "task") {
        // 左パネルからタイムラインへ
        const todo = activeData.todo as TodoType;
        setEntries((prev) => {
          const filtered = prev.filter((e) => e.todoId !== todo.id);
          return [
            ...filtered,
            {
              id: `entry-${todo.id}-${Date.now()}`,
              todoId: todo.id,
              todo,
              startSlot: slotIndex,
              durationSlots: 1,
            },
          ];
        });
      } else if (activeData.type === "timeline-entry") {
        // タイムライン内の移動
        const entryId = activeData.entryId as string;
        setEntries((prev) =>
          prev.map((e) => {
            if (e.id !== entryId) return e;
            const maxStart = TOTAL_SLOTS - e.durationSlots;
            return { ...e, startSlot: Math.min(slotIndex, maxStart) };
          })
        );
      }
    },
    []
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ height: "85vh" }}>
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b shrink-0">
          <h2 className="text-lg font-bold text-gray-800">作業配分</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* ボディ */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex flex-1 overflow-hidden">
            {/* 左パネル */}
            <div className="w-64 border-r flex flex-col shrink-0">
              {/* 担当者選択 */}
              <div className="p-3 border-b shrink-0">
                <select
                  value={selectedAssigneeId}
                  onChange={(e) =>
                    setSelectedAssigneeId(
                      e.target.value === "all" ? "all" : Number(e.target.value)
                    )
                  }
                  className="w-full border border-gray-300 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:border-blue-400"
                >
                  <option value="all">すべての担当者</option>
                  {assignees?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              {/* タスク一覧 */}
              <TaskPanel>
                {panelTodos.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-8">
                    対象のタスクがありません
                  </div>
                ) : (
                  panelTodos.map((todo: TodoType) => (
                    <DraggableTask
                      key={todo.id}
                      todo={todo}
                      isPlaced={placedTodoIds.has(todo.id)}
                    />
                  ))
                )}
              </TaskPanel>
            </div>

            {/* 右タイムライン */}
            <div ref={timelineRef} className="flex-1 overflow-y-auto relative">
              <div className="relative ml-14 mr-2" style={{ height: TOTAL_SLOTS * SLOT_HEIGHT_PX }}>
                {/* スロット */}
                {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
                  <TimelineSlot key={i} slotIndex={i} />
                ))}
                {/* 配置済みエントリ */}
                {entries.map((entry) => {
                  const lay = entryLayout[entry.id] || { leftOffset: 0, widthPercent: 100 };
                  return (
                    <TimelineEntryBlock
                      key={entry.id}
                      entry={entry}
                      onResizeStart={handleResizeStart}
                      onRemove={handleRemoveEntry}
                      leftOffset={lay.leftOffset}
                      widthPercent={lay.widthPercent}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* ドラッグオーバーレイ */}
          <DragOverlay>
            {activeDragTodo ? <DragPreview todo={activeDragTodo} /> : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

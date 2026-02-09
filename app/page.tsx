"use client";

import Todo from "./components/Todo";
import { useRef, useState, useCallback, useEffect } from "react";
import { TodoType, TodoStatus, TodoPriority, AssigneeType } from "./types";
import { useTodos } from "./hooks/useTodos";
import { useAssignees } from "./hooks/useAssignees";
import { API_URL } from "@/constants/url";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

const COLUMNS: { status: TodoStatus; label: string; color: string }[] = [
  { status: "TODO", label: "Todo", color: "bg-gray-100" },
  { status: "DOING", label: "Doing", color: "bg-blue-100" },
  { status: "DONE", label: "Done", color: "bg-green-100" },
];

const ASSIGNEE_COLORS = [
  "#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6",
  "#EC4899", "#06B6D4", "#F97316",
];

export default function Home() {
  const titleRef = useRef<HTMLInputElement | null>(null);
  const descriptionRef = useRef<HTMLTextAreaElement | null>(null);
  const [priority, setPriority] = useState<TodoPriority>("MEDIUM");
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | "">("");
  const [filterAssigneeId, setFilterAssigneeId] = useState<number | "all">("all");
  const { todos, isLoading, error, mutate } = useTodos();
  const { assignees, mutate: mutateAssignees } = useAssignees();

  // 担当者管理
  const newAssigneeRef = useRef<HTMLInputElement | null>(null);
  const [showAssigneeManager, setShowAssigneeManager] = useState(false);
  const [editingAssigneeId, setEditingAssigneeId] = useState<number | null>(null);
  const [editingAssigneeName, setEditingAssigneeName] = useState("");
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [memo, setMemo] = useState("");
  const [memoTextareaHeight, setMemoTextareaHeight] = useState<number | null>(null);
  const memoTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 議事メモのテキストエリア高さを保持
  useEffect(() => {
    const el = memoTextareaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setMemoTextareaHeight(el.offsetHeight);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [showMemoModal]);

  // ドラッグ&ドロップ: 少し移動してからドラッグ開始（クリックとの区別）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const response = await fetch(`${API_URL}/createTodo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: titleRef.current?.value,
        description: descriptionRef.current?.value || undefined,
        status: "TODO",
        priority,
        assigneeId: selectedAssigneeId || undefined,
      }),
    });

    if (response.ok) {
      const newTodo = await response.json();
      mutate([...(todos || []), newTodo]);
      if (titleRef.current) titleRef.current.value = "";
      if (descriptionRef.current) descriptionRef.current.value = "";
      setPriority("MEDIUM");
      setSelectedAssigneeId("");
    }
  };

  const handleAddAssignee = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newAssigneeRef.current?.value?.trim();
    if (!name) return;

    const color = ASSIGNEE_COLORS[(assignees?.length || 0) % ASSIGNEE_COLORS.length];

    const response = await fetch(`${API_URL}/createAssignee`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });

    if (response.ok) {
      const newAssignee = await response.json();
      mutateAssignees([...(assignees || []), newAssignee]);
      if (newAssigneeRef.current) newAssigneeRef.current.value = "";
    }
  };

  const handleEditAssignee = async (id: number) => {
    const trimmed = editingAssigneeName.trim();
    if (!trimmed) return;

    const response = await fetch(`${API_URL}/editAssignee/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });

    if (response.ok) {
      const updated = await response.json();
      mutateAssignees((assignees || []).map((a: AssigneeType) => a.id === id ? { ...a, ...updated } : a));
      mutate(); // Todoのassignee名も更新
      setEditingAssigneeId(null);
    }
  };

  const handleDeleteAssignee = async (id: number) => {
    const response = await fetch(`${API_URL}/deleteAssignee/${id}`, {
      method: "DELETE",
    });

    if (response.ok) {
      mutateAssignees((assignees || []).filter((a: AssigneeType) => a.id !== id));
      mutate(); // Todoも再取得（assignee情報が変わるため）
      if (filterAssigneeId === id) setFilterAssigneeId("all");
    }
  };

  const filterTodosByStatus = useCallback((status: TodoStatus): TodoType[] => {
    return (todos?.filter((todo: TodoType) => {
      if (todo.status !== status) return false;
      if (filterAssigneeId === "all") return true;
      return todo.assigneeId === filterAssigneeId;
    }) || [])
      .sort((a: TodoType, b: TodoType) => a.sortOrder - b.sortOrder);
  }, [todos, filterAssigneeId]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !todos) return;

    // ドラッグしたアイテムのステータスを特定
    const draggedTodo = todos.find((t: TodoType) => t.id === active.id);
    if (!draggedTodo) return;

    const columnTodos = filterTodosByStatus(draggedTodo.status);
    const oldIndex = columnTodos.findIndex((t) => t.id === active.id);
    const newIndex = columnTodos.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(columnTodos, oldIndex, newIndex);

    // sortOrderを振り直し
    const updates = reordered.map((todo, index) => ({
      id: todo.id,
      sortOrder: index,
    }));

    // 楽観的更新: ローカルのtodos配列を更新
    const updatedTodos = todos.map((t: TodoType) => {
      const update = updates.find((u) => u.id === t.id);
      return update ? { ...t, sortOrder: update.sortOrder } : t;
    });
    mutate(updatedTodos, false);

    // サーバーに保存
    await fetch(`${API_URL}/reorderTodos`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: updates }),
    });
  }, [todos, filterTodosByStatus, mutate]);

  const handleExport = () => {
    const PRIORITY_LABELS: Record<string, string> = { HIGH: "高", MEDIUM: "中", LOW: "低" };
    const date = new Date().toLocaleDateString("ja-JP");

    const lines: string[] = [
      `========================================`,
      `  議事録 - ${date}`,
      `========================================`,
      ``,
    ];

    for (const column of COLUMNS) {
      const columnTodos = filterTodosByStatus(column.status);
      lines.push(`--- ${column.label} (${columnTodos.length}) ---`);
      if (columnTodos.length === 0) {
        lines.push(`  (なし)`);
      } else {
        columnTodos.forEach((todo, i) => {
          const assignee = todo.assignee ? `[${todo.assignee.name}]` : "";
          const priority = `(${PRIORITY_LABELS[todo.priority]})`;
          lines.push(`  ${i + 1}. ${priority} ${todo.title} ${assignee}`);
          if (todo.description) {
            lines.push(`     ${todo.description}`);
          }
        });
      }
      lines.push(``);
    }

    if (memo.trim()) {
      lines.push(`--- その他共有 ---`);
      lines.push(memo.trim());
      lines.push(``);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kanban_${date.replace(/\//g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-center mb-8 gap-4">
          <h1 className="text-gray-800 font-bold text-3xl">
            Kanban Todo
          </h1>
          <button
            type="button"
            onClick={() => setShowMemoModal(true)}
            className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            議事メモ{memo.trim() ? " *" : ""}
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors inline-flex items-center gap-1.5"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            .txt出力
          </button>
        </div>

        {/* 担当者管理セクション */}
        <div className="bg-white shadow-lg rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-gray-700 font-medium text-sm">担当者:</span>
              {(assignees || []).map((a: AssigneeType) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white"
                  style={{ backgroundColor: a.color }}
                >
                  {a.name}
                </span>
              ))}
              {(!assignees || assignees.length === 0) && (
                <span className="text-gray-400 text-sm">未登録</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowAssigneeManager(!showAssigneeManager)}
              className="text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              {showAssigneeManager ? "閉じる" : "管理"}
            </button>
          </div>

          {showAssigneeManager && (
            <div className="mt-4 pt-4 border-t">
              <form onSubmit={handleAddAssignee} className="flex items-center gap-2 mb-3">
                <input
                  ref={newAssigneeRef}
                  type="text"
                  placeholder="担当者名を入力"
                  className="border-2 border-gray-300 rounded-lg py-1.5 px-3 text-sm flex-1 focus:outline-none focus:border-teal-500"
                  required
                />
                <button
                  type="submit"
                  className="bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors"
                >
                  追加
                </button>
              </form>
              <div className="flex flex-wrap gap-2">
                {(assignees || []).map((a: AssigneeType) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: a.color }}
                  >
                    {editingAssigneeId === a.id ? (
                      <input
                        type="text"
                        value={editingAssigneeName}
                        onChange={(e) => setEditingAssigneeName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleEditAssignee(a.id);
                          if (e.key === "Escape") setEditingAssigneeId(null);
                        }}
                        onBlur={() => handleEditAssignee(a.id)}
                        autoFocus
                        className="bg-white/20 rounded px-1 w-20 text-xs text-white placeholder-white/60 outline-none"
                      />
                    ) : (
                      <span
                        className="cursor-pointer"
                        onClick={() => { setEditingAssigneeId(a.id); setEditingAssigneeName(a.name); }}
                      >
                        {a.name}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteAssignee(a.id)}
                      className="hover:bg-white/30 rounded-full w-4 h-4 flex items-center justify-center text-[10px] leading-none"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* TODO作成フォーム */}
        <form
          className="bg-white shadow-lg rounded-lg p-6 mb-4"
          onSubmit={handleSubmit}
        >
          <div className="flex gap-4">
            <div className="flex flex-col gap-3 flex-1">
              <input
                className="border-2 border-gray-300 rounded-lg py-2 px-4 w-full focus:outline-none focus:border-teal-500"
                type="text"
                placeholder="タスクのタイトル"
                ref={titleRef}
                required
              />
              <textarea
                className="border-2 border-gray-300 rounded-lg py-2 px-4 w-full focus:outline-none focus:border-teal-500 resize-y"
                placeholder="概要（任意）"
                ref={descriptionRef}
                rows={2}
              />
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-4">
                  <span className="text-gray-700 font-medium">優先度:</span>
                  <div className="flex gap-2">
                    {(["HIGH", "MEDIUM", "LOW"] as TodoPriority[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPriority(p)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                          priority === p
                            ? p === "HIGH"
                              ? "bg-red-500 text-white"
                              : p === "MEDIUM"
                              ? "bg-yellow-500 text-white"
                              : "bg-green-500 text-white"
                            : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                        }`}
                      >
                        {p === "HIGH" ? "高" : p === "MEDIUM" ? "中" : "低"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-gray-700 font-medium">担当者:</span>
                  <select
                    value={selectedAssigneeId}
                    onChange={(e) => setSelectedAssigneeId(e.target.value ? Number(e.target.value) : "")}
                    className="border-2 border-gray-300 rounded-lg py-1 px-3 text-sm focus:outline-none focus:border-teal-500"
                  >
                    <option value="">未割当</option>
                    {(assignees || []).map((a: AssigneeType) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <button
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold px-6 rounded-lg transition-colors self-stretch"
              type="submit"
            >
              追加
            </button>
          </div>
        </form>

        {/* 担当者フィルター */}
        {assignees && assignees.length > 0 && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <span className="text-gray-600 text-sm font-medium">フィルター:</span>
            <button
              type="button"
              onClick={() => setFilterAssigneeId("all")}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                filterAssigneeId === "all"
                  ? "bg-gray-700 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              全員
            </button>
            {(assignees || []).map((a: AssigneeType) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setFilterAssigneeId(a.id)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  filterAssigneeId === a.id
                    ? "text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
                style={filterAssigneeId === a.id ? { backgroundColor: a.color } : {}}
              >
                {a.name}
              </button>
            ))}
          </div>
        )}

        {/* カンバンボード */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {COLUMNS.map((column) => {
              const columnTodos = filterTodosByStatus(column.status);
              return (
                <div
                  key={column.status}
                  className={`${column.color} rounded-lg p-4 min-h-[400px]`}
                >
                  <h2 className="text-lg font-bold text-gray-700 mb-4 text-center">
                    {column.label}
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({columnTodos.length})
                    </span>
                  </h2>
                  <SortableContext
                    items={columnTodos.map((t) => t.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-3">
                      {columnTodos.map((todo: TodoType) => (
                        <Todo key={todo.id} todo={todo} />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              );
            })}
          </div>
        </DndContext>
      </div>

      {/* 議事メモモーダル */}
      {showMemoModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowMemoModal(false); }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-lg font-bold text-gray-800">議事メモ</h2>
              <button
                type="button"
                onClick={() => setShowMemoModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="px-6 pb-2">
              <p className="text-xs text-gray-500 mb-2">.txt出力時に「その他共有」として末尾に出力されます</p>
              <textarea
                ref={memoTextareaRef}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="打合せ中の共有事項やメモをここに記入..."
                className="border-2 border-gray-300 rounded-lg py-3 px-4 w-full focus:outline-none focus:border-indigo-400 resize-y text-sm"
                rows={8}
                style={memoTextareaHeight ? { height: memoTextareaHeight } : undefined}
              />
            </div>
            <div className="flex justify-end gap-2 px-6 pb-5 pt-2">
              <button
                type="button"
                onClick={() => setMemo("")}
                className="text-sm text-gray-500 hover:text-gray-700 py-1.5 px-4 rounded-lg transition-colors"
              >
                クリア
              </button>
              <button
                type="button"
                onClick={() => setShowMemoModal(false)}
                className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium py-1.5 px-6 rounded-lg transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

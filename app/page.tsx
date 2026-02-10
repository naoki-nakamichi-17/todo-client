"use client";

import Todo from "./components/Todo";
import WorkAllocationModal from "./components/WorkAllocationModal";
import TaskImportModal from "./components/TaskImportModal";
import { useRef, useState, useCallback, useEffect } from "react";
import { TodoType, TodoStatus, TodoPriority, AssigneeType } from "./types";
import { useTodos } from "./hooks/useTodos";
import { useAssignees } from "./hooks/useAssignees";
import { API_URL } from "@/constants/url";
import { authFetch, isAuthenticated, getUsername, clearAuth } from "./lib/auth";
import LoginForm from "./components/LoginForm";
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
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(isAuthenticated());
  }, []);

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
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [showWorkAllocation, setShowWorkAllocation] = useState(false);
  const [showTaskImport, setShowTaskImport] = useState(false);
  const [memo, setMemo] = useState("");
  const [memoTextareaHeight, setMemoTextareaHeight] = useState<number | null>(null);
  const memoTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // ユーザーメニュー外クリックで閉じる
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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

    const response = await authFetch(`${API_URL}/createTodo`, {
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

    const response = await authFetch(`${API_URL}/createAssignee`, {
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

    const response = await authFetch(`${API_URL}/editAssignee/${id}`, {
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
    const response = await authFetch(`${API_URL}/deleteAssignee/${id}`, {
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
    await authFetch(`${API_URL}/reorderTodos`, {
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

  const handleBackup = async () => {
    const res = await authFetch(`${API_URL}/exportData`);
    if (!res.ok) return;
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kanban_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRestore = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.assignees || !data.todos) {
        alert("無効なバックアップファイルです");
        return;
      }
      if (!confirm(`担当者${data.assignees.length}件、Todo${data.todos.length}件を復元します。\n現在のデータは上書きされます。よろしいですか？`)) return;
      const res = await authFetch(`${API_URL}/importData`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        mutate();
        mutateAssignees();
        alert("データを復元しました");
      } else {
        alert("復元に失敗しました");
      }
    };
    input.click();
  };

  const handleImportJson = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.todos || !Array.isArray(data.todos)) {
          alert("無効なファイルです。todosキーを持つJSONファイルを選択してください。");
          return;
        }
        const validCount = data.todos.filter((t: { title?: string }) => t.title).length;
        if (validCount === 0) {
          alert("インポート可能なタスクがありません。");
          return;
        }
        if (!confirm(`${validCount}件のタスクを追加します。よろしいですか？`)) return;
        const res = await authFetch(`${API_URL}/importTodos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ todos: data.todos }),
        });
        if (res.ok) {
          const result = await res.json();
          mutate();
          alert(`${result.created}件のタスクをインポートしました。`);
        } else {
          alert("インポートに失敗しました。");
        }
      } catch {
        alert("ファイルの読み込みに失敗しました。正しいJSONファイルを選択してください。");
      }
    };
    input.click();
  };

  if (!loggedIn) {
    return <LoginForm onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="relative flex items-center justify-center mb-8 gap-4">
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
          {/* ユーザーアイコン（右上） */}
          <div ref={userMenuRef} className="absolute right-0 top-0">
            <button
              type="button"
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-9 h-9 rounded-full bg-teal-500 hover:bg-teal-600 text-white flex items-center justify-center transition-colors text-sm font-bold select-none"
              title={getUsername() || ""}
            >
              {getUsername()?.charAt(0).toUpperCase() || "?"}
            </button>
            {showUserMenu && (
              <div className="absolute right-0 mt-1 bg-white rounded-lg shadow-lg border py-2 min-w-[160px] z-50">
                <div className="px-4 py-2 text-sm text-gray-700 font-medium border-b">
                  {getUsername()}
                </div>
                {getUsername() === "admin" && (
                  <>
                    <button
                      type="button"
                      onClick={() => { handleBackup(); setShowUserMenu(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors inline-flex items-center gap-2"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                      データ保存
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleImportJson(); setShowUserMenu(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors inline-flex items-center gap-2"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      JSONインポート
                    </button>
                    <button
                      type="button"
                      onClick={() => { handleRestore(); setShowUserMenu(false); }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors inline-flex items-center gap-2 border-b"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l16-10L4 2z"/></svg>
                      データ復元
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => { clearAuth(); setLoggedIn(false); }}
                  className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  ログアウト
                </button>
              </div>
            )}
          </div>
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

        {/* 担当者フィルター + 作業配分・インポートボタン */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {assignees && assignees.length > 0 && (
            <>
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
            </>
          )}
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setShowTaskImport(true)}
              className="bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16l-4-4-4 4"/><path d="M12 12v9"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
              タスク一括登録
            </button>
            <button
              type="button"
              onClick={() => setShowWorkAllocation(true)}
              className="bg-purple-500 hover:bg-purple-600 text-white text-sm font-medium py-1.5 px-4 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              作業配分
            </button>
          </div>
        </div>

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

      {/* タスクインポートモーダル */}
      <TaskImportModal
        isOpen={showTaskImport}
        onClose={() => setShowTaskImport(false)}
        onImported={() => { mutate(); setShowTaskImport(false); }}
      />

      {/* 作業配分モーダル */}
      <WorkAllocationModal
        isOpen={showWorkAllocation}
        onClose={() => setShowWorkAllocation(false)}
      />
    </div>
  );
}

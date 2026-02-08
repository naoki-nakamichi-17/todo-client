"use client";

import Todo from "./components/Todo";
import { useRef, useState } from "react";
import { TodoType, TodoStatus, TodoPriority, AssigneeType } from "./types";
import { useTodos } from "./hooks/useTodos";
import { useAssignees } from "./hooks/useAssignees";
import { API_URL } from "@/constants/url";

const COLUMNS: { status: TodoStatus; label: string; color: string }[] = [
  { status: "TODO", label: "Todo", color: "bg-gray-100" },
  { status: "DOING", label: "Doing", color: "bg-blue-100" },
  { status: "DONE", label: "Done", color: "bg-green-100" },
];

const PRIORITY_ORDER: Record<TodoPriority, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};

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

  const filterTodosByStatus = (status: TodoStatus): TodoType[] => {
    return (todos?.filter((todo: TodoType) => {
      if (todo.status !== status) return false;
      if (filterAssigneeId === "all") return true;
      return todo.assigneeId === filterAssigneeId;
    }) || [])
      .sort((a: TodoType, b: TodoType) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-gray-800 font-bold text-3xl text-center mb-8">
          Kanban Todo
        </h1>

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
                    {a.name}
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
          <div className="flex flex-col gap-4">
            <input
              className="border-2 border-gray-300 rounded-lg py-2 px-4 w-full focus:outline-none focus:border-teal-500"
              type="text"
              placeholder="タスクのタイトル"
              ref={titleRef}
              required
            />
            <textarea
              className="border-2 border-gray-300 rounded-lg py-2 px-4 w-full focus:outline-none focus:border-teal-500 resize-none"
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
            <button
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {COLUMNS.map((column) => (
            <div
              key={column.status}
              className={`${column.color} rounded-lg p-4 min-h-[400px]`}
            >
              <h2 className="text-lg font-bold text-gray-700 mb-4 text-center">
                {column.label}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({filterTodosByStatus(column.status).length})
                </span>
              </h2>
              <div className="space-y-3">
                {filterTodosByStatus(column.status).map((todo: TodoType) => (
                  <Todo key={todo.id} todo={todo} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

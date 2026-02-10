import React, { useState } from "react";
import { TodoType, TodoStatus, TodoPriority, AssigneeType } from "../types";
import { useTodos } from "../hooks/useTodos";
import { useAssignees } from "../hooks/useAssignees";
import { API_URL } from "@/constants/url";
import { authFetch } from "../lib/auth";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type TodoProps = {
  todo: TodoType;
};

const PRIORITY_STYLES: Record<TodoPriority, { bg: string; text: string; border: string }> = {
  HIGH: { bg: "bg-red-50", text: "text-red-600", border: "border-l-red-500" },
  MEDIUM: { bg: "bg-yellow-50", text: "text-yellow-600", border: "border-l-yellow-500" },
  LOW: { bg: "bg-green-50", text: "text-green-600", border: "border-l-green-500" },
};

const PRIORITY_LABELS: Record<TodoPriority, string> = {
  HIGH: "高",
  MEDIUM: "中",
  LOW: "低",
};

const Todo = ({ todo }: TodoProps) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editedTitle, setEditedTitle] = useState<string>(todo.title);
  const [editedDescription, setEditedDescription] = useState<string>(
    todo.description || ""
  );
  const [editedPriority, setEditedPriority] = useState<TodoPriority>(todo.priority);
  const [editedAssigneeId, setEditedAssigneeId] = useState<number | "">(
    todo.assigneeId || ""
  );
  const { todos, mutate } = useTodos();
  const { assignees } = useAssignees();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleEdit = async () => {
    setIsEditing(!isEditing);
    if (isEditing) {
      const response = await authFetch(`${API_URL}/editTodo/${todo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editedTitle,
          description: editedDescription || undefined,
          priority: editedPriority,
          assigneeId: editedAssigneeId || null,
        }),
      });

      if (response.ok) {
        const editedTodo = await response.json();
        const updatedTodos = (todos || []).map((t: TodoType) =>
          t.id === editedTodo.id ? editedTodo : t
        );
        mutate(updatedTodos);
      }
    }
  };

  const handleDelete = async (id: number) => {
    const response = await authFetch(`${API_URL}/deleteTodo/${todo.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });

    if (response.ok) {
      const updatedTodos = (todos || []).filter((t: TodoType) => t.id !== id);
      mutate(updatedTodos);
    }
  };

  const changeStatus = async (newStatus: TodoStatus) => {
    const response = await authFetch(`${API_URL}/editTodo/${todo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });

    if (response.ok) {
      const editedTodo = await response.json();
      const updatedTodos = (todos || []).map((t: TodoType) =>
        t.id === editedTodo.id ? editedTodo : t
      );
      mutate(updatedTodos);
    }
  };

  const isDone = todo.status === "DONE";
  const priorityStyle = isDone
    ? { bg: "bg-gray-100", text: "text-gray-400", border: "border-l-gray-300" }
    : PRIORITY_STYLES[todo.priority];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-lg shadow p-4 border-l-4 ${priorityStyle.border}`}
    >
      <div className="flex items-start justify-between gap-2">
        {/* ドラッグハンドル */}
        <button
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 touch-none"
          aria-label="ドラッグして並べ替え"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="3" r="1.5" />
            <circle cx="11" cy="3" r="1.5" />
            <circle cx="5" cy="8" r="1.5" />
            <circle cx="11" cy="8" r="1.5" />
            <circle cx="5" cy="13" r="1.5" />
            <circle cx="11" cy="13" r="1.5" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="space-y-2">
              <input
                type="text"
                className="border rounded py-1 px-2 w-full text-sm"
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                placeholder="タイトル"
              />
              <textarea
                className="border rounded py-1 px-2 w-full text-sm resize-y min-h-[60px]"
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                placeholder="概要"
                rows={3}
              />
              <div className="flex gap-1">
                {(["HIGH", "MEDIUM", "LOW"] as TodoPriority[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setEditedPriority(p)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      editedPriority === p
                        ? p === "HIGH"
                          ? "bg-red-500 text-white"
                          : p === "MEDIUM"
                          ? "bg-yellow-500 text-white"
                          : "bg-green-500 text-white"
                        : "bg-gray-200 text-gray-700"
                    }`}
                  >
                    {PRIORITY_LABELS[p]}
                  </button>
                ))}
              </div>
              <select
                value={editedAssigneeId}
                onChange={(e) => setEditedAssigneeId(e.target.value ? Number(e.target.value) : "")}
                className="border rounded py-1 px-2 w-full text-sm"
              >
                <option value="">未割当</option>
                {(assignees || []).map((a: AssigneeType) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${priorityStyle.bg} ${priorityStyle.text}`}>
                  {PRIORITY_LABELS[todo.priority]}
                </span>
                {todo.assignee && (
                  <span
                    className="text-xs font-medium px-1.5 py-0.5 rounded text-white"
                    style={{ backgroundColor: todo.assignee.color }}
                  >
                    {todo.assignee.name}
                  </span>
                )}
                <h3
                  className={`font-medium ${isDone ? "text-gray-400" : "text-gray-900"}`}
                >
                  {todo.title}
                </h3>
              </div>
              {todo.description && (
                <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{todo.description}</p>
              )}
            </>
          )}
        </div>
        <div className="flex flex-col gap-1">
          {todo.status === "TODO" && (
            <button
              onClick={() => changeStatus("DOING")}
              className="bg-blue-500 hover:bg-blue-600 text-white text-xs py-1 px-2 rounded transition-colors"
            >
              Start
            </button>
          )}
          {todo.status === "DOING" && (
            <>
              <button
                onClick={() => changeStatus("DONE")}
                className="bg-green-500 hover:bg-green-600 text-white text-xs py-1 px-2 rounded transition-colors"
              >
                Done
              </button>
              <button
                onClick={() => changeStatus("TODO")}
                className="bg-gray-400 hover:bg-gray-500 text-white text-xs py-1 px-2 rounded transition-colors"
              >
                Back
              </button>
            </>
          )}
          {todo.status === "DONE" && (
            <button
              onClick={() => changeStatus("TODO")}
              className="bg-gray-500 hover:bg-gray-600 text-white text-xs py-1 px-2 rounded transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t">
        <button
          onClick={handleEdit}
          className="bg-green-600 hover:bg-green-700 text-white text-xs py-1 px-2 rounded transition-colors"
        >
          {isEditing ? "Save" : "Edit"}
        </button>
        <button
          onClick={() => handleDelete(todo.id)}
          className="bg-red-500 hover:bg-red-600 text-white text-xs py-1 px-2 rounded transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
};

export default Todo;

"use client";

import React, { useState, useCallback } from "react";
import { useAssignees } from "../hooks/useAssignees";
import { TodoStatus, TodoPriority, AssigneeType } from "../types";
import { API_URL } from "@/constants/url";
import { authFetch } from "../lib/auth";

type ImportRow = {
  id: string;
  title: string;
  description: string;
  status: TodoStatus;
  priority: TodoPriority;
  assigneeId: number | "";
};

function createEmptyRow(): ImportRow {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: "",
    description: "",
    status: "TODO",
    priority: "MEDIUM",
    assigneeId: "",
  };
}

const STATUS_OPTIONS: { value: TodoStatus; label: string }[] = [
  { value: "TODO", label: "Todo" },
  { value: "DOING", label: "Doing" },
  { value: "DONE", label: "Done" },
];

const PRIORITY_OPTIONS: { value: TodoPriority; label: string; color: string }[] = [
  { value: "HIGH", label: "高", color: "text-red-600" },
  { value: "MEDIUM", label: "中", color: "text-yellow-600" },
  { value: "LOW", label: "低", color: "text-green-600" },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
};

export default function TaskImportModal({ isOpen, onClose, onImported }: Props) {
  const { assignees } = useAssignees() as { assignees: AssigneeType[] | undefined };
  const [rows, setRows] = useState<ImportRow[]>(() => [
    createEmptyRow(),
    createEmptyRow(),
    createEmptyRow(),
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateRow = useCallback((id: string, field: keyof ImportRow, value: string | number) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, createEmptyRow()]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((r) => r.id !== id);
    });
  }, []);

  const addMultipleRows = useCallback((count: number) => {
    setRows((prev) => [...prev, ...Array.from({ length: count }, () => createEmptyRow())]);
  }, []);

  const handleSubmit = useCallback(async () => {
    const validRows = rows.filter((r) => r.title.trim());
    if (validRows.length === 0) {
      setError("タイトルが入力された行が1つもありません");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const results = await Promise.all(
        validRows.map((row) =>
          authFetch(`${API_URL}/createTodo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: row.title.trim(),
              description: row.description.trim() || undefined,
              status: row.status,
              priority: row.priority,
              assigneeId: row.assigneeId || undefined,
            }),
          })
        )
      );

      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setError(`${validRows.length}件中${failed.length}件の登録に失敗しました`);
        setIsSubmitting(false);
        return;
      }

      // 成功：リセットして閉じる
      setRows([createEmptyRow(), createEmptyRow(), createEmptyRow()]);
      onImported();
    } catch {
      setError("タスクの登録中にエラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  }, [rows, onImported]);

  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  const validCount = rows.filter((r) => r.title.trim()).length;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl flex flex-col" style={{ maxHeight: "90vh" }}>
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-800">タスクのインポート</h2>
            <p className="text-xs text-gray-500 mt-0.5">複数のタスクをまとめて追加できます</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* テーブル */}
        <div className="flex-1 overflow-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 text-xs uppercase border-b">
                <th className="pb-2 pr-2 w-8">#</th>
                <th className="pb-2 pr-2 w-52">タイトル <span className="text-red-400">*</span></th>
                <th className="pb-2 pr-2">概要</th>
                <th className="pb-2 pr-2 w-24">ステータス</th>
                <th className="pb-2 pr-2 w-20">優先度</th>
                <th className="pb-2 pr-2 w-28">担当者</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-1.5 pr-2 text-gray-400 text-xs">{index + 1}</td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="text"
                      value={row.title}
                      onChange={(e) => updateRow(row.id, "title", e.target.value)}
                      placeholder="タスク名を入力"
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-teal-400"
                    />
                  </td>
                  <td className="py-1.5 pr-2 align-top">
                    <textarea
                      value={row.description}
                      onChange={(e) => updateRow(row.id, "description", e.target.value)}
                      placeholder="任意"
                      rows={1}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-teal-400 resize-y min-h-[34px]"
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={row.status}
                      onChange={(e) => updateRow(row.id, "status", e.target.value)}
                      className="w-full border border-gray-200 rounded px-1.5 py-1.5 text-sm focus:outline-none focus:border-teal-400"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={row.priority}
                      onChange={(e) => updateRow(row.id, "priority", e.target.value)}
                      className="w-full border border-gray-200 rounded px-1.5 py-1.5 text-sm focus:outline-none focus:border-teal-400"
                    >
                      {PRIORITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      value={row.assigneeId}
                      onChange={(e) =>
                        updateRow(row.id, "assigneeId", e.target.value ? Number(e.target.value) : "")
                      }
                      className="w-full border border-gray-200 rounded px-1.5 py-1.5 text-sm focus:outline-none focus:border-teal-400"
                    >
                      <option value="">未割当</option>
                      {assignees?.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none"
                      title="行を削除"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 行追加ボタン */}
          <div className="flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={addRow}
              className="text-sm text-teal-600 hover:text-teal-700 font-medium inline-flex items-center gap-1"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              1行追加
            </button>
            <button
              type="button"
              onClick={() => addMultipleRows(5)}
              className="text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              +5行
            </button>
            <button
              type="button"
              onClick={() => addMultipleRows(10)}
              className="text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              +10行
            </button>
          </div>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between px-6 py-4 border-t shrink-0">
          <div className="text-sm text-gray-500">
            {validCount > 0 ? (
              <span>
                <span className="font-medium text-gray-700">{validCount}件</span>のタスクを追加します
              </span>
            ) : (
              <span>タイトルを入力してください</span>
            )}
            {error && <span className="ml-3 text-red-500">{error}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="text-sm text-gray-500 hover:text-gray-700 py-1.5 px-4 rounded-lg transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || validCount === 0}
              className="bg-teal-500 hover:bg-teal-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium py-1.5 px-6 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  登録中...
                </>
              ) : (
                <>一括追加 ({validCount}件)</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

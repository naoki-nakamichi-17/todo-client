export type TodoStatus = "TODO" | "DOING" | "DONE";
export type TodoPriority = "HIGH" | "MEDIUM" | "LOW";

export type AssigneeType = {
  id: number;
  name: string;
  color: string;
};

export type TodoType = {
  id: number;
  title: string;
  description?: string;
  status: TodoStatus;
  priority: TodoPriority;
  assigneeId?: number | null;
  assignee?: AssigneeType | null;
};

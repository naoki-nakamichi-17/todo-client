import { API_URL } from "@/constants/url";
import useSWR from "swr";
import { authFetch, isAuthenticated } from "../lib/auth";

async function fetcher(key: string) {
  const res = await authFetch(key);
  return res.json();
}

export const useTodos = () => {
  const { data, isLoading, error, mutate } = useSWR(
    isAuthenticated() ? `${API_URL}/allTodos` : null,
    fetcher
  );

  return {
    todos: data,
    isLoading,
    error,
    mutate,
  };
};

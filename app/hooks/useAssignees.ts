import { API_URL } from "@/constants/url";
import useSWR from "swr";
import { authFetch, isAuthenticated } from "../lib/auth";

async function fetcher(key: string) {
  const res = await authFetch(key);
  return res.json();
}

export const useAssignees = () => {
  const { data, isLoading, error, mutate } = useSWR(
    isAuthenticated() ? `${API_URL}/allAssignees` : null,
    fetcher
  );

  return {
    assignees: data,
    isLoading,
    error,
    mutate,
  };
};

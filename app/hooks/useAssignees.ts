import { API_URL } from "@/constants/url";
import useSWR from "swr";

async function fetcher(key: string) {
  return fetch(key).then((res) => res.json());
}

export const useAssignees = () => {
  const { data, isLoading, error, mutate } = useSWR(
    `${API_URL}/allAssignees`,
    fetcher
  );

  return {
    assignees: data,
    isLoading,
    error,
    mutate,
  };
};

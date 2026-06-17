import { useQuery } from "@tanstack/react-query";
import { fetchCategories, fetchEvents } from "../api";

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: fetchEvents,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });
}

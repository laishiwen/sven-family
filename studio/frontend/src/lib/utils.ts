import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Date(date).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTokens(count: number) {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return count.toString();
}

export function formatCost(cost: number) {
  return `$${cost.toFixed(6)}`;
}

export function truncate(str: string, len = 60) {
  if (str.length <= len) return str;
  return str.slice(0, len) + "...";
}

export function healthColor(status: string) {
  switch (status) {
    case "healthy":
      return "badge-success";
    case "unhealthy":
      return "badge-error";
    case "unknown":
      return "badge-gray";
    default:
      return "badge-warning";
  }
}

export function statusColor(status: string) {
  switch (status) {
    case "completed":
      return "badge-success";
    case "running":
      return "badge-info";
    case "failed":
      return "badge-error";
    case "pending":
      return "badge-warning";
    default:
      return "badge-gray";
  }
}

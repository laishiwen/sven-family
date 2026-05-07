"use client";

export function useShare() {
  const share = async (data: { title: string; text?: string; url: string }) => {
    if (navigator.share) {
      await navigator.share(data);
    } else {
      await navigator.clipboard.writeText(data.url);
    }
  };
  return { share };
}

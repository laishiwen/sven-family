import { create } from "zustand";

interface BackendStatusState {
  isReachable: boolean;
  checkedAt: number | null;
  isChecking: boolean;
  setReachable: (isReachable: boolean) => void;
  setChecking: (isChecking: boolean) => void;
}

export const useBackendStatusStore = create<BackendStatusState>((set) => ({
  isReachable: true,
  checkedAt: null,
  isChecking: false,
  setReachable: (isReachable) =>
    set({ isReachable, checkedAt: Date.now(), isChecking: false }),
  setChecking: (isChecking) => set({ isChecking }),
}));

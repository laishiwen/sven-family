import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function detectOS(): 'macos' | 'windows' | 'linux' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';
  const ua = window.navigator.userAgent.toLowerCase();
  if (ua.includes('mac os')) return 'macos';
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

export function getDownloadLabel(os: ReturnType<typeof detectOS>) {
  switch (os) {
    case 'macos':
      return 'macOS (Apple Silicon)';
    case 'windows':
      return 'Windows (x64)';
    case 'linux':
      return 'Linux (AppImage)';
    default:
      return 'macOS (Apple Silicon)';
  }
}

// shadcn/ui のクラス結合（ADR-0010）。後に書いた Tailwind のクラスが勝つように tailwind-merge でまとめる
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

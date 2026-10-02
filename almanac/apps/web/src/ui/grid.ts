import type { KeyboardEvent } from "react";
import { toTsv } from "./export";

type Rows = (string | number | null | undefined)[][];

/** Ctrl+C on a focused grid copies it as tab-separated text that pastes into spreadsheets. */
export function useGridCopy(getRows: () => Rows) {
  return (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
      const sel = window.getSelection()?.toString();
      if (sel) return; // the user selected text: let the browser copy it
      e.preventDefault();
      const [head, ...rows] = getRows();
      void navigator.clipboard?.writeText(toTsv(head as string[], rows));
    }
  };
}

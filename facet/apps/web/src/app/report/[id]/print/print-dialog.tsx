"use client";

import { useEffect } from "react";

/** Opens the browser's print dialog once the page has painted. */
export function PrintDialog() {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 600);
    return () => clearTimeout(timer);
  }, []);
  return null;
}

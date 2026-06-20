"use client";
import { useState, useEffect } from "react";

/**
 * Returns `true` only after the component has mounted on the client.
 * Use this to guard any UI that depends on persisted Zustand state,
 * preventing server/client hydration mismatches.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}

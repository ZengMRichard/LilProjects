// Display preferences shared by the shell and every view.
import { create } from "zustand";

export type Theme = "dark" | "light";
export type Density = "compact" | "comfortable";

interface Prefs {
  theme: Theme;
  cvd: boolean; // color-vision-deficiency palette: blue up, orange down
  density: Density;
  setPrefs: (p: Partial<Pick<Prefs, "theme" | "cvd" | "density">>) => void;
}

export const usePrefs = create<Prefs>((set) => ({
  theme: "dark",
  cvd: false,
  density: "compact",
  setPrefs: (p) => set(p),
}));

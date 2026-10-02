import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataState, RefNum } from "./components";

describe("RefNum", () => {
  it("shows a dash whose tooltip names the missing capability", () => {
    render(
      <RefNum
        cell={{
          field: "px.last",
          unavailable: true,
          reasons: ["No provider configured for px.last on EQUITY"],
        }}
        format={(v) => v.toFixed(2)}
      />,
    );
    const el = screen.getByText("—");
    expect(el.getAttribute("title")).toBe("No provider configured for px.last on EQUITY");
  });
  it("shows the value with its provenance on hover", () => {
    render(
      <RefNum
        cell={{
          field: "px.last",
          value: 231.5,
          unit: "USD",
          prov: {
            provider: "demo",
            fetched_at: "2026-09-30T18:00:00Z",
            delay_minutes: 0,
            attribution: "Synthetic",
          },
        }}
        format={(v) => v.toFixed(2)}
      />,
    );
    expect(screen.getByText("231.50").getAttribute("title")).toContain("Source: demo");
  });
});

describe("DataState", () => {
  it("renders loading, error with retry, and unavailable states without blanking", () => {
    const { rerender } = render(
      <DataState result={{ status: "loading" }} label="Prices">
        {() => "ok"}
      </DataState>,
    );
    expect(screen.getByText(/Loading Prices/)).toBeTruthy();
    rerender(
      <DataState result={{ status: "error", error: "boom" }} label="Prices" retry={() => {}}>
        {() => "ok"}
      </DataState>,
    );
    expect(screen.getByText(/Prices failed: boom/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    rerender(
      <DataState result={{ status: "unavailable", reasons: ["no source"] }} label="Prices">
        {() => "ok"}
      </DataState>,
    );
    expect(screen.getByText(/Prices unavailable: no source/)).toBeTruthy();
    rerender(
      <DataState result={{ status: "ok" }} label="Prices">
        {() => "content"}
      </DataState>,
    );
    expect(screen.getByText("content")).toBeTruthy();
  });
});

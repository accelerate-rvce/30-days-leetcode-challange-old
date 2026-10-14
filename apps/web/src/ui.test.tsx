import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./components/ui";

describe("ui", () => {
  it("renders human-friendly verification states", () => {
    render(<StatusBadge status="MANUAL_REVIEW" />);
    expect(screen.getByText("Pending Verification")).toBeTruthy();
  });
});

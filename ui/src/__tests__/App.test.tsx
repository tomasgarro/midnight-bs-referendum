import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { App } from "../App";

describe("App", () => {
  it("renders without crashing", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Votaciones en curso" })).toBeTruthy();
  });

  it("keeps learning open before verification", async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Entendé" }));
    expect(screen.getByRole("heading", { name: "Decidir en comunidad, con información clara." })).toBeTruthy();
    expect(screen.getByText("¿Tengo que verificarme para leer la información?")).toBeTruthy();
  });
});

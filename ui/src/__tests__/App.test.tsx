import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { App } from "../App";

describe("App", () => {
  it("renders the demo without a wallet", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Votaciones en curso" })).toBeTruthy();
    expect(screen.getByText("Compromiso privado durante la votación")).toBeTruthy();
  });

  it("keeps learning available before identity verification", async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Entendé" }));
    expect(screen.getByRole("heading", { name: "Decidir en comunidad, con información clara." })).toBeTruthy();
    expect(screen.getByText("¿Qué estamos construyendo?")).toBeTruthy();
  });

  it("renders the Passport-backed profile space", async () => {
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Mi perfil" }));
    expect(screen.getByRole("heading", { name: "Tu espacio ciudadano" })).toBeTruthy();
    expect(screen.getByText("Identificador de perfil")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tu identidad .night" })).toBeTruthy();
  });
});

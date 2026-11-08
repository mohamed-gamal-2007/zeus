import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/lib/i18n";
import LanguageToggle from "./LanguageToggle";

const wrapper = ({ children }) => <I18nProvider>{children}</I18nProvider>;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("dir");
  document.documentElement.removeAttribute("lang");
});

describe("LanguageToggle", () => {
  it("renders a button that offers the other language", () => {
    render(<LanguageToggle />, { wrapper });
    // In English, the toggle offers switching to Arabic.
    expect(screen.getByRole("button", { name: /العربية/ })).toBeInTheDocument();
  });

  it("switches to Arabic on click and updates the label + document dir", async () => {
    const user = userEvent.setup();
    render(<LanguageToggle />, { wrapper });
    const btn = screen.getByRole("button");
    await user.click(btn);
    // Now in Arabic, the toggle offers switching back to English.
    expect(screen.getByRole("button", { name: /English/ })).toBeInTheDocument();
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
  });

  it("toggles back to English on a second click", async () => {
    const user = userEvent.setup();
    render(<LanguageToggle />, { wrapper });
    const btn = screen.getByRole("button");
    await user.click(btn);
    await user.click(btn);
    expect(screen.getByRole("button", { name: /العربية/ })).toBeInTheDocument();
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
  });

  it("persists the chosen language", async () => {
    const user = userEvent.setup();
    render(<LanguageToggle />, { wrapper });
    await user.click(screen.getByRole("button"));
    expect(JSON.parse(localStorage.getItem("zeus_lang"))).toBe("ar");
  });
});

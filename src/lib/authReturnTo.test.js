import { describe, it, expect, beforeEach } from "vitest";
import safeReturnTo from "./authReturnTo";

// Helper: set the current URL's query string so safeReturnTo() can read it.
function setSearch(search) {
  window.history.replaceState({}, "", `/login${search}`);
}

beforeEach(() => setSearch(""));

describe("safeReturnTo", () => {
  it("returns the default fallback when there is no returnTo param", () => {
    setSearch("");
    expect(safeReturnTo()).toBe("/");
  });
  it("returns the provided fallback when there is no returnTo param", () => {
    setSearch("");
    expect(safeReturnTo("/onboarding")).toBe("/onboarding");
  });
  it("honours a same-origin relative path", () => {
    setSearch("?returnTo=" + encodeURIComponent("/app"));
    expect(safeReturnTo()).toBe("/app");
  });
  it("decodes percent-encoded paths", () => {
    setSearch("?returnTo=" + encodeURIComponent("/roadmap?x=1"));
    expect(safeReturnTo()).toBe("/roadmap?x=1");
  });
  it("rejects protocol-relative URLs", () => {
    setSearch("?returnTo=//evil.com");
    expect(safeReturnTo()).toBe("/");
    setSearch("?returnTo=" + encodeURIComponent("/\\evil.com"));
    expect(safeReturnTo()).toBe("/");
  });
  it("rejects absolute/external URLs", () => {
    setSearch("?returnTo=https://evil.com");
    expect(safeReturnTo()).toBe("/");
    setSearch("?returnTo=http://evil.com/x");
    expect(safeReturnTo()).toBe("/");
  });
  it("rejects auth pages to avoid redirect loops", () => {
    for (const p of ["/login", "/register", "/forgot-password", "/reset-password", "/auth/callback"]) {
      setSearch("?returnTo=" + encodeURIComponent(p));
      expect(safeReturnTo()).toBe("/");
    }
  });
  it("accepts a non-auth path that merely starts with /", () => {
    setSearch("?returnTo=" + encodeURIComponent("/applications"));
    expect(safeReturnTo()).toBe("/applications");
  });
  it("returns the fallback for junk that does not start with /", () => {
    setSearch("?returnTo=evil.com");
    expect(safeReturnTo()).toBe("/");
  });
});

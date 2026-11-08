import { describe, it, expect } from "vitest";
import {
  normalizeDigits,
  validateFullName,
  validateEmail,
  validatePhone,
} from "./validators";

describe("normalizeDigits", () => {
  it("converts Arabic-Indic digits to ASCII", () => {
    expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });
  it("converts Extended Arabic-Indic (Persian) digits", () => {
    expect(normalizeDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });
  it("leaves ASCII digits unchanged", () => {
    expect(normalizeDigits("0123")).toBe("0123");
  });
  it("returns an empty string for null/undefined", () => {
    expect(normalizeDigits(null)).toBe("");
    expect(normalizeDigits(undefined)).toBe("");
  });
});

describe("validateFullName", () => {
  it("rejects empty input", () => {
    const r = validateFullName("   ");
    expect(r.ok).toBe(false);
    expect(r.errorEn).toBe("Enter your full name");
    expect(r.errorAr).toBeTruthy();
  });
  it("rejects names shorter than 2 chars", () => {
    expect(validateFullName("a").ok).toBe(false);
  });
  it("rejects names longer than 80 chars", () => {
    expect(validateFullName("x".repeat(81)).ok).toBe(false);
  });
  it("accepts a normal name and trims/collapses whitespace", () => {
    const r = validateFullName("  Mohamed   Gamal  ");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("Mohamed Gamal");
    expect(r.errorEn).toBe("");
  });
  it("normalizes Arabic digits embedded in the name", () => {
    expect(validateFullName("Ali ٢").value).toBe("Ali 2");
  });
});

describe("validateEmail", () => {
  it("rejects empty input", () => {
    expect(validateEmail("").ok).toBe(false);
  });
  it("rejects malformed emails", () => {
    expect(validateEmail("not-an-email").ok).toBe(false);
    expect(validateEmail("a@b").ok).toBe(false);
    expect(validateEmail("plainstring").ok).toBe(false);
    expect(validateEmail("user@.com").ok).toBe(false);
  });
  it("accepts valid emails, trims and lowercases", () => {
    const r = validateEmail("  User@Example.COM  ");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("user@example.com");
  });
  it("rejects emails longer than 254 chars", () => {
    const local = "a".repeat(250);
    expect(validateEmail(`${local}@b.co`).ok).toBe(false);
  });
});

describe("validatePhone", () => {
  it("rejects empty input", () => {
    expect(validatePhone("").ok).toBe(false);
  });
  it("rejects too few digits", () => {
    expect(validatePhone("123").ok).toBe(false);
  });
  it("rejects too many digits", () => {
    expect(validatePhone("1".repeat(16)).ok).toBe(false);
  });
  it("accepts a local number and strips formatting chars", () => {
    const r = validatePhone("010 1234-5678");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("01012345678");
  });
  it("keeps a leading + for international form", () => {
    const r = validatePhone("+201012345678");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("+201012345678");
  });
  it("normalizes Arabic-Indic digits", () => {
    const r = validatePhone("٠١٠١٢٣٤٥٦٧٨");
    expect(r.ok).toBe(true);
    expect(r.value).toBe("01012345678");
  });
  it("always returns bilingual error fields", () => {
    const r = validatePhone("bad");
    expect(r.errorEn).toBeTruthy();
    expect(r.errorAr).toBeTruthy();
  });
});

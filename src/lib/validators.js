/**
 * Field validators for the signup / payment forms.
 *
 * Every validator returns the same shape so callers can pick a language:
 *   { ok: boolean, value: string, errorAr: string, errorEn: string }
 */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Convert Arabic-Indic / Extended Arabic-Indic digits to ASCII. */
export function normalizeDigits(value) {
  return String(value || "").replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabic = "٠١٢٣٤٥٦٧٨٩".indexOf(digit);
    return String(arabic >= 0 ? arabic : "۰۱۲۳۴۵۶۷۸۹".indexOf(digit));
  });
}

function pass(value) {
  return { ok: true, value, errorAr: "", errorEn: "" };
}

function fail(value, errorAr, errorEn) {
  return { ok: false, value, errorAr, errorEn };
}

export function validateFullName(input) {
  const value = normalizeDigits(input).trim().replace(/\s+/g, " ");
  if (!value) return fail(value, "يرجى إدخال الاسم الكامل", "Enter your full name");
  if (value.length < 2) return fail(value, "الاسم قصير جدًا", "Name is too short");
  if (value.length > 80) return fail(value, "الاسم طويل جدًا", "Name is too long");
  return pass(value);
}

export function validateEmail(input) {
  const value = String(input || "").trim().toLowerCase();
  if (!value) return fail(value, "يرجى إدخال البريد الإلكتروني", "Enter your email address");
  if (value.length > 254 || !EMAIL_RE.test(value)) {
    return fail(value, "البريد الإلكتروني غير صحيح", "Enter a valid email address");
  }
  return pass(value);
}

export function validatePhone(input) {
  // Keep a leading + (international form) but drop formatting characters.
  const raw = normalizeDigits(input).trim();
  const value = raw.replace(/[\s().-]/g, "");
  if (!value) return fail(value, "يرجى إدخال رقم الهاتف", "Enter your phone number");
  const digits = value.replace(/^\+/, "");
  if (!/^\d{7,15}$/.test(digits)) {
    return fail(value, "رقم الهاتف غير صحيح", "Enter a valid phone number");
  }
  return pass(value);
}

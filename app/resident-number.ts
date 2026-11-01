function maskToken(value: string) {
  let first = true;
  return value.replace(/[A-Z0-9]/gi, character => {
    if (first) { first = false; return character; }
    return "*";
  });
}

function maskAfterLabel(input: string, pattern: RegExp) {
  return input.replace(pattern, (_match, label: string, token: string) => label + maskToken(token));
}

// Masks complete candidates while preserving labels and separators. The same
// function runs in the browser and again on the server before model use/storage.
export function maskIdentityNumbers(input: string) {
  let masked = input;

  // Resident registration and foreign registration numbers share a 6+7 shape.
  masked = masked.replace(/(?<!\d)\d{6}[\s\-–—]?\d{7}(?!\d)/g, maskToken);

  // Korean driver's licence number: regional 2 + year 2 + serial 6 + check 2.
  masked = masked.replace(/(?<!\d)\d{2}[\s\-–—]\d{2}[\s\-–—]\d{6}[\s\-–—]\d{2}(?!\d)/g, maskToken);
  masked = maskAfterLabel(masked, /((?:운전\s*면허|면허)(?:증)?\s*(?:번호)?\s*[:：]?\s*)(\d{12})(?!\d)/gi);

  // Common Korean passport forms are one or two letters followed by 7–8 digits.
  masked = masked.replace(/(?<![A-Z0-9])[A-Z]{1,2}\d{7,8}(?![A-Z0-9])/gi, maskToken);
  masked = maskAfterLabel(masked, /((?:여권)(?:번호)?\s*[:：]?\s*)([A-Z0-9]{8,9})(?![A-Z0-9])/gi);

  return masked;
}

// Backward-compatible export for existing callers and stored test harnesses.
export const maskResidentRegistrationNumber = maskIdentityNumbers;

// Contact masking is for untrusted user content, not published business contacts.
// Keep the identity-only function for validated answers and source titles.
export function maskPersonalInformation(input: string) {
  let masked = maskIdentityNumbers(input);
  masked = masked.replace(/(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![A-Z0-9])/gi, "[이메일 숨김]");
  // Korean mobile, landline and internet phone numbers, including +82 forms.
  // Require known telephone prefixes so dates and ordinary amounts remain intact.
  masked = masked.replace(/(?<![\dA-Z])(?:0(?:1[016789]|2|3[1-3]|4[1-4]|5[1-5]|6[1-4]|70)|\+82[ .-]?(?:\(0\)[ .-]?)?(?:1[016789]|2|3[1-3]|4[1-4]|5[1-5]|6[1-4]|70))[ .-]?\d{3,4}[ .-]?\d{4}(?!\d)/gi, "[전화번호 숨김]");
  return masked;
}

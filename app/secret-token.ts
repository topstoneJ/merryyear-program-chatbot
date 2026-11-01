import { createHash, timingSafeEqual } from "node:crypto";

// Compare fixed-size digests so a caller-controlled token length does not make
// timingSafeEqual throw. Never log either the token or its digest.
export function matchesSecretToken(configured: string | undefined, supplied: string | null | undefined) {
  if (!configured || configured.length < 32 || !supplied || supplied.length > 4096) return false;
  if (configured === "replace-with-a-long-random-secret") return false;
  return timingSafeEqual(createHash("sha256").update(configured).digest(), createHash("sha256").update(supplied).digest());
}

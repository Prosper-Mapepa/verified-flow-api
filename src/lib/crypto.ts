import { createHmac, createHash, timingSafeEqual } from "crypto";
import { toCanonicalJson, type SealPayload } from "./canonical";

function sealSecret(): string {
  const secret = process.env.SEAL_SECRET;
  if (!secret) throw new Error("SEAL_SECRET is not configured");
  return secret;
}

export function hashPayload(canonicalJson: string): string {
  return createHash("sha256").update(canonicalJson, "utf8").digest("hex");
}

export function signHash(payloadHash: string): string {
  return createHmac("sha256", sealSecret())
    .update(payloadHash, "utf8")
    .digest("hex");
}

export function sealPayload(payload: SealPayload): {
  canonical: string;
  payloadHash: string;
  signature: string;
  algo: string;
} {
  const canonical = toCanonicalJson(payload);
  const payloadHash = hashPayload(canonical);
  const signature = signHash(payloadHash);
  return {
    canonical,
    payloadHash,
    signature,
    algo: "HMAC-SHA256",
  };
}

export function verifySeal(
  canonicalJson: string,
  payloadHash: string,
  signature: string
): { valid: boolean; reason: string } {
  const recomputedHash = hashPayload(canonicalJson);
  if (recomputedHash !== payloadHash) {
    return { valid: false, reason: "Payload hash mismatch — data may have been altered." };
  }
  const expectedSig = signHash(recomputedHash);
  try {
    const a = Buffer.from(expectedSig, "hex");
    const b = Buffer.from(signature, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { valid: false, reason: "Signature invalid — seal is broken." };
    }
  } catch {
    return { valid: false, reason: "Signature invalid — seal is broken." };
  }
  return { valid: true, reason: "Seal verified. Result integrity intact." };
}

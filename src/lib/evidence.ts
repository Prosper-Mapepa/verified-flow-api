import { createHash, randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export const EVIDENCE_KINDS = ["KIT_PHOTO", "TAP_PHOTO"] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

export function uploadsRoot() {
  return path.join(process.cwd(), "uploads", "samples");
}

export function hashBuffer(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

export function combinedEvidenceHash(hashes: string[]) {
  return createHash("sha256")
    .update(hashes.slice().sort().join("|"), "utf8")
    .digest("hex");
}

export async function saveEvidenceFile(params: {
  sampleId: string;
  kind: EvidenceKind;
  file: File;
}) {
  const { sampleId, kind, file } = params;
  if (!ALLOWED.has(file.type) && !file.type.startsWith("image/")) {
    throw new Error(`${kind}: only image uploads are allowed`);
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    throw new Error(`${kind}: image must be under 5MB`);
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const sha256 = hashBuffer(buf);
  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const filename = `${kind.toLowerCase()}-${randomBytes(4).toString("hex")}.${ext}`;
  const dir = path.join(uploadsRoot(), sampleId);
  await mkdir(dir, { recursive: true });
  const storagePath = path.join(dir, filename);
  await writeFile(storagePath, buf);

  return {
    kind,
    filename,
    mimeType: file.type || "image/jpeg",
    sizeBytes: buf.length,
    sha256,
    storagePath,
  };
}

export type TrustInputs = {
  attested: boolean;
  hasKitPhoto: boolean;
  hasTapPhoto: boolean;
  hasDeviceGps: boolean;
};

export function collectionTrust(inputs: TrustInputs) {
  let score = 0;
  if (inputs.attested) score += 1;
  if (inputs.hasKitPhoto) score += 2;
  if (inputs.hasTapPhoto) score += 2;
  if (inputs.hasDeviceGps) score += 1;

  const level =
    score >= 5 ? "HIGH" : score >= 3 ? "MEDIUM" : score >= 1 ? "LOW" : "NONE";

  return {
    score,
    max: 6,
    level: level as "HIGH" | "MEDIUM" | "LOW" | "NONE",
    factors: {
      attested: inputs.attested,
      kitPhoto: inputs.hasKitPhoto,
      tapPhoto: inputs.hasTapPhoto,
      deviceGps: inputs.hasDeviceGps,
    },
  };
}

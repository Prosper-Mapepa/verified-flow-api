import type { Alert, Result, Sample, SampleEvidence } from "@prisma/client";
import { verifySeal } from "./crypto";
import { collectionTrust } from "./evidence";

type ResultWithSample = Result & {
  sample: Sample & { evidence?: SampleEvidence[] };
  alerts?: Alert[];
};

export function publicEvidence(e: SampleEvidence) {
  return {
    id: e.id,
    kind: e.kind as "KIT_PHOTO" | "TAP_PHOTO",
    filename: e.filename,
    mimeType: e.mimeType,
    sha256: e.sha256,
    url: `/api/evidence/${e.id}`,
  };
}

export function publicResult(result: ResultWithSample) {
  const seal = verifySeal(
    result.payloadCanonical,
    result.payloadHash,
    result.signature
  );
  const sealedLead = Number(
    (JSON.parse(result.payloadCanonical) as { leadPpb: number }).leadPpb
  );
  const displayMatches =
    Number(result.leadPpb.toFixed(3)) === Number(sealedLead.toFixed(3));
  const verification = displayMatches
    ? seal
    : {
        valid: false,
        reason:
          "Displayed lead value no longer matches sealed canonical payload.",
      };

  const evidence = result.sample.evidence ?? [];
  const trust = collectionTrust({
    attested: result.sample.attested,
    hasKitPhoto: evidence.some((e) => e.kind === "KIT_PHOTO"),
    hasTapPhoto: evidence.some((e) => e.kind === "TAP_PHOTO"),
    hasDeviceGps:
      result.sample.deviceLatitude != null &&
      result.sample.deviceLongitude != null,
  });

  return {
    id: result.id,
    sampleId: result.sampleId,
    kitId: result.sample.kitId,
    leadPpb: result.leadPpb,
    sealedLeadPpb: sealedLead,
    testedAt: result.testedAt.toISOString(),
    collectedAt: result.sample.collectedAt.toISOString(),
    publishedAt: result.publishedAt.toISOString(),
    labOrgName: result.labOrgName,
    neighborhood: result.sample.neighborhood,
    latitude: result.sample.latitude,
    longitude: result.sample.longitude,
    addressPublic: result.sample.neighborhood,
    notes: result.notes,
    algo: result.algo,
    payloadHash: result.payloadHash,
    signature: result.signature,
    evidenceHash: result.sample.evidenceHash,
    verification,
    collectionTrust: trust,
    evidence: evidence.map(publicEvidence),
    alerts: (result.alerts ?? []).map((a) => ({
      id: a.id,
      severity: a.severity as "EARLY_WARNING" | "LEGAL_THRESHOLD",
      thresholdPpb: a.thresholdPpb,
      observedPpb: a.observedPpb,
      message: a.message,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export function publicSample(
  sample: Sample & { result?: Result | null; evidence?: SampleEvidence[] }
) {
  const evidence = sample.evidence ?? [];
  return {
    id: sample.id,
    kitId: sample.kitId,
    collectedAt: sample.collectedAt.toISOString(),
    neighborhood: sample.neighborhood,
    latitude: sample.latitude,
    longitude: sample.longitude,
    addressText: sample.addressText,
    status: sample.status,
    attested: sample.attested,
    hasResult: Boolean(sample.result),
    evidenceCount: evidence.length,
    evidenceHash: sample.evidenceHash,
    collectionTrust: collectionTrust({
      attested: sample.attested,
      hasKitPhoto: evidence.some((e) => e.kind === "KIT_PHOTO"),
      hasTapPhoto: evidence.some((e) => e.kind === "TAP_PHOTO"),
      hasDeviceGps:
        sample.deviceLatitude != null && sample.deviceLongitude != null,
    }),
  };
}

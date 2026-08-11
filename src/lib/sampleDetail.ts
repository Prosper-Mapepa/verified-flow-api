import type { Sample, SampleEvidence, User } from "@prisma/client";
import { collectionTrust } from "./evidence";

type SampleFull = Sample & {
  evidence: SampleEvidence[];
  collector: Pick<User, "id" | "name" | "email" | "orgName">;
};

export function labSampleDetail(sample: SampleFull) {
  const trust = collectionTrust({
    attested: sample.attested,
    hasKitPhoto: sample.evidence.some((e) => e.kind === "KIT_PHOTO"),
    hasTapPhoto: sample.evidence.some((e) => e.kind === "TAP_PHOTO"),
    hasDeviceGps:
      sample.deviceLatitude != null && sample.deviceLongitude != null,
  });

  return {
    id: sample.id,
    kitId: sample.kitId,
    status: sample.status,
    collectedAt: sample.collectedAt.toISOString(),
    createdAt: sample.createdAt.toISOString(),
    neighborhood: sample.neighborhood,
    addressText: sample.addressText,
    latitude: sample.latitude,
    longitude: sample.longitude,
    deviceLatitude: sample.deviceLatitude,
    deviceLongitude: sample.deviceLongitude,
    gpsAccuracyM: sample.gpsAccuracyM,
    attested: sample.attested,
    evidenceHash: sample.evidenceHash,
    collector: {
      id: sample.collector.id,
      name: sample.collector.name,
      email: sample.collector.email,
      orgName: sample.collector.orgName,
    },
    collectionTrust: trust,
    evidence: sample.evidence.map((e) => ({
      id: e.id,
      kind: e.kind as "KIT_PHOTO" | "TAP_PHOTO",
      filename: e.filename,
      mimeType: e.mimeType,
      sha256: e.sha256,
      sizeBytes: e.sizeBytes,
      url: `/api/evidence/${e.id}`,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}

export type LabSampleDetail = ReturnType<typeof labSampleDetail>;

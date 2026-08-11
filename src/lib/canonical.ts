export type SealPayload = {
  sampleId: string;
  kitId: string;
  leadPpb: number;
  labOrgId: string;
  labOrgName: string;
  testedAt: string;
  collectedAt: string;
  latitude: number;
  longitude: number;
  neighborhood: string;
  /** Combined hash of collection evidence files; empty if none */
  evidenceHash: string;
};

/** Stable JSON used for hashing — fixed key order + number formats. */
export function toCanonicalJson(payload: SealPayload): string {
  const ordered = {
    sampleId: payload.sampleId,
    kitId: payload.kitId,
    leadPpb: Number(payload.leadPpb.toFixed(3)),
    labOrgId: payload.labOrgId,
    labOrgName: payload.labOrgName,
    testedAt: payload.testedAt,
    collectedAt: payload.collectedAt,
    latitude: Number(payload.latitude.toFixed(6)),
    longitude: Number(payload.longitude.toFixed(6)),
    neighborhood: payload.neighborhood,
    evidenceHash: payload.evidenceHash || "",
  };
  return JSON.stringify(ordered);
}

export function parseCanonical(canonical: string): SealPayload {
  return JSON.parse(canonical) as SealPayload;
}

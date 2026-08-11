export type PublicResult = {
  id: string;
  sampleId: string;
  kitId: string;
  leadPpb: number;
  sealedLeadPpb?: number;
  testedAt: string;
  collectedAt: string;
  publishedAt: string;
  labOrgName: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  addressPublic: string;
  notes: string | null;
  algo: string;
  payloadHash: string;
  signature: string;
  verification: { valid: boolean; reason: string };
  evidenceHash?: string | null;
  collectionTrust: {
    score: number;
    max: number;
    level: "HIGH" | "MEDIUM" | "LOW" | "NONE";
    factors: {
      attested: boolean;
      kitPhoto: boolean;
      tapPhoto: boolean;
      deviceGps: boolean;
    };
  };
  evidence: {
    id: string;
    kind: "KIT_PHOTO" | "TAP_PHOTO";
    filename: string;
    mimeType: string;
    sha256: string;
    url: string;
  }[];
  alerts: {
    id: string;
    severity: "EARLY_WARNING" | "LEGAL_THRESHOLD";
    thresholdPpb: number;
    observedPpb: number;
    message: string;
    createdAt: string;
  }[];
};

export type PublicAlert = {
  id: string;
  severity: "EARLY_WARNING" | "LEGAL_THRESHOLD";
  thresholdPpb: number;
  observedPpb: number;
  message: string;
  createdAt: string;
  neighborhood: string;
  kitId: string;
  resultId: string;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "COLLECTOR" | "LAB" | "ADMIN";
  orgName: string | null;
};

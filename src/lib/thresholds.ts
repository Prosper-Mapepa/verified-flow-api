export const COMMUNITY_THRESHOLD_PPB = 5.0;
export const LEGAL_THRESHOLD_PPB = 10.0;

export type ThresholdHit =
  | { severity: "LEGAL_THRESHOLD"; thresholdPpb: number }
  | { severity: "EARLY_WARNING"; thresholdPpb: number }
  | null;

export function evaluateThreshold(leadPpb: number): ThresholdHit {
  if (leadPpb >= LEGAL_THRESHOLD_PPB) {
    return { severity: "LEGAL_THRESHOLD", thresholdPpb: LEGAL_THRESHOLD_PPB };
  }
  if (leadPpb >= COMMUNITY_THRESHOLD_PPB) {
    return { severity: "EARLY_WARNING", thresholdPpb: COMMUNITY_THRESHOLD_PPB };
  }
  return null;
}

export function alertMessage(
  severity: "LEGAL_THRESHOLD" | "EARLY_WARNING",
  leadPpb: number,
  neighborhood: string
): string {
  if (severity === "LEGAL_THRESHOLD") {
    return `LEGAL THRESHOLD: ${leadPpb.toFixed(1)} ppb lead detected in ${neighborhood} (≥ ${LEGAL_THRESHOLD_PPB} ppb).`;
  }
  return `EARLY WARNING: ${leadPpb.toFixed(1)} ppb lead detected in ${neighborhood} (≥ ${COMMUNITY_THRESHOLD_PPB} ppb).`;
}

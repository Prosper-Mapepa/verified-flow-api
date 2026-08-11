export const Role = {
  COLLECTOR: "COLLECTOR",
  LAB: "LAB",
  ADMIN: "ADMIN",
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const SampleStatus = {
  AWAITING_LAB: "AWAITING_LAB",
  COMPLETED: "COMPLETED",
  VOID: "VOID",
} as const;

export const AlertSeverity = {
  EARLY_WARNING: "EARLY_WARNING",
  LEGAL_THRESHOLD: "LEGAL_THRESHOLD",
} as const;

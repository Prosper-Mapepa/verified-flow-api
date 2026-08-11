import { prisma } from "./prisma";

export async function writeAudit(params: {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}) {
  return prisma.auditEvent.create({
    data: {
      actorUserId: params.actorUserId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: JSON.stringify(params.metadata ?? {}),
    },
  });
}

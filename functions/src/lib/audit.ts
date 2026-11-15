import { FieldValue, getFirestore } from 'firebase-admin/firestore';

export interface AuditLogInput {
  actorUid: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const db = getFirestore();

  await db.collection('auditLogs').add({
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    at: FieldValue.serverTimestamp(),
  });
}

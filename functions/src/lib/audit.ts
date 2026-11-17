import { FieldValue, getFirestore } from 'firebase-admin/firestore';

export interface AuditLogInput {
  actorUid: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
}

export function createAuditLogRecord(input: AuditLogInput) {
  return {
    ...input,
    at: FieldValue.serverTimestamp(),
  };
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const db = getFirestore();

  await db.collection('auditLogs').add(createAuditLogRecord(input));
}

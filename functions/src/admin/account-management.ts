import { getAuth } from 'firebase-admin/auth';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { writeAuditLog } from '../lib/audit';

if (getApps().length === 0) {
  initializeApp();
}

export const ADMIN_ROLES = ['submitter', 'evaluator', 'adjudicator', 'agent', 'admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

function ensureAdmin(request: CallableRequest<Record<string, unknown>>): string {
  const auth = request.auth;

  if (!auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  const role = auth.token?.role;
  if (role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only admins can access this endpoint.');
  }

  return auth.uid;
}

function normaliseRole(value: unknown): AdminRole {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'A valid role is required.');
  }

  const role = value.trim();
  if (ADMIN_ROLES.includes(role as AdminRole)) {
    return role as AdminRole;
  }

  throw new HttpsError('invalid-argument', 'The requested role is not supported.');
}

function normaliseString(value: unknown, key: string): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `The field ${key} must be a string.`);
  }

  const cleaned = value.trim();
  if (!cleaned) {
    throw new HttpsError('invalid-argument', `The field ${key} is required.`);
  }

  return cleaned;
}

function normaliseOptionalPhone(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Phone must be a string when supplied.');
  }

  const phone = value.trim();
  if (phone && !/^\+?[1-9]\d{7,14}$/.test(phone)) {
    throw new HttpsError('invalid-argument', 'Phone must be in E.164 format when supplied.');
  }

  return phone || undefined;
}

function normaliseEvaluatorType(
  value: unknown,
  role: AdminRole,
): 'internal' | 'external' | null {
  if (role !== 'evaluator') {
    if (value !== undefined && value !== null) {
      throw new HttpsError('invalid-argument', 'Evaluator type is only valid for evaluator accounts.');
    }
    return null;
  }

  if (value === undefined || value === null || value === '') {
    return 'internal';
  }
  if (value === 'internal' || value === 'external') {
    return value;
  }

  throw new HttpsError('invalid-argument', 'Evaluator type must be internal or external.');
}

function normaliseEvaluatorOrganization(value: unknown, role: AdminRole, evaluatorType: 'internal' | 'external' | null): string | null {
  if (role !== 'evaluator') {
    if (value !== undefined && value !== null && value !== '') {
      throw new HttpsError('invalid-argument', 'Organization is only valid for evaluator accounts.');
    }
    return null;
  }
  if (value === undefined || value === null || value === '') {
    if (evaluatorType === 'external') {
      throw new HttpsError('invalid-argument', 'An organization is required for external evaluators.');
    }
    return null;
  }
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Organization must be a string.');
  }

  const organization = value.trim();
  if (!organization || organization.length > 160) {
    throw new HttpsError('invalid-argument', 'Organization must be between 1 and 160 characters.');
  }
  return organization;
}

export async function createUserAccount(
  request: CallableRequest<Record<string, unknown>>,
): Promise<{ uid: string; email: string; link: string }> {
  const actorUid = ensureAdmin(request);
  const displayName = normaliseString(request.data.displayName, 'displayName');
  const email = normaliseString(request.data.email, 'email').toLowerCase();
  const phone = normaliseOptionalPhone(request.data.phone);
  const role = normaliseRole(request.data.role);
  const evaluatorType = normaliseEvaluatorType(request.data.evaluatorType, role);
  const organization = normaliseEvaluatorOrganization(
    request.data.organization,
    role,
    evaluatorType,
  );

  const user = await getAuth().createUser({
    email,
    displayName,
    phoneNumber: phone,
    emailVerified: false,
  });

  await getAuth().setCustomUserClaims(user.uid, { role });
  await getFirestore().doc(`users/${user.uid}`).set(
    {
      uid: user.uid,
      displayName,
      email,
      role,
      evaluatorType,
      organization,
      phone: phone ?? null,
      isActive: true,
      emailVerified: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const resetLink = await getAuth().generatePasswordResetLink(email);

  await writeAuditLog({
    actorUid,
    actorRole: 'admin',
    action: 'user.created',
    entityType: 'users',
    entityId: user.uid,
    summary: `Created user ${displayName} with role ${role}`,
  });

  return { uid: user.uid, email, link: resetLink };
}

export async function setUserRole(
  request: CallableRequest<Record<string, unknown>>,
): Promise<{ uid: string; role: AdminRole }> {
  const actorUid = ensureAdmin(request);
  const uid = normaliseString(request.data.uid, 'uid');
  const role = normaliseRole(request.data.role);

  if (actorUid === uid) {
    throw new HttpsError('failed-precondition', 'An admin cannot change their own role.');
  }

  const targetDoc = await getFirestore().doc(`users/${uid}`).get();
  const targetData = targetDoc.exists ? targetDoc.data() : undefined;
  const targetRole = targetData?.role;
  const evaluatorType =
    role === 'evaluator'
      ? targetData?.evaluatorType === 'external'
        ? 'external'
        : 'internal'
      : null;
  const organization =
    role === 'evaluator' && evaluatorType === 'external' && typeof targetData?.organization === 'string'
      ? targetData.organization
      : null;
  const remainingAdmins = await getAuth().listUsers();
  const adminCount = remainingAdmins.users.filter(user => user.customClaims?.role === 'admin').length;
  if (targetRole === 'admin' && role !== 'admin' && adminCount <= 1) {
    throw new HttpsError('failed-precondition', 'A last admin cannot be demoted.');
  }

  await getAuth().setCustomUserClaims(uid, { role });
  await getAuth().revokeRefreshTokens(uid);
  await getFirestore().doc(`users/${uid}`).set(
    {
      role,
      evaluatorType,
      organization,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await writeAuditLog({
    actorUid,
    actorRole: 'admin',
    action: 'role.changed',
    entityType: 'users',
    entityId: uid,
    summary: `Changed role to ${role}`,
  });

  return { uid, role };
}

export async function setUserActive(
  request: CallableRequest<Record<string, unknown>>,
): Promise<{ uid: string; isActive: boolean }> {
  const actorUid = ensureAdmin(request);
  const uid = normaliseString(request.data.uid, 'uid');
  const isActive = Boolean(request.data.isActive);

  if (actorUid === uid) {
    throw new HttpsError('failed-precondition', 'An admin cannot disable their own account.');
  }

  await getAuth().updateUser(uid, { disabled: !isActive });
  await getFirestore().doc(`users/${uid}`).set(
    {
      isActive,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await writeAuditLog({
    actorUid,
    actorRole: 'admin',
    action: isActive ? 'user.enabled' : 'user.disabled',
    entityType: 'users',
    entityId: uid,
    summary: `${isActive ? 'Enabled' : 'Disabled'} account`,
  });

  return { uid, isActive };
}

export async function resendInvite(
  request: CallableRequest<Record<string, unknown>>,
): Promise<{ uid: string; link: string }> {
  ensureAdmin(request);
  const uid = normaliseString(request.data.uid, 'uid');
  const user = await getAuth().getUser(uid);
  const resetLink = await getAuth().generatePasswordResetLink(user.email ?? '');

  await writeAuditLog({
    actorUid: request.auth?.uid ?? 'system',
    actorRole: 'admin',
    action: 'user.invite_resent',
    entityType: 'users',
    entityId: uid,
    summary: 'Password reset link resent',
  });

  return { uid, link: resetLink };
}

export async function deleteUserAccount(
  request: CallableRequest<Record<string, unknown>>,
): Promise<{ uid: string; deleted: boolean }> {
  const actorUid = ensureAdmin(request);
  const uid = normaliseString(request.data.uid, 'uid');

  if (actorUid === uid) {
    throw new HttpsError('failed-precondition', 'An admin cannot delete their own account.');
  }

  const user = await getAuth().getUser(uid);
  const isLastAdmin = user.customClaims?.role === 'admin';
  if (isLastAdmin) {
    const remainingAdmins = await getAuth().listUsers();
    const count = remainingAdmins.users.filter(item => item.customClaims?.role === 'admin').length;
    if (count <= 1) {
      throw new HttpsError('failed-precondition', 'The last remaining admin cannot be deleted.');
    }
  }

  await getAuth().deleteUser(uid);
  await getFirestore().doc(`users/${uid}`).set(
    {
      isActive: false,
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  await writeAuditLog({
    actorUid,
    actorRole: 'admin',
    action: 'user.deleted',
    entityType: 'users',
    entityId: uid,
    summary: 'Deleted user account',
  });

  return { uid, deleted: true };
}

export async function recomputeStats(
  request: CallableRequest<Record<string, unknown>>,
): Promise<{ ok: true }> {
  ensureAdmin(request);

  const [userSnapshot, ideaSnapshot, ticketSnapshot, chatSnapshot] = await Promise.all([
    getFirestore().collection('users').get(),
    getFirestore().collection('ideas').get(),
    getFirestore().collection('tickets').get(),
    getFirestore().collection('chats').get(),
  ]);

  const users = userSnapshot.docs.map(document => document.data());
  const ideas = ideaSnapshot.docs.map(document => document.data());
  const tickets = ticketSnapshot.docs.map(document => document.data());
  const chats = chatSnapshot.docs.map(document => document.data());

  const usersByRole = { admin: 0, evaluator: 0, adjudicator: 0, agent: 0, submitter: 0 };
  for (const user of users) {
    const rawRole = user.role;
    if (typeof rawRole === 'string' && rawRole in usersByRole) {
      usersByRole[rawRole as keyof typeof usersByRole] += 1;
    } else {
      usersByRole.submitter += 1;
    }
  }

  const ideasByStatus = { draft: 0, submitted: 0, under_review: 0, approved: 0, rejected: 0, awarded: 0 };
  for (const idea of ideas) {
    const rawStatus = idea.status;
    const statusKey = typeof rawStatus === 'string' ? rawStatus : 'submitted';
    if (statusKey in ideasByStatus) {
      ideasByStatus[statusKey as keyof typeof ideasByStatus] += 1;
    } else {
      ideasByStatus.submitted += 1;
    }
  }

  const ideasByCategory: Record<string, number> = {};
  for (const idea of ideas) {
    const category = typeof idea.category === 'string' ? idea.category : 'uncategorised';
    ideasByCategory[category] = (ideasByCategory[category] ?? 0) + 1;
  }

  const ideasPerDay: Record<string, number> = {};
  for (const idea of ideas) {
    const createdAt = idea.createdAt;
    if (!createdAt || typeof createdAt.toDate !== 'function') {
      continue;
    }
    const dateKey = createdAt.toDate().toISOString().slice(0, 10);
    ideasPerDay[dateKey] = (ideasPerDay[dateKey] ?? 0) + 1;
  }

  const overviewDoc = {
    totalUsers: users.length,
    usersByRole,
    activeUsers: users.filter(user => user.isActive !== false).length,
    totalIdeas: ideas.length,
    ideasByStatus,
    ideasByCategory,
    ideasPerDay,
    openTickets: tickets.filter(ticket => ticket.status !== 'resolved' && ticket.status !== 'closed').length,
    resolvedTickets: tickets.filter(ticket => ticket.status === 'resolved' || ticket.status === 'closed').length,
    activeChats: chats.filter(chat => chat.status !== 'closed').length,
    evaluatorsCount: users.filter(user => user.role === 'evaluator').length,
    supportCount: users.filter(user => user.role === 'agent').length,
    pendingAssignments: ideas.filter(idea => ['under_review', 'feedback_requested', 'revised'].includes(String(idea.status))).length,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await getFirestore().doc('stats/overview').set(overviewDoc, { merge: true });
  return { ok: true };
}

import { getApps, initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';
import {
  createUserAccount as createUserAccountHandler,
  deleteUserAccount as deleteUserAccountHandler,
  recomputeStats as recomputeStatsHandler,
  resendInvite as resendInviteHandler,
  setUserActive as setUserActiveHandler,
  setUserRole as setUserRoleHandler,
} from './admin/account-management';

if (getApps().length === 0) {
  initializeApp();
}

export const createUserAccount = onCall(async request => createUserAccountHandler(request));
export const setUserRole = onCall(async request => setUserRoleHandler(request));
export const setUserActive = onCall(async request => setUserActiveHandler(request));
export const resendInvite = onCall(async request => resendInviteHandler(request));
export const deleteUserAccount = onCall(async request => deleteUserAccountHandler(request));
export const recomputeStats = onCall(async request => recomputeStatsHandler(request));
export { onIdeaCreated } from './idea-screening';

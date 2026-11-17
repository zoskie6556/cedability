import { getApps, initializeApp } from 'firebase-admin/app';
import { onCall } from 'firebase-functions/v2/https';
import {
  requestIdeaChanges as requestIdeaChangesHandler,
  resubmitIdea as resubmitIdeaHandler,
} from './idea-feedback';
import {
  createUserAccount as createUserAccountHandler,
  deleteUserAccount as deleteUserAccountHandler,
  recomputeStats as recomputeStatsHandler,
  resendInvite as resendInviteHandler,
  setUserActive as setUserActiveHandler,
  setUserRole as setUserRoleHandler,
} from './admin/account-management';
import {
  awardApprovedIdea as awardApprovedIdeaHandler,
  recordAdjudication as recordAdjudicationHandler,
} from './idea-adjudication';

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
export { onIdeaResubmitted } from './idea-screening';
export const requestIdeaChanges = onCall(async request => requestIdeaChangesHandler(request));
export const resubmitIdea = onCall(async request => resubmitIdeaHandler(request));
export const recordAdjudication = onCall(async request => recordAdjudicationHandler(request));
export const awardApprovedIdea = onCall(async request => awardApprovedIdeaHandler(request));

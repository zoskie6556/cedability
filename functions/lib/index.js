"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setIdeaStatus = exports.getIdeaReport = exports.awardApprovedIdea = exports.recordAdjudication = exports.resubmitIdea = exports.requestIdeaChanges = exports.onIdeaResubmitted = exports.onIdeaCreated = exports.recomputeStats = exports.deleteUserAccount = exports.resendInvite = exports.setUserActive = exports.setUserRole = exports.createUserAccount = void 0;
const app_1 = require("firebase-admin/app");
const https_1 = require("firebase-functions/v2/https");
const idea_feedback_1 = require("./idea-feedback");
const account_management_1 = require("./admin/account-management");
const idea_adjudication_1 = require("./idea-adjudication");
const reporting_1 = require("./reporting");
const idea_admin_1 = require("./idea-admin");
if ((0, app_1.getApps)().length === 0) {
    (0, app_1.initializeApp)();
}
exports.createUserAccount = (0, https_1.onCall)(async (request) => (0, account_management_1.createUserAccount)(request));
exports.setUserRole = (0, https_1.onCall)(async (request) => (0, account_management_1.setUserRole)(request));
exports.setUserActive = (0, https_1.onCall)(async (request) => (0, account_management_1.setUserActive)(request));
exports.resendInvite = (0, https_1.onCall)(async (request) => (0, account_management_1.resendInvite)(request));
exports.deleteUserAccount = (0, https_1.onCall)(async (request) => (0, account_management_1.deleteUserAccount)(request));
exports.recomputeStats = (0, https_1.onCall)(async (request) => (0, account_management_1.recomputeStats)(request));
var idea_screening_1 = require("./idea-screening");
Object.defineProperty(exports, "onIdeaCreated", { enumerable: true, get: function () { return idea_screening_1.onIdeaCreated; } });
var idea_screening_2 = require("./idea-screening");
Object.defineProperty(exports, "onIdeaResubmitted", { enumerable: true, get: function () { return idea_screening_2.onIdeaResubmitted; } });
exports.requestIdeaChanges = (0, https_1.onCall)(async (request) => (0, idea_feedback_1.requestIdeaChanges)(request));
exports.resubmitIdea = (0, https_1.onCall)(async (request) => (0, idea_feedback_1.resubmitIdea)(request));
exports.recordAdjudication = (0, https_1.onCall)(async (request) => (0, idea_adjudication_1.recordAdjudication)(request));
exports.awardApprovedIdea = (0, https_1.onCall)(async (request) => (0, idea_adjudication_1.awardApprovedIdea)(request));
exports.getIdeaReport = (0, https_1.onCall)(async (request) => (0, reporting_1.getIdeaReport)(request));
exports.setIdeaStatus = (0, https_1.onCall)(async (request) => (0, idea_admin_1.setIdeaStatus)(request));

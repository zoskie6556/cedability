"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onIdeaCreated = exports.recomputeStats = exports.deleteUserAccount = exports.resendInvite = exports.setUserActive = exports.setUserRole = exports.createUserAccount = void 0;
const app_1 = require("firebase-admin/app");
const https_1 = require("firebase-functions/v2/https");
const account_management_1 = require("./admin/account-management");
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

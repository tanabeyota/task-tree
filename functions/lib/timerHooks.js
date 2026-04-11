"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleDeadlineEmail = exports.sendDeadlineEmail = void 0;
const functions = require("firebase-functions/v2");
exports.sendDeadlineEmail = functions.https.onRequest(async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).send('Unauthorized');
        return;
    }
    const { nodeId, email } = req.body;
    if (!nodeId || !email) {
        res.status(400).send('Missing parameters');
        return;
    }
    console.log(`Sending deadline email for nodeId: ${nodeId} to ${email}`);
    res.status(200).send('Email sent');
});
exports.scheduleDeadlineEmail = functions.https.onCall(async (request) => {
    var _a;
    const { nodeId, deadline } = request.data;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }
    const taskId = `${nodeId}_deadline`;
    console.log(`Scheduling Cloud Task ID: ${taskId} for time: ${deadline}`);
    // TODO: Initialize CloudTasksClient and create task targeting sendDeadlineEmail
    // using OIDC token authorization to ensure security.
    return { success: true, taskId };
});
//# sourceMappingURL=timerHooks.js.map
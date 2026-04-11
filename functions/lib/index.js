"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAIChildren = void 0;
const functions = require("firebase-functions/v2");
const admin = require("firebase-admin");
admin.initializeApp();
// HTTP Callable Function: Generate AI Child Nodes (MOCKED)
exports.generateAIChildren = functions.https.onCall(async (request) => {
    var _a;
    const { text, parentId } = request.data;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    if (!text || !parentId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing text or parentId.');
    }
    // Phase 5 requirements: Return mock string initially
    const aiResponse = "ここにAIの要約が入ります";
    return {
        nodes: [
            {
                text: aiResponse
            }
        ]
    };
});
__exportStar(require("./timerHooks"), exports);
//# sourceMappingURL=index.js.map
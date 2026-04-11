import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

admin.initializeApp();

// HTTP Callable Function: Generate AI Child Nodes (MOCKED)
export const generateAIChildren = functions.https.onCall(async (request) => {
  const { text, parentId } = request.data;
  const uid = request.auth?.uid;

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

export * from './timerHooks';

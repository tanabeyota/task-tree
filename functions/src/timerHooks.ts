import * as functions from 'firebase-functions/v2';

export const sendDeadlineEmail = functions.https.onRequest(async (req, res) => {
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

export const scheduleDeadlineEmail = functions.https.onCall(async (request) => {
  const { nodeId, deadline, email } = request.data;
  const uid = request.auth?.uid;

  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const taskId = `${nodeId}_deadline`;
  console.log(`Scheduling Cloud Task ID: ${taskId} for time: ${deadline}`);

  // TODO: Initialize CloudTasksClient and create task targeting sendDeadlineEmail
  // using OIDC token authorization to ensure security.

  return { success: true, taskId };
});

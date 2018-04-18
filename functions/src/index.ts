import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp();

import schedulesRefreshHandler from './schedules/schedules';
import { notifyCreation, notifyUpdate, notifyError } from './notifications/notifications';

const SCHEDULES_REF = "schedules/{documentId}";
const ERRORS_REF = "metadata/errors";

exports.refreshSchedules = functions.https.onRequest(schedulesRefreshHandler);

exports.createNotifications = functions.firestore.document(SCHEDULES_REF).onCreate(notifyCreation);

exports.updateNotifications = functions.firestore.document(SCHEDULES_REF).onUpdate(notifyUpdate);

exports.errorNotifications = functions.firestore.document(ERRORS_REF).onUpdate(notifyError);
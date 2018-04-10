import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp();

import schedulesRefreshHandler from './schedules/schedules';
import { notifyCreation, notifyUpdate } from './notifications/notifications';

const TRIGGER_REF = "schedules/{documentId}";

exports.refreshSchedules = functions.https.onRequest(schedulesRefreshHandler);

exports.createNotifications = functions.firestore.document(TRIGGER_REF).onCreate(notifyCreation);

exports.updateNotifications = functions.firestore.document(TRIGGER_REF).onUpdate(notifyUpdate);
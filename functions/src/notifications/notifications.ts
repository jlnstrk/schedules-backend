import * as admin from 'firebase-admin';

import determineChanges from './changes/changes';
import { Schedule } from "../model/schedule.model";
import { ScheduleEntry } from "../model/schedule.entry.model";
import { DocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import { EventContext, Change } from 'firebase-functions';
import { ScheduleUpdate } from '../model/schedule.update.model';
import { ScheduleMetadata } from '../model/schedule.metadata.model';
import { Topic } from '../model/topic.model';
import { NotificationType } from '../model/notification.type.model';
import { parseScheduleIdDate } from '../dates/dates';
import { ScheduleError } from '../model/schedule.error.model';

const SCHEDULE_REVISION_ERROR = 0
const NOTIFICATION_TIME_TO_LIVE = 60 * 60 * 24 * 1000;
const MAX_EVENTS_TO_SEND = 5;

export function notifyUpdate(change: Change<DocumentSnapshot>, context: EventContext): Promise<void> {
    const oldSchedule = change.before.data() as Schedule;
    const updatedSchedule = change.after.data() as Schedule;
    const updatedEntries = determineChanges(oldSchedule.entries, updatedSchedule.entries);
    const groupedEntries = groupByTopic(updatedEntries);
    delete updatedSchedule.entries;
    const updateNotifications = [...groupedEntries.keys()].map(function (key: Topic) {
        return sendTopicNotification(updatedSchedule, groupedEntries.get(key), key, NotificationType.UPDATE);
    });
    return Promise.all(updateNotifications)
        .then(function (responses: string[]) {
            console.log("Sent update notifications: " + responses.join(", "));
        })
        .catch(function (error) {
            console.log("Failed to send update notifications: " + error);
        });
}

export function notifyCreation(snapshot: DocumentSnapshot, context: EventContext): Promise<void> {
    const createdSchedule = snapshot.data() as Schedule;
    const groupedEntries = groupByTopic(createdSchedule.entries);
    delete createdSchedule.entries;
    const creationNotifications = [...groupedEntries.keys()].map(function (key: Topic) {
        return sendTopicNotification(createdSchedule, groupedEntries.get(key), key, NotificationType.CREATION);
    });
    return Promise.all(creationNotifications)
        .then(function (responses: string[]) {
            console.log("Sent creation notifications: " + responses.join(", "));
        })
        .catch(function (error) {
            console.log("Failed to send creation notifications: " + error);
        });
}


export function notifyError(change: Change<DocumentSnapshot>, context: EventContext): Promise<void[]> {
    const previousErrors = change.before.data().schedules as string[];
    const allErrors = change.after.data().schedules as string[];
    const newErrors = allErrors.filter(function (newError: string) {
        return previousErrors.indexOf(newError) == -1;
    });
    return Promise.all(newErrors.map(function (errorScheduleId: string) {
        const target = parseScheduleIdDate(errorScheduleId)
        const error = {
            target: target,
            link: buildSourceLink(errorScheduleId)
        } as ScheduleError;
        const payload = {
            android: {
                ttl: NOTIFICATION_TIME_TO_LIVE,
                collapseKey: buildCollapseKey(Topic.GENERAL, target, SCHEDULE_REVISION_ERROR)
            },
            data: {
                type: NotificationType.ERROR,
                error: JSON.stringify(error)
            },
            topic: Topic.GENERAL
        };
        return admin.messaging().send(payload)
            .then(function (response: string) {
                console.log("Sent error notification: " + response);
            })
            .catch(function (error) {
                console.log("Failed to send error notification: " + error);
            });
    }));
}

function groupByTopic(entries: ScheduleEntry[]): Map<Topic, ScheduleEntry[]> {
    const map = new Map<Topic, ScheduleEntry[]>();
    entries.forEach(function (entry: ScheduleEntry) {
        const topics = determineTopics(entry.class);
        topics.forEach(function (topic: Topic) {
            if (!map.has(topic)) {
                map.set(topic, [entry]);
            } else map.get(topic).push(entry);
        });
    });
    return map;
}

function sendTopicNotification(metadata: ScheduleMetadata, topicEntries: ScheduleEntry[],
    topic: Topic, type: NotificationType): Promise<string> {
    const update = {
        totalUpdates: topicEntries.length,
        updatedEntries: topicEntries.slice(0, MAX_EVENTS_TO_SEND)
    } as ScheduleUpdate;
    const payload = {
        android: {
            ttl: NOTIFICATION_TIME_TO_LIVE,
            collapseKey: buildCollapseKey(topic, metadata.target, metadata.revision)
        },
        data: {
            type: type,
            scheduleMetadata: JSON.stringify(metadata),
            scheduleUpdate: JSON.stringify(update)
        },
        topic: topic
    };
    return admin.messaging().send(payload as any);
}

function determineTopics(entryClass: string): Topic[] {
    entryClass = entryClass.toLowerCase();
    const topics: Topic[] = [];

    // Either we're Q34, Q12 or both
    if (entryClass.includes("q3") || entryClass.includes("q4")) {
        topics.push(Topic.LEVEL_Q34);
    } else if (entryClass.includes("q1") || entryClass.includes("q2")) {
        topics.push(Topic.LEVEL_Q12);
    } else if (entryClass.includes("q")) {
        topics.push(Topic.LEVEL_Q34);
        topics.push(Topic.LEVEL_Q12);
    }

    /* 
    All levels have to be checked for individually, 
    as we might be dealing with a cross-level entry, e.g. '5678'
     */
    if (entryClass.includes("e")) {
        topics.push(Topic.LEVEL_E12);
    }
    if (entryClass.includes("10")) {
        topics.push(Topic.LEVEL_10);
    }
    if (entryClass.includes("9")) {
        topics.push(Topic.LEVEL_9);
    }
    if (entryClass.includes("8")) {
        topics.push(Topic.LEVEL_8);
    }
    if (entryClass.includes("7")) {
        topics.push(Topic.LEVEL_7);
    }
    if (entryClass.includes("6")) {
        topics.push(Topic.LEVEL_6);
    }
    if (entryClass.includes("5")) {
        topics.push(Topic.LEVEL_5);
    }
    return topics;
}

function buildCollapseKey(topic: string, scheduledFor: Date, revision: number): string {
    return topic + ':' + scheduledFor.getFullYear() + ('0' + (scheduledFor.getMonth() + 1))
        .slice(-2) + ('0' + scheduledFor.getDate()).slice(-2) + ':' + revision;
}

function buildSourceLink(scheduleId: string): string {
    return "http://www.musterschule.de/Termine/Vertretungsplan_Schueler/" + scheduleId.slice(2) + ".pdf";
}
import { Request, Response } from "express";
import * as admin from "firebase-admin";

import extractScheduleData from './extractor/extractor';
import { retrieveRefreshUrl, downloadSchedule, removeTempFile, createTempFileReadStream } from './source/source';
import { File } from "google-cloud__storage";
import { Schedule } from "../model/schedule.model";
import { DocumentSnapshot, WriteResult } from "@google-cloud/firestore";
import { ScheduleCandidate } from "../model/schedule.candidate.model";
import { notifyError } from "../notifications/notifications";
import { parseFileNameDate } from "../dates/dates";
import { document } from "firebase-functions/lib/providers/firestore";

const SCHEDULE_URL_CURRENT = "http://www.musterschule.de/Termine/Vertretungen_heute.php";
const SCHEDULE_URL_FUTURE = "http://www.musterschule.de/Termine/Vertretungen_morgen.php";
const REF_SCHEDULES = "schedules";
const REF_METADATA = "metadata";

const DOC_METADATA_ERRORS = "errors";
const DOC_METADATA_CLIENT = "client";

const CLIENT_KEY_CURRENT_SCHEDULE_ID = "currentScheduleId";
const CLIENT_KEY_FUTURE_SCHEDULE_ID = "futureScheduleId";

const firestore = admin.firestore();
const storage = admin.storage();

var isErrorDebug: boolean = false;

export default async function (req: Request, res: Response) {
    isErrorDebug = req.query.errorDebug != null;

    const currentUrl = await retrieveRefreshUrl(SCHEDULE_URL_CURRENT);
    const futureUrl = await retrieveRefreshUrl(SCHEDULE_URL_FUTURE);

    if (currentUrl != null) {
        console.log("A schedule is available under the 'today' link, refresh will be invoked");
        const documentId = await refreshSchedule(currentUrl);
        if (documentId != null) {
            await updateClientMetadata(CLIENT_KEY_CURRENT_SCHEDULE_ID, documentId);
        }
    }

    if (futureUrl != null) {
        console.log("A schedule is available under the 'tomorrow' link, refresh will be invoked");
        const documentId = await refreshSchedule(futureUrl);
        if (documentId != null) {
            await updateClientMetadata(CLIENT_KEY_FUTURE_SCHEDULE_ID, documentId);
        }
    }

    const finalMessage = "Finished refreshing the schedules where necessary";
    console.log(finalMessage);
    res.send(finalMessage);
}

async function updateClientMetadata(key: string, documentId: string) {
    const snapshot = await firestore.collection(REF_METADATA)
        .doc(DOC_METADATA_CLIENT)
        .get();
    const clientMetadata = snapshot.data();
    clientMetadata[key] = documentId;
    await firestore.collection(REF_METADATA)
        .doc(DOC_METADATA_CLIENT)
        .update(clientMetadata)
        .then(function (result: WriteResult) {
            console.log("Successfully updated client metadata '" + key + "' to " + documentId);
        })
        .catch(function (error) {
            console.log("Failed to update client metadata '" + key + "' to " + documentId);
        })
}

async function refreshSchedule(scheduleUrl: string): Promise<string> {
    const tempFilePath = await downloadSchedule(scheduleUrl);
    const candidate: ScheduleCandidate = await extractScheduleData(isErrorDebug ? null : tempFilePath)
        .catch(function (error) {
            console.log("Failed to extract schedule data: " + error);
            return handleExtractionError(tempFilePath)
                .then(function () {
                    return null;
                });
        });
    var documentId: string = null;
    if (candidate != null) {
        console.log("Successfully extracted schedule data");
        const predictedDocumentId = getDocumentId(candidate.pdfTarget);
        documentId = await compareAndUpdateScheduleData(candidate, tempFilePath, predictedDocumentId)
            .then(function (success: boolean) {
                return success ? predictedDocumentId : null;
            })
            .catch(function (error) {
                console.log("Failed to write schedule data: " + error);
                return null;
            });
    }
    await removeTempFile(tempFilePath);
    return documentId;
}

async function compareAndUpdateScheduleData(candidate: ScheduleCandidate, tempFilePath: string, documentId: string): Promise<boolean> {
    const snapshot = await firestore.collection(REF_SCHEDULES)
        .doc(documentId)
        .get()
        .catch(function (error) {
            console.log("Failed to fetch snapshot of existing document (id " + documentId + "): " + error);
            return null;
        });
    if (snapshot != null) {
        if (snapshot.exists) {
            console.log("Document (id " + snapshot.id + ") already exists");
            const oldSchedule = snapshot.data() as Schedule;
            const oldUpdated = oldSchedule.updated as Date;
            const newUpdated = candidate.pdfModified as Date;
            if (newUpdated.getTime() > oldUpdated.getTime()) {
                console.log("The newly extracted schedule data is more recent than the existing schedule data");
                const schedule = convertToSchedule(candidate, oldSchedule.created, oldSchedule.revision + 1);
                await firestore.collection(REF_SCHEDULES)
                    .doc(documentId)
                    .update(schedule);
                console.log("Updated document (id " + snapshot.id + ") and its corresponding data to revision " + schedule.revision);
                await uploadScheduleFile(tempFilePath);
            } else console.log("The newly extracted schedule data is not " +
                "more recent than the existing schedule data, not updating");
        } else {
            console.log("Document (id " + snapshot.id + ") does not yet exist");
            const schedule = convertToSchedule(candidate, candidate.pdfModified, 1);
            await firestore.collection(REF_SCHEDULES)
                .doc(documentId)
                .set(schedule);
            console.log("Inserted new document (id " + snapshot.id + ") and its corresponding data for revision " + schedule.revision);
            await uploadScheduleFile(tempFilePath);
        }
        return true;
    } else return false;
}

function uploadScheduleFile(tempFilePath: string): Promise<void> {
    const destination = REF_SCHEDULES + '/' + tempFilePath.substring(tempFilePath.lastIndexOf('/') + 1);
    const uploadOptions = {
        destination: destination
    };
    return storage.bucket().upload(tempFilePath, uploadOptions)
        .then(function (files: [File]) {
            console.log("Uploaded the schedule file " + tempFilePath + " to Storage at /" + destination);
        })
        .catch(function (error) {
            console.log("Failed to upload file " + tempFilePath + " to Storage: " + error);
        });
}

function getDocumentId(target: Date): string {
    return target.getFullYear() + ('0' + (target.getMonth() + 1)).slice(-2) + ('0' + target.getDate()).slice(-2);
}

async function handleExtractionError(tempFilePath: string) {
    const fileNameDateString = tempFilePath.substring(tempFilePath.lastIndexOf("/") + 1, tempFilePath.lastIndexOf("."));
    const target = parseFileNameDate(fileNameDateString);
    const documentId = getDocumentId(target);
    const errorsRef = firestore.collection(REF_METADATA)
        .doc(DOC_METADATA_ERRORS)
    const snapshot = await errorsRef.get();

    const errors = snapshot.data();
    const schedules = errors.schedules as string[];

    const isFirstEncounter = schedules.findIndex(function (scheduleId: string) {
        return scheduleId == documentId;
    }) == -1;
    if (isFirstEncounter) {
        schedules.push(documentId);
        await errorsRef.update(errors);
        await notifyError("Invalid pdf table structure", target);
    }
}

function convertToSchedule(candidate: ScheduleCandidate, created: Date, revision: number): Schedule {
    return {
        created: created,
        updated: candidate.pdfModified,
        revision: revision,
        target: candidate.pdfTarget,
        maintenanceClass: candidate.pdfMaintenanceClass,
        maintenanceTutor: candidate.pdfMaintenanceTutor,
        seniorMaintenanceClass: candidate.pdfSeniorMaintenanceClass,
        seniorMaintenanceTutor: candidate.pdfSeniorMaintenanceTutor,
        entries: candidate.pdfEntries
    } as Schedule
}
import { ScheduleEntry } from "./schedule.entry.model";

export type ScheduleCandidate = {
    pdfTarget: Date;
    pdfModified: Date;
    pdfMaintenanceClass: string;
    pdfMaintenanceTutor: string;
    pdfSeniorMaintenanceClass: string;
    pdfSeniorMaintenanceTutor: string;
    pdfEntries: ScheduleEntry[];
}
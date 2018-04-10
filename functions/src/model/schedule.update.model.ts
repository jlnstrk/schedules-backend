import { ScheduleEntry } from "./schedule.entry.model";

export type ScheduleUpdate = {
    totalUpdates: number;
    updatedEntries: ScheduleEntry[];
}
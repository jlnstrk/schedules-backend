import { ScheduleEntry } from "./schedule.entry.model";
import { ScheduleMetadata } from "./schedule.metadata.model";

export type Schedule = ScheduleMetadata & {
    entries: ScheduleEntry[];
}
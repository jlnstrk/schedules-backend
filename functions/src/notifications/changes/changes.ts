import { ScheduleEntry } from "../../model/schedule.entry.model";

export default function (oldEntries: ScheduleEntry[], newEntries: ScheduleEntry[]): ScheduleEntry[] {
    return newEntries.filter(function (newEntry: ScheduleEntry) {
        return oldEntries.findIndex(function (oldEntry: ScheduleEntry) {
            return oldEntry.class === newEntry.class
                && oldEntry.lesson === newEntry.lesson
                && oldEntry.originalTeacher === newEntry.originalTeacher
                && oldEntry.originalSubject === newEntry.originalSubject
                && oldEntry.newTeacher === newEntry.newTeacher
                && oldEntry.newSubject === newEntry.newSubject
                && oldEntry.room === newEntry.room
                && oldEntry.message === newEntry.message
        }) == -1;
    });
}
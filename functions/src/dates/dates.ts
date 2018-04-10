export function parseMetadataDate(pdfDate: string): Date {
    const parsingCompatible = pdfDate.replace(/'/g, '')
        .replace("D:", '');
    const year = parseInt(parsingCompatible.substring(0, 4));
    const month = parseInt(parsingCompatible.substring(4, 6));
    const day = parseInt(parsingCompatible.substring(6, 8));
    const hours = parseInt(parsingCompatible.substring(8, 10));
    const minutes = parseInt(parsingCompatible.substring(10, 12));
    const seconds = parseInt(parsingCompatible.substring(12, 114));
    const timezoneOffset = parsingCompatible[14] == '+' ?
        parseInt(parsingCompatible.substring(15, 17)) : -parseInt(parsingCompatible.substring(15, 17));
    const date = new Date(year, month - 1, day, hours, minutes, seconds);
    const timezoneCompensation = ((date.getTimezoneOffset() < 0 ?
        -date.getTimezoneOffset() : date.getTimezoneOffset()) + timezoneOffset * 60) * 60000;
    return new Date(date.getTime() - timezoneCompensation);
}

export function parseFileNameDate(fileNameDate: string): Date {
    const year = parseInt(fileNameDate.substring(0, 2)) + 2000;
    const month = parseInt(fileNameDate.substring(2, 4)) - 1;
    const day = parseInt(fileNameDate.substring(4, 6));
    return new Date(year, month, day);
}

export function parseScheduleDate(scheduleDateElement: string): Date {
    const scheduledFor = scheduleDateElement
        .split(' ')[2]
        .split('.')
        .slice(0, 2);
    const modifiedCurrentDate = new Date();
    const scheduledForDay = parseInt(scheduledFor[0]);
    const scheduledForMonth = parseInt(scheduledFor[1]) - 1;

    modifiedCurrentDate.setHours(0, 0, 0, 0);
    if (scheduledForMonth == 1 && modifiedCurrentDate.getMonth() == 11) {
        modifiedCurrentDate.setFullYear(modifiedCurrentDate.getFullYear() + 1);
    }
    modifiedCurrentDate.setMonth(scheduledForMonth);
    modifiedCurrentDate.setDate(scheduledForDay);
    return modifiedCurrentDate;
}
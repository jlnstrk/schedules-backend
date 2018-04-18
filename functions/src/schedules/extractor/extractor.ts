import { PDFExtract } from 'pdf.js-extract';
import { ScheduleEntry } from "../../model/schedule.entry.model";
import { ScheduleCandidate } from '../../model/schedule.candidate.model';
import { parseScheduleDate, parseMetadataDate } from '../../dates/dates';

const PREFIX_SCHEDULE_TITLE = "Vertretungen";
const PREFIX_MAINTENANCE = "Hofdienst";
const PREFIX_SENIOR_MAINTENANCE = "Ordnungsdienst Oberstufenraum und Terrasse";

export default function (filePath: string): Promise<ScheduleCandidate> {
    return new Promise(function (resolve, reject) {
        const pdfExtract = new PDFExtract();
        pdfExtract.extract(filePath, {}, function (err, data) {
            if (err != null) {
                console.log(err);
                reject(err);
            } else try {
                const firstPage = data.pages[0];
                const pageInfo = firstPage.pageInfo;
                const isSchedule = (pageInfo.height as number) > (pageInfo.width as number);
                if (isSchedule) {
                    let allEntries = [];
                    const metaLines = extractHeaderLines(data.pages[0]);
                    data.pages.forEach(function (page) {
                        const dataRows = extractEntryRows(page);
                        if (dataRows == null) {
                            reject("The target pdf is not extraction-compatible, text structure is invalid");
                        }
                        const multilineFixed = fixMultilineMessages(dataRows);
                        const pageEntries = mapToEntries(multilineFixed);
                        allEntries = allEntries.concat(pageEntries);
                    });
                    const modified = parseMetadataDate(data.meta.info.ModDate);
                    const candidate = mapToCandidate(modified, metaLines, allEntries);
                    resolve(candidate);
                } else reject("The target pdf is not an actual schedule pdf, pages are landscape");
            } catch (error) {
                reject("The target pdf is not extraction-compatible, text structure is invalid: " + error);
            }
        });
    });
}

function extractHeaderLines(page): string[] {
    const lines = {};
    page.content.forEach(function (text) {
        if (lines[text.y] == undefined) {
            lines[text.y] = [];
        }
        lines[text.y].push(text);
    });
    return Object.keys(lines)
        .filter(function (key: string) {
            return lines[key][0].str.startsWith(PREFIX_SCHEDULE_TITLE)
                || lines[key][0].str.startsWith(PREFIX_MAINTENANCE)
                || lines[key][0].str.startsWith(PREFIX_SENIOR_MAINTENANCE);
        })
        .map(function (key: string) {
            return lines[key][0].str;
        });
}

function extractEntryRows(page): string[][] {
    const lines = {};
    page.content.forEach(function (text) {
        if (lines[text.y] == undefined) {
            lines[text.y] = [];
        }
        lines[text.y].push(text);
    });

    const sortedKeys = Object.keys(lines)
        .sort(function (a, b) {
            return parseFloat(a) - parseFloat(b);
        });

    function meetsEntryRowCriteria(key: string) {
        return lines[key].length >= 4;
    }

    const firstEntryRowIndex = sortedKeys.findIndex(meetsEntryRowCriteria) + 1;
    const lastEntryRowIndex = sortedKeys.length - sortedKeys.slice().reverse().findIndex(meetsEntryRowCriteria);
    const entryRows = sortedKeys
        .slice(firstEntryRowIndex, lastEntryRowIndex)
        .map(function (key: string) {
            return lines[key];
        });

    const headerRow = lines[sortedKeys[firstEntryRowIndex - 1]];
    const horizontalColumnCoordinates = headerRow
        .map(function (item) {
            return item.x;
        });

    for (let i = 0; i < entryRows.length; i++) {
        const items = entryRows[i];
        // Fill in missing entries (including their x coordinate)
        if (items.length >= 4 && items.length < 8) {
            horizontalColumnCoordinates.forEach(function (x: number) {
                const atIndex = items.findIndex(function (item) {
                    return item.x == x;
                });
                if (atIndex == -1) {
                    const clone = Object.create(items[0]);
                    clone.x = x;
                    clone.str = null;
                    items.push(clone);
                }
            })
        }

        // If even after our post-processing, there aren't 8 column entries for each row, 
        // then we're dealing with an invalid format
        if (items.length < 8) {
            return null;
        }

        // Sort by columns and map to field texts
        entryRows[i] = items
            .sort(function (a, b) {
                return parseFloat(a.x) - parseFloat(b.x);
            })
            .map(function (item, index) {
                const text = item.str == "---" ? null : item.str;
                // When it comes to lessons (second column),
                // we want to remove the spaces. As an example, '5 - 6' becomes '5-6'
                return index == 1 ? text.replace(/ /g, '') : text;
            });
    }
    return entryRows;
}

function fixMultilineMessages(entryRows: string[][]): string[][] {
    const multilineIndices = [];
    entryRows.forEach(function (row: string[], index: number) {
        if (row.length == 1) {
            for (let i = index - 1; i >= 0; i--) {
                if (entryRows[i].length > 1) {
                    const lastIndex = entryRows[i].length - 1;
                    const toAdd = row[0];
                    const currentValue = entryRows[i][lastIndex];
                    const missingSpace = currentValue[currentValue.length - 1] != ' ' && toAdd[0] != ' ';
                    entryRows[i][lastIndex] = missingSpace ?
                        currentValue + ' ' + toAdd : currentValue + toAdd;
                    break;
                }
            }
            multilineIndices.push(index);
        }
    });
    return entryRows.filter(function (row: string[], index: number) {
        for (let i = 0; i < multilineIndices.length; i++) {
            if (multilineIndices[i] == index) {
                return false;
            }
        }
        return true;
    });
}

function mapToEntries(entryRows: string[][]): ScheduleEntry[] {
    return entryRows.map(function (row: string[]) {
        return {
            class: row[0],
            lesson: row[1],
            originalTeacher: row[2],
            originalSubject: row[3],
            newTeacher: row[4],
            newSubject: row[5],
            room: row[6],
            message: row[7]
        } as ScheduleEntry;
    });
}

export function mapToCandidate(pdfModified: Date, headerLines: string[], pdfEntries: ScheduleEntry[]): ScheduleCandidate {
    const pdfTarget = parseScheduleDate(headerLines[0]);
    const pdfMaintenance = extractMaintenance(headerLines[1]);
    const pdfSeniorMaintenance = extractSeniorMaintenance(headerLines[2]);
    return {
        pdfTarget: pdfTarget,
        pdfModified: pdfModified,
        pdfMaintenanceClass: pdfMaintenance[0],
        pdfMaintenanceTutor: pdfMaintenance[1],
        pdfSeniorMaintenanceClass: pdfSeniorMaintenance[0],
        pdfSeniorMaintenanceTutor: pdfSeniorMaintenance[1],
        pdfEntries: pdfEntries
    } as ScheduleCandidate;
}

function extractMaintenance(maintenanceMetaElement: string): string[] {
    return maintenanceMetaElement
        .replace('(', '')
        .replace(')', '')
        .split(' ')
        .slice(1);
}

function extractSeniorMaintenance(seniorMaintenanceMetaElement: string): string[] {
    const parts = seniorMaintenanceMetaElement.split(' ');
    return parts.slice(parts.length - 2);
}




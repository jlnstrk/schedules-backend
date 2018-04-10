import * as parseMetaRefresh from 'http-equiv-refresh';
import * as DOMParser from 'dom-parser';
import * as fs from 'fs';
import * as download from 'download';
import * as rp from 'request-promise';
import { ReadStream } from "fs";

const TEMP_DIRECTORY = "/tmp";
const TEMP_SCHEDULES_DIRECTORY = TEMP_DIRECTORY + "/schedules";

export async function retrieveRefreshUrl(scriptUrl: string): Promise<string> {
    const response = await rp(scriptUrl);
    const parser = new DOMParser();
    const htmlDocument = parser.parseFromString(response, "text/html");
    const meta = htmlDocument
        .getElementsByTagName("head")[0]
        .getElementsByTagName("meta")[0];
    if (meta.getAttribute("http-equiv") == "refresh") {
        return parseMetaRefresh(meta.getAttribute("content")).url;
    } else return null;
}

export async function downloadSchedule(url: string): Promise<string> {
    if (!await fs.existsSync(TEMP_SCHEDULES_DIRECTORY)) {
        await fs.mkdirSync(TEMP_SCHEDULES_DIRECTORY);
    }
    const filePath = TEMP_SCHEDULES_DIRECTORY + "/" + url.substring(url.lastIndexOf("/") + 1);
    await download(url, TEMP_SCHEDULES_DIRECTORY);
    console.log("Temporarily saved schedule at " + filePath);
    return filePath;
}

export async function removeTempFile(filePath: string) {
    console.log("Removing the temporarily saved schedule from " + filePath);
    return await fs.unlinkSync(filePath);
}

export function createTempFileReadStream(filePath: string): ReadStream {
    return fs.createReadStream(filePath);
}
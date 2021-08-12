import {ShortURLSite} from "../types/ShortURLSite.mjs";
import {decodeShortURL} from "../utils.mjs";

export class BilibiliShortURLSite extends ShortURLSite {
    name = "Bilibili";
    regex = /b23\.tv\/.+/i;

    restore = decodeShortURL;
}

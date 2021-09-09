import {ShortURLSite} from "../types/ShortURLSite.mjs";
import {decodeShortURL} from "../utils.mjs";

export default class TwitterShortURLSite extends ShortURLSite {
    name = "Twitter";
    regex = /t\.co\/.+/i;

    restore = decodeShortURL;
}

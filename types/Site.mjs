import {URLItem} from "./URLItem.mjs";
import {ReplyMessage} from "./ReplyMessage.mjs";

/**
 * Site
 */
export class Site {
    /**
     * name
     * @type {string}
     */
    name;

    /**
     * match url regex
     * @type {RegExp}
     */
    regex;

    /**
     * generate reply message
     * @param {URLItem} urlItem URLItem object
     * @returns {Promise<ReplyMessage>|null}
     */
    async generateMessage(urlItem) {
    }
}

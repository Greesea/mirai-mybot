import {URLItem} from "./URLItem.mjs";
import {Site} from "./Site.mjs";
import {ReplyMessage} from "./ReplyMessage.mjs";

/**
 * MatchedURL
 */
export class MatchedURL {
    /**
     * urlItem
     * @type {URLItem}
     */
    urlItem;

    /**
     * site object
     * @type {Site}
     */
    site;

    /**
     * @param {URLItem} urlItem URLItem object
     * @param {Site} site Site object
     */
    constructor(urlItem, site) {
        this.urlItem = urlItem;
        this.site = site;
    }

    /**
     * generate reply message from site
     * @returns {Promise<ReplyMessage>|null}
     */
    async generateMessage() {
        if (!this.site?.generateMessage) return;
        return this.site?.generateMessage(this.urlItem);
    }
}

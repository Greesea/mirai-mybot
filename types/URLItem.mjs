/**
 * URLItem
 */
export class URLItem {
    /**
     * actual url
     * @type {string}
     */
    url;

    /**
     * raw url(user input)
     * @type {string}
     */
    raw;

    /**
     * @param {string} url actual url
     * @param {string} raw raw url(user input)
     */
    constructor(url, raw = url) {
        this.url = url;
        this.raw = raw;
    }
}

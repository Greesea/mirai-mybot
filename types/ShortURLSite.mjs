/**
 * ShortURLSite
 */
export class ShortURLSite {
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
     * restore url
     * @param {string} url
     * @returns {Promise<string>|null}
     */
    async restore(url) {
    }
}

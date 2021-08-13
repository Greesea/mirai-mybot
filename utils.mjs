import fs from "fs";
import path from "path";
import axios from "axios";
import sharp from "sharp";
import fastXmlParser from "fast-xml-parser";

//region import {Message as MiraiMessage} from "MiraiMessage"
import Mirai from "mirai-ts";

const {Message: MiraiMessage} = Mirai;

//endregion
import {MessageTypes} from "./types/MessageChain.mjs";
import {URLItem} from "./types/URLItem.mjs";
import {MatchedURL} from "./types/MatchedURL.mjs";
import {ShortURLSite} from "./types/ShortURLSite.mjs";
import {Site} from "./types/Site.mjs";

import {axiosSettings, thumbnailMaximumSize, thumbnailDownloadTimeout, miraiRoot, miraiHttpCachePath, miraiHttpCacheAbsolutePath, fastXmlParserOptions} from "./settings.mjs";

export const axiosInstance = axios.create(axiosSettings);

/**
 * @param {string} dirPath
 * @returns {Promise<ShortURLSite[]|Site[]>}
 */
export const loadSites = async (dirPath) => {
    let instances = [];
    for (const siteModuleName of fs.readdirSync(dirPath)) {
        let {default: moduleClass} = await import(`${dirPath}/${siteModuleName}`);
        if (!(moduleClass instanceof Function))
            continue;

        instances.push(new moduleClass());
    }

    return instances;
}

/**
 * @param {string} url
 * @returns {Promise<string|null>}
 */
export const decodeShortURL = async (url) => {
    try {
        console.log(`[DecodeShortURL] decoding ${url}`);
        await axiosInstance({
            method: "get",
            url: url,
            maxRedirects: 0,
        });
    } catch (e) {
        if (e?.code) {
            console.log(`[DecodeShortURL] error: ${e.code}`);
            return null;
        }
        return e?.response?.headers?.location;
    }

    return null;
};

/**
 * @param {string} targetURL
 * @param {string} savePath
 * @param {number} timeout
 * @returns {Promise<void>}
 */
export const download = async (targetURL, savePath, timeout = 0) => {
    return new Promise(async (resolve, reject) => {
        try {
            let response = await axiosInstance({
                method: "get",
                url: targetURL,
                responseType: "stream",
                timeout,
            });

            response.data.pipe(fs.createWriteStream(savePath));
            response.data.on("end", () => {
                resolve();
            });
            response.data.on("error", (e) => {
                reject(e);
            });
        } catch (e) {
            reject(e);
        }
    });
};

/**
 * @param {string} url
 * @returns {Promise<{thumbnailRelativePath:string, thumbnailAbsolutePath:string}|{}>}
 */
export const thumbnailDownloader = async (url) => {
    let id = ++thumbnailDownloader.sequence;
    let extension = url.split(".");
    extension = extension.length > 1 ? extension[extension.length - 1] : null;
    let thumbnailRelativePath = path.join(miraiHttpCachePath, `./__thumbnail_${id}${extension ? "." + extension : ""}`);
    let thumbnailAbsolutePath = path.resolve(miraiRoot, thumbnailRelativePath);

    try {
        console.log(`[ThumbnailDownloader] starting ${id}, ${url}`);
        await download(url, thumbnailAbsolutePath, thumbnailDownloadTimeout * 1000);
        console.log(`[ThumbnailDownloader] download complete ${id}, ${url}`);
    } catch (e) {
        console.warn(`[ThumbnailDownloader] download failed, seqid: ${id}, ${url}`);
        return {};
    }

    try {
        let thumbnailImage = sharp(thumbnailAbsolutePath);
        let thumbnailImageMetadata = await thumbnailImage.metadata();
        if ((thumbnailImageMetadata.width ?? 0) > thumbnailMaximumSize.width || (thumbnailImageMetadata.height ?? 0) > thumbnailMaximumSize.height) {
            fs.writeFileSync(thumbnailAbsolutePath, await thumbnailImage.resize(thumbnailMaximumSize).toBuffer());
            console.log(`[ThumbnailDownloader] resize ${id}, ${url}`);
        }
    } catch (e) {
        console.warn(`[ThumbnailDownloader] resize failed, seqid: ${id}, ${url}`);
        //resize fail doesn't affect output thumbnail
    }

    return {thumbnailRelativePath, thumbnailAbsolutePath};
};
thumbnailDownloader.sequence = 0;

/**
 * @param {MiraiMessage[]} messageChain incoming message
 * @returns {Promise<MatchedURL[]>|null}
 */
export const matchURLFromMessageChain = async (messageChain = []) => {
    let rawURLs = [];

    //fetch raw
    let plainItems = messageChain.filter(item => item?.type === MessageTypes.plain);
    if (plainItems?.length) {
        plainItems.forEach(plainItem => {
            let matched = (plainItem?.text ?? "").match(matchURLFromMessageChain.urlMatchRegex) ?? [];
            if (!matched.length)
                return;
            rawURLs = rawURLs.concat(matched);
        });
    }
    let xmlItems = messageChain.filter(item => item.type === MessageTypes.xml);
    if (xmlItems?.length != null) {
        xmlItems.forEach(xmlItem => {
            if (xmlItem?.xml == null)
                return;
            let xmlObj = fastXmlParser.parse(xmlItem.xml, fastXmlParserOptions);
            if (xmlObj?.msg?.____attr____?.action !== "web")
                return;
            let matched = (xmlObj?.msg?.____attr____?.url ?? "").match(matchURLFromMessageChain.urlMatchRegex) ?? [];
            if (!matched.length)
                return;
            rawURLs = rawURLs.concat(matched);
        });
    }
    if (!rawURLs.length) return;

    //parse short url to actual url
    let urls = [];
    for (const rawURL of rawURLs) {
        let site = matchURLFromMessageChain.shortURLSites.find(site => site?.regex?.test(rawURL));
        if (site == null) {
            urls.push(new URLItem(rawURL));
            continue;
        }
        let actualURL = await site.restore(rawURL);
        if (actualURL == null || actualURL === "") {
            urls.push(new URLItem(rawURL));
            continue;
        }
        urls.push(new URLItem(actualURL, rawURL));
    }

    //match site
    return urls
        .map(item => {
            let matchedSite = matchURLFromMessageChain.sites.find(site => site?.regex?.test(item.url));
            if (!matchedSite) return;

            return new MatchedURL(item, matchedSite);
        })
        .filter(item => !!item);
};
matchURLFromMessageChain.urlMatchRegex = /http(s)?:\/\/[0-9a-zA-Z\\\/\?\&\;\-\.\=#_]+?(?=([^0-9a-zA-Z\\\/\?\&\;\-\.\=#_]|$){1})/gi;
/**
 * @type {ShortURLSite[]}
 */
matchURLFromMessageChain.shortURLSites = [];
/**
 * @type {Site[]}
 */
matchURLFromMessageChain.sites = [];

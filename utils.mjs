import fs from "fs";
import path from "path";
import axios from "axios";
import sharp from "sharp";
import fastXmlParser from "fast-xml-parser";
import childprocess from "child_process";

//region import {Message as MiraiMessage} from "MiraiMessage"
import Mirai from "mirai-ts";

const {Message: MiraiMessage} = Mirai;

//endregion
import {MessageTypes} from "./types/MessageChain.mjs";
import {URLItem} from "./types/URLItem.mjs";
import {MatchedURL} from "./types/MatchedURL.mjs";
import {ShortURLSite} from "./types/ShortURLSite.mjs";
import {Site} from "./types/Site.mjs";

import {axiosSettings, thumbnailMaximumSize, thumbnailDownloadTimeout, miraiRoot, miraiHttpCachePath, miraiHttpCacheAbsolutePath, miraiHttpSettings, fastXmlParserOptions} from "./settings.mjs";

export const axiosInstance = axios.create(axiosSettings);

/**
 * @param {string|URL} url
 * @param {number} index
 * @returns {string|null}
 */
export const getValueFromURL = (url, index = 0) => {
    let urlObject = url instanceof URL ? url : new URL(url);
    let array = urlObject.pathname.split("/").filter(item => item != null && item !== "");
    let targetIndex = index;
    if (index < 0) {
        targetIndex = index % array.length;
        if (targetIndex !== 0)
            targetIndex += array.length
    }
    return array[targetIndex];
};

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
 * @param {string} command
 * @param {string[]} args
 * @param {{}} options
 * @param {Function} stdout
 * @param {Function} stderr
 * @returns {Promise<void>}
 */
export const runCommand = (command, args, options, stdout, stderr) => {
    let process = childprocess.spawn(command, args ?? [], options);
    process.stdout.on("data", stdout || (() => {
    }));
    process.stderr.on("data", stderr || (() => {
    }));

    return new Promise((resolve, reject) => {
        process.on("close", code => {
            if (code === 0)
                resolve();
            else {
                if (stderr)
                    stderr();
                reject();
            }
        });
    });
};

/**
 * @param {string} sourcePath absolutePath
 * @param {string} targetPath absolutePath
 * @param {{ratio:{x:number, y:number}}} sourceInfo
 * @param {{width:number, height:number, frameRate:number}} config
 * @param {boolean} lossy
 * @returns {Promise<void>}
 */
export const convertVideoToGif = async (sourcePath, targetPath, sourceInfo, config, lossy = false) => {
    let auto = sourceInfo?.ratio ?
        (sourceInfo.ratio.x ?? 0) > (sourceInfo.ratio.y ?? 0) ? "height" : "width" :
        (config?.width ?? 0) > (config?.height ?? 0) ? "height" : "width";
    let scale = `${auto === "width" ? "-1" : config?.width ?? 0}:${auto === "height" ? "-1" : config?.height ?? 0}`;

    await runCommand(
        "ffmpeg",
        [
            `-y`,
            `-loglevel`, `error`,
            `-i`, sourcePath,
        ].concat(
            lossy ?
                [
                    `-r`, config?.frameRate ?? 10,
                    `-vf`, `scale=${scale}`,
                ] :
                [
                    `-vf`, `${config?.frameRate ? `fps=${config?.frameRate},` : ""}scale=${scale}:flags=full_chroma_int,split [a][b];[a] palettegen=max_colors=255:reserve_transparent=1:stats_mode=diff [p];[b][p] paletteuse=dither=none:bayer_scale=5:diff_mode=rectangle:new=1`
                ]
        ).concat([targetPath]),
        {},
        out => {
            if (out)
                console.log(out.toString().trimEnd());
        },
        err => {
            if (err)
                console.warn(err.toString().trimEnd());
        }
    );
};

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
 * @param {string} url
 * @param {{ratio:{x:number, y:number}, duration:number}} sourceInfo
 * @param {{fileSizeLimitBytes:number, highQualityDurationLimitMilliseconds:number, maximumSize:{frameRate:number, width:number,height:number}, minimumSize:{frameRate:number, width:number,height:number}}} compressConfig
 * @returns {Promise<{}|{relativePath: string, absolutePath: [string, string]}>}
 */
export const videoDownloader = async (url, sourceInfo = {}, compressConfig = {}) => {
    let id = ++videoDownloader.sequence;
    let extension = new URL(url).pathname.split(".");
    extension = extension.length > 1 ? extension[extension.length - 1] : null;
    let relativePath = path.join(miraiHttpCachePath, `./__video_${id}${extension ? "." + extension : ""}`);
    let absolutePath = path.resolve(miraiRoot, relativePath);
    let gifRelativePath = `${relativePath}.gif`;
    let gifAbsolutePath = `${absolutePath}.gif`;

    try {
        console.log(`[VideoDownloader] starting ${id}, ${url}`);
        await download(url, absolutePath, thumbnailDownloadTimeout * 1000);
        console.log(`[VideoDownloader] download complete ${id}, ${url}`);
    } catch (e) {
        console.warn(`[VideoDownloader] download failed, seqid: ${id}, ${url}`);
        return {};
    }

    try {
        let latestFileSize = sourceInfo.duration > compressConfig.highQualityDurationLimitMilliseconds ? 0 : null;
        while (true) {
            console.log(`[VideoDownloader] creating gif using ${latestFileSize == null ? "highQuality" : "lowQuality"} configuration`);
            await convertVideoToGif(absolutePath, gifAbsolutePath, sourceInfo, compressConfig[latestFileSize == null ? "highQuality" : "lowQuality"], latestFileSize != null);
            let fileSize = fs.statSync(gifAbsolutePath).size;
            if (fileSize < compressConfig.fileSizeLimitBytes) {
                latestFileSize = fileSize;
                break;
            } else if (latestFileSize != null) {
                console.warn(`[VideoDownloader] create gif failed. exceed fileSizeLimit, seqid:${id}, fileSize:${Math.round(fileSize / 1024)}K`);
                return {};
            }

            latestFileSize = fileSize;
            console.log(`[VideoDownloader] gif exceed fileSizeLimit, seqid:${id}, fileSize:${Math.round(fileSize / 1024)}K`);
        }

        console.log(`[VideoDownloader] create gif complete, seqid:${id}, fileSize: ${Math.round(latestFileSize / 1024)}K`);
    } catch (e) {
        console.warn(`[VideoDownloader] create gif failed, seqid: ${id}, ${url}`);
        throw e;
    }

    return {relativePath: gifRelativePath, absolutePath: [absolutePath, gifAbsolutePath]};
};
videoDownloader.sequence = 0;

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

/**
 * @param {number} botNumber
 * @returns {Promise<{sessionKey: string, botNumber: number, release: (function(): Promise<void>), url: string}|void>}
 */
export const getMiraiHttpSession = async (botNumber) => {
    if (
        !(miraiHttpSettings?.adapters ?? []).includes("http") ||
        !miraiHttpSettings?.adapterSettings?.http?.host ||
        !miraiHttpSettings?.adapterSettings?.http?.port
    )
        return;
    let url = `http://${miraiHttpSettings.adapterSettings.http.host}:${miraiHttpSettings.adapterSettings.http.port}`
    let response;
    let sessionKey;

    try {
        //region get session
        response = await axiosInstance.post(`${url}/verify`, {
            verifyKey: miraiHttpSettings?.verifyKey,
        });
        if (response?.data?.code !== 0 || !response?.data?.session)
            return;
        sessionKey = response.data.session;
        //endregion

        //region try to bind
        response = await axiosInstance.post(`${url}/bind`, {
            sessionKey,
            qq: botNumber,
        });
        if (response?.data?.code !== 0)
            return;
        //endregion
    } catch (e) {
        return;
    }

    return {
        url,
        botNumber,
        sessionKey,
        release: getMiraiHttpSession.releaseSession,
    };
};
getMiraiHttpSession.releaseSession = async function () {
    try {
        //region release session
        let response = await axiosInstance.post(`${this.url}/release`, {
            sessionKey: this.sessionKey,
            qq: this.botNumber,
        });
        if (response?.data?.code !== 0)
            throw true;
        //endregion
    } catch (e) {
        console.log(`[getMiraiHttpSession] release session failed. ${this.sessionKey}`);
    }
};

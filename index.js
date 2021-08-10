const fs = require("fs"),
    path = require("path"),
    yaml = require("js-yaml"),
    axios = require("axios"),
    sharp = require("sharp"),
    fastXmlParser = require("fast-xml-parser"),
    he = require("he");

const Mirai = require("mirai-ts"),
    { Message } = require("mirai-ts"),
    biliAPI = require("bili-api"),
    got = require("got"),
    musicAPI = require("@suen/music-api");

let __settings;
try {
    __settings = JSON.parse(fs.readFileSync("./settings.json", { encoding: "utf-8" }));
} catch (e) {
    console.error("invalid settings");
    return;
}

const { botNumber, waitAutoReloginTimeout = 0, requestTimeout = 10, requestUserAgent, thumbnailDownloadTimeout = 10, thumbnailMaximumSize, miraiRoot, miraiAutoLoginConfigPath, miraiHttpConfigPath, miraiHttpCachePath } = { ...__settings },
    axiosInstance = axios.create({
        timeout: requestTimeout * 1000,
        headers: {
            "User-Agent": requestUserAgent, //default useragent
        },
    }),
    miraiHttpCacheAbsolutePath = path.resolve(miraiRoot, miraiHttpCachePath),
    miraiAutoLoginSettings = yaml.load(fs.readFileSync(path.resolve(miraiRoot, miraiAutoLoginConfigPath), "utf-8")),
    miraiHttpSettings = yaml.load(fs.readFileSync(path.resolve(miraiRoot, miraiHttpConfigPath), "utf-8")),
    fastXmlParserOptions = {
        ignoreAttributes: false,
        attrNodeName: "____attr____",
        attributeNamePrefix: "",
        attrValueProcessor: (val, attrName) => he.decode(val, { isAttributeValue: true }), //decode html charecter(like &amp;) from xml attribute
    };
thumbnailMaximumSize.fit = sharp.fit[thumbnailMaximumSize.fit] ?? sharp.fit.inside;

sharp.cache(false); //disable sharp cache feature
const mirai = new Mirai(miraiHttpSettings);
const run = async () => {
    const decodeShortURL = async (url) => {
        try {
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
    const download = async (targetUrl, savePath, timeout = 0) => {
        return new Promise(async (resolve, reject) => {
            try {
                let response = await axiosInstance({
                    method: "get",
                    url: targetUrl,
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
    const thumbnailDownloader = async (url) => {
        let id = ++thumbnailDownloader.sequence;
        let extension = url.split(".");
        extension = extension.length > 1 ? extension[extension.length - 1] : null;
        thumbnailRelativePath = path.join(miraiHttpCachePath, `./__thumbnail_${id}${extension ? "." + extension : ""}`);
        thumbnailAbsolutePath = path.resolve(miraiRoot, thumbnailRelativePath);

        try {
            console.log(`[ThumbnailDownloader] starting ${id}, ${url}`);
            await download(url, thumbnailAbsolutePath, thumbnailDownloadTimeout * 1000);
            console.log(`[ThumbnailDownloader] download complete ${id}, ${url}`);
        } catch (e) {
            console.warn(`[ThumbnailDownloader] download failed, seqid: ${id}, ${url}`);
            return;
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

        return { thumbnailRelativePath, thumbnailAbsolutePath };
    };
    thumbnailDownloader.sequence = 0;

    const matchUrlFromMessageChain = (messageChain = []) => {
        let urls = [];

        let plainItems = messageChain.filter((item) => item.type === "Plain");
        if (plainItems?.length) {
            plainItems.forEach((plainItem) => {
                let matched = (plainItem?.text ?? "").match(matchUrlFromMessageChain.urlMatchRegex) ?? [];
                if (!matched.length) return;
                urls = urls.concat(matched);
            });
        }
        let xmlItems = messageChain.filter((item) => item.type === "Xml");
        if (xmlItems?.length != null) {
            xmlItems.forEach((xmlItem) => {
                if (xmlItem?.xml == null) return;
                var xmlObj = fastXmlParser.parse(xmlItem.xml, fastXmlParserOptions);
                if (xmlObj?.msg?.____attr____?.action !== "web") return;

                let matched = (xmlObj?.msg?.____attr____?.url ?? "").match(matchUrlFromMessageChain.urlMatchRegex) ?? [];
                if (!matched.length) return;
                urls = urls.concat(matched);
            });
        }

        if (!urls.length) return;

        return urls
            .map((urlItem) => {
                let matchedSite = matchUrlFromMessageChain.sites.find((site) => site.regex.test(urlItem));
                if (!matchedSite) return;

                return {
                    url: urlItem,
                    site: matchedSite,
                };
            })
            .filter((item) => !!item);
    };
    matchUrlFromMessageChain.urlMatchRegex = /http(s)?:\/\/[0-9a-zA-Z\\\/\?\&\;\-\.\=#_]+?(?=([^0-9a-zA-Z\\\/\?\&\;\-\.\=#_]|$){1})/gi;
    matchUrlFromMessageChain.sites = [
        {
            name: "Bilibili Video",
            regex: /(b23\.tv\/.+)|(bilibili\.com\/video\/((av)|(bv)).+)/i,

            isShortURL: /b23\.tv\/.+/i,
            isBV: /^bv/i,

            async hackedGot({ url, cookie = {} }) {
                //based on bili-api/src/index.js:14
                //add timeout and user-agent option
                return got(new URL(url), {
                    timeout: requestTimeout * 1000,
                    headers: {
                        "User-Agent": requestUserAgent,
                        Cookie: Object.entries({ _uuid: "", rpdid: "", ...cookie })
                            .map(([k, v]) => `${k}=${v}`)
                            .join(";"),
                    },
                }).json();
            },
            createResponse(messageChain, callback) {
                return {
                    messageChain,
                    callback,
                };
            },
            async generateMessage(url) {
                console.log(`[${this.name}] new url, ${url}`);

                let messageChain = [];
                let currentURL = url;
                let isShortURL = this.isShortURL.test(currentURL);
                if (isShortURL) {
                    console.log(`[${this.name}] decoding short url, ${currentURL}`);
                    currentURL = await decodeShortURL(currentURL);
                    if (!this.regex.test(currentURL)) return; //ignore not video url
                }

                let currentURLObj = new URL(currentURL);
                let id = currentURLObj.pathname.split("/");
                id = id.length > 1 ? id[id.length - 1] : "";
                if (id == null || id === "") return this.createResponse([Message.Plain(`[${this.name}] 获取视频ID失败：${currentURL}${isShortURL ? ", short" : ""}`)]);

                let isBV = this.isBV.test(id);
                let params = {};
                if (isBV) {
                    params.bvid = id;
                } else {
                    params.aid = id.substring(2);
                }

                console.log(`[${this.name}] get info ${id}, isBV: ${isBV}, isShortURL: ${isShortURL}`);
                let response;
                try {
                    response = await biliAPI(params, ["view"], {
                        got: this.hackedGot,
                        wait: 200,
                    });
                    if (response?.view?.code !== 0) throw true;
                } catch (e) {
                    return this.createResponse([Message.Plain(`[${this.name}] 获取视频信息失败：${id}${isShortURL ? ", short" : ""}`)]);
                }

                let videoInfo = response.view?.data;
                let thumbnailRelativePath;
                let thumbnailAbsolutePath;
                try {
                    if (videoInfo?.pic) {
                        ({ thumbnailRelativePath, thumbnailAbsolutePath } = await thumbnailDownloader(videoInfo.pic));
                    }
                } catch (e) {
                    console.warn(`[${this.name}] download ${id} thumbnail failed, isShortURL: ${isShortURL}`);
                }

                if (thumbnailRelativePath) messageChain.push(Message.Image(null, null, thumbnailRelativePath));
                messageChain.push(Message.Plain(`${thumbnailRelativePath ? "\n" : ""}${videoInfo?.title ?? "[无标题]"}\nup: ${videoInfo?.owner?.name ?? "[无]"}\n${url}`));

                return this.createResponse(messageChain, () => {
                    try {
                        fs.unlinkSync(thumbnailAbsolutePath);
                    } catch {}
                });
            },
        },
        {
            name: "Youtube",
            regex: /(youtu\.be\/.+)|(youtube\.com\/watch?.+)/i,

            createResponse(messageChain, callback) {
                return {
                    messageChain,
                    callback,
                };
            },
            async generateMessage(url) {
                console.log(`[${this.name}] new url, ${url}`);

                let messageChain = [];

                let response;
                try {
                    console.log(`[${this.name}] get info ${url}`);
                    response = await axiosInstance({
                        method: "get",
                        url: `https://www.youtube.com/oembed?format=json&url=${url}`,
                        responseType: "json",
                    });
                } catch (e) {
                    return this.createResponse([Message.Plain(`[${this.name}] 获取视频信息失败：${url}`)]);
                }

                let thumbnailRelativePath;
                let thumbnailAbsolutePath;
                try {
                    if (response.data?.thumbnail_url) {
                        ({ thumbnailRelativePath, thumbnailAbsolutePath } = await thumbnailDownloader(response.data.thumbnail_url));
                    }
                } catch (e) {
                    console.warn(`[${this.name}] download thumbnail failed, ${url}`);
                }

                if (thumbnailRelativePath) messageChain.push(Message.Image(null, null, thumbnailRelativePath));
                messageChain.push(Message.Plain(`${thumbnailRelativePath ? "\n" : ""}${response.data?.title ?? "[无标题]"}\nauthor: ${response.data?.author_name ?? "[无]"}\n${url}`));

                return this.createResponse(messageChain, () => {
                    try {
                        fs.unlinkSync(thumbnailAbsolutePath);
                    } catch {}
                });
            },
        },
        {
            name: "Music",
            regex: /(y\.qq\.com\/.+?song.+)|(music\.163\.com\/song.+)/i,

            vendors: {
                qq: "qq",
                netease: "netease",
            },
            getVendor(url) {
                if (url.indexOf("y.qq.com") > -1) return this.vendors.qq;
                if (url.indexOf("music.163.com") > -1) return this.vendors.netease;
            },
            createResponse(messageChain, callback) {
                return {
                    messageChain,
                    callback,
                };
            },
            async generateMessage(url) {
                console.log(`[${this.name}] new url, ${url}`);

                let messageChain = [];
                let vendor = this.getVendor(url);
                let id, qq_isMid;
                switch (vendor) {
                    case this.vendors.qq:
                        let urlObj = new URL(url);
                        id = urlObj.searchParams.get("songid");
                        if (id == null) {
                            qq_isMid = true;
                            let urlPath = urlObj.pathname.split("/");
                            if (urlPath.length > 1 && urlPath[urlPath.length - 2] === "songDetail" && urlPath[urlPath.length - 1] != null) id = urlPath[urlPath.length - 1];
                        }
                        break;
                    case this.vendors.netease:
                        id = new URL(url).searchParams.get("id");
                        break;
                }

                if (id == null) return this.createResponse([Message.Plain(`[${this.name}] 解析音频链接失败：${url}`)]);

                console.log(`[${this.name}] get info ${id}, vendor: ${vendor}`);
                let response;
                try {
                    switch (vendor) {
                        case this.vendors.qq:
                            response = await musicAPI.qq.getSongDetail(id, false, qq_isMid ? "songmid" : "songid");
                            break;
                        case this.vendors.netease:
                            response = await musicAPI.netease.getSongDetail(id);
                            break;
                    }

                    if (response?.status != true) throw response;
                } catch (e) {
                    console.log(e);
                    return this.createResponse([Message.Plain(`[${this.name}] 获取音频信息失败：${id}, ${vendor}`)]);
                }

                let thumbnailRelativePath;
                let thumbnailAbsolutePath;
                try {
                    if (response.data?.album?.cover) {
                        ({ thumbnailRelativePath, thumbnailAbsolutePath } = await thumbnailDownloader(response.data.album.cover));
                    }
                } catch (e) {
                    console.warn(`[${this.name}] download thumbnail failed, ${id}, ${vendor}`);
                }

                if (thumbnailRelativePath) messageChain.push(Message.Image(null, null, thumbnailRelativePath));
                messageChain.push(Message.Plain(`${thumbnailRelativePath ? "\n" : ""}${response.data?.name ?? "[无标题]"}\nalbum: ${response.data?.album?.name ?? "[无]"}\nauthor: ${response.data?.artists?.length ? response.data?.artists.map((i) => i.name).join(", ") : "[无]"}\n${url}`));

                return this.createResponse(messageChain, () => {
                    try {
                        fs.unlinkSync(thumbnailAbsolutePath);
                    } catch {}
                });
            },
        },
    ];

    if (!fs.existsSync(miraiHttpCacheAbsolutePath)) fs.mkdirSync(miraiHttpCacheAbsolutePath, { recursive: true }); //prepare cache dir

    const miraiMybotBootup = async () => {
        await mirai.link(botNumber);
        mirai.listen();
    };

    mirai.on("GroupMessage", async (incomeMessage) => {
        let matchedUrls = matchUrlFromMessageChain(incomeMessage.messageChain) ?? [];
        console.log(`[Message] from ${incomeMessage?.sender?.group?.name}, found: ${matchedUrls.length} url`);
        for (const matchedUrl of matchedUrls) {
            let message = await matchedUrl.site.generateMessage(matchedUrl.url);
            if (!message) continue;

            await incomeMessage.reply(message.messageChain);
            message.callback && message.callback();
            console.log(`[Message] done. ${matchedUrl.url}`);
        }
    });

    let botOfflineTimer;
    const botOnlineEvent = async (incomeMessage) => {
        console.log(`[core] bot ${incomeMessage.qq} auto relogin successful.`);

        if (!botOfflineTimer) return;
        clearTimeout(botOfflineTimer);
        botOfflineTimer = null;
    };
    const botOfflineCallback = async (incomeMessage) => {
        if (incomeMessage.qq !== botNumber) return; //ignore other bot's event
        console.log(`[core] bot has been dropped. waiting auto relogin in ${waitAutoReloginTimeout}s.`);

        if (botOfflineTimer) clearTimeout(botOfflineTimer);
        botOfflineTimer = setTimeout(async () => {
            let account = (miraiAutoLoginSettings?.accounts ?? []).find((item) => item.account === botNumber);
            if (!account) {
                console.log(`[core] autoLogin config for bot(${botNumber}) not exists, stop force relogin`);
                return;
            }
            if ((account.password?.kind ?? "").toUpperCase() !== "PLAIN") {
                console.log(`[core] autoLogin config for bot(${botNumber})'s password type must be "PLAIN"`);
                return;
            }

            try {
                let response = await mirai.api.axios.post("/cmd/execute", {
                    sessionKey: mirai.api.sessionKey,
                    command: [
                        {
                            type: "Plain",
                            text: "/login",
                        },
                        {
                            type: "Plain",
                            text: botNumber,
                        },
                        {
                            type: "Plain",
                            text: account.password.value,
                        },
                    ],
                });
                if (response.data?.code !== 0) throw true;
            } catch (e) {
                console.log(e);
                console.log(`[core] execute force relogin command failed`);
            }
            await miraiMybotBootup();
        }, waitAutoReloginTimeout * 1000);
    };
    mirai.on("BotOnlineEvent", botOnlineEvent);
    mirai.on("BotReloginEvent", botOnlineEvent);
    mirai.on("BotOfflineEventDropped", botOfflineCallback);
    mirai.on("BotOfflineEventActive", botOfflineCallback);
    mirai.on("BotOfflineEventForce", botOfflineCallback);

    await miraiMybotBootup();
};

run();

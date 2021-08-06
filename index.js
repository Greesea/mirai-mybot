const fs = require("fs"),
    path = require("path"),
    yaml = require("js-yaml"),
    axios = require("axios"),
    sharp = require("sharp"),
    fastXmlParser = require("fast-xml-parser");

const Mirai = require("mirai-ts"),
    { Message } = require("mirai-ts"),
    biliAPI = require("bili-api");

let __settings;
try {
    __settings = JSON.parse(fs.readFileSync("./settings.json", { encoding: "utf-8" }));
} catch (e) {
    console.error("invalid settings");
    return;
}

const { botNumber, thumbnailMaximumSize, miraiRoot, miraiHttpConfigPath, miraiHttpCachePath } = { ...__settings },
    miraiHttpCacheAbsolutePath = path.resolve(miraiRoot, miraiHttpCachePath),
    miraiHttpSettings = yaml.load(fs.readFileSync(path.resolve(miraiRoot, miraiHttpConfigPath), "utf-8")),
    fastXmlParserOptions = {
        ignoreAttributes: false,
        attrNodeName: "____attr____",
        attributeNamePrefix: "",
    };
thumbnailMaximumSize.fit = sharp.fit[thumbnailMaximumSize.fit] ?? sharp.fit.inside;

sharp.cache(false); //disable sharp cache feature
const mirai = new Mirai(miraiHttpSettings);
const run = async () => {
    const download = async (targetUrl, savePath) => {
        return new Promise(async (resolve, reject) => {
            try {
                let response = await axios({
                    method: "get",
                    url: targetUrl,
                    responseType: "stream",
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
    matchUrlFromMessageChain.urlMatchRegex = /http(s)?:\/\/[0-9a-zA-Z\\\/\?\&\;\-\.]+?(?=([^0-9a-zA-Z\\\/\?\&\;\-\.]|$){1})/gi;
    matchUrlFromMessageChain.sites = [
        {
            name: "bilibili video",
            regex: /bilibili\.com\/video\/((av)|(bv)).+/i,

            videoIdRegex: /((av)|(bv)).+$/gi,
            isBV: /^bv/i,

            createResponse(messageChain, callback) {
                return {
                    messageChain,
                    callback,
                };
            },
            async generateMessage(url) {
                let messageChain = [];
                let id = (url.match(this.videoIdRegex) ?? [])[0];
                let isBV = this.isBV.test(id);

                let params = {};
                if (isBV) {
                    params.bvid = id;
                } else {
                    params.aid = id.substring(2);
                }

                console.log(`[${this.name}] get info ${id}, isBV: ${isBV}`);
                let response = await biliAPI(params, ["view"]);
                if (response?.view?.code !== 0) return this.createResponse([Message.Plain(`[URL Preview] 获取视频信息失败：${id}`)]);

                let videoInfo = response.view?.data;
                let thumbnailRelativePath;
                let thumbnailAbsolutePath;
                try {
                    if (videoInfo?.pic) {
                        let extension = videoInfo.pic.split(".");
                        extension = extension.length > 1 ? extension[extension.length - 1] : null;
                        thumbnailRelativePath = path.join(miraiHttpCachePath, `./${id}${extension ? "." + extension : ""}`);
                        thumbnailAbsolutePath = path.resolve(miraiRoot, thumbnailRelativePath);

                        await download(videoInfo.pic, thumbnailAbsolutePath);
                        console.log(`[${this.name}] download thumbnail ${id}`);
                    }
                } catch (e) {
                    console.warn(`[${this.name}] download ${id} thumbnail failed`);
                }
                if (thumbnailRelativePath) {
                    try {
                        let thumbnailImage = sharp(thumbnailAbsolutePath);
                        let thumbnailImageMetadata = await thumbnailImage.metadata();
                        if ((thumbnailImageMetadata.width ?? 0) > thumbnailMaximumSize.width || (thumbnailImageMetadata.height ?? 0) > thumbnailMaximumSize.height) {
                            fs.writeFileSync(thumbnailAbsolutePath, await thumbnailImage.resize(thumbnailMaximumSize).toBuffer());
                            console.log(`[${this.name}] resize thumbnail ${id}`);
                        }
                    } catch (e) {
                        console.log(e);
                        console.warn(`[${this.name}] resize ${id} thumbnail failed`);
                    }
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
    ];

    if (!fs.existsSync(miraiHttpCacheAbsolutePath)) fs.mkdirSync(miraiHttpCacheAbsolutePath, { recursive: true }); //prepare cache dir
    await mirai.link(botNumber);
    mirai.on("GroupMessage", async (incomeMessage) => {
        let matchedUrls = matchUrlFromMessageChain(incomeMessage.messageChain) ?? [];
        console.log(`[message] from ${incomeMessage?.sender?.group?.name}, found: ${matchedUrls.length} url`);
        for (const matchedUrl of matchedUrls) {
            let message = await matchedUrl.site.generateMessage(matchedUrl.url);
            await incomeMessage.reply(message.messageChain);
            message.callback && message.callback();
            console.log(`[message] done. ${matchedUrl.url}`);
        }
    });
    mirai.listen();
};

run();

import {Site} from "../types/Site.mjs";
import {CreateMessageChain} from "../types/MessageChain.mjs";
import {ReplyMessage} from "../types/ReplyMessage.mjs";
import {getValueFromURL, videoDownloader} from "../utils.mjs";

import Twitter from "twitter-lite";
import {extra} from "../settings.mjs";

export default class TwitterSite extends Site {
    name = "Twitter";
    _regex = /twitter\.com\/.+?\/status\/.+/i;

    matchRegex = /status\/.+?(?=(\/|$))/g;
    api;

    constructor() {
        super();

        try {
            if (!extra?.twitter?.bearerToken)
                throw true;

            this.api = new Twitter({
                bearer_token: extra?.twitter?.bearerToken,
            });
            this.regex = this._regex;
            console.log(`[${this.name}] initialized complete.`);
        } catch (e) {
            console.log(`[${this.name}] initialized failed.`);
        }
    }

    async generateMessage(urlItem) {
        console.log(`[${this.name}] new url, ${urlItem.url}`);

        let urlPath = (urlItem.url.match(this.matchRegex) ?? [])[0];
        if (!urlPath)
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] url格式不正确：${urlItem.url}`));
        let id = getValueFromURL(`https://twitter.com/${urlPath}`, -1);
        if (id == null || id === "")
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] 获取tweet ID失败：${urlItem.url}`));

        console.log(`[${this.name}] get info ${id}`);
        let response;
        try {
            response = await this.api.get("statuses/show", {
                id,
                include_entities: true,
            });
            if (!response)
                throw true;
        } catch (e) {
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] 获取信息失败：${id}`));
        }

        let videoItem = (response?.extended_entities?.media ?? []).find(item => item.type === "video" || item.type === "animated_gif");
        if (!videoItem) //only support video and animated_gif type
            return;

        let replyMessage = new ReplyMessage();
        let imageRelativePath;
        let imageAbsolutePath;
        try {
            let videoFileInfo = (videoItem?.video_info?.variants ?? []).reduce((match, item) => (item?.bitrate ?? 0) > (match?.bitrate ?? -1) ? item : match, null);
            if (!videoItem)
                throw true;
            ({relativePath: imageRelativePath, absolutePath: imageAbsolutePath} = await videoDownloader(
                videoFileInfo.url,
                {
                    ratio: {
                        x: (videoItem?.video_info?.aspect_ratio ?? [])[0],
                        y: (videoItem?.video_info?.aspect_ratio ?? [])[1],
                    },
                    duration: videoItem?.video_info?.duration_millis,
                },
                extra?.twitter?.video
            ));
        } catch (e) {
            console.log(e);
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] 生成gif失败：${id}`));
        }

        if (imageRelativePath) {
            replyMessage.pushMessage(CreateMessageChain.image(null, null, imageRelativePath));
            replyMessage.pushTempFiles(imageAbsolutePath);
        }

        let content = response?.text ?? "";
        for (const item of [].concat(response?.entities?.urls ?? []).concat(response?.entities?.media ?? [])) {
            content = content.replace(item.url, "");
        }
        content = content.trim();

        replyMessage.pushMessage(
            CreateMessageChain.plain(`${imageRelativePath ? "\n" : ""}${content == null || content === "" ? "[无内容]" : content}\nuser: ${response?.user?.name ? `${response?.user?.name} @${response?.user?.screen_name}` : "[无]"}\n${urlItem.raw}`)
        );

        return replyMessage;
    }
}

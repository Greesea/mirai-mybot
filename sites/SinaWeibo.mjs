import {Site} from "../types/Site.mjs";
import {CreateMessageChain} from "../types/MessageChain.mjs";
import {ReplyMessage} from "../types/ReplyMessage.mjs";
import {axiosInstance, getValueFromURL, thumbnailDownloader} from "../utils.mjs";

import {requestUserAgentMobile} from "../settings.mjs";

export default class SinaWeiboSite extends Site {
    name = "SinaWeibo";
    regex = /(m\.weibo\.cn\/(status|detail)\/.+)|(weibo\.com\/.+\/.+)/i;

    //              $render_data = [..............][0] || {}
    contentRegex = /(?<=\$render_data\s?=\s?\[).+?(?=\]\[0\]\s?\|\|\s?\{\})/is;

    async generateMessage(urlItem) {
        console.log(`[${this.name}] new url, ${urlItem.url}`);

        let id = getValueFromURL(urlItem.url, -1);
        if (id == null || id === "")
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] 获取微博ID失败：${urlItem.url}`));

        console.log(`[${this.name}] get info ${id}`);
        let response;
        try {
            response = await axiosInstance({
                method: "get",
                url: `https://m.weibo.cn/status/${id}`,
                headers: {
                    "User-Agent": requestUserAgentMobile
                },
            });
            if (response?.data == null || response?.data === "")
                throw true;
            let contentObjectString = (response.data.match(this.contentRegex) ?? [])[0];
            if (contentObjectString == null || contentObjectString === "")
                throw true;
            response = (() => {
                return new Function(`return ${contentObjectString}`)();
            })();
            if (!response?.status)
                throw true;
        } catch (e) {
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] 获取微博信息失败：${id}`));
        }

        let replyMessage = new ReplyMessage();
        let isVideo = response.status?.page_info?.type === "video";
        let content, author, thumbnailUrl;
        let thumbnailRelativePath;
        let thumbnailAbsolutePath;

        if (isVideo) {
            if (response.status?.page_info?.page_pic?.url)
                thumbnailUrl = response.status.page_info.page_pic.url;
            content = response?.status?.page_info?.content2;
            author = response?.status?.user?.screen_name;
        } else {
            if (response.status?.pics?.length)
                thumbnailUrl = response.status.pics[0]?.url;
            content = `${(response.status?.text ?? "").substring(0, 15)}${(response.status?.text ?? "").length > 15 ? "..." : ""}`;
            author = response?.status?.user?.screen_name;
        }

        try {
            if (thumbnailUrl)
                ({thumbnailRelativePath, thumbnailAbsolutePath} = await thumbnailDownloader(thumbnailUrl));
        } catch (e) {
            console.warn(`[${this.name}] download ${id} thumbnail failed`);
        }

        if (thumbnailRelativePath) {
            replyMessage.pushMessage(CreateMessageChain.image(null, null, thumbnailRelativePath));
            replyMessage.pushTempFiles(thumbnailAbsolutePath);
        }
        replyMessage.pushMessage(
            CreateMessageChain.plain(`${thumbnailRelativePath ? "\n" : ""}${content ?? "[无内容]"}\nuser: ${author ?? "[无]"}\n${urlItem.raw}`)
        );

        return replyMessage;
    }
}

import {Site} from "../types/Site.mjs";
import {CreateMessageChain} from "../types/MessageChain.mjs";
import {ReplyMessage} from "../types/ReplyMessage.mjs";
import {axiosInstance, getValueFromURL, thumbnailDownloader} from "../utils.mjs";

import {requestUserAgentMobile} from "../settings.mjs";

export default class SinaWeiboSite extends Site {
    name = "SinaWeibo";
    regex = /(m\.weibo\.cn\/status\/.+)|(weibo\.com\/.+\/.+)/i;

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

        //current only support video type
        if (response.status?.page_info?.type !== "video") {
            console.log(`[${this.name}] not supported type "${response.status?.page_info?.type}"`);
            return;
        }

        let replyMessage = new ReplyMessage();
        let thumbnailRelativePath;
        let thumbnailAbsolutePath;
        try {
            if (response.status?.page_info?.type === "video" && response.status?.page_info?.page_pic?.url)
                ({thumbnailRelativePath, thumbnailAbsolutePath} = await thumbnailDownloader(response.status.page_info.page_pic.url));
        } catch (e) {
            console.warn(`[${this.name}] download ${id} thumbnail failed`);
        }

        if (thumbnailRelativePath) {
            replyMessage.pushMessage(CreateMessageChain.image(null, null, thumbnailRelativePath));
            replyMessage.pushTempFiles(thumbnailAbsolutePath);
        }
        replyMessage.pushMessage(
            CreateMessageChain.plain(`${thumbnailRelativePath ? "\n" : ""}${response?.status?.page_info?.title ?? "[无标题]"}\nuser: ${response?.status?.user?.screen_name ?? "[无]"}\n${urlItem.raw}`)
        );

        return replyMessage;
    }
}

import {Site} from "../types/Site.mjs";
import {CreateMessageChain} from "../types/MessageChain.mjs";
import {ReplyMessage} from "../types/ReplyMessage.mjs";
import {axiosInstance, thumbnailDownloader} from "../utils.mjs";

export default class YoutubeSite extends Site {
    name = "Youtube";
    regex = /(youtu\.be\/.+)|(youtube\.com\/watch?.+)/i;

    async generateMessage(urlItem) {
        console.log(`[${this.name}] new url, ${urlItem.url}`);

        let response;
        try {
            console.log(`[${this.name}] get info ${urlItem.url}`);
            response = await axiosInstance({
                method: "get",
                url: `https://www.youtube.com/oembed?format=json&url=${urlItem.url}`,
                responseType: "json",
            });
        } catch (e) {
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] 获取视频信息失败：${urlItem.url}`));
        }

        let replyMessage = new ReplyMessage();
        let thumbnailRelativePath;
        let thumbnailAbsolutePath;
        try {
            if (response.data?.thumbnail_url)
                ({thumbnailRelativePath, thumbnailAbsolutePath} = await thumbnailDownloader(response.data.thumbnail_url));
        } catch (e) {
            console.warn(`[${this.name}] download thumbnail failed, ${urlItem.url}`);
        }

        if (thumbnailRelativePath) {
            replyMessage.pushMessage(CreateMessageChain.image(null, null, thumbnailRelativePath));
            replyMessage.pushTempFiles(thumbnailAbsolutePath);
        }
        replyMessage.pushMessage(
            CreateMessageChain.plain(`${thumbnailRelativePath ? "\n" : ""}${response.data?.title ?? "[无标题]"}\nauthor: ${response.data?.author_name ?? "[无]"}\n${urlItem.raw}`)
        );

        return replyMessage;
    }
}

import util from "util";
import {Site} from "../types/Site.mjs";
import {CreateMessageChain} from "../types/MessageChain.mjs";
import {ReplyMessage} from "../types/ReplyMessage.mjs";
import {thumbnailDownloader} from "../utils.mjs";

import bandcamp from "bandcamp-scraper";

const bandcampGetAlbumInfo = util.promisify(bandcamp.getAlbumInfo);

export default class BandcampSite extends Site {
    name = "Bandcamp";
    regex = /bandcamp\.com\/album\/.+/i;

    async generateMessage(urlItem) {
        console.log(`[${this.name}] new url, ${urlItem.url}`);
        console.log(`[${this.name}] get info ${urlItem.url}`);
        let response;
        try {
            response = await bandcampGetAlbumInfo(urlItem.url);
            if (!response)
                throw true;
        } catch (e) {
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] 获取专辑信息失败：${urlItem.url}`));
        }

        let replyMessage = new ReplyMessage();
        let thumbnailRelativePath;
        let thumbnailAbsolutePath;
        try {
            if (response?.imageUrl)
                ({thumbnailRelativePath, thumbnailAbsolutePath} = await thumbnailDownloader(response.imageUrl));
        } catch (e) {
            console.warn(`[${this.name}] download ${urlItem.url} thumbnail failed`);
        }

        if (thumbnailRelativePath) {
            replyMessage.pushMessage(CreateMessageChain.image(null, null, thumbnailRelativePath));
            replyMessage.pushTempFiles(thumbnailAbsolutePath);
        }
        replyMessage.pushMessage(
            CreateMessageChain.plain(`${thumbnailRelativePath ? "\n" : ""}${response?.title ?? "[无标题]"}\nartist: ${response?.artist ?? "[无]"}\n${urlItem.raw}`)
        );

        return replyMessage;
    }
}

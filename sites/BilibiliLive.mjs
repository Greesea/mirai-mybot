import {Site} from "../types/Site.mjs";
import {CreateMessageChain} from "../types/MessageChain.mjs";
import {ReplyMessage} from "../types/ReplyMessage.mjs";
import {getValueFromURL, thumbnailDownloader} from "../utils.mjs";

import biliAPI from "bili-api";
import got from "got";

import {requestTimeout, requestUserAgent} from "../settings.mjs";

export default class BilibiliLiveSite extends Site {
    name = "Bilibili Live";
    regex = /live\.bilibili\.com\/.+/i;

    async hackedGot({url, cookie = {}}) {
        //based on bili-api/src/index.js:14
        //add timeout and user-agent option
        return got(new URL(url), {
            timeout: requestTimeout * 1000,
            headers: {
                "User-Agent": requestUserAgent,
                Cookie: Object.entries({_uuid: "", rpdid: "", ...cookie})
                    .map(([k, v]) => `${k}=${v}`)
                    .join(";"),
            },
        }).json();
    }

    async generateMessage(urlItem) {
        console.log(`[${this.name}] new url, ${urlItem.url}`);

        let id = getValueFromURL(urlItem.url, -1);
        if (id == null || id === "")
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] 获取直播间ID失败：${urlItem.url}`));

        console.log(`[${this.name}] get info ${id}`);
        let response;
        try {
            response = await biliAPI({roomid: id}, ["getInfoByRoom"], {
                got: this.hackedGot,
                wait: 200,
            });
            if (response?.getInfoByRoom?.code !== 0)
                throw true;
        } catch (e) {
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] 获取直播间信息失败：${id}`));
        }

        let replyMessage = new ReplyMessage();
        let roomData = response.getInfoByRoom?.data;
        let thumbnailRelativePath;
        let thumbnailAbsolutePath;
        try {
            if (roomData?.room_info?.cover)
                ({thumbnailRelativePath, thumbnailAbsolutePath} = await thumbnailDownloader(roomData.room_info.cover));
        } catch (e) {
            console.warn(`[${this.name}] download ${id} thumbnail failed`);
        }

        if (thumbnailRelativePath) {
            replyMessage.pushMessage(CreateMessageChain.image(null, null, thumbnailRelativePath));
            replyMessage.pushTempFiles(thumbnailAbsolutePath);
        }
        replyMessage.pushMessage(
            CreateMessageChain.plain(`${thumbnailRelativePath ? "\n" : ""}${roomData?.room_info?.title ?? "[无标题]"}\nup: ${roomData?.anchor_info?.base_info?.uname ?? "[无]"}\n${urlItem.raw}`)
        );

        return replyMessage;
    }
}

import {Site} from "../types/Site.mjs";
import {CreateMessageChain} from "../types/MessageChain.mjs";
import {ReplyMessage} from "../types/ReplyMessage.mjs";
import {thumbnailDownloader} from "../utils.mjs";

import biliAPI from "bili-api";
import got from "got";

import {requestTimeout, requestUserAgent} from "../settings.mjs";

export default class BilibiliVideoSite extends Site {
    name = "Bilibili Video";
    regex = /bilibili\.com\/video\/((av)|(bv)).+/i;

    isBV = /^bv/i;

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

        let urlObj = new URL(urlItem.url);
        let id = urlObj.pathname.split("/");
        id = id.length > 1 ? id[id.length - 1] : "";
        if (id == null || id === "")
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] 获取视频ID失败：${urlItem.url}`));

        let isBV = this.isBV.test(id);
        let params = {};
        if (isBV)
            params.bvid = id;
        else
            params.aid = id.substring(2);

        console.log(`[${this.name}] get info ${id}, isBV: ${isBV}`);
        let response;
        try {
            response = await biliAPI(params, ["view"], {
                got: this.hackedGot,
                wait: 200,
            });
            if (response?.view?.code !== 0)
                throw true;
        } catch (e) {
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] 获取视频信息失败：${id}`));
        }

        let replyMessage = new ReplyMessage();
        let videoInfo = response.view?.data;
        let thumbnailRelativePath;
        let thumbnailAbsolutePath;
        try {
            if (videoInfo?.pic)
                ({thumbnailRelativePath, thumbnailAbsolutePath} = await thumbnailDownloader(videoInfo.pic));
        } catch (e) {
            console.warn(`[${this.name}] download ${id} thumbnail failed`);
        }

        if (thumbnailRelativePath) {
            replyMessage.pushMessage(CreateMessageChain.image(null, null, thumbnailRelativePath));
            replyMessage.pushTempFiles(thumbnailAbsolutePath);
        }
        replyMessage.pushMessage(
            CreateMessageChain.plain(`${thumbnailRelativePath ? "\n" : ""}${videoInfo?.title ?? "[无标题]"}\nup: ${videoInfo?.owner?.name ?? "[无]"}\n${urlItem.raw}`)
        );

        return replyMessage;
    }
}

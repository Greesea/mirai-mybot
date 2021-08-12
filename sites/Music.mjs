import {Site} from "../types/Site.mjs";
import {CreateMessageChain} from "../types/MessageChain.mjs";
import {ReplyMessage} from "../types/ReplyMessage.mjs";
import {thumbnailDownloader} from "../utils.mjs";

import musicAPI from "@suen/music-api";

export class MusicSite extends Site {
    name = "Music";
    regex = /(y\.qq\.com\/.+?song.+)|(music\.163\.com\/song.+)/i;

    vendors = {
        qq: "qq",
        netease: "netease",
    };

    getVendor(url) {
        if (url.indexOf("y.qq.com") > -1)
            return this.vendors.qq;
        if (url.indexOf("music.163.com") > -1)
            return this.vendors.netease;
    }

    async generateMessage(urlItem) {
        console.log(`[${this.name}] new url, ${urlItem.url}`);

        let vendor = this.getVendor(urlItem.url);
        let id, qq_isMid;
        switch (vendor) {
            case this.vendors.qq:
                let urlObj = new URL(urlItem.url);
                id = urlObj.searchParams.get("songid");
                if (id == null) {
                    qq_isMid = true;
                    let urlPath = urlObj.pathname.split("/");
                    if (urlPath.length > 1 && urlPath[urlPath.length - 2] === "songDetail" && urlPath[urlPath.length - 1] != null)
                        id = urlPath[urlPath.length - 1];
                }
                break;
            case this.vendors.netease:
                id = new URL(urlItem.url).searchParams.get("id");
                break;
        }

        if (id == null)
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] 解析音频链接失败：${urlItem.url}`));

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

            if (response?.status !== true)
                throw response;
        } catch (e) {
            console.log(e);
            return new ReplyMessage(CreateMessageChain.plain(`[${this.name}] 获取音频信息失败：${id}, ${vendor}`));
        }

        let replyMessage = new ReplyMessage();
        let thumbnailRelativePath;
        let thumbnailAbsolutePath;
        try {
            if (response.data?.album?.cover)
                ({thumbnailRelativePath, thumbnailAbsolutePath} = await thumbnailDownloader(response.data.album.cover));
        } catch (e) {
            console.warn(`[${this.name}] download thumbnail failed, ${id}, ${vendor}`);
        }

        if (thumbnailRelativePath) {
            replyMessage.pushMessage(CreateMessageChain.image(null, null, thumbnailRelativePath));
            replyMessage.pushTempFiles(thumbnailAbsolutePath);
        }
        replyMessage.pushMessage(
            CreateMessageChain.plain(`${thumbnailRelativePath ? "\n" : ""}${response.data?.name ?? "[无标题]"}\nalbum: ${response.data?.album?.name ?? "[无]"}\nauthor: ${response.data?.artists?.length ? response.data?.artists.map((i) => i.name).join(", ") : "[无]"}\n${urlItem.raw}`)
        );

        return replyMessage;
    }
}

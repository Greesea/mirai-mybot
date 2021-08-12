import fs from "fs";
import sharp from "sharp";

import Mirai from "mirai-ts";

import {botNumber, waitAutoReloginTimeout, miraiHttpSettings, miraiHttpCacheAbsolutePath, miraiAutoLoginSettings} from "./settings.mjs";
import {matchURLFromMessageChain} from "./utils.mjs";
import {CreateMessageChain} from "./types/MessageChain.mjs";

import {BilibiliShortURLSite} from "./shortURLSites/Bilibili.mjs";
import {BilibiliVideoSite} from "./sites/BilibiliVideo.mjs";
import {YoutubeSite} from "./sites/Youtube.mjs";
import {MusicSite} from "./sites/Music.mjs";

//region initialize
sharp.cache(false); //disable sharp cache feature
if (!fs.existsSync(miraiHttpCacheAbsolutePath))
    fs.mkdirSync(miraiHttpCacheAbsolutePath, {recursive: true}); //prepare cache dir
const mirai = new Mirai(miraiHttpSettings);
matchURLFromMessageChain.shortURLSites = [new BilibiliShortURLSite()];
matchURLFromMessageChain.sites = [new BilibiliVideoSite(), new YoutubeSite(), new MusicSite()];
//endregion

const run = async () => {
    const miraiMybotBootup = async () => {
        await mirai.link(botNumber);
        mirai.listen();
    };

    mirai.on("GroupMessage", async (incomeMessage) => {
        let matched = (await matchURLFromMessageChain(incomeMessage.messageChain)) ?? [];
        console.log(`[Message] from ${incomeMessage?.sender?.group?.name}, found: ${matched.length} url`);
        for (const item of matched) {
            let message = await item.generateMessage();
            if (!message)
                continue;

            await incomeMessage.reply(message.messageChain.items);
            message.callback();
            console.log(`[Message] done. ${item.urlItem.raw}`);
        }
    });

    let botOfflineTimer;
    const botOnlineEvent = async (incomeMessage) => {
        console.log(`[core] bot ${incomeMessage.qq} auto relogin successful.`);

        if (!botOfflineTimer)
            return;
        clearTimeout(botOfflineTimer);
        botOfflineTimer = null;
    };
    const botOfflineCallback = async (incomeMessage) => {
        if (incomeMessage.qq !== botNumber) //ignore other bot's event
            return;
        console.log(`[core] bot has been dropped. waiting auto relogin in ${waitAutoReloginTimeout}s.`);

        if (botOfflineTimer)
            clearTimeout(botOfflineTimer);
        botOfflineTimer = setTimeout(async () => {
            let account = (miraiAutoLoginSettings?.accounts ?? []).find(item => item.account === botNumber);
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
                    command: CreateMessageChain.plain("/login").plain(botNumber).plain(account.password.value).items,
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

run().catch(error => console.error(error));

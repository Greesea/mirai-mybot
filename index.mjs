import fs from "fs";
import sharp from "sharp";

import Mirai from "mirai-ts";

import {botNumber, masterNumber, botHeartbeatGroupNumber, botHeartbeatInterval, miraiHttpSettings, miraiHttpCacheAbsolutePath,} from "./settings.mjs";
import {loadSites, matchURLFromMessageChain} from "./utils.mjs";
import {CreateMessageChain} from "./types/MessageChain.mjs";

const run = async () => {
    //region initialize
    console.log(`[core] initializing`);
    sharp?.cache(false); //disable sharp cache feature
    if (!fs.existsSync(miraiHttpCacheAbsolutePath))
        fs.mkdirSync(miraiHttpCacheAbsolutePath, {recursive: true}); //prepare cache dir
    const mirai = new Mirai(miraiHttpSettings);
    matchURLFromMessageChain.shortURLSites = await loadSites("./shortURLSites");
    console.log(`[core] loaded ${matchURLFromMessageChain.shortURLSites.length} shortURLSites`);
    matchURLFromMessageChain.sites = await loadSites("./sites");
    console.log(`[core] loaded ${matchURLFromMessageChain.sites.length} sites`);
    console.log(`[core] initialize complete`);
    //endregion

    const miraiMybotBootup = async () => {
        console.log(`[core] booting mirai-ts`);
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

    // noinspection ES6MissingAwait
    (async () => {
        let moduleName = "core/heartbeat";
        let shutdown = false;
        let sleep = timeout => new Promise(resolve => setTimeout(resolve, timeout));

        if (!botHeartbeatGroupNumber) {
            console.log(`[${moduleName}] invalid heartbeat group number`);
            console.log(`[${moduleName}] heartbeat disabled`);
            return;
        }

        await sleep(5000);
        console.log(`[${moduleName}] heartbeat started`);
        await mirai.api.sendGroupMessage(CreateMessageChain.plain(`[mirai-mybot-heartbeat] ${botNumber} heartbeat started`).items, botHeartbeatGroupNumber);
        while (!shutdown) {
            try {
                let date = new Date();
                await mirai.api.sendGroupMessage(CreateMessageChain.plain(`[mirai-mybot-heartbeat] ${botNumber} at ${date.toLocaleString("zh-CN")}(${+date})`).items, botHeartbeatGroupNumber);
                console.log(`[${moduleName}] heartbeat sent`);
            } catch (e) {
                console.log(e);
                console.log(`[${moduleName}] send heartbeat failed`);
            }
            await sleep(botHeartbeatInterval * 1000);
        }
    })();

    await miraiMybotBootup();
};

run().catch(error => console.error(error));

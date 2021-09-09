import fs from "fs";
import sharp from "sharp";

import Mirai from "mirai-ts";

import {botNumber, masterNumber, botHeartbeatGroupNumber, botHeartbeatInterval, miraiHttpSettings, miraiHttpCacheAbsolutePath,} from "./settings.mjs";
import {loadSites, matchURLFromMessageChain} from "./utils.mjs";
import {CreateMessageChain, MessageTypes} from "./types/MessageChain.mjs";

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
    const botControl = {
        service: {
            status: true,
        },
    };
    const botCommands = {
        "help": (() => {
            let fn = async () => {
                return CreateMessageChain.plain(`${Object.keys(botCommands).map(command => `${command} | ${botCommands[command].description}`).join("\n")}`);
            };
            fn.description = "print command help";

            return fn;
        })(),
        "control.service.pause": (() => {
            let fn = async () => {
                botControl.service.status = false;
                botControl.service.silence = true;

                console.log(`[Command] service.status set to false`);
                return CreateMessageChain.plain(`done`);
            };
            fn.description = "pause url preview service";

            return fn;
        })(),
        "control.service.resume": (() => {
            let fn = async () => {
                botControl.service.status = true;
                console.log(`[Command] service.status set to true`);
                return CreateMessageChain.plain(`done`);
            };
            fn.description = "resume url preview service";

            return fn;
        })(),
        "dump.control": (() => {
            let fn = async () => {
                return CreateMessageChain.plain(`${JSON.stringify(botControl, null, 4)}`);
            };
            fn.description = "dump current botControl data";

            return fn;
        })(),
    };
    botCommands["?"] = botCommands["help"];

    mirai.on("FriendMessage", async (incomeMessage) => {
        if (incomeMessage?.sender?.id !== masterNumber)
            return;

        let commandText = (incomeMessage.messageChain ?? []).find(item => item?.type === MessageTypes.plain)?.text ?? "";
        console.log(`[Command] incoming command: ${commandText}`);
        if (!botCommands[commandText])
            return;
        let response = await botCommands[commandText]();
        if (!response)
            return;

        await incomeMessage.reply(response.items);
    });
    mirai.on("GroupMessage", async (incomeMessage) => {
        let matched = (await matchURLFromMessageChain(incomeMessage.messageChain)) ?? [];
        console.log(`[Message] from ${incomeMessage?.sender?.group?.name}, found: ${matched.length} url`);

        if (!matched.length || !botControl.service.status)
            return;
        for (const item of matched) {
            let message = await item.generateMessage();
            if (!message)
                continue;

            await incomeMessage.reply(message.messageChain.items);
            message.callback();
            console.log(`[Message] done. ${item.urlItem.raw}`);
        }
    });
    mirai.on("BotInvitedJoinGroupRequestEvent", async (incomeMessage) => {
        console.log(`[InvitedJoinGroupRequest] from ${incomeMessage.nick}(${incomeMessage.fromId}), join ${incomeMessage.groupName}(${incomeMessage.groupId}), decision: ${incomeMessage.fromId === masterNumber ? `accept` : "denied"}`);
        await incomeMessage.respond(incomeMessage.fromId === masterNumber ? 0 : 1);
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

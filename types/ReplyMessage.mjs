import fs from "fs";

//region import {Message as MiraiMessage} from "MiraiMessage"
import Mirai from "mirai-ts";

const {Message: MiraiMessage} = Mirai;

//endregion
import {MessageChain} from "./MessageChain.mjs";

/**
 * ReplyMessage
 */
export class ReplyMessage {
    /**
     * custom callback
     * @private
     * @type {Function}
     */
    _callback;

    /**
     * messageChain
     * @type {MessageChain}
     */
    messageChain;

    /**
     * temporary file pathArray(absolute path)
     * @type {string[]}
     */
    tempFiles = [];

    /**
     * @param {MessageChain} messageChain
     * @param {Function} callback callback when message replied successful
     */
    constructor(messageChain = null, callback = null) {
        this.messageChain = messageChain ?? new MessageChain();
        this._callback = callback;
    }

    /**
     * @param {MessageChain|MiraiMessage|MiraiMessage[]} message
     * @returns {ReplyMessage}
     */
    pushMessage(message) {
        let items;

        if (message instanceof MessageChain)
            items = message.items;
        else
            items = message instanceof Array ? message : [message];

        this.messageChain = new MessageChain(this.messageChain.items.concat(items));
        return this;
    }

    /**
     * add path to auto cleanup while callback
     * @param {string|string[]} path absolutePath or absolutePathArray
     * @returns {ReplyMessage}
     */
    pushTempFiles(path) {
        this.tempFiles = this.tempFiles.concat(path instanceof Array ? path : [path]);
        return this;
    }

    /**
     * callback(for bot core)
     */
    callback() {
        if (this.tempFiles.length) {
            try {
                for (const path of this.tempFiles) {
                    fs.unlinkSync(path);
                }
            } catch {
            }
        }
        this._callback?.();
    }
}

//region import {Message as MiraiMessage} from "MiraiMessage"
import Mirai from "mirai-ts";

const {Message: MiraiMessage} = Mirai;

//endregion

/**
 * MessageTypes
 */
export class MessageTypes {
    static quote = "Quote";
    static at = "At";
    static atAll = "AtAll";
    static face = "Face";
    static plain = "Plain";
    static image = "Image";
    static flashImage = "FlashImage";
    static voice = "Voice";
    static xml = "Xml";
    static json = "Json";
    static app = "App";
    static poke = "Poke";
    static musicShare = "MusicShare";
}

/**
 *
 * @param {string} type MessageTypes/MiraiMessageTypeString
 * @param {any} thisRef
 * @param {IArguments} args
 * @returns {MiraiMessage[]}
 */
const __createMessage = (type, thisRef, args) => {
    let msg = MiraiMessage[type]?.apply(thisRef, args);
    return msg ? [msg] : [];
};

/**
 * MessageChain
 */
export class MessageChain {
    /**
     * @type {MiraiMessage[]}
     */
    items = [];

    /**
     * @param {MiraiMessage|MiraiMessage[]} items
     */
    constructor(items = []) {
        if (items != null)
            this.items = items instanceof Array ? items : [items];
    }

    //region append methods
    /**
     * @returns {MessageChain}
     */
    quote() {
        return new MessageChain(this.items.concat(__createMessage(MessageTypes.quote, this, arguments)));
    }

    /**
     * @returns {MessageChain}
     */
    at() {
        return new MessageChain(this.items.concat(__createMessage(MessageTypes.at, this, arguments)));
    }

    /**
     * @returns {MessageChain}
     */
    atAll() {
        return new MessageChain(this.items.concat(__createMessage(MessageTypes.atAll, this, arguments)));
    }

    /**
     * @returns {MessageChain}
     */
    face() {
        return new MessageChain(this.items.concat(__createMessage(MessageTypes.face, this, arguments)));
    }

    /**
     * @returns {MessageChain}
     */
    plain() {
        return new MessageChain(this.items.concat(__createMessage(MessageTypes.plain, this, arguments)));
    }

    /**
     * @returns {MessageChain}
     */
    image() {
        return new MessageChain(this.items.concat(__createMessage(MessageTypes.image, this, arguments)));
    }

    /**
     * @returns {MessageChain}
     */
    flashImage() {
        return new MessageChain(this.items.concat(__createMessage(MessageTypes.flashImage, this, arguments)));
    }

    /**
     * @returns {MessageChain}
     */
    voice() {
        return new MessageChain(this.items.concat(__createMessage(MessageTypes.voice, this, arguments)));
    }

    /**
     * @returns {MessageChain}
     */
    xml() {
        return new MessageChain(this.items.concat(__createMessage(MessageTypes.xml, this, arguments)));
    }

    /**
     * @returns {MessageChain}
     */
    json() {
        return new MessageChain(this.items.concat(__createMessage(MessageTypes.json, this, arguments)));
    }

    /**
     * @returns {MessageChain}
     */
    app() {
        return new MessageChain(this.items.concat(__createMessage(MessageTypes.app, this, arguments)));
    }

    /**
     * @returns {MessageChain}
     */
    poke() {
        return new MessageChain(this.items.concat(__createMessage(MessageTypes.poke, this, arguments)));
    }

    /**
     * @returns {MessageChain}
     */
    musicShare() {
        return new MessageChain(this.items.concat(__createMessage(MessageTypes.musicShare, this, arguments)));
    }
    //endregion
}

/**
 * CreateMessageChain
 */
export class CreateMessageChain {
    /**
     * @returns {MessageChain}
     */
    static quote() {
        return new MessageChain(__createMessage(MessageTypes.quote, this, arguments));
    }

    /**
     * @returns {MessageChain}
     */
    static at() {
        return new MessageChain(__createMessage(MessageTypes.at, this, arguments));
    }

    /**
     * @returns {MessageChain}
     */
    static atAll() {
        return new MessageChain(__createMessage(MessageTypes.atAll, this, arguments));
    }

    /**
     * @returns {MessageChain}
     */
    static face() {
        return new MessageChain(__createMessage(MessageTypes.face, this, arguments));
    }

    /**
     * @returns {MessageChain}
     */
    static plain() {
        return new MessageChain(__createMessage(MessageTypes.plain, this, arguments));
    }

    /**
     * @returns {MessageChain}
     */
    static image() {
        return new MessageChain(__createMessage(MessageTypes.image, this, arguments));
    }

    /**
     * @returns {MessageChain}
     */
    static flashImage() {
        return new MessageChain(__createMessage(MessageTypes.flashImage, this, arguments));
    }

    /**
     * @returns {MessageChain}
     */
    static voice() {
        return new MessageChain(__createMessage(MessageTypes.voice, this, arguments));
    }

    /**
     * @returns {MessageChain}
     */
    static xml() {
        return new MessageChain(__createMessage(MessageTypes.xml, this, arguments));
    }

    /**
     * @returns {MessageChain}
     */
    static json() {
        return new MessageChain(__createMessage(MessageTypes.json, this, arguments));
    }

    /**
     * @returns {MessageChain}
     */
    static app() {
        return new MessageChain(__createMessage(MessageTypes.app, this, arguments));
    }

    /**
     * @returns {MessageChain}
     */
    static poke() {
        return new MessageChain(__createMessage(MessageTypes.poke, this, arguments));
    }

    /**
     * @returns {MessageChain}
     */
    static musicShare() {
        return new MessageChain(__createMessage(MessageTypes.musicShare, this, arguments));
    }
}

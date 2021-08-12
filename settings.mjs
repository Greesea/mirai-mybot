import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import he from "he";
import sharp from "sharp";

let __settings;
try {
    __settings = JSON.parse(
        fs.existsSync("./settings.dev.json") ?
            fs.readFileSync("./settings.dev.json", {encoding: "utf-8"}) :
            fs.readFileSync("./settings.json", {encoding: "utf-8"})
    );
} catch (e) {
    console.error("invalid settings");
    process.exit(1);
}

export const {
        botNumber,
        waitAutoReloginTimeout = 0,
        requestTimeout = 10, requestUserAgent,
        thumbnailDownloadTimeout = 10,
        thumbnailMaximumSize,
        miraiRoot,
        miraiAutoLoginConfigPath,
        miraiHttpConfigPath,
        miraiHttpCachePath
    } = {...__settings},
    axiosSettings = {
        timeout: requestTimeout * 1000,
        headers: {
            "User-Agent": requestUserAgent, //default useragent
        },
    },
    miraiHttpCacheAbsolutePath = path.resolve(miraiRoot, miraiHttpCachePath),
    miraiAutoLoginSettings = yaml.load(fs.readFileSync(path.resolve(miraiRoot, miraiAutoLoginConfigPath), "utf-8")),
    miraiHttpSettings = yaml.load(fs.readFileSync(path.resolve(miraiRoot, miraiHttpConfigPath), "utf-8")),
    fastXmlParserOptions = {
        ignoreAttributes: false,
        attrNodeName: "____attr____",
        attributeNamePrefix: "",
        attrValueProcessor: (val, attrName) => he.decode(val, {isAttributeValue: true}), //decode html character(like &amp;) from xml attribute
    };
thumbnailMaximumSize.fit = sharp.fit[thumbnailMaximumSize.fit] ?? sharp.fit.inside;

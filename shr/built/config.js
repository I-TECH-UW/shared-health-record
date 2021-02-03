"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const nconf_1 = __importDefault(require("nconf"));
exports.config = nconf_1.default;
const env = process.env.NODE_ENV || 'dev';
nconf_1.default.argv()
    .env()
    .file(`${__dirname}/../config/config_${env}_template.json`);
exports.default = nconf_1.default;
//# sourceMappingURL=config.js.map
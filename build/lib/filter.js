"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var filter_exports = {};
__export(filter_exports, {
  createFilter: () => createFilter
});
module.exports = __toCommonJS(filter_exports);
function toRegExp(pattern) {
  const source = pattern.split("").map((char) => char === "*" ? ".*" : char === "?" ? "." : char.replace(/[.+^${}()|[\]\\]/g, "\\$&")).join("");
  return new RegExp(`^${source}$`, "i");
}
function createFilter(text) {
  const patterns = (text != null ? text : "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#")).map(toRegExp);
  const matches = (...candidates) => patterns.some((pattern) => candidates.some((candidate) => candidate !== void 0 && pattern.test(candidate)));
  return {
    empty: patterns.length === 0,
    excludesDevice: (key, label) => matches(key, label),
    excludesValue: (key, id, name) => matches(key, `${key}.${id}`, name)
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createFilter
});
//# sourceMappingURL=filter.js.map

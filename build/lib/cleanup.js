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
var cleanup_exports = {};
__export(cleanup_exports, {
  OPTIONAL_FOLDERS: () => OPTIONAL_FOLDERS,
  findObsolete: () => findObsolete
});
module.exports = __toCommonJS(cleanup_exports);
const OPTIONAL_FOLDERS = ["energy", "forecast", "alarms"];
function findObsolete(ids, sites) {
  const result = [];
  const add = (id) => {
    if (!result.includes(id)) {
      result.push(id);
    }
  };
  for (const id of ids) {
    const parts = id.split(".");
    if (!/^\d+$/.test(parts[0])) {
      continue;
    }
    const site = sites.get(Number(parts[0]));
    if (!site) {
      add(parts[0]);
      continue;
    }
    const [, folder, key, sub] = parts;
    const folderEnabled = site.folders[folder];
    if (folderEnabled === false) {
      add(`${parts[0]}.${folder}`);
    } else if (key !== void 0 && folder === "devices" && site.devices && !site.devices.has(`devices.${key}`)) {
      add(parts.slice(0, 3).join("."));
    } else if (key !== void 0 && folder === "diagnostics") {
      if (site.diagnostics && !site.diagnostics.has(`diagnostics.${key}`)) {
        add(parts.slice(0, 3).join("."));
      } else if (sub === "sum" && !site.phaseSums) {
        add(parts.slice(0, 4).join("."));
      }
    }
  }
  return result;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OPTIONAL_FOLDERS,
  findObsolete
});
//# sourceMappingURL=cleanup.js.map

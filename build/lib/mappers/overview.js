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
var overview_exports = {};
__export(overview_exports, {
  channelLabel: () => channelLabel,
  deviceLabel: () => deviceLabel,
  mapOverview: () => mapOverview
});
module.exports = __toCommonJS(overview_exports);
var import_diagnostics = require("./diagnostics");
function toMillis(value) {
  const seconds = typeof value === "string" ? Number(value) : value;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds * 1e3 : null;
}
function text(value) {
  const trimmed = (value != null ? value : "").trim();
  return trimmed === "" ? null : trimmed;
}
function deviceLabel(device) {
  var _a, _b, _c;
  return (_c = (_b = (_a = text(device.customName)) != null ? _a : text(device.froniusDeviceType)) != null ? _b : text(device.productName)) != null ? _c : device.name;
}
function channelLabel(device) {
  var _a;
  return `${deviceLabel(device)} (${device.name} ${(_a = device.instance) != null ? _a : 0})`;
}
function mapOverview(devices) {
  var _a, _b;
  const channels = [];
  const states = [];
  const labels = /* @__PURE__ */ new Map();
  for (const device of devices) {
    if (!(device == null ? void 0 : device.name)) {
      continue;
    }
    const id = `devices.${(0, import_diagnostics.deviceKey)(device.name, device.instance)}`;
    channels.push({ id, name: channelLabel(device) });
    labels.set((0, import_diagnostics.channelId)({ Device: device.name, instance: (_a = device.instance) != null ? _a : 0 }), channelLabel(device));
    const add = (key, value, common) => {
      states.push({ id: `${id}.${key}`, common: { read: true, write: false, ...common }, value });
    };
    add("name", deviceLabel(device), { name: "Name", type: "string", role: "info.name" });
    add("deviceType", device.name, { name: "Device type", type: "string", role: "text" });
    add("customName", text(device.customName), { name: "Custom name in VRM", type: "string", role: "text" });
    add("productName", text(device.productName), { name: "Product name", type: "string", role: "text" });
    add("productCode", text(device.productCode), { name: "Product code", type: "string", role: "text" });
    add("firmwareVersion", text(device.firmwareVersion), {
      name: "Firmware version",
      type: "string",
      role: "info.firmware"
    });
    add("lastConnection", toMillis(device.lastConnection), {
      name: "Last connection",
      type: "number",
      role: "value.time"
    });
    add("instance", (_b = device.instance) != null ? _b : 0, { name: "Instance", type: "number", role: "value" });
    if (device.froniusDeviceType !== void 0) {
      add("model", text(device.froniusDeviceType), { name: "Model", type: "string", role: "text" });
    }
    if (device.loggingInterval !== void 0) {
      add("loggingInterval", typeof device.loggingInterval === "number" ? device.loggingInterval : null, {
        name: "Log interval of the GX device",
        type: "number",
        role: "value.interval",
        unit: "s"
      });
    }
    if (device.lastPowerUpOrRestart !== void 0) {
      add("lastPowerUpOrRestart", toMillis(device.lastPowerUpOrRestart), {
        name: "Last power up or restart",
        type: "number",
        role: "value.time"
      });
    }
  }
  return { channels, states, labels };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  channelLabel,
  deviceLabel,
  mapOverview
});
//# sourceMappingURL=overview.js.map

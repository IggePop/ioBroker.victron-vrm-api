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
var state_manager_exports = {};
__export(state_manager_exports, {
  StateManager: () => StateManager
});
module.exports = __toCommonJS(state_manager_exports);
class StateManager {
  constructor(adapter) {
    this.adapter = adapter;
  }
  /** Created objects and their last written name; a changed name updates the object again */
  known = /* @__PURE__ */ new Map();
  async ensureDevice(id, name, native = {}) {
    await this.ensureObject(id, { type: "device", common: { name }, native });
  }
  async ensureChannel(id, name) {
    await this.ensureObject(id, { type: "channel", common: { name }, native: {} });
  }
  /**
   * Creates the state object if needed and writes the value with ack=true
   *
   * @param prefix
   * @param def
   */
  async setState(prefix, def) {
    var _a;
    const id = prefix ? `${prefix}.${def.id}` : def.id;
    await this.ensureObject(id, {
      type: "state",
      common: { read: true, write: false, ...def.common },
      native: (_a = def.native) != null ? _a : {}
    });
    await this.adapter.setStateChangedAsync(id, { val: def.value, ack: true });
  }
  /**
   * Shortcut for simple info states
   *
   * @param id
   * @param value
   * @param common
   */
  async setValue(id, value, common) {
    await this.setState("", { id, common, value });
  }
  async ensureObject(id, obj) {
    var _a;
    const name = JSON.stringify((_a = obj.common) == null ? void 0 : _a.name);
    if (this.known.get(id) === name) {
      return;
    }
    await this.adapter.extendObjectAsync(id, obj);
    this.known.set(id, name);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  StateManager
});
//# sourceMappingURL=state-manager.js.map

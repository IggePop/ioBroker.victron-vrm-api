import type { VrmOverviewDevice } from "../types";
import { channelId, deviceKey, type ChannelDef, type StateDef } from "./diagnostics";

export interface MappedOverview {
    /** One channel per device below "devices" */
    channels: ChannelDef[];
    states: StateDef[];
    /** Display names for the diagnostics channels, key = channel id (e.g. "diagnostics.pv_inverter_20") */
    labels: Map<string, string>;
}

/**
 * VRM sends timestamps in seconds, sometimes as string, or false if unknown
 *
 * @param value
 */
function toMillis(value: number | string | false | undefined): number | null {
    const seconds = typeof value === "string" ? Number(value) : value;
    return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

function text(value: string | null | undefined): string | null {
    const trimmed = (value ?? "").trim();
    return trimmed === "" ? null : trimmed;
}

/**
 * Best name for a device: the custom name from VRM, the model (Fronius), the product name, the device type.
 *
 * @param device - Device from the system overview
 */
export function deviceLabel(device: VrmOverviewDevice): string {
    return text(device.customName) ?? text(device.froniusDeviceType) ?? text(device.productName) ?? device.name;
}

/**
 * Display name of a diagnostics channel, e.g. "Fronius Symo 5.0-3-M (PV Inverter 20)"
 *
 * @param device
 */
export function channelLabel(device: VrmOverviewDevice): string {
    return `${deviceLabel(device)} (${device.name} ${device.instance ?? 0})`;
}

/**
 * Converts the device list of the system overview into states below "devices.<type>_<instance>"
 * and provides display names for the diagnostics channels.
 *
 * @param devices
 */
export function mapOverview(devices: VrmOverviewDevice[]): MappedOverview {
    const channels: ChannelDef[] = [];
    const states: StateDef[] = [];
    const labels = new Map<string, string>();

    for (const device of devices) {
        if (!device?.name) {
            continue;
        }
        const id = `devices.${deviceKey(device.name, device.instance)}`;
        channels.push({ id, name: channelLabel(device) });
        labels.set(channelId({ Device: device.name, instance: device.instance ?? 0 }), channelLabel(device));

        const add = (
            key: string,
            value: ioBroker.StateValue,
            common: Partial<ioBroker.StateCommon> & Pick<ioBroker.StateCommon, "name" | "type" | "role">,
        ): void => {
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
            role: "info.firmware",
        });
        add("lastConnection", toMillis(device.lastConnection), {
            name: "Last connection",
            type: "number",
            role: "value.time",
        });
        add("instance", device.instance ?? 0, { name: "Instance", type: "number", role: "value" });

        if (device.froniusDeviceType !== undefined) {
            add("model", text(device.froniusDeviceType), { name: "Model", type: "string", role: "text" });
        }
        if (device.loggingInterval !== undefined) {
            add("loggingInterval", typeof device.loggingInterval === "number" ? device.loggingInterval : null, {
                name: "Log interval of the GX device",
                type: "number",
                role: "value.interval",
                unit: "s",
            });
        }
        if (device.lastPowerUpOrRestart !== undefined) {
            add("lastPowerUpOrRestart", toMillis(device.lastPowerUpOrRestart), {
                name: "Last power up or restart",
                type: "number",
                role: "value.time",
            });
        }
    }

    return { channels, states, labels };
}

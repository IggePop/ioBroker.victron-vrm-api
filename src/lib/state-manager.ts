import type { StateDef } from "./mappers/diagnostics";

/**
 * Creates objects lazily (once per adapter run) and writes values only when they changed.
 */
export class StateManager {
    /** Created objects and their last written name; a changed name updates the object again */
    private readonly known = new Map<string, string>();

    public constructor(private readonly adapter: ioBroker.Adapter) {}

    public async ensureDevice(id: string, name: string, native: Record<string, unknown> = {}): Promise<void> {
        await this.ensureObject(id, { type: "device", common: { name }, native });
    }

    public async ensureChannel(id: string, name: string): Promise<void> {
        await this.ensureObject(id, { type: "channel", common: { name }, native: {} });
    }

    /**
     * Creates the state object if needed and writes the value with ack=true
     *
     * @param prefix
     * @param def
     */
    public async setState(prefix: string, def: StateDef): Promise<void> {
        const id = prefix ? `${prefix}.${def.id}` : def.id;
        await this.ensureObject(id, {
            type: "state",
            common: { read: true, write: false, ...def.common },
            native: def.native ?? {},
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
    public async setValue(
        id: string,
        value: ioBroker.StateValue,
        common: Partial<ioBroker.StateCommon> & Pick<ioBroker.StateCommon, "name" | "type" | "role">,
    ): Promise<void> {
        await this.setState("", { id, common, value });
    }

    private async ensureObject(id: string, obj: ioBroker.SettableObject): Promise<void> {
        const name = JSON.stringify(obj.common?.name);
        if (this.known.get(id) === name) {
            return;
        }
        // extendObject keeps user changes (e.g. custom settings) and updates name/unit/role
        await this.adapter.extendObjectAsync(id, obj);
        this.known.set(id, name);
    }
}

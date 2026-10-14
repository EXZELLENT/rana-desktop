/** Local-only JSON store — everything stays on this machine. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

export const DEFAULTS = {
  consented: false,               // nothing is sensed until the user says yes
  consents: { activeWindow: true, idle: true },
  profile: { name: "", tone: 45, persona: "study", cloneName: "" },
  quiet: { from: 23.75, to: 7 },
  position: null,                 // remembered window position
  paused: false,
};

export class Store {
  constructor(file) {
    this.file = file;
    this.data = { ...DEFAULTS };
    try {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      this.data = { ...DEFAULTS, ...raw, consents: { ...DEFAULTS.consents, ...raw.consents }, profile: { ...DEFAULTS.profile, ...raw.profile } };
    } catch { /* first run */ }
  }
  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }
  get(k) { return this.data[k]; }
  set(patch) { Object.assign(this.data, patch); this.save(); }
}
export const storePath = (userDataDir) => join(userDataDir, "exi-settings.json");

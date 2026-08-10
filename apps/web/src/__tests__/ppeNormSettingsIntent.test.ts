import { beforeEach, describe, expect, it } from "vitest";
import { clearPpeNormSettingsIntent, readPpeNormSettingsIntent, savePpeNormSettingsIntent } from "../features/inventory/ppe/ppeNormSettingsIntent";

describe("PPE norm settings navigation intent", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("keeps the employee position for the settings search", () => {
    savePpeNormSettingsIntent("  Водитель погрузчика  ");
    expect(readPpeNormSettingsIntent()).toEqual({ position: "Водитель погрузчика" });

    clearPpeNormSettingsIntent();
    expect(readPpeNormSettingsIntent()).toBeNull();
  });
});

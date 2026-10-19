import type { EmuWorkTemplateDto } from "../../../api/contracts";
export { buildEmuEmployeeOptions as buildCreateWorkEmployeeOptions } from "../../../domain/emuEmployeeOptions";

export function buildCreateWorkTemplates(templates: EmuWorkTemplateDto[], sectionId: string) {
  return templates
    .filter((template) => template.isActive)
    .sort((left, right) => Number(right.sectionId === sectionId) - Number(left.sectionId === sectionId) || left.sortOrder - right.sortOrder)
    .slice(0, 8);
}

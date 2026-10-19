/**
 * A reference photo that shows the employee what to inspect at a point.
 * The server currently sends text instructions only; nothing fills this yet.
 */
export type PointPhotoInstruction = {
  uri: string;
  caption?: string | null;
};

/**
 * Shows a neutral "coming later" note in the photo-instruction slot. Off by
 * default so the slot stays invisible until photo instructions exist.
 */
export const photoInstructionPlaceholderEnabled = false;

export type PhotoInstructionSlot =
  | { kind: "photo"; uri: string; caption: string | null }
  | { kind: "placeholder"; message: string }
  | null;

export const photoInstructionPlaceholderMessage = "Фото-инструкция появится позже";

export function resolvePhotoInstructionSlot(
  instruction: PointPhotoInstruction | null | undefined,
  placeholderEnabled = photoInstructionPlaceholderEnabled
): PhotoInstructionSlot {
  const uri = instruction?.uri?.trim();
  if (uri) return { kind: "photo", uri, caption: instruction?.caption?.trim() || null };
  return placeholderEnabled ? { kind: "placeholder", message: photoInstructionPlaceholderMessage } : null;
}

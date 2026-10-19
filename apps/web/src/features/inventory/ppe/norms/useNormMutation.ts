import { useEffect, useRef, useState } from "react";
import { useInventoryRepository } from "../../../../repositories/inventoryRepositoryContext";
import { ppeErrorMessage } from "../ppeErrors";

/** A detached editor must never refresh or notify the next owner's workspace. */
export function useNormMutation(entityId: string, onSaved: () => Promise<void>, onNotify: (message: string) => void) {
  const repository = useInventoryRepository();
  const generation = useRef(0);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    generation.current++; pending.current = false; setSaving(false); setError("");
    return () => { generation.current++; };
  }, [repository, entityId]);

  async function run(mutation: (owns: () => boolean) => Promise<unknown>, success: string, fallback: string) {
    if (pending.current) return false;
    const request = generation.current;
    pending.current = true; setSaving(true); setError("");
    let saved = false;
    try {
      await mutation(() => request === generation.current); saved = true;
      if (request !== generation.current) return false;
      await onSaved();
      if (request !== generation.current) return false;
      onNotify(success); return true;
    } catch (reason) {
      if (request !== generation.current) return false;
      if (saved) { onNotify("Изменения сохранены. Не удалось обновить набор — обновите его перед следующим действием."); return true; }
      setError(ppeErrorMessage(reason, fallback)); return false;
    } finally {
      if (request === generation.current) { pending.current = false; setSaving(false); }
    }
  }
  return { saving, error, setError, run };
}

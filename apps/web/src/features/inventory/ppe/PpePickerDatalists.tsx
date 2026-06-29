import { PPE_ISSUE_PERIOD_OPTIONS } from "./ppeStatusCatalog";

export function PpePickerDatalists({ modelSuggestions }: { modelSuggestions: string[] }) {
  return (
    <>
      <datalist id="ppe-issue-period-options">
        {PPE_ISSUE_PERIOD_OPTIONS.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <datalist id="ppe-model-suggestions">
        {modelSuggestions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}

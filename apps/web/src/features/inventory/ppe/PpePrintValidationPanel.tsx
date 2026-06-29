type PpePrintValidationPanelProps = {
  errors: string[];
  title?: string;
};

export function PpePrintValidationPanel({
  errors,
  title = "Перед печатью заполните обязательные поля",
}: PpePrintValidationPanelProps) {
  if (!errors.length) {
    return null;
  }

  return (
    <div className="inventory-ppe-inline-warning inventory-ppe-print-validation" role="alert">
      <strong>{title}</strong>
      <ul>
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

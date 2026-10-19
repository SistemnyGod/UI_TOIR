"""Export factual read-only audit evidence for human review; never approve data."""
import csv
import json
from pathlib import Path

output = Path.cwd() / 'output/ppe-recovery-20261004'
report = json.loads((output / 'readiness-copy.json').read_text(encoding='utf-8'))
rows = report['mappingDiagnostics']
if len(rows) != report['counts']['mappings']:
    raise SystemExit('Mapping audit is incomplete.')
with (output / 'mapping-diagnostics.csv').open('w', encoding='utf-8-sig', newline='') as file:
    columns = list(rows[0])
    writer = csv.DictWriter(file, columns, delimiter=';')
    writer.writeheader()
    for row in rows:
        writer.writerow({**row, 'structuralProblems': '; '.join(row['structuralProblems'])})
with (output / 'missing-mappings.csv').open('w', encoding='utf-8-sig', newline='') as file:
    writer = csv.DictWriter(file, list(report['missingMappings'][0]), delimiter=';')
    writer.writeheader()
    writer.writerows(report['missingMappings'])
print(f"Individual mapping checks: {len(rows)}; missing mappings: {len(report['missingMappings'])}; no approvals written.")

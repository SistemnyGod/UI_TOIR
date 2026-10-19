"""Apply the explicitly scoped PPE implementation to the verified release baseline."""
import hashlib
import json
import pathlib
import shutil

root = pathlib.Path.cwd().resolve()
output = root / "output/ppe-recovery-20261004"
target = output / "release-source"
checks = json.loads((output / "baseline-web-verification.json").read_text(encoding="utf-8"))
if len(checks) < 25 or any(not check["same"] for check in checks):
    raise SystemExit("Deployed baseline was not verified; refusing release overlay.")
files = """
apps/api/Authorization/PpeIssuanceEnabledAttribute.cs
apps/api/Authorization/PpeIssuancePolicy.cs
apps/api/Controllers/InventoryController.cs
apps/api/Controllers/PpeIssueDocumentsController.cs
apps/api/Controllers/PpeKitTemplatesController.cs
libs/application/IPpeKitTemplateService.cs
libs/contracts/InventoryContracts.cs
libs/contracts/PpeIssueDocumentContracts.cs
libs/contracts/PpeKitTemplateContracts.cs
libs/infrastructure/Persistence/EfInventoryWorkflowService.cs
libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.Issue.cs
libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.IssueDocumentNorms.cs
libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.IssueDocuments.cs
libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.NormReadiness.cs
libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.PpeNormImport.cs
libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.PpeWorkspace.cs
libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.ReturnWriteOff.cs
libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.Validation.cs
libs/infrastructure/Persistence/Inventory/EfPpeKitTemplateService.cs
libs/infrastructure/Persistence/Inventory/PpeIssueStatusCatalog.cs
apps/web/src/api/contracts.ts
apps/web/src/features/inventory/InventoryPpeCreateScreen.tsx
apps/web/src/features/inventory/InventoryPpeScreen.tsx
apps/web/src/features/inventory/InventoryScreen.tsx
apps/web/src/features/inventory/InventorySettingsScreen.tsx
apps/web/src/features/inventory/PpeIssueDocumentConstructor.tsx
apps/web/src/features/inventory/PpeNormSetsAdmin.tsx
apps/web/src/features/inventory/styles/ppeNormRecovery.css
apps/web/src/features/inventory/ppe/DocumentEmployee.tsx
apps/web/src/features/inventory/ppe/EmployeeCombobox.tsx
apps/web/src/features/inventory/ppe/LegacyTemplatesAdmin.tsx
apps/web/src/features/inventory/ppe/PpeIssueJournal.tsx
apps/web/src/features/inventory/styles/ppe-journal.css
apps/web/src/features/inventory/ppe/downloadPpeFile.ts
apps/web/src/features/inventory/ppe/DocumentNavigation.tsx
apps/web/src/features/inventory/ppe/norms/NormCatalogSelector.tsx
apps/web/src/features/inventory/ppe/norms/NormEditors.tsx
apps/web/src/features/inventory/ppe/norms/NormSetDetails.tsx
apps/web/src/features/inventory/ppe/norms/useNormMutation.ts
apps/web/src/features/inventory/ppe/norms/usePpeNormWorkspace.ts
apps/web/src/features/inventory/ppe/journal/journalColumns.ts
apps/web/src/features/inventory/ppe/journal/JournalDocumentModal.tsx
apps/web/src/features/inventory/ppe/journal/JournalFilters.tsx
apps/web/src/features/inventory/ppe/journal/JournalTable.tsx
apps/web/src/features/inventory/ppe/journal/usePpeIssueJournal.ts
apps/web/src/features/inventory/ppe/documentDraft.ts
apps/web/src/features/inventory/ppe/documentPersistence.ts
apps/web/src/features/inventory/ppe/documentStorage.ts
apps/web/src/features/inventory/ppe/ppeNormSettingsIntent.ts
apps/web/src/features/inventory/ppe/usePpeEmployeeSearch.ts
apps/web/src/repositories/inventoryRepository.ts
apps/web/src/repositories/mockInventoryRepository.ts
apps/web/src/repositories/mockPpeIssueDocuments.ts
""".split()
for name in files:
    destination = target / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / name, destination)
sources = []
for base in (target / "apps/api", target / "apps/web/src", target / "libs"):
    for path in sorted(base.rglob("*")):
        if path.is_file() and not set(path.relative_to(target).parts).intersection({"bin", "obj", "node_modules", "dist"}):
            sources.append(dict(path=path.relative_to(target).as_posix(), sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
tree_hash = hashlib.sha256(json.dumps(sources, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
report = dict(baseCommit="e4596ee87156b4fcc46b44eca2ffe65bd5709400", baselineVerifiedWebFiles=len(checks),
    sourceTreeSha256=tree_hash, sourceRevision=f"ppe-20261004-{tree_hash[:16]}", ppeOverlay=files, sources=sources,
    issuanceEnabled=False, databaseMigrationRequired=False)
report['releaseControls'] = [dict(path=name, sha256=hashlib.sha256((root / name).read_bytes()).hexdigest()) for name in (
    'infra/docker/compose.ppe-recovery.yaml', 'infra/docker/gotenberg/Dockerfile', 'tools/Publish-PpeRecovery.ps1')]
(output / "release-manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
print(f'PPE overlay: {len(files)} files; release revision {report["sourceRevision"]}')

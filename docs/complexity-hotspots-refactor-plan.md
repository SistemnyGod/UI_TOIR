# Complexity hotspots refactor plan

## Baseline

Generated EF migration snapshots and designer files are excluded from this plan. The current production-code hotspots are:

| File | Baseline lines | Target | Planned boundary |
| --- | ---: | ---: | --- |
| `apps/web/src/styles.css` | 28,029 | below 5,000 | shared shell/tokens only; feature CSS moves to feature-owned entrypoints |
| `libs/infrastructure/Persistence/Patrol360DbContext.cs` | 2,274 | below 400 | DbSets and `OnModelCreating`; mappings move to domain `IEntityTypeConfiguration` classes |
| `apps/web/src/hooks/useEmuWorkspace.ts` | 2,222 | below 650 | orchestration hook only; local engine, reports, selectors and mutations move out |
| `apps/web/src/repositories/mockInventoryRepository.ts` | 2,114 | below 800 | split mock state, catalog, PPE, custody and reports adapters |
| `apps/web/src/features/perco/PercoIntegrationScreen.tsx` | 2,040 | below 800 | screen composition plus feature hooks and tab components |
| `apps/web/src/features/patrol/AssignmentScreen.tsx` | 2,016 | below 800 | screen composition plus form, board and modal modules |

Structural tests enforce the baseline as a no-growth ratchet. A hotspot must be split before a change increases its line count.

## Execution order

1. Split `Patrol360DbContext` mappings by domain into `Persistence/Configurations/{Patrol,Mobile,Identity,Inventory,Emu,Perco}`. This is a mechanical move with model-snapshot and full DB integration verification.
2. Split the local EMU engine from `useEmuWorkspace`: constants/types, local persistence, shift calculations, work-session mutations, plan mutations and report builders. Keep the hook API unchanged and run unit plus EMU E2E tests after every extraction.
3. Inventory selectors in `styles.css`, move one feature namespace at a time, then remove only byte-equivalent duplicates. Each batch requires desktop/mobile visual smoke; do not combine this with component redesign.
4. Split the mock inventory repository by the same interfaces used by the API repository.
5. Extract Perco and Assignment screen tabs, state hooks and modals without changing their routes or contracts.

## Pull request rules

- One hotspot and one mechanical boundary per pull request.
- No business behavior changes in a mechanical split.
- Preserve public exports and repository interfaces until callers are migrated.
- Run `git diff --check`, relevant type/build/unit checks, PostgreSQL integration for EF changes, and focused E2E for web changes.
- Lower the structural line budget in the same pull request after every successful extraction; never raise it to accommodate new code.

# Shared UI

Target home for reusable operational UI primitives.

Rules:

- No module-specific business logic.
- No direct repository or API calls.
- Components must be compact, accessible, and usable across EMU, Inventory, Users, PERCo, Patrol, and Dashboard.
- Existing consumers can keep importing from `src/components/ui` while migration proceeds through compatibility re-exports.

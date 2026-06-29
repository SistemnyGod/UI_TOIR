# EF Core configurations

Target home for entity type configurations split from `Patrol360DbContext`.

Use bounded-context subfolders as configurations are extracted:

- `Patrol`
- `Assignments`
- `Results`
- `Inventory`
- `Emu`
- `Users`
- `Mobile`
- `Perco`
- `Shared`

Keep one `Patrol360DbContext` during the first refactor pass. Move mapping details here gradually and verify migrations do not change unless a behavioral task explicitly requires it.

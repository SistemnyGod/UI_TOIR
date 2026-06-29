# Patrol360 backend libraries

Backend code keeps the existing four-project modular monolith:

- `domain`
- `application`
- `contracts`
- `infrastructure`

Use matching bounded-context folders as files are split: `Patrol`, `Assignments`, `Results`, `Inventory`, `Emu`, `Users`, `Mobile`, `Perco`, and `Shared`.

Do not introduce new projects or change public API contracts during the first structural refactor pass.

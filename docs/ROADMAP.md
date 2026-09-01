# Web Master roadmap

## Current foundation
- HTML/ZIP deployment hardening
- immutable versions and rollback helpers
- Supabase/PostgreSQL + Storage
- AI-ready dataset core

## Next product block
1. Application setup screen between code check and deployment.
2. Field designer: data type, required, database storage, belongs-to-user, AI-readable, AI-writable.
3. Entity relationships: 1:1, 1:N, N:M with human-readable labels.
4. Multi-user mode with Owner/Admin/User/Viewer roles.
5. Permissions matrix: view/create/update/delete/export/manage-users/manage-settings.
6. Generated application admin panel.
7. Dashboard: users, activity, records, storage, AI requests, errors, current release.
8. Preserve database/users/roles/settings across application code versions.

## Security principles
- Data collection is opt-in.
- Secret-like fields are rejected from AI datasets.
- Tenant isolation by owner/project.
- Do not execute uploaded build scripts on control plane.
- REG.RU account password is never stored in application code.

# Northline World asset registry
`registry.json` is the single list of every asset used by Northline World. **A third-party asset may not be committed or deployed until it has a complete row here and its licence evidence saved under `docs/world-assets/licenses/`.**

Rules (enforced by `npm run world:assets` and the test suite):
- `commercial_use` must be `yes`; `unknown` or `no` is rejected. "Free download" is not "commercially usable".
- The licence must permit committing/deploying the file (`repo_redistribution_permitted: true`).
- If attribution is required, the exact text is recorded.
- Licence evidence (licence text / receipt) is saved in `docs/world-assets/licenses/` and referenced by `license_evidence`.
- Every binary/art file under `public/world` or `src/world-dev/assets` must be listed in some entry's `files`.
- No ripped game assets, no unclear provenance, no AI-generated art committed without review.
- `kind: "internal-procedural"` entries ship no files (the asset is generated in code); the POC uses only these.
Fields: asset_id, name, kind, source, vendor_creator, license, commercial_use, modification_rights, redistribution_restrictions, repo_redistribution_permitted, attribution_required/_text, original_format, optimized_format, triangles, texture_resolution, lod_available, northline_usage, date_acquired, license_evidence, files.

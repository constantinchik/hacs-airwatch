# Deployment and verification

Read this only when planning delivery to Home Assistant. The approval boundaries in
[AGENTS.md](../AGENTS.md) apply. Establish the approved source commit, affected paths,
actual installation layout and rollback before writing anything live. Do not assume
a local checkout or historical deployment note describes the running installation.
Use private operator configuration for hostnames, credentials and absolute paths.

The paths below are configurable examples relative to an operator-selected
`<HA_CONFIG>` and `<REPO>`; `<HA_BASE_URL>`, `<HA_CONTAINER>` and `<COMMIT>` are
operator-supplied placeholders, not personal defaults. Never commit their private values.

## Frontend assets only

1. Run the [offline frontend checks](development.md#offline-checks) at the approved
   commit. [vite.config.ts](../frontend/vite.config.ts) produces
   `frontend/dist/airwatch-cards.js` and a source map. The bundle embeds the CSS.
2. Under the approved deployment scope, preserve the previous asset set for rollback.
   Copy the built JS and its `.map` when present to the installation's configured
   frontend location, commonly `<HA_CONFIG>/www/community/airwatch/`. Keep map and
   bundle from the same build; do not retain a stale map when one is no longer emitted.
3. If serving precompressed assets, regenerate `airwatch-cards.js.gz` from the
   **deployed** JS; never leave an older gzip sibling beside a new bundle. Confirm
   that decompressing it yields exactly the deployed JS bytes.
4. Compare SHA256 of the built source JS and deployed JS, and the source/deployed
   map when present. Request the configured resource with a new cache key, commonly
   `<HA_BASE_URL>/local/community/airwatch/airwatch-cards.js?v=<COMMIT>`.
   Compare decoded HTTP response bytes to the built/deployed JS; HTTP 200 alone
   does not prove equality. Check compressed responses too if the server uses them.
5. Update the configured Lovelace resource cache key as approved, refresh the dashboard
   and verify both cards actually render the intended bundle. Check map-marker/list-row
   selection in both directions, clearing selection, unmatched schedules and
   missing/unavailable data. Use synthetic evidence honestly when real schedules
   are unavailable; inspect browser errors and test the relevant screen sizes.

Frontend-only delivery requires no Home Assistant restart. Browser/cache refresh and
served-byte equality are separate from build success. Restore the complete prior
asset set and resource key if rollback is needed.

## Backend component update

1. Back up the installed `custom_components/airwatch/` **outside**
   `custom_components/`, with a known restore procedure. Backup directories inside
   that directory can be discovered as integrations and cause import failures.
2. Review a whole-component synchronization from
   `<REPO>/custom_components/airwatch/` to `<HA_CONFIG>/custom_components/airwatch/`.
   Review removals explicitly and preserve unrelated components. Copying only changed
   Python files can omit newly introduced modules or leave obsolete ones behind.
   Exclude `__pycache__/` and `*.pyc` from the copy; remove stale bytecode only within
   the deployed Airwatch component under the approved operation.
3. Compare the deployed component's file set and content with the approved source.
   In particular, verify new modules exist and can be found in the actual HA runtime;
   OpenSky support includes `providers/__init__.py`, `providers/demo.py` and
   `providers/opensky.py`. Do not infer runtime presence from the source checkout.
4. Run the installation's approved Home Assistant configuration validation before
   restart. For a Docker installation, the standard command is:

   ```text
   docker exec <HA_CONTAINER> python3 -m homeassistant --script check_config --config /config
   ```

   `/config` must be the container's actual configuration mount. Use the equivalent
   supported command for other installation types. Stop on failure; validation does
   not itself authorize a restart or establish provider behavior.
5. With explicit approval, restart Home Assistant to load backend changes. Verify
   availability at the configured endpoint, expected Airwatch overview entities and
   attributes, provider status, updates and selection services. Inspect logs since
   restart for import, config-flow and setup errors. A healthy HTTP endpoint alone
   does not establish integration health. If frontend code also changed, follow the
   asset procedure above as well.

For recovery, restore the backed-up whole component, validate, and restart within
the approved recovery scope. Do not expand a failed Airwatch update into unrelated
integration changes. Report offline results, source/deployed/served evidence and live
entity/log/rendered checks separately. This integration's software checks provide
no physical/device acceptance evidence and do not authorize device controls.

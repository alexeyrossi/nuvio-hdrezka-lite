# HDRezka Lite v0.2.0 for Nuvio (experimental)

Single-provider Nuvio JavaScript repository adapted from Michat88 HDRezka provider.

## Included files

- `manifest.json`: declares exactly one provider
- `providers/hdrezka.js`: standalone Nuvio JS provider
- `LICENSE`: GNU GPL v3 from the upstream project

## Changes

- Fixes search query URL construction, avoiding problematic `URL.searchParams` behavior.
- Supports both `tv` and `series` media types.
- Uses explicitly encoded POST request bodies.
- Attempts Russian TMDB title, then original title.
- Tries a non-original translator when identifiable (RU audio **not guaranteed**).
- Removes redundant HEAD requests and external parser dependencies.
- Adds detailed `[HDRezkaLite]` diagnostic logging.

## Installation

In Nuvio Sync → **Plugins** → add repository/manifest URL:

`https://raw.githubusercontent.com/alexeyrossi/nuvio-hdrezka-lite/refs/heads/main/manifest.json`

Enable **HDRezka Lite**, disable Michat88 Repo during testing, then refresh plugins on Fire TV. Try Test and a real movie/anime. Look for `[HDRezkaLite]` logs.

## v0.2.0 troubleshooting

This patch uses a runtime-supplied TMDB API key when available, falling back to the upstream public key. It also logs `[HDRezkaLite][SEARCH_FORMAT]` for unexpected HTML and likely browser challenges. Neither change guarantees streams.

After updating, refresh the repository in Nuvio and restart the app. If Test still says 0, inspect console diagnostics and share the first `[HDRezkaLite][ERROR]`, `[HTTP]`, or `[SEARCH_FORMAT]` line. If no lines are visible, the provider may not have executed.

## Status and limitations

**Experimental.** Syntax/mock tests only; not yet verified against the live HDRezka service or on Fire TV. The remote service may block requests, change its HTML, or provide unsupported/obfuscated video URLs. Selecting a Russian voice-over is not guaranteed. TMDB API key inherited from upstream may be unavailable. Install under Nuvio **Plugins**, not Stremio **Addons**.

## Attribution

Derived from [michat88/nuvio-providers](https://github.com/michat88/nuvio-providers), under GNU GPL v3. Modified source is provided. Only use content for which you have appropriate rights.

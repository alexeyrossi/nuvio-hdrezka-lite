# HDRezka on-device diagnostics (NOT VIDEO)

This is an optional, separate Nuvio plugin repository. It does not replace the main HDRezka Lite manifest or provider. It is intended to find out why v0.2.0 returns no results on the user's Fire TV; it is not a playback fix.

## Install and run

Add under Nuvio **Plugins**, not Addons:

`https://raw.githubusercontent.com/alexeyrossi/nuvio-hdrezka-lite/refs/heads/main/diagnostics/manifest.json`

Temporarily disable the main HDRezka Lite and Michat88 repositories. Enable these three diagnostic entries and press **Test** on each, in order:

1. `01 - Runtime check`: no network request; expected `RUNTIME: OK`.
2. `02 - TMDB check`: requests TMDB movie 603 using Nuvio's runtime key or the upstream fallback; reports HTTP/JSON/network status.
3. `03 - HDRezka search check`: searches for `Матрица` independently of TMDB and applies the v0.2.0 search-item parser. Reports HTTP status, parsed count, candidate link count, and heuristic browser-check detection.

Photograph the full result title and detail below it. If the runtime check also returns no results, photograph its expanded Diagnostics section. Stop there: the site probes will not isolate the issue until the local execution/result path is working.

**Reports are NOT video links.** Nuvio can show `1 result` and a green check because a diagnostic record was returned. This does NOT mean a playable stream was found. Read the text of the record. Do not try to play it. Disable or remove this diagnostics repository after testing. Probe records are only emitted for the fixed Test target (movie 603) to avoid polluting other searches.

## Interpretation

- Runtime OK: the downloaded probe ran and its result was displayed.
- TMDB OK: the metadata stage worked for movie 603. It says nothing about video playback.
- HTTP 0 / network error: inspect the detail for DNS, TLS or connection errors. Zero is a runtime error placeholder, not an HTTP status sent by the website.
- HTTP 403: the endpoint rejected the request; the exact cause still needs diagnosis.
- POSSIBLE BROWSER CHECK: a text heuristic detected a challenge marker, not definitive proof.
- HTTP 200 / PARSED 0: no recognized candidates; may be different markup, an unexpected page or an empty result. A positive `links=` count helps distinguish markup issues.
- PARSED > 0: search parsing worked. Translator selection, stream extraction and playback are not tested here.

## Privacy and validation

The probes make zero or one request per Test to the endpoints above; no extra analytics or log-upload service is used. API keys and common token query values are redacted from returned diagnostic text. Nuvio's own internal logging is outside this script's control.

Run offline tests with Node.js:

```sh
node --check diagnostics/probe.js
node diagnostics/test-probe.cjs
```

There are 16 mocked tests covering execution, successful replies, HTTP/network errors, parsing, and key redaction. These passed locally on 2026-11-06. They do NOT verify live HDRezka availability or execution on a real Fire TV. Direct network requests from the development container failed at DNS resolution for all tested hosts, including GitHub; that environment failure provides no evidence about HDRezka on the user's network.

This probe was checked against NuvioTV tag `1.1.0-beta.12` source (PluginRuntime, PluginManager and PluginScreen); the actual installed version may differ.

SPDX-License-Identifier: GPL-3.0-only. See the repository root LICENSE.

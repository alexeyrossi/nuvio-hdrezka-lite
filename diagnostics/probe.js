/* HDRezka diagnostics v0.1.0, 2026-11-06.
 * SPDX-License-Identifier: GPL-3.0-only
 * Diagnostic reports only: returned entries are NOT video streams.
 * Does not change settings, store credentials, or send logs anywhere.
 * One network request at most per probe. Use Plugins > Test; disable afterwards.
 */
var HD_CHECK_VERSION = '0.1.0';
var HD_CHECK_FALLBACK_KEY = '439c478a771f35c05022f9feabcca01c';
var HD_CHECK_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

function diagnosticKey() {
    var nativeKey = typeof globalThis !== 'undefined' ? globalThis.TMDB_API_KEY : null;
    return typeof nativeKey === 'string' && nativeKey.length > 8
        ? { value: nativeKey, source: 'Nuvio built-in' }
        : { value: HD_CHECK_FALLBACK_KEY, source: 'upstream fallback' };
}
function cleanDiagnostic(value) {
    var text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    text = text.replace(/([?&](?:api_key|token|access_token|password)=)[^\s&]+/gi, '$1[REDACTED]');
    var key = diagnosticKey().value;
    if (key) text = text.split(key).join('[REDACTED]');
    text = text.split(HD_CHECK_FALLBACK_KEY).join('[REDACTED]');
    return text.substring(0, 220);
}
function report(title, detail) {
    return [{
        name: 'DIAGNOSTIC ONLY - NOT VIDEO',
        title: cleanDiagnostic(title),
        quality: 'NOT VIDEO | ' + cleanDiagnostic(detail),
        type: 'diagnostic',
        url: 'data:text/plain;charset=utf-8,' + encodeURIComponent('Diagnostic only; not a video. ' + cleanDiagnostic(title))
    }];
}
function diagnosticRequest(url) {
    return Promise.resolve().then(function () {
        return fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': HD_CHECK_UA,
                'Accept': '*/*',
                'X-Hdrezka-Android-App': '1',
                'X-Hdrezka-Android-App-Version': '2.2.0'
            }
        });
    });
}
function probeTmdb() {
    var key = diagnosticKey();
    var url = 'https://api.themoviedb.org/3/movie/603?api_key=' + encodeURIComponent(key.value) + '&language=ru-RU';
    return diagnosticRequest(url).then(function (response) {
        return response.text().then(function (body) {
            var json = null;
            try { json = JSON.parse(body); } catch (_) {}
            var status = Number(response.status) || 0;
            if (!response.ok) {
                return report('TMDB: HTTP ' + status + ' - FAILED',
                    'key=' + key.source + '; ' + (json && json.status_message ? json.status_message : response.statusText || 'request failed'));
            }
            if (!json || Number(json.id) !== 603 || !json.title) {
                return report('TMDB: UNEXPECTED RESPONSE / HTTP ' + status,
                    'key=' + key.source + '; bytes=' + body.length + '; expected movie 603 JSON');
            }
            return report('TMDB: OK / HTTP ' + status,
                'key=' + key.source + '; id=' + json.id + '; title=' + json.title);
        });
    }).catch(function (err) {
        return report('TMDB: NETWORK/RUNTIME ERROR', err && err.message ? err.message : err);
    });
}
function summarizeSearch(response, html) {
    var status = Number(response.status) || 0;
    var challenge = /cf-chl|challenge-platform|just a moment|captcha|turnstile|enable javascript|ddos-guard|anubis_challenge|\.within\.website/i.test(html);
    var pageTitle = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    var titleText = pageTitle ? pageTitle[1].replace(/<[^>]+>/g, '') : '(HTML fragment)';
    if (!response.ok) {
        return report('HDREZKA: HTTP ' + status + ' - FAILED',
            (response.statusText || 'HTTP error') + '; page=' + titleText + '; browser-check=' + challenge);
    }
    if (challenge) {
        return report('HDREZKA: POSSIBLE BROWSER CHECK / HTTP ' + status,
            'page=' + titleText + '; bytes=' + html.length + '; heuristic, not proof of cause');
    }
    // Same search-item expression as the currently published HDRezka Lite v0.2.0.
    var re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]{0,250}?<span\b[^>]*class=["'][^"']*\benty\b[^"']*["'][^>]*>([^<]+)<\/span>[\s\S]{0,250}?<\/a>/gi;
    var count = 0, first = '', match;
    while ((match = re.exec(html)) !== null) {
        if (/\/(\d+)-[^/]+\.html(?:[?#].*)?$/.test(match[1])) {
            count++;
            if (!first) first = match[2];
        }
    }
    var links = html.match(/href=["'][^"']*\/\d+-[^"']+\.html[^"']*["']/gi) || [];
    return report('HDREZKA: HTTP ' + status + ' / PARSED ' + count,
        'query=Матрица; links=' + links.length + '; bytes=' + html.length + '; ' + (first ? 'first=' + first : 'page=' + titleText));
}
function probeRezka() {
    return diagnosticRequest('https://hdrezka.ag/engine/ajax/search.php?q=' + encodeURIComponent('Матрица'))
        .then(function (response) {
            return response.text().then(function (html) { return summarizeSearch(response, html); });
        }).catch(function (err) {
            return report('HDREZKA: NETWORK/RUNTIME ERROR', err && err.message ? err.message : err);
        });
}
function getStreams(tmdbId, mediaType) {
    // NuvioTV's Test uses movie 603. Do not pollute other title searches.
    if (String(tmdbId) !== '603' || String(mediaType || 'movie') !== 'movie') return Promise.resolve([]);
    var id = typeof globalThis !== 'undefined' ? String(globalThis.SCRAPER_ID || '') : '';
    if (/hdcheck-runtime$/.test(id)) {
        return Promise.resolve(report('RUNTIME: OK / probe ' + HD_CHECK_VERSION,
            'JS executed; fetch=' + typeof fetch + '; key source=' + diagnosticKey().source));
    }
    if (/hdcheck-tmdb$/.test(id)) return probeTmdb();
    if (/hdcheck-rezka$/.test(id)) return probeRezka();
    return Promise.resolve(report('RUNTIME: UNKNOWN PROBE ID', 'Expected SCRAPER_ID; got ' + id));
}
if (typeof module !== 'undefined' && module.exports) module.exports = { getStreams: getStreams };
else if (typeof globalThis !== 'undefined') globalThis.getStreams = getStreams;

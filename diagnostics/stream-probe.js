/* HDRezka diagnostics, stream-stage probe v0.2.0, 2026-11-06.
 * SPDX-License-Identifier: GPL-3.0-only
 * Based on HDRezka Lite v0.2.0 (upstream: michat88/nuvio-providers).
 * Diagnostic entries are NOT videos. Run Test and disable afterwards.
 * Reproduces the existing movie search/page/translator/POST/parser steps.
 * No TMDB request, video download, credentials, external logging, or settings changes.
 */
var SP_BASE = 'https://hdrezka.ag/';
var SP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

function spSafe(value) {
    return String(value == null ? '' : value)
        .replace(/https?:\/\/[^\s<>"']+/gi, '[URL]')
        .replace(/((?:api_key|token|password|cookie)\s*[=:]\s*)[^\s&,;]+/gi, '$1[REDACTED]')
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 240);
}
function spReport(title, detail) {
    return {
        name: 'DIAGNOSTIC ONLY - NOT VIDEO', title: spSafe(title),
        quality: 'NOT VIDEO | ' + spSafe(detail), type: 'diagnostic',
        url: 'data:text/plain;charset=utf-8,' + encodeURIComponent('Not a video. ' + spSafe(title))
    };
}
function spChallenge(html) {
    return /cf-chl|challenge-platform|just a moment|captcha|turnstile|enable javascript|ddos-guard|anubis_challenge|\.within\.website/i.test(html);
}
function spRead(url, stage, state, options) {
    state.stage = stage;
    var opts = options || {};
    var headers = {
        'User-Agent': SP_UA, 'Accept': '*/*',
        'X-Hdrezka-Android-App': '1', 'X-Hdrezka-Android-App-Version': '2.2.0'
    };
    Object.keys(opts.headers || {}).forEach(function (key) { headers[key] = opts.headers[key]; });
    var request = { method: opts.method || 'GET', headers: headers };
    if (opts.body !== undefined) request.body = opts.body;
    return Promise.resolve().then(function () { return fetch(url, request); }).then(function (response) {
        state.http.push(stage + '=' + response.status);
        if (!response.ok) throw new Error(stage + ': HTTP ' + response.status);
        return response.text();
    });
}
function spFind(html) {
    var re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]{0,250}?<span\b[^>]*class=["'][^"']*\benty\b[^"']*["'][^>]*>([^<]+)<\/span>[\s\S]{0,250}?<\/a>/gi;
    var found = [], m;
    while ((m = re.exec(html)) !== null) {
        var id = m[1].match(/\/(\d+)-[^/]+\.html(?:[?#].*)?$/);
        if (!id) continue;
        var year = m[0].match(/\b(?:19|20)\d{2}\b/);
        var score = /\/films\//.test(m[1]) ? 4 : 0;
        if (year && Number(year[0]) === 1999) score += 8;
        found.push({ id: id[1], url: m[1], title: m[2], score: score });
    }
    found.sort(function (a, b) { return b.score - a.score; });
    return found.length ? found[0] : null;
}
function spVoice(html) {
    var init = html.match(/initCDNMoviesEvents\s*\(\s*\d+\s*,\s*(\d+)/i);
    if (init && init[1] !== '238') return init[1];
    var re = /data-translator_id\s*=\s*["']?(\d+)/gi, first = null, m;
    while ((m = re.exec(html)) !== null) {
        if (!first) first = m[1];
        if (m[1] !== '238') return m[1];
    }
    return init ? init[1] : first;
}
function spVideoCount(input) {
    if (typeof input !== 'string') return 0;
    return input.split(',').filter(function (segment) {
        return /https?:\/\/[^\s,\]|<>"']+\.(?:mp4|m3u8)(?:\?[^\s,\]|<>"']*)?/i.test(segment);
    }).length;
}
function spFinish(state) {
    return [
        spReport('04 / HTTP: ' + (state.http.join(' ') || 'no response'),
            'Test=Матрица (1999); selected ID=' + (state.id || 'none') + '; stage=' + state.stage),
        spReport('04 / TRANSLATOR: ' + (state.voice || 'not reached'),
            'page=' + (state.page || 'not reached') + '; API success=' + state.success + (state.message ? '; message=' + state.message : '')),
        spReport('04 / VIDEO: ' + (state.error ? 'STOPPED' : state.format),
            state.error || ('url chars=' + state.length + '; parsed links=' + state.count + '; link extraction only, playback NOT tested'))
    ];
}
function getStreams(tmdbId, mediaType) {
    if (String(tmdbId) !== '603' || String(mediaType || 'movie') !== 'movie') return Promise.resolve([]);
    var state = { stage: 'SEARCH', http: [], id: '', voice: '', page: '', success: 'not reached', message: '', format: 'not reached', length: 0, count: 0, error: '' };
    return spRead(SP_BASE + 'engine/ajax/search.php?q=' + encodeURIComponent('Матрица'), 'SEARCH', state)
        .then(function (html) {
            var item = spFind(html);
            if (!item) throw new Error(spChallenge(html) ? 'SEARCH: possible browser check' : 'SEARCH: no parsed movie');
            state.id = item.id;
            var pageUrl = /^https?:\/\//i.test(item.url) ? item.url : SP_BASE + item.url.replace(/^\//, '');
            return spRead(pageUrl, 'PAGE', state).then(function (page) {
                state.voice = spVoice(page) || '';
                var marker = /initCDN(?:Movies|Series)Events/.test(page);
                state.page = marker ? 'player marker found' : (spChallenge(page) ? 'possible browser check' : 'no player marker');
                if (!state.voice) throw new Error('PAGE: translator not found; ' + state.page);
                var form = { id: item.id, translator_id: state.voice, favs: '00000000-0000-4000-8000-000000000000', action: 'get_movie' };
                var body = Object.keys(form).map(function (key) { return encodeURIComponent(key) + '=' + encodeURIComponent(form[key]); }).join('&');
                return spRead(SP_BASE + 'ajax/get_cdn_series/', 'CDN', state, {
                    method: 'POST', body: body,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': pageUrl }
                });
            });
        }).then(function (raw) {
            state.stage = 'PARSE';
            var data;
            try { data = JSON.parse(raw); } catch (_) { throw new Error('CDN: non-JSON response' + (spChallenge(raw) ? '; possible browser check' : '')); }
            if (!data || typeof data !== 'object') throw new Error('CDN: JSON is not an object');
            state.success = typeof data.success === 'undefined' ? 'absent' : String(data.success);
            state.message = spSafe(data.message || data.error || '');
            var value = data.url;
            state.length = typeof value === 'string' ? value.length : 0;
            state.count = spVideoCount(value);
            if (typeof value !== 'string' || !value.trim()) state.format = 'URL FIELD EMPTY / MISSING';
            else if (/^\s*#h/.test(value)) state.format = 'ENCODED #h / decoder needed';
            else if (state.count > 0) state.format = 'PLAIN URLS FOUND';
            else state.format = 'URL FORMAT NOT RECOGNIZED';
            if (data.success === false) state.error = 'CDN: success=false' + (state.message ? '; ' + state.message : '');
            return spFinish(state);
        }).catch(function (error) {
            state.error = state.stage + ': ' + spSafe(error && error.message ? error.message : error);
            return spFinish(state);
        });
}
if (typeof module !== 'undefined' && module.exports) module.exports = { getStreams: getStreams };
else if (typeof globalThis !== 'undefined') globalThis.getStreams = getStreams;

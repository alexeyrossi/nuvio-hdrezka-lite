/*
 * HDRezka Lite, experimental Nuvio JS provider, v0.1.0.
 * Adapted from michat88/nuvio-providers/providers/hdrezka.js,
 * https://github.com/michat88/nuvio-providers
 * SPDX-License-Identifier: GPL-3.0-only
 * Modifications: one-provider build, robust URL construction, series/tv
 * normalization, explicit form encoding, reduced network calls, diagnostics,
 * and prefer non-Original translator when identifiable.
 * This code is NOT verified against the live HDRezka service.
 */

var REZKA_BASE = 'https://hdrezka.ag/';
var TMDB_KEY = '439c478a771f35c05022f9feabcca01c';
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';
var COMMON_HEADERS = {
  'User-Agent': UA,
  'Accept': '*/*',
  'X-Hdrezka-Android-App': '1',
  'X-Hdrezka-Android-App-Version': '2.2.0'
};

function log(stage, value) {
  console.log('[HDRezkaLite][' + stage + '] ' + value);
}

function request(url, opts) {
  var options = opts || {};
  var headers = {};
  Object.keys(COMMON_HEADERS).forEach(function(k) { headers[k] = COMMON_HEADERS[k]; });
  Object.keys(options.headers || {}).forEach(function(k) { headers[k] = options.headers[k]; });
  log('REQUEST', (options.method || 'GET') + ' ' + url);
  return fetch(url, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body
  }).then(function(response) {
    log('HTTP', response.status + ' ' + url.split('?')[0]);
    if (!response.ok) throw new Error('HTTP ' + response.status + ' at ' + url.split('?')[0]);
    return response;
  });
}

function parseSearch(html, isSeries, year) {
  var re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]{0,250}?<span\b[^>]*class=["'][^"']*\benty\b[^"']*["'][^>]*>([^<]+)<\/span>[\s\S]{0,250}?<\/a>/gi;
  var candidates = [];
  var m;
  while ((m = re.exec(html)) !== null) {
    var url = m[1];
    var idmatch = url.match(/\/(\d+)-[^/]+\.html(?:[?#].*)?$/);
    if (!idmatch) continue;
    var rawYear = m[0].match(/\b(?:19|20)\d{2}\b/);
    var itemType = /\/series\//.test(url) ? 'tv' : /\/films\//.test(url) ? 'movie' : 'other';
    var score = 0;
    if (isSeries && itemType === 'tv') score += 4;
    if (!isSeries && itemType === 'movie') score += 4;
    if (year && rawYear && parseInt(rawYear[0], 10) === year) score += 8;
    candidates.push({ id: idmatch[1], url: url, title: m[2], score: score });
  }
  candidates.sort(function(a, b) { return b.score - a.score; });
  log('SEARCH', candidates.length + ' parsed candidates');
  return candidates.length ? candidates[0] : null;
}

function search(title, isSeries, year) {
  var url = REZKA_BASE + 'engine/ajax/search.php?q=' + encodeURIComponent(title);
  return request(url).then(function(r) { return r.text(); }).then(function(html) {
    log('SEARCH', 'response length=' + html.length + ', title=' + title);
    return parseSearch(html, isSeries, year);
  });
}

function chooseTranslator(html, isSeries) {
  var initName = isSeries ? 'initCDNSeriesEvents' : 'initCDNMoviesEvents';
  var initPattern = new RegExp(initName + '\\s*\\(\\s*\\d+\\s*,\\s*(\\d+)', 'i');
  var initMatch = html.match(initPattern);
  if (initMatch && initMatch[1] !== '238') return initMatch[1];
  var re = /data-translator_id\s*=\s*["']?(\d+)/gi;
  var m;
  var fallback = null;
  while ((m = re.exec(html)) !== null) {
    if (!fallback) fallback = m[1];
    if (m[1] !== '238') return m[1];
  }
  return initMatch ? initMatch[1] : fallback;
}

function absoluteUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return REZKA_BASE + String(url).replace(/^\//, '');
}

function formEncode(input) {
  return Object.keys(input).map(function(key) {
    return encodeURIComponent(key) + '=' + encodeURIComponent(String(input[key]));
  }).join('&');
}

function parseVideos(encoded, title, season, episode) {
  if (!encoded || typeof encoded !== 'string') return [];
  var segments = encoded.split(',');
  var streams = [];
  segments.forEach(function(segment) {
    var label = segment.match(/^\[([^\]]+)\]/);
    var quality = label ? label[1].replace(/<[^>]*>/g, '').trim() : 'Unknown';
    var urlMatch = segment.match(/https?:\/\/[^\s,\]|<>"']+\.(?:mp4|m3u8)(?:\?[^\s,\]|<>"']*)?/i);
    if (!urlMatch) return;
    var streamUrl = urlMatch[0];
    streams.push({
      name: 'HDRezka Lite',
      title: title + (season ? ' S' + season + 'E' + episode : '') + ' ' + quality,
      url: streamUrl,
      quality: quality,
      type: 'direct',
      headers: { 'Referer': REZKA_BASE, 'User-Agent': UA }
    });
  });
  log('STREAMS', streams.length + ' direct MP4/HLS URLs');
  return streams;
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  var kind = String(mediaType || 'movie').toLowerCase();
  var isSeries = kind === 'tv' || kind === 'series' || kind === 'show';
  var season = isSeries ? (parseInt(seasonNum, 10) || 1) : null;
  var episode = isSeries ? (parseInt(episodeNum, 10) || 1) : null;
  var endpoint = isSeries ? 'tv' : 'movie';
  var tmdbUrl = 'https://api.themoviedb.org/3/' + endpoint + '/' +
    encodeURIComponent(String(tmdbId)) + '?api_key=' + encodeURIComponent(TMDB_KEY) + '&language=ru-RU';
  log('BEGIN', 'TMDB=' + tmdbId + ' type=' + kind + ' S=' + season + ' E=' + episode);
  return request(tmdbUrl).then(function(r) { return r.json(); }).then(function(data) {
    var title = isSeries ? data.name : data.title;
    var original = isSeries ? data.original_name : data.original_title;
    var airDate = isSeries ? data.first_air_date : data.release_date;
    var year = airDate ? parseInt(airDate.substr(0, 4), 10) : null;
    if (!title && !original) throw new Error('TMDB returned no title');
    log('TMDB', (title || original) + ' / ' + (original || '') + ' / ' + year);

    return search(title || original, isSeries, year).then(function(found) {
      if (found || !original || original === title) return found;
      log('SEARCH', 'trying original title as fallback');
      return search(original, isSeries, year);
    }).then(function(found) {
      if (!found) { log('EMPTY', 'no search matches'); return []; }
      var pageUrl = absoluteUrl(found.url);
      return request(pageUrl).then(function(r) { return r.text(); }).then(function(page) {
        var voice = chooseTranslator(page, isSeries);
        log('TRANSLATOR', voice || 'none');
        if (!voice) return [];
        var form = { id: found.id, translator_id: voice };
        if (isSeries) { form.season = season; form.episode = episode; }
        form.favs = '00000000-0000-4000-8000-000000000000';
        form.action = isSeries ? 'get_stream' : 'get_movie';
        return request(REZKA_BASE + 'ajax/get_cdn_series/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': pageUrl },
          body: formEncode(form)
        }).then(function(r) { return r.text(); }).then(function(raw) {
          var json;
          try { json = JSON.parse(raw); }
          catch (e) { log('PARSE', 'non-JSON stream response, length=' + raw.length); return []; }
          if (json.success === false) log('API', 'stream response success=false');
          return parseVideos(json.url, title || original, season, episode);
        });
      });
    });
  }).catch(function(err) {
    console.error('[HDRezkaLite][ERROR] ' + (err && err.message ? err.message : String(err)));
    return [];
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}

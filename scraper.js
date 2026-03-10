const axios = require('axios');
const cheerio = require('cheerio');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function log(msg) {
  console.log(`[Scraper ${new Date().toLocaleTimeString()}] ${msg}`);
}

function createClient(cookies) {
  return axios.create({
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      ...(cookies ? { 'Cookie': cookies } : {})
    },
    timeout: 30000,
    maxRedirects: 10,
  });
}

// ========== HADOANTV.COM LOGIN ==========

let hadoantvCookies = null;

async function hadoantvLogin(username, password) {
  try {
    log(`Logging into hadoantv.com as ${username}...`);
    const client = createClient();
    const loginPageRes = await client.get('https://hadoantv.com/my-account/', {
      maxRedirects: 5,
      validateStatus: () => true,
    });

    const setCookies = extractSetCookies(loginPageRes);
    const $ = cheerio.load(loginPageRes.data);
    const nonce = $('input[name="woocommerce-login-nonce"]').val() || '';

    const loginData = new URLSearchParams({
      'username': username,
      'password': password,
      'woocommerce-login-nonce': nonce,
      '_wp_http_referer': '/my-account/',
      'login': 'Đăng nhập',
      'rememberme': 'forever',
    });

    const loginRes = await axios.post('https://hadoantv.com/my-account/', loginData.toString(), {
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': setCookies,
        'Referer': 'https://hadoantv.com/my-account/',
      },
      maxRedirects: 0,
      validateStatus: () => true,
    });

    hadoantvCookies = mergeSetCookies(setCookies, extractSetCookies(loginRes));

    const isRedirect = loginRes.status >= 300 && loginRes.status < 400;
    if (isRedirect || hadoantvCookies.includes('wordpress_logged_in')) {
      log('hadoantv.com login successful');
      return true;
    }

    log('hadoantv.com login may have failed - proceeding anyway');
    return true;
  } catch (err) {
    log(`hadoantv.com login error: ${err.message}`);
    return false;
  }
}

// ========== LINKNEVERDIE.COM LOGIN ==========

let linkneverdieComCookies = null;

async function linkneverdiLogin(username, password) {
  try {
    log(`Logging into linkneverdie.com as ${username}...`);
    const client = createClient();
    const loginPageRes = await client.get('https://linkneverdie.com/my-account/', {
      validateStatus: () => true,
    });

    const setCookies = extractSetCookies(loginPageRes);
    const $ = cheerio.load(loginPageRes.data);
    const nonce = $('input[name="woocommerce-login-nonce"]').val() || '';

    const loginData = new URLSearchParams({
      'username': username,
      'password': password,
      'woocommerce-login-nonce': nonce,
      '_wp_http_referer': '/my-account/',
      'login': 'Đăng nhập',
      'rememberme': 'forever',
    });

    const loginRes = await axios.post('https://linkneverdie.com/my-account/', loginData.toString(), {
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': setCookies,
        'Referer': 'https://linkneverdie.com/my-account/',
      },
      maxRedirects: 0,
      validateStatus: () => true,
    });

    linkneverdieComCookies = mergeSetCookies(setCookies, extractSetCookies(loginRes));
    log('linkneverdie.com login attempt done');
    return true;
  } catch (err) {
    log(`linkneverdie.com login error: ${err.message}`);
    return false;
  }
}

// ========== NOTEPAD SCRAPER ==========

// Known hosting services to look for
const HOSTING_PATTERNS = [
  { name: 'Google Drive', pattern: /filecrypt\.cc/i },
  { name: 'AkiraBox', pattern: /akirabox\.(com|to)/i },
  { name: 'VikingFile', pattern: /filecrypt\.cc.*?E054|vikingfile/i },
  { name: 'Ranoz', pattern: /ranoz\.gg/i },
  { name: 'Rootz', pattern: /rootz\.so/i },
  { name: 'MediaFire', pattern: /mediafire\.com/i },
  { name: 'Mega', pattern: /mega\.(nz|co)/i },
  { name: 'Google Drive Direct', pattern: /drive\.google\.com/i },
  { name: 'OneDrive', pattern: /onedrive|1drv/i },
  { name: 'Fshare', pattern: /fshare\.vn/i },
];

function identifyHosting(url, contextText) {
  const ctxLower = (contextText || '').toLowerCase();
  if (ctxLower.includes('google drive')) return 'Google Drive';
  if (ctxLower.includes('akirabox')) return 'AkiraBox';
  if (ctxLower.includes('vikingfile')) return 'VikingFile';
  if (ctxLower.includes('ranoz')) return 'Ranoz';
  if (ctxLower.includes('rootz')) return 'Rootz';
  if (ctxLower.includes('mediafire')) return 'MediaFire';
  if (ctxLower.includes('mega')) return 'Mega';
  if (ctxLower.includes('fshare')) return 'Fshare';

  for (const h of HOSTING_PATTERNS) {
    if (h.pattern.test(url)) return h.name;
  }

  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain;
  } catch {
    return 'Download';
  }
}

// Check if text looks like a section heading (Bản Offline, Bản Online, etc.)
function extractSectionName(text) {
  const match = text.match(/(bản\s+[^:]{2,40}|offline[^:]{0,40}|online[^:]{0,40})/i);
  if (match) return match[1].replace(/:$/, '').trim();
  return null;
}

function isSkipUrl(url) {
  if (!url || url === '#') return true;
  if (url.includes('hadoantv.com')) return true;
  if (url.includes('hadoantvnotepad.com')) return true;
  if (url.includes('youtube.com')) return true;
  if (url.includes('youtu.be')) return true;
  return false;
}

async function scrapeNotepad(notepadUrl) {
  log(`Scraping notepad: ${notepadUrl}`);
  try {
    const client = createClient(hadoantvCookies);
    const res = await client.get(notepadUrl, { validateStatus: () => true });

    if (res.status !== 200) {
      log(`Notepad returned status ${res.status}`);
      return null;
    }

    const $ = cheerio.load(res.data);
    const parts = [];
    const seenUrls = new Set();

    // Find the main content area
    const area = $('.area').first();
    const container = area.length ? area : $('body');

    // Walk through elements to detect sections and links
    let currentSection = '';
    let hasMultipleSections = false;

    // First pass: detect if there are section headings
    container.find('p, h3, h4, h5, strong').each((_, el) => {
      const $el = $(el);
      const strongText = $el.is('strong') ? $el.text() : $el.find('strong').text();
      if (strongText && extractSectionName(strongText)) {
        hasMultipleSections = true;
        return false; // break
      }
    });

    // Second pass: walk all children to collect links with sections
    const allElements = container.find('p, h3, h4, h5, ul, ol, hr');
    allElements.each((_, el) => {
      const $el = $(el);
      const tag = el.tagName;

      // Check for section heading in <p><strong>...</strong></p> or <h3>/<h4>/<h5>
      if (tag === 'p' || tag === 'h3' || tag === 'h4' || tag === 'h5') {
        const strongText = $el.find('strong').text().trim() || $el.text().trim();
        const section = extractSectionName(strongText);
        if (section) {
          currentSection = section;
          return;
        }
      }

      // <hr> resets section if we haven't found a new heading
      if (tag === 'hr') return;

      // Collect links from <ul>/<ol> items
      if (tag === 'ul' || tag === 'ol') {
        $el.find('li').each((_, li) => {
          const $li = $(li);
          const $a = $li.find('a[href]').first();
          if (!$a.length) return;

          const url = $a.attr('href');
          if (isSkipUrl(url) || seenUrls.has(url)) return;

          const liText = $li.text();
          const hosting = identifyHosting(url, liText);
          const name = (hasMultipleSections && currentSection)
            ? `${currentSection} - ${hosting}`
            : hosting;

          seenUrls.add(url);
          parts.push({ name, url });
        });
      }
    });

    // Fallback: if no links found via structured walk, scan all <a> tags
    if (parts.length === 0) {
      $('a[href]').each((_, el) => {
        const url = $(el).attr('href');
        if (isSkipUrl(url) || seenUrls.has(url)) return;
        const isDownloadLink = HOSTING_PATTERNS.some(h => h.pattern.test(url));
        if (!isDownloadLink) return;

        const parentText = $(el).parent().text();
        const name = identifyHosting(url, parentText);
        seenUrls.add(url);
        parts.push({ name, url });
      });
    }

    log(`Found ${parts.length} download link(s) from notepad`);
    parts.forEach(p => log(`  \u2192 ${p.name}: ${p.url}`));

    return parts;
  } catch (err) {
    log(`Notepad scrape error: ${err.message}`);
    return null;
  }
}

// ========== MAIN SYNC FUNCTION ==========

async function syncGame(game) {
  try {
    if (!game.notepadUrl) {
      return { success: false, error: 'No notepad URL configured' };
    }

    log(`Syncing game: ${game.name}`);

    const parts = await scrapeNotepad(game.notepadUrl);
    if (!parts) {
      return { success: false, error: 'Failed to scrape notepad page' };
    }

    if (parts.length === 0) {
      return { success: false, error: 'No download links found in notepad' };
    }

    log(`Sync OK: ${parts.length} link(s) for ${game.name}`);

    return {
      success: true,
      parts,
      syncedAt: new Date().toISOString(),
    };
  } catch (err) {
    log(`syncGame error for ${game.name}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ========== COOKIE HELPERS ==========

function extractSetCookies(res) {
  const headers = res.headers['set-cookie'];
  if (!headers) return '';
  return headers.map(c => c.split(';')[0]).join('; ');
}

function mergeSetCookies(existing, newCookies) {
  const cookieMap = {};
  for (const str of [existing, newCookies]) {
    if (!str) continue;
    for (const pair of str.split('; ')) {
      const [key, ...rest] = pair.split('=');
      if (key && rest.length > 0) {
        cookieMap[key.trim()] = rest.join('=');
      }
    }
  }
  return Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ');
}

module.exports = {
  hadoantvLogin,
  linkneverdiLogin,
  scrapeNotepad,
  syncGame,
  log,
};

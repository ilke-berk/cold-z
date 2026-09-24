/**
 * BexFlow (Alliance Healthcare / Cencora iş akışı) — salt-okunur istemci
 *
 * BexFlow'un resmi bir API'si yok. Sayfa, Ardita framework'ünün "DataGrid"
 * AJAX çağrılarıyla JSON çeker; bu modül aynı çağrıları yeniden üretir:
 *
 *   GET  /mailbox/[?folder=x]           → sayfa HTML'i: XSRF token + liste grid config'i
 *   POST <liste baseUrl>  function=refreshData&datagridDefinition=…  → iş listesi (JSON)
 *   POST <liste baseUrl>  rowModel={…, action:'showRowDetail'}        → iş detay HTML'i
 *   POST <grid baseUrl>   function=refreshData&datagridDefinition=…  → ürünler / notlar (JSON)
 *   GET  /Data/Collaboration/Task/<id>/<n>.<ext>                     → ek dosyası
 *
 * Grid config'leri HTML'de `Ardita.controls.dataGrid('<id>', {…})` olarak gömülü;
 * istek gövdesindeki datagridDefinition bu config'ten türetilir (buildDefinition).
 *
 * YALNIZCA OKUMA: onayla / reddet / not ekle gibi aksiyon uçları bilerek yok.
 * Oturum (reCAPTCHA'lı giriş) kullanıcı tarafından açılır; bu modül hazır
 * çerezlerle çalışan bir fetch fonksiyonu alır (Electron session.fetch).
 */

const DEFAULT_BASE = 'https://bexflow.alliance-healthcare.com.tr';
const FORM_HEADERS = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'Accept': '*/*',
};
const FOLDERS = { '': 'Posta Kutusu', inbox: 'Cevap Bekleyenler', pool: 'Havuzda Bekleyenler', waiting: 'Park Edilen', sentbox: 'Gidenler', requests: 'Taleplerim' };

class SessionExpiredError extends Error {
    constructor(msg = 'BexFlow oturumu kapalı veya süresi doldu.') { super(msg); this.code = 'SESSION_EXPIRED'; }
}

// ─── HTML / Ardita yardımcıları (saf) ───────────────────────

function decodeEntities(s) {
    return String(s == null ? '' : s)
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
}

function htmlToText(s) {
    return decodeEntities(String(s == null ? '' : s)
        .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, ''))
        .replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** HTML içinde `Ardita.controls.dataGrid('<id>', {…})` çağrılarının id'leri. */
function findGridIds(html) {
    const ids = [];
    const re = /Ardita\.controls\.dataGrid\('([^']+)',\s*\{/g;
    let m;
    while ((m = re.exec(html))) if (!ids.includes(m[1])) ids.push(m[1]);
    return ids;
}

/** Verilen grid'in config nesnesini (dengeli süslü parantez taramasıyla) çıkarır. */
function extractGridConfig(html, id) {
    const key = `Ardita.controls.dataGrid('${id}',`;
    const s = html.indexOf(key);
    if (s < 0) return null;
    let i = html.indexOf('{', s + key.length);
    if (i < 0) return null;
    const start = i;
    let depth = 0, inStr = false, esc = false;
    for (; i < html.length; i++) {
        const c = html[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) break;
    }
    try { return JSON.parse(html.slice(start, i + 1)); } catch (e) { return null; }
}

/** Grid config → sunucunun beklediği datagridDefinition (tarayıcının refreshData gövdesi). */
function buildDefinition(cfg, controlName, pageSize = -1, currentPage = 1) {
    const col = (c) => {
        const o = { memberName: c.memberName, displayName: c.displayName, defaultValue: c.defaultValue, visibility: c.visibility, type: c.type, prefix: c.prefix };
        if (c.extraData) o.extraData = c.extraData;
        return o;
    };
    return {
        filters: [], sorters: [],
        columns: (cfg.columns || []).map(col),
        ignoreHierarchyOnFiltering: !!cfg.ignoreHierarchyOnFiltering,
        groupers: [], selectedRows: [],
        ghostColumns: (cfg.ghostColumns || []).map(g => ({ memberName: g.memberName, defaultValue: g.defaultValue, type: g.type })),
        dependencies: (cfg.dependencies || []).map(d => ({ memberName: d.memberName, value: d.value, title: d.title, isActive: d.isActive, filterComprassion: d.filterComprassion })),
        form: null,
        showDetailFormName: '',
        grouperPercentanceProperty: cfg.grouperPercentanceProperty || '',
        currentPage, pageSize,
        saveRowFunction: null, hierarchicalDisplay: false, canBeSelected: false,
        refreshColumnOnLoadData: false, showTotalsRow: false,
        controlName,
    };
}

function extractXsrfToken(html) {
    const m = html.match(/<input[^>]*name="__XSRF-AToken__"[^>]*>/i);
    if (m) { const v = m[0].match(/value="([^"]*)"/i); if (v) return decodeEntities(v[1]); }
    const j = html.match(/_securityXSRFToken\s*=\s*['"]([^'"]+)['"]/);
    return j ? j[1] : null;
}

function attrs(tag) {
    const out = {};
    const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(tag))) out[m[1].toLowerCase()] = decodeEntities(m[2]);
    return out;
}

/**
 * Detay formundaki salt-okunur alanlar: data-property="@Model.X" taşıyan input'lar.
 * Dönen: { 'RemoteInvoice.ReturnInvoiceReason': { label: 'İade Nedeni', value: '4-Depo…' }, … }
 */
function parseDetailFields(html) {
    const labels = {};
    const lre = /<label[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/label>/gi;
    let m;
    while ((m = lre.exec(html))) labels[m[1]] = htmlToText(m[2]);
    const fields = {};
    const ire = /<(input|textarea)\b[^>]*data-property="@Model\.([^"]+)"[^>]*>/gi;
    while ((m = ire.exec(html))) {
        const a = attrs(m[0]);
        if (!a.id || /original$/.test(a.id)) continue;
        let value = a.value;
        if (m[1].toLowerCase() === 'textarea') {
            const end = html.indexOf('</textarea>', m.index);
            value = end > 0 ? htmlToText(html.slice(m.index + m[0].length, end)) : '';
        }
        const prop = m[2];
        if (fields[prop]) continue;
        fields[prop] = { label: labels[a.id] || null, value: (value || '').trim() };
    }
    return fields;
}

/** Detay sayfasındaki serbest paragraf uyarıları (ör. "BU İADEDE SOĞUK ZİNCİR ÜRÜNLER BULUNMAKTADIR!!"). */
function parseNotices(html) {
    const out = [];
    const re = /<div[^>]*class="paragraph-text-area"[^>]*>([\s\S]*?)<\/div>/gi;
    let m;
    while ((m = re.exec(html))) { const t = htmlToText(m[1]); if (t) out.push(t); }
    return out;
}

/**
 * "215515 nolu iade onayı Müşteri: 28089 - ANIL ECZANESI, EYUP, ISTANBUL AVRUPA"
 *   → { refNo:'215515', subject:'iade onayı', customerCode:'28089', pharmacy:'ANIL ECZANESI', district:'EYUP', region:'ISTANBUL AVRUPA' }
 * Kalıba uymayan başlıklarda yalnızca bulunanlar doldurulur.
 */
function parseTitle(title) {
    const t = String(title || '').trim();
    const out = { refNo: null, subject: null, customerCode: null, pharmacy: null, district: null, region: null };
    const m = t.match(/^(\d+)\s+nolu\s+(.*?)\s*(?:Müşteri|Musteri)\s*:\s*(.*)$/i);
    let cust = null;
    if (m) { out.refNo = m[1]; out.subject = m[2].trim() || null; cust = m[3]; }
    else {
        const c = t.match(/(?:Müşteri|Musteri)\s*:\s*(.*)$/i);
        if (c) cust = c[1];
    }
    if (cust) {
        const cm = cust.match(/^(\d+)\s*-\s*(.*)$/);
        const rest = cm ? cm[2] : cust;
        if (cm) out.customerCode = cm[1];
        const parts = rest.split(',').map(s => s.trim()).filter(Boolean);
        out.pharmacy = parts[0] || null;
        out.district = parts[1] || null;
        out.region = parts.slice(2).join(', ') || null;
    }
    return out;
}

/** "17.09.2026 10:39" → "2026-09-17T10:39:00" (yerel saat, ISO biçimli metin) */
function trDateTimeToIso(s) {
    const m = String(s || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    const p = (n) => String(n).padStart(2, '0');
    return `${m[3]}-${p(m[2])}-${p(m[1])}T${p(m[4] || 0)}:${p(m[5] || 0)}:00`;
}

/** "1.887,13" → 1887.13 */
function trNumber(s) {
    if (s == null || s === '') return null;
    const n = Number(String(s).replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
}

function stripPrefix(row) {
    const out = {};
    for (const [k, v] of Object.entries(row || {})) out[k.includes('.') && /^AHSube_/.test(k) ? k.slice(k.indexOf('.') + 1) : k] = v;
    return out;
}

/** Ürün grid satırı → normalize kalem */
function normalizeItem(raw) {
    const r = stripPrefix(raw);
    return {
        comment: r.INVOICECOMMENT || null,
        itemId: r.ITEMID || null,
        name: r.NAMETUR || null,
        barcode: r.BARCODE || null,
        purchaseDate: r.FORMATTEDRETURNEDITEMDATE || null,
        quantityText: r.FORMATTEDTOTALQUANTITY || null,
        boxes: trNumber(r.TOTALQUANTITY),
        total: trNumber(r.GROSSTOTAL),
        expiry: r.FORMATTEDEXPIRYDATE || null,          // "01.2028" (AA.YYYY)
        expiryStock: trNumber(r.STOCKINEXPIRYDATE),
        stockDays: r.STOCKGUNSUMMARY || null,
        className: r.CLASSNAME || null,
        cold: /so[ğg]uk/i.test(String(r.ISMUSTSHIPCOLD || '')),
        trackType: r.TRACKTYPE || null,
        raw,
    };
}

/** Not grid satırı → normalize not (+ ekleri) */
function normalizeComment(r) {
    const att = r['Attachments{FileName,Path}'] || r.Attachments || [];
    return {
        id: r.ID,
        author: r['Employee.Name'] || null,
        date: r.DateCreatedBeauty || null,
        dateIso: trDateTimeToIso(r.DateCreatedBeauty),
        action: r['TaskAction.Action'] || null,
        status: r['TaskAction.WorkflowStatus.Name'] || null,
        text: htmlToText(r.Comment),
        mailMessageId: r.MailMessageID || 0,
        attachments: (Array.isArray(att) ? att : []).map(a => ({ fileName: a.FileName, path: a.Path })).filter(a => a.fileName && a.path),
    };
}

/** Liste satırı → normalize iş */
function normalizeTask(row, folder) {
    const t = parseTitle(row.Title);
    return {
        id: Number(row.ID),
        folder: folder || '',
        title: row.Title || '',
        ...t,
        unit: (row['Unit.Name'] || '').trim() || null,
        workflow: row['Workflow.Name'] || null,
        status: row['WorkflowStatus.Name'] || null,
        createdText: row.DateCreatedBuity || null,
        createdIso: trDateTimeToIso(row.DateCreatedBuity),
        lastComment: row['DetailComment.Comment'] || null,
        row,
    };
}

/** Ek yolu güvenli mi? Yalnızca BexFlow'un /Data/ altındaki göreli yolları. */
function isSafeAttachmentPath(p) {
    return typeof p === 'string' && /^\/Data\/[\w\-./ ]+$/.test(p) && !p.includes('..');
}

// ─── İstemci ─────────────────────────────────────────────────

/**
 * @param {object} o
 * @param {(url:string, init?:object)=>Promise<Response>} o.fetch  çerezli fetch (Electron session.fetch)
 * @param {string} [o.base]
 * @param {number} [o.delayMs]  istekler arası nezaket beklemesi
 */
function createClient({ fetch, base = DEFAULT_BASE, delayMs = 300 } = {}) {
    if (typeof fetch !== 'function') throw new Error('createClient: fetch gerekli');
    const origin = base.replace(/\/+$/, '');
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const abs = (u) => /^https?:/i.test(u) ? u : origin + (u.startsWith('/') ? u : '/' + u);

    function assertSession(res, text) {
        const finalUrl = String(res.url || '');
        if (res.status === 401 || res.status === 403 || /\/Login(\b|\/|\?|$)/i.test(finalUrl)) throw new SessionExpiredError();
        // Yönlendirme olmadan giriş formu dönerse (captcha'lı sayfa, grid yok)
        if (text != null && /g-recaptcha|grecaptcha/i.test(text) && !/Ardita\.controls\.dataGrid/.test(text)) throw new SessionExpiredError();
    }

    // BexFlow detay (showRowDetail) isteği Referer başlığı olmadan hata sayfası döner;
    // tarayıcı bunu kendiliğinden gönderir, Electron session.fetch göndermez.
    // Her istek, açık olan klasör sayfasını referans gösterir.
    const withReferer = (headers, referer) => {
        const ref = abs(referer || '/mailbox/');
        return { headers: { ...headers, 'Referer': ref, 'Origin': origin }, referrer: ref, referrerPolicy: 'unsafe-url' };
    };

    async function getText(url) {
        const res = await fetch(abs(url), { method: 'GET', ...withReferer({ 'Accept': 'text/html,*/*' }, '/mailbox/') });
        const text = await res.text();
        assertSession(res, text);
        if (!res.ok) throw new Error(`BexFlow HTTP ${res.status} (${url})`);
        return text;
    }

    async function post(url, params, referer) {
        if (delayMs) await sleep(delayMs);
        const res = await fetch(abs(url), { method: 'POST', ...withReferer(FORM_HEADERS, referer), body: new URLSearchParams(params).toString() });
        const text = await res.text();
        assertSession(res, /^\s*[{[]/.test(text) ? null : text);
        if (!res.ok) throw new Error(`BexFlow HTTP ${res.status}`);
        return text;
    }

    async function postJson(url, params, referer) {
        const text = await post(url, params, referer);
        try { return JSON.parse(text); }
        catch (e) { throw new SessionExpiredError('BexFlow JSON yerine HTML döndürdü — oturum düşmüş olabilir.'); }
    }

    /** Klasör sayfasını açar: token + liste grid'i. */
    async function openFolder(folder = '') {
        const pageUrl = '/mailbox/' + (folder ? `?folder=${encodeURIComponent(folder)}` : '');
        const html = await getText(pageUrl);
        const token = extractXsrfToken(html);
        const listId = findGridIds(html).find(id => /^mailbox/i.test(id)) || findGridIds(html)[0];
        const cfg = listId && extractGridConfig(html, listId);
        if (!token || !cfg || !cfg.configuration || !cfg.configuration.baseUrl) {
            throw new SessionExpiredError('BexFlow posta kutusu okunamadı (oturum kapalı ya da sayfa yapısı değişti).');
        }
        return { folder, token, listId, cfg, baseUrl: cfg.configuration.baseUrl, pageUrl };
    }

    /**
     * Klasördeki işler (sayfalı, en yeni önce).
     * since: 'YYYY-MM-DD' — bundan eski işler alınmaz; sayfada eski iş görülünce sonraki sayfalar istenmez.
     */
    async function listTasks(ctx, { pageSize = 50, maxPages = 10, since = null } = {}) {
        const out = [];
        let total = null, seen = 0;
        for (let page = 1; page <= maxPages; page++) {
            const def = buildDefinition(ctx.cfg, ctx.listId, pageSize, page);
            const j = await postJson(ctx.baseUrl, { function: 'refreshData', datagridDefinition: JSON.stringify(def), '__XSRF-AToken__': ctx.token }, ctx.pageUrl);
            const rows = Array.isArray(j.data) ? j.data : [];
            total = Number(j.totalRowsCount) || rows.length;
            seen += rows.length;
            let reachedOld = false;
            rows.map(r => normalizeTask(r, ctx.folder)).forEach(t => {
                if (since && t.createdIso && t.createdIso.slice(0, 10) < since) { reachedOld = true; return; }
                out.push(t);
            });
            if (!rows.length || seen >= total || reachedOld) break;
        }
        return { tasks: out, total: total == null ? out.length : total };
    }

    /** İş detayı: form alanları + ürünler + notlar (+ ek listesi). */
    async function getTaskDetail(ctx, task) {
        const def = buildDefinition(ctx.cfg, ctx.listId, 50, 1);
        const rowModel = {
            collectionDefinitionModel: def,
            data: Object.entries(task.row).map(([k, v]) => ({ memberName: k, value: v, isChanged: false, previousValue: '' })),
            action: 'showRowDetail', silentMessage: false, index: 0, isSelected: false,
        };
        const html = await post(ctx.baseUrl, { rowModel: JSON.stringify(rowModel), '__XSRF-AToken__': ctx.token }, ctx.pageUrl);
        if (!html || html.length < 200) throw new Error('BexFlow detay boş döndü');
        // Beklenen detay yerine tam sayfa/hata döndüyse boş kayıt yazma — sonraki senkronda yeniden denenir
        if (!/Ardita\.controls\.dataGrid\(/.test(html) && !/data-property="@Model/.test(html)) {
            throw new Error('BexFlow detay beklenen biçimde değil (' + html.length + ' bayt)');
        }

        const fields = parseDetailFields(html);
        const notices = parseNotices(html);
        const grids = findGridIds(html);
        let items = [], comments = [];
        for (const gid of grids) {
            const cfg = extractGridConfig(html, gid);
            if (!cfg || !cfg.configuration || !cfg.configuration.baseUrl) continue;
            const isItems = /_prfx_grid/.test(gid) && /CustomDataCollectionBinder/.test(cfg.configuration.baseUrl);
            const isComments = /^TaskComments_/.test(gid);
            if (!isItems && !isComments) continue; // AllTaskComments = aynı notların kopyası
            const j = await postJson(cfg.configuration.baseUrl, { function: 'refreshData', datagridDefinition: JSON.stringify(buildDefinition(cfg, gid, isComments ? 500 : -1, 1)), '__XSRF-AToken__': ctx.token }, ctx.pageUrl);
            const rows = Array.isArray(j.data) ? j.data : [];
            if (isItems) items = items.concat(rows.filter(r => Object.keys(r).some(k => /NAMETUR|BARCODE/.test(k))).map(normalizeItem));
            else comments = rows.map(normalizeComment);
        }
        const cold = notices.some(n => /SO[ĞG]UK\s+Z[İI]NC[İI]R/i.test(n))
            || String((fields.SogukZincir || {}).value || '') === '1'
            || items.some(i => i.cold);
        return { fields, notices, items, comments, cold };
    }

    /** Ek dosyasını indirir → { buffer, contentType } */
    async function downloadAttachment(p) {
        if (!isSafeAttachmentPath(p)) throw new Error('Geçersiz ek yolu');
        if (delayMs) await sleep(delayMs);
        const res = await fetch(abs(p), { method: 'GET', ...withReferer({}, '/mailbox/') });
        assertSession(res, null);
        if (!res.ok) throw new Error(`Ek indirilemedi (HTTP ${res.status})`);
        const ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
        if (/text\/html/i.test(ct)) throw new SessionExpiredError();
        const buffer = Buffer.from(await res.arrayBuffer());
        return { buffer, contentType: ct };
    }

    /** Oturum açık mı? (hafif kontrol) */
    async function ping() {
        try { await openFolder(''); return true; }
        catch (e) { if (e.code === 'SESSION_EXPIRED') return false; throw e; }
    }

    return { openFolder, listTasks, getTaskDetail, downloadAttachment, ping, origin };
}

module.exports = {
    DEFAULT_BASE, FOLDERS, SessionExpiredError,
    createClient,
    // saf yardımcılar (test)
    decodeEntities, htmlToText, findGridIds, extractGridConfig, buildDefinition, extractXsrfToken,
    parseDetailFields, parseNotices, parseTitle, trDateTimeToIso, trNumber,
    normalizeItem, normalizeComment, normalizeTask, isSafeAttachmentPath,
};

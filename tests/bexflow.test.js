const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const B = require('../bexflow-client.js');
const C = require('../js/bexflow-classify.js');

// ─── Canlı BexFlow yanıtlarının yapısını taklit eden fixture'lar (örnek veri) ───
const LIST_ID = 'mailboxCBAbscract';
const LIST_URL = '/mailbox/?AjaxRequestWithApplication=DataGridOperation&AjaxControlType=Ardita.View.Web.Controls.Bootstrap.DataOperationManager&AjaxControlID=mailboxCBAbscract&DataGridType=Ardita.Business.Collaboration.TaskMailCollectionBinder';
const gridCfg = (baseUrl, columns, dependencies = [], ghost = [{ memberName: 'ID', defaultValue: '', type: 0 }]) => JSON.stringify({
    events: { onRowSave: null }, configuration: { title: '', baseUrl, allowRefresh: true },
    pageConfiguration: { paging: false, pageSize: 10 }, grouperPercentanceProperty: '', ignoreHierarchyOnFiltering: false,
    columns: columns.map(m => ({ allowResize: true, displayName: m, defaultValue: '', readonlyFunction: null, memberName: m, type: 0, visibility: true, extraData: null, prefix: '', hasFilter: false, validation: {} })),
    filters: [], sorters: [], ghostColumns: ghost, groupers: [], dependencies, operationButtons: [],
}, null, 2);

const MAILBOX_HTML = `<html><body><form><input name="__XSRF-AToken__" type="hidden" value="TOK+EN/=="></form>
<script>Ardita.controls.dataGrid('${LIST_ID}', ${gridCfg(LIST_URL, ['Title', 'ID', 'WorkflowStatus.Name'])});</script></body></html>`;

const T = 'taskdetail900001_aaaa_bbbb';
const ITEMS_ID = `${T}_prfx_grid1ff957f9-0eca`;
const ITEMS_URL = `/mailbox/?AjaxRequestWithApplication=DataGridOperation&AjaxControlID=${ITEMS_ID}&DataGridType=Ardita.Business.Collaboration.CustomDataCollectionBinder`;
const COM_ID = 'TaskComments_900001_aaaa_bbbb';
const COM_URL = `/mailbox/?AjaxRequestWithApplication=DataGridOperation&AjaxControlID=${COM_ID}&DataGridType=Ardita.Business.Collaboration.TaskCommentCollectionBinder`;
const DETAIL_HTML = `<div class="tab-container"><h3 class="mailbox-title">900001 - 123456 nolu iade onayı Müşteri: 55555 - ÖRNEK ECZANESI, KADIKOY, ISTANBUL ANADOLU</h3>
<div class="paragraph-text-area">BU İADEDE SOĞUK ZİNCİR ÜRÜNLER BULUNMAKTADIR!!</div>
<label for="${T}field7c66" class="control-label col-sm-12">İade Nedeni</label><div><input id="${T}field7c66" name="${T}field7c66" readonly value=" 4-Depo Personeli Hatası" data-property="@Model.RemoteInvoice.ReturnInvoiceReason" type="text" class="form-control" ><input id="${T}field7c66original" value="x" data-property="@Model.RemoteInvoice.ReturnInvoiceReason"></div>
<label for="${T}field1cef" class="control-label">Talep Tarihi</label><input id="${T}field1cef" readonly value="17.09.2026" disabled="true" data-property="@Model.RemoteInvoice.DATESENT" type="text">
<label for="${T}field564e" class="control-label">Genel Toplam</label><input id="${T}field564e" readonly value="1.887,13" data-property="@Model.RemoteInvoice.GROSSTOTAL" type="text">
<input id="${T}fieldf17c" readonly value="1" data-property="@Model.SogukZincir" type="text">
<script>
Ardita.controls.dataGrid('${ITEMS_ID}', ${gridCfg(ITEMS_URL, ['AHSube_ReturnInvoiceItemDetailList.NAMETUR', 'AHSube_ReturnInvoiceItemDetailList.BARCODE'], [{ title: null, value: 'enc+prop==', memberName: 'GridProperty', isActive: false, filterComprassion: 0 }])});
Ardita.controls.dataGrid('${COM_ID}', ${gridCfg(COM_URL, ['Comment'], [{ title: null, value: '900001', memberName: 'TaskID', isActive: false, filterComprassion: 0 }])});
Ardita.controls.dataGrid('AllTaskCommentsCB_900001_aaaa_bbbb', ${gridCfg(COM_URL, ['Comment'])});
</script></div>`;

const LIST_ROW = { ID: 900001, Title: '123456 nolu iade onayı Müşteri: 55555 - ÖRNEK ECZANESI, KADIKOY, ISTANBUL ANADOLU', 'DetailComment.Comment': 'Otomatik Oluşturuldu', DateCreatedBuity: '17.09.2026 10:39', 'Unit.Name': ' AH Depo> Satınalma', 'Workflow.Name': 'İade Akışı', 'WorkflowStatus.Name': 'Kalite Güvence Müdürü', 'CurrentStatus.ColorSet': 12 };
const ITEM_ROW = { 'AHSube_ReturnInvoiceItemDetailList.INVOICECOMMENT': 'Normal', 'AHSube_ReturnInvoiceItemDetailList.ITEMID': '145', 'AHSube_ReturnInvoiceItemDetailList.NAMETUR': 'ORNEK ILAC 2 MG 25 TB', 'AHSube_ReturnInvoiceItemDetailList.BARCODE': '8690000000001', 'AHSube_ReturnInvoiceItemDetailList.FORMATTEDRETURNEDITEMDATE': '02.09.2026', 'AHSube_ReturnInvoiceItemDetailList.FORMATTEDTOTALQUANTITY': '2 + 0', 'AHSube_ReturnInvoiceItemDetailList.TOTALQUANTITY': '2', 'AHSube_ReturnInvoiceItemDetailList.GROSSTOTAL': '1887,13', 'AHSube_ReturnInvoiceItemDetailList.FORMATTEDEXPIRYDATE': '01.2028', 'AHSube_ReturnInvoiceItemDetailList.STOCKINEXPIRYDATE': '2', 'AHSube_ReturnInvoiceItemDetailList.STOCKGUNSUMMARY': '60 => 120', 'AHSube_ReturnInvoiceItemDetailList.CLASSNAME': 'İlaç', 'AHSube_ReturnInvoiceItemDetailList.ISMUSTSHIPCOLD': 'Soğuk Zincir', 'AHSube_ReturnInvoiceItemDetailList.TRACKTYPE': 'ITS', ID: 0 };
const COMMENT_ROW = { ID: 4164000, Comment: 'Merhaba <BR> yanlış eczaneye bırakılmıştır.<br>ısı nem kaydı ektedir &amp; bilginize.', 'Employee.Name': 'Kişi, Örnek (A1)', DateCreatedBeauty: '17.09.2026 10:44', 'Attachments{FileName,Path}': [{ FileName: 'takip.xlsx', Path: '/Data/Collaboration/Task/900001/31246.xlsx' }], 'TaskAction.Action': 'Onayla', 'TaskAction.WorkflowStatus.Name': 'Operasyon Müdürü Onayı', MailMessageID: 0 };

function fakeFetch({ expired = false } = {}) {
    const calls = [];
    const res = (status, body, url, ct = 'text/html') => ({ status, ok: status < 400, url, text: async () => body, arrayBuffer: async () => new TextEncoder().encode(body).buffer, headers: { get: () => ct } });
    const fn = async (url, init = {}) => {
        calls.push({ url, init });
        if (expired) return res(200, '<form><div class="g-recaptcha"></div></form>', 'https://bex.test/Login?ReturnUrl=%2Fmailbox%2F');
        const body = init.body ? new URLSearchParams(init.body) : null;
        if (init.method === 'GET' && url.endsWith('/mailbox/')) return res(200, MAILBOX_HTML, url);
        if (url.includes('/Data/')) return res(200, 'PK\u0003\u0004xlsx', url, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        // Gerçek BexFlow: Referer olmadan detay yerine tam sayfa (hata) döner
        if (body && body.get('rowModel')) return (init.headers || {}).Referer ? res(200, DETAIL_HTML, url) : res(200, '<!DOCTYPE HTML><html>' + 'x'.repeat(4000) + '</html>', url);
        if (body && url.includes('CustomDataCollectionBinder')) return res(200, JSON.stringify({ data: [ITEM_ROW], totalRowsCount: 1 }), url);
        if (body && url.includes('TaskCommentCollectionBinder')) return res(200, JSON.stringify({ data: [COMMENT_ROW], totalRowsCount: 1 }), url);
        if (body && url.includes('TaskMailCollectionBinder')) return res(200, JSON.stringify({ data: [LIST_ROW], totalRowsCount: 1 }), url);
        return res(404, 'yok', url);
    };
    fn.calls = calls;
    return fn;
}

describe('bexflow-client — Ardita ayrıştırıcıları', () => {
    test('grid config dengeli parantezle çıkarılır, string içindeki süslü parantez bozmaz', () => {
        const html = `x Ardita.controls.dataGrid('g1', {"a":"{not}","b":{"c":[1,2]}}); y`;
        assert.deepEqual(B.findGridIds(html), ['g1']);
        assert.deepEqual(B.extractGridConfig(html, 'g1'), { a: '{not}', b: { c: [1, 2] } });
        assert.equal(B.extractGridConfig(html, 'yok'), null);
    });

    test('datagridDefinition: kolon/ghost/dependency alanları sunucunun beklediği şekle iner', () => {
        const cfg = B.extractGridConfig(DETAIL_HTML, ITEMS_ID);
        const def = B.buildDefinition(cfg, ITEMS_ID, -1);
        assert.equal(def.controlName, ITEMS_ID);
        assert.equal(def.pageSize, -1);
        assert.deepEqual(Object.keys(def.columns[0]), ['memberName', 'displayName', 'defaultValue', 'visibility', 'type', 'prefix']);
        assert.deepEqual(def.ghostColumns, [{ memberName: 'ID', defaultValue: '', type: 0 }]);
        assert.equal(def.dependencies[0].memberName, 'GridProperty');
        assert.equal(def.dependencies[0].value, 'enc+prop==');
    });

    test('XSRF token, form alanları (original kopyaları atlanır), uyarılar', () => {
        assert.equal(B.extractXsrfToken(MAILBOX_HTML), 'TOK+EN/==');
        const f = B.parseDetailFields(DETAIL_HTML);
        assert.deepEqual(f['RemoteInvoice.ReturnInvoiceReason'], { label: 'İade Nedeni', value: '4-Depo Personeli Hatası' });
        assert.equal(f['RemoteInvoice.GROSSTOTAL'].value, '1.887,13');
        assert.equal(f.SogukZincir.value, '1');
        assert.deepEqual(B.parseNotices(DETAIL_HTML), ['BU İADEDE SOĞUK ZİNCİR ÜRÜNLER BULUNMAKTADIR!!']);
    });

    test('başlık: iade no, müşteri kodu, eczane, ilçe, bölge', () => {
        assert.deepEqual(B.parseTitle(LIST_ROW.Title), { refNo: '123456', subject: 'iade onayı', customerCode: '55555', pharmacy: 'ÖRNEK ECZANESI', district: 'KADIKOY', region: 'ISTANBUL ANADOLU' });
        assert.equal(B.parseTitle('Serbest başlık').pharmacy, null);
    });

    test('tarih/sayı/kalem/not normalizasyonu', () => {
        assert.equal(B.trDateTimeToIso('17.09.2026 10:39'), '2026-09-17T10:39:00');
        assert.equal(B.trNumber('1.887,13'), 1887.13);
        const i = B.normalizeItem(ITEM_ROW);
        assert.equal(i.name, 'ORNEK ILAC 2 MG 25 TB');
        assert.equal(i.expiry, '01.2028');
        assert.equal(i.total, 1887.13);
        assert.equal(i.cold, true);
        const c = B.normalizeComment(COMMENT_ROW);
        assert.equal(c.text, 'Merhaba\nyanlış eczaneye bırakılmıştır.\nısı nem kaydı ektedir & bilginize.');
        assert.deepEqual(c.attachments, [{ fileName: 'takip.xlsx', path: '/Data/Collaboration/Task/900001/31246.xlsx' }]);
    });

    test('ek yolu yalnızca /Data/ altı; ../ ve dış adres reddedilir', () => {
        assert.equal(B.isSafeAttachmentPath('/Data/Collaboration/Task/1/2.xlsx'), true);
        assert.equal(B.isSafeAttachmentPath('/Data/../web.config'), false);
        assert.equal(B.isSafeAttachmentPath('https://evil/x'), false);
        assert.equal(B.isSafeAttachmentPath('/Login'), false);
    });
});

describe('bexflow-client — uçtan uca akış (sahte fetch)', () => {
    test('klasör → liste → detay (ürün + not + ek) → ek indirme', async () => {
        const f = fakeFetch();
        const c = B.createClient({ fetch: f, base: 'https://bex.test', delayMs: 0 });
        const ctx = await c.openFolder('');
        assert.equal(ctx.token, 'TOK+EN/==');
        const { tasks, total } = await c.listTasks(ctx);
        assert.equal(total, 1);
        assert.equal(tasks[0].id, 900001);
        assert.equal(tasks[0].pharmacy, 'ÖRNEK ECZANESI');

        const d = await c.getTaskDetail(ctx, tasks[0]);
        assert.equal(d.cold, true);
        assert.equal(d.items.length, 1);
        assert.equal(d.items[0].barcode, '8690000000001');
        assert.equal(d.comments.length, 1);                   // AllTaskComments kopyası atlanır
        assert.equal(d.comments[0].attachments[0].fileName, 'takip.xlsx');

        // Detay isteği: rowModel + showRowDetail + token
        const detailCall = f.calls.find(x => x.init.body && x.init.body.includes('rowModel'));
        const rm = JSON.parse(new URLSearchParams(detailCall.init.body).get('rowModel'));
        assert.equal(rm.action, 'showRowDetail');
        assert.ok(rm.data.some(x => x.memberName === 'ID' && x.value === 900001));
        assert.equal(new URLSearchParams(detailCall.init.body).get('__XSRF-AToken__'), 'TOK+EN/==');
        assert.equal(detailCall.init.headers.Referer, 'https://bex.test/mailbox/');
        // Yalnızca okuma: her POST ya grid yenilemesi (refreshData) ya da detay görüntüleme (showRowDetail)
        for (const x of f.calls.filter(x => x.init.method === 'POST')) {
            const p = new URLSearchParams(x.init.body);
            const ok = p.get('function') === 'refreshData' || JSON.parse(p.get('rowModel') || '{}').action === 'showRowDetail';
            assert.ok(ok, 'beklenmeyen POST: ' + x.url);
        }

        const dl = await c.downloadAttachment('/Data/Collaboration/Task/900001/31246.xlsx');
        assert.ok(dl.buffer.length > 0);
        await assert.rejects(() => c.downloadAttachment('/Data/../x'), /Geçersiz ek yolu/);
    });

    test('since: pencereden eski işler alınmaz, sonraki sayfa istenmez', async () => {
        const f = fakeFetch();
        const c = B.createClient({ fetch: f, base: 'https://bex.test', delayMs: 0 });
        const ctx = await c.openFolder('');
        assert.equal((await c.listTasks(ctx, { since: '2026-09-17' })).tasks.length, 1);
        const n = f.calls.length;
        assert.equal((await c.listTasks(ctx, { since: '2026-09-18' })).tasks.length, 0);
        assert.equal(f.calls.length - n, 1); // tek sayfa istendi
    });

    test('oturum düşmüşse (Login yönlendirmesi) SESSION_EXPIRED', async () => {
        const c = B.createClient({ fetch: fakeFetch({ expired: true }), base: 'https://bex.test', delayMs: 0 });
        await assert.rejects(() => c.openFolder(''), (e) => e.code === 'SESSION_EXPIRED');
        assert.equal(await c.ping(), false);
    });
});

describe('bexflow-classify — ısı kaydı mı?', () => {
    test('ad + not ipuçları', () => {
        const a = C.classifyByMeta({ fileName: 'takip.xlsx', commentText: 'yanlış bırakılan eczane ısı nem kaydı ektedir' });
        assert.equal(a.kategori, 'isi_kaydi');
        assert.equal(a.needsContent, true);
        assert.equal(C.classifyByMeta({ fileName: 'Testo_174T_rapor.pdf' }).kategori, 'isi_kaydi');
        assert.equal(C.classifyByMeta({ fileName: 'e-Fatura_2026.pdf' }).kategori, 'fatura_irsaliye');
        assert.equal(C.classifyByMeta({ fileName: 'yeni arnavutköy şifa.msg' }).kategori, 'yazisma');
        assert.equal(C.classifyByMeta({ fileName: 'IMG_2031.jpg' }).kategori, 'belirsiz'); // foto ısı çizelgesi de olabilir
        assert.equal(C.classifyByMeta({ fileName: 'urun fotografi.jpg' }).kategori, 'gorsel');
        assert.equal(C.classifyByMeta({ fileName: 'DOLAP 1 EYLÜL 2026.pdf' }).kategori, 'isi_kaydi');
        assert.equal(C.classifyByMeta({ fileName: 'Farmakit_Rapor_FR02_5386.pdf' }).kategori, 'isi_kaydi');
        assert.equal(C.classifyByMeta({ fileName: 'liste.xlsx' }).kategori, 'belirsiz');
        assert.equal(C.classifyByMeta({ fileName: 'arsiv.zip' }).kategori, 'diger');
    });

    test('içerik: düzenli zaman+sıcaklık serisi → ısı kaydı; seri yoksa ad ipucu tek başına yetmez', () => {
        const t0 = Date.UTC(2026, 8, 1);
        const rows = Array.from({ length: 48 }, (_, i) => ({ timestamp: new Date(t0 + i * 15 * 60000), temperature: 4 + (i % 5) * 0.3 }));
        const meta = C.classifyByMeta({ fileName: 'liste.xlsx' });
        const v = C.contentVerdict(meta, { parsedData: rows }, null);
        assert.equal(v.kategori, 'isi_kaydi');
        assert.ok(v.guven >= 0.9);
        assert.match(v.neden, /48 zaman\+sıcaklık kaydı, düzenli/);

        const named = C.classifyByMeta({ fileName: 'takip.xlsx', commentText: 'ısı kaydı' });
        assert.equal(C.contentVerdict(named, { parsedData: [] }, 'Sıcaklık sütunu bulunamadı').kategori, 'belirsiz');
        assert.equal(C.contentVerdict(C.classifyByMeta({ fileName: 'fatura.xlsx' }), null, 'x').kategori, 'fatura_irsaliye');
        assert.equal(C.contentVerdict(named, { parsedData: rows.slice(0, 4) }, null).kategori, 'belirsiz');
    });

    test('AI yanıtı: geçerli JSON ayrıştırılır, bilinmeyen kategori belirsiz olur', () => {
        assert.deepEqual(C.parseAiAnswer('```json\n{"kategori":"isi_kaydi","guven":0.88,"neden":"saatlik °C tablosu","elle_mi":true}\n```'),
            { kategori: 'isi_kaydi', guven: 0.88, neden: 'AI: saatlik °C tablosu (elle tutulmuş kayıt)', manual: true });
        assert.equal(C.parseAiAnswer('{"kategori":"uzay","guven":2}').kategori, 'belirsiz');
        assert.equal(C.parseAiAnswer('yanıt yok'), null);
    });
});

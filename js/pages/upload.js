/**
 * ColdChain AI — Upload Page
 */
const UploadPage = {
    render() {
        const page = document.getElementById('page-upload');
        page.innerHTML = `
        <div class="upload-header">
            <h2>Veri Yükleme</h2>
            <p>Sıcaklık kaydedici verilerinizi yükleyin. Excel, CSV, PDF ve görsel dosyaları desteklenir.</p>
        </div>

        <div class="card" style="margin-bottom:32px">
            <h3 class="card-title" style="margin-bottom:16px; border-bottom:1px solid var(--surface-border); padding-bottom:12px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-400)" stroke-width="2" style="margin-bottom:-4px; margin-right:6px;"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                İade & Finansal Detaylar (ERP)
            </h3>
            <div class="settings-form" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
                <div class="input-group">
                    <label class="input-label">İade Nedeni</label>
                    <select class="select-field" id="return-reason">
                        <option value="satis_iadesi">Satış İadesi</option>
                        <option value="soguk_zincir">Soğuk Zincir İhlali Şüphesi</option>
                        <option value="miad">Miad Yaklaşması / Geçmesi</option>
                        <option value="hasarli">Hasarlı Ürün (Fiziksel)</option>
                    </select>
                </div>
                <div class="input-group">
                    <label class="input-label">Barkod (GTIN)</label>
                    <input type="text" class="input-field" id="barcode" placeholder="ör: 8681308...">
                </div>
                <div class="input-group">
                    <label class="input-label">Miktar (Kutu Adedi)</label>
                    <input type="number" class="input-field" id="quantity" placeholder="ör: 10" min="1">
                </div>
                <div class="input-group">
                    <label class="input-label">Miad (SKT)</label>
                    <input type="month" class="input-field" id="expiration-date">
                </div>
                <div class="input-group">
                    <label class="input-label">Genel Toplam (₺)</label>
                    <input type="number" class="input-field" id="total-amount" placeholder="ör: 3500.50" step="0.01">
                </div>
            </div>
        </div>

        <div class="drop-zone-container">
            <div class="drop-zone" id="drop-zone" onclick="document.getElementById('file-input').click()">
                <div class="drop-zone-content">
                    <svg class="drop-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                    <h3 class="drop-zone-title">Dosyaları sürükleyip bırakın</h3>
                    <p class="drop-zone-subtitle">veya dosya seçmek için tıklayın</p>
                    <div class="drop-zone-formats">
                        <span class="format-chip">.xlsx</span>
                        <span class="format-chip">.csv</span>
                        <span class="format-chip">.pdf</span>
                        <span class="format-chip">.png/.jpg</span>
                    </div>
                </div>
                <input type="file" id="file-input" class="drop-zone-input" 
                    accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg" multiple>
            </div>
        </div>

        <div id="upload-queue" class="upload-queue"></div>

        <div id="upload-actions" class="analysis-actions" style="display:none; justify-content:center; gap:16px">
            <button class="btn btn-primary btn-lg" onclick="UploadPage.processFiles()" style="min-width:200px">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                Analizi Başlat
            </button>
        </div>

        <div class="upload-settings">
            <div class="card settings-section">
                <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
                Sıcaklık Ayarları</h3>
                <div class="settings-form">
                    <div class="input-group">
                        <label class="input-label">Sıcaklık Aralığı</label>
                        <select class="select-field" id="temp-range-select" onchange="UploadPage.onRangeChange()">
                            ${Object.entries(AppState.tempRanges).map(([k, v]) =>
            `<option value="${k}" ${k === 'cold_chain_standard' ? 'selected' : ''}>${v.label}</option>`
        ).join('')}
                        </select>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                        <div class="input-group">
                            <label class="input-label">Alt Limit (°C)</label>
                            <input type="number" class="input-field" id="lower-limit" value="2" step="0.5">
                        </div>
                        <div class="input-group">
                            <label class="input-label">Üst Limit (°C)</label>
                            <input type="number" class="input-field" id="upper-limit" value="8" step="0.5">
                        </div>
                    </div>
                    <div class="input-group">
                        <label class="input-label">TOR Limiti (dakika)</label>
                        <input type="number" class="input-field" id="tor-limit" value="120" step="10">
                    </div>
                </div>
            </div>
            <div class="card settings-section">
                <h3><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                İlaç Bilgileri</h3>
                <div class="settings-form">
                    <div class="input-group">
                        <label class="input-label">Eczane</label>
                        <input type="text" class="input-field" id="pharmacy-name" placeholder="ör: Merkez Eczanesi">
                    </div>
                    <div class="input-group" style="position: relative;">
                        <label class="input-label">İlaç Adı</label>
                        <input type="text" class="input-field" id="drug-name" placeholder="ör: İlaç adını yazmaya başlayın..." autocomplete="off">
                        <div id="drug-autocomplete-list" style="position:absolute; width:100%; max-height:220px; overflow-y:auto; background:var(--surface-1); border:1px solid var(--surface-border); border-radius:6px; z-index:100; box-shadow:0 8px 16px rgba(0,0,0,0.5); display:none; margin-top:2px;"></div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                        <div class="input-group">
                            <label class="input-label">Satın Alma Tarihi</label>
                            <input type="date" class="input-field" id="purchase-date">
                        </div>
                        <div class="input-group">
                            <label class="input-label">İade Talebi Tarihi</label>
                            <input type="date" class="input-field" id="return-date">
                        </div>
                    </div>
                    <div class="input-group">
                        <label class="input-label">Parti Numarası</label>
                        <input type="text" class="input-field" id="batch-number" placeholder="ör: BN23847">
                    </div>
                </div>
            </div>
        </div>`;

        this.initDropZone();
        this.initAutocomplete();
    },

    initAutocomplete() {
        const input = document.getElementById('drug-name');
        const list = document.getElementById('drug-autocomplete-list');
        if (!input || !list || typeof DrugFormulary === 'undefined') return;

        input.addEventListener('input', function () {
            const val = this.value.toUpperCase();
            list.innerHTML = '';
            if (!val) {
                list.style.display = 'none';
                return;
            }

            // Arama yap
            const matches = DrugFormulary.filter(d => d.name.toUpperCase().includes(val));

            if (matches.length > 0) {
                matches.forEach(item => {
                    const div = document.createElement('div');
                    div.style.cssText = 'padding:10px 14px; cursor:pointer; border-bottom:1px solid var(--surface-border); font-size:0.85rem; color:var(--text-secondary); transition:all 0.2s';

                    // Yazılan kısmı mavi/parlak renk yap (Highlight)
                    const regex = new RegExp(val, "gi");
                    const highlightedName = item.name.replace(regex, match => `<strong style="color:var(--color-primary-400); font-weight:700;">${match}</strong>`);

                    div.innerHTML = highlightedName;

                    div.addEventListener('mouseenter', () => div.style.background = 'var(--surface-2)');
                    div.addEventListener('mouseleave', () => div.style.background = 'transparent');

                    div.addEventListener('click', function () {
                        input.value = item.name;
                        list.style.display = 'none';
                    });
                    list.appendChild(div);
                });
                list.style.display = 'block';
            } else {
                list.style.display = 'none';
            }
        });

        // Kutunun dışına tıklanırsa listeyi gizle
        document.addEventListener('click', function (e) {
            if (e.target !== input && e.target !== list) {
                list.style.display = 'none';
            }
        });
    },

    initDropZone() {
        const dz = document.getElementById('drop-zone');
        const fi = document.getElementById('file-input');
        if (!dz || !fi) return;

        ['dragenter', 'dragover'].forEach(e => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.add('drag-over'); }));
        ['dragleave', 'drop'].forEach(e => dz.addEventListener(e, (ev) => { ev.preventDefault(); dz.classList.remove('drag-over'); }));

        dz.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) this.handleFiles(e.dataTransfer.files); });
        fi.addEventListener('change', (e) => { if (e.target.files.length) this.handleFiles(e.target.files); });
    },

    selectBrand(id) {
        AppState.selectedBrand = id;
        document.querySelectorAll('.brand-card').forEach(c => c.classList.remove('selected'));
        document.getElementById('brand-' + id)?.classList.add('selected');
        Utils.showToast(`${AppState.loggerBrands.find(b => b.id === id)?.name} seçildi`, 'info');
    },

    handleFiles(fileList) {
        // Kullanıcı sürükle-bırak veya tek tek dosya seçimi yaptığında
        // artık eski listeyi ve ekranı temizlemiyoruz (append özelliği)
        // Eğer önceden tamamlanmış bir analiz (currentAnalysis) varsa, 
        // kullanıcı "yeni bir işe" başlıyor demektir, o zaman temizleyebiliriz.
        if (fileList.length > 0 && AppState.currentAnalysis) {
            AppState.clearSession();
            const queueEl = document.getElementById('upload-queue');
            if (queueEl) queueEl.innerHTML = '';
            const log = document.getElementById('pipeline-log');
            if (log) log.remove();
        }

        const queue = document.getElementById('upload-queue');
        const actions = document.getElementById('upload-actions');

        Array.from(fileList).forEach(file => {
            const type = Utils.getFileType(file.name);
            const id = Utils.generateId();
            const isAI = type === 'image' || type === 'pdf' || type === 'txt';
            const method = isAI ? 'Smart Hybrid v2' : type.toUpperCase();
            const aiBadge = isAI ? '<span class="badge badge-gdp" style="background:rgba(139, 92, 246, 0.15);color:#a78bfa;font-size:0.6rem;margin-left:6px">🧠 Smart</span>' : '';

            AppState.uploadedFiles.push({ id, file, type, status: 'ready', method: isAI ? 'ai' : 'parser' });

            queue.innerHTML += `
            <div class="upload-item" id="upload-${id}">
                <div class="upload-item-icon ${type}">${Components.fileIcon(type)}</div>
                <div class="upload-item-info">
                    <div class="upload-item-name">${file.name}${aiBadge}</div>
                    <div class="upload-item-meta">${Utils.formatFileSize(file.size)} — ${method}</div>
                </div>
                <div class="upload-item-progress" id="progress-${id}">${Components.progressBar(0)}</div>
                <span class="upload-item-status" id="status-${id}">${isAI ? '🧠 Smart Bekliyor' : 'Hazır'}</span>
                <button class="btn btn-icon btn-ghost" onclick="UploadPage.removeFile('${id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>`;

            AuditTrail.logUpload(file.name, file.size, AppState.selectedBrand);
        });

        if (AppState.uploadedFiles.length > 0) actions.style.display = 'flex';
        Utils.showToast(`${fileList.length} dosya eklendi`, 'success');
    },

    removeFile(id) {
        AppState.uploadedFiles = AppState.uploadedFiles.filter(f => f.id !== id);
        document.getElementById('upload-' + id)?.remove();
        if (!AppState.uploadedFiles.length) document.getElementById('upload-actions').style.display = 'none';
    },

    onRangeChange() {
        const sel = document.getElementById('temp-range-select')?.value;
        const range = AppState.tempRanges[sel];
        if (range) {
            document.getElementById('lower-limit').value = range.min;
            document.getElementById('upper-limit').value = range.max;
        }
    },

    async processFiles() {
        if (!AppState.uploadedFiles.length) { Utils.showToast('Lütfen dosya yükleyin', 'warning'); return; }

        // Pipeline log alanı oluştur
        let logContainer = document.getElementById('pipeline-log');
        if (!logContainer) {
            const queue = document.getElementById('upload-queue');
            queue.insertAdjacentHTML('afterend', `
                <div class="card" id="pipeline-log" style="margin-top:16px">
                    <div class="card-header"><h3 class="card-title">✨ Yapay Zeka Belge Analiz Adımları</h3></div>
                    <div id="pipeline-steps" style="padding:0 16px 16px"></div>
                </div>`);
            logContainer = document.getElementById('pipeline-log');
        }
        const stepsEl = document.getElementById('pipeline-steps');
        stepsEl.innerHTML = `
            <div class="pipeline-loader" style="text-align:center; padding:32px 0">
                <div class="spinner" style="margin:0 auto 16px; width:40px; height:40px; border:3px solid var(--surface-border); border-top-color:var(--color-primary-500); border-radius:50%; animation:spin 1s linear infinite"></div>
                <div style="color:var(--text-secondary); font-size:0.9rem">Belgeler analiz ediliyor...</div>
                <div style="color:var(--text-tertiary); font-size:0.75rem; margin-top:4px">Yapay zeka verileri yapılandırıyor</div>
            </div>`;

        document.getElementById('upload-actions').style.display = 'none';

        // Asenkron olarak (paralel) tüm dosyaları işleme alalım
        await Promise.all(AppState.uploadedFiles.map(async (item) => {
            const statusEl = document.getElementById('status-' + item.id);
            const progressEl = document.getElementById('progress-' + item.id);
            const isAI = item.method === 'ai';

            if (statusEl) {
                statusEl.textContent = isAI ? '🧠 Smart Hybrid çalışıyor...' : 'İşleniyor...';
                statusEl.className = 'upload-item-status processing';
            }

            let virtualProgress = isAI ? 5 : 30;
            if (progressEl) progressEl.innerHTML = Components.progressBar(virtualProgress);

            let progressInterval;
            if (isAI) {
                // 20 saniyede yaklaşık %90'a ulaşması için her 200ms'de ~0.85 artır
                progressInterval = setInterval(() => {
                    if (virtualProgress < 90) {
                        virtualProgress += 0.85;
                        if (progressEl) progressEl.innerHTML = Components.progressBar(virtualProgress);
                    }
                }, 200);
            }

            try {
                // onProgress callback ekle
                const result = await DataParser.parse(item.file, AppState.selectedBrand, {
                    resampling: false,
                    onProgress: (p) => {
                        virtualProgress = Math.max(virtualProgress, p);
                        if (progressEl) progressEl.innerHTML = Components.progressBar(virtualProgress);
                    }
                });

                if (progressInterval) clearInterval(progressInterval);
                item.parsedResult = result;
                item.status = 'complete';

                const timeInfo = result.metadata?.processingTimeMs
                    ? ` (${(result.metadata.processingTimeMs / 1000).toFixed(1)}s)` : '';
                if (statusEl) { statusEl.textContent = `${result.rowCount} kayıt${timeInfo}`; statusEl.className = 'upload-item-status complete'; }
                if (progressEl) progressEl.innerHTML = Components.progressBar(100);

                // Pipeline logunu göster
                if (result.pipeline) {
                    const logsHtml = result.pipeline.map(s => {
                        // AI Vision formatı: { step, status, detail, icon }
                        // Klasik parser formatı: { step, message }
                        const icon = s.icon || { column_detection: '🔍', metadata_extraction: '📎', parsing: '⚙️', sorting: '📊', deduplication: '🧹', validation: '✅', summary: '📈', fallback: '⚠️' }[s.step] || '•';
                        const text = s.detail || s.message || s.step;
                        const statusColor = s.status === 'error' ? 'var(--color-danger-400)' :
                            s.status === 'warning' ? 'var(--color-warning-400)' :
                                s.status === 'success' ? 'var(--color-success-400)' : 'var(--text-secondary)';
                        return `<div class="pipeline-step" style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid var(--surface-border);font-size:0.82rem">
                            <span style="flex-shrink:0">${icon}</span>
                            <span style="color:${statusColor}">[${item.file.name}] ${text}</span>
                        </div>`;
                    }).join('');
                    stepsEl.insertAdjacentHTML('beforeend', logsHtml);
                }

                // Meta verileri otomatik doldur
                if (result.metadata) {
                    const m = result.metadata;
                    if (m.pharmacyName) {
                        const el = document.getElementById('pharmacy-name');
                        if (el && !el.value) el.value = m.pharmacyName;
                    }
                    if (m.drugName) {
                        const el = document.getElementById('drug-name');
                        if (el && !el.value) el.value = m.drugName;
                    }
                    if (m.deviceSerial) {
                        const el = document.getElementById('batch-number');
                        if (el && !el.value) el.value = m.deviceSerial;
                    }
                }

                AuditTrail.logParsing(item.file.name, result.rowCount, AppState.selectedBrand || 'Otomatik');
            } catch (err) {
                if (progressInterval) clearInterval(progressInterval);
                item.status = 'error';
                if (statusEl) { statusEl.textContent = 'Hata'; statusEl.className = 'upload-item-status error'; }
                stepsEl.insertAdjacentHTML('beforeend', `<div class="pipeline-step" style="color:var(--color-danger-400);padding:8px 0;font-size:0.82rem">❌ [${item.file.name}]: ${err.message}</div>`);
                Utils.showToast(`${item.file.name}: ${err.message}`, 'error');
            }
        }));

        const loader = document.querySelector('.pipeline-loader');
        if (loader) loader.remove();

        const successFiles = AppState.uploadedFiles.filter(f => f.status === 'complete');
        if (successFiles.length === 0) {
            document.getElementById('upload-actions').style.display = 'flex';
        } else {
            let allData = [];
            successFiles.forEach(f => { if (f.parsedResult?.parsedData) allData = allData.concat(f.parsedResult.parsedData); });
            // Kronolojik sıralama
            allData.sort((a, b) => a.timestamp - b.timestamp);

            // Eğer birden fazla dosya yüklendiyse, kesişimlerde tekrar eden kayıtlar olabilir (deduplikasyon)
            if (successFiles.length > 1) {
                const seen = new Set();
                allData = allData.filter(d => {
                    const key = d.timestamp.getTime() + '_' + d.temperature;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            }

            AppState.parsedData = allData;

            const config = {
                lowerLimit: parseFloat(document.getElementById('lower-limit')?.value || 2),
                upperLimit: parseFloat(document.getElementById('upper-limit')?.value || 8),
                torLimit: parseFloat(document.getElementById('tor-limit')?.value || 120)
            };

            // Raw validation bilgisini pass et (ham veri üzerinden hesaplanan gap'ler daha doğrudur)
            const rawValidation = successFiles.length === 1 ? successFiles[0].parsedResult.metadata.validation : null;
            const analysis = MKTEngine.fullAnalysis(allData, config, rawValidation);

            // Tarih aralığını analiz nesnesine ekle (Karar motoru kontrol edebilsin)
            analysis.userRange = {
                purchase: document.getElementById('purchase-date')?.value,
                return: document.getElementById('return-date')?.value
            };

            // Anti-Fraud işlemleri için dosya metadatasını geçir
            if (successFiles.length > 0 && successFiles[0].parsedResult && successFiles[0].parsedResult.metadata) {
                analysis.metadata = successFiles[0].parsedResult.metadata;
            }

            // Dedup için birincil dosyanın SHA-256 hash'ini hesapla ve backend'e
            // sorarak aynı cihaz seri no'sunun farklı bir dosya ile daha önce
            // yüklenip yüklenmediğini öğren. Hata olursa accept ile devam et
            // (offline / backend yok ise blocker olmasın).
            const deviceSerial = analysis.metadata?.deviceSerial;
            let primaryFileHash = null;
            if (deviceSerial && successFiles[0]?.file) {
                try {
                    const buf = await successFiles[0].file.arrayBuffer();
                    primaryFileHash = await Utils.sha256OfBytes(buf);
                    const resp = await fetch(
                        `/api/device-serial/check?serial=${encodeURIComponent(deviceSerial)}&fileHash=${primaryFileHash}`
                    );
                    const json = await resp.json();
                    if (json.success) {
                        analysis.metadata.dedupResult = {
                            isDuplicate: json.isDuplicate,
                            previousOccurrences: json.previousOccurrences || []
                        };
                    }
                } catch (e) {
                    console.warn('Device serial dedup kontrolü başarısız:', e.message);
                }
            }

            const decision = DecisionEngine.evaluate(analysis);

            // Kararı bekleme, her analizde kaydet (mukerrer tespit için iz)
            if (deviceSerial && primaryFileHash) {
                fetch('/api/device-serial', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        serial: deviceSerial,
                        pharmacy: document.getElementById('pharmacy-name')?.value || '',
                        fileHash: primaryFileHash,
                        analysisId: null
                    })
                }).catch(e => console.warn('Device serial kayıt başarısız:', e.message));
            }

            AppState.currentAnalysis = {
                ...analysis, decision,
                drugName: document.getElementById('drug-name')?.value || 'Belirtilmemiş',
                batchNumber: document.getElementById('batch-number')?.value || 'Belirtilmemiş',
                pharmacy: document.getElementById('pharmacy-name')?.value || 'Belirtilmemiş',
                purchaseDate: document.getElementById('purchase-date')?.value,
                returnDate: document.getElementById('return-date')?.value,
                returnReason: document.getElementById('return-reason')?.value || 'Belirtilmemiş',
                barcode: document.getElementById('barcode')?.value || 'Belirtilmemiş',
                quantity: document.getElementById('quantity')?.value || '0',
                expirationDate: document.getElementById('expiration-date')?.value || 'Belirtilmemiş',
                totalAmount: document.getElementById('total-amount')?.value || '0',
                files: successFiles.map(f => f.file.name), date: new Date()
            };

            AuditTrail.logMKTCalculation(analysis.mkt.mkt, analysis.dataPoints);
            AuditTrail.logDecision(decision.decision, decision.reasons);

            // Pipeline'a sonuç ekle
            stepsEl.innerHTML += `
                <div class="pipeline-step" style="padding:12px 0;font-size:0.82rem;border-top:2px solid var(--color-primary-500);margin-top:8px">
                    🎯 <strong>Sonuç:</strong> ${allData.length} kayıt → MKT: ${analysis.mkt.mkt}°C → Karar: <span class="badge-status badge-${decision.decision}">${decision.decision === 'accept' ? 'KABUL' : decision.decision === 'reject' ? 'RED' : 'ŞARTLI'}</span>
                </div>`;

            Utils.showToast('Analiz tamamlandı! Sonuçlara yönlendiriliyorsunuz...', 'success');
            setTimeout(() => App.navigate('analysis'), 2500);
        }
    }
};

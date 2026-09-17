// ITX PDT Mobile Barcode Scanner Core Engine with Manual QTY
(function () {
  'use strict';

  // --- Audio Synthesizer for PDT BEEP ---
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playBeepSuccess() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, ctx.currentTime);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) {}
    if (navigator.vibrate) {
      try { navigator.vibrate(60); } catch (e) {}
    }
  }

  function playBeepError() {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) {}
    if (navigator.vibrate) {
      try { navigator.vibrate([100, 50, 100]); } catch (e) {}
    }
  }

  // --- Timestamp Formatter: MM/DD/YYYY H:MM:SS AM/PM ---
  function formatScanTimestamp(d = new Date()) {
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    let hours = d.getHours();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    return `${mm}/${dd}/${yyyy} ${hours}:${mins}:${secs} ${ampm}`;
  }

  function formatYYYYMMDD(dateStr) {
    if (!dateStr) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      return `${y}${m}${d}`;
    }
    return dateStr.replace(/[^0-9]/g, '').slice(0, 8);
  }

  // --- State & Storage ---
  const STORAGE_KEY = 'ITX_PDT_BTI_SESSION_V2';
  let database = { items: {}, lokasi: [] };

  let state = {
    tanggal: '',
    lokasiAsal: '55414',
    lokasiTujuan: '55036',
    noPack: 'AA/168',
    resetQtyAfterScan: true,
    autoAdd: true,
    items: [],
    activePendingItem: null
  };

  // --- DOM Elements ---
  const elDate = document.getElementById('inputDate');
  const elLokAsal = document.getElementById('inputLokAsal');
  const elLokTujuan = document.getElementById('inputLokTujuan');
  const badgeLokAsal = document.getElementById('badgeLokAsal');
  const badgeLokTujuan = document.getElementById('badgeLokTujuan');
  const suggestLokAsal = document.getElementById('suggestLokAsal');
  const suggestLokTujuan = document.getElementById('suggestLokTujuan');
  const elNoPack = document.getElementById('inputNoPack');
  
  // Dedicated Manual QTY Inputs
  const elMainQty = document.getElementById('inputMainQty');
  const elBtnQtyTouchMinus = document.getElementById('btnQtyTouchMinus');
  const elBtnQtyTouchPlus = document.getElementById('btnQtyTouchPlus');
  const elCheckResetQty = document.getElementById('checkResetQty');

  const elScanInput = document.getElementById('inputScanCode');
  const elBtnManualSubmit = document.getElementById('btnManualSubmit');
  const elAutoAdd = document.getElementById('checkAutoAdd');
  const elSuggestBox = document.getElementById('suggestBox');
  const elLiveCard = document.getElementById('liveItemCard');
  const elLiveIcon = document.getElementById('liveItemIcon');
  const elLiveName = document.getElementById('liveItemName');
  const elLiveMeta = document.getElementById('liveItemMeta');

  const elPreview = document.getElementById('itemPreview');
  const elPreviewName = document.getElementById('previewItemName');
  const elPreviewMeta = document.getElementById('previewItemMeta');
  const elPreviewQty = document.getElementById('previewQty');
  const elBtnAdd = document.getElementById('btnAddItem');
  const elBtnStepMinus = document.getElementById('btnStepMinus');
  const elBtnStepPlus = document.getElementById('btnStepPlus');

  const elTotalLines = document.getElementById('totalLines');
  const elTotalQty = document.getElementById('totalQty');
  const elActivePack = document.getElementById('activePackDisplay');
  const elItemList = document.getElementById('scannedItemList');
  const elEmptyState = document.getElementById('emptyState');

  const elModalPreview = document.getElementById('modalPreview');
  const elTxtPreview = document.getElementById('txtPreviewArea');
  const elModalCam = document.getElementById('modalCam');

  let html5QrCode = null;

  // --- Toast ---
  function showToast(msg, isErr = false) {
    let t = document.querySelector('.toast');
    if (!t) {
      t = document.createElement('div');
      t.className = 'toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.background = isErr ? '#dc2626' : '#0f172a';
    t.classList.add('show');
    setTimeout(() => { t.classList.remove('show'); }, 2000);
  }

  // --- Load Master DB ---
  function initDatabase() {
    if (window.PDT_DATABASE && window.PDT_DATABASE.items) {
      database = window.PDT_DATABASE;
      populateLocationDropdowns();
    } else {
      fetch('pdt_data.json')
        .then(res => res.json())
        .then(data => {
          database = data;
          populateLocationDropdowns();
        })
        .catch(err => {
          showToast('Database master.dbf tidak termuat!', true);
        });
    }
  }

  // Lookup location by code or abbreviation
  function findLocation(query) {
    if (!query || !database.lokasi) return null;
    const q = query.trim().toUpperCase();
    for (let i = 0; i < database.lokasi.length; i++) {
      const lok = database.lokasi[i];
      if (lok.c === q || (lok.s && lok.s.toUpperCase() === q)) {
        return lok;
      }
    }
    return null;
  }

  function searchLocations(query) {
    if (!query || !database.lokasi) return [];
    const q = query.trim().toUpperCase();
    const results = [];
    for (let i = 0; i < database.lokasi.length; i++) {
      const lok = database.lokasi[i];
      if (lok.c.includes(q) || lok.n.toUpperCase().includes(q) || (lok.s && lok.s.toUpperCase().includes(q))) {
        results.push(lok);
        if (results.length >= 8) break;
      }
    }
    return results;
  }

  function updateLocationBadges() {
    // Asal
    const lokAsalObj = findLocation(state.lokasiAsal);
    if (lokAsalObj) {
      badgeLokAsal.textContent = `🏬 ${lokAsalObj.c} - ${lokAsalObj.n} (${lokAsalObj.s})`;
      badgeLokAsal.className = 'lokasi-verified-badge';
    } else {
      badgeLokAsal.textContent = `📍 Kode Toko Asal: ${state.lokasiAsal || '-'}`;
      badgeLokAsal.className = 'lokasi-verified-badge unknown';
    }

    // Tujuan
    const lokTujuanObj = findLocation(state.lokasiTujuan);
    if (lokTujuanObj) {
      badgeLokTujuan.textContent = `🏬 ${lokTujuanObj.c} - ${lokTujuanObj.n} (${lokTujuanObj.s})`;
      badgeLokTujuan.className = 'lokasi-verified-badge';
    } else {
      badgeLokTujuan.textContent = `📍 Kode Toko Tujuan: ${state.lokasiTujuan || '-'}`;
      badgeLokTujuan.className = 'lokasi-verified-badge unknown';
    }
  }

  function populateLocationDropdowns() {
    elLokAsal.value = state.lokasiAsal;
    elLokTujuan.value = state.lokasiTujuan;
    updateLocationBadges();
  }

  // --- Save / Load Session ---
  function saveSession() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tanggal: state.tanggal,
        lokasiAsal: state.lokasiAsal,
        lokasiTujuan: state.lokasiTujuan,
        noPack: state.noPack,
        resetQtyAfterScan: state.resetQtyAfterScan,
        autoAdd: state.autoAdd,
        items: state.items
      }));
    } catch (e) {}
  }

  function loadSession() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const obj = JSON.parse(saved);
        if (obj.tanggal) state.tanggal = obj.tanggal;
        if (obj.lokasiAsal) state.lokasiAsal = obj.lokasiAsal;
        if (obj.lokasiTujuan) state.lokasiTujuan = obj.lokasiTujuan;
        if (obj.noPack) state.noPack = obj.noPack;
        if (typeof obj.resetQtyAfterScan === 'boolean') state.resetQtyAfterScan = obj.resetQtyAfterScan;
        if (typeof obj.autoAdd === 'boolean') state.autoAdd = obj.autoAdd;
        if (Array.isArray(obj.items)) state.items = obj.items;
      }
    } catch (e) {}

    if (!state.tanggal) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const d = String(now.getDate()).padStart(2, '0');
      state.tanggal = `${y}-${m}-${d}`;
    }

    elDate.value = state.tanggal;
    elNoPack.value = state.noPack;
    elCheckResetQty.checked = state.resetQtyAfterScan;
    elAutoAdd.checked = state.autoAdd;
    
    // Always restore location inputs and badges
    if (elLokAsal) elLokAsal.value = state.lokasiAsal || '55414';
    if (elLokTujuan) elLokTujuan.value = state.lokasiTujuan || '55036';
    updateLocationBadges();
    
    renderUI();
  }

  // --- Render Scanned List & Stats ---
  function renderUI() {
    elActivePack.textContent = state.noPack || '-';
    elTotalLines.textContent = state.items.length;

    const sumQty = state.items.reduce((acc, it) => acc + (parseFloat(it.qty) || 0), 0);
    elTotalQty.textContent = sumQty.toFixed(2);

    const elBannerSusulan = document.getElementById('bannerSusulan');
    const elBannerText = document.getElementById('bannerSusulanText');
    if (elBannerSusulan) {
      const cntDl = state.items.filter(it => it.downloaded).length;
      const cntNew = state.items.filter(it => !it.downloaded).length;
      if (cntDl > 0 && cntNew > 0) {
        elBannerText.textContent = `${cntDl} barang sudah diunduh sebelumnya, ${cntNew} barang baru (dus susulan).`;
        elBannerSusulan.style.display = 'flex';
      } else {
        elBannerSusulan.style.display = 'none';
      }
    }

    if (state.items.length === 0) {
      elEmptyState.style.display = 'block';
      elItemList.innerHTML = '';
      return;
    }

    elEmptyState.style.display = 'none';

    let html = '';
    for (let i = state.items.length - 1; i >= 0; i--) {
      const item = state.items[i];
      html += `
        <div class="item-card ${item.downloaded ? 'is-downloaded' : ''}" data-idx="${i}">
          <div class="item-card-left">
            <span class="item-badge-seq">#${item.seq}</span>
            <div class="item-info">
              <div class="item-title">${escapeHtml(item.name)}</div>
              <div class="item-sub">
                <span class="badge-pack-tag">📦 ${escapeHtml(item.pack)}</span>
                <span>PLU: <strong>${escapeHtml(item.plu)}</strong></span>
                <span>⏱️ ${escapeHtml(item.time)}</span>
                ${item.downloaded ? '<span class="badge-dl-status downloaded">✅ Diunduh</span>' : '<span class="badge-dl-status new">✨ Baru</span>'}
              </div>
            </div>
          </div>
          <div class="item-card-right">
            <span class="item-qty-tag clickable" title="Klik untuk Ubah QTY" onclick="window.ITX_PDT.editQty(${i})">
              ${parseFloat(item.qty).toFixed(2)}
            </span>
            <button class="btn-card-del" title="Hapus Baris" onclick="window.ITX_PDT.deleteItem(${i})">✕</button>
          </div>
        </div>
      `;
    }
    elItemList.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- Real-time Live Item Preview as user types/scans ---
  function updateLiveItemPreview(code) {
    if (!elLiveCard) return null;
    const rawVal = (code || '').trim();
    if (!rawVal) {
      elLiveCard.className = 'live-item-card';
      elLiveIcon.textContent = '📦';
      elLiveName.textContent = 'Nama barang akan otomatis muncul di sini...';
      elLiveMeta.textContent = 'Ketik atau scan nomor PLU / barcode barang di atas';
      return null;
    }

    const found = lookupItem(rawVal);
    if (found) {
      elLiveCard.className = 'live-item-card found';
      elLiveIcon.textContent = '✅';
      elLiveName.textContent = found.name;
      elLiveMeta.textContent = `PLU: ${found.plu} (Terdaftar di master.dbf)`;
      return found;
    } else if (rawVal.length >= 3) {
      elLiveCard.className = 'live-item-card not-found';
      elLiveIcon.textContent = '⚠️';
      elLiveName.textContent = `[PLU: ${rawVal}] Belum terdaftar di master.dbf`;
      elLiveMeta.textContent = 'Akan dicatat sebagai item manual jika ditambahkan';
      return null;
    } else {
      elLiveCard.className = 'live-item-card';
      elLiveIcon.textContent = '🔍';
      elLiveName.textContent = `Mencari kode '${rawVal}'...`;
      elLiveMeta.textContent = 'Lanjutkan mengetik nomor PLU atau nama barang';
      return null;
    }
  }

  // --- Lookup Item ---
  function lookupItem(code) {
    if (!code) return null;
    const cleanCode = code.trim().toUpperCase();
    
    if (database.items[cleanCode]) {
      return { plu: cleanCode, name: database.items[cleanCode] };
    }

    if (/^\d+$/.test(cleanCode)) {
      const padded = cleanCode.padStart(7, '0');
      if (database.items[padded]) {
        return { plu: padded, name: database.items[padded] };
      }
      const unpadded = cleanCode.replace(/^0+/, '');
      for (let k in database.items) {
        if (k.replace(/^0+/, '') === unpadded) {
          return { plu: k, name: database.items[k] };
        }
      }
    }

    return null;
  }

  // --- Add Item to Session ---
  function addItemToSession(plu, name, qty) {
    const nextSeq = state.items.length + 1;
    const nowTime = formatScanTimestamp(new Date());
    const pack = state.noPack.trim().toUpperCase() || 'AA/001';
    const finalQty = parseFloat(qty) || 1.0;

    state.items.push({
      seq: nextSeq,
      pack: pack,
      plu: plu,
      name: name,
      qty: finalQty,
      time: nowTime
    });

    saveSession();
    renderUI();
    playBeepSuccess();
    showToast(`[+${finalQty} pcs] ${name.slice(0, 22)}...`);

    // Flash success on live card
    if (elLiveCard) {
      elLiveCard.className = 'live-item-card found';
      elLiveIcon.textContent = '✅';
      elLiveName.textContent = `Berhasil Ditambahkan (+${finalQty}): ${name}`;
      elLiveMeta.textContent = `PLU: ${plu} | Total Qty: ${finalQty} pcs | Pack: ${pack}`;
    }

    // Reset input barcode
    elScanInput.value = '';
    
    // Check if user requested QTY to reset back to 1
    if (state.resetQtyAfterScan) {
      elMainQty.value = '1';
    }

    elScanInput.focus();
    hidePreview();
  }

  function showPreview(plu, name, qty) {
    state.activePendingItem = { plu, name };
    elPreviewName.textContent = name;
    elPreviewMeta.textContent = `PLU: ${plu} | Pack: ${state.noPack}`;
    elPreviewQty.value = parseFloat(qty) || 1;
    elPreview.classList.add('active');
    elBtnAdd.focus();
  }

  function hidePreview() {
    state.activePendingItem = null;
    elPreview.classList.remove('active');
  }

  // --- Handle Scan / Submit ---
  function handleScanInput() {
    const rawVal = elScanInput.value.trim();
    elSuggestBox.style.display = 'none';

    if (!rawVal) {
      showToast('Ketik atau scan barcode / PLU terlebih dahulu!', true);
      elScanInput.focus();
      return;
    }

    const currentQty = parseFloat(elMainQty.value) || 1.0;

    const found = lookupItem(rawVal);
    if (found) {
      if (state.autoAdd) {
        addItemToSession(found.plu, found.name, currentQty);
      } else {
        showPreview(found.plu, found.name, currentQty);
        playBeepSuccess();
      }
    } else {
      playBeepError();
      showToast(`PLU / Kode '${rawVal}' tidak ditemukan di master.dbf!`, true);
      showPreview(rawVal, `[ITEM TIDAK DIKENAL ${rawVal}]`, currentQty);
    }
  }

  // --- Autocomplete search as user types & Live Item Preview ---
  elScanInput.addEventListener('input', function () {
    const q = elScanInput.value.trim().toUpperCase();
    updateLiveItemPreview(q);
    if (q.length < 2) {
      elSuggestBox.style.display = 'none';
      return;
    }

    const matches = [];
    for (let plu in database.items) {
      const name = database.items[plu];
      if (plu.includes(q) || name.toUpperCase().includes(q)) {
        matches.push({ plu, name });
        if (matches.length >= 10) break;
      }
    }

    if (matches.length > 0) {
      let html = '';
      matches.forEach(m => {
        html += `
          <div class="suggest-item" data-plu="${m.plu}" data-name="${escapeHtml(m.name)}">
            <span class="suggest-plu">${m.plu}</span> - <span class="suggest-name">${escapeHtml(m.name)}</span>
          </div>
        `;
      });
      elSuggestBox.innerHTML = html;
      elSuggestBox.style.display = 'block';
    } else {
      elSuggestBox.style.display = 'none';
    }
  });

  elSuggestBox.addEventListener('click', function (e) {
    const item = e.target.closest('.suggest-item');
    if (!item) return;
    const plu = item.getAttribute('data-plu');
    const name = item.getAttribute('data-name');
    elSuggestBox.style.display = 'none';
    
    const currentQty = parseFloat(elMainQty.value) || 1.0;
    elScanInput.value = plu;
    updateLiveItemPreview(plu);
    if (state.autoAdd) {
      addItemToSession(plu, name, currentQty);
    } else {
      showPreview(plu, name, currentQty);
    }
  });

  // Enter key on scan input
  elScanInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleScanInput();
    }
  });

  // Enter key on QTY input switches focus to scan input
  elMainQty.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      elScanInput.focus();
      elScanInput.select();
    }
  });

  // Submit button
  elBtnManualSubmit.addEventListener('click', handleScanInput);

  // Quick QTY buttons (+ and -)
  elBtnQtyTouchMinus.addEventListener('click', function () {
    let q = parseFloat(elMainQty.value) || 1;
    if (q > 1) {
      elMainQty.value = q - 1;
    }
  });

  elBtnQtyTouchPlus.addEventListener('click', function () {
    let q = parseFloat(elMainQty.value) || 0;
    elMainQty.value = q + 1;
  });

  // Quick QTY chips
  document.querySelectorAll('.qty-chip').forEach(chip => {
    chip.addEventListener('click', function () {
      const q = this.getAttribute('data-qty');
      elMainQty.value = q;
      showToast(`QTY diset ke: ${q}`);
      elScanInput.focus();
    });
  });

  // --- Preview Add Button ---
  elBtnAdd.addEventListener('click', function () {
    if (!state.activePendingItem) return;
    const qty = parseFloat(elPreviewQty.value) || 1.0;
    addItemToSession(state.activePendingItem.plu, state.activePendingItem.name, qty);
  });

  elBtnStepMinus.addEventListener('click', function () {
    let q = parseFloat(elPreviewQty.value) || 1;
    if (q > 1) elPreviewQty.value = q - 1;
  });

  elBtnStepPlus.addEventListener('click', function () {
    let q = parseFloat(elPreviewQty.value) || 1;
    elPreviewQty.value = q + 1;
  });

  // --- Change No Pack ---
  elNoPack.addEventListener('change', function () {
    state.noPack = elNoPack.value.trim().toUpperCase() || 'AA/001';
    saveSession();
    renderUI();
  });

  document.getElementById('btnNewPack').addEventListener('click', function () {
    const current = state.noPack.trim();
    let nextPack = prompt('Masukkan Nomor Pack / Dus Baru:', current);
    if (nextPack && nextPack.trim()) {
      state.noPack = nextPack.trim().toUpperCase();
      elNoPack.value = state.noPack;
      saveSession();
      renderUI();
      showToast(`Pack aktif diubah ke: ${state.noPack}`);
      elScanInput.focus();
    }
  });

  elDate.addEventListener('change', function () {
    state.tanggal = elDate.value;
    saveSession();
  });

  // Handle manual typing in Lokasi Asal
  elLokAsal.addEventListener('input', function () {
    const q = elLokAsal.value.trim().toUpperCase();
    state.lokasiAsal = q;
    saveSession();
    updateLocationBadges();

    if (q.length >= 1) {
      const matches = searchLocations(q);
      if (matches.length > 0) {
        let html = '';
        matches.forEach(m => {
          html += `
            <div class="suggest-item" data-code="${m.c}" data-name="${escapeHtml(m.n)}" data-singkat="${escapeHtml(m.s)}">
              <span class="suggest-plu">${m.c}</span> - <span class="suggest-name">${escapeHtml(m.n)} (${escapeHtml(m.s)})</span>
            </div>
          `;
        });
        suggestLokAsal.innerHTML = html;
        suggestLokAsal.style.display = 'block';
      } else {
        suggestLokAsal.style.display = 'none';
      }
    } else {
      suggestLokAsal.style.display = 'none';
    }
  });

  suggestLokAsal.addEventListener('click', function (e) {
    const it = e.target.closest('.suggest-item');
    if (!it) return;
    const code = it.getAttribute('data-code');
    elLokAsal.value = code;
    state.lokasiAsal = code;
    saveSession();
    updateLocationBadges();
    suggestLokAsal.style.display = 'none';
  });

  // Handle manual typing in Lokasi Tujuan
  elLokTujuan.addEventListener('input', function () {
    const q = elLokTujuan.value.trim().toUpperCase();
    state.lokasiTujuan = q;
    saveSession();
    updateLocationBadges();

    if (q.length >= 1) {
      const matches = searchLocations(q);
      if (matches.length > 0) {
        let html = '';
        matches.forEach(m => {
          html += `
            <div class="suggest-item" data-code="${m.c}" data-name="${escapeHtml(m.n)}" data-singkat="${escapeHtml(m.s)}">
              <span class="suggest-plu">${m.c}</span> - <span class="suggest-name">${escapeHtml(m.n)} (${escapeHtml(m.s)})</span>
            </div>
          `;
        });
        suggestLokTujuan.innerHTML = html;
        suggestLokTujuan.style.display = 'block';
      } else {
        suggestLokTujuan.style.display = 'none';
      }
    } else {
      suggestLokTujuan.style.display = 'none';
    }
  });

  suggestLokTujuan.addEventListener('click', function (e) {
    const it = e.target.closest('.suggest-item');
    if (!it) return;
    const code = it.getAttribute('data-code');
    elLokTujuan.value = code;
    state.lokasiTujuan = code;
    saveSession();
    updateLocationBadges();
    suggestLokTujuan.style.display = 'none';
  });

  // Hide suggest boxes when clicking outside
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#suggestLokAsal') && e.target !== elLokAsal) {
      suggestLokAsal.style.display = 'none';
    }
    if (!e.target.closest('#suggestLokTujuan') && e.target !== elLokTujuan) {
      suggestLokTujuan.style.display = 'none';
    }
  });

  elCheckResetQty.addEventListener('change', function () {
    state.resetQtyAfterScan = elCheckResetQty.checked;
    saveSession();
  });

  elAutoAdd.addEventListener('change', function () {
    state.autoAdd = elAutoAdd.checked;
    saveSession();
  });

  // --- Generate TXT Content (Strict BTI format) ---
  function generateBtiTxt() {
    const tglStr = formatYYYYMMDD(state.tanggal);
    const asal = (state.lokasiAsal || '').padStart(5, '0');
    const tujuan = (state.lokasiTujuan || '').padStart(5, '0');

    let lines = [];
    state.items.forEach(it => {
      const seq = it.seq;
      const pack = it.pack || 'AA/001';
      const plu = it.plu;
      const qtyStr = (parseFloat(it.qty) || 0).toFixed(2);
      const timeStr = it.time;
      const nameStr = it.name;

      const row = `${tglStr}|${asal}|${tujuan}|${pack}|${seq}|||${plu}|${qtyStr}| |${timeStr}|${nameStr}`;
      lines.push(row);
    });

    return lines.join('\r\n') + (lines.length > 0 ? '\r\n' : '');
  }

  function getBtiFilename() {
    const tglStr = formatYYYYMMDD(state.tanggal);
    const asal = (state.lokasiAsal || '').padStart(5, '0');
    const tujuan = (state.lokasiTujuan || '').padStart(5, '0');
    return `BTI_${tglStr}_${asal}_${tujuan}.TXT`;
  }

  // --- Download TXT File ---
  function downloadTxtFile() {
    if (state.items.length === 0) {
      alert('Belum ada item yang di-scan!');
      return;
    }

    const content = generateBtiTxt();
    const filename = getBtiFilename();

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`File ${filename} berhasil di-download!`);
  }

  function copyTxtToClipboard() {
    if (state.items.length === 0) {
      alert('Belum ada item yang di-scan!');
      return;
    }
    const content = generateBtiTxt();
    navigator.clipboard.writeText(content)
      .then(() => showToast('Isi file TXT berhasil disalin ke clipboard!'))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = content;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Isi file TXT berhasil disalin!');
      });
  }

  document.getElementById('btnPreviewTxt').addEventListener('click', function () {
    const content = generateBtiTxt();
    elTxtPreview.textContent = content || '(Belum ada data)';
    document.getElementById('previewFilenameDisplay').textContent = getBtiFilename();
    elModalPreview.classList.add('active');
  });

  document.getElementById('btnClosePreview').addEventListener('click', function () {
    elModalPreview.classList.remove('active');
  });

  document.getElementById('btnCopyPreview').addEventListener('click', copyTxtToClipboard);
  document.getElementById('btnDownloadFromPreview').addEventListener('click', handleDownloadClick);
  document.getElementById('btnDownloadTxt').addEventListener('click', handleDownloadClick);

  document.getElementById('btnResetSession').addEventListener('click', function () {
    if (state.items.length === 0) {
      showToast('Sesi sudah kosong.');
      return;
    }
    if (confirm('Yakin ingin mereset/menghapus seluruh hasil scan sesi ini?')) {
      state.items = [];
      saveSession();
      renderUI();
      showToast('Sesi berhasil direset.');
      elScanInput.focus();
    }
  });

  // --- Camera Scanner Modal ---
  const btnOpenCam = document.getElementById('btnOpenCam');
  btnOpenCam.addEventListener('click', function () {
    elModalCam.classList.add('active');
    startCameraScanner();
  });

  document.getElementById('btnCloseCam').addEventListener('click', function () {
    stopCameraScanner();
    elModalCam.classList.remove('active');
  });

  const elCamAlertDenied = document.getElementById('camAlertDenied');
  const elReaderHint = document.getElementById('readerHint');
  const elCamFileInput = document.getElementById('camFileInput');
  const btnTriggerSnap = document.getElementById('btnTriggerSnap');
  const btnSnapFallback = document.getElementById('btnSnapFallback');

  // Trigger native camera photo
  function triggerNativeCameraCapture() {
    elCamFileInput.click();
  }

  if (btnTriggerSnap) btnTriggerSnap.addEventListener('click', triggerNativeCameraCapture);
  if (btnSnapFallback) btnSnapFallback.addEventListener('click', triggerNativeCameraCapture);

  // When photo is taken
  if (elCamFileInput) {
    elCamFileInput.addEventListener('change', function (e) {
      if (!e.target.files || !e.target.files.length) return;
      const file = e.target.files[0];
      showToast('Memindai foto barcode...');

      if (!html5QrCode) {
        html5QrCode = new Html5Qrcode('reader');
      }

      html5QrCode.scanFile(file, true)
        .then(decodedText => {
          stopCameraScanner();
          elModalCam.classList.remove('active');
          elScanInput.value = decodedText;
          handleScanInput();
        })
        .catch(err => {
          alert('Barcode tidak terbaca dari foto. Pastikan foto cukup dekat, fokus, dan pencahayaan terang.\n\nTips: Anda juga bisa mengetik PLU langsung di kolom scan.');
        });
    });
  }

  function startCameraScanner() {
    if (elCamAlertDenied) elCamAlertDenied.style.display = 'none';
    if (elReaderHint) elReaderHint.style.display = 'block';

    if (typeof Html5Qrcode === 'undefined') {
      alert('Modul kamera Html5Qrcode belum siap.');
      return;
    }

    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode('reader');
    }

    const config = {
      fps: 15,
      qrbox: { width: 260, height: 180 },
      aspectRatio: 1.33
    };

    html5QrCode.start(
      { facingMode: 'environment' },
      config,
      (decodedText) => {
        stopCameraScanner();
        elModalCam.classList.remove('active');
        elScanInput.value = decodedText;
        handleScanInput();
      },
      (error) => {}
    ).catch(err => {
      console.warn('Live camera error:', err);
      // Show user-friendly denied box with photo fallback
      if (elCamAlertDenied) elCamAlertDenied.style.display = 'block';
      if (elReaderHint) elReaderHint.style.display = 'none';
    });
  }

  function stopCameraScanner() {
    if (html5QrCode && html5QrCode.isScanning) {
      html5QrCode.stop().catch(() => {});
    }
  }

  const toggleHeaderBtn = document.getElementById('btnToggleHeader');
  const headerBody = document.getElementById('headerCardBody');
  toggleHeaderBtn.addEventListener('click', function () {
    if (headerBody.style.display === 'none') {
      headerBody.style.display = 'block';
      toggleHeaderBtn.textContent = '▼ Sembunyikan';
    } else {
      headerBody.style.display = 'none';
      toggleHeaderBtn.textContent = '▶ Tampilkan';
    }
  });

  // --- Global Window Helpers for Rows ---
  window.ITX_PDT = {
    downloadArchive: function (arcId) {
      const list = getArchives();
      const target = list.find(a => a.id === arcId);
      if (!target) return;

      const tglStr = formatYYYYMMDD(target.tanggal);
      const asal = (target.lokasiAsal || '').padStart(5, '0');
      const tujuan = (target.lokasiTujuan || '').padStart(5, '0');

      let lines = [];
      target.items.forEach(it => {
        lines.push(`${tglStr}|${asal}|${tujuan}|${it.pack}|${it.seq}|||${it.plu}|${(parseFloat(it.qty)||0).toFixed(2)}| |${it.time}|${it.name}`);
      });
      const content = lines.join('\r\n') + '\r\n';
      triggerBlobDownload(content, target.filename);
      showToast(`Arsip ${target.filename} berhasil diunduh ulang!`);
    },
    restoreArchive: function (arcId) {
      const list = getArchives();
      const target = list.find(a => a.id === arcId);
      if (!target) return;

      if (state.items.length > 0) {
        if (!confirm('Layar scan saat ini masih berisi data. Menimpa layar dengan sesi arsip ini?')) return;
      }

      state.tanggal = target.tanggal;
      state.lokasiAsal = target.lokasiAsal;
      state.lokasiTujuan = target.lokasiTujuan;
      state.noPack = (target.packs && target.packs.length) ? target.packs[target.packs.length - 1] : 'AA/168';
      state.items = JSON.parse(JSON.stringify(target.items));

      saveSession();
      loadSession();
      renderUI();
      elModalArchive.classList.remove('active');
      showToast(`Sesi ${target.filename} berhasil dibuka kembali!`);
    },
    deleteArchive: function (arcId) {
      if (confirm('Hapus dokumen ini dari riwayat arsip?')) {
        let list = getArchives();
        list = list.filter(a => a.id !== arcId);
        saveArchives(list);
        renderArchiveList();
        showToast('Arsip dihapus.');
      }
    },
    deleteItem: function (idx) {
      if (confirm(`Hapus baris #${state.items[idx].seq} (${state.items[idx].name})?`)) {
        state.items.splice(idx, 1);
        state.items.forEach((it, i) => { it.seq = i + 1; });
        saveSession();
        renderUI();
        showToast('Baris dihapus.');
      }
    },
    editQty: function (idx) {
      const item = state.items[idx];
      const curQty = item.qty;
      const resp = prompt(`Ubah QTY untuk baris #${item.seq}\n(${item.name}):`, curQty);
      if (resp !== null) {
        const newQty = parseFloat(resp);
        if (!isNaN(newQty) && newQty > 0) {
          item.qty = newQty;
          saveSession();
          renderUI();
          showToast(`QTY #${item.seq} diubah ke ${newQty}`);
        } else {
          showToast('Nilai QTY tidak valid!', true);
        }
      }
    }
  };


  // --- ARCHIVE & SMART DOWNLOAD SYSTEM (A + B + C Architecture) ---
  const ARCHIVE_KEY = 'ITX_PDT_ARCHIVES_V1';

  function getArchives() {
    try {
      const data = localStorage.getItem(ARCHIVE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveArchives(list) {
    try {
      // Keep up to 50 latest sessions
      const trimmed = list.slice(0, 50);
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(trimmed));
    } catch (e) {}
  }

  function addSessionToArchive(filename, items, isSusulan = false) {
    const list = getArchives();
    const now = new Date();
    const dateFormatted = formatScanTimestamp(now);
    const uniquePacks = Array.from(new Set(items.map(it => it.pack)));
    const sumQty = items.reduce((acc, it) => acc + (parseFloat(it.qty) || 0), 0);

    const record = {
      id: 'BTI_' + Date.now(),
      filename: filename,
      savedAt: dateFormatted,
      tanggal: state.tanggal,
      lokasiAsal: state.lokasiAsal,
      lokasiTujuan: state.lokasiTujuan,
      isSusulan: isSusulan,
      totalLines: items.length,
      totalQty: sumQty.toFixed(2),
      packs: uniquePacks,
      items: JSON.parse(JSON.stringify(items))
    };

    // Add to front of archive
    list.unshift(record);
    saveArchives(list);
  }

  // --- Render Archive Modal List ---
  const elModalArchive = document.getElementById('modalArchive');
  const elArchiveContainer = document.getElementById('archiveListContainer');
  const elEmptyArchive = document.getElementById('emptyArchiveState');
  const elSearchArchive = document.getElementById('inputSearchArchive');

  function renderArchiveList(filterText = '') {
    const list = getArchives();
    const q = (filterText || '').trim().toUpperCase();

    const filtered = list.filter(item => {
      if (!q) return true;
      const fn = (item.filename || '').toUpperCase();
      const asal = (item.lokasiAsal || '').toUpperCase();
      const tujuan = (item.lokasiTujuan || '').toUpperCase();
      const packs = (item.packs || []).join(' ').toUpperCase();
      return fn.includes(q) || asal.includes(q) || tujuan.includes(q) || packs.includes(q);
    });

    if (filtered.length === 0) {
      elEmptyArchive.style.display = 'block';
      elArchiveContainer.innerHTML = '';
      return;
    }

    elEmptyArchive.style.display = 'none';
    let html = '';
    filtered.forEach((arc, idx) => {
      const susulanBadge = arc.isSusulan ? '<span class="badge-dl-status new">DUS SUSULAN</span>' : '';
      html += `
        <div class="archive-card">
          <div class="archive-card-header">
            <div>
              <div class="archive-filename">${escapeHtml(arc.filename)} ${susulanBadge}</div>
              <div style="font-size: 0.78rem; color: #64748b; margin-top: 2px;">
                Asal: <strong>${escapeHtml(arc.lokasiAsal)}</strong> ➔ Tujuan: <strong>${escapeHtml(arc.lokasiTujuan)}</strong>
              </div>
            </div>
            <span class="archive-date">⏱️ ${escapeHtml(arc.savedAt)}</span>
          </div>

          <div class="archive-meta">
            📊 <strong>${arc.totalLines} baris</strong> | Total Qty: <strong>${arc.totalQty} pcs</strong> | Dus: <code>${(arc.packs || []).join(', ')}</code>
          </div>

          <div class="archive-actions">
            <button type="button" class="btn-archive-dl" onclick="window.ITX_PDT.downloadArchive('${arc.id}')">
              💾 Download File TXT
            </button>
            <button type="button" class="btn-archive-restore" onclick="window.ITX_PDT.restoreArchive('${arc.id}')">
              🔄 Buka Kembali Sesi Ini
            </button>
            <button type="button" class="btn-archive-del" title="Hapus dari Arsip" onclick="window.ITX_PDT.deleteArchive('${arc.id}')">
              ✕
            </button>
          </div>
        </div>
      `;
    });

    elArchiveContainer.innerHTML = html;
  }

  // Archive Event Listeners
  const btnOpenArchive = document.getElementById('btnOpenArchive');
  if (btnOpenArchive) {
    btnOpenArchive.addEventListener('click', function () {
      renderArchiveList();
      elModalArchive.classList.add('active');
    });
  }

  const btnCloseArchive = document.getElementById('btnCloseArchive');
  const btnCloseArchiveBottom = document.getElementById('btnCloseArchiveBottom');
  if (btnCloseArchive) btnCloseArchive.addEventListener('click', () => elModalArchive.classList.remove('active'));
  if (btnCloseArchiveBottom) btnCloseArchiveBottom.addEventListener('click', () => elModalArchive.classList.remove('active'));

  if (elSearchArchive) {
    elSearchArchive.addEventListener('input', () => renderArchiveList(elSearchArchive.value));
  }

  const btnClearAllArchives = document.getElementById('btnClearAllArchives');
  if (btnClearAllArchives) {
    btnClearAllArchives.addEventListener('click', function () {
      if (confirm('Yakin ingin menghapus SELURUH riwayat arsip dokumen lama?')) {
        localStorage.removeItem(ARCHIVE_KEY);
        renderArchiveList();
        showToast('Seluruh arsip berhasil dibersihkan.');
      }
    });
  }



  // --- Smart Download Logic with Double-Upload Prevention ---
  const elModalSmartDl = document.getElementById('modalSmartDownload');
  const elBtnCloseSmartDl = document.getElementById('btnCloseSmartDl');
  const elBtnDlOnlyNew = document.getElementById('btnDlOnlyNew');
  const elBtnDlAllMerged = document.getElementById('btnDlAllMerged');
  const elCntDownloaded = document.getElementById('cntDownloaded');
  const elCntNew = document.getElementById('cntNew');
  const elBtnNewCnt = document.getElementById('btnNewCnt');
  const elBtnAllCnt = document.getElementById('btnAllCnt');

  const elModalPostDl = document.getElementById('modalPostDownload');
  const elBtnClosePostDl = document.getElementById('btnClosePostDl');
  const elPostDlFilename = document.getElementById('postDlFilename');
  const elBtnArchiveAndClear = document.getElementById('btnArchiveAndClear');
  const elBtnKeepSession = document.getElementById('btnKeepSession');

  if (elBtnCloseSmartDl) elBtnCloseSmartDl.addEventListener('click', () => elModalSmartDl.classList.remove('active'));
  if (elBtnClosePostDl) elBtnClosePostDl.addEventListener('click', () => elModalPostDl.classList.remove('active'));
  if (elBtnKeepSession) elBtnKeepSession.addEventListener('click', () => elModalPostDl.classList.remove('active'));

  if (elBtnArchiveAndClear) {
    elBtnArchiveAndClear.addEventListener('click', function () {
      elModalPostDl.classList.remove('active');
      state.items = [];
      saveSession();
      renderUI();
      showToast('Sesi diarsipkan. Layar bersih siap scan dokumen baru!');
      elScanInput.focus();
    });
  }

  // Actual TXT File Generator from given array
  function triggerBlobDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function executeDownload(itemsToDownload, isSusulan = false) {
    if (!itemsToDownload || itemsToDownload.length === 0) return;

    const tglStr = formatYYYYMMDD(state.tanggal);
    const asal = (state.lokasiAsal || '').padStart(5, '0');
    const tujuan = (state.lokasiTujuan || '').padStart(5, '0');

    let lines = [];
    itemsToDownload.forEach(it => {
      const seq = it.seq;
      const pack = it.pack || 'AA/001';
      const plu = it.plu;
      const qtyStr = (parseFloat(it.qty) || 0).toFixed(2);
      const timeStr = it.time;
      const nameStr = it.name;

      const row = `${tglStr}|${asal}|${tujuan}|${pack}|${seq}|||${plu}|${qtyStr}| |${timeStr}|${nameStr}`;
      lines.push(row);
    });

    const content = lines.join('\r\n') + '\r\n';
    
    // Determine filename: append _SUSULAN if only downloading new items
    let filename = `BTI_${tglStr}_${asal}_${tujuan}.TXT`;
    if (isSusulan) {
      filename = `BTI_${tglStr}_${asal}_${tujuan}_SUSULAN.TXT`;
    }

    triggerBlobDownload(content, filename);

    // Mark these items as downloaded
    itemsToDownload.forEach(it => { it.downloaded = true; });
    saveSession();
    renderUI();

    // Add to archive
    addSessionToArchive(filename, itemsToDownload, isSusulan);

    // Show Post Download Modal
    if (elPostDlFilename) elPostDlFilename.textContent = filename;
    if (elModalPostDl) elModalPostDl.classList.add('active');

    showToast(`File ${filename} berhasil diunduh!`);
  }

  // Handle Download Button Click
  function handleDownloadClick() {
    if (state.items.length === 0) {
      alert('Belum ada item yang di-scan!');
      return;
    }

    const downloadedItems = state.items.filter(it => it.downloaded);
    const newItems = state.items.filter(it => !it.downloaded);

    // CASE 1: All items are new (First download)
    if (downloadedItems.length === 0) {
      executeDownload(state.items, false);
      return;
    }

    // CASE 2: There are both downloaded items and new items (DUS SUSULAN)
    if (newItems.length > 0 && downloadedItems.length > 0) {
      elCntDownloaded.textContent = downloadedItems.length;
      elCntNew.textContent = newItems.length;
      elBtnNewCnt.textContent = newItems.length;
      elBtnAllCnt.textContent = state.items.length;
      elModalSmartDl.classList.add('active');
      return;
    }

    // CASE 3: All items have already been downloaded
    if (confirm(`Seluruh ${state.items.length} barang pada sesi ini sudah pernah diunduh sebelumnya.\n\nApakah Anda ingin mengunduh ulang salinan filenya?`)) {
      executeDownload(state.items, false);
    }
  }

  if (elBtnDlOnlyNew) {
    elBtnDlOnlyNew.addEventListener('click', function () {
      elModalSmartDl.classList.remove('active');
      const newItems = state.items.filter(it => !it.downloaded);
      executeDownload(newItems, true);
    });
  }

  if (elBtnDlAllMerged) {
    elBtnDlAllMerged.addEventListener('click', function () {
      elModalSmartDl.classList.remove('active');
      executeDownload(state.items, false);
    });
  }


  // --- Startup ---
  window.addEventListener('DOMContentLoaded', () => {
    initDatabase();
    loadSession();
    setTimeout(() => { elScanInput.focus(); }, 300);
  });

})();
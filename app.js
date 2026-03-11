// ========================================
// 出張プログラム視認化ツール - アプリケーション
// ドラッグ&ドロップ、配置ロジック、PDF生成、BGM/SE
// ========================================

// ============================================
// BGM（6曲・被りなしランダム・音量60%）
// ============================================
const BGM_TRACKS = [
    'ピクニックに行く気持ち (1).mp3',
    'ピクニックに行く気持ち.mp3',
    '戦う出張ウォリアー (1).mp3',
    '戦う出張ウォリアー.mp3',
    'Resort Transit Breeze (1).mp3',
    'Resort Transit Breeze.mp3'
];

const BGM = {
    audio: null,
    queue: [],
    defaultVolume: 0.6,

    start() {
        if (!this.audio) this.audio = new Audio();
        this.audio.volume = this.defaultVolume;
        this.audio.loop = false;
        this.refillQueue();
        this.playNext();
    },

    refillQueue() {
        this.queue = BGM_TRACKS.slice();
        for (let i = this.queue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
        }
    },

    playNext() {
        if (typeof Sound !== 'undefined' && (Sound.muted || Sound.workMode)) return;
        if (this.queue.length === 0) this.refillQueue();
        const src = this.queue.shift();
        this.audio.src = src;
        this.audio.volume = this.defaultVolume;
        this.audio.play().catch(() => {
            setTimeout(() => this.audio.play().catch(() => {}), 150);
        });
        this.audio.onended = () => this.playNext();
    },

    pause() {
        if (this.audio) this.audio.pause();
    },

    resume() {
        if (typeof Sound !== 'undefined' && (Sound.muted || Sound.workMode)) return;
        if (!this.audio) return;
        if (this.audio.ended || !this.audio.src) this.playNext();
        else this.audio.play().catch(() => {});
    },

    setVolume(v) {
        this.defaultVolume = Math.max(0, Math.min(1, v));
        if (this.audio) this.audio.volume = this.defaultVolume;
    }
};

// ============================================
// サウンド（ぴこSE・BGM連動・作業モードで音止め）
// ============================================
const Sound = {
    ctx: null,
    initialized: false,
    muted: false,
    workMode: false,

    init() {
        if (this.initialized) return true;
        try {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new Ctx();
            this.initialized = true;
            this.muted = localStorage.getItem('shukka_sound_muted') === '1';
            this.workMode = localStorage.getItem('shukka_work_mode') === '1';
            this.updateMuteButton();
            this.updateWorkModeButton();
            return true;
        } catch (e) {
            console.warn('Sound init failed', e);
            return false;
        }
    },

    playPiko(type = 'click') {
        if (!this.initialized || !this.ctx || this.muted || this.workMode) return;
        try {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            const freq = type === 'drop' ? 660 : 880;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
            osc.start(this.ctx.currentTime);
            osc.stop(this.ctx.currentTime + 0.08);
        } catch (_) {}
    },

    toggleMute() {
        this.muted = !this.muted;
        localStorage.setItem('shukka_sound_muted', this.muted ? '1' : '0');
        this.updateMuteButton();
        if (this.muted) BGM.pause();
        else BGM.resume();
    },

    toggleWorkMode() {
        this.workMode = !this.workMode;
        localStorage.setItem('shukka_work_mode', this.workMode ? '1' : '0');
        this.updateWorkModeButton();
        if (this.workMode) BGM.pause();
        else BGM.resume();
    },

    updateMuteButton() {},
    updateWorkModeButton() {}
};

// 効果音は「ボタンを押した時」と「カレンダーに置いた時」のみ
function playSE(type) {
    Sound.init();
    Sound.playPiko(type);
    hapticFeedback();
}

// iOSなど：操作の打感（短い振動）。対応環境のみ
function hapticFeedback() {
    try {
        if (navigator.vibrate) navigator.vibrate(12);
    } catch (_) {}
}

// iOS：タブ復帰時に音声を再開
function setupIOSAudioResume() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        if (Sound.ctx && Sound.ctx.state === 'suspended') Sound.ctx.resume();
        if (typeof BGM !== 'undefined' && Sound && !Sound.muted && !Sound.workMode) BGM.resume();
    });
    window.addEventListener('pageshow', (e) => {
        if (e.persisted && Sound.ctx && Sound.ctx.state === 'suspended') Sound.ctx.resume();
    });
}

// グローバル変数
let currentYear = 2026;
let currentMonth = 4;
let calendar = {};
let placements = {};
let undoHistory = [];

// プリセット地域データ
const presetRegions = [
    { id: 'kumamoto', name: '熊本', color: '#FF6B6B' },
    { id: 'fukuoka1', name: '福岡1', color: '#4ECDC4' },
    { id: 'kitakyushu', name: '北九州', color: '#45B7D1' },
    { id: 'yamaguchi', name: '山口', color: '#FFA502' },
    { id: 'tokyo', name: '東京', color: '#00CED1' },
    { id: 'kagoshima1', name: '鹿児島1', color: '#FF006E' },
    { id: 'kagoshima2', name: '鹿児島2', color: '#FB5607' },
    { id: 'kagoshima3', name: '鹿児島3', color: '#FFBE0B' },
    { id: 'miyazaki', name: '宮崎', color: '#8338EC' },
    { id: 'kurume', name: '久留米', color: '#3A86FF' }
];

let customRegions = [];

/** 1日あたり最大2つ。日付の値を配列に正規化 */
function getPlacementsForDate(date) {
    const v = placements[date];
    if (!v) return [];
    return Array.isArray(v) ? v.slice(0, 2) : [v];
}

function getRegionColor(regionName) {
    const p = presetRegions.find(r => r.name === regionName);
    if (p) return p.color;
    const c = customRegions.find(r => r.name === regionName);
    return c ? c.color : '#888';
}

// ============================================
// 初期化
// ============================================
function init() {
    renderCalendar();
    renderTags();
    setupEventListeners();
    setupBottomSheet();       // 旧ボトムシート：要素なければ即return（後方互換）
    setupControlPanelTabs();  // 新コントロールパネルタブ
    setupReturnDropZone();
    setupIOSAudioResume();
    updateStats();
}

// ボトムシート：タップ/スワイプで展開・閉じる
function setupBottomSheet() {
    const sheet = document.getElementById('bottomSheet');
    const handle = document.getElementById('bottomSheetHandle');
    const content = document.getElementById('bottomSheetContent');
    if (!sheet || !handle || !content) return;

    function open() {
        sheet.classList.add('is-expanded');
        handle.setAttribute('aria-expanded', 'true');
    }

    function close() {
        sheet.classList.remove('is-expanded');
        handle.setAttribute('aria-expanded', 'false');
    }

    function toggle() {
        sheet.classList.toggle('is-expanded');
        const expanded = sheet.classList.contains('is-expanded');
        handle.setAttribute('aria-expanded', String(expanded));
    }

    handle.addEventListener('click', () => {
        playSE('click');
        toggle();
    });

    const fab = document.getElementById('openSheetFab');
    if (fab) {
        fab.addEventListener('click', () => {
            playSE('click');
            open();
        });
    }

    let touchStartY = 0;
    handle.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) touchStartY = e.touches[0].clientY;
    }, { passive: true });

    handle.addEventListener('touchend', (e) => {
        if (!e.changedTouches.length) return;
        const endY = e.changedTouches[0].clientY;
        const dy = touchStartY - endY;
        if (dy > 20) open();
        else if (dy < -20) close();
    }, { passive: true });
}

// ============================================
// コントロールパネル タブ切り替え（モバイル用）
// ============================================
function setupControlPanelTabs() {
    const tabs = document.querySelectorAll('.cp-tab');
    if (!tabs.length) return;

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            playSE('click');

            // すべてのタブ・ペインを非アクティブ化
            tabs.forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
            document.querySelectorAll('.cp-pane').forEach(p => {
                p.classList.remove('active');
            });

            // クリックされたタブとターゲットペインをアクティブ化
            tab.classList.add('active');
            tab.setAttribute('aria-selected', 'true');
            const targetId = tab.dataset.target;
            const targetPane = document.getElementById(targetId);
            if (targetPane) targetPane.classList.add('active');
        });
    });
}

// ============================================
// カレンダー生成
// ============================================
function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
    return new Date(year, month - 1, 1).getDay();
}

function renderCalendar() {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    // 前月の空欄
    for (let i = 0; i < firstDay; i++) {
        const cell = createCalendarCell(null, true);
        grid.appendChild(cell);
    }

    // 今月の日付
    for (let day = 1; day <= daysInMonth; day++) {
        const cell = createCalendarCell(day, false);
        grid.appendChild(cell);
    }

    // 月表示を更新
    document.getElementById('monthDisplay').textContent = 
        `${currentYear}年 ${currentMonth}月`;

    // ドラッグ&ドロップの対象をセット
    setupDragDropTargets();
}

function createCalendarCell(day, isOtherMonth) {
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    
    if (isOtherMonth) {
        cell.classList.add('other-month');
        return cell;
    }

    cell.dataset.date = day;
    
    const list = getPlacementsForDate(day);
    if (list.length > 0) {
        cell.classList.add('has-location');
        cell.draggable = true;
        cell.dataset.regionName = list[0];
        cell.setAttribute('title', '右の地域エリアへドラッグで解除');
        const locationsHtml = list.map(name => {
            const color = getRegionColor(name);
            return `<span class="cell-location-item" style="background:${color}">${name}</span>`;
        }).join('');
        cell.innerHTML = `
            <div class="cell-date">${day}</div>
            <div class="cell-locations">${locationsHtml}</div>
        `;
        cell.addEventListener('dragstart', handleCalendarCellDragStart);
        cell.addEventListener('dragend', handleCalendarCellDragEnd);

        cell.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1 || touchDragState) return;
            const t = e.touches[0];
            touchDragState = { type: 'cell', date: day };
            const label = list.join('・');
            touchGhostEl = createTouchGhost(label, '#2d5016');
            touchGhostEl.style.left = t.clientX + 'px';
            touchGhostEl.style.top = t.clientY + 'px';
            bindTouchDragListeners();
        }, { passive: true });
    } else {
        cell.innerHTML = `<div class="cell-date">${day}</div>`;
    }

    return cell;
}

// ============================================
// タグレンダリング
// ============================================
function renderTags() {
    const tagsPool = document.getElementById('tagsPool');
    tagsPool.innerHTML = '';

    presetRegions.forEach(region => {
        const tag = createTag(region, false);
        tagsPool.appendChild(tag);
    });

    renderCustomTags();
}

function createTag(region, isCustom = false) {
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.classList.add(region.id);
    tag.draggable = true;
    tag.dataset.regionId = region.id;
    tag.dataset.regionName = region.name;
    tag.dataset.isCustom = isCustom;
    tag.style.backgroundColor = region.color;
    tag.textContent = region.name;

    // 同一地域は何回でもカレンダーに配置可能（月2回行く等）

    // ドラッグイベント（マウス）
    tag.addEventListener('dragstart', handleDragStart);
    tag.addEventListener('dragend', handleDragEnd);

    // タッチ用ドラッグ（iOS等でHTML5 DnDが効かない場合のフォールバック）
    tag.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1 || touchDragState) return;
        const t = e.touches[0];
        touchDragState = { type: 'tag', regionName: region.name, regionId: region.id, isCustom };
        touchGhostEl = createTouchGhost(region.name, region.color);
        touchGhostEl.style.left = t.clientX + 'px';
        touchGhostEl.style.top = t.clientY + 'px';
        bindTouchDragListeners();
    }, { passive: true });

    return tag;
}

function renderCustomTags() {
    const customPool = document.getElementById('customTagsPool');
    customPool.innerHTML = '';

    customRegions.forEach((region, index) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-tag-wrapper';

        const tag = createTag(region, true);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-custom-tag';
        deleteBtn.textContent = '✕';
        deleteBtn.onclick = () => deleteCustomRegion(index);

        wrapper.appendChild(tag);
        wrapper.appendChild(deleteBtn);
        customPool.appendChild(wrapper);
    });
}

// ============================================
// ドラッグ&ドロップ機能（マウス + タッチフォールバック）
// ============================================
let draggedTag = null;

let touchDragState = null;
let touchGhostEl = null;

function createTouchGhost(text, color) {
    const el = document.createElement('div');
    el.className = 'touch-drag-ghost';
    el.textContent = text;
    el.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;padding:10px 14px;border-radius:6px;font-weight:700;font-size:1rem;color:#fff;box-shadow:0 4px 12px rgba(0,0,0,0.3);transform:translate(-50%,-50%);white-space:nowrap;';
    if (color) el.style.backgroundColor = color;
    document.body.appendChild(el);
    return el;
}

function getTouchDropTarget(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const cell = el.closest('.calendar-cell:not(.other-month)');
    if (cell && cell.dataset.date) return { cell, date: parseInt(cell.dataset.date, 10) };
    if (el.closest('.tags-section')) return { returnZone: true };
    return null;
}

function bindTouchDragListeners() {
    const onMove = (e) => {
        if (!touchDragState || !touchGhostEl || !e.touches.length) return;
        e.preventDefault();
        touchGhostEl.style.left = e.touches[0].clientX + 'px';
        touchGhostEl.style.top = e.touches[0].clientY + 'px';
    };
    const onEnd = (e) => {
        if (!touchDragState || !e.changedTouches.length) return;
        const t = e.changedTouches[0];
        const target = getTouchDropTarget(t.clientX, t.clientY);
        if (touchGhostEl && touchGhostEl.parentNode) touchGhostEl.remove();
        touchGhostEl = null;

        if (touchDragState.type === 'tag' && target && target.cell) {
            const { date } = target;
            const regionName = touchDragState.regionName;
            const arr = getPlacementsForDate(date);
            if (arr.length < 2) {
                undoHistory.push(JSON.parse(JSON.stringify(placements)));
                placements[date] = [...arr, regionName];
                renderCalendar();
                renderTags();
                updateStats();
                playSE('drop');
                showToast(`✅ ${regionName}を${date}日に配置しました！`, 2000);
                playSuccessAnimation(target.cell);
            } else showToast('⚠️ 1マスには2つまでです');
        } else if (touchDragState.type === 'cell' && target && target.returnZone) {
            removePlacementByDrag(touchDragState.date);
        }

        touchDragState = null;
        document.removeEventListener('touchmove', onMove, { passive: false });
        document.removeEventListener('touchend', onEnd);
        document.removeEventListener('touchcancel', onEnd);
    };
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
}

function handleDragStart(e) {
    draggedTag = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'copy';
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.calendar-cell').forEach(cell => {
        cell.classList.remove('drop-active');
    });
    document.querySelector('.tags-section')?.classList.remove('return-drop-active');
    draggedTag = null;
}

// カレンダーセルから「右へ戻す」ドラッグ（その日の配置をまとめて解除）
function handleCalendarCellDragStart(e) {
    const date = parseInt(this.dataset.date, 10);
    e.dataTransfer.setData('application/x-calendar-placement', JSON.stringify({ date }));
    e.dataTransfer.effectAllowed = 'move';
    this.classList.add('dragging');
}

function handleCalendarCellDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelector('.tags-section')?.classList.remove('return-drop-active');
}

// 右エリア（地域タグ）へドロップで配置解除
function setupReturnDropZone() {
    const tagsSection = document.querySelector('.tags-section');
    if (!tagsSection) return;

    tagsSection.addEventListener('dragover', (e) => {
        if (!e.dataTransfer.types.includes('application/x-calendar-placement')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        tagsSection.classList.add('return-drop-active');
    });

    tagsSection.addEventListener('dragleave', (e) => {
        if (!tagsSection.contains(e.relatedTarget)) {
            tagsSection.classList.remove('return-drop-active');
        }
    });

    tagsSection.addEventListener('drop', (e) => {
        e.preventDefault();
        tagsSection.classList.remove('return-drop-active');
        const raw = e.dataTransfer.getData('application/x-calendar-placement');
        if (!raw) return;
        try {
            const { date } = JSON.parse(raw);
            removePlacementByDrag(date);
        } catch (_) {}
    });
}

function removePlacementByDrag(date) {
    const list = getPlacementsForDate(date);
    if (list.length === 0) return;
    delete placements[date];
    renderCalendar();
    renderTags();
    updateStats();
    showToast(`↩️ ${date}日の配置を解除しました`, 2000);
}

function setupDragDropTargets() {
    const cells = document.querySelectorAll('.calendar-cell:not(.other-month)');
    
    cells.forEach(cell => {
        cell.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            cell.classList.add('drop-active');
        });

        cell.addEventListener('dragleave', () => {
            cell.classList.remove('drop-active');
        });

        cell.addEventListener('drop', (e) => {
            e.preventDefault();
            cell.classList.remove('drop-active');

            if (!draggedTag) return;

            const date = parseInt(cell.dataset.date);
            const regionName = draggedTag.dataset.regionName;
            const arr = getPlacementsForDate(date);
            if (arr.length >= 2) {
                showToast('⚠️ 1マスには2つまでです');
                return;
            }

            undoHistory.push(JSON.parse(JSON.stringify(placements)));
            placements[date] = [...arr, regionName];

            // UI更新
            renderCalendar();
            renderTags();
            updateStats();
            draggedTag = null;

            playSE('drop');
            showToast(`✅ ${regionName}を${date}日に配置しました！`, 2000);
            playSuccessAnimation(cell);
        });
    });
}

// ============================================
// カスタム地域追加
// ============================================
function setupEventListeners() {
    // 初回タップで音声コンテキストを有効化（iOS等）
    const onceInitSound = () => {
        Sound.init();
        document.removeEventListener('click', onceInitSound);
        document.removeEventListener('touchstart', onceInitSound);
    };
    document.addEventListener('click', onceInitSound);
    document.addEventListener('touchstart', onceInitSound);

    document.getElementById('addRegionBtn').addEventListener('click', () => {
        playSE('click');
        addCustomRegion();
    });
    document.getElementById('customRegionInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addCustomRegion();
    });

    document.getElementById('prevMonthBtn').addEventListener('click', () => {
        playSE('click');
        if (currentMonth === 1) {
            currentMonth = 12;
            currentYear--;
        } else {
            currentMonth--;
        }
        renderCalendar();
    });

    document.getElementById('nextMonthBtn').addEventListener('click', () => {
        playSE('click');
        if (currentMonth === 12) {
            currentMonth = 1;
            currentYear++;
        } else {
            currentMonth++;
        }
        renderCalendar();
    });

    document.getElementById('resetBtn').addEventListener('click', resetAll);
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('pdfBtn').addEventListener('click', () => {
        playSE('click');
        generatePDF();
    });
}

function addCustomRegion() {
    const input = document.getElementById('customRegionInput');
    const regionName = input.value.trim();

    if (!regionName) {
        showToast('⚠️ 地域名を入力してください');
        return;
    }

    // 重複チェック
    const isDuplicate = customRegions.some(r => r.name === regionName) ||
                        presetRegions.some(r => r.name === regionName);
    if (isDuplicate) {
        showToast('⚠️ その地域は既に追加されています');
        return;
    }

    const customRegion = {
        id: `custom-${Date.now()}`,
        name: regionName,
        color: generateRandomColor()
    };

    customRegions.push(customRegion);
    input.value = '';
    renderTags();
    showToast(`🎨 ${regionName}を追加しました！`);
}

function deleteCustomRegion(index) {
    const region = customRegions[index];
    
    Object.keys(placements).forEach(date => {
        const arr = getPlacementsForDate(date).filter(n => n !== region.name);
        if (arr.length === 0) delete placements[date];
        else placements[date] = arr;
    });

    customRegions.splice(index, 1);
    renderCalendar();
    renderTags();
    updateStats();
    showToast(`🗑️ ${region.name}を削除しました`);
}

// ============================================
// リセット＆アンドゥ
// ============================================
function resetAll() {
    if (!confirm('本当にすべてリセットしますか？')) return;
    playSE('click');
    placements = {};
    customRegions = [];
    undoHistory = [];
    renderCalendar();
    renderTags();
    updateStats();
    showToast('🔄 すべてリセットしました');
}

function undo() {
    if (undoHistory.length === 0) {
        showToast('⚠️ やり直すものがありません');
        return;
    }
    playSE('click');
    placements = undoHistory.pop();
    renderCalendar();
    renderTags();
    updateStats();
    showToast('↩️ アンドゥしました');
}

// ============================================
// 統計情報更新
// ============================================
function updateStats() {
    const sortedDates = Object.keys(placements).map(Number).filter(d => getPlacementsForDate(d).length > 0).sort((a, b) => a - b);
    const placedCount = sortedDates.length;
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const remainingDays = daysInMonth - placedCount;

    document.getElementById('placedCount').textContent = placedCount;
    document.getElementById('remainingDays').textContent = remainingDays;

    const placementList = document.getElementById('placementList');
    if (sortedDates.length === 0) {
        placementList.innerHTML = '<p class="empty-state">まだ配置されていません</p>';
    } else {
        placementList.innerHTML = sortedDates
            .map(date => {
                const names = getPlacementsForDate(date).join('・');
                return `
                <div class="placement-item">
                    <span class="placement-date">${date}日</span>
                    <span class="placement-location">${names}</span>
                </div>
            `;
            })
            .join('');
    }

    const pdfBtn = document.getElementById('pdfBtn');
    pdfBtn.disabled = placedCount === 0;
}

// ============================================
// PDF生成
// ============================================
async function generatePDF() {
    const pdfBtn = document.getElementById('pdfBtn');
    pdfBtn.disabled = true;

    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.add('show');

    try {
        // カレンダー部分をHTMLで構築（PDF用）
        const pdfContent = createPDFContent();
        const container = document.createElement('div');
        container.innerHTML = pdfContent;
        container.style.position = 'absolute';
        container.style.left = '-9999px';
        container.style.width = '1000px';
        container.style.backgroundColor = 'white';
        container.style.padding = '40px';
        container.style.fontFamily = 'Arial, sans-serif';
        document.body.appendChild(container);

        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        const canvas = await html2canvas(container, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
            windowWidth: container.scrollWidth,
            windowHeight: container.scrollHeight
        });

        // jsPDFでPDF生成
        const pdf = new jspdf.jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        const imgWidth = 210 - 20; // A4幅からマージン
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        const imgData = canvas.toDataURL('image/png');

        let yPosition = 10;

        // 複数ページ対応
        pdf.addImage(imgData, 'PNG', 10, yPosition, imgWidth, imgHeight);
        
        if (imgHeight > 277) {
            let remainingHeight = imgHeight;
            let yOffset = 277;
            
            while (remainingHeight > 0) {
                pdf.addPage();
                const pageHeight = remainingHeight > 277 ? 277 : remainingHeight;
                pdf.addImage(
                    imgData,
                    'PNG',
                    10,
                    10,
                    imgWidth,
                    imgHeight,
                    null,
                    'NONE',
                    0,
                    -yOffset
                );
                remainingHeight -= 277;
                yOffset += 277;
            }
        }

        // ファイル名生成
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        const filename = `出張プログラム_${currentYear}年${currentMonth}月_${dateStr}.pdf`;

        // PDF保存
        pdf.save(filename);

        document.body.removeChild(container);
        showToast('📄 PDFを生成・ダウンロードしました！', 3000);
    } catch (error) {
        console.error('PDF生成エラー:', error);
        showToast('❌ PDFの生成に失敗しました');
    } finally {
        overlay.classList.remove('show');
        pdfBtn.disabled = false;
    }
}

function createPDFContent() {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);

    let calendarHTML = `
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 28px; color: #333;">出張プログラム</h1>
            <p style="margin: 5px 0; font-size: 18px; color: #666;">${currentYear}年 ${currentMonth}月</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
            <thead>
                <tr style="background: #667eea; color: white;">
                    <th style="padding: 10px; border: 1px solid #ddd; width: 14.28%;">日</th>
                    <th style="padding: 10px; border: 1px solid #ddd; width: 14.28%;">月</th>
                    <th style="padding: 10px; border: 1px solid #ddd; width: 14.28%;">火</th>
                    <th style="padding: 10px; border: 1px solid #ddd; width: 14.28%;">水</th>
                    <th style="padding: 10px; border: 1px solid #ddd; width: 14.28%;">木</th>
                    <th style="padding: 10px; border: 1px solid #ddd; width: 14.28%;">金</th>
                    <th style="padding: 10px; border: 1px solid #ddd; width: 14.28%;">土</th>
                </tr>
            </thead>
            <tbody>
    `;

    let day = 1;
    for (let week = 0; week < 6; week++) {
        calendarHTML += '<tr style="height: 60px;">';
        
        for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
            const cellIndex = week * 7 + dayOfWeek;
            
            if (cellIndex < firstDay || day > daysInMonth) {
                calendarHTML += '<td style="border: 1px solid #ddd; background: #f9f9f9;"></td>';
            } else {
                const list = getPlacementsForDate(day);
                const location = list.length ? list.join('・') : '';
                const bgColor = location ? '#e8f0ff' : 'white';
                const textColor = location ? '#333' : '#999';
                
                calendarHTML += `
                    <td style="border: 1px solid #ddd; background: ${bgColor}; padding: 8px; text-align: center; vertical-align: middle; position: relative;">
                        <div style="position: absolute; top: 4px; right: 6px; font-size: 11px; font-weight: bold; color: #555; opacity: 0.85;">${day}</div>
                        <div style="font-size: 12px; color: ${textColor}; font-weight: 600;">${location || ''}</div>
                    </td>
                `;
                day++;
            }
        }
        
        calendarHTML += '</tr>';
    }

    calendarHTML += `
            </tbody>
        </table>

        <div style="margin-top: 20px; padding: 15px; background: #f5f5f5; border-radius: 8px;">
            <h3 style="margin: 0 0 10px 0; font-size: 16px;">配置済み出張地一覧</h3>
            <ul style="margin: 0; padding-left: 20px;">
    `;

    const sortedDates = Object.keys(placements)
        .map(Number)
        .sort((a, b) => a - b);

    if (sortedDates.length > 0) {
        sortedDates.forEach(date => {
            const names = getPlacementsForDate(date).join('・');
            calendarHTML += `<li style="margin: 5px 0;">${date}日：${names}</li>`;
        });
    } else {
        calendarHTML += '<li style="color: #999;">配置されていません</li>';
    }

    calendarHTML += `
            </ul>
        </div>

        <div style="margin-top: 30px; text-align: center; color: #999; font-size: 12px;">
            <p>生成日時: ${new Date().toLocaleString('ja-JP')}</p>
            <p>出張プログラム視認化ツール by ゲームクリエイター</p>
        </div>
    `;

    return calendarHTML;
}

// ============================================
// ユーティリティ関数
// ============================================
function showToast(message, duration = 2000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

function playSuccessAnimation(element) {
    element.style.animation = 'none';
    setTimeout(() => {
        element.style.animation = 'bounce 0.5s ease-out';
    }, 10);
}

function generateRandomColor() {
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA502', '#00CED1',
        '#FF006E', '#FB5607', '#FFBE0B', '#8338EC', '#3A86FF'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// ============================================
// スタート画面 → 出張する？でBGM開始・本編へ
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const startScreen = document.getElementById('startScreen');
    const mainScreen = document.getElementById('mainScreen');
    const startBtn = document.getElementById('startBtn');

    startBtn?.addEventListener('click', () => {
        hapticFeedback();
        Sound.init();
        BGM.start();
        if (startScreen) startScreen.style.display = 'none';
        if (mainScreen) mainScreen.style.display = '';
        init();
    });
});

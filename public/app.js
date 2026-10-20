/* =============================================
   SIM Manager - Application JavaScript
   Vietnamese SIM Card Management Application
   ============================================= */

(function () {
    'use strict';

    // =============================================
    // Configuration & Constants
    // =============================================
    const API_BASE = '/api/sims';
    const ITEMS_PER_PAGE = 20;

    const NETWORKS = ['Viettel', 'Mobifone', 'Vinaphone', 'Vietnamobile', 'Gmobile', 'Itelecom', 'Reddi', 'Wintel'];
    const NETWORK_COLORS = {
        'Viettel': '#ea4335',
        'Mobifone': '#1a73e8',
        'Vinaphone': '#34a853',
        'Vietnamobile': '#ea8600',
        'Gmobile': '#9c27b0',
        'Itelecom': '#00bcd4',
        'Reddi': '#ff5722',
        'Wintel': '#607d8b'
    };

    const SIM_TYPES = ['Số đẹp', 'Phong thủy', 'Lộc phát', 'Thần tài', 'Tam hoa', 'Tứ quý', 'Ngũ quý', 'Lục quý', 'Tiến', 'Đảo', 'Gánh', 'Số VIP', 'Số thường'];
    const STATUSES = ['Còn hàng', 'Đã bán', 'Đã giữ'];

    // Đầu số các nhà mạng Việt Nam
    const CARRIER_PREFIXES = {
        'Viettel': ['086', '096', '097', '098', '032', '033', '034', '035', '036', '037', '038', '039'],
        'Mobifone': ['089', '090', '093', '070', '079', '077', '076', '078'],
        'Vinaphone': ['088', '091', '094', '083', '084', '085', '081', '082'],
        'Vietnamobile': ['092', '056', '058', '052'],
        'Gmobile': ['099', '059'],
        'Itelecom': ['087'],
        'Wintel': ['055']
    };

    // =============================================
    // State
    // =============================================
    let state = {
        sims: [],
        filteredSims: [],
        currentPage: 1,
        viewMode: 'table', // 'table' or 'cards'
        adminPin: localStorage.getItem('sim_admin_pin') || '',
        isAdmin: false,
        showCostPrice: localStorage.getItem('sim_show_cost') === 'true', // Chỉ chủ mới thấy giá gốc
        selectedSims: new Set(),
        isBulkDelete: false,
        currentSort: 'date-desc',
        filters: {
            search: '',
            network: '',
            type: '',
            status: '',
            priceMin: null,
            priceMax: null
        },
        // Zalo
        zaloTemplate: 'single',
        zaloPriceType: 'retail', // 'retail' (bán lẻ) hoặc 'ctv' (giá CTV)
        zaloSelectedSims: [],
        deleteTargetId: null,
        editTargetId: null
    };

    // =============================================
    // Utilities
    // =============================================
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

    function getSimPhone(sim) {
        if (!sim) return '';
        return sim.phone_number || sim.number || sim.phone || '';
    }

    function getSimType(sim) {
        if (!sim) return '';
        return sim.sim_type || sim.type || '';
    }

    function getSimId(sim) {
        if (!sim) return '';
        return String(sim.id !== undefined ? sim.id : (sim._id !== undefined ? sim._id : ''));
    }

    function formatPrice(value) {
        if (!value && value !== 0) return '0₫';
        return new Intl.NumberFormat('vi-VN').format(value) + '₫';
    }

    function formatPhoneDisplay(phone) {
        if (!phone) return '';
        const digits = String(phone).replace(/\D/g, '');
        if (digits.length === 10) {
            return digits.slice(0, 4) + '.' + digits.slice(4, 7) + '.' + digits.slice(7);
        }
        if (digits.length === 11) {
            return digits.slice(0, 4) + '.' + digits.slice(4, 7) + '.' + digits.slice(7);
        }
        return phone;
    }

    function debounce(fn, delay = 300) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }

    // =============================================
    // Tự động nhận diện Đầu số & Loại SIM & Giá tiền
    // =============================================
    function detectCarrier(phone) {
        if (!phone) return '';
        const digits = String(phone).replace(/\D/g, '');
        if (digits.length < 3) return '';
        const prefix3 = digits.slice(0, 3);
        for (const [carrier, prefixes] of Object.entries(CARRIER_PREFIXES)) {
            if (prefixes.includes(prefix3)) return carrier;
        }
        return '';
    }

    function detectSimType(phone) {
        if (!phone) return 'Số đẹp';
        const digits = String(phone).replace(/\D/g, '');
        if (digits.length < 4) return 'Số đẹp';

        const last6 = digits.slice(-6);
        const last5 = digits.slice(-5);
        const last4 = digits.slice(-4);
        const last3 = digits.slice(-3);
        const last2 = digits.slice(-2);

        // Lục quý
        if (last6.length === 6 && /^(\d)\1{5}$/.test(last6)) return 'Lục quý';
        // Ngũ quý
        if (last5.length === 5 && /^(\d)\1{4}$/.test(last5)) return 'Ngũ quý';
        // Tứ quý
        if (last4.length === 4 && /^(\d)\1{3}$/.test(last4)) return 'Tứ quý';

        // Tam hoa kép (ví dụ: 111.222 hoặc 666.888)
        if (last6.length === 6 && last6[0] === last6[1] && last6[1] === last6[2] && last6[3] === last6[4] && last6[4] === last6[5]) {
            return 'Tam hoa';
        }

        // Tam hoa đuôi (ví dụ: 888, 999)
        if (last3.length === 3 && /^(\d)\1{2}$/.test(last3)) return 'Tam hoa';

        // Lộc phát (đuôi 68, 86, 6868, 8686, 6886)
        if (digits.endsWith('6868') || digits.endsWith('8686') || digits.endsWith('6886') || last2 === '68' || last2 === '86') {
            return 'Lộc phát';
        }

        // Thần tài (đuôi 39, 79, 3979, 7939)
        if (digits.endsWith('3979') || digits.endsWith('7939') || last2 === '39' || last2 === '79') {
            return 'Thần tài';
        }

        // Sảnh tiến (ví dụ: 1234, 4567, 5678, 6789, 345678)
        if (digits.length >= 4) {
            let isAscending = true;
            for (let i = digits.length - 4; i < digits.length - 1; i++) {
                if (Number(digits[i + 1]) !== Number(digits[i]) + 1) {
                    isAscending = false;
                    break;
                }
            }
            if (isAscending) return 'Tiến';
        }

        // Gánh / Đảo / Lặp (ví dụ 886.688, 52.52.52)
        if (last4.length === 4 && last4.slice(0, 2) === last4.slice(2, 4)) return 'Đảo';
        if (last3.length === 3 && last3[0] === last3[2]) return 'Gánh';

        return 'Số đẹp';
    }

    function parsePriceInput(str) {
        if (!str && str !== 0) return 0;
        let s = String(str).toLowerCase().trim();
        if (!s) return 0;

        // Bỏ ký tự tiền tệ ở đuôi: đ, vnd, vnđ, d
        s = s.replace(/(đ|vnd|vnđ|d)$/gi, '').trim();

        // 12tr5, 1tr2, 5tr8 (số triệu + tr + số trăm nghìn)
        const tr5Match = s.match(/^(\d+)\s*tr\s*(\d+)$/i);
        if (tr5Match) {
            const million = Number(tr5Match[1]);
            const frac = tr5Match[2];
            const decimal = parseFloat(`${million}.${frac}`);
            return isNaN(decimal) ? 0 : Math.round(decimal * 1000000);
        }

        // 15tr, 15.5tr, 15,5tr, 45 triệu, 45m
        if (s.includes('tr') || s.includes('triệu') || s.includes('trieu') || s.endsWith('m')) {
            const clean = s.replace(/(tr|triệu|trieu|m)/gi, '').replace(/,/g, '.').trim();
            const num = parseFloat(clean);
            return isNaN(num) ? 0 : Math.round(num * 1000000);
        }

        // 500k, 500 nghìn
        if (s.includes('k') || s.includes('nghìn') || s.includes('nghin')) {
            const clean = s.replace(/(k|nghìn|nghin)/gi, '').replace(/,/g, '.').trim();
            const num = parseFloat(clean);
            return isNaN(num) ? 0 : Math.round(num * 1000);
        }

        // Định dạng có dấu chấm hoặc dấu phẩy phân cách: 15.000.000 hoặc 15,000,000
        if (/\d+([.,]\d{3})+/.test(s)) {
            const clean = s.replace(/[.,]/g, '');
            return Number(clean) || 0;
        }

        // Số thông thường: 15000000
        const clean = s.replace(/[^0-9]/g, '');
        return Number(clean) || 0;
    }

    function parseQuickAddLine(line) {
        line = line.trim();
        if (!line) return null;

        // Tìm số điện thoại (bắt đầu bằng 0, có 10-11 chữ số)
        const phoneMatch = line.match(/(0\d{1,3}[\s.]?\d{3}[\s.]?\d{3,4}|0\d{9,10})/);
        if (!phoneMatch) return null;

        const rawPhone = phoneMatch[0];
        const cleanPhone = rawPhone.replace(/\D/g, '');
        if (cleanPhone.length < 10) return null;

        // Phần còn lại của dòng (sau khi bỏ số điện thoại)
        const rest = line.replace(rawPhone, '').replace(/[-:]/g, ' ').trim();

        // Tìm giá tiền trong phần còn lại (hỗ trợ 15tr5, 15.000.000, 15tr, 500k, 15000000...)
        let price = 0;
        let notes = '';

        const priceTokenMatch = rest.match(/(\d+\s*tr\s*\d+|\d+[.,]?\d*\s*(tr|triệu|trieu|m|k|nghìn|nghin)|\d{1,3}([.,]\d{3})+|\d{5,12})/i);
        if (priceTokenMatch) {
            price = parsePriceInput(priceTokenMatch[0]);
            notes = rest.replace(priceTokenMatch[0], '').replace(/^(giá|gia|g:|-|:)\s*/i, '').trim();
        } else {
            notes = rest.replace(/^(giá|gia|g:|-|:)\s*/i, '').trim();
        }

        const network = detectCarrier(cleanPhone) || 'Viettel';
        const type = detectSimType(cleanPhone);

        return {
            phone_number: formatPhoneDisplay(cleanPhone),
            number: formatPhoneDisplay(cleanPhone),
            raw_phone: cleanPhone,
            network,
            type,
            sim_type: type,
            cost_price: 0,
            ctv_price: 0,
            price,
            status: 'Còn hàng',
            notes
        };
    }

    // =============================================
    // Toast Notifications
    // =============================================
    function showToast(message, type = 'info') {
        const container = $('#toast-container');
        if (!container) return;
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas ${icons[type] || 'fa-info-circle'} toast-icon"></i>
            <span class="toast-message">${message}</span>
            <button class="toast-close"><i class="fas fa-times"></i></button>
        `;

        container.appendChild(toast);

        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) closeBtn.addEventListener('click', () => removeToast(toast));

        setTimeout(() => removeToast(toast), 3500);
    }

    function removeToast(toast) {
        if (!toast || !toast.parentNode) return;
        toast.classList.add('toast-out');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    }

    // =============================================
    // Loading
    // =============================================
    function showLoading() {
        const overlay = $('#loading-overlay');
        if (overlay) overlay.classList.remove('hidden');
    }

    function hideLoading() {
        const overlay = $('#loading-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    // =============================================
    // API
    // =============================================
    async function apiRequest(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        if (state.adminPin) {
            headers['x-admin-pin'] = state.adminPin;
        }
        const config = { ...options, headers };

        try {
            const response = await fetch(url, config);
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.message || `Lỗi ${response.status}`);
            }
            const text = await response.text();
            return text ? JSON.parse(text) : {};
        } catch (err) {
            if (err.name === 'TypeError' && err.message.includes('fetch')) {
                throw new Error('Không thể kết nối đến server');
            }
            throw err;
        }
    }

    async function fetchSims() {
        try {
            showLoading();
            const data = await apiRequest(API_BASE);
            if (data && data.is_admin !== undefined) {
                state.isAdmin = Boolean(data.is_admin);
                updateAuthUI();
            }
            const rawSims = Array.isArray(data) ? data : (data.data || data.sims || []);
            state.sims = rawSims.map(s => ({
                ...s,
                id: getSimId(s),
                number: getSimPhone(s),
                phone_number: getSimPhone(s),
                type: getSimType(s),
                sim_type: getSimType(s),
                cost_price: Number(s.cost_price || s.gia_goc || 0),
                ctv_price: Number(s.ctv_price || s.gia_ctv || 0),
                price: Number(s.price || s.gia_ban || 0)
            }));
            applyFiltersAndSort();
            renderDashboard();
        } catch (err) {
            console.error('Fetch SIMs error:', err);
            showToast('Không thể tải dữ liệu SIM: ' + err.message, 'error');
            state.sims = [];
            applyFiltersAndSort();
            renderDashboard();
        } finally {
            hideLoading();
        }
    }

    async function createSim(simData) {
        const payload = {
            phone_number: simData.number || simData.phone_number,
            number: simData.number || simData.phone_number,
            network: simData.network,
            sim_type: simData.type || simData.sim_type,
            type: simData.type || simData.sim_type,
            cost_price: simData.cost_price || 0,
            gia_goc: simData.cost_price || 0,
            ctv_price: simData.ctv_price || 0,
            gia_ctv: simData.ctv_price || 0,
            price: simData.price || 0,
            gia_ban: simData.price || 0,
            status: simData.status,
            notes: simData.notes
        };
        const result = await apiRequest(API_BASE, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        return result;
    }

    async function updateSim(id, simData) {
        try {
            showLoading();
            const payload = {
                phone_number: simData.number || simData.phone_number,
                number: simData.number || simData.phone_number,
                network: simData.network,
                sim_type: simData.type || simData.sim_type,
                type: simData.type || simData.sim_type,
                cost_price: simData.cost_price !== undefined ? simData.cost_price : 0,
                gia_goc: simData.cost_price !== undefined ? simData.cost_price : 0,
                ctv_price: simData.ctv_price !== undefined ? simData.ctv_price : 0,
                gia_ctv: simData.ctv_price !== undefined ? simData.ctv_price : 0,
                price: simData.price || 0,
                gia_ban: simData.price || 0,
                status: simData.status,
                notes: simData.notes
            };
            const result = await apiRequest(`${API_BASE}/${id}`, {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            showToast('Cập nhật SIM thành công!', 'success');
            await fetchSims();
            return result;
        } catch (err) {
            showToast('Lỗi cập nhật SIM: ' + err.message, 'error');
            throw err;
        } finally {
            hideLoading();
        }
    }

    async function deleteSim(id) {
        try {
            showLoading();
            await apiRequest(`${API_BASE}/${id}`, { method: 'DELETE' });
            showToast('Đã xóa SIM thành công!', 'success');
            await fetchSims();
        } catch (err) {
            showToast('Lỗi xóa SIM: ' + err.message, 'error');
            throw err;
        } finally {
            hideLoading();
        }
    }

    async function bulkDeleteSims(ids) {
        try {
            showLoading();
            const result = await apiRequest(`${API_BASE}/bulk-delete`, {
                method: 'POST',
                body: JSON.stringify({ ids })
            });
            showToast(result.message || `Đã xóa ${ids.length} SIM thành công!`, 'success');
            state.selectedSims.clear();
            await fetchSims();
            return result;
        } catch (err) {
            showToast('Lỗi xóa SIM hàng loạt: ' + err.message, 'error');
            throw err;
        } finally {
            hideLoading();
        }
    }

    async function bulkImportSims(simsArray) {
        try {
            showLoading();
            const csvLines = simsArray.map(s => `${getSimPhone(s)},${s.network},${getSimType(s)},${s.price},${s.status},${s.notes || ''}`).join('\n');
            const result = await apiRequest(`${API_BASE}/bulk`, {
                method: 'POST',
                body: JSON.stringify({ csv: csvLines })
            });
            showToast(`Đã nhập thành công!`, 'success');
            await fetchSims();
            return result;
        } catch (err) {
            showToast('Lỗi nhập dữ liệu: ' + err.message, 'error');
            throw err;
        } finally {
            hideLoading();
        }
    }

    // =============================================
    // Navigation
    // =============================================
    function initNavigation() {
        const navItems = $$('[data-page]');
        const pageTitles = {
            dashboard: '<i class="fas fa-chart-pie"></i> Tổng quan',
            manage: '<i class="fas fa-th-list"></i> Quản lý SIM',
            zalo: '<i class="fas fa-share-alt"></i> Đăng Zalo'
        };

        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                switchPage(page, pageTitles[page]);
            });
        });
    }

    function switchPage(page, titleHtml) {
        $$('[data-page]').forEach(el => el.classList.remove('active'));
        $$(`[data-page="${page}"]`).forEach(el => el.classList.add('active'));

        $$('.page').forEach(p => p.classList.remove('active'));
        const pageEl = $(`#page-${page}`);
        if (pageEl) pageEl.classList.add('active');

        if (titleHtml) {
            const titleEl = $('#page-title');
            if (titleEl) titleEl.innerHTML = titleHtml;
        }

        if (page === 'dashboard') {
            renderDashboard();
        } else if (page === 'manage') {
            renderSimList();
        } else if (page === 'zalo') {
            renderZaloSimList();
            generateZaloPreview();
        }
    }

    // =============================================
    // Xác thực Chủ Shop (Mã PIN: 1102) & Phân quyền
    // =============================================
    function updateAuthUI() {
        const topBtn = $('#btn-auth-mode');
        const sidebarBtn = $('#sidebar-btn-auth-mode');
        const costToggleBtn = $('#btn-toggle-cost');
        const addSimBtn = $('#btn-add-sim');
        const quickAddBtn = $('#btn-quick-add');
        const bulkImportBtn = $('#btn-bulk-import');
        const costHeader = $('.col-cost');
        const costStatBoxes = $$('.stat-cost-box, .stat-profit-box');

        if (state.isAdmin) {
            // Chủ Shop Mode
            if (topBtn) {
                topBtn.className = 'btn btn-sm';
                topBtn.style.background = '#e6f4ea';
                topBtn.style.color = '#137333';
                topBtn.style.border = '1px solid #34a853';
                topBtn.innerHTML = '<i class="fas fa-crown" style="color:#f29900;"></i> <span>Chủ Shop</span> <small style="opacity:0.8;font-size:11px;">(Đăng xuất)</small>';
                topBtn.title = 'Đang ở quyền Chủ Shop (PIN: 1102). Bấm để thoát về chế độ CTV';
            }
            if (sidebarBtn) {
                sidebarBtn.style.borderColor = '#ea4335';
                sidebarBtn.style.color = '#ea4335';
                sidebarBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> <span>Đăng xuất Chủ Shop</span>';
                sidebarBtn.title = 'Chuyển về giao diện CTV';
            }
            if (costToggleBtn) costToggleBtn.style.display = '';
            if (addSimBtn) addSimBtn.style.display = '';
            if (quickAddBtn) quickAddBtn.style.display = '';
            if (bulkImportBtn) bulkImportBtn.style.display = '';
            costStatBoxes.forEach(el => el.style.display = '');
            if (costHeader) costHeader.style.display = state.showCostPrice ? '' : 'none';
        } else {
            // CTV Mode (Khách xem & Cộng tác viên)
            if (topBtn) {
                topBtn.className = 'btn btn-sm btn-outline';
                topBtn.style.background = '#fff';
                topBtn.style.color = '#1a73e8';
                topBtn.style.border = '1px solid #1a73e8';
                topBtn.innerHTML = '<i class="fas fa-key"></i> <span>Chủ Shop Đăng Nhập</span>';
                topBtn.title = 'Chỉ dành cho Chủ Shop (nhập mã PIN 1102)';
            }
            if (sidebarBtn) {
                sidebarBtn.style.borderColor = '#1a73e8';
                sidebarBtn.style.color = '#1a73e8';
                sidebarBtn.innerHTML = '<i class="fas fa-key"></i> <span>Chủ Shop Đăng Nhập</span>';
                sidebarBtn.title = 'Chỉ dành cho Chủ Shop (nhập mã PIN 1102)';
            }
            if (costToggleBtn) costToggleBtn.style.display = 'none';
            if (addSimBtn) addSimBtn.style.display = 'none';
            if (quickAddBtn) quickAddBtn.style.display = 'none';
            if (bulkImportBtn) bulkImportBtn.style.display = 'none';
            costStatBoxes.forEach(el => el.style.display = 'none');
            if (costHeader) costHeader.style.display = 'none';
        }
    }

    function initAuthModal() {
        const modal = $('#modal-auth');
        const input = $('#input-admin-pin');
        const submitBtn = $('#btn-submit-auth');
        const cancelBtn = $('#modal-auth-cancel');
        const closeBtn = $('#modal-auth-close');
        const errorMsg = $('#auth-error-msg');
        const topBtn = $('#btn-auth-mode');
        const sidebarBtn = $('#sidebar-btn-auth-mode');

        function openModal() {
            if (errorMsg) errorMsg.textContent = '';
            if (input) input.value = '';
            modal.classList.remove('hidden');
            setTimeout(() => input && input.focus(), 150);
        }

        function closeModal() {
            modal.classList.add('hidden');
            if (input) input.value = '';
        }

        function handleAuthButtonClick() {
            if (state.isAdmin) {
                if (confirm('Bạn muốn thoát quyền Chủ Shop và xem trang ở chế độ CTV / Khách?')) {
                    logoutAdmin();
                }
            } else {
                openModal();
            }
        }

        if (topBtn) topBtn.addEventListener('click', handleAuthButtonClick);
        if (sidebarBtn) sidebarBtn.addEventListener('click', handleAuthButtonClick);
        if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        async function doLogin() {
            const pin = (input ? input.value : '').trim();
            if (!pin) {
                if (errorMsg) errorMsg.textContent = 'Vui lòng nhập mã PIN';
                return;
            }

            try {
                showLoading();
                const res = await fetch('/api/auth/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin })
                });
                const data = await res.json();
                if (data.success) {
                    state.adminPin = pin;
                    state.isAdmin = true;
                    state.showCostPrice = true;
                    localStorage.setItem('sim_admin_pin', pin);
                    localStorage.setItem('sim_show_cost', 'true');
                    closeModal();
                    updateAuthUI();
                    showToast('👑 Đăng nhập Chủ Shop thành công! Đã mở khóa Giá gốc & Toàn quyền.', 'success');
                    await fetchSims();
                } else {
                    if (errorMsg) errorMsg.textContent = data.error || 'Mã PIN không chính xác!';
                    if (input) {
                        input.select();
                        input.focus();
                    }
                }
            } catch (err) {
                if (errorMsg) errorMsg.textContent = 'Lỗi kết nối máy chủ';
            } finally {
                hideLoading();
            }
        }

        if (submitBtn) submitBtn.addEventListener('click', doLogin);
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    doLogin();
                }
            });
        }
    }

    async function logoutAdmin() {
        state.adminPin = '';
        state.isAdmin = false;
        state.showCostPrice = false;
        localStorage.removeItem('sim_admin_pin');
        localStorage.setItem('sim_show_cost', 'false');
        updateAuthUI();
        showToast('Đã đăng xuất Chủ Shop. Đang ở chế độ CTV / Khách xem.', 'info');
        await fetchSims();
    }

    async function checkInitialAuth() {
        const urlParams = new URLSearchParams(window.location.search);
        const pinFromUrl = urlParams.get('pin') || urlParams.get('admin_pin');
        if (pinFromUrl) {
            localStorage.setItem('sim_admin_pin', pinFromUrl);
            state.adminPin = pinFromUrl;
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            state.adminPin = localStorage.getItem('sim_admin_pin') || '';
        }

        if (state.adminPin) {
            try {
                const res = await fetch('/api/auth/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin: state.adminPin })
                });
                const data = await res.json();
                if (data.success) {
                    state.isAdmin = true;
                } else {
                    state.isAdmin = false;
                    state.adminPin = '';
                    localStorage.removeItem('sim_admin_pin');
                }
            } catch (err) {
                if (state.adminPin === '1102') {
                    state.isAdmin = true;
                }
            }
        }
        updateAuthUI();
    }

    // =============================================
    // Ẩn / Hiện Giá Gốc (Bảo mật cho chủ shop)
    // =============================================
    function initCostToggle() {
        const btn = $('#btn-toggle-cost');
        if (!btn) return;

        function updateBtnUI() {
            const icon = $('#icon-toggle-cost');
            const text = $('#text-toggle-cost');
            if (state.showCostPrice) {
                if (icon) icon.className = 'fas fa-eye';
                if (text) text.textContent = 'Giá gốc: Hiện';
                btn.style.color = '#b78103';
                btn.style.borderColor = '#ffa000';
                btn.style.background = '#fff8e1';
            } else {
                if (icon) icon.className = 'fas fa-eye-slash';
                if (text) text.textContent = 'Giá gốc: Ẩn';
                btn.style.color = '';
                btn.style.borderColor = '';
                btn.style.background = '';
            }
        }

        updateBtnUI();

        btn.addEventListener('click', () => {
            state.showCostPrice = !state.showCostPrice;
            localStorage.setItem('sim_show_cost', state.showCostPrice);
            updateBtnUI();
            renderSimList();
            renderDashboard();
            showToast(state.showCostPrice ? 'Đã hiện Giá gốc & Lợi nhuận (Chỉ chủ thấy)' : 'Đã ẩn Giá gốc (Chế độ an toàn cho khách xem)', 'info');
        });
    }

    // =============================================
    // Filters & Sort
    // =============================================
    function applyFiltersAndSort() {
        let list = [...state.sims];

        if (state.filters.search) {
            const q = state.filters.search.toLowerCase().replace(/\D/g, '');
            list = list.filter(s => {
                const num = getSimPhone(s).replace(/\D/g, '');
                return num.includes(q);
            });
        }

        if (state.filters.network) {
            list = list.filter(s => s.network === state.filters.network);
        }

        if (state.filters.type) {
            list = list.filter(s => getSimType(s) === state.filters.type);
        }

        if (state.filters.status) {
            list = list.filter(s => s.status === state.filters.status);
        }

        if (state.filters.priceMin !== null) {
            list = list.filter(s => (s.price || 0) >= state.filters.priceMin);
        }
        if (state.filters.priceMax !== null) {
            list = list.filter(s => (s.price || 0) <= state.filters.priceMax);
        }

        list.sort((a, b) => {
            switch (state.currentSort) {
                case 'date-desc': return new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0);
                case 'date-asc': return new Date(a.created_at || a.createdAt || 0) - new Date(b.created_at || b.createdAt || 0);
                case 'price-asc': return (a.price || 0) - (b.price || 0);
                case 'price-desc': return (b.price || 0) - (a.price || 0);
                case 'number-asc': return getSimPhone(a).localeCompare(getSimPhone(b));
                case 'number-desc': return getSimPhone(b).localeCompare(getSimPhone(a));
                default: return 0;
            }
        });

        state.filteredSims = list;
        state.currentPage = 1;
        renderSimList();
    }

    function initFilters() {
        const toggleBtn = $('#btn-filter-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const panel = $('#filters-panel');
                if (panel) panel.classList.toggle('hidden');
            });
        }

        const applyBtn = $('#btn-apply-filters');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                state.filters.network = $('#filter-network').value;
                state.filters.type = $('#filter-type').value;
                state.filters.status = $('#filter-status').value;
                state.filters.priceMin = $('#filter-price-min').value ? Number($('#filter-price-min').value) : null;
                state.filters.priceMax = $('#filter-price-max').value ? Number($('#filter-price-max').value) : null;
                applyFiltersAndSort();
            });
        }

        const clearBtn = $('#btn-clear-filters');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                $('#filter-network').value = '';
                $('#filter-type').value = '';
                $('#filter-status').value = '';
                $('#filter-price-min').value = '';
                $('#filter-price-max').value = '';
                state.filters = { search: '', network: '', type: '', status: '', priceMin: null, priceMax: null };
                applyFiltersAndSort();
            });
        }

        const searchInput = $('#search-input');
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                state.filters.search = e.target.value;
                applyFiltersAndSort();
            }, 300));
        }

        const sortSelect = $('#sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                state.currentSort = e.target.value;
                applyFiltersAndSort();
            });
        }
    }

    function initViewToggle() {
        const btn = $('#btn-toggle-view');
        if (!btn) return;
        btn.addEventListener('click', () => {
            if (state.viewMode === 'table') {
                state.viewMode = 'cards';
                btn.innerHTML = '<i class="fas fa-table"></i>';
            } else {
                state.viewMode = 'table';
                btn.innerHTML = '<i class="fas fa-th-large"></i>';
            }
            renderSimList();
        });
    }

    // =============================================
    // Dashboard Rendering
    // =============================================
    function renderDashboard() {
        const sims = state.sims;
        const total = sims.length;
        const availableSims = sims.filter(s => s.status === 'Còn hàng');
        const available = availableSims.length;
        const sold = sims.filter(s => s.status === 'Đã bán').length;
        const totalValue = availableSims.reduce((sum, s) => sum + (s.price || 0), 0);
        const totalCost = availableSims.reduce((sum, s) => sum + (s.cost_price || 0), 0);
        const expectedProfit = availableSims.reduce((sum, s) => sum + Math.max(0, (s.price || 0) - (s.cost_price || 0)), 0);

        if ($('#stat-total')) $('#stat-total').textContent = total;
        if ($('#stat-available')) $('#stat-available').textContent = available;
        if ($('#stat-sold')) $('#stat-sold').textContent = sold;
        if ($('#stat-value')) $('#stat-value').textContent = formatPrice(totalValue);

        // Giá gốc & Lợi nhuận (chỉ tính & hiện khi là Chủ Shop)
        if ($('#stat-cost')) {
            $('#stat-cost').textContent = (state.isAdmin && state.showCostPrice) ? formatPrice(totalCost) : '••••••';
        }
        if ($('#stat-profit')) {
            $('#stat-profit').textContent = (state.isAdmin && state.showCostPrice) ? formatPrice(expectedProfit) : '••••••';
        }

        renderNetworkChart();
        renderRecentSims();
    }

    function renderNetworkChart() {
        const sims = state.sims;
        const networkCounts = {};
        sims.forEach(s => {
            const net = s.network || 'Khác';
            networkCounts[net] = (networkCounts[net] || 0) + 1;
        });

        const total = sims.length || 1;
        const entries = Object.entries(networkCounts).sort((a, b) => b[1] - a[1]);

        let gradientParts = [];
        let cumPercent = 0;

        entries.forEach(([network, count]) => {
            const pct = (count / total) * 100;
            const color = NETWORK_COLORS[network] || '#9e9e9e';
            gradientParts.push(`${color} ${cumPercent}% ${cumPercent + pct}%`);
            cumPercent += pct;
        });

        const chart = $('#network-chart');
        if (chart) {
            if (entries.length > 0) {
                chart.style.background = `conic-gradient(${gradientParts.join(', ')})`;
            } else {
                chart.style.background = 'var(--border-light)';
            }
        }
    }

    function renderRecentSims() {
        const recent = [...state.sims].slice(0, 5);
        const container = $('#recent-sims-list');
        if (!container) return;

        if (recent.length === 0) {
            container.innerHTML = `
                <div class="empty-state small">
                    <i class="fas fa-inbox"></i>
                    <p>Chưa có SIM nào</p>
                    <p class="empty-sub">Thêm SIM đầu tiên để bắt đầu</p>
                </div>
            `;
            return;
        }

        container.innerHTML = recent.map(sim => {
            const phone = formatPhoneDisplay(getSimPhone(sim));
            const statusBadge = getStatusBadgeClass(sim.status);
            return `
                <div class="recent-sim-item">
                    <div>
                        <div class="recent-sim-number">${phone}</div>
                        <div class="recent-sim-details">
                            <span class="badge badge-network">${sim.network || ''}</span>
                            <span class="badge badge-type">${getSimType(sim)}</span>
                            <span class="badge ${statusBadge}">${sim.status || ''}</span>
                        </div>
                    </div>
                    <span class="recent-sim-price">${formatPrice(sim.price)}</span>
                </div>
            `;
        }).join('');
    }

    function getStatusBadgeClass(status) {
        switch (status) {
            case 'Còn hàng': return 'badge-status-available';
            case 'Đã bán': return 'badge-status-sold';
            case 'Đã giữ': return 'badge-status-held';
            default: return 'badge-status-available';
        }
    }

    // =============================================
    // SIM List Rendering
    // =============================================
    function renderSimList() {
        const total = state.filteredSims.length;
        const totalPages = Math.ceil(total / ITEMS_PER_PAGE) || 1;
        if (state.currentPage > totalPages) state.currentPage = totalPages;

        const start = (state.currentPage - 1) * ITEMS_PER_PAGE;
        const pageItems = state.filteredSims.slice(start, start + ITEMS_PER_PAGE);

        if ($('#result-count')) $('#result-count').textContent = `${total} SIM`;

        // Ẩn/Hiện cột Giá gốc trên tiêu đề bảng
        const costHeader = $('.col-cost');
        if (costHeader) {
            costHeader.style.display = (state.isAdmin && state.showCostPrice) ? '' : 'none';
        }

        const hasSelection = state.selectedSims.size > 0;
        if ($('#btn-select-all')) $('#btn-select-all').style.display = total > 0 ? '' : 'none';
        if ($('#btn-post-selected')) $('#btn-post-selected').style.display = hasSelection ? '' : 'none';
        if ($('#btn-delete-selected')) $('#btn-delete-selected').style.display = (state.isAdmin && hasSelection) ? '' : 'none';
        if ($('#selected-count')) $('#selected-count').textContent = state.selectedSims.size;
        if ($('#delete-selected-count')) $('#delete-selected-count').textContent = state.selectedSims.size;

        const emptyEl = $('#manage-empty');
        if (total === 0) {
            if (emptyEl) emptyEl.classList.remove('hidden');
            if ($('#sim-table-wrapper')) $('#sim-table-wrapper').classList.add('hidden');
            if ($('#sim-cards-grid')) $('#sim-cards-grid').classList.add('hidden');
        } else {
            if (emptyEl) emptyEl.classList.add('hidden');
            renderTable(pageItems);
            renderCards(pageItems);

            if (window.innerWidth >= 768) {
                if (state.viewMode === 'table') {
                    if ($('#sim-table-wrapper')) $('#sim-table-wrapper').classList.remove('hidden');
                    if ($('#sim-cards-grid')) $('#sim-cards-grid').classList.add('hidden');
                } else {
                    if ($('#sim-table-wrapper')) $('#sim-table-wrapper').classList.add('hidden');
                    if ($('#sim-cards-grid')) $('#sim-cards-grid').classList.remove('hidden');
                }
            }
        }

        renderPagination(totalPages);
    }

    function renderTable(items) {
        const tbody = $('#sim-table-body');
        if (!tbody) return;

        tbody.innerHTML = items.map(sim => {
            const id = getSimId(sim);
            const rawPhone = getSimPhone(sim);
            const phone = formatPhoneDisplay(rawPhone);
            const checked = state.selectedSims.has(id) ? 'checked' : '';
            const selectedClass = state.selectedSims.has(id) ? 'selected' : '';
            const statusBadge = getStatusBadgeClass(sim.status);

            const costDisplay = (state.isAdmin && state.showCostPrice)
                ? `<span style="color:#b78103;font-weight:600;">${formatPrice(sim.cost_price || 0)}</span>`
                : `<span style="letter-spacing:2px;color:#bbb;">••••••</span>`;
            
            const costTd = state.isAdmin ? `
                <td class="col-cost" style="background:${state.showCostPrice ? '#fffde7' : ''}; display:${state.showCostPrice ? '' : 'none'};">${costDisplay}</td>
            ` : '';

            const ctvDisplay = `<span style="color:#1a73e8;font-weight:600;">${formatPrice(sim.ctv_price || 0)}</span>`;
            const retailDisplay = `<strong style="color:#ea4335;">${formatPrice(sim.price || 0)}</strong>`;

            const actionBtns = state.isAdmin ? `
                <div class="action-btns">
                    <button type="button" class="btn btn-sm btn-outline btn-edit" data-id="${id}" title="Sửa SIM">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline text-danger btn-delete" data-id="${id}" title="Xóa SIM">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            ` : `
                <div class="action-btns">
                    <button type="button" class="btn btn-sm btn-outline btn-copy-sim" data-phone="${rawPhone}" title="Sao chép số điện thoại">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                </div>
            `;

            return `
                <tr class="${selectedClass}" data-id="${id}">
                    <td class="col-check">
                        <input type="checkbox" class="sim-checkbox" data-id="${id}" ${checked}>
                    </td>
                    <td class="sim-number-cell"><strong>${phone}</strong></td>
                    <td><span class="badge badge-network">${sim.network || ''}</span></td>
                    <td><span class="badge badge-type">${getSimType(sim)}</span></td>
                    ${costTd}
                    <td style="background:#f8fbff;">${ctvDisplay}</td>
                    <td class="sim-price-cell">${retailDisplay}</td>
                    <td><span class="badge ${statusBadge}">${sim.status || ''}</span></td>
                    <td>${actionBtns}</td>
                </tr>
            `;
        }).join('');

        // Checkbox events
        tbody.querySelectorAll('.sim-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = String(e.target.dataset.id);
                if (e.target.checked) {
                    state.selectedSims.add(id);
                } else {
                    state.selectedSims.delete(id);
                }
                const row = tbody.querySelector(`tr[data-id="${id}"]`);
                if (row) {
                    if (e.target.checked) row.classList.add('selected');
                    else row.classList.remove('selected');
                }
                const hasSelection = state.selectedSims.size > 0;
                if ($('#btn-post-selected')) $('#btn-post-selected').style.display = hasSelection ? '' : 'none';
                if ($('#btn-delete-selected')) $('#btn-delete-selected').style.display = (state.isAdmin && hasSelection) ? '' : 'none';
                if ($('#selected-count')) $('#selected-count').textContent = state.selectedSims.size;
                if ($('#delete-selected-count')) $('#delete-selected-count').textContent = state.selectedSims.size;
            });
        });

        // Edit/Delete events
        tbody.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openEditModal(btn.dataset.id);
            });
        });
        tbody.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openDeleteModal(btn.dataset.id);
            });
        });

        // Copy button for CTV
        tbody.querySelectorAll('.btn-copy-sim').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const phone = btn.dataset.phone;
                navigator.clipboard.writeText(phone.replace(/\D/g, '')).then(() => {
                    showToast(`Đã sao chép: ${formatPhoneDisplay(phone)}`, 'success');
                }).catch(() => {
                    showToast(`Số: ${phone}`, 'info');
                });
            });
        });
    }

    function renderCards(items) {
        const grid = $('#sim-cards-grid');
        if (!grid) return;

        grid.innerHTML = items.map(sim => {
            const id = getSimId(sim);
            const rawPhone = getSimPhone(sim);
            const phone = formatPhoneDisplay(rawPhone);
            const checked = state.selectedSims.has(id) ? 'checked' : '';
            const selectedClass = state.selectedSims.has(id) ? 'selected' : '';
            const statusBadge = getStatusBadgeClass(sim.status);

            const costText = (state.isAdmin && state.showCostPrice) ? formatPrice(sim.cost_price || 0) : '••••';
            const costBox = state.isAdmin ? `<div><small style="color:#b78103;">Gốc:</small> <strong>${costText}</strong></div>` : '';

            const cardActions = state.isAdmin ? `
                <div class="sim-card-actions">
                    <button type="button" class="btn btn-sm btn-outline btn-edit" data-id="${id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="btn btn-sm btn-outline text-danger btn-delete" data-id="${id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            ` : `
                <div class="sim-card-actions">
                    <button type="button" class="btn btn-sm btn-outline btn-copy-sim" data-phone="${rawPhone}" title="Sao chép số">
                        <i class="fas fa-copy"></i> Copy
                    </button>
                </div>
            `;

            return `
                <div class="sim-card-item ${selectedClass}" data-id="${id}">
                    <div class="sim-card-top">
                        <span class="sim-card-number">${phone}</span>
                        <input type="checkbox" class="sim-card-checkbox sim-checkbox" data-id="${id}" ${checked}>
                    </div>
                    <div class="sim-card-meta">
                        <span class="badge badge-network">${sim.network || ''}</span>
                        <span class="badge badge-type">${getSimType(sim)}</span>
                        <span class="badge ${statusBadge}">${sim.status || ''}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:12px;margin:8px 0;padding:6px 8px;background:#f8f9fa;border-radius:6px;">
                        ${costBox}
                        <div><small style="color:#1a73e8;">CTV:</small> <strong>${formatPrice(sim.ctv_price || 0)}</strong></div>
                        <div><small style="color:#ea4335;">Lẻ:</small> <strong style="color:#ea4335;">${formatPrice(sim.price || 0)}</strong></div>
                    </div>
                    <div class="sim-card-bottom">
                        <span class="sim-card-price" style="font-size:14px;">Bán: ${formatPrice(sim.price)}</span>
                        ${cardActions}
                    </div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.sim-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = String(e.target.dataset.id);
                if (e.target.checked) state.selectedSims.add(id);
                else state.selectedSims.delete(id);
                const hasSelection = state.selectedSims.size > 0;
                if ($('#btn-post-selected')) $('#btn-post-selected').style.display = hasSelection ? '' : 'none';
                if ($('#btn-delete-selected')) $('#btn-delete-selected').style.display = (state.isAdmin && hasSelection) ? '' : 'none';
                if ($('#selected-count')) $('#selected-count').textContent = state.selectedSims.size;
                if ($('#delete-selected-count')) $('#delete-selected-count').textContent = state.selectedSims.size;
            });
        });

        // Edit/Delete for cards
        grid.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openEditModal(btn.dataset.id);
            });
        });
        grid.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openDeleteModal(btn.dataset.id);
            });
        });
        grid.querySelectorAll('.btn-copy-sim').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const phone = btn.dataset.phone;
                navigator.clipboard.writeText(phone.replace(/\D/g, '')).then(() => {
                    showToast(`Đã sao chép: ${formatPhoneDisplay(phone)}`, 'success');
                }).catch(() => {
                    showToast(`Số: ${phone}`, 'info');
                });
            });
        });
    }

    function renderPagination(totalPages) {
        const container = $('#pagination');
        if (!container) return;
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = '';
        html += `<button class="page-btn" data-page="${state.currentPage - 1}" ${state.currentPage <= 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;

        const maxVisible = 5;
        let startPage = Math.max(1, state.currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        if (startPage > 1) {
            html += `<button class="page-btn" data-page="1">1</button>`;
            if (startPage > 2) html += `<span style="padding:0 4px;color:var(--text-muted)">…</span>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="page-btn ${i === state.currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<span style="padding:0 4px;color:var(--text-muted)">…</span>`;
            html += `<button class="page-btn" data-page="${totalPages}">${totalPages}</button>`;
        }

        html += `<button class="page-btn" data-page="${state.currentPage + 1}" ${state.currentPage >= totalPages ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
        container.innerHTML = html;

        container.querySelectorAll('.page-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = parseInt(btn.dataset.page);
                if (p >= 1 && p <= totalPages) {
                    state.currentPage = p;
                    renderSimList();
                    $('#page-manage').scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }

    // =============================================
    // Select All / Post Selected
    // =============================================
    function initSelectionActions() {
        const selectAllBtn = $('#btn-select-all');
        if (selectAllBtn) {
            selectAllBtn.addEventListener('click', () => {
                const allSelected = state.filteredSims.every(s => state.selectedSims.has(getSimId(s)));
                if (allSelected) {
                    state.filteredSims.forEach(s => state.selectedSims.delete(getSimId(s)));
                } else {
                    state.filteredSims.forEach(s => state.selectedSims.add(getSimId(s)));
                }
                renderSimList();
            });
        }

        const postSelectedBtn = $('#btn-post-selected');
        if (postSelectedBtn) {
            postSelectedBtn.addEventListener('click', () => {
                const selectedSimObjects = state.sims.filter(s => state.selectedSims.has(getSimId(s)));
                state.zaloSelectedSims = selectedSimObjects;
                switchPage('zalo', '<i class="fas fa-share-alt"></i> Đăng Zalo');
                renderZaloSelectedChips();
                generateZaloPreview();
            });
        }

        const deleteSelectedBtn = $('#btn-delete-selected');
        if (deleteSelectedBtn) {
            deleteSelectedBtn.addEventListener('click', () => {
                if (state.selectedSims.size === 0) return;
                state.isBulkDelete = true;
                const count = state.selectedSims.size;
                const modal = $('#modal-delete');
                if ($('#delete-confirm-message')) {
                    $('#delete-confirm-message').innerHTML = `Bạn có chắc chắn muốn xóa <strong style="color:#ea4335;">${count} SIM</strong> đã chọn?`;
                }
                modal.classList.remove('hidden');
            });
        }

        const checkAll = $('#check-all');
        if (checkAll) {
            checkAll.addEventListener('change', (e) => {
                const start = (state.currentPage - 1) * ITEMS_PER_PAGE;
                const pageItems = state.filteredSims.slice(start, start + ITEMS_PER_PAGE);
                pageItems.forEach(s => {
                    const id = getSimId(s);
                    if (e.target.checked) state.selectedSims.add(id);
                    else state.selectedSims.delete(id);
                });
                renderSimList();
            });
        }
    }

    // =============================================
    // SIM Modal (Add/Edit)
    // =============================================
    function initSimModal() {
        const modal = $('#modal-sim');
        const form = $('#sim-form');

        // Lắng nghe gõ số để tự động nhận diện mạng & loại số
        const numberInput = $('#sim-number');
        if (numberInput) {
            numberInput.addEventListener('input', (e) => {
                const val = e.target.value.trim();
                const carrier = detectCarrier(val);
                const type = detectSimType(val);

                if (carrier && $('#sim-network')) {
                    $('#sim-network').value = carrier;
                }
                if (type && $('#sim-type')) {
                    $('#sim-type').value = type;
                }

                const hint = $('#sim-auto-detect-hint');
                if (hint) {
                    if (carrier || type) {
                        hint.innerHTML = `<i class="fas fa-magic"></i> Tự nhận: <strong>${carrier || 'Chưa rõ mạng'}</strong> - <span style="color:#2e7d32">${type}</span>`;
                    } else {
                        hint.textContent = '';
                    }
                }
            });
        }

        // Lắng nghe Giá gốc
        const costInput = $('#sim-cost-price');
        if (costInput) {
            costInput.addEventListener('input', () => {
                const num = parsePriceInput(costInput.value);
                const hint = $('#sim-cost-price-hint');
                if (hint) hint.innerHTML = num > 0 ? `<i class="fas fa-lock"></i> Vốn: <strong>${formatPrice(num)}</strong>` : '';
                updateProfitCalc();
            });
            costInput.addEventListener('blur', () => {
                const num = parsePriceInput(costInput.value);
                if (num > 0) costInput.value = formatPrice(num).replace('₫', '').trim();
            });
        }

        // Lắng nghe Giá CTV
        const ctvInput = $('#sim-ctv-price');
        if (ctvInput) {
            ctvInput.addEventListener('input', () => {
                const num = parsePriceInput(ctvInput.value);
                const hint = $('#sim-ctv-price-hint');
                if (hint) hint.innerHTML = num > 0 ? `<i class="fas fa-users"></i> CTV: <strong>${formatPrice(num)}</strong>` : '';
            });
            ctvInput.addEventListener('blur', () => {
                const num = parsePriceInput(ctvInput.value);
                if (num > 0) ctvInput.value = formatPrice(num).replace('₫', '').trim();
            });
        }

        // Lắng nghe Giá bán lẻ
        const priceInput = $('#sim-price');
        if (priceInput) {
            priceInput.addEventListener('input', () => {
                updateProfitCalc();
            });
            priceInput.addEventListener('blur', () => {
                const num = parsePriceInput(priceInput.value);
                if (num > 0) priceInput.value = formatPrice(num).replace('₫', '').trim();
            });
        }

        function updateProfitCalc() {
            const cost = parsePriceInput($('#sim-cost-price') ? $('#sim-cost-price').value : 0);
            const price = parsePriceInput($('#sim-price') ? $('#sim-price').value : 0);
            const hint = $('#sim-price-hint');
            if (!hint) return;

            if (price > 0) {
                let msg = `<i class="fas fa-tag"></i> Bán: <strong>${formatPrice(price)}</strong>`;
                if (cost > 0) {
                    const diff = price - cost;
                    const color = diff >= 0 ? '#2e7d32' : '#d93025';
                    const sign = diff >= 0 ? '+' : '';
                    msg += ` | <span style="color:${color};font-weight:700;">(Lãi: ${sign}${formatPrice(diff)})</span>`;
                }
                hint.innerHTML = msg;
            } else {
                hint.textContent = '';
            }
        }

        const addBtn = $('#btn-add-sim');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                state.editTargetId = null;
                $('#modal-sim-title').innerHTML = '<i class="fas fa-plus-circle"></i> Thêm SIM mới';
                if (form) form.reset();
                $('#sim-status').value = 'Còn hàng';
                if ($('#sim-auto-detect-hint')) $('#sim-auto-detect-hint').textContent = '';
                if ($('#sim-cost-price-hint')) $('#sim-cost-price-hint').textContent = '';
                if ($('#sim-ctv-price-hint')) $('#sim-ctv-price-hint').textContent = '';
                if ($('#sim-price-hint')) $('#sim-price-hint').textContent = '';
                modal.classList.remove('hidden');
                if (numberInput) numberInput.focus();
            });
        }

        if ($('#modal-sim-close')) $('#modal-sim-close').addEventListener('click', () => modal.classList.add('hidden'));
        if ($('#modal-sim-cancel')) $('#modal-sim-cancel').addEventListener('click', () => modal.classList.add('hidden'));

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });

        const saveBtn = $('#modal-sim-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', async () => {
                const number = $('#sim-number').value.trim();
                const network = $('#sim-network').value || detectCarrier(number) || 'Viettel';
                const type = $('#sim-type').value || detectSimType(number) || 'Số đẹp';
                const cost_price = parsePriceInput($('#sim-cost-price').value);
                const ctv_price = parsePriceInput($('#sim-ctv-price').value);
                const price = parsePriceInput($('#sim-price').value);
                const status = $('#sim-status').value;
                const notes = $('#sim-notes').value.trim();

                if (!number) {
                    showToast('Vui lòng nhập số điện thoại', 'warning');
                    return;
                }

                const simData = { number, phone_number: number, network, type, sim_type: type, cost_price, ctv_price, price, status, notes };

                try {
                    showLoading();
                    if (state.editTargetId) {
                        await updateSim(state.editTargetId, simData);
                    } else {
                        await createSim(simData);
                        showToast('Thêm SIM thành công!', 'success');
                        await fetchSims();
                    }
                    modal.classList.add('hidden');
                } catch (err) {
                    showToast('Lỗi: ' + err.message, 'error');
                } finally {
                    hideLoading();
                }
            });
        }
    }

    function openEditModal(id) {
        const targetId = String(id);
        const sim = state.sims.find(s => getSimId(s) === targetId);
        if (!sim) {
            console.warn('SIM not found for edit ID:', id);
            return;
        }

        state.editTargetId = targetId;
        $('#modal-sim-title').innerHTML = '<i class="fas fa-edit"></i> Chỉnh sửa SIM';
        $('#sim-number').value = getSimPhone(sim);
        $('#sim-network').value = sim.network || '';
        $('#sim-type').value = getSimType(sim);

        const cost = sim.cost_price || 0;
        const ctv = sim.ctv_price || 0;
        const retail = sim.price || 0;

        $('#sim-cost-price').value = cost > 0 ? formatPrice(cost).replace('₫', '').trim() : '';
        if ($('#sim-cost-price-hint')) $('#sim-cost-price-hint').innerHTML = cost > 0 ? `<i class="fas fa-lock"></i> Vốn: <strong>${formatPrice(cost)}</strong>` : '';

        $('#sim-ctv-price').value = ctv > 0 ? formatPrice(ctv).replace('₫', '').trim() : '';
        if ($('#sim-ctv-price-hint')) $('#sim-ctv-price-hint').innerHTML = ctv > 0 ? `<i class="fas fa-users"></i> CTV: <strong>${formatPrice(ctv)}</strong>` : '';

        $('#sim-price').value = retail > 0 ? formatPrice(retail).replace('₫', '').trim() : '';
        
        // Cập nhật tính lãi
        const hint = $('#sim-price-hint');
        if (hint && retail > 0) {
            let msg = `<i class="fas fa-tag"></i> Bán: <strong>${formatPrice(retail)}</strong>`;
            if (cost > 0) {
                const diff = retail - cost;
                const color = diff >= 0 ? '#2e7d32' : '#d93025';
                const sign = diff >= 0 ? '+' : '';
                msg += ` | <span style="color:${color};font-weight:700;">(Lãi: ${sign}${formatPrice(diff)})</span>`;
            }
            hint.innerHTML = msg;
        }

        $('#sim-status').value = sim.status || 'Còn hàng';
        $('#sim-notes').value = sim.notes || '';
        if ($('#sim-auto-detect-hint')) $('#sim-auto-detect-hint').textContent = '';
        $('#modal-sim').classList.remove('hidden');
    }

    // =============================================
    // Quick Add Modal (Thêm nhanh)
    // =============================================
    function initQuickAddModal() {
        const modal = $('#modal-quick-add');
        const openBtn = $('#btn-quick-add');
        if (!modal) return;

        if (openBtn) {
            openBtn.addEventListener('click', () => {
                $('#quick-add-input').value = '';
                $('#quick-add-preview').classList.add('hidden');
                $('#btn-do-quick-add').disabled = true;
                modal.classList.remove('hidden');
                setTimeout(() => $('#quick-add-input').focus(), 100);
            });
        }

        if ($('#modal-quick-add-close')) $('#modal-quick-add-close').addEventListener('click', () => modal.classList.add('hidden'));
        if ($('#modal-quick-add-cancel')) $('#modal-quick-add-cancel').addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });

        const textarea = $('#quick-add-input');
        if (textarea) {
            textarea.addEventListener('input', debounce(() => {
                const rawText = textarea.value.trim();
                if (!rawText) {
                    $('#quick-add-preview').classList.add('hidden');
                    $('#btn-do-quick-add').disabled = true;
                    return;
                }

                const lines = rawText.split('\n');
                const parsed = [];
                const previewContainer = $('#quick-add-preview-list');
                previewContainer.innerHTML = '';

                lines.forEach((line, idx) => {
                    const item = parseQuickAddLine(line);
                    if (item) {
                        parsed.push(item);
                        previewContainer.innerHTML += `
                            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-bottom:1px solid #f0f0f0;font-size:13px;">
                                <div>
                                    <strong style="font-size:15px;color:#1a73e8;">${item.phone_number}</strong>
                                    <span class="badge badge-network" style="margin-left:6px;">${item.network}</span>
                                    <span class="badge badge-type">${item.type}</span>
                                    ${item.notes ? `<small style="color:#777;margin-left:6px;">(${item.notes})</small>` : ''}
                                </div>
                                <strong style="color:#ea4335;font-size:14px;">${formatPrice(item.price)}</strong>
                            </div>
                        `;
                    } else if (line.trim()) {
                        previewContainer.innerHTML += `
                            <div style="padding:6px 10px;color:#d93025;font-size:12px;background:#fce8e6;border-radius:4px;margin-bottom:4px;">
                                ⚠️ Dòng ${idx + 1}: Không tìm thấy số điện thoại hợp lệ: "${line.trim()}"
                            </div>
                        `;
                    }
                });

                $('#quick-add-count').textContent = parsed.length;
                $('#quick-add-preview').classList.remove('hidden');
                $('#btn-do-quick-add').disabled = parsed.length === 0;
                modal._parsedQuickSims = parsed;
            }, 150));
        }

        const doQuickAddBtn = $('#btn-do-quick-add');
        if (doQuickAddBtn) {
            doQuickAddBtn.addEventListener('click', async () => {
                const sims = modal._parsedQuickSims;
                if (!sims || sims.length === 0) return;

                try {
                    showLoading();
                    let successCount = 0;
                    for (const sim of sims) {
                        try {
                            await createSim(sim);
                            successCount++;
                        } catch (e) {
                            console.warn('Lỗi thêm sim:', sim.phone_number, e.message);
                        }
                    }
                    modal.classList.add('hidden');
                    showToast(`Đã thêm nhanh ${successCount} SIM vào kho thành công!`, 'success');
                    await fetchSims();
                } catch (err) {
                    showToast('Lỗi khi thêm nhanh SIM: ' + err.message, 'error');
                } finally {
                    hideLoading();
                }
            });
        }
    }

    // =============================================
    // Delete Modal
    // =============================================
    function initDeleteModal() {
        const modal = $('#modal-delete');

        if ($('#modal-delete-close')) $('#modal-delete-close').addEventListener('click', () => modal.classList.add('hidden'));
        if ($('#modal-delete-cancel')) $('#modal-delete-cancel').addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });

        const confirmBtn = $('#modal-delete-confirm');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', async () => {
                if (state.isBulkDelete) {
                    const ids = Array.from(state.selectedSims);
                    try {
                        await bulkDeleteSims(ids);
                        modal.classList.add('hidden');
                        state.isBulkDelete = false;
                    } catch (err) {
                        // Error shown
                    }
                } else if (state.deleteTargetId) {
                    try {
                        await deleteSim(state.deleteTargetId);
                        modal.classList.add('hidden');
                        state.selectedSims.delete(String(state.deleteTargetId));
                    } catch (err) {
                        // Error shown
                    }
                }
            });
        }
    }

    function openDeleteModal(id) {
        state.isBulkDelete = false;
        const targetId = String(id);
        const sim = state.sims.find(s => getSimId(s) === targetId);
        if (!sim) {
            console.warn('SIM not found for delete ID:', id);
            return;
        }

        state.deleteTargetId = targetId;
        if ($('#delete-confirm-message')) {
            $('#delete-confirm-message').innerHTML = `Bạn có chắc chắn muốn xóa SIM <strong id="delete-sim-number">${formatPhoneDisplay(getSimPhone(sim))}</strong>?`;
        }
        $('#modal-delete').classList.remove('hidden');
    }

    // =============================================
    // Bulk Import Modal
    // =============================================
    function initImportModal() {
        const modal = $('#modal-import');
        const importBtn = $('#btn-bulk-import');
        if (importBtn) {
            importBtn.addEventListener('click', () => {
                $('#import-csv').value = '';
                $('#import-preview').classList.add('hidden');
                $('#btn-do-import').disabled = true;
                modal.classList.remove('hidden');
            });
        }

        if ($('#modal-import-close')) $('#modal-import-close').addEventListener('click', () => modal.classList.add('hidden'));
        if ($('#modal-import-cancel')) $('#modal-import-cancel').addEventListener('click', () => modal.classList.add('hidden'));
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });

        const previewBtn = $('#btn-preview-import');
        if (previewBtn) {
            previewBtn.addEventListener('click', () => {
                const csv = $('#import-csv').value.trim();
                if (!csv) {
                    showToast('Vui lòng dán dữ liệu CSV', 'warning');
                    return;
                }

                const lines = csv.split('\n').filter(l => l.trim());
                const parsed = [];
                const previewList = $('#import-preview-list');
                previewList.innerHTML = '';

                lines.forEach((line, idx) => {
                    const parts = line.split(',').map(p => p.trim());
                    if (parts.length < 4) {
                        previewList.innerHTML += `<div class="import-row error">Dòng ${idx + 1}: Thiếu dữ liệu - "${line}"</div>`;
                        return;
                    }

                    const num = parts[0];
                    const net = parts[1] || detectCarrier(num) || 'Viettel';
                    const simType = parts[2] || detectSimType(num) || 'Số đẹp';
                    const pr = parsePriceInput(parts[3]);

                    const sim = {
                        number: num,
                        phone_number: num,
                        network: net,
                        type: simType,
                        sim_type: simType,
                        cost_price: 0,
                        ctv_price: 0,
                        price: pr,
                        status: parts[4] || 'Còn hàng',
                        notes: parts[5] || ''
                    };

                    parsed.push(sim);
                    previewList.innerHTML += `
                        <div class="import-row">
                            <span>${formatPhoneDisplay(sim.number)}</span>
                            <span>${sim.network}</span>
                            <span>${sim.type}</span>
                            <span>${formatPrice(sim.price)}</span>
                            <span>${sim.status}</span>
                        </div>
                    `;
                });

                $('#import-count').textContent = parsed.length;
                $('#import-preview').classList.remove('hidden');
                $('#btn-do-import').disabled = parsed.length === 0;
                modal._parsedData = parsed;
            });
        }

        const doImportBtn = $('#btn-do-import');
        if (doImportBtn) {
            doImportBtn.addEventListener('click', async () => {
                const data = modal._parsedData;
                if (!data || data.length === 0) return;

                try {
                    await bulkImportSims(data);
                    modal.classList.add('hidden');
                } catch (err) {
                    // Error shown
                }
            });
        }
    }

    // =============================================
    // Zalo Posts
    // =============================================
    function initZaloTemplates() {
        const templateCards = $$('.template-card');

        templateCards.forEach(card => {
            card.addEventListener('click', () => {
                templateCards.forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                state.zaloTemplate = card.dataset.template;

                if (state.zaloTemplate === 'sale') {
                    if ($('#sale-options-card')) $('#sale-options-card').classList.remove('hidden');
                } else {
                    if ($('#sale-options-card')) $('#sale-options-card').classList.add('hidden');
                }

                generateZaloPreview();
            });
        });

        // Chọn loại giá hiển thị trong bài Zalo (Giá lẻ hoặc Giá CTV)
        $$('input[name="zalo-price-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                state.zaloPriceType = e.target.value;
                generateZaloPreview();
            });
        });

        const searchInput = $('#zalo-sim-search');
        if (searchInput) {
            searchInput.addEventListener('input', debounce((e) => {
                renderZaloSimList(e.target.value);
            }, 200));
        }

        const discountInput = $('#sale-discount');
        if (discountInput) {
            discountInput.addEventListener('input', () => generateZaloPreview());
        }

        const copyBtn = $('#btn-copy-post');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const preview = $('#post-preview');
                const text = preview.textContent || preview.innerText;
                if (!text || text === 'Chọn mẫu và SIM để xem trước bài đăng') {
                    showToast('Chưa có bài đăng để sao chép', 'warning');
                    return;
                }

                navigator.clipboard.writeText(text).then(() => {
                    showToast('Đã sao chép bài đăng!', 'success');
                }).catch(() => {
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    document.body.appendChild(textarea);
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                    showToast('Đã sao chép bài đăng!', 'success');
                });
            });
        }
    }

    function renderZaloSimList(searchQuery = '') {
        const container = $('#zalo-sim-list');
        if (!container) return;
        let availableSims = state.sims.filter(s => s.status === 'Còn hàng');

        if (searchQuery) {
            const q = searchQuery.replace(/\D/g, '');
            availableSims = availableSims.filter(s => {
                const num = getSimPhone(s).replace(/\D/g, '');
                return num.includes(q);
            });
        }

        if (availableSims.length === 0) {
            container.innerHTML = `
                <div class="empty-state small">
                    <i class="fas fa-inbox"></i>
                    <p>Không tìm thấy SIM</p>
                </div>
            `;
            return;
        }

        container.innerHTML = availableSims.map(sim => {
            const id = getSimId(sim);
            const isSelected = state.zaloSelectedSims.some(s => getSimId(s) === id);
            return `
                <div class="zalo-sim-item ${isSelected ? 'selected' : ''}" data-id="${id}">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} style="accent-color:var(--primary)">
                    <span class="sim-num">${formatPhoneDisplay(getSimPhone(sim))}</span>
                    <span class="sim-net">${sim.network || ''}</span>
                    <span class="sim-pr">${formatPrice(sim.price)}</span>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.zalo-sim-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = String(item.dataset.id);
                const sim = state.sims.find(s => getSimId(s) === id);
                if (!sim) return;

                const idx = state.zaloSelectedSims.findIndex(s => getSimId(s) === id);
                if (idx >= 0) {
                    state.zaloSelectedSims.splice(idx, 1);
                } else {
                    state.zaloSelectedSims.push(sim);
                }

                renderZaloSimList($('#zalo-sim-search') ? $('#zalo-sim-search').value : '');
                renderZaloSelectedChips();
                generateZaloPreview();
            });
        });
    }

    function renderZaloSelectedChips() {
        const container = $('#zalo-selected-sims');
        if (!container) return;

        container.innerHTML = state.zaloSelectedSims.map(sim => {
            const id = getSimId(sim);
            return `
                <span class="zalo-selected-chip">
                    ${formatPhoneDisplay(getSimPhone(sim))}
                    <i class="fas fa-times chip-remove" data-id="${id}"></i>
                </span>
            `;
        }).join('');

        container.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = String(btn.dataset.id);
                state.zaloSelectedSims = state.zaloSelectedSims.filter(s => getSimId(s) !== id);
                renderZaloSimList($('#zalo-sim-search') ? $('#zalo-sim-search').value : '');
                renderZaloSelectedChips();
                generateZaloPreview();
            });
        });
    }

    function generateZaloPreview() {
        const preview = $('#post-preview');
        const copyBtn = $('#btn-copy-post');
        if (!preview) return;

        const sims = state.zaloSelectedSims;

        if (sims.length === 0) {
            preview.innerHTML = '<p class="preview-placeholder">Chọn mẫu và SIM để xem trước bài đăng</p>';
            if (copyBtn) copyBtn.disabled = true;
            return;
        }

        let text = '';

        switch (state.zaloTemplate) {
            case 'single':
                text = generateSinglePost(sims[0]);
                break;
            case 'list':
                text = generateListPost(sims);
                break;
            case 'sale':
                text = generateSalePost(sims);
                break;
            case 'congrats':
                text = generateCongratsPost(sims[0]);
                break;
            case 'new-arrival':
                text = generateNewArrivalPost(sims);
                break;
            default:
                text = generateSinglePost(sims[0]);
        }

        preview.textContent = text;
        if (copyBtn) copyBtn.disabled = false;
    }

    function getPostPrice(sim) {
        if (!sim) return 0;
        if (state.zaloPriceType === 'ctv' && (sim.ctv_price || sim.gia_ctv)) {
            return Number(sim.ctv_price || sim.gia_ctv);
        }
        return Number(sim.price || sim.gia_ban || 0);
    }

    function generateSinglePost(sim) {
        if (!sim) return '';
        const phone = formatPhoneDisplay(getSimPhone(sim));
        const network = sim.network || '';
        const type = getSimType(sim) || 'Số đẹp';
        const chosenPrice = getPostPrice(sim);
        const price = formatPrice(chosenPrice);
        const priceLabel = (state.zaloPriceType === 'ctv' && (sim.ctv_price || sim.gia_ctv)) ? 'Giá CTV' : 'Giá';

        return `🔥🔥🔥 SIM SỐ ĐẸP 🔥🔥🔥
━━━━━━━━━━━━━━━
📱 Số: ${phone}
🏷️ Nhà mạng: ${network}
✨ Loại: ${type}
💰 ${priceLabel}: ${price}
━━━━━━━━━━━━━━━
📞 Liên hệ ngay để sở hữu!
👉 Inbox để biết thêm chi tiết
#SIMsốđẹp #${network.replace(/\s/g, '')} #SIMgiárẻ`;
    }

    function generateListPost(sims) {
        if (!sims.length) return '';
        const numEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        const isCtvPrice = state.zaloPriceType === 'ctv';

        let lines = sims.map((sim, idx) => {
            const phone = formatPhoneDisplay(getSimPhone(sim));
            const network = sim.network || '';
            const price = formatPrice(getPostPrice(sim));
            const emoji = numEmojis[idx] || `${idx + 1}.`;
            return `${emoji} ${phone} - ${network} - ${price}`;
        });

        const headerTitle = isCtvPrice ? '📋 DANH SÁCH SIM GIÁ CTV 📋' : '📋 DANH SÁCH SIM SỐ ĐẸP 📋';

        return `${headerTitle}
━━━━━━━━━━━━━━━━━━
${lines.join('\n')}
━━━━━━━━━━━━━━━━━━
✅ Cam kết SIM chính chủ
📞 Liên hệ ngay!`;
    }

    function generateSalePost(sims) {
        if (!sims.length) return '';
        const discount = parseInt($('#sale-discount') ? $('#sale-discount').value : 30) || 30;

        let simLines = sims.map(sim => {
            const phone = formatPhoneDisplay(getSimPhone(sim));
            const originalPrice = getPostPrice(sim);
            const salePrice = Math.round(originalPrice * (1 - discount / 100));
            return `📱 ${phone}
💰 Giá niêm yết: ${formatPrice(originalPrice)}
🏷️ Giá KM: ${formatPrice(salePrice)}`;
        });

        return `🎉🎉 KHUYẾN MÃI SỐC 🎉🎉
━━━━━━━━━━━━━━━━━━
🔥 GIẢM GIÁ LÊN ĐẾN ${discount}%
${simLines.join('\n\n')}
⏰ Chỉ trong hôm nay!
━━━━━━━━━━━━━━━━━━
👉 Inbox ngay kẻo hết!`;
    }

    function generateCongratsPost(sim) {
        if (!sim) return '';
        const phone = formatPhoneDisplay(getSimPhone(sim));

        return `🎊🎊 CHÚC MỪNG 🎊🎊
━━━━━━━━━━━━━━━
✅ SIM ${phone} đã có chủ mới!
🙏 Cảm ơn quý khách đã tin tưởng
📱 Chúc quý khách may mắn, phát tài!
━━━━━━━━━━━━━━━
👉 Còn nhiều SIM đẹp khác, inbox ngay!`;
    }

    function generateNewArrivalPost(sims) {
        if (!sims.length) return '';

        let simLines = sims.map(sim => {
            const phone = formatPhoneDisplay(getSimPhone(sim));
            const network = sim.network || '';
            const price = formatPrice(getPostPrice(sim));
            return `📱 ${phone} - ${network} - ${price}`;
        });

        return `🆕🆕 SIM MỚI VỀ KHO 🆕🆕
━━━━━━━━━━━━━━━━━━
Vừa nhập thêm lô SIM mới:
${simLines.join('\n')}
━━━━━━━━━━━━━━━━━━
🔥 Số lượng có hạn!
📞 Liên hệ ngay để chọn số đẹp!`;
    }

    // =============================================
    // Initialization
    // =============================================
    async function init() {
        initNavigation();
        initAuthModal();
        await checkInitialAuth();
        initCostToggle();
        initFilters();
        initViewToggle();
        initSimModal();
        initQuickAddModal();
        initDeleteModal();
        initImportModal();
        initSelectionActions();
        initZaloTemplates();

        if (window.innerWidth < 768) {
            state.viewMode = 'cards';
        }

        fetchSims();

        window.addEventListener('resize', debounce(() => {
            if (window.innerWidth < 768) {
                state.viewMode = 'cards';
            }
            renderSimList();
        }, 200));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

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

    // =============================================
    // State
    // =============================================
    let state = {
        sims: [],
        filteredSims: [],
        currentPage: 1,
        viewMode: 'table', // 'table' or 'cards'
        selectedSims: new Set(),
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
        const defaults = {
            headers: { 'Content-Type': 'application/json' }
        };
        const config = { ...defaults, ...options };

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
            const rawSims = Array.isArray(data) ? data : (data.data || data.sims || []);
            // Chuẩn hóa dữ liệu ngay khi tải về
            state.sims = rawSims.map(s => ({
                ...s,
                id: getSimId(s),
                number: getSimPhone(s),
                phone_number: getSimPhone(s),
                type: getSimType(s),
                sim_type: getSimType(s)
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
        try {
            showLoading();
            const payload = {
                phone_number: simData.number || simData.phone_number,
                number: simData.number || simData.phone_number,
                network: simData.network,
                sim_type: simData.type || simData.sim_type,
                type: simData.type || simData.sim_type,
                price: simData.price,
                status: simData.status,
                notes: simData.notes
            };
            const result = await apiRequest(API_BASE, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            showToast('Thêm SIM thành công!', 'success');
            await fetchSims();
            return result;
        } catch (err) {
            showToast('Lỗi thêm SIM: ' + err.message, 'error');
            throw err;
        } finally {
            hideLoading();
        }
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
                price: simData.price,
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
        const available = sims.filter(s => s.status === 'Còn hàng').length;
        const sold = sims.filter(s => s.status === 'Đã bán').length;
        const totalValue = sims.reduce((sum, s) => sum + (s.price || 0), 0);

        if ($('#stat-total')) $('#stat-total').textContent = total;
        if ($('#stat-available')) $('#stat-available').textContent = available;
        if ($('#stat-sold')) $('#stat-sold').textContent = sold;
        if ($('#stat-value')) $('#stat-value').textContent = formatPrice(totalValue);

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

        const hasSelection = state.selectedSims.size > 0;
        if ($('#btn-select-all')) $('#btn-select-all').style.display = total > 0 ? '' : 'none';
        if ($('#btn-post-selected')) $('#btn-post-selected').style.display = hasSelection ? '' : 'none';
        if ($('#selected-count')) $('#selected-count').textContent = state.selectedSims.size;

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
            const phone = formatPhoneDisplay(getSimPhone(sim));
            const checked = state.selectedSims.has(id) ? 'checked' : '';
            const selectedClass = state.selectedSims.has(id) ? 'selected' : '';
            const statusBadge = getStatusBadgeClass(sim.status);

            return `
                <tr class="${selectedClass}" data-id="${id}">
                    <td class="col-check">
                        <input type="checkbox" class="sim-checkbox" data-id="${id}" ${checked}>
                    </td>
                    <td class="sim-number-cell"><strong>${phone}</strong></td>
                    <td><span class="badge badge-network">${sim.network || ''}</span></td>
                    <td><span class="badge badge-type">${getSimType(sim)}</span></td>
                    <td class="sim-price-cell">${formatPrice(sim.price)}</td>
                    <td><span class="badge ${statusBadge}">${sim.status || ''}</span></td>
                    <td>
                        <div class="action-btns">
                            <button type="button" class="btn btn-sm btn-outline btn-edit" data-id="${id}" title="Sửa">
                                <i class="fas fa-edit"></i> Sửa
                            </button>
                            <button type="button" class="btn btn-sm btn-outline text-danger btn-delete" data-id="${id}" title="Xóa">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
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
                if ($('#btn-post-selected')) $('#btn-post-selected').style.display = state.selectedSims.size > 0 ? '' : 'none';
                if ($('#selected-count')) $('#selected-count').textContent = state.selectedSims.size;
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
    }

    function renderCards(items) {
        const grid = $('#sim-cards-grid');
        if (!grid) return;

        grid.innerHTML = items.map(sim => {
            const id = getSimId(sim);
            const phone = formatPhoneDisplay(getSimPhone(sim));
            const checked = state.selectedSims.has(id) ? 'checked' : '';
            const selectedClass = state.selectedSims.has(id) ? 'selected' : '';
            const statusBadge = getStatusBadgeClass(sim.status);

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
                    <div class="sim-card-bottom">
                        <span class="sim-card-price">${formatPrice(sim.price)}</span>
                        <div class="sim-card-actions">
                            <button type="button" class="btn btn-sm btn-outline btn-edit" data-id="${id}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-outline text-danger btn-delete" data-id="${id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.sim-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = String(e.target.dataset.id);
                if (e.target.checked) state.selectedSims.add(id);
                else state.selectedSims.delete(id);
                if ($('#btn-post-selected')) $('#btn-post-selected').style.display = state.selectedSims.size > 0 ? '' : 'none';
                if ($('#selected-count')) $('#selected-count').textContent = state.selectedSims.size;
            });
        });
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

        const addBtn = $('#btn-add-sim');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                state.editTargetId = null;
                $('#modal-sim-title').innerHTML = '<i class="fas fa-plus-circle"></i> Thêm SIM mới';
                if (form) form.reset();
                $('#sim-status').value = 'Còn hàng';
                modal.classList.remove('hidden');
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
                const network = $('#sim-network').value;
                const type = $('#sim-type').value;
                const price = parseInt($('#sim-price').value) || 0;
                const status = $('#sim-status').value;
                const notes = $('#sim-notes').value.trim();

                if (!number) {
                    showToast('Vui lòng nhập số điện thoại', 'warning');
                    return;
                }
                if (!network) {
                    showToast('Vui lòng chọn nhà mạng', 'warning');
                    return;
                }
                if (!type) {
                    showToast('Vui lòng chọn loại SIM', 'warning');
                    return;
                }

                const simData = { number, phone_number: number, network, type, sim_type: type, price, status, notes };

                try {
                    if (state.editTargetId) {
                        await updateSim(state.editTargetId, simData);
                    } else {
                        await createSim(simData);
                    }
                    modal.classList.add('hidden');
                } catch (err) {
                    // Error shown
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
        $('#sim-price').value = sim.price || '';
        $('#sim-status').value = sim.status || 'Còn hàng';
        $('#sim-notes').value = sim.notes || '';
        $('#modal-sim').classList.remove('hidden');
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
                if (state.deleteTargetId) {
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
        const targetId = String(id);
        const sim = state.sims.find(s => getSimId(s) === targetId);
        if (!sim) {
            console.warn('SIM not found for delete ID:', id);
            return;
        }

        state.deleteTargetId = targetId;
        $('#delete-sim-number').textContent = formatPhoneDisplay(getSimPhone(sim));
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

                    const sim = {
                        number: parts[0],
                        phone_number: parts[0],
                        network: parts[1],
                        type: parts[2],
                        sim_type: parts[2],
                        price: parseInt(parts[3]) || 0,
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

    function generateSinglePost(sim) {
        if (!sim) return '';
        const phone = formatPhoneDisplay(getSimPhone(sim));
        const network = sim.network || '';
        const type = getSimType(sim) || 'Số đẹp';
        const price = formatPrice(sim.price);

        return `🔥🔥🔥 SIM SỐ ĐẸP 🔥🔥🔥
━━━━━━━━━━━━━━━
📱 Số: ${phone}
🏷️ Nhà mạng: ${network}
✨ Loại: ${type}
💰 Giá: ${price}
━━━━━━━━━━━━━━━
📞 Liên hệ ngay để sở hữu!
👉 Inbox để biết thêm chi tiết
#SIMsốđẹp #${network.replace(/\s/g, '')} #SIMgiárẻ`;
    }

    function generateListPost(sims) {
        if (!sims.length) return '';
        const numEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

        let lines = sims.map((sim, idx) => {
            const phone = formatPhoneDisplay(getSimPhone(sim));
            const network = sim.network || '';
            const price = formatPrice(sim.price);
            const emoji = numEmojis[idx] || `${idx + 1}.`;
            return `${emoji} ${phone} - ${network} - ${price}`;
        });

        return `📋 DANH SÁCH SIM SỐ ĐẸP 📋
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
            const originalPrice = sim.price || 0;
            const salePrice = Math.round(originalPrice * (1 - discount / 100));
            return `📱 ${phone}
💰 Giá gốc: ${formatPrice(originalPrice)}
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
            const price = formatPrice(sim.price);
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
    function init() {
        initNavigation();
        initFilters();
        initViewToggle();
        initSimModal();
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

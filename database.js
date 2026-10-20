// =============================================
// database.js - Quản lý cơ sở dữ liệu JSON
// Ứng dụng quản lý SIM số đẹp
// Sử dụng JSON file thay cho SQLite (không cần native build)
// =============================================

const fs = require('fs');
const path = require('path');

// Đường dẫn file dữ liệu
const DB_PATH = path.join(__dirname, 'data.json');

// =============================================
// Cấu trúc dữ liệu mặc định
// =============================================
const DEFAULT_DATA = {
  sims: [],
  templates: [],
  _meta: {
    next_sim_id: 1,
    next_template_id: 1,
    created_at: new Date().toISOString()
  }
};

// =============================================
// Đọc / Ghi file JSON
// =============================================
function loadData() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('⚠️ Lỗi đọc file dữ liệu, tạo mới:', err.message);
  }
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function saveData(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// Dữ liệu trong bộ nhớ (load 1 lần, ghi mỗi khi thay đổi)
let data = loadData();

// =============================================
// Giá trị enum hợp lệ
// =============================================
const VALID_NETWORKS = ['Viettel', 'Mobifone', 'Vinaphone', 'Vietnamobile', 'Gmobile', 'Itelecom', 'Reddi', 'Wintel'];
const VALID_SIM_TYPES = ['Số đẹp', 'Phong thủy', 'Lộc phát', 'Thần tài', 'Tam hoa', 'Tứ quý', 'Ngũ quý', 'Lục quý', 'Tiến', 'Đảo', 'Gánh', 'Số VIP', 'Số thường'];
const VALID_STATUSES = ['Còn hàng', 'Đã bán', 'Đã giữ'];

// =============================================
// Khởi tạo dữ liệu mẫu
// =============================================
function initializeDatabase() {
  let needsSave = false;

  // Seed SIM mẫu nếu chưa có
  if (data.sims.length === 0) {
    const sampleSims = [
      { phone_number: '0961.888.999', network: 'Viettel', sim_type: 'Số VIP', price: 45000000, status: 'Còn hàng', notes: 'Số cực VIP, tam hoa 888 + lộc phát 999' },
      { phone_number: '0912.345.678', network: 'Viettel', sim_type: 'Tiến', price: 12000000, status: 'Còn hàng', notes: 'Dãy số tiến đẹp 345678' },
      { phone_number: '0987.666.888', network: 'Viettel', sim_type: 'Lộc phát', price: 28000000, status: 'Đã giữ', notes: 'Lộc phát 888, tam hoa 666' },
      { phone_number: '0935.111.222', network: 'Mobifone', sim_type: 'Tam hoa', price: 8500000, status: 'Còn hàng', notes: 'Tam hoa kép 111.222' },
      { phone_number: '0908.777.777', network: 'Mobifone', sim_type: 'Ngũ quý', price: 150000000, status: 'Còn hàng', notes: 'Ngũ quý 7 cực hiếm' },
      { phone_number: '0918.68.68.68', network: 'Vinaphone', sim_type: 'Phong thủy', price: 35000000, status: 'Còn hàng', notes: 'Phong thủy lộc phát 68 lặp 3 lần' },
      { phone_number: '0911.222.333', network: 'Vinaphone', sim_type: 'Tam hoa', price: 6500000, status: 'Đã bán', notes: 'Tam hoa kép đẹp' },
      { phone_number: '0886.39.39.39', network: 'Vinaphone', sim_type: 'Thần tài', price: 22000000, status: 'Còn hàng', notes: 'Thần tài 39 lặp 3 cặp' },
      { phone_number: '0562.888.888', network: 'Vietnamobile', sim_type: 'Lục quý', price: 85000000, status: 'Còn hàng', notes: 'Lục quý 8 siêu VIP' },
      { phone_number: '0563.79.79.79', network: 'Vietnamobile', sim_type: 'Phong thủy', price: 15000000, status: 'Còn hàng', notes: 'Phong thủy 79 thất cửu' },
      { phone_number: '0593.456.789', network: 'Gmobile', sim_type: 'Tiến', price: 3200000, status: 'Còn hàng', notes: 'Dãy tiến 456789' },
      { phone_number: '087.111.1111', network: 'Itelecom', sim_type: 'Tứ quý', price: 18000000, status: 'Đã giữ', notes: 'Tứ quý 1 đuôi, tam hoa 1 đầu' },
      { phone_number: '0557.886.688', network: 'Reddi', sim_type: 'Lộc phát', price: 4500000, status: 'Còn hàng', notes: 'Lộc phát 688, đảo 886' },
      { phone_number: '0559.123.456', network: 'Wintel', sim_type: 'Tiến', price: 2800000, status: 'Còn hàng', notes: 'Tiến đơn giản 123456' },
      { phone_number: '0978.52.52.52', network: 'Viettel', sim_type: 'Số đẹp', price: 9800000, status: 'Còn hàng', notes: 'Số đẹp lặp 52 ba lần' },
    ];

    const now = new Date().toISOString();
    sampleSims.forEach(sim => {
      data.sims.push({
        id: data._meta.next_sim_id++,
        ...sim,
        created_at: now,
        updated_at: now
      });
    });
    console.log(`✅ Đã thêm ${sampleSims.length} SIM mẫu vào cơ sở dữ liệu`);
    needsSave = true;
  } else {
    console.log(`ℹ️  Đã có ${data.sims.length} SIM trong cơ sở dữ liệu`);
  }

  // Seed mẫu bài đăng Zalo
  if (data.templates.length === 0) {
    const templates = [
      {
        name: 'Đăng đơn lẻ',
        description: 'Đăng bài giới thiệu một SIM duy nhất với đầy đủ thông tin',
        template_text: [
          '🔥🔥🔥 SIM SỐ ĐẸP 🔥🔥🔥',
          '━━━━━━━━━━━━━━━',
          '📱 Số: {{phone_number}}',
          '🏷️ Nhà mạng: {{network}}',
          '✨ Loại: {{sim_type}}',
          '💰 Giá: {{price}}',
          '{{#notes}}📝 {{notes}}{{/notes}}',
          '━━━━━━━━━━━━━━━',
          '✅ Cam kết chính chủ',
          '✅ Hỗ trợ sang tên toàn quốc',
          '✅ Ship COD toàn quốc',
          '',
          '📞 Liên hệ ngay để sở hữu!',
          '👉 Inbox hoặc gọi trực tiếp',
          '#SIMsốđẹp #{{network_tag}} #SIMgiárẻ'
        ].join('\n')
      },
      {
        name: 'Danh sách SIM',
        description: 'Đăng danh sách nhiều SIM dạng bảng đẹp mắt',
        template_text: [
          '📋 DANH SÁCH SIM SỐ ĐẸP 📋',
          '━━━━━━━━━━━━━━━━━━',
          '{{#sim_list}}',
          '{{index}}️⃣ {{phone_number}} | {{network}} | 💰 {{price}}',
          '{{/sim_list}}',
          '━━━━━━━━━━━━━━━━━━',
          '📌 Tổng: {{total_count}} SIM',
          '💎 Giá từ: {{min_price}} - {{max_price}}',
          '',
          '✅ Tất cả SIM đều chính chủ',
          '✅ Hỗ trợ sang tên nhanh chóng',
          '✅ Ship COD - Nhận hàng thanh toán',
          '',
          '📞 Inbox ngay để chọn số ưng ý!',
          '#simso #simdep #sodep'
        ].join('\n')
      },
      {
        name: 'Khuyến mãi giảm giá',
        description: 'Bài đăng khuyến mãi, giảm giá SIM',
        template_text: [
          '🎉🎉 KHUYẾN MÃI SỐC 🎉🎉',
          '━━━━━━━━━━━━━━━━━━',
          '🔥 GIẢM GIÁ CỰC SỐC!',
          '⏰ Chỉ trong hôm nay!',
          '',
          '{{#sim_list}}',
          '📱 {{phone_number}} ({{network}})',
          '   💰 Giá gốc: {{price}}',
          '   🏷️ Giá KM: {{discounted_price}}',
          '   🔖 Tiết kiệm: {{savings}}',
          '{{/sim_list}}',
          '',
          '⚡ SỐ LƯỢNG CÓ HẠN!',
          '✅ Cam kết giá tốt nhất',
          '✅ Chính chủ - sang tên ngay',
          '✅ Freeship toàn quốc',
          '',
          '📞 Liên hệ ngay kẻo hết!',
          '#khuyenmai #giamgia #simso #simdep'
        ].join('\n')
      },
      {
        name: 'Chúc mừng khách mua',
        description: 'Bài đăng cảm ơn và chúc mừng khách hàng đã mua SIM',
        template_text: [
          '🎊🎊 CHÚC MỪNG 🎊🎊',
          '━━━━━━━━━━━━━━━',
          '✅ SIM {{phone_number}} đã có chủ mới!',
          '🙏 Cảm ơn quý khách đã tin tưởng',
          '📱 Chúc quý khách may mắn, phát tài!',
          '━━━━━━━━━━━━━━━',
          '💎 Còn nhiều SIM đẹp khác',
          '👉 Inbox ngay để chọn số!',
          '#simso #simdep #khachhang #review'
        ].join('\n')
      },
      {
        name: 'SIM mới về',
        description: 'Thông báo có SIM mới về kho, thu hút khách hàng',
        template_text: [
          '🆕🆕 SIM MỚI VỀ KHO 🆕🆕',
          '━━━━━━━━━━━━━━━━━━',
          '📢 Vừa nhập thêm lô SIM mới:',
          '',
          '{{#sim_list}}',
          '🔸 {{phone_number}} - {{network}} - {{sim_type}} - 💰 {{price}}',
          '{{/sim_list}}',
          '',
          '🔥 Số lượng có hạn!',
          '✅ Nguồn SIM uy tín',
          '✅ Giá cạnh tranh nhất',
          '✅ Sang tên chính chủ',
          '✅ Giao SIM tận nơi',
          '',
          '📞 Inbox ngay để chọn số đẹp!',
          '#simmoi #simve #simdep #simso'
        ].join('\n')
      }
    ];

    const now = new Date().toISOString();
    templates.forEach(t => {
      data.templates.push({
        id: data._meta.next_template_id++,
        ...t,
        created_at: now
      });
    });
    console.log(`✅ Đã thêm ${templates.length} mẫu bài đăng Zalo`);
    needsSave = true;
  }

  if (needsSave) {
    saveData(data);
  }

  console.log('✅ Khởi tạo cơ sở dữ liệu thành công');
}

// =============================================
// Các hàm truy vấn SIM
// =============================================

/**
 * Lấy danh sách SIM với bộ lọc và phân trang
 */
function getSims({ network, sim_type, status, min_price, max_price, search, page = 1, limit = 50, sort_by = 'created_at', sort_order = 'DESC' } = {}) {
  let filtered = [...data.sims];

  // Lọc theo mạng
  if (network) {
    filtered = filtered.filter(s => s.network === network);
  }

  // Lọc theo loại SIM
  if (sim_type) {
    filtered = filtered.filter(s => s.sim_type === sim_type);
  }

  // Lọc theo trạng thái
  if (status) {
    filtered = filtered.filter(s => s.status === status);
  }

  // Lọc theo khoảng giá
  if (min_price !== undefined && min_price !== null && min_price !== '') {
    filtered = filtered.filter(s => s.price >= parseInt(min_price));
  }
  if (max_price !== undefined && max_price !== null && max_price !== '') {
    filtered = filtered.filter(s => s.price <= parseInt(max_price));
  }

  // Tìm kiếm theo số điện thoại hoặc ghi chú
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(s =>
      s.phone_number.toLowerCase().includes(q) ||
      (s.notes && s.notes.toLowerCase().includes(q))
    );
  }

  // Sắp xếp
  const validSortColumns = ['id', 'phone_number', 'network', 'sim_type', 'price', 'status', 'created_at', 'updated_at'];
  const safeSortBy = validSortColumns.includes(sort_by) ? sort_by : 'created_at';
  const isAsc = (sort_order || '').toUpperCase() === 'ASC';

  filtered.sort((a, b) => {
    let valA = a[safeSortBy];
    let valB = b[safeSortBy];

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = (valB || '').toLowerCase();
    }

    if (valA < valB) return isAsc ? -1 : 1;
    if (valA > valB) return isAsc ? 1 : -1;
    return 0;
  });

  // Phân trang
  const total = filtered.length;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = parseInt(limit) || 50;
  const offset = (pageNum - 1) * limitNum;
  const paged = filtered.slice(offset, offset + limitNum);

  return {
    data: paged,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.ceil(total / limitNum)
    }
  };
}

/**
 * Lấy SIM theo ID
 */
function getSimById(id) {
  return data.sims.find(s => s.id === parseInt(id)) || null;
}

/**
 * Tạo SIM mới
 */
function createSim({ phone_number, network, sim_type, price, status = 'Còn hàng', notes = '' }) {
  // Kiểm tra trùng số
  const existing = data.sims.find(s => s.phone_number === phone_number);
  if (existing) {
    throw new Error('UNIQUE constraint failed: Số điện thoại đã tồn tại');
  }

  // Validate enum
  if (!VALID_NETWORKS.includes(network)) throw new Error('CHECK constraint failed: network');
  if (!VALID_SIM_TYPES.includes(sim_type)) throw new Error('CHECK constraint failed: sim_type');
  if (status && !VALID_STATUSES.includes(status)) throw new Error('CHECK constraint failed: status');

  const now = new Date().toISOString();
  const sim = {
    id: data._meta.next_sim_id++,
    phone_number,
    network,
    sim_type,
    price: parseInt(price),
    status: status || 'Còn hàng',
    notes: notes || '',
    created_at: now,
    updated_at: now
  };

  data.sims.push(sim);
  saveData(data);
  return sim;
}

/**
 * Cập nhật SIM
 */
function updateSim(id, updates) {
  const index = data.sims.findIndex(s => s.id === parseInt(id));
  if (index === -1) return null;

  const existing = data.sims[index];

  // Kiểm tra trùng số (nếu đổi số)
  if (updates.phone_number && updates.phone_number !== existing.phone_number) {
    const dup = data.sims.find(s => s.phone_number === updates.phone_number && s.id !== parseInt(id));
    if (dup) throw new Error('UNIQUE constraint failed: Số điện thoại đã tồn tại');
  }

  // Validate enums nếu có thay đổi
  if (updates.network && !VALID_NETWORKS.includes(updates.network)) throw new Error('CHECK constraint failed: network');
  if (updates.sim_type && !VALID_SIM_TYPES.includes(updates.sim_type)) throw new Error('CHECK constraint failed: sim_type');
  if (updates.status && !VALID_STATUSES.includes(updates.status)) throw new Error('CHECK constraint failed: status');

  const updated = {
    ...existing,
    phone_number: updates.phone_number ?? existing.phone_number,
    network: updates.network ?? existing.network,
    sim_type: updates.sim_type ?? existing.sim_type,
    price: updates.price !== undefined ? parseInt(updates.price) : existing.price,
    status: updates.status ?? existing.status,
    notes: updates.notes !== undefined ? updates.notes : existing.notes,
    updated_at: new Date().toISOString()
  };

  data.sims[index] = updated;
  saveData(data);
  return updated;
}

/**
 * Xóa SIM
 */
function deleteSim(id) {
  const index = data.sims.findIndex(s => s.id === parseInt(id));
  if (index === -1) return false;

  data.sims.splice(index, 1);
  saveData(data);
  return true;
}

/**
 * Nhập SIM hàng loạt từ dữ liệu CSV
 * Định dạng: phone_number,network,sim_type,price,status,notes
 */
function bulkImportSims(csvText) {
  const lines = csvText.trim().split('\n');
  const results = { success: 0, errors: [] };

  // Bỏ qua dòng tiêu đề nếu có
  const startIndex = lines[0].toLowerCase().includes('phone') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length < 4) {
        results.errors.push({ line: i + 1, error: 'Thiếu dữ liệu, cần ít nhất: số điện thoại, mạng, loại SIM, giá' });
        continue;
      }

      const [phone_number, network, sim_type, price, status = 'Còn hàng', notes = ''] = parts;

      createSim({ phone_number, network, sim_type, price: parseInt(price), status, notes });
      results.success++;
    } catch (err) {
      results.errors.push({ line: i + 1, error: err.message });
    }
  }

  return results;
}

/**
 * Lấy thống kê tổng quan cho dashboard
 */
function getStats() {
  const sims = data.sims;
  const totalSims = sims.length;

  // Thống kê theo trạng thái
  const byStatusMap = {};
  sims.forEach(s => {
    byStatusMap[s.status] = (byStatusMap[s.status] || 0) + 1;
  });
  const byStatus = Object.entries(byStatusMap).map(([status, count]) => ({ status, count }));

  // Thống kê theo mạng
  const byNetworkMap = {};
  sims.forEach(s => {
    if (!byNetworkMap[s.network]) byNetworkMap[s.network] = { count: 0, total_value: 0 };
    byNetworkMap[s.network].count++;
    byNetworkMap[s.network].total_value += s.price;
  });
  const byNetwork = Object.entries(byNetworkMap)
    .map(([network, v]) => ({ network, count: v.count, total_value: v.total_value }))
    .sort((a, b) => b.count - a.count);

  // Thống kê theo loại SIM
  const byTypeMap = {};
  sims.forEach(s => {
    byTypeMap[s.sim_type] = (byTypeMap[s.sim_type] || 0) + 1;
  });
  const byType = Object.entries(byTypeMap)
    .map(([sim_type, count]) => ({ sim_type, count }))
    .sort((a, b) => b.count - a.count);

  // Tổng giá trị kho hàng (SIM còn hàng)
  const available = sims.filter(s => s.status === 'Còn hàng');
  const inventoryValue = available.reduce((sum, s) => sum + s.price, 0);

  // Tổng doanh thu (SIM đã bán)
  const sold = sims.filter(s => s.status === 'Đã bán');
  const revenue = sold.reduce((sum, s) => sum + s.price, 0);

  // Giá cao nhất và thấp nhất (SIM còn hàng)
  const prices = available.map(s => s.price);
  const priceRange = {
    min_price: prices.length > 0 ? Math.min(...prices) : 0,
    max_price: prices.length > 0 ? Math.max(...prices) : 0,
    avg_price: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0
  };

  // SIM mới thêm gần đây (5 SIM mới nhất)
  const recentSims = [...sims]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  return {
    total_sims: totalSims,
    by_status: byStatus,
    by_network: byNetwork,
    by_type: byType,
    inventory_value: inventoryValue,
    revenue,
    price_range: priceRange,
    recent_sims: recentSims
  };
}

// =============================================
// Các hàm truy vấn mẫu bài đăng
// =============================================

/**
 * Lấy tất cả mẫu bài đăng Zalo
 */
function getTemplates() {
  return data.templates;
}

/**
 * Lấy mẫu bài đăng theo ID
 */
function getTemplateById(id) {
  return data.templates.find(t => t.id === parseInt(id)) || null;
}

// =============================================
// Khởi tạo database khi import module
// =============================================
initializeDatabase();

module.exports = {
  getSims,
  getSimById,
  createSim,
  updateSim,
  deleteSim,
  bulkImportSims,
  getStats,
  getTemplates,
  getTemplateById,
  VALID_NETWORKS,
  VALID_SIM_TYPES,
  VALID_STATUSES
};

// =============================================
// server.js - Máy chủ Express.js
// Ứng dụng quản lý SIM số đẹp
// =============================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const database = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// =============================================
// Middleware
// =============================================

// Bật CORS cho tất cả các nguồn
app.use(cors());

// Parse JSON body
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded body
app.use(express.urlencoded({ extended: true }));

// Phục vụ file tĩnh từ thư mục 'public' và thư mục gốc
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// =============================================
// Hàm tiện ích & Chuẩn hóa dữ liệu
// =============================================

function normalizeSim(sim) {
  if (!sim) return sim;
  const phone = sim.phone_number || sim.number || sim.phone || '';
  const type = sim.sim_type || sim.type || '';
  return {
    ...sim,
    phone_number: phone,
    number: phone,
    phone: phone,
    sim_type: type,
    type: type
  };
}

/**
 * Định dạng giá tiền VND
 * Ví dụ: 12000000 -> "12.000.000đ"
 */
function formatPrice(price) {
  return price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

/**
 * Tạo tag mạng không dấu cho hashtag
 */
function networkToTag(network) {
  const map = {
    'Viettel': 'viettel',
    'Mobifone': 'mobifone',
    'Vinaphone': 'vinaphone',
    'Vietnamobile': 'vietnamobile',
    'Gmobile': 'gmobile',
    'Itelecom': 'itelecom',
    'Reddi': 'reddi',
    'Wintel': 'wintel'
  };
  return map[network] || network.toLowerCase();
}

/**
 * Render nội dung mẫu bài đăng với dữ liệu SIM
 * Hỗ trợ cú pháp {{variable}} và {{#section}}...{{/section}}
 */
function renderTemplate(templateText, sims, options = {}) {
  let output = templateText;
  const { discount_percent = 0 } = options;

  if (sims.length === 1) {
    // === Chế độ đăng đơn lẻ ===
    const sim = sims[0];
    output = output.replace(/\{\{phone_number\}\}/g, sim.phone_number);
    output = output.replace(/\{\{network\}\}/g, sim.network);
    output = output.replace(/\{\{sim_type\}\}/g, sim.sim_type);
    output = output.replace(/\{\{price\}\}/g, formatPrice(sim.price));
    output = output.replace(/\{\{status\}\}/g, sim.status);
    output = output.replace(/\{\{network_tag\}\}/g, networkToTag(sim.network));

    // Xử lý ghi chú có điều kiện
    if (sim.notes && sim.notes.trim()) {
      output = output.replace(/\{\{#notes\}\}(.*?)\{\{\/notes\}\}/gs, (_, content) => {
        return content.replace(/\{\{notes\}\}/g, sim.notes);
      });
    } else {
      output = output.replace(/\{\{#notes\}\}.*?\{\{\/notes\}\}/gs, '');
    }

    // Tính giá khuyến mãi nếu có
    if (discount_percent > 0) {
      const discountedPrice = Math.round(sim.price * (1 - discount_percent / 100));
      const savings = sim.price - discountedPrice;
      output = output.replace(/\{\{discounted_price\}\}/g, formatPrice(discountedPrice));
      output = output.replace(/\{\{savings\}\}/g, formatPrice(savings));
    }
  }

  // === Chế độ danh sách nhiều SIM ===
  const listMatch = output.match(/\{\{#sim_list\}\}([\s\S]*?)\{\{\/sim_list\}\}/);
  if (listMatch) {
    const itemTemplate = listMatch[1].trim();
    const listItems = sims.map((sim, i) => {
      let item = itemTemplate;
      item = item.replace(/\{\{index\}\}/g, (i + 1).toString());
      item = item.replace(/\{\{phone_number\}\}/g, sim.phone_number);
      item = item.replace(/\{\{network\}\}/g, sim.network);
      item = item.replace(/\{\{sim_type\}\}/g, sim.sim_type);
      item = item.replace(/\{\{price\}\}/g, formatPrice(sim.price));
      item = item.replace(/\{\{status\}\}/g, sim.status);
      item = item.replace(/\{\{network_tag\}\}/g, networkToTag(sim.network));

      // Giá khuyến mãi cho từng SIM
      if (discount_percent > 0) {
        const discountedPrice = Math.round(sim.price * (1 - discount_percent / 100));
        const savings = sim.price - discountedPrice;
        item = item.replace(/\{\{discounted_price\}\}/g, formatPrice(discountedPrice));
        item = item.replace(/\{\{savings\}\}/g, formatPrice(savings));
      }

      // Xử lý ghi chú có điều kiện
      if (sim.notes && sim.notes.trim()) {
        item = item.replace(/\{\{#notes\}\}(.*?)\{\{\/notes\}\}/gs, (_, content) => {
          return content.replace(/\{\{notes\}\}/g, sim.notes);
        });
      } else {
        item = item.replace(/\{\{#notes\}\}.*?\{\{\/notes\}\}/gs, '');
      }

      return item;
    }).join('\n');

    output = output.replace(/\{\{#sim_list\}\}[\s\S]*?\{\{\/sim_list\}\}/, listItems);
  }

  // Thay thế thống kê tổng hợp
  if (sims.length > 0) {
    const prices = sims.map(s => s.price);
    output = output.replace(/\{\{total_count\}\}/g, sims.length.toString());
    output = output.replace(/\{\{min_price\}\}/g, formatPrice(Math.min(...prices)));
    output = output.replace(/\{\{max_price\}\}/g, formatPrice(Math.max(...prices)));
  }

  // Xóa các dòng trống liên tiếp (giữ tối đa 2 dòng trống)
  output = output.replace(/\n{3,}/g, '\n\n');

  return output.trim();
}

// =============================================
// Danh sách giá trị enum hợp lệ
// =============================================
const VALID_NETWORKS = ['Viettel', 'Mobifone', 'Vinaphone', 'Vietnamobile', 'Gmobile', 'Itelecom', 'Reddi', 'Wintel'];
const VALID_SIM_TYPES = ['Số đẹp', 'Phong thủy', 'Lộc phát', 'Thần tài', 'Tam hoa', 'Tứ quý', 'Ngũ quý', 'Lục quý', 'Tiến', 'Đảo', 'Gánh', 'Số VIP', 'Số thường'];
const VALID_STATUSES = ['Còn hàng', 'Đã bán', 'Đã giữ'];

/**
 * Kiểm tra dữ liệu đầu vào SIM
 */
function validateSimInput(data, isUpdate = false) {
  const errors = [];
  const phone = data.phone_number || data.number || data.phone;

  if (!isUpdate || phone !== undefined) {
    if (!phone || typeof phone !== 'string' || phone.trim() === '') {
      errors.push('Số điện thoại là bắt buộc');
    }
  }

  if (data.price !== undefined) {
    const price = parseInt(data.price);
    if (isNaN(price) || price < 0) {
      data.price = 0;
    }
  }

  return errors;
}

// =============================================
// API Routes - SIM CRUD
// =============================================

/**
 * GET /api/sims
 * Lấy danh sách SIM với bộ lọc, phân trang và sắp xếp
 */
app.get('/api/sims', (req, res) => {
  try {
    const result = database.getSims(req.query);
    const normalizedData = (result.data || []).map(normalizeSim);
    res.json({
      success: true,
      ...result,
      data: normalizedData
    });
  } catch (err) {
    console.error('❌ Lỗi lấy danh sách SIM:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi server khi lấy danh sách SIM' });
  }
});

/**
 * GET /api/sims/stats
 * Lấy thống kê tổng quan cho dashboard
 */
app.get('/api/sims/stats', (req, res) => {
  try {
    const stats = database.getStats();
    if (stats && stats.recent_sims) {
      stats.recent_sims = stats.recent_sims.map(normalizeSim);
    }
    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    console.error('❌ Lỗi lấy thống kê:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi server khi lấy thống kê' });
  }
});

/**
 * GET /api/sims/:id
 * Lấy thông tin chi tiết một SIM
 */
app.get('/api/sims/:id', (req, res) => {
  try {
    const sim = database.getSimById(parseInt(req.params.id));
    if (!sim) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy SIM' });
    }
    res.json({ success: true, data: normalizeSim(sim) });
  } catch (err) {
    console.error('❌ Lỗi lấy thông tin SIM:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi server' });
  }
});

/**
 * POST /api/sims
 * Tạo SIM mới
 */
app.post('/api/sims', (req, res) => {
  try {
    const errors = validateSimInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const payload = {
      phone_number: req.body.phone_number || req.body.number || req.body.phone,
      network: req.body.network,
      sim_type: req.body.sim_type || req.body.type,
      price: req.body.price,
      status: req.body.status,
      notes: req.body.notes
    };

    const sim = database.createSim(payload);
    res.status(201).json({
      success: true,
      message: 'Tạo SIM thành công',
      data: normalizeSim(sim)
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ success: false, error: 'Số điện thoại đã tồn tại trong hệ thống' });
    }
    if (err.message.includes('CHECK constraint failed')) {
      return res.status(400).json({ success: false, error: 'Dữ liệu không hợp lệ, vui lòng kiểm tra lại các giá trị' });
    }
    console.error('❌ Lỗi tạo SIM:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi server khi tạo SIM' });
  }
});

/**
 * PUT /api/sims/:id
 * Cập nhật thông tin SIM
 */
app.put('/api/sims/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const errors = validateSimInput(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    const payload = {
      phone_number: req.body.phone_number || req.body.number || req.body.phone,
      network: req.body.network,
      sim_type: req.body.sim_type || req.body.type,
      price: req.body.price,
      status: req.body.status,
      notes: req.body.notes
    };

    const sim = database.updateSim(id, payload);
    if (!sim) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy SIM để cập nhật' });
    }

    res.json({
      success: true,
      message: 'Cập nhật SIM thành công',
      data: normalizeSim(sim)
    });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ success: false, error: 'Số điện thoại đã tồn tại' });
    }
    if (err.message.includes('CHECK constraint failed')) {
      return res.status(400).json({ success: false, error: 'Dữ liệu không hợp lệ' });
    }
    console.error('❌ Lỗi cập nhật SIM:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi server khi cập nhật SIM' });
  }
});

/**
 * DELETE /api/sims/:id
 * Xóa SIM
 */
app.delete('/api/sims/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const deleted = database.deleteSim(id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy SIM để xóa' });
    }

    res.json({
      success: true,
      message: 'Xóa SIM thành công'
    });
  } catch (err) {
    console.error('❌ Lỗi xóa SIM:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi server khi xóa SIM' });
  }
});

/**
 * POST /api/sims/bulk
 * Nhập SIM hàng loạt từ dữ liệu CSV
 *
 * Body: { csv: "phone_number,network,sim_type,price,status,notes\n..." }
 */
app.post('/api/sims/bulk', (req, res) => {
  try {
    const { csv } = req.body;
    if (!csv || typeof csv !== 'string' || csv.trim() === '') {
      return res.status(400).json({ success: false, error: 'Dữ liệu CSV không được để trống' });
    }

    const result = database.bulkImportSims(csv);
    res.json({
      success: true,
      message: `Nhập thành công ${result.success} SIM`,
      data: result
    });
  } catch (err) {
    console.error('❌ Lỗi nhập SIM hàng loạt:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi server khi nhập SIM' });
  }
});

// =============================================
// API Routes - Mẫu bài đăng Zalo
// =============================================

/**
 * GET /api/templates
 * Lấy danh sách tất cả mẫu bài đăng
 */
app.get('/api/templates', (req, res) => {
  try {
    const templates = database.getTemplates();
    res.json({
      success: true,
      data: templates
    });
  } catch (err) {
    console.error('❌ Lỗi lấy mẫu bài đăng:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi server khi lấy mẫu bài đăng' });
  }
});

/**
 * POST /api/templates/generate
 * Tạo bài đăng Zalo từ mẫu + SIM đã chọn
 *
 * Body: {
 *   template_id: number,       // ID của mẫu bài đăng
 *   sim_ids: number[],         // Danh sách ID SIM cần đăng
 *   discount_percent?: number  // Phần trăm giảm giá (cho mẫu khuyến mãi)
 * }
 */
app.post('/api/templates/generate', (req, res) => {
  try {
    const { template_id, sim_ids, discount_percent = 0 } = req.body;

    // Kiểm tra dữ liệu đầu vào
    if (!template_id) {
      return res.status(400).json({ success: false, error: 'Cần chọn mẫu bài đăng (template_id)' });
    }
    if (!sim_ids || !Array.isArray(sim_ids) || sim_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Cần chọn ít nhất 1 SIM (sim_ids)' });
    }

    // Lấy mẫu bài đăng
    const template = database.getTemplateById(parseInt(template_id));
    if (!template) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy mẫu bài đăng' });
    }

    // Lấy danh sách SIM
    const sims = sim_ids.map(id => database.getSimById(parseInt(id))).filter(Boolean);
    if (sims.length === 0) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy SIM nào trong danh sách' });
    }

    // Render bài đăng
    const generatedPost = renderTemplate(template.template_text, sims, {
      discount_percent: parseInt(discount_percent) || 0
    });

    res.json({
      success: true,
      data: {
        template_name: template.name,
        sim_count: sims.length,
        generated_text: generatedPost
      }
    });
  } catch (err) {
    console.error('❌ Lỗi tạo bài đăng:', err.message);
    res.status(500).json({ success: false, error: 'Lỗi server khi tạo bài đăng' });
  }
});

// =============================================
// API Route - Lấy danh sách enum values
// =============================================

/**
 * GET /api/enums
 * Trả về các giá trị enum cho dropdown / filter
 */
app.get('/api/enums', (req, res) => {
  res.json({
    success: true,
    data: {
      networks: VALID_NETWORKS,
      sim_types: VALID_SIM_TYPES,
      statuses: VALID_STATUSES
    }
  });
});

// =============================================
// Xử lý lỗi 404
// =============================================
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `Không tìm thấy API: ${req.method} ${req.originalUrl}`
  });
});

// =============================================
// Xử lý lỗi chung
// =============================================
app.use((err, req, res, next) => {
  console.error('❌ Lỗi không xác định:', err);
  res.status(500).json({
    success: false,
    error: 'Đã xảy ra lỗi không mong muốn trên server'
  });
});

// =============================================
// Khởi chạy server
// =============================================
app.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════╗');
  console.log('║   🔥 SIM Manager - Quản lý SIM số đẹp   ║');
  console.log('╠═══════════════════════════════════════════╣');
  console.log(`║   🌐 Server: http://localhost:${PORT}        ║`);
  console.log(`║   📂 API:    http://localhost:${PORT}/api    ║`);
  console.log('╚═══════════════════════════════════════════╝');
  console.log('');
});

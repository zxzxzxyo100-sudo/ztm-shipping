/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║         Nawris × ZTM — Store Integration Service            ║
 * ║  وظائف: إنشاء شحنة | تتبع | طباعة ستيكر | إشعار العميل    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * طريقة الاستخدام:
 *   1. استبدل YOUR_AUTH_KEY و YOUR_CLIENT_CODE بمفاتيحك
 *   2. استدعِ NawrisStore.createShipment(order) عند ورود طلب جديد
 *   3. استدعِ NawrisStore.syncStatus(trackingCode) للتتبع
 *
 * متوافق مع: المتصفح (Vanilla JS) + Node.js + أي فريموورك
 */

// ═══════════════════════════════════════════════════════════════
//  ⚙️  CONFIG — استبدل هذه القيم بمفاتيحك من بوابة النورس
// ═══════════════════════════════════════════════════════════════
const NAWRIS_CONFIG = {
  BASE_URL:    "https://backoffice.nawris.algoriza.com/external-api",
  AUTH_KEY:    "2fb86dbe95bd9879b200063a95c1a9c5030f67f7883051c10c07133151499a6d",
  CLIENT_CODE: "3729",

  // إعدادات الشحن الافتراضية لمتجرك — غيّرها حسب سياستك
  DEFAULTS: {
    can_open:               "0",   // لا يُفتح الطرد
    is_office_given:        "0",   // تسليم عادي (ليس مكتب)
    shipment_on_sender:     "0",   // التوصيل على المستلم
    extra_cost_payer:       "1",   // التكلفة الإضافية على المستلم
    is_fragile:             "0",   // غير قابل للكسر افتراضياً
    is_measurable:          "1",   // قابل للقياس
    accept_20_plus_5_dinar: "0",   // لا يقبل فئة 20+5
    is_order:               "0",   // طلب عادي مع تحصيل
  },
};

// ═══════════════════════════════════════════════════════════════
//  🔧  HTTP HELPERS
// ═══════════════════════════════════════════════════════════════
const _http = {

  /** POST بـ x-www-form-urlencoded */
  async post(endpoint, body = {}) {
    const params = new URLSearchParams({
      authentication_key: NAWRIS_CONFIG.AUTH_KEY,
      main_client_code:   NAWRIS_CONFIG.CLIENT_CODE,
      ...body,
    });

    const res = await fetch(`${NAWRIS_CONFIG.BASE_URL}${endpoint}`, {
      method:  "POST",
      headers: {
        "Accept":       "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!data || data.success === 0) {
      throw new Error(data?.error_msg || `فشل الطلب على ${endpoint}`);
    }
    return data;
  },

  /** GET مع query params */
  async get(endpoint, params = {}) {
    const query = new URLSearchParams({
      authentication_key: NAWRIS_CONFIG.AUTH_KEY,
      main_client_code:   NAWRIS_CONFIG.CLIENT_CODE,
      ...params,
    });

    const res = await fetch(`${NAWRIS_CONFIG.BASE_URL}${endpoint}?${query}`, {
      method:  "GET",
      headers: { "Accept": "application/json" },
    });

    const data = await res.json();
    if (!data || data.success === 0) {
      throw new Error(data?.error_msg || `فشل الطلب على ${endpoint}`);
    }
    return data;
  },
};

// ═══════════════════════════════════════════════════════════════
//  📦  FUNCTION 1 — إنشاء طلب شحن تلقائياً
// ═══════════════════════════════════════════════════════════════
/**
 * يُستدعى فور ورود طلب جديد من متجرك
 *
 * @param {Object} order — بيانات الطلب من متجرك
 * @param {string} order.receiver               اسم المستلم
 * @param {string} order.phone1                 هاتف المستلم
 * @param {string} [order.phone2]               هاتف ثانٍ
 * @param {string} order.government             المحافظة
 * @param {string} [order.area]                 المنطقة
 * @param {string} [order.address]              العنوان
 * @param {string} order.order_summary          محتوى الطلب
 * @param {number} order.amount_to_be_collected سعر المنتج
 * @param {number} order.return_amount          قيمة الارتجاع
 * @param {string} [order.invoice_number]       رقم الفاتورة
 * @param {string} [order.notes]                ملاحظات
 * @param {Object} [order.overrides]            لتجاوز الإعدادات الافتراضية
 *
 * @returns {Promise<{
 *   code: string,
 *   bar_code: string,
 *   invoice_number: string,
 *   tracking_url: string
 * }>}
 *
 * @example
 * // عند ورود طلب من متجرك
 * const shipment = await NawrisStore.createShipment({
 *   receiver:               "أحمد العمري",
 *   phone1:                 "0911234567",
 *   government:             "طرابلس",
 *   area:                   "أبوسليم (s19)",
 *   address:                "شارع بورسعيد",
 *   order_summary:          "ملابس - 3 قطع",
 *   amount_to_be_collected: 250,
 *   return_amount:          200,
 *   invoice_number:         "ORD-1042",
 * });
 * console.log(shipment.code);      // → "ZTM-48210"
 * console.log(shipment.bar_code);  // → "1596782..."
 */
async function createShipment(order) {
  const payload = {
    // بيانات المستلم
    receiver:               order.receiver,
    phone1:                 order.phone1,
    phone2:                 order.phone2               || "",
    api_followup_phone:     order.api_followup_phone   || order.phone1,

    // عنوان التوصيل
    government:             order.government,
    area:                   order.area                 || "",
    address:                order.address              || "",

    // تفاصيل الطلب
    order_summary:          order.order_summary,
    amount_to_be_collected: order.amount_to_be_collected,
    return_amount:          order.return_amount,
    invoice_number:         order.invoice_number       || "",
    notes:                  order.notes                || "",
    pieces_count:           order.pieces_count         || "1",
    second_client:          order.second_client        || "",

    // نوع الطلب
    is_order:               order.is_order             || NAWRIS_CONFIG.DEFAULTS.is_order,
    return_summary:         order.return_summary       || "",

    // خيارات الشحن (من الإعدادات الافتراضية قابلة للتجاوز)
    can_open:               order.overrides?.can_open               ?? NAWRIS_CONFIG.DEFAULTS.can_open,
    is_office_given:        order.overrides?.is_office_given        ?? NAWRIS_CONFIG.DEFAULTS.is_office_given,
    shipment_on_sender:     order.overrides?.shipment_on_sender     ?? NAWRIS_CONFIG.DEFAULTS.shipment_on_sender,
    extra_cost_payer:       order.overrides?.extra_cost_payer       ?? NAWRIS_CONFIG.DEFAULTS.extra_cost_payer,
    is_fragile:             order.overrides?.is_fragile             ?? NAWRIS_CONFIG.DEFAULTS.is_fragile,
    is_measurable:          order.overrides?.is_measurable          ?? NAWRIS_CONFIG.DEFAULTS.is_measurable,
    accept_20_plus_5_dinar: order.overrides?.accept_20_plus_5_dinar ?? NAWRIS_CONFIG.DEFAULTS.accept_20_plus_5_dinar,
  };

  const data = await _http.post("/add-order", payload);
  const result = data.result;

  return {
    code:           String(result.code),
    bar_code:       String(result.bar_code),
    invoice_number: String(result.invoice_number),
    tracking_url:   `https://portal.nawris.algoriza.com/track/${result.bar_code}`,
  };
}

// ═══════════════════════════════════════════════════════════════
//  🔍  FUNCTION 2 — تتبع حالة الطلب وتحديثها
// ═══════════════════════════════════════════════════════════════

// خريطة الحالات العربية → slug داخلي + بيانات العرض
const STATUS_MAP = {
  "مرسلة من المتجر":          { slug: "sent_from_store",        label_ar: "مرسلة من المتجر",        color: "#888780", emoji: "📤" },
  "محفوظة":                    { slug: "saved",                  label_ar: "محفوظة",                  color: "#1D9E75", emoji: "📦" },
  "في الشركة":                 { slug: "in_company",             label_ar: "في الشركة",               color: "#1D9E75", emoji: "🏢" },
  "بالطريق إلى الفرع":         { slug: "to_branch",              label_ar: "بالطريق إلى الفرع",       color: "#7F77DD", emoji: "🛣️" },
  "وصلت إلى الفرع":           { slug: "arrived_branch",         label_ar: "وصلت إلى الفرع",         color: "#7F77DD", emoji: "🏪" },
  "مع المندوب":                { slug: "with_agent",             label_ar: "مع المندوب",              color: "#2dd4bf", emoji: "🚚" },
  "تم التسليم":                { slug: "delivered",              label_ar: "تم التسليم",              color: "#22c97a", emoji: "✅" },
  "راجع لدى المندوب":          { slug: "return_agent",           label_ar: "راجع لدى المندوب",        color: "#D85A30", emoji: "↩️" },
  "مخزن المرتجعات":           { slug: "return_warehouse",       label_ar: "مخزن المرتجعات",         color: "#D85A30", emoji: "🗃️" },
  "مرتجع وصل للفرع":          { slug: "return_arrived_branch",  label_ar: "مرتجع وصل للفرع",        color: "#D85A30", emoji: "↩️" },
  "مرتجع بالطريق للشركة":     { slug: "return_to_company",      label_ar: "مرتجع بالطريق للشركة",   color: "#D85A30", emoji: "🚛" },
  "راجع في الشركة":            { slug: "return_in_company",      label_ar: "راجع في الشركة",          color: "#D85A30", emoji: "🏢" },
  "مرتجعات تم استلامها":      { slug: "return_received",        label_ar: "مرتجعات تم استلامها",    color: "#888780", emoji: "♻️" },
  "مؤجلة مع المندوب":         { slug: "postponed",              label_ar: "مؤجلة مع المندوب",       color: "#f5a623", emoji: "⏸"  },
  "معاد إرسالها":              { slug: "resent",                 label_ar: "معاد إرسالها",            color: "#a78bfa", emoji: "🔁" },
  "طلب معدوم":                 { slug: "null_order",             label_ar: "طلب معدوم",               color: "#ff5c5c", emoji: "❌" },
};

/**
 * تتبع طلب واحد بالكود أو الباركود
 *
 * @param {string} trackingCode — كود الطلب أو الباركود
 * @returns {Promise<{
 *   code, bar_code, status_raw, status, slug, color, emoji,
 *   is_delivered, is_returned, captain, branch, received_amount,
 *   return_reason, delay_reason
 * }>}
 *
 * @example
 * const info = await NawrisStore.syncStatus("ZTM-48210");
 * if (info.is_delivered) {
 *   console.log("✅ تم التسليم");
 * } else {
 *   console.log(info.emoji, info.status.label_ar);
 * }
 */
async function syncStatus(trackingCode) {
  const data   = await _http.post("/search-order", { search_Key: trackingCode });
  const result = data.result;
  const raw    = result.status || "";
  const meta   = STATUS_MAP[raw] || { slug: "unknown", label_ar: raw, color: "#888780", emoji: "❓" };

  return {
    code:            result.code,
    bar_code:        result.bar_code,
    status_raw:      raw,
    status:          meta,
    slug:            meta.slug,
    color:           meta.color,
    emoji:           meta.emoji,
    is_delivered:    meta.slug === "delivered",
    is_returned:     meta.slug.startsWith("return"),
    is_terminal:     ["delivered","return_received","null_order"].includes(meta.slug),
    captain:         result.captain         || null,
    captain_phone:   result.captain_number1 || null,
    branch:          result.branch          || null,
    received_amount: result.received_amount || null,
    return_reason:   result.return_reason   || null,
    delay_reason:    result.delay_reason    || null,
    has_inventory:   result.returned_inventory_status === "يوجد",
  };
}

/**
 * تتبع عدة طلبات دفعة واحدة
 *
 * @param {string[]} trackingCodes — مصفوفة أكواد أو باركودات
 * @returns {Promise<Object[]>}
 *
 * @example
 * const results = await NawrisStore.syncBatch(["ZTM-001","ZTM-002","ZTM-003"]);
 * results.forEach(r => console.log(r.code, r.emoji, r.status.label_ar));
 */
async function syncBatch(trackingCodes = []) {
  const results = await Promise.allSettled(
    trackingCodes.map(code => syncStatus(code))
  );

  return results.map((r, i) => ({
    tracking_code: trackingCodes[i],
    success:       r.status === "fulfilled",
    data:          r.status === "fulfilled" ? r.value : null,
    error:         r.status === "rejected"  ? r.reason?.message : null,
  }));
}

// ═══════════════════════════════════════════════════════════════
//  🏷️  FUNCTION 3 — طباعة الستيكر تلقائياً
// ═══════════════════════════════════════════════════════════════

/**
 * إنشاء HTML الستيكر وفتحه للطباعة
 *
 * @param {Object} shipment — نتيجة createShipment()
 * @param {Object} order    — بيانات الطلب الأصلية
 * @param {Object} [opts]
 * @param {boolean} [opts.autoPrint=true]    — طباعة تلقائية فور الفتح
 * @param {boolean} [opts.returnHTML=false]  — إرجاع HTML بدل الفتح (للحفظ)
 *
 * @example
 * const shipment = await NawrisStore.createShipment(order);
 * await NawrisStore.printSticker(shipment, order);
 */
function printSticker(shipment, order, opts = {}) {
  const { autoPrint = true, returnHTML = false } = opts;

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<title>ستيكر شحن — ${shipment.code}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Cairo',sans-serif; background:#fff; color:#111; }

  .sticker {
    width: 100mm; min-height: 150mm;
    border: 2px solid #111;
    border-radius: 6px;
    padding: 12px;
    page-break-inside: avoid;
  }

  /* Header */
  .header {
    display: flex; justify-content: space-between;
    align-items: center; margin-bottom: 10px;
    padding-bottom: 8px; border-bottom: 1.5px solid #111;
  }
  .company-name { font-size: 18px; font-weight: 900; color: #e63030; letter-spacing: 1px; }
  .company-sub  { font-size: 9px; color: #666; }
  .order-code   { font-size: 22px; font-weight: 900; color: #111; font-variant-numeric: tabular-nums; }

  /* Barcode area */
  .barcode-section {
    text-align: center; margin: 10px 0;
    padding: 8px; background: #f5f5f5;
    border-radius: 4px;
  }
  .barcode-num {
    font-size: 20px; font-weight: 900;
    letter-spacing: 5px; font-variant-numeric: tabular-nums;
  }
  .barcode-label { font-size: 9px; color: #666; margin-top: 2px; }

  /* Info rows */
  .info-section { margin: 10px 0; }
  .row {
    display: flex; justify-content: space-between;
    align-items: flex-start;
    padding: 5px 0; border-bottom: 0.5px solid #ddd;
    font-size: 11px; gap: 8px;
  }
  .row:last-child { border-bottom: none; }
  .row-label { color: #666; flex-shrink: 0; min-width: 60px; }
  .row-val   { font-weight: 700; text-align: left; word-break: break-word; }

  /* Amount box */
  .amount-box {
    margin-top: 10px; padding: 10px;
    background: #111; color: #fff; border-radius: 4px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .amount-label { font-size: 12px; }
  .amount-val   { font-size: 20px; font-weight: 900; color: #e63030; }

  /* Notes */
  .notes-box {
    margin-top: 8px; padding: 6px 8px;
    border: 1px dashed #999; border-radius: 4px;
    font-size: 10px; color: #444; line-height: 1.5;
  }

  /* Footer */
  .footer {
    margin-top: 10px; text-align: center;
    font-size: 9px; color: #999;
    border-top: 0.5px solid #ddd; padding-top: 6px;
  }

  @media print {
    body { margin: 0; }
    .sticker { border: 2px solid #111; margin: 0; }
  }
</style>
</head>
<body>
<div class="sticker">

  <div class="header">
    <div>
      <div class="company-name">ZTM</div>
      <div class="company-sub">منظومة الشحن والتوصيل</div>
    </div>
    <div class="order-code">#${shipment.code}</div>
  </div>

  <div class="barcode-section">
    <div class="barcode-num">${shipment.bar_code}</div>
    <div class="barcode-label">رقم الباركود</div>
  </div>

  <div class="info-section">
    <div class="row">
      <span class="row-label">المستلم</span>
      <span class="row-val">${order.receiver}</span>
    </div>
    <div class="row">
      <span class="row-label">الهاتف</span>
      <span class="row-val" style="direction:ltr">${order.phone1}${order.phone2 ? ' / ' + order.phone2 : ''}</span>
    </div>
    <div class="row">
      <span class="row-label">المحافظة</span>
      <span class="row-val">${order.government}${order.area ? ' — ' + order.area : ''}</span>
    </div>
    ${order.address ? `
    <div class="row">
      <span class="row-label">العنوان</span>
      <span class="row-val">${order.address}</span>
    </div>` : ''}
    <div class="row">
      <span class="row-label">المحتوى</span>
      <span class="row-val">${order.order_summary}</span>
    </div>
    ${order.invoice_number ? `
    <div class="row">
      <span class="row-label">الفاتورة</span>
      <span class="row-val">${order.invoice_number}</span>
    </div>` : ''}
    <div class="row">
      <span class="row-label">القطع</span>
      <span class="row-val">${order.pieces_count || 1} قطعة</span>
    </div>
  </div>

  <div class="amount-box">
    <span class="amount-label">مبلغ التحصيل</span>
    <span class="amount-val">${Number(order.amount_to_be_collected).toFixed(2)} <small style="font-size:12px">د.ل</small></span>
  </div>

  ${order.notes ? `<div class="notes-box">📌 ${order.notes}</div>` : ''}

  <div class="footer">
    ${new Date().toLocaleDateString('ar-LY', {year:'numeric',month:'long',day:'numeric'})}
    &nbsp;•&nbsp; ${shipment.tracking_url}
  </div>

</div>
${autoPrint ? '<script>window.onload = () => { window.print(); }<\/script>' : ''}
</body>
</html>`;

  if (returnHTML) return html;

  const win = window.open("", "_blank", "width=420,height=620");
  if (!win) {
    console.warn("[NawrisStore] تعذّر فتح نافذة الطباعة — تحقق من إعدادات المتصفح");
    return html;
  }
  win.document.write(html);
  win.document.close();
  return html;
}

// ═══════════════════════════════════════════════════════════════
//  🔔  FUNCTION 4 — إشعار العميل بالحالة
// ═══════════════════════════════════════════════════════════════

/**
 * قوالب رسائل الإشعار حسب الحالة
 * يمكنك تعديل النصوص حسب هوية متجرك
 */
const NOTIFICATION_TEMPLATES = {
  sent_from_store: (o) =>
    `📤 مرحباً ${o.name}، تم استلام طلبك رقم ${o.code} وهو الآن قيد التجهيز للشحن.`,

  saved: (o) =>
    `📦 طلبك رقم ${o.code} محفوظ لدى شركة ZTM وسيتم معالجته قريباً.`,

  in_company: (o) =>
    `🏢 طلبك رقم ${o.code} وصل إلى مستودعات ZTM وجارٍ تجهيزه للتوصيل.`,

  to_branch: (o) =>
    `🛣️ طلبك رقم ${o.code} في طريقه إلى الفرع — سيصل قريباً.`,

  arrived_branch: (o) =>
    `🏪 طلبك رقم ${o.code} وصل إلى الفرع وسيُسلَّم للمندوب خلال فترة وجيزة.`,

  with_agent: (o) =>
    `🚚 مرحباً ${o.name}، طلبك رقم ${o.code} مع المندوب الآن وسيصلك اليوم. هاتف المندوب: ${o.captain_phone || "—"}`,

  delivered: (o) =>
    `✅ تم تسليم طلبك رقم ${o.code} بنجاح. شكراً لثقتك بـ ZTM! 🎉`,

  postponed: (o) =>
    `⏸ طلبك رقم ${o.code} مؤجل مؤقتاً. ${o.delay_reason ? "السبب: " + o.delay_reason : "سنحاول التوصيل في أقرب وقت."}`,

  return_agent: (o) =>
    `↩️ لم نتمكن من تسليم طلبك رقم ${o.code}. ${o.return_reason ? "السبب: " + o.return_reason : ""} سيتم التواصل معك قريباً.`,

  return_warehouse: (o) =>
    `🗃️ طلبك رقم ${o.code} في مخزن المرتجعات. يمكنك التواصل مع ZTM لإعادة الإرسال.`,

  return_received: (o) =>
    `♻️ تم استلام مرتجع طلبك رقم ${o.code}. سيتم تسوية المبلغ قريباً.`,

  null_order: (o) =>
    `❌ طلبك رقم ${o.code} تعذّر العثور عليه. يرجى التواصل مع خدمة العملاء.`,
};

/**
 * بناء رسالة الإشعار حسب الحالة
 *
 * @param {string} slug        — slug الحالة (من syncStatus)
 * @param {Object} orderInfo   — { name, code, captain_phone?, delay_reason?, return_reason? }
 * @returns {string}           — نص الرسالة الجاهز للإرسال
 *
 * @example
 * const msg = NawrisStore.buildNotification("with_agent", {
 *   name: "أحمد",
 *   code: "ZTM-48210",
 *   captain_phone: "0912345678",
 * });
 * // أرسل msg عبر SMS / WhatsApp / إشعار المتجر
 */
function buildNotification(slug, orderInfo) {
  const tpl = NOTIFICATION_TEMPLATES[slug];
  if (!tpl) return `تحديث على طلبك رقم ${orderInfo.code}.`;
  return tpl(orderInfo);
}

/**
 * تتبع طلب + بناء الإشعار دفعة واحدة
 *
 * @param {string} trackingCode
 * @param {string} customerName
 * @returns {Promise<{ statusInfo, message }>}
 *
 * @example
 * const { statusInfo, message } = await NawrisStore.trackAndNotify("ZTM-48210", "أحمد");
 * sendSMS(customerPhone, message);
 */
async function trackAndNotify(trackingCode, customerName = "عزيزي العميل") {
  const statusInfo = await syncStatus(trackingCode);
  const message    = buildNotification(statusInfo.slug, {
    name:          customerName,
    code:          statusInfo.code,
    captain_phone: statusInfo.captain_phone,
    delay_reason:  statusInfo.delay_reason,
    return_reason: statusInfo.return_reason,
  });

  return { statusInfo, message };
}

// ═══════════════════════════════════════════════════════════════
//  🚀  FULL FLOW — الدورة الكاملة من الطلب إلى الإشعار
// ═══════════════════════════════════════════════════════════════

/**
 * الدورة الكاملة: إنشاء شحنة + طباعة ستيكر + إشعار العميل
 *
 * @param {Object} order         — بيانات الطلب
 * @param {string} customerPhone — رقم هاتف العميل للإشعار
 * @param {Function} [sendFn]    — دالة الإرسال (SMS / WhatsApp / API المتجر)
 *                                 تستقبل (phone, message)
 * @returns {Promise<Object>}
 *
 * @example
 * await NawrisStore.processNewOrder(
 *   {
 *     receiver: "أحمد العمري",
 *     phone1:   "0911234567",
 *     government: "طرابلس",
 *     order_summary: "ملابس",
 *     amount_to_be_collected: 250,
 *     return_amount: 200,
 *   },
 *   "0911234567",
 *   (phone, msg) => mySMSService.send(phone, msg)
 * );
 */
async function processNewOrder(order, customerPhone, sendFn = null) {
  console.log("[NawrisStore] 🚀 بدء معالجة الطلب...");

  // 1️⃣ إنشاء الشحنة
  const shipment = await createShipment(order);
  console.log("[NawrisStore] ✅ تم إنشاء الشحنة:", shipment.code);

  // 2️⃣ طباعة الستيكر
  if (typeof window !== "undefined") {
    printSticker(shipment, order, { autoPrint: true });
    console.log("[NawrisStore] 🏷️ تم فتح الستيكر للطباعة");
  }

  // 3️⃣ إشعار العميل
  const message = buildNotification("sent_from_store", {
    name: order.receiver,
    code: shipment.code,
  });
  console.log("[NawrisStore] 📲 رسالة الإشعار:", message);

  if (sendFn && customerPhone) {
    await sendFn(customerPhone, message);
    console.log("[NawrisStore] ✅ تم إرسال الإشعار إلى:", customerPhone);
  }

  return {
    shipment,
    notification_message: message,
    tracking_url: shipment.tracking_url,
  };
}

// ═══════════════════════════════════════════════════════════════
//  📤  EXPORT
// ═══════════════════════════════════════════════════════════════
const NawrisStore = {
  createShipment,    // إنشاء شحنة
  syncStatus,        // تتبع طلب واحد
  syncBatch,         // تتبع عدة طلبات
  printSticker,      // طباعة ستيكر
  buildNotification, // بناء رسالة إشعار
  trackAndNotify,    // تتبع + إشعار
  processNewOrder,   // الدورة الكاملة
  STATUS_MAP,        // خريطة الحالات
  NOTIFICATION_TEMPLATES, // قوالب الرسائل
};

// Browser
if (typeof window !== "undefined") window.NawrisStore = NawrisStore;

// Node.js / ES Modules
if (typeof module !== "undefined") module.exports = NawrisStore;

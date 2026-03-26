/**
 * ============================================================
 *  Nawris API Service — ZTM Integration
 *  Base URL: https://backoffice.nawris.algoriza.com/external-api
 * ============================================================
 */

const NawrisAPI = (() => {

  // ── CONFIG ──────────────────────────────────────────────────
  const BASE_URL    = "https://backoffice.nawris.algoriza.com/external-api";
  const AUTH_KEY    = typeof process !== "undefined"
                        ? process.env.NAWRIS_AUTH_KEY    || "YOUR_AUTH_KEY"
                        : "YOUR_AUTH_KEY";
  const CLIENT_CODE = typeof process !== "undefined"
                        ? process.env.NAWRIS_CLIENT_CODE || "YOUR_CLIENT_CODE"
                        : "YOUR_CLIENT_CODE";

  // ── HEADERS ─────────────────────────────────────────────────
  // GET requests
  const getHeaders = {
    "Accept":       "application/json",
    "Content-Type": "application/json",
  };

  // POST requests (x-www-form-urlencoded)
  const postHeaders = {
    "Accept":        "application/json",
    "Content-Type":  "application/x-www-form-urlencoded",
  };

  // ── HELPERS ─────────────────────────────────────────────────

  /** تحويل Object إلى URLSearchParams للـ POST */
  function toFormData(obj) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    }
    return params.toString();
  }

  /** معالج موحّد للردود */
  async function handleResponse(res) {
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_msg || `HTTP error: ${res.status}`);
    }
    if (data.success === 0) {
      throw new Error(data.error_msg || "فشل الطلب");
    }
    return data;
  }

  /** إرسال GET */
  async function get(endpoint, params = {}) {
    const query = new URLSearchParams({
      authentication_key: AUTH_KEY,
      main_client_code: CLIENT_CODE,
      ...params,
    }).toString();

    const res = await fetch(`${BASE_URL}${endpoint}?${query}`, {
      method:  "GET",
      headers: getHeaders,
    });
    return handleResponse(res);
  }

  /** إرسال POST */
  async function post(endpoint, body = {}) {
    const payload = toFormData({
      authentication_key: AUTH_KEY,
      main_client_code:   CLIENT_CODE,
      ...body,
    });

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method:  "POST",
      headers: postHeaders,
      body:    payload,
    });
    return handleResponse(res);
  }

  // ════════════════════════════════════════════════════════════
  //  PUBLIC API METHODS
  // ════════════════════════════════════════════════════════════

  return {

    // ── 1. جلب المحافظات ───────────────────────────────────────
    /**
     * GET /get-government
     * @returns {Promise<{id, name, area_required}[]>}
     */
    async getGovernments() {
      const data = await get("/get-government");
      return data.feed;
    },

    // ── 2. جلب المناطق حسب المحافظة ───────────────────────────
    /**
     * GET /get-area/{government_id}
     * @param {number|string} governmentId
     * @returns {Promise<{id, name, status}[]>}
     */
    async getAreas(governmentId) {
      const data = await get(`/get-area/${governmentId}`);
      return { areas: data.feed, required_regions: data.required_regions };
    },

    // ── 3. إضافة طلب جديد ─────────────────────────────────────
    /**
     * POST /add-order
     * @param {Object} order
     * @param {string}  order.receiver           - اسم المستلم (مطلوب)
     * @param {string}  order.phone1             - هاتف ١ (مطلوب)
     * @param {string}  order.phone2             - هاتف ٢ (اختياري)
     * @param {string}  order.government         - المحافظة (مطلوب)
     * @param {string}  order.area               - المنطقة (اختياري)
     * @param {string}  order.address            - العنوان (اختياري)
     * @param {string}  order.notes              - ملاحظات (اختياري)
     * @param {string}  order.invoice_number     - رقم الفاتورة (اختياري)
     * @param {string}  order.order_summary      - محتوى الطلب (مطلوب)
     * @param {number}  order.amount_to_be_collected - سعر المنتج (مطلوب)
     * @param {number}  order.return_amount      - قيمة الارتجاع (مطلوب)
     * @param {string}  order.api_followup_phone - هاتف المتابعة (اختياري)
     * @param {0|1|2|3} order.is_order           - 0=عادي, 1=جزئي, 2=استبدال, 3=استرجاع
     * @param {string}  order.return_summary     - محتوى المرتجع (إذا is_order != 0)
     * @param {0|1}     order.can_open           - يمكن فتح الشحنة
     * @param {0|1}     order.is_office_given    - تسليم مكتب/عادي
     * @param {0|1}     order.shipment_on_sender - تكلفة التوصيل على المرسل/المستلم
     * @param {0|1}     order.extra_cost_payer   - التكلفة الإضافية على من
     * @param {0|1}     order.is_fragile         - قابل للكسر
     * @param {0|1}     order.is_measurable      - قابل للقياس
     * @param {0|1}     order.accept_20_plus_5_dinar - قبول فئة 20+5
     * @param {string}  order.second_client      - المرسل الفرعي (اختياري)
     * @param {number}  order.pieces_count       - عدد القطع (اختياري)
     * @returns {Promise<{code, bar_code, invoice_number}>}
     */
    async addOrder(order) {
      const data = await post("/add-order", order);
      return data.result;
    },

    // ── 4. تعديل طلب ──────────────────────────────────────────
    /**
     * POST /edit-order
     * @param {string|number} orderCode - كود الطلب (مطلوب)
     * @param {Object} updates          - نفس حقول addOrder + code
     * @returns {Promise<{code, bar_code, invoice_number}>}
     */
    async editOrder(orderCode, updates) {
      const data = await post("/edit-order", { code: orderCode, ...updates });
      return data.result;
    },

    // ── 5. حذف طلب ────────────────────────────────────────────
    /**
     * POST /delete-order
     * @param {string} searchKey - كود الطلب أو الباركود
     * @returns {Promise<{status, message}>}
     */
    async deleteOrder(searchKey) {
      const data = await post("/delete-order", { search_Key: searchKey });
      return data.result;
    },

    // ── 6. بحث / تتبع طلب ─────────────────────────────────────
    /**
     * POST /search-order
     * @param {string} searchKey - كود الطلب أو الباركود
     * @returns {Promise<Object>} بيانات الطلب كاملة
     *   { code, bar_code, status, returned_inventory_status,
     *     return_reason, delay_reason, branch, captain,
     *     captain_number1, received_amount, ... }
     */
    async searchOrder(searchKey) {
      const data = await post("/search-order", { search_Key: searchKey });
      return data.result;
    },

    // ── 7. طلبات المهمة ────────────────────────────────────────
    /**
     * GET /mission-orders
     * @param {string} missionCode - كود المهمة
     * @returns {Promise<Object[]>}
     */
    async getMissionOrders(missionCode) {
      const data = await get("/mission-orders", { mission_code: missionCode });
      return data.result;
    },

    // ── 8. إعادة إرسال طلب مرتجع ──────────────────────────────
    /**
     * POST /resend-request
     * @param {string}  code       - كود الطلب المرتجع (مطلوب)
     * @param {1|2}     type       - 1=إعادة بنفس البيانات, 2=إعادة بطرد جديد
     * @param {string}  [orderCode]- كود الطرد الجديد (مطلوب إذا type=2)
     * @returns {Promise<Object>}
     */
    async resendOrder(code, type = 1, orderCode = null) {
      const body = { code, type };
      if (type === 2) {
        if (!orderCode) throw new Error("order_code مطلوب عند type=2");
        body.order_code = orderCode;
      }
      const data = await post("/resend-request", body);
      return data.result;
    },

    // ── 9. إلغاء / إيقاف إلغاء طلب ───────────────────────────
    /**
     * POST /canceled
     * @param {string} code - كود الطلب أو الباركود (مطلوب)
     * @param {1|0}    type - 1=إلغاء, 0=إيقاف الإلغاء
     * @returns {Promise<Object>}
     */
    async cancelOrder(code, type = 1) {
      const data = await post("/canceled", { code, type });
      return data.message || data;
    },

  };

})();


// ════════════════════════════════════════════════════════════
//  STATUS MAPPER — ربط حالات الـ API بحالاتنا الداخلية
// ════════════════════════════════════════════════════════════

const StatusMapper = {

  // خريطة الحالات العربية الواردة من الـ API → slug داخلي
  API_TO_SLUG: {
    "محفوظة":                    "saved",
    "في الشركة":                 "in_company",
    "بالطريق إلى الفرع":         "to_branch",
    "وصلت إلى الفرع":           "arrived_branch",
    "مع المندوب":                "with_agent",
    "تم التسليم":                "delivered",
    "راجع لدى المندوب":          "return_agent",
    "مخزن المرتجعات":           "return_warehouse",
    "مرتجع وصل للفرع":          "return_arrived_branch",
    "مرتجع بالطريق للشركة":     "return_to_company",
    "راجع في الشركة":            "return_in_company",
    "مرتجعات تم استلامها":      "return_received",
    "مرسلة من المتجر":          "sent_from_store",
    "مؤجلة مع المندوب":         "postponed",
    "معاد إرسالها":              "resent",
    "طلب معدوم":                 "null_order",
  },

  // slug داخلي → تفاصيل العرض
  SLUG_META: {
    saved:                 { label: "محفوظة",                  color: "#1D9E75", icon: "📦",  category: "delivery" },
    in_company:            { label: "في الشركة",               color: "#1D9E75", icon: "🏢",  category: "delivery" },
    to_branch:             { label: "بالطريق إلى الفرع",       color: "#7F77DD", icon: "🛣️", category: "branch"   },
    arrived_branch:        { label: "وصلت إلى الفرع",         color: "#7F77DD", icon: "🏪",  category: "branch"   },
    with_agent:            { label: "مع المندوب",              color: "#2dd4bf", icon: "🚚",  category: "delivery" },
    delivered:             { label: "تم التسليم",              color: "#22c97a", icon: "✅",  category: "delivery" },
    return_agent:          { label: "راجع لدى المندوب",        color: "#D85A30", icon: "↩️", category: "return"   },
    return_warehouse:      { label: "مخزن المرتجعات",         color: "#D85A30", icon: "🗃️", category: "return"   },
    return_arrived_branch: { label: "مرتجع وصل للفرع",        color: "#D85A30", icon: "↩️", category: "return"   },
    return_to_company:     { label: "مرتجع بالطريق للشركة",   color: "#D85A30", icon: "🚛",  category: "return"   },
    return_in_company:     { label: "راجع في الشركة",          color: "#D85A30", icon: "🏢",  category: "return"   },
    return_received:       { label: "مرتجعات تم استلامها",    color: "#888780", icon: "♻️",  category: "return"   },
    sent_from_store:       { label: "مرسلة من المتجر",        color: "#888780", icon: "📤",  category: "exception"},
    postponed:             { label: "مؤجلة مع المندوب",       color: "#f5a623", icon: "⏸",   category: "exception"},
    resent:                { label: "معاد إرسالها",            color: "#a78bfa", icon: "🔁",  category: "exception"},
    null_order:            { label: "طلب معدوم",               color: "#ff5c5c", icon: "❌",  category: "exception"},
  },

  /** تحويل اسم الحالة الوارد من API إلى slug داخلي */
  toSlug(apiStatus) {
    return this.API_TO_SLUG[apiStatus] ?? "unknown";
  },

  /** جلب بيانات العرض بالـ slug */
  getMeta(slug) {
    return this.SLUG_META[slug] ?? { label: slug, color: "#888780", icon: "❓", category: "unknown" };
  },

  /** تحويل مباشر من اسم الـ API إلى بيانات العرض */
  fromAPI(apiStatus) {
    return this.getMeta(this.toSlug(apiStatus));
  },
};


// ════════════════════════════════════════════════════════════
//  STATE MACHINE — التحقق من صحة الانتقالات
// ════════════════════════════════════════════════════════════

const StateMachine = {

  // الانتقالات المسموح بها: from → [to, to, ...]
  TRANSITIONS: {
    sent_from_store:       ["saved"],
    saved:                 ["in_company"],
    in_company:            ["with_agent", "to_branch"],          // مدينة أو فروع
    to_branch:             ["arrived_branch"],
    arrived_branch:        ["with_agent"],
    with_agent:            ["delivered", "return_agent", "postponed"],
    delivered:             [],                                   // نهائية
    postponed:             ["with_agent", "return_agent"],
    return_agent:          ["return_warehouse", "return_arrived_branch"],
    return_warehouse:      ["return_received", "resent"],
    return_arrived_branch: ["return_to_company"],
    return_to_company:     ["return_in_company"],
    return_in_company:     ["return_received"],
    return_received:       [],                                   // نهائية
    resent:                ["saved"],
    null_order:            [],                                   // نهائية
  },

  // الحالات التي يمكن الانتقال إليها من أي حالة (استثنائية)
  GLOBAL_TRANSITIONS: ["null_order", "postponed"],

  /**
   * التحقق من صحة الانتقال
   * @param {string} fromSlug
   * @param {string} toSlug
   * @returns {boolean}
   */
  canTransition(fromSlug, toSlug) {
    if (this.GLOBAL_TRANSITIONS.includes(toSlug)) return true;
    const allowed = this.TRANSITIONS[fromSlug] ?? [];
    return allowed.includes(toSlug);
  },

  /**
   * جلب الانتقالات المتاحة من حالة معينة
   * @param {string} fromSlug
   * @returns {string[]}
   */
  getNextStates(fromSlug) {
    const direct = this.TRANSITIONS[fromSlug] ?? [];
    const globals = this.GLOBAL_TRANSITIONS.filter(g => g !== fromSlug);
    return [...new Set([...direct, ...globals])];
  },
};


// ════════════════════════════════════════════════════════════
//  STICKER SERVICE — إدارة الملصقات
// ════════════════════════════════════════════════════════════

const StickerService = {

  /**
   * عند سحب أو تحديث ستيكر → تغيير حالة الطلب إلى "مرسلة من المتجر"
   * يُستدعى من واجهة الملصقات أو webhook
   * @param {string} orderCode
   * @param {'printed'|'updated'} action
   */
  async onStickerEvent(orderCode, action = "printed") {
    console.log(`[Sticker] ${action} → order ${orderCode} → status: sent_from_store`);
    // تسجيل في قاعدة البيانات المحلية
    return {
      order_code: orderCode,
      new_status: "sent_from_store",
      action,
      timestamp: new Date().toISOString(),
    };
  },
};


// ════════════════════════════════════════════════════════════
//  RESEND SERVICE — إعادة إرسال من مخزن المرتجعات
// ════════════════════════════════════════════════════════════

const ResendService = {

  /**
   * إعادة إرسال طرد من مخزن المرتجعات بنفس البيانات
   * @param {string} returnedOrderCode
   */
  async resendSameData(returnedOrderCode) {
    return NawrisAPI.resendOrder(returnedOrderCode, 1);
  },

  /**
   * إعادة إرسال طرد من مخزن المرتجعات كطرد جديد
   * @param {string} returnedOrderCode - كود الطلب المرتجع
   * @param {string} newOrderCode      - كود الطرد الجديد
   */
  async resendAsNew(returnedOrderCode, newOrderCode) {
    return NawrisAPI.resendOrder(returnedOrderCode, 2, newOrderCode);
  },
};


// ════════════════════════════════════════════════════════════
//  EXPORTS
// ════════════════════════════════════════════════════════════

// للاستخدام في المتصفح مباشرة
if (typeof window !== "undefined") {
  window.NawrisAPI      = NawrisAPI;
  window.StatusMapper   = StatusMapper;
  window.StateMachine   = StateMachine;
  window.StickerService = StickerService;
  window.ResendService  = ResendService;
}

// للاستخدام في Node.js / ES Modules
if (typeof module !== "undefined") {
  module.exports = { NawrisAPI, StatusMapper, StateMachine, StickerService, ResendService };
}

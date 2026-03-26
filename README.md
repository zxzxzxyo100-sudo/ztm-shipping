# 🚀 دليل ربط متجرك بـ Nawris API — ZTM

## الخطوة الأولى: الإعداد

افتح ملف `nawris-store.js` وعدّل هذا القسم فقط:

```js
const NAWRIS_CONFIG = {
  AUTH_KEY:    "YOUR_AUTH_KEY",     // ← من بوابة النورس ← إعدادات ← ربط API
  CLIENT_CODE: "YOUR_CLIENT_CODE",  // ← نفس المكان
  ...
};
```

---

## الوظيفة 1 — إنشاء شحنة عند ورود طلب

```js
// عند ورود طلب جديد من متجرك
const shipment = await NawrisStore.createShipment({
  receiver:               "أحمد العمري",
  phone1:                 "0911234567",
  government:             "طرابلس",
  area:                   "أبوسليم (s19)",
  address:                "شارع بورسعيد",
  order_summary:          "ملابس - 3 قطع",
  amount_to_be_collected: 250,
  return_amount:          200,
  invoice_number:         "ORD-1042",
  notes:                  "الطلب قابل للكسر",

  // تجاوز الإعدادات الافتراضية (اختياري)
  overrides: {
    is_fragile: "1",    // هذا الطلب قابل للكسر
    can_open:   "1",    // يمكن فتحه
  }
});

console.log(shipment.code);         // ZTM-48210
console.log(shipment.bar_code);     // 1596782838144
console.log(shipment.tracking_url); // رابط التتبع
```

---

## الوظيفة 2 — تتبع حالة الطلب

```js
// تتبع طلب واحد
const info = await NawrisStore.syncStatus("ZTM-48210");

console.log(info.emoji);              // 🚚
console.log(info.status.label_ar);   // مع المندوب
console.log(info.captain);           // اسم المندوب
console.log(info.captain_phone);     // هاتف المندوب
console.log(info.is_delivered);      // false
console.log(info.is_returned);       // false

// تتبع عدة طلبات دفعة واحدة
const batch = await NawrisStore.syncBatch([
  "ZTM-48210",
  "ZTM-48211",
  "ZTM-48212",
]);
batch.forEach(r => {
  if (r.success) console.log(r.data.code, r.data.emoji, r.data.status.label_ar);
  else           console.log(r.tracking_code, "خطأ:", r.error);
});
```

---

## الوظيفة 3 — طباعة الستيكر

```js
// طباعة تلقائية فور إنشاء الشحنة
NawrisStore.printSticker(shipment, order);

// الحصول على HTML بدون طباعة (للحفظ أو الإرسال)
const html = NawrisStore.printSticker(shipment, order, {
  autoPrint:  false,
  returnHTML: true,
});
```

---

## الوظيفة 4 — إشعار العميل

```js
// بناء رسالة حسب الحالة
const msg = NawrisStore.buildNotification("with_agent", {
  name:          "أحمد",
  code:          "ZTM-48210",
  captain_phone: "0912345678",
});
// → "🚚 مرحباً أحمد، طلبك رقم ZTM-48210 مع المندوب الآن..."

// تتبع + إشعار دفعة واحدة
const { statusInfo, message } = await NawrisStore.trackAndNotify(
  "ZTM-48210",
  "أحمد العمري"
);
// أرسل message عبر SMS أو WhatsApp
await mySMSService.send("0911234567", message);
```

---

## الدورة الكاملة — من الطلب إلى الإشعار

```js
// كل شيء في سطر واحد
await NawrisStore.processNewOrder(
  {
    receiver:               "أحمد العمري",
    phone1:                 "0911234567",
    government:             "طرابلس",
    order_summary:          "ملابس",
    amount_to_be_collected: 250,
    return_amount:          200,
  },
  "0911234567",                                      // هاتف العميل للإشعار
  (phone, msg) => mySMSService.send(phone, msg)      // دالة الإرسال
);
// ✅ ينشئ الشحنة → يطبع الستيكر → يرسل إشعار للعميل
```

---

## الربط مع Salla سلة

```js
// في Salla Webhooks → event: order.created
app.post("/webhook/salla/order-created", async (req, res) => {
  const sallaOrder = req.body.data;

  await NawrisStore.processNewOrder({
    receiver:               sallaOrder.customer.name,
    phone1:                 sallaOrder.customer.mobile,
    government:             sallaOrder.shipping.address.city,
    address:                sallaOrder.shipping.address.street,
    order_summary:          sallaOrder.items.map(i => i.name).join(", "),
    amount_to_be_collected: sallaOrder.amounts.total.amount,
    return_amount:          sallaOrder.amounts.total.amount,
    invoice_number:         String(sallaOrder.reference_id),
  },
  sallaOrder.customer.mobile,
  (phone, msg) => sallaSMS.send(phone, msg));

  res.json({ success: true });
});
```

## الربط مع Zid زد

```js
// في Zid Webhooks → order.created
app.post("/webhook/zid/order-created", async (req, res) => {
  const zidOrder = req.body;

  await NawrisStore.processNewOrder({
    receiver:               zidOrder.customer_name,
    phone1:                 zidOrder.customer_phone,
    government:             zidOrder.shipping_city,
    address:                zidOrder.shipping_address,
    order_summary:          zidOrder.line_items.map(i => i.name).join(", "),
    amount_to_be_collected: zidOrder.total,
    return_amount:          zidOrder.total,
    invoice_number:         zidOrder.order_number,
  },
  zidOrder.customer_phone);

  res.json({ status: "ok" });
});
```

## الربط مع WooCommerce

```php
<?php
// في functions.php أو plugin مخصص

add_action('woocommerce_order_status_processing', function($order_id) {
    $order = wc_get_order($order_id);
    
    $payload = [
        'receiver'               => $order->get_shipping_first_name() . ' ' . $order->get_shipping_last_name(),
        'phone1'                 => $order->get_billing_phone(),
        'government'             => $order->get_shipping_city(),
        'address'                => $order->get_shipping_address_1(),
        'order_summary'          => implode(', ', array_map(fn($i) => $i->get_name(), $order->get_items())),
        'amount_to_be_collected' => $order->get_total(),
        'return_amount'          => $order->get_total(),
        'invoice_number'         => $order->get_order_number(),
        'authentication_key'     => 'YOUR_AUTH_KEY',
        'main_client_code'       => 'YOUR_CLIENT_CODE',
    ];
    
    $response = wp_remote_post(
        'https://backoffice.nawris.algoriza.com/external-api/add-order',
        ['body' => $payload, 'headers' => ['Accept' => 'application/json']]
    );
    
    $body = json_decode(wp_remote_retrieve_body($response), true);
    if ($body['success'] === 1) {
        $order->add_meta_data('nawris_code', $body['result']['code']);
        $order->save();
    }
});
?>
```

---

## تعديل قوالب الإشعارات

```js
// في nawris-store.js عدّل NOTIFICATION_TEMPLATES حسب هوية متجرك
NOTIFICATION_TEMPLATES.with_agent = (o) =>
  `مرحباً ${o.name} 👋\n` +
  `طلبك من متجر [اسم متجرك] رقم ${o.code}\n` +
  `مع المندوب الآن وسيصلك اليوم 🚚\n` +
  `هاتف المندوب: ${o.captain_phone}\n` +
  `شكراً لتسوّقك معنا ❤️`;
```

---

> ⚠️ **ملاحظة أمان:** لا تضع `AUTH_KEY` في كود الواجهة الأمامية (Front-end) مباشرة.
> ضعه في متغيرات البيئة `.env` أو في Backend.

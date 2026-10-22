
/* ==========================================================
   IZAKAZ v0.2.0
   DELIVERY SERVICE

   Shared service for ABL / Cola

   Tables:
   - profiles
   - order_deliveries
   - order_delivery_items
   - order_products

   Supports editing and safe cancellation of expected deliveries
========================================================== */

(function () {
  "use strict";

  const PAGE_SIZE = 500;

  const GROUPS = {
    ABL: "general",
    COLA: "cola"
  };

  const RECEIVED_STATUSES = new Set([
    "received",
    "arrived",
    "completed"
  ]);

  const CANCELLED_STATUSES = new Set([
    "cancelled",
    "canceled"
  ]);

  const STATUS_LABELS = {
    expected: "Ожидается",
    confirmed: "Подтверждена",
    in_transit: "В пути",
    "in-transit": "В пути",
    shipped: "Отгружена",
    received: "Получена",
    arrived: "Получена",
    completed: "Получена",
    cancelled: "Отменена",
    canceled: "Отменена",
    draft: "Черновик"
  };

  function getClient() {
    const client =
      window.supabaseClient ||
      (typeof supabaseClient !== "undefined"
        ? supabaseClient
        : null);

    if (!client) {
      throw new Error(
        "Supabase не подключён"
      );
    }

    return client;
  }

  function normalizeGroup(group) {
    const value = String(
      group || GROUPS.ABL
    ).toLowerCase();

    if (
      value !== GROUPS.ABL &&
      value !== GROUPS.COLA
    ) {
      throw new Error(
        "Неизвестная группа поставки: " +
        value
      );
    }

    return value;
  }

  function normalizeStatus(status) {
    return String(
      status || "expected"
    ).trim().toLowerCase();
  }

  function getStatusLabel(status) {
    const value = normalizeStatus(status);

    return STATUS_LABELS[value] || value;
  }

  function getStatusGroup(status) {
    const value = normalizeStatus(status);

    if (RECEIVED_STATUSES.has(value)) {
      return "received";
    }

    if (CANCELLED_STATUSES.has(value)) {
      return "cancelled";
    }

    return "expected";
  }

  function parseNumber(value) {
    const number = Number(value ?? 0);

    return Number.isFinite(number)
      ? number
      : 0;
  }

  function dateIsValid(value) {
    if (
      typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
      return false;
    }

    const date = new Date(
      value + "T00:00:00Z"
    );

    return (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }

  function todayISO() {
    const parts = new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: "Asia/Almaty",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(new Date());

    const values = {};

    for (const part of parts) {
      if (part.type !== "literal") {
        values[part.type] = part.value;
      }
    }

    return [
      values.year,
      values.month,
      values.day
    ].join("-");
  }

  function formatISODate(date) {
    return date.toISOString().slice(0, 10);
  }

  function getDatePresetRange(preset) {
    const today = new Date(todayISO() + "T12:00:00Z");
    const weekday = (today.getUTCDay() + 6) % 7;
    const monday = new Date(today);

    monday.setUTCDate(today.getUTCDate() - weekday);

    if (preset === "current-week") {
      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);

      return {
        from: formatISODate(monday),
        to: formatISODate(sunday)
      };
    }

    if (preset === "previous-week") {
      const previousMonday = new Date(monday);
      const previousSunday = new Date(monday);

      previousMonday.setUTCDate(monday.getUTCDate() - 7);
      previousSunday.setUTCDate(monday.getUTCDate() - 1);

      return {
        from: formatISODate(previousMonday),
        to: formatISODate(previousSunday)
      };
    }

    if (preset === "current-month") {
      const monthStart = new Date(Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        1,
        12
      ));
      const monthEnd = new Date(Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth() + 1,
        0,
        12
      ));

      return {
        from: formatISODate(monthStart),
        to: formatISODate(monthEnd)
      };
    }

    return null;
  }

  function formatDate(value) {
    if (!dateIsValid(value)) return "—";

    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        timeZone: "UTC",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }
    ).format(
      new Date(value + "T12:00:00Z")
    );
  }

  function formatWeekday(value) {
    if (!dateIsValid(value)) return "—";

    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        timeZone: "UTC",
        weekday: "long"
      }
    ).format(
      new Date(value + "T12:00:00Z")
    );
  }

  /* ========================================================
     RESTAURANT
  ======================================================== */

  async function getRestaurantId() {
    const client = getClient();

    const {
      data: authData,
      error: authError
    } = await client.auth.getUser();

    if (authError) throw authError;

    const userId = authData?.user?.id;

    if (!userId) {
      throw new Error(
        "Пользователь не авторизован"
      );
    }

    const response = await client
      .from("profiles")
      .select("restaurant_id")
      .eq("id", userId)
      .single();

    if (response.error) {
      throw response.error;
    }

    if (!response.data?.restaurant_id) {
      throw new Error(
        "Ресторан пользователя не найден"
      );
    }

    return response.data.restaurant_id;
  }

  /* ========================================================
     PAGINATED FETCH

     Prevents silently losing deliveries
     when there are more than 1000 rows.
  ======================================================== */

  async function fetchAll(
    makeQuery,
    pageSize = PAGE_SIZE
  ) {
    const result = [];

    for (let offset = 0; ; offset += pageSize) {
      const response = await makeQuery()
        .range(
          offset,
          offset + pageSize - 1
        );

      if (response.error) {
        throw response.error;
      }

      const rows = response.data || [];

      result.push(...rows);

      if (rows.length < pageSize) {
        break;
      }
    }

    return result;
  }

  /* ========================================================
     LOAD DELIVERY LIST
  ======================================================== */

  async function loadDeliveries(options = {}) {
    const client = getClient();

    const restaurantId =
      options.restaurantId ||
      await getRestaurantId();

    const group = normalizeGroup(
      options.group || GROUPS.ABL
    );

    const fromDate = options.fromDate || null;
    const toDate = options.toDate || null;

    if (
      fromDate &&
      !dateIsValid(fromDate)
    ) {
      throw new Error(
        "Некорректная начальная дата"
      );
    }

    if (
      toDate &&
      !dateIsValid(toDate)
    ) {
      throw new Error(
        "Некорректная конечная дата"
      );
    }

    if (
      fromDate &&
      toDate &&
      fromDate > toDate
    ) {
      throw new Error(
        "Дата «от» позже даты «до»"
      );
    }

    function query() {
      let request = client
        .from("order_deliveries")
        .select(`
          id,
          restaurant_id,
          delivery_date,
          delivery_group,
          source,
          source_weekly_order_id,
          source_order_day,
          source_cola_order_id,
          status,
          note,
          created_at,
          updated_at
        `)
        .eq(
          "restaurant_id",
          restaurantId
        )
        .eq(
          "delivery_group",
          group
        )
        .order(
          "delivery_date",
          { ascending: false }
        )
        .order(
          "id",
          { ascending: false }
        );

      if (fromDate) {
        request = request.gte(
          "delivery_date",
          fromDate
        );
      }

      if (toDate) {
        request = request.lte(
          "delivery_date",
          toDate
        );
      }

      return request;
    }

    const deliveries = await fetchAll(query);

    const items = await loadItemsForDeliveries(
      deliveries.map(item => item.id)
    );

    const itemsByDelivery = new Map();

    for (const item of items) {
      const id = String(item.delivery_id);

      if (!itemsByDelivery.has(id)) {
        itemsByDelivery.set(id, []);
      }

      itemsByDelivery.get(id).push(item);
    }

    return deliveries.map(delivery => {
      const deliveryItems =
        itemsByDelivery.get(
          String(delivery.id)
        ) || [];

      return {
        ...delivery,

        statusGroup: getStatusGroup(
          delivery.status
        ),

        statusLabel: getStatusLabel(
          delivery.status
        ),

        itemsCount: deliveryItems.length,

        totalCases: deliveryItems.reduce(
          (sum, item) =>
            sum + parseNumber(
              item.case_qty
            ),
          0
        ),

        totalSlv: deliveryItems.reduce(
          (sum, item) =>
            sum + parseNumber(
              item.slv_qty
            ),
          0
        ),

        totalPcs: deliveryItems.reduce(
          (sum, item) =>
            sum + parseNumber(
              item.pcs_qty
            ),
          0
        ),

        totalBaseQty: deliveryItems.reduce(
          (sum, item) =>
            sum + parseNumber(
              item.base_qty
            ),
          0
        )
      };
    });
  }

  /* ========================================================
     LOAD DELIVERY ITEMS

     Uses chunks to avoid large IN clauses.
  ======================================================== */

  async function loadItemsForDeliveries(
    deliveryIds
  ) {
    if (!Array.isArray(deliveryIds) ||
        !deliveryIds.length) {
      return [];
    }

    const client = getClient();

    const uniqueIds = [
      ...new Set(
        deliveryIds.map(String)
      )
    ];

    const result = [];
    const chunkSize = 100;

    for (
      let index = 0;
      index < uniqueIds.length;
      index += chunkSize
    ) {
      const ids = uniqueIds.slice(
        index,
        index + chunkSize
      );

      const rows = await fetchAll(
        () => client
          .from("order_delivery_items")
          .select(`
            id,
            delivery_id,
            product_id,
            case_qty,
            slv_qty,
            pcs_qty,
            base_qty
          `)
          .in("delivery_id", ids)
          .order("id", {
            ascending: true
          })
      );

      result.push(...rows);
    }

    return result;
  }

  /* ========================================================
     LOAD PRODUCTS
  ======================================================== */

  async function loadProducts(
    restaurantId,
    productIds
  ) {
    if (!productIds.length) {
      return new Map();
    }

    const client = getClient();

    const ids = [
      ...new Set(
        productIds.map(String)
      )
    ];

    const result = [];
    const chunkSize = 100;

    for (
      let index = 0;
      index < ids.length;
      index += chunkSize
    ) {
      const group = ids.slice(
        index,
        index + chunkSize
      );

      const rows = await fetchAll(
        () => client
          .from("order_products")
          .select(`
            id,
            name,
            iiko_code,
            category,
            iiko_unit,
            case_to_base,
            slv_to_base,
            pcs_to_base
          `)
          .eq(
            "restaurant_id",
            restaurantId
          )
          .in("id", group)
          .order("id", {
            ascending: true
          })
      );

      result.push(...rows);
    }

    return new Map(
      result.map(product => [
        String(product.id),
        product
      ])
    );
  }

  /* ========================================================
     LOAD SINGLE DELIVERY
  ======================================================== */

  async function loadDeliveryDetail(
    deliveryId,
    options = {}
  ) {
    if (!deliveryId) {
      throw new Error(
        "Не указан ID поставки"
      );
    }

    const client = getClient();

    const restaurantId =
      options.restaurantId ||
      await getRestaurantId();

    let request = client
      .from("order_deliveries")
      .select(`
        id,
        restaurant_id,
        delivery_date,
        delivery_group,
        source,
        source_weekly_order_id,
        source_order_day,
        source_cola_order_id,
        status,
        note,
        created_at,
        updated_at
      `)
      .eq(
        "id",
        deliveryId
      )
      .eq(
        "restaurant_id",
        restaurantId
      );

    if (options.group) {
      request = request.eq(
        "delivery_group",
        normalizeGroup(
          options.group
        )
      );
    }

    const response =
      await request.maybeSingle();

    if (response.error) {
      throw response.error;
    }

    const delivery = response.data;

    if (!delivery) {
      throw new Error(
        "Поставка не найдена"
      );
    }

    const items = await loadItemsForDeliveries([
      delivery.id
    ]);

    const productMap = await loadProducts(
      restaurantId,
      items.map(item => item.product_id)
    );

    const detailedItems = items.map(
      (item, index) => {
        const product = productMap.get(
          String(item.product_id)
        );

        return {
          ...item,

          number: index + 1,

          name: product?.name ||
            "Товар не найден",

          iikoCode: product?.iiko_code ||
            "—",

          category: product?.category ||
            "other",

          unit: product?.iiko_unit ||
            "шт",

          caseToBase: parseNumber(
            product?.case_to_base
          ),

          slvToBase: parseNumber(
            product?.slv_to_base
          ),

          pcsToBase: parseNumber(
            product?.pcs_to_base
          ),

          caseQty: parseNumber(
            item.case_qty
          ),

          slvQty: parseNumber(
            item.slv_qty
          ),

          pcsQty: parseNumber(
            item.pcs_qty
          ),

          baseQty: parseNumber(
            item.base_qty
          )
        };
      }
    );

    detailedItems.sort(
      (a, b) =>
        a.name.localeCompare(
          b.name,
          "ru",
          { numeric: true }
        )
    );

    return {
      ...delivery,

      statusGroup: getStatusGroup(
        delivery.status
      ),

      statusLabel: getStatusLabel(
        delivery.status
      ),

      items: detailedItems,

      itemsCount: detailedItems.length,

      totalCases: detailedItems.reduce(
        (sum, item) =>
          sum + item.caseQty,
        0
      ),

      totalSlv: detailedItems.reduce(
        (sum, item) =>
          sum + item.slvQty,
        0
      ),

      totalPcs: detailedItems.reduce(
        (sum, item) =>
          sum + item.pcsQty,
        0
      )
    };
  }

  /* ========================================================
     SUMMARY
  ======================================================== */

  function getSummary(deliveries) {
    const today = todayISO();

    const visibleDeliveries = deliveries.filter(
      delivery => delivery.statusGroup !== "cancelled"
    );

    const active = visibleDeliveries.filter(
      delivery =>
        delivery.statusGroup === "expected"
    );

    const received = visibleDeliveries.filter(
      delivery =>
        delivery.statusGroup === "received"
    );

    const upcoming = active
      .filter(
        delivery =>
          delivery.delivery_date >= today
      )
      .sort(
        (a, b) =>
          a.delivery_date.localeCompare(
            b.delivery_date
          )
      );

    return {
      total: visibleDeliveries.length,
      expected: active.length,
      received: received.length,
      nextDelivery: upcoming[0] || null
    };
  }

  /* ========================================================
     SHARED EDITOR — ABL / COLA
     Mounted on app:page-loaded by small page wrappers.
     Writes go through PostgREST and respect RLS.
  ======================================================== */
  const EDITABLE_STATUSES = new Set([
    'expected', 'confirmed', 'in_transit', 'in-transit', 'shipped'
  ]);
  const CANCELLABLE_STATUSES = new Set([
    'expected', 'confirmed', 'in_transit', 'in-transit', 'shipped'
  ]);
  const ABL_CATEGORIES = new Set([
    'freezer', 'cooler', 'fresh', 'dry', 'сухой'
  ]);
  const escapeHTML = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  const formatQty = value => new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 3
  }).format(Number(value || 0));

  function parseQuantity(value) {
    if (value == null || String(value).trim() === '') {
      throw new Error('Введите количество');
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 1000000) {
      throw new Error('Количество должно быть от 0 до 1 000 000');
    }
    return n;
  }

  function calcBase(item, qty) {
    let total = 0;
    for (const [field, coefficient] of [
      ['caseQty', 'caseToBase'],
      ['slvQty', 'slvToBase'],
      ['pcsQty', 'pcsToBase']
    ]) {
      const amount = parseQuantity(qty[field]);
      const factor = Number(item[coefficient] || 0);
      if (amount > 0 && !(factor > 0)) {
        throw new Error('Для этой единицы не настроен коэффициент пересчёта');
      }
      total += amount * factor;
    }
    return Number(total.toFixed(6));
  }

  function installEditorStyles() {
    if (document.getElementById('delivery-editor-shared-css')) return;
    const style = document.createElement('style');
    style.id = 'delivery-editor-shared-css';
    style.textContent = `
      .de-qty{width:76px;max-width:100%;padding:9px 5px;border:1px solid #d9dee6;
        border-radius:8px;text-align:center;background:var(--dabl-surface,var(--dc-card,#fff));
        color:var(--dabl-text,var(--dc-text,#222));font-size:12px;font-weight:700}
      .de-qty:focus{outline:2px solid #ffcf47;outline-offset:1px}
      .de-qty:disabled{opacity:.55}.de-feedback{display:block;margin-top:5px;font-size:10px}
      .de-feedback.is-error{color:#bd3333}.de-add{padding:10px 14px;border:0;
        border-radius:9px;background:#ffcf47;color:#222;font-weight:800;cursor:pointer}
      .de-add:disabled{opacity:.55;cursor:not-allowed}
      .de-cancel{margin-left:8px;padding:10px 14px;border:1px solid #c43838;
        border-radius:9px;background:transparent;color:#c43838;font-weight:800;cursor:pointer}
      .de-cancel:hover:not(:disabled){background:#c43838;color:#fff}
      .de-cancel:disabled{opacity:.55;cursor:not-allowed}
      .de-picker[hidden]{display:none!important}.de-picker{position:fixed;inset:0;
        z-index:12000;display:grid;place-items:center;padding:16px}
      .de-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.55)}
      .de-picker-panel{position:relative;width:min(620px,100%);max-height:88vh;
        display:flex;flex-direction:column;background:var(--dabl-surface,var(--dc-card,#fff));
        color:var(--dabl-text,var(--dc-text,#222));border-radius:15px;overflow:hidden;
        box-shadow:0 16px 55px rgba(0,0,0,.2)}
      .de-picker-head{display:flex;justify-content:space-between;align-items:center;
        padding:17px 20px;border-bottom:1px solid #ddd}
      .de-picker-head h3{margin:0;font-size:20px}.de-picker-close{font-size:22px;
        background:transparent;border:0;cursor:pointer;color:inherit}
      .de-picker-search{margin:14px 20px;padding:10px 12px;border:1px solid #bbb;
        border-radius:8px;background:transparent;color:inherit}
      .de-picker-status{padding:0 20px 10px;font-size:12px;color:inherit}
      .de-picker-list{overflow:auto;padding:0 20px 20px}
      .de-option{display:flex;gap:12px;align-items:center;justify-content:space-between;
        padding:12px 0;border-bottom:1px solid #ddd}
      .de-option strong{font-size:12px;overflow-wrap:anywhere}.de-option small{display:block;
        font-size:10px;opacity:.7;margin-top:4px}
      .de-option button{border:0;border-radius:8px;padding:9px 12px;background:#ffcf47;
        color:#222;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}
      .de-option button:disabled{background:#ddd;color:#777;cursor:not-allowed}
      @media(max-width:640px){.de-qty{width:59px}.de-picker{padding:8px}}
    `;
    document.head.appendChild(style);
  }

  async function loadCatalog(restaurantId, group) {
    const client = getClient();
    const all = [];
    const size = 500;
    for (let offset = 0; ; offset += size) {
      const { data, error } = await client.from('order_products')
        .select('id,name,iiko_code,category,iiko_unit,case_to_base,slv_to_base,pcs_to_base')
        .eq('restaurant_id', restaurantId)
        .order('id').range(offset, offset + size - 1);
      if (error) throw error;
      const chunk = data || [];
      all.push(...chunk);
      if (chunk.length < size) break;
    }
    return all.filter(product => {
      const category = String(product.category || '').trim().toLowerCase();
      return group === 'cola'
        ? category === 'cola'
        : ABL_CATEGORIES.has(category);
    });
  }

  function mountEditor(config) {
    const root = document.getElementById(config.rootId);
    if (!root) return null;
    if (root.__deliveryEditor) return root.__deliveryEditor;
    installEditorStyles();

    const prefix = config.prefix;
    const group = config.group;
    const title = config.title;
    const q = id => root.querySelector('#' + prefix + '-' + id);
    const client = getClient();
    let restaurantId = null;
    let deliveries = [];
    let detail = null;
    let filter = 'all';
    let fromDate = '';
    let toDate = '';
    let datePreset = '';
    let listVersion = 0;
    let detailVersion = 0;
    let addBusy = false;
    let catalog = [];
    const activeSaves = new Map();
    const pending = new Map();
    let lastFocus = null;
    let oldOverflow = '';

    const setText = (id, value) => {
      const el = q(id);
      if (el) el.textContent = String(value ?? '');
    };
    const setStatus = (id, message, error = false) => {
      const el = q(id);
      if (el) {
        el.textContent = message || '';
        el.classList.toggle('is-error', error);
        el.style.color = error ? '#c43838' : '';
      }
    };
    const editable = () => detail && EDITABLE_STATUSES.has(
      String(detail.status || '').toLowerCase()
    );
    const isCancellable = delivery =>
      delivery?.statusGroup === 'expected' &&
      CANCELLABLE_STATUSES.has(
        String(delivery.status || '').toLowerCase()
      );
    const detailModal = () => q('detail-modal');
    const picker = () => root.querySelector('.de-picker');
    const isOpen = () => detailModal() && !detailModal().hidden;

    function updateStats() {
      const activeDeliveries = deliveries.filter(
        delivery => delivery.statusGroup !== 'cancelled'
      );
      const summary = getSummary(activeDeliveries);
      setText('expected-count', summary.expected);
      setText('received-count', summary.received);
      setText('total-count', summary.total);
      setText('next-date', summary.nextDelivery
        ? formatDate(summary.nextDelivery.delivery_date) : '—');
      setText('next-description', summary.nextDelivery
        ? `${formatWeekday(summary.nextDelivery.delivery_date)} · ${formatQty(summary.nextDelivery.totalCases)} CASE`
        : 'Нет предстоящих поставок');
    }

    function renderList() {
      const container = q('deliveries-list');
      if (!container) return;
      root.querySelectorAll(`[data-${prefix}-filter]`).forEach(button => {
        const selected = button.dataset[prefix + 'Filter'] === filter;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
      const activeDeliveries = deliveries.filter(
        delivery => delivery.statusGroup !== 'cancelled'
      );
      const rows = filter === 'all'
        ? activeDeliveries
        : activeDeliveries.filter(d => d.statusGroup === filter);
      setText('list-count', `Показано ${rows.length} из ${activeDeliveries.length} поставок`);
      const statusClass = status => status === 'received' ? 'is-received'
        : status === 'expected' ? 'is-expected' : 'is-other';
      const source = s => s === 'system' ? `Из заказа ${title}` : s === 'manual'
        ? 'Добавлена вручную' : s || '—';
      container.innerHTML = rows.length ? rows.map(d => `
        <article class="${prefix}-delivery-card">
          <div class="${prefix}-delivery-main">
            <strong class="${prefix}-delivery-date">${escapeHTML(formatDate(d.delivery_date))}</strong>
            <div class="${prefix === 'dabl' ? 'dabl-delivery-description' : 'dcola-delivery-meta'}">
              <span>${escapeHTML(formatWeekday(d.delivery_date))}</span><span>·</span>
              <span>${escapeHTML(source(d.source))}</span>
              <span class="${prefix === 'dabl' ? 'dabl-status-badge' : 'dcola-badge'} ${statusClass(d.statusGroup)}">${escapeHTML(d.statusLabel)}</span>
            </div>
          </div>
          <div class="${prefix}-delivery-stat"><span>ПОЗИЦИЙ</span><strong>${d.itemsCount}</strong></div>
          <div class="${prefix}-delivery-stat"><span>ВСЕГО CASE</span><strong>${formatQty(d.totalCases)}</strong></div>
          <div class="${prefix}-delivery-actions">
            <button type="button" class="${prefix === 'dabl' ? 'dabl-button dabl-button-primary' : 'dcola-btn dcola-btn-primary'}"
              data-de-open="${escapeHTML(d.id)}">Открыть</button>
            ${isCancellable(d) ? `<button type="button" class="de-cancel"
              data-de-cancel="${escapeHTML(d.id)}" aria-label="Отменить поставку ${escapeHTML(formatDate(d.delivery_date))}">Удалить</button>` : ''}
          </div>
        </article>
      `).join('') : `<div class="${prefix}-empty">${activeDeliveries.length
        ? 'По выбранному фильтру поставок нет' : `Поставки ${title} пока не найдены`}</div>`;
    }

    async function cancelDelivery(deliveryId) {
      const delivery = deliveries.find(
        item => String(item.id) === String(deliveryId)
      );

      if (!isCancellable(delivery)) {
        setStatus('list-status', 'Эту поставку нельзя отменить', true);
        return;
      }

      const confirmed = window.confirm(
        `Отменить поставку ${title} на ${formatDate(delivery.delivery_date)}?`
      );

      if (!confirmed) return;

      const button = [...root.querySelectorAll('[data-de-cancel]')]
        .find(item => String(item.dataset.deCancel) === String(deliveryId));

      if (button) button.disabled = true;
      setStatus('list-status', 'Отмена поставки...');

      try {
        restaurantId ||= await getRestaurantId();
        const { data, error } = await client
          .from('order_deliveries')
          .update({ status: 'cancelled' })
          .eq('id', delivery.id)
          .eq('restaurant_id', restaurantId)
          .eq('delivery_group', group)
          .in('status', [...CANCELLABLE_STATUSES])
          .select('id,status')
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          throw new Error(
            'Поставка уже изменилась или недоступна для отмены'
          );
        }

        deliveries = deliveries.filter(
          item => String(item.id) !== String(delivery.id)
        );
        updateStats();
        renderList();
        setStatus('list-status', 'Поставка отменена');
      } catch (error) {
        console.error('[Delivery cancel]', error);
        setStatus('list-status', `Ошибка: ${error.message}`, true);
        if (button?.isConnected) button.disabled = false;
      }
    }

    function updateDatePresets() {
      root.querySelectorAll(`[data-${prefix}-date-preset]`).forEach(button => {
        const selected = button.dataset[prefix + 'DatePreset'] === datePreset;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    }

    async function reload() {
      const version = ++listVersion;
      const refresh = q('refresh');
      if (refresh) refresh.disabled = true;
      setStatus('list-status', 'Загрузка...');
      try {
        restaurantId ||= await getRestaurantId();
        const rows = await loadDeliveries({ restaurantId, group,
          fromDate: fromDate || null, toDate: toDate || null });
        if (!root.isConnected || version !== listVersion) return;
        deliveries = rows;
        updateStats();
        renderList();
        setStatus('list-status', 'Данные обновлены');
      } catch (error) {
        if (version === listVersion) {
          console.error(`[Deliveries ${title}]`, error);
          setStatus('list-status', error.message, true);
        }
      } finally {
        if (version === listVersion && refresh) refresh.disabled = false;
      }
    }

    function updateDetailCounts() {
      if (!detail) return;
      const cases = detail.items.reduce((n, item) => n + Number(item.caseQty || 0), 0);
      detail.totalCases = cases;
      detail.itemsCount = detail.items.length;
      setText('detail-positions', detail.itemsCount);
      setText('detail-cases', formatQty(cases));
      const summaryRow = deliveries.find(d => d.id === detail.id);
      if (summaryRow) {
        summaryRow.itemsCount = detail.itemsCount;
        summaryRow.totalCases = cases;
        renderList();
        updateStats();
      }
    }

    function inputHTML(key, item) {
      const val = Number(item[key] || 0);
      return editable() ? `<input class="de-qty" type="number" min="0" max="1000000"
        step="any" value="${val}" data-de-qty="${key}" aria-label="${key}">`
        : `<strong>${formatQty(val)}</strong>`;
    }

    function renderItems() {
      const body = q('detail-items');
      if (!body || !detail) return;
      const query = String(q('product-search')?.value || '').trim().toLowerCase();
      const rows = detail.items.filter(i =>
        `${i.name} ${i.iikoCode} ${i.category}`.toLowerCase().includes(query));
      setStatus('detail-status', `Показано ${rows.length} из ${detail.items.length} позиций`);
      body.innerHTML = rows.length ? rows.map((item, index) => `
        <tr data-de-item="${escapeHTML(item.id)}">
          <td>${index + 1}</td>
          <td><strong>${escapeHTML(item.name)}</strong><small style="display:block;color:#9198a3">IIKO: ${escapeHTML(item.iikoCode)}</small></td>
          <td>${inputHTML('caseQty', item)}</td>
          <td>${inputHTML('slvQty', item)}</td>
          <td>${inputHTML('pcsQty', item)}</td>
          <td><strong data-de-total>${formatQty(item.baseQty)} ${escapeHTML(item.unit)}</strong>
            <small class="de-feedback" data-de-feedback></small></td>
        </tr>
      `).join('') : `<tr><td colspan="6">Товары не найдены</td></tr>`;
    }

    function ensureAddButton() {
      const toolbar = root.querySelector(prefix === 'dabl'
        ? '.dabl-detail-toolbar' : '.dcola-detail-tools');
      if (!toolbar) return;
      let button = toolbar.querySelector('[data-de-add]');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'de-add';
        button.dataset.deAdd = '1';
        button.textContent = '+ Добавить товар';
        toolbar.appendChild(button);
      }
      button.hidden = !editable();
    }

    function renderDetail() {
      if (!detail) return;
      setText('detail-title', `Поставка ${title} — ${formatDate(detail.delivery_date)}`);
      setText('detail-source', detail.source === 'system'
        ? `Из заказа ${title}` : detail.source === 'manual' ? 'Вручную' : detail.source);
      setText('detail-meta', `${formatWeekday(detail.delivery_date)} · ${detail.statusLabel}`);
      ensureAddButton();
      updateDetailCounts();
      renderItems();
    }

    function readQuantities(row) {
      const out = {};
      for (const key of ['caseQty', 'slvQty', 'pcsQty']) {
        const input = row.querySelector(`[data-de-qty="${key}"]`);
        if (!input) throw new Error('Поле количества не найдено');
        out[key] = parseQuantity(input.value);
      }
      return out;
    }

    function rowItem(row) {
      return detail?.items.find(i => String(i.id) === String(row?.dataset.deItem));
    }

    function showRowFeedback(row, message, error = false) {
      const status = row?.querySelector('[data-de-feedback]');
      if (status) {
        status.textContent = message;
        status.classList.toggle('is-error', error);
      }
    }

    function preview(row) {
      const item = rowItem(row);
      if (!item) return;
      try {
        const base = calcBase(item, readQuantities(row));
        const total = row.querySelector('[data-de-total]');
        if (total) total.textContent = `${formatQty(base)} ${item.unit}`;
        showRowFeedback(row, 'Не сохранено');
      } catch (error) {
        showRowFeedback(row, error.message, true);
      }
    }

    async function persistRow(row) {
      const item = rowItem(row);
      if (!item || !editable() || !row.isConnected) return;
      const key = item.id;
      // Each product is serialized to prevent stale writes overwriting newer edits.
      if (activeSaves.has(key)) {
        pending.set(key, row);
        return;
      }
      let quantities, base;
      try {
        quantities = readQuantities(row);
        base = calcBase(item, quantities);
      } catch (error) {
        showRowFeedback(row, error.message, true);
        return;
      }
      if (['caseQty','slvQty','pcsQty'].every(k => quantities[k] === Number(item[k] || 0))) {
        showRowFeedback(row, '✓ Сохранено');
        return;
      }
      const deliveryId = detail.id;
      const currentDetail = detail;
      const promise = (async () => {
        showRowFeedback(row, 'Сохранение...');
        try {
          // Check the actual status before modifying rows.
          const { data: parent, error: parentError } = await client
            .from('order_deliveries').select('status')
            .eq('id', deliveryId).eq('restaurant_id', restaurantId)
            .eq('delivery_group', group).single();
          if (parentError) throw parentError;
          if (!EDITABLE_STATUSES.has(String(parent.status).toLowerCase())) {
            throw new Error('Поставка закрыта для редактирования');
          }
          const { data, error } = await client.from('order_delivery_items')
            .update({ case_qty: quantities.caseQty, slv_qty: quantities.slvQty,
              pcs_qty: quantities.pcsQty, base_qty: base })
            .eq('id', key).eq('delivery_id', deliveryId).select('id').maybeSingle();
          if (error) throw error;
          if (!data) throw new Error('Изменения не сохранены: проверьте RLS');
          Object.assign(item, quantities, { baseQty: base });
          if (detail === currentDetail) updateDetailCounts();
          showRowFeedback(row, '✓ Сохранено');
        } catch (error) {
          console.error('[Delivery quantity save]', error);
          showRowFeedback(row, `Ошибка: ${error.message}`, true);
          // Keep typed values so the user can retry after fixing the issue.
        }
      })();
      activeSaves.set(key, promise);
      try { await promise; } finally {
        activeSaves.delete(key);
        const queued = pending.get(key);
        pending.delete(key);
        if (queued?.isConnected && rowItem(queued)) await persistRow(queued);
      }
    }

    async function finishEditing() {
      const rows = [...root.querySelectorAll('[data-de-item]')];
      for (const row of rows) {
        if (!row.querySelector('[data-de-qty]')) continue;
        await persistRow(row);
      }
      await Promise.all([...activeSaves.values()]);
    }

    async function openDetail(id) {
      if (isOpen()) return;
      const version = ++detailVersion;
      const modal = detailModal();
      if (!modal) return;
      lastFocus = document.activeElement;
      oldOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      modal.hidden = false;
      modal.setAttribute('aria-hidden', 'false');
      setText('detail-title', 'Загрузка поставки...');
      setStatus('detail-status', 'Загрузка...');
      try {
        restaurantId ||= await getRestaurantId();
        const loaded = await loadDeliveryDetail(id, { restaurantId, group });
        if (version !== detailVersion || !root.isConnected) return;
        detail = loaded;
        if (q('product-search')) q('product-search').value = '';
        renderDetail();
      } catch (error) {
        console.error('[Delivery detail]', error);
        setStatus('detail-status', error.message, true);
      }
    }

    async function closeDetail() {
      if (activeSaves.size) {
        setStatus('detail-status', 'Дождитесь сохранения...', true);
        await Promise.all([...activeSaves.values()]);
      }
      await finishEditing();
      const version = ++detailVersion;
      void version;
      closePicker();
      const modal = detailModal();
      if (modal) {
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
      }
      document.body.style.overflow = oldOverflow;
      detail = null;
      lastFocus?.isConnected && lastFocus.focus();
    }

    function ensurePicker() {
      let el = picker();
      if (el) return el;
      el = document.createElement('div');
      el.className = 'de-picker';
      el.hidden = true;
      el.innerHTML = `
        <div class="de-backdrop" data-de-picker-close></div>
        <section class="de-picker-panel" role="dialog" aria-modal="true" aria-label="Добавить товар">
          <div class="de-picker-head"><h3>Добавить товар ${escapeHTML(title)}</h3>
            <button class="de-picker-close" type="button" data-de-picker-close>×</button></div>
          <input class="de-picker-search" type="search" placeholder="Поиск товара или IIKO" data-de-search>
          <div class="de-picker-status" data-de-picker-status></div>
          <div class="de-picker-list" data-de-picker-list></div>
        </section>`;
      root.appendChild(el);
      return el;
    }

    function renderPicker() {
      const el = ensurePicker();
      const list = el.querySelector('[data-de-picker-list]');
      const query = String(el.querySelector('[data-de-search]')?.value || '').trim().toLowerCase();
      const present = new Set((detail?.items || []).map(i => String(i.product_id)));
      const products = catalog.filter(p => `${p.name} ${p.iiko_code}`.toLowerCase().includes(query));
      list.innerHTML = products.length ? products.map(p => {
        const exists = present.has(String(p.id));
        return `<div class="de-option"><div><strong>${escapeHTML(p.name)}</strong>
          <small>IIKO: ${escapeHTML(p.iiko_code || '—')} · ${escapeHTML(p.category)}</small></div>
          <button type="button" data-de-select="${escapeHTML(p.id)}" ${exists ? 'disabled' : ''}>
          ${exists ? 'Уже в списке' : '+ Добавить'}</button></div>`;
      }).join('') : '<div>Товары не найдены</div>';
    }

    async function openPicker() {
      if (!editable() || addBusy) return;
      await finishEditing();
      const el = ensurePicker();
      el.hidden = false;
      el.querySelector('[data-de-picker-status]').textContent = 'Загрузка товаров...';
      try {
        catalog = await loadCatalog(restaurantId, group);
        if (el.hidden) return;
        el.querySelector('[data-de-picker-status]').textContent = `${catalog.length} товаров`;
        el.querySelector('[data-de-search]').value = '';
        renderPicker();
        el.querySelector('[data-de-search]').focus();
      } catch (error) {
        el.querySelector('[data-de-picker-status]').textContent = 'Ошибка: ' + error.message;
      }
    }

    function closePicker() {
      const el = picker();
      if (el) el.hidden = true;
    }

    async function addProduct(id) {
      if (!editable() || addBusy) return;
      const product = catalog.find(p => String(p.id) === String(id));
      if (!product) return;
      const deliveryId = detail.id;
      const el = ensurePicker();
      const msg = el.querySelector('[data-de-picker-status]');
      addBusy = true;
      try {
        // Re-read delivery status and duplicate item before insert.
        const { data: parent, error: pe } = await client.from('order_deliveries')
          .select('status').eq('id', deliveryId).eq('restaurant_id', restaurantId)
          .eq('delivery_group', group).single();
        if (pe) throw pe;
        if (!EDITABLE_STATUSES.has(String(parent.status).toLowerCase())) {
          throw new Error('Поставка уже закрыта');
        }
        const { data: existing, error: ee } = await client.from('order_delivery_items')
          .select('id').eq('delivery_id', deliveryId).eq('product_id', id).maybeSingle();
        if (ee) throw ee;
        if (existing) throw new Error('Товар уже в списке поставки');
        const { data, error } = await client.from('order_delivery_items')
          .insert({ delivery_id: deliveryId, product_id: id,
            case_qty: 0, slv_qty: 0, pcs_qty: 0, base_qty: 0 })
          .select('id').single();
        if (error) throw error;
        if (!data?.id) throw new Error('Товар не сохранился');
        detail = await loadDeliveryDetail(deliveryId, { restaurantId, group });
        closePicker();
        if (q('product-search')) q('product-search').value = '';
        renderDetail();
        setStatus('detail-status', `✓ Добавлен: ${product.name}`);
      } catch (error) {
        console.error('[Delivery add product]', error);
        msg.textContent = 'Ошибка: ' + error.message;
        renderPicker();
      } finally { addBusy = false; }
    }

    root.addEventListener('click', event => {
      const open = event.target.closest('[data-de-open]');
      if (open) return void openDetail(open.dataset.deOpen);
      const cancel = event.target.closest('[data-de-cancel]');
      if (cancel) return void cancelDelivery(cancel.dataset.deCancel);
      const filt = event.target.closest(`[data-${prefix}-filter]`);
      if (filt) {
        filter = filt.dataset[prefix + 'Filter'];
        renderList(); return;
      }
      if (event.target.closest('#' + prefix + '-refresh')) return void reload();
      if (event.target.closest('#' + prefix + '-date-reset')) {
        fromDate = ''; toDate = ''; datePreset = '';
        if (q('date-from')) q('date-from').value = '';
        if (q('date-to')) q('date-to').value = '';
        if (q('date-reset')) q('date-reset').disabled = true;
        updateDatePresets();
        return void reload();
      }
      const preset = event.target.closest(`[data-${prefix}-date-preset]`);
      if (preset) {
        const nextRange = getDatePresetRange(
          preset.dataset[prefix + 'DatePreset']
        );

        if (!nextRange) return;

        fromDate = nextRange.from;
        toDate = nextRange.to;
        datePreset = preset.dataset[prefix + 'DatePreset'];

        if (q('date-from')) q('date-from').value = fromDate;
        if (q('date-to')) q('date-to').value = toDate;
        if (q('date-reset')) q('date-reset').disabled = false;

        updateDatePresets();
        return void reload();
      }
      if (event.target.closest('[data-de-picker-close]')) return closePicker();
      const selection = event.target.closest('[data-de-select]');
      if (selection) return void addProduct(selection.dataset.deSelect);
      if (event.target.closest('[data-de-add]')) return void openPicker();
      if (event.target.closest(`[data-${prefix}-close]`)) return void closeDetail();
    });

    root.addEventListener('input', event => {
      if (event.target.matches('[data-de-qty]')) {
        const row = event.target.closest('[data-de-item]');
        if (row) preview(row);
      } else if (event.target.matches('#' + prefix + '-product-search')) {
        renderItems();
      } else if (event.target.matches('[data-de-search]')) {
        renderPicker();
      }
    });

    root.addEventListener('change', event => {
      if (event.target.matches('[data-de-qty]')) {
        const row = event.target.closest('[data-de-item]');
        if (row) void persistRow(row);
      }
      if (event.target.matches('#' + prefix + '-date-from, #' + prefix + '-date-to')) {
        fromDate = q('date-from')?.value || '';
        toDate = q('date-to')?.value || '';
        datePreset = '';
        updateDatePresets();
        if (fromDate && toDate && fromDate > toDate) {
          setStatus('list-status', 'Дата «от» позже даты «до»', true);
          return;
        }
        if (q('date-reset')) q('date-reset').disabled = !fromDate && !toDate;
        void reload();
      }
    });

    root.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (picker() && !picker().hidden) closePicker();
      else if (isOpen()) void closeDetail();
    });

    const ready = reload();
    const api = {
      reload,
      ready,
      getDeliveries: () => [...deliveries],
      getCurrentDetail: () => detail
    };
    root.__deliveryEditor = api;
    return api;
  }

  /* ========================================================
     PUBLIC API
  ======================================================== */

  window.IzakazDeliveryService = {
    GROUPS,

    getClient,
    getRestaurantId,

    loadDeliveries,
    loadDeliveryDetail,
    loadItemsForDeliveries,
    loadProducts,

    getSummary,
    getStatusLabel,
    getStatusGroup,

    formatDate,
    formatWeekday,
    todayISO,
    mountEditor
  };

})();




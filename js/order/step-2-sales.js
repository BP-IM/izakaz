/* =====================================================
   I’M | ЗАКАЗ
   STEP 2 — РЕАЛИЗАЦИЯ + СПИСАНИЯ
===================================================== */

(function () {
  "use strict";

  const XLSX_CDN =
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";

  // Step 2 работает с недельной выгрузкой IIKO.
  const AVERAGE_DAYS = 7;

  const CATEGORY_CONFIG = [
    { key: "all", label: "Все" },
    { key: "cola", label: "Cola" },
    { key: "fresh", label: "Fresh" },
    { key: "freezer", label: "Freezer" },
    { key: "cooler", label: "Cooler" },
    { key: "dry", label: "Сухой" },
    { key: "chemistry", label: "Химия" },
    { key: "household", label: "Хоз. товары" },
    { key: "other", label: "Другое" }
  ];

  const HEADER_ALIASES = {
    code: [
      "код",
      "код товара",
      "код номенклатуры",
      "код позиции",
      "артикул"
    ],
    name: [
      "наименование",
      "наименование товара",
      "номенклатура",
      "товар",
      "позиция"
    ],
    realization: [
      "реализация",
      "реализовано",
      "продажи",
      "продано",
      "расход по реализации",
      "расход реализация"
    ],
    writeoff: [
      "списание",
      "списания",
      "списано",
      "расход по списанию",
      "расход списание"
    ]
  };

  let root = null;
  let appContext = null;

  let userId = null;
  let restaurantId = null;
  let weeklyOrder = null;

  let products = [];
  let savedItems = new Map();
  let previewRows = [];

  let currentCategory = "all";

  let workbook = null;
  let workbookFileName = "";
  let workbookMatrices = new Map();
  let currentSheetName = "";
  let currentHeaderRowIndex = 0;
  let currentHeaderDepth = 1;

  let previewIsReady = false;
  let savedIsReady = false;
  let isSaving = false;


  /* =====================================================
     HELPERS
  ===================================================== */

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }


  function normalizeText(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ");
  }


  function normalizeHeader(value) {
    return normalizeText(value)
      .replace(/[\n\r\t]+/g, " ")
      .replace(/[()\[\]{}.,:;]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }


  function normalizeCode(value) {
    return String(value ?? "")
      .trim()
      .toUpperCase()
      .replace(/[–—−]/g, "-")
      .replace(/\s+/g, "");
  }


  function toPositiveNumber(value) {
    if (typeof value === "number") {
      return Number.isFinite(value)
        ? Math.abs(value)
        : 0;
    }

    let text = String(value ?? "")
      .trim()
      .replace(/\u00a0/g, "")
      .replace(/\s+/g, "");

    if (!text) {
      return 0;
    }

    const parenthesized =
      /^\(.*\)$/.test(text);

    text = text
      .replace(/^\((.*)\)$/, "$1")
      .replace(/,/g, ".")
      .replace(/[^0-9.\-]/g, "");

    const number = Number(text);

    if (!Number.isFinite(number)) {
      return 0;
    }

    return Math.abs(
      parenthesized
        ? -number
        : number
    );
  }


  function round4(value) {
    return (
      Math.round(
        (Number(value) + Number.EPSILON) *
          10000
      ) / 10000
    );
  }


  function formatNumber(value) {
    return new Intl.NumberFormat(
      "ru-RU",
      {
        maximumFractionDigits: 4
      }
    ).format(
      Number(value || 0)
    );
  }


  function formatOrderDate(dateString) {
    if (!dateString) {
      return "—";
    }

    const date =
      new Date(
        `${dateString}T00:00:00`
      );

    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }
    ).format(date);
  }


  function getOrderDayLabel(orderDay) {
    if (orderDay === "monday") {
      return "ПН";
    }

    if (orderDay === "thursday") {
      return "ЧТ";
    }

    return "—";
  }


  function getProductsWord(count) {
    const mod100 =
      count % 100;

    const mod10 =
      count % 10;

    if (
      mod100 >= 11 &&
      mod100 <= 14
    ) {
      return "товаров";
    }

    if (mod10 === 1) {
      return "товар";
    }

    if (
      mod10 >= 2 &&
      mod10 <= 4
    ) {
      return "товара";
    }

    return "товаров";
  }


  function getCategoryLabel(category) {
    return (
      CATEGORY_CONFIG.find(
        function (item) {
          return (
            item.key === category
          );
        }
      )?.label || category
    );
  }


  function getCategoryIndex(category) {
    const index =
      CATEGORY_CONFIG.findIndex(
        function (item) {
          return (
            item.key === category
          );
        }
      );

    return index === -1
      ? 999
      : index;
  }


  function createEmptyPreviewRow(product) {
    return {
      product,
      matched: false,

      realization: 0,
      writeoff: 0,
      usage: 0,

      averageRealization: 0,
      averageUsage: 0,

      sourceName: "",
      sourceRows: 0
    };
  }


  function setFileStatus(
    message,
    status = "idle"
  ) {
    const element =
      root?.querySelector(
        "#sales-file-status"
      );

    if (!element) {
      return;
    }

    element.textContent =
      message;

    element.dataset.status =
      status;
  }


  function setSaveStatus(
    message,
    status = "idle"
  ) {
    const text =
      root?.querySelector(
        "#sales-save-status"
      );

    const dot =
      root?.querySelector(
        "#sales-save-dot"
      );

    if (text) {
      text.textContent =
        message;
    }

    if (!dot) {
      return;
    }

    dot.classList.remove(
      "is-ready",
      "is-saved",
      "is-error"
    );

    if (status === "ready") {
      dot.classList.add(
        "is-ready"
      );
    }

    if (status === "saved") {
      dot.classList.add(
        "is-saved"
      );
    }

    if (status === "error") {
      dot.classList.add(
        "is-error"
      );
    }
  }


  function getMatchedCount(
    rows = previewRows
  ) {
    return rows.filter(
      function (row) {
        return row.matched;
      }
    ).length;
  }


  function getMissingCount(
    rows = previewRows
  ) {
    return rows.filter(
      function (row) {
        return !row.matched;
      }
    ).length;
  }


  function allProductsMatched(
    rows = previewRows
  ) {
    return (
      products.length > 0 &&
      rows.length === products.length &&
      getMissingCount(rows) === 0
    );
  }


  /* =====================================================
     XLSX
  ===================================================== */

  async function ensureXlsxLibrary() {
    if (window.XLSX) {
      return;
    }

    const existing =
      document.getElementById(
        "order-step-xlsx-library"
      );

    if (existing) {
      await new Promise(
        function (
          resolve,
          reject
        ) {
          if (window.XLSX) {
            resolve();
            return;
          }

          existing.addEventListener(
            "load",
            resolve,
            {
              once: true
            }
          );

          existing.addEventListener(
            "error",
            reject,
            {
              once: true
            }
          );
        }
      );

      if (!window.XLSX) {
        throw new Error(
          "Библиотека Excel не загрузилась."
        );
      }

      return;
    }

    await new Promise(
      function (
        resolve,
        reject
      ) {
        const script =
          document.createElement(
            "script"
          );

        script.id =
          "order-step-xlsx-library";

        script.src =
          XLSX_CDN;

        script.async =
          true;

        script.addEventListener(
          "load",
          resolve,
          {
            once: true
          }
        );

        script.addEventListener(
          "error",
          function () {
            reject(
              new Error(
                "Не удалось загрузить библиотеку Excel."
              )
            );
          },
          {
            once: true
          }
        );

        document.body.appendChild(
          script
        );
      }
    );

    if (!window.XLSX) {
      throw new Error(
        "Библиотека Excel не загрузилась."
      );
    }
  }


  /* =====================================================
     USER
  ===================================================== */

  async function loadUserContext() {
    const {
      data: userData,
      error: userError
    } =
      await supabaseClient
        .auth
        .getUser();

    if (
      userError ||
      !userData?.user
    ) {
      throw new Error(
        "Не удалось определить пользователя."
      );
    }

    userId =
      userData.user.id;

    const {
      data: profile,
      error: profileError
    } =
      await supabaseClient
        .from("profiles")
        .select(`
          restaurant_id,
          restaurant:restaurants (
            id
          )
        `)
        .eq(
          "id",
          userId
        )
        .single();

    if (profileError) {
      throw profileError;
    }

    restaurantId =
      profile?.restaurant_id ||
      profile?.restaurant?.id;

    if (!restaurantId) {
      throw new Error(
        "У пользователя не указан ресторан."
      );
    }
  }


  /* =====================================================
     WEEKLY ORDER
  ===================================================== */

  async function loadActiveWeeklyOrder() {
    const {
      data,
      error
    } =
      await supabaseClient
        .from("weekly_orders")
        .select(`
          id,
          restaurant_id,
          order_date,
          order_day,
          count_date,
          same_day_delivery_status,
          status,
          created_by,
          created_at,
          updated_at
        `)
        .eq(
          "restaurant_id",
          restaurantId
        )
        .in(
          "status",
          [
            "sales",
            "calculation",
            "result"
          ]
        )
        .order(
          "updated_at",
          {
            ascending: false
          }
        )
        .order(
          "order_date",
          {
            ascending: false
          }
        )
        .limit(1)
        .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error(
        "Сначала полностью завершите Шаг 1 и нажмите «Далее»."
      );
    }

    weeklyOrder =
      data;

    const day =
      root.querySelector(
        "#sales-order-day"
      );

    const date =
      root.querySelector(
        "#sales-order-date"
      );

    if (day) {
      day.textContent =
        getOrderDayLabel(
          weeklyOrder.order_day
        );
    }

    if (date) {
      date.textContent =
        formatOrderDate(
          weeklyOrder.order_date
        );
    }
  }


  /* =====================================================
     PRODUCTS
  ===================================================== */

  async function loadProducts() {
    const {
      data,
      error
    } =
      await supabaseClient
        .from("order_products")
        .select(`
          id,
          category,
          name,
          iiko_code,
          iiko_name,
          iiko_unit,
          sort_order,
          is_active
        `)
        .eq(
          "restaurant_id",
          restaurantId
        )
        .eq(
          "is_active",
          true
        );

    if (error) {
      throw error;
    }

    products =
      (data || [])
        .sort(
          function (a, b) {
            const categoryDiff =
              getCategoryIndex(
                a.category
              ) -
              getCategoryIndex(
                b.category
              );

            if (
              categoryDiff !== 0
            ) {
              return categoryDiff;
            }

            const sortDiff =
              Number(
                a.sort_order || 0
              ) -
              Number(
                b.sort_order || 0
              );

            if (
              sortDiff !== 0
            ) {
              return sortDiff;
            }

            return String(
              a.name || ""
            ).localeCompare(
              String(
                b.name || ""
              ),
              "ru"
            );
          }
        );
  }


  /* =====================================================
     SAVED ITEMS
  ===================================================== */

  async function loadSavedItems() {
    savedItems =
      new Map();

    if (!weeklyOrder?.id) {
      return;
    }

    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "weekly_order_sales_items"
        )
        .select(`
          id,
          weekly_order_id,
          product_id,
          iiko_code,
          iiko_name,
          iiko_unit,
          realization_qty,
          writeoff_qty,
          usage_qty,
          source_file_name,
          source_sheet_name,
          source_rows,
          imported_at
        `)
        .eq(
          "weekly_order_id",
          weeklyOrder.id
        );

    if (error) {
      if (
        error.code === "42P01"
      ) {
        return;
      }

      throw error;
    }

    (
      data || []
    ).forEach(
      function (item) {
        savedItems.set(
          item.product_id,
          item
        );
      }
    );
  }


  function buildPreviewFromSavedItems() {
    previewRows =
      products.map(
        function (product) {
          const saved =
            savedItems.get(
              product.id
            );

          if (!saved) {
            return createEmptyPreviewRow(
              product
            );
          }

          const realization =
            Number(
              saved.realization_qty ||
                0
            );

          const writeoff =
            Number(
              saved.writeoff_qty ||
                0
            );

          const usage =
            Number(
              saved.usage_qty ||
                0
            );

          return {
            product,
            matched: true,

            realization,
            writeoff,
            usage,

            averageRealization:
              round4(
                realization /
                  AVERAGE_DAYS
              ),

            averageUsage:
              round4(
                usage /
                  AVERAGE_DAYS
              ),

            sourceName:
              saved.iiko_name ||
              product.iiko_name ||
              "",

            sourceRows:
              Number(
                saved.source_rows ||
                  1
              )
          };
        }
      );

    savedIsReady =
      products.length > 0 &&
      products.every(
        function (product) {
          return savedItems.has(
            product.id
          );
        }
      );

    previewIsReady =
      false;

    if (savedIsReady) {
      setFileStatus(
        "Данные реализации уже сохранены. При необходимости можно загрузить новый Excel.",
        "success"
      );

      setSaveStatus(
        "Все данные реализации сохранены",
        "saved"
      );
    }
  }


  /* =====================================================
     HEADER DETECTION
  ===================================================== */

  function findHeaderIndex(
    headers,
    aliases
  ) {
    let bestIndex = -1;
    let bestScore = 0;

    headers.forEach(
      function (
        header,
        index
      ) {
        const normalized =
          normalizeHeader(
            header
          );

        if (!normalized) {
          return;
        }

        aliases.forEach(
          function (alias) {
            const normalizedAlias =
              normalizeHeader(
                alias
              );

            let score = 0;

            if (
              normalized ===
              normalizedAlias
            ) {
              score = 100;
            } else if (
              normalized.includes(
                normalizedAlias
              )
            ) {
              score =
                60 +
                normalizedAlias.length;
            } else {
              const aliasWords =
                normalizedAlias
                  .split(" ")
                  .filter(Boolean);

              const allWordsFound =
                aliasWords.every(
                  function (word) {
                    return normalized.includes(
                      word
                    );
                  }
                );

              if (
                allWordsFound
              ) {
                score =
                  40 +
                  aliasWords.length;
              }
            }

            if (
              score >
              bestScore
            ) {
              bestScore =
                score;

              bestIndex =
                index;
            }
          }
        );
      }
    );

    return bestIndex;
  }


  function buildTwoRowHeaders(
    matrix,
    rowIndex
  ) {
    const upperRow =
      matrix[rowIndex] || [];

    const lowerRow =
      matrix[
        rowIndex + 1
      ] || [];

    const columnCount =
      Math.max(
        upperRow.length,
        lowerRow.length
      );

    const result = [];

    let currentGroup =
      "";

    for (
      let columnIndex = 0;
      columnIndex < columnCount;
      columnIndex++
    ) {
      const upperValue =
        String(
          upperRow[
            columnIndex
          ] ?? ""
        ).trim();

      const lowerValue =
        String(
          lowerRow[
            columnIndex
          ] ?? ""
        ).trim();


      /*
        ВАЖНЫЙ FIX:

        В IIKO после реальных колонок могут
        оставаться полностью пустые колонки.

        Если обе ячейки пустые, мы НЕ наследуем
        предыдущую группу.

        Благодаря этому:

        5. Списания Кол-во

        больше не превращается ошибочно в:

        6. Списания
      */
      if (
        !upperValue &&
        !lowerValue
      ) {
        result.push("");
        continue;
      }


      if (upperValue) {
        currentGroup =
          upperValue;
      }


      const parts = [];

      if (currentGroup) {
        parts.push(
          currentGroup
        );
      }

      if (lowerValue) {
        parts.push(
          lowerValue
        );
      }

      result.push(
        parts
          .join(" ")
          .trim()
      );
    }

    return result;
  }


  function getHeaderIndexes(
    headers
  ) {
    return {
      code:
        findHeaderIndex(
          headers,
          HEADER_ALIASES.code
        ),

      name:
        findHeaderIndex(
          headers,
          HEADER_ALIASES.name
        ),

      realization:
        findHeaderIndex(
          headers,
          HEADER_ALIASES.realization
        ),

      writeoff:
        findHeaderIndex(
          headers,
          HEADER_ALIASES.writeoff
        )
    };
  }


  function calculateHeaderScore(
    indexes
  ) {
    let score = 0;

    if (
      indexes.code >= 0
    ) {
      score += 10;
    }

    if (
      indexes.realization >= 0
    ) {
      score += 10;
    }

    if (
      indexes.writeoff >= 0
    ) {
      score += 10;
    }

    if (
      indexes.name >= 0
    ) {
      score += 3;
    }

    if (
      indexes.code >= 0 &&
      indexes.realization >= 0 &&
      indexes.writeoff >= 0
    ) {
      score += 30;
    }

    return score;
  }


  function detectHeaderAtRow(
    matrix,
    rowIndex
  ) {
    const oneRowHeaders =
      matrix[
        rowIndex
      ] || [];

    const oneRowIndexes =
      getHeaderIndexes(
        oneRowHeaders
      );

    const oneRowScore =
      calculateHeaderScore(
        oneRowIndexes
      );


    const twoRowHeaders =
      buildTwoRowHeaders(
        matrix,
        rowIndex
      );

    const twoRowIndexes =
      getHeaderIndexes(
        twoRowHeaders
      );

    const twoRowScore =
      calculateHeaderScore(
        twoRowIndexes
      );


    if (
      twoRowScore >
      oneRowScore
    ) {
      return {
        rowIndex,
        headerDepth: 2,
        headers:
          twoRowHeaders,
        indexes:
          twoRowIndexes,
        score:
          twoRowScore
      };
    }


    return {
      rowIndex,
      headerDepth: 1,
      headers:
        oneRowHeaders,
      indexes:
        oneRowIndexes,
      score:
        oneRowScore
    };
  }


  function detectHeaderRow(
    matrix
  ) {
    let best = {
      rowIndex: 0,
      headerDepth: 1,
      headers: [],
      score: -1,

      indexes: {
        code: -1,
        name: -1,
        realization: -1,
        writeoff: -1
      }
    };

    const scanLimit =
      Math.min(
        matrix.length,
        50
      );


    for (
      let rowIndex = 0;
      rowIndex < scanLimit;
      rowIndex++
    ) {
      const candidate =
        detectHeaderAtRow(
          matrix,
          rowIndex
        );

      if (
        candidate.score >
        best.score
      ) {
        best =
          candidate;
      }
    }


    return best;
  }


  function detectBestSheet() {
    let best = null;

    workbook.SheetNames
      .forEach(
        function (
          sheetName
        ) {
          const matrix =
            getSheetMatrix(
              sheetName
            );

          const detected =
            detectHeaderRow(
              matrix
            );

          if (
            !best ||
            detected.score >
              best.score
          ) {
            best = {
              sheetName,
              ...detected
            };
          }
        }
      );

    return best;
  }


  function getSheetMatrix(
    sheetName
  ) {
    if (
      workbookMatrices.has(
        sheetName
      )
    ) {
      return workbookMatrices.get(
        sheetName
      );
    }

    const sheet =
      workbook.Sheets[
        sheetName
      ];

    const matrix =
      window.XLSX.utils
        .sheet_to_json(
          sheet,
          {
            header: 1,
            defval: "",
            raw: true,
            blankrows: true
          }
        );

    workbookMatrices.set(
      sheetName,
      matrix
    );

    return matrix;
  }


  /* =====================================================
     MAPPING
  ===================================================== */

  function populateSheetSelect() {
    const select =
      root.querySelector(
        "#sales-sheet-select"
      );

    if (
      !select ||
      !workbook
    ) {
      return;
    }

    select.innerHTML =
      workbook.SheetNames
        .map(
          function (
            sheetName
          ) {
            return `
              <option value="${escapeHTML(
                sheetName
              )}">
                ${escapeHTML(
                  sheetName
                )}
              </option>
            `;
          }
        )
        .join("");
  }


  function getHeadersForCurrentMapping() {
    const matrix =
      getSheetMatrix(
        currentSheetName
      );

    if (
      currentHeaderDepth === 2
    ) {
      return buildTwoRowHeaders(
        matrix,
        currentHeaderRowIndex
      );
    }

    return (
      matrix[
        currentHeaderRowIndex
      ] || []
    );
  }


  function populateColumnSelect(
    selectId,
    headers,
    selectedIndex,
    allowEmpty
  ) {
    const select =
      root.querySelector(
        selectId
      );

    if (!select) {
      return;
    }

    const options = [];

    if (allowEmpty) {
      options.push(
        '<option value="-1">— не использовать —</option>'
      );
    }

    headers.forEach(
      function (
        header,
        index
      ) {
        const label =
          String(
            header ?? ""
          ).trim() ||
          `Колонка ${
            index + 1
          }`;

        options.push(`
          <option value="${index}">
            ${escapeHTML(
              `${
                index + 1
              }. ${label}`
            )}
          </option>
        `);
      }
    );

    select.innerHTML =
      options.join("");

    if (
      selectedIndex >= 0
    ) {
      select.value =
        String(
          selectedIndex
        );
    } else if (
      allowEmpty
    ) {
      select.value =
        "-1";
    }
  }


  function refreshMappingColumns(
    preselectedIndexes = null
  ) {
    const headers =
      getHeadersForCurrentMapping();

    const indexes =
      preselectedIndexes || {
        code:
          findHeaderIndex(
            headers,
            HEADER_ALIASES.code
          ),

        name:
          findHeaderIndex(
            headers,
            HEADER_ALIASES.name
          ),

        realization:
          findHeaderIndex(
            headers,
            HEADER_ALIASES.realization
          ),

        writeoff:
          findHeaderIndex(
            headers,
            HEADER_ALIASES.writeoff
          )
      };

    populateColumnSelect(
      "#sales-code-column",
      headers,
      indexes.code,
      false
    );

    populateColumnSelect(
      "#sales-name-column",
      headers,
      indexes.name,
      true
    );

    populateColumnSelect(
      "#sales-realization-column",
      headers,
      indexes.realization,
      false
    );

    populateColumnSelect(
      "#sales-writeoff-column",
      headers,
      indexes.writeoff,
      false
    );
  }


  function applyDetectedMapping(
    detected
  ) {
    currentSheetName =
      detected.sheetName;

    currentHeaderRowIndex =
      detected.rowIndex;

    currentHeaderDepth =
      detected.headerDepth ||
      1;

    const sheetSelect =
      root.querySelector(
        "#sales-sheet-select"
      );

    const headerInput =
      root.querySelector(
        "#sales-header-row"
      );

    if (sheetSelect) {
      sheetSelect.value =
        currentSheetName;
    }

    if (headerInput) {
      headerInput.value =
        String(
          currentHeaderRowIndex +
            1
        );
    }

    refreshMappingColumns(
      detected.indexes
    );
  }


  function showMappingCard() {
    const card =
      root.querySelector(
        "#sales-mapping-card"
      );

    if (card) {
      card.hidden =
        false;
    }
  }


  function getSelectedColumnIndex(
    selector
  ) {
    const element =
      root.querySelector(
        selector
      );

    return Number(
      element?.value ??
        -1
    );
  }


  /* =====================================================
     EXCEL FILE
  ===================================================== */

  async function handleExcelFile(
    file
  ) {
    if (!file) {
      return;
    }

    const extension =
      file.name
        .split(".")
        .pop()
        ?.toLowerCase();

    if (
      !extension ||
      ![
        "xlsx",
        "xls"
      ].includes(
        extension
      )
    ) {
      setFileStatus(
        "Выберите Excel-файл XLSX или XLS.",
        "error"
      );

      return;
    }

    previewIsReady =
      false;

    savedIsReady =
      false;

    updateActionButtons();

    setFileStatus(
      `Читаем ${file.name}...`,
      "idle"
    );

    setSaveStatus(
      "Новый файл еще не сохранен",
      "ready"
    );

    try {
      await ensureXlsxLibrary();

      const buffer =
        await file.arrayBuffer();

      workbook =
        window.XLSX.read(
          buffer,
          {
            type: "array",
            cellDates: false,
            raw: true
          }
        );

      workbookFileName =
        file.name;

      workbookMatrices =
        new Map();

      if (
        !workbook.SheetNames
          .length
      ) {
        throw new Error(
          "В Excel нет листов."
        );
      }

      populateSheetSelect();

      const detected =
        detectBestSheet();

      if (!detected) {
        throw new Error(
          "Не удалось прочитать структуру Excel."
        );
      }

      applyDetectedMapping(
        detected
      );

      showMappingCard();

      const hasRequiredColumns =
        detected.indexes.code >=
          0 &&
        detected.indexes
          .realization >= 0 &&
        detected.indexes
          .writeoff >= 0;

      if (
        hasRequiredColumns
      ) {
        processCurrentMapping();
      } else {
        setFileStatus(
          "Файл открыт, но не все колонки определились автоматически. Выберите Код, Реализация и Списание вручную.",
          "warning"
        );
      }
    } catch (error) {
      console.error(
        "Excel read error:",
        error
      );

      setFileStatus(
        error.message ||
          "Не удалось прочитать Excel.",
        "error"
      );

      setSaveStatus(
        "Ошибка чтения файла",
        "error"
      );
    }
  }


  /* =====================================================
     PROCESS EXCEL
  ===================================================== */

  function processCurrentMapping() {
    if (
      !workbook ||
      !currentSheetName
    ) {
      return;
    }

    const codeIndex =
      getSelectedColumnIndex(
        "#sales-code-column"
      );

    const nameIndex =
      getSelectedColumnIndex(
        "#sales-name-column"
      );

    const realizationIndex =
      getSelectedColumnIndex(
        "#sales-realization-column"
      );

    const writeoffIndex =
      getSelectedColumnIndex(
        "#sales-writeoff-column"
      );

    if (
      codeIndex < 0 ||
      realizationIndex < 0 ||
      writeoffIndex < 0
    ) {
      setFileStatus(
        "Укажите колонки Код IIKO, Реализация и Списание.",
        "error"
      );

      return;
    }

    const matrix =
      getSheetMatrix(
        currentSheetName
      );

    const aggregated =
      new Map();


    for (
      let rowIndex =
        currentHeaderRowIndex +
        currentHeaderDepth;

      rowIndex <
      matrix.length;

      rowIndex++
    ) {
      const row =
        matrix[rowIndex] || [];

      const code =
        normalizeCode(
          row[
            codeIndex
          ]
        );

      if (!code) {
        continue;
      }

      const realization =
        toPositiveNumber(
          row[
            realizationIndex
          ]
        );

      const writeoff =
        toPositiveNumber(
          row[
            writeoffIndex
          ]
        );

      const sourceName =
        nameIndex >= 0
          ? String(
              row[
                nameIndex
              ] ?? ""
            ).trim()
          : "";

      const previous =
        aggregated.get(
          code
        ) || {
          realization: 0,
          writeoff: 0,
          sourceName: "",
          sourceRows: 0
        };

      previous.realization +=
        realization;

      previous.writeoff +=
        writeoff;

      previous.sourceRows +=
        1;

      if (
        !previous.sourceName &&
        sourceName
      ) {
        previous.sourceName =
          sourceName;
      }

      aggregated.set(
        code,
        previous
      );
    }


    previewRows =
      products.map(
        function (
          product
        ) {
          const source =
            aggregated.get(
              normalizeCode(
                product.iiko_code
              )
            );

          if (!source) {
            return createEmptyPreviewRow(
              product
            );
          }

          const realization =
            round4(
              source.realization
            );

          const writeoff =
            round4(
              source.writeoff
            );

          const usage =
            round4(
              realization +
                writeoff
            );

          return {
            product,
            matched: true,

            realization,
            writeoff,
            usage,

            averageRealization:
              round4(
                realization /
                  AVERAGE_DAYS
              ),

            averageUsage:
              round4(
                usage /
                  AVERAGE_DAYS
              ),

            sourceName:
              source.sourceName,

            sourceRows:
              source.sourceRows
          };
        }
      );


    previewIsReady =
      true;

    savedIsReady =
      false;

    const matched =
      getMatchedCount();

    const missing =
      getMissingCount();


    if (missing === 0) {
      setFileStatus(
        `${workbookFileName}: найдено ${matched} из ${products.length} позиций. Можно сохранять.`,
        "success"
      );

      setSaveStatus(
        "Проверено — нажмите «Сохранить данные»",
        "ready"
      );
    } else {
      setFileStatus(
        `${workbookFileName}: найдено ${matched} из ${products.length}. Не найдено: ${missing}.`,
        "warning"
      );

      setSaveStatus(
        "Есть товары без совпадения по IIKO-коду",
        "error"
      );
    }


    renderAll();
  }


  /* =====================================================
     CATEGORY TABS
  ===================================================== */

  function renderCategoryTabs() {
    const container =
      root.querySelector(
        "#sales-category-tabs"
      );

    if (!container) {
      return;
    }

    const categoriesWithProducts =
      new Set(
        products.map(
          function (product) {
            return product.category;
          }
        )
      );


    container.innerHTML =
      CATEGORY_CONFIG
        .filter(
          function (item) {
            return (
              item.key === "all" ||
              categoriesWithProducts.has(
                item.key
              )
            );
          }
        )
        .map(
          function (item) {
            const categoryCount =
              item.key === "all"
                ? products.length
                : products.filter(
                    function (
                      product
                    ) {
                      return (
                        product.category ===
                        item.key
                      );
                    }
                  ).length;

            return `
              <button
                class="sales-category-tab ${
                  item.key ===
                  currentCategory
                    ? "is-active"
                    : ""
                }"
                type="button"
                data-sales-category="${escapeHTML(
                  item.key
                )}"
              >
                ${escapeHTML(
                  item.label
                )} · ${categoryCount}
              </button>
            `;
          }
        )
        .join("");
  }


  /* =====================================================
     SUMMARY
  ===================================================== */

  function renderSummary() {
    const total =
      products.length;

    const matched =
      getMatchedCount();

    const missing =
      getMissingCount();

    const totalEl =
      root.querySelector(
        "#sales-total-count"
      );

    const matchedEl =
      root.querySelector(
        "#sales-matched-count"
      );

    const missingEl =
      root.querySelector(
        "#sales-missing-count"
      );

    const missingCard =
      root.querySelector(
        "#sales-missing-card"
      );

    const sourceElement =
      root.querySelector(
        "#sales-source-state"
      );


    if (totalEl) {
      totalEl.textContent =
        String(total);
    }

    if (matchedEl) {
      matchedEl.textContent =
        String(matched);
    }

    if (missingEl) {
      missingEl.textContent =
        String(missing);
    }


    if (missingCard) {
      missingCard.classList.toggle(
        "is-warning",
        missing > 0
      );

      missingCard.classList.toggle(
        "is-success",
        missing === 0 &&
          total > 0
      );
    }


    if (sourceElement) {
      if (workbookFileName) {
        sourceElement.textContent =
          workbookFileName;

        sourceElement.title =
          workbookFileName;

      } else if (
        savedItems.size > 0
      ) {
        const firstSavedItem =
          Array.from(
            savedItems.values()
          )[0];

        const sourceName =
          firstSavedItem
            ?.source_file_name ||
          "Supabase";

        sourceElement.textContent =
          sourceName;

        sourceElement.title =
          sourceName;

      } else {
        sourceElement.textContent =
          "—";

        sourceElement.removeAttribute(
          "title"
        );
      }
    }
  }


  /* =====================================================
     TABLE
  ===================================================== */

  function getFilteredRows() {
    if (
      currentCategory ===
      "all"
    ) {
      return previewRows;
    }

    return previewRows.filter(
      function (row) {
        return (
          row.product.category ===
          currentCategory
        );
      }
    );
  }


  function renderAverageLine(
    value,
    unit
  ) {
    return `
      <small
        class="sales-value-sub"
        style="
          display:block;
          margin-top:4px;
          color:#8a93a3;
          font-size:11px;
          font-weight:500;
          white-space:nowrap;
        "
      >
        ср. ${escapeHTML(
          formatNumber(
            value
          )
        )} ${escapeHTML(
          unit
        )}/день
      </small>
    `;
  }


  function renderTable() {
    const body =
      root.querySelector(
        "#sales-products-body"
      );

    const categoryTitle =
      root.querySelector(
        "#sales-current-category"
      );

    const categoryCount =
      root.querySelector(
        "#sales-category-count"
      );


    if (!body) {
      console.error(
        "Step 2: не найден #sales-products-body"
      );

      return;
    }


    const rows =
      getFilteredRows();


    if (categoryTitle) {
      categoryTitle.textContent =
        currentCategory ===
        "all"
          ? "Все товары"
          : getCategoryLabel(
              currentCategory
            );
    }


    if (categoryCount) {
      categoryCount.textContent =
        `${rows.length} ${getProductsWord(
          rows.length
        )}`;
    }


    if (!rows.length) {
      body.innerHTML = `
        <tr>
          <td
            colspan="6"
            class="sales-empty-cell"
          >
            Нет товаров в этой категории.
          </td>
        </tr>
      `;

      return;
    }


    body.innerHTML =
      rows
        .map(
          function (
            row,
            index
          ) {
            const product =
              row.product;

            const unit =
              product.iiko_unit ||
              "";

            return `
              <tr class="${
                row.matched
                  ? ""
                  : "sales-row-missing"
              }">

                <td
                  class="sales-number-cell"
                  data-label="№"
                >
                  ${index + 1}
                </td>


                <td
                  class="sales-product-cell"
                  data-label="Товар"
                >

                  <strong>
                    ${escapeHTML(
                      product.name
                    )}
                  </strong>


                  <div class="sales-product-meta">

                    <span class="sales-code">
                      IIKO ${escapeHTML(
                        product.iiko_code ||
                          "—"
                      )}
                    </span>


                    ${
                      row.sourceName
                        ? `
                          <span>
                            ${escapeHTML(
                              row.sourceName
                            )}
                          </span>
                        `
                        : product.iiko_name
                          ? `
                            <span>
                              ${escapeHTML(
                                product.iiko_name
                              )}
                            </span>
                          `
                          : ""
                    }


                    ${
                      row.sourceRows > 1
                        ? `
                          <span>
                            ${row.sourceRows}
                            строк в Excel
                          </span>
                        `
                        : ""
                    }

                  </div>

                </td>


                <td
                  data-label="Реализация"
                >

                  <span
                    class="sales-value-main"
                  >
                    ${
                      row.matched
                        ? `${escapeHTML(
                            formatNumber(
                              row.realization
                            )
                          )} ${escapeHTML(
                            unit
                          )}`
                        : "—"
                    }
                  </span>


                  ${
                    row.matched
                      ? renderAverageLine(
                          row.averageRealization,
                          unit
                        )
                      : ""
                  }

                </td>


                <td
                  data-label="Списание"
                >

                  <span
                    class="sales-value-main"
                  >
                    ${
                      row.matched
                        ? `${escapeHTML(
                            formatNumber(
                              row.writeoff
                            )
                          )} ${escapeHTML(
                            unit
                          )}`
                        : "—"
                    }
                  </span>

                </td>


                <td
                  data-label="Расход"
                >

                  <span
                    class="sales-usage-value"
                  >
                    ${
                      row.matched
                        ? `${escapeHTML(
                            formatNumber(
                              row.usage
                            )
                          )} ${escapeHTML(
                            unit
                          )}`
                        : "—"
                    }
                  </span>


                  ${
                    row.matched
                      ? renderAverageLine(
                          row.averageUsage,
                          unit
                        )
                      : ""
                  }

                </td>


                <td
                  data-label="Статус"
                >

                  <span
                    class="sales-status-badge ${
                      row.matched
                        ? "is-found"
                        : "is-missing"
                    }"
                  >
                    ${
                      row.matched
                        ? "Найден"
                        : "Не найден"
                    }
                  </span>

                </td>

              </tr>
            `;
          }
        )
        .join("");
  }


  /* =====================================================
     BUTTONS
  ===================================================== */

  function updateActionButtons() {
    const saveButton =
      root?.querySelector(
        "#sales-save-button"
      );

    const nextButton =
      root?.querySelector(
        "#sales-next-button"
      );


    if (saveButton) {
      saveButton.disabled =
        isSaving ||
        !previewIsReady ||
        !allProductsMatched(
          previewRows
        );
    }


    if (nextButton) {
      nextButton.disabled =
        isSaving ||
        !savedIsReady;
    }
  }


  function renderAll() {
    renderCategoryTabs();
    renderSummary();
    renderTable();
    updateActionButtons();
  }


  /* =====================================================
     SAVE
  ===================================================== */

  async function savePreview() {
    if (
      isSaving ||
      !previewIsReady ||
      !allProductsMatched(
        previewRows
      )
    ) {
      return;
    }


    const button =
      root.querySelector(
        "#sales-save-button"
      );


    isSaving =
      true;

    updateActionButtons();


    if (button) {
      button.textContent =
        "Сохранение...";
    }


    setSaveStatus(
      "Сохраняем данные реализации...",
      "ready"
    );


    try {
      const importedAt =
        new Date()
          .toISOString();


      const payload =
        previewRows.map(
          function (row) {
            return {
              weekly_order_id:
                weeklyOrder.id,

              restaurant_id:
                restaurantId,

              product_id:
                row.product.id,

              iiko_code:
                row.product
                  .iiko_code,

              iiko_name:
                row.sourceName ||
                row.product
                  .iiko_name ||
                null,

              iiko_unit:
                row.product
                  .iiko_unit,

              realization_qty:
                round4(
                  row.realization
                ),

              writeoff_qty:
                round4(
                  row.writeoff
                ),

              usage_qty:
                round4(
                  row.usage
                ),

              source_file_name:
                workbookFileName ||
                null,

              source_sheet_name:
                currentSheetName ||
                null,

              source_rows:
                Math.max(
                  1,
                  Number(
                    row.sourceRows ||
                      1
                  )
                ),

              imported_by:
                userId,

              imported_at:
                importedAt
            };
          }
        );


      const {
        error: upsertError
      } =
        await supabaseClient
          .from(
            "weekly_order_sales_items"
          )
          .upsert(
            payload,
            {
              onConflict:
                "weekly_order_id,product_id"
            }
          );


      if (upsertError) {
        throw upsertError;
      }


      const {
        error: orderError
      } =
        await supabaseClient
          .from(
            "weekly_orders"
          )
          .update({
            status:
              "sales"
          })
          .eq(
            "id",
            weeklyOrder.id
          );


      if (orderError) {
        throw orderError;
      }


      weeklyOrder.status =
        "sales";


      await loadSavedItems();


      savedIsReady =
        products.length > 0 &&
        products.every(
          function (
            product
          ) {
            return savedItems.has(
              product.id
            );
          }
        );


      previewIsReady =
        false;


      setFileStatus(
        `Данные сохранены: ${products.length} позиций.`,
        "success"
      );


      setSaveStatus(
        "Все данные реализации сохранены",
        "saved"
      );

    } catch (error) {
      console.error(
        "Sales save error:",
        error
      );


      setFileStatus(
        error.code ===
          "42P01"
          ? "Сначала выполните SQL для таблицы weekly_order_sales_items."
          : (
              error.message ||
              "Не удалось сохранить данные."
            ),
        "error"
      );


      setSaveStatus(
        "Ошибка сохранения",
        "error"
      );

    } finally {
      isSaving =
        false;


      if (button) {
        button.textContent =
          "Сохранить данные";
      }


      renderAll();
    }
  }


  /* =====================================================
     NAVIGATION
  ===================================================== */

  async function goBack() {
    if (
      appContext &&
      typeof appContext.goToStep ===
        "function"
    ) {
      await appContext.goToStep(
        1
      );
    }
  }


  async function goNext() {
    if (
      !savedIsReady ||
      isSaving
    ) {
      return;
    }


    const button =
      root.querySelector(
        "#sales-next-button"
      );


    if (button) {
      button.disabled =
        true;
    }


    try {
      const {
        error
      } =
        await supabaseClient
          .from(
            "weekly_orders"
          )
          .update({
            status:
              "calculation"
          })
          .eq(
            "id",
            weeklyOrder.id
          );


      if (error) {
        throw error;
      }


      weeklyOrder.status =
        "calculation";


      if (
        appContext &&
        typeof appContext.goToStep ===
          "function"
      ) {
        await appContext.goToStep(
          3
        );
      }

    } catch (error) {
      console.error(
        "Go next error:",
        error
      );


      setSaveStatus(
        "Не удалось перейти к расчету",
        "error"
      );


      if (button) {
        button.disabled =
          false;
      }
    }
  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {
    const fileInput =
      root.querySelector(
        "#sales-file-input"
      );

    const uploadCard =
      root.querySelector(
        ".sales-upload-card"
      );


    fileInput?.addEventListener(
      "change",
      function () {
        const file =
          fileInput.files?.[0];

        handleExcelFile(
          file
        );
      }
    );


    if (uploadCard) {
      [
        "dragenter",
        "dragover"
      ].forEach(
        function (
          eventName
        ) {
          uploadCard.addEventListener(
            eventName,
            function (
              event
            ) {
              event.preventDefault();

              uploadCard.classList.add(
                "is-dragover"
              );
            }
          );
        }
      );


      [
        "dragleave",
        "drop"
      ].forEach(
        function (
          eventName
        ) {
          uploadCard.addEventListener(
            eventName,
            function (
              event
            ) {
              event.preventDefault();

              uploadCard.classList.remove(
                "is-dragover"
              );
            }
          );
        }
      );


      uploadCard.addEventListener(
        "drop",
        function (
          event
        ) {
          const file =
            event.dataTransfer
              ?.files?.[0];

          if (file) {
            handleExcelFile(
              file
            );
          }
        }
      );
    }


    root
      .querySelector(
        "#sales-sheet-select"
      )
      ?.addEventListener(
        "change",
        function (
          event
        ) {
          currentSheetName =
            event.target.value;


          const matrix =
            getSheetMatrix(
              currentSheetName
            );


          const detected =
            detectHeaderRow(
              matrix
            );


          currentHeaderRowIndex =
            detected.rowIndex;


          currentHeaderDepth =
            detected.headerDepth ||
            1;


          const headerInput =
            root.querySelector(
              "#sales-header-row"
            );


          if (headerInput) {
            headerInput.value =
              String(
                currentHeaderRowIndex +
                  1
              );
          }


          refreshMappingColumns(
            detected.indexes
          );
        }
      );


    root
      .querySelector(
        "#sales-header-row"
      )
      ?.addEventListener(
        "change",
        function (
          event
        ) {
          const matrix =
            getSheetMatrix(
              currentSheetName
            );


          const requested =
            Math.max(
              1,
              Number(
                event.target.value ||
                  1
              )
            );


          currentHeaderRowIndex =
            Math.min(
              requested - 1,
              Math.max(
                0,
                matrix.length - 1
              )
            );


          const detected =
            detectHeaderAtRow(
              matrix,
              currentHeaderRowIndex
            );


          currentHeaderDepth =
            detected.headerDepth ||
            1;


          event.target.value =
            String(
              currentHeaderRowIndex +
                1
            );


          refreshMappingColumns(
            detected.indexes
          );
        }
      );


    root
      .querySelector(
        "#sales-process-button"
      )
      ?.addEventListener(
        "click",
        processCurrentMapping
      );


    root.addEventListener(
      "click",
      function (
        event
      ) {
        const categoryButton =
          event.target.closest(
            "[data-sales-category]"
          );


        if (
          categoryButton
        ) {
          currentCategory =
            categoryButton.dataset
              .salesCategory;


          renderAll();

          return;
        }


        if (
          event.target.closest(
            "#sales-save-button"
          )
        ) {
          savePreview();

          return;
        }


        if (
          event.target.closest(
            "#sales-back-button"
          )
        ) {
          goBack();

          return;
        }


        if (
          event.target.closest(
            "#sales-next-button"
          )
        ) {
          goNext();
        }
      }
    );
  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(
    container,
    context
  ) {
    root =
      container.querySelector(
        "#order-sales-step"
      );


    if (!root) {
      throw new Error(
        "Step 2 root не найден."
      );
    }


    appContext =
      context;


    userId =
      null;

    restaurantId =
      null;

    weeklyOrder =
      null;


    products =
      [];

    savedItems =
      new Map();

    previewRows =
      [];


    currentCategory =
      "all";


    workbook =
      null;

    workbookFileName =
      "";

    workbookMatrices =
      new Map();

    currentSheetName =
      "";

    currentHeaderRowIndex =
      0;

    currentHeaderDepth =
      1;


    previewIsReady =
      false;

    savedIsReady =
      false;

    isSaving =
      false;


    bindEvents();


    try {
      setFileStatus(
        "Подготовка шага реализации...",
        "idle"
      );


      await loadUserContext();

      await loadActiveWeeklyOrder();

      await loadProducts();

      await loadSavedItems();


      if (
        !products.length
      ) {
        throw new Error(
          "В order_products нет активных товаров заказа."
        );
      }


      buildPreviewFromSavedItems();

      renderAll();


      if (
        !savedItems.size
      ) {
        setFileStatus(
          "Загрузите файл из IIKO.",
          "idle"
        );


        setSaveStatus(
          "Данные еще не сохранены",
          "idle"
        );
      }

    } catch (error) {
      console.error(
        "Step 2 init error:",
        error
      );


      setFileStatus(
        error.message ||
          "Ошибка загрузки шага 2.",
        "error"
      );


      setSaveStatus(
        "Ошибка загрузки",
        "error"
      );


      previewRows =
        products.map(
          createEmptyPreviewRow
        );


      renderAll();
    }
  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.OrderStep2Sales = {
    init,

    reload:
      async function () {
        if (
          !root ||
          !restaurantId ||
          !weeklyOrder
        ) {
          return;
        }


        await loadProducts();

        await loadSavedItems();


        buildPreviewFromSavedItems();

        renderAll();
      }
  };

})();
/* =====================================================
   I’M | ЗАКАЗ
   STEP 1 — FRESH LOTS / СРОКИ

   - Fresh UI
   - загрузка из Supabase
   - autosave
   - удаление
   - refresh
   - case / slv / ед.
   - сравнение сроков с фактическим остатком
===================================================== */

(function () {
  "use strict";


  const SAVE_DELAY = 500;
  const EPSILON = 0.0001;


  let context = null;
  let boundRoot = null;

  let currentWeeklyOrderId = null;

  let localLotCounter = 0;

  let lotsByProduct = new Map();

  let saveTimers = new Map();

  let activeSaves = 0;


  let state = {
    initialized: false,
    ready: true,
    weeklyOrderId: null,
    freshProductsCount: 0
  };


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


  function normalizeDecimal(value) {

    return String(value ?? "")
      .trim()
      .replace(",", ".");

  }


  function toNullableNumber(value) {

    const raw =
      normalizeDecimal(value);


    if (raw === "") {
      return null;
    }


    const number =
      Number(raw);


    if (
      !Number.isFinite(number) ||
      number < 0
    ) {
      return null;
    }


    return number;

  }


  function formatInputValue(value) {

    if (
      value === null ||
      value === undefined
    ) {
      return "";
    }


    return String(value);

  }


  function formatNumber(value) {

    if (
      context &&
      typeof context.formatNumber ===
        "function"
    ) {

      return context.formatNumber(
        value
      );

    }


    return new Intl.NumberFormat(
      "ru-RU",
      {
        maximumFractionDigits: 4
      }
    ).format(
      Number(value || 0)
    );

  }


  function createLocalLotId() {

    localLotCounter += 1;


    return (
      `local-${Date.now()}-${localLotCounter}`
    );

  }


  function getWeeklyOrder() {

    return (
      context
        ?.getWeeklyOrder
        ?.() ||
      null
    );

  }


  function getProducts() {

    return (
      context
        ?.getProducts
        ?.() ||
      []
    );

  }


  function getFreshProducts() {

    return getProducts()
      .filter(
        function (product) {

          return (
            product.category ===
            "fresh"
          );

        }
      );

  }


  function getProduct(productId) {

    return (
      getProducts()
        .find(
          function (product) {

            return (
              product.id ===
              productId
            );

          }
        ) ||
      null
    );

  }


  function getLots(productId) {

    if (
      !lotsByProduct.has(
        productId
      )
    ) {

      lotsByProduct.set(
        productId,
        []
      );

    }


    return lotsByProduct.get(
      productId
    );

  }


  function createEmptyLot() {

    return {

      client_id:
        createLocalLotId(),

      id:
        null,

      expiry_date:
        "",

      case_qty:
        null,

      slv_qty:
        null,

      pcs_qty:
        null,

      base_qty:
        0,

      save_state:
        "new",

      save_error:
        null

    };

  }


  function findLot(
    productId,
    clientId
  ) {

    return (
      getLots(
        productId
      )
        .find(
          function (lot) {

            return (
              lot.client_id ===
              clientId
            );

          }
        ) ||
      null
    );

  }


  /* =====================================================
     CALCULATION
  ===================================================== */

  function calculateLotBaseQty(
    product,
    lot
  ) {

    if (
      !product ||
      !context ||
      typeof context.calculateBaseQty !==
        "function"
    ) {

      return 0;

    }


    return Number(
      context.calculateBaseQty(
        product,
        {
          case_qty:
            lot.case_qty,

          slv_qty:
            lot.slv_qty,

          pcs_qty:
            lot.pcs_qty
        }
      ) || 0
    );

  }


  function getActualBaseQty(product) {

    if (
      !product ||
      !context ||
      typeof context.getStockRecord !==
        "function" ||
      typeof context.calculateBaseQty !==
        "function"
    ) {

      return 0;

    }


    const record =
      context.getStockRecord(
        product.id
      );


    return Number(
      context.calculateBaseQty(
        product,
        record
      ) || 0
    );

  }


  function getAllocatedBaseQty(product) {

    return getLots(
      product.id
    ).reduce(
      function (
        total,
        lot
      ) {

        return (
          total +
          calculateLotBaseQty(
            product,
            lot
          )
        );

      },
      0
    );

  }


  function getAllocationState(product) {

    const actual =
      getActualBaseQty(
        product
      );


    const allocated =
      getAllocatedBaseQty(
        product
      );


    const difference =
      actual - allocated;


    if (
      Math.abs(difference) <=
      EPSILON
    ) {

      return {
        type: "success",

        text:
          actual <= EPSILON
            ? "Остаток 0 — сроки не требуются"
            : "Совпадает с фактическим остатком",

        actual,
        allocated,
        difference: 0
      };

    }


    if (difference > 0) {

      return {
        type: "warning",

        text:
          `Не распределено: ${formatNumber(
            difference
          )} ${product.iiko_unit}`,

        actual,
        allocated,
        difference
      };

    }


    return {
      type: "error",

      text:
        `По срокам больше факта на ${formatNumber(
          Math.abs(difference)
        )} ${product.iiko_unit}`,

      actual,
      allocated,
      difference
    };

  }


  /* =====================================================
     DUPLICATE EXPIRY
  ===================================================== */

  function hasDuplicateExpiry(
    productId,
    lot
  ) {

    if (!lot.expiry_date) {
      return false;
    }


    return getLots(
      productId
    ).some(
      function (item) {

        return (
          item.client_id !==
            lot.client_id

          &&

          item.expiry_date ===
            lot.expiry_date
        );

      }
    );

  }


  /* =====================================================
     SAVE STATE
  ===================================================== */

  function getSaveStateText(lot) {

    if (
      lot.save_state ===
      "saving"
    ) {
      return "Сохранение...";
    }


    if (
      lot.save_state ===
      "saved"
    ) {
      return "Сохранено";
    }


    if (
      lot.save_state ===
      "error"
    ) {
      return (
        lot.save_error ||
        "Ошибка сохранения"
      );
    }


    if (
      !lot.expiry_date
    ) {
      return "Укажите срок";
    }


    return "Не сохранено";

  }


  /* =====================================================
     RENDER INPUTS
  ===================================================== */

  function renderQuantityInput(
    product,
    lot,
    field,
    coefficient,
    label
  ) {

    if (
      coefficient === null ||
      coefficient === undefined
    ) {

      return `
        <div class="fresh-lot-field is-disabled">

          <span>
            ${escapeHTML(label)}
          </span>

          <div class="fresh-lot-disabled">
            —
          </div>

        </div>
      `;

    }


    return `
      <label class="fresh-lot-field">

        <span>
          ${escapeHTML(label)}
        </span>

        <input
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          value="${escapeHTML(
            formatInputValue(
              lot[field]
            )
          )}"
          placeholder="0"
          data-fresh-lot-input="${escapeHTML(
            field
          )}"
        >

      </label>
    `;

  }


  function renderLot(
    product,
    lot,
    index
  ) {

    const baseQty =
      calculateLotBaseQty(
        product,
        lot
      );


    return `
      <div
        class="fresh-lot-item"
        data-fresh-lot-id="${escapeHTML(
          lot.client_id
        )}"
      >

        <div class="fresh-lot-index">
          ${index + 1}
        </div>


        <label
          class="
            fresh-lot-field
            fresh-lot-date-field
          "
        >

          <span>
            Срок годности
          </span>

          <input
            type="date"
            value="${escapeHTML(
              lot.expiry_date || ""
            )}"
            data-fresh-lot-input="expiry_date"
          >

        </label>


        ${renderQuantityInput(
          product,
          lot,
          "case_qty",
          product.case_to_base,
          "case"
        )}


        ${renderQuantityInput(
          product,
          lot,
          "slv_qty",
          product.slv_to_base,
          "slv"
        )}


        ${renderQuantityInput(
          product,
          lot,
          "pcs_qty",
          product.pcs_to_base,
          product.iiko_unit || "ед."
        )}


        <div class="fresh-lot-total">

          <span>
            Итого
          </span>

          <strong data-fresh-lot-total>
            ${escapeHTML(
              formatNumber(
                baseQty
              )
            )}
            ${escapeHTML(
              product.iiko_unit
            )}
          </strong>


          <small
            class="
              fresh-lot-save-state
              is-${escapeHTML(
                lot.save_state
              )}
            "
            data-fresh-lot-save-state
          >
            ${escapeHTML(
              getSaveStateText(
                lot
              )
            )}
          </small>

        </div>


        <button
          class="fresh-lot-remove"
          type="button"
          title="Удалить срок"
          aria-label="Удалить срок"
          data-fresh-lot-remove
        >
          ×
        </button>

      </div>
    `;

  }


  /* =====================================================
     PANEL
  ===================================================== */

  function renderFreshPanel(product) {

    const lots =
      getLots(
        product.id
      );


    const allocation =
      getAllocationState(
        product
      );


    const lotsHTML =
      lots.length

        ? lots
            .map(
              function (
                lot,
                index
              ) {

                return renderLot(
                  product,
                  lot,
                  index
                );

              }
            )
            .join("")

        : `
            <div class="fresh-lots-empty">

              <strong>
                Сроки пока не добавлены
              </strong>

              <span>
                Добавьте партии товара
                по сроку годности.
              </span>

            </div>
          `;


    return `
      <div
        class="fresh-lots-panel"
        data-fresh-product-id="${escapeHTML(
          product.id
        )}"
      >

        <div class="fresh-lots-header">

          <div>

            <span class="fresh-lots-kicker">
              Fresh · сроки годности
            </span>

            <strong>
              Распределение остатка по партиям
            </strong>

            <small>
              Укажите срок и количество товара
              по каждой партии.
            </small>

          </div>


          <button
            class="fresh-lot-add"
            type="button"
            data-fresh-lot-add
          >
            ＋ Добавить срок
          </button>

        </div>


        <div
          class="fresh-lots-list"
          data-fresh-lots-list
        >
          ${lotsHTML}
        </div>


        <div class="fresh-lots-summary">

          <div>

            <span>
              Фактический остаток
            </span>

            <strong>
              ${escapeHTML(
                formatNumber(
                  allocation.actual
                )
              )}
              ${escapeHTML(
                product.iiko_unit
              )}
            </strong>

          </div>


          <div>

            <span>
              По срокам
            </span>

            <strong>
              ${escapeHTML(
                formatNumber(
                  allocation.allocated
                )
              )}
              ${escapeHTML(
                product.iiko_unit
              )}
            </strong>

          </div>


          <div
            class="
              fresh-lots-validation
              is-${escapeHTML(
                allocation.type
              )}
            "
            data-fresh-validation
          >

            <span>
              Проверка
            </span>

            <strong>
              ${escapeHTML(
                allocation.text
              )}
            </strong>

          </div>

        </div>

      </div>
    `;

  }


  function renderProductPanel(
    productId
  ) {

    if (!context?.root) {
      return;
    }


    const product =
      getProduct(
        productId
      );


    if (
      !product ||
      product.category !==
        "fresh"
    ) {

      return;
    }


    const row =
      context.root.querySelector(
        `[data-stock-row="${product.id}"]`
      );


    if (!row) {
      return;
    }


    let extraRow =
      context.root.querySelector(
        `[data-fresh-lots-row="${product.id}"]`
      );


    if (!extraRow) {

      extraRow =
        document.createElement(
          "tr"
        );


      extraRow.className =
        "fresh-lots-row";


      extraRow.dataset
        .freshLotsRow =
        product.id;


      extraRow.innerHTML = `
        <td colspan="6"></td>
      `;


      row.insertAdjacentElement(
        "afterend",
        extraRow
      );

    }


    const cell =
      extraRow.querySelector(
        "td"
      );


    if (cell) {

      cell.innerHTML =
        renderFreshPanel(
          product
        );

    }

  }


  /* =====================================================
     AFTER MAIN RENDER
  ===================================================== */

  function afterRender() {

    if (!context?.root) {
      return;
    }


    context.root
      .querySelectorAll(
        "[data-fresh-lots-row]"
      )
      .forEach(
        function (row) {

          row.remove();

        }
      );


    getFreshProducts()
      .forEach(
        function (product) {

          const stockRow =
            context.root.querySelector(
              `[data-stock-row="${product.id}"]`
            );


          if (!stockRow) {
            return;
          }


          renderProductPanel(
            product.id
          );

        }
      );

  }


  /* =====================================================
     LOAD FROM SUPABASE
  ===================================================== */

  async function loadLots() {

    const weeklyOrder =
      getWeeklyOrder();


    if (!weeklyOrder?.id) {

      lotsByProduct =
        new Map();

      return;

    }


    const {
      data,
      error
    } =
      await supabaseClient

        .from(
          "weekly_order_stock_lots"
        )

        .select(`
          id,
          weekly_order_id,
          product_id,
          expiry_date,
          case_qty,
          slv_qty,
          pcs_qty,
          base_qty,
          created_at,
          updated_at
        `)

        .eq(
          "weekly_order_id",
          weeklyOrder.id
        )

        .order(
          "expiry_date",
          {
            ascending: true
          }
        );


    if (error) {
      throw error;
    }


    lotsByProduct =
      new Map();


    getFreshProducts()
      .forEach(
        function (product) {

          lotsByProduct.set(
            product.id,
            []
          );

        }
      );


    (data || [])
      .forEach(
        function (item) {

          const product =
            getProduct(
              item.product_id
            );


          if (
            !product ||
            product.category !==
              "fresh"
          ) {

            return;
          }


          const lots =
            getLots(
              item.product_id
            );


          lots.push({

            client_id:
              `db-${item.id}`,

            id:
              item.id,

            expiry_date:
              item.expiry_date ||
              "",

            case_qty:
              item.case_qty,

            slv_qty:
              item.slv_qty,

            pcs_qty:
              item.pcs_qty,

            base_qty:
              Number(
                item.base_qty || 0
              ),

            save_state:
              "saved",

            save_error:
              null

          });

        }
      );

  }


  /* =====================================================
     SAVE
  ===================================================== */

  function clearSaveTimer(
    clientId
  ) {

    const timer =
      saveTimers.get(
        clientId
      );


    if (timer) {

      clearTimeout(
        timer
      );


      saveTimers.delete(
        clientId
      );

    }

  }


  function scheduleSave(
    productId,
    clientId
  ) {

    clearSaveTimer(
      clientId
    );


    const lot =
      findLot(
        productId,
        clientId
      );


    if (!lot) {
      return;
    }


    /*
      expiry_date міндетті.
      Дата жоқ болса пока local ғана.
    */

    if (!lot.expiry_date) {

      lot.save_state =
        "new";


      lot.save_error =
        null;


      renderProductPanel(
        productId
      );


      return;

    }


    lot.save_state =
      "dirty";


    lot.save_error =
      null;


    const timer =
      window.setTimeout(
        function () {

          saveTimers.delete(
            clientId
          );


          saveLot(
            productId,
            clientId
          ).catch(
            function () {
              /* error already rendered */
            }
          );

        },
        SAVE_DELAY
      );


    saveTimers.set(
      clientId,
      timer
    );

  }


  async function saveLot(
    productId,
    clientId
  ) {

    const weeklyOrder =
      getWeeklyOrder();


    const product =
      getProduct(
        productId
      );


    const lot =
      findLot(
        productId,
        clientId
      );


    if (
      !weeklyOrder?.id ||
      !product ||
      !lot
    ) {

      return;
    }


    if (!lot.expiry_date) {

      lot.save_state =
        "new";


      renderProductPanel(
        productId
      );


      return;
    }


    if (
      hasDuplicateExpiry(
        productId,
        lot
      )
    ) {

      lot.save_state =
        "error";


      lot.save_error =
        "Такой срок уже добавлен";


      renderProductPanel(
        productId
      );


      return;
    }


    clearSaveTimer(
      clientId
    );


    const baseQty =
      calculateLotBaseQty(
        product,
        lot
      );


    lot.base_qty =
      baseQty;


    lot.save_state =
      "saving";


    lot.save_error =
      null;


    renderProductPanel(
      productId
    );


    activeSaves += 1;


    try {

      let savedData;


      /*
        Уже есть запись в DB
      */

      if (lot.id) {

        const {
          data,
          error
        } =
          await supabaseClient

            .from(
              "weekly_order_stock_lots"
            )

            .update({

              expiry_date:
                lot.expiry_date,

              case_qty:
                lot.case_qty,

              slv_qty:
                lot.slv_qty,

              pcs_qty:
                lot.pcs_qty,

              base_qty:
                baseQty,

              updated_at:
                new Date()
                  .toISOString()

            })

            .eq(
              "id",
              lot.id
            )

            .eq(
              "weekly_order_id",
              weeklyOrder.id
            )

            .select()

            .single();


        if (error) {
          throw error;
        }


        savedData =
          data;

      }


      /*
        Новая запись
      */

      else {

        const {
          data,
          error
        } =
          await supabaseClient

            .from(
              "weekly_order_stock_lots"
            )

            .insert({

              weekly_order_id:
                weeklyOrder.id,

              product_id:
                productId,

              expiry_date:
                lot.expiry_date,

              case_qty:
                lot.case_qty,

              slv_qty:
                lot.slv_qty,

              pcs_qty:
                lot.pcs_qty,

              base_qty:
                baseQty

            })

            .select()

            .single();


        if (error) {
          throw error;
        }


        savedData =
          data;

      }


      /*
        Local lot енді DB row-мен байланысады.
      */

      lot.id =
        savedData.id;


      lot.base_qty =
        Number(
          savedData.base_qty || 0
        );


      lot.save_state =
        "saved";


      lot.save_error =
        null;


      renderProductPanel(
        productId
      );


    } catch (error) {

      console.error(
        "Fresh lot save:",
        error
      );


      lot.save_state =
        "error";


      lot.save_error =

        error.code ===
          "23505"

          ? "Такой срок уже существует"

          : (
              error.message ||
              "Ошибка сохранения"
            );


      renderProductPanel(
        productId
      );


      throw error;

    } finally {

      activeSaves -= 1;

    }

  }


  async function saveImmediately(
    productId,
    clientId
  ) {

    clearSaveTimer(
      clientId
    );


    return saveLot(
      productId,
      clientId
    );

  }


  async function flushAllSaves() {

    const jobs = [];


    saveTimers.forEach(
      function (
        timer,
        clientId
      ) {

        clearTimeout(
          timer
        );


        let foundProductId =
          null;


        lotsByProduct.forEach(
          function (
            lots,
            productId
          ) {

            if (
              lots.some(
                function (lot) {

                  return (
                    lot.client_id ===
                    clientId
                  );

                }
              )
            ) {

              foundProductId =
                productId;

            }

          }
        );


        if (foundProductId) {

          jobs.push(
            saveLot(
              foundProductId,
              clientId
            )
          );

        }

      }
    );


    saveTimers.clear();


    if (jobs.length) {

      await Promise.all(
        jobs
      );

    }


    /*
      Егер saving query әлі жүріп жатса,
      оны күтеміз.
    */

    while (
      activeSaves > 0
    ) {

      await new Promise(
        function (resolve) {

          window.setTimeout(
            resolve,
            30
          );

        }
      );

    }

  }


  /* =====================================================
     DELETE
  ===================================================== */

  async function removeLot(
    productId,
    clientId
  ) {

    const lot =
      findLot(
        productId,
        clientId
      );


    if (!lot) {
      return;
    }


    clearSaveTimer(
      clientId
    );


    /*
      DB-де жоқ болса —
      жай local-дан өшіреміз.
    */

    if (!lot.id) {

      lotsByProduct.set(

        productId,

        getLots(
          productId
        ).filter(
          function (item) {

            return (
              item.client_id !==
              clientId
            );

          }
        )

      );


      renderProductPanel(
        productId
      );


      context
        ?.onValidationChange
        ?.();


      return;

    }


    lot.save_state =
      "saving";


    lot.save_error =
      null;


    renderProductPanel(
      productId
    );


    try {

      const weeklyOrder =
        getWeeklyOrder();


      const {
        error
      } =
        await supabaseClient

          .from(
            "weekly_order_stock_lots"
          )

          .delete()

          .eq(
            "id",
            lot.id
          )

          .eq(
            "weekly_order_id",
            weeklyOrder.id
          );


      if (error) {
        throw error;
      }


      lotsByProduct.set(

        productId,

        getLots(
          productId
        ).filter(
          function (item) {

            return (
              item.client_id !==
              clientId
            );

          }
        )

      );


      renderProductPanel(
        productId
      );


      context
        ?.onValidationChange
        ?.();


    } catch (error) {

      console.error(
        "Fresh lot delete:",
        error
      );


      lot.save_state =
        "error";


      lot.save_error =
        error.message ||
        "Ошибка удаления";


      renderProductPanel(
        productId
      );

    }

  }


  /* =====================================================
     ADD
  ===================================================== */

  function addLot(productId) {

    const product =
      getProduct(
        productId
      );


    if (
      !product ||
      product.category !==
        "fresh"
    ) {

      return;
    }


    getLots(
      productId
    ).push(
      createEmptyLot()
    );


    renderProductPanel(
      productId
    );


    context
      ?.onValidationChange
      ?.();

  }


  /* =====================================================
     UPDATE LOCAL LOT
  ===================================================== */

  function updateLot(
    productId,
    clientId,
    field,
    value
  ) {

    const lot =
      findLot(
        productId,
        clientId
      );


    if (!lot) {
      return;
    }


    if (
      field ===
      "expiry_date"
    ) {

      lot.expiry_date =
        value || "";

    }

    else {

      lot[field] =
        toNullableNumber(
          value
        );

    }


    lot.save_state =
      lot.expiry_date
        ? "dirty"
        : "new";


    lot.save_error =
      null;


    scheduleSave(
      productId,
      clientId
    );


    renderProductPanel(
      productId
    );


    context
      ?.onValidationChange
      ?.();

  }


  /* =====================================================
     MAIN STOCK CHANGE
  ===================================================== */

  function onStockChanged(
    productId
  ) {

    const product =
      getProduct(
        productId
      );


    if (
      !product ||
      product.category !==
        "fresh"
    ) {

      return;
    }


    renderProductPanel(
      productId
    );


    context
      ?.onValidationChange
      ?.();

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {

    if (
      !context?.root ||
      boundRoot ===
        context.root
    ) {

      return;
    }


    boundRoot =
      context.root;


    /*
      ADD / DELETE
    */

    boundRoot.addEventListener(
      "click",
      function (event) {

        const addButton =
          event.target.closest(
            "[data-fresh-lot-add]"
          );


        if (addButton) {

          const panel =
            addButton.closest(
              "[data-fresh-product-id]"
            );


          if (panel) {

            addLot(
              panel.dataset
                .freshProductId
            );

          }


          return;

        }


        const removeButton =
          event.target.closest(
            "[data-fresh-lot-remove]"
          );


        if (removeButton) {

          const panel =
            removeButton.closest(
              "[data-fresh-product-id]"
            );


          const lotElement =
            removeButton.closest(
              "[data-fresh-lot-id]"
            );


          if (
            panel &&
            lotElement
          ) {

            removeLot(

              panel.dataset
                .freshProductId,

              lotElement.dataset
                .freshLotId

            );

          }

        }

      }
    );


    /*
      INPUT
    */

    boundRoot.addEventListener(
      "input",
      function (event) {

        const input =
          event.target.closest(
            "[data-fresh-lot-input]"
          );


        if (!input) {
          return;
        }


        /*
          Date input-ты change event
          арқылы сақтаймыз.
        */

        if (
          input.dataset
            .freshLotInput ===
            "expiry_date"
        ) {

          return;

        }


        const panel =
          input.closest(
            "[data-fresh-product-id]"
          );


        const lotElement =
          input.closest(
            "[data-fresh-lot-id]"
          );


        if (
          !panel ||
          !lotElement
        ) {

          return;
        }


        updateLot(

          panel.dataset
            .freshProductId,

          lotElement.dataset
            .freshLotId,

          input.dataset
            .freshLotInput,

          input.value

        );

      }
    );


    /*
      DATE
    */

    boundRoot.addEventListener(
      "change",
      function (event) {

        const input =
          event.target.closest(
            `[data-fresh-lot-input="expiry_date"]`
          );


        if (!input) {
          return;
        }


        const panel =
          input.closest(
            "[data-fresh-product-id]"
          );


        const lotElement =
          input.closest(
            "[data-fresh-lot-id]"
          );


        if (
          !panel ||
          !lotElement
        ) {

          return;
        }


        updateLot(

          panel.dataset
            .freshProductId,

          lotElement.dataset
            .freshLotId,

          "expiry_date",

          input.value

        );


        saveImmediately(

          panel.dataset
            .freshProductId,

          lotElement.dataset
            .freshLotId

        ).catch(
          function () {
            /* error already displayed */
          }
        );

      }
    );


    /*
      Ушли с input —
      сразу сохраняем.
    */

    boundRoot.addEventListener(
      "focusout",
      function (event) {

        const input =
          event.target.closest(
            "[data-fresh-lot-input]"
          );


        if (!input) {
          return;
        }


        const panel =
          input.closest(
            "[data-fresh-product-id]"
          );


        const lotElement =
          input.closest(
            "[data-fresh-lot-id]"
          );


        if (
          !panel ||
          !lotElement
        ) {

          return;
        }


        const lot =
          findLot(

            panel.dataset
              .freshProductId,

            lotElement.dataset
              .freshLotId

          );


        if (
          !lot ||
          !lot.expiry_date
        ) {

          return;
        }


        saveImmediately(

          panel.dataset
            .freshProductId,

          lotElement.dataset
            .freshLotId

        ).catch(
          function () {
            /* error already displayed */
          }
        );

      }
    );

  }


  /* =====================================================
     REFRESH
  ===================================================== */

  async function refresh() {

    if (!context) {
      return;
    }


    const weeklyOrder =
      getWeeklyOrder();


    const weeklyOrderId =
      weeklyOrder?.id ||
      null;


    const freshProducts =
      getFreshProducts();


    /*
      Егер басқа ПН/ЧТ order ашылса —
      алдыңғы save-тарды аяқтаймыз.
    */

    if (
      currentWeeklyOrderId &&
      currentWeeklyOrderId !==
        weeklyOrderId
    ) {

      await flushAllSaves();

    }


    currentWeeklyOrderId =
      weeklyOrderId;


    /*
      DB-дан сроктарды қайта аламыз.
    */

    await loadLots();


    state.weeklyOrderId =
      weeklyOrderId;


    state.freshProductsCount =
      freshProducts.length;


    /*
      Fresh validation:
      барлық Fresh товардың
      фактісі сроктар соммасына
      сәйкес болуы керек.
    */

    state.ready =
      calculateReadyState();


    console.log(
      "[Fresh Lots] loaded",
      {
        weekly_order_id:
          state.weeklyOrderId,

        fresh_products:
          state.freshProductsCount
      }
    );


    afterRender();


    context
      ?.onValidationChange
      ?.();

  }


  /* =====================================================
   VALIDATION
===================================================== */

function lotHasQuantity(
  product,
  lot
) {

  return (
    calculateLotBaseQty(
      product,
      lot
    ) > EPSILON
  );

}


function productIsReady(
  product
) {

  if (
    !product ||
    product.category !==
      "fresh"
  ) {

    return true;

  }


  const actual =
    getActualBaseQty(
      product
    );


  const allocated =
    getAllocatedBaseQty(
      product
    );


  const lots =
    getLots(
      product.id
    );


  /*
    1. Егер партияда товар саны бар болса,
       срок міндетті түрде болуы керек.
  */

  const hasLotWithoutExpiry =
    lots.some(
      function (lot) {

        return (
          lotHasQuantity(
            product,
            lot
          ) &&
          !lot.expiry_date
        );

      }
    );


  if (hasLotWithoutExpiry) {

    return false;

  }


  /*
    2. Бір товарда бірдей срок
       екі рет болмауы керек.
  */

  const expiryDates =
    lots

      .filter(
        function (lot) {

          return (
            lot.expiry_date &&
            lotHasQuantity(
              product,
              lot
            )
          );

        }
      )

      .map(
        function (lot) {

          return lot.expiry_date;

        }
      );


  const uniqueExpiryDates =
    new Set(
      expiryDates
    );


  if (
    uniqueExpiryDates.size !==
    expiryDates.length
  ) {

    return false;

  }


  /*
    3. Фактический остаток
       сроктар суммасына тең болуы керек.
  */

  if (
    Math.abs(
      actual -
      allocated
    ) >
    EPSILON
  ) {

    return false;

  }


  return true;

}


function calculateReadyState() {

  const freshProducts =
    getFreshProducts();


  /*
    Fresh товар жоқ ресторан болса,
    блоктамаймыз.
  */

  if (!freshProducts.length) {

    return true;

  }


  return freshProducts.every(
    function (product) {

      return productIsReady(
        product
      );

    }
  );

}


/* =====================================================
   VALIDATION API
===================================================== */

function isReady() {

  state.ready =
    calculateReadyState();


  return state.ready;

}


  function getDebugState() {

    const lots = {};


    lotsByProduct.forEach(
      function (
        value,
        key
      ) {

        lots[key] =
          value.map(
            function (lot) {

              return {
                ...lot
              };

            }
          );

      }
    );


    return {
      ...state,
      activeSaves,
      lots
    };

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(
    options = {}
  ) {

    if (!options.root) {

      throw new Error(
        "Fresh Lots: root не передан."
      );

    }


    if (
      typeof options.getWeeklyOrder !==
        "function"
    ) {

      throw new Error(
        "Fresh Lots: getWeeklyOrder не передан."
      );

    }


    if (
      typeof options.getProducts !==
        "function"
    ) {

      throw new Error(
        "Fresh Lots: getProducts не передан."
      );

    }


    context = {
      ...options
    };


    boundRoot =
      null;


    currentWeeklyOrderId =
      null;


    lotsByProduct =
      new Map();


    saveTimers =
      new Map();


    activeSaves =
      0;


    state = {
      initialized: true,
      ready: true,
      weeklyOrderId: null,
      freshProductsCount: 0
    };


    bindEvents();


    await refresh();

  }


  /* =====================================================
     PUBLIC
  ===================================================== */

  window.OrderStep1FreshLots = {

    init,

    refresh,

    afterRender,

    onStockChanged,

    isReady,

    flushAllSaves,

    getDebugState

  };

})();
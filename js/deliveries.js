/* =====================================================
   I’M | ЗАКАЗ
   ПОСТАВКИ

   - список поставок
   - создание manual поставки
   - состав поставки
   - case / slv / ед.
   - autosave
===================================================== */

(function () {
  "use strict";


  const SAVE_DELAY = 500;


  /* =====================================================
     MAIN STATE
  ===================================================== */

  let root = null;

  let restaurantId = null;

  let userId = null;

  let deliveries = [];

  let currentFilter =
    "all";

  let currentDateFrom =
    "";

  let currentDateTo =
    "";

  let pendingDeleteDelivery =
    null;

  let deleteInProgress =
    false;


  /* =====================================================
     DETAIL STATE
  ===================================================== */

  let products = [];

  let currentDelivery =
    null;

  let deliveryItems =
    new Map();

  let detailSearch =
    "";

  let detailSaveTimers =
    new Map();

  let detailDirtyProducts =
    new Set();

  let detailEditVersions =
    new Map();

  let detailActiveSaves =
    0;


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


  function formatInputValue(value) {

    if (
      value === null ||
      value === undefined
    ) {

      return "";

    }


    return String(value);

  }


  function formatDate(dateString) {

    if (!dateString) {
      return "—";
    }


    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }
    ).format(
      new Date(
        `${dateString}T00:00:00`
      )
    );

  }


  function getWeekday(dateString) {

    if (!dateString) {
      return "";
    }


    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        weekday: "long"
      }
    ).format(
      new Date(
        `${dateString}T00:00:00`
      )
    );

  }


  function getGroupName(group) {

    return (
      group === "cola"
        ? "Cola"
        : "Основные товары"
    );

  }


  function getStatusName(status) {

    const names = {

      expected:
        "Ожидается",

      arrived:
        "Получена",

      cancelled:
        "Отменена"

    };


    return (
      names[status] ||
      status
    );

  }


  function getSourceName(source) {

    return (
      source === "system"
        ? "Система"
        : "Вручную"
    );

  }


  /* =====================================================
     USER CONTEXT
  ===================================================== */

  async function loadContext() {

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
      error
    } =
      await supabaseClient

        .from(
          "profiles"
        )

        .select(
          "restaurant_id"
        )

        .eq(
          "id",
          userId
        )

        .single();


    if (error) {
      throw error;
    }


    restaurantId =
      profile?.restaurant_id;


    if (!restaurantId) {

      throw new Error(
        "У пользователя не указан ресторан."
      );

    }

  }


  /* =====================================================
     LOAD DELIVERIES
  ===================================================== */

  async function loadDeliveries() {

    const {
      data,
      error
    } =
      await supabaseClient

        .from(
          "order_deliveries"
        )

        .select(`
          id,
          restaurant_id,
          delivery_date,
          delivery_group,
          source,
          source_weekly_order_id,
          source_order_day,
          status,
          note,
          created_at,
          updated_at
        `)

        .eq(
          "restaurant_id",
          restaurantId
        )

        .order(
          "delivery_date",
          {
            ascending: true
          }
        );


    if (error) {
      throw error;
    }


    deliveries =
      data || [];

  }


  /* =====================================================
     SUMMARY
  ===================================================== */

  function updateSummary() {

    const expected =
      deliveries.filter(
        function (delivery) {

          return (
            delivery.status ===
            "expected"
          );

        }
      );


    const countElement =
      root.querySelector(
        "#delivery-expected-count"
      );


    if (countElement) {

      countElement.textContent =
        String(
          expected.length
        );

    }


    const next =
      expected[0] ||
      null;


    const dateElement =
      root.querySelector(
        "#delivery-next-date"
      );


    const descriptionElement =
      root.querySelector(
        "#delivery-next-description"
      );


    if (!next) {

      if (dateElement) {

        dateElement.textContent =
          "Нет";

      }


      if (descriptionElement) {

        descriptionElement.textContent =
          "Ожидаемых поставок нет";

      }


      return;

    }


    if (dateElement) {

      dateElement.textContent =
        formatDate(
          next.delivery_date
        );

    }


    if (descriptionElement) {

      descriptionElement.textContent =
        `${
          getGroupName(
            next.delivery_group
          )
        } · ${
          getWeekday(
            next.delivery_date
          )
        }`;

    }

  }


  /* =====================================================
     RENDER DELIVERIES
  ===================================================== */

  function renderDeliveries() {

    const list =
      root.querySelector(
        "#deliveries-list"
      );


    if (!list) {
      return;
    }


    const filtered =
      deliveries.filter(
        function (delivery) {

          const statusMatches =
            currentFilter ===
              "all" ||
            delivery.status ===
              currentFilter;


          const fromMatches =
            !currentDateFrom ||
            delivery.delivery_date >=
              currentDateFrom;


          const toMatches =
            !currentDateTo ||
            delivery.delivery_date <=
              currentDateTo;


          return (
            statusMatches &&
            fromMatches &&
            toMatches
          );

        }
      );


    if (!filtered.length) {

      list.innerHTML = `
        <div class="deliveries-empty">
          По выбранному фильтру поставок нет.
        </div>
      `;


      updateSummary();

      return;

    }


    list.innerHTML =
      filtered
        .map(
          function (delivery) {

            return `
              <article
                class="delivery-card"
                data-delivery-id="${escapeHTML(
                  delivery.id
                )}"
              >

                <div class="delivery-date">

                  <strong>
                    ${escapeHTML(
                      formatDate(
                        delivery.delivery_date
                      )
                    )}
                  </strong>

                  <span>
                    ${escapeHTML(
                      getWeekday(
                        delivery.delivery_date
                      )
                    )}
                  </span>

                </div>


                <div class="delivery-main">

                  <strong>
                    ${escapeHTML(
                      getGroupName(
                        delivery.delivery_group
                      )
                    )}
                  </strong>

                  <span>
                    ${
                      delivery.note
                        ? escapeHTML(
                            delivery.note
                          )
                        : "Без примечания"
                    }
                  </span>

                </div>


                <div>

                  <span
                    class="
                      delivery-group-badge
                      ${escapeHTML(
                        delivery.delivery_group
                      )}
                    "
                  >
                    ${escapeHTML(
                      delivery.delivery_group ===
                        "cola"
                        ? "COLA"
                        : "GENERAL"
                    )}
                  </span>

                </div>


                <div>

                  <span
                    class="
                      delivery-status-badge
                      ${escapeHTML(
                        delivery.status
                      )}
                    "
                  >
                    ${escapeHTML(
                      getStatusName(
                        delivery.status
                      )
                    )}
                  </span>

                </div>


                <div class="delivery-action-cell">

                    <span class="delivery-source-badge">

                        ${escapeHTML(
                        getSourceName(
                            delivery.source
                        )
                        )}

                    </span>


                    <button
                        class="delivery-open-button"
                        type="button"
                        data-delivery-open="${escapeHTML(
                        delivery.id
                        )}"
                    >
                        Открыть
                    </button>


                    <button
                        class="delivery-sheet-button"
                        type="button"
                        data-delivery-sheet="${escapeHTML(
                        delivery.id
                        )}"
                    >
                        Лист поставки
                    </button>


                    ${
                      delivery.status ===
                        "expected"
                        ? `
                          <button
                            class="delivery-delete-button"
                            type="button"
                            data-delivery-delete="${escapeHTML(
                              delivery.id
                            )}"
                            title="Удалить поставку"
                            aria-label="Удалить поставку ${escapeHTML(
                              formatDate(
                                delivery.delivery_date
                              )
                            )}"
                          >
                            ×
                          </button>
                        `
                        : ""
                    }

                    </div>

              </article>
            `;

          }
        )
        .join("");


    updateSummary();

  }


  /* =====================================================
     DELETE DELIVERY
  ===================================================== */

  function openDeleteModal(
    deliveryId
  ) {

    const delivery =
      deliveries.find(
        function (item) {

          return (
            item.id ===
            deliveryId
          );

        }
      );


    if (
      !delivery ||
      delivery.status !==
        "expected"
    ) {
      return;
    }


    const modal =
      root.querySelector(
        "#delivery-delete-modal"
      );


    if (!modal) {
      return;
    }


    pendingDeleteDelivery =
      delivery;


    const dateElement =
      root.querySelector(
        "#delivery-delete-date"
      );


    const groupElement =
      root.querySelector(
        "#delivery-delete-group"
      );


    const sourceElement =
      root.querySelector(
        "#delivery-delete-source"
      );


    const warningElement =
      root.querySelector(
        "#delivery-delete-warning"
      );


    const messageElement =
      root.querySelector(
        "#delivery-delete-message"
      );


    const confirmButton =
      root.querySelector(
        "#delivery-delete-confirm"
      );


    if (dateElement) {

      dateElement.textContent =
        formatDate(
          delivery.delivery_date
        );

    }


    if (groupElement) {

      groupElement.textContent =
        getGroupName(
          delivery.delivery_group
        );

    }


    if (sourceElement) {

      sourceElement.textContent =
        getSourceName(
          delivery.source
        );

    }


    if (warningElement) {

      warningElement.hidden =
        delivery.source !==
        "system";

    }


    if (messageElement) {
      messageElement.textContent = "";
    }


    if (confirmButton) {

      confirmButton.disabled =
        false;

      confirmButton.textContent =
        "Удалить поставку";

    }


    modal.classList.add(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "false"
    );


    window.setTimeout(
      function () {

        confirmButton?.focus();

      },
      0
    );

  }


  function closeDeleteModal() {

    if (deleteInProgress) {
      return;
    }


    const modal =
      root.querySelector(
        "#delivery-delete-modal"
      );


    if (!modal) {
      return;
    }


    modal.classList.remove(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "true"
    );


    pendingDeleteDelivery =
      null;

  }


  async function deleteDelivery(
    deliveryId,
    button
  ) {

    const delivery =
      deliveries.find(
        function (item) {

          return (
            item.id ===
            deliveryId
          );

        }
      );


    if (!delivery) {
      return;
    }


    if (
      delivery.status !==
      "expected"
    ) {

      return;

    }


    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Удаление...";

    }


    deleteInProgress =
      true;


    try {

      const {
        data: deletedDirectly,
        error: directDeleteError
      } =
        await supabaseClient

          .from(
            "order_deliveries"
          )

          .delete()

          .eq(
            "id",
            delivery.id
          )

          .eq(
            "restaurant_id",
            restaurantId
          )

          .eq(
            "status",
            "expected"
          )

          .select(
            "id"
          );


      if (
        directDeleteError &&
        directDeleteError.code !==
          "23503"
      ) {

        throw directDeleteError;

      }


      if (
        !directDeleteError &&
        !deletedDirectly?.length
      ) {

        throw new Error(
          "Поставка не удалена. Возможно, ее статус уже изменился."
        );

      }


      if (directDeleteError) {

        const {
          error: itemsError
        } =
          await supabaseClient

            .from(
              "order_delivery_items"
            )

            .delete()

            .eq(
              "delivery_id",
              delivery.id
            );


        if (itemsError) {
          throw itemsError;
        }


        const {
          data: deletedAfterItems,
          error: deliveryError
        } =
          await supabaseClient

            .from(
              "order_deliveries"
            )

            .delete()

            .eq(
              "id",
              delivery.id
            )

            .eq(
              "restaurant_id",
              restaurantId
            )

            .eq(
              "status",
              "expected"
            )

            .select(
              "id"
            );


        if (deliveryError) {
          throw deliveryError;
        }


        if (!deletedAfterItems?.length) {

          throw new Error(
            "Поставка не удалена. Возможно, ее статус уже изменился."
          );

        }

      }


      deliveries =
        deliveries.filter(
          function (item) {

            return (
              item.id !==
              delivery.id
            );

          }
        );


      renderDeliveries();


      deleteInProgress =
        false;


      closeDeleteModal();


    } catch (error) {

      console.error(
        "Delete delivery:",
        error
      );


      deleteInProgress =
        false;


      const messageElement =
        root.querySelector(
          "#delivery-delete-message"
        );


      if (messageElement) {

        messageElement.textContent =
          error.message ||
          "Не удалось удалить поставку.";

      }


      if (button) {

        button.disabled =
          false;

        button.textContent =
          "Удалить поставку";

      }

    }

  }


  /* =====================================================
     CREATE MODAL
  ===================================================== */

  function openCreateModal() {

    const modal =
      root.querySelector(
        "#delivery-modal"
      );


    const form =
      root.querySelector(
        "#delivery-form"
      );


    if (
      !modal ||
      !form
    ) {
      return;
    }


    form.reset();


    const message =
      root.querySelector(
        "#delivery-form-message"
      );


    if (message) {

      message.textContent =
        "";

    }


    modal.classList.add(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "false"
    );

  }


  function closeCreateModal() {

    const modal =
      root.querySelector(
        "#delivery-modal"
      );


    if (!modal) {
      return;
    }


    modal.classList.remove(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "true"
    );

  }


  /* =====================================================
     CREATE DELIVERY
  ===================================================== */

  async function createDelivery(event) {

    event.preventDefault();


    const date =
      root
        .querySelector(
          "#delivery-date"
        )
        ?.value;


    const group =
      root
        .querySelector(
          "#delivery-group"
        )
        ?.value;


    const note =
      root
        .querySelector(
          "#delivery-note"
        )
        ?.value
        ?.trim() ||
      null;


    const message =
      root.querySelector(
        "#delivery-form-message"
      );


    if (
      !date ||
      !group
    ) {

      if (message) {

        message.textContent =
          "Укажите дату и группу поставки.";

      }


      return;

    }


    const button =
      root.querySelector(
        "#delivery-save-button"
      );


    if (button) {

      button.disabled =
        true;

      button.textContent =
        "Создание...";

    }


    try {

      const {
        error
      } =
        await supabaseClient

          .from(
            "order_deliveries"
          )

          .insert({

            restaurant_id:
              restaurantId,

            delivery_date:
              date,

            delivery_group:
              group,

            source:
              "manual",

            status:
              "expected",

            note:
              note,

            created_by:
              userId

          });


      if (error) {
        throw error;
      }


      closeCreateModal();


      await loadDeliveries();


      renderDeliveries();


    } catch (error) {

      console.error(
        "Create delivery:",
        error
      );


      if (message) {

        message.textContent =

          error.code === "23505"

            ? "Поставка этой группы на эту дату уже существует."

            : (
                error.message ||
                "Не удалось создать поставку."
              );

      }

    } finally {

      if (button) {

        button.disabled =
          false;

        button.textContent =
          "Создать поставку";

      }

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

        .from(
          "order_products"
        )

        .select(`
          id,
          category,
          name,
          iiko_code,
          iiko_name,
          iiko_unit,
          case_to_base,
          slv_to_base,
          pcs_to_base,
          delivery_group,
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
        )

        .order(
          "category"
        )

        .order(
          "sort_order"
        )

        .order(
          "name"
        );


    if (error) {
      throw error;
    }


    products =
      data || [];

  }


  /* =====================================================
     DETAIL ITEMS
  ===================================================== */

  function getDeliveryItem(productId) {

    return (
      deliveryItems.get(
        productId
      ) ||
      {
        id: null,

        delivery_id:
          currentDelivery?.id ||
          null,

        product_id:
          productId,

        case_qty:
          null,

        slv_qty:
          null,

        pcs_qty:
          null,

        base_qty:
          0
      }
    );

  }


  function hasAnyQuantity(record) {

    return (

      record.case_qty !== null ||

      record.slv_qty !== null ||

      record.pcs_qty !== null

    );

  }


  function calculateBaseQty(
    product,
    record
  ) {

    const caseQty =
      Number(
        record.case_qty || 0
      );


    const slvQty =
      Number(
        record.slv_qty || 0
      );


    const pcsQty =
      Number(
        record.pcs_qty || 0
      );


    const caseSize =
      Number(
        product.case_to_base || 0
      );


    const slvSize =
      Number(
        product.slv_to_base || 0
      );


    const pcsSize =
      Number(
        product.pcs_to_base || 0
      );


    return (

      caseQty * caseSize +

      slvQty * slvSize +

      pcsQty * pcsSize

    );

  }


  async function loadDeliveryItems() {

    deliveryItems =
      new Map();


    if (!currentDelivery) {
      return;
    }


    const {
      data,
      error
    } =
      await supabaseClient

        .from(
          "order_delivery_items"
        )

        .select(`
          id,
          delivery_id,
          product_id,
          case_qty,
          slv_qty,
          pcs_qty,
          base_qty,
          created_at,
          updated_at
        `)

        .eq(
          "delivery_id",
          currentDelivery.id
        );


    if (error) {
      throw error;
    }


    (data || [])
      .forEach(
        function (item) {

          deliveryItems.set(
            item.product_id,
            item
          );

        }
      );

  }


  /* =====================================================
     DETAIL HEADER
  ===================================================== */

  function renderDetailHeader() {

    if (!currentDelivery) {
      return;
    }


    const title =
      root.querySelector(
        "#delivery-detail-title"
      );


    if (title) {

      title.textContent =
        `Поставка ${formatDate(
          currentDelivery.delivery_date
        )}`;

    }


    const group =
      root.querySelector(
        "#delivery-detail-group"
      );


    if (group) {

      group.textContent =
        getGroupName(
          currentDelivery.delivery_group
        );

    }


    const source =
      root.querySelector(
        "#delivery-detail-source"
      );


    if (source) {

      source.textContent =
        `Источник: ${
          getSourceName(
            currentDelivery.source
          )
        }`;

    }


    const status =
      root.querySelector(
        "#delivery-detail-status"
      );


    if (status) {

      status.textContent =
        getStatusName(
          currentDelivery.status
        );

    }

  }


  function setDetailSaveStatus(
    type,
    text
  ) {

    const element =
      root.querySelector(
        "#delivery-detail-save-status"
      );


    if (!element) {
      return;
    }


    element.className =
      "delivery-detail-save-status";


    element.classList.add(
      `is-${type}`
    );


    element.textContent =
      text;

  }


  /* =====================================================
     DETAIL INPUTS
  ===================================================== */

  function renderDetailInput(
    product,
    type,
    coefficient
  ) {

    if (
      coefficient === null ||
      coefficient === undefined
    ) {

      return `
        <td class="delivery-item-input-cell">

          <span class="delivery-item-disabled">
            —
          </span>

        </td>
      `;

    }


    const record =
      getDeliveryItem(
        product.id
      );


    const key =
      `${type}_qty`;


    return `
      <td class="delivery-item-input-cell">

        <input
          class="delivery-item-input"
          type="number"
          min="0"
          step="0.01"
          inputmode="decimal"
          placeholder="0"
          value="${escapeHTML(
            formatInputValue(
              record[key]
            )
          )}"
          data-delivery-item-input
          data-product-id="${escapeHTML(
            product.id
          )}"
          data-count-type="${escapeHTML(
            type
          )}"
        >

      </td>
    `;

  }


  function renderDetailBaseInput(
    product
  ) {

    const record =
      getDeliveryItem(
        product.id
      );


    return `
      <td class="delivery-item-input-cell">

        <div class="delivery-item-unit-wrap">

          <input
            class="delivery-item-input"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            placeholder="0"
            value="${escapeHTML(
              formatInputValue(
                record.pcs_qty
              )
            )}"
            data-delivery-item-input
            data-product-id="${escapeHTML(
              product.id
            )}"
            data-count-type="pcs"
          >

          <span>
            ${escapeHTML(
              product.iiko_unit
            )}
          </span>

        </div>

      </td>
    `;

  }


  /* =====================================================
     DETAIL LIST
  ===================================================== */

  function getDetailProducts() {

    if (!currentDelivery) {
      return [];
    }


    const search =
      detailSearch
        .trim()
        .toLowerCase();


    return products.filter(
      function (product) {

        if (
          product.delivery_group !==
          currentDelivery.delivery_group
        ) {

          return false;

        }


        if (!search) {
          return true;
        }


        const haystack =
          [
            product.name,
            product.iiko_code,
            product.iiko_name,
            product.category
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();


        return haystack.includes(
          search
        );

      }
    );

  }


  function updateFilledCount() {

    const allowedProducts =
      products.filter(
        function (product) {

          return (
            product.delivery_group ===
            currentDelivery?.delivery_group
          );

        }
      );


    const count =
      allowedProducts.filter(
        function (product) {

          return hasAnyQuantity(
            getDeliveryItem(
              product.id
            )
          );

        }
      ).length;


    const element =
      root.querySelector(
        "#delivery-detail-filled-count"
      );


    if (element) {

      element.textContent =
        String(count);

    }

  }


  function renderDetailItems() {

    const tbody =
      root.querySelector(
        "#delivery-items-body"
      );


    if (!tbody) {
      return;
    }


    const detailProducts =
      getDetailProducts();


    if (!detailProducts.length) {

      tbody.innerHTML = `
        <tr>

          <td colspan="6">

            <div class="deliveries-empty">
              Товары не найдены.
            </div>

          </td>

        </tr>
      `;


      updateFilledCount();

      return;

    }


    tbody.innerHTML =
      detailProducts

        .map(
          function (
            product,
            index
          ) {

            const record =
              getDeliveryItem(
                product.id
              );


            const total =
              calculateBaseQty(
                product,
                record
              );


            const hasValue =
              hasAnyQuantity(
                record
              );


            return `
              <tr
                class="
                  delivery-item-row
                  ${
                    hasValue
                      ? "has-value"
                      : ""
                  }
                "
                data-delivery-item-row="${escapeHTML(
                  product.id
                )}"
              >

                <td class="delivery-item-number">
                  ${index + 1}
                </td>


                <td class="delivery-product-name">

                  <strong>
                    ${escapeHTML(
                      product.name
                    )}
                  </strong>


                  <span>

                    IIKO
                    ${escapeHTML(
                      product.iiko_code
                    )}

                    ·

                    ${
                      product.case_to_base !== null
                      &&
                      product.case_to_base !== undefined

                        ? `case ${escapeHTML(
                            formatNumber(
                              product.case_to_base
                            )
                          )}`

                        : "case —"
                    }

                    ·

                    ${
                      product.slv_to_base !== null
                      &&
                      product.slv_to_base !== undefined

                        ? `slv ${escapeHTML(
                            formatNumber(
                              product.slv_to_base
                            )
                          )}`

                        : "slv —"
                    }

                  </span>

                </td>


                ${renderDetailInput(
                  product,
                  "case",
                  product.case_to_base
                )}


                ${renderDetailInput(
                  product,
                  "slv",
                  product.slv_to_base
                )}


                ${renderDetailBaseInput(
                  product
                )}


                <td class="delivery-item-total">

                  <strong
                    data-delivery-item-total="${escapeHTML(
                      product.id
                    )}"
                  >

                    ${escapeHTML(
                      formatNumber(
                        total
                      )
                    )}

                    ${escapeHTML(
                      product.iiko_unit
                    )}

                  </strong>


                  <small
                    data-delivery-item-save="${escapeHTML(
                      product.id
                    )}"
                    class="${
                      hasValue
                        ? "is-saved"
                        : ""
                    }"
                  >

                    ${
                      hasValue
                        ? "Сохранено"
                        : ""
                    }

                  </small>

                </td>

              </tr>
            `;

          }
        )

        .join("");


    updateFilledCount();

  }


  /* =====================================================
     UPDATE LOCAL DETAIL
  ===================================================== */

  function updateDetailLocalCount(
    productId,
    type,
    value
  ) {

    const product =
      products.find(
        function (item) {

          return (
            item.id ===
            productId
          );

        }
      );


    if (!product) {
      return;
    }


    const record = {
      ...getDeliveryItem(
        productId
      )
    };


    record[
      `${type}_qty`
    ] =
      toNullableNumber(
        value
      );


    record.base_qty =
      calculateBaseQty(
        product,
        record
      );


    deliveryItems.set(
      productId,
      record
    );


    const version =
      (
        detailEditVersions.get(
          productId
        ) || 0
      ) + 1;


    detailEditVersions.set(
      productId,
      version
    );


    detailDirtyProducts.add(
      productId
    );


    updateVisibleDetailRow(
      productId
    );


    updateFilledCount();


    scheduleDetailSave(
      productId
    );

  }


  function updateVisibleDetailRow(
    productId
  ) {

    const product =
      products.find(
        function (item) {

          return (
            item.id ===
            productId
          );

        }
      );


    if (!product) {
      return;
    }


    const record =
      getDeliveryItem(
        productId
      );


    const row =
      root.querySelector(
        `[data-delivery-item-row="${productId}"]`
      );


    if (row) {

      row.classList.toggle(
        "has-value",
        hasAnyQuantity(
          record
        )
      );

    }


    const total =
      root.querySelector(
        `[data-delivery-item-total="${productId}"]`
      );


    if (total) {

      total.textContent =
        `${
          formatNumber(
            calculateBaseQty(
              product,
              record
            )
          )
        } ${product.iiko_unit}`;

    }

  }


  /* =====================================================
     DETAIL SAVE
  ===================================================== */

  function scheduleDetailSave(
    productId
  ) {

    const oldTimer =
      detailSaveTimers.get(
        productId
      );


    if (oldTimer) {

      clearTimeout(
        oldTimer
      );

    }


    const timer =
      window.setTimeout(
        function () {

          detailSaveTimers.delete(
            productId
          );


          saveDeliveryItem(
            productId
          ).catch(
            function () {
              /* error already displayed */
            }
          );

        },
        SAVE_DELAY
      );


    detailSaveTimers.set(
      productId,
      timer
    );


    setDetailSaveStatus(
      "saving",
      "Ожидает сохранения..."
    );


    const itemStatus =
      root.querySelector(
        `[data-delivery-item-save="${productId}"]`
      );


    if (itemStatus) {

      itemStatus.className =
        "is-saving";

      itemStatus.textContent =
        "Ожидает...";

    }

  }


  function saveDetailImmediately(
    productId
  ) {

    const timer =
      detailSaveTimers.get(
        productId
      );


    if (timer) {

      clearTimeout(
        timer
      );


      detailSaveTimers.delete(
        productId
      );

    }


    return saveDeliveryItem(
      productId
    );

  }


  async function deleteDeliveryItem(
    productId,
    record,
    version
  ) {

    if (!record.id) {

      deliveryItems.delete(
        productId
      );


      detailDirtyProducts.delete(
        productId
      );


      return;

    }


    const {
      error
    } =
      await supabaseClient

        .from(
          "order_delivery_items"
        )

        .delete()

        .eq(
          "id",
          record.id
        )

        .eq(
          "delivery_id",
          currentDelivery.id
        );


    if (error) {
      throw error;
    }


    const currentVersion =
      detailEditVersions.get(
        productId
      ) || 0;


    if (
      currentVersion ===
      version
    ) {

      deliveryItems.delete(
        productId
      );


      detailDirtyProducts.delete(
        productId
      );

    }

  }


  async function saveDeliveryItem(
    productId
  ) {

    if (!currentDelivery) {
      return;
    }


    const product =
      products.find(
        function (item) {

          return (
            item.id ===
            productId
          );

        }
      );


    if (!product) {
      return;
    }


    const record =
      getDeliveryItem(
        productId
      );


    const version =
      detailEditVersions.get(
        productId
      ) || 0;


    const hasValue =
      hasAnyQuantity(
        record
      );


    detailActiveSaves++;


    setDetailSaveStatus(
      "saving",
      "Сохранение..."
    );


    const itemStatus =
      root.querySelector(
        `[data-delivery-item-save="${productId}"]`
      );


    if (itemStatus) {

      itemStatus.className =
        "is-saving";

      itemStatus.textContent =
        "Сохранение...";

    }


    try {

      /*
        Все поля пустые:
        если запись раньше была —
        удаляем ее из delivery_items.
      */

      if (!hasValue) {

        await deleteDeliveryItem(
          productId,
          record,
          version
        );


        updateVisibleDetailRow(
          productId
        );


        updateFilledCount();


        return;

      }


      const baseQty =
        calculateBaseQty(
          product,
          record
        );


      const payload = {

        delivery_id:
          currentDelivery.id,

        product_id:
          productId,

        case_qty:
          record.case_qty,

        slv_qty:
          record.slv_qty,

        pcs_qty:
          record.pcs_qty,

        base_qty:
          baseQty,

        updated_at:
          new Date()
            .toISOString()

      };


      const {
        data,
        error
      } =
        await supabaseClient

          .from(
            "order_delivery_items"
          )

          .upsert(
            payload,
            {
              onConflict:
                "delivery_id,product_id"
            }
          )

          .select()

          .single();


      if (error) {
        throw error;
      }


      const currentVersion =
        detailEditVersions.get(
          productId
        ) || 0;


      if (
        currentVersion ===
        version
      ) {

        deliveryItems.set(
          productId,
          data
        );


        detailDirtyProducts.delete(
          productId
        );


        updateVisibleDetailRow(
          productId
        );


        updateFilledCount();


        const savedStatus =
          root.querySelector(
            `[data-delivery-item-save="${productId}"]`
          );


        if (savedStatus) {

          savedStatus.className =
            "is-saved";

          savedStatus.textContent =
            "Сохранено";

        }

      }


    } catch (error) {

      console.error(
        "Delivery item save:",
        error
      );


      setDetailSaveStatus(
        "error",
        "Ошибка сохранения"
      );


      const errorStatus =
        root.querySelector(
          `[data-delivery-item-save="${productId}"]`
        );


      if (errorStatus) {

        errorStatus.className =
          "is-error";

        errorStatus.textContent =
          "Ошибка";

      }


      throw error;


    } finally {

      detailActiveSaves--;


      if (
        detailActiveSaves === 0 &&
        detailDirtyProducts.size === 0
      ) {

        setDetailSaveStatus(
          "saved",
          "Все изменения сохранены"
        );

      }

    }

  }


  async function flushDetailSaves() {

    detailSaveTimers.forEach(
      function (timer) {

        clearTimeout(
          timer
        );

      }
    );


    detailSaveTimers.clear();


    const productIds =
      Array.from(
        detailDirtyProducts
      );


    if (productIds.length) {

      await Promise.all(
        productIds.map(
          function (productId) {

            return saveDeliveryItem(
              productId
            );

          }
        )
      );

    }


    while (
      detailActiveSaves > 0
    ) {

      await new Promise(
        function (resolve) {

          window.setTimeout(
            resolve,
            25
          );

        }
      );

    }

  }


  /* =====================================================
     OPEN DETAIL
  ===================================================== */

  async function openDeliveryDetail(
    deliveryId
  ) {

    const delivery =
      deliveries.find(
        function (item) {

          return (
            item.id ===
            deliveryId
          );

        }
      );


    if (!delivery) {
      return;
    }


    const modal =
      root.querySelector(
        "#delivery-detail-modal"
      );


    if (!modal) {
      return;
    }


    currentDelivery =
      delivery;


    detailSearch =
      "";


    detailSaveTimers =
      new Map();


    detailDirtyProducts =
      new Set();


    detailEditVersions =
      new Map();


    detailActiveSaves =
      0;


    const searchInput =
      root.querySelector(
        "#delivery-product-search"
      );


    if (searchInput) {

      searchInput.value =
        "";

    }


    modal.classList.add(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "false"
    );


    renderDetailHeader();


    setDetailSaveStatus(
      "saving",
      "Загрузка..."
    );


    const tbody =
      root.querySelector(
        "#delivery-items-body"
      );


    if (tbody) {

      tbody.innerHTML = `
        <tr>

          <td colspan="6">

            <div class="deliveries-loading">
              Загрузка товаров...
            </div>

          </td>

        </tr>
      `;

    }


    try {

      if (!products.length) {

        await loadProducts();

      }


      await loadDeliveryItems();


      renderDetailItems();


      setDetailSaveStatus(
        "saved",
        "Все изменения сохранены"
      );


    } catch (error) {

      console.error(
        "Open delivery detail:",
        error
      );


      if (tbody) {

        tbody.innerHTML = `
          <tr>

            <td colspan="6">

              <div class="deliveries-empty">
                Ошибка загрузки:
                ${escapeHTML(
                  error.message ||
                  String(error)
                )}
              </div>

            </td>

          </tr>
        `;

      }


      setDetailSaveStatus(
        "error",
        "Ошибка загрузки"
      );

    }

  }


  async function closeDeliveryDetail() {

    const modal =
      root.querySelector(
        "#delivery-detail-modal"
      );


    if (!modal) {
      return;
    }


    try {

      await flushDetailSaves();

    } catch (error) {

      console.error(
        "Flush delivery detail:",
        error
      );

    }


    modal.classList.remove(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "true"
    );


    currentDelivery =
      null;


    deliveryItems =
      new Map();


    detailSearch =
      "";

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {

    root.addEventListener(
      "click",
      async function (event) {


        /*
          ADD DELIVERY
        */

        if (
          event.target.closest(
            "#delivery-add-button"
          )
        ) {

          openCreateModal();

          return;

        }


        /*
          CLOSE CREATE
        */

        if (
          event.target.closest(
            "[data-delivery-modal-close]"
          )
        ) {

          closeCreateModal();

          return;

        }


        /*
          FILTER
        */

        const filter =
          event.target.closest(
            "[data-delivery-filter]"
          );


        if (filter) {

          currentFilter =
            filter.dataset
              .deliveryFilter;


          root
            .querySelectorAll(
              "[data-delivery-filter]"
            )
            .forEach(
              function (button) {

                button.classList.toggle(
                  "is-active",
                  button === filter
                );

              }
            );


          renderDeliveries();

          return;

        }


        /*
          CLOSE DELETE MODAL
        */

        if (
          event.target.closest(
            "[data-delivery-delete-close]"
          )
        ) {

          closeDeleteModal();

          return;

        }


        /*
          CONFIRM DELETE
        */

        if (
          event.target.closest(
            "#delivery-delete-confirm"
          ) &&
          pendingDeleteDelivery
        ) {

          const confirmButton =
            root.querySelector(
              "#delivery-delete-confirm"
            );


          await deleteDelivery(
            pendingDeleteDelivery.id,
            confirmButton
          );

          return;

        }


        /*
          RESET DATE FILTER
        */

        if (
          event.target.closest(
            "#delivery-date-reset"
          )
        ) {

          currentDateFrom =
            "";

          currentDateTo =
            "";


          const fromInput =
            root.querySelector(
              "#delivery-date-from"
            );


          const toInput =
            root.querySelector(
              "#delivery-date-to"
            );


          const resetButton =
            root.querySelector(
              "#delivery-date-reset"
            );


          if (fromInput) {
            fromInput.value = "";
          }


          if (toInput) {
            toInput.value = "";
          }


          if (resetButton) {
            resetButton.disabled = true;
          }


          renderDeliveries();

          return;

        }


        /*
          DELETE DELIVERY
        */

        const deleteButton =
          event.target.closest(
            "[data-delivery-delete]"
          );


        if (deleteButton) {

          openDeleteModal(
            deleteButton.dataset
              .deliveryDelete
          );

          return;

        }

         
         /*
            DELIVERY SHEET
         */

            const sheetButton =
            event.target.closest(
                "[data-delivery-sheet]"
            );


            if (sheetButton) {

            const deliveryId =
                sheetButton.dataset
                .deliverySheet;


            window.location.hash =
                `delivery-sheet/${deliveryId}`;


            return;

            }

        /*
          OPEN DELIVERY
        */

        const openButton =
          event.target.closest(
            "[data-delivery-open]"
          );


        if (openButton) {

          await openDeliveryDetail(
            openButton.dataset
              .deliveryOpen
          );

          return;

        }


        /*
          CLOSE DETAIL
        */

        if (
          event.target.closest(
            "[data-delivery-detail-close]"
          )
        ) {

          await closeDeliveryDetail();

        }

      }
    );


    /*
      CREATE DELIVERY
    */

    root
      .querySelector(
        "#delivery-form"
      )
      ?.addEventListener(
        "submit",
        createDelivery
      );


    /*
      PRODUCT SEARCH
    */

    root.addEventListener(
      "input",
      function (event) {

        const dateInput =
          event.target.closest(
            "#delivery-date-from, #delivery-date-to"
          );


        if (dateInput) {

          currentDateFrom =
            root.querySelector(
              "#delivery-date-from"
            )?.value || "";


          currentDateTo =
            root.querySelector(
              "#delivery-date-to"
            )?.value || "";


          const resetButton =
            root.querySelector(
              "#delivery-date-reset"
            );


          if (resetButton) {

            resetButton.disabled =
              !currentDateFrom &&
              !currentDateTo;

          }


          renderDeliveries();

          return;

        }

        const searchInput =
          event.target.closest(
            "#delivery-product-search"
          );


        if (searchInput) {

          detailSearch =
            searchInput.value;


          renderDetailItems();

          return;

        }


        /*
          DELIVERY ITEM INPUT
        */

        const input =
          event.target.closest(
            "[data-delivery-item-input]"
          );


        if (!input) {
          return;
        }


        updateDetailLocalCount(

          input.dataset.productId,

          input.dataset.countType,

          input.value

        );

      }
    );


    /*
      SAVE IMMEDIATELY ON FOCUSOUT
    */

    root.addEventListener(
      "focusout",
      function (event) {

        const input =
          event.target.closest(
            "[data-delivery-item-input]"
          );


        if (!input) {
          return;
        }


        saveDetailImmediately(
          input.dataset.productId
        ).catch(
          function () {
            /* already displayed */
          }
        );

      }
    );

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init() {

    root =
      document.getElementById(
        "deliveries-page"
      );


    if (!root) {
      return;
    }


    currentFilter =
      "all";


    currentDateFrom =
      "";


    currentDateTo =
      "";


    pendingDeleteDelivery =
      null;


    deleteInProgress =
      false;


    deliveries =
      [];


    products =
      [];


    currentDelivery =
      null;


    deliveryItems =
      new Map();


    detailSaveTimers =
      new Map();


    detailDirtyProducts =
      new Set();


    detailEditVersions =
      new Map();


    detailActiveSaves =
      0;


    try {

      await loadContext();


      bindEvents();


      await loadDeliveries();


      renderDeliveries();


    } catch (error) {

      console.error(
        "Deliveries init:",
        error
      );


      const list =
        root.querySelector(
          "#deliveries-list"
        );


      if (list) {

        list.innerHTML = `
          <div class="deliveries-empty">

            Ошибка загрузки:

            ${escapeHTML(
              error.message ||
              String(error)
            )}

          </div>
        `;

      }

    }

  }


  /* =====================================================
     SPA
  ===================================================== */

  document.addEventListener(
    "app:page-loaded",
    function (event) {

      if (
        event.detail?.route ===
        "deliveries"
      ) {

        init();

      }

    }
  );

})();

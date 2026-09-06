/* =====================================================
   I’M | ЗАКАЗ
   STEP 4 — FINAL RESULT

   - Load saved Step 3 result
   - Sort products like original product list
   - Delivery accordions
   - Edit CASE
   - Print
   - Confirm order
   - Create system deliveries
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     STATE
  ===================================================== */

  let root = null;

  let appContext = null;

  let userId = null;

  let restaurantId = null;

  let weeklyOrder = null;

  let resultRows = [];

  let productOrderMap =
    new Map();

  let openGroupKeys =
    new Set();

  let accordionInitialized =
    false;

  let confirmed = false;

  let saving = false;


  /* =====================================================
     CATEGORY ORDER

     Дәл Step 1 список ретімен.
  ===================================================== */

  const CATEGORY_ORDER = {

    cola: 0,

    fresh: 1,

    freezer: 2,

    cooler: 3,

    dry: 4,
    "сухой": 4,

    chemistry: 5,
    "химия": 5,

    household: 6,
    "хоз. товары": 6,
    "хоз товары": 6,

    other: 7,
    "другое": 7

  };


  /* =====================================================
     HELPERS
  ===================================================== */

  function escapeHTML(value) {

    return String(
      value ?? ""
    )
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  }


  function number(value) {

    const parsed =
      Number(value);


    return Number.isFinite(
      parsed
    )
      ? parsed
      : 0;

  }


  function formatNumber(
    value,
    digits = 2
  ) {

    return new Intl.NumberFormat(
      "ru-RU",
      {
        maximumFractionDigits:
          digits
      }
    ).format(
      number(value)
    );

  }


  function normalizeCategory(value) {

    return String(
      value || ""
    )
      .trim()
      .toLowerCase();

  }


  function getCategoryRank(value) {

    const category =
      normalizeCategory(
        value
      );


    return (
      CATEGORY_ORDER[
        category
      ] ??
      999
    );

  }


  function parseDate(value) {

    const [
      year,
      month,
      day
    ] =
      String(value)
        .split("-")
        .map(Number);


    return new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  }


  /*
    Бұрынғы .replace(".", "")
    датаның нүктесін өшіріп жіберетін.

    Енді:
    ВТ, 11.08.2026
  */

  function formatDate(value) {

    if (!value) {

      return "—";

    }


    const date =
      parseDate(value);


    const weekday =
      new Intl.DateTimeFormat(
        "ru-RU",
        {
          weekday:
            "short",

          timeZone:
            "UTC"
        }
      )
        .format(date)
        .replace(/\.$/, "")
        .toUpperCase();


    const fullDate =
      new Intl.DateTimeFormat(
        "ru-RU",
        {
          day:
            "2-digit",

          month:
            "2-digit",

          year:
            "numeric",

          timeZone:
            "UTC"
        }
      )
        .format(date);


    return (
      `${weekday}, ${fullDate}`
    );

  }


  function getOrderDayLabel(value) {

    if (
      value === "monday"
    ) {

      return "ПН";

    }


    if (
      value === "thursday"
    ) {

      return "ЧТ";

    }


    return value || "—";

  }


  function getSectionLabel(
    section
  ) {

    const labels = {

      cola:
        "Cola",

      general:
        "Основные",

      fresh:
        "Fresh"

    };


    return (
      labels[section] ||
      section
    );

  }


  function getGroupLabel(
    group
  ) {

    return (
      group === "cola"
        ? "Cola"
        : "Основная поставка"
    );

  }


  function getProductName(
    row
  ) {

    return (
      row.calculation_meta
        ?.product_name ||
      "Без названия"
    );

  }


  function getIikoCode(
    row
  ) {

    return (
      row.calculation_meta
        ?.iiko_code ||
      "—"
    );

  }


  function getUnit(
    row
  ) {

    return (
      row.calculation_meta
        ?.iiko_unit ||
      ""
    );

  }


  function getPositiveRows() {

    return resultRows.filter(
      function (row) {

        return (
          number(
            row.recommended_case_qty
          ) > 0
        );

      }
    );

  }


  /* =====================================================
     MESSAGE
  ===================================================== */

  function showMessage(
    text,
    type = "success"
  ) {

    const element =
      root.querySelector(
        "#step4-message"
      );


    if (!element) {

      return;

    }


    element.hidden =
      false;


    element.className =
      `step4-message is-${type}`;


    element.textContent =
      text;

  }

  /* =====================================================
    CONFIRM MODAL
  ===================================================== */

  function ensureConfirmModal() {

    let modal =
      document.getElementById(
        "step4-confirm-modal"
      );


    if (modal) {
      return modal;
    }


    modal =
      document.createElement(
        "div"
      );


    modal.id =
      "step4-confirm-modal";


    modal.className =
      "step4-modal";


    modal.hidden =
      true;


    modal.innerHTML = `

      <div
        class="step4-modal-backdrop"
        data-step4-modal-close
      ></div>


      <div
        class="step4-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="step4-modal-title"
      >

        <button
          class="step4-modal-x"
          type="button"
          data-step4-modal-close
          aria-label="Закрыть"
        >
          ×
        </button>


        <div class="step4-modal-icon">
          ✓
        </div>


        <div class="step4-modal-content">

          <span class="step4-modal-kicker">
            ПОДТВЕРЖДЕНИЕ
          </span>


          <h3 id="step4-modal-title">
            Подтвердить заказ?
          </h3>


          <p>
            После подтверждения будут автоматически
            созданы поставки и появятся в разделе
            «Поставки».
          </p>


          <div class="step4-modal-info">

            <span>
              Будет создано поставок
            </span>

            <strong
              id="step4-modal-delivery-count"
            >
              0
            </strong>

          </div>

        </div>


        <div class="step4-modal-actions">

          <button
            class="
              step4-modal-button
              is-cancel
            "
            type="button"
            data-step4-modal-cancel
          >
            Отмена
          </button>


          <button
            class="
              step4-modal-button
              is-confirm
            "
            type="button"
            data-step4-modal-confirm
          >
            Подтвердить заказ
          </button>

        </div>

      </div>

    `;


    document.body.appendChild(
      modal
    );


    return modal;

  }


  function openConfirmModal(
    deliveryCount
  ) {

    const modal =
      ensureConfirmModal();


    const count =
      modal.querySelector(
        "#step4-modal-delivery-count"
      );


    const confirmButton =
      modal.querySelector(
        "[data-step4-modal-confirm]"
      );


    const cancelButton =
      modal.querySelector(
        "[data-step4-modal-cancel]"
      );


    if (count) {

      count.textContent =
        String(
          deliveryCount
        );

    }


    return new Promise(
      function (resolve) {

        let finished =
          false;


        function cleanup() {

          document.removeEventListener(
            "keydown",
            handleKey
          );


          modal.removeEventListener(
            "click",
            handleModalClick
          );


          confirmButton
            ?.removeEventListener(
              "click",
              handleConfirm
            );


          cancelButton
            ?.removeEventListener(
              "click",
              handleCancel
            );

        }


        function finish(
          value
        ) {

          if (finished) {
            return;
          }


          finished =
            true;


          modal.classList.remove(
            "is-open"
          );


          window.setTimeout(
            function () {

              modal.hidden =
                true;


              cleanup();


              resolve(
                value
              );

            },
            180
          );

        }


        function handleConfirm() {

          finish(
            true
          );

        }


        function handleCancel() {

          finish(
            false
          );

        }


        function handleModalClick(
          event
        ) {

          if (
            event.target.closest(
              "[data-step4-modal-close]"
            )
          ) {

            finish(
              false
            );

          }

        }


        function handleKey(
          event
        ) {

          if (
            event.key ===
            "Escape"
          ) {

            finish(
              false
            );

          }

        }


        modal.hidden =
          false;


        requestAnimationFrame(
          function () {

            modal.classList.add(
              "is-open"
            );

          }
        );


        confirmButton
          ?.addEventListener(
            "click",
            handleConfirm
          );


        cancelButton
          ?.addEventListener(
            "click",
            handleCancel
          );


        modal.addEventListener(
          "click",
          handleModalClick
        );


        document.addEventListener(
          "keydown",
          handleKey
        );

      }
    );

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


    if (profileError) {

      throw profileError;

    }


    restaurantId =
      profile
        ?.restaurant_id;


    if (!restaurantId) {

      throw new Error(
        "Не найден ресторан."
      );

    }

  }


  /* =====================================================
     WEEKLY ORDER
  ===================================================== */

  async function loadWeeklyOrder() {

    const {
      data,
      error
    } =
      await supabaseClient

        .from(
          "weekly_orders"
        )

        .select(`
          id,
          restaurant_id,
          order_date,
          order_day,
          count_date,
          status,
          created_at,
          updated_at
        `)

        .eq(
          "restaurant_id",
          restaurantId
        )

        .eq(
          "status",
          "calculation"
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
        "Не найден рассчитанный заказ."
      );

    }


    weeklyOrder =
      data;

  }


  /* =====================================================
     RESULT ROWS
  ===================================================== */

  async function loadResultRows() {

    const {
      data,
      error
    } =
      await supabaseClient

        .from(
          "weekly_order_result_items"
        )

        .select("*")

        .eq(
          "weekly_order_id",
          weeklyOrder.id
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


    resultRows =
      data || [];

  }


  /* =====================================================
     PRODUCT LIST ORDER

     order_products-тегі:
     category + sort_order
     бойынша реттейді.
  ===================================================== */

  async function loadProductOrder() {

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
          sort_order
        `)

        .eq(
          "restaurant_id",
          restaurantId
        );


    if (error) {

      throw error;

    }


    productOrderMap =
      new Map();


    (data || [])
      .forEach(
        function (product) {

          productOrderMap.set(
            product.id,
            {

              category:
                normalizeCategory(
                  product.category
                ),

              categoryRank:
                getCategoryRank(
                  product.category
                ),

              sortOrder:
                Number(
                  product.sort_order ??
                  999999
                ),

              name:
                product.name ||
                ""

            }
          );

        }
      );

  }


  /* =====================================================
     ROW SORT
  ===================================================== */

  function compareResultRows(
    a,
    b
  ) {

    const productA =
      productOrderMap.get(
        a.product_id
      );


    const productB =
      productOrderMap.get(
        b.product_id
      );


    const categoryA =
      productA?.categoryRank ??
      999;


    const categoryB =
      productB?.categoryRank ??
      999;


    /*
      1. Сначала категория.
    */

    if (
      categoryA !==
      categoryB
    ) {

      return (
        categoryA -
        categoryB
      );

    }


    const sortA =
      productA?.sortOrder ??
      999999;


    const sortB =
      productB?.sortOrder ??
      999999;


    /*
      2. Затем sort_order.
    */

    if (
      sortA !==
      sortB
    ) {

      return (
        sortA -
        sortB
      );

    }


    /*
      3. Если одинаково —
         название.
    */

    return String(
      getProductName(a)
    ).localeCompare(
      String(
        getProductName(b)
      ),
      "ru"
    );

  }


  /* =====================================================
     GROUPS
  ===================================================== */

  function buildGroups() {

    const map =
      new Map();


    getPositiveRows()
      .forEach(
        function (row) {

          const key =
            `${row.delivery_date}|${row.delivery_group}`;


          if (
            !map.has(
              key
            )
          ) {

            map.set(
              key,
              {

                key,

                deliveryDate:
                  row.delivery_date,

                deliveryGroup:
                  row.delivery_group,

                rows:
                  []

              }
            );

          }


          map
            .get(key)
            .rows
            .push(row);

        }
      );


    const groups =
      Array.from(
        map.values()
      );


    /*
      Товарларды әр поставка ішінде
      список бойынша реттейміз.
    */

    groups.forEach(
      function (group) {

        group.rows.sort(
          compareResultRows
        );

      }
    );


    /*
      Поставкалардың өзі —
      дата бойынша.
    */

    groups.sort(
      function (
        a,
        b
      ) {

        if (
          a.deliveryDate !==
          b.deliveryDate
        ) {

          return (
            a.deliveryDate <
            b.deliveryDate
              ? -1
              : 1
          );

        }


        return (
          a.deliveryGroup ===
          "cola"
            ? -1
            : 1
        );

      }
    );


    return groups;

  }


  /* =====================================================
     CONFIRMED STATE
  ===================================================== */

  async function loadConfirmedState() {

    const groups =
      buildGroups();


    if (
      !groups.length
    ) {

      confirmed =
        false;


      return;

    }


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
          delivery_date,
          delivery_group,
          source,
          source_weekly_order_id,
          status
        `)

        .eq(
          "restaurant_id",
          restaurantId
        )

        .eq(
          "source",
          "system"
        )

        .eq(
          "source_weekly_order_id",
          weeklyOrder.id
        );


    if (error) {

      throw error;

    }


    const keys =
      new Set(

        (data || [])
          .map(
            function (delivery) {

              return (
                `${delivery.delivery_date}|${delivery.delivery_group}`
              );

            }
          )

      );


    confirmed =
      groups.every(
        function (group) {

          return keys.has(
            group.key
          );

        }
      );

  }


  /* =====================================================
     SUMMARY
  ===================================================== */

  function renderSummary() {

    const positive =
      getPositiveRows();


    const totalCases =
      positive.reduce(
        function (
          total,
          row
        ) {

          return (
            total +
            number(
              row.recommended_case_qty
            )
          );

        },
        0
      );


    const colaCases =
      positive

        .filter(
          function (row) {

            return (
              row.section ===
              "cola"
            );

          }
        )

        .reduce(
          function (
            total,
            row
          ) {

            return (
              total +
              number(
                row.recommended_case_qty
              )
            );

          },
          0
        );


    const freshCases =
      positive

        .filter(
          function (row) {

            return (
              row.section ===
              "fresh"
            );

          }
        )

        .reduce(
          function (
            total,
            row
          ) {

            return (
              total +
              number(
                row.recommended_case_qty
              )
            );

          },
          0
        );


    root.querySelector(
      "#step4-summary"
    ).innerHTML = `

      <div class="step4-summary-card">

        <span>
          Позиций заказа
        </span>

        <strong>
          ${positive.length}
        </strong>

        <small>
          только позиции &gt; 0
        </small>

      </div>


      <div class="step4-summary-card">

        <span>
          Cola
        </span>

        <strong>
          ${formatNumber(
            colaCases,
            0
          )} CASE
        </strong>

      </div>


      <div class="step4-summary-card">

        <span>
          Fresh
        </span>

        <strong>
          ${formatNumber(
            freshCases,
            0
          )} CASE
        </strong>

      </div>


      <div
        class="
          step4-summary-card
          is-accent
        "
      >

        <span>
          Всего заказать
        </span>

        <strong>
          ${formatNumber(
            totalCases,
            0
          )} CASE
        </strong>

        <small>
          все поставки
        </small>

      </div>

    `;

  }


  /* =====================================================
     DELIVERY / ACCORDION
  ===================================================== */

  function renderDelivery(
    group
  ) {

    const totalCases =
      group.rows.reduce(
        function (
          total,
          row
        ) {

          return (
            total +
            number(
              row.recommended_case_qty
            )
          );

        },
        0
      );


    const isOpen =
      openGroupKeys.has(
        group.key
      );


    return `

      <details
        class="step4-delivery"
        data-step4-group="${escapeHTML(
          group.key
        )}"
        ${isOpen ? "open" : ""}
      >

        <summary
          class="step4-delivery-head"
          style="
            cursor:pointer;
            user-select:none;
          "
        >

          <div
            style="
              display:flex;
              align-items:center;
              gap:10px;
            "
          >

            <div
              class="step4-delivery-arrow"
              style="
                width:24px;
                height:24px;
                display:flex;
                align-items:center;
                justify-content:center;
                flex:0 0 24px;
                border-radius:6px;
                background:#eef0f2;
                font-weight:900;
                font-size:16px;
              "
            >
              ${isOpen ? "⌄" : "›"}
            </div>


            <div>

              <h3>
                ${escapeHTML(
                  formatDate(
                    group.deliveryDate
                  )
                )}
              </h3>

              <span>
                ${escapeHTML(
                  getGroupLabel(
                    group.deliveryGroup
                  )
                )}
              </span>

            </div>

          </div>


          <div
            class="
              step4-delivery-total
            "
          >

            <strong>
              ${formatNumber(
                totalCases,
                0
              )} CASE
            </strong>

            <small>
              ${group.rows.length}
              позиций
            </small>

          </div>

        </summary>


        <div
          class="
            step4-table-wrap
          "
        >

          <table
            class="step4-table"
          >

            <thead>

              <tr>

                <th
                  style="
                    width:55px;
                  "
                >
                  Раздел
                </th>

                <th>
                  Товар
                </th>

                <th
                  style="
                    width:110px;
                  "
                >
                  IIKO
                </th>

                <th
                  style="
                    width:100px;
                  "
                >
                  CASE
                </th>

                <th
                  style="
                    width:120px;
                  "
                >
                  Количество
                </th>

              </tr>

            </thead>


            <tbody>

              ${
                group.rows
                  .map(
                    function (row) {

                      const caseQty =
                        number(
                          row.recommended_case_qty
                        );


                      const baseQty =
                        number(
                          row.recommended_base_qty
                        );


                      return `

                        <tr>

                          <td>

                            <span
                              class="
                                step4-section-badge
                              "
                            >

                              ${escapeHTML(
                                getSectionLabel(
                                  row.section
                                )
                              )}

                            </span>

                          </td>


                          <td>

                            <div
                              class="
                                step4-product
                              "
                            >

                              <strong>
                                ${escapeHTML(
                                  getProductName(
                                    row
                                  )
                                )}
                              </strong>

                              <span>

                                1 case =
                                ${formatNumber(
                                  row.case_to_base
                                )}

                                ${escapeHTML(
                                  getUnit(
                                    row
                                  )
                                )}

                              </span>

                            </div>

                          </td>


                          <td>

                            ${escapeHTML(
                              getIikoCode(
                                row
                              )
                            )}

                          </td>


                          <td>

                            <input
                              class="step4-case-input"
                              type="number"
                              min="0"
                              step="1"
                              value="${caseQty}"
                              data-result-id="${escapeHTML(
                                row.id
                              )}"
                              ${
                                confirmed
                                  ? "disabled"
                                  : ""
                              }
                            >

                          </td>


                          <td>

                            ${formatNumber(
                              baseQty
                            )}

                            ${escapeHTML(
                              getUnit(
                                row
                              )
                            )}

                          </td>

                        </tr>

                      `;

                    }
                  )
                  .join("")
              }

            </tbody>

          </table>

        </div>

      </details>

    `;

  }


  /* =====================================================
     RENDER
  ===================================================== */

  function render() {

    root.querySelector(
      "#step4-order-date"
    ).textContent =

      (
        getOrderDayLabel(
          weeklyOrder.order_day
        ) +

        " · " +

        formatDate(
          weeklyOrder.order_date
        )
      );


    root.querySelector(
      "#step4-order-status"
    ).textContent =

      confirmed
        ? "Подтвержден"
        : "На проверке";


    renderSummary();


    const groups =
      buildGroups();


    /*
      Бірінші ашылғанда
      тек бірінші поставканы ашамыз.
    */

    if (
      !accordionInitialized
    ) {

      openGroupKeys =
        new Set();


      if (
        groups[0]
      ) {

        openGroupKeys.add(
          groups[0].key
        );

      }


      accordionInitialized =
        true;

    }


    const container =
      root.querySelector(
        "#step4-deliveries"
      );


    if (
      !groups.length
    ) {

      container.innerHTML = `

        <div
          class="step4-empty"
        >

          По расчету заказ
          не требуется.

        </div>

      `;

    } else {

      container.innerHTML =
        groups
          .map(
            renderDelivery
          )
          .join("");

    }


    const confirmButton =
      root.querySelector(
        "#step4-confirm-button"
      );


    if (
      confirmButton
    ) {

      confirmButton.disabled =
        confirmed ||
        saving;


      confirmButton.textContent =
        confirmed
          ? "✓ Заказ подтвержден"
          : "Подтвердить заказ";

    }


    if (
      confirmed
    ) {

      showMessage(

        "Заказ подтвержден. Поставки автоматически созданы и доступны в разделе «Поставки».",

        "success"

      );

    }

  }


  /* =====================================================
     EDIT CASE
  ===================================================== */

  async function updateCase(
    resultId,
    value
  ) {

    if (
      confirmed ||
      saving
    ) {

      return;

    }


    let caseQty =
      Math.round(
        Number(value)
      );


    if (
      !Number.isFinite(
        caseQty
      ) ||
      caseQty < 0
    ) {

      caseQty =
        0;

    }


    const row =
      resultRows.find(
        function (item) {

          return (
            item.id ===
            resultId
          );

        }
      );


    if (!row) {

      return;

    }


    const baseQty =
      caseQty *
      number(
        row.case_to_base
      );


    const {
      error
    } =
      await supabaseClient

        .from(
          "weekly_order_result_items"
        )

        .update({

          recommended_case_qty:
            caseQty,

          recommended_base_qty:
            baseQty,

          updated_at:
            new Date()
              .toISOString()

        })

        .eq(
          "id",
          resultId
        )

        .eq(
          "weekly_order_id",
          weeklyOrder.id
        );


    if (error) {

      throw error;

    }


    row.recommended_case_qty =
      caseQty;


    row.recommended_base_qty =
      baseQty;


    render();

  }


  /* =====================================================
     CREATE DELIVERY
  ===================================================== */

  async function getOrCreateDelivery(
    group
  ) {

    const {
      data: existing,
      error: existingError
    } =
      await supabaseClient

        .from(
          "order_deliveries"
        )

        .select(`
          id,
          source,
          source_weekly_order_id,
          status
        `)

        .eq(
          "restaurant_id",
          restaurantId
        )

        .eq(
          "delivery_group",
          group.deliveryGroup
        )

        .eq(
          "delivery_date",
          group.deliveryDate
        )

        .maybeSingle();


    if (
      existingError
    ) {

      throw existingError;

    }


    if (
      existing
    ) {

      /*
        Осы weekly order-дың
        system delivery-і болса,
        қайта қолданамыз.
      */

      if (
        existing.source ===
          "system" &&

        existing
          .source_weekly_order_id ===
          weeklyOrder.id
      ) {

        return existing;

      }


      throw new Error(

        `${formatDate(
          group.deliveryDate
        )}: ${getGroupLabel(
          group.deliveryGroup
        )} поставка уже существует. Сначала проверьте раздел «Поставки».`

      );

    }


    const {
      data,
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
            group.deliveryDate,

          delivery_group:
            group.deliveryGroup,

          source:
            "system",

          source_weekly_order_id:
            weeklyOrder.id,

          source_order_day:
            weeklyOrder.order_day,

          status:
            "expected",

          note:
            `Еженедельный заказ ${getOrderDayLabel(
              weeklyOrder.order_day
            )} ${weeklyOrder.order_date}`

        })

        .select()

        .single();


    if (error) {

      throw error;

    }


    return data;

  }


  /* =====================================================
     DELIVERY ITEMS
  ===================================================== */

  async function saveDeliveryItems(
    delivery,
    rows
  ) {

    const {
      error: deleteError
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


    if (
      deleteError
    ) {

      throw deleteError;

    }


    const payload =
      rows

        .filter(
          function (row) {

            return (
              number(
                row.recommended_case_qty
              ) > 0
            );

          }
        )

        .map(
          function (row) {

            return {

              delivery_id:
                delivery.id,

              product_id:
                row.product_id,

              case_qty:
                number(
                  row.recommended_case_qty
                ),

              slv_qty:
                0,

              pcs_qty:
                0,

              base_qty:
                number(
                  row.recommended_base_qty
                )

            };

          }
        );


    if (
      !payload.length
    ) {

      return;

    }


    const {
      error
    } =
      await supabaseClient

        .from(
          "order_delivery_items"
        )

        .insert(
          payload
        );


    if (error) {

      throw error;

    }

  }


  /* =====================================================
     CONFIRM
  ===================================================== */

  async function confirmOrder() {

    if (
      confirmed ||
      saving
    ) {

      return;

    }


    const groups =
      buildGroups();


    const ok =
      await openConfirmModal(
        groups.length
      );


    if (!ok) {

      return;

    }


    saving =
      true;


    render();


    try {

      /*
        Соңғы CASE өзгерістерін
        қайта аламыз.
      */

      await loadResultRows();


      const freshGroups =
        buildGroups();


      for (
        const group
        of freshGroups
      ) {

        const delivery =
          await getOrCreateDelivery(
            group
          );


        await saveDeliveryItems(
          delivery,
          group.rows
        );

      }


      /*
        weekly_orders.status
        НЕ МЕНЯЕМ.

        confirmation system deliveries
        арқылы анықталады.
      */

      await loadConfirmedState();


      if (
        !confirmed &&
        freshGroups.length
      ) {

        throw new Error(
          "Поставки созданы не полностью. Обновите страницу и проверьте раздел «Поставки»."
        );

      }


      showMessage(

        "Заказ успешно подтвержден. Автоматические поставки созданы.",

        "success"

      );


    } catch (error) {

      console.error(
        "Confirm weekly order:",
        error
      );


      showMessage(

        error.message ||
        "Не удалось подтвердить заказ.",

        "error"

      );


    } finally {

      saving =
        false;


      render();

    }

  }


  /* =====================================================
     ACCORDION STATE
  ===================================================== */

  function rememberAccordionState(
    details
  ) {

    if (
      !details
    ) {

      return;

    }


    const key =
      details.dataset
        .step4Group;


    if (!key) {

      return;

    }


    if (
      details.open
    ) {

      openGroupKeys.add(
        key
      );

    } else {

      openGroupKeys.delete(
        key
      );

    }

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {

    /*
      CASE
    */

    root.addEventListener(
      "change",
      function (event) {

        const input =
          event.target.closest(
            "[data-result-id]"
          );


        if (!input) {

          return;

        }


        updateCase(

          input.dataset
            .resultId,

          input.value

        ).catch(
          function (error) {

            console.error(
              "Update final CASE:",
              error
            );


            showMessage(

              error.message ||
              "Не удалось сохранить количество.",

              "error"

            );

          }
        );

      }
    );


    /*
      ACCORDION

      summary басылғаннан кейін
      browser details.open-ды өзгертеді.
      Сондықтан setTimeout.
    */

    root.addEventListener(
      "click",
      function (event) {

        const summary =
          event.target.closest(
            ".step4-delivery-head"
          );


        if (
          summary
        ) {

          const details =
            summary.closest(
              "[data-step4-group]"
            );


          window.setTimeout(
            function () {

              rememberAccordionState(
                details
              );


              const arrow =
                details?.querySelector(
                  ".step4-delivery-arrow"
                );


              if (
                arrow &&
                details
              ) {

                arrow.textContent =
                  details.open
                    ? "⌄"
                    : "›";

              }

            },
            0
          );


          return;

        }


        /*
          BACK
        */

        if (
          event.target.closest(
            "#step4-back-button"
          )
        ) {

          if (
            appContext &&
            typeof appContext.goToStep ===
              "function"
          ) {

            appContext.goToStep(
              3
            );

          }


          return;

        }


        /*
          PRINT
        */

        if (
          event.target.closest(
            "#step4-print-button"
          )
        ) {

          window.print();


          return;

        }


        /*
          CONFIRM
        */

        if (
          event.target.closest(
            "#step4-confirm-button"
          )
        ) {

          confirmOrder();

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
        "#order-step-result"
      );


    if (!root) {

      throw new Error(
        "Step 4 root не найден."
      );

    }


    appContext =
      context ||
      null;


    userId =
      null;


    restaurantId =
      null;


    weeklyOrder =
      null;


    resultRows =
      [];


    productOrderMap =
      new Map();


    openGroupKeys =
      new Set();


    accordionInitialized =
      false;


    confirmed =
      false;


    saving =
      false;


    bindEvents();


    try {

      await loadUserContext();


      await loadWeeklyOrder();


      /*
        Result + список товаров
        қатар аламыз.
      */

      await Promise.all([

        loadResultRows(),

        loadProductOrder()

      ]);


      if (
        !resultRows.length
      ) {

        throw new Error(
          "Расчет Step 3 не найден."
        );

      }


      await loadConfirmedState();


      render();


      console.log(
        "[Step 4] ready",
        {

          weekly_order_id:
            weeklyOrder.id,

          result_rows:
            resultRows.length,

          confirmed

        }
      );


    } catch (error) {

      console.error(
        "[Step 4] init:",
        error
      );


      root.querySelector(
        "#step4-deliveries"
      ).innerHTML = `

        <div
          class="step4-empty"
        >

          ${escapeHTML(
            error.message ||
            "Ошибка загрузки"
          )}

        </div>

      `;

    }

  }


  /* =====================================================
     PUBLIC
  ===================================================== */

  window.OrderStep4Result = {
    getNotesContext: () => ({ order: weeklyOrder, userId, restaurantId, products: resultRows.map(row => ({ id: row.product_id, name: row.calculation_meta?.product_name || 'Товар' })) }),

    init,


    reload:
      async function () {

        await Promise.all([

          loadResultRows(),

          loadProductOrder()

        ]);


        await loadConfirmedState();


        render();

      }

  };


  console.log(
    "[Step 4] loaded"
  );

})();

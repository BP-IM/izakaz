/* =====================================================
   I’M | ЗАКАЗ
   ЛИСТ ПОСТАВКИ
===================================================== */

(function () {
  "use strict";


  let root = null;

  let restaurantId = null;

  let restaurant = null;

  let delivery = null;

  let items = [];


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


  function formatNumber(value) {

    const number =
      Number(value || 0);


    return new Intl.NumberFormat(
      "ru-RU",
      {
        maximumFractionDigits: 4
      }
    ).format(number);

  }


  function formatQty(value) {

    if (
      value === null ||
      value === undefined
    ) {

      return "—";

    }


    return formatNumber(
      value
    );

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


  function formatWeekday(
    dateString
  ) {

    if (!dateString) {
      return "—";
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


  function formatRestaurantCode(
    code
  ) {

    if (!code) {
      return "—";
    }


    const clean =
      String(code)
        .replace(/\D/g, "");


    if (clean.length === 5) {

      return (
        clean.slice(0, 2) +
        "-" +
        clean.slice(2)
      );

    }


    return String(code);

  }


  function getGroupName(group) {

    return (
      group === "cola"
        ? "Cola"
        : "Основные товары"
    );

  }


  function getStatusName(status) {

    const statuses = {

      expected:
        "Ожидается",

      arrived:
        "Получена",

      cancelled:
        "Отменена"

    };


    return (
      statuses[status] ||
      status ||
      "—"
    );

  }


  function getSourceName(source) {

    return (
      source === "system"
        ? "Создано системой"
        : "Введено вручную"
    );

  }


  /* =====================================================
     CONTEXT
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
        "Пользователь не найден."
      );

    }


    const {
      data: profile,
      error
    } =
      await supabaseClient

        .from("profiles")

        .select(`
          restaurant_id,
          restaurant:restaurants (
            id,
            name,
            code
          )
        `)

        .eq(
          "id",
          userData.user.id
        )

        .single();


    if (error) {
      throw error;
    }


    restaurantId =
      profile?.restaurant_id;


    restaurant =
      profile?.restaurant ||
      null;


    if (!restaurantId) {

      throw new Error(
        "Ресторан пользователя не найден."
      );

    }

  }


  /* =====================================================
     DELIVERY
  ===================================================== */

  async function loadDelivery(
    deliveryId
  ) {

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
          source_order_day,
          source_weekly_order_id,
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
        )

        .single();


    if (error) {
      throw error;
    }


    delivery =
      data;

  }


  /* =====================================================
     ITEMS
  ===================================================== */

  async function loadItems() {

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

          product:order_products (
            id,
            name,
            category,
            iiko_code,
            iiko_name,
            iiko_unit,
            sort_order
          )
        `)

        .eq(
          "delivery_id",
          delivery.id
        );


    if (error) {
      throw error;
    }


    items =
      (data || [])
        .filter(
          function (item) {

            return Boolean(
              item.product
            );

          }
        )
        .sort(
          function (a, b) {

            const categoryA =
              String(
                a.product.category || ""
              );


            const categoryB =
              String(
                b.product.category || ""
              );


            const categoryCompare =
              categoryA.localeCompare(
                categoryB,
                "ru"
              );


            if (
              categoryCompare !== 0
            ) {

              return categoryCompare;

            }


            const sortA =
              Number(
                a.product.sort_order || 0
              );


            const sortB =
              Number(
                b.product.sort_order || 0
              );


            if (
              sortA !== sortB
            ) {

              return sortA - sortB;

            }


            return String(
              a.product.name || ""
            ).localeCompare(
              String(
                b.product.name || ""
              ),
              "ru"
            );

          }
        );

  }


  /* =====================================================
     RENDER HEADER
  ===================================================== */

  function renderHeader() {

    root
      .querySelector(
        "#sheet-delivery-date"
      )
      .textContent =
        formatDate(
          delivery.delivery_date
        );


    root
      .querySelector(
        "#sheet-delivery-weekday"
      )
      .textContent =
        formatWeekday(
          delivery.delivery_date
        );


    root
      .querySelector(
        "#sheet-restaurant-name"
      )
      .textContent =
        restaurant?.name ||
        "Ресторан";


    root
      .querySelector(
        "#sheet-restaurant-code"
      )
      .textContent =
        formatRestaurantCode(
          restaurant?.code
        );


    root
      .querySelector(
        "#sheet-delivery-group"
      )
      .textContent =
        getGroupName(
          delivery.delivery_group
        );


    root
      .querySelector(
        "#sheet-delivery-status"
      )
      .textContent =
        getStatusName(
          delivery.status
        );


    root
      .querySelector(
        "#sheet-delivery-source"
      )
      .textContent =
        getSourceName(
          delivery.source
        );


    root
      .querySelector(
        "#sheet-position-count"
      )
      .textContent =
        String(
          items.length
        );


    const noteBlock =
      root.querySelector(
        "#sheet-note-block"
      );


    const note =
      root.querySelector(
        "#sheet-note"
      );


    if (delivery.note) {

      noteBlock.hidden =
        false;


      note.textContent =
        delivery.note;

    } else {

      noteBlock.hidden =
        true;

    }

  }


  /* =====================================================
     RENDER ITEMS
  ===================================================== */

  function renderItems() {

    const tbody =
      root.querySelector(
        "#delivery-sheet-body"
      );


    if (!items.length) {

      tbody.innerHTML = `
        <tr>

          <td
            colspan="7"
            style="
              padding:30px;
              text-align:center;
              color:#888;
            "
          >
            В поставке пока нет товаров.
          </td>

        </tr>
      `;


      return;

    }


    tbody.innerHTML =
      items
        .map(
          function (
            item,
            index
          ) {

            const product =
              item.product;


            return `
              <tr>

                <td class="delivery-sheet-item-number">
                  ${index + 1}
                </td>


                <td>
                  ${escapeHTML(
                    product.iiko_code ||
                    "—"
                  )}
                </td>


                <td class="delivery-sheet-product">

                  <strong>
                    ${escapeHTML(
                      product.name ||
                      product.iiko_name ||
                      "Без названия"
                    )}
                  </strong>

                  <span>
                    ${escapeHTML(
                      product.category ||
                      ""
                    )}
                  </span>

                </td>


                <td class="delivery-sheet-item-qty">
                  ${escapeHTML(
                    formatQty(
                      item.case_qty
                    )
                  )}
                </td>


                <td class="delivery-sheet-item-qty">
                  ${escapeHTML(
                    formatQty(
                      item.slv_qty
                    )
                  )}
                </td>


                <td class="delivery-sheet-item-qty">
                  ${escapeHTML(
                    formatQty(
                      item.pcs_qty
                    )
                  )}
                </td>


                <td class="delivery-sheet-item-total">

                  ${escapeHTML(
                    formatNumber(
                      item.base_qty
                    )
                  )}

                  ${escapeHTML(
                    product.iiko_unit ||
                    ""
                  )}

                </td>

              </tr>
            `;

          }
        )
        .join("");

  }


  /* =====================================================
     SUMMARY
  ===================================================== */

  function renderSummary() {

    const totalCases =
      items.reduce(
        function (
          total,
          item
        ) {

          return (
            total +
            Number(
              item.case_qty || 0
            )
          );

        },
        0
      );


    const totalSlv =
      items.reduce(
        function (
          total,
          item
        ) {

          return (
            total +
            Number(
              item.slv_qty || 0
            )
          );

        },
        0
      );


    root
      .querySelector(
        "#sheet-summary-positions"
      )
      .textContent =
        String(
          items.length
        );


    root
      .querySelector(
        "#sheet-summary-cases"
      )
      .textContent =
        formatNumber(
          totalCases
        );


    root
      .querySelector(
        "#sheet-summary-slv"
      )
      .textContent =
        formatNumber(
          totalSlv
        );

  }


  /* =====================================================
     SHOW ERROR
  ===================================================== */

  function showError(error) {

    const loading =
      root.querySelector(
        "#delivery-sheet-loading"
      );


    const paper =
      root.querySelector(
        "#delivery-sheet-paper"
      );


    const errorElement =
      root.querySelector(
        "#delivery-sheet-error"
      );


    loading.hidden =
      true;


    paper.hidden =
      true;


    errorElement.hidden =
      false;


    errorElement.textContent =
      error.message ||
      String(error);

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {

    root
      .querySelector(
        "#delivery-sheet-back"
      )
      ?.addEventListener(
        "click",
        function () {

          window.location.hash =
            "deliveries";

        }
      );


    root
      .querySelector(
        "#delivery-sheet-print"
      )
      ?.addEventListener(
        "click",
        function () {

          window.print();

        }
      );

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(
    deliveryId
  ) {

    root =
      document.getElementById(
        "delivery-sheet-page"
      );


    if (!root) {
      return;
    }


    bindEvents();


    if (!deliveryId) {

      showError(
        new Error(
          "ID поставки не указан."
        )
      );

      return;

    }


    try {

      await loadContext();


      await loadDelivery(
        deliveryId
      );


      await loadItems();


      renderHeader();

      renderItems();

      renderSummary();


      root
        .querySelector(
          "#delivery-sheet-loading"
        )
        .hidden =
          true;


      root
        .querySelector(
          "#delivery-sheet-error"
        )
        .hidden =
          true;


      root
        .querySelector(
          "#delivery-sheet-paper"
        )
        .hidden =
          false;


    } catch (error) {

      console.error(
        "Delivery sheet:",
        error
      );


      showError(
        error
      );

    }

  }


  /* =====================================================
     SPA EVENT
  ===================================================== */

  document.addEventListener(
    "app:page-loaded",
    function (event) {

      if (
        event.detail?.route !==
        "delivery-sheet"
      ) {

        return;

      }


      init(
        event.detail
          ?.params
          ?.[0]
      );

    }
  );

})();
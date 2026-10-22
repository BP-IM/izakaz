/* =====================================================
   IZAKAZ v0.2.0
   INVENTORY COUNT — PRODUCT MODAL
===================================================== */

(function () {
  "use strict";


  let app = null;

  let currentProductId =
    null;


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


  function getProduct(
    productId
  ) {

    return app.state.products.find(
      function (product) {

        return (
          product.id ===
          productId
        );

      }
    );

  }


  function getUnits(
    product
  ) {

    const units =
      [];


    if (
      Number(
        product.case_to_base
      ) > 0
    ) {

      units.push(
        "case"
      );

    }


    if (
      Number(
        product.slv_to_base
      ) > 0
    ) {

      units.push(
        "slv"
      );

    }


    const baseUnit =
      String(
        product.iiko_unit ||
        ""
      ).trim();


    if (baseUnit) {

      const alreadyExists =
        units.some(
          function (unit) {

            return (
              unit.toLowerCase() ===
              baseUnit.toLowerCase()
            );

          }
        );


      if (!alreadyExists) {

        units.push(
          baseUnit
        );

      }

    }


    if (
      !baseUnit &&
      Number(
        product.pcs_to_base
      ) > 0
    ) {

      units.push(
        "pcs"
      );

    }


    if (!units.length) {

      units.push(
        "ед."
      );

    }


    return units;

  }


  function formatQuantity(
    value
  ) {

    const number =
      Number(value);


    if (
      Number.isInteger(
        number
      )
    ) {

      return String(number);

    }


    return number
      .toFixed(3)
      .replace(
        /\.?0+$/,
        ""
      );

  }


  function formatTime(
    dateString
  ) {

    const date =
      new Date(
        dateString
      );


    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    ).format(date);

  }


  /* =====================================================
     RENDER PRODUCT
  ===================================================== */

  function renderHeader() {

    const product =
      getProduct(
        currentProductId
      );


    if (!product) {
      return;
    }


    const name =
      app.root.querySelector(
        "#count-modal-product-name"
      );


    const code =
      app.root.querySelector(
        "#count-modal-product-code"
      );


    if (name) {

      name.textContent =
        product.name;

    }


    if (code) {

      code.textContent =
        `IIKO: ${
          product.iiko_code ||
          "—"
        }`;

    }

  }


  /* =====================================================
     INPUTS
  ===================================================== */

  function renderInputs() {

    const container =
      app.root.querySelector(
        "#count-modal-inputs"
      );


    const product =
      getProduct(
        currentProductId
      );


    if (
      !container ||
      !product
    ) {
      return;
    }


    const units =
      getUnits(
        product
      );


    container.innerHTML =
      units.map(
        function (unit) {

          return `
            <div
              class="count-modal-input-row"
            >

              <div class="count-modal-unit">
                ${escapeHTML(unit)}
              </div>

              <input
                type="number"
                min="0"
                step="0.001"
                inputmode="decimal"

                placeholder="0"

                data-count-input="${escapeHTML(
                  unit
                )}"
              >

              <button
                class="count-modal-add-button"
                type="button"

                data-count-add="${escapeHTML(
                  unit
                )}"
              >
                + Добавить
              </button>

            </div>
          `;

        }
      ).join("");

  }


  /* =====================================================
     TOTALS
  ===================================================== */

  function renderTotals() {

    const container =
      app.root.querySelector(
        "#count-modal-totals"
      );


    if (!container) {
      return;
    }


    const totals =
      window
        .InventoryCountCounting
        .getProductTotals(
          currentProductId
        );


    if (!totals.size) {

      container.innerHTML =
        "Пока ничего не посчитано";

      return;

    }


    container.innerHTML =
      Array.from(
        totals.entries()
      )
        .map(
          function (
            [unit, quantity]
          ) {

            return `
              <div
                class="count-modal-total-chip"
              >

                <strong>
                  ${escapeHTML(
                    formatQuantity(
                      quantity
                    )
                  )}
                </strong>

                <span>
                  ${escapeHTML(unit)}
                </span>

              </div>
            `;

          }
        )
        .join("");

  }


  /* =====================================================
     HISTORY
  ===================================================== */

  function renderHistory() {

    const container =
      app.root.querySelector(
        "#count-modal-history"
      );


    const countElement =
      app.root.querySelector(
        "#count-modal-entry-count"
      );


    if (!container) {
      return;
    }


    const entries =
      window
        .InventoryCountCounting
        .getProductEntries(
          currentProductId
        );


    if (countElement) {

      countElement.textContent =
        `${entries.length} записей`;

    }


    if (!entries.length) {

      container.innerHTML = `
        <div class="count-history-empty">
          Нет записей
        </div>
      `;

      return;

    }


    container.innerHTML =
      entries.map(
        function (entry) {

          const isOwn =
            entry.user_id ===
            app.state.userId;


          return `
            <div
              class="count-history-row"
            >

              <span>
                ${
                  isOwn
                    ? "Вы"
                    : "Сотрудник"
                }
              </span>


              <span
                class="count-history-quantity"
              >
                +${escapeHTML(
                  formatQuantity(
                    entry.quantity
                  )
                )}
                ${escapeHTML(
                  entry.unit
                )}
              </span>


              <span
                class="count-history-time"
              >
                ${escapeHTML(
                  formatTime(
                    entry.created_at
                  )
                )}
              </span>


              ${
                isOwn
                  ? `
                    <button
                      class="count-history-delete"
                      type="button"
                      data-count-delete="${escapeHTML(
                        entry.id
                      )}"
                    >
                      удалить
                    </button>
                  `
                  : ""
              }

            </div>
          `;

        }
      )
      .join("");

  }


  function renderAll() {

    renderHeader();

    renderInputs();

    renderTotals();

    renderHistory();

  }


  /* =====================================================
     OPEN / CLOSE
  ===================================================== */

  function open(
    productId
  ) {

    if (
      !getProduct(
        productId
      )
    ) {
      return;
    }


    currentProductId =
      productId;


    renderAll();


    const modal =
      app.root.querySelector(
        "#inventory-count-modal"
      );


    modal?.classList.add(
      "is-open"
    );


    modal?.setAttribute(
      "aria-hidden",
      "false"
    );

  }


  function close() {

    const modal =
      app.root.querySelector(
        "#inventory-count-modal"
      );


    modal?.classList.remove(
      "is-open"
    );


    modal?.setAttribute(
      "aria-hidden",
      "true"
    );


    currentProductId =
      null;

  }


  /* =====================================================
     ADD
  ===================================================== */

  async function add(
    unit,
    button
  ) {

    if (!currentProductId) {
      return;
    }


    const input =
      app.root.querySelector(
        `[data-count-input="${CSS.escape(
          unit
        )}"]`
      );


    if (!input) {
      return;
    }


    /*
      Бос input-ты 0 деп қабылдамаймыз.
      0 санын нақты жазуға болады.
    */

    if (
      input.value.trim() ===
      ""
    ) {

      input.focus();

      return;

    }


    const quantity =
      Number(
        input.value
      );


    try {

      button.disabled =
        true;


      await window
        .InventoryCountCounting
        .addEntry(
          currentProductId,
          unit,
          quantity
        );


      input.value =
        "";


      renderTotals();

      renderHistory();


      window
        .InventoryCountUI
        ?.refresh();


    } catch (error) {

      console.error(
        "Inventory add entry:",
        error
      );


      alert(
        error.message ||
        "Не удалось сохранить подсчёт."
      );


    } finally {

      button.disabled =
        false;

    }

  }


  /* =====================================================
     ZERO
  ===================================================== */

  async function addZero() {

    if (!currentProductId) {
      return;
    }


    const product =
      getProduct(
        currentProductId
      );


    const units =
      getUnits(
        product
      );


    /*
      Нет остатка:
      0 жазбасын негізгі бірінші unit-ке
      сақтаймыз.

      Бұл товарды "посчитано"
      деп белгілеуге жеткілікті.
    */

    const unit =
      units[0];


    try {

      await window
        .InventoryCountCounting
        .addEntry(
          currentProductId,
          unit,
          0
        );


      renderTotals();

      renderHistory();


      window
        .InventoryCountUI
        ?.refresh();


    } catch (error) {

      console.error(
        "Inventory zero entry:",
        error
      );


      alert(
        error.message ||
        "Не удалось сохранить нулевой остаток."
      );

    }

  }


  /* =====================================================
     DELETE
  ===================================================== */

  async function removeEntry(
    entryId
  ) {

    try {

      await window
        .InventoryCountCounting
        .deleteEntry(
          entryId
        );


      renderTotals();

      renderHistory();


      window
        .InventoryCountUI
        ?.refresh();


    } catch (error) {

      console.error(
        "Inventory delete entry:",
        error
      );


      alert(
        error.message ||
        "Не удалось удалить запись."
      );

    }

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {

    app.root.addEventListener(
      "click",
      function (event) {

        const productButton =
          event.target.closest(
            "[data-count-product]"
          );


        if (productButton) {

          open(
            productButton.dataset
              .countProduct
          );

          return;

        }


        if (
          event.target.closest(
            "[data-count-modal-close]"
          )
        ) {

          close();

          return;

        }


        const addButton =
          event.target.closest(
            "[data-count-add]"
          );


        if (addButton) {

          add(
            addButton.dataset
              .countAdd,
            addButton
          );

          return;

        }


        const deleteButton =
          event.target.closest(
            "[data-count-delete]"
          );


        if (deleteButton) {

          removeEntry(
            deleteButton.dataset
              .countDelete
          );

          return;

        }


        if (
          event.target.closest(
            "#count-modal-zero-button"
          )
        ) {

          addZero();

        }

      }
    );


    document.addEventListener(
      "keydown",
      function (event) {

        if (
          event.key ===
          "Escape"
        ) {

          close();

        }

      }
    );

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(application) {

    app =
      application;


    bindEvents();


    console.log(
      "[Inventory Count Modal] ready"
    );

  }


  window.InventoryCountModal = {

    init,

    open,

    close,

    refresh:
      function () {

        if (
          currentProductId
        ) {

          renderAll();

        }

      }

  };

})();
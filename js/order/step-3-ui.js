/* =====================================================
   I’M | ЗАКАЗ
   STEP 3 — UI

   Cola
   General
   Fresh FEFO
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     STATE
  ===================================================== */

  let root = null;


  let state = {

    weeklyOrder:
      null,

    colaResults:
      [],

    generalResults:
      [],

    freshResults:
      [],

    activeTab:
      "cola",

    onBack:
      null,

    onNext:
      null,

    onGeneralDeliveryChange:
      null,

    onFreshDeliveryChange:
      null

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
      Number(value || 0)
    );

  }


  function isPieceUnit(unit) {

    const normalized =
      String(unit || "")
        .trim()
        .toLowerCase()
        .replace(/\./g, "");


    return [
      "шт",
      "штук",
      "штука",
      "pcs",
      "pc",
      "piece",
      "pieces",
      "дана"
    ].includes(
      normalized
    );

  }


  function formatQuantity(
    value,
    unit,
    digits = 2
  ) {

    return formatNumber(
      value,
      isPieceUnit(unit)
        ? 0
        : digits
    );

  }


  function parseYMD(value) {

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


  function formatDate(value) {

    if (!value) {

      return "—";

    }


    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        timeZone: "UTC"
      }
    ).format(
      parseYMD(value)
    );

  }


  function formatShortDate(value) {

    if (!value) {

      return "—";

    }


    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        day: "2-digit",
        month: "2-digit",
        timeZone: "UTC"
      }
    ).format(
      parseYMD(value)
    );

  }


  function getWeekdayShort(value) {

    if (!value) {

      return "";

    }


    return new Intl.DateTimeFormat(
      "ru-RU",
      {
        weekday: "short",
        timeZone: "UTC"
      }
    )
      .format(
        parseYMD(value)
      )
      .replace(".", "")
      .toUpperCase();

  }


  function getOrderDayName(value) {

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


  function getUnit(item) {

    return (
      item?.product?.iiko_unit ||
      ""
    );

  }


  function addDays(
    value,
    days
  ) {

    const date =
      parseYMD(value);


    date.setUTCDate(
      date.getUTCDate() +
      Number(days || 0)
    );


    return date
      .toISOString()
      .slice(0, 10);

  }


  /* =====================================================
     STATUS
  ===================================================== */

  function setStatus(
    text,
    type = "ready"
  ) {

    const element =
      root?.querySelector(
        "#step3-status"
      );


    if (!element) {

      return;

    }


    element.textContent =
      text;


    element.dataset.status =
      type;

  }


  function showLoading(container) {

    root =
      container?.querySelector(
        "#order-step-calculation"
      );


    if (!root) {

      return;

    }


    setStatus(
      "Выполняем расчет...",
      "loading"
    );

  }


  function showError(
    container,
    error
  ) {

    root =
      container?.querySelector(
        "#order-step-calculation"
      );


    if (!root) {

      return;

    }


    setStatus(
      error?.message ||
      "Ошибка расчета",
      "error"
    );

  }


  /* =====================================================
     META
  ===================================================== */

  function renderMeta() {

    const order =
      state.weeklyOrder;


    const countElement =
      root.querySelector(
        "#step3-count-date"
      );


    const orderElement =
      root.querySelector(
        "#step3-order-date"
      );


    if (countElement) {

      countElement.textContent =
        formatDate(
          order?.count_date
        );

    }


    if (orderElement) {

      orderElement.textContent =
        (
          getOrderDayName(
            order?.order_day
          ) +
          " · " +
          formatDate(
            order?.order_date
          )
        );

    }

  }


  /* =====================================================
     TABS
  ===================================================== */

  function setFooterText(tab) {

    const note =
      root.querySelector(
        ".step3-footer-note"
      );


    if (!note) {

      return;

    }


    const labels = {

      cola:
        "Cola",

      fresh:
        "Fresh",

      freezer:
        "Freezer",

      cooler:
        "Cooler",

      dry:
        "Сухой"

    };


    const label =
      labels[tab] ||
      tab;


    note.textContent =
      `Расчет ${label} готов`;

  }


  function setActiveTab(tab) {

    state.activeTab =
      tab;


    root
      .querySelectorAll(
        "[data-step3-tab]"
      )
      .forEach(
        function (button) {

          button.classList.toggle(
            "is-active",
            button.dataset.step3Tab ===
              tab
          );

        }
      );


    root
      .querySelectorAll(
        "[data-step3-panel]"
      )
      .forEach(
        function (panel) {

          const active =
            panel.dataset.step3Panel ===
            tab;


          panel.hidden =
            !active;


          panel.classList.toggle(
            "is-active",
            active
          );

        }
      );


    setFooterText(
      tab
    );

  }


  /* =====================================================
     KNOWN DELIVERIES
  ===================================================== */

  function renderKnownDeliveries(
    item,
    cssClass
  ) {

    if (
      !Array.isArray(
        item.knownDeliveries
      ) ||
      !item.knownDeliveries.length
    ) {

      return "";

    }


    const unit =
      getUnit(item);


    const text =
      item.knownDeliveries
        .map(
          function (delivery) {

            return (
              getWeekdayShort(
                delivery.date
              ) +
              " " +
              formatShortDate(
                delivery.date
              ) +
              " +" +
              formatQuantity(
                delivery.qty,
                unit
              ) +
              " " +
              unit
            );

          }
        )
        .join(" · ");


    return `
      <div class="${cssClass}">
        Уже ожидается:
        <strong>
          ${escapeHTML(text)}
        </strong>
      </div>
    `;

  }


  /* =====================================================
     GENERIC METRICS
  ===================================================== */

  function renderMetrics(item) {

    const unit =
      getUnit(item);


    return `
      <div class="step3-cola-metrics">

        <div class="step3-cola-metric">

          <span>
            Факт. остаток
          </span>

          <strong>
            ${formatQuantity(
              item.startStock,
              unit
            )}
            ${escapeHTML(unit)}
          </strong>

        </div>


        <div class="step3-cola-metric">

          <span>
            Расход / день
          </span>

          <strong>
            ${formatQuantity(
              item.dailyUsage,
              unit
            )}
            ${escapeHTML(unit)}
          </strong>

        </div>


        <div class="step3-cola-metric">

          <span>
            1 case
          </span>

          <strong>
            ${formatQuantity(
              item.caseToBase,
              unit
            )}
            ${escapeHTML(unit)}
          </strong>

        </div>


        <div class="step3-cola-metric">

          <span>
            Запас
          </span>

          <strong>
            ${formatQuantity(
              item.safetyStock,
              unit
            )}
            ${escapeHTML(unit)}
          </strong>

        </div>

      </div>
    `;

  }


  /* =====================================================
     COLA
  ===================================================== */

  function renderColaSummary() {

    const successful =
      state.colaResults.filter(
        item => item.ok
      );


    const failed =
      state.colaResults.filter(
        item => !item.ok
      );


    const first =
      successful[0] ||
      null;


    const totalCases =
      successful.reduce(
        function (
          total,
          item
        ) {

          return (
            total +
            Number(
              item.recommendedCases ||
              0
            )
          );

        },
        0
      );


    const risks =
      successful.filter(
        item =>
          item.hasShortageBeforeDelivery
      );


    const summary =
      root.querySelector(
        "#step3-cola-summary"
      );


    if (!summary) {

      return;

    }


    summary.innerHTML = `

      <div class="step3-cola-summary-card">

        <span>
          Позиций Cola
        </span>

        <strong>
          ${successful.length}
        </strong>

        <small>
          ${
            failed.length
              ? `Ошибок: ${failed.length}`
              : "Все рассчитаны"
          }
        </small>

      </div>


      <div class="step3-cola-summary-card">

        <span>
          Поставка
        </span>

        <strong>
          ${escapeHTML(
            getWeekdayShort(
              first?.deliveryDate
            )
          )}
        </strong>

        <small>
          ${escapeHTML(
            formatDate(
              first?.deliveryDate
            )
          )}
        </small>

      </div>


      <div class="step3-cola-summary-card">

        <span>
          Покрытие до
        </span>

        <strong>
          ${escapeHTML(
            getWeekdayShort(
              first?.coverageEndDate
            )
          )}
        </strong>

        <small>
          ${escapeHTML(
            formatDate(
              first?.coverageEndDate
            )
          )}
        </small>

      </div>


      <div class="
        step3-cola-summary-card
        is-accent
      ">

        <span>
          Рекомендация
        </span>

        <strong>
          ${formatNumber(
            totalCases,
            0
          )} case
        </strong>

        <small>
          всего по Cola
        </small>

      </div>


      <div class="
        step3-cola-summary-card
        ${risks.length ? "is-danger" : ""}
      ">

        <span>
          До поставки
        </span>

        <strong>
          ${
            risks.length
              ? `${risks.length} риск`
              : "OK"
          }
        </strong>

        <small>
          ${
            risks.length
              ? "могут закончиться"
              : "товара хватает"
          }
        </small>

      </div>

    `;


    const warning =
      root.querySelector(
        "#step3-cola-warning"
      );


    if (!warning) {

      return;

    }


    if (
      risks.length
    ) {

      warning.hidden =
        false;


      warning.innerHTML = `
        🔴 До поставки могут закончиться:
        <strong>
          ${
            risks
              .map(
                item =>
                  escapeHTML(
                    item.product?.name
                  )
              )
              .join(", ")
          }
        </strong>
      `;

    } else {

      warning.hidden =
        true;

      warning.innerHTML =
        "";

    }

  }


  function renderColaForecastDay(
    row,
    item
  ) {

    const unit =
      getUnit(item);


    const classes = [
      "step3-day"
    ];


    if (
      row.date ===
      item.deliveryDate
    ) {

      classes.push(
        "is-delivery"
      );

    }


    if (
      row.isShortage
    ) {

      classes.push(
        "is-shortage"
      );

    }


    return `
      <div class="${classes.join(" ")}">

        <div class="step3-day-top">

          <span class="step3-day-weekday">
            ${escapeHTML(
              getWeekdayShort(
                row.date
              )
            )}
          </span>

          <span class="step3-day-date">
            ${escapeHTML(
              formatShortDate(
                row.date
              )
            )}
          </span>

        </div>


        <div class="step3-day-stock-label">
          Остаток
        </div>


        <div class="step3-day-stock">

          ${formatQuantity(
            row.closingStock,
            unit
          )}

          <small>
            ${escapeHTML(unit)}
          </small>

        </div>


        <div class="step3-day-extra">

          Расход:
          ${formatQuantity(
            row.usageQty,
            unit
          )}
          ${escapeHTML(unit)}

        </div>


        ${
          Number(
            row.deliveryQty
          ) > 0

            ? `
              <div class="step3-day-delivery">

                + Новый заказ:
                ${formatQuantity(
                  row.deliveryQty,
                  unit
                )}
                ${escapeHTML(unit)}

              </div>
            `

            : ""
        }


        ${
          row.isShortage

            ? `
              <div class="step3-day-shortage">

                🔴 Не хватит:
                ${formatQuantity(
                  row.shortageQty,
                  unit
                )}
                ${escapeHTML(unit)}

              </div>
            `

            : ""
        }

      </div>
    `;

  }


  function renderColaCard(item) {

    const product =
      item.product ||
      {};


    if (!item.ok) {

      return `
        <article class="step3-cola-card has-error">

          <h3>
            ${escapeHTML(
              product.name ||
              "Без названия"
            )}
          </h3>

          <div class="step3-cola-error">
            ❌ ${escapeHTML(
              item.error
            )}
          </div>

        </article>
      `;

    }


    const unit =
      getUnit(item);


    return `
      <article class="
        step3-cola-card

        ${
          item.hasShortageBeforeDelivery
            ? "has-shortage"
            : ""
        }

        ${
          Number(item.safetyStock || 0) > 0
            ? "has-safety"
            : ""
        }

        ${
          Number(item.recommendedCases || 0) > 0
            ? "has-order"
            : "no-order"
        }
      ">

        <div class="step3-cola-card-header">

          <div class="step3-cola-product">

            <h3>
              ${escapeHTML(
                product.name
              )}
            </h3>

            <div class="step3-cola-product-meta">

              <span class="step3-cola-product-code">
                ${escapeHTML(
                  product.iiko_code ||
                  "Без IIKO"
                )}
              </span>

              <span>
                ${escapeHTML(unit)}
              </span>

              ${
                Number(item.safetyStock || 0) > 0
                  ? `
                    <span class="step3-stock-badge">
                      Запас +
                      ${formatQuantity(item.safetyStock, unit)}
                      ${escapeHTML(unit)}
                    </span>
                  `
                  : ""
              }

              ${
                item.hasShortageBeforeDelivery
                  ? `
                    <span class="step3-risk-badge">
                      Риск до поставки
                    </span>
                  `
                  : ""
              }

            </div>

          </div>


          <div class="
            step3-cola-recommendation
            ${
              Number(item.recommendedCases || 0) > 0
                ? "is-order"
                : "is-zero"
            }
          ">

            <span>
              Заказать
            </span>

            <strong>

              ${formatNumber(
                item.recommendedCases,
                0
              )}

              <em>
                CASE
              </em>

            </strong>

            <small>
              ${formatQuantity(
                item.recommendedBaseQty,
                unit
              )}
              ${escapeHTML(unit)}
            </small>

          </div>

        </div>


        ${renderMetrics(item)}


        ${renderKnownDeliveries(
          item,
          "step3-cola-known"
        )}


        <div class="step3-cola-forecast-label">
          Прогноз по дням
        </div>


        <div class="step3-cola-forecast">

          ${
            item.forecast
              .map(
                row =>
                  renderColaForecastDay(
                    row,
                    item
                  )
              )
              .join("")
          }

        </div>

      </article>
    `;

  }


  function renderCola() {

    renderColaSummary();


    const list =
      root.querySelector(
        "#step3-cola-list"
      );


    if (!list) {

      return;

    }


    list.innerHTML =
      state.colaResults
        .map(
          renderColaCard
        )
        .join("");

  }


  /* =====================================================
     GENERAL
  ===================================================== */

  function renderGeneralSplit(item) {

    const unit =
      getUnit(item);


    return `
      <div class="step3-general-split">

        ${
          (item.deliveries || [])
            .map(
              function (delivery) {

                return `
                  <div class="step3-general-split-item">

                    <div class="step3-general-split-date">

                      <strong>
                        ${escapeHTML(
                          getWeekdayShort(
                            delivery.date
                          )
                        )}
                        ${escapeHTML(
                          formatShortDate(
                            delivery.date
                          )
                        )}
                      </strong>

                      <small>
                        покрывает
                        ${escapeHTML(
                          formatShortDate(
                            delivery.coverageStartDate
                          )
                        )}
                        —
                        ${escapeHTML(
                          formatShortDate(
                            delivery.coverageEndDate
                          )
                        )}
                      </small>

                    </div>


                    <div class="step3-general-split-qty">

                      <div class="step3-general-case-editor">

                        <button
                          class="step3-general-case-button"
                          type="button"
                          data-general-case-action="decrement"
                          aria-label="Уменьшить CASE"
                        >−</button>

                        <input
                          class="step3-general-case-input"
                          type="number"
                          min="0"
                          step="1"
                          inputmode="numeric"
                          value="${formatNumber(
                            delivery.recommendedCases,
                            0
                          )}"
                          data-general-case-input
                          data-product-id="${escapeHTML(
                            item.product?.id || ""
                          )}"
                          data-delivery-date="${escapeHTML(
                            delivery.date
                          )}"
                          aria-label="CASE для ${escapeHTML(
                            item.product?.name || "товара"
                          )}"
                        >

                        <span>CASE</span>

                        <button
                          class="step3-general-case-button"
                          type="button"
                          data-general-case-action="increment"
                          aria-label="Увеличить CASE"
                        >+</button>

                      </div>

                      ${
                        delivery.isManualOverride
                          ? `
                            <button
                              class="step3-general-case-auto"
                              type="button"
                              data-general-case-reset
                              data-product-id="${escapeHTML(
                                item.product?.id || ""
                              )}"
                              data-delivery-date="${escapeHTML(
                                delivery.date
                              )}"
                            >
                              ↺ Авто:
                              ${formatNumber(
                                delivery.automaticRecommendedCases,
                                0
                              )}
                            </button>
                          `
                          : ""
                      }

                      <small>
                        ${formatQuantity(
                          delivery.recommendedBaseQty,
                          unit
                        )}
                        ${escapeHTML(unit)}
                      </small>

                    </div>

                  </div>
                `;

              }
            )
            .join("")
        }

      </div>
    `;

  }


  function renderGeneralForecastDay(
    row,
    item
  ) {

    const unit =
      getUnit(item);


    const classes = [
      "step3-day"
    ];


    if (
      Number(
        row.knownDeliveryQty
      ) > 0
    ) {

      classes.push(
        "is-known-delivery"
      );

    }


    if (
      Number(
        row.recommendedDeliveryQty
      ) > 0
    ) {

      classes.push(
        "is-new-order"
      );

    }


    if (
      row.isShortage
    ) {

      classes.push(
        "is-shortage"
      );

    }


    return `
      <div class="${classes.join(" ")}">

        <div class="step3-day-top">

          <span class="step3-day-weekday">
            ${escapeHTML(
              getWeekdayShort(
                row.date
              )
            )}
          </span>

          <span class="step3-day-date">
            ${escapeHTML(
              formatShortDate(
                row.date
              )
            )}
          </span>

        </div>


        <div class="step3-day-stock-label">
          Остаток
        </div>


        <div class="step3-day-stock">

          ${formatQuantity(
            row.closingStock,
            unit
          )}

          <small>
            ${escapeHTML(unit)}
          </small>

        </div>


        <div class="step3-day-extra">
          Расход:
          ${formatQuantity(
            row.usageQty,
            unit
          )}
          ${escapeHTML(unit)}
        </div>


        ${
          Number(
            row.knownDeliveryQty
          ) > 0

            ? `
              <div class="step3-day-known-delivery">
                🔵 Уже ожидается:
                +${formatQuantity(
                  row.knownDeliveryQty,
                  unit
                )}
                ${escapeHTML(unit)}
              </div>
            `

            : ""
        }


        ${
          Number(
            row.recommendedDeliveryQty
          ) > 0

            ? `
              <div class="step3-day-new-order">

                🟡 Новый заказ:
                +${formatNumber(
                  row.recommendedCases,
                  0
                )}
                CASE /
                ${formatQuantity(
                  row.recommendedDeliveryQty,
                  unit
                )}
                ${escapeHTML(unit)}

              </div>
            `

            : ""
        }


        ${
          row.isShortage

            ? `
              <div class="step3-day-shortage">
                🔴 Не хватит:
                ${formatQuantity(
                  row.shortageQty,
                  unit
                )}
                ${escapeHTML(unit)}
              </div>
            `

            : ""
        }

      </div>
    `;

  }


  function renderGeneralCard(item) {

    const product =
      item.product ||
      {};


    if (!item.ok) {

      return `
        <article class="step3-cola-card has-error">

          <h3>
            ${escapeHTML(
              product.name
            )}
          </h3>

          <div class="step3-cola-error">
            ❌ ${escapeHTML(
              item.error
            )}
          </div>

        </article>
      `;

    }


    const unit =
      getUnit(item);


    return `
      <article class="
        step3-cola-card

        ${
          item.hasShortageBeforeFirstDelivery
            ? "has-shortage"
            : ""
        }

        ${
          Number(item.safetyStock || 0) > 0
            ? "has-safety"
            : ""
        }

        ${
          Number(item.totalRecommendedCases || 0) > 0
            ? "has-order"
            : "no-order"
        }
      ">

        <div class="step3-cola-card-header">

          <div class="step3-cola-product">

            <h3>
              ${escapeHTML(
                product.name
              )}
            </h3>


            <div class="step3-cola-product-meta">

              <span class="step3-general-category-badge">
                ${escapeHTML(
                  product.category ||
                  "Основные"
                )}
              </span>

              <span class="step3-cola-product-code">
                ${escapeHTML(
                  product.iiko_code ||
                  "Без IIKO"
                )}
              </span>

              <span>
                ${escapeHTML(unit)}
              </span>

              ${
                Number(item.safetyStock || 0) > 0
                  ? `
                    <span class="step3-stock-badge">
                      Запас +
                      ${formatQuantity(item.safetyStock, unit)}
                      ${escapeHTML(unit)}
                    </span>
                  `
                  : ""
              }

              ${
                item.hasShortageBeforeFirstDelivery
                  ? `
                    <span class="step3-risk-badge">
                      Риск до поставки
                    </span>
                  `
                  : ""
              }

            </div>

          </div>


          <div class="
            step3-cola-recommendation
            ${
              Number(item.totalRecommendedCases || 0) > 0
                ? "is-order"
                : "is-zero"
            }
          ">

            <span>
              Всего заказать
            </span>

            <strong>
              ${formatNumber(
                item.totalRecommendedCases,
                0
              )}
              <em>CASE</em>
            </strong>

            <small>
              ${formatQuantity(
                item.totalRecommendedBaseQty,
                unit
              )}
              ${escapeHTML(unit)}
            </small>

          </div>

        </div>


        ${renderMetrics(item)}

        ${renderGeneralSplit(item)}

        ${renderKnownDeliveries(
          item,
          "step3-general-known"
        )}


        <div class="step3-cola-forecast-label">
          Прогноз по дням
        </div>


        <div class="step3-cola-forecast">

          ${
            item.forecast
              .map(
                row =>
                  renderGeneralForecastDay(
                    row,
                    item
                  )
              )
              .join("")
          }

        </div>

      </article>
    `;

  }


  function renderGeneralGroups() {

    if (
      !state.generalResults.length
    ) {

      return `
        <div class="step3-coming-card">
          Нет данных Основных товаров
        </div>
      `;

    }


    const groups =
      new Map();


    state.generalResults
      .forEach(
        function (item) {

          const category =
            item.product?.category ||
            "Другое";


          if (
            !groups.has(
              category
            )
          ) {

            groups.set(
              category,
              []
            );

          }


          groups
            .get(category)
            .push(item);

        }
      );


    return Array
      .from(
        groups.entries()
      )
      .map(
        function (
          [
            category,
            items
          ]
        ) {

          const totalCases =
            items.reduce(
              function (
                total,
                item
              ) {

                return (
                  total +
                  Number(
                    item.ok
                      ? item.totalRecommendedCases
                      : 0
                  )
                );

              },
              0
            );


          const risks =
            items.filter(
              item =>
                item.ok &&
                item.hasShortageBeforeFirstDelivery
            ).length;


          const errors =
            items.filter(
              item =>
                !item.ok
            ).length;


          const open =
            risks > 0 ||
            errors > 0;


          return `
            <details
              class="
                step3-general-category
                ${risks ? "has-risk" : ""}
              "
              ${open ? "open" : ""}
            >

              <summary class="step3-general-category-summary">

                <div class="step3-general-category-main">

                  <div class="step3-general-category-chevron">
                    ›
                  </div>

                  <div>

                    <h3>
                      ${escapeHTML(category)}
                    </h3>

                    <span>
                      ${items.length} позиций
                    </span>

                  </div>

                </div>


                <div class="step3-general-category-stats">

                  ${
                    risks

                      ? `
                        <span class="step3-general-category-risk">
                          🔴 ${risks} риск
                        </span>
                      `

                      : `
                        <span class="step3-general-category-ok">
                          ✓ OK
                        </span>
                      `
                  }


                  <div class="step3-general-category-order">

                    <small>
                      Заказать
                    </small>

                    <strong>
                      ${formatNumber(
                        totalCases,
                        0
                      )} CASE
                    </strong>

                  </div>

                </div>

              </summary>


              <div class="step3-general-category-content">

                <div class="step3-cola-list">

                  ${
                    items
                      .map(
                        renderGeneralCard
                      )
                      .join("")
                  }

                </div>

              </div>

            </details>
          `;

        }
      )
      .join("");

  }


  /* =====================================================
   GENERAL — CATEGORY HELPERS
===================================================== */

function normalizeGeneralCategory(
  value
) {

  const category =
    String(
      value || ""
    )
      .trim()
      .toLowerCase();


  if (
    category === "freezer"
  ) {

    return "freezer";

  }


  if (
    category === "cooler"
  ) {

    return "cooler";

  }


  if (
    category === "сухой" ||
    category === "сухие" ||
    category === "dry"
  ) {

    return "dry";

  }


  return category;

}


/* =====================================================
   GET CATEGORY RESULTS
===================================================== */

function getGeneralCategoryResults(
  categoryKey
) {

  return state.generalResults.filter(
    function (item) {

      return (
        normalizeGeneralCategory(
          item.product?.category
        ) === categoryKey
      );

    }
  );

}


/* =====================================================
   RENDER GENERAL CATEGORY
===================================================== */

function renderGeneralCategory(
    categoryKey,
    categoryLabel
  ) {

    const panel =
      root.querySelector(
        `#step3-panel-${categoryKey}`
      );


    if (!panel) {

      return;

    }


    const results =
      getGeneralCategoryResults(
        categoryKey
      );


    if (!results.length) {

      panel.innerHTML = `
        <div class="step3-category-empty">
          Нет товаров категории
          ${escapeHTML(categoryLabel)}
        </div>
      `;


      return;

    }


    const successful =
      results.filter(
        item => item.ok
      );


    const failed =
      results.filter(
        item => !item.ok
      );


    const first =
      successful[0] ||
      null;


    const totalCases =
      successful.reduce(
        function (
          total,
          item
        ) {

          return (
            total +
            Number(
              item.totalRecommendedCases ||
              0
            )
          );

        },
        0
      );


    const risks =
      successful.filter(
        item =>
          item.hasShortageBeforeFirstDelivery
      );


    panel.innerHTML = `

      <div class="step3-cola-summary">

        <div class="step3-cola-summary-card">

          <span>
            Позиций ${escapeHTML(
              categoryLabel
            )}
          </span>

          <strong>
            ${successful.length}
          </strong>

          <small>
            ${
              failed.length
                ? `Ошибок: ${failed.length}`
                : "Все рассчитаны"
            }
          </small>

        </div>


        <div class="step3-cola-summary-card">

          <span>
            Поставка 1
          </span>

          <strong>
            ${escapeHTML(
              getWeekdayShort(
                first?.deliveries?.[0]?.date
              )
            )}
          </strong>

          <small>
            ${escapeHTML(
              formatDate(
                first?.deliveries?.[0]?.date
              )
            )}
          </small>

        </div>


        <div class="step3-cola-summary-card">

          <span>
            Поставка 2
          </span>

          <strong>

            ${
              first?.deliveries?.[1]

                ? escapeHTML(
                    getWeekdayShort(
                      first.deliveries[1].date
                    )
                  )

                : "—"
            }

          </strong>

          <small>

            ${
              first?.deliveries?.[1]

                ? escapeHTML(
                    formatDate(
                      first.deliveries[1].date
                    )
                  )

                : "—"
            }

          </small>

        </div>


        <div class="
          step3-cola-summary-card
          is-accent
        ">

          <span>
            Рекомендация
          </span>

          <strong>
            ${formatNumber(
              totalCases,
              0
            )} case
          </strong>

          <small>
            всего ${escapeHTML(
              categoryLabel
            )}
          </small>

        </div>


        <div class="
          step3-cola-summary-card
          ${risks.length ? "is-danger" : ""}
        ">

          <span>
            До первой машины
          </span>

          <strong>

            ${
              risks.length

                ? `${risks.length} риск`

                : "OK"
            }

          </strong>

          <small>

            ${
              risks.length

                ? "могут закончиться"

                : "товара хватает"
            }

          </small>

        </div>

      </div>


      ${
        risks.length

          ? `
            <div class="step3-cola-warning">

              🔴 До первой поставки могут закончиться:

              <strong>

                ${
                  risks
                    .map(
                      item =>
                        escapeHTML(
                          item.product?.name
                        )
                    )
                    .join(", ")
                }

              </strong>

            </div>
          `

          : ""
      }


      <div class="step3-cola-list">

        ${
          results
            .map(
              renderGeneralCard
            )
            .join("")
        }

      </div>

    `;

  }


  /* =====================================================
     FRESH — LOTS
  ===================================================== */

  function renderFreshLots(item) {

    const unit =
      getUnit(item);


    const lots =
      item.startLots ||
      [];


    if (
      !lots.length
    ) {

      return `
        <div class="step3-fresh-lots">

          <div class="step3-fresh-lots-title">
            Партии по срокам
          </div>

          <div class="step3-fresh-lots-list">

            <div class="step3-fresh-lot">
              Остаток 0 — партий нет
            </div>

          </div>

        </div>
      `;

    }


    return `
      <div class="step3-fresh-lots">

        <div class="step3-fresh-lots-title">
          Фактический остаток по срокам
        </div>


        <div class="step3-fresh-lots-list">

          ${
            lots
              .map(
                function (lot) {

                  const nearDate =
                    addDays(
                      item.countDate,
                      3
                    );


                  const classes = [
                    "step3-fresh-lot"
                  ];


                  if (
                    lot.expiryDate &&
                    lot.expiryDate <
                      item.countDate
                  ) {

                    classes.push(
                      "is-expired"
                    );

                  }

                  else if (
                    lot.expiryDate &&
                    lot.expiryDate <=
                      nearDate
                  ) {

                    classes.push(
                      "is-near"
                    );

                  }


                  return `
                    <div class="${classes.join(" ")}">

                      <span class="step3-fresh-lot-date">
                        Срок:
                        ${escapeHTML(
                          formatDate(
                            lot.expiryDate
                          )
                        )}
                      </span>

                      <span class="step3-fresh-lot-qty">
                        ${formatQuantity(
                          lot.qty,
                          unit
                        )}
                        ${escapeHTML(unit)}
                      </span>

                    </div>
                  `;

                }
              )
              .join("")
          }

        </div>

      </div>
    `;

  }


  /* =====================================================
     FRESH DELIVERY SPLIT
  ===================================================== */

  function renderFreshDeliveries(item) {

    const unit =
      getUnit(item);


    return `
      <div class="step3-fresh-delivery-split">

        ${
          (item.deliveries || [])
            .map(
              function (delivery) {

                return `
                  <div class="step3-fresh-delivery">

                    <div class="step3-fresh-delivery-date">

                      <strong>
                        ${escapeHTML(
                          getWeekdayShort(
                            delivery.date
                          )
                        )}
                        ${escapeHTML(
                          formatShortDate(
                            delivery.date
                          )
                        )}
                      </strong>

                      <small>
                        покрывает
                        ${escapeHTML(
                          formatShortDate(
                            delivery.coverageStartDate
                          )
                        )}
                        —
                        ${escapeHTML(
                          formatShortDate(
                            delivery.coverageEndDate
                          )
                        )}
                      </small>

                    </div>


                    <div class="step3-fresh-delivery-qty">

                      <div class="step3-general-case-editor">

                        <button
                          class="step3-general-case-button"
                          type="button"
                          data-fresh-case-action="decrement"
                          aria-label="Уменьшить Fresh CASE"
                        >−</button>

                        <input
                          class="step3-general-case-input"
                          type="number"
                          min="0"
                          step="1"
                          inputmode="numeric"
                          value="${formatNumber(
                            delivery.recommendedCases,
                            0
                          )}"
                          data-fresh-case-input
                          data-product-id="${escapeHTML(
                            item.product?.id || ""
                          )}"
                          data-delivery-date="${escapeHTML(
                            delivery.date
                          )}"
                          aria-label="Fresh CASE для ${escapeHTML(
                            item.product?.name || "товара"
                          )}"
                        >

                        <span>CASE</span>

                        <button
                          class="step3-general-case-button"
                          type="button"
                          data-fresh-case-action="increment"
                          aria-label="Увеличить Fresh CASE"
                        >+</button>

                      </div>

                      ${
                        delivery.isManualOverride
                          ? `
                            <button
                              class="step3-general-case-auto"
                              type="button"
                              data-fresh-case-reset
                              data-product-id="${escapeHTML(
                                item.product?.id || ""
                              )}"
                              data-delivery-date="${escapeHTML(
                                delivery.date
                              )}"
                            >
                              ↺ Авто:
                              ${formatNumber(
                                delivery.automaticRecommendedCases,
                                0
                              )}
                            </button>
                          `
                          : ""
                      }

                      <small>
                        ${formatQuantity(
                          delivery.recommendedBaseQty,
                          unit
                        )}
                        ${escapeHTML(unit)}
                      </small>

                    </div>

                  </div>
                `;

              }
            )
            .join("")
        }

      </div>
    `;

  }


  /* =====================================================
     FRESH FORECAST
  ===================================================== */

  function renderFreshForecastDay(
    row,
    item
  ) {

    const unit =
      getUnit(item);


    const classes = [
      "step3-day"
    ];


    if (
      Number(
        row.knownDeliveryQty
      ) > 0
    ) {

      classes.push(
        "is-known-delivery"
      );

    }


    if (
      Number(
        row.recommendedDeliveryQty
      ) > 0
    ) {

      classes.push(
        "is-new-order"
      );

    }


    if (
      Number(
        row.expiredQty
      ) > 0
    ) {

      classes.push(
        "is-expiry"
      );

    }


    if (
      row.isShortage
    ) {

      classes.push(
        "is-shortage"
      );

    }


    return `
      <div class="${classes.join(" ")}">

        <div class="step3-day-top">

          <span class="step3-day-weekday">
            ${escapeHTML(
              getWeekdayShort(
                row.date
              )
            )}
          </span>

          <span class="step3-day-date">
            ${escapeHTML(
              formatShortDate(
                row.date
              )
            )}
          </span>

        </div>


        <div class="step3-day-stock-label">
          Остаток
        </div>


        <div class="step3-day-stock">

          ${formatQuantity(
            row.closingStock,
            unit
          )}

          <small>
            ${escapeHTML(unit)}
          </small>

        </div>


        <div class="step3-day-extra">

          Расход:
          ${formatQuantity(
            row.usageQty,
            unit
          )}
          ${escapeHTML(unit)}

        </div>


        ${
          Number(
            row.knownDeliveryQty
          ) > 0

            ? `
              <div class="step3-day-known-delivery">

                🔵 Уже ожидается:
                +${formatQuantity(
                  row.knownDeliveryQty,
                  unit
                )}
                ${escapeHTML(unit)}

              </div>
            `

            : ""
        }


        ${
          Number(
            row.recommendedDeliveryQty
          ) > 0

            ? `
              <div class="step3-day-new-order">

                🟡 Новый заказ:
                +${formatNumber(
                  row.recommendedCases,
                  0
                )}
                CASE /
                ${formatQuantity(
                  row.recommendedDeliveryQty,
                  unit
                )}
                ${escapeHTML(unit)}

              </div>
            `

            : ""
        }


        ${
          Number(
            row.expiredQty
          ) > 0

            ? `
              <div class="step3-day-expiry">

                🟠 Срок закончился:
                ${formatQuantity(
                  row.expiredQty,
                  unit
                )}
                ${escapeHTML(unit)}

              </div>
            `

            : ""
        }


        ${
          row.isShortage

            ? `
              <div class="step3-day-shortage">

                🔴 Не хватит:
                ${formatQuantity(
                  row.shortageQty,
                  unit
                )}
                ${escapeHTML(unit)}

              </div>
            `

            : ""
        }

      </div>
    `;

  }


  /* =====================================================
     FRESH PRODUCT
  ===================================================== */

  function renderFreshCard(item) {

    const product =
      item.product ||
      {};


    if (!item.ok) {

      return `
        <article class="
          step3-fresh-card
          has-error
        ">

          <h3>
            ${escapeHTML(
              product.name ||
              "Без названия"
            )}
          </h3>

          <div class="step3-cola-error">
            ❌ ${escapeHTML(
              item.error ||
              "Ошибка Fresh расчета"
            )}
          </div>

        </article>
      `;

    }


    const unit =
      getUnit(item);


    const classes = [
      "step3-fresh-card"
    ];


    if (
      item.hasExpiry
    ) {

      classes.push(
        "has-expiry"
      );

    }


    if (
      item.hasShortageBeforeFirstDelivery
    ) {

      classes.push(
        "has-shortage"
      );

    }


    if (
      Number(item.safetyStock || 0) > 0
    ) {

      classes.push(
        "has-safety"
      );

    }


    if (
      Number(item.totalRecommendedCases || 0) > 0
    ) {

      classes.push(
        "has-order"
      );

    } else {

      classes.push(
        "no-order"
      );

    }


    return `
      <article class="${classes.join(" ")}">

        <div class="step3-cola-card-header">

          <div class="step3-cola-product">

            <h3>
              ${escapeHTML(
                product.name
              )}
            </h3>


            <div class="step3-cola-product-meta">

              <span class="step3-general-category-badge">
                Fresh
              </span>


              <span class="step3-cola-product-code">
                ${escapeHTML(
                  product.iiko_code ||
                  "Без IIKO"
                )}
              </span>


              <span>
                ${escapeHTML(unit)}
              </span>


              ${
                Number(item.safetyStock || 0) > 0
                  ? `
                    <span class="step3-stock-badge">
                      Запас +
                      ${formatQuantity(item.safetyStock, unit)}
                      ${escapeHTML(unit)}
                    </span>
                  `
                  : ""
              }


              ${
                item.hasExpiry

                  ? `
                    <span class="step3-fresh-expiry-badge">
                      🟠 Есть срок
                    </span>
                  `

                  : ""
              }


              ${
                item.hasShortageBeforeFirstDelivery

                  ? `
                    <span class="step3-risk-badge">
                      Риск до поставки
                    </span>
                  `

                  : ""
              }

            </div>

          </div>


          <div class="
            step3-cola-recommendation
            ${
              Number(item.totalRecommendedCases || 0) > 0
                ? "is-order"
                : "is-zero"
            }
          ">

            <span>
              Всего заказать
            </span>

            <strong>

              ${formatNumber(
                item.totalRecommendedCases,
                0
              )}

              <em>
                CASE
              </em>

            </strong>

            <small>
              ${formatQuantity(
                item.totalRecommendedBaseQty,
                unit
              )}
              ${escapeHTML(unit)}
            </small>

          </div>

        </div>


        ${renderMetrics(item)}


        ${renderFreshLots(item)}


        ${renderFreshDeliveries(item)}


        ${renderKnownDeliveries(
          item,
          "step3-fresh-known"
        )}


        <div class="step3-cola-forecast-label">
          FEFO прогноз по дням
        </div>


        <div class="step3-cola-forecast">

          ${
            item.forecast
              .map(
                row =>
                  renderFreshForecastDay(
                    row,
                    item
                  )
              )
              .join("")
          }

        </div>

      </article>
    `;

  }


  /* =====================================================
     FRESH SUMMARY
  ===================================================== */

  function renderFresh() {

    const panel =
      root.querySelector(
        "#step3-panel-fresh"
      );


    if (!panel) {

      return;

    }


    const successful =
      state.freshResults.filter(
        item => item.ok
      );


    const failed =
      state.freshResults.filter(
        item => !item.ok
      );


    const first =
      successful[0] ||
      null;


    const totalCases =
      successful.reduce(
        function (
          total,
          item
        ) {

          return (
            total +
            Number(
              item.totalRecommendedCases ||
              0
            )
          );

        },
        0
      );


    const shortageRisks =
      successful.filter(
        item =>
          item.hasShortageBeforeFirstDelivery
      );


    const expiryProducts =
      successful.filter(
        item =>
          item.hasExpiry
      );


    panel.innerHTML = `

      <div class="step3-cola-summary">

        <div class="step3-cola-summary-card">

          <span>
            Fresh позиций
          </span>

          <strong>
            ${successful.length}
          </strong>

          <small>
            ${
              failed.length
                ? `Ошибок: ${failed.length}`
                : "Все рассчитаны"
            }
          </small>

        </div>


        <div class="step3-cola-summary-card">

          <span>
            Поставка 1
          </span>

          <strong>
            ${escapeHTML(
              getWeekdayShort(
                first?.deliveries?.[0]?.date
              )
            )}
          </strong>

          <small>
            ${escapeHTML(
              formatDate(
                first?.deliveries?.[0]?.date
              )
            )}
          </small>

        </div>


        <div class="step3-cola-summary-card">

          <span>
            Поставка 2
          </span>

          <strong>
            ${
              first?.deliveries?.[1]

                ? escapeHTML(
                    getWeekdayShort(
                      first.deliveries[1].date
                    )
                  )

                : "—"
            }
          </strong>

          <small>
            ${
              first?.deliveries?.[1]

                ? escapeHTML(
                    formatDate(
                      first.deliveries[1].date
                    )
                  )

                : "—"
            }
          </small>

        </div>


        <div class="
          step3-cola-summary-card
          is-accent
        ">

          <span>
            Рекомендация
          </span>

          <strong>
            ${formatNumber(
              totalCases,
              0
            )} case
          </strong>

          <small>
            всего Fresh
          </small>

        </div>


        <div class="
          step3-cola-summary-card
          ${
            shortageRisks.length
              ? "is-danger"
              : ""
          }
        ">

          <span>
            До первой машины
          </span>

          <strong>
            ${
              shortageRisks.length
                ? `${shortageRisks.length} риск`
                : "OK"
            }
          </strong>

          <small>
            ${
              expiryProducts.length
                ? `Срок: ${expiryProducts.length} поз.`
                : "По срокам OK"
            }
          </small>

        </div>

      </div>


      ${
        expiryProducts.length

          ? `
            <div class="step3-fresh-warning">

              🟠 По срокам будут списания у
              ${expiryProducts.length}
              ${
                expiryProducts.length === 1
                  ? "позиции"
                  : "позиций"
              }.

              FEFO уже учтено в расчете заказа.

            </div>
          `

          : ""
      }


      ${
        shortageRisks.length

          ? `
            <div class="step3-cola-warning">

              🔴 До первой поставки могут закончиться:

              <strong>
                ${
                  shortageRisks
                    .map(
                      item =>
                        escapeHTML(
                          item.product?.name
                        )
                    )
                    .join(", ")
                }
              </strong>

            </div>
          `

          : ""
      }


      <div class="step3-cola-list">

        ${
          state.freshResults
            .map(
              renderFreshCard
            )
            .join("")
        }

      </div>
    `;

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  async function commitGeneralCaseChange(
    change
  ) {

    if (
      typeof state.onGeneralDeliveryChange !==
      "function"
    ) {

      return;

    }


    try {

      setStatus(
        "Сохраняем ручное количество...",
        "loading"
      );


      await state
        .onGeneralDeliveryChange(
          change
        );


      setStatus(
        "Ручное количество сохранено",
        "ready"
      );

    } catch (error) {

      console.error(
        "General delivery override:",
        error
      );


      setStatus(
        error?.message ||
        "Не удалось сохранить количество",
        "error"
      );


      alert(
        error?.message ||
        "Не удалось сохранить количество поставки."
      );

    }

  }


  function commitGeneralCaseInput(
    input
  ) {

    const cases =
      Math.max(
        0,
        Math.round(
          Number(input.value) || 0
        )
      );


    input.value =
      String(cases);


    commitGeneralCaseChange({

      productId:
        input.dataset.productId,

      deliveryDate:
        input.dataset.deliveryDate,

      cases,

      mode:
        "manual"

    });

  }


  async function commitFreshCaseChange(
    change
  ) {

    if (
      typeof state.onFreshDeliveryChange !==
      "function"
    ) {

      return;

    }


    try {

      setStatus(
        "Сохраняем Fresh количество...",
        "loading"
      );


      await state
        .onFreshDeliveryChange(
          change
        );


      setStatus(
        "Fresh количество сохранено",
        "ready"
      );

    } catch (error) {

      console.error(
        "Fresh delivery override:",
        error
      );


      setStatus(
        error?.message ||
        "Не удалось сохранить Fresh количество",
        "error"
      );


      alert(
        error?.message ||
        "Не удалось сохранить Fresh поставку."
      );

    }

  }


  function commitFreshCaseInput(
    input
  ) {

    const cases =
      Math.max(
        0,
        Math.round(
          Number(input.value) || 0
        )
      );


    input.value =
      String(cases);


    commitFreshCaseChange({

      productId:
        input.dataset.productId,

      deliveryDate:
        input.dataset.deliveryDate,

      cases,

      mode:
        "manual"

    });

  }

  function bindEvents() {

    root.addEventListener(
      "click",
      function (event) {

        const caseAction =
          event.target.closest(
            "[data-general-case-action]"
          );


        if (caseAction) {

          const editor =
            caseAction.closest(
              ".step3-general-case-editor"
            );


          const input =
            editor?.querySelector(
              "[data-general-case-input]"
            );


          if (input) {

            const current =
              Math.max(
                0,
                Math.round(
                  Number(input.value) || 0
                )
              );


            input.value =
              String(
                caseAction.dataset.generalCaseAction ===
                  "increment"
                  ? current + 1
                  : Math.max(0, current - 1)
              );


            commitGeneralCaseInput(
              input
            );

          }


          return;

        }


        const reset =
          event.target.closest(
            "[data-general-case-reset]"
          );


        if (reset) {

          commitGeneralCaseChange({

            productId:
              reset.dataset.productId,

            deliveryDate:
              reset.dataset.deliveryDate,

            mode:
              "auto"

          });


          return;

        }


        const freshCaseAction =
          event.target.closest(
            "[data-fresh-case-action]"
          );


        if (freshCaseAction) {

          const editor =
            freshCaseAction.closest(
              ".step3-general-case-editor"
            );


          const input =
            editor?.querySelector(
              "[data-fresh-case-input]"
            );


          if (input) {

            const current =
              Math.max(
                0,
                Math.round(
                  Number(input.value) || 0
                )
              );


            input.value =
              String(
                freshCaseAction.dataset.freshCaseAction ===
                  "increment"
                  ? current + 1
                  : Math.max(0, current - 1)
              );


            commitFreshCaseInput(
              input
            );

          }


          return;

        }


        const freshReset =
          event.target.closest(
            "[data-fresh-case-reset]"
          );


        if (freshReset) {

          commitFreshCaseChange({

            productId:
              freshReset.dataset.productId,

            deliveryDate:
              freshReset.dataset.deliveryDate,

            mode:
              "auto"

          });


          return;

        }

        const tab =
          event.target.closest(
            "[data-step3-tab]"
          );


        if (tab) {

          setActiveTab(
            tab.dataset.step3Tab
          );

          return;

        }


        if (
          event.target.closest(
            "#step3-back-button"
          )
        ) {

          if (
            typeof state.onBack ===
            "function"
          ) {

            state.onBack();

          }


          return;

        }


        if (
          event.target.closest(
            "#step3-next-button"
          )
        ) {

          if (
            typeof state.onNext ===
            "function"
          ) {

            state.onNext();

          }

        }

      }
    );


    root.addEventListener(
      "change",
      function (event) {

        const generalInput =
          event.target.closest(
            "[data-general-case-input]"
          );


        if (generalInput) {

          commitGeneralCaseInput(
            generalInput
          );


          return;

        }


        const freshInput =
          event.target.closest(
            "[data-fresh-case-input]"
          );


        if (freshInput) {

          commitFreshCaseInput(
            freshInput
          );

        }

      }
    );

  }


  /* =====================================================
     RENDER
  ===================================================== */

  function render(options) {

    root =
      options.container
        ?.querySelector(
          "#order-step-calculation"
        );


    if (!root) {

      throw new Error(
        "Step 3 UI root не найден"
      );

    }


    state = {

      weeklyOrder:
        options.weeklyOrder ||
        null,

      colaResults:
        options.colaResults ||
        [],

      generalResults:
        options.generalResults ||
        [],

      freshResults:
        options.freshResults ||
        [],

      activeTab:
        options.activeTab ||
        "cola",

      onBack:
        options.onBack ||
        null,

      onNext:
        options.onNext ||
        null,

      onGeneralDeliveryChange:
        options.onGeneralDeliveryChange ||
        null,

      onFreshDeliveryChange:
        options.onFreshDeliveryChange ||
        null

    };


    renderMeta();


    renderCola();


    renderFresh();


    renderGeneralCategory(
      "freezer",
      "Freezer"
    );


    renderGeneralCategory(
      "cooler",
      "Cooler"
    );


    renderGeneralCategory(
      "dry",
      "Сухой"
    );


    setActiveTab(
      state.activeTab
    );


    if (
      root.dataset.eventsBound !==
      "true"
    ) {

      bindEvents();


      root.dataset.eventsBound =
        "true";

    }


    const nextButton =
      root.querySelector(
        "#step3-next-button"
      );

    if (nextButton) {
      nextButton.disabled = false;
    }

  }

  /* =====================================================
    GET ACTIVE TAB
  ===================================================== */

  function getActiveTab() {

    return state.activeTab;

  }
  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.OrderStep3UI = {

    render,

    showLoading,

    showError,

    setActiveTab,

    getActiveTab

  };


  console.log(
    "[Step 3 UI] Cola + General + Fresh loaded"
  );

})();

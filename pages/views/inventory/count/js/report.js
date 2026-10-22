/* =====================================================
   IZAKAZ v0.2.0
   INVENTORY COUNT — PRINT REPORT
===================================================== */

(function () {
  "use strict";


  let app = null;


  /* =====================================================
     PRINT GROUPS
  ===================================================== */

  const PRINT_GROUPS = [
    {
      id: "freezer",
      title: "ФРИЗЕР",
      categories: [
        "freezer"
      ]
    },

    {
      id: "cooler",
      title: "КУЛЕР",
      categories: [
        "cooler",
        "fresh",
        "cola"
      ]
    },

    {
      id: "dry",
      title: "СУХОЙ",
      categories: [
        "dry",
        "chemistry",
        "household",
        "other"
      ]
    }
  ];


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


  function formatQuantity(value) {

    const number =
      Number(value || 0);


    if (
      Number.isInteger(number)
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


  function parseDate(dateString) {

    const [
      year,
      month,
      day
    ] =
      String(dateString)
        .split("-")
        .map(Number);


    return new Date(
      year,
      month - 1,
      day
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
      parseDate(dateString)
    );

  }


  /* =====================================================
     UNIT
  ===================================================== */

  function normalizeUnit(unit) {

    const value =
      String(unit || "")
        .trim()
        .toLowerCase();


    if (
      value === "шт" ||
      value === "штук" ||
      value === "pcs" ||
      value === "pc"
    ) {

      return "шт";

    }


    if (
      value === "кг" ||
      value === "kg"
    ) {

      return "кг";

    }


    if (
      value === "л" ||
      value === "l" ||
      value === "liter" ||
      value === "litre"
    ) {

      return "л";

    }


    return value || "ед.";

  }


  function getBaseUnit(product) {

    return normalizeUnit(
      product.iiko_unit ||
      "шт"
    );

  }


  /* =====================================================
     PRODUCT TOTAL
  ===================================================== */

  function getProductFinalTotal(product) {

    const counting =
      window.InventoryCountCounting;


    const totals =
      counting
        ?.getProductTotals?.(
          product.id
        );


    const baseUnit =
      getBaseUnit(product);


    if (
      !totals ||
      !totals.size
    ) {

      return {
        quantity: 0,
        unit: baseUnit
      };

    }


    let total =
      0;


    totals.forEach(
      function (
        quantity,
        unit
      ) {

        const amount =
          Number(
            quantity || 0
          );


        const normalizedUnit =
          String(unit || "")
            .trim()
            .toLowerCase();


        /* CASE */

        if (
          normalizedUnit ===
          "case"
        ) {

          total +=
            amount *
            Number(
              product.case_to_base ||
              0
            );


          return;

        }


        /* SLV */

        if (
          normalizedUnit ===
          "slv"
        ) {

          total +=
            amount *
            Number(
              product.slv_to_base ||
              0
            );


          return;

        }


        /* PCS */

        if (
          normalizedUnit === "pcs" ||
          normalizedUnit === "pc"
        ) {

          total +=
            amount *
            Number(
              product.pcs_to_base ||
              1
            );


          return;

        }


        /* BASE UNIT */

        if (
          normalizeUnit(
            normalizedUnit
          ) ===
          baseUnit
        ) {

          total +=
            amount;


          return;

        }


        /*
          На случай если unit
          уже является базовым,
          но записан нестандартно.
        */

        total +=
          amount;

      }
    );


    return {
      quantity: total,
      unit: baseUnit
    };

  }


  /* =====================================================
     PRODUCT SORT
  ===================================================== */

  function sortProducts(
    products
  ) {

    return [
      ...products
    ].sort(
      function (
        first,
        second
      ) {

        return String(
          first.name || ""
        ).localeCompare(
          String(
            second.name || ""
          ),
          "ru",
          {
            numeric: true,
            sensitivity: "base"
          }
        );

      }
    );

  }


  /* =====================================================
     GROUP PRODUCTS
  ===================================================== */

  function getReportGroups() {

    const products =
      app.state.products || [];


    return PRINT_GROUPS
      .map(
        function (group) {

          const groupProducts =
            products.filter(
              function (product) {

                return group.categories.includes(
                  product.category
                );

              }
            );


          return {
            ...group,

            products:
              sortProducts(
                groupProducts
              )
          };

        }
      )
      .filter(
        function (group) {

          return (
            group.products.length >
            0
          );

        }
      );

  }


  /* =====================================================
     REPORT DATA
  ===================================================== */

  function getReportRows() {

    const groups =
      getReportGroups();


    let rowNumber =
      1;


    return groups.map(
      function (group) {

        return {

          title:
            group.title,

          products:
            group.products.map(
              function (product) {

                const result =
                  getProductFinalTotal(
                    product
                  );


                return {

                  number:
                    rowNumber++,

                  id:
                    product.id,

                  name:
                    product.name ||
                    "Без названия",

                  quantity:
                    result.quantity,

                  unit:
                    result.unit

                };

              }
            )

        };

      }
    );

  }


  /* =====================================================
     PRINT TABLE ROWS
  ===================================================== */

  function buildTableRows() {

    const groups =
      getReportRows();


    return groups
      .map(
        function (group) {

          const productsHTML =
            group.products
              .map(
                function (row) {

                  return `

                    <tr>

                      <td class="col-number">
                        ${row.number}
                      </td>


                      <td class="col-name">
                        ${escapeHTML(
                          row.name
                        )}
                      </td>


                      <td class="col-result">

                        ${escapeHTML(
                          formatQuantity(
                            row.quantity
                          )
                        )}

                        ${escapeHTML(
                          row.unit
                        )}

                      </td>

                    </tr>

                  `;

                }
              )
              .join("");


          return `

            <tr
              class="category-row"
            >

              <td
                colspan="3"
              >
                ${escapeHTML(
                  group.title
                )}
              </td>

            </tr>


            ${productsHTML}

          `;

        }
      )
      .join("");

  }


  /* =====================================================
     TOTAL PRODUCT COUNT
  ===================================================== */

  function getProductCount() {

    return getReportRows()
      .reduce(
        function (
          total,
          group
        ) {

          return (
            total +
            group.products.length
          );

        },
        0
      );

  }


  /* =====================================================
     PRINT HTML
  ===================================================== */

  function buildPrintHTML() {

    const date =
      formatDate(
        app.state.inventoryDate
      );


    const rows =
      buildTableRows();


    const productCount =
      getProductCount();


    return `

      <!DOCTYPE html>

      <html lang="ru">

      <head>

        <meta charset="UTF-8">


        <title>
          Инвентаризация ${escapeHTML(
            date
          )}
        </title>


        <style>

          * {
            box-sizing: border-box;
          }


          @page {
            size: A4 portrait;

            margin:
              10mm 12mm;
          }


          body {
            margin: 0;

            color: #111;

            background: #fff;

            font-family:
              Arial,
              Helvetica,
              sans-serif;

            font-size: 10px;
          }


          .report-header {
            display: flex;

            align-items: flex-end;
            justify-content: space-between;

            gap: 20px;

            margin-bottom: 14px;

            padding-bottom: 10px;

            border-bottom:
              2px solid #111;
          }


          .report-title {
            margin: 0;

            font-size: 18px;
            font-weight: 800;
          }


          .report-subtitle {
            margin:
              4px 0 0;

            color: #555;

            font-size: 9px;
          }


          .report-date {
            font-size: 11px;
            font-weight: 700;

            white-space: nowrap;
          }


          table {
            width: 100%;

            border-collapse:
              collapse;

            table-layout:
              fixed;
          }


          thead {
            display:
              table-header-group;
          }


          tr {
            page-break-inside:
              avoid;
          }


          th {
            padding:
              7px 6px;

            border:
              1px solid #777;

            background:
              #eeeeee;

            font-size:
              9px;

            font-weight:
              800;

            text-align:
              left;
          }


          td {
            padding:
              5px 6px;

            border:
              1px solid #aaa;

            vertical-align:
              middle;
          }


          .col-number {
            width: 8%;

            text-align:
              center;
          }


          .col-name {
            width: 72%;
          }


          .col-result {
            width: 20%;

            text-align:
              right;

            font-size:
              11px;

            font-weight:
              800;

            white-space:
              nowrap;
          }


          .category-row td {
            padding:
              7px 8px;

            border:
              1px solid #777;

            background:
              #dddddd;

            font-size:
              10px;

            font-weight:
              900;

            letter-spacing:
              0.4px;
          }


          .report-footer {
            display: flex;

            justify-content:
              space-between;

            gap: 20px;

            margin-top:
              12px;

            color:
              #555;

            font-size:
              9px;
          }


          @media print {

            body {
              print-color-adjust:
                exact;

              -webkit-print-color-adjust:
                exact;
            }

          }

        </style>

      </head>


      <body>

        <header
          class="report-header"
        >

          <div>

            <h1
              class="report-title"
            >
              ИНВЕНТАРИЗАЦИЯ
            </h1>


            <p
              class="report-subtitle"
            >
              Фактический остаток
            </p>

          </div>


          <div
            class="report-date"
          >
            ${escapeHTML(
              date
            )}
          </div>

        </header>


        <table>

          <thead>

            <tr>

              <th
                class="col-number"
              >
                №
              </th>


              <th
                class="col-name"
              >
                Наименование
              </th>


              <th
                class="col-result"
              >
                Итог
              </th>

            </tr>

          </thead>


          <tbody>

            ${rows}

          </tbody>

        </table>


        <footer
          class="report-footer"
        >

          <span>
            Позиций:
            ${productCount}
          </span>


          <span>
            I’M | Инвентаризация
          </span>

        </footer>


        <script>

          window.addEventListener(
            "load",
            function () {

              setTimeout(
                function () {

                  window.print();

                },
                250
              );

            }
          );

        <\/script>

      </body>

      </html>

    `;

  }


  /* =====================================================
     PRINT
  ===================================================== */

  function print() {

    if (!app) {

      return;

    }


    if (
      !app.state.products?.length
    ) {

      alert(
        "Нет товаров для печати."
      );


      return;

    }


    const printWindow =
      window.open(
        "",
        "_blank",
        "width=1000,height=800"
      );


    if (!printWindow) {

      alert(
        "Браузер заблокировал окно печати."
      );


      return;

    }


    printWindow
      .document
      .open();


    printWindow
      .document
      .write(
        buildPrintHTML()
      );


    printWindow
      .document
      .close();

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {

    app.root.addEventListener(
      "click",
      function (event) {

        const button =
          event.target.closest(
            "#inventory-print-button"
          );


        if (!button) {

          return;

        }


        print();

      }
    );

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(
    application
  ) {

    app =
      application;


    if (
      !app ||
      !app.root
    ) {

      throw new Error(
        "Inventory Report: app не найден."
      );

    }


    bindEvents();


    console.log(
      "[Inventory Report] ready"
    );

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.InventoryCountReport = {

    init,

    print,

    getReportRows

  };

})();
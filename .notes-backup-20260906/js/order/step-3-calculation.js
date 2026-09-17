/* =====================================================
   I’M | ЗАКАЗ
   STEP 3 — CALCULATION CONTROLLER
===================================================== */

(function () {
  "use strict";

  let root = null;
  let appContext = null;

  let userId = null;
  let restaurantId = null;
  let weeklyOrder = null;

  let stockMap = new Map();
  let salesMap = new Map();
  let freshLotsMap = new Map();

  let colaProducts = [];
  let generalProducts = [];
  let freshProducts = [];

  let colaSchedule = [];
  let generalSchedule = [];

  let colaIncoming = null;
  let generalIncoming = null;
  let freshIncoming = null;

  let colaResults = [];
  let generalResults = [];
  let freshResults = [];

  let generalDeliveryOverrides =
    new Map();

  let freshDeliveryOverrides =
    new Map();


  /* =====================================================
     MODULES
  ===================================================== */

  const MODULES = [

    {
      id: "order-step3-core",
      src: "../js/order/step-3-core.js",
      global: "OrderStep3Core"
    },

    {
      id: "order-step3-deliveries",
      src: "../js/order/step-3-deliveries.js",
      global: "OrderStep3Deliveries"
    },

    {
      id: "order-step3-cola",
      src: "../js/order/step-3-cola.js",
      global: "OrderStep3Cola"
    },

    {
      id: "order-step3-general",
      src: "../js/order/step-3-general.js",
      global: "OrderStep3General"
    },

    {
      id: "order-step3-fresh",
      src: "../js/order/step-3-fresh.js",
      global: "OrderStep3Fresh"
    },

    {
      id: "order-step3-save",
      src: "../js/order/step-3-save.js",
      global: "OrderStep3Save"
    },

    {
      id: "order-step3-ui",
      src: "../js/order/step-3-ui.js",
      global: "OrderStep3UI"
    }

  ];


  /* =====================================================
     SUPABASE
  ===================================================== */

  function getClient() {

    const client =
      window.supabaseClient ||
      (
        typeof supabaseClient !== "undefined"
          ? supabaseClient
          : null
      );


    if (!client) {

      throw new Error(
        "supabaseClient не найден"
      );

    }


    return client;

  }


  /* =====================================================
     SCRIPT LOADER
  ===================================================== */

  function ensureScript(config) {

    if (
      window[
        config.global
      ]
    ) {

      return Promise.resolve();

    }


    const existing =
      document.getElementById(
        config.id
      );


    if (existing) {

      return new Promise(
        function (
          resolve,
          reject
        ) {

          if (
            window[
              config.global
            ]
          ) {

            resolve();

            return;

          }


          existing.addEventListener(
            "load",
            function () {

              if (
                window[
                  config.global
                ]
              ) {

                resolve();

              } else {

                reject(
                  new Error(
                    `${config.global} не найден после загрузки ${config.src}`
                  )
                );

              }

            },
            {
              once: true
            }
          );


          existing.addEventListener(
            "error",
            function () {

              reject(
                new Error(
                  `Не удалось загрузить ${config.src}`
                )
              );

            },
            {
              once: true
            }
          );

        }
      );

    }


    return new Promise(
      function (
        resolve,
        reject
      ) {

        const script =
          document.createElement(
            "script"
          );


        script.id =
          config.id;


        script.src =
          config.src;


        script.async =
          false;


        script.addEventListener(
          "load",
          function () {

            if (
              window[
                config.global
              ]
            ) {

              resolve();

            } else {

              reject(
                new Error(
                  `${config.global} не найден после загрузки ${config.src}`
                )
              );

            }

          },
          {
            once: true
          }
        );


        script.addEventListener(
          "error",
          function () {

            reject(
              new Error(
                `Не удалось загрузить ${config.src}`
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

  }


  async function loadModules() {

    for (
      const config
      of MODULES
    ) {

      await ensureScript(
        config
      );

    }

  }


  function validateModules() {

    const required = [

      "OrderStep3Core",
      "OrderStep3Deliveries",
      "OrderStep3Cola",
      "OrderStep3General",
      "OrderStep3Fresh",
      "OrderStep3Save",
      "OrderStep3UI"

    ];


    required.forEach(
      function (name) {

        if (
          !window[name]
        ) {

          throw new Error(
            `${name} не загружен.`
          );

        }

      }
    );


    if (
      typeof window
        .OrderStep3Cola
        .calculateProduct !==
      "function"
    ) {

      throw new Error(
        "OrderStep3Cola.calculateProduct не найден."
      );

    }


    if (
      typeof window
        .OrderStep3General
        .calculateProduct !==
      "function"
    ) {

      throw new Error(
        "OrderStep3General.calculateProduct не найден."
      );

    }


    if (
      typeof window
        .OrderStep3Fresh
        .calculateProduct !==
      "function"
    ) {

      throw new Error(
        "OrderStep3Fresh.calculateProduct не найден."
      );

    }

  }


  /* =====================================================
     USER / RESTAURANT
  ===================================================== */

  async function loadUserContext() {

    const client =
      getClient();


    const {
      data: userData,
      error: userError
    } =
      await client
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
      await client

        .from(
          "profiles"
        )

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

  async function loadWeeklyOrder() {

    const client =
      getClient();


    const {
      data,
      error
    } =
      await client

        .from(
          "weekly_orders"
        )

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
        "Не найден заказ для расчета. Завершите Шаг 2 и нажмите «Далее»."
      );

    }


    weeklyOrder =
      data;


    if (
      weeklyOrder.order_day !==
        "monday" &&
      weeklyOrder.order_day !==
        "thursday"
    ) {

      throw new Error(
        `Некорректный order_day: ${weeklyOrder.order_day}`
      );

    }


    if (
      !weeklyOrder.count_date
    ) {

      weeklyOrder.count_date =
        weeklyOrder.order_date;

    }


    console.log(
      "[Step 3 Calculation] Weekly order:",
      weeklyOrder
    );

  }


  /* =====================================================
     PRODUCTS
  ===================================================== */

  async function loadProducts() {

    const client =
      getClient();


    const {
      data,
      error
    } =
      await client

        .from(
          "order_products"
        )

        .select(`
          id,
          restaurant_id,
          category,
          name,
          iiko_code,
          iiko_name,
          iiko_unit,
          case_to_base,
          slv_to_base,
          pcs_to_base,
          safety_stock,
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
          "sort_order",
          {
            ascending: true
          }
        )

        .order(
          "name",
          {
            ascending: true
          }
        );


    if (error) {

      throw error;

    }


    const products =
      data || [];


    colaProducts =
      products.filter(
        function (product) {

          return (
            product.delivery_group ===
            "cola"
          );

        }
      );


    freshProducts =
      products.filter(
        function (product) {

          return (
            String(
              product.category || ""
            )
              .trim()
              .toLowerCase() ===
            "fresh"
          );

        }
      );


    generalProducts =
      products.filter(
        function (product) {

          return (
            product.delivery_group ===
              "general" &&

            String(
              product.category || ""
            )
              .trim()
              .toLowerCase() !==
              "fresh"
          );

        }
      );


    if (
      !colaProducts.length
    ) {

      throw new Error(
        "Не найдены активные Cola товары."
      );

    }


    if (
      !generalProducts.length
    ) {

      throw new Error(
        "Не найдены товары группы Основные."
      );

    }


    if (
      !freshProducts.length
    ) {

      console.warn(
        "[Step 3 Fresh] Активные Fresh товары не найдены."
      );

    }

  }


  /* =====================================================
     STOCK
  ===================================================== */

  async function loadStock() {

    const client =
      getClient();


    const {
      data,
      error
    } =
      await client

        .from(
          "weekly_order_stock_items"
        )

        .select(`
          id,
          weekly_order_id,
          product_id,
          case_qty,
          slv_qty,
          pcs_qty,
          base_qty
        `)

        .eq(
          "weekly_order_id",
          weeklyOrder.id
        );


    if (error) {

      throw error;

    }


    stockMap =
      new Map();


    (data || [])
      .forEach(
        function (item) {

          stockMap.set(
            item.product_id,
            item
          );

        }
      );

  }


  /* =====================================================
     FRESH LOTS
  ===================================================== */

  async function loadFreshLots() {

    const client =
      getClient();


    const {
      data,
      error
    } =
      await client

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


    freshLotsMap =
      new Map();


    freshProducts.forEach(
      function (product) {

        freshLotsMap.set(
          product.id,
          []
        );

      }
    );


    (data || [])
      .forEach(
        function (item) {

          if (
            !freshLotsMap.has(
              item.product_id
            )
          ) {

            return;

          }


          const qty =
            Number(
              item.base_qty || 0
            );


          if (
            !Number.isFinite(
              qty
            ) ||
            qty <= 0
          ) {

            return;

          }


          freshLotsMap
            .get(
              item.product_id
            )
            .push({

              id:
                item.id,

              expiryDate:
                item.expiry_date ||
                null,

              qty,

              source:
                "stock",

              dbRecord:
                item

            });

        }
      );

  }


  /* =====================================================
     SALES
  ===================================================== */

  async function loadSales() {

    const client =
      getClient();


    const {
      data,
      error
    } =
      await client

        .from(
          "weekly_order_sales_items"
        )

        .select(`
          id,
          weekly_order_id,
          product_id,
          realization_qty,
          writeoff_qty,
          usage_qty
        `)

        .eq(
          "weekly_order_id",
          weeklyOrder.id
        );


    if (error) {

      throw error;

    }


    salesMap =
      new Map();


    (data || [])
      .forEach(
        function (item) {

          salesMap.set(
            item.product_id,
            item
          );

        }
      );

  }


  /* =====================================================
     SCHEDULES
  ===================================================== */

  async function loadSchedules() {

    const Deliveries =
      window.OrderStep3Deliveries;


    [
      colaSchedule,
      generalSchedule
    ] =
      await Promise.all([

        Deliveries.loadSchedule({

          restaurantId,

          deliveryGroup:
            "cola"

        }),

        Deliveries.loadSchedule({

          restaurantId,

          deliveryGroup:
            "general"

        })

      ]);


    if (
      !colaSchedule.length
    ) {

      throw new Error(
        "В настройках нет графика Cola."
      );

    }


    if (
      !generalSchedule.length
    ) {

      throw new Error(
        "В настройках нет графика Основных товаров."
      );

    }

  }


  /* =====================================================
     INCOMING
  ===================================================== */

  function normalizeIncomingForCountDate(
    incomingData
  ) {

    const Deliveries =
      window.OrderStep3Deliveries;


    const headers =
      incomingData?.headers ||
      [];


    const items =
      incomingData?.items ||
      [];


    const allowedHeaders =
      headers.filter(
        function (delivery) {

          return !(
            delivery.delivery_date ===
              weeklyOrder.count_date &&

            delivery.status ===
              "arrived"
          );

        }
      );


    const allowedIds =
      new Set(

        allowedHeaders.map(
          function (delivery) {

            return delivery.id;

          }
        )

      );


    const allowedItems =
      items.filter(
        function (item) {

          return allowedIds.has(
            item.delivery_id
          );

        }
      );


    const index =
      Deliveries
        .buildIncomingIndex(
          allowedHeaders,
          allowedItems
        );


    return {

      headers:
        allowedHeaders,

      items:
        allowedItems,

      headerMap:
        index.headerMap,

      byProduct:
        index.byProduct

    };

  }


  async function loadColaIncoming() {

    const windowInfo =
      window
        .OrderStep3Cola
        .resolveWindow({

          orderDate:
            weeklyOrder.order_date,

          orderDay:
            weeklyOrder.order_day,

          deliverySchedule:
            colaSchedule

        });


    const rawIncoming =
      await window
        .OrderStep3Deliveries
        .loadIncomingForProducts({

          restaurantId,

          deliveryGroup:
            "cola",

          fromDate:
            weeklyOrder.count_date,

          toDate:
            windowInfo.coverageEndDate,

          productIds:
            colaProducts.map(
              function (product) {

                return product.id;

              }
            ),

          excludeWeeklyOrderId:
            weeklyOrder.id

        });


    colaIncoming =
      normalizeIncomingForCountDate(
        rawIncoming
      );

  }


  async function loadGeneralIncoming() {

    const plan =
      window
        .OrderStep3General
        .resolvePlan({

          orderDate:
            weeklyOrder.order_date,

          orderDay:
            weeklyOrder.order_day,

          deliverySchedule:
            generalSchedule

        });


    const rawIncoming =
      await window
        .OrderStep3Deliveries
        .loadIncomingForProducts({

          restaurantId,

          deliveryGroup:
            "general",

          fromDate:
            weeklyOrder.count_date,

          toDate:
            plan.coverageEndDate,

          productIds:
            generalProducts.map(
              function (product) {

                return product.id;

              }
            ),

          excludeWeeklyOrderId:
            weeklyOrder.id

        });


    generalIncoming =
      normalizeIncomingForCountDate(
        rawIncoming
      );

  }


  async function loadFreshIncoming() {

    if (
      !freshProducts.length
    ) {

      freshIncoming = {

        headers:
          [],

        items:
          [],

        headerMap:
          new Map(),

        byProduct:
          new Map()

      };


      return;

    }


    const plan =
      window
        .OrderStep3General
        .resolvePlan({

          orderDate:
            weeklyOrder.order_date,

          orderDay:
            weeklyOrder.order_day,

          deliverySchedule:
            generalSchedule

        });


    const rawIncoming =
      await window
        .OrderStep3Deliveries
        .loadIncomingForProducts({

          restaurantId,

          deliveryGroup:
            "general",

          fromDate:
            weeklyOrder.count_date,

          toDate:
            plan.coverageEndDate,

          productIds:
            freshProducts.map(
              function (product) {

                return product.id;

              }
            ),

          excludeWeeklyOrderId:
            weeklyOrder.id

        });


    freshIncoming =
      normalizeIncomingForCountDate(
        rawIncoming
      );

  }


  /* =====================================================
     INPUTS
  ===================================================== */

  function getCalculationInputs(
    product
  ) {

    const Core =
      window.OrderStep3Core;


    const stock =
      stockMap.get(
        product.id
      );


    const sales =
      salesMap.get(
        product.id
      );


    if (!stock) {

      throw new Error(
        "Нет сохраненного остатка Step 1"
      );

    }


    if (!sales) {

      throw new Error(
        "Нет данных реализации Step 2"
      );

    }


    const startStock =
      Number(
        stock.base_qty || 0
      );


    const weeklyUsage =
      Number(
        sales.usage_qty || 0
      );


    const dailyUsage =
      Core.roundNumber(
        weeklyUsage / 7,
        6
      );


    const caseToBase =
      Number(
        product.case_to_base
      );


    if (
      !Number.isFinite(
        caseToBase
      ) ||
      caseToBase <= 0
    ) {

      throw new Error(
        "Не указан case_to_base"
      );

    }


    const safetyStock =
      Math.max(
        0,
        Number(
          product.safety_stock || 0
        )
      );


    return {

      stock,
      sales,
      startStock,
      weeklyUsage,
      dailyUsage,
      caseToBase,
      safetyStock

    };

  }


  /* =====================================================
     COLA
  ===================================================== */

  function calculateColaProduct(
    product
  ) {

    const inputs =
      getCalculationInputs(
        product
      );


    const knownDeliveries =
      window
        .OrderStep3Deliveries
        .getProductDeliveries(
          colaIncoming,
          product.id
        );


    const calculation =
      window
        .OrderStep3Cola
        .calculateProduct({

          countDate:
            weeklyOrder.count_date,

          orderDate:
            weeklyOrder.order_date,

          orderDay:
            weeklyOrder.order_day,

          startStock:
            inputs.startStock,

          dailyUsage:
            inputs.dailyUsage,

          safetyStock:
            inputs.safetyStock,

          caseToBase:
            inputs.caseToBase,

          deliverySchedule:
            colaSchedule,

          knownDeliveries

        });


    return {

      product,

      stockRecord:
        inputs.stock,

      salesRecord:
        inputs.sales,

      weeklyUsage:
        inputs.weeklyUsage,

      dailyUsage:
        inputs.dailyUsage,

      knownDeliveries,

      ...calculation

    };

  }


  function calculateAllCola() {

    colaResults =
      colaProducts.map(
        function (product) {

          try {

            return {

              ok:
                true,

              ...calculateColaProduct(
                product
              )

            };

          } catch (error) {

            console.error(
              `[Step 3 Cola] ${product.name}:`,
              error
            );


            return {

              ok:
                false,

              product,

              error:
                error.message ||
                String(error)

            };

          }

        }
      );

  }


  /* =====================================================
     GENERAL
  ===================================================== */

  function calculateGeneralProduct(
    product
  ) {

    const inputs =
      getCalculationInputs(
        product
      );


    const knownDeliveries =
      window
        .OrderStep3Deliveries
        .getProductDeliveries(
          generalIncoming,
          product.id
        );


    const calculation =
      window
        .OrderStep3General
        .calculateProduct({

          countDate:
            weeklyOrder.count_date,

          orderDate:
            weeklyOrder.order_date,

          orderDay:
            weeklyOrder.order_day,

          startStock:
            inputs.startStock,

          dailyUsage:
            inputs.dailyUsage,

          safetyStock:
            inputs.safetyStock,

          caseToBase:
            inputs.caseToBase,

          deliverySchedule:
            generalSchedule,

          deliveryCaseOverrides:
            generalDeliveryOverrides.get(
              product.id
            ) ||
            null,

          knownDeliveries

        });


    return {

      product,

      stockRecord:
        inputs.stock,

      salesRecord:
        inputs.sales,

      weeklyUsage:
        inputs.weeklyUsage,

      dailyUsage:
        inputs.dailyUsage,

      knownDeliveries,

      ...calculation

    };

  }


  function calculateAllGeneral() {

    generalResults =
      generalProducts.map(
        function (product) {

          try {

            return {

              ok:
                true,

              ...calculateGeneralProduct(
                product
              )

            };

          } catch (error) {

            console.error(
              `[Step 3 General] ${product.name}:`,
              error
            );


            return {

              ok:
                false,

              product,

              error:
                error.message ||
                String(error)

            };

          }

        }
      );

  }


  /* =====================================================
     FRESH
  ===================================================== */

  function calculateFreshProduct(
    product
  ) {

    const Core =
      window.OrderStep3Core;


    const inputs =
      getCalculationInputs(
        product
      );


    const lots =
      (
        freshLotsMap.get(
          product.id
        ) ||
        []
      )
        .map(
          function (lot) {

            return {

              id:
                lot.id,

              expiryDate:
                lot.expiryDate,

              qty:
                Number(
                  lot.qty || 0
                ),

              source:
                "stock"

            };

          }
        );


    const lotsTotal =
      Core.roundNumber(

        lots.reduce(
          function (
            total,
            lot
          ) {

            return (
              total +
              Number(
                lot.qty || 0
              )
            );

          },
          0
        )

      );


    if (
      Math.abs(
        lotsTotal -
        inputs.startStock
      ) >
      Core.EPSILON
    ) {

      throw new Error(
        `Fresh сроки не совпадают с остатком: факт ${inputs.startStock}, по срокам ${lotsTotal}`
      );

    }


    const knownDeliveries =
      window
        .OrderStep3Deliveries
        .getProductDeliveries(
          freshIncoming,
          product.id
        );


    const calculation =
      window
        .OrderStep3Fresh
        .calculateProduct({

          countDate:
            weeklyOrder.count_date,

          orderDate:
            weeklyOrder.order_date,

          orderDay:
            weeklyOrder.order_day,

          lots,

          dailyUsage:
            inputs.dailyUsage,

          safetyStock:
            inputs.safetyStock,

          caseToBase:
            inputs.caseToBase,

          deliverySchedule:
            generalSchedule,

          deliveryCaseOverrides:
            freshDeliveryOverrides.get(
              product.id
            ) ||
            null,

          knownDeliveries

        });


    return {

      product,

      stockRecord:
        inputs.stock,

      salesRecord:
        inputs.sales,

      lotRecords:
        freshLotsMap.get(
          product.id
        ) ||
        [],

      weeklyUsage:
        inputs.weeklyUsage,

      dailyUsage:
        inputs.dailyUsage,

      knownDeliveries,

      ...calculation

    };

  }


  function calculateAllFresh() {

    freshResults =
      freshProducts.map(
        function (product) {

          try {

            return {

              ok:
                true,

              ...calculateFreshProduct(
                product
              )

            };

          } catch (error) {

            console.error(
              `[Step 3 Fresh] ${product.name}:`,
              error
            );


            return {

              ok:
                false,

              product,

              error:
                error.message ||
                String(error)

            };

          }

        }
      );

  }


  /* =====================================================
     SAVE RESULTS
  ===================================================== */

  async function saveResults() {

    return window
      .OrderStep3Save
      .save({

        weeklyOrder,

        colaResults,

        generalResults,

        freshResults

      });

  }


  /* =====================================================
     DEBUG
  ===================================================== */

  function debugResultGroup(
    title,
    results,
    extraBuilder
  ) {

    console.group(
      title
    );


    console.table(

      results.map(
        function (item) {

          if (!item.ok) {

            return {

              товар:
                item.product?.name,

              код:
                item.product?.iiko_code,

              ошибка:
                item.error

            };

          }


          return extraBuilder(
            item
          );

        }
      )

    );


    const successful =
      results.filter(
        function (item) {

          return item.ok;

        }
      ).length;


    const failed =
      results.length -
      successful;


    console.log(
      `✅ Calculated: ${successful}`
    );


    if (failed) {

      console.log(
        `❌ Errors: ${failed}`
      );

    }


    console.groupEnd();


    return results;

  }


  function debugCola() {

    console.log(
      "[Step 3 Cola] Incoming headers:",
      colaIncoming?.headers ||
      []
    );


    return debugResultGroup(

      "[Step 3] REAL COLA DATA",

      colaResults,

      function (item) {

        return {

          товар:
            item.product.name,

          код:
            item.product.iiko_code,

          ед:
            item.product.iiko_unit,

          остаток:
            item.startStock,

          расход_7д:
            item.weeklyUsage,

          расход_день:
            item.dailyUsage,

          case_size:
            item.caseToBase,

          запас:
            item.safetyStock,

          поставка:
            item.deliveryDate,

          до:
            item.coverageEndDate,

          заказ_case:
            item.recommendedCases,

          заказ_ед:
            item.recommendedBaseQty,

          shortage:
            item.hasShortage
              ? "🔴"
              : "✅",

          shortage_до_машины:
            item.hasShortageBeforeDelivery
              ? "🔴"
              : "✅",

          первый_shortage:
            item.firstShortageDate ||
            ""

        };

      }

    );

  }


  function debugGeneral() {

    console.log(
      "[Step 3 General] Incoming headers:",
      generalIncoming?.headers ||
      []
    );


    return debugResultGroup(

      "[Step 3] REAL GENERAL DATA",

      generalResults,

      function (item) {

        const first =
          item.deliveries?.[0];


        const second =
          item.deliveries?.[1];


        return {

          товар:
            item.product.name,

          код:
            item.product.iiko_code,

          ед:
            item.product.iiko_unit,

          остаток:
            item.startStock,

          расход_7д:
            item.weeklyUsage,

          расход_день:
            item.dailyUsage,

          case_size:
            item.caseToBase,

          запас:
            item.safetyStock,

          incoming:
            item.knownDeliveries
              ?.map(
                function (delivery) {

                  return (
                    `${delivery.date}: ${delivery.qty}`
                  );

                }
              )
              .join(" | ") ||
            "",

          поставка_1:
            first?.date ||
            "",

          case_1:
            first
              ?.recommendedCases ??
            "",

          поставка_2:
            second?.date ||
            "",

          case_2:
            second
              ?.recommendedCases ??
            "",

          всего_case:
            item.totalRecommendedCases,

          shortage:
            item.hasShortage
              ? "🔴"
              : "✅",

          shortage_до_машины:
            item.hasShortageBeforeFirstDelivery
              ? "🔴"
              : "✅",

          первый_shortage:
            item.firstShortageDate ||
            ""

        };

      }

    );

  }


  function debugFresh() {

    console.log(
      "[Step 3 Fresh] Incoming headers:",
      freshIncoming?.headers ||
      []
    );


    return debugResultGroup(

      "[Step 3] REAL FRESH DATA",

      freshResults,

      function (item) {

        const first =
          item.deliveries?.[0];


        const second =
          item.deliveries?.[1];


        return {

          товар:
            item.product.name,

          код:
            item.product.iiko_code,

          ед:
            item.product.iiko_unit,

          остаток:
            item.startStock,

          партии:
            item.startLots?.length ||
            0,

          расход_7д:
            item.weeklyUsage,

          расход_день:
            item.dailyUsage,

          case_size:
            item.caseToBase,

          запас:
            item.safetyStock,

          поставка_1:
            first?.date ||
            "",

          case_1:
            first
              ?.recommendedCases ??
            "",

          поставка_2:
            second?.date ||
            "",

          case_2:
            second
              ?.recommendedCases ??
            "",

          всего_case:
            item.totalRecommendedCases,

          просрочится:
            item.totalExpiredQty,

          shortage:
            item.hasShortage
              ? "🔴"
              : "✅",

          первый_shortage:
            item.firstShortageDate ||
            ""

        };

      }

    );

  }


  /* =====================================================
     UI ACTIONS
  ===================================================== */

  async function handleBack() {

    if (
      appContext &&
      typeof appContext.goToStep ===
        "function"
    ) {

      await appContext.goToStep(
        2
      );

    }

  }


  async function loadDeliveryOverrides() {

    generalDeliveryOverrides =
      new Map();


    freshDeliveryOverrides =
      new Map();


    const savedRows =
      await window
        .OrderStep3Save
        .load(
          weeklyOrder.id
        );


    savedRows
      .filter(
        function (row) {

          return (
            (
              row.section === "general" ||
              row.section === "fresh"
            ) &&
            row.calculation_meta
              ?.manual_override ===
              true
          );

        }
      )
      .forEach(
        function (row) {

          if (
            !row.product_id ||
            !row.delivery_date
          ) {

            return;

          }


          const overrideStore =
            row.section === "fresh"

              ? freshDeliveryOverrides

              : generalDeliveryOverrides;


          if (
            !overrideStore.has(
              row.product_id
            )
          ) {

            overrideStore.set(
              row.product_id,
              new Map()
            );

          }


          overrideStore
            .get(
              row.product_id
            )
            .set(
              row.delivery_date,
              Math.max(
                0,
                Math.round(
                  Number(
                    row.recommended_case_qty
                  ) || 0
                )
              )
            );

        }
      );

  }


  async function handleNext() {

    const button =
      root.querySelector(
        "#step3-next-button"
      );


    if (button) {

      button.disabled =
        true;

    }


    try {

      await saveResults();


      if (
        appContext &&
        typeof appContext.goToStep ===
          "function"
      ) {

        await appContext.goToStep(
          4
        );

      }

    } catch (error) {

      console.error(
        "Step 3 -> Step 4:",
        error
      );


      alert(
        error.message ||
        "Не удалось открыть итоговый заказ."
      );


      if (button) {

        button.disabled =
          false;


        button.removeAttribute(
          "disabled"
        );

      }

    }

  }


  async function handleGeneralDeliveryChange(
    change
  ) {

    const productId =
      change?.productId;


    const deliveryDate =
      change?.deliveryDate;


    if (
      !productId ||
      !deliveryDate
    ) {

      throw new Error(
        "Не удалось определить товар или дату поставки."
      );

    }


    let overrides =
      generalDeliveryOverrides.get(
        productId
      );


    if (!overrides) {

      overrides =
        new Map();


      generalDeliveryOverrides.set(
        productId,
        overrides
      );

    }


    if (
      change.mode === "auto"
    ) {

      overrides.delete(
        deliveryDate
      );


      if (!overrides.size) {

        generalDeliveryOverrides.delete(
          productId
        );

      }

    } else {

      const cases =
        Math.max(
          0,
          Math.round(
            Number(change.cases) || 0
          )
        );


      overrides.set(
        deliveryDate,
        cases
      );

    }


    const resultIndex =
      generalResults.findIndex(
        function (item) {

          return (
            item.product?.id ===
            productId
          );

        }
      );


    const product =
      generalProducts.find(
        function (item) {

          return (
            item.id ===
            productId
          );

        }
      );


    if (
      resultIndex < 0 ||
      !product
    ) {

      throw new Error(
        "Товар для перерасчета не найден."
      );

    }


    generalResults[
      resultIndex
    ] = {

      ok:
        true,

      ...calculateGeneralProduct(
        product
      )

    };


    await saveResults();


    renderCalculation(
      "general"
    );

  }


  async function handleFreshDeliveryChange(
    change
  ) {

    const productId =
      change?.productId;


    const deliveryDate =
      change?.deliveryDate;


    if (
      !productId ||
      !deliveryDate
    ) {

      throw new Error(
        "Не удалось определить Fresh товар или дату поставки."
      );

    }


    let overrides =
      freshDeliveryOverrides.get(
        productId
      );


    if (!overrides) {

      overrides =
        new Map();


      freshDeliveryOverrides.set(
        productId,
        overrides
      );

    }


    if (
      change.mode === "auto"
    ) {

      overrides.delete(
        deliveryDate
      );


      if (!overrides.size) {

        freshDeliveryOverrides.delete(
          productId
        );

      }

    } else {

      const cases =
        Math.max(
          0,
          Math.round(
            Number(change.cases) || 0
          )
        );


      overrides.set(
        deliveryDate,
        cases
      );

    }


    const resultIndex =
      freshResults.findIndex(
        function (item) {

          return (
            item.product?.id ===
            productId
          );

        }
      );


    const product =
      freshProducts.find(
        function (item) {

          return (
            item.id ===
            productId
          );

        }
      );


    if (
      resultIndex < 0 ||
      !product
    ) {

      throw new Error(
        "Fresh товар для перерасчета не найден."
      );

    }


    freshResults[
      resultIndex
    ] = {

      ok:
        true,

      ...calculateFreshProduct(
        product
      )

    };


    await saveResults();


    renderCalculation(
      "fresh"
    );

  }


  function renderCalculation(
    activeTab = "cola"
  ) {

    window.OrderStep3UI.render({

      container:
        root,

      weeklyOrder,

      colaResults,

      generalResults,

      freshResults,

      activeTab,

      onBack:
        handleBack,

      onNext:
        handleNext,

      onGeneralDeliveryChange:
        handleGeneralDeliveryChange,

      onFreshDeliveryChange:
        handleFreshDeliveryChange

    });

  }


  /* =====================================================
     LOAD REAL DATA
  ===================================================== */

  async function loadRealData() {

    await loadUserContext();

    await loadWeeklyOrder();


    await loadDeliveryOverrides();


    await Promise.all([

      loadProducts(),

      loadStock(),

      loadSales(),

      loadSchedules()

    ]);


    await loadFreshLots();


    await Promise.all([

      loadColaIncoming(),

      loadGeneralIncoming(),

      loadFreshIncoming()

    ]);


    calculateAllCola();

    calculateAllGeneral();

    calculateAllFresh();


    const saveResult =
      await saveResults();


    console.log(
      "[Step 3 Calculation] results saved:",
      saveResult
    );


    renderCalculation(
      "cola"
    );


    /*
      Расчет сохранен —
      открываем кнопку Далее.
    */

    const nextButton =
      root.querySelector(
        "#step3-next-button"
      );


    if (nextButton) {

      nextButton.disabled =
        false;


      nextButton.removeAttribute(
        "disabled"
      );


      nextButton.classList.remove(
        "is-disabled"
      );

    }


    console.log(
      "[Step 3 Calculation] Step 4 button enabled"
    );


    debugCola();

    debugGeneral();

    debugFresh();

  }


  /* =====================================================
     RESET
  ===================================================== */

  function resetState() {

    userId =
      null;


    restaurantId =
      null;


    weeklyOrder =
      null;


    stockMap =
      new Map();


    salesMap =
      new Map();


    freshLotsMap =
      new Map();


    colaProducts =
      [];


    generalProducts =
      [];


    freshProducts =
      [];


    colaSchedule =
      [];


    generalSchedule =
      [];


    colaIncoming =
      null;


    generalIncoming =
      null;


    freshIncoming =
      null;


    colaResults =
      [];


    generalResults =
      [];


    freshResults =
      [];


    generalDeliveryOverrides =
      new Map();


    freshDeliveryOverrides =
      new Map();

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(
    container,
    context
  ) {

    root =
      container;


    appContext =
      context ||
      null;


    resetState();


    try {

      await loadModules();

      validateModules();


      console.log(
        "[Step 3 Calculation] modules ready"
      );


      await loadRealData();


      console.log(
        "[Step 3 Calculation] real Cola + General + Fresh calculation ready"
      );


    } catch (error) {

      console.error(
        "[Step 3 Calculation] init error:",
        error
      );


      if (
        window.OrderStep3UI &&
        typeof window
          .OrderStep3UI
          .showError ===
        "function"
      ) {

        window.OrderStep3UI.showError(
          root,
          error
        );

      }


      throw error;

    }

  }


  /* =====================================================
     RELOAD
  ===================================================== */

  async function reload() {

    if (!root) {

      return;

    }


    resetState();


    await loadModules();

    validateModules();

    await loadRealData();

  }


  /* =====================================================
     GETTERS
  ===================================================== */

  function getColaResults() {

    return colaResults;

  }


  function getGeneralResults() {

    return generalResults;

  }


  function getFreshResults() {

    return freshResults;

  }


  function getWeeklyOrder() {

    return weeklyOrder;

  }


  /* =====================================================
     PUBLIC
  ===================================================== */

  window.OrderStep3Calculation = {

    init,

    reload,

    saveResults,

    debugCola,

    debugGeneral,

    debugFresh,

    getColaResults,

    getGeneralResults,

    getFreshResults,

    getWeeklyOrder

  };


  console.log(
    "[Step 3 Calculation] controller registered"
  );

})();

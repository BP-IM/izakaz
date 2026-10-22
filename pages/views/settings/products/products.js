/* =====================================================
   I’M | ЗАКАЗ
   SETTINGS — ORDER PRODUCTS

   - список товаров
   - поиск
   - категории
   - active / inactive
   - добавление
   - редактирование
   - deactivate / activate
   - delete
===================================================== */

(function () {
  "use strict";


  /* =====================================================
     CONSTANTS
  ===================================================== */

  const CATEGORY_NAMES = {
    cola: "Cola",
    fresh: "Fresh",
    freezer: "Freezer",
    cooler: "Cooler",
    dry: "Сухой",
    chemistry: "Химия",
    household: "Хоз. товары",
    other: "Другое"
  };


  const CATEGORY_ORDER = [
    "cola",
    "fresh",
    "freezer",
    "cooler",
    "dry",
    "chemistry",
    "household",
    "other"
  ];


  /* =====================================================
     STATE
  ===================================================== */

  let root = null;

  let restaurantId = null;

  let userId = null;

  let products = [];

  let currentCategory = "all";

  let currentStatus = "all";

  let searchQuery = "";

  let deleteProductId = null;


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

    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {

      return "—";

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


  function getCategoryName(category) {

    return (
      CATEGORY_NAMES[category] ||
      category ||
      "—"
    );

  }


  function normalizeSearch(value) {

    return String(value ?? "")
      .trim()
      .toLowerCase();
  }


  /* =====================================================
     USER / RESTAURANT
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
     MESSAGE
  ===================================================== */

  function showMessage(
    text,
    type = "success"
  ) {

    const element =
      root?.querySelector(
        "#order-products-message"
      );


    if (!element) {
      return;
    }


    element.hidden =
      false;


    element.className =
      `order-products-message is-${type}`;


    element.textContent =
      text;


    window.clearTimeout(
      showMessage.timer
    );


    showMessage.timer =
      window.setTimeout(
        function () {

          if (element) {

            element.hidden =
              true;

          }

        },
        3500
      );

  }


  /* =====================================================
     FORM MESSAGE
  ===================================================== */

  function setFormMessage(
    text,
    type = ""
  ) {

    const element =
      root?.querySelector(
        "#order-products-form-message"
      );


    if (!element) {
      return;
    }


    element.textContent =
      text || "";


    element.className =
      "order-products-form-message";


    if (type) {

      element.classList.add(
        `is-${type}`
      );

    }

  }


  /* =====================================================
     LOAD PRODUCTS
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

        .order(
          "category",
          {
            ascending: true
          }
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


    products =
      data || [];

  }


  /* =====================================================
     FILTER
  ===================================================== */

  function getFilteredProducts() {

    const query =
      normalizeSearch(
        searchQuery
      );


    return products.filter(
      function (product) {

        if (
          currentCategory !==
            "all"

          &&

          product.category !==
            currentCategory
        ) {

          return false;

        }


        if (
          currentStatus ===
            "active"

          &&

          !product.is_active
        ) {

          return false;

        }


        if (
          currentStatus ===
            "inactive"

          &&

          product.is_active
        ) {

          return false;

        }


        if (!query) {
          return true;
        }


        const searchText =
          [

            product.name,

            product.iiko_code,

            product.iiko_name,

            getCategoryName(
              product.category
            )

          ]
            .join(" ")
            .toLowerCase();


        return searchText.includes(
          query
        );

      }
    );

  }


  /* =====================================================
     STATS
  ===================================================== */

  function renderStats() {

    const total =
      products.length;


    const active =
      products.filter(
        function (product) {

          return Boolean(
            product.is_active
          );

        }
      ).length;


    const inactive =
      total - active;


    const totalElement =
      root.querySelector(
        "#order-products-stat-total"
      );


    const activeElement =
      root.querySelector(
        "#order-products-stat-active"
      );


    const inactiveElement =
      root.querySelector(
        "#order-products-stat-inactive"
      );


    if (totalElement) {

      totalElement.textContent =
        String(total);

    }


    if (activeElement) {

      activeElement.textContent =
        String(active);

    }


    if (inactiveElement) {

      inactiveElement.textContent =
        String(inactive);

    }

  }


  /* =====================================================
     CATEGORIES
  ===================================================== */

  function getAvailableCategories() {

    const categorySet =
      new Set(
        products.map(
          function (product) {

            return product.category;

          }
        )
      );


    const known =
      CATEGORY_ORDER.filter(
        function (category) {

          return categorySet.has(
            category
          );

        }
      );


    const unknown =
      Array.from(
        categorySet
      )
        .filter(
          function (category) {

            return !CATEGORY_ORDER.includes(
              category
            );

          }
        );


    return [
      ...known,
      ...unknown
    ];

  }


  function renderCategories() {

    const container =
      root.querySelector(
        "#order-products-categories"
      );


    if (!container) {
      return;
    }


    const categories =
      getAvailableCategories();


    container.innerHTML = `
      <button
        class="
          order-products-category
          ${
            currentCategory ===
              "all"
              ? "is-active"
              : ""
          }
        "
        type="button"
        data-order-category="all"
      >
        Все
      </button>

      ${categories
        .map(
          function (category) {

            const count =
              products.filter(
                function (product) {

                  return (
                    product.category ===
                    category
                  );

                }
              ).length;


            return `
              <button
                class="
                  order-products-category
                  ${
                    currentCategory ===
                      category
                      ? "is-active"
                      : ""
                  }
                "
                type="button"
                data-order-category="${escapeHTML(
                  category
                )}"
              >
                ${escapeHTML(
                  getCategoryName(
                    category
                  )
                )}
                ·
                ${count}
              </button>
            `;

          }
        )
        .join("")}
    `;

  }


  /* =====================================================
     TABLE
  ===================================================== */

  function renderProducts() {

    const body =
      root.querySelector(
        "#order-products-body"
      );


    const loading =
      root.querySelector(
        "#order-products-loading"
      );


    const empty =
      root.querySelector(
        "#order-products-empty"
      );


    const tableWrap =
      root.querySelector(
        "#order-products-table-wrap"
      );


    if (
      !body ||
      !loading ||
      !empty ||
      !tableWrap
    ) {

      return;

    }


    loading.hidden =
      true;


    const filtered =
      getFilteredProducts();


    if (!filtered.length) {

      tableWrap.hidden =
        true;


      empty.hidden =
        false;


      return;

    }


    empty.hidden =
      true;


    tableWrap.hidden =
      false;


    body.innerHTML =
      filtered
        .map(
          function (
            product,
            index
          ) {

            return `
              <tr
                class="
                  ${
                    product.is_active
                      ? ""
                      : "is-inactive"
                  }
                "
              >

                <td>
                  ${index + 1}
                </td>


                <td>

                  <strong
                    class="order-products-product-name"
                  >
                    ${escapeHTML(
                      product.name
                    )}
                  </strong>

                  <span
                    class="order-products-product-code"
                  >
                    IIKO:
                    ${escapeHTML(
                      product.iiko_code
                    )}
                  </span>

                </td>


                <td>

                  <span
                    class="order-products-category-badge"
                  >
                    ${escapeHTML(
                      getCategoryName(
                        product.category
                      )
                    )}
                  </span>

                </td>


                <td>
                  ${escapeHTML(
                    formatNumber(
                      product.case_to_base
                    )
                  )}
                </td>


                <td>
                  ${escapeHTML(
                    formatNumber(
                      product.slv_to_base
                    )
                  )}
                </td>


                <td>
                  ${escapeHTML(
                    product.iiko_unit ||
                    "—"
                  )}
                </td>


                <td>
                  ${escapeHTML(
                    formatNumber(
                      product.safety_stock
                    )
                  )}
                </td>


                <td>

                  <span
                    class="
                      order-products-status
                      ${
                        product.is_active
                          ? "is-active"
                          : "is-inactive"
                      }
                    "
                  >
                    ${
                      product.is_active
                        ? "Активен"
                        : "Неактивен"
                    }
                  </span>

                </td>


                <td>

                  <div class="order-products-actions">

                    <button
                      class="order-products-action-button"
                      type="button"
                      data-order-product-edit="${escapeHTML(
                        product.id
                      )}"
                    >
                      Изменить
                    </button>


                    <button
                      class="
                        order-products-action-button
                        ${
                          product.is_active
                            ? "is-toggle"
                            : "is-activate"
                        }
                      "
                      type="button"
                      data-order-product-toggle="${escapeHTML(
                        product.id
                      )}"
                    >
                      ${
                        product.is_active
                          ? "Деактивировать"
                          : "Активировать"
                      }
                    </button>


                    <button
                      class="
                        order-products-action-button
                        is-delete
                      "
                      type="button"
                      data-order-product-delete="${escapeHTML(
                        product.id
                      )}"
                    >
                      Удалить
                    </button>

                  </div>

                </td>

              </tr>
            `;

          }
        )
        .join("");

  }


  /* =====================================================
     RENDER ALL
  ===================================================== */

  function renderAll() {

    renderStats();

    renderCategories();

    renderProducts();

  }


  /* =====================================================
     PRODUCT MODAL
  ===================================================== */

  function openProductModal(
    product = null
  ) {

    const modal =
      root.querySelector(
        "#order-products-modal"
      );


    const form =
      root.querySelector(
        "#order-products-form"
      );


    if (
      !modal ||
      !form
    ) {

      return;

    }


    form.reset();


    setFormMessage("");


    root.querySelector(
      "#order-products-product-id"
    ).value =
      product?.id || "";


    root.querySelector(
      "#order-products-name"
    ).value =
      product?.name || "";


    root.querySelector(
      "#order-products-iiko-code"
    ).value =
      product?.iiko_code || "";


    /*
      Старые категории
      chemistry / household / other
      мы больше не предлагаем
      при создании новых товаров.

      Но если редактируется старый товар,
      временно добавляем option,
      чтобы форма не ломалась.
    */

    const categorySelect =
      root.querySelector(
        "#order-products-category"
      );


    if (
      product?.category &&
      !Array.from(
        categorySelect.options
      ).some(
        function (option) {

          return (
            option.value ===
            product.category
          );

        }
      )
    ) {

      const option =
        document.createElement(
          "option"
        );


      option.value =
        product.category;


      option.textContent =
        getCategoryName(
          product.category
        );


      categorySelect.appendChild(
        option
      );

    }


    categorySelect.value =
      product?.category ||
      (
        currentCategory !==
          "all"
          ? currentCategory
          : "cola"
      );


    root.querySelector(
      "#order-products-unit"
    ).value =
      product?.iiko_unit ||
      "шт";


    root.querySelector(
      "#order-products-case"
    ).value =
      product?.case_to_base ??
      "";


    root.querySelector(
      "#order-products-slv"
    ).value =
      product?.slv_to_base ??
      "";


    root.querySelector(
      "#order-products-pcs"
    ).value =
      product?.pcs_to_base ??
      1;


    root.querySelector(
      "#order-products-safety"
    ).value =
      product?.safety_stock ??
      0;


    root.querySelector(
      "#order-products-modal-title"
    ).textContent =
      product
        ? "Изменить товар"
        : "Добавить товар";


    root.querySelector(
      "#order-products-save-button"
    ).textContent =
      product
        ? "Сохранить изменения"
        : "Добавить товар";


    modal.classList.add(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "false"
    );


    document.body.classList.add(
      "order-products-modal-open"
    );


    window.setTimeout(
      function () {

        root
          .querySelector(
            "#order-products-name"
          )
          ?.focus();

      },
      50
    );

  }


  function closeProductModal() {

    const modal =
      root.querySelector(
        "#order-products-modal"
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


    document.body.classList.remove(
      "order-products-modal-open"
    );

  }


  /* =====================================================
     SAVE PRODUCT
  ===================================================== */

  async function saveProduct(event) {

    event.preventDefault();


    const id =
      root.querySelector(
        "#order-products-product-id"
      ).value.trim();


    const category =
      root.querySelector(
        "#order-products-category"
      ).value;


    const name =
      root.querySelector(
        "#order-products-name"
      ).value.trim();


    const iikoCode =
      root.querySelector(
        "#order-products-iiko-code"
      ).value.trim();


    if (
      !name ||
      !iikoCode
    ) {

      setFormMessage(
        "Заполните название и IIKO код.",
        "error"
      );


      return;

    }


    const payload = {

      category,

      delivery_group:
        category === "cola"
          ? "cola"
          : "general",

      name,

      iiko_code:
        iikoCode,

      iiko_unit:
        root.querySelector(
          "#order-products-unit"
        ).value,

      case_to_base:
        toNullableNumber(
          root.querySelector(
            "#order-products-case"
          ).value
        ),

      slv_to_base:
        toNullableNumber(
          root.querySelector(
            "#order-products-slv"
          ).value
        ),

      pcs_to_base:
        toNullableNumber(
          root.querySelector(
            "#order-products-pcs"
          ).value
        ) ?? 1,

      safety_stock:
        toNullableNumber(
          root.querySelector(
            "#order-products-safety"
          ).value
        ) ?? 0

    };


    const button =
      root.querySelector(
        "#order-products-save-button"
      );


    button.disabled =
      true;


    setFormMessage(
      "Сохранение...",
      "loading"
    );


    try {

      if (id) {

        const {
          error
        } =
          await supabaseClient

            .from(
              "order_products"
            )

            .update(
              payload
            )

            .eq(
              "id",
              id
            )

            .eq(
              "restaurant_id",
              restaurantId
            );


        if (error) {
          throw error;
        }


        showMessage(
          "Товар обновлён."
        );

      }

      else {

        const sameCategoryProducts =
          products.filter(
            function (product) {

              return (
                product.category ===
                category
              );

            }
          );


        const maxSortOrder =
          sameCategoryProducts.reduce(
            function (
              max,
              product
            ) {

              return Math.max(
                max,
                Number(
                  product.sort_order || 0
                )
              );

            },
            0
          );


        const {
          error
        } =
          await supabaseClient

            .from(
              "order_products"
            )

            .insert({

              ...payload,

              restaurant_id:
                restaurantId,

              sort_order:
                maxSortOrder + 1,

              is_active:
                true

            });


        if (error) {
          throw error;
        }


        showMessage(
          "Товар добавлен."
        );

      }


      await loadProducts();


      closeProductModal();


      renderAll();


    } catch (error) {

      console.error(
        "Order product save:",
        error
      );


      const message =
        error.code === "23505"

          ? "Товар с таким IIKO кодом уже существует."

          : (
              error.message ||
              "Ошибка сохранения."
            );


      setFormMessage(
        message,
        "error"
      );

    } finally {

      button.disabled =
        false;

    }

  }


  /* =====================================================
     ACTIVATE / DEACTIVATE
  ===================================================== */

  async function toggleProduct(
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


    const newStatus =
      !product.is_active;


    try {

      const {
        error
      } =
        await supabaseClient

          .from(
            "order_products"
          )

          .update({
            is_active:
              newStatus
          })

          .eq(
            "id",
            productId
          )

          .eq(
            "restaurant_id",
            restaurantId
          );


      if (error) {
        throw error;
      }


      product.is_active =
        newStatus;


      renderAll();


      showMessage(

        newStatus
          ? "Товар активирован."
          : "Товар деактивирован."

      );


    } catch (error) {

      console.error(
        "Toggle product:",
        error
      );


      showMessage(
        error.message ||
        "Не удалось изменить статус товара.",
        "error"
      );

    }

  }


  /* =====================================================
     DELETE MODAL
  ===================================================== */

  function openDeleteModal(
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


    deleteProductId =
      productId;


    const modal =
      root.querySelector(
        "#order-products-delete-modal"
      );


    const name =
      root.querySelector(
        "#order-products-delete-name"
      );


    if (name) {

      name.textContent =
        product.name;

    }


    modal.classList.add(
      "is-open"
    );


    modal.setAttribute(
      "aria-hidden",
      "false"
    );


    document.body.classList.add(
      "order-products-modal-open"
    );

  }


  function closeDeleteModal() {

    const modal =
      root.querySelector(
        "#order-products-delete-modal"
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


    document.body.classList.remove(
      "order-products-modal-open"
    );


    deleteProductId =
      null;

  }


  /* =====================================================
     DELETE PRODUCT
  ===================================================== */

  async function deleteProduct() {

    if (!deleteProductId) {
      return;
    }


    const productId =
      deleteProductId;


    const button =
      root.querySelector(
        "#order-products-delete-confirm"
      );


    button.disabled =
      true;


    button.textContent =
      "Удаление...";


    try {

      const {
        error
      } =
        await supabaseClient

          .from(
            "order_products"
          )

          .delete()

          .eq(
            "id",
            productId
          )

          .eq(
            "restaurant_id",
            restaurantId
          );


      if (error) {
        throw error;
      }


      products =
        products.filter(
          function (product) {

            return (
              product.id !==
              productId
            );

          }
        );


      closeDeleteModal();


      renderAll();


      showMessage(
        "Товар удалён."
      );


    } catch (error) {

      console.error(
        "Delete product:",
        error
      );


      closeDeleteModal();


      /*
        Если есть связанные записи
        прошлых заказов, Supabase/Postgres
        может запретить hard delete.
      */

      if (
        error.code === "23503"
      ) {

        showMessage(
          "Этот товар уже использовался в заказах. Удаление запрещено — деактивируйте его.",
          "error"
        );

      }

      else {

        showMessage(
          error.message ||
          "Не удалось удалить товар.",
          "error"
        );

      }

    } finally {

      button.disabled =
        false;


      button.textContent =
        "Удалить";

    }

  }


  /* =====================================================
     EVENTS
  ===================================================== */

  function bindEvents() {

    /*
      SEARCH
    */

    root
      .querySelector(
        "#order-products-search"
      )
      ?.addEventListener(
        "input",
        function (event) {

          searchQuery =
            event.target.value;


          renderProducts();

        }
      );


    /*
      STATUS
    */

    root
      .querySelector(
        "#order-products-status-filter"
      )
      ?.addEventListener(
        "change",
        function (event) {

          currentStatus =
            event.target.value;


          renderProducts();

        }
      );


    /*
      FORM
    */

    root
      .querySelector(
        "#order-products-form"
      )
      ?.addEventListener(
        "submit",
        saveProduct
      );


    /*
      DELETE CONFIRM
    */

    root
      .querySelector(
        "#order-products-delete-confirm"
      )
      ?.addEventListener(
        "click",
        deleteProduct
      );


    /*
      CLICK DELEGATION
    */

    root.addEventListener(
      "click",
      function (event) {

        /*
          ADD
        */

        if (
          event.target.closest(
            "#order-products-add-button"
          )
        ) {

          openProductModal();


          return;

        }


        /*
          CATEGORY
        */

        const categoryButton =
          event.target.closest(
            "[data-order-category]"
          );


        if (categoryButton) {

          currentCategory =
            categoryButton.dataset
              .orderCategory;


          renderCategories();

          renderProducts();


          return;

        }


        /*
          EDIT
        */

        const editButton =
          event.target.closest(
            "[data-order-product-edit]"
          );


        if (editButton) {

          const product =
            products.find(
              function (item) {

                return (
                  item.id ===
                  editButton.dataset
                    .orderProductEdit
                );

              }
            );


          if (product) {

            openProductModal(
              product
            );

          }


          return;

        }


        /*
          ACTIVE / INACTIVE
        */

        const toggleButton =
          event.target.closest(
            "[data-order-product-toggle]"
          );


        if (toggleButton) {

          toggleProduct(
            toggleButton.dataset
              .orderProductToggle
          );


          return;

        }


        /*
          DELETE
        */

        const deleteButton =
          event.target.closest(
            "[data-order-product-delete]"
          );


        if (deleteButton) {

          openDeleteModal(
            deleteButton.dataset
              .orderProductDelete
          );


          return;

        }


        /*
          PRODUCT MODAL CLOSE
        */

        if (
          event.target.closest(
            "[data-order-products-modal-close]"
          )
        ) {

          closeProductModal();


          return;

        }


        /*
          DELETE MODAL CLOSE
        */

        if (
          event.target.closest(
            "[data-order-products-delete-close]"
          )
        ) {

          closeDeleteModal();

        }

      }
    );


    /*
      ESC
    */

    document.addEventListener(
      "keydown",
      function (event) {

        if (
          event.key !==
          "Escape"
        ) {

          return;

        }


        closeProductModal();

        closeDeleteModal();

      }
    );

  }


  /* =====================================================
     INIT
  ===================================================== */

  async function init(container) {

    root =
      container.querySelector(
        "#order-products-settings"
      );


    if (!root) {

      throw new Error(
        "Order Products root не найден."
      );

    }


    restaurantId =
      null;


    userId =
      null;


    products =
      [];


    currentCategory =
      "all";


    currentStatus =
      "all";


    searchQuery =
      "";


    deleteProductId =
      null;


    bindEvents();


    try {

      await loadUserContext();


      await loadProducts();


      renderAll();


      console.log(
        "[Order Products] initialized",
        {
          restaurant_id:
            restaurantId,

          products:
            products.length
        }
      );


    } catch (error) {

      console.error(
        "Order Products init:",
        error
      );


      const loading =
        root.querySelector(
          "#order-products-loading"
        );


      if (loading) {

        loading.innerHTML = `
          <strong>
            Ошибка загрузки
          </strong>

          <br><br>

          ${escapeHTML(
            error.message ||
            String(error)
          )}
        `;

      }

    }

  }


  /* =====================================================
     PUBLIC API
  ===================================================== */

  window.OrderProductsSettings = {

    init,


    reload:
      async function () {

        if (
          !root ||
          !restaurantId
        ) {

          return;

        }


        await loadProducts();


        renderAll();

      }

  };

})();
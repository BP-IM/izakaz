/* =====================================================
   СПИСКИ ИНВЕНТАРИЗАЦИИ
===================================================== */

(function () {
  "use strict";

  const WEEKDAYS = {
    1: "Понедельник",
    2: "Вторник",
    3: "Среда",
    4: "Четверг",
    5: "Пятница",
    6: "Суббота",
    7: "Воскресенье"
  };

  const state = {
    userId: null,
    restaurantId: null,
    userRole: null,

    selectedWeekday: 1,

    categories: [],
    products: [],
    dayItems: [],

    searchQuery: "",
    editingCategoryId: null,
    editingProductId: null
  };

  let confirmModalResolver = null;


  /* =====================================================
     ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
  ===================================================== */

  function getElement(id) {
    return document.getElementById(id);
  }


  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }


  function normalizeText(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase();
  }


  function getTodayWeekday() {
    const jsDay = new Date().getDay();

    return jsDay === 0
      ? 7
      : jsDay;
  }


  function setButtonLoading(
    button,
    isLoading,
    loadingText = "Сохранение..."
  ) {
    if (!button) {
      return;
    }

    if (isLoading) {
      if (!button.dataset.originalText) {
        button.dataset.originalText =
          button.textContent.trim();
      }

      button.textContent =
        loadingText;

      button.disabled = true;

      return;
    }

    button.textContent =
      button.dataset.originalText ||
      "Сохранить";

    button.disabled = false;
  }


  /* =====================================================
     УВЕДОМЛЕНИЯ
  ===================================================== */

  function showToast(
    message,
    type = "success"
  ) {
    const container =
      getElement(
        "lists-toast-container"
      );

    if (!container) {
      return;
    }

    const toast =
      document.createElement("div");

    toast.className =
      `lists-toast ${type}`;

    toast.textContent =
      message;

    container.appendChild(toast);

    window.setTimeout(
      function () {
        toast.remove();
      },
      3500
    );
  }


  /* =====================================================
     СТАТУС СПИСКА
  ===================================================== */

  function setListStatus(
    text,
    type = "loading"
  ) {
    const status =
      getElement(
        "list-loading-status"
      );

    if (!status) {
      return;
    }

    status.textContent =
      text;

    status.dataset.status =
      type;
  }


  function showListLoading() {
    const container =
      getElement(
        "inventory-categories-container"
      );

    const emptyState =
      getElement(
        "inventory-list-empty"
      );

    if (emptyState) {
      emptyState.classList.add(
        "hidden"
      );
    }

    if (container) {
      container.innerHTML = `
        <div class="lists-loading-state">
          <div class="lists-loading-spinner"></div>

          <span>
            Загрузка списка...
          </span>
        </div>
      `;
    }

    setListStatus(
      "Загрузка",
      "loading"
    );
  }


  /* =====================================================
     ОБЫЧНЫЕ МОДАЛЬНЫЕ ОКНА
  ===================================================== */

  function openModal(modalId) {
    const modal =
      getElement(modalId);

    if (!modal) {
      return;
    }

    modal.classList.add("open");

    modal.setAttribute(
      "aria-hidden",
      "false"
    );

    document.body.style.overflow =
      "hidden";
  }


  function closeModal(modalId) {
    const modal =
      getElement(modalId);

    if (!modal) {
      return;
    }

    modal.classList.remove("open");

    modal.setAttribute(
      "aria-hidden",
      "true"
    );

    const openedModal =
      document.querySelector(
        ".lists-modal.open"
      );

    if (!openedModal) {
      document.body.style.overflow =
        "";
    }
  }


  function closeAllModals() {
    document
      .querySelectorAll(
        ".lists-modal.open"
      )
      .forEach(
        function (modal) {
          modal.classList.remove(
            "open"
          );

          modal.setAttribute(
            "aria-hidden",
            "true"
          );
        }
      );

    document.body.style.overflow =
      "";
  }


  /* =====================================================
     МОДАЛЬНОЕ ПОДТВЕРЖДЕНИЕ
  ===================================================== */

  function showConfirmModal(
    options = {}
  ) {
    const modal =
      getElement(
        "confirm-modal"
      );

    const titleElement =
      getElement(
        "confirm-modal-title"
      );

    const messageElement =
      getElement(
        "confirm-modal-message"
      );

    const submitButton =
      getElement(
        "confirm-modal-submit"
      );

    const title =
      options.title ||
      "Подтвердите действие";

    const message =
      options.message ||
      "Вы уверены, что хотите продолжить?";

    const confirmText =
      options.confirmText ||
      "Удалить";

    /*
      Резервный вариант, если HTML
      модального окна не найден.
    */

    if (
      !modal ||
      !titleElement ||
      !messageElement ||
      !submitButton
    ) {
      return Promise.resolve(
        window.confirm(message)
      );
    }

    titleElement.textContent =
      title;

    messageElement.textContent =
      message;

    submitButton.textContent =
      confirmText;

    submitButton.disabled =
      false;

    /*
      Если старое подтверждение по какой-то
      причине еще ожидает ответа.
    */

    if (confirmModalResolver) {
      confirmModalResolver(false);
      confirmModalResolver = null;
    }

    openModal(
      "confirm-modal"
    );

    return new Promise(
      function (resolve) {
        confirmModalResolver =
          resolve;
      }
    );
  }


  function finishConfirmModal(
    result
  ) {
    const resolver =
      confirmModalResolver;

    confirmModalResolver =
      null;

    closeModal(
      "confirm-modal"
    );

    if (resolver) {
      resolver(result);
    }
  }


  /* =====================================================
     ПРОФИЛЬ И РЕСТОРАН
  ===================================================== */

  async function loadCurrentProfile() {
    const {
      data: userData,
      error: userError
    } =
      await supabaseClient
        .auth
        .getUser();

    if (
      userError ||
      !userData.user
    ) {
      throw new Error(
        "Пользователь не авторизован."
      );
    }

    state.userId =
      userData.user.id;

    const {
      data: profile,
      error: profileError
    } =
      await supabaseClient
        .from("profiles")
        .select(`
          restaurant_id,
          role
        `)
        .eq(
          "id",
          state.userId
        )
        .single();

    if (profileError) {
      throw profileError;
    }

    if (!profile?.restaurant_id) {
      throw new Error(
        "Не найден ресторан пользователя."
      );
    }

    state.restaurantId =
      profile.restaurant_id;

    state.userRole =
      profile.role;
  }


  /* =====================================================
     ЗАГРУЗКА КАТЕГОРИЙ
  ===================================================== */

  async function loadCategories() {
    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "inventory_categories"
        )
        .select(`
          id,
          name,
          sort_order,
          is_active
        `)
        .eq(
          "restaurant_id",
          state.restaurantId
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

    state.categories =
      Array.isArray(data)
        ? data
        : [];
  }


  /* =====================================================
     ЗАГРУЗКА ТОВАРОВ
  ===================================================== */

  async function loadProducts() {
    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "inventory_products"
        )
        .select(`
          id,
          category_id,
          code,
          name,
          is_active
        `)
        .eq(
          "restaurant_id",
          state.restaurantId
        )
        .eq(
          "is_active",
          true
        )
        .order(
          "code",
          {
            ascending: true
          }
        );

    if (error) {
      throw error;
    }

    state.products =
      Array.isArray(data)
        ? data
        : [];
  }


  /* =====================================================
     ЗАГРУЗКА СПИСКА ВЫБРАННОГО ДНЯ
  ===================================================== */

  async function loadDayItems() {
    const {
      data,
      error
    } =
      await supabaseClient
        .from(
          "inventory_day_items"
        )
        .select(`
          id,
          product_id,
          weekday,
          sort_order,
          is_active
        `)
        .eq(
          "restaurant_id",
          state.restaurantId
        )
        .eq(
          "weekday",
          state.selectedWeekday
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
        );

    if (error) {
      throw error;
    }

    state.dayItems =
      Array.isArray(data)
        ? data
        : [];
  }


  /* =====================================================
     ЗАГРУЗКА ВСЕХ ДАННЫХ
  ===================================================== */

  async function loadInventoryList() {
    showListLoading();

    try {
      await Promise.all([
        loadCategories(),
        loadProducts(),
        loadDayItems()
      ]);

      populateCategorySelect();
      updatePageInformation();
      renderInventoryList();

      setListStatus(
        "Готово",
        "success"
      );

    } catch (error) {
      console.error(
        "Ошибка загрузки списков:",
        error
      );

      setListStatus(
        "Ошибка",
        "error"
      );

      showToast(
        error.message ||
        "Не удалось загрузить список.",
        "error"
      );
    }
  }


  /* =====================================================
     ЗАГОЛОВКИ И СТАТИСТИКА
  ===================================================== */

  function updatePageInformation() {
    const weekdayName =
      WEEKDAYS[
        state.selectedWeekday
      ];

    const selectedName =
      getElement(
        "selected-weekday-name"
      );

    const listTitle =
      getElement(
        "list-title-weekday"
      );

    const categoriesCount =
      getElement(
        "categories-count"
      );

    const productsCount =
      getElement(
        "products-count"
      );

    if (selectedName) {
      selectedName.textContent =
        weekdayName;
    }

    if (listTitle) {
      listTitle.textContent =
        weekdayName;
    }

    if (categoriesCount) {
        const selectedProducts =
            getSelectedDayProducts();

        const selectedCategoryIds =
            new Set(
            selectedProducts.map(
                function (product) {
                return product.category_id;
                }
            )
            );

        categoriesCount.textContent =
            String(
            selectedCategoryIds.size
            );
    }

    if (productsCount) {
      productsCount.textContent =
        String(
          state.dayItems.length
        );
    }
  }


  /* =====================================================
     SELECT КАТЕГОРИЙ
  ===================================================== */

  function populateCategorySelect() {
    const select =
      getElement(
        "product-category"
      );

    if (!select) {
      return;
    }

    const currentValue =
      select.value;

    select.innerHTML = `
      <option value="">
        Выберите раздел
      </option>

      ${state.categories
        .map(
          function (category) {
            return `
              <option
                value="${escapeHTML(category.id)}"
              >
                ${escapeHTML(category.name)}
              </option>
            `;
          }
        )
        .join("")}
    `;

    if (
      currentValue &&
      state.categories.some(
        function (category) {
          return (
            category.id ===
            currentValue
          );
        }
      )
    ) {
      select.value =
        currentValue;
    }
  }


  /* =====================================================
     ТОВАРЫ ВЫБРАННОГО ДНЯ
  ===================================================== */

  function getSelectedDayProducts() {
    return state.dayItems
      .map(
        function (dayItem) {
          const product =
            state.products.find(
              function (item) {
                return (
                  item.id ===
                  dayItem.product_id
                );
              }
            );

          if (!product) {
            return null;
          }

          return {
            ...product,

            dayItemId:
              dayItem.id,

            daySortOrder:
              dayItem.sort_order
          };
        }
      )
      .filter(Boolean)
      .sort(
        function (a, b) {
          return (
            Number(a.daySortOrder) -
            Number(b.daySortOrder)
          );
        }
      );
  }


  /* =====================================================
     ПОИСК
  ===================================================== */

  function productMatchesSearch(
    product
  ) {
    if (!state.searchQuery) {
      return true;
    }

    const search =
      normalizeText(
        state.searchQuery
      );

    return (
      normalizeText(product.code)
        .includes(search) ||
      normalizeText(product.name)
        .includes(search)
    );
  }


  /* =====================================================
     ОТОБРАЖЕНИЕ СПИСКА
  ===================================================== */

  function renderInventoryList() {
  const container =
    getElement(
      "inventory-categories-container"
    );

  const emptyState =
    getElement(
      "inventory-list-empty"
    );

  if (
    !container ||
    !emptyState
  ) {
    return;
  }


  /*
    Только товары выбранного дня.
  */

  const selectedProducts =
    getSelectedDayProducts();


  /*
    Если на выбранный день
    вообще нет товаров.
  */

  if (
    selectedProducts.length === 0
  ) {
    container.innerHTML = "";

    emptyState.classList.remove(
      "hidden"
    );

    return;
  }


  emptyState.classList.add(
    "hidden"
  );


  /*
    Применяем поиск.
  */

  const filteredProducts =
    selectedProducts.filter(
      productMatchesSearch
    );


  /*
    Если поиск ничего не нашел.
  */

  if (
    state.searchQuery &&
    filteredProducts.length === 0
  ) {
    container.innerHTML = `
      <div class="lists-loading-state">
        <span>
          По вашему запросу ничего не найдено.
        </span>
      </div>
    `;

    return;
  }


  /*
    Берем только категории,
    в которых есть товары
    на выбранный день.
  */

  const visibleCategoryIds =
    new Set(
      filteredProducts.map(
        function (product) {
          return product.category_id;
        }
      )
    );


  const visibleCategories =
    state.categories.filter(
      function (category) {
        return visibleCategoryIds.has(
          category.id
        );
      }
    );


  container.innerHTML =
    visibleCategories
      .map(
        function (
          category,
          categoryIndex
        ) {

          const categoryProducts =
            filteredProducts.filter(
              function (product) {
                return (
                  product.category_id ===
                  category.id
                );
              }
            );


          const productRows =
            categoryProducts
              .map(
                function (product) {
                  return `
                    <tr>

                      <td
                        class="inventory-table-number"
                      >
                        ${escapeHTML(
                          product.daySortOrder
                        )}
                      </td>

                      <td
                        class="inventory-table-code"
                      >
                        ${escapeHTML(
                          product.code
                        )}
                      </td>

                      <td>
                        ${escapeHTML(
                          product.name
                        )}
                      </td>

                      <td
                        class="inventory-table-actions"
                      >

                        <button
                          class="inventory-product-action"
                          type="button"
                          data-action="edit-product"
                          data-product-id="${escapeHTML(
                            product.id
                          )}"
                        >
                          Изменить
                        </button>

                        <button
                          class="inventory-product-action delete"
                          type="button"
                          data-action="delete-product"
                          data-product-id="${escapeHTML(
                            product.id
                          )}"
                        >
                          Удалить
                        </button>

                      </td>

                    </tr>
                  `;
                }
              )
              .join("");


          return `
            <article
              class="inventory-category-card"
              data-category-id="${escapeHTML(
                category.id
              )}"
            >

              <header
                class="inventory-category-header"
              >

                <div
                  class="inventory-category-title"
                >

                  <span
                    class="inventory-category-number"
                  >
                    ${categoryIndex + 1}
                  </span>

                  <h3>
                    ${escapeHTML(
                      category.name
                    )}
                  </h3>

                </div>


                <div
                  class="inventory-category-actions"
                >

                  <button
                    class="inventory-icon-button"
                    type="button"
                    data-action="edit-category"
                    data-category-id="${escapeHTML(
                      category.id
                    )}"
                    title="Изменить раздел"
                  >
                    ✎
                  </button>

                  <button
                    class="inventory-icon-button"
                    type="button"
                    data-action="delete-category"
                    data-category-id="${escapeHTML(
                      category.id
                    )}"
                    title="Удалить раздел полностью"
                  >
                    ×
                  </button>

                </div>

              </header>


              <div
                class="inventory-products-table-wrap"
              >

                <table
                  class="inventory-products-table"
                >

                  <thead>

                    <tr>

                      <th
                        class="inventory-table-number"
                      >
                        №
                      </th>

                      <th
                        class="inventory-table-code"
                      >
                        Код
                      </th>

                      <th>
                        Наименование
                      </th>

                      <th
                        class="inventory-table-actions"
                      >
                        Действия
                      </th>

                    </tr>

                  </thead>


                  <tbody>
                    ${productRows}
                  </tbody>

                </table>

              </div>

            </article>
          `;
        }
      )
      .join("");
 }


  /* =====================================================
     ВЫБОР ДНЯ
  ===================================================== */

  async function selectWeekday(
    weekday
  ) {
    const parsedWeekday =
      Number(weekday);

    if (
      !WEEKDAYS[parsedWeekday]
    ) {
      return;
    }

    state.selectedWeekday =
      parsedWeekday;

    document
      .querySelectorAll(
        ".weekday-tab"
      )
      .forEach(
        function (button) {
          const isActive =
            Number(
              button.dataset.weekday
            ) === parsedWeekday;

          button.classList.toggle(
            "active",
            isActive
          );
        }
      );

    await loadInventoryList();
  }


  /* =====================================================
     ДОБАВЛЕНИЕ КАТЕГОРИИ
  ===================================================== */

  function openAddCategoryModal() {
    state.editingCategoryId =
      null;

    const form =
      getElement(
        "category-form"
      );

    if (form) {
      form.reset();
    }

    const idInput =
      getElement(
        "category-id"
      );

    const sortOrderInput =
      getElement(
        "category-sort-order"
      );

    const title =
      getElement(
        "category-modal-title"
      );

    if (idInput) {
      idInput.value = "";
    }

    if (sortOrderInput) {
      const maximumSortOrder =
        state.categories.reduce(
          function (
            maximum,
            category
          ) {
            return Math.max(
              maximum,
              Number(
                category.sort_order
              ) || 0
            );
          },
          0
        );

      sortOrderInput.value =
        String(
          maximumSortOrder + 1
        );
    }

    if (title) {
      title.textContent =
        "Добавить раздел";
    }

    openModal(
      "category-modal"
    );

    window.setTimeout(
      function () {
        getElement(
          "category-name"
        )?.focus();
      },
      100
    );
  }


  /* =====================================================
     ИЗМЕНЕНИЕ КАТЕГОРИИ
  ===================================================== */

  function openEditCategoryModal(
    categoryId
  ) {
    const category =
      state.categories.find(
        function (item) {
          return (
            item.id ===
            categoryId
          );
        }
      );

    if (!category) {
      showToast(
        "Раздел не найден.",
        "error"
      );

      return;
    }

    state.editingCategoryId =
      category.id;

    getElement(
      "category-id"
    ).value =
      category.id;

    getElement(
      "category-name"
    ).value =
      category.name;

    getElement(
      "category-sort-order"
    ).value =
      String(
        category.sort_order
      );

    getElement(
      "category-modal-title"
    ).textContent =
      "Изменить раздел";

    openModal(
      "category-modal"
    );
  }


  /* =====================================================
     СОХРАНЕНИЕ КАТЕГОРИИ
  ===================================================== */

  async function saveCategory(
    event
  ) {
    event.preventDefault();

    const name =
      getElement(
        "category-name"
      )?.value.trim();

    const sortOrder =
      Number(
        getElement(
          "category-sort-order"
        )?.value || 0
      );

    const submitButton =
      getElement(
        "category-submit-button"
      );

    if (!name) {
      showToast(
        "Введите название раздела.",
        "error"
      );

      return;
    }

    if (
      !Number.isInteger(sortOrder) ||
      sortOrder < 0
    ) {
      showToast(
        "Укажите корректный порядок.",
        "error"
      );

      return;
    }

    setButtonLoading(
      submitButton,
      true
    );

    try {
      if (
        state.editingCategoryId
      ) {
        const { error } =
          await supabaseClient
            .from(
              "inventory_categories"
            )
            .update({
              name: name,
              sort_order: sortOrder
            })
            .eq(
              "id",
              state.editingCategoryId
            )
            .eq(
              "restaurant_id",
              state.restaurantId
            );

        if (error) {
          throw error;
        }

        showToast(
          "Раздел обновлен."
        );

      } else {
        const { error } =
          await supabaseClient
            .from(
              "inventory_categories"
            )
            .insert({
              restaurant_id:
                state.restaurantId,

              name: name,

              sort_order:
                sortOrder,

              is_active:
                true
            });

        if (error) {
          throw error;
        }

        showToast(
          "Раздел добавлен."
        );
      }

      closeModal(
        "category-modal"
      );

      await loadInventoryList();

    } catch (error) {
      console.error(
        "Ошибка сохранения категории:",
        error
      );

      if (
        error.code === "23505"
      ) {
        showToast(
          "Раздел с таким названием уже существует.",
          "error"
        );
      } else {
        showToast(
          error.message ||
          "Не удалось сохранить раздел.",
          "error"
        );
      }

    } finally {
      setButtonLoading(
        submitButton,
        false
      );
    }
  }


  /* =====================================================
     УДАЛЕНИЕ КАТЕГОРИИ
  ===================================================== */

  async function deleteCategory(
    categoryId
  ) {
    const category =
      state.categories.find(
        function (item) {
          return (
            item.id ===
            categoryId
          );
        }
      );

    if (!category) {
      return;
    }

    const categoryProducts =
      state.products.filter(
        function (product) {
          return (
            product.category_id ===
            categoryId
          );
        }
      );

    if (
        categoryProducts.length > 0
        ) {
        const selectedDayProductIds =
            new Set(
            state.dayItems.map(
                function (item) {
                return item.product_id;
                }
            )
            );


        const selectedDayProducts =
            categoryProducts.filter(
            function (product) {
                return selectedDayProductIds.has(
                product.id
                );
            }
            );


        if (
            selectedDayProducts.length === 0
        ) {
            showToast(
            `Раздел «${category.name}» используется в других днях инвентаризации, поэтому удалить его полностью нельзя.`,
            "error"
            );
        } else {
            showToast(
            `Сначала удалите или перенесите товары из раздела «${category.name}».`,
            "error"
            );
        }

        return;
    }

    const confirmed =
      await showConfirmModal({
        title:
          "Удалить раздел?",

        message:
          `Раздел «${category.name}» будет удален. ` +
          "Это действие нельзя отменить.",

        confirmText:
          "Удалить раздел"
      });

    if (!confirmed) {
      return;
    }

    try {
      const { error } =
        await supabaseClient
          .from(
            "inventory_categories"
          )
          .delete()
          .eq(
            "id",
            categoryId
          )
          .eq(
            "restaurant_id",
            state.restaurantId
          );

      if (error) {
        throw error;
      }

      showToast(
        "Раздел удален."
      );

      await loadInventoryList();

    } catch (error) {
      console.error(
        "Ошибка удаления категории:",
        error
      );

      showToast(
        error.message ||
        "Не удалось удалить раздел.",
        "error"
      );
    }
  }


  /* =====================================================
     СБРОС ФОРМЫ ТОВАРА
  ===================================================== */

  function resetProductForm() {
    const form =
      getElement(
        "product-form"
      );

    if (form) {
      form.reset();
    }

    state.editingProductId =
      null;

    const productIdInput =
      getElement(
        "product-id"
      );

    if (productIdInput) {
      productIdInput.value =
        "";
    }

    const sortOrderInput =
      getElement(
        "product-sort-order"
      );

    if (sortOrderInput) {
      const maximumSortOrder =
        state.dayItems.reduce(
          function (
            maximum,
            item
          ) {
            return Math.max(
              maximum,
              Number(
                item.sort_order
              ) || 0
            );
          },
          0
        );

      sortOrderInput.value =
        String(
          maximumSortOrder + 1
        );
    }

    document
      .querySelectorAll(
        'input[name="product-weekday"]'
      )
      .forEach(
        function (checkbox) {
          checkbox.checked =
            Number(
              checkbox.value
            ) ===
            state.selectedWeekday;
        }
      );
  }


  /* =====================================================
     ДОБАВЛЕНИЕ ТОВАРА
  ===================================================== */

  function openAddProductModal() {
    if (
      state.categories.length === 0
    ) {
      showToast(
        "Сначала добавьте хотя бы один раздел.",
        "error"
      );

      openAddCategoryModal();

      return;
    }

    resetProductForm();
    populateCategorySelect();

    getElement(
      "product-modal-title"
    ).textContent =
      "Добавить позицию";

    openModal(
      "product-modal"
    );

    window.setTimeout(
      function () {
        getElement(
          "product-code"
        )?.focus();
      },
      100
    );
  }


  /* =====================================================
     ИЗМЕНЕНИЕ ТОВАРА
  ===================================================== */

  async function openEditProductModal(
    productId
  ) {
    const product =
      state.products.find(
        function (item) {
          return (
            item.id ===
            productId
          );
        }
      );

    if (!product) {
      showToast(
        "Позиция не найдена.",
        "error"
      );

      return;
    }

    state.editingProductId =
      product.id;

    populateCategorySelect();

    getElement(
      "product-id"
    ).value =
      product.id;

    getElement(
      "product-code"
    ).value =
      product.code;

    getElement(
      "product-name"
    ).value =
      product.name;

    getElement(
      "product-category"
    ).value =
      product.category_id;

    getElement(
      "product-modal-title"
    ).textContent =
      "Изменить позицию";

    try {
      const {
        data: productDays,
        error
      } =
        await supabaseClient
          .from(
            "inventory_day_items"
          )
          .select(`
            weekday,
            sort_order
          `)
          .eq(
            "restaurant_id",
            state.restaurantId
          )
          .eq(
            "product_id",
            product.id
          );

      if (error) {
        throw error;
      }

      const days =
        Array.isArray(productDays)
          ? productDays
          : [];

      document
        .querySelectorAll(
          'input[name="product-weekday"]'
        )
        .forEach(
          function (checkbox) {
            checkbox.checked =
              days.some(
                function (dayItem) {
                  return (
                    Number(
                      dayItem.weekday
                    ) ===
                    Number(
                      checkbox.value
                    )
                  );
                }
              );
          }
        );

      const selectedDayItem =
        days.find(
          function (dayItem) {
            return (
              Number(
                dayItem.weekday
              ) ===
              state.selectedWeekday
            );
          }
        ) ||
        days[0];

      getElement(
        "product-sort-order"
      ).value =
        String(
          selectedDayItem
            ?.sort_order || 0
        );

      openModal(
        "product-modal"
      );

    } catch (error) {
      console.error(
        "Ошибка загрузки дней товара:",
        error
      );

      showToast(
        "Не удалось открыть позицию.",
        "error"
      );
    }
  }


  /* =====================================================
     ВЫБРАННЫЕ ДНИ
  ===================================================== */

  function getCheckedWeekdays() {
    return Array.from(
      document.querySelectorAll(
        'input[name="product-weekday"]:checked'
      )
    )
      .map(
        function (checkbox) {
          return Number(
            checkbox.value
          );
        }
      )
      .filter(
        function (weekday) {
          return Boolean(
            WEEKDAYS[weekday]
          );
        }
      );
  }


  /* =====================================================
     СИНХРОНИЗАЦИЯ ДНЕЙ ТОВАРА
  ===================================================== */

  async function syncProductWeekdays(
    productId,
    weekdays,
    sortOrder
  ) {
    const {
      data: existingItems,
      error: existingError
    } =
      await supabaseClient
        .from(
          "inventory_day_items"
        )
        .select(`
          id,
          weekday
        `)
        .eq(
          "restaurant_id",
          state.restaurantId
        )
        .eq(
          "product_id",
          productId
        );

    if (existingError) {
      throw existingError;
    }

    const existingWeekdays =
      (existingItems || [])
        .map(
          function (item) {
            return Number(
              item.weekday
            );
          }
        );

    const removedWeekdays =
      existingWeekdays.filter(
        function (weekday) {
          return (
            !weekdays.includes(
              weekday
            )
          );
        }
      );

    if (
      removedWeekdays.length > 0
    ) {
      const {
        error: deleteError
      } =
        await supabaseClient
          .from(
            "inventory_day_items"
          )
          .delete()
          .eq(
            "restaurant_id",
            state.restaurantId
          )
          .eq(
            "product_id",
            productId
          )
          .in(
            "weekday",
            removedWeekdays
          );

      if (deleteError) {
        throw deleteError;
      }
    }

    const rows =
      weekdays.map(
        function (weekday) {
          return {
            restaurant_id:
              state.restaurantId,

            product_id:
              productId,

            weekday:
              weekday,

            sort_order:
              sortOrder,

            is_active:
              true
          };
        }
      );

    if (rows.length === 0) {
      return;
    }

    const {
      error: upsertError
    } =
      await supabaseClient
        .from(
          "inventory_day_items"
        )
        .upsert(
          rows,
          {
            onConflict:
              "restaurant_id,product_id,weekday"
          }
        );

    if (upsertError) {
      throw upsertError;
    }
  }


  /* =====================================================
     СОХРАНЕНИЕ ТОВАРА
  ===================================================== */

  async function saveProduct(
    event
  ) {
    event.preventDefault();

    const code =
      getElement(
        "product-code"
      )?.value.trim();

    const name =
      getElement(
        "product-name"
      )?.value.trim();

    const categoryId =
      getElement(
        "product-category"
      )?.value;

    const sortOrder =
      Number(
        getElement(
          "product-sort-order"
        )?.value || 0
      );

    const weekdays =
      getCheckedWeekdays();

    const submitButton =
      getElement(
        "product-submit-button"
      );

    if (
      !code ||
      !name ||
      !categoryId
    ) {
      showToast(
        "Заполните код, наименование и раздел.",
        "error"
      );

      return;
    }

    if (
      weekdays.length === 0
    ) {
      showToast(
        "Выберите хотя бы один день инвентаризации.",
        "error"
      );

      return;
    }

    if (
      !Number.isInteger(sortOrder) ||
      sortOrder < 0
    ) {
      showToast(
        "Укажите корректный порядок.",
        "error"
      );

      return;
    }

    setButtonLoading(
      submitButton,
      true
    );

    let createdProductId =
      null;

    try {
      if (
        state.editingProductId
      ) {
        const { error } =
          await supabaseClient
            .from(
              "inventory_products"
            )
            .update({
              code: code,
              name: name,
              category_id:
                categoryId
            })
            .eq(
              "id",
              state.editingProductId
            )
            .eq(
              "restaurant_id",
              state.restaurantId
            );

        if (error) {
          throw error;
        }

        await syncProductWeekdays(
          state.editingProductId,
          weekdays,
          sortOrder
        );

        showToast(
          "Позиция обновлена."
        );

      } else {
        const {
          data: createdProduct,
          error
        } =
          await supabaseClient
            .from(
              "inventory_products"
            )
            .insert({
              restaurant_id:
                state.restaurantId,

              category_id:
                categoryId,

              code:
                code,

              name:
                name,

              is_active:
                true
            })
            .select("id")
            .single();

        if (error) {
          throw error;
        }

        createdProductId =
          createdProduct.id;

        await syncProductWeekdays(
          createdProductId,
          weekdays,
          sortOrder
        );

        showToast(
          "Позиция добавлена."
        );
      }

      closeModal(
        "product-modal"
      );

      await loadInventoryList();

    } catch (error) {
      console.error(
        "Ошибка сохранения товара:",
        error
      );

      if (createdProductId) {
        await supabaseClient
          .from(
            "inventory_products"
          )
          .delete()
          .eq(
            "id",
            createdProductId
          )
          .eq(
            "restaurant_id",
            state.restaurantId
          );
      }

      if (
        error.code === "23505"
      ) {
        showToast(
          "Товар с таким кодом уже существует.",
          "error"
        );
      } else {
        showToast(
          error.message ||
          "Не удалось сохранить позицию.",
          "error"
        );
      }

    } finally {
      setButtonLoading(
        submitButton,
        false
      );
    }
  }


  /* =====================================================
     УДАЛЕНИЕ ТОВАРА
  ===================================================== */

  async function deleteProduct(
    productId
  ) {
    const product =
      state.products.find(
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

    const confirmed =
      await showConfirmModal({
        title:
          "Удалить позицию?",

        message:
          `Позиция «${product.code}. ${product.name}» ` +
          "будет удалена из всех дней инвентаризации. " +
          "Восстановить ее автоматически не получится.",

        confirmText:
          "Удалить"
      });

    if (!confirmed) {
      return;
    }

    const confirmButton =
      getElement(
        "confirm-modal-submit"
      );

    setButtonLoading(
      confirmButton,
      true,
      "Удаление..."
    );

    try {
      const { error } =
        await supabaseClient
          .from(
            "inventory_products"
          )
          .delete()
          .eq(
            "id",
            productId
          )
          .eq(
            "restaurant_id",
            state.restaurantId
          );

      if (error) {
        throw error;
      }

      showToast(
        "Позиция удалена."
      );

      await loadInventoryList();

    } catch (error) {
      console.error(
        "Ошибка удаления товара:",
        error
      );

      showToast(
        error.message ||
        "Не удалось удалить позицию.",
        "error"
      );

    } finally {
      setButtonLoading(
        confirmButton,
        false
      );
    }
  }


  /* =====================================================
     КОПИРОВАНИЕ СПИСКА
  ===================================================== */

  async function copyInventoryList() {
    const sourceInput =
      window.prompt(
        [
          "Из какого дня скопировать список?",
          "",
          "1 — Понедельник",
          "2 — Вторник",
          "3 — Среда",
          "4 — Четверг",
          "5 — Пятница",
          "6 — Суббота",
          "7 — Воскресенье"
        ].join("\n")
      );

    if (sourceInput === null) {
      return;
    }

    const sourceWeekday =
      Number(sourceInput);

    if (
      !WEEKDAYS[sourceWeekday]
    ) {
      showToast(
        "Введите число от 1 до 7.",
        "error"
      );

      return;
    }

    if (
      sourceWeekday ===
      state.selectedWeekday
    ) {
      showToast(
        "Нельзя скопировать список в тот же день.",
        "error"
      );

      return;
    }

    try {
      const {
        data: sourceItems,
        error: sourceError
      } =
        await supabaseClient
          .from(
            "inventory_day_items"
          )
          .select(`
            product_id,
            sort_order,
            is_active
          `)
          .eq(
            "restaurant_id",
            state.restaurantId
          )
          .eq(
            "weekday",
            sourceWeekday
          )
          .eq(
            "is_active",
            true
          );

      if (sourceError) {
        throw sourceError;
      }

      if (
        !sourceItems ||
        sourceItems.length === 0
      ) {
        showToast(
          `Список на день «${WEEKDAYS[sourceWeekday]}» пуст.`,
          "error"
        );

        return;
      }

      let replaceTarget =
        false;

      if (
        state.dayItems.length > 0
      ) {
        replaceTarget =
          window.confirm(
            [
              `В списке «${WEEKDAYS[state.selectedWeekday]}» уже есть позиции.`,
              "",
              "ОК — полностью заменить список.",
              "Отмена — добавить только недостающие позиции."
            ].join("\n")
          );
      }

      if (replaceTarget) {
        const {
          error: deleteError
        } =
          await supabaseClient
            .from(
              "inventory_day_items"
            )
            .delete()
            .eq(
              "restaurant_id",
              state.restaurantId
            )
            .eq(
              "weekday",
              state.selectedWeekday
            );

        if (deleteError) {
          throw deleteError;
        }
      }

      const rows =
        sourceItems.map(
          function (item) {
            return {
              restaurant_id:
                state.restaurantId,

              product_id:
                item.product_id,

              weekday:
                state.selectedWeekday,

              sort_order:
                item.sort_order,

              is_active:
                true
            };
          }
        );

      const {
        error: copyError
      } =
        await supabaseClient
          .from(
            "inventory_day_items"
          )
          .upsert(
            rows,
            {
              onConflict:
                "restaurant_id,product_id,weekday"
            }
          );

      if (copyError) {
        throw copyError;
      }

      showToast(
        `Список из дня «${WEEKDAYS[sourceWeekday]}» скопирован.`
      );

      await loadInventoryList();

    } catch (error) {
      console.error(
        "Ошибка копирования списка:",
        error
      );

      showToast(
        error.message ||
        "Не удалось скопировать список.",
        "error"
      );
    }
  }


  /* =====================================================
     ОБРАБОТКА КЛИКОВ
  ===================================================== */

  function handlePageClick(
    event
  ) {
    const confirmCancelButton =
      event.target.closest(
        "[data-confirm-cancel]"
      );

    if (confirmCancelButton) {
      finishConfirmModal(false);
      return;
    }

    const confirmSubmitButton =
      event.target.closest(
        "[data-confirm-submit]"
      );

    if (confirmSubmitButton) {
      finishConfirmModal(true);
      return;
    }

    const weekdayButton =
      event.target.closest(
        ".weekday-tab"
      );

    if (weekdayButton) {
      selectWeekday(
        weekdayButton.dataset.weekday
      );

      return;
    }

    const closeButton =
      event.target.closest(
        "[data-close-modal]"
      );

    if (closeButton) {
      closeModal(
        closeButton.dataset.closeModal
      );

      return;
    }

    const actionButton =
      event.target.closest(
        "[data-action]"
      );

    if (!actionButton) {
      return;
    }

    const action =
      actionButton.dataset.action;

    const categoryId =
      actionButton.dataset.categoryId;

    const productId =
      actionButton.dataset.productId;

    switch (action) {
      case "open-category-modal":
        openAddCategoryModal();
        break;

      case "open-product-modal":
        openAddProductModal();
        break;

      case "edit-category":
        openEditCategoryModal(
          categoryId
        );
        break;

      case "delete-category":
        deleteCategory(
          categoryId
        );
        break;

      case "edit-product":
        openEditProductModal(
          productId
        );
        break;

      case "delete-product":
        deleteProduct(
          productId
        );
        break;

      default:
        break;
    }
  }


  /* =====================================================
     ESCAPE
  ===================================================== */

  function handleDocumentKeydown(
    event
  ) {
    if (
      event.key !== "Escape"
    ) {
      return;
    }

    const confirmModal =
      getElement(
        "confirm-modal"
      );

    if (
      confirmModal?.classList.contains(
        "open"
      )
    ) {
      finishConfirmModal(false);
      return;
    }

    closeAllModals();
  }


  /* =====================================================
     ИНИЦИАЛИЗАЦИЯ
  ===================================================== */

  async function initInventoryListsPage() {
    const page =
      document.querySelector(
        '[data-page="inventory-lists"]'
      );

    if (!page) {
      return;
    }

    if (
      page.dataset.initialized ===
      "true"
    ) {
      return;
    }

    page.dataset.initialized =
      "true";

    state.selectedWeekday =
      getTodayWeekday();

    state.searchQuery = "";

    state.editingCategoryId =
      null;

    state.editingProductId =
      null;


    getElement(
      "open-category-modal"
    )?.addEventListener(
      "click",
      openAddCategoryModal
    );


    getElement(
      "open-product-modal"
    )?.addEventListener(
      "click",
      openAddProductModal
    );


    getElement(
      "category-form"
    )?.addEventListener(
      "submit",
      saveCategory
    );


    getElement(
      "product-form"
    )?.addEventListener(
      "submit",
      saveProduct
    );


    getElement(
      "inventory-list-search"
    )?.addEventListener(
      "input",
      function (event) {
        state.searchQuery =
          event.target.value;

        renderInventoryList();
      }
    );


    getElement(
      "refresh-list-button"
    )?.addEventListener(
      "click",
      loadInventoryList
    );


    getElement(
      "copy-list-button"
    )?.addEventListener(
      "click",
      copyInventoryList
    );


    page.addEventListener(
      "click",
      handlePageClick
    );


    document.removeEventListener(
      "keydown",
      handleDocumentKeydown
    );

    document.addEventListener(
      "keydown",
      handleDocumentKeydown
    );


    try {
      await loadCurrentProfile();

      await selectWeekday(
        state.selectedWeekday
      );

    } catch (error) {
      console.error(
        "Ошибка запуска страницы:",
        error
      );

      showToast(
        error.message ||
        "Не удалось запустить страницу.",
        "error"
      );

      setListStatus(
        "Ошибка",
        "error"
      );
    }
  }


  /* =====================================================
     ДИНАМИЧЕСКАЯ ЗАГРУЗКА
  ===================================================== */

  document.addEventListener(
    "app:page-loaded",
    function (event) {
      if (
        event.detail?.route ===
        "inventory-lists"
      ) {
        initInventoryListsPage();
      }
    }
  );


  window.setTimeout(
    initInventoryListsPage,
    0
  );

})();
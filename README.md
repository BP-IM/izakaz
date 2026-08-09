# I’M | Заказ — старт регистрации

## 1. Создайте проект Supabase

Project name:

`im-order-inventory`

Сохраните пароль базы данных.

## 2. Создайте таблицы

Откройте:

`Supabase → SQL Editor → New query`

Вставьте содержимое файла:

`supabase/supabase-setup.sql`

Нажмите **Run**.

## 3. Подключите ключи Supabase

Откройте:

`Supabase → Project Settings → Data API`

или:

`Supabase → Project Settings → API`

Скопируйте:

- Project URL
- Publishable key

Вставьте их в файл:

`js/supabase-config.js`

Пример:

```js
const SUPABASE_URL = "https://iyhknauelauafmlddhgb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-2IMvfwHhxIx_vYk_PfUVg_tBz75IQR";
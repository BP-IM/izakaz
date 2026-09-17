(function () {
  'use strict';
  let root, panel, context = null, key = '', entries = [], error = '', observer;
  let collapsed = false, editing = null, returnFocus = null;
  let loading = false, saving = false, revision = 0;
  const client = () => window.supabaseClient || supabaseClient;
  const modules = ['', 'OrderStep1Stock', 'OrderStep2Sales', 'OrderStep3Calculation', 'OrderStep4Result'];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const visible = () => entries.filter(n => n.pinned || n.orderId === context?.order?.id);
  function decode(n) {
    return {id:n.id, orderId:n.weekly_order_id, text:n.body, pinned:n.pinned, productId:n.product_id || '', productName:n.product_name || '', done:n.pinned ? n.completed_order_id === context?.order?.id : n.done, updatedAt:n.updated_at};
  }
  async function read() {
    if (!context || saving || loading) return;
    const token = revision, active = context;
    loading = true; error = ''; render();
    try {
      const result = await client().from('order_notes').select('*').eq('user_id', active.userId).eq('restaurant_id', active.restaurantId).is('deleted_at', null).or(`pinned.eq.true,weekly_order_id.eq.${active.order.id}`).order('created_at');
      if (result.error) throw result.error;
      if (token === revision) entries = (result.data || []).map(decode);
    } catch (e) {
      if (token === revision) error = ['42P01','PGRST205'].includes(e.code) ? 'Нужно создать таблицу заметок в Supabase. Затем нажмите «Обновить».' : 'Не удалось загрузить заметки. Проверьте соединение и нажмите «Обновить».';
    } finally { if (token === revision) { loading = false; render(); } }
  }
  async function save(next) {
    if (!context || saving || loading) return false;
    const active = context, token = revision;
    const changed = next.find(n => !entries.some(old => old === n));
    const removed = entries.find(n => !next.some(item => item.id === n.id));
    const note = changed || removed;
    if (!note) return false;
    const old = entries.find(n => n.id === note.id);
    saving = true; error = ''; render();
    try {
      let query;
      if (removed) query = client().from('order_notes').update({deleted_at:new Date().toISOString()});
      else {
        const payload = {weekly_order_id:note.orderId, body:note.text, pinned:note.pinned, product_id:note.productId || null, product_name:note.productName || null, done:note.done, completed_order_id:note.pinned && note.done ? active.order.id : null};
        query = old ? client().from('order_notes').update(payload) : client().from('order_notes').insert({...payload, id:note.id, user_id:active.userId, restaurant_id:active.restaurantId});
      }
      if (old) query = query.eq('id', old.id).eq('updated_at', old.updatedAt).eq('user_id', active.userId).eq('restaurant_id', active.restaurantId);
      const result = await query.select().single();
      if (result.error) throw result.error;
      if (token !== revision) return false;
      entries = removed ? entries.filter(n => n.id !== removed.id) : old ? entries.map(n => n.id === note.id ? decode(result.data) : n) : [...entries, decode(result.data)];
      return true;
    } catch (e) {
      if (token === revision) error = e.code === 'PGRST116' ? 'Заметка уже изменена на другом устройстве. Обновите список и повторите изменение.' : 'Не удалось сохранить в Supabase. Текст оставлен в форме — попробуйте ещё раз.';
      return false;
    } finally { saving = false; render(); }
  }
  function setContext(value) {
    const newKey = value?.order?.id && value.userId && value.restaurantId ? `${value.userId}:${value.restaurantId}:${value.order.id}` : '';
    if (context?.order?.id !== value?.order?.id || key !== newKey) panel?.querySelector('dialog')?.close();
    context = newKey ? value : null;
    if (key !== newKey) { revision++; loading = false; error = ''; key = newKey; entries = []; if (key) read(); }
    render();
  }
  function row(n) {
    return `<div class="on-note ${n.done ? 'on-done' : ''}">
      <input type="checkbox" data-note-done="${escape(n.id)}" aria-label="Выполнено: ${escape(n.text)}" ${n.done ? 'checked' : ''}>
      <div class="on-text">${n.productName ? `<small>${escape(n.productName)}</small>` : ''}<span>${escape(n.text)}</span></div>
      <button type="button" data-note-edit="${escape(n.id)}" aria-label="Редактировать заметку">✎</button>
      <button type="button" data-note-delete="${escape(n.id)}" aria-label="Удалить заметку">×</button></div>`;
  }
  function render() {
    if (!panel?.isConnected) return;
    const notes = visible();
    const status = error || (saving ? 'Сохранение в Supabase…' : loading ? 'Загрузка заметок…' : context ? `Заказ ${context.order.order_date || ''} · Сохранено в Supabase` : 'Заметки будут доступны после загрузки заказа.');
    panel.querySelector('[data-notes-status]').textContent = status;
    panel.querySelector('[data-editor-status]').textContent = error || (saving ? 'Сохранение…' : '');
    panel.querySelectorAll('button:not([data-notes-close]):not([data-notes-cancel]), .on-note input').forEach(b => { b.disabled = !context || saving || loading; });
    panel.querySelectorAll('[data-note-add]').forEach(b => { b.disabled = !context || !!error || saving || loading; });
    for (const type of ['pinned', 'general', 'product']) {
      const filtered = notes.filter(n => type === 'pinned' ? n.pinned : !n.pinned && (type === 'product' ? !!n.productId : !n.productId));
      panel.querySelector(`[data-notes-list="${type}"]`).innerHTML = filtered.map(row).join('') || '<p class="on-empty">Пока нет заметок</p>';
    }
    const count = notes.filter(n => !n.done).length;
    root.querySelector('[data-notes-toggle]').textContent = `📝 Заметки (${count})`;
    root.querySelector('[data-notes-toggle]').setAttribute('aria-expanded', String(!collapsed));
    root.classList.toggle('on-collapsed', collapsed);
    const summary = root.querySelector('[data-notes-summary]');
    summary.hidden = window.OrderApp?.getCurrentStep() !== 4 || !context;
    summary.innerHTML = `<h3>Заметки к заказу</h3>${notes.filter(n => !n.done).map(n => `<p>${n.pinned ? '📌 ' : ''}${n.productName ? `${escape(n.productName)}: ` : ''}${escape(n.text)}</p>`).join('') || '<p class="on-empty">Нет невыполненных заметок</p>'}`;
    decorateProducts();
  }
  function decorateProducts() {
    if (!root || !context) return;
    root.querySelectorAll('#order-step-container [data-stock-row]').forEach(tr => {
      const id = tr.dataset.stockRow;
      const host = tr.querySelector('.stock-product-main');
      if (!host) return;
      let button = host.querySelector('[data-note-product]');
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'on-product-button'; button.dataset.noteProduct = id;
        button.title = 'Заметка к товару'; button.setAttribute('aria-label', 'Заметка к товару'); host.append(button);
      }
      const note = visible().find(n => n.productId === id && !n.done);
      const label = note ? '📝 •' : '📝';
      if (button.textContent !== label) button.textContent = label;
    });
  }
  function openEditor(type, note, productId) {
    if (!context || error || saving || loading) return;
    editing = note?.id || null; returnFocus = document.activeElement;
    const dialog = panel.querySelector('dialog');
    const select = dialog.querySelector('select');
    const products = [...new Map((context.products || []).map(p => [String(p.id), p])).values()];
    if (note?.productId && !products.some(p => String(p.id) === note.productId)) products.push({id: note.productId, name: note.productName});
    select.innerHTML = '<option value="">Общая заметка</option>' + products.map(p => `<option value="${escape(p.id)}">${escape(p.name)}</option>`).join('');
    select.value = note?.productId || productId || '';
    dialog.querySelector('textarea').value = note?.text || '';
    dialog.querySelector('[name=pinned]').checked = note?.pinned || type === 'pinned';
    dialog.querySelector('h3').textContent = note ? 'Редактировать заметку' : 'Добавить заметку';
    dialog.showModal(); dialog.querySelector('textarea').focus();
  }
  function mount() {
    const nextRoot = document.getElementById('weekly-order-page');
    if (nextRoot === root) return;
    observer?.disconnect(); root = nextRoot; panel = null; context = null; key = ''; entries = [];
    revision++; loading = false;
    if (!root) return;
    collapsed = true;
    const container = root.querySelector('#order-step-container');
    const layout = document.createElement('div'); layout.className = 'on-layout'; container.before(layout);
    const content = document.createElement('div'); content.className = 'on-content'; layout.append(content); content.append(container);
    const summary = document.createElement('section'); summary.className = 'on-summary'; summary.dataset.notesSummary = ''; summary.hidden = true; content.append(summary);
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'on-toggle'; toggle.dataset.notesToggle = ''; toggle.setAttribute('aria-controls', 'order-notes-panel'); layout.before(toggle);
    panel = document.createElement('aside'); panel.id = 'order-notes-panel'; panel.className = 'on-panel'; panel.setAttribute('aria-label', 'Заметки к заказу'); layout.append(panel);
    panel.innerHTML = `<div class="on-heading"><h2>📝 Заметки к заказу</h2><button type="button" data-notes-close aria-label="Свернуть заметки">−</button></div>
      <p class="on-status" data-notes-status role="status"></p><button type="button" data-notes-refresh>Обновить</button>
      ${[['pinned','📌 Закрепленные'],['general','Мои заметки'],['product','Заметки к товарам']].map(([type,title]) => `<section class="on-section on-${type}"><div class="on-section-heading"><h3>${title}</h3><button type="button" data-note-add="${type}">+ Добавить</button></div><div data-notes-list="${type}"></div></section>`).join('')}
      <dialog class="on-dialog"><form><h3>Добавить заметку</h3><label>Товар<select aria-label="Товар"></select></label><label>Заметка<textarea maxlength="2000" required placeholder="Что нужно запомнить?"></textarea></label><label class="on-pin"><input type="checkbox" name="pinned"> Закрепить для следующих заказов</label><p data-editor-status role="status" class="on-status"></p><div class="on-dialog-actions"><button type="button" data-notes-cancel>Отмена</button><button type="submit">Сохранить</button></div></form></dialog>`;
    root.addEventListener('click', event => {
      const b = event.target.closest('button'); if (!b) return;
      if (b.matches('[data-notes-toggle], [data-notes-close]')) { collapsed = !collapsed; render(); if (collapsed) toggle.focus(); }
      if (b.hasAttribute('data-notes-cancel')) panel.querySelector('dialog').close();
      if (b.hasAttribute('data-notes-refresh')) read();
      if (b.dataset.noteAdd) openEditor(b.dataset.noteAdd);
      if (b.dataset.noteProduct) openEditor('product', visible().find(n => n.productId === b.dataset.noteProduct), b.dataset.noteProduct);
      if (b.dataset.noteEdit) openEditor('', visible().find(n => n.id === b.dataset.noteEdit));
      if (b.dataset.noteDelete && confirm('Удалить эту заметку?')) save(entries.filter(n => n.id !== b.dataset.noteDelete));
    });
    panel.addEventListener('change', event => {
      const id = event.target.dataset.noteDone;
      if (id) save(entries.map(n => n.id === id ? {...n, done: event.target.checked} : n));
    });
    const dialog = panel.querySelector('dialog');
    dialog.addEventListener('close', () => returnFocus?.isConnected && returnFocus.focus());
    panel.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); if (!context) return;
      const text = dialog.querySelector('textarea').value.trim(); if (!text) return;
      const select = dialog.querySelector('select');
      const previous = entries.find(n => n.id === editing);
      const note = {id: editing || crypto.randomUUID(), orderId: previous?.orderId || context.order.id, text, pinned: dialog.querySelector('[name=pinned]').checked, productId: select.value, productName: select.value ? select.selectedOptions[0].textContent : '', done: previous?.done || false};
      if (previous?.pinned && !note.pinned) note.orderId = context.order.id;
      if (await save(previous ? entries.map(n => n.id === editing ? note : n) : [...entries, note])) dialog.close();
    });
    observer = new MutationObserver(() => {
      if (!context) return;
      const latest = window[modules[window.OrderApp?.getCurrentStep()]]?.getNotesContext?.();
      if (latest?.order?.id !== context.order.id) setContext(latest);
      else { context = latest || context; decorateProducts(); }
    });
    observer.observe(container, {childList:true, subtree:true});
    render();
  }
  window.OrderNotes = {setContext};
  document.addEventListener('app:page-loaded', mount);
  const refresh = () => { if (root?.isConnected && !document.hidden && !panel?.querySelector('dialog[open]')) read(); };
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.setInterval(refresh, 30000);
  mount();
})();

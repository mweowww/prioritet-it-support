import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export const categories = ['Компьютерная техника', 'Оргтехника', 'Сеть/Интернет', 'Программное обеспечение', 'Доступы/Учетные записи', 'Другое'];
export const priorities = ['Низкий', 'Средний', 'Высокий', 'Критический'];
const locations = ['Библиотека', 'Актовый зал', 'Административный корпус'];
const escapes = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => escapes[char]);
const errorText = message => message ? `<p class="error" role="alert">${esc(message)}</p>` : '';
const page = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
function layout(title, content, user) {
  const account = user ? `<form class="account" method="post" action="/logout"><span>${esc(user.login)}</span><button class="quiet">Выйти</button></form>` : '';
  const slots = { title: esc(title), content, account };
  return page.replace(/{{(title|account|content)}}/g, (_, name) => slots[name]);
}

export function authPage(register, message = '', login = '') {
  const title = register ? 'Регистрация педагога' : 'Вход в кабинет';
  return layout(title, `<div class="auth"><div class="intro"><p class="overline">Служба ИТ-поддержки</p><h1>Кабинет педагога</h1><p>Сообщите о неполадке и следите за статусом своих заявок.</p></div>
  <section class="card"><h2>${title}</h2>${errorText(message)}
  <form class="fields" method="post" action="${register ? '/register' : '/login'}">
  <label>Рабочая почта или телефон<input name="login" autocomplete="username" maxlength="254" required value="${esc(login)}"></label>
  <label>Пароль<input name="password" type="password" autocomplete="${register ? 'new-password' : 'current-password'}" ${register ? 'minlength="10"' : ''} maxlength="128" required></label>
  ${register ? '<small>Используйте не менее 10 символов.</small>' : ''}
  <button>${register ? 'Создать аккаунт' : 'Войти'}</button></form>
  <a class="switch" href="${register ? '/' : '/register'}">${register ? 'Уже есть аккаунт? Войти' : 'Зарегистрироваться'}</a></section></div>`);
}

export function dashboard(user, tickets, created) {
  const cards = tickets.map(t => `<details class="ticket"><summary><span><small>№ ${t.id} · ${esc(t.category)}</small><strong>${esc(t.subject)}</strong></span><span class="status">${esc(t.status)}</span></summary><dl>
    <dt>Приоритет</dt><dd>${esc(t.priority)}</dd><dt>Подразделение</dt><dd>${esc(t.department)}</dd>
    <dt>Место</dt><dd>${esc(t.location)}</dd><dt>Описание</dt><dd>${esc(t.description)}</dd></dl></details>`).join('');
  return layout('Мои заявки', `<p class="overline">Кабинет педагога</p><div class="row"><h1>Мои заявки</h1><a class="button" href="/tickets/new">Подать заявку</a></div>
    ${created && tickets.some(t => String(t.id) === created) ? `<p role="status" class="notice">Заявка № ${esc(created)} зарегистрирована.</p>` : ''}
    ${cards || '<section class="empty"><h2>Вы ещё не подавали заявок</h2><p>Когда вы отправите первое обращение, здесь появятся его номер и статус.</p></section>'}`,user);
}

export function ticketPage(user, values = {}, message = '') {
  const options = (choices, selected) => choices.map(c => `<option${c === selected ? ' selected' : ''}>${esc(c)}</option>`).join('');
  return layout('Новая заявка', `<a href="/">Мои заявки</a><h1>Новая заявка</h1><form class="fields card ticketform" method="post" action="/tickets">
  ${errorText(message)}<input type="hidden" name="form_id" value="${esc(values.form_id || randomUUID())}">
  <label>Тема<input name="subject" maxlength="150" required placeholder="Например, не включается проектор" value="${esc(values.subject)}"></label>
  <div class="pair"><label>Категория<select name="category" required><option value="">Выберите категорию</option>${options(categories,values.category)}</select></label>
  <label>Приоритет<select name="priority">${options(priorities, values.priority || 'Средний')}</select></label></div>
  <div class="pair"><label>Подразделение<input name="department" required maxlength="100" value="${esc(values.department)}"></label>
  <label>Кабинет или место<input name="location" list="places" required maxlength="100" placeholder="Например, кабинет 305" value="${esc(values.location)}"><datalist id="places">${options(locations)}</datalist></label></div>
  <label>Описание проблемы<textarea required name="description" maxlength="4000" rows="5" placeholder="Что произошло и как это мешает работе?">${esc(values.description)}</textarea></label>
  <div><button>Отправить заявку</button></div></form>`,user);
}

import { esc, layout } from './views.js';

const date = value => new Intl.DateTimeFormat('ru-RU',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Moscow'}).format(value);
function select(label,name,choices,current,empty) {
  const options = choices.map(choice => {
    const [value,text] = Array.isArray(choice) ? choice : [choice,choice];
    return `<option value="${esc(value)}"${String(value)===String(current) ? ' selected' : ''}>${esc(text)}</option>`;
  });
  return `<label>${label}<select name="${name}">${empty ? `<option value="">${empty}</option>` : ''}${options.join('')}</select></label>`;
}

export function queuePage(user,rows,f,revision,{categories,priorities,statuses}) {
  const cards = rows.map(t => {
    const overdue = !['Решена','Отклонена'].includes(t.status) && Date.now()-t.created_at.getTime()>=86400000;
    const level = priorities.indexOf(t.priority);
    return `<article class="ticket"><small>№ ${t.id} · ${date(t.created_at)} · ${esc(t.location)}</small>
    <h2><a href="/tickets/${t.id}">${esc(t.subject)}</a></h2>
    <div class="badges"><span class="status" data-status="${esc(t.status)}">${esc(t.status)}</span><span class="priority level-${level}">${esc(t.priority)} приоритет</span>
    ${overdue ? '<strong class="late">Открыта больше суток</strong>' : ''}</div>
    <p>${esc(t.author)} · ${esc(t.assignee || 'Исполнитель не назначен')}</p></article>`;
  }).join('');
  return layout('Очередь заявок',`<p class="overline">Кабинет исполнителя</p><h1>Очередь заявок</h1>
    <form class="card fields" method="get" action="/">
    <label>Поиск по заявкам<input type="search" name="q" value="${esc(f.q)}" placeholder="Номер, тема или описание"></label>
    <div class="filter-grid">${select('Статус','status',statuses,f.status,'Все статусы')}
    ${select('Приоритет','priority',priorities,f.priority,'Все приоритеты')}
    ${select('Категория','category',categories,f.category,'Все категории')}
    <label>Кабинет или место<input name="place" value="${esc(f.place)}"></label>
    <label>Автор заявки<input name="author" value="${esc(f.author)}"></label></div>
    <div><button>Применить</button> <a href="/">Сбросить</a></div></form>
    <p id="queue-update" class="notice" role="status" data-revision="${esc(revision)}" hidden>Очередь изменилась. <a href="">Обновить список</a></p>
    <script src="/queue.js" defer></script>
    ${cards || '<p class="empty">Заявок по выбранным условиям пока нет.</p>'}`,user);
}

function historyList(history) {
  return history.map((entry,index) => {
    const previous = history[index-1];
    const changes = [];
    if (!previous || previous.status !== entry.status) changes.push('Статус: '+entry.status);
    if (!previous || previous.priority !== entry.priority) changes.push('Приоритет: '+entry.priority);
    if (!previous || previous.assignee !== entry.assignee) changes.push('Исполнитель: '+(entry.assignee || 'не назначен'));
    const title = {baseline:'Состояние при обновлении базы',created:'Заявка создана',changed:'Изменение заявки'}[entry.event_type];
    return `<li><strong>${title}</strong><small>${date(entry.recorded_at)}${entry.actor ? ' · '+esc(entry.actor) : ''}</small>
      <p>${changes.map(esc).join(' · ')}</p></li>`;
  }).reverse().join('');
}

export function detailPage(user,t,comments,team,message,{statuses,priorities},history) {
  const tech=user.role==='technician';
  const notes=comments.map(n => `<li class="${n.internal ? 'note-internal' : 'note-public'}"><strong>${esc(n.login)}</strong> · ${date(n.created_at)}
    ${n.internal ? '<b class="private">Для ИТ-службы</b>' : ''}<p>${esc(n.body)}</p></li>`).join('');
  const controls = tech ? `<div class="pair">${select('Статус','status',statuses,t.status)}
    ${select('Приоритет','priority',priorities,t.priority)}</div>
    ${select('Исполнитель','assignee',team.map(s=>[s.id,s.login + (s.id===user.id ? ' (я)' : '')]),t.assignee_id,'Не назначен')}` : '';
  return layout('Заявка № '+t.id,`<a href="/">${tech ? 'Очередь заявок' : 'Мои заявки'}</a>
    <p class="overline">Заявка № ${t.id} · ${esc(t.status)}</p><h1 class="subject">${esc(t.subject)}</h1>
    <section class="card facts"><h2>Об обращении</h2><dl><dt>Автор</dt><dd>${esc(t.author)}</dd><dt>Создана</dt><dd>${date(t.created_at)}</dd>
    <dt>Категория и приоритет</dt><dd>${esc(t.category)} · ${esc(t.priority)}</dd>
    <dt>Местоположение</dt><dd>${esc(t.department)} · ${esc(t.location)}</dd>
    <dt>Исполнитель</dt><dd>${esc(t.assignee || 'Не назначен')}</dd><dt>Описание</dt><dd>${esc(t.description)}</dd></dl></section>
    <details class="card timeline"><summary>История заявки <span>${history.length}</span></summary><ol>${historyList(history)}</ol></details>
    <section class="card conversation"><h2>Переписка</h2>${notes ? `<ol>${notes}</ol>` : '<p>Сообщений пока нет.</p>'}
    <form method="post" action="/tickets/${t.id}" class="fields">
    ${message ? `<p role="alert" class="error">${esc(message)}</p>` : ''}
    <input type="hidden" name="version" value="${t.version}">${controls}
    <label>${tech ? 'Ответ педагогу' : 'Сообщение исполнителю'}<textarea rows="3" name="comment" maxlength="4000" ${tech ? '' : 'required'}></textarea></label>
    ${tech ? '<label>Внутренняя заметка для ИТ-службы<textarea rows="2" name="internal" maxlength="4000"></textarea></label>' : ''}
    <div><button>${tech ? 'Сохранить изменения' : 'Отправить сообщение'}</button></div></form></section>`,user);
}

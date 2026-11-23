import { db } from './db.js';
import { priorities } from './views.js';
import { queuePage, detailPage, statuses } from './work-views.js';

const technicians = async () => (await db.query("SELECT id,login FROM staff WHERE role='technician' ORDER BY login")).rows;
const ticketSource = `FROM tickets t JOIN staff author ON author.id=t.staff_id
  LEFT JOIN staff assignee ON assignee.id=t.assignee_id`;
const ticketFields = 't.*, author.login AS author, assignee.login AS assignee';

export async function queueRevision() {
  const result = await db.query('SELECT COALESCE(sum(version),0)::text AS revision FROM tickets');
  return result.rows[0].revision;
}

export async function showQueue(user, params) {
  const revision = await queueRevision();
  const filter = Object.fromEntries(['status','priority','category','place','author','q'].map(key => [key, (params.get(key) || '').trim()]));
  const result = await db.query(`SELECT ${ticketFields} ${ticketSource}
    WHERE ($1='' OR t.status=$1) AND ($2='' OR t.priority=$2) AND ($3='' OR t.category=$3)
      AND strpos(lower(t.location),lower($4))>0 AND strpos(lower(author.login),lower($5))>0
      AND strpos(lower(concat_ws(' ',t.id,t.subject,t.description)),lower($6))>0
    ORDER BY t.id DESC`, Object.values(filter));
  return queuePage(user,result.rows,filter,revision);
}

export async function ticketWorkflow({id, user, post, form, send, redirect}) {
  const tech = user.role === 'technician';
  async function show(code = 200, message = '') {
    const {rows} = await db.query(`SELECT ${ticketFields} ${ticketSource}
      WHERE t.id=$1 AND ($2 OR t.staff_id=$3)`, [id,tech,user.id]);
    if (!rows.length) return send(404,'Заявка не найдена');
    const notes = await db.query(`SELECT c.body,c.internal,c.created_at,s.login FROM ticket_comments c
      JOIN staff s ON s.id=c.author_id WHERE c.ticket_id=$1 AND ($2 OR NOT c.internal) ORDER BY c.id`,[id,tech]);
    return send(code,detailPage(user,rows[0],notes.rows,tech ? await technicians() : [],message));
  }
  if (!post) return show();
  const comment=(form.comment || '').trim();
  const internal=(form.internal || '').trim();
  if (!tech && ['internal','status','assignee','priority'].some(k=>Object.hasOwn(form,k))) return send(403,'Недостаточно прав');
  if (comment.length>4000 || internal.length>4000 || (!tech && !comment)) return show(422,'Проверьте текст сообщения.');
  if (tech && (!statuses.includes(form.status) || !priorities.includes(form.priority))) return show(422,'Выберите статус и приоритет из списка.');
  const assignee = form.assignee || null;
  if (assignee && !/^[1-9]\d{0,8}$/.test(assignee)) return show(422,'Проверьте исполнителя.');
  const client=await db.connect();
  let conflict=false;
  try {
    await client.query('BEGIN');
    const record = (await client.query('SELECT version FROM tickets WHERE id=$1 AND ($2 OR staff_id=$3) FOR UPDATE',[id,tech,user.id])).rows[0];
    if (!record) { await client.query('ROLLBACK'); return send(404,'Заявка не найдена'); }
    conflict = String(record.version)!==form.version;
    if (!conflict) {
      if (tech) {
        if (assignee && !(await client.query("SELECT id FROM staff WHERE id=$1 AND role='technician'",[assignee])).rowCount) {
          await client.query('ROLLBACK'); return send(422,'Указанный исполнитель недоступен');
        }
        await client.query('UPDATE tickets SET status=$2, priority=$3, assignee_id=$4 WHERE id=$1',[id,form.status,form.priority,assignee]);
      }
      for (const [body,hidden] of [[comment,false],[internal,true]]) {
        if (body) await client.query('INSERT INTO ticket_comments(ticket_id,author_id,body,internal) VALUES($1,$2,$3,$4)',[id,user.id,body,hidden]);
      }
      await client.query('UPDATE tickets SET version=version+1 WHERE id=$1',[id]);
    }
    await client.query('COMMIT');
  } catch(error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {client.release();}
  if (conflict) return show(409,'Заявка уже изменилась. Сверьте новые данные и повторите отправку.');
  return redirect('/tickets/'+id);
}

CREATE TABLE categories (
  name text PRIMARY KEY,
  sort_order integer NOT NULL DEFAULT 100
);
INSERT INTO categories(name,sort_order) VALUES
  ('Компьютерная техника',1),
  ('Оргтехника',2),
  ('Сеть/Интернет',3),
  ('Программное обеспечение',4),
  ('Доступы/Учетные записи',5),
  ('Другое',6);
INSERT INTO categories(name) SELECT DISTINCT category FROM tickets ON CONFLICT DO NOTHING;
ALTER TABLE tickets ADD CONSTRAINT tickets_category_fk FOREIGN KEY (category) REFERENCES categories(name);

CREATE TABLE priorities (
  name text PRIMARY KEY,
  sort_order integer NOT NULL DEFAULT 100
);
INSERT INTO priorities(name,sort_order) VALUES
  ('Низкий',1),
  ('Средний',2),
  ('Высокий',3),
  ('Критический',4);
INSERT INTO priorities(name) SELECT DISTINCT priority FROM tickets ON CONFLICT DO NOTHING;
ALTER TABLE tickets ADD CONSTRAINT tickets_priority_fk FOREIGN KEY (priority) REFERENCES priorities(name);

CREATE TABLE statuses (
  name text PRIMARY KEY,
  sort_order integer NOT NULL DEFAULT 100
);
INSERT INTO statuses(name,sort_order) VALUES
  ('Новая',1),
  ('В работе',2),
  ('Ожидает',3),
  ('Решена',4),
  ('Отклонена',5);
INSERT INTO statuses(name) SELECT DISTINCT status FROM tickets ON CONFLICT DO NOTHING;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_fk FOREIGN KEY (status) REFERENCES statuses(name);

CREATE TABLE departments (
  name text PRIMARY KEY,
  sort_order integer NOT NULL DEFAULT 100
);
INSERT INTO departments(name) SELECT DISTINCT department FROM tickets ON CONFLICT DO NOTHING;
ALTER TABLE tickets ADD CONSTRAINT tickets_department_fk FOREIGN KEY (department) REFERENCES departments(name);

CREATE TABLE locations (
  name text PRIMARY KEY,
  sort_order integer NOT NULL DEFAULT 100
);
INSERT INTO locations(name,sort_order) VALUES
  ('Библиотека',1),
  ('Актовый зал',2),
  ('Административный корпус',3);
INSERT INTO locations(name) SELECT DISTINCT location FROM tickets ON CONFLICT DO NOTHING;
ALTER TABLE tickets ADD CONSTRAINT tickets_location_fk FOREIGN KEY (location) REFERENCES locations(name);

-- Both existing clients and the new form can submit a previously unseen room or department.
CREATE FUNCTION remember_ticket_place() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO departments(name) VALUES (NEW.department) ON CONFLICT DO NOTHING;
  INSERT INTO locations(name) VALUES (NEW.location) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER ticket_place BEFORE INSERT OR UPDATE OF department, location ON tickets
FOR EACH ROW EXECUTE FUNCTION remember_ticket_place();

CREATE TABLE ticket_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ticket_id integer NOT NULL REFERENCES tickets(id),
  actor_id integer REFERENCES staff(id),
  event_type text NOT NULL CHECK (event_type IN ('baseline','created','changed')),
  status text NOT NULL,
  priority text NOT NULL,
  assignee_id integer REFERENCES staff(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ticket_history_ticket_idx ON ticket_history(ticket_id,id);

INSERT INTO ticket_history(ticket_id,event_type,status,priority,assignee_id)
SELECT id,'baseline',status,priority,assignee_id FROM tickets;

CREATE FUNCTION record_ticket_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor integer;
BEGIN
  IF TG_OP = 'INSERT' THEN
    actor := NEW.staff_id;
  ELSE
    IF ROW(NEW.status,NEW.priority,NEW.assignee_id) IS NOT DISTINCT FROM
       ROW(OLD.status,OLD.priority,OLD.assignee_id) THEN RETURN NEW; END IF;
    actor := NULLIF(current_setting('prioritet.actor_id',true),'')::integer;
  END IF;
  INSERT INTO ticket_history(ticket_id,actor_id,event_type,status,priority,assignee_id)
  VALUES (NEW.id,actor,CASE WHEN TG_OP='INSERT' THEN 'created' ELSE 'changed' END,
          NEW.status,NEW.priority,NEW.assignee_id);
  RETURN NEW;
END $$;
CREATE TRIGGER ticket_history_event AFTER INSERT OR UPDATE OF status,priority,assignee_id ON tickets
FOR EACH ROW EXECUTE FUNCTION record_ticket_history();

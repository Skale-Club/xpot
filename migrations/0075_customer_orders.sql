-- Additive. Roll back by disabling new orders, keeping reservation enforcement until
-- all allocations are released. Never drop used financial or delivery history.
CREATE TABLE customer_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 lead_id integer NOT NULL REFERENCES sales_leads(id) ON DELETE RESTRICT, rep_id integer NOT NULL REFERENCES sales_reps(id) ON DELETE RESTRICT,
 visit_id integer REFERENCES sales_visits(id) ON DELETE SET NULL, opportunity_id integer REFERENCES sales_opportunities_local(id) ON DELETE RESTRICT,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','cancelled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0), notes text, created_by_user_id text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customer_orders_opportunity_unique ON customer_orders(opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX customer_orders_organization_idx ON customer_orders(organization_id,status,created_at DESC);
CREATE INDEX customer_orders_rep_idx ON customer_orders(rep_id,status,created_at DESC);
CREATE INDEX customer_orders_lead_idx ON customer_orders(lead_id,created_at DESC);
CREATE TABLE customer_order_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES customer_orders(id) ON DELETE RESTRICT,
 sequence integer NOT NULL, quantity integer NOT NULL CHECK(quantity>0 AND quantity<=1000),
 cancelled_quantity integer NOT NULL DEFAULT 0 CHECK(cancelled_quantity>=0 AND cancelled_quantity<=quantity),
 description text NOT NULL, sales_product_id integer NOT NULL REFERENCES sales_products(id) ON DELETE RESTRICT,
 product_type text NOT NULL, face text NOT NULL, theme text, unit_price_cents integer NOT NULL CHECK(unit_price_cents>=0),
 producer_organization_id integer NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 model_id uuid REFERENCES print_models(id) ON DELETE RESTRICT, version_id uuid REFERENCES print_model_versions(id) ON DELETE RESTRICT,
 custom text NOT NULL DEFAULT 'standard' CHECK(custom IN ('standard','custom')), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,sequence)
);
CREATE INDEX customer_order_lines_producer_idx ON customer_order_lines(producer_organization_id,order_id);
CREATE TABLE customer_order_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES customer_orders(id) ON DELETE RESTRICT,
 sale_id integer NOT NULL UNIQUE REFERENCES sales_sales(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','reversed')),
 actor_user_id text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_order_deliveries_order_idx ON customer_order_deliveries(order_id);
CREATE TABLE customer_order_pieces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), line_id uuid NOT NULL REFERENCES customer_order_lines(id) ON DELETE RESTRICT,
 tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE RESTRICT,
 state text NOT NULL DEFAULT 'allocated' CHECK(state IN ('allocated','delivered','released','damaged','returned')),
 delivery_id uuid REFERENCES customer_order_deliveries(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX customer_order_pieces_one_allocation ON customer_order_pieces(tag_id) WHERE state='allocated';
CREATE INDEX customer_order_pieces_line_idx ON customer_order_pieces(line_id,state);
CREATE TABLE customer_order_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES customer_orders(id) ON DELETE RESTRICT,
 action text NOT NULL, command_key text NOT NULL, fingerprint text NOT NULL, actor_user_id text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(actor_user_id,command_key)
);
CREATE INDEX customer_order_events_order_idx ON customer_order_events(order_id,created_at);
CREATE TABLE customer_order_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES customer_orders(id) ON DELETE RESTRICT,
 kind text NOT NULL CHECK(kind IN ('received','applied','refund','retained','release')), amount_cents integer NOT NULL CHECK(amount_cents>0),
 payment_method text, delivery_id uuid REFERENCES customer_order_deliveries(id) ON DELETE RESTRICT,
 reference_id uuid REFERENCES customer_order_payments(id) ON DELETE RESTRICT, reason text NOT NULL, actor_user_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_order_payments_order_idx ON customer_order_payments(order_id,created_at);
CREATE TABLE customer_order_artwork (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), line_id uuid NOT NULL REFERENCES customer_order_lines(id) ON DELETE RESTRICT,
 revision integer NOT NULL CHECK(revision>0), kind text NOT NULL CHECK(kind IN ('brief','proof')),
 description text NOT NULL, file_ref text, filename text, content_type text, sha256 text,
 status text NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','superseded')),
 approved_by text, approval_method text, approved_at timestamptz, created_by_user_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(line_id,revision)
);
CREATE UNIQUE INDEX customer_order_artwork_one_approved ON customer_order_artwork(line_id) WHERE status='approved';
ALTER TABLE tags ADD COLUMN customer_order_line_id uuid REFERENCES customer_order_lines(id) ON DELETE RESTRICT;
ALTER TABLE print_requests ADD COLUMN customer_order_line_id uuid REFERENCES customer_order_lines(id) ON DELETE RESTRICT;
ALTER TABLE print_models ADD COLUMN customer_order_line_id uuid REFERENCES customer_order_lines(id) ON DELETE RESTRICT;
CREATE INDEX tags_customer_order_idx ON tags(customer_order_line_id) WHERE customer_order_line_id IS NOT NULL;
CREATE INDEX print_requests_customer_order_idx ON print_requests(customer_order_line_id) WHERE customer_order_line_id IS NOT NULL;
ALTER TABLE sales_tasks ADD COLUMN customer_order_id uuid REFERENCES customer_orders(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX sales_tasks_order_ready_unique ON sales_tasks(customer_order_id) WHERE customer_order_id IS NOT NULL;

-- One follow-up for this request, reopened when another good piece arrives.
-- It shares the stock transaction, so a failed intake cannot leave a phantom task.
CREATE FUNCTION customer_order_ready_task() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE header customer_orders%ROWTYPE; ready boolean;
BEGIN
 SELECT o.* INTO header FROM customer_orders o JOIN customer_order_lines l ON l.order_id=o.id WHERE l.id=NEW.line_id;
 SELECT EXISTS(SELECT 1 FROM customer_order_pieces p JOIN customer_order_lines l ON l.id=p.line_id WHERE l.order_id=header.id AND p.state='allocated') INTO ready;
 IF ready AND header.status='open' THEN
  INSERT INTO sales_tasks(organization_id,lead_id,rep_id,type,priority,source,title,description,due_at,customer_order_id)
  VALUES(header.organization_id,header.lead_id,header.rep_id,'follow_up','medium','automation','Deliver customer order',
    (SELECT name FROM sales_leads WHERE id=header.lead_id),now(),header.id)
  ON CONFLICT(customer_order_id) WHERE customer_order_id IS NOT NULL DO UPDATE SET
    status='pending',rep_id=EXCLUDED.rep_id,completed_at=NULL,cancelled_at=NULL,updated_at=now();
 ELSE
  UPDATE sales_tasks SET status='completed',completed_at=now(),updated_at=now() WHERE customer_order_id=header.id AND status IN ('pending','in_progress');
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER customer_order_ready_task AFTER INSERT OR UPDATE OF state ON customer_order_pieces FOR EACH ROW EXECUTE FUNCTION customer_order_ready_task();

-- Defense in depth: old APIs cannot sell/configure/redirect a separated piece.
-- Authorized logistics may move it only to its order's seller and organization.
CREATE FUNCTION protect_customer_order_piece() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target customer_order_lines%ROWTYPE; owner_order customer_orders%ROWTYPE; production_line uuid; design_lead integer;
BEGIN
 SELECT o.lead_id INTO design_lead FROM tag_batches b JOIN print_jobs j ON j.id=b.print_job_id
  JOIN print_models m ON m.id=j.model_id JOIN customer_order_lines l ON l.id=m.customer_order_line_id
  JOIN customer_orders o ON o.id=l.order_id WHERE b.id=OLD.batch_id;
 IF design_lead IS NOT NULL AND (
    (NEW.lead_id IS NOT NULL AND NEW.lead_id<>design_lead) OR
    (NEW.stock_status='sold' AND NEW.lead_id IS DISTINCT FROM design_lead) OR
    (NEW.status='active' AND NEW.lead_id IS DISTINCT FROM design_lead) OR
    NEW.batch_id IS DISTINCT FROM OLD.batch_id) THEN
  RAISE EXCEPTION 'order_piece_design' USING ERRCODE='P0001';
 END IF;
 IF OLD.customer_order_line_id IS NOT NULL AND NEW.customer_order_line_id IS NOT NULL THEN
  SELECT * INTO target FROM customer_order_lines WHERE id=OLD.customer_order_line_id;
  SELECT * INTO owner_order FROM customer_orders WHERE id=target.order_id;
  IF NEW.customer_order_line_id IS DISTINCT FROM OLD.customer_order_line_id OR
     NEW.lead_id IS DISTINCT FROM OLD.lead_id OR NEW.destination_url IS DISTINCT FROM OLD.destination_url OR
     NEW.destination_type IS DISTINCT FROM OLD.destination_type OR NEW.status IS DISTINCT FROM OLD.status OR
     NEW.product_type IS DISTINCT FROM OLD.product_type OR NEW.face IS DISTINCT FROM OLD.face OR
     NEW.sales_product_id IS DISTINCT FROM OLD.sales_product_id OR NEW.stock_status IN ('sold','lost','internal_use','retired') OR
     NEW.batch_id IS DISTINCT FROM OLD.batch_id OR
     (NEW.rep_id IS DISTINCT FROM OLD.rep_id AND NEW.rep_id IS DISTINCT FROM owner_order.rep_id) OR
     NEW.organization_id NOT IN (owner_order.organization_id,target.producer_organization_id) THEN
   RAISE EXCEPTION 'order_piece_allocated' USING ERRCODE='P0001';
  END IF;
  IF NEW.stock_status='damaged' THEN
   UPDATE customer_order_pieces SET state='damaged',updated_at=now() WHERE tag_id=NEW.id AND state='allocated';
   NEW.customer_order_line_id=NULL;
  END IF;
 END IF;
 IF OLD.stock_status='pending' AND NEW.stock_status='available' THEN
  SELECT r.customer_order_line_id INTO production_line FROM tag_batches b JOIN print_jobs j ON j.id=b.print_job_id
   JOIN print_requests r ON r.id=j.request_id WHERE b.id=NEW.batch_id;
  IF production_line IS NOT NULL THEN
   SELECT * INTO target FROM customer_order_lines WHERE id=production_line FOR UPDATE;
   SELECT * INTO owner_order FROM customer_orders WHERE id=target.order_id;
   IF owner_order.status='open' AND
      (SELECT count(*) FROM customer_order_pieces WHERE line_id=production_line AND state IN ('allocated','delivered')) < target.quantity-target.cancelled_quantity THEN
    NEW.customer_order_line_id=production_line;
   END IF;
  END IF;
 END IF;
 IF NEW.customer_order_line_id IS NOT NULL AND NEW.stock_status='available' THEN
  INSERT INTO customer_order_pieces(line_id,tag_id) VALUES(NEW.customer_order_line_id,NEW.id)
   ON CONFLICT(tag_id) WHERE state='allocated' DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_customer_order_piece BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION protect_customer_order_piece();

CREATE FUNCTION customer_order_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'customer_order_history_immutable'; END $$;
CREATE TRIGGER customer_order_events_immutable BEFORE UPDATE OR DELETE ON customer_order_events FOR EACH ROW EXECUTE FUNCTION customer_order_append_only();
CREATE TRIGGER customer_order_payments_immutable BEFORE UPDATE OR DELETE ON customer_order_payments FOR EACH ROW EXECUTE FUNCTION customer_order_append_only();

ALTER TABLE customer_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_order_artwork ENABLE ROW LEVEL SECURITY;

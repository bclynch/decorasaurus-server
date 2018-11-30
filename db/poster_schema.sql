BEGIN;

DROP SCHEMA IF EXISTS decorasaurus, decorasaurus_private cascade;
DROP ROLE IF EXISTS decorasaurus_admin, decorasaurus_anonymous, decorasaurus_customer;

CREATE SCHEMA decorasaurus;
CREATE SCHEMA decorasaurus_private;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

ALTER default privileges REVOKE EXECUTE ON functions FROM public;

-- *******************************************************************
-- *********************** Audit Trigger *****************************
-- *******************************************************************
CREATE EXTENSION IF NOT EXISTS hstore;
--
-- Audited data. Lots of information is available, it's just a matter of how much
-- you really want to record. See:
--
--   http://www.postgresql.org/docs/9.1/static/functions-info.html
--
-- Remember, every column you add takes up more audit table space and slows audit
-- inserts.
--
-- Every index you add has a big impact too, so avoid adding indexes to the
-- audit table unless you REALLY need them. The hstore GIST indexes are
-- particularly expensive.
--
-- It is sometimes worth copying the audit table, or a coarse subset of it that
-- you're interested in, into a temporary table where you CREATE any useful
-- indexes and do your analysis.
--
CREATE TABLE decorasaurus.logged_actions (
    event_id bigSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    customer_id UUID,
    session_user_name TEXT,
    action_tstamp_tx TIMESTAMP WITH TIME ZONE NOT NULL,
    client_addr inet,
    action TEXT NOT NULL CHECK (action IN ('I','D','U', 'T')),
    row_data hstore,
    changed_fields hstore
);

REVOKE ALL ON decorasaurus.logged_actions FROM public;

COMMENT ON TABLE decorasaurus.logged_actions IS 'History of auditable actions on audited tables, from decorasaurus_private.if_modified_func()';
COMMENT ON COLUMN decorasaurus.logged_actions.event_id IS 'Unique identifier for each auditable event';
COMMENT ON COLUMN decorasaurus.logged_actions.table_name IS 'Non-schema-qualified table name of table event occured in';
COMMENT ON COLUMN decorasaurus.logged_actions.customer_id IS 'User performing the action';
COMMENT ON COLUMN decorasaurus.logged_actions.session_user_name IS 'Login / session user whose statement caused the audited event';
COMMENT ON COLUMN decorasaurus.logged_actions.action_tstamp_tx IS 'Transaction start TIMESTAMP for tx in which audited event occurred';
COMMENT ON COLUMN decorasaurus.logged_actions.client_addr IS 'IP address of client that issued query. Null for unix domain socket.';
COMMENT ON COLUMN decorasaurus.logged_actions.action IS 'Action type; I = insert, D = delete, U = update, T = truncate';
COMMENT ON COLUMN decorasaurus.logged_actions.row_data IS 'Record value. Null for statement-level trigger. For INSERT this is the new tuple. For DELETE and UPDATE it is the old tuple.';
COMMENT ON COLUMN decorasaurus.logged_actions.changed_fields IS 'New values of fields changed by UPDATE. Null except for row-level UPDATE events.';

CREATE OR REPLACE FUNCTION decorasaurus_private.if_modified_func() RETURNS TRIGGER AS $body$
DECLARE
    audit_row decorasaurus.logged_actions;
    include_values boolean;
    log_diffs boolean;
    h_old hstore;
    h_new hstore;
    excluded_cols TEXT[] = ARRAY[]::TEXT[];
BEGIN
    IF TG_WHEN <> 'AFTER' THEN
        RAISE EXCEPTION 'decorasaurus_private.if_modified_func() may only run as an AFTER trigger';
    END IF;

    audit_row = ROW(
        nextval('decorasaurus.logged_actions_event_id_seq'), -- event_id
        TG_TABLE_NAME::TEXT,                          -- table_name
        current_setting('jwt.claims.customer_id', true)::UUID, -- customer_id
        session_user::TEXT,                           -- session_user_name
        current_TIMESTAMP,                            -- action_tstamp_tx
        inet_client_addr(),                           -- client_addr
        substring(TG_OP,1,1),                         -- action
        NULL, NULL                                   -- row_data, changed_fields
        );

    IF TG_ARGV[1] IS NOT NULL THEN
        excluded_cols = TG_ARGV[1]::TEXT[];
    END IF;
    
    IF (TG_OP = 'UPDATE' AND TG_LEVEL = 'ROW') THEN
        audit_row.row_data = hstore(OLD.*) - excluded_cols;
        audit_row.changed_fields =  (hstore(NEW.*) - audit_row.row_data) - excluded_cols;
        IF audit_row.changed_fields = hstore('') THEN
            -- All changed fields are ignored. Skip this update.
            RETURN NULL;
        END IF;
    ELSIF (TG_OP = 'DELETE' AND TG_LEVEL = 'ROW') THEN
        audit_row.row_data = hstore(OLD.*) - excluded_cols;
    ELSIF (TG_OP = 'INSERT' AND TG_LEVEL = 'ROW') THEN
        audit_row.row_data = hstore(NEW.*) - excluded_cols;
    ELSE
        RAISE EXCEPTION '[decorasaurus_private.if_modified_func] - Trigger func added as trigger for unhandled case: %, %',TG_OP, TG_LEVEL;
        RETURN NULL;
    END IF;
    INSERT INTO decorasaurus.logged_actions VALUES (audit_row.*);
    RETURN NULL;
END;
$body$
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;


COMMENT ON FUNCTION decorasaurus_private.if_modified_func() IS $body$
Track changes to a table at the statement and/or row level.

Optional parameters to trigger in CREATE TRIGGER call:

param 0: boolean, whether to log the query TEXT. Default 't'.

param 1: TEXT[], columns to ignore in updates. Default [].

         Updates to ignored cols are omitted from changed_fields.

         Updates with only ignored cols changed are not inserted
         into the audit log.

         Almost all the processing work is still done for updates
         that ignored. If you need to save the load, you need to use
         WHEN clause on the trigger instead.

         No warning or error is issued if ignored_cols contains columns
         that do not exist in the target table. This lets you specify
         a standard set of ignored columns.

There is no parameter to disable logging of values. Add this trigger as
a 'FOR EACH STATEMENT' rather than 'FOR EACH ROW' trigger if you do not
want to log row values.

Note that the user name logged is the login role for the session. The audit trigger
cannot obtain the active role because it is reset by the SECURITY DEFINER invocation
of the audit trigger its self.
$body$;



CREATE OR REPLACE FUNCTION decorasaurus.audit_table(target_table regclass, audit_rows boolean, audit_query_TEXT boolean, ignored_cols TEXT[]) RETURNS void AS $body$
DECLARE
  stm_targets TEXT = 'INSERT OR UPDATE OR DELETE OR TRUNCATE';
  _q_txt TEXT;
  _ignored_cols_snip TEXT = '';
BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_trigger_row ON ' || quote_ident(target_table::TEXT);
    EXECUTE 'DROP TRIGGER IF EXISTS audit_trigger_stm ON ' || quote_ident(target_table::TEXT);

    IF audit_rows THEN
        IF array_length(ignored_cols,1) > 0 THEN
            _ignored_cols_snip = ', ' || quote_literal(ignored_cols);
        END IF;
        _q_txt = 'CREATE TRIGGER audit_trigger_row AFTER INSERT OR UPDATE OR DELETE ON ' || 
                 quote_ident(target_table::TEXT) || 
                 ' FOR EACH ROW EXECUTE PROCEDURE decorasaurus_private.if_modified_func(' ||
                 quote_literal(audit_query_TEXT) || _ignored_cols_snip || ');';
        RAISE NOTICE '%',_q_txt;
        EXECUTE _q_txt;
        stm_targets = 'TRUNCATE';
    ELSE
    END IF;

    _q_txt = 'CREATE TRIGGER audit_trigger_stm AFTER ' || stm_targets || ' ON ' ||
             target_table ||
             ' FOR EACH STATEMENT EXECUTE PROCEDURE decorasaurus_private.if_modified_func('||
             quote_literal(audit_query_TEXT) || ');';
    RAISE NOTICE '%',_q_txt;
    EXECUTE _q_txt;

END;
$body$
language 'plpgsql';

COMMENT ON FUNCTION decorasaurus.audit_table(regclass, boolean, boolean, TEXT[]) IS $body$
Add auditing support to a table.

Arguments:
   target_table:     Table name, schema qualified if not on search_path
   audit_rows:       Record each row change, or only audit at a statement level
   audit_query_TEXT: Record the TEXT of the client query that triggered the audit event?
   ignored_cols:     Columns to exclude from update diffs, ignore updates that change only ignored cols.
$body$;

-- Pg doesn't allow variadic calls with 0 params, so provide a wrapper
CREATE OR REPLACE FUNCTION decorasaurus.audit_table(target_table regclass, audit_rows boolean, audit_query_TEXT boolean) RETURNS void AS $body$
SELECT decorasaurus.audit_table($1, $2, $3, ARRAY[]::TEXT[]);
$body$ LANGUAGE SQL;

-- And provide a convenience call wrapper for the simplest case
-- of row-level logging with no excluded cols and query logging enabled.
--
CREATE OR REPLACE FUNCTION decorasaurus.audit_table(target_table regclass) RETURNS void AS $body$
SELECT decorasaurus.audit_table($1, BOOLEAN 't', BOOLEAN 't');
$body$ LANGUAGE 'sql';

COMMENT ON FUNCTION decorasaurus.audit_table(regclass) IS $body$
Add auditing support to the given table. Row-level changes will be logged with full client query TEXT. No cols are ignored.
$body$;

-- Maybe create a column for how often they want to receive email notifications
CREATE TABLE decorasaurus.customer (
  id                   UUID PRIMARY KEY default uuid_generate_v1mc(),
  first_name           TEXT NOT NULL check (char_length(first_name) < 256),
  last_name            TEXT NOT NULL check (char_length(last_name) < 256),
  created_at           BIGINT default (extract(epoch from now()) * 1000),
  updated_at           TIMESTAMP default now()
);

CREATE TRIGGER customer_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON decorasaurus.customer
FOR EACH ROW EXECUTE PROCEDURE decorasaurus_private.if_modified_func();

-- INSERT INTO pomb.account (username, first_name, last_name, profile_photo, city, country, user_status, auto_update_location) values
--   ('teeth-creep', 'Ms', 'D', 'https://laze-app.s3.amazonaws.com/19243203_10154776689779211_34706076750698170_o-w250-1509052127322.jpg', 'London', 'UK', 'Living the dream', true);

COMMENT ON TABLE decorasaurus.customer IS 'Table with decorasaurus users';
COMMENT ON COLUMN decorasaurus.customer.id IS 'Primary id for customer';
COMMENT ON COLUMN decorasaurus.customer.first_name IS 'First name of customer';
COMMENT ON COLUMN decorasaurus.customer.last_name IS 'Last name of customer';
COMMENT ON COLUMN decorasaurus.customer.created_at IS 'When customer created';
COMMENT ON COLUMN decorasaurus.customer.updated_at IS 'When customer last updated';

-- Limiting choices for status field on product
CREATE TYPE decorasaurus.product_status as enum (
  'live',
  'draft'
);

CREATE TABLE decorasaurus.product (
  sku                  TEXT primary key,
  name                 TEXT NOT NULL check (char_length(name) < 256),
  slug                 TEXT NOT NULL check (char_length(slug) < 256),
  description          TEXT check (char_length(description) < 2400),
  status               decorasaurus.product_status default 'live',
  created_at           BIGINT default (extract(epoch from now()) * 1000),
  updated_at           TIMESTAMP default now()
);

CREATE TRIGGER product_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON decorasaurus.product
FOR EACH ROW EXECUTE PROCEDURE decorasaurus_private.if_modified_func();

INSERT INTO decorasaurus.product (sku, name, slug, description) values
  ('fusion', 'Fusion Poster', 'fusion-poster', null),
  ('patent', 'Patent Poster', 'patent-poster', null),
  ('trace', 'Trace Poster', 'trace-poster', null),
  ('map', 'Map Poster', 'map-poster', null);

COMMENT ON TABLE decorasaurus.product IS 'Table with decorasaurus products';
COMMENT ON COLUMN decorasaurus.product.sku IS 'Primary id and sku for the product';
COMMENT ON COLUMN decorasaurus.product.name IS 'Name of the product';
COMMENT ON COLUMN decorasaurus.product.slug IS 'Slug of the product. A slug is the part of a URL which identifies a page using human-readable keywords.';
COMMENT ON COLUMN decorasaurus.product.description IS 'Description for the product';
COMMENT ON COLUMN decorasaurus.product.status IS 'Status for the product. Either live or draft';
COMMENT ON COLUMN decorasaurus.product.created_at IS 'When product created';
COMMENT ON COLUMN decorasaurus.product.updated_at IS 'When product last updated';

-- ALTER TABLE decorasaurus.product ENABLE ROW LEVEL SECURITY;

-- Limiting choices for status field on product
CREATE TYPE decorasaurus.currency_type as enum (
  'USD',
  'AUD',
  'CAD',
  'GBP',
  'EUR'
);

CREATE TABLE decorasaurus.product_price (
  id                   SERIAL PRIMARY KEY,
  product_sku          TEXT NOT NULL references decorasaurus.product(sku) on delete cascade,
  amount               INTEGER NOT NULL,
  currency             decorasaurus.currency_type NOT NULL,
  created_at           BIGINT default (extract(epoch from now()) * 1000),
  updated_at           TIMESTAMP default now()
);

CREATE TRIGGER product_price_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON decorasaurus.product_price
FOR EACH ROW EXECUTE PROCEDURE decorasaurus_private.if_modified_func();

INSERT INTO decorasaurus.product_price (product_sku, amount, currency) values
  ('fusion', 7500, 'USD'),
  ('fusion', 6000, 'EUR'),
  ('patent', 6500, 'USD'),
  ('patent', 5500, 'EUR'),
  ('trace', 6500, 'USD'),
  ('trace', 5500, 'EUR'),
  ('map', 7000, 'USD'),
  ('map', 5800, 'EUR');


COMMENT ON TABLE decorasaurus.product_price IS 'Table with product price information';
COMMENT ON COLUMN decorasaurus.product_price.id IS 'Primary id for product price';
COMMENT ON COLUMN decorasaurus.product_price.product_sku IS 'Foreign key for product';
COMMENT ON COLUMN decorasaurus.product_price.amount IS 'Amount in cents for the product (ex. 100 === $1)';
COMMENT ON COLUMN decorasaurus.product_price.currency IS '3 Letter ISO for currency';
COMMENT ON COLUMN decorasaurus.product_price.created_at IS 'When product_price created';
COMMENT ON COLUMN decorasaurus.product_price.updated_at IS 'When product_price last updated';

-- ALTER TABLE decorasaurus.product_price ENABLE ROW LEVEL SECURITY;

CREATE TABLE decorasaurus.cart (
  id                   UUID PRIMARY KEY default uuid_generate_v1mc(),
  customer_id          UUID REFERENCES decorasaurus.customer(id) ON DELETE CASCADE,
  created_at           BIGINT default (extract(epoch from now()) * 1000),
  updated_at           TIMESTAMP default now()
);

CREATE TRIGGER cart_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON decorasaurus.cart
FOR EACH ROW EXECUTE PROCEDURE decorasaurus_private.if_modified_func();

COMMENT ON TABLE decorasaurus.cart IS 'Table with cart information';
COMMENT ON COLUMN decorasaurus.cart.id IS 'Primary id for cart';
COMMENT ON COLUMN decorasaurus.cart.customer_id IS 'Reference to customer related to cart if logged in';
COMMENT ON COLUMN decorasaurus.cart.created_at IS 'When cart created';
COMMENT ON COLUMN decorasaurus.cart.updated_at IS 'When cart last updated';

-- ALTER TABLE decorasaurus.cart ENABLE ROW LEVEL SECURITY;

CREATE TABLE decorasaurus.cart_item (
  id                   UUID PRIMARY KEY default uuid_generate_v1mc(),
  cart_id              UUID NOT NULL REFERENCES decorasaurus.cart(id) ON DELETE CASCADE,
  product_sku          TEXT NOT NULL REFERENCES decorasaurus.product(sku) ON DELETE CASCADE,
  quantity             INTEGER NOT NULL CHECK (quantity > 0),
  created_at           BIGINT default (extract(epoch from now()) * 1000),
  updated_at           TIMESTAMP default now()
);

CREATE TRIGGER cart_item_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON decorasaurus.cart_item
FOR EACH ROW EXECUTE PROCEDURE decorasaurus_private.if_modified_func();

COMMENT ON TABLE decorasaurus.cart_item IS 'Table with cart item information';
COMMENT ON COLUMN decorasaurus.cart_item.id IS 'Primary id for cart item';
COMMENT ON COLUMN decorasaurus.cart_item.cart_id IS 'Reference to cart item is related to';
COMMENT ON COLUMN decorasaurus.cart_item.product_sku IS 'Reference to product';
COMMENT ON COLUMN decorasaurus.cart_item.quantity IS 'Quantity of cart items';
COMMENT ON COLUMN decorasaurus.cart_item.created_at IS 'When cart item created';
COMMENT ON COLUMN decorasaurus.cart_item.updated_at IS 'When cart item last updated';

-- ALTER TABLE decorasaurus.cart_item ENABLE ROW LEVEL SECURITY;

-- Limiting choices for type field on address
CREATE TYPE decorasaurus.address_type as enum (
  'billing',
  'shipping'
);

CREATE TABLE decorasaurus.address (
  id                   UUID PRIMARY KEY default uuid_generate_v1mc(),
  customer_id          UUID NOT NULL REFERENCES decorasaurus.customer(id) ON DELETE CASCADE,
  type                 decorasaurus.address_type not null,
  name                 TEXT,
  first_name           TEXT not null,
  last_name            TEXT not null,
  company              TEXT,
  line_1               TEXT not null,
  line_2               TEXT,
  city                 TEXT not null,
  postcode             TEXT not null,
  country              TEXT not null,
  instructions         TEXT,
  created_at           BIGINT default (extract(epoch from now()) * 1000),
  updated_at           TIMESTAMP default now()
);

CREATE TRIGGER address_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON decorasaurus.address
FOR EACH ROW EXECUTE PROCEDURE decorasaurus_private.if_modified_func();

COMMENT ON TABLE decorasaurus.address IS 'Table with address information';
COMMENT ON COLUMN decorasaurus.address.id IS 'Primary id for address';
COMMENT ON COLUMN decorasaurus.address.customer_id IS 'Reference to customer connected to address';
COMMENT ON COLUMN decorasaurus.address.type IS 'Type of address';
COMMENT ON COLUMN decorasaurus.address.name IS 'Field user can populate with their own name for the address';
COMMENT ON COLUMN decorasaurus.address.first_name IS 'First name of recipient';
COMMENT ON COLUMN decorasaurus.address.last_name IS 'Last name of recipient';
COMMENT ON COLUMN decorasaurus.address.company IS 'Company of address';
COMMENT ON COLUMN decorasaurus.address.line_1 IS 'First line of address';
COMMENT ON COLUMN decorasaurus.address.line_2 IS 'Optional second line of address';
COMMENT ON COLUMN decorasaurus.address.city IS 'City of the address';
COMMENT ON COLUMN decorasaurus.address.postcode IS 'Postcode / zipcode of the address';
COMMENT ON COLUMN decorasaurus.address.country IS 'Country of the address';
COMMENT ON COLUMN decorasaurus.address.instructions IS 'Extra instructions for the carrier about the address';
COMMENT ON COLUMN decorasaurus.address.created_at IS 'When address created';
COMMENT ON COLUMN decorasaurus.address.updated_at IS 'When address last updated';

ALTER TABLE decorasaurus.address ENABLE ROW LEVEL SECURITY;

-- Limiting choices for status field on order
CREATE TYPE decorasaurus.order_status as enum (
  'incomplete',
  'complete'
);

-- Limiting choices for payment field on order
CREATE TYPE decorasaurus.order_payment as enum (
  'unpaid',
  'paid',
  'refunded'
);

-- Limiting choices for shipping field on order
CREATE TYPE decorasaurus.order_shipping as enum (
  'fulfilled',
  'unfulfilled'
);

CREATE TABLE decorasaurus.order (
  id                   UUID PRIMARY KEY default uuid_generate_v1mc(),
  status               decorasaurus.order_status not null,
  payment              decorasaurus.order_payment not null,
  shipping             decorasaurus.order_shipping not null,
  customer_id          UUID NOT NULL REFERENCES decorasaurus.customer(id) ON DELETE CASCADE,
  billing_address_id   UUID NOT NULL REFERENCES decorasaurus.address(id),
  shipping_address_id  UUID NOT NULL REFERENCES decorasaurus.address(id),
  created_at           BIGINT default (extract(epoch from now()) * 1000),
  updated_at           TIMESTAMP default now()
);

CREATE TRIGGER order_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON decorasaurus.order
FOR EACH ROW EXECUTE PROCEDURE decorasaurus_private.if_modified_func();

COMMENT ON TABLE decorasaurus.order IS 'Table with order information';
COMMENT ON COLUMN decorasaurus.order.id IS 'Primary id for the order';
COMMENT ON COLUMN decorasaurus.order.status IS 'Status of the order';
COMMENT ON COLUMN decorasaurus.order.payment IS 'Payment status for the order';
COMMENT ON COLUMN decorasaurus.order.shipping IS 'Shipping status for the order';
COMMENT ON COLUMN decorasaurus.order.customer_id IS 'Customer reference for the order';
COMMENT ON COLUMN decorasaurus.order.billing_address_id IS 'Billing address reference for the order';
COMMENT ON COLUMN decorasaurus.order.shipping_address_id IS 'Shipping address reference for the order';
COMMENT ON COLUMN decorasaurus.order.created_at IS 'When order created';
COMMENT ON COLUMN decorasaurus.order.updated_at IS 'When order last updated';

ALTER TABLE decorasaurus.order ENABLE ROW LEVEL SECURITY;

CREATE TABLE decorasaurus.order_item (
  id                   UUID PRIMARY KEY default uuid_generate_v1mc(),
  order_id             UUID NOT NULL REFERENCES decorasaurus.order(id) ON DELETE CASCADE,
  product_sku          TEXT NOT NULL REFERENCES decorasaurus.product(sku) ON DELETE CASCADE,
  created_at           BIGINT default (extract(epoch from now()) * 1000),
  updated_at           TIMESTAMP default now()
);

CREATE TRIGGER order_item_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON decorasaurus.order_item
FOR EACH ROW EXECUTE PROCEDURE decorasaurus_private.if_modified_func();

COMMENT ON TABLE decorasaurus.order_item IS 'Table with order item information';
COMMENT ON COLUMN decorasaurus.order_item.id IS 'Primary id for order item';
COMMENT ON COLUMN decorasaurus.order_item.order_id IS 'Reference to order id item related to';
COMMENT ON COLUMN decorasaurus.order_item.product_sku IS 'Reference to product sku';
COMMENT ON COLUMN decorasaurus.order_item.created_at IS 'When order created';
COMMENT ON COLUMN decorasaurus.order_item.updated_at IS 'When order last updated';

-- ALTER TABLE decorasaurus.order_item ENABLE ROW LEVEL SECURITY;

-- Limiting choices for type field on links
CREATE TYPE decorasaurus.link_type as enum (
  'pdf',
  'thumbnail',
  'crop'
);

CREATE TABLE decorasaurus.product_links (
  id                   SERIAL PRIMARY KEY,
  cart_item_id         UUID REFERENCES decorasaurus.cart_item(id),
  order_item_id        UUID REFERENCES decorasaurus.order_item(id) ON DELETE CASCADE,
  type                 decorasaurus.link_type not null,
  url                  TEXT not null,
  created_at           BIGINT default (extract(epoch from now()) * 1000),
  updated_at           TIMESTAMP default now()
);

CREATE TRIGGER product_links_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON decorasaurus.product_links
FOR EACH ROW EXECUTE PROCEDURE decorasaurus_private.if_modified_func();

COMMENT ON TABLE decorasaurus.product_links IS 'Table with product links information';
COMMENT ON COLUMN decorasaurus.product_links.id IS 'Primary id for lniks';
COMMENT ON COLUMN decorasaurus.product_links.cart_item_id IS 'Reference to cart item';
COMMENT ON COLUMN decorasaurus.product_links.order_item_id IS 'Reference to order item';
COMMENT ON COLUMN decorasaurus.product_links.type IS 'Type of link';
COMMENT ON COLUMN decorasaurus.product_links.url IS 'URL of the link';
COMMENT ON COLUMN decorasaurus.product_links.created_at IS 'When product link created';
COMMENT ON COLUMN decorasaurus.product_links.updated_at IS 'When product link last updated';

-- ALTER TABLE decorasaurus.product_links ENABLE ROW LEVEL SECURITY;

-- *******************************************************************
-- *********************** Function Queries **************************
-- *******************************************************************


-- *******************************************************************
-- ************************* Triggers ********************************
-- *******************************************************************
CREATE FUNCTION decorasaurus_private.set_updated_at() returns trigger as $$
begin
  new.updated_at := current_TIMESTAMP;
  return new;
end;
$$ language plpgsql;

create trigger customer_updated_at before update
  on decorasaurus.customer
  for each row
  execute procedure decorasaurus_private.set_updated_at();

create trigger product_updated_at before update
  on decorasaurus.product
  for each row
  execute procedure decorasaurus_private.set_updated_at();

create trigger product_price_updated_at before update
  on decorasaurus.product_price
  for each row
  execute procedure decorasaurus_private.set_updated_at();

create trigger cart_updated_at before update
  on decorasaurus.cart
  for each row
  execute procedure decorasaurus_private.set_updated_at();

create trigger cart_item_updated_at before update
  on decorasaurus.cart_item
  for each row
  execute procedure decorasaurus_private.set_updated_at();

create trigger address_updated_at before update
  on decorasaurus.address
  for each row
  execute procedure decorasaurus_private.set_updated_at();

create trigger order_updated_at before update
  on decorasaurus.order
  for each row
  execute procedure decorasaurus_private.set_updated_at();

create trigger order_item_updated_at before update
  on decorasaurus.order_item
  for each row
  execute procedure decorasaurus_private.set_updated_at();

create trigger product_links_updated_at before update
  on decorasaurus.product_links
  for each row
  execute procedure decorasaurus_private.set_updated_at();

-- *******************************************************************
-- ************************* Auth ************************************
-- *******************************************************************

CREATE TABLE decorasaurus_private.user_customer (
  customer_id         UUID primary key references decorasaurus.customer(id) on delete cascade,
  email               TEXT NOT NULL unique check (email ~* '^.+@.+\..+$'),
  password_hash       TEXT NOT NULL
);

CREATE TRIGGER user_customer_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON decorasaurus_private.user_customer
FOR EACH ROW EXECUTE PROCEDURE decorasaurus_private.if_modified_func();

COMMENT ON TABLE decorasaurus_private.user_customer IS 'Private information about a user’s account.';
COMMENT ON COLUMN decorasaurus_private.user_customer.customer_id IS 'The id of the user associated with this customer.';
COMMENT ON COLUMN decorasaurus_private.user_customer.email IS 'The email address of the customer.';
COMMENT ON COLUMN decorasaurus_private.user_customer.password_hash IS 'An opaque hash of the customer’s password.';

CREATE extension IF NOT EXISTS "pgcrypto";

CREATE FUNCTION decorasaurus.register_user_customer (
  first_name          TEXT,
  last_name           TEXT,
  email               TEXT,
  password            TEXT
) returns decorasaurus.customer as $$
declare
  customer decorasaurus.customer;
begin
  INSERT into decorasaurus.customer (first_name, last_name) values
    (first_name, last_name)
    returning * into customer;

  INSERT INTO decorasaurus_private.user_customer (customer_id, email, password_hash) values
    (customer.id, email, crypt(password, gen_salt('bf')));

  return customer;
end;
$$ language plpgsql strict security definer;

COMMENT ON FUNCTION decorasaurus.register_user_customer(TEXT, TEXT, TEXT, TEXT) IS 'Registers and creates a user customer for decorasaurus.';

CREATE TABLE decorasaurus_private.admin_account (
  account_id          UUID primary key references decorasaurus.customer(id) on delete cascade,
  email               TEXT NOT NULL unique check (email ~* '^.+@.+\..+$'),
  password_hash       TEXT NOT NULL
);

CREATE TRIGGER admin_account_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON decorasaurus_private.admin_account
FOR EACH ROW EXECUTE PROCEDURE decorasaurus_private.if_modified_func();

COMMENT ON TABLE decorasaurus_private.admin_account IS 'Private information about an admin user’s account.';
COMMENT ON COLUMN decorasaurus_private.admin_account.account_id IS 'The id of the user associated with this admin account.';
COMMENT ON COLUMN decorasaurus_private.admin_account.email IS 'The email address of the admin account.';
COMMENT ON COLUMN decorasaurus_private.admin_account.password_hash IS 'An opaque hash of the admin account’s password.';

create extension IF NOT EXISTS "pgcrypto";

CREATE FUNCTION decorasaurus.register_admin_account (
  email               TEXT,
  password            TEXT
) RETURNS decorasaurus.customer AS $$
declare
  account decorasaurus.customer;
begin

  INSERT INTO decorasaurus_private.admin_account (account_id, email, password_hash) VALUES
    (account.id, email, crypt(password, gen_salt('bf')));

  RETURN account;
END;
$$ language plpgsql strict security definer;

COMMENT ON FUNCTION decorasaurus.register_admin_account(TEXT, TEXT) IS 'Registers and creates an admin ccount for decorasaurus.';

CREATE FUNCTION decorasaurus.update_password(
  customer_id UUID,
  password TEXT,
  new_password TEXT
) returns boolean as $$
declare
  customer decorasaurus_private.user_customer;
begin
  select a.* into customer
  from decorasaurus_private.user_customer as a
  where a.customer_id = $1;

  if customer.password_hash = crypt(password, customer.password_hash) then
    UPDATE decorasaurus_private.user_customer set password_hash = crypt(new_password, gen_salt('bf')) where decorasaurus_private.user_customer.customer_id = $1;
    return true;
  else
    return false;
  end if;
end;
$$ language plpgsql strict security definer;

COMMENT ON FUNCTION decorasaurus.update_password(UUID, TEXT, TEXT) IS 'Updates the password of a user.';

CREATE FUNCTION decorasaurus.reset_password(
  email TEXT
) returns TEXT as $$
DECLARE customer decorasaurus_private.user_customer;
DECLARE randomString TEXT;
begin
  select a.* into customer
  from decorasaurus_private.user_customer as a
  where a.email = $1;

  randomString := md5(random()::TEXT);
  -- check and see if user exists
  if customer.email = email then
    UPDATE decorasaurus_private.user_customer set password_hash = crypt(randomString, gen_salt('bf')) where decorasaurus_private.user_customer.email = $1;
    return randomString;
  else
    return "user does not exist";
  end if; 
end;
$$ language plpgsql strict security definer;

COMMENT ON FUNCTION decorasaurus.reset_password(TEXT) IS 'Reset the password of a user.';

-- *******************************************************************
-- ************************* Roles ************************************
-- *******************************************************************

CREATE ROLE decorasaurus_admin login password 'abc123';
GRANT ALL privileges ON ALL TABLES IN SCHEMA decorasaurus TO decorasaurus_admin;
GRANT ALL privileges ON ALL TABLES IN SCHEMA decorasaurus_private TO decorasaurus_admin;

CREATE ROLE decorasaurus_anonymous login password 'abc123' NOINHERIT;
GRANT decorasaurus_anonymous TO decorasaurus_admin; --Now, the decorasaurus_admin role can control and become the decorasaurus_anonymous role. If we did not use that GRANT, we could not change into the decorasaurus_anonymous role in PostGraphQL.

CREATE ROLE decorasaurus_customer;
GRANT decorasaurus_customer TO decorasaurus_admin; --The decorasaurus_admin role will have all of the permissions of the roles GRANTed to it. So it can do everything decorasaurus_anonymous can do and everything decorasaurus_usercan do.
GRANT decorasaurus_customer TO decorasaurus_anonymous; 

CREATE TYPE decorasaurus.jwt_token as (
  ROLE TEXT,
  customer_id UUID,
  exp INTEGER
);

-- alter database bclynch set "jwt.claims.customer_id" to '0';

CREATE FUNCTION decorasaurus.authenticate_user_customer(
  email TEXT,
  password TEXT
) returns decorasaurus.jwt_token as $$
declare
  customer decorasaurus_private.user_customer;
begin
  select a.* into customer
  from decorasaurus_private.user_customer as a
  where a.email = $1;

  if customer.password_hash = crypt(password, customer.password_hash) then
    return ('decorasaurus_customer', customer.customer_id, extract(epoch from (now() + interval '1 week')))::decorasaurus.jwt_token;
  else
    return null;
  end if;
end;
$$ language plpgsql strict security definer;

COMMENT ON FUNCTION decorasaurus.authenticate_user_customer(TEXT, TEXT) IS 'Creates a JWT token that will securely identify a customer and give them certain permissions.';

CREATE FUNCTION decorasaurus.authenticate_admin_account(
  email TEXT,
  password TEXT
) returns decorasaurus.jwt_token as $$
declare
  account decorasaurus_private.admin_account;
begin
  select a.* into account
  from decorasaurus_private.admin_account as a
  where a.email = $1;

  if account.password_hash = crypt(password, account.password_hash) then
    return ('decorasaurus_admin', account.account_id, extract(epoch from (now() + interval '1 week')))::decorasaurus.jwt_token;
  else
    return null;
  end if;
end;
$$ language plpgsql strict security definer;

COMMENT ON FUNCTION decorasaurus.authenticate_admin_account(TEXT, TEXT) IS 'Creates a JWT token that will securely identify an admin account and give them certain permissions.';

CREATE FUNCTION decorasaurus.current_customer() returns decorasaurus.customer as $$
  select *
  from decorasaurus.customer
  where decorasaurus.customer.id = current_setting('jwt.claims.customer_id', true)::UUID
$$ language sql stable;

COMMENT ON FUNCTION decorasaurus.current_customer() IS 'Gets the customer that was identified by our JWT.';

-- *******************************************************************
-- ************************* Security *********************************
-- *******************************************************************

GRANT USAGE ON SCHEMA decorasaurus TO decorasaurus_anonymous, decorasaurus_customer;
GRANT USAGE ON ALL sequences IN schema decorasaurus TO decorasaurus_customer;

GRANT EXECUTE ON FUNCTION decorasaurus.register_user_customer(TEXT, TEXT, TEXT, TEXT) TO decorasaurus_anonymous;
GRANT EXECUTE ON FUNCTION decorasaurus.register_admin_account(TEXT, TEXT) TO decorasaurus_anonymous;
GRANT EXECUTE ON FUNCTION decorasaurus.update_password(UUID, TEXT, TEXT) TO decorasaurus_customer;
GRANT EXECUTE ON FUNCTION decorasaurus.reset_password(TEXT) TO decorasaurus_anonymous, decorasaurus_customer;
GRANT EXECUTE ON FUNCTION decorasaurus.authenticate_user_customer(TEXT, TEXT) TO decorasaurus_anonymous;
GRANT EXECUTE ON FUNCTION decorasaurus.authenticate_admin_account(TEXT, TEXT) TO decorasaurus_anonymous;
GRANT EXECUTE ON FUNCTION decorasaurus.current_customer() TO PUBLIC;
GRANT EXECUTE ON FUNCTION uuid_generate_v1mc() TO PUBLIC;

-- ///////////////// RLS Policies ////////////////////////////////

-- Account policy
GRANT ALL ON TABLE decorasaurus.customer TO decorasaurus_customer, decorasaurus_anonymous;
CREATE POLICY select_customer ON decorasaurus.customer for SELECT TO decorasaurus_customer, decorasaurus_anonymous
  USING (true);
CREATE POLICY insert_customer ON decorasaurus.customer for INSERT TO decorasaurus_anonymous
  WITH CHECK (true);
CREATE POLICY update_customer ON decorasaurus.customer for UPDATE TO decorasaurus_customer
  USING (id = current_setting('jwt.claims.customer_id')::UUID);
CREATE POLICY delete_customer ON decorasaurus.customer for DELETE TO decorasaurus_customer
  USING (id = current_setting('jwt.claims.customer_id')::UUID); 

-- Address policy
GRANT ALL ON TABLE decorasaurus.address TO decorasaurus_customer;
CREATE POLICY select_address ON decorasaurus.address for SELECT TO decorasaurus_customer
  USING (true);
CREATE POLICY insert_address ON decorasaurus.address for INSERT TO decorasaurus_customer
  WITH CHECK (customer_id = current_setting('jwt.claims.customer_id')::UUID);
CREATE POLICY update_address ON decorasaurus.address for UPDATE TO decorasaurus_customer
  USING (customer_id = current_setting('jwt.claims.customer_id')::UUID);
CREATE POLICY delete_address ON decorasaurus.address for DELETE TO decorasaurus_customer
  USING (customer_id = current_setting('jwt.claims.customer_id')::UUID); 

-- Order policy
GRANT ALL ON TABLE decorasaurus.order TO decorasaurus_customer;
CREATE POLICY select_order ON decorasaurus.order for SELECT TO decorasaurus_customer
  USING (true);
CREATE POLICY insert_order ON decorasaurus.order for INSERT TO decorasaurus_customer
  WITH CHECK (customer_id = current_setting('jwt.claims.customer_id')::UUID);
CREATE POLICY update_order ON decorasaurus.order for UPDATE TO decorasaurus_customer
  USING (customer_id = current_setting('jwt.claims.customer_id')::UUID);
CREATE POLICY delete_order ON decorasaurus.address for DELETE TO decorasaurus_customer
  USING (customer_id = current_setting('jwt.claims.customer_id')::UUID); 

commit;
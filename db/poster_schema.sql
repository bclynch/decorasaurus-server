begin;

drop schema if exists edm, edm_private cascade;
drop role if exists edm_admin, edm_anonymous, edm_account;

create schema edm;
create schema edm_private;

alter default privileges revoke execute on functions from public;

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
CREATE TABLE edm.logged_actions (
    event_id bigserial primary key,
    table_name text not null,
    account_id integer,
    session_user_name text,
    action_tstamp_tx TIMESTAMP WITH TIME ZONE NOT NULL,
    client_addr inet,
    action TEXT NOT NULL CHECK (action IN ('I','D','U', 'T')),
    row_data hstore,
    changed_fields hstore
);

REVOKE ALL ON edm.logged_actions FROM public;

COMMENT ON TABLE edm.logged_actions IS 'History of auditable actions on audited tables, from edm_private.if_modified_func()';
COMMENT ON COLUMN edm.logged_actions.event_id IS 'Unique identifier for each auditable event';
COMMENT ON COLUMN edm.logged_actions.table_name IS 'Non-schema-qualified table name of table event occured in';
COMMENT ON COLUMN edm.logged_actions.account_id IS 'User performing the action';
COMMENT ON COLUMN edm.logged_actions.session_user_name IS 'Login / session user whose statement caused the audited event';
COMMENT ON COLUMN edm.logged_actions.action_tstamp_tx IS 'Transaction start timestamp for tx in which audited event occurred';
COMMENT ON COLUMN edm.logged_actions.client_addr IS 'IP address of client that issued query. Null for unix domain socket.';
COMMENT ON COLUMN edm.logged_actions.action IS 'Action type; I = insert, D = delete, U = update, T = truncate';
COMMENT ON COLUMN edm.logged_actions.row_data IS 'Record value. Null for statement-level trigger. For INSERT this is the new tuple. For DELETE and UPDATE it is the old tuple.';
COMMENT ON COLUMN edm.logged_actions.changed_fields IS 'New values of fields changed by UPDATE. Null except for row-level UPDATE events.';

CREATE OR REPLACE FUNCTION edm_private.if_modified_func() RETURNS TRIGGER AS $body$
DECLARE
    audit_row edm.logged_actions;
    include_values boolean;
    log_diffs boolean;
    h_old hstore;
    h_new hstore;
    excluded_cols text[] = ARRAY[]::text[];
BEGIN
    IF TG_WHEN <> 'AFTER' THEN
        RAISE EXCEPTION 'edm_private.if_modified_func() may only run as an AFTER trigger';
    END IF;

    audit_row = ROW(
        nextval('edm.logged_actions_event_id_seq'), -- event_id
        TG_TABLE_NAME::text,                          -- table_name
        current_setting('jwt.claims.account_id', true)::integer, -- account_id
        session_user::text,                           -- session_user_name
        current_timestamp,                            -- action_tstamp_tx
        inet_client_addr(),                           -- client_addr
        substring(TG_OP,1,1),                         -- action
        NULL, NULL                                   -- row_data, changed_fields
        );

    IF TG_ARGV[1] IS NOT NULL THEN
        excluded_cols = TG_ARGV[1]::text[];
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
        RAISE EXCEPTION '[edm_private.if_modified_func] - Trigger func added as trigger for unhandled case: %, %',TG_OP, TG_LEVEL;
        RETURN NULL;
    END IF;
    INSERT INTO edm.logged_actions VALUES (audit_row.*);
    RETURN NULL;
END;
$body$
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public;


COMMENT ON FUNCTION edm_private.if_modified_func() IS $body$
Track changes to a table at the statement and/or row level.

Optional parameters to trigger in CREATE TRIGGER call:

param 0: boolean, whether to log the query text. Default 't'.

param 1: text[], columns to ignore in updates. Default [].

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



CREATE OR REPLACE FUNCTION edm.audit_table(target_table regclass, audit_rows boolean, audit_query_text boolean, ignored_cols text[]) RETURNS void AS $body$
DECLARE
  stm_targets text = 'INSERT OR UPDATE OR DELETE OR TRUNCATE';
  _q_txt text;
  _ignored_cols_snip text = '';
BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS audit_trigger_row ON ' || quote_ident(target_table::TEXT);
    EXECUTE 'DROP TRIGGER IF EXISTS audit_trigger_stm ON ' || quote_ident(target_table::TEXT);

    IF audit_rows THEN
        IF array_length(ignored_cols,1) > 0 THEN
            _ignored_cols_snip = ', ' || quote_literal(ignored_cols);
        END IF;
        _q_txt = 'CREATE TRIGGER audit_trigger_row AFTER INSERT OR UPDATE OR DELETE ON ' || 
                 quote_ident(target_table::TEXT) || 
                 ' FOR EACH ROW EXECUTE PROCEDURE edm_private.if_modified_func(' ||
                 quote_literal(audit_query_text) || _ignored_cols_snip || ');';
        RAISE NOTICE '%',_q_txt;
        EXECUTE _q_txt;
        stm_targets = 'TRUNCATE';
    ELSE
    END IF;

    _q_txt = 'CREATE TRIGGER audit_trigger_stm AFTER ' || stm_targets || ' ON ' ||
             target_table ||
             ' FOR EACH STATEMENT EXECUTE PROCEDURE edm_private.if_modified_func('||
             quote_literal(audit_query_text) || ');';
    RAISE NOTICE '%',_q_txt;
    EXECUTE _q_txt;

END;
$body$
language 'plpgsql';

COMMENT ON FUNCTION edm.audit_table(regclass, boolean, boolean, text[]) IS $body$
Add auditing support to a table.

Arguments:
   target_table:     Table name, schema qualified if not on search_path
   audit_rows:       Record each row change, or only audit at a statement level
   audit_query_text: Record the text of the client query that triggered the audit event?
   ignored_cols:     Columns to exclude from update diffs, ignore updates that change only ignored cols.
$body$;

-- Pg doesn't allow variadic calls with 0 params, so provide a wrapper
CREATE OR REPLACE FUNCTION edm.audit_table(target_table regclass, audit_rows boolean, audit_query_text boolean) RETURNS void AS $body$
SELECT edm.audit_table($1, $2, $3, ARRAY[]::text[]);
$body$ LANGUAGE SQL;

-- And provide a convenience call wrapper for the simplest case
-- of row-level logging with no excluded cols and query logging enabled.
--
CREATE OR REPLACE FUNCTION edm.audit_table(target_table regclass) RETURNS void AS $body$
SELECT edm.audit_table($1, BOOLEAN 't', BOOLEAN 't');
$body$ LANGUAGE 'sql';

COMMENT ON FUNCTION edm.audit_table(regclass) IS $body$
Add auditing support to the given table. Row-level changes will be logged with full client query text. No cols are ignored.
$body$;

-- Maybe create a column for how often they want to receive email notifications
create table edm.account (
  id                   serial primary key,
  username             text unique not null check (char_length(username) < 80),
  profile_photo        text,
  user_location        text check (char_length(user_location) < 80),
  created_at           bigint default (extract(epoch from now()) * 1000),
  updated_at           timestamp default now()
);

CREATE TRIGGER account_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON edm.account
FOR EACH ROW EXECUTE PROCEDURE edm_private.if_modified_func();

-- insert into pomb.account (username, first_name, last_name, profile_photo, city, country, user_status, auto_update_location) values
--   ('teeth-creep', 'Ms', 'D', 'https://laze-app.s3.amazonaws.com/19243203_10154776689779211_34706076750698170_o-w250-1509052127322.jpg', 'London', 'UK', 'Living the dream', true);

comment on table edm.account is 'Table with edm users';
comment on column edm.account.id is 'Primary id for account';
comment on column edm.account.username is 'username of account';
comment on column edm.account.profile_photo is 'Profile photo of account';
comment on column edm.account.user_location is 'Location of user';
comment on column edm.account.created_at is 'When account created';
comment on column edm.account.updated_at is 'When account last updated';

alter table edm.account enable row level security;

create table edm.region (
  name                text primary key,
  description         text,
  photo               text,
  country             text,
  created_at          bigint default (extract(epoch from now()) * 1000),
  updated_at          timestamp default now()
);

CREATE TRIGGER region_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON edm.region
FOR EACH ROW EXECUTE PROCEDURE edm_private.if_modified_func();

insert into edm.region (name, description, photo, country) values
  ('Bay Area', null, null, 'US'),
  ('Carolina', null, null, 'US'),
  ('Los Angeles', null, null, 'US'),
  ('San Diego', null, null, 'US'),
  ('Oregon', null, null, 'US'),
  ('Central Texas', null, null, 'US'),
  ('West Texas', null, null, 'US'),
  ('Washington', null, null, 'US'),
  ('Vancouver', null, null, 'CA'),
  ('Twin Cities', null, null, 'US'),
  ('Atlanta', null, null, 'US'),
  ('Michigan', null, null, 'US'),
  ('Washington_Baltimore', null, null, 'US'),
  ('Sacramento', null, null, 'US'),
  ('Nevada', null, null, 'US'),
  ('Wisconsin', null, null, 'US');

comment on table edm.region is 'Region for edm events';
comment on column edm.region.name is 'Primary key and name for region';
comment on column edm.region.description is 'Description for region';
comment on column edm.region.photo is 'Photo for region';
comment on column edm.region.country is 'Country for region';
comment on column edm.region.created_at is 'When region created';
comment on column edm.region.updated_at is 'When region last updated';

create table edm.city (
  id                  serial primary key,
  name                text,
  description         text,
  photo               text,
  region              text references edm.region(name) on delete cascade,
  created_at          bigint default (extract(epoch from now()) * 1000),
  updated_at          timestamp default now()
);

CREATE TRIGGER city_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON edm.city
FOR EACH ROW EXECUTE PROCEDURE edm_private.if_modified_func();

insert into edm.city (name, description, photo, region) values
  ('San Francisco', null, null, 'Bay Area'),
  ('Berkeley', null, null, 'Bay Area'),
  ('Sunnyvale', null, null, 'Bay Area'),
  ('Mountain View', null, null, 'Bay Area'),
  ('Oakland', null, null, 'Bay Area'),
  ('Charlotte', null, null, 'Carolina'),
  ('Black Mountain', null, null, 'Carolina'),
  ('Asheville', null, null, 'Carolina'),
  ('Columbia', null, null, 'Carolina'),
  ('Los Angeles', null, null, 'Los Angeles'),
  ('Venice', null, null, 'Los Angeles'),
  ('West Hollywood', null, null, 'Los Angeles'),
  ('Long Beach', null, null, 'Los Angeles'),
  ('Huntington Beach', null, null, 'Los Angeles'),
  ('Newport Beach', null, null, 'Los Angeles'),
  ('Santa Monica', null, null, 'Los Angeles'),
  ('Costa Mesa', null, null, 'Los Angeles'),
  ('Santa Barbara', null, null, 'Los Angeles'),
  ('Tustin', null, null, 'Los Angeles'),
  ('Santa Ana', null, null, 'Los Angeles'),
  ('Irvine', null, null, 'Los Angeles'),
  ('San Bernardino', null, null, 'Los Angeles'),
  ('Whittier', null, null, 'Los Angeles'),
  ('Anaheim', null, null, 'Los Angeles'),
  ('Pomona', null, null, 'Los Angeles'),
  ('Inglewood', null, null, 'Los Angeles'),
  ('San Diego', null, null, 'San Diego'),
  ('Chula Vista', null, null, 'San Diego'),
  ('Del Mar', null, null, 'San Diego'),
  ('Portland', null, null, 'Oregon'),
  ('Eugene', null, null, 'Oregon'),
  ('Troutdale', null, null, 'Oregon'),
  ('Ashland', null, null, 'Oregon'),
  ('Ridgefield', null, null, 'Washington'),
  ('Seattle', null, null, 'Washington'),
  ('Redmond', null, null, 'Washington'),
  ('Houston', null, null, 'Central Texas'),
  ('Austin', null, null, 'Central Texas'),
  ('Leander', null, null, 'Central Texas'),
  ('Dallas', null, null, 'Central Texas'),
  ('El Paso', null, null, 'West Texas'),
  ('Las Cruces', null, null, 'West Texas'),
  ('Vancouver', null, null, 'Vancouver'),
  ('Surrey', null, null, 'Vancouver'),
  ('Minneapolis', null, null, 'Twin Cities'),
  ('St Paul', null, null, 'Twin Cities'),
  ('Atlanta', null, null, 'Atlanta'),
  ('Detroit', null, null, 'Michigan'),
  ('Ferndale', null, null, 'Michigan'),
  ('Pontiac', null, null, 'Michigan'),
  ('Wyandotte', null, null, 'Michigan'),
  ('Interlochen', null, null, 'Michigan'),
  ('Grand Rapids', null, null, 'Michigan'),
  ('Washington', null, null, 'Washington_Baltimore'),
  ('Baltimore', null, null, 'Washington_Baltimore'),
  ('Columbia', null, null, 'Washington_Baltimore'),
  ('Sacramento', null, null, 'Sacramento'),
  ('Auburn', null, null, 'Sacramento'),
  ('Emigrant Gap', null, null, 'Sacramento'),
  ('Reno', null, null, 'Nevada'),
  ('Las Vegas', null, null, 'Nevada'),
  ('Crystal Bay', null, null, 'Nevada'),
  ('Milwaukee', null, null, 'Wisconsin'),
  ('Madison', null, null, 'Wisconsin');

comment on table edm.city is 'City for edm events';
comment on column edm.city.id is 'Primary key for city';
comment on column edm.city.name is 'Name for city';
comment on column edm.city.description is 'Description for city';
comment on column edm.city.photo is 'Photo for city';
comment on column edm.city.created_at is 'When city created';
comment on column edm.city.updated_at is 'When city last updated';

create table edm.venue (
  name                text primary key check (char_length(name) < 256),
  description         text check (char_length(description) < 2400),
  lat                 decimal,
  lon                 decimal,
  city                integer not null references edm.city(id) on delete cascade,
  address             text check (char_length(address) < 512),
  photo               text,
  logo                text,
  created_at          bigint default (extract(epoch from now()) * 1000),
  updated_at          timestamp default now()
);

CREATE TRIGGER venue_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON edm.venue
FOR EACH ROW EXECUTE PROCEDURE edm_private.if_modified_func();

comment on table edm.venue is 'Table with edm venues';
comment on column edm.venue.name is 'Name of venue and primary id';
comment on column edm.venue.description is 'Description of venue';
comment on column edm.venue.lat is 'Latitude of venue';
comment on column edm.venue.lon is 'Longitude of venue';
comment on column edm.venue.city is 'City of venue';
comment on column edm.venue.address is 'Address of venue';
comment on column edm.venue.photo is 'Photo of venue';
comment on column edm.venue.logo is 'Logo of venue';
comment on column edm.venue.created_at is 'When venue created';
comment on column edm.venue.updated_at is 'When venue last updated';

-- alter table edm.venue enable row level security;

create table edm.genre (
  name                text primary key check (char_length(name) < 80),
  description         text check (char_length(description) < 2400),
  created_at          bigint default (extract(epoch from now()) * 1000),
  updated_at          timestamp default now()
);

CREATE TRIGGER genre_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON edm.genre
FOR EACH ROW EXECUTE PROCEDURE edm_private.if_modified_func();

insert into edm.genre (name, description) values
  ('House', 'Thumpin beats'),
  ('Trance', 'Chill rhythym');

comment on table edm.genre is 'Table with edm genres';
comment on column edm.genre.name is 'Name of genre and primary key';
comment on column edm.genre.description is 'Description of genre';
comment on column edm.genre.created_at is 'When genre created';
comment on column edm.genre.updated_at is 'When genre last updated';

-- alter table edm.genre enable row level security;

create table edm.artist (
  name                text primary key,
  description         text check (char_length(description) < 2400),
  photo               text,
  twitter_username    text,
  twitter_url         text,
  facebook_username   text,
  facebook_url        text,
  instagram_username  text,
  instagram_url       text,
  soundcloud_username text,
  soundcloud_url      text,
  youtube_username    text,
  youtube_url         text,
  spotify_url         text,
  homepage            text,
  created_at          bigint default (extract(epoch from now()) * 1000),
  updated_at          timestamp default now()
);

CREATE TRIGGER artist_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON edm.artist
FOR EACH ROW EXECUTE PROCEDURE edm_private.if_modified_func();

comment on table edm.artist is 'Table with edm artists';
comment on column edm.artist.name is 'Name of artist';
comment on column edm.artist.description is 'Description of artist';
comment on column edm.artist.photo is 'Photo of artist';
comment on column edm.artist.twitter_username is 'Twitter username of artist';
comment on column edm.artist.twitter_url is 'Twitter url of artist';
comment on column edm.artist.facebook_username is 'Facebook username of artist';
comment on column edm.artist.facebook_url is 'Facebook url of artist';
comment on column edm.artist.instagram_username is 'Instagram username of artist';
comment on column edm.artist.instagram_url is 'Instagram url of artist';
comment on column edm.artist.soundcloud_username is 'Soundcloud username of artist';
comment on column edm.artist.soundcloud_url is 'Soundcloud url of artist';
comment on column edm.artist.youtube_username is 'Youtube username of artist';
comment on column edm.artist.youtube_url is 'Youtube url of artist';
comment on column edm.artist.spotify_url is 'Spotify url of artist';
comment on column edm.artist.homepage is 'Homepage url of artist';
comment on column edm.artist.created_at is 'When artist created';
comment on column edm.artist.updated_at is 'When artist last updated';

create table edm.genre_to_artist ( --one to many
  id                 serial primary key,
  genre_id           text not null references edm.genre(name) on delete cascade,
  artist_id          text not null references edm.artist(name) on delete cascade
);

comment on table edm.genre_to_artist is 'Join table for genres to an artist';
comment on column edm.genre_to_artist.id is 'Id of the row';
comment on column edm.genre_to_artist.genre_id is 'Id of the genre';
comment on column edm.genre_to_artist.artist_id is 'Id of the artist';

-- alter table edm.artist enable row level security;

-- Limiting choices for type field on event
-- Add others as required for affiliate programs
create type edm.event_type as enum (
  'eventbrite',
  'ticketfly',
  'ticketmaster',
  'other'
);

create table edm.event (
  id                  text primary key,
  venue               text not null references edm.venue(name) on delete cascade,
  name                text check (char_length(name) < 512),
  description         text,
  type                edm.event_type,
  start_date          bigint not null,
  end_date            bigint,
  ticketProviderId    text, -- might just be int, but probably depends so this is safe
  ticketProviderUrl   text,
  created_at          bigint default (extract(epoch from now()) * 1000),
  updated_at          timestamp default now()
);

CREATE TRIGGER event_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON edm.event
FOR EACH ROW EXECUTE PROCEDURE edm_private.if_modified_func();

comment on table edm.event is 'Table with edm events';
comment on column edm.event.id is 'Primary id for event';
comment on column edm.event.name is 'Name of event';
comment on column edm.event.description is 'Description of event';
comment on column edm.event.type is 'Type of event';
comment on column edm.event.start_date is 'Start date of event';
comment on column edm.event.end_date is 'End date of event';
comment on column edm.event.ticketProviderId is 'Id by the ticket provider useful for affiliate links';
comment on column edm.event.ticketProviderUrl is 'URL by the ticket provider useful for affiliate links';
comment on column edm.event.created_at is 'When event created';
comment on column edm.event.updated_at is 'When event last updated';

-- alter table edm.event enable row level security;

create table edm.artist_to_event ( --one to many
  id                 serial primary key,
  artist_id          text not null references edm.artist(name) on delete cascade,
  event_id           text not null references edm.event(id) on delete cascade
);

comment on table edm.artist_to_event is 'Join table for artists at an event';
comment on column edm.artist_to_event.id is 'Id of the row';
comment on column edm.artist_to_event.artist_id is 'Id of the artist';
comment on column edm.artist_to_event.event_id is 'Id of the event';

-- create table pomb.email_list (
--   id                  serial primary key,
--   email               text not null unique check (char_length(email) < 256),
--   created_at          bigint default (extract(epoch from now()) * 1000)
-- );

-- CREATE TRIGGER email_list_INSERT_UPDATE_DELETE
-- AFTER INSERT OR UPDATE OR DELETE ON pomb.email_list
-- FOR EACH ROW EXECUTE PROCEDURE pomb_private.if_modified_func();

-- comment on table pomb.email_list is 'Table with POMB list of emails';
-- comment on column pomb.email_list.id is 'Primary id for email';
-- comment on column pomb.email_list.email is 'Email of user';
-- comment on column pomb.email_list.created_at is 'When email created';

create table edm.config (
  id                  serial primary key,
  primary_color       text not null check (char_length(primary_color) < 20),
  secondary_color     text not null check (char_length(secondary_color) < 20),
  tagline             text not null check (char_length(tagline) < 80),
  hero_banner         text not null,
  updated_at          timestamp default now()
);

CREATE TRIGGER config_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON edm.config
FOR EACH ROW EXECUTE PROCEDURE edm_private.if_modified_func();

insert into edm.config (primary_color, secondary_color, tagline, hero_banner) values
  ('#FC466B', '#3F5EFB', 'Find your next experience', 'http://www.shudhvichar.com/wp-content/uploads/2016/09/Sunset-Dream-1200X300.jpg');

-- *******************************************************************
-- *********************** Function Queries **************************
-- *******************************************************************
create function edm.search_cities(query text) returns setof edm.city as $$
  select city.*
  from edm.city as city
  where city.name ilike ('%' || query || '%')
$$ language sql stable;

-- *******************************************************************
-- ************************* Triggers ********************************
-- *******************************************************************
create function edm_private.set_updated_at() returns trigger as $$
begin
  new.updated_at := current_timestamp;
  return new;
end;
$$ language plpgsql;

create trigger account_updated_at before update
  on edm.account
  for each row
  execute procedure edm_private.set_updated_at();

-- create trigger config_updated_at before update
--   on edm.config
--   for each row
--   execute procedure edm_private.set_updated_at();

create trigger event_updated_at before update
  on edm.event
  for each row
  execute procedure edm_private.set_updated_at();

create trigger artist_updated_at before update
  on edm.artist
  for each row
  execute procedure edm_private.set_updated_at();

create trigger venue_updated_at before update
  on edm.venue
  for each row
  execute procedure edm_private.set_updated_at();

-- *******************************************************************
-- ************************* Auth ************************************
-- *******************************************************************

create table edm_private.user_account (
  account_id          integer primary key references edm.account(id) on delete cascade,
  email               text not null unique check (email ~* '^.+@.+\..+$'),
  password_hash       text not null
);

CREATE TRIGGER user_account_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON edm_private.user_account
FOR EACH ROW EXECUTE PROCEDURE edm_private.if_modified_func();

comment on table edm_private.user_account is 'Private information about a user’s account.';
comment on column edm_private.user_account.account_id is 'The id of the user associated with this account.';
comment on column edm_private.user_account.email is 'The email address of the account.';
comment on column edm_private.user_account.password_hash is 'An opaque hash of the account’s password.';

create extension if not exists "pgcrypto";

create function edm.register_user_account (
  username            text,
  email               text,
  password            text
) returns edm.account as $$
declare
  account edm.account;
begin
  insert into edm.account (username) values
    (username)
    returning * into account;

  insert into edm_private.user_account (account_id, email, password_hash) values
    (account.id, email, crypt(password, gen_salt('bf')));

  return account;
end;
$$ language plpgsql strict security definer;

comment on function edm.register_user_account(text, text, text) is 'Registers and creates a user account for edm.';

create table edm_private.admin_account (
  account_id          integer primary key references edm.account(id) on delete cascade,
  email               text not null unique check (email ~* '^.+@.+\..+$'),
  password_hash       text not null
);

CREATE TRIGGER admin_account_INSERT_UPDATE_DELETE
AFTER INSERT OR UPDATE OR DELETE ON edm_private.admin_account
FOR EACH ROW EXECUTE PROCEDURE edm_private.if_modified_func();

comment on table edm_private.admin_account is 'Private information about an admin user’s account.';
comment on column edm_private.admin_account.account_id is 'The id of the user associated with this admin account.';
comment on column edm_private.admin_account.email is 'The email address of the admin account.';
comment on column edm_private.admin_account.password_hash is 'An opaque hash of the admin account’s password.';

create extension if not exists "pgcrypto";

create function edm.register_admin_account (
  username            text,
  email               text,
  password            text
) returns edm.account as $$
declare
  account edm.account;
begin
  insert into edm.account (username) values
    (username)
    returning * into account;

  insert into edm_private.admin_account (account_id, email, password_hash) values
    (account.id, email, crypt(password, gen_salt('bf')));

  return account;
end;
$$ language plpgsql strict security definer;

comment on function edm.register_admin_account(text, text, text) is 'Registers and creates an admin ccount for edm.';

create function edm.update_password(
  user_id integer,
  password text,
  new_password text
) returns boolean as $$
declare
  account edm_private.user_account;
begin
  select a.* into account
  from edm_private.user_account as a
  where a.account_id = $1;

  if account.password_hash = crypt(password, account.password_hash) then
    UPDATE edm_private.user_account set password_hash = crypt(new_password, gen_salt('bf')) where edm_private.user_account.account_id = $1;
    return true;
  else
    return false;
  end if;
end;
$$ language plpgsql strict security definer;

comment on function edm.update_password(integer, text, text) is 'Updates the password of a user.';

create function edm.reset_password(
  email text
) returns TEXT as $$
DECLARE account edm_private.user_account;
DECLARE randomString TEXT;
begin
  select a.* into account
  from edm_private.user_account as a
  where a.email = $1;

  randomString := md5(random()::text);
  -- check and see if user exists
  if account.email = email then
    UPDATE edm_private.user_account set password_hash = crypt(randomString, gen_salt('bf')) where edm_private.user_account.email = $1;
    return randomString;
  else
    return "user does not exist";
  end if; 
end;
$$ language plpgsql strict security definer;

comment on function edm.reset_password(text) is 'Reset the password of a user.';

-- *******************************************************************
-- ************************* Roles ************************************
-- *******************************************************************

create role edm_admin login password 'abc123';
GRANT ALL privileges ON ALL TABLES IN SCHEMA edm to edm_admin;
GRANT ALL privileges ON ALL TABLES IN SCHEMA edm_private to edm_admin;

create role edm_anonymous login password 'abc123' NOINHERIT;
GRANT edm_anonymous to edm_admin; --Now, the edm_admin role can control and become the edm_anonymous role. If we did not use that GRANT, we could not change into the edm_anonymous role in PostGraphQL.

create role edm_account;
GRANT edm_account to edm_admin; --The edm_admin role will have all of the permissions of the roles GRANTed to it. So it can do everything edm_anonymous can do and everything edm_usercan do.
GRANT edm_account to edm_anonymous; 

create type edm.jwt_token as (
  role text,
  account_id integer,
  exp integer
);

-- alter database bclynch set "jwt.claims.account_id" to '0';

create function edm.authenticate_user_account(
  email text,
  password text
) returns edm.jwt_token as $$
declare
  account edm_private.user_account;
begin
  select a.* into account
  from edm_private.user_account as a
  where a.email = $1;

  if account.password_hash = crypt(password, account.password_hash) then
    return ('edm_account', account.account_id, extract(epoch from (now() + interval '1 week')))::edm.jwt_token;
  else
    return null;
  end if;
end;
$$ language plpgsql strict security definer;

comment on function edm.authenticate_user_account(text, text) is 'Creates a JWT token that will securely identify an account and give them certain permissions.';

create function edm.authenticate_admin_account(
  email text,
  password text
) returns edm.jwt_token as $$
declare
  account edm_private.admin_account;
begin
  select a.* into account
  from edm_private.admin_account as a
  where a.email = $1;

  if account.password_hash = crypt(password, account.password_hash) then
    return ('edm_admin', account.account_id, extract(epoch from (now() + interval '1 week')))::edm.jwt_token;
  else
    return null;
  end if;
end;
$$ language plpgsql strict security definer;

comment on function edm.authenticate_admin_account(text, text) is 'Creates a JWT token that will securely identify an admin account and give them certain permissions.';

create function edm.current_account() returns edm.account as $$
  select *
  from edm.account
  where edm.account.id = current_setting('jwt.claims.account_id', true)::integer
$$ language sql stable;

comment on function edm.current_account() is 'Gets the account that was identified by our JWT.';

-- *******************************************************************
-- ************************* Security *********************************
-- *******************************************************************

GRANT usage on schema edm to edm_anonymous, edm_account;
GRANT usage on all sequences in schema edm to edm_account;

-- GRANT SELECT, INSERT ON TABLE edm.email_list TO PUBLIC;

GRANT SELECT ON TABLE edm.event to PUBLIC;
GRANT SELECT ON TABLE edm.artist to PUBLIC;
GRANT SELECT ON TABLE edm.venue to PUBLIC;

GRANT ALL on table edm.config to PUBLIC; -- ultimately needs to only be admin account that can mod
-- GRANT select on pomb.post_search_index to PUBLIC;
-- GRANT select on pomb.trip_search_index to PUBLIC;
-- GRANT select on pomb.account_search_index to PUBLIC;

GRANT execute on function edm.register_user_account(text, text, text) to edm_anonymous;
GRANT execute on function edm.register_admin_account(text, text, text) to edm_anonymous;
GRANT execute on function edm.update_password(integer, text, text) to edm_account;
GRANT execute on function edm.reset_password(text) to edm_anonymous, edm_account;
GRANT execute on function edm.authenticate_user_account(text, text) to edm_anonymous;
GRANT execute on function edm.authenticate_admin_account(text, text) to edm_anonymous;
GRANT execute on function edm.current_account() to PUBLIC;
-- GRANT execute on function pomb.search_tags(text) to PUBLIC;
-- GRANT execute on function pomb.search_countries(text) to PUBLIC;
-- GRANT execute on function pomb.search_posts(text) to PUBLIC;
-- GRANT execute on function pomb.search_trips(text) to PUBLIC; 
-- GRANT execute on function pomb.search_accounts(text) to PUBLIC;  

-- ///////////////// RLS Policies ////////////////////////////////

-- Account policy
GRANT ALL ON TABLE edm.account TO edm_account, edm_anonymous;
CREATE POLICY select_account ON edm.account for SELECT TO edm_account, edm_anonymous
  USING (true);
CREATE POLICY insert_account ON edm.account for INSERT TO edm_anonymous
  WITH CHECK (true);
CREATE POLICY update_account ON edm.account for UPDATE TO edm_account
  USING (id = current_setting('jwt.claims.account_id')::INTEGER);
CREATE POLICY delete_account ON edm.account for DELETE TO edm_account
  USING (id = current_setting('jwt.claims.account_id')::INTEGER);

commit;
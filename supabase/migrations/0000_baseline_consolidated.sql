-- ============================================================================
-- 0000_baseline_consolidated.sql — Dokan v2 consolidated baseline
-- ============================================================================
-- WHAT THIS IS
--   The single squashed migration representing the CURRENT production schema,
--   reconstructed by pg_dump of the live database (2026-08-02) — not
--   hand-assembled. Replaces the previous 0001-0059 migration chain.
--
-- USE
--   Bootstrap a brand-new environment (new Supabase project, local dev,
--   staging, CI, disaster recovery). Do NOT re-apply to the existing
--   production project — it already has this exact state; its tracking table
--   has been synced to record only this baseline (see migration-history-sync).
--
-- WHAT'S INCLUDED
--   - public schema: 20 tables, enums, sequences, indexes (58),
--     11 functions, 45 RLS policies, triggers, grants (82)
--   - handle_new_user_safety() trigger on auth.users (added manually below —
--     it lives outside the public schema so pg_dump --schema=public omits it)
--
-- GENERATED: 2026-08-02 via pg_dump --schema-only --schema=public
-- ============================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4 (Ubuntu 18.4-0ubuntu0.26.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'Dokan SaaS - Legacy tables dropped (Phase 4 cleanup). New schema only.';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'super_admin',
    'owner',
    'manager',
    'staff'
);


--
-- Name: business_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.business_status AS ENUM (
    'pending',
    'active',
    'suspended'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'call_staff',
    'bill_request',
    'new_order',
    'system'
);


--
-- Name: order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_status AS ENUM (
    'pending',
    'preparing',
    'ready',
    'delivered',
    'cancelled'
);


--
-- Name: order_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.order_type AS ENUM (
    'dinein',
    'walkin',
    'drivethru'
);


--
-- Name: plan_interval; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.plan_interval AS ENUM (
    'monthly',
    'yearly'
);


--
-- Name: service_request_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.service_request_type AS ENUM (
    'waiter',
    'bill'
);


--
-- Name: subscription_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subscription_status AS ENUM (
    'trialing',
    'active',
    'past_due',
    'cancelled'
);


--
-- Name: generate_basic_slug(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_basic_slug(input text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
declare
  s text;
begin
  s := lower(coalesce(input, ''));
  -- very rough Arabic to latin (extend as needed)
  s := translate(s,
    'أإآاابتثجحخدذرزسشصضطظعغفقكلمنهويةىئؤء٠١٢٣٤٥٦٧٨٩',
    'aaaabtthjkhddrzsssdttaghfqklmnhwyayyuw000000000');
  s := regexp_replace(s, '[^a-z0-9]+', '-', 'g');
  s := regexp_replace(s, '^-+|-+$', '', 'g');
  s := regexp_replace(s, '-{2,}', '-', 'g');
  if s = '' or s is null then
    s := 'store-' || substr(md5(random()::text), 1, 6);
  end if;
  return left(s, 48);
end;
$_$;


--
-- Name: handle_new_user_safety(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user_safety() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  user_full_name text;
  base_slug text;
  final_slug text;
  new_project_id uuid;
  suffix int := 0;
begin
  -- Only act if this user has no staff_members yet (lightweight check)
  if exists (
    select 1 from public.staff_members where user_id = new.id
  ) then
    return new;
  end if;

  -- Skip if user came through our main API (set from_api=true in user_metadata)
  if new.raw_user_meta_data ? 'from_api' and new.raw_user_meta_data->>'from_api' = 'true' then
    return new;
  end if;

  -- Only create project for users created outside the API (e.g. Supabase dashboard)
  user_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1),
    'متجري'
  );

  base_slug := public.generate_basic_slug(user_full_name);

  -- Ensure unique slug (lightweight loop)
  final_slug := base_slug;
  while exists (select 1 from public.projects where slug = final_slug) loop
    suffix := suffix + 1;
    final_slug := base_slug || '-' || suffix;
  end loop;

  -- Create a minimal project
  insert into public.projects (name, slug, currency, primary_color, is_active)
  values (
    user_full_name,
    final_slug,
    'BHD',
    '#4338CA',
    true
  )
  returning id into new_project_id;

  -- Create owner membership
  insert into public.staff_members (project_id, user_id, role)
  values (new_project_id, new.id, 'owner');

  return new;
end;
$$;


--
-- Name: is_project_member(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_project_member(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.staff_members sm
    where sm.project_id = p_project_id and sm.user_id = auth.uid()
  );
$$;


--
-- Name: is_project_owner(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_project_owner(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from public.staff_members sm
    where sm.project_id = p_project_id
      and sm.user_id = auth.uid()
      and sm.role = 'owner'
  );
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from public.super_admins where user_id = auth.uid());
$$;


--
-- Name: next_order_number(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.next_order_number(p_project_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_next integer;
begin
  insert into public.daily_order_counters (project_id, date, counter)
  values (p_project_id, current_date, 1)
  on conflict (project_id, date)
  do update set counter = daily_order_counters.counter + 1
  returning counter into v_next;

  return v_next;
end;
$$;


--
-- Name: orders_protect_amounts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.orders_protect_amounts() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if old.total_amount is distinct from new.total_amount then
    raise exception 'total_amount cannot be modified after insert (%)', new.id using errcode = 'RLS001';
  end if;
  if old.order_number is distinct from new.order_number then
    raise exception 'order_number cannot be modified after insert (%)', new.id using errcode = 'RLS001';
  end if;
  return new;
end;
$$;


--
-- Name: project_has_no_members(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.project_has_no_members(p_project_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select not exists (
    select 1 from public.staff_members sm where sm.project_id = p_project_id
  );
$$;


--
-- Name: rate_limit_check(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_limit_check(p_key text, p_limit integer, p_window_ms integer) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_count int;
  v_reset_at timestamptz;
  v_now timestamptz := now();
  v_remaining int;
  v_reset_in numeric;
begin
  select count, reset_at into v_count, v_reset_at
  from public.rate_limits
  where key = p_key;

  if v_reset_at is null or v_now > v_reset_at then
    insert into public.rate_limits (key, count, reset_at)
    values (p_key, 1, v_now + (p_window_ms || ' milliseconds')::interval)
    on conflict (key) do update
      set count = 1, reset_at = excluded.reset_at;
    return json_build_object('allowed', true, 'remaining', p_limit - 1, 'reset_in', p_window_ms);
  end if;

  if v_count >= p_limit then
    v_reset_in := extract(epoch from (v_reset_at - v_now)) * 1000;
    return json_build_object('allowed', false, 'remaining', 0, 'reset_in', v_reset_in);
  end if;

  update public.rate_limits set count = count + 1 where key = p_key;
  v_remaining := p_limit - v_count - 1;
  v_reset_in := extract(epoch from (v_reset_at - v_now)) * 1000;
  return json_build_object('allowed', true, 'remaining', v_remaining, 'reset_in', v_reset_in);
end;
$$;


--
-- Name: sync_business_subscription_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_business_subscription_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  update public.businesses
    set subscription_status = new.status
    where id = new.business_id;
  return new;
end;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    name text NOT NULL,
    name_en text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: daily_order_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.daily_order_counters (
    project_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    counter integer DEFAULT 0 NOT NULL
);


--
-- Name: order_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    project_id uuid NOT NULL,
    event text NOT NULL,
    old_status text,
    new_status text,
    actor_user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT order_audit_logs_event_check CHECK ((event = ANY (ARRAY['created'::text, 'status_changed'::text, 'cancelled'::text])))
);


--
-- Name: TABLE order_audit_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.order_audit_logs IS 'Phase 3: Lightweight audit trail for orders';


--
-- Name: order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    product_name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric(10,3) NOT NULL,
    addons jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT order_items_quantity_check1 CHECK ((quantity > 0)),
    CONSTRAINT order_items_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'preparing'::text, 'ready'::text]))),
    CONSTRAINT order_items_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: order_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.order_seq
    START WITH 100
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: order_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.order_sequences (
    project_id uuid NOT NULL,
    day date NOT NULL,
    last_n integer DEFAULT 0 NOT NULL
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    table_id uuid,
    type public.order_type DEFAULT 'dinein'::public.order_type NOT NULL,
    status public.order_status DEFAULT 'pending'::public.order_status NOT NULL,
    total_amount numeric(10,3) DEFAULT 0 NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    order_number integer DEFAULT 0 NOT NULL,
    service_type text,
    CONSTRAINT orders_service_type_check CHECK (((service_type IS NULL) OR (service_type = ANY (ARRAY['waiter'::text, 'bill'::text])))),
    CONSTRAINT orders_total_amount_check CHECK ((total_amount >= (0)::numeric))
);


--
-- Name: COLUMN orders.service_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.orders.service_type IS 'Null = real order, ''waiter'' = call waiter, ''bill'' = request bill';


--
-- Name: product_addons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_addons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    name text NOT NULL,
    price numeric(10,3) DEFAULT 0 NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    CONSTRAINT product_addons_price_check CHECK ((price >= (0)::numeric))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    category_id uuid,
    name text NOT NULL,
    name_en text,
    description text,
    price numeric(10,3) NOT NULL,
    image_url text,
    is_available boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT products_price_check1 CHECK ((price >= (0)::numeric))
);


--
-- Name: projects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    currency text DEFAULT 'BHD'::text NOT NULL,
    primary_color text DEFAULT '#4338CA'::text NOT NULL,
    logo_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    key text NOT NULL,
    count integer DEFAULT 1 NOT NULL,
    reset_at timestamp with time zone NOT NULL
);


--
-- Name: service_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    table_id uuid NOT NULL,
    type public.service_request_type NOT NULL,
    is_resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staff_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.staff_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT staff_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'manager'::text, 'staff'::text])))
);


--
-- Name: tables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tables (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    branch_id uuid,
    number integer NOT NULL,
    slug text NOT NULL,
    qrcode text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: telegram_link_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_link_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    code text NOT NULL,
    created_by uuid,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: telegram_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.telegram_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    chat_id text NOT NULL,
    kind text DEFAULT 'user'::text NOT NULL,
    label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT telegram_links_kind_check CHECK ((kind = ANY (ARRAY['user'::text, 'group'::text])))
);


--
-- Name: categories categories_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey1 PRIMARY KEY (id);


--
-- Name: daily_order_counters daily_order_counters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_order_counters
    ADD CONSTRAINT daily_order_counters_pkey PRIMARY KEY (project_id, date);


--
-- Name: order_audit_logs order_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_audit_logs
    ADD CONSTRAINT order_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey1 PRIMARY KEY (id);


--
-- Name: order_sequences order_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_sequences
    ADD CONSTRAINT order_sequences_pkey PRIMARY KEY (project_id, day);


--
-- Name: orders orders_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey1 PRIMARY KEY (id);


--
-- Name: product_addons product_addons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_addons
    ADD CONSTRAINT product_addons_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey1 PRIMARY KEY (id);


--
-- Name: projects projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_pkey PRIMARY KEY (id);


--
-- Name: projects projects_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_slug_key UNIQUE (slug);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (key);


--
-- Name: service_requests service_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_pkey PRIMARY KEY (id);


--
-- Name: staff_members staff_members_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_pkey1 PRIMARY KEY (id);


--
-- Name: staff_members staff_members_project_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_project_id_user_id_key UNIQUE (project_id, user_id);


--
-- Name: tables tables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_pkey PRIMARY KEY (id);


--
-- Name: telegram_link_codes telegram_link_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_link_codes
    ADD CONSTRAINT telegram_link_codes_code_key UNIQUE (code);


--
-- Name: telegram_link_codes telegram_link_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_link_codes
    ADD CONSTRAINT telegram_link_codes_pkey PRIMARY KEY (id);


--
-- Name: telegram_links telegram_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_links
    ADD CONSTRAINT telegram_links_pkey PRIMARY KEY (id);


--
-- Name: telegram_links telegram_links_project_id_chat_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_links
    ADD CONSTRAINT telegram_links_project_id_chat_id_key UNIQUE (project_id, chat_id);


--
-- Name: idx_addons_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_addons_product ON public.product_addons USING btree (product_id);


--
-- Name: idx_categories_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_project ON public.categories USING btree (project_id);


--
-- Name: idx_categories_project_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_categories_project_sort ON public.categories USING btree (project_id, sort_order);


--
-- Name: idx_order_audit_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_audit_order ON public.order_audit_logs USING btree (order_id);


--
-- Name: idx_order_audit_project_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_order_audit_project_created ON public.order_audit_logs USING btree (project_id, created_at DESC);


--
-- Name: idx_orders_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_created ON public.orders USING btree (created_at DESC);


--
-- Name: idx_orders_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_project ON public.orders USING btree (project_id);


--
-- Name: idx_orders_project_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_project_created ON public.orders USING btree (project_id, created_at DESC);


--
-- Name: idx_orders_project_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_project_number ON public.orders USING btree (project_id, order_number);


--
-- Name: idx_orders_project_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_orders_project_number_unique ON public.orders USING btree (project_id, (((created_at AT TIME ZONE 'UTC'::text))::date), order_number) WHERE (service_type IS NULL);


--
-- Name: idx_orders_project_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_project_status ON public.orders USING btree (project_id, status) WHERE (status <> ALL (ARRAY['delivered'::public.order_status, 'cancelled'::public.order_status]));


--
-- Name: idx_orders_project_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_project_status_created ON public.orders USING btree (project_id, status, created_at DESC);


--
-- Name: INDEX idx_orders_project_status_created; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_orders_project_status_created IS 'Phase 3: Hot path for orders list + kitchen + recent orders';


--
-- Name: idx_orders_service_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_service_type ON public.orders USING btree (service_type) WHERE (service_type IS NOT NULL);


--
-- Name: idx_orders_table_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_table_created ON public.orders USING btree (project_id, table_id, created_at DESC);


--
-- Name: idx_product_addons_product_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_addons_product_available ON public.product_addons USING btree (product_id, is_available);


--
-- Name: idx_products_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_project ON public.products USING btree (project_id);


--
-- Name: idx_products_project_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_project_available ON public.products USING btree (project_id, is_available);


--
-- Name: idx_products_project_category_available; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_project_category_available ON public.products USING btree (project_id, category_id, is_available);


--
-- Name: INDEX idx_products_project_category_available; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON INDEX public.idx_products_project_category_available IS 'Phase 3: Menu rendering + product filtering';


--
-- Name: idx_projects_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_projects_slug ON public.projects USING btree (slug);


--
-- Name: idx_push_sub_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_sub_project ON public.push_subscriptions USING btree (project_id);


--
-- Name: idx_push_subscriptions_project_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subscriptions_project_id ON public.push_subscriptions USING btree (project_id);


--
-- Name: idx_service_requests_open; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_requests_open ON public.service_requests USING btree (project_id, is_resolved, created_at DESC);


--
-- Name: idx_staff_members_project_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_members_project_user ON public.staff_members USING btree (project_id, user_id);


--
-- Name: idx_staff_members_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_members_user_id ON public.staff_members USING btree (user_id);


--
-- Name: idx_staff_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_staff_project ON public.staff_members USING btree (project_id);


--
-- Name: idx_tables_branch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_branch ON public.tables USING btree (branch_id);


--
-- Name: idx_tables_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tables_project ON public.tables USING btree (project_id);


--
-- Name: idx_telegram_link_codes_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_link_codes_code ON public.telegram_link_codes USING btree (code);


--
-- Name: idx_telegram_links_project; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_links_project ON public.telegram_links USING btree (project_id);


--
-- Name: order_items_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX order_items_status_idx ON public.order_items USING btree (status);


--
-- Name: tables_project_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tables_project_number_unique ON public.tables USING btree (project_id, number);


--
-- Name: tables_project_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tables_project_slug_unique ON public.tables USING btree (project_id, slug);


--
-- Name: orders orders_protect_amounts_trigger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER orders_protect_amounts_trigger BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.orders_protect_amounts();


--
-- Name: categories categories_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: daily_order_counters daily_order_counters_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.daily_order_counters
    ADD CONSTRAINT daily_order_counters_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: order_audit_logs order_audit_logs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_audit_logs
    ADD CONSTRAINT order_audit_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_audit_logs order_audit_logs_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_audit_logs
    ADD CONSTRAINT order_audit_logs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_order_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey1 FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey1 FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: order_sequences order_sequences_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.order_sequences
    ADD CONSTRAINT order_sequences_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: orders orders_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: orders orders_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE SET NULL;


--
-- Name: product_addons product_addons_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_addons
    ADD CONSTRAINT product_addons_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: products products_category_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_category_id_fkey1 FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;


--
-- Name: products products_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: service_requests service_requests_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: service_requests service_requests_table_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_requests
    ADD CONSTRAINT service_requests_table_id_fkey FOREIGN KEY (table_id) REFERENCES public.tables(id) ON DELETE CASCADE;


--
-- Name: staff_members staff_members_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: staff_members staff_members_user_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.staff_members
    ADD CONSTRAINT staff_members_user_id_fkey1 FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tables tables_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tables
    ADD CONSTRAINT tables_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: telegram_link_codes telegram_link_codes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_link_codes
    ADD CONSTRAINT telegram_link_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: telegram_link_codes telegram_link_codes_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_link_codes
    ADD CONSTRAINT telegram_link_codes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: telegram_links telegram_links_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.telegram_links
    ADD CONSTRAINT telegram_links_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;


--
-- Name: product_addons addons_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY addons_delete ON public.product_addons FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = product_addons.product_id) AND public.is_project_member(p.project_id)))));


--
-- Name: product_addons addons_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY addons_insert ON public.product_addons FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = product_addons.product_id) AND public.is_project_member(p.project_id)))));


--
-- Name: product_addons addons_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY addons_member_read ON public.product_addons FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = product_addons.product_id) AND public.is_project_member(p.project_id)))));


--
-- Name: product_addons addons_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY addons_public_read ON public.product_addons FOR SELECT TO anon USING (((is_available = true) AND (EXISTS ( SELECT 1
   FROM (public.products p
     JOIN public.projects pr ON ((pr.id = p.project_id)))
  WHERE ((p.id = product_addons.product_id) AND (pr.is_active = true))))));


--
-- Name: product_addons addons_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY addons_update ON public.product_addons FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = product_addons.product_id) AND public.is_project_member(p.project_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.products p
  WHERE ((p.id = product_addons.product_id) AND public.is_project_member(p.project_id)))));


--
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- Name: categories categories_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_delete ON public.categories FOR DELETE TO authenticated USING (public.is_project_member(project_id));


--
-- Name: categories categories_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_insert ON public.categories FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id));


--
-- Name: categories categories_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_member_read ON public.categories FOR SELECT TO authenticated USING (public.is_project_member(project_id));


--
-- Name: categories categories_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_public_read ON public.categories FOR SELECT TO anon USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM public.projects pr
  WHERE ((pr.id = categories.project_id) AND (pr.is_active = true))))));


--
-- Name: categories categories_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY categories_update ON public.categories FOR UPDATE TO authenticated USING (public.is_project_member(project_id)) WITH CHECK (public.is_project_member(project_id));


--
-- Name: daily_order_counters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.daily_order_counters ENABLE ROW LEVEL SECURITY;

--
-- Name: order_audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: order_audit_logs order_audit_logs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_audit_logs_insert ON public.order_audit_logs FOR INSERT WITH CHECK (public.is_project_member(project_id));


--
-- Name: order_audit_logs order_audit_logs_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_audit_logs_select ON public.order_audit_logs FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: order_items order_items_staff_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY order_items_staff_all ON public.order_items USING ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND public.is_project_member(o.project_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.orders o
  WHERE ((o.id = order_items.order_id) AND public.is_project_member(o.project_id)))));


--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders_staff_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_staff_insert ON public.orders FOR INSERT WITH CHECK (public.is_project_member(project_id));


--
-- Name: orders orders_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_staff_select ON public.orders FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: orders orders_staff_update_status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY orders_staff_update_status ON public.orders FOR UPDATE USING (public.is_project_member(project_id)) WITH CHECK (public.is_project_member(project_id));


--
-- Name: product_addons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.product_addons ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_delete ON public.products FOR DELETE TO authenticated USING (public.is_project_member(project_id));


--
-- Name: products products_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_insert ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id));


--
-- Name: products products_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_member_read ON public.products FOR SELECT TO authenticated USING (public.is_project_member(project_id));


--
-- Name: products products_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_public_read ON public.products FOR SELECT TO anon USING (((is_available = true) AND (EXISTS ( SELECT 1
   FROM public.projects pr
  WHERE ((pr.id = products.project_id) AND (pr.is_active = true))))));


--
-- Name: products products_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY products_update ON public.products FOR UPDATE TO authenticated USING (public.is_project_member(project_id)) WITH CHECK (public.is_project_member(project_id));


--
-- Name: projects; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

--
-- Name: projects projects_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_delete_owner ON public.projects FOR DELETE USING (public.is_project_owner(id));


--
-- Name: projects projects_insert_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_insert_authenticated ON public.projects FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: projects projects_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_member_read ON public.projects FOR SELECT TO authenticated USING (public.is_project_member(id));


--
-- Name: projects projects_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_public_read ON public.projects FOR SELECT TO anon USING ((is_active = true));


--
-- Name: projects projects_update_member; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY projects_update_member ON public.projects FOR UPDATE USING (public.is_project_member(id));


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions push_subscriptions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_delete ON public.push_subscriptions FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: push_subscriptions push_subscriptions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_insert ON public.push_subscriptions FOR INSERT WITH CHECK (((auth.uid() = user_id) AND (EXISTS ( SELECT 1
   FROM public.staff_members sm
  WHERE ((sm.user_id = auth.uid()) AND (sm.project_id = push_subscriptions.project_id))))));


--
-- Name: push_subscriptions push_subscriptions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY push_subscriptions_select ON public.push_subscriptions FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: service_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: service_requests service_requests_staff; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_requests_staff ON public.service_requests USING (public.is_project_member(project_id)) WITH CHECK (public.is_project_member(project_id));


--
-- Name: staff_members staff_delete_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_delete_owner ON public.staff_members FOR DELETE USING (public.is_project_owner(project_id));


--
-- Name: staff_members staff_insert_by_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_insert_by_owner ON public.staff_members FOR INSERT TO authenticated WITH CHECK ((public.is_project_owner(project_id) AND (role = ANY (ARRAY['manager'::text, 'staff'::text]))));


--
-- Name: staff_members staff_insert_first_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_insert_first_owner ON public.staff_members FOR INSERT TO authenticated WITH CHECK (((user_id = auth.uid()) AND (role = 'owner'::text) AND public.project_has_no_members(project_id)));


--
-- Name: POLICY staff_insert_first_owner ON staff_members; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY staff_insert_first_owner ON public.staff_members IS 'Only first owner of an empty project may self-insert';


--
-- Name: staff_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

--
-- Name: staff_members staff_select_own_or_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_select_own_or_owner ON public.staff_members FOR SELECT USING (((user_id = auth.uid()) OR public.is_project_owner(project_id)));


--
-- Name: staff_members staff_update_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY staff_update_owner ON public.staff_members FOR UPDATE USING (public.is_project_owner(project_id));


--
-- Name: tables; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

--
-- Name: tables tables_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tables_delete ON public.tables FOR DELETE TO authenticated USING (public.is_project_member(project_id));


--
-- Name: tables tables_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tables_insert ON public.tables FOR INSERT TO authenticated WITH CHECK (public.is_project_member(project_id));


--
-- Name: tables tables_member_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tables_member_read ON public.tables FOR SELECT TO authenticated USING (public.is_project_member(project_id));


--
-- Name: tables tables_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tables_public_read ON public.tables FOR SELECT TO anon USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM public.projects pr
  WHERE ((pr.id = tables.project_id) AND (pr.is_active = true))))));


--
-- Name: tables tables_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tables_update ON public.tables FOR UPDATE TO authenticated USING (public.is_project_member(project_id)) WITH CHECK (public.is_project_member(project_id));


--
-- Name: telegram_link_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_link_codes telegram_link_codes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telegram_link_codes_insert ON public.telegram_link_codes FOR INSERT WITH CHECK (public.is_project_member(project_id));


--
-- Name: telegram_link_codes telegram_link_codes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telegram_link_codes_select ON public.telegram_link_codes FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: telegram_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;

--
-- Name: telegram_links telegram_links_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telegram_links_delete ON public.telegram_links FOR DELETE USING (public.is_project_member(project_id));


--
-- Name: telegram_links telegram_links_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telegram_links_insert ON public.telegram_links FOR INSERT WITH CHECK (public.is_project_member(project_id));


--
-- Name: telegram_links telegram_links_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY telegram_links_select ON public.telegram_links FOR SELECT USING (public.is_project_member(project_id));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION generate_basic_slug(input text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_basic_slug(input text) TO anon;
GRANT ALL ON FUNCTION public.generate_basic_slug(input text) TO authenticated;
GRANT ALL ON FUNCTION public.generate_basic_slug(input text) TO service_role;


--
-- Name: FUNCTION handle_new_user_safety(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.handle_new_user_safety() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user_safety() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user_safety() TO service_role;


--
-- Name: FUNCTION is_project_member(p_project_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_project_member(p_project_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_project_member(p_project_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_project_member(p_project_id uuid) TO service_role;


--
-- Name: FUNCTION is_project_owner(p_project_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_project_owner(p_project_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_project_owner(p_project_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_project_owner(p_project_id uuid) TO service_role;


--
-- Name: FUNCTION is_super_admin(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.is_super_admin() TO anon;
GRANT ALL ON FUNCTION public.is_super_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_super_admin() TO service_role;


--
-- Name: FUNCTION next_order_number(p_project_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.next_order_number(p_project_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.next_order_number(p_project_id uuid) TO service_role;


--
-- Name: FUNCTION orders_protect_amounts(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.orders_protect_amounts() TO anon;
GRANT ALL ON FUNCTION public.orders_protect_amounts() TO authenticated;
GRANT ALL ON FUNCTION public.orders_protect_amounts() TO service_role;


--
-- Name: FUNCTION project_has_no_members(p_project_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.project_has_no_members(p_project_id uuid) TO anon;
GRANT ALL ON FUNCTION public.project_has_no_members(p_project_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.project_has_no_members(p_project_id uuid) TO service_role;


--
-- Name: FUNCTION rate_limit_check(p_key text, p_limit integer, p_window_ms integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rate_limit_check(p_key text, p_limit integer, p_window_ms integer) TO service_role;


--
-- Name: FUNCTION sync_business_subscription_status(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_business_subscription_status() TO anon;
GRANT ALL ON FUNCTION public.sync_business_subscription_status() TO authenticated;
GRANT ALL ON FUNCTION public.sync_business_subscription_status() TO service_role;


--
-- Name: FUNCTION update_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at() TO service_role;


--
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.categories TO anon;
GRANT ALL ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.categories TO service_role;


--
-- Name: TABLE daily_order_counters; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.daily_order_counters TO service_role;


--
-- Name: TABLE order_audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.order_audit_logs TO anon;
GRANT ALL ON TABLE public.order_audit_logs TO authenticated;
GRANT ALL ON TABLE public.order_audit_logs TO service_role;


--
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.order_items TO anon;
GRANT ALL ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;


--
-- Name: SEQUENCE order_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.order_seq TO anon;
GRANT ALL ON SEQUENCE public.order_seq TO authenticated;
GRANT ALL ON SEQUENCE public.order_seq TO service_role;


--
-- Name: TABLE order_sequences; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.order_sequences TO anon;
GRANT ALL ON TABLE public.order_sequences TO authenticated;
GRANT ALL ON TABLE public.order_sequences TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: TABLE product_addons; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.product_addons TO anon;
GRANT ALL ON TABLE public.product_addons TO authenticated;
GRANT ALL ON TABLE public.product_addons TO service_role;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;


--
-- Name: TABLE projects; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.projects TO anon;
GRANT ALL ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;


--
-- Name: TABLE push_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_subscriptions TO anon;
GRANT ALL ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;


--
-- Name: TABLE rate_limits; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.rate_limits TO anon;
GRANT ALL ON TABLE public.rate_limits TO authenticated;
GRANT ALL ON TABLE public.rate_limits TO service_role;


--
-- Name: TABLE service_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_requests TO anon;
GRANT ALL ON TABLE public.service_requests TO authenticated;
GRANT ALL ON TABLE public.service_requests TO service_role;


--
-- Name: TABLE staff_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.staff_members TO anon;
GRANT ALL ON TABLE public.staff_members TO authenticated;
GRANT ALL ON TABLE public.staff_members TO service_role;


--
-- Name: TABLE tables; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tables TO anon;
GRANT ALL ON TABLE public.tables TO authenticated;
GRANT ALL ON TABLE public.tables TO service_role;


--
-- Name: TABLE telegram_link_codes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.telegram_link_codes TO anon;
GRANT ALL ON TABLE public.telegram_link_codes TO authenticated;
GRANT ALL ON TABLE public.telegram_link_codes TO service_role;


--
-- Name: TABLE telegram_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.telegram_links TO anon;
GRANT ALL ON TABLE public.telegram_links TO authenticated;
GRANT ALL ON TABLE public.telegram_links TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--



-- ============================================================================
-- Extensions the app depends on (pg_dump --schema=public omits these because
-- they're database-level objects, not public-schema objects — restored here
-- to match the live database exactly. unaccent was created by original
-- migration 0020_clean_business_slugs.)
-- ============================================================================
create extension if not exists unaccent with schema public;

-- ============================================================================
-- Trigger on auth.users (outside public schema — added manually)
-- Prevents auto-provisioning a project for API-created users; skips users
-- who already have staff_members. See original 0037/0038 migrations.
-- ============================================================================
CREATE TRIGGER on_auth_user_created_safety AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_safety();

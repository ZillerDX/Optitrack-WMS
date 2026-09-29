-- Baseline schema for OptiTrack WMS (PostgreSQL / Supabase).
--
-- Generated from the SQLAlchemy models of the former FastAPI backend, which created
-- the schema with `create_all`. Idempotent: safe to run on an empty database, and a
-- no-op on one that already has these tables. Run the numbered migrations in order
-- after it; those written later (session_revocation, unique_product_sku, rate_limits)
-- add what the models never had.
--
-- The application talks to this database only through the service-role key, so Row
-- Level Security (0002) denies everything to the anon / authenticated roles.

DO $$ BEGIN
    CREATE TYPE userrole AS ENUM ('ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE inventorystatus AS ENUM ('IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE transactiontype AS ENUM ('INBOUND', 'OUTBOUND', 'ADJUST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE transactionstatus AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.users (
	id SERIAL NOT NULL, 
	email VARCHAR(255) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	role userrole NOT NULL, 
	first_name VARCHAR(100) NOT NULL, 
	last_name VARCHAR(100) NOT NULL, 
	image_url VARCHAR(500), 
	is_active BOOLEAN NOT NULL, 
	PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_users_id ON public.users (id);

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON public.users (email);

CREATE TABLE IF NOT EXISTS public.products (
	id SERIAL NOT NULL, 
	owner_id INTEGER NOT NULL, 
	sku VARCHAR(100) NOT NULL, 
	name VARCHAR(255) NOT NULL, 
	category VARCHAR(100), 
	barcode VARCHAR(100), 
	supplier VARCHAR(255), 
	cost_price NUMERIC(10, 2) NOT NULL, 
	sell_price NUMERIC(10, 2) NOT NULL, 
	min_stock_level INTEGER NOT NULL, 
	unit VARCHAR(50), 
	image_url VARCHAR(500), 
	PRIMARY KEY (id), 
	FOREIGN KEY(owner_id) REFERENCES public.users (id)
);

CREATE INDEX IF NOT EXISTS ix_products_owner_category ON public.products (owner_id, category);

CREATE INDEX IF NOT EXISTS ix_products_barcode ON public.products (barcode);

CREATE INDEX IF NOT EXISTS ix_products_owner_sku ON public.products (owner_id, sku);

CREATE INDEX IF NOT EXISTS ix_products_owner_id ON public.products (owner_id);

CREATE INDEX IF NOT EXISTS ix_products_sku ON public.products (sku);

CREATE INDEX IF NOT EXISTS ix_products_id ON public.products (id);

CREATE TABLE IF NOT EXISTS public.categories (
	id SERIAL NOT NULL, 
	owner_id INTEGER NOT NULL, 
	name VARCHAR(100) NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_categories_owner_name UNIQUE (owner_id, name), 
	FOREIGN KEY(owner_id) REFERENCES public.users (id)
);

CREATE INDEX IF NOT EXISTS ix_categories_owner_id ON public.categories (owner_id);

CREATE INDEX IF NOT EXISTS ix_categories_id ON public.categories (id);

CREATE INDEX IF NOT EXISTS ix_categories_name ON public.categories (name);

CREATE TABLE IF NOT EXISTS public.locations (
	id SERIAL NOT NULL, 
	owner_id INTEGER NOT NULL, 
	name VARCHAR(50) NOT NULL, 
	description VARCHAR(255), 
	capacity INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uq_locations_owner_name UNIQUE (owner_id, name), 
	FOREIGN KEY(owner_id) REFERENCES public.users (id)
);

CREATE INDEX IF NOT EXISTS ix_locations_id ON public.locations (id);

CREATE INDEX IF NOT EXISTS ix_locations_name ON public.locations (name);

CREATE INDEX IF NOT EXISTS ix_locations_owner_id ON public.locations (owner_id);

CREATE TABLE IF NOT EXISTS public.inventory (
	id SERIAL NOT NULL, 
	product_id INTEGER NOT NULL, 
	location VARCHAR(50) NOT NULL, 
	quantity INTEGER NOT NULL, 
	status inventorystatus NOT NULL, 
	PRIMARY KEY (id), 
	CONSTRAINT uix_product_location UNIQUE (product_id, location), 
	FOREIGN KEY(product_id) REFERENCES public.products (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_inventory_id ON public.inventory (id);

CREATE INDEX IF NOT EXISTS ix_inventory_location ON public.inventory (location);

CREATE TABLE IF NOT EXISTS public.transactions (
	id SERIAL NOT NULL, 
	ref_code VARCHAR(100) NOT NULL, 
	type transactiontype NOT NULL, 
	quantity INTEGER NOT NULL, 
	unit_price NUMERIC(10, 2) NOT NULL, 
	total_price NUMERIC(12, 2) NOT NULL, 
	status transactionstatus NOT NULL, 
	location VARCHAR(50), 
	notes VARCHAR(500), 
	user_id INTEGER NOT NULL, 
	product_id INTEGER NOT NULL, 
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(user_id) REFERENCES public.users (id), 
	FOREIGN KEY(product_id) REFERENCES public.products (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_transactions_type ON public.transactions (type);

CREATE INDEX IF NOT EXISTS ix_transactions_created_at ON public.transactions (created_at);

CREATE INDEX IF NOT EXISTS ix_transactions_id ON public.transactions (id);

CREATE INDEX IF NOT EXISTS ix_transactions_user_id ON public.transactions (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS ix_transactions_ref_code ON public.transactions (ref_code);

CREATE INDEX IF NOT EXISTS ix_transactions_product_id ON public.transactions (product_id);

-- The models set these defaults in Python only; the API always sends explicit values,
-- but a database default keeps rows valid for any other writer (SQL editor, imports).
ALTER TABLE public.users        ALTER COLUMN role            SET DEFAULT 'ADMIN';
ALTER TABLE public.users        ALTER COLUMN is_active       SET DEFAULT true;
ALTER TABLE public.products     ALTER COLUMN min_stock_level SET DEFAULT 0;
ALTER TABLE public.products     ALTER COLUMN unit            SET DEFAULT 'pcs';
ALTER TABLE public.inventory    ALTER COLUMN quantity        SET DEFAULT 0;
ALTER TABLE public.inventory    ALTER COLUMN status          SET DEFAULT 'IN_STOCK';
ALTER TABLE public.locations    ALTER COLUMN capacity        SET DEFAULT 0;
ALTER TABLE public.transactions ALTER COLUMN status          SET DEFAULT 'COMPLETED';

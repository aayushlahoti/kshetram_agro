do $$ begin create type user_role as enum ('FARMER', 'GOVT_BUYER', 'EQUIPMENT_OFFICER', 'ADMIN'); exception when duplicate_object then null; end $$;
do $$ begin create type kyc_status as enum ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'); exception when duplicate_object then null; end $$;
do $$ begin create type listing_status as enum ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SOLD', 'CANCELLED'); exception when duplicate_object then null; end $$;
do $$ begin create type residue_format as enum ('BALED', 'UNBALED'); exception when duplicate_object then null; end $$;
do $$ begin create type bid_status as enum ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'); exception when duplicate_object then null; end $$;
do $$ begin create type order_status as enum ('CONFIRMED', 'PICKUP_SCHEDULED', 'WEIGHBRIDGE_VERIFIED', 'PAYMENT_PENDING', 'SETTLED', 'CANCELLED'); exception when duplicate_object then null; end $$;

create table if not exists users (
  id text primary key,
  phone varchar(15) unique not null,
  name varchar(255),
  role user_role not null default 'FARMER',
  kyc_status kyc_status not null default 'NOT_SUBMITTED',
  kyc_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stubble_listings (
  id text primary key,
  farmer_id text not null references users(id) on delete cascade,
  crop_type varchar(255) not null,
  weight_quintals numeric(10,2) not null,
  moisture_percent numeric(5,2) not null,
  residue_format residue_format not null,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  status listing_status not null default 'PENDING_APPROVAL',
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stubble_bids (
  id text primary key,
  listing_id text not null references stubble_listings(id) on delete cascade,
  buyer_id text not null references users(id) on delete cascade,
  amount_per_quintal numeric(10,2) not null,
  status bid_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(listing_id, buyer_id)
);

create table if not exists stubble_orders (
  id text primary key,
  listing_id text unique not null references stubble_listings(id) on delete cascade,
  bid_id text unique not null references stubble_bids(id) on delete cascade,
  farmer_id text not null references users(id) on delete cascade,
  buyer_id text not null references users(id) on delete cascade,
  status order_status not null default 'CONFIRMED',
  verified_weight_quintals numeric(10,2),
  settlement_amount numeric(12,2),
  bank_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

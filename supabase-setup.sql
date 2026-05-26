-- ═══════════════════════════════════════════════
--  GARAGE HQ — Schema + RLS
--  Run in the kingdomfit Supabase project SQL editor.
--  Tables are prefixed garage_hq_ to coexist with
--  the existing planner_users / planner_tasks tables.
-- ═══════════════════════════════════════════════

-- VEHICLES
create table garage_hq_vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users not null,
  nickname text not null,
  year int,
  make text,
  model text,
  trim text,
  vin text,
  current_mileage int default 0,
  photo_url text,
  created_at timestamptz default now()
);

-- VEHICLE MEMBERS (sharing)
create table garage_hq_vehicle_members (
  vehicle_id uuid references garage_hq_vehicles on delete cascade,
  user_id uuid references auth.users,
  role text check (role in ('owner','editor','viewer')) default 'viewer',
  primary key (vehicle_id, user_id)
);

-- REPAIR TEMPLATES (seed data — public read)
create table garage_hq_repair_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  maintenance_type text check (maintenance_type in ('Preventative','Corrective','Major Overhaul')),
  mileage_interval int,
  time_interval_days int,
  typical_labor_hours numeric,
  diy_friendly boolean default true
);

-- REPAIR PROJECTS
create table garage_hq_repair_projects (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references garage_hq_vehicles on delete cascade,
  owner_id uuid references auth.users not null,
  title text not null,
  maintenance_type text check (maintenance_type in ('Preventative','Corrective','Major Overhaul')),
  status text check (status in ('Planning','In Progress','Complete','On Hold')) default 'Planning',
  priority text check (priority in ('Low','Medium','High','Critical')) default 'Medium',
  description text,
  diagnosis_notes text,
  estimated_cost numeric default 0,
  actual_cost numeric default 0,
  target_start_date date,
  target_completion_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- REPAIR TASKS
create table garage_hq_repair_tasks (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references garage_hq_vehicles on delete cascade,
  project_id uuid references garage_hq_repair_projects on delete set null,
  template_id uuid references garage_hq_repair_templates on delete set null,
  title text not null,
  category text,
  maintenance_type text check (maintenance_type in ('Preventative','Corrective','Major Overhaul')),
  status text check (status in ('Pending','In Progress','Done')) default 'Pending',
  date_performed date,
  mileage_at_service int,
  cost_parts numeric default 0,
  cost_labor numeric default 0,
  parts_source text,
  shop_name text,
  labor_hours numeric,
  notes text,
  video_url text,
  receipt_url text,
  next_due_date date,
  next_due_mileage int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- PARTS LIST
create table garage_hq_parts_list (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references garage_hq_repair_projects on delete cascade,
  part_name text not null,
  part_number text,
  supplier text,
  url text,
  unit_cost numeric default 0,
  quantity int default 1,
  status text check (status in ('Researching','Ordered','Received','Installed')) default 'Researching',
  notes text,
  created_at timestamptz default now()
);

-- ═══════════════════════════════════════════════
--  RLS POLICIES
-- ═══════════════════════════════════════════════

-- garage_hq_vehicles: owner full access
alter table garage_hq_vehicles enable row level security;
create policy "ghq owner access" on garage_hq_vehicles
  using (owner_id = auth.uid());

-- garage_hq_vehicle_members: user sees their own rows
alter table garage_hq_vehicle_members enable row level security;
create policy "ghq member access" on garage_hq_vehicle_members
  using (user_id = auth.uid());

-- garage_hq_repair_projects: owner or shared member of the vehicle
alter table garage_hq_repair_projects enable row level security;
create policy "ghq project access" on garage_hq_repair_projects
  using (
    vehicle_id in (
      select vehicle_id from garage_hq_vehicle_members where user_id = auth.uid()
      union
      select id from garage_hq_vehicles where owner_id = auth.uid()
    )
  );

-- garage_hq_repair_tasks: same vehicle membership gate
alter table garage_hq_repair_tasks enable row level security;
create policy "ghq task access" on garage_hq_repair_tasks
  using (
    vehicle_id in (
      select vehicle_id from garage_hq_vehicle_members where user_id = auth.uid()
      union
      select id from garage_hq_vehicles where owner_id = auth.uid()
    )
  );

-- garage_hq_parts_list: accessible if user can access the parent project
alter table garage_hq_parts_list enable row level security;
create policy "ghq parts access" on garage_hq_parts_list
  using (
    project_id in (
      select id from garage_hq_repair_projects
      where vehicle_id in (
        select vehicle_id from garage_hq_vehicle_members where user_id = auth.uid()
        union
        select id from garage_hq_vehicles where owner_id = auth.uid()
      )
    )
  );

-- garage_hq_repair_templates: public read
alter table garage_hq_repair_templates enable row level security;
create policy "ghq templates public read" on garage_hq_repair_templates
  for select using (true);

-- ═══════════════════════════════════════════════
--  SEED REPAIR TEMPLATES
-- ═══════════════════════════════════════════════
insert into garage_hq_repair_templates
  (name, category, maintenance_type, mileage_interval, time_interval_days, typical_labor_hours, diy_friendly)
values
  ('Oil Change',            'Engine',    'Preventative', 5000,  180,  0.5,  true),
  ('Tire Rotation',         'Tires',     'Preventative', 7500,  180,  0.5,  true),
  ('Brake Inspection',      'Brakes',    'Preventative', 15000, 365,  1,    true),
  ('Cabin Air Filter',      'HVAC',      'Preventative', 15000, 365,  0.25, true),
  ('Engine Air Filter',     'Engine',    'Preventative', 20000, 730,  0.25, true),
  ('Transmission Fluid',    'Drivetrain','Preventative', 30000, null, 1,    false),
  ('Coolant Flush',         'Engine',    'Preventative', 30000, 730,  1,    false),
  ('Spark Plugs',           'Engine',    'Preventative', 60000, null, 2,    true),
  ('Brake Pad Replacement', 'Brakes',    'Corrective',   null,  null, 2,    true),
  ('Battery Replacement',   'Electrical','Corrective',   null,  null, 0.5,  true);

-- ═══════════════════════════════════════════════
--  OPTIONAL: email → user_id lookup for sharing
--  (needed for the "Share vehicle" feature)
-- ═══════════════════════════════════════════════
create or replace function get_user_id_by_email(email_input text)
returns uuid
language sql
security definer
as $$
  select id from auth.users where email = email_input limit 1;
$$;

-- ============================================================================
-- MCA CONTROLE DE ATIVIDADES & MES - SUPABASE POSTGRESQL SCHEMA (FREE TIER)
-- Cole este script no SQL Editor do seu projeto Supabase (supabase.com)
-- ============================================================================

-- 1. Tabela de Snapshot Mestre Universal (Garante sincronização instantânea de estado completo)
CREATE TABLE IF NOT EXISTS public.mca_master_snapshot (
    id TEXT PRIMARY KEY DEFAULT 'current',
    collaborators JSONB DEFAULT '[]'::jsonb,
    shifts JSONB DEFAULT '[]'::jsonb,
    activities JSONB DEFAULT '[]'::jsonb,
    logs JSONB DEFAULT '[]'::jsonb,
    autoclose_notifs JSONB DEFAULT '[]'::jsonb,
    factory_config JSONB DEFAULT '{}'::jsonb,
    formatted_sync_time TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela Normalizada de Apontamentos de Produção (Logs)
CREATE TABLE IF NOT EXISTS public.logs (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    collaborator_name TEXT NOT NULL,
    role TEXT,
    shift TEXT NOT NULL,
    activity TEXT NOT NULL,
    category TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration_minutes NUMERIC,
    status TEXT NOT NULL DEFAULT 'Em Execução',
    observation TEXT,
    notes TEXT,
    machine_id TEXT,
    parts_produced INTEGER,
    scrap_count INTEGER,
    auto_closed BOOLEAN DEFAULT FALSE,
    auto_closed_at_shift_end BOOLEAN DEFAULT FALSE,
    pending_next_shift_resume BOOLEAN DEFAULT FALSE,
    resumed_from_previous_log_id TEXT,
    is_meal_pause BOOLEAN DEFAULT FALSE,
    meal_break_deducted BOOLEAN DEFAULT FALSE,
    meal_break_minutes INTEGER DEFAULT 0,
    meal_break_source TEXT,
    meal_pause_start_time TEXT,
    meal_pause_timestamp_ms BIGINT,
    meal_pause_duration_minutes NUMERIC,
    total_paused_seconds INTEGER DEFAULT 0,
    meal_resumed_at TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logs_date ON public.logs (date);
CREATE INDEX IF NOT EXISTS idx_logs_collaborator ON public.logs (collaborator_name);
CREATE INDEX IF NOT EXISTS idx_logs_shift ON public.logs (shift);
CREATE INDEX IF NOT EXISTS idx_logs_status ON public.logs (status);

-- 3. Tabela de Colaboradores
CREATE TABLE IF NOT EXISTS public.collaborators (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    shift TEXT NOT NULL DEFAULT 'Turno 1',
    active BOOLEAN DEFAULT TRUE,
    avatar_color TEXT,
    meal_start TEXT,
    meal_end TEXT,
    meal_duration_minutes INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabela de Turnos de Trabalho
CREATE TABLE IF NOT EXISTS public.shifts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT,
    entrada TEXT NOT NULL,
    saida_almoco TEXT,
    retorno_almoco TEXT,
    saida TEXT NOT NULL,
    dias TEXT[] DEFAULT ARRAY['Seg', 'Ter', 'Qua', 'Qui', 'Sex'],
    color TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabela de Catálogo de Atividades
CREATE TABLE IF NOT EXISTS public.activities (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Tabela de Configurações da Fábrica
CREATE TABLE IF NOT EXISTS public.factory_config (
    id TEXT PRIMARY KEY DEFAULT 'current',
    tolerance_minutes INTEGER DEFAULT 60,
    efficiency_threshold_green INTEGER DEFAULT 85,
    efficiency_threshold_yellow INTEGER DEFAULT 70,
    observations TEXT[] DEFAULT ARRAY[]::TEXT[],
    custom_role_colors JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Tabela de Notificações de Fechamento Automático de Turno
CREATE TABLE IF NOT EXISTS public.autoclose_notifs (
    id TEXT PRIMARY KEY,
    collaborator_id TEXT,
    collaborator_name TEXT NOT NULL,
    shift TEXT NOT NULL,
    closed_at TEXT NOT NULL,
    timestamp_ms BIGINT,
    read BOOLEAN DEFAULT FALSE,
    dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- HABILITAR ROW LEVEL SECURITY (RLS) COM POLÍTICAS DE ACESSO LIVRE (ANON)
-- Permite leitura e escrita imediata para terminais/tablets do chão de fábrica
-- ============================================================================

ALTER TABLE public.mca_master_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.factory_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.autoclose_notifs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "Public access to mca_master_snapshot" ON public.mca_master_snapshot;
    CREATE POLICY "Public access to mca_master_snapshot" ON public.mca_master_snapshot FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public access to logs" ON public.logs;
    CREATE POLICY "Public access to logs" ON public.logs FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public access to collaborators" ON public.collaborators;
    CREATE POLICY "Public access to collaborators" ON public.collaborators FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public access to shifts" ON public.shifts;
    CREATE POLICY "Public access to shifts" ON public.shifts FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public access to activities" ON public.activities;
    CREATE POLICY "Public access to activities" ON public.activities FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public access to factory_config" ON public.factory_config;
    CREATE POLICY "Public access to factory_config" ON public.factory_config FOR ALL USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Public access to autoclose_notifs" ON public.autoclose_notifs;
    CREATE POLICY "Public access to autoclose_notifs" ON public.autoclose_notifs FOR ALL USING (true) WITH CHECK (true);
END $$;

-- ============================================================================
-- HABILITAR SUPABASE REALTIME PARA SINCRONIZAÇÃO INSTANTÂNEA ENTRE TABLETS
-- ============================================================================
DO $$ 
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.mca_master_snapshot;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.logs;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.collaborators;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.factory_config;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

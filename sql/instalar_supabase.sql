-- Mapas corporales de las emociones · Uso didáctico
-- EJECUTAR EN SUPABASE > SQL EDITOR con rol administrador.
-- El frontend contiene solo URL y publishable key, NUNCA service_role / sb_secret.
-- Ver README.md antes de recolectar datos nominativos.

BEGIN;

CREATE TABLE IF NOT EXISTS public.map_participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    class_code text NOT NULL CHECK (class_code ~ '^[A-Z0-9]{6,12}$'),
    student_name text NOT NULL CHECK (char_length(btrim(student_name)) BETWEEN 2 AND 90),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.map_answers (
    participant_id uuid NOT NULL REFERENCES public.map_participants(id) ON DELETE CASCADE,
    emotion text NOT NULL CHECK (emotion IN ('alegria','tristeza','miedo','enojo','asco','sorpresa')),
    activation jsonb NOT NULL CHECK (jsonb_typeof(activation)='array' AND jsonb_array_length(activation)=2304),
    deactivation jsonb NOT NULL CHECK (jsonb_typeof(deactivation)='array' AND jsonb_array_length(deactivation)=2304),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (participant_id, emotion)
);

CREATE TABLE IF NOT EXISTS public.map_teachers (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    added_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS map_participants_class_idx ON public.map_participants(class_code);
CREATE INDEX IF NOT EXISTS map_answers_emotion_idx ON public.map_answers(emotion);

-- No hay política de lectura ni de inserción directa: solo las funciones explícitas
-- pueden acceder a las tablas (SECURITY DEFINER).
ALTER TABLE public.map_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_teachers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.map_participants,public.map_answers,public.map_teachers FROM PUBLIC, anon, authenticated;

-- Se verifica una respuesta completa (seis emociones) y se guarda en transacción.
CREATE OR REPLACE FUNCTION public.submit_body_maps(
    p_name text,
    p_class_code text,
    p_answers jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
    v_name text := btrim(p_name);
    v_code text := upper(btrim(p_class_code));
    v_id uuid := gen_random_uuid();
    v_row jsonb;
    v_a jsonb;
    v_d jsonb;
    v_em text;
    v_seen text[] := ARRAY[]::text[];
BEGIN
    IF v_name IS NULL OR char_length(v_name) NOT BETWEEN 2 AND 90 THEN
        RAISE EXCEPTION 'Nombre inválido (2 a 90 caracteres)';
    END IF;
    IF v_code IS NULL OR v_code !~ '^[A-Z0-9]{6,12}$' THEN
        RAISE EXCEPTION 'Código de grupo inválido';
    END IF;
    IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'array' THEN
        RAISE EXCEPTION 'Respuestas inválidas';
    END IF;
    IF jsonb_array_length(p_answers) <> 6 THEN
        RAISE EXCEPTION 'Se necesitan exactamente seis emociones';
    END IF;
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_answers) LOOP
        v_em := v_row ->> 'emotion';
        IF v_em IS NULL OR v_em NOT IN ('alegria','tristeza','miedo','enojo','asco','sorpresa') OR v_em=ANY(v_seen) THEN
            RAISE EXCEPTION 'Emoción inválida o duplicada';
        END IF;
        v_seen := array_append(v_seen,v_em);
        v_a := v_row -> 'activation'; v_d := v_row -> 'deactivation';
        IF v_a IS NULL OR v_d IS NULL OR jsonb_typeof(v_a) <> 'array' OR jsonb_typeof(v_d) <> 'array' THEN
            RAISE EXCEPTION 'La respuesta % no tiene dos matrices',v_em;
        END IF;
        IF jsonb_array_length(v_a)<>2304 OR jsonb_array_length(v_d)<>2304 THEN
            RAISE EXCEPTION 'Cada matriz debe tener 2304 valores';
        END IF;
        IF EXISTS (
            SELECT 1 FROM (
                SELECT value AS v FROM jsonb_array_elements(v_a)
                UNION ALL
                SELECT value AS v FROM jsonb_array_elements(v_d)
            ) cells WHERE jsonb_typeof(cells.v)<>'number'
        ) THEN RAISE EXCEPTION 'Valores no numéricos'; END IF;
        IF EXISTS (
            SELECT 1 FROM (
                SELECT (value #>> '{}')::numeric AS v FROM jsonb_array_elements(v_a)
                UNION ALL
                SELECT (value #>> '{}')::numeric AS v FROM jsonb_array_elements(v_d)
            ) cells WHERE cells.v < 0 OR cells.v > 100 OR cells.v <> trunc(cells.v)
        ) THEN RAISE EXCEPTION 'Las intensidades deben ser enteros entre 0 y 100'; END IF;
    END LOOP;
    INSERT INTO public.map_participants(id,class_code,student_name) VALUES(v_id,v_code,v_name);
    FOR v_row IN SELECT value FROM jsonb_array_elements(p_answers) LOOP
        INSERT INTO public.map_answers(participant_id,emotion,activation,deactivation)
        VALUES (v_id,v_row->>'emotion',v_row->'activation',v_row->'deactivation');
    END LOOP;
    RETURN jsonb_build_object('ok',true,'saved',6);
END $$;

-- Solo devuelve promedios de mapas con al menos CINCO estudiantes.
-- No devuelve nombres, IDs ni respuestas individuales.
CREATE OR REPLACE FUNCTION public.class_body_maps(p_class_code text)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
WITH all_data AS (
    SELECT a.emotion, a.activation, a.deactivation
    FROM public.map_answers a
    INNER JOIN public.map_participants p ON p.id=a.participant_id
    WHERE p.class_code=upper(btrim(p_class_code))
),
counts AS (
    SELECT emotion, count(*)::integer AS n FROM all_data GROUP BY emotion
),
pixel_average AS (
    SELECT a.emotion, pix.i,
           round(avg(pix.v::numeric - (a.deactivation->>((pix.i-1)::integer))::numeric),2) AS signed
    FROM all_data a
    JOIN counts c ON c.emotion=a.emotion AND c.n>=5
    CROSS JOIN LATERAL jsonb_array_elements_text(a.activation) WITH ORDINALITY AS pix(v,i)
    GROUP BY a.emotion,pix.i
),
map_arrays AS (
    SELECT emotion,jsonb_agg(signed ORDER BY i) AS signed FROM pixel_average GROUP BY emotion
)
SELECT jsonb_build_object(
    'counts',COALESCE((SELECT jsonb_object_agg(emotion,n) FROM counts),'{}'::jsonb),
    'maps',COALESCE((SELECT jsonb_object_agg(m.emotion,jsonb_build_object('signed',m.signed,'n',c.n))
            FROM map_arrays m JOIN counts c ON c.emotion=m.emotion),'{}'::jsonb),
    'min_group_size',5
);
$$;

-- Solo el docente registrado en map_teachers puede descargar datos nominativos.
CREATE OR REPLACE FUNCTION public.export_class_body_maps(p_class_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_code text := upper(btrim(p_class_code));
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.map_teachers WHERE user_id=auth.uid()) THEN
        RAISE EXCEPTION 'Acceso denegado: profesor no autorizado' USING ERRCODE='42501';
    END IF;
    IF v_code IS NULL OR v_code !~ '^[A-Z0-9]{6,12}$' THEN
        RAISE EXCEPTION 'Código inválido';
    END IF;
    RETURN jsonb_build_object(
        'participants',COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id',p.id::text,'class_code',p.class_code,'student_name',p.student_name,'created_at',p.created_at
            ) ORDER BY p.created_at)
            FROM public.map_participants p WHERE p.class_code=v_code
        ),'[]'::jsonb),
        'responses',COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'participant_id',a.participant_id::text,'class_code',p.class_code,
                'emotion',a.emotion,'activation',a.activation,'deactivation',a.deactivation,'created_at',a.created_at
            ) ORDER BY p.created_at,a.emotion)
            FROM public.map_answers a
            JOIN public.map_participants p ON p.id=a.participant_id WHERE p.class_code=v_code
        ),'[]'::jsonb)
    );
END $$;

-- Impide uso no autorizado de las funciones, incluso si las tablas están protegidas.
REVOKE ALL ON FUNCTION public.submit_body_maps(text,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.class_body_maps(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.export_class_body_maps(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_body_maps(text,text,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.class_body_maps(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.export_class_body_maps(text) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- PASO MANUAL (no se puede completar sin conocer el usuario del profesor):
-- 1. En Supabase > Authentication > Users: crear usuario con email y contraseña.
-- 2. Copiar el UUID del usuario y ejecutar por separado:
-- INSERT INTO public.map_teachers(user_id) VALUES ('PEGAR_UUID_AQUI');
-- 3. Iniciar sesión en profesor.html.

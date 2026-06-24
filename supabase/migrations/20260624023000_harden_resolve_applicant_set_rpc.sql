-- Keep question-set resolution compatible with live databases that do not yet
-- store organization_id / department_id directly on applicants.

CREATE OR REPLACE FUNCTION public.resolve_applicant_set(_applicant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_department_id uuid;
  v_organization_id uuid;
  v_set_id uuid;
  v_has_department_column boolean;
  v_has_organization_column boolean;
BEGIN
  PERFORM 1
  FROM public.applicants
  WHERE id = _applicant_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT qsa.set_id
  INTO v_set_id
  FROM public.question_set_assignments qsa
  JOIN public.question_sets qs ON qs.id = qsa.set_id
  WHERE qsa.scope = 'user'
    AND qsa.applicant_id = _applicant_id
    AND qs.active = true
    AND qs.deleted_at IS NULL
  ORDER BY qsa.created_at DESC
  LIMIT 1;

  IF v_set_id IS NOT NULL THEN
    RETURN v_set_id;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'applicants'
      AND column_name = 'department_id'
  )
  INTO v_has_department_column;

  IF v_has_department_column THEN
    EXECUTE 'SELECT department_id FROM public.applicants WHERE id = $1 AND deleted_at IS NULL'
    INTO v_department_id
    USING _applicant_id;
  END IF;

  IF v_department_id IS NOT NULL THEN
    SELECT qsa.set_id
    INTO v_set_id
    FROM public.question_set_assignments qsa
    JOIN public.question_sets qs ON qs.id = qsa.set_id
    WHERE qsa.scope = 'department'
      AND qsa.department_id = v_department_id
      AND qs.active = true
      AND qs.deleted_at IS NULL
    ORDER BY qsa.created_at DESC
    LIMIT 1;

    IF v_set_id IS NOT NULL THEN
      RETURN v_set_id;
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'applicants'
      AND column_name = 'organization_id'
  )
  INTO v_has_organization_column;

  IF v_has_organization_column THEN
    EXECUTE 'SELECT organization_id FROM public.applicants WHERE id = $1 AND deleted_at IS NULL'
    INTO v_organization_id
    USING _applicant_id;
  END IF;

  IF v_organization_id IS NOT NULL THEN
    SELECT qsa.set_id
    INTO v_set_id
    FROM public.question_set_assignments qsa
    JOIN public.question_sets qs ON qs.id = qsa.set_id
    WHERE qsa.scope = 'organization'
      AND qsa.organization_id = v_organization_id
      AND qs.active = true
      AND qs.deleted_at IS NULL
    ORDER BY qsa.created_at DESC
    LIMIT 1;

    IF v_set_id IS NOT NULL THEN
      RETURN v_set_id;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_applicant_set(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_applicant_set(uuid) TO service_role;

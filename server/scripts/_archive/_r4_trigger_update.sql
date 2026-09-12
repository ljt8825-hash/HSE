CREATE OR REPLACE FUNCTION public.prevent_adjustment_modify()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION '扣分调整记录表禁止DELETE';
    ELSIF TG_OP = 'UPDATE' THEN
        -- 仅允许翻转 is_current（版本链记账位）；审计内容列一律禁止修改
        IF OLD.deduction_id IS DISTINCT FROM NEW.deduction_id
        OR OLD.target_id IS DISTINCT FROM NEW.target_id
        OR OLD.version_no IS DISTINCT FROM NEW.version_no
        OR OLD.old_score IS DISTINCT FROM NEW.old_score
        OR OLD.new_score IS DISTINCT FROM NEW.new_score
        OR OLD.operation_type IS DISTINCT FROM NEW.operation_type
        OR OLD.adjustment_reason IS DISTINCT FROM NEW.adjustment_reason
        OR OLD.adjusted_by IS DISTINCT FROM NEW.adjusted_by
        OR OLD.adjusted_by_name IS DISTINCT FROM NEW.adjusted_by_name
        OR OLD.adjusted_at IS DISTINCT FROM NEW.adjusted_at
        OR OLD.reviewed_by IS DISTINCT FROM NEW.reviewed_by
        OR OLD.reviewed_by_name IS DISTINCT FROM NEW.reviewed_by_name
        OR OLD.reviewed_at IS DISTINCT FROM NEW.reviewed_at
        OR OLD.related_event_id IS DISTINCT FROM NEW.related_event_id
        OR OLD.related_event_type IS DISTINCT FROM NEW.related_event_type
        OR OLD.created_at IS DISTINCT FROM NEW.created_at
        THEN
            RAISE EXCEPTION '扣分调整记录表仅允许修改is_current（版本链记账位），禁止修改审计内容';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

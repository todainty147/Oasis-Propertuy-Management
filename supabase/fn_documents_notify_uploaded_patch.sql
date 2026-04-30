create or replace function public.fn_documents_notify_uploaded() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipients uuid[];
  v_safe_recipients uuid[];
  v_title text;
  v_body text;
  v_uploader uuid;
  v_tenant_user uuid;
  v_name text;
  v_vars jsonb;
begin
  if new.upload_status is distinct from 'uploaded' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.upload_status = 'uploaded' then
    return new;
  end if;

  if new.account_id is null then
    return new;
  end if;

  v_name := coalesce(nullif(new.original_filename, ''), new.name, 'Dokument');
  v_uploader := coalesce(new.created_by_user_id, new.uploaded_by);

  if coalesce(new.visibility, '') = 'private' then
    if v_uploader is not null then
      v_recipients := array[v_uploader];
    else
      return new;
    end if;
  else
    select array_agg(am.user_id)
      into v_recipients
    from public.account_members am
    where am.account_id = new.account_id;
  end if;

  if coalesce(new.visibility, '') = 'tenant' and new.tenant_id is not null then
    select t.user_id
      into v_tenant_user
    from public.tenants t
    where t.id = new.tenant_id
      and t.account_id = new.account_id
    limit 1;

    if v_tenant_user is not null then
      if v_recipients is null then
        v_recipients := array[v_tenant_user];
      elsif not (v_tenant_user = any(v_recipients)) then
        v_recipients := v_recipients || v_tenant_user;
      end if;
    end if;
  end if;

  if v_recipients is null or array_length(v_recipients, 1) is null then
    return new;
  end if;

  select array_agg(distinct uid)
    into v_safe_recipients
  from unnest(v_recipients) as uid
  where uid is not null
    and (
      exists (
        select 1
        from public.account_members am
        where am.account_id = new.account_id
          and am.user_id = uid
      )
      or exists (
        select 1
        from public.tenants t
        where t.account_id = new.account_id
          and t.user_id = uid
          and coalesce(t.status, '') <> 'archived'
      )
      or exists (
        select 1
        from public.contractors c
        where c.account_id = new.account_id
          and c.user_id = uid
          and coalesce(c.active, false) = true
      )
    );

  if v_safe_recipients is null or array_length(v_safe_recipients, 1) is null then
    return new;
  end if;

  v_vars := jsonb_build_object(
    'name', v_name,
    'document_id', new.id,
    'property_id', new.property_id,
    'tenant_id', new.tenant_id,
    'scope', new.scope,
    'visibility', new.visibility
  );

  select t.title, t.body
    into v_title, v_body
  from public.get_notification_text(new.account_id, 'document_uploaded', v_vars) t;

  perform public.create_notifications_system(
    new.account_id,
    v_safe_recipients,
    'document_uploaded',
    v_title,
    v_body,
    'document',
    new.id,
    '/documents?doc=' || new.id::text,
    v_vars
  );

  return new;
end;
$$;

alter function public.fn_documents_notify_uploaded() owner to postgres;

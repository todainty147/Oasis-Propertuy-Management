-- =========================================================
-- Prevent closing maintenance request when linked work order
-- is not completed.
-- =========================================================

create or replace function prevent_closing_if_work_order_open()
returns trigger
language plpgsql
as $$
begin
  -- App uses 'closed'; keep 'zamkniete' as compatibility fallback.
  if lower(new.status) in ('closed', 'zamkniete') then
    if exists (
      select 1
      from work_orders
      where maintenance_request_id = new.id
        and status != 'completed'
    ) then
      raise exception 'Cannot close request while work order is not completed';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_close_if_wo_open on maintenance_requests;

create trigger trg_prevent_close_if_wo_open
before update of status
on maintenance_requests
for each row
execute function prevent_closing_if_work_order_open();


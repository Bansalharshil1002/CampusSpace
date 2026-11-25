create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if lower(split_part(coalesce(new.email,''), '@', 2)) <> 'thapar.edu' then
    raise exception 'Only @thapar.edu email addresses can sign in';
  end if;
  insert into public.profiles(id, email, name)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));
  if coalesce(new.raw_user_meta_data->>'automated_test','') <> 'true'
     and not exists (select 1 from public.user_roles where role='admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin');
  end if;
  insert into public.user_roles(user_id, role) values (new.id, 'student') on conflict do nothing;
  return new;
end $$;
-- ============================================================
-- 权限修复脚本（在 SQL Editor 里整段粘贴 → Run，跑一次即可）
--
-- 作用：
--   1. 恢复"只有相册主人能上传/交换/换音乐"的权限
--      （撤销之前公共照片墙版本的"任何人可传"特权）
--   2. 清理掉不再使用的 public 公共相册及其照片
--      （公共网址从此只是入口：谁上传就自动生成谁的专属相册和链接）
-- ============================================================

-- 新增照片：仅相册主人可传
create or replace function add_photo(p_album text, p_owner text, p_url text, p_path text, p_nickname text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_slot int;
  v_old_id bigint;
  v_old_path text;
  v_id bigint;
begin
  if not exists (select 1 from albums a where a.id = p_album and a.owner_id = p_owner) then
    raise exception '不是相册主人，无法上传';
  end if;

  select min(s) into v_slot from (
    select generate_series(0, 11) as s
    except
    select slot from photos where album_id = p_album
  ) t;

  if v_slot is null then
    select id, path, slot into v_old_id, v_old_path, v_slot
      from photos where album_id = p_album
      order by created_at asc, id asc limit 1;
    delete from photos where id = v_old_id;
  end if;

  insert into photos (album_id, slot, url, path, nickname, uploader_id)
  values (p_album, v_slot, p_url, p_path, p_nickname, p_owner)
  returning id into v_id;

  return json_build_object('id', v_id, 'slot', v_slot, 'replaced_path', v_old_path);
end;
$$;

-- 交换位置：仅相册主人
create or replace function swap_photos(p_a bigint, p_b bigint, p_owner text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_alb text;
  v_sa int;
  v_sb int;
begin
  select album_id into v_alb from photos where id in (p_a, p_b)
    group by album_id having count(*) = 2;
  if v_alb is null then
    raise exception '交换的两张照片不在同一相册';
  end if;
  if not exists (select 1 from albums where id = v_alb and owner_id = p_owner) then
    raise exception '不是相册主人，无法交换';
  end if;
  select slot into v_sa from photos where id = p_a;
  select slot into v_sb from photos where id = p_b;
  update photos set slot = v_sb where id = p_a;
  update photos set slot = v_sa where id = p_b;
end;
$$;

-- 更换音乐：仅相册主人
create or replace function set_album_music(p_album text, p_owner text, p_url text)
returns void
language sql security definer set search_path = public as $$
  update albums set music_url = p_url where id = p_album and owner_id = p_owner;
$$;

grant execute on function add_photo(text, text, text, text, text) to anon, authenticated;
grant execute on function swap_photos(bigint, bigint, text) to anon, authenticated;
grant execute on function set_album_music(text, text, text) to anon, authenticated;

-- 清理不再使用的 public 公共相册（连同里面的照片记录）
delete from photos where album_id = 'public';
delete from albums where id = 'public';

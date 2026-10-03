-- ============================================================
-- 八音盒旋转木马相册 · Supabase 初始化脚本
--
-- 使用方法：
--   1. 打开 https://supabase.com 注册并创建一个新项目（免费）
--   2. 左侧菜单 → SQL Editor → New query
--   3. 把本文件全部内容粘贴进去 → Run
--   4. 左侧 Project Settings → API，找到：
--        Project URL      → 填到 index.html 的 SUPABASE_URL
--        anon public key  → 填到 index.html 的 SUPABASE_ANON_KEY
--   5. 刷新网页，状态角标变成「已连接云」即成功
-- ============================================================

-- ---------- 1. 数据表 ----------
create table if not exists albums (
  id         text primary key,                 -- 相册 ID（出现在分享网址 ?g=xxx 里）
  owner_id   text not null,                    -- 主人身份（浏览器生成的随机 UUID，非登录系统）
  music_url  text,                             -- 相册背景音乐（Storage 公链）
  created_at timestamptz not null default now()
);

create table if not exists photos (
  id          bigint generated always as identity primary key,
  album_id    text not null references albums(id) on delete cascade,
  slot        int  not null,                    -- 挂钩位置 0~11
  url         text not null,                    -- 图片公链
  path        text not null,                    -- Storage 内部路径（删除文件用）
  nickname    text not null default '访客',      -- 拍立得上的手写昵称
  uploader_id text not null,                    -- 上传者身份
  created_at  timestamptz not null default now()
);

-- ---------- 2. 行级安全（RLS）：所有人可读 ----------
alter table albums enable row level security;
alter table photos enable row level security;

drop policy if exists "public read albums" on albums;
create policy "public read albums" on albums for select using (true);

drop policy if exists "public read photos" on photos;
create policy "public read photos" on photos for select using (true);

-- 写操作全部走下面的 security definer 函数（函数内部校验主人身份），不给 anon 直接写表的权限

-- ---------- 3. Storage：公开媒体桶 ----------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "public read media" on storage.objects;
create policy "public read media" on storage.objects for select using (bucket_id = 'media');

drop policy if exists "public upload media" on storage.objects;
create policy "public upload media" on storage.objects for insert with check (bucket_id = 'media');

drop policy if exists "public update media" on storage.objects;
create policy "public update media" on storage.objects for update using (bucket_id = 'media');

drop policy if exists "public delete media" on storage.objects;
create policy "public delete media" on storage.objects for delete using (bucket_id = 'media');

-- 注意：以上 Storage 策略是"演示级"的（任何知道 URL 的人都能删文件）。
-- 想更安全可以后续接 Supabase Auth，把写策略收紧到登录用户。

-- ---------- 4. 数据库函数（写操作统一入口，校验主人身份） ----------

-- 公共照片墙的固定相册（所有人可上传）
insert into albums (id, owner_id) values ('public', 'public')
on conflict (id) do nothing;

-- 创建专属相册
create or replace function create_album(p_id text, p_owner text)
returns void
language sql security definer set search_path = public as $$
  insert into albums (id, owner_id) values (p_id, p_owner);
$$;

-- 新增照片：公共墙任何人都可上传；专属相册仅主人
-- 自动分配挂钩位（优先空位；全满则替换最早的一张）
-- 返回 json：{ id, slot, replaced_path }
create or replace function add_photo(p_album text, p_owner text, p_url text, p_path text, p_nickname text)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_slot int;
  v_old_id bigint;
  v_old_path text;
  v_id bigint;
begin
  if not (p_album = 'public' or exists (
    select 1 from albums a where a.id = p_album and a.owner_id = p_owner
  )) then
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

-- 删除照片（只能删除自己上传的）
-- 返回被删照片的 Storage 路径，客户端据此删除文件
create or replace function delete_photo(p_id bigint, p_owner text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_path text;
begin
  select path into v_path from photos where id = p_id and uploader_id = p_owner;
  if v_path is null then
    raise exception '只能删除自己上传的照片';
  end if;
  delete from photos where id = p_id;
  return v_path;
end;
$$;

-- 交换位置：公共墙任何人都可交换；专属相册仅主人
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
  if not exists (select 1 from albums where id = v_alb and (owner_id = p_owner or id = 'public')) then
    raise exception '不是相册主人，无法交换';
  end if;
  select slot into v_sa from photos where id = p_a;
  select slot into v_sb from photos where id = p_b;
  update photos set slot = v_sb where id = p_a;
  update photos set slot = v_sa where id = p_b;
end;
$$;

-- 设置相册背景音乐：公共墙任何人都可换（后改的生效）；专属相册仅主人
create or replace function set_album_music(p_album text, p_owner text, p_url text)
returns void
language sql security definer set search_path = public as $$
  update albums set music_url = p_url where id = p_album and (owner_id = p_owner or id = 'public');
$$;

grant execute on function create_album(text, text) to anon, authenticated;
grant execute on function add_photo(text, text, text, text, text) to anon, authenticated;
grant execute on function delete_photo(bigint, text) to anon, authenticated;
grant execute on function swap_photos(bigint, bigint, text) to anon, authenticated;
grant execute on function set_album_music(text, text, text) to anon, authenticated;

-- ---------- 5. 打开 Realtime（新照片实时推送给所有打开相册的人） ----------
alter publication supabase_realtime add table photos;
alter publication supabase_realtime add table albums;

-- 如果上面两句报错 "already member of publication"，说明已开启过，忽略即可。

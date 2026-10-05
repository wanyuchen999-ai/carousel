-- ============================================================
-- 扭蛋机纸条升级脚本
-- 给已经跑过 upgrade-public.sql 的项目用：SQL Editor 整段粘贴 → Run
-- 跑完之后：专属相册里多一台扭蛋机——
--   主人可以往里放纸条（拍照或打字），打开链接的人随机扭出一张
-- ============================================================

-- ---------- 纸条表 ----------
create table if not exists notes (
  id          bigint generated always as identity primary key,
  album_id    text not null references albums(id) on delete cascade,
  kind        text not null,                 -- 'text'（打字）| 'image'（拍照/选图）
  content     text,                          -- kind=text 时的文字内容
  url         text,                          -- kind=image 时的图片公链
  path        text,                          -- 存储路径（删除文件用）
  uploader_id text not null,
  created_at  timestamptz not null default now()
);

alter table notes enable row level security;

drop policy if exists "public read notes" on notes;
create policy "public read notes" on notes for select using (true);

-- ---------- 新增纸条：仅相册主人 ----------
create or replace function add_note(p_album text, p_owner text, p_kind text, p_content text, p_url text, p_path text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
begin
  if not exists (select 1 from albums a where a.id = p_album and a.owner_id = p_owner) then
    raise exception '不是相册主人，无法添加纸条';
  end if;
  if p_kind not in ('text', 'image') then
    raise exception '纸条类型不合法';
  end if;
  if p_kind = 'text' and (p_content is null or length(p_content) = 0) then
    raise exception '文字纸条不能为空';
  end if;
  if p_kind = 'image' and (p_url is null or p_url = '') then
    raise exception '图片纸条缺少图片';
  end if;

  insert into notes (album_id, kind, content, url, path, uploader_id)
  values (p_album, p_kind, p_content, p_url, p_path, p_owner)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------- 删除纸条：仅上传者本人 ----------
create or replace function delete_note(p_id bigint, p_owner text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_path text;
begin
  select path into v_path from notes where id = p_id and uploader_id = p_owner;
  if not found then
    raise exception '只能删除自己添加的纸条';
  end if;
  delete from notes where id = p_id;
  return v_path;   -- 图片纸条返回存储路径；文字纸条为 null
end;
$$;

grant execute on function add_note(text, text, text, text, text, text) to anon, authenticated;
grant execute on function delete_note(bigint, text) to anon, authenticated;

-- ---------- 打开 Realtime（纸条实时同步） ----------
alter publication supabase_realtime add table notes;
-- 如果报 "already member of publication" 说明已开启过，忽略即可。

-- 観客画面で審判のコートチェンジ（左右入れ替え）を同期するため
alter table score_matches add column if not exists court_display_flipped boolean not null default false;

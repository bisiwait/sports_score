/** マーケティング用説明（インストール／設定のスライド）。日本語固定。 */
export type AppDescriptionSlide = {
  id: string;
  heading: string;
  body: string;
};

export const APP_TAGLINE =
  "「今、何点？」をゼロにする。世界中のコートで使える究極のスコア管理アプリ。";

export const APP_DESCRIPTION_SLIDES: AppDescriptionSlide[] = [
  {
    id: "tagline",
    heading: "Sports Score",
    body: APP_TAGLINE,
  },
  {
    id: "scene-self",
    heading: "【利用シーン】白熱するセルフジャッジ試合に",
    body: "審判がいない練習試合でも、ポケットから取り出すだけで正確なスコアをキープ。集中力を切らすことなく、次の一打に打ち込めます。",
  },
  {
    id: "scene-rules",
    heading: "【利用シーン】ルールの混乱を解消",
    body: "「ラリーポイント」と「サイドアウト」。競技によって異なるルールも、設定ひとつで即座に切り替え。どんな試合形式にも柔軟に対応します。",
  },
  {
    id: "tap",
    heading: "【主な機能と特徴】タップするだけの直感操作",
    body: "画面の左右をタップするだけでカウントアップ。試合の熱狂を邪魔しない、削ぎ落とされたシンプルなUIデザイン。",
  },
  {
    id: "rules",
    heading: "【主な機能と特徴】2つの公式ルールを網羅",
    body: "ラリーポイント： 全てのポイントで得点が動く、スピード感のある試合に。\n\nサイドアウト： サーブ権がある時のみ得点が入る、競技者向けの本格的な仕様。",
  },
  {
    id: "serve-guide",
    heading: "【主な機能と特徴】サーバーガイド機能",
    body: "「次は誰が、どちらのサイドから打つべきか」を視覚的にナビゲート。サーブ権の移動も自動で計算します。",
  },
  {
    id: "sync",
    heading: "★ リアルタイム・ライブ同期",
    body: "スコアは常にクラウドで同期され、離れた場所にいる仲間のスマホからも、今この瞬間のスコアをリアルタイムでチェックできます。",
  },
];

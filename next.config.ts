import type { NextConfig } from "next";

/**
 * Dev のみ: ngrok / Cloudflare Tunnel 経由では Origin がクロスサイト扱いになり、
 * Next が /_next 配下へのリクエストを 403 にすることがある。その結果フロントの JS が
 * 読めずクリックイベントが動かなくなるので、トンネル用ホストを許可する。
 *
 * https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
 */
const nextConfig: NextConfig = {
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.io", "*.ngrok.app"],
};

export default nextConfig;

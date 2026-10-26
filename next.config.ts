import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Keep verification builds separate from the running development server.
  distDir: process.env.GXWEBMAIL_BUILD_DIR ?? ".next",
  allowedDevOrigins: ["127.0.0.1", "192.168.0.105", "webmail-test.gxsoft.co.kr"],
  // Google 인증 코드/state가 dev access log에 기록되지 않게 합니다.
  logging: { incomingRequests: { ignore: [/^\/api\/mail\/linked-accounts\/oauth\/callback(?:\?|$)/] } },
};

export default withNextIntl(nextConfig);

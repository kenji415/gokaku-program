import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 社内LANの他PC / ローカルブラウザから dev サーバーにアクセスする場合に必要
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "192.168.0.20",
    "192.168.100.2",
    "192.168.0.41",
  ],
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 社内LANの他PCから dev サーバーにアクセスする場合に必要
  allowedDevOrigins: ["192.168.0.20", "192.168.100.2", "192.168.0.41"],
};

export default nextConfig;

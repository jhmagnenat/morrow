import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.MORROW_BUILD_DIR ?? '.next',
  // @napi-rs/canvas ships a native .node binary — bundling it (the
  // default) breaks its own relative-path lookup for the platform binary,
  // which is exactly the "Cannot find native binding" error even though
  // the package resolves fine in plain Node. Keep it as a real runtime
  // require instead of letting Turbopack/webpack process it as JS.
  serverExternalPackages: ["@napi-rs/canvas", "unpdf"],
  // The proxy buffers multipart requests before the upload route. Leave room
  // for form boundaries around the application's 128 MiB PDF limit.
  experimental: {proxyClientMaxBodySize: '130mb'},
  async headers(){return [{source:'/study-worker.js',headers:[
    {key:'Cache-Control',value:'no-cache, no-store, must-revalidate'},
    {key:'Service-Worker-Allowed',value:'/'},
    {key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self'; connect-src 'self'"},
  ]}];},
};

export default nextConfig;

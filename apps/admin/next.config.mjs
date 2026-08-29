/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Empacota servidor + dependencias alcancadas, para a imagem Docker ficar
  // pequena. Nao afeta `next dev` nem `next start` locais.
  output: 'standalone',
  // O standalone precisa saber onde fica a raiz do monorepo para tracear os
  // arquivos das workspaces.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
};

export default nextConfig;

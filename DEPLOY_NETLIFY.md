# Deploy na Netlify

Este projeto foi convertido para SPA estático, compatível com Netlify.

Configurações:

- Build command: `npm run build`
- Publish directory: `dist`

O projeto já inclui:

- `index.html`
- `public/_redirects`
- `netlify.toml`
- `vite.config.ts` sem SSR/TanStack Start

Variáveis necessárias na Netlify:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID` (opcional, se usado no app)

Se o login não funcionar no domínio novo, adicione o domínio da Netlify nas URLs permitidas do Supabase/Auth.

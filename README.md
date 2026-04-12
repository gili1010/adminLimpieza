# Admin de Limpieza (Next.js + Supabase)

Administrador personal para:

- iniciar sesión,
- gestionar productos (costo, precio, stock, activo/inactivo),
- cargar ventas del día,
- ver ingresos/costos/ganancias por día, semana y mes.

## 1) Configurar Supabase

1. Creá un proyecto en Supabase.
2. En `SQL Editor`, ejecutá el archivo `supabase/schema.sql`.
3. En `Authentication > Providers`, dejá habilitado `Email`.
4. En `Authentication > Users`, creá tu usuario (o registrate desde la app).

## 2) Variables de entorno

Copiá `.env.example` a `.env.local` y completá:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Esas claves están en `Project Settings > API` de Supabase.

## 3) Ejecutar local

```bash
npm install
npm run dev
```

Abrí `http://localhost:3000`.

## 4) Deploy en Vercel

1. Subí este proyecto a GitHub.
2. En Vercel: `New Project` → importá el repo.
3. En `Environment Variables`, agregá:
	- `NEXT_PUBLIC_SUPABASE_URL`
	- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy.

Listo: cada push a `main` te publica cambios automáticamente.

## Stack elegido

- Next.js (App Router)
- Supabase (Auth + Postgres)
- Recharts (gráficos)
- Tailwind CSS

Este stack es el más rápido para un admin personal en Vercel, con bajo mantenimiento y escalable si luego querés agregar más reportes.

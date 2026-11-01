// Dev entry: the API always listens on API_PORT (default 3000) so a PORT
// exported for the Vite dev server can never make the two collide.
process.env.PORT = process.env.API_PORT ?? '3000';
process.env.NODE_ENV ??= 'development';
await import('./index');
export {};

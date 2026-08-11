// Vitest resuelve "server-only" via la condición "browser" del paquete
// (que lanza a propósito) incluso en tests que no corren en un navegador
// real. Se alias-ea aquí a un no-op — el guard solo tiene sentido para el
// bundler de producción de Next.js, no para la suite de tests.
export {};

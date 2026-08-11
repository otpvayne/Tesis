# RLS — `profiles`

| Operación | Regla | Rationale |
|---|---|---|
| SELECT | `id = auth.uid()` OR `is_admin()` | Cada usuario ve su propio perfil; ADMIN ve todos. |
| INSERT | *(sin policy → denegado por defecto)* | La fila solo la crea el trigger `on_auth_user_created` (`security definer`, corre al registrarse en `auth.users`), nunca un INSERT directo del cliente. |
| UPDATE | `id = auth.uid()` | Cada usuario solo edita su propio perfil. |
| DELETE | *(sin policy → denegado por defecto)* | No hay caso de uso para que un usuario borre su perfil vía API en esta fase. |

## Inmutabilidad del rol

El trigger `profiles_prevent_role_change` (BEFORE UPDATE) descarta cualquier cambio a
`role` que no provenga de una sesión `service_role`. Esto es lo que garantiza —a nivel
de base de datos, no solo de UI— que "nadie se autoasigna ADMIN" (corrección de Fase 1).
Incluso si alguien manipula la petición HTTP directamente, el `role` de la fila
permanece igual al valor anterior.

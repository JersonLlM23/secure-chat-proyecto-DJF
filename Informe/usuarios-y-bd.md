# Usuarios y estructura de base de datos

## Usuarios registrados

| Usuario    | Nombre                     | Rol               | Estado |
| ---------- | -------------------------- | ----------------- | ------ |
| `jperez`   | Juan Carlos Pérez López    | `ADMIN`           | Activo |
| `amendoza` | Ana Lucía Mendoza Silva    | `ANALYST`         | Activo |
| `cvega`    | Carlos Andrés Vega Torres  | `ANALYST`, `USER` | Activo |
| `lcastro`  | Luis Alberto Castro Molina | `USER`            | Activo |
| `mgomez`   | María Fernanda Gómez Ruiz  | `USER`            | Activo |

(la contraseña de todos es ClaveSegura2026!)

---

## Tabla `user_roles`

```text
Table "public.user_roles"

Column       | Type                         | Nullable | Default
-------------|------------------------------|----------|-------------------
user_id      | uuid                         | not null |
role_id      | uuid                         | not null |
assigned_at  | timestamp without time zone | not null | now()
status       | boolean                      | not null | true
version      | integer                      | not null | 1
updated_at   | timestamp without time zone | not null | now()
id           | uuid                         | not null | gen_random_uuid()
created_at   | timestamp without time zone | not null | now()
```

### Índices

| Nombre                    | Tipo        | Columnas             |
| ------------------------- | ----------- | -------------------- |
| `PK_user_roles`           | PRIMARY KEY | `id`                 |
| `IDX_user_roles_role`     | INDEX       | `role_id`            |
| `IDX_user_roles_user`     | INDEX       | `user_id`            |
| `UQ_user_roles_user_role` | UNIQUE      | `user_id`, `role_id` |

### Claves foráneas

| Nombre                           | Columna   | Referencia  | Eliminación |
| -------------------------------- | --------- | ----------- | ----------- |
| `FK_87b8888186ca9769c960e926870` | `user_id` | `users(id)` | `CASCADE`   |
| `FK_b23c65e50a758245a33ee35fda1` | `role_id` | `roles(id)` | `CASCADE`   |

---

## Tabla `roles`

```text
Table "public.roles"

Column      | Type                         | Nullable | Default
------------|------------------------------|----------|-------------------
id          | uuid                         | not null | uuid_generate_v4()
rol         | character varying(50)       | not null |
status      | boolean                      | not null | true
version     | integer                      | not null | 1
created_at  | timestamp without time zone | not null | now()
updated_at  | timestamp without time zone | not null | now()
deleted_at  | timestamp without time zone |          |
```

### Índices

| Nombre                           | Tipo        | Columnas |
| -------------------------------- | ----------- | -------- |
| `PK_c1433d71a4838793a49dcad46ab` | PRIMARY KEY | `id`     |
| `UQ_roles_rol`                   | UNIQUE      | `rol`    |

### Valores de rol

| Rol       | Descripción   |
| --------- | ------------- |
| `ADMIN`   | Administrador |
| `ANALYST` | Analista      |
| `USER`    | Usuario       |

### Relaciones

La tabla `roles` es referenciada por `user_roles` mediante:

```text
user_roles.role_id → roles.id
```

Con eliminación en cascada:

```text
ON DELETE CASCADE
```

---

## Tabla `users`

```text
Table "public.users"

Column           | Type                         | Nullable | Default
-----------------|------------------------------|----------|-------------------
id               | uuid                         | not null | uuid_generate_v4()
cedula           | character varying(10)       | not null |
nombres          | character varying(100)      | not null |
apellidos        | character varying(100)      | not null |
fecha_nacimiento | date                         | not null |
username         | character varying(50)       | not null |
email            | character varying(150)      | not null |
telefono         | character varying(10)       | not null |
password         | character varying(255)      | not null |
status           | boolean                      | not null | true
token_version    | integer                      | not null | 0
version          | integer                      | not null | 1
created_at       | timestamp without time zone | not null | now()
updated_at       | timestamp without time zone | not null | now()
deleted_at       | timestamp without time zone |          |
```

### Índices

| Nombre                           | Tipo        | Columnas   |
| -------------------------------- | ----------- | ---------- |
| `PK_a3ffb1c0c8416b9fc6f907b7433` | PRIMARY KEY | `id`       |
| `UQ_users_cedula`                | UNIQUE      | `cedula`   |
| `UQ_users_email`                 | UNIQUE      | `email`    |
| `UQ_users_telefono`              | UNIQUE      | `telefono` |
| `UQ_users_username`              | UNIQUE      | `username` |

### Restricciones CHECK

#### Cédula

La cédula debe contener exactamente 10 dígitos:

```sql
CHECK (cedula::text ~ '^[0-9]{10}$')
```

#### Teléfono

El teléfono debe contener exactamente 10 dígitos:

```sql
CHECK (telefono::text ~ '^[0-9]{10}$')
```

### Relaciones

La tabla `users` es referenciada por `user_roles` mediante:

```text
user_roles.user_id → users.id
```

Con eliminación en cascada:

```text
ON DELETE CASCADE
```

---

## Relación entre tablas

La estructura implementa una relación **muchos a muchos (N:M)** entre usuarios y roles:

```text
┌─────────────┐       ┌────────────────┐       ┌─────────────┐
│    users    │       │   user_roles   │       │    roles    │
├─────────────┤       ├────────────────┤       ├─────────────┤
│ id          │◄──────│ user_id        │       │ id          │
│ username    │       │ role_id        │──────►│ rol         │
│ email       │       │ assigned_at    │       │ status      │
│ status      │       │ status         │       │ version     │
│ token_ver.  │       │ version        │       │ created_at  │
└─────────────┘       └────────────────┘       └─────────────┘
```

Un usuario puede tener uno o varios roles, y un mismo rol puede estar asignado a varios usuarios.

### Asignaciones actuales

```text
jperez   → ADMIN
amendoza → ANALYST
cvega    → ANALYST, USER
lcastro  → USER
mgomez   → USER
```

La restricción única:

```text
UQ_user_roles_user_role
```

impide que un mismo usuario tenga asignado dos veces el mismo rol.

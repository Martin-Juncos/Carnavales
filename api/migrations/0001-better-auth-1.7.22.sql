create table "usuario" ("id" text not null primary key, "nombre" text not null, "correo" text not null unique, "correo_verificado" boolean not null, "imagen_perfil" text, "creado_en" timestamptz default CURRENT_TIMESTAMP not null, "actualizado_en" timestamptz default CURRENT_TIMESTAMP not null, "doble_factor_habilitado" boolean);

create table "sesion" ("id" text not null primary key, "vence_en" timestamptz not null, "token" text not null unique, "creado_en" timestamptz default CURRENT_TIMESTAMP not null, "actualizado_en" timestamptz not null, "direccion_ip" text, "agente_usuario" text, "usuario_id" text not null references "usuario" ("id") on delete cascade);

create table "cuenta" ("id" text not null primary key, "id_cuenta" text not null, "id_proveedor" text not null, "usuario_id" text not null references "usuario" ("id") on delete cascade, "token_acceso" text, "token_actualizacion" text, "id_token" text, "token_acceso_vence_en" timestamptz, "token_actualizacion_vence_en" timestamptz, "alcance" text, "hash_contrasena" text, "creado_en" timestamptz default CURRENT_TIMESTAMP not null, "actualizado_en" timestamptz not null);

create table "verificacion" ("id" text not null primary key, "identificador" text not null, "valor" text not null, "vence_en" timestamptz not null, "creado_en" timestamptz default CURRENT_TIMESTAMP not null, "actualizado_en" timestamptz default CURRENT_TIMESTAMP not null);

create table "doble_factor" ("id" text not null primary key, "secreto" text not null, "codigos_respaldo" text not null, "usuario_id" text not null references "usuario" ("id") on delete cascade, "verificado" boolean, "intentos_fallidos" integer, "bloqueado_hasta" timestamptz);

create index "sesion_usuario_id_idx" on "sesion" ("usuario_id");

create index "cuenta_usuario_id_idx" on "cuenta" ("usuario_id");

create index "verificacion_identificador_idx" on "verificacion" ("identificador");

create index "doble_factor_secreto_idx" on "doble_factor" ("secreto");

create index "doble_factor_usuario_id_idx" on "doble_factor" ("usuario_id");